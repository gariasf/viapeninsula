import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { AttributionControl, MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { along, LIVE_URL, madridDate, type Bundle, type Manifest, type Network, type Snapshot } from '../bundle.ts';
import { trainsAt, type Received } from '../engine.ts';
import { language, LANGUAGES, setLanguage, t, type Language } from './i18n.ts';

// MapLibre looks for its worker next to its own file, which bundling moves.
setWorkerUrl(workerUrl);

const FONT = ['Noto Sans Regular'];
const NAME_SIZE = 12;

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
let credits: AttributionControl | undefined;
/** The Networks on the map, whose data the credits name. */
let credited: Network[] = [];
showLanguage();

// Live data: the fetcher's snapshot, about every 20 s while the tab is visible (ADR-0003). The
// engine corrects the device's clock from the last half hour of them.
let received: Received[] = [];
let nextPoll: ReturnType<typeof setTimeout> | undefined;
document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(nextPoll) : poll()));
if (!document.hidden) poll();

const [bundle] = await Promise.all([loadBundle(), map.once('load')]);
credited = bundle.networks;
showCredits();
const lines = new Map(bundle.lines.map((l) => [l.id, l]));
const shapes = new Map(bundle.shapes.map((s) => [s.id, s]));

map.addSource('lines', {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features: bundle.strokes.flatMap(({ line: id, shape: shapeId, from, to, side }): GeoJSON.Feature[] => {
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
  },
});
map.addSource('stations', {
  type: 'geojson',
  data: {
    type: 'FeatureCollection',
    features: bundle.stations.map((s) => ({
      type: 'Feature',
      properties: { name: s.name },
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
    })),
  },
});

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

// Moves the Trains every frame. The browser stops asking while the tab is hidden.
const trainSource = map.getSource<GeoJSONSource>('trains');
requestAnimationFrame(function move() {
  trainSource?.setData(trains());
  requestAnimationFrame(move);
});

/** Every Train on the map now, in its Line's colour, Live or Scheduled. */
function trains(): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: trainsAt(bundle, Date.now(), received).map((train) => ({
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
  showCredits();
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

async function loadBundle(): Promise<Bundle> {
  const manifest = await getJson<Manifest>(`${LIVE_URL}/manifest.json`);
  const today = madridDate(new Date());
  const day = manifest.days.find((d) => d.date === today) ?? manifest.days.at(-1);
  if (!day) throw new Error('The manifest names no service day');
  return getJson<Bundle>(`${LIVE_URL}/${day.bundle}`);
}

/** Fetches the live snapshot, and again 20 s later if the tab is still visible. */
async function poll() {
  try {
    const snapshot = await getJson<Snapshot>(`${LIVE_URL}/snapshot.json`);
    const at = Date.now();
    received = [...received.filter((r) => r.at > at - 30 * 60_000), { snapshot, at }];
  } catch (error) {
    // The Trains keep to the last snapshot until the next one comes.
    console.warn(error);
  }
  clearTimeout(nextPoll);
  if (!document.hidden) nextPoll = setTimeout(poll, 20_000);
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}
