import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { AttributionControl, MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { along, LIVE_URL, madridDate, places, type Bundle, type DayTrips, type Line, type Manifest, type Network, type Snapshot, type Track } from '../bundle.ts';
import { joinDays, KEEP, trainsAt, unavailable, type Received } from '../engine.ts';
import { language, LANGUAGES, setLanguage, t, type Language } from './i18n.ts';

// MapLibre looks for its worker next to its own file, which bundling moves.
setWorkerUrl(workerUrl);

const FONT = ['Noto Sans Regular'];
const NAME_SIZE = 12;
/** How many times the map looks for live data, never getting any, before it says live data is unavailable. */
const EMPTY_POLLS = 3;
/**
 * How long before a service day's first Train the map fetches its bundle, and how long after its
 * last is due off the map it keeps it, for Trains running late, in ms.
 */
const [EARLY, LATE] = [30 * 60_000, 60 * 60_000];

/** A Line's width, in pixels at each zoom. */
const WIDTH: [zoom: number, px: number][] = [[7, 1.5], [14, 4]];
/**
 * How far apart Lines that share track are drawn, in pixels at each zoom: a line width apart zoomed
 * out, as on a transit map, and back on the rails zoomed right in, where people follow a Train.
 */
const APART: [zoom: number, px: number][] = [...WIDTH, [15, 0]];

/** An expression that takes `value` at each of these zooms, and goes smoothly from one to the next. */
const byZoom = (stops: [zoom: number, px: number][], value: (px: number, zoom: number) => number | ExpressionSpecification): ExpressionSpecification => [
  'interpolate',
  ['linear'],
  ['zoom'],
  ...stops.flatMap(([zoom, px]) => [zoom, value(px, zoom)]),
];

/** An expression that takes one value for a Live Train and another for a Scheduled one. */
const byLive = (live: string | number | ExpressionSpecification, scheduled: string | number | ExpressionSpecification): ExpressionSpecification => [
  'case',
  ['get', 'live'],
  live,
  scheduled,
];

/**
 * Whether the basemap names a feature in the viewer's language, where the tiles have it: countries,
 * regions, seas, rivers and airports, which are the features with an IATA code. Everything else it
 * labels, from towns and their districts to streets, goes by its own name, as its signs and Stations
 * have it: the tiles' Spanish names for Catalan towns are mostly old Castilian ones, such as Lérida
 * and Sardañola del Vallés.
 */
const TRANSLATED: ExpressionSpecification = ['any', ['in', ['get', 'class'], ['literal', ['country', 'state', 'ocean', 'sea', 'river']]], ['has', 'iata']];

/**
 * Each Network's credit, as the terms for its data ask: Renfe's and FGC's are CC BY 4.0, TRAM's asks
 * for its own words and a link, and TMB's for the day its data was last updated.
 */
const CREDITS: Record<string, (network: Network) => string> = {
  rodalies: () => 'Rodalies: <a href="https://data.renfe.com/" target="_blank">Renfe</a>, CC BY 4.0',
  fgc: () => '<a href="https://dadesobertes.fgc.cat/" target="_blank">FGC</a>, CC BY 4.0',
  tram: () => '<a href="https://www.tram.cat/" target="_blank">Powered by TRAM Barcelona</a>',
  metro: ({ updated }) =>
    `Metro: <a href="https://www.tmb.cat/" target="_blank">TMB</a>` +
    (updated ? `, ${t('updated')} ${new Intl.DateTimeFormat(language(), { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.parse(updated))}` : ''),
};

const map = new MapLibreMap({
  container: 'map',
  center: [2.17, 41.39], // Barcelona, with the rest of Catalonia a zoom away
  zoom: 11,
  attributionControl: false,
});
map.setStyle('https://tiles.openfreemap.org/styles/positron', {
  transformStyle: (_, style) => {
    // OpenFreeMap's credit ends "Data from OpenStreetMap", in English, and the ODbL asks for the
    // contributors, so showLanguage() credits the basemap itself, in the viewer's language.
    if (style.sources.openmaptiles) Object.assign(style.sources.openmaptiles, { attribution: '' });
    // Its labels give each feature's English name, where the tiles have one. They give its own
    // instead, or where it's TRANSLATED, its name in the language showLanguage() sets.
    style.state = { language: { default: language() } };
    for (const layer of style.layers) {
      if (layer.type !== 'symbol' || !layer.layout) continue;
      const text = JSON.stringify(layer.layout['text-field']);
      if (!text?.includes('"name_en"')) continue;
      const own = JSON.parse(text.replaceAll('"name_en"', '"name"'));
      layer.layout['text-field'] = ['case', TRANSLATED, ['coalesce', ['get', ['concat', 'name:', ['global-state', 'language']]], own], own];
    }
    return style;
  },
});
const styleLoaded = map.once('style.load');

// The language switch, with each language named in itself.
const languageSwitch = document.createElement('select');
languageSwitch.className = 'maplibregl-ctrl maplibregl-ctrl-group language';
for (const [code, name] of Object.entries(LANGUAGES)) {
  const option = new Option(name, code, false, code === language());
  option.lang = code;
  languageSwitch.add(option);
}
languageSwitch.addEventListener('change', () => {
  setLanguage(languageSwitch.value as Language);
  showLanguage();
});
map.addControl({ onAdd: () => languageSwitch, onRemove: () => languageSwitch.remove() }, 'top-right');
// The legend, which showLanguage() fills: what the Live and Scheduled markers mean.
const legend = document.createElement('div');
legend.className = 'maplibregl-ctrl maplibregl-ctrl-group legend';
// Top left, where the credits never cover it.
map.addControl({ onAdd: () => legend, onRemove: () => legend.remove() }, 'top-left');
// The banner under it, which showBanner() fills: each Network whose live data is unavailable.
const banner = document.createElement('div');
banner.className = 'maplibregl-ctrl maplibregl-ctrl-group banner';
banner.setAttribute('role', 'status');
map.addControl({ onAdd: () => banner, onRemove: () => banner.remove() }, 'top-left');
let credits: AttributionControl | undefined;
/** The Networks on the map, whose data the credits name, and whose names the banner shows. */
let credited: Network[] = [];
/** The Networks whose live data is unavailable, by their ids. */
let unavailableIds: string[] = [];
// Live data: the fetcher's snapshot, about every 20 s while the tab is visible (ADR-0003). The
// engine replays what the map had each time it looked, over the last KEEP, which also corrects the device's clock.
let received: Received[] = [];
/** How many times the map has looked for live data before its first snapshot. A hidden tab doesn't look. */
let emptyPolls = 0;
showLanguage();

/** The manifest as the map last got it. */
let manifest: Manifest | undefined;
/** Each file of the service days' bundles the map has fetched, or is fetching: their track and Trips. */
const fetched = new Map<string, Promise<unknown>>();
/** The files of the days' bundles on the map, and whether the map is looking for the days it needs. */
let [shown, looking] = ['', false];
/** The Stations of the track on the map, which come with its Lines. */
let shownStations: Track['stations'] | undefined;

let nextPoll: ReturnType<typeof setTimeout> | undefined;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return clearTimeout(nextPoll);
  poll();
  refreshDays();
});
if (!document.hidden) poll();

const [needed] = await Promise.all([neededDays().then((n) => n ?? Promise.reject(new Error('No service day to show'))), map.once('load')]);
/** The days on the map, whose Trains move, once their Trips have come. */
let bundle: Bundle | undefined;
let lines = new Map<string, Line>();
map.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
map.addSource('stations', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
// Today's Lines and Stations are drawn as soon as its track comes, before the Trips, which are most of the bundle.
needed.days.then(show, (error: unknown) => console.error(error));
show(await needed.track);
// Around midnight the days the map needs change, and each day's build names three more.
setInterval(refreshDays, 60_000);

// Track goes under the basemap's labels; Stations and names go on top of everything.
const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
map.addLayer(
  {
    id: 'lines',
    type: 'line',
    source: 'lines',
    layout: { 'line-cap': 'round', 'line-join': 'round', 'line-sort-key': ['get', 'above'] },
    paint: {
      'line-color': ['get', 'colour'],
      'line-width': byZoom(WIDTH, (px) => px),
      'line-offset': byZoom(APART, (px) => ['*', ['get', 'side'], px]),
    },
  },
  firstLabel,
);
map.addLayer({
  id: 'line-names',
  type: 'symbol',
  source: 'lines',
  layout: {
    'symbol-placement': 'line',
    'text-field': ['get', 'name'],
    'text-font': FONT,
    'text-size': NAME_SIZE,
    'text-offset': byZoom(APART, (_, zoom) => ['array', 'number', 2, ['get', `textOffset${zoom}`]]),
  },
  paint: {
    'text-color': ['get', 'colour'],
    'text-halo-color': '#fff',
    'text-halo-width': 2,
    // MapLibre offsets names by whole zoom levels, so while the Lines slide onto the rails, names hide.
    'text-opacity': ['interpolate', ['linear'], ['zoom'], 14, 1, 14.1, 0, 14.9, 0, 15, 1],
  },
});
map.addLayer({
  id: 'stations',
  type: 'circle',
  source: 'stations',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 1.5, 14, 5],
    'circle-color': '#fff',
    'circle-stroke-color': '#444',
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 14, 1.5],
  },
});
// Trains go over the Stations they stand at, under the Stations' names.
map.addSource('trains', { type: 'geojson', data: trains() });
map.addLayer({
  id: 'trains',
  type: 'circle',
  source: 'trains',
  // A Live Train is filled with its Line's colour; a Scheduled one is only ringed with it.
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 2.5, 14, 6],
    'circle-color': byLive(['get', 'colour'], '#fff'),
    'circle-stroke-color': byLive('#fff', ['get', 'colour']),
    'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 7, byLive(0.5, 1.5), 14, byLive(1.5, 3)],
  },
});
map.addLayer({
  id: 'station-names',
  type: 'symbol',
  source: 'stations',
  minzoom: 12,
  layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 11, 'text-anchor': 'top', 'text-offset': [0, 0.7] },
  paint: { 'text-color': '#333', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
});

// Moves the Trains every frame, and names the Networks whose live data is unavailable as that
// changes. The browser stops asking while the tab is hidden.
const trainSource = map.getSource<GeoJSONSource>('trains');
requestAnimationFrame(function move() {
  trainSource?.setData(trains());
  const ids = unavailable(received);
  if (ids.join() !== unavailableIds.join()) {
    unavailableIds = ids;
    showBanner();
  }
  requestAnimationFrame(move);
});

/**
 * Draws the Lines and Stations of the days on the map, and credits their Networks, where they've
 * changed, and once their Trips have come, moves their Trains.
 */
function show(days: Track | Bundle) {
  if ('trips' in days) bundle = days;
  // A day's Trips come after its track, which is drawn already, unless the days joined bring more than one.
  if (days.stations === shownStations) return;
  shownStations = days.stations;
  lines = new Map(days.lines.map((l) => [l.id, l]));
  const shapes = new Map(days.shapes.map((s) => [s.id, s]));
  map.getSource<GeoJSONSource>('lines')?.setData({
    type: 'FeatureCollection',
    features: days.strokes.flatMap(({ line: id, shape: shapeId, from, to, side }): GeoJSON.Feature[] => {
      const [line, shape] = [lines.get(id), shapes.get(shapeId)];
      if (!line || !shape) return [];
      const properties = {
        name: line.name,
        colour: line.colour,
        // Zoomed right in, where Lines share track, Barcelona's commuter lines (R1–R8) are drawn over the regional ones.
        above: /^R\d[NS]?$/.test(line.name) ? 1 : 0,
        side,
        // Each Line's name goes on its own stroke: text-offset is in ems.
        ...Object.fromEntries(APART.map(([zoom, px]) => [`textOffset${zoom}`, [0, (side * px) / NAME_SIZE]])),
      };
      return [{ type: 'Feature', properties, geometry: { type: 'LineString', coordinates: along(shape, from, to) } }];
    }),
  });
  map.getSource<GeoJSONSource>('stations')?.setData({
    type: 'FeatureCollection',
    features: places(days.stations).map((p) => ({
      type: 'Feature',
      properties: { name: p.name },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  });
  credited = days.networks;
  showCredits();
}

/** Every Train on the map now, in its Line's colour, Live or Scheduled. */
function trains(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: (bundle ? trainsAt(bundle, Date.now(), received) : []).map((train) => ({
      type: 'Feature',
      properties: { colour: lines.get(train.trip.line)?.colour, live: train.live },
      geometry: { type: 'Point', coordinates: [train.lon, train.lat] },
    })),
  };
}

/** Shows the interface in the viewer's language: on start, and again each time they switch it. */
function showLanguage() {
  document.documentElement.lang = language();
  languageSwitch.title = t('language');
  // MapLibre reads its own strings as it builds each part, and has no way to change them after: the
  // parts it builds from now on read these, the canvas is relabelled, and the credits built afresh.
  Object.assign(map._locale, { 'Map.Title': t('map'), 'AttributionControl.ToggleAttribution': t('showCredits') });
  map.getCanvas().setAttribute('aria-label', t('map'));
  // The basemap can relabel itself once its style has loaded, and loads in the language set by then.
  styleLoaded.then(() => map.setGlobalStateProperty('language', language()));
  legend.replaceChildren(
    ...(['live', 'scheduled'] as const).map((kind) => {
      const row = document.createElement('div');
      const marker = Object.assign(document.createElement('span'), { className: `marker ${kind}` });
      row.append(marker, Object.assign(document.createElement('b'), { textContent: t(kind) }), `: ${t(`${kind}Means`)}`);
      return row;
    }),
  );
  showBanner();
  showCredits();
}

/**
 * Names each Network on the map whose live data is unavailable, in the viewer's language. Once the
 * map has looked EMPTY_POLLS times and never got a snapshot, it says live data is unavailable
 * instead, naming no Network. Hides the banner while there's neither.
 */
function showBanner() {
  const networks = credited.filter((n) => unavailableIds.includes(n.id));
  const neverLive = !received.length && emptyPolls >= EMPTY_POLLS;
  banner.hidden = !networks.length && !neverLive;
  if (neverLive) {
    banner.replaceChildren(t('noLive'));
    return;
  }
  banner.replaceChildren(
    ...networks.map(({ name }) => {
      const row = document.createElement('div');
      row.append(Object.assign(document.createElement('b'), { textContent: name }), `: ${t('liveUnavailable')}`);
      return row;
    }),
  );
}

/** Credits the basemap and each Network's data, in the viewer's language, building the credits afresh. */
function showCredits() {
  if (credits) map.removeControl(credits);
  credits = new AttributionControl({
    customAttribution: [
      '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
        '<a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> ' +
        `<a href="https://www.openstreetmap.org/copyright" target="_blank">${t('osmContributors')}</a>`,
      // A Network with no credit of its own here still gets its name.
      ...credited.map((network) => CREDITS[network.id]?.(network) ?? network.name),
    ],
  });
  map.addControl(credits);
}

/**
 * The service days the map needs now, joined, where they aren't the ones it shows: today's, whatever
 * the time, and each day whose Trains are on the map or come onto it within EARLY, as yesterday's
 * do after midnight, and tomorrow's first can just before. Where the manifest is out of date, its
 * last day stands for today. A day whose bundle fails to come is left out, and fetched again next time.
 * Today's track comes on its own first, so the map can draw it before the Trips come.
 */
async function neededDays(): Promise<{ track: Promise<Track>; days: Promise<Bundle> } | undefined> {
  try {
    manifest = await getJson<Manifest>(`${LIVE_URL}/manifest.json`);
  } catch (error) {
    if (!manifest) throw error;
    console.warn(error);
  }
  const now = Date.now();
  const today = manifest.days.find((d) => d.date === madridDate(new Date(now))) ?? manifest.days.at(-1);
  const days = manifest.days.filter((d) => d === today || (d.from - EARLY <= now && now <= d.to + LATE));
  if (!today || !days.length) throw new Error('The manifest names no service day');
  const keys = days.flatMap((d) => [d.track, d.trips]);
  if (keys.join() === shown) return undefined;
  for (const key of fetched.keys()) if (!keys.includes(key)) fetched.delete(key);
  const get = <T>(key: string) => {
    const file = fetched.get(key) ?? getJson<T>(`${LIVE_URL}/${key}`);
    fetched.set(key, file);
    file.catch(() => fetched.delete(key));
    return file as Promise<T>;
  };
  const joined = async () => {
    // Each day's Trips are fetched once its track has come, so the track isn't slowed by them.
    const got = await Promise.allSettled(days.map((d) => get<Track>(d.track).then((track) => Promise.all([track, get<DayTrips>(d.trips)]))));
    // Without today's bundle there's nothing to draw; without another day's, the map does without it until next time.
    const failed = got.flatMap((g, i) => (g.status === 'rejected' ? [[days[i], g.reason] as const] : []));
    for (const [day, reason] of failed) if (day === today) throw reason;
    if (failed.length) console.warn(...failed.map(([, reason]) => reason));
    const bundles = got.flatMap((g) => (g.status === 'fulfilled' ? [{ ...g.value[0], ...g.value[1] }] : []));
    shown = failed.length ? '' : keys.join();
    return joinDays(bundles);
  };
  return { track: get<Track>(today.track), days: joined() };
}

/** Shows the days the map needs now, where they've changed. The Trains keep to the days shown meanwhile. */
async function refreshDays() {
  if (looking || document.hidden) return;
  looking = true;
  try {
    const needed = await neededDays();
    if (needed) show(await needed.days);
  } catch (error) {
    console.warn(error);
  } finally {
    looking = false;
  }
}

/** Fetches the live snapshot, and again 20 s later if the tab is still visible. */
async function poll() {
  let snapshot: Snapshot | undefined;
  try {
    // One that hangs gives up well before the next is due.
    snapshot = await getJson<Snapshot>(`${LIVE_URL}/snapshot.json`, AbortSignal.timeout(10_000));
  } catch (error) {
    // The map has nothing newer than its last snapshot, which the Trains keep to until the next comes.
    console.warn(error);
    snapshot = received.at(-1)?.snapshot;
  }
  const at = Date.now();
  if (snapshot) received = [...received.filter((r) => r.at > at - KEEP), { snapshot, at }];
  else emptyPolls++;
  showBanner();
  clearTimeout(nextPoll);
  if (!document.hidden) nextPoll = setTimeout(poll, 20_000);
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}
