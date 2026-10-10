import './trains.prototype.css';
import type { ExpressionSpecification, LayerSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl';
import { onStroke, pointAt, type Bundle, type Point, type Shape, type Slot, type Trip, type Zone } from '../bundle.ts';
import { trainsAt, type Received } from '../engine.ts';
import type { Shown } from './closures.ts';

/**
 * #209's variants, picked by `?trains=`, comma-separated, each trying one thing on today's map:
 * - `dash`: a Scheduled Train ringed in a dash, as SBB's map rings a Train it has no live data for, on
 *   the map and on the cards, so that Live and Scheduled read apart without colour, even zoomed out.
 * - `grey`: with `dash`, a Scheduled Train filled grey, as SBB's are, instead of the paper.
 * - `small`: the heap at zoom 10: zoomed out from 12, smaller dots and halos; `halo`: the halos only.
 * - `letter`: on the light basemap, a Line's colour darkened to 4.5:1 on white where it letters, rings
 *   a Scheduled Train and colours an arrow, as lettering() lightens it on the dark one (#316).
 * - `target`: railisland's followed Train, the size of the rest, ringed as a target, its colour pulsing
 *   out, unless the viewer prefers less motion, where its rings stand still.
 * - `under`: each Train's arrow drawn under every pill, so that none lies on another Train's pill (#156).
 * - `glow` and `trail`, on the dark basemap only: railisland's glow under a Live Train, and the trail it
 *   leaves along its track, unless the viewer prefers less motion. `pick` takes the glow, which the
 *   light basemap leaves out.
 * - `pick`: the variants recommended together (PICK).
 * In the query string, as the link's hash holds the map's own state (#208).
 * Throwaway: once the maintainer picks, a build ticket builds the pick, and this goes.
 */
const parts = new Set(new URLSearchParams(location.search).get('trains')?.split(',') ?? []);
/** The variants recommended as the pick, which `?trains=pick` turns on. */
const PICK = ['dash', 'letter', 'halo', 'under', 'target', 'glow'];
/** Whether a variant is on. */
export const has = (part: string) => parts.has(part) || (parts.has('pick') && PICK.includes(part));
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
/** Whether the viewer prefers less motion, where the target doesn't pulse and no trails are laid. */
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)');
for (const part of ['dash', 'grey']) document.documentElement.classList.toggle(`trains-${part}`, has(part));

/** How a Line's Trains are drawn as pills, as main.ts's Pill has it. */
interface Pill {
  outline: 'round' | 'pointed' | 'badge';
  lettering: string;
  box: [number, number];
  followedBox: [number, number];
}
/** What the variants read of main.ts's state as they draw. */
interface State {
  bundle?: Bundle;
  received: Received[];
  hiding: Shown[];
  placing: { shapes: Map<string, Shape>; slots: Map<string, Slot[]>; curves: Map<string, Zone[]>; keep: Map<string, number> };
  pills: Map<string, Pill>;
  railsZoom: number;
}

/** A Train's dot's radius by zoom, in px, and the followed one's, as main.ts's TRAIN_DOT. */
type Dot = [zoom: number, px: number, followed: number][];
let dots: Dot = [];
/**
 * A Train's dot's radius by zoom (TRAIN_DOT): with `small`, smaller zoomed out, where dots heap up at
 * zoom 10, up to today's at 14, though from 12 every Train is a pill; with `target`, the followed one
 * as large as the rest, as its rings mark it.
 */
export function trainDot(today: Dot): Dot {
  dots = has('small') ? [[7, 1.75, 4], [10, 2.75, 6], [12, 4, 7.5], [14, 6, 10]] : today;
  if (has('target')) dots = dots.map(([zoom, px]) => [zoom, px, px]);
  return dots;
}

/** How small `small` and `halo` draw a Live Train's halo zoomed out from 12, against today's. */
const SMALL_HALO = 0.6;
/** A Live Train's halo's radius, in px (#91), as `small` and `halo` have it zoomed out from 12. */
export const haloRadius = (px: number, zoom: number) => ((has('small') || has('halo')) && zoom < 12 ? px * SMALL_HALO : px);

/** What `grey` fills a Scheduled Train with, on each basemap. */
const GREY = dark ? '#3b414b' : '#dcdfe3';
/** How wide `dash` rings a Scheduled pill, in px, and the dashes and the gaps along it. */
const [RING, DASH, GAP] = [2, 3, 2];
/** How many dashes `dash` rings a Scheduled dot with, and how much of each step they take, and the radius of the dot their image is drawn round, in px: the largest. */
const [DOT_DASHES, DOT_DASH, DOT_RADIUS] = [8, 0.6, 10];
/** The device pixels a px of an image is drawn at. */
const ratio = Math.max(2, Math.ceil(devicePixelRatio));
/** The ring `target` draws round the followed Train, inner and outer, in px, as railisland's, and how far the pulse goes out from the outer one over PULSE ms. */
const [INNER, OUTER, OUT, PULSE] = [11, 17, 11, 1600];
/** How long a trail is, in ms of the Train's run, as railisland's 44 s, how many pieces it's drawn in, and how often the map works out where each Train was then. */
const [TRAIL, PIECES, PAST_EVERY] = [44_000, 6, 1000];

let map: MapLibreMap;
let state: () => State;
/** Where each Train was TRAIL ago, by its Trip, along its shape, in metres, and when that was worked out. */
let past = { at: -Infinity, dists: new Map<string, number>() };
/** The days' Trips by their IDs, for the days on the map. */
let trips = { of: undefined as Bundle | undefined, byId: new Map<string, Trip>() };

/** Sets the variants up on the map, once main.ts has its Trains' layers. */
export function setUp(on: MapLibreMap, read: () => State, { scheduledFill }: { scheduledFill: string }) {
  [map, state] = [on, read];
  // For the screenshots' script: the map, as `window.map` is the #map div.
  if (import.meta.env.DEV) Object.assign(window, { __map: map });
  // Each layer added from the zoom the Trains are drawn from, as main.ts's are.
  const minzoom = map.getLayer('trains')?.minzoom ?? 0;
  if (has('target')) {
    const ring = (id: string, radius: number, width: number, opacity: number): LayerSpecification => ({
      id,
      type: 'circle',
      source: 'trains',
      minzoom,
      filter: ['get', 'followed'],
      paint: { 'circle-radius': radius, 'circle-opacity': 0, 'circle-stroke-width': width, 'circle-stroke-color': ['get', 'lettering'], 'circle-stroke-opacity': opacity },
    });
    for (const layer of [ring('train-pulse', OUTER, 2, 0), ring('train-target-outer', OUTER, 2, 0.3), ring('train-target', INNER, 2.5, 0.9)]) map.addLayer(layer, 'train-pills-followed');
  }
  if (has('under')) {
    map.moveLayer('train-arrows', 'train-pills');
    map.moveLayer('train-arrows-followed', 'train-pills-followed');
  }
  if (has('dash')) {
    const live = (yes: number | ExpressionSpecification, no: number | string | ExpressionSpecification): ExpressionSpecification => ['case', ['get', 'live'], yes, no];
    const fill = has('grey') ? GREY : scheduledFill;
    // A Scheduled Train's dot loses its ring, which its dashes draw under it, and its pill loses its edge.
    map.setPaintProperty('trains', 'circle-stroke-width', ['interpolate', ['linear'], ['zoom'], 7, live(0.5, 0), 14, live(1.5, 0)]);
    map.setPaintProperty('trains', 'circle-color', live(['get', 'colour'], fill));
    for (const id of ['train-pills', 'train-pills-followed']) {
      map.setPaintProperty(id, 'icon-halo-width', live(map.getPaintProperty(id, 'icon-halo-width') as number, 0));
      map.setPaintProperty(id, 'icon-color', live(['get', 'colour'], fill));
      // On grey, lettered in the cards' ink, as SBB letters its grey Trains dark: a Line's own colour wouldn't read on it.
      if (has('grey')) map.setPaintProperty(id, 'text-color', live(['case', ['get', 'dark'], '#111', '#fff'], dark ? '#e6ecf5' : '#14305a'));
    }
    const dashes = (id: string, filter: ExpressionSpecification, image: ExpressionSpecification, size: number | ExpressionSpecification = 1): LayerSpecification => ({
      id,
      type: 'symbol',
      source: 'trains',
      minzoom,
      filter,
      layout: { 'icon-image': image, 'icon-size': size, 'icon-allow-overlap': true, 'icon-ignore-placement': true },
    });
    const scheduled: ExpressionSpecification = ['!', ['get', 'live']];
    const asPill: ExpressionSpecification = ['>=', ['zoom'], ['get', 'pillZoom']];
    // Its dot's dashes are drawn as large as its dot's radius, by zoom.
    const size: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], ...dots.flatMap(([zoom, px, followed]): (number | ExpressionSpecification)[] => [zoom, ['/', ['case', ['get', 'followed'], followed, px], DOT_RADIUS]])];
    map.addLayer(dashes('train-dot-dashes', ['all', scheduled, ['!', asPill]], ['concat', 'dash-dot ', ['get', 'lettering']], size), 'trains');
    map.addLayer(dashes('train-pill-dashes', ['all', scheduled, asPill, ['!', ['get', 'followed']]], ['concat', 'dash-pill ', ['get', 'line']]), 'train-pills');
    map.addLayer(dashes('train-pill-dashes-followed', ['all', scheduled, asPill, ['get', 'followed']], ['concat', 'dash-pill-followed ', ['get', 'line']]), 'train-pills-followed');
    // Each image as it's first asked for.
    map.setMissingStyleImageResolver((id) => {
      const [kind, key] = [id.slice(0, id.indexOf(' ')), id.slice(id.indexOf(' ') + 1)];
      const pill = state().pills.get(key);
      if (kind === 'dash-dot') map.addImage(id, dotDashes(key), { pixelRatio: ratio });
      else if (pill && (kind === 'dash-pill' || kind === 'dash-pill-followed')) map.addImage(id, pillDashes(pill, kind === 'dash-pill' ? pill.box : pill.followedBox), { pixelRatio: ratio });
    });
  }
  if (dark && has('glow')) {
    // railisland's glow: brighter than the halo, blurred right through, and from zoom 12 further out,
    // so as not to heap up zoomed out.
    map.setPaintProperty('train-halos', 'circle-radius', ['step', ['zoom'], ['get', 'haloRadius'], 12, ['*', 1.6, ['get', 'haloRadius']]]);
    map.setPaintProperty('train-halos', 'circle-blur', 1);
    map.setPaintProperty('train-halos', 'circle-opacity', 0.95);
  }
  if (dark && has('trail')) {
    map.addSource('trails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // Each piece narrower and fainter than the one ahead of it, as railisland's tapers and fades: in its
    // Line's colour, wider than its stroke, and over it a white core, as railisland's, without which a
    // trail along its own Line's stroke, in its colour, wouldn't show.
    const trail = (id: string, colour: string | ExpressionSpecification, [width, end]: number[], opacity: number, blur: number): LayerSpecification => ({
      id,
      type: 'line',
      source: 'trails',
      minzoom,
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: {
        'line-color': colour,
        'line-width': ['interpolate', ['linear'], ['get', 'f'], 0, width ?? 1, 1, end ?? 1],
        'line-opacity': ['interpolate', ['linear'], ['get', 'f'], 0, opacity, 1, 0],
        'line-blur': blur,
      },
    });
    map.addLayer(trail('train-trails', ['get', 'lettering'], [10, 3], 0.6, 3), 'train-halos');
    map.addLayer(trail('train-trails-core', '#ffffff', [2.5, 0.5], 0.7, 0.5), 'train-halos');
  }
}

/** After main.ts draws its Trains each time: pulses the followed one's ring, and lays each Live Train's trail behind it, unless the viewer prefers less motion. */
export function drew(features: GeoJSON.Feature[]) {
  if (!map || lessMotion.matches) return;
  if (has('target') && features.some((f) => f.properties?.followed)) {
    // By the clock, so that a screenshot at a fixed time shows the pulse where it is then.
    const phase = (Date.now() % PULSE) / PULSE;
    map.setPaintProperty('train-pulse', 'circle-radius', OUTER + OUT * phase);
    map.setPaintProperty('train-pulse', 'circle-stroke-opacity', 0.35 * (1 - phase));
  }
  if (dark && has('trail')) map.getSource<GeoJSONSource>('trails')?.setData({ type: 'FeatureCollection', features: trails(features) });
}

/**
 * Each Live Train's trail in view: its track from where it was TRAIL ago to where it's drawn, in
 * PIECES pieces, each placed as main.ts places Trains, on its Line's stroke zoomed out and on its rails
 * zoomed in, with `f` how far back it starts, 0 at the Train and 1 at the trail's end. None for one
 * that has stood all that while, or wasn't on the map then.
 * ponytail: where the engine had each Train TRAIL ago, given the same snapshots, worked out once a
 * second, so the trail's end moves by the second. And not for a Train a tap has moved aside (#129).
 */
function trails(features: GeoJSON.Feature[]): GeoJSON.Feature[] {
  const { bundle, received, hiding, placing, railsZoom } = state();
  if (!bundle) return [];
  const now = Date.now();
  if (Math.abs(now - past.at) > PAST_EVERY) past = { at: now, dists: new Map(trainsAt(bundle, now - TRAIL, received, hiding).map((t) => [t.trip.id, t.dist])) };
  const zoom = map.getZoom();
  const bounds = map.getBounds();
  if (trips.of !== bundle) trips = { of: bundle, byId: new Map(bundle.trips.map((t) => [t.id, t])) };
  const placed = (trip: Trip, dist: number): Point | undefined => {
    if (zoom < railsZoom) return onStroke(placing.slots.get(`${trip.line} ${trip.shape}`), placing.shapes, dist, zoom, placing.keep.get(trip.line) ?? 1, placing.curves);
    const shape = placing.shapes.get(trip.shape);
    return shape && pointAt(shape, dist);
  };
  return features.flatMap((f): GeoJSON.Feature[] => {
    const { id, live, lettering, dist: to } = f.properties ?? {};
    const trip = trips.byId.get(String(id));
    const from = past.dists.get(String(id));
    const head = f.geometry.type === 'Point' ? (f.geometry.coordinates as Point) : undefined;
    if (!live || !trip || from === undefined || typeof to !== 'number' || to - from < 1 || !head || !bounds.contains(head)) return [];
    const points = [head, ...Array.from({ length: PIECES }, (_, i) => placed(trip, to - ((to - from) * (i + 1)) / PIECES))];
    const pieces: GeoJSON.Feature[] = [];
    for (let i = 0; i < PIECES; i++) {
      const [a, b] = [points[i], points[i + 1]];
      if (!a || !b) break;
      pieces.push({ type: 'Feature', properties: { lettering, f: i / (PIECES - 1) }, geometry: { type: 'LineString', coordinates: [a, b] } });
    }
    return pieces;
  });
}

/** A Scheduled dot's ring, dashed in a colour, round a dot DOT_RADIUS px in radius, as wide as main.ts's ring is at that size: half its radius. */
function dotDashes(colour: string) {
  const width = DOT_RADIUS / 2;
  const middle = DOT_RADIUS + width / 2;
  const side = Math.ceil(2 * (DOT_RADIUS + width) + 2);
  const canvas = new OffscreenCanvas(side * ratio, side * ratio);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(ratio, ratio);
    const step = (2 * Math.PI * middle) / DOT_DASHES;
    ctx.setLineDash([step * DOT_DASH, step * (1 - DOT_DASH)]);
    ctx.lineWidth = width;
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.arc(side / 2, side / 2, middle, 0, 2 * Math.PI);
    ctx.stroke();
  }
  return imageOf(canvas, ctx);
}

/**
 * A Scheduled pill's ring, RING px wide just outside its outline, dashed in its Line's lettering: its
 * outline as main.ts's outlines draw it, stretched to a box `box` px either side of its middle and
 * above and below it, where the name it fits sits.
 */
function pillDashes({ outline, lettering }: Pill, [halfWidth, halfHeight]: [number, number]) {
  const [w, h] = [Math.ceil(2 * (halfWidth + RING) + 2), Math.ceil(2 * (halfHeight + RING) + 2)];
  const canvas = new OffscreenCanvas(w * ratio, h * ratio);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(ratio, ratio);
    ctx.translate(w / 2, h / 2);
    const shape = new Path2D();
    if (outline === 'pointed') {
      // Its ends 5 px long, to a point 2 px across, as main.ts's pointed outline.
      const [x, y] = [halfWidth - 5, halfHeight - 6.5];
      for (const [px, py] of [[-x, -halfHeight], [x, -halfHeight], [halfWidth, -y], [halfWidth, y], [x, halfHeight], [-x, halfHeight], [-halfWidth, y], [-halfWidth, -y]] as const) shape.lineTo(px, py);
      shape.closePath();
    } else shape.roundRect(-halfWidth, -halfHeight, 2 * halfWidth, 2 * halfHeight, outline === 'round' ? 6.5 : 3);
    ctx.setLineDash([DASH, GAP]);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2 * RING;
    ctx.strokeStyle = lettering;
    ctx.stroke(shape);
    // Only outside the outline, where main.ts's pill draws its edge.
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fill(shape);
  }
  return imageOf(canvas, ctx);
}

/** A canvas's pixels, as MapLibre takes an image. */
function imageOf(canvas: OffscreenCanvas, ctx: OffscreenCanvasRenderingContext2D | null) {
  return ctx?.getImageData(0, 0, canvas.width, canvas.height) ?? new ImageData(canvas.width, canvas.height);
}
