// Predicts where MapLibre's line-offset folds a stroke back on itself, per zoom.
import { readFileSync, writeFileSync } from 'node:fs';
import { along } from '<repo>/src/bundle.ts';
const WIDTH = [[7, 1.5], [14, 4]], APART = [...WIDTH, [15, 0]];
const at = (stops: number[][], z: number) => { for (let i = 1; i < stops.length; i++) { const [z0, v0] = stops[i - 1], [z1, v1] = stops[i]; if (z <= z1) return z < z0 ? v0 : v0 + ((v1 - v0) * (z - z0)) / (z1 - z0); } return stops.at(-1)[1]; };
const D = 6371008.8 * Math.PI / 180;
function dp(pts: number[][], tol: number): number[][] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) { const [a, b] = stack.pop()!; let [best, idx] = [0, -1];
    const [ax, ay] = pts[a], [bx, by] = pts[b], L = Math.hypot(bx - ax, by - ay) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (ay - pts[i][1]) - (ax - pts[i][0]) * (by - ay)) / L; if (d > best) [best, idx] = [d, i]; }
    if (best > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); } }
  return pts.filter((_, i) => keep[i]);
}
export function folds(t: any, zooms: number[], opts: { simplify?: boolean; tolerance?: number } = {}) {
  const shapes = new Map(t.shapes.map((s: any) => [s.id, s]));
  const found: any[] = [];
  for (const s of t.strokes) {
    if (!s.side) continue;
    const coords = along(shapes.get(s.shape) as any, s.from, s.to);
    const lat0 = coords[0][1], kx = D * Math.cos(lat0 * Math.PI / 180);
    const raw = coords.map(([lon, lat]) => [lon * kx, lat * D]);
    for (const z of zooms) {
      const mpx = 40075016.686 * Math.cos(lat0 * Math.PI / 180) / (512 * 2 ** z);
      const pts = opts.simplify === false ? raw : dp(raw, (opts.tolerance ?? 0.375) * mpx);
      const d = s.side * at(APART, z) * mpx;
      const off = pts.map((p, i) => {
        const [a, b] = [pts[i - 1] ?? p, pts[i + 1] ?? p];
        const n = (u: number[], v: number[]) => { const L = Math.hypot(v[0] - u[0], v[1] - u[1]) || 1; return [(v[1] - u[1]) / L, -(v[0] - u[0]) / L]; };
        const [n1, n2] = [i > 0 ? n(a, p) : n(p, b), i < pts.length - 1 ? n(p, b) : n(a, p)];
        let j = [n1[0] + n2[0], n1[1] + n2[1]]; const L = Math.hypot(j[0], j[1]) || 1; j = [j[0] / L, j[1] / L];
        const miter = 1 / Math.max(0.05, j[0] * n1[0] + j[1] * n1[1]);
        return [p[0] + d * j[0] * miter, p[1] + d * j[1] * miter];
      });
      for (let i = 1; i < pts.length; i++) {
        const [ox, oy] = [off[i][0] - off[i - 1][0], off[i][1] - off[i - 1][1]], [px, py] = [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]];
        const cos = (ox * px + oy * py) / ((Math.hypot(ox, oy) * Math.hypot(px, py)) || 1);
        if (cos < Math.cos(Math.PI / 6)) found.push({ z, line: s.line, side: s.side, fold: cos < 0, lon: (pts[i][0] + pts[i - 1][0]) / 2 / kx, lat: (pts[i][1] + pts[i - 1][1]) / 2 / D, px: Math.hypot(px, py) / mpx });
      }
    }
  }
  return found;
}
if (import.meta.main) {
  const zooms = [10, 11, 12, 13, 14];
  for (const f of ['before', 'after']) {
    const t = JSON.parse(readFileSync('<repo>/.playwright-mcp/138/track-' + f + '.json', 'utf8'));
    const found = folds(t, zooms);
    console.log(f, zooms.map((z) => z + ': ' + found.filter((x) => x.z === z && x.fold).length + ' folds / ' + found.filter((x) => x.z === z).length + ' kinks').join(' | '));
    if (f === 'after') writeFileSync('<scratch>/folds-after.json', JSON.stringify(found));
    const raw = folds(t, zooms, { simplify: false });
    console.log(f + ' unsimplified', zooms.map((z) => z + ': ' + raw.filter((x) => x.z === z && x.fold).length + ' / ' + raw.filter((x) => x.z === z).length).join(' | '));
  }
}
