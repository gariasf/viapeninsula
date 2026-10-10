// #210 review: how far today's dots sit from their Lines, re-derived: for each place of several Stations (a Metro place
// of several Lines), from its dot (the middle of its Stations) to where each of its Lines is drawn at its Station's call
// on the bands at z14 (the app's onStroke(), no running side), and on the rails at z16: to its Lines' calls there, to
// the nearest point of its own Lines' tracks, and to the nearest point of any traced track. And Passeig de Gràcia's
// Rodalies Station from R2's tracks. `node rev-offsets.ts`.
import { readFileSync } from 'node:fs';
import { onStroke, pixelMetres, pointAt, zones, type Shape, type Slot, type Track, type Trip } from '../wt-210/src/bundle.ts';
const here = new URL('.', import.meta.url).pathname;
const track: Track = JSON.parse(readFileSync(`${here}live/days/track-catalonia-7fe9f856832c.json`, 'utf8'));
const { trips }: { trips: Trip[] } = JSON.parse(readFileSync(`${here}live/days/2026-10-10-catalonia-a7bf333ea74d.json`, 'utf8'));
const shapes = new Map<string, Shape>(track.shapes.map((s) => [s.id, s]));
const slots = new Map<string, Slot[]>();
for (const s of track.slots ?? []) slots.set(`${s.line} ${s.shape}`, [...(slots.get(`${s.line} ${s.shape}`) ?? []), s]);
const curves = zones(track.strokes);
type P = [number, number];
// Metres on a local plane, which is exact enough within a few km.
const xy = (p: P, lat0: number): P => [p[0] * 111_195 * Math.cos((lat0 * Math.PI) / 180), p[1] * 111_195];
const metres = (a: P, b: P) => Math.hypot(...(xy(a, a[1]).map((v, i) => v - xy(b, a[1])[i]) as P));
/** The nearest point of a polyline to p, in metres. */
function toLine(p: P, coords: P[]): number {
  const o = xy(p, p[1]);
  let best = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const [a, b] = [xy(coords[i - 1], p[1]), xy(coords[i], p[1])];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const t = Math.max(0, Math.min(1, ((o[0] - a[0]) * dx + (o[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(a[0] + t * dx - o[0], a[1] + t * dy - o[1]));
  }
  return best;
}
// The calls: each Station's Lines and shapes, at how far along.
const calls = new Map<string, { line: string; shape: string; dist: number }[]>();
for (const t of trips) for (const c of t.calls) if (!calls.get(c.station)?.some((x) => x.line === t.line && x.shape === t.shape)) calls.set(c.station, [...(calls.get(c.station) ?? []), { line: t.line, shape: t.shape, dist: c.dist }]);
const byPlace = new Map<string, typeof track.stations>();
for (const s of track.stations) byPlace.set(s.place ?? s.id, [...(byPlace.get(s.place ?? s.id) ?? []), s]);
const traced = track.shapes.filter((s) => !s.id.startsWith('stretch') && !s.id.includes('@'));
const rows = [];
for (const [, stations] of byPlace) {
  if (stations.length < 2) continue;
  const dot: P = [stations.reduce((a, s) => a + s.lon, 0) / stations.length, stations.reduce((a, s) => a + s.lat, 0) / stations.length];
  const own = stations.flatMap((s) => calls.get(s.id) ?? []);
  const drawn = own.flatMap(({ line, shape, dist }) => {
    const p = onStroke(slots.get(`${line} ${shape}`), shapes, dist, 14, 0, curves);
    return p && p.every(Number.isFinite) ? [metres(dot, p)] : [];
  });
  const z14 = Math.min(...drawn) / pixelMetres(14, dot[1]);
  const callsAt = own.flatMap(({ shape, dist }) => (shapes.has(shape) ? [metres(dot, pointAt(shapes.get(shape)!, dist))] : []));
  const ownTracks = Math.min(...[...new Set(own.map((c) => c.shape))].map((id) => toLine(dot, shapes.get(id)?.coords ?? [])));
  const anyTrack = Math.min(...traced.map((s) => toLine(dot, s.coords)));
  const px16 = (m: number) => m / pixelMetres(16, dot[1]);
  rows.push({ name: stations[0].name, z14, calls16: px16(Math.min(...callsAt)), own16: px16(ownTracks), any16: px16(anyTrack), anyM: anyTrack });
}
console.log(`${rows.length} places of several Stations`);
console.log('| Place | z14 px to its nearest Line | z16 px to its nearest call | to its own tracks | to any track (m) |\n| --- | --- | --- | --- | --- |');
for (const r of rows.sort((a, b) => b.z14 - a.z14)) console.log(`| ${r.name} | ${r.z14.toFixed(1)} | ${r.calls16.toFixed(1)} | ${r.own16.toFixed(1)} | ${r.any16.toFixed(1)} (${r.anyM.toFixed(0)} m) |`);
// Passeig de Gràcia's Rodalies Station, from the tracks of the Lines calling there.
const pdg = track.stations.find((s) => s.id === 'adif:71802')!;
const p: P = [pdg.lon, pdg.lat];
const pdgCalls = calls.get(pdg.id) ?? [];
console.log(`\nadif:71802 ${pdg.name}: Lines ${[...new Set(pdgCalls.map((c) => c.line))].join(', ')}`);
console.log(`  to its Lines' tracks ${Math.min(...[...new Set(pdgCalls.map((c) => c.shape))].map((id) => toLine(p, shapes.get(id)?.coords ?? []))).toFixed(1)} m, to their calls ${Math.min(...pdgCalls.map((c) => metres(p, pointAt(shapes.get(c.shape)!, c.dist)))).toFixed(1)} m, to any track ${Math.min(...traced.map((s) => toLine(p, s.coords))).toFixed(1)} m`);
// Places of one Station: metres from their own Lines' tracks and from where those call.
const single = [];
for (const [, stations] of byPlace) {
  if (stations.length !== 1) continue;
  const s = stations[0];
  const own = calls.get(s.id) ?? [];
  if (!own.length) continue;
  const p: P = [s.lon, s.lat];
  single.push({ name: s.name, track: Math.min(...[...new Set(own.map((c) => c.shape))].map((id) => toLine(p, shapes.get(id)?.coords ?? []))), call: Math.min(...own.map((c) => metres(p, pointAt(shapes.get(c.shape)!, c.dist)))) });
}
const med = (xs: number[]) => xs.toSorted((a, b) => a - b)[Math.floor((xs.length - 1) / 2)];
console.log(`\n${single.length} places of one Station with calls: median ${med(single.map((r) => r.track)).toFixed(1)} m off their track (${med(single.map((r) => r.call)).toFixed(1)} m from their calls); over 20 m: ${single.filter((r) => r.track > 20).length} by track, ${single.filter((r) => r.call > 20).length} by calls; worst ${single.toSorted((a, b) => b.call - a.call).slice(0, 3).map((r) => `${r.name} ${r.call.toFixed(0)} m`).join(', ')}`);
