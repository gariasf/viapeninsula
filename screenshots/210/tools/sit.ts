// #210: how the places' dots sit, measured on the saved track and Trips (Catalonia, 10 Oct): how far each place's dot
// is from its own Lines' strokes on the bands (z12–z14, as onStroke() draws a Line zoomed out, with no running side),
// and from its own rails zoomed in (z16), in px at that zoom, for the places in central Barcelona and in all Catalonia.
// `node sit.ts`.
import { readFileSync } from 'node:fs';
import { onStroke, pixelMetres, places, pointAt, zones, type Shape, type Slot, type Track, type Trip } from '../wt-210/src/bundle.ts';

const here = new URL('.', import.meta.url).pathname;
const track: Track = JSON.parse(readFileSync(`${here}live/days/track-catalonia-7fe9f856832c.json`, 'utf8'));
const { trips }: { trips: Trip[] } = JSON.parse(readFileSync(`${here}live/days/2026-10-10-catalonia-a7bf333ea74d.json`, 'utf8'));
const shapes = new Map<string, Shape>(track.shapes.map((s) => [s.id, s]));
const slots = new Map<string, Slot[]>();
for (const s of track.slots) slots.set(`${s.line} ${s.shape}`, [...(slots.get(`${s.line} ${s.shape}`) ?? []), s]);
const curves = zones(track.strokes);
// Each Station's calls: by Line and shape, at how far along it.
const calls = new Map<string, Map<string, { line: string; shape: string; dist: number }>>();
for (const trip of trips) {
  for (const call of trip.calls) {
    const key = `${trip.line} ${trip.shape}`;
    const of = calls.get(call.station) ?? new Map();
    if (!of.has(key)) of.set(key, { line: trip.line, shape: trip.shape, dist: call.dist });
    calls.set(call.station, of);
  }
}
const metres = (a: [number, number], b: [number, number]) => Math.hypot((a[0] - b[0]) * 111195 * Math.cos((a[1] * Math.PI) / 180), (a[1] - b[1]) * 111195);
const CENTRE = { west: 2.115, east: 2.21, south: 41.36, north: 41.43 };
const rows: { place: string; centre: boolean; multi: boolean; z: number; px: number }[] = [];
for (const place of places(track.stations)) {
  const dot: [number, number] = [place.lon, place.lat];
  const centre = place.lon >= CENTRE.west && place.lon <= CENTRE.east && place.lat >= CENTRE.south && place.lat <= CENTRE.north;
  const own = place.stations.flatMap((s) => [...(calls.get(s)?.values() ?? [])]);
  if (!own.length) continue;
  for (const z of [10, 12, 13, 14]) {
    const at = own.flatMap(({ line, shape, dist }) => {
      const p = onStroke(slots.get(`${line} ${shape}`), shapes, dist, z, 0, curves);
      return p && p.every(Number.isFinite) ? [p] : [];
    });
    if (at.length) rows.push({ place: place.name, centre, multi: place.stations.length > 1, z, px: Math.min(...at.map((p) => metres(dot, p))) / pixelMetres(z, dot[1]) });
  }
  const rails = own.flatMap(({ shape, dist }) => (shapes.has(shape) ? [pointAt(shapes.get(shape)!, dist)] : [])).filter((p) => p.every(Number.isFinite));
  if (rails.length) rows.push({ place: place.name, centre, multi: place.stations.length > 1, z: 16, px: Math.min(...rails.map((p) => metres(dot, p))) / pixelMetres(16, dot[1]) });
}
const q = (xs: number[], f: number) => xs.toSorted((a, b) => a - b)[Math.floor((xs.length - 1) * f)] ?? NaN;
console.log('| Where | Zoom | Places | Median px | 90th | Max | Over 4 px | Over 8 px |\n| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const centre of [true, false]) {
  for (const z of [10, 12, 13, 14, 16]) {
    const px = rows.filter((r) => r.z === z && (!centre || r.centre)).map((r) => r.px);
    console.log(`| ${centre ? 'central Barcelona' : 'Catalonia'} | ${z} | ${px.length} | ${q(px, 0.5).toFixed(1)} | ${q(px, 0.9).toFixed(1)} | ${Math.max(...px).toFixed(1)} | ${px.filter((x) => x > 4).length} | ${px.filter((x) => x > 8).length} |`);
  }
}
console.log('\nCatalonia, places of one Station and of several (a Metro place of several Lines):\n\n| Zoom | One: places | Median px | 90th | Over 8 px | Several: places | Median px | Min | Max |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const z of [12, 13, 14, 16]) {
  const [one, several] = [false, true].map((multi) => rows.filter((r) => r.z === z && r.multi === multi).map((r) => r.px));
  console.log(`| ${z} | ${one.length} | ${q(one, 0.5).toFixed(1)} | ${q(one, 0.9).toFixed(1)} | ${one.filter((x) => x > 8).length} | ${several.length} | ${q(several, 0.5).toFixed(1)} | ${Math.min(...several).toFixed(1)} | ${Math.max(...several).toFixed(1)} |`);
}
for (const z of [14, 16]) {
  const worst = rows.filter((r) => r.z === z && r.centre).toSorted((a, b) => b.px - a.px).slice(0, 8);
  console.log(`worst at z${z}: ${worst.map((r) => `${r.place} ${r.px.toFixed(0)}`).join(', ')}`);
}
