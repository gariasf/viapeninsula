import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import { AttributionControl, MapLibreMap, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { along, beside, daysNeeded, EARTH, LIVE_URL, madridDate, places, type Bundle, type Place, type DayTrips, type Line, type Manifest, type Network, type Point, type Shape, type Snapshot, type Stroke, type Track } from '../bundle.ts';
import { boardAt, joinDays, KEEP, nearbyAt, trainAt, trainsAt, unavailable, type Received } from '../engine.ts';
import { language, LANGUAGES, setLanguage, t, trainCount, type Language } from './i18n.ts';

// MapLibre looks for its worker next to its own file, which bundling moves.
setWorkerUrl(workerUrl);

const FONT = ['Noto Sans Regular'];
const NAME_SIZE = 12;
/** The size of a Line's name on its Trains' pills, in px, and on the followed Train's, which is larger. */
const [PILL_TEXT, FOLLOWED_TEXT] = [10, 12];
/** How far a pill reaches beyond its Line's name either side, and above and below the name's line, in px. */
const [PILL_PADDING, PILL_EDGE] = [2, 1.5];
/** MapLibre's `text-line-height`, in ems: the height of the name's line that a pill fits. */
const LINE_HEIGHT = 1.2;
/** How far outside its pill's outline the middle of a Train's arrow is, in px. */
const ARROW_GAP = 4;
/** The dark lettering for a Line's colour that white doesn't read on. */
const INK = '#111';
/**
 * The outlines a Train is drawn with, `w`×`h` px around their middles: how far `outside` each a point
 * is, in px (x right, y down), or inside where negative. A pill's outline stretches across its middle
 * 2 px both ways to fit its Line's name over its middle `across` px, and all but PILL_EDGE of its
 * height. The arrow points up.
 */
const OUTLINES: Record<Pill['outline'] | 'arrow', { w: number; h: number; across?: number; outside: (x: number, y: number) => number }> = {
  // A square with corners so round it's nearly a circle.
  round: { w: 15, h: 15, across: 9, outside: roundedSquare(7.5, 6.5) },
  // Its ends 5 px long, to a point 2 px across.
  pointed: { w: 12, h: 15, across: 2, outside: (x, y) => Math.max(Math.abs(y) - 7.5, Math.abs(x) - 6, 0.7926 * (Math.abs(x) - 6) + 0.6097 * (Math.abs(y) - 1)) },
  // A square with corners rounded 3 px, which a name of two letters leaves nearly square, like the Metro's and TRAM's Line badges.
  badge: { w: 15, h: 15, across: 13, outside: roundedSquare(7.5, 3) },
  // Its tip 4.5 px ahead of its middle, and its base 2.25 px behind and 6 px across.
  arrow: { w: 12, h: 12, outside: (x, y) => Math.max(y - 2.25, (6.75 * Math.abs(x) - 3 * (y + 4.5)) / Math.hypot(3, 6.75)) },
};
/** What measures the Lines' names for nameWidth(). */
const measuring = document.createElement('canvas').getContext('2d');
/** How many times the map looks for live data, never getting any, before it says live data is unavailable. */
const EMPTY_POLLS = 3;
/** How near the viewer, in metres, and how soon, in ms, a Train passes to be one of their nearby Trains. The panel's strings say so too. */
const [NEARBY, SOON] = [1500, 60 * 60_000];
/** How long after a service day's last Train is due off the map the map keeps its bundle, for Trains running late, in ms. */
const LATE = 60 * 60_000;
/**
 * How often Trains move, in ms. As often as the fastest of them moves a quarter of a pixel, which
 * nobody sees in between (quarterPixel()): about 12 times a second at zoom 12, and every frame zoomed
 * right in. Every frame while the map zooms or turns, which moves them beside their Lines and turns
 * their arrows, or follows a Train. Once the map has stood for MOVED, while the viewer is likely still
 * looking closely, no more often than every IDLE_EVERY, about 30 times a second, which leaves a phone
 * headroom and battery and is a little under 1/30 s, so that at 60 or 120 Hz it's every other or every
 * fourth frame. And never less often than every IDLE_MOST, so that the legend's count and the panels
 * keep up by the second.
 */
const [MOVED, IDLE_EVERY, IDLE_MOST] = [1500, 30, 250];

/** A Line's width, in pixels at each zoom. */
const WIDTH: [zoom: number, px: number][] = [[7, 1.5], [14, 4]];
/**
 * How far apart Lines that share track are drawn, in pixels at each zoom: a line width apart zoomed
 * out, as on a transit map, and back on the rails zoomed right in, where people follow a Train.
 */
const APART: [zoom: number, px: number][] = [...WIDTH, [15, 0]];

/** How many metres wide a pixel is at a zoom, at the equator: MapLibre's tiles are 512 px. */
const pixelMetres = (zoom: number) => (2 * Math.PI * EARTH) / (512 * 2 ** zoom);

/** The value at a zoom of these, going smoothly from one zoom's to the next's, as byZoom() does. */
const atZoom = (stops: [zoom: number, px: number][], zoom: number): number => {
  const i = stops.findIndex(([z]) => z > zoom);
  if (i < 0) return stops.at(-1)?.[1] ?? 0;
  const [[z0, v0] = [zoom, 0], [z1, v1] = [zoom, 0]] = [stops[Math.max(0, i - 1)], stops[i]];
  return z1 > z0 ? v0 + ((v1 - v0) * (zoom - z0)) / (z1 - z0) : v1;
};

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

/** CC BY 4.0, with the link to its text that it asks for. */
const CC_BY = '<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank">CC BY 4.0</a>';

/**
 * Each Network's credit, as the terms for its data ask: Renfe's and FGC's are CC BY 4.0, TRAM's asks
 * for its own words and a link, and TMB's for the day its data was last updated.
 */
const CREDITS: Record<string, (network: Network) => string> = {
  rodalies: () => `Rodalies: <a href="https://data.renfe.com/" target="_blank">Renfe</a>, ${CC_BY}`,
  fgc: () => `<a href="https://dadesobertes.fgc.cat/" target="_blank">FGC</a>, ${CC_BY}`,
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
  // The view goes in the page's link, as `#map=<zoom>/<lat>/<lon>`, beside what writeLink() adds.
  hash: 'map',
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
// The button that shows the viewer's nearby Trains, with MapLibre's own locate icon, labelled by
// showLanguage(). It goes under the language switch once the map can move Trains.
const nearbyButton = el('button', { type: 'button', className: 'maplibregl-ctrl-geolocate', onclick: showNearby }, el('span', { className: 'maplibregl-ctrl-icon' }));
// The button under it that follows a random Train, with a die, labelled by showLanguage(). It's
// disabled while there's no Train on the map but the one the map follows.
const followRandomButton = el('button', { type: 'button', className: 'follow-random', disabled: true, onclick: followRandom }, el('span', { className: 'maplibregl-ctrl-icon' }));
// The legend, which showLanguage() fills: what the Live and Scheduled markers mean, how many Trains
// are on the map and how many of them are Live, and the button that opens the About dialog.
const legend = document.createElement('div');
legend.className = 'maplibregl-ctrl maplibregl-ctrl-group legend';
// Top left, where the credits never cover it.
map.addControl({ onAdd: () => legend, onRemove: () => legend.remove() }, 'top-left');
/** The legend's count of the Trains on the map, which showCount() fills once their Trips have come. */
const countRow = el('div');
// The banner under it, which showBanner() fills: each Network whose live data is unavailable.
const banner = document.createElement('div');
banner.className = 'maplibregl-ctrl maplibregl-ctrl-group banner';
banner.setAttribute('role', 'status');
map.addControl({ onAdd: () => banner, onRemove: () => banner.remove() }, 'top-left');
// The panel, which showPanel() fills while the map follows a Train or shows a Station's board.
const panel = document.createElement('section');
panel.className = 'follow';
panel.hidden = true;
document.body.append(panel);
// The About dialog, opened from the legend, which showAbout() fills. Tapping outside it closes it
// too, in browsers that can.
const about = el('dialog', { className: 'about' });
about.setAttribute('closedby', 'any');
document.body.append(about);
/** The About dialog's credits, which showCredits() fills. */
const aboutCredits = el('ul');
/**
 * The Train the map follows, by its service day and its Trip as its operator names it, so that it
 * stays followed as the days joined change around midnight, and where it's drawn.
 */
let following: { day: string; trip: string; at?: Point } | undefined;
/** The place whose board the panel shows, by its ID in places(), while the map follows no Train. */
let boardPlace: string | undefined;
/** The last date a Station board had no departures left, when the map needs the next day's Trips for it. */
let emptyBoard: string | undefined;
/**
 * Where the viewer is, while the panel shows their nearby Trains instead, or that the browser is
 * still finding out, or couldn't. It's never sent anywhere, nor put in the page's link.
 */
let nearMe: Point | 'locating' | 'failed' | undefined;
/** When the panel was last filled, by performance.now(). */
let panelShown = 0;
/** When the legend's count was last filled, by performance.now(). */
let countShown = -Infinity;
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
let stationNames = new Map<string, string>();
/** Where the map shows the Stations, by their IDs in places(). */
let shownPlaces = new Map<string, Place>();
/** What places each Line's Trains beside its track zoomed out: its shapes, their sides by `<line> <shape>`, and which side its Trains keep to, 1 right and -1 left. */
let placing = { shapes: new Map<string, Shape>(), sides: new Map<string, Stroke[]>(), keep: new Map<string, number>() };
/** How each Line's Trains are drawn as pills, by the Line's ID. */
let pills = new Map<string, Pill>();
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
// Zoomed out, Trains are dots over the Stations they stand at, under the Stations' names.
map.addSource('trains', { type: 'geojson', data: trains() });
map.addLayer({
  id: 'trains',
  type: 'circle',
  source: 'trains',
  filter: ['<', ['zoom'], ['get', 'pillZoom']],
  // A Live Train is filled with its Line's colour; a Scheduled one is only ringed with it.
  layout: { 'circle-sort-key': ['case', ['get', 'followed'], 1, 0] },
  // The Train the map follows is drawn larger, over the rest.
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, ['case', ['get', 'followed'], 5, 2.5], 14, ['case', ['get', 'followed'], 10, 6]],
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
// Zoomed in (pillOf()), each Train is a pill with its Line's name, over the Stations' names too,
// outlined by its Line's kind of service: a Live one's filled with its Line's colour and edged in
// white, a Scheduled one's white, ringed and lettered in its Line's colour. Just outside it, an arrow
// points the way the Train runs, and turns with the map. The Train the map follows has its own pill
// and arrow, larger, over every other Train's: MapLibre draws a layer's names after all its pills.
for (const [id, outline] of Object.entries(OUTLINES)) addOutline(id, outline);
for (const [suffix, followed, size] of [['', false, PILL_TEXT], ['-followed', true, FOLLOWED_TEXT]] as const) {
  const filter: ExpressionSpecification = ['all', ['>=', ['zoom'], ['get', 'pillZoom']], ['==', ['get', 'followed'], followed]];
  map.addLayer({
    id: `train-pills${suffix}`,
    type: 'symbol',
    source: 'trains',
    filter,
    layout: {
      'icon-image': ['concat', 'train-', ['get', 'outline']],
      'icon-text-fit': 'both',
      'icon-text-fit-padding': [0, PILL_PADDING, 0, PILL_PADDING],
      'text-field': ['get', 'name'],
      'text-font': ['Noto Sans Bold'],
      'text-size': size,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'icon-color': byLive(['get', 'colour'], '#fff'),
      'icon-halo-color': byLive('#fff', ['get', 'colour']),
      'icon-halo-width': 1.5,
      'text-color': byLive(['case', ['get', 'dark'], INK, '#fff'], ['get', 'colour']),
    },
  });
  map.addLayer({
    id: `train-arrows${suffix}`,
    type: 'symbol',
    source: 'trains',
    filter,
    layout: {
      'icon-image': 'train-arrow',
      'icon-rotate': ['get', 'heading'],
      'icon-rotation-alignment': 'map',
      // `reach` px ahead of the Train.
      'icon-offset': ['interpolate', ['linear'], ['get', 'reach'], 0, ['literal', [0, 0]], 100, ['literal', [0, -100]]],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-color': ['get', 'colour'], 'icon-halo-color': '#fff', 'icon-halo-width': 1 },
  });
}

// Tapping a Train follows it, and tapping a Station shows its board. Both are small, so a tap near one
// will do, and a Train standing at a Station is the one tapped.
map.on('click', ({ point: { x, y } }) => {
  const near = (layer: string): unknown => map.queryRenderedFeatures([[x - 10, y - 10], [x + 10, y + 10]], { layers: [layer] })[0]?.properties.id;
  const [train, place] = [near('train-pills-followed') ?? near('train-pills') ?? near('trains'), near('stations')];
  if (typeof train === 'string') follow(train);
  else if (typeof place === 'string') showBoard(place);
});
for (const layer of ['trains', 'train-pills', 'train-pills-followed', 'stations']) {
  map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
  map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
}
// Escape closes the About dialog on its own, if it's open.
document.addEventListener('keydown', (e) => e.key === 'Escape' && !about.open && (following || boardPlace || nearMe) && closePanel());

// Moves the Trains, and names the Networks whose live data is unavailable as that changes, as often
// as MOVED says. The browser stops asking while the tab is hidden.
const trainSource = map.getSource<GeoJSONSource>('trains');
const trainButtons = el('div', { className: 'maplibregl-ctrl maplibregl-ctrl-group' }, nearbyButton, followRandomButton);
map.addControl({ onAdd: () => trainButtons, onRemove: () => trainButtons.remove() }, 'top-right');
/** When the map last moved, as a drag, a zoom or an easing, or followed a Train, and when its Trains were last drawn, by performance.now(), and at which zoom and bearing. */
let [moved, drawn, drawnAt] = [-Infinity, -Infinity, ''];
requestAnimationFrame(function move(now) {
  if (following || map.isMoving()) moved = now;
  const view = `${map.getZoom()} ${map.getBearing()}`;
  // ponytail: no more often than IDLE_EVERY once the map stands, so zoomed right in, at 18, a Train at
  // 110 km/h then steps about 4.5 px at a time. Let the rate rise with the zoom there too if that shows.
  const every = following || view !== drawnAt ? 0 : Math.min(IDLE_MOST, now - moved > MOVED ? Math.max(IDLE_EVERY, quarterPixel()) : quarterPixel());
  if (now - drawn < every) return requestAnimationFrame(move);
  [drawn, drawnAt] = [now, view];
  const drawing = trains();
  trainSource?.setData(drawing);
  // The legend's count changes by the second, once the Trips have come, and with it whether there's a
  // Train to follow at random: one the map doesn't follow already.
  if (bundle && performance.now() - countShown > 1000) {
    showCount(drawing.features);
    followRandomButton.disabled = drawing.features.every((f) => f.properties?.followed);
  }
  if (following) {
    // A Train that has left the map, reaching its last Station or cancelled, is followed no more.
    if (!following.at) closePanel();
    else keepInView(following.at);
  }
  // The panel's times and ages change by the second.
  if ((following || boardPlace || nearMe) && performance.now() - panelShown > 1000) showPanel();
  const ids = bundle ? unavailable(bundle, Date.now(), received) : [];
  if (ids.join() !== unavailableIds.join()) {
    unavailableIds = ids;
    showBanner();
  }
  requestAnimationFrame(move);
});

// The link the map is opened with, and one pasted into the tab later: MapLibre moves the view.
openLink();
addEventListener('hashchange', openLink);

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
  stationNames = new Map(days.stations.map((s) => [s.id, s.name]));
  shownPlaces = new Map(places(days.stations).map((p) => [p.id, p]));
  const shapes = new Map(days.shapes.map((s) => [s.id, s]));
  const sides = new Map<string, Stroke[]>();
  for (const s of days.sides) sides.set(`${s.line} ${s.shape}`, [...(sides.get(`${s.line} ${s.shape}`) ?? []), s]);
  const keep = new Map(days.networks.map((n) => [n.id, n.runningSide === 'left' ? -1 : 1]));
  placing = { shapes, sides, keep: new Map(days.lines.map((l) => [l.id, keep.get(l.network) ?? 1])) };
  pills = new Map(days.lines.map((l) => [l.id, pillOf(l)]));
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
    features: [...shownPlaces.values()].map((p) => ({
      type: 'Feature',
      properties: { id: p.id, name: p.name },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  });
  credited = days.networks;
  showCredits();
}

/**
 * Every Train on the map now, in its Line's colour, Live or Scheduled. Zoomed out, where a double
 * track's two tracks fall on one pixel, each sits on its Line's stroke, half a line width to the
 * side its Network's Trains keep to, so that Trains going opposite ways show apart.
 */
function trains(): GeoJSON.FeatureCollection {
  const zoom = map.getZoom();
  // How far apart Lines are drawn, in metres at the equator.
  const apart = atZoom(APART, zoom) * pixelMetres(zoom);
  const [followed, bearing] = [followedId(), map.getBearing()];
  if (following) following.at = undefined;
  return {
    type: 'FeatureCollection',
    features: (bundle ? trainsAt(bundle, Date.now(), received) : []).map(({ trip, dist, lon, lat, heading, live }) => {
      const shape = placing.shapes.get(trip.shape);
      const side = placing.sides.get(`${trip.line} ${trip.shape}`)?.find((s) => s.from <= dist && dist <= s.to)?.side ?? 0;
      // Each Trip runs its own shape forwards: its right is the Train's.
      // ponytail: takes the Network's running side, so L2's Trains between Tetuan and Paral·lel, which
      // keep left, sit half a line width to the wrong side zoomed out. Publish each shape's side of
      // its double track from the trace if that ever shows.
      const metres = (side + 0.5 * (placing.keep.get(trip.line) ?? 1)) * apart * Math.cos((lat * Math.PI) / 180);
      const coordinates: Point = shape && metres ? beside(shape, dist, metres) : [lon, lat];
      if (following && trip.id === followed) following.at = coordinates;
      const pill = pills.get(trip.line);
      return {
        type: 'Feature',
        properties: {
          id: trip.id,
          colour: lines.get(trip.line)?.colour,
          live,
          followed: trip.id === followed,
          heading,
          name: pill?.name,
          outline: pill?.outline,
          dark: pill?.dark,
          pillZoom: pill?.zoom,
          reach: pill && reach(trip.id === followed ? pill.followedBox : pill.box, heading - bearing),
        },
        geometry: { type: 'Point', coordinates },
      };
    }),
  };
}

/** How long the fastest Train, at its Network's top speed, takes to move a quarter of a pixel where the map is, in ms. */
function quarterPixel(): number {
  const fastest = Math.max(...credited.map((n) => n.profile.topSpeed));
  const pixel = pixelMetres(map.getZoom()) * Math.cos((map.getCenter().lat * Math.PI) / 180);
  return (1000 * pixel) / 4 / fastest;
}

/**
 * How a Line's Trains are drawn as pills: its name, the outline for its kind of service, whether its
 * name is lettered dark on its colour, the zoom its Trains are pills from, and how far a pill reaches
 * either side of its Train and above and below it, in px, and the followed Train's.
 */
interface Pill {
  name: string;
  outline: 'round' | 'pointed' | 'badge';
  dark: boolean;
  zoom: number;
  box: [number, number];
  followedBox: [number, number];
}

/**
 * How a Line's Trains are drawn as pills. The Metro's and TRAM's are badges, as their operators badge
 * their Lines, and pills from zoom 12, where their Trains are far enough apart to read. Rodalies' and
 * FGC's are pills from zoom 10, as main-line Trains show before metros: rounded for commuter and
 * suburban Lines, pointed at both ends for regional ones, and badges for the rack and the funicular.
 * ponytail: told apart by Network and name, as the bundle names no kind of service. Have the daily
 * build publish one if a Line comes that these don't place.
 */
function pillOf({ network, name, colour }: Line): Pill {
  const city = network === 'metro' || network === 'tram';
  const regional = network === 'rodalies' ? /^R1\d$/.test(name) : network === 'fgc' && /^(R[56]0?|RL[12])$/.test(name);
  const outline = city || name === 'MM' || name === 'FV' ? 'badge' : regional ? 'pointed' : 'round';
  const width = nameWidth(name);
  return { name, outline, dark: darkInk(colour), zoom: city ? 12 : 10, box: boxOf(outline, width, PILL_TEXT), followedBox: boxOf(outline, width, FOLLOWED_TEXT) };
}

/** How far a pill reaches either side of its Train and above and below it, in px, with its outline, around a name `width` px wide at PILL_TEXT, lettered at `size` px. */
function boxOf(outline: Pill['outline'], width: number, size: number): [number, number] {
  const { w, across = 0 } = OUTLINES[outline];
  return [Math.max(w, w - across + (width * size) / PILL_TEXT + 2 * PILL_PADDING) / 2, PILL_EDGE + (LINE_HEIGHT * size) / 2];
}

/** A colour's (#rrggbb) relative luminance, as WCAG works it out. */
function luminance(colour: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whether INK reads better on a colour than white does, by WCAG's contrast ratio. */
function darkInk(colour: string): boolean {
  const lit = luminance(colour) + 0.05;
  return lit / (luminance(INK) + 0.05) > 1.05 / lit;
}

/**
 * How wide a Line's name is on its Trains' pills, in px.
 * ponytail: measured in the browser's bold sans-serif, not MapLibre's Noto Sans Bold, which comes
 * within a px or so of it on these names, so an arrow can sit that much nearer its pill or further.
 * Measure in Noto Sans Bold, loaded as a web font, if that shows.
 */
function nameWidth(name: string): number {
  if (!measuring) return name.length * 6;
  measuring.font = `bold ${PILL_TEXT}px sans-serif`;
  return measuring.measureText(name).width;
}

/**
 * How far ahead of its Train an arrow goes, in px: just outside a pill reaching `box` px either side
 * and above and below, where the Train's heading leaves it on screen, `angle` degrees clockwise from
 * straight up, as the pill stays level while the map turns.
 * ponytail: to the pill's box, so a heading that leaves off the level by a pointed or rounded end puts
 * its arrow a few px further out; and laid out flat, so on a tilted map an arrow sits nearer its
 * pill's far side. Aim at the outline itself, tilted with the pill, if either shows.
 */
function reach([halfWidth, halfHeight]: [number, number], angle: number): number {
  const a = (angle * Math.PI) / 180;
  return Math.min(halfWidth / Math.abs(Math.sin(a)), halfHeight / Math.abs(Math.cos(a))) + ARROW_GAP;
}

/** How far outside a square `half` px either side of its middle, with its corners rounded `r` px, a point is, in px. */
function roundedSquare(half: number, r: number) {
  return (x: number, y: number) => {
    const [qx, qy] = [Math.abs(x) - half + r, Math.abs(y) - half + r];
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  };
}

/**
 * Adds an outline to the map as the image `train-<id>`, as a signed distance field, which MapLibre
 * colours, edges and sizes sharp: 3 px bigger each way for its edge, at 2 texture px a px. MapLibre
 * draws where the field reads 0.75, and takes a px as 1/8 of it.
 */
function addOutline(id: string, { w, h, across, outside }: (typeof OUTLINES)[keyof typeof OUTLINES]) {
  const [width, height] = [(w + 6) * 2, (h + 6) * 2];
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) data[(row * width + col) * 4 + 3] = 255 * (0.75 - outside((col + 0.5 - width / 2) / 2, (row + 0.5 - height / 2) / 2) / 8);
  }
  const [x, y, high] = [width / 2, height / 2, h - 2 * PILL_EDGE];
  const fit = across === undefined ? {} : { stretchX: [[x - 2, x + 2]] as [number, number][], stretchY: [[y - 2, y + 2]] as [number, number][], content: [x - across, y - high, x + across, y + high] as [number, number, number, number] };
  map.addImage(`train-${id}`, { width, height, data }, { sdf: true, pixelRatio: 2, ...fit });
}

/** Shows the interface in the viewer's language: on start, and again each time they switch it. */
function showLanguage() {
  document.documentElement.lang = language();
  languageSwitch.title = t('language');
  nearbyButton.title = t('nearby');
  nearbyButton.setAttribute('aria-label', t('nearby'));
  followRandomButton.title = t('followRandom');
  followRandomButton.setAttribute('aria-label', t('followRandom'));
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
    countRow,
    el('button', { type: 'button', textContent: t('about'), onclick: () => about.showModal() }),
  );
  // The next frame counts the Trains again, in this language.
  countShown = -Infinity;
  showAbout();
  showBanner();
  showCredits();
  showPanel();
}

/** Says in the legend how many of these Trains there are, every one on the map and not only those in view, and how many of them are Live, in the viewer's language. */
function showCount(features: GeoJSON.Feature[]) {
  countShown = performance.now();
  countRow.textContent = trainCount(features.length, features.filter((f) => f.properties?.live).length);
}

/** Follows a Train picked at random but for the one the map follows: a Live one in view, else a Live one anywhere on the map, else any. */
function followRandom() {
  const followed = followedId();
  const others = (bundle ? trainsAt(bundle, Date.now(), received) : []).filter((t) => t.trip.id !== followed);
  const live = others.filter((t) => t.live);
  // ponytail: in view by the map's bounds, which take in what's under the panel too, and on a rotated
  // map the corners around the view. Test where each Train is on screen above the panel, as
  // keepInView() does, if picks out of sight ever show.
  const bounds = map.getBounds();
  const pool = [live.filter((t) => bounds.contains([t.lon, t.lat])), live, others].find((p) => p.length) ?? [];
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick) follow(pick.trip.id);
}

/** Follows a Trip's Train, by its ID in the days on the map: brings it into view, over the panel, and keeps it there. */
function follow(id: string) {
  const [, day, trip] = /^(\d{4}-\d{2}-\d{2})\/(.*)$/.exec(id) ?? [];
  following = day && trip ? { day, trip } : { day: bundle?.serviceDay ?? '', trip: id };
  [boardPlace, nearMe] = [undefined, undefined];
  trainSource?.setData(trains());
  showPanel();
  writeLink();
  if (following.at) map.easeTo({ center: following.at, zoom: Math.max(map.getZoom(), 13), padding: abovePanel() });
}

/** Shows a place's board, by its ID in places(), following no Train. */
function showBoard(place: string) {
  [following, boardPlace, nearMe] = [undefined, place, undefined];
  trainSource?.setData(trains());
  showPanel();
  writeLink();
}

/**
 * Shows the viewer's nearby Trains, following no Train, once the browser says where they are. Where
 * it won't, as when they decline, the panel says so, and the rest of the map carries on. The map
 * stays where it is: the basemap's tiles for where they are would tell OpenFreeMap.
 */
function showNearby() {
  [following, boardPlace, nearMe] = [undefined, undefined, 'locating'];
  trainSource?.setData(trains());
  showPanel();
  writeLink();
  // A position or failure that comes after the viewer has moved on to something else is dropped.
  const found = (where: Point | 'failed') => {
    if (!nearMe) return;
    nearMe = where;
    showPanel();
  };
  // Some browsers have no geolocation at all, as over plain http.
  if (!('geolocation' in navigator)) return found('failed');
  navigator.geolocation.getCurrentPosition(({ coords }) => found([coords.longitude, coords.latitude]), () => found('failed'), { maximumAge: 60_000, timeout: 30_000 });
}

/** Stops following a Train, or closes a Station's board or the nearby Trains. */
function closePanel() {
  [following, boardPlace, nearMe] = [undefined, undefined, undefined];
  showPanel();
  writeLink();
  map.easeTo({ padding: abovePanel() });
}

/**
 * Opens what the page's link names besides the view: a Station's board, or once its Trips have come,
 * a Train to follow, which the map stops following straight away if it's no longer running. A
 * Station the map doesn't know goes from the link.
 */
function openLink() {
  const link = new URLSearchParams(location.hash.slice(1));
  const [station, train] = [link.get('station'), link.get('train')];
  const place = station && [...shownPlaces.values()].find((p) => p.stations.includes(station));
  if (place) showBoard(place.id);
  else if (station) writeLink();
  // Trips that fail to come are logged where show() gets them.
  else if (train) needed.days.then(() => follow(train), () => {});
}

/**
 * Puts what the panel shows in the page's link, beside the view, so that sharing the page shares it:
 * `train=<service day>/<Trip>`, the Train by its service day and its Trip as its operator names it,
 * whose ID leads with its Network, or `station=<Station>`, one of the place's Stations, which opens the
 * place's board. Written as MapLibre writes the view, which undoes any escaping each time it does.
 * ponytail: so an ID with `&`, `=`, `#`, `+` or `%` in it would break its link. None has one yet
 * (only `:._|@-`); escape them both ways, instead of MapLibre's hash, if an operator's ever does.
 */
function writeLink() {
  const params = new URLSearchParams(location.hash.slice(1));
  params.delete('train');
  params.delete('station');
  if (following) params.set('train', `${following.day}/${following.trip}`);
  const station = boardPlace && shownPlaces.get(boardPlace)?.stations[0];
  if (station) params.set('station', station);
  history.replaceState(history.state, '', `#${decodeURIComponent(params.toString())}`);
}

/** The ID of the Trip the map follows in the days on the map, which lead an earlier day's Trips with that day (joinDays()). */
function followedId(): string | undefined {
  if (!following || !bundle) return undefined;
  return following.day === bundle.serviceDay ? following.trip : `${following.day}/${following.trip}`;
}

/**
 * Brings the Train the map follows back into view where it's about to leave it, or the viewer has
 * moved the map off it: where it's outside the middle 60% of the map above the panel. Not while the
 * map moves, so it never fights the viewer's hand.
 */
function keepInView(at: Point) {
  if (map.isMoving()) return;
  const { x, y } = map.project(at);
  const { clientWidth: width, clientHeight: height } = map.getContainer();
  const above = height - panel.offsetHeight;
  if (x < 0.2 * width || x > 0.8 * width || y < 0.2 * above || y > 0.8 * above) map.easeTo({ center: at, duration: 1000, padding: abovePanel() });
}

/** The map's padding that puts its middle above the follow panel, which grows and shrinks with what it shows. */
function abovePanel() {
  return { top: 0, right: 0, left: 0, bottom: panel.offsetHeight };
}

/** Fills the panel, in the viewer's language, with the Train the map follows, the Station board it shows, or the viewer's nearby Trains. Hides it while there's none. */
function showPanel() {
  panelShown = performance.now();
  const shown = following ? followedPanel() : boardPlace ? boardPanel(boardPlace) : nearMe ? nearbyPanel(nearMe) : undefined;
  panel.hidden = !shown;
  panel.replaceChildren(...(shown ?? []));
}

/**
 * The followed Train's panel: its Line and where it's headed, Live or Scheduled and how long ago
 * live data last placed it, its Delay but for a Metro Train's, its modelled speed, its Unit type
 * where its operator reports one, and the Stations it has still to leave, with when it's expected at
 * each.
 */
function followedPanel(): Node[] | undefined {
  const train = bundle && trainAt(bundle, Date.now(), received, followedId() ?? '');
  if (!train) return undefined;
  const { trip, live, unreported, since, delay, speed, unitType, upcoming, standing } = train;
  const status = [t(live ? 'live' : 'scheduled')];
  if (unreported) status.push(t('noLiveTrain'));
  else if (since !== undefined) status.push(t(live ? 'confirmed' : 'lastConfirmed').replace('{ago}', ago(since)));
  const time = clock();
  return [
    closeButton(t('stopFollowing')),
    el('h2', {}, lineName(trip.line), ` → ${trip.headsign}`),
    el('p', { className: live ? 'live' : 'scheduled' }, status.join(' · ')),
    ...delayText(delay).map((text) => el('p', {}, text)),
    el('p', {}, `${t('speed')}: ~${Math.round(speed * 3.6)} km/h`),
    ...(unitType ? [el('p', {}, `${t('unit')}: ${unitType}`)] : []),
    el('h3', { textContent: t('nextStations') }),
    el(
      'ol',
      {},
      // Standing at a Station, it's when it leaves that's still to come.
      ...upcoming.map((u, i) => el('li', {}, el('time', { textContent: time.format(i === 0 && standing ? u.departure : u.arrival) }), ` ${stationNames.get(u.station) ?? u.station}`)),
    ),
  ];
}

/**
 * A place's board: its next departures from each of its Stations, each with when it's expected to
 * leave, its Line, where it's headed, Live or Scheduled, and its Delay but for a Metro Train's, or
 * that it's Cancelled.
 */
function boardPanel(id: string): Node[] | undefined {
  const place = shownPlaces.get(id);
  if (!place) return undefined;
  const departures = bundle ? boardAt(bundle, Date.now(), received, place.stations) : [];
  // With none left today, the next day's first are to come; refreshDays() runs again within a minute if it's busy now.
  const date = madridDate(new Date());
  if (bundle && !departures.length && emptyBoard !== date) {
    emptyBoard = date;
    refreshDays();
  }
  const time = clock();
  return [
    closeButton(t('closeBoard')),
    el('h2', { textContent: place.name }),
    el('h3', { textContent: t('nextDepartures') }),
    departures.length
      ? el(
          'ol',
          {},
          ...departures.map(({ trip, departure, delay, live, unreported, cancelled }) =>
            el(
              'li',
              { className: cancelled ? 'cancelled' : '' },
              el('time', { textContent: time.format(departure) }),
              lineName(trip.line),
              ` ${trip.headsign} `,
              el('small', { className: live ? 'live' : 'scheduled' }, cancelled ? t('cancelled') : [t(live ? 'live' : 'scheduled'), ...(unreported ? [t('noLiveTrain')] : []), ...delayText(delay)].join(' · ')),
            ),
          ),
        )
      : el('p', { textContent: t('noDepartures') }),
  ];
}

/**
 * The viewer's nearby Trains: each that passes within NEARBY of them within SOON, soonest first, with
 * when it next comes within NEARBY of them, its Line, where it's headed, Live or Scheduled, and its
 * Delay but for a Metro Train's.
 */
function nearbyPanel(near: Point | 'locating' | 'failed'): Node[] {
  const top = [closeButton(t('closeNearby')), el('h2', { textContent: t('nearby') })];
  if (near === 'locating') return [...top, el('p', { textContent: t('locating') })];
  if (near === 'failed') return [...top, el('p', { textContent: t('noLocation') })];
  const passes = bundle ? nearbyAt(bundle, Date.now(), received, near, NEARBY, SOON) : [];
  const time = clock();
  return [
    ...top,
    el('h3', { textContent: t('passingNearby') }),
    passes.length
      ? el(
          'ol',
          {},
          ...passes.map(({ trip, at, delay, live }) =>
            el(
              'li',
              {},
              el('time', { textContent: time.format(at) }),
              lineName(trip.line),
              ` ${trip.headsign} `,
              el('small', { className: live ? 'live' : 'scheduled' }, [t(live ? 'live' : 'scheduled'), ...delayText(delay)].join(' · ')),
            ),
          ),
        )
      : el('p', { textContent: t('noneNearby') }),
  ];
}

/** An element, with its properties and what goes in it. */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/** The panel's button that closes it, or what `onclick` closes. */
function closeButton(label: string, onclick = closePanel) {
  const close = el('button', { className: 'close', title: label, textContent: '×', onclick });
  close.setAttribute('aria-label', label);
  return close;
}

/** A Line's name, in its colour. */
function lineName(id: string) {
  const line = lines.get(id);
  const name = el('span', { className: 'line', textContent: line?.name ?? '' });
  if (line) name.style.setProperty('--line', line.colour);
  return name;
}

/** How late a Train is running, in the viewer's language, to the minute: nothing for one with no Delay to show, as a Metro Train. */
function delayText(delay: number | undefined): string[] {
  if (delay === undefined) return [];
  const minutes = Math.round(Math.abs(delay) / 60);
  return [minutes ? t(delay > 0 ? 'late' : 'early').replace('{n}', String(minutes)) : t('onTime')];
}

/** Formats times of day as the viewer's language does, in Barcelona. */
function clock() {
  return new Intl.DateTimeFormat(language(), { timeStyle: 'short', timeZone: 'Europe/Madrid' });
}

/** How long a number of ms is, to the second under a minute and to the minute after. */
function ago(ms: number): string {
  return ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`;
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

/**
 * Fills the About dialog, in the viewer's language: what the map shows and that its positions are
 * estimates, the credits showCredits() lists there, the code and its licence, and privacy.
 */
function showAbout() {
  about.setAttribute('aria-label', t('about'));
  about.replaceChildren(
    closeButton(t('close'), () => about.close()),
    el('h2', { textContent: t('about') }),
    el('p', { textContent: t('estimates') }),
    el('h3', { textContent: t('credits') }),
    aboutCredits,
    el('h3', { textContent: t('sourceCode') }),
    el(
      'p',
      {},
      el('a', { href: 'https://github.com/gariasf/viapeninsula', target: '_blank', textContent: 'github.com/gariasf/viapeninsula' }),
      ', ',
      el('a', { href: 'https://www.gnu.org/licenses/agpl-3.0.html', target: '_blank', textContent: 'AGPL-3.0' }),
    ),
    el('h3', { textContent: t('privacy') }),
    el('p', { textContent: t('noCookies') }),
  );
}

/** Credits the basemap and each Network's data, in the viewer's language, on the map and in the About dialog, building the map's credits afresh. */
function showCredits() {
  const html = [
    '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> ' +
      '<a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> ' +
      `<a href="https://www.openstreetmap.org/copyright" target="_blank">${t('osmContributors')}</a>`,
    // A Network with no credit of its own here still gets its name.
    ...credited.map((network) => CREDITS[network.id]?.(network) ?? network.name),
  ];
  if (credits) map.removeControl(credits);
  credits = new AttributionControl({ customAttribution: html });
  map.addControl(credits);
  // MapLibre sanitizes its copy; this one goes in as it is, which is safe while it's all ours: these
  // constants, t() and the Network names the daily build publishes.
  aboutCredits.replaceChildren(...html.map((credit) => el('li', { innerHTML: credit })));
}

/**
 * The service days the map needs now (daysNeeded()), joined, where they aren't the ones it shows. A
 * day whose bundle fails to come is left out, and fetched again next time.
 * Today's track comes on its own first, so the map can draw it before the Trips come.
 */
async function neededDays(): Promise<{ track: Promise<Track>; days: Promise<Bundle> } | undefined> {
  try {
    manifest = await getJson<Manifest>(`${LIVE_URL}/manifest.json`);
  } catch (error) {
    if (!manifest) throw error;
    console.warn(error);
  }
  // The next day's first Trains come SOON before they're on the map, so they're among the nearby Trains.
  const needed = daysNeeded(manifest.days, Date.now(), { early: SOON, late: LATE, emptyBoard });
  if (!needed) throw new Error('The manifest names no service day');
  const { today, days } = needed;
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
