import { readFileSync } from 'node:fs';
import { along, APART, atZoom, BANDS, cutIn, DEGREE, drawnIn, inBand, pieces, pixelMetres, type Point } from '/Users/guillem.arias/Documents/gariasf/viapeninsula/src/bundle.ts';
import { offset } from '/Users/guillem.arias/Documents/gariasf/viapeninsula/src/build/offset.ts';
import { KX, LATITUDE } from '/Users/guillem.arias/Documents/gariasf/viapeninsula/src/build/sideBySide.ts';
const track = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));
const { shapes, strokes } = track;
const byId = new Map<string, any>(shapes.map((s: any) => [s.id, s]));
const flat = ([lon, lat]: Point): [number, number] => [lon * KX, lat * DEGREE];
const EVERY = 25, PARALLEL = Math.cos(Math.PI / 6);
const unflat = ([x, y]: number[]) => `${(y! / DEGREE).toFixed(5)},${(x! / KX).toFixed(5)}`;
for (const zoom of [12, 13, 14]) {
  const band = BANDS.indexOf(zoom);
  const width = atZoom(APART, zoom) * pixelMetres(zoom, LATITUDE);
  const lines = strokes.filter((s: any) => drawnIn(s, band)).flatMap((s: any) => {
    const [start, end] = cutIn(s, band);
    const shape = inBand(byId, s.shape, band);
    if (!shape || start + end >= s.to - s.from) return [];
    return pieces({ ...s, from: s.from + start, to: s.to - end }).map((p: any) => ({ line: s.line, level: s.under ?? 0, points: offset(along(shape, p.from, p.to).map(flat), p.side * width) }));
  });
  const cells = new Map<string, any[]>();
  for (const { line, level, points } of lines) for (const [i, b] of points.entries()) {
    const a = points[i - 1]; if (!a) continue;
    for (let x = Math.floor((Math.min(a[0], b[0]) - width) / width); x <= Math.floor((Math.max(a[0], b[0]) + width) / width); x++)
      for (let y = Math.floor((Math.min(a[1], b[1]) - width) / width); y <= Math.floor((Math.max(a[1], b[1]) + width) / width); y++) {
        const k = `${x} ${y}`; const l = cells.get(k); const e = { line, level, a, b }; if (l) l.push(e); else cells.set(k, [e]);
      }
  }
  let below = 0, all = 0; const runs: { m: number; at: string; lines: string }[] = [];
  for (const { line, level, points } of lines) {
    let next = EVERY / 2, run = 0, runAt = '', others = new Set<string>();
    const flush = () => { if (run) runs.push({ m: run, at: runAt, lines: `${line}(${level}) vs ${[...others].join(',')}` }); run = 0; others = new Set(); };
    for (const [i, q] of points.entries()) {
      const p = points[i - 1]; const length = p && Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!p || !length) continue;
      const [ux, uy] = [(q[0] - p[0]) / length, (q[1] - p[1]) / length];
      for (; next < length; next += EVERY) {
        const [x, y] = [p[0] + ux * next, p[1] + uy * next];
        let above = false, any = false;
        for (const o of cells.get(`${Math.floor(x / width)} ${Math.floor(y / width)}`) ?? []) {
          if (o.line === line || o.level === level) continue;
          const step = Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]); if (!step) continue;
          const [vx, vy] = [(o.b[0] - o.a[0]) / step, (o.b[1] - o.a[1]) / step];
          const ahead = (x - o.a[0]) * vx + (y - o.a[1]) * vy;
          if (ahead >= 0 && ahead <= step && Math.abs((x - o.a[0]) * vy - (y - o.a[1]) * vx) < width && Math.abs(ux * vx + uy * vy) >= PARALLEL) { any = true; others.add(`${o.line}(${o.level})`); if (o.level < level) above = true; }
        }
        if (any) all += EVERY; 
        if (above) { below += EVERY; run += EVERY; if (!runAt) runAt = unflat([x, y]); } else flush();
      }
      next -= length;
    }
    flush();
  }
  console.log(`zoom ${zoom}: line width ${width.toFixed(0)} m; metres of Line below another within a line width ${below}; any side ${all}`);
  runs.sort((a, b) => b.m - a.m).slice(0, 10).forEach((r) => console.log(`   ${r.m} m at ${r.at}: ${r.lines}`));
}
