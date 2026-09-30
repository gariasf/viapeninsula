// Where a Line's strokes on two of its shapes lie within 30 m of each other but are drawn apart: the Line shows twice.
import { readFileSync } from 'node:fs';
import { pointAt, direction } from '<repo>/src/bundle.ts';
const D = 6371008.8 * Math.PI / 180;
export function doubled(t: any) {
  const shapes = new Map(t.shapes.map((s: any) => [s.id, s]));
  const kx = D * Math.cos(41.4 * Math.PI / 180);
  const out = { metres: 0, spots: [] as any[] };
  for (const [line, list] of Map.groupBy(t.strokes, (s: any) => s.line)) {
    const pts: any[] = [];
    for (const s of list as any[]) {
      const shape = shapes.get(s.shape) as any;
      for (let d = s.from + 12.5; d < s.to; d += 25) {
        const [lon, lat] = pointAt(shape, d); const [dx, dy] = direction(shape, Math.max(0, d - 5), d + 5); const L = Math.hypot(dx, dy) || 1;
        pts.push({ shape: s.shape, x: lon * kx, y: lat * D, rx: dy / L, ry: -dx / L, side: s.side });
      }
    }
    const grid = Map.groupBy(pts, (p) => Math.floor(p.x / 30) + ' ' + Math.floor(p.y / 30));
    for (const p of pts) {
      let hit = false;
      for (let i = -1; i <= 1 && !hit; i++) for (let j = -1; j <= 1 && !hit; j++) for (const q of grid.get((Math.floor(p.x / 30) + i) + ' ' + (Math.floor(p.y / 30) + j)) ?? []) {
        if (q.shape === p.shape || Math.hypot(q.x - p.x, q.y - p.y) > 30) continue;
        if (Math.abs(p.rx * q.rx + p.ry * q.ry) < 0.9) continue; // alongside
        const apart = Math.abs(p.side - q.side * (p.rx * q.rx + p.ry * q.ry));
        if (apart >= 0.5) { hit = true; out.spots.push({ line, lon: p.x / kx, lat: p.y / D, apart }); }
      }
      if (hit) out.metres += 25;
    }
  }
  return out;
}
for (const f of ['before', 'after']) {
  const t = JSON.parse(readFileSync('<repo>/.playwright-mcp/138/track-' + f + '.json', 'utf8'));
  const r = doubled(t);
  const by = Map.groupBy(r.spots, (s: any) => s.line.split(':')[1]);
  console.log(f, 'Line drawn twice:', Math.round(r.metres / 2), 'm', [...by].sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([l, v]) => l + ' ' + v.length * 12).join(', '));
}
