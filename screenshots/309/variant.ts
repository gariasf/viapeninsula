// Scratch for #309: a track whose `under` strokes are cut where a Line above lies within a line width at one zoom, the cut parts marked `covered`.
import { readFileSync, writeFileSync } from 'node:fs';
import { along, APART, atZoom, BANDS, cutIn, DEGREE, drawnIn, inBand, pieces, pixelMetres, type Point } from '/Users/guillem.arias/Documents/gariasf/viapeninsula/src/bundle.ts';
import { offset } from '/Users/guillem.arias/Documents/gariasf/viapeninsula/src/build/offset.ts';
import { KX, LATITUDE } from '/Users/guillem.arias/Documents/gariasf/viapeninsula/src/build/sideBySide.ts';
const [, , input, zoomArg, output] = process.argv;
const zoom = Number(zoomArg), band = BANDS.indexOf(zoom);
const track = JSON.parse(readFileSync(input!, 'utf8'));
const byId = new Map<string, any>(track.shapes.map((s: any) => [s.id, s]));
const flat = ([lon, lat]: Point): [number, number] => [lon * KX, lat * DEGREE];
const EVERY = 25, PARALLEL = Math.cos(Math.PI / 6);
const width = atZoom(APART, zoom) * pixelMetres(zoom, LATITUDE);
type Piece = { stroke: any; s: any; points: [number, number][]; level: number; line: string };
const all: Piece[] = [];
for (const s of track.strokes) {
  if (!drawnIn(s, band)) continue;
  const [start, end] = cutIn(s, band);
  const shape = inBand(byId, s.shape, band);
  if (!shape || start + end >= s.to - s.from) continue;
  for (const p of pieces({ ...s, from: s.from + start, to: s.to - end })) all.push({ stroke: s, s: p, level: s.under ?? 0, line: s.line, points: offset(along(shape, p.from, p.to).map(flat), p.side * width) });
}
const cells = new Map<string, any[]>();
for (const { line, level, points } of all) for (const [i, b] of points.entries()) {
  const a = points[i - 1]; if (!a) continue;
  for (let x = Math.floor((Math.min(a[0], b[0]) - width) / width); x <= Math.floor((Math.max(a[0], b[0]) + width) / width); x++)
    for (let y = Math.floor((Math.min(a[1], b[1]) - width) / width); y <= Math.floor((Math.max(a[1], b[1]) + width) / width); y++) {
      const k = `${x} ${y}`, e = { line, level, a, b }; const l = cells.get(k); if (l) l.push(e); else cells.set(k, [e]);
    }
}
/** Distances along the piece's shape, [from, to], where a Line above lies within a line width. */
function coveredRuns(pc: Piece): [number, number][] {
  const { points, level, line, s } = pc;
  if (!level) return [];
  const total = points.reduce((n, p, i) => (i ? n + Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1]) : 0), 0);
  if (!total) return [];
  const runs: [number, number][] = [];
  let walked = 0, next = EVERY / 2, open: number | undefined;
  const toShape = (m: number) => s.from + ((s.to - s.from) * m) / total;
  const close = (m: number) => { if (open !== undefined) runs.push([toShape(open), toShape(Math.min(m, total))]); open = undefined; };
  for (const [i, q] of points.entries()) {
    const p = points[i - 1]; const length = p && Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!p || !length) continue;
    const [ux, uy] = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
    for (; next < length; next += EVERY) {
      const [x, y] = [p[0] + ux * next, p[1] + uy * next];
      const hit = (cells.get(`${Math.floor(x / width)} ${Math.floor(y / width)}`) ?? []).some((o) => {
        if (o.line === line || o.level >= level) return false;
        const step = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]); if (!step) return false;
        const [vx, vy] = [(o.b[0] - o.a[0]) / step, (o.b[1] - o.a[1]) / step];
        const ahead = (x - o.a[0]) * vx + (y - o.a[1]) * vy;
        return ahead >= 0 && ahead <= step && Math.abs((x - o.a[0]) * vy - (y - o.a[1]) * vx) < width && Math.abs(ux * vx + uy * vy) >= PARALLEL;
      });
      const m = walked + next;
      if (hit && open === undefined) open = Math.max(0, m - EVERY / 2);
      if (!hit) close(m - EVERY / 2);
    }
    next -= length; walked += length;
  }
  close(total);
  return runs;
}
const out: any[] = [];
let marked = 0;
for (const s of track.strokes) {
  if (!s.under || !drawnIn(s, band)) { out.push(s); continue; }
  const [start, end] = cutIn(s, band);
  const shape = inBand(byId, s.shape, band);
  if (!shape || start + end >= s.to - s.from) { out.push(s); continue; }
  // This stroke, in its pieces, resolved to this band's cut (which this track no longer needs).
  const { cut, ease, ...rest } = s;
  for (const p of pieces({ ...s, from: s.from + start, to: s.to - end })) {
    const { ease: _e, cut: _c, ...base } = p;
    const pc: Piece = { stroke: s, s: p, level: s.under, line: s.line, points: offset(along(shape, p.from, p.to).map(flat), p.side * width) };
    const runs = coveredRuns(pc);
    let at = p.from;
    for (const [a, b] of runs) {
      if (a > at) out.push({ ...base, from: at, to: a });
      out.push({ ...base, from: a, to: b, covered: true }); marked += b - a;
      at = b;
    }
    if (at < p.to) out.push({ ...base, from: at, to: p.to });
  }
}
console.log(`zoom ${zoom}: ${Math.round(marked)} m of shape marked covered, ${track.strokes.length} -> ${out.length} strokes`);
writeFileSync(output!, JSON.stringify({ ...track, strokes: out }));
