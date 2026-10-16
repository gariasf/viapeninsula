// #780: per Network, pill size (px, from pill.ts at the measured name widths), glow radius, and contrast of its Live fill
// against each basemap's paper and against the other Networks' fills, from stats-light.json.
import fs from 'node:fs';
import { contrast } from '../wt-780/src/web/colour.ts';
import { boxOf } from '../wt-780/src/page/../web/pill.ts';
const SP = new URL('.', import.meta.url).pathname;
const stats = JSON.parse(fs.readFileSync(SP + 'stats-light.json', 'utf8')) as { lines: Record<string, any> }[];
const lines = new Map<string, any>();
for (const s of stats) for (const [k, v] of Object.entries(s.lines)) if (v.name) lines.set(k, v);
const PAPER = { light: '#f2f3f0', dark: '#0c0c0c' };
const DARK_STAND = { 'media-distancia-avant': '#D0D0D0' } as Record<string, string>;
const by = new Map<string, any[]>();
for (const l of lines.values()) (by.get(l.network) ?? by.set(l.network, []).get(l.network)!).push(l);
const rows = [];
for (const [net, ls] of by) {
  const ws = ls.map((l) => { const b = boxOf(l.outline, l.textW, 10); return { name: l.name, w: 2 * b[0], h: 2 * b[1], glow: Math.hypot(...b) + 4, colour: l.colour }; });
  const w = ws.map((x) => x.w).sort((a, b) => a - b), g = ws.map((x) => x.glow).sort((a, b) => a - b);
  const cl = ls.map((l) => contrast(l.colour, PAPER.light)).sort((a, b) => a - b);
  const cd = ls.map((l) => contrast(DARK_STAND[net] ?? l.colour, PAPER.dark)).sort((a, b) => a - b);
  rows.push({ net, outline: ls[0].outline, pillZoom: ls[0].pillZoom, dotZoom: ls[0].dotZoom, lines: ls.length, trains: ls.reduce((a, l) => a + l.n, 0), live: ls.reduce((a, l) => a + l.live, 0),
    w: `${w[0].toFixed(0)}–${w.at(-1)!.toFixed(0)} (median ${w[w.length >> 1].toFixed(0)})`, h: ws[0].h.toFixed(1), glow: `${g[0].toFixed(0)}–${g.at(-1)!.toFixed(0)}`,
    light: `${cl[0].toFixed(1)}–${cl.at(-1)!.toFixed(1)}`, dark: `${cd[0].toFixed(1)}–${cd.at(-1)!.toFixed(1)}`, widest: ws.sort((a, b) => b.w - a.w)[0].name });
}
console.table(rows);
// The Networks' main fills against each other.
const main = { AVE: '#81005E', Ouigo: '#E50A70', MD: '#000000', 'MD dark': '#D0D0D0', 'Cerc. Madrid C-red': '#EF2C30', Rodalies: '#F26E21' };
for (const [a, ca] of Object.entries(main)) console.log(a, Object.entries(main).map(([b, cb]) => `${b} ${contrast(ca, cb).toFixed(1)}`).join(' · '));
