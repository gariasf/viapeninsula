// Where a Line in a tunnel has another above it, within a line width, as the map draws it narrower and
// fainter (#417, picked on #309): a line width is a band's own, so the marks are made for each band.

import { along, APART, atZoom, BANDS, cutIn, DEGREE, drawnIn, inBand, pieces, pixelMetres, type Point, type Shape, type Stroke } from '../bundle.ts';
import { offset } from './offset.ts';

/** How often a stroke is looked at, in metres along it. */
const EVERY = 25;
/** Strokes closer to parallel than this (a cosine) run alongside each other: sideBySide()'s PARALLEL. */
const PARALLEL = Math.cos(Math.PI / 6);

type Segment = { line: string; level: number; a: [number, number]; b: [number, number] };

/**
 * The strokes, each `under` one given its `covered`: in each band it's drawn in, from where to where
 * along its shape, in whole metres, a Line above it lies within a line width of it there, alongside
 * (Stroke's `covered`). Judged every EVERY along the stroke as it's drawn in the band, cut back for
 * its curves, off its centreline by its side, and the Line above as it's drawn there too: not those
 * of the Line itself, nor one as deep, nor a track crossing it. `kx` is the metres a degree of
 * longitude is, and `latitude` the line width's, as sideBySide() draws them.
 */
export function markCovered(strokes: Stroke[], shapes: Shape[], kx: number, latitude: number): Stroke[] {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const flat = ([lon, lat]: Point): [number, number] => [lon * kx, lat * DEGREE];
  const marks = new Map<Stroke, [band: number, from: number, to: number][]>();
  for (const [band, zoom] of BANDS.entries()) {
    const width = atZoom(APART, zoom) * pixelMetres(zoom, latitude);
    // Each piece of each stroke drawn in the band, as drawn there.
    const drawn = strokes.flatMap((stroke) => {
      if (!drawnIn(stroke, band)) return [];
      const [start, end] = cutIn(stroke, band);
      const shape = inBand(byId, stroke.shape, band);
      if (!shape || start + end >= stroke.to - stroke.from) return [];
      return pieces({ ...stroke, from: stroke.from + start, to: stroke.to - end }).map((piece) => ({ stroke, piece, level: stroke.under ?? 0, points: offset(along(shape, piece.from, piece.to).map(flat), piece.side * width) }));
    });
    if (!drawn.some((d) => d.level)) continue;
    const cells = new Map<string, Segment[]>();
    for (const { stroke, level, points } of drawn) {
      for (const [i, b] of points.entries()) {
        const a = points[i - 1];
        if (!a) continue;
        for (let x = Math.floor((Math.min(a[0], b[0]) - width) / width); x <= Math.floor((Math.max(a[0], b[0]) + width) / width); x++) {
          for (let y = Math.floor((Math.min(a[1], b[1]) - width) / width); y <= Math.floor((Math.max(a[1], b[1]) + width) / width); y++) {
            const key = `${x} ${y}`;
            const segment = { line: stroke.line, level, a, b };
            cells.set(key, [...(cells.get(key) ?? []), segment]);
          }
        }
      }
    }
    for (const { stroke, piece, level, points } of drawn) {
      if (!level) continue;
      const total = points.reduce((n, p, i) => (i ? n + Math.hypot(p[0] - (points[i - 1]?.[0] ?? 0), p[1] - (points[i - 1]?.[1] ?? 0)) : 0), 0);
      if (!total) continue;
      const toShape = (m: number) => piece.from + ((piece.to - piece.from) * Math.min(m, total)) / total;
      const runs: [number, number][] = [];
      let [walked, next, open]: [number, number, number | undefined] = [0, EVERY / 2, undefined];
      const close = (m: number) => {
        if (open !== undefined) runs.push([toShape(open), toShape(m)]);
        open = undefined;
      };
      for (const [i, q] of points.entries()) {
        const p = points[i - 1];
        const length = p && Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (!p || !length) continue;
        const [ux, uy] = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
        for (; next < length; next += EVERY) {
          const [x, y] = [p[0] + ux * next, p[1] + uy * next];
          const hit = (cells.get(`${Math.floor(x / width)} ${Math.floor(y / width)}`) ?? []).some((o) => {
            if (o.line === stroke.line || o.level >= level) return false;
            const step = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]);
            if (!step) return false;
            const [vx, vy] = [(o.b[0] - o.a[0]) / step, (o.b[1] - o.a[1]) / step];
            const ahead = (x - o.a[0]) * vx + (y - o.a[1]) * vy;
            return ahead >= 0 && ahead <= step && Math.abs((x - o.a[0]) * vy - (y - o.a[1]) * vx) < width && Math.abs(ux * vx + uy * vy) >= PARALLEL;
          });
          if (hit && open === undefined) open = Math.max(0, walked + next - EVERY / 2);
          if (!hit) close(walked + next - EVERY / 2);
        }
        next -= length;
        walked += length;
      }
      close(total);
      const list = marks.get(stroke) ?? [];
      for (const [from, to] of runs) {
        const [a, b] = [Math.round(from), Math.round(to)];
        // Pieces of one stroke run on from one another, and so do their marks.
        const last = list.at(-1);
        if (last && last[0] === band && a <= last[2]) last[2] = Math.max(last[2], b);
        else if (b > a) list.push([band, a, b]);
      }
      if (list.length) marks.set(stroke, list);
    }
  }
  return strokes.map((s) => (marks.has(s) ? { ...s, covered: marks.get(s) } : s));
}
