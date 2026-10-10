import type { ExpressionSpecification, FilterSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl';
import { APART, atZoom, BANDS, bandZooms, direction, drawnIn, inBand, pointAt, slotAt, WIDTH, type Bundle, type Network, type Place, type Point, type Shape, type Slot, type Track } from '../bundle.ts';
import { contrast, lettering } from './colour.ts';

/**
 * #210's variants, picked by `?stations=`, comma-separated and combinable, each trying one thing on today's map:
 * - `square`: the top tier drawn as railisland's rounded square, a fifth larger than its dot, ringed in #212's nameboard's ink;
 *   with `red`, ringed in red, as railisland's.
 * - `board`: the top tier's names reversed out, white on that ink, as TMB's names for its termini and big interchanges.
 * - `sign`: from zoom 13, each place drawn as its Network's mark of our own (M, FGC, T, R), white, ringed and lettered in
 *   the Network's colour, as the maintainer's reference (7 Oct); with `filled`, filled with it and lettered white or ink.
 * - `badge`: with `sign`, an interchange (several Networks' places together, or one place several Networks serve) as one
 *   rounded badge holding each Network's mark side by side, its name in bold under it, and one board for it on a tap.
 * - `capsule`: an interchange as TMB's and Mini Tokyo 3D's white capsule, ringed as the dots are, joining its places'
 *   dots, and zoomed in on the rails each of its Stations' on its own track; one name, and one board on a tap.
 * - `bar`: on the bands, below zoom 14, each Station as FGC's bar across its own Lines' strokes; on the rails, its dot.
 * - `snap`: each Station's dot on its own Lines: on the bands in the middle of their strokes, and on the rails on its track,
 *   from zoom 15, as the Trains go back on their rails; with `sign`, its own Network's mark there, and with `badge`, an
 *   interchange's linked.
 * - `few`: the heap at zoom 10: the Metro's and TRAM's places in neither tier, those of the Networks whose Trains are dots
 *   till zoom 12, drawn from zoom 11 only, fading in by 12, as their Trains turn into pills. `small`: every place in neither
 *   tier drawn smaller there.
 * - `pick`: the variants recommended together (PICK).
 * In the query string, as the link's hash holds the map's own state (#208).
 * Throwaway: once the maintainer picks, a build ticket builds the pick, and this goes.
 */
const parts = new Set(new URLSearchParams(location.search).get('stations')?.split(',') ?? []);
/** The variants recommended as the pick, which `?stations=pick` turns on. */
const PICK: string[] = ['square', 'sign', 'badge', 'snap', 'few'];
/** Whether a variant is on: `badge` takes `sign` with it. */
export const has = (part: string): boolean => parts.has(part) || (parts.has('pick') && PICK.includes(part)) || (part === 'sign' && has('badge'));

/** The places as main.ts tiers them (TIERS): `larger` px larger dots, named from `nameZoom`, lettered in `style`. */
interface Tiered extends Place {
  nameZoom: number;
  larger: number;
  style: { bold: boolean; size: number };
}
/** What the variants read of main.ts's state as they draw. */
interface State {
  bundle?: Bundle;
  places: Map<string, Place>;
  placing: { shapes: Map<string, Shape>; slots: Map<string, Slot[]> };
  networks: Network[];
}
/** main.ts's colours on its basemap. */
interface Looks {
  nameColour: string;
  dotRing: string;
  halo: string;
}
/** A place's dot's radius and its ring's width, in px at each zoom, as main.ts's DOT and RING. */
const DOT: [number, number][] = [[7, 1.5], [14, 5]];
const RING: [number, number][] = [[7, 0.5], [14, 1.5]];
/** The zoom the Lines are back on their rails at, as main.ts's railsZoom. */
const RAILS = APART.at(-1)?.[0] ?? 15;

/** The zoom the marks (`sign`, `badge`) show from, fading in over the half zoom before it as the dots fade out. */
const SIGN_ZOOM = 13;
/** How large a mark is drawn at each zoom, of its full size. */
const SIGN_SIZE: [number, number][] = [[12.5, 0.75], [13, 0.8], [15, 1]];
/** A mark's height, its ring's width and its letters' size, in px at its full size; a badge's padding and ring. */
const [MARK, MARK_RING, MARK_TEXT, BADGE_PAD, BADGE_RING] = [16, 2, 9.5, 2.5, 1.5];
/** Each Network's mark, by its ID: our own plain letters, not the operators' logos (#20). Others take their name's first letter. */
const MARKS: Record<string, string> = { metro: 'M', fgc: 'FGC', tram: 'T', rodalies: 'R' };
/** The order Networks' marks go in, side by side. */
const ORDER = ['rodalies', 'fgc', 'metro', 'tram'];
/** railisland's red, and the nameboard's ink (#212), which the board's heading is in on both basemaps. */
const [RED, BOARD_INK] = ['#d7192d', '#14305a'];
/** How far a reversed-out name's box reaches beyond its letters, across and up and down, in px, and its corners' radius. */
const [BOARD_X, BOARD_Y, BOARD_RADIUS] = [4, 2, 3];
/** A line width at zoom 14, in px: the bars are drawn at this and scaled with WIDTH. */
const REF = atZoom(WIDTH, 14);
/** How thick a bar is, in px at zoom 14. */
const BAR = 3;
/** How many times as large as its dot, with its ring, the top tier's square is drawn (`square`). */
const SQUARE = 1.2;
/** The top tier's square's size at a zoom, of its image's: SQUARE times its dot with its ring, which the image's 18 px stand for. */
const squareSize = (zoom: number) => (SQUARE * (2 * (atZoom(DOT, zoom) + 2) + 2 * atZoom(RING, zoom))) / 18;
/** How near, in metres, places of other Networks are, sharing a word of their names, to make one interchange. */
const INTERCHANGE = 350;
/** Words that don't make two places' names one interchange's. */
const COMMON = new Set(['barcelona', 'de', 'del', 'la', 'el', 'les', 'els', 'i', 'estacio', 'placa', 'sant', 'santa', 'av', 'avinguda']);
/** The zooms the dots' and marks' opacities are worked out at, between which each part goes linearly. */
const ZOOMS = [0, 10, 11, 12, 12.5, 13, 14, 14.5, 14.99, 15, 22];
/** The whole zooms the bands' dots' and bars' offsets are worked out at. */
const OFFSET_ZOOMS = [7, 8, 9, 10, 11, 12, 13, 14, 15];
/** The device pixels a px of an image is drawn at. */
const ratio = Math.max(2, Math.ceil(devicePixelRatio));

let map: MapLibreMap | undefined;
let read: () => State;
let looks: Looks;
/** The places as main.ts last tiered them, and the interchanges among them. */
let placesNow: Tiered[] = [];
let interchanges: Interchange[] = [];

/** An interchange: places of several Networks together, the one named for them all, and the name. */
interface Interchange {
  id: string;
  name: string;
  places: Tiered[];
  named: Tiered;
  networks: string[];
  lon: number;
  lat: number;
}

/** An expression that takes `value` at each of these zooms, and goes linearly from one to the next. */
const byZoom = (stops: [number, number][], value: (px: number, zoom: number) => number | ExpressionSpecification): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], ...stops.flatMap(([zoom, px]) => [zoom, value(px, zoom)])];
/** An opacity as each part has it at ZOOMS, multiplied: each part is a feature's value at a zoom, which ['zoom'] can't be inside of. */
const opacity = (parts: ((zoom: number) => number | ExpressionSpecification)[]): ExpressionSpecification => ['interpolate', ['linear'], ['zoom'], ...ZOOMS.flatMap((zoom) => [zoom, ['*', 1, 1, ...parts.map((part) => part(zoom))] as ExpressionSpecification])];
/** A value going linearly from `a` at `from` to `b` at `to`, held either side. */
const ramp = (zoom: number, from: number, a: number, to: number, b: number) => (zoom <= from ? a : zoom >= to ? b : a + ((b - a) * (zoom - from)) / (to - from));
/** The places `few` leaves out zoomed out: those in neither tier whose Networks' Trains are all dots till zoom 12 (Network's `pillZoom`), the Metro's and TRAM's. */
let fewer: string[] = [];
/** `few`: those places from zoom 11 only, fading in by 12, by their place's ID. */
const few = (zoom: number): number | ExpressionSpecification => (has('few') ? ['case', ['in', ['get', 'id'], ['literal', fewer]], ramp(zoom, 11, 0, 12, 1), 1] : 1);
/** The marks fading in over the half zoom before SIGN_ZOOM, as the dots fade out. */
const signIn = (zoom: number) => (has('sign') ? ramp(zoom, SIGN_ZOOM - 0.5, 0, SIGN_ZOOM, 1) : 0);
/**
 * The bands' dots, out at RAILS, as the rails' come in, at once, as the Trains go back on their rails there and the
 * Lines' names switch (main.ts's FADE): a Train standing at a Station stays on its dot or mark.
 */
const onBands = (zoom: number) => ramp(zoom, RAILS - 0.01, 1, RAILS, 0);
/** The bars, out over the first half zoom the Lines slide onto the rails over, as they'd be too long for the Lines sliding together. */
const barBands = (zoom: number) => ramp(zoom, RAILS - 1, 1, RAILS - 0.5, 0);
/** Under `snap`, a place's mark or an interchange's badge gives way on the rails to its Stations' on their tracks. */
const onRailsOut = (zoom: number) => (has('snap') ? onBands(zoom) : 1);
/** Whether each Station's dot is drawn on its own track zoomed in, rather than its place's: `snap`, and an interchange's under `capsule`. */
const onRails = () => has('snap') || has('capsule');
/** Whether an interchange's Stations, and a place's several, are linked on the rails: under `capsule`, and under `snap` with `badge`, as the badge goes there. */
const links = () => has('capsule') || (has('snap') && has('badge'));

/** Sets the variants up on the map, once main.ts has its Stations' and Trains' layers. */
export function setUp(on: MapLibreMap, reading: () => State, looking: Looks) {
  [map, read, looks] = [on, reading, looking];
  // For the screenshots' script: the map, as `window.map` is the #map div.
  if (import.meta.env.DEV) Object.assign(window, { __map: map });
  if (!parts.size) return;
  const { nameColour, dotRing, halo } = looks;
  for (const id of ['v-places', 'v-stations', 'v-interchanges', 'v-capsules']) map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  /** A dot's radius at a zoom, by the place's tier. */
  const dotRadius = (px: number): ExpressionSpecification => ['+', px, ['get', 'larger']];
  const symbol = { 'icon-allow-overlap': true, 'icon-ignore-placement': true } as const;
  if (has('small')) map.setPaintProperty('stations', 'circle-radius', byZoom([[7, 1], [10, 1.75], [12, 4], [14, 5]], (px) => ['+', px, ['get', 'larger']]));
  // `capsule`: its casing under the dots, its white over their rings, so that it's one white shape, joining its places'
  // dots on the bands; on the rails, where it would be as long as its Stations are apart, a thin link between their
  // dots on their tracks, switching where the Lines go back on them.
  if (links()) {
    const width = (more: number) => byZoom(DOT, (px, zoom) => ['case', ['==', ['get', 'on'], 'rails'], 2 + more * atZoom(RING, zoom), ['+', ['*', 2, dotRadius(px)], more * atZoom(RING, zoom)]]);
    const shown: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], RAILS - 0.01, ['case', ['==', ['get', 'on'], 'bands'], 1, 0], RAILS, ['case', ['==', ['get', 'on'], 'bands'], 0, 1]];
    map.addLayer({ id: 'v-capsule-casing', type: 'line', source: 'v-capsules', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': dotRing, 'line-width': width(2), 'line-opacity': shown } }, 'stations');
    map.addLayer({ id: 'v-capsule', type: 'line', source: 'v-capsules', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': width(0), 'line-opacity': shown } }, 'trains');
  }
  // `square`: the top tier's rounded square, SQUARE times as large as its dot with its ring.
  if (has('square')) {
    image('v-square', 20, 20, (c) => {
      c.beginPath();
      c.roundRect(2, 2, 16, 16, 4);
      c.fillStyle = '#fff';
      c.fill();
      c.lineWidth = 2;
      // The nameboard's ink on both basemaps, as #212's board heading is: the names' light blue would barely ring white on dark.
      c.strokeStyle = has('red') ? RED : BOARD_INK;
      c.stroke();
    });
  }
  /** Each feature's size at a whole zoom (`s7`…), of its image's, and the zooms between. */
  const sized = ['interpolate', ['linear'], ['zoom'], ...OFFSET_ZOOMS.flatMap((zoom) => [zoom, ['get', `s${zoom}`]])] as ExpressionSpecification;
  // `snap` and `bar`: on the bands, each Station's dot, square or bar beside its band's centreline, as far right of it as
  // the middle of its Lines' strokes, turned with it, as the strokes are: a layer for each band, as the Lines have.
  if (has('snap') || has('bar')) {
    BANDS.forEach((_, band) => {
      const [minzoom, maxzoom] = bandZooms(band);
      map?.addLayer(
        {
          id: `v-bands-${band}`,
          type: 'symbol',
          source: 'v-stations',
          minzoom,
          maxzoom: Math.min(maxzoom, RAILS),
          filter: ['==', ['get', 'band'], band],
          layout: {
            ...symbol,
            'icon-image': ['get', 'image'],
            'icon-rotate': ['get', 'heading'],
            'icon-rotation-alignment': 'map',
            'icon-size': sized,
            'icon-offset': ['interpolate', ['linear'], ['zoom'], ...OFFSET_ZOOMS.flatMap((zoom) => [zoom, ['array', 'number', 2, ['get', `o${zoom}`]]])] as ExpressionSpecification,
          },
          paint: { 'icon-opacity': opacity([few, has('bar') ? barBands : onBands, (zoom) => 1 - signIn(zoom)]) },
        },
        'trains',
      );
    });
  }
  // On the rails, each Station's dot, square or mark on its own track, over the links.
  if (onRails()) {
    map.addLayer(
      {
        id: 'v-rails',
        type: 'symbol',
        source: 'v-stations',
        filter: ['==', ['get', 'band'], -1],
        minzoom: RAILS - 0.01,
        layout: { ...symbol, 'icon-image': ['get', 'image'], 'icon-size': sized },
        paint: { 'icon-opacity': opacity([(zoom) => 1 - onBands(zoom)]) },
      },
      'trains',
    );
  }
  // The top tier's squares at their places, where `snap` doesn't draw them on their Lines, nor `bar` on the bands.
  if (has('square') && !has('snap')) {
    map.addLayer(
      {
        id: 'v-squares',
        type: 'symbol',
        source: 'v-places',
        filter: ['==', ['get', 'larger'], 2],
        layout: { ...symbol, 'icon-image': 'v-square', 'icon-size': byZoom(DOT, (_, zoom) => squareSize(zoom)) },
        paint: { 'icon-opacity': opacity([(zoom) => 1 - signIn(zoom), (zoom) => (has('bar') ? 1 - barBands(zoom) : 1)]) },
      },
      'trains',
    );
  }
  // `sign` and `badge`: the marks, from SIGN_ZOOM, over the Trains' dots, which are pills by then, and under the names.
  if (has('sign')) {
    map.addLayer(
      {
        id: 'v-signs',
        type: 'symbol',
        source: 'v-places',
        minzoom: SIGN_ZOOM - 0.5,
        filter: ['!', ['get', 'inBadge']],
        layout: { ...symbol, 'icon-image': ['get', 'sign'], 'icon-size': byZoom(SIGN_SIZE, (px) => px) },
        paint: { 'icon-opacity': opacity([signIn]) },
      },
      'station-names',
    );
    if (has('badge')) {
      map.addLayer(
        {
          id: 'v-badges',
          type: 'symbol',
          source: 'v-interchanges',
          minzoom: SIGN_ZOOM - 0.5,
          layout: {
            ...symbol,
            'icon-image': ['get', 'badge'],
            'icon-size': byZoom(SIGN_SIZE, (px) => px),
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Bold'],
            'text-size': 12,
            'text-anchor': 'top',
            'text-offset': byZoom(SIGN_SIZE, (px) => ['literal', [0, (px * (MARK + 2 * BADGE_PAD)) / 2 / 12 + 0.15]]),
            'text-max-width': 10,
            'text-optional': true,
          },
          paint: { 'icon-opacity': opacity([signIn, onRailsOut]), 'text-opacity': opacity([signIn, onRailsOut]), 'text-color': nameColour, 'text-halo-color': halo, 'text-halo-width': 2.5 },
        },
        'station-names',
      );
      // Its places' names give way to the badge's from SIGN_ZOOM; under `snap`, the interchange's comes back beside its track on the rails.
      map.setFilter('station-names', ['all', map.getFilter('station-names') ?? true, ['any', ['<', ['zoom'], ['coalesce', ['get', 'until'], 99]], ['>=', ['zoom'], has('snap') ? RAILS : 99]]] as FilterSpecification);
    }
  }
  // `board`: the top tier's names white on the nameboard's ink, in a box fitted to them; the rest as today.
  if (has('board')) {
    image(
      'v-board',
      24,
      24,
      (c) => {
        c.beginPath();
        c.roundRect(0, 0, 24, 24, BOARD_RADIUS);
        c.fillStyle = BOARD_INK;
        c.fill();
      },
      { stretchX: [[8 * ratio, 16 * ratio]], stretchY: [[8 * ratio, 16 * ratio]], content: [6 * ratio, 6 * ratio, 18 * ratio, 18 * ratio] },
    );
    map.setLayoutProperty('station-names', 'icon-image', ['case', ['to-boolean', ['get', 'board']], 'v-board', '']);
    map.setLayoutProperty('station-names', 'icon-text-fit', 'both');
    map.setLayoutProperty('station-names', 'icon-text-fit-padding', [BOARD_Y, BOARD_X, BOARD_Y, BOARD_X]);
    map.setPaintProperty('station-names', 'text-color', ['case', ['to-boolean', ['get', 'board']], '#fff', nameColour]);
    map.setPaintProperty('station-names', 'text-halo-width', ['case', ['to-boolean', ['get', 'board']], 0, 2.5]);
  }
  draw();
}

/**
 * The places as main.ts tiers them, with what the variants change of their names: under `capsule` and `badge`, an
 * interchange's named once, by the place of the highest tier among its places, and under `badge` by its badge from
 * SIGN_ZOOM; under `board`, the top tier's lettered white on ink.
 */
export function tiered<T extends Tiered>(places: T[]): T[] {
  placesNow = places;
  interchanges = has('capsule') || has('badge') ? interchangesOf(places) : [];
  const named = new Map(interchanges.map((i) => [i.named.id, i]));
  const member = new Set(interchanges.flatMap((i) => i.places.map((p) => p.id)));
  const out = places.map((p) => {
    const style = { ...p.style, ...(has('board') && p.larger === 2 && { board: true }), ...(has('badge') && member.has(p.id) && { until: SIGN_ZOOM }) };
    const i = named.get(p.id);
    if (i) return { ...p, name: i.name, nameZoom: Math.min(...i.places.map((q) => q.nameZoom)), style: { ...style, bold: i.places.some((q) => q.style.bold), size: Math.max(...i.places.map((q) => q.style.size)) } };
    if (member.has(p.id)) return { ...p, nameZoom: 99, style };
    return { ...p, style };
  });
  draw();
  return out;
}

/** A name's size for laying it out beside its track (names.ts): under `board`, its box's. */
export function nameSize(id: string, [width, height]: [number, number]): [number, number] {
  return has('board') && placesNow.find((p) => p.id === id)?.larger === 2 ? [width + 2 * BOARD_X, height + 2 * BOARD_Y] : [width, height];
}

/**
 * How much larger than a dot of the smallest tier a place is drawn at a zoom, in px, for its name to clear it: from
 * SIGN_ZOOM (MapLibre lays names out at whole zooms, for up to the next), a mark half as wide as it is; and a reversed-out
 * name's box reaches BOARD_Y nearer it.
 */
export function larger(id: string, px: number, zoom: number): number {
  const place = placesNow.find((p) => p.id === id);
  let more = px;
  if (has('sign') && place && zoom + 1 >= SIGN_ZOOM) more = Math.max(more, (atZoom(SIGN_SIZE, zoom + 1) * markWidth(place.networks)) / 2 - atZoom(DOT, zoom + 1));
  if (has('board') && place?.larger === 2) more += BOARD_Y;
  // The square reaches a fifth further than the dot across, and its rounded corners a little more.
  if (has('square') && place?.larger === 2 && !(has('sign') && zoom + 1 >= SIGN_ZOOM)) more += 0.4 * (atZoom(DOT, zoom + 1) + 2 + atZoom(RING, zoom + 1));
  return more;
}

/**
 * Once a day's track or Trips are shown: the Stations' places on their Lines (`snap`, `bar`, `capsule`), from the days
 * with Trips main.ts has, which may have come before the track they share, and one board for each interchange.
 */
export function shown(_days: Track | Bundle) {
  draw();
}

/** What a tap opens: a mark's or badge's place, or an interchange's board for any of its places; or nothing of the variants'. */
export function tap(near: (layer: string) => unknown): unknown {
  if (!map || !parts.size) return undefined;
  // The variants' marks first, and under `snap` and `bar`, a Station's dot or bar where they draw it, off its place's.
  const hit = ['v-badges', 'v-signs', 'v-squares', 'v-rails', ...BANDS.map((_, band) => `v-bands-${band}`)]
    .filter((id) => map?.getLayer(id))
    .map(near)
    .find((id) => id !== undefined) ?? near('stations');
  return interchanges.find((i) => i.places.some((p) => p.id === hit))?.id ?? hit;
}

/** Draws what the variants draw from the places, their Stations' calls and the interchanges, once the map's set up. */
function draw() {
  if (!map || !parts.size || !placesNow.length) return;
  const began = performance.now();
  const state = read();
  // One board for each interchange, as one place listing all its places' Stations.
  for (const i of interchanges) state.places.set(i.id, { id: i.id, name: i.name, stations: i.places.flatMap((p) => p.stations), networks: i.networks, lon: i.lon, lat: i.lat });
  const inBadge = new Set(has('badge') ? interchanges.flatMap((i) => i.places.map((p) => p.id)) : []);
  const networks = new Map(state.networks.map((n) => [n.id, n]));
  fewer = placesNow.filter((p) => p.larger === 0 && p.networks.length && p.networks.every((n) => (networks.get(n)?.pillZoom ?? 0) >= 12)).map((p) => p.id);
  if (import.meta.env.DEV) Object.assign(window, { __fewer: fewer });
  BANDS.forEach((_, band) => map?.getLayer(`v-bands-${band}`) && map.setPaintProperty(`v-bands-${band}`, 'icon-opacity', opacity([few, has('bar') ? barBands : onBands, (zoom) => 1 - signIn(zoom)])));
  map.getSource<GeoJSONSource>('v-places')?.setData({
    type: 'FeatureCollection',
    features: placesNow.map((p) => ({ type: 'Feature', properties: { id: p.id, larger: p.larger, inBadge: inBadge.has(p.id), sign: has('sign') ? signImage(p.networks, networks) : '' }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
  });
  map.getSource<GeoJSONSource>('v-interchanges')?.setData({
    type: 'FeatureCollection',
    features: interchanges.map((i) => ({ type: 'Feature', properties: { id: i.id, name: i.name, badge: has('badge') ? badgeImage(i.networks, networks) : '' }, geometry: { type: 'Point', coordinates: [i.lon, i.lat] } })),
  });
  const stations = state.bundle ? stationsOn(state.bundle, state, networks) : [];
  // Under `capsule` alone, only an interchange's Stations, and a place's several, go on their tracks zoomed in.
  const joined = new Set([...interchanges.flatMap((i) => i.places), ...placesNow.filter((p) => p.stations.length > 1)].map((p) => p.id));
  const placed = new Set(stations.map((s) => s.place));
  map.getSource<GeoJSONSource>('v-stations')?.setData({ type: 'FeatureCollection', features: stations.flatMap((s) => s.features.filter((f) => f.properties?.band !== -1 || has('snap') || joined.has(s.place))) });
  if (links()) {
    const rails = new Map(stations.flatMap((s) => (s.rails ? [[s.id, s.rails]] : [])));
    const groups = [...interchanges.map((i) => i.places), ...placesNow.filter((p) => p.stations.length > 1 && !interchanges.some((i) => i.places.includes(p))).map((p) => [p])];
    const capsule = (points: Point[], larger: number, on: 'bands' | 'rails'): GeoJSON.Feature[] => (points.length > 1 ? [{ type: 'Feature', properties: { larger, on }, geometry: { type: 'LineString', coordinates: inLine(points) } }] : []);
    map.getSource<GeoJSONSource>('v-capsules')?.setData({
      type: 'FeatureCollection',
      features: groups.flatMap((places) => {
        const larger = Math.max(...places.map((p) => p.larger));
        const tracked = places.flatMap((p) => p.stations.map((s): Point => rails.get(s) ?? [p.lon, p.lat]));
        return [...(places.length > 1 && has('capsule') ? capsule(places.map((p): Point => [p.lon, p.lat]), larger, 'bands') : []), ...capsule(tracked, larger, 'rails')];
      }),
    });
  }
  // Under `snap`, a place's mark gives way on the rails to its Stations' on their tracks.
  if (has('sign') && has('snap')) map.setPaintProperty('v-signs', 'icon-opacity', opacity([signIn, (zoom) => ['case', ['in', ['get', 'id'], ['literal', [...placed]]], onBands(zoom), 1]]));
  // Today's dots, where no part draws a place another way: they take taps wherever it's drawn.
  const today = opacity([
    few,
    () => (has('square') ? ['case', ['==', ['get', 'larger'], 2], 0, 1] : 1),
    (zoom) => 1 - signIn(zoom),
    // On the bands, `snap` and `bar` draw each Station on its Lines, and on the rails, `snap` on its track, and `capsule`
    // a place it joins: today's dot only where they draw none, as for a place with no Trips today.
    (zoom) => {
      if (has('snap')) return ['case', ['in', ['get', 'id'], ['literal', [...placed]]], 0, 1];
      const capsuled: ExpressionSpecification = ['case', ['in', ['get', 'id'], ['literal', [...joined]]], has('capsule') ? onBands(zoom) : 1, 1];
      return ['case', ['in', ['get', 'id'], ['literal', [...placed]]], ['*', has('bar') ? 1 - barBands(zoom) : 1, capsuled], 1];
    },
  ]);
  map.setPaintProperty('stations', 'circle-opacity', today);
  map.setPaintProperty('stations', 'circle-stroke-opacity', today);
  // For the measures' script: how long each drawing took the main thread.
  if (import.meta.env.DEV) performance.measure('v-draw', { start: began });
}

/** The places of several Networks within INTERCHANGE of each other and sharing a word of their names, and each place several Networks serve, as interchanges. */
function interchangesOf(places: Tiered[]): Interchange[] {
  const words = (name: string) => new Set(name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !COMMON.has(w)));
  const metres = (a: Tiered, b: Tiered) => Math.hypot((a.lon - b.lon) * 111_195 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 111_195);
  const parent = new Map(places.map((p) => [p.id, p.id]));
  const root = (id: string): string => (parent.get(id) === id ? id : root(parent.get(id) ?? id));
  const named = places.map((p) => ({ p, words: words(p.name) }));
  // ponytail: every pair, 120,000 for Catalonia's 491 places, once per track. File them by cell, as names.ts files tracks, if Spain's are many more.
  for (const [i, a] of named.entries()) {
    for (const b of named.slice(i + 1)) {
      if (a.p.networks.some((n) => b.p.networks.includes(n)) || metres(a.p, b.p) > INTERCHANGE || ![...a.words].some((w) => b.words.has(w))) continue;
      parent.set(root(a.p.id), root(b.p.id));
    }
  }
  const groups = new Map<string, Tiered[]>();
  for (const p of places) groups.set(root(p.id), [...(groups.get(root(p.id)) ?? []), p]);
  return [...groups.values()].flatMap((g, k) => {
    // Named by the place of the highest tier, the most Stations, then the shortest name, without "Barcelona", as people say it.
    const named = g.toSorted((a, b) => a.nameZoom - b.nameZoom || b.stations.length - a.stations.length || a.name.length - b.name.length)[0];
    const networks = [...new Set(g.flatMap((p) => p.networks))].sort((a, b) => rank(a) - rank(b));
    if (!named || networks.length < 2) return [];
    return [{ id: `interchange:${k}`, name: named.name.replace(/^Barcelona\s*-?\s*/, ''), places: g, named, networks, lon: g.reduce((s, p) => s + p.lon, 0) / g.length, lat: g.reduce((s, p) => s + p.lat, 0) / g.length }];
  });
}

/** Where a Network's mark goes among others, by ORDER, then by its ID. */
const rank = (network: string) => (ORDER.includes(network) ? ORDER.indexOf(network) : ORDER.length);

/** Points in a line, in the order they lie along the line joining the two furthest apart, for a capsule along them. */
function inLine(points: Point[]): Point[] {
  let [a, b]: [Point, Point] = [points[0] ?? [0, 0], points[1] ?? [0, 0]];
  for (const p of points) for (const q of points) if (Math.hypot(p[0] - q[0], p[1] - q[1]) > Math.hypot(a[0] - b[0], a[1] - b[1])) [a, b] = [p, q];
  const along = (p: Point) => (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  return points.toSorted((p, q) => along(p) - along(q));
}

/**
 * Each Station with Trips calling: on the bands, for each band it's drawn in, where its own Lines' strokes are, by the
 * centreline most of them are drawn along there, its heading, and how far right of it their middle is and how far they
 * spread, in line widths, as onStroke() draws a Line; and on the rails (band -1), where its Trips call on its track.
 * ponytail: by the centreline's point, not where a node's curve takes a Line across it (zones()), so in a node a
 * Station's bar or dot can be up to a line width off its Lines (ADR-0007). Take the curve's point there if that shows.
 */
function stationsOn(bundle: Bundle, { placing: { shapes, slots } }: State, all: Map<string, Network>): { id: string; place: string; rails?: Point; features: GeoJSON.Feature[] }[] {
  const calls = new Map<string, Map<string, { line: string; shape: string; dist: number }>>();
  for (const trip of bundle.trips) {
    for (const call of trip.calls) {
      const of = calls.get(call.station) ?? new Map<string, { line: string; shape: string; dist: number }>();
      of.set(`${trip.line} ${trip.shape}`, { line: trip.line, shape: trip.shape, dist: call.dist });
      calls.set(call.station, of);
    }
  }
  const placeOf = new Map(placesNow.flatMap((p) => p.stations.map((s): [string, Tiered] => [s, p])));
  const points = new Map(bundle.stations.map((s): [string, Point] => [s.id, [s.lon, s.lat]]));
  const networksOf = new Map(bundle.stations.map((s) => [s.id, s.networks ?? []]));
  return [...calls].flatMap(([station, byShape]) => {
    const place = placeOf.get(station);
    if (!place) return [];
    const own = [...byShape.values()];
    const features: GeoJSON.Feature[] = [];
    // A dot as large as today's for its tier, or the top tier's square.
    const marker = has('square') && place.larger === 2 ? { image: 'v-square', size: squareSize } : { image: dotImage(place.larger), size: (zoom: number) => (atZoom(DOT, zoom) + place.larger) / (atZoom(DOT, 14) + place.larger) };
    BANDS.forEach((_, band) => {
      const found = own.flatMap(({ line, shape, dist }) => {
        const slot = slots.get(`${line} ${shape}`)?.find((s) => s.from <= dist && dist <= s.to && drawnIn(s, band));
        return slot ? [{ slot, at: slotAt(slot, dist).at }] : [];
      });
      // The centreline most of its Lines are drawn along here.
      const counts = new Map<string, number>();
      for (const { slot } of found) counts.set(slot.on, (counts.get(slot.on) ?? 0) + 1);
      const on = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
      const centre = on === undefined ? undefined : inBand(shapes, on, band);
      if (!centre) return;
      const here = found.filter(({ slot }) => slot.on === on);
      const at = here.reduce((sum, h) => sum + h.at, 0) / here.length;
      const [east, north] = direction(centre, Math.max(0, at - 30), at + 30);
      const sides = here.map(({ slot }) => slot.side);
      const [min, max] = [Math.min(...sides), Math.max(...sides)];
      const look = has('bar') ? { image: barImage(Math.round((max - min) * 2)), size: (zoom: number) => atZoom(WIDTH, zoom) / REF } : marker;
      // How far right of the centreline, in the image's px, which its size scales.
      const offsets = Object.fromEntries(OFFSET_ZOOMS.map((zoom) => [`o${zoom}`, [((min + max) / 2) * (atZoom(APART, zoom) / look.size(zoom)), 0]]));
      features.push({ type: 'Feature', properties: { band, id: place.id, place: place.id, larger: place.larger, heading: (Math.atan2(east, north) * 180) / Math.PI, image: look.image, ...sizes(look.size), ...offsets }, geometry: { type: 'Point', coordinates: pointAt(centre, at) } });
    });
    // On the rails: where its Trips call on their tracks, the one of those nearest its own point.
    const own_ = points.get(station);
    const near = (p: Point) => (own_ ? Math.hypot(p[0] - own_[0], p[1] - own_[1]) : 0);
    const rails = own
      .flatMap(({ shape, dist }) => {
        const s = shapes.get(shape);
        return s ? [pointAt(s, dist)] : [];
      })
      .filter((p) => p.every(Number.isFinite))
      .toSorted((a, b) => near(a) - near(b))[0];
    // Under `sign`, its own Network's mark, as on the bands its place's.
    const onTrack = has('sign') ? { image: signImage(networksOf.get(station) ?? place.networks, all), size: (zoom: number) => atZoom(SIGN_SIZE, zoom) } : marker;
    if (rails) features.push({ type: 'Feature', properties: { band: -1, id: place.id, place: place.id, larger: place.larger, image: onTrack.image, ...sizes(onTrack.size) }, geometry: { type: 'Point', coordinates: rails } });
    return [{ id: station, place: place.id, rails, features }];
  });
}

/** A feature's size at each of OFFSET_ZOOMS, as `s7`…, which `sized` reads. */
const sizes = (size: (zoom: number) => number) => Object.fromEntries(OFFSET_ZOOMS.map((zoom) => [`s${zoom}`, size(zoom)]));

/** Draws an image `w`×`h` px and adds it to the map as `id`, once. */
function image(id: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void, options: object = {}): string {
  if (!map || map.hasImage(id)) return id;
  const canvas = document.createElement('canvas');
  [canvas.width, canvas.height] = [Math.ceil(w * ratio), Math.ceil(h * ratio)];
  const c = canvas.getContext('2d');
  if (!c) return id;
  c.scale(ratio, ratio);
  paint(c);
  map.addImage(id, c.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: ratio, ...options });
  return id;
}

/** A dot as today's, at zoom 14's size for its tier, for `snap`. */
function dotImage(larger: number): string {
  const [r, ring] = [atZoom(DOT, 14) + larger, atZoom(RING, 14)];
  const size = 2 * (r + ring) + 2;
  return image(`v-dot-${larger}`, size, size, (c) => {
    c.beginPath();
    c.arc(size / 2, size / 2, r + ring / 2, 0, 2 * Math.PI);
    c.fillStyle = '#fff';
    c.fill();
    c.lineWidth = ring;
    c.strokeStyle = looks.dotRing;
    c.stroke();
  });
}

/** FGC's bar across Lines spreading `half` half line widths, in the names' ink, edged in the halo, at zoom 14's size. */
function barImage(half: number): string {
  const length = (half / 2 + 1) * REF + 2;
  return image(`v-bar-${half}`, length + 2, BAR + 2, (c) => {
    c.beginPath();
    c.roundRect(1, 1, length, BAR, BAR / 2);
    c.fillStyle = looks.nameColour;
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = looks.halo;
    c.stroke();
  });
}

/** A Network's mark's letters. */
const lettersOf = (network: string, networks?: Map<string, Network>) => MARKS[network] ?? (networks?.get(network)?.name ?? network).charAt(0).toUpperCase();
/** How wide a mark is, in px at its full size: a disc for a letter, longer for more. */
const markWidthOf = (letters: string) => MARK + (letters.length - 1) * 6;
/** How wide the marks of these Networks are side by side, in px at their full size. */
function markWidth(networks: string[]): number {
  return networks.reduce((sum, n, i) => sum + markWidthOf(lettersOf(n)) + (i ? 2 : 0), 0);
}

/** Draws each Network's mark side by side from `x`, their middles at `y`. */
function marks(c: CanvasRenderingContext2D, networks: string[], all: Map<string, Network>, x: number, y: number) {
  for (const network of networks) {
    const letters = lettersOf(network, all);
    const colour = all.get(network)?.colour ?? '#666666';
    const w = markWidthOf(letters);
    c.beginPath();
    c.roundRect(x + MARK_RING / 2, y - MARK / 2 + MARK_RING / 2, w - MARK_RING, MARK - MARK_RING, (MARK - MARK_RING) / 2);
    c.fillStyle = has('filled') ? colour : '#fff';
    c.fill();
    c.lineWidth = MARK_RING;
    c.strokeStyle = has('filled') ? '#fff' : colour;
    c.stroke();
    c.fillStyle = has('filled') ? (contrast(colour, '#111111') > contrast(colour, '#ffffff') ? '#111111' : '#ffffff') : lettering(colour, '#ffffff');
    c.font = `bold ${letters.length > 1 ? MARK_TEXT - 1 : MARK_TEXT + 0.5}px "Nunito Sans"`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(letters, x + w / 2, y + 0.5);
    x += w + 2;
  }
}

/** A place's mark, or its Networks' side by side, for `sign`. */
function signImage(networks: string[], all: Map<string, Network>): string {
  const sorted = networks.toSorted((a, b) => rank(a) - rank(b));
  return image(`v-sign-${sorted.join('+')}`, markWidth(sorted) + 2, MARK + 2, (c) => marks(c, sorted, all, 1, (MARK + 2) / 2));
}

/** An interchange's badge: its Networks' marks side by side in a white rounded box ringed as the dots are, for `badge`. */
function badgeImage(networks: string[], all: Map<string, Network>): string {
  const [w, h] = [markWidth(networks) + 2 * BADGE_PAD, MARK + 2 * BADGE_PAD];
  return image(`v-badge-${networks.join('+')}`, w + 2, h + 2, (c) => {
    c.beginPath();
    c.roundRect(1, 1, w, h, h / 2);
    c.fillStyle = '#fff';
    c.fill();
    c.lineWidth = BADGE_RING;
    c.strokeStyle = looks.dotRing;
    c.stroke();
    marks(c, networks, all, 1 + BADGE_PAD, 1 + h / 2);
  });
}
