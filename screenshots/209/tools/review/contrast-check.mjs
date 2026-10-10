// Review of #209: the Lines under 3:1 on white, re-derived with my own WCAG maths (not colour.ts), and
// lettering()'s darkened colours checked against it, then compared with the build's table in notes.md.
import { readFileSync } from 'node:fs';
const W = new URL('..', import.meta.url).pathname;
const track = JSON.parse(readFileSync(`${W}live/days/track-ea0eeb528cfe.json`, 'utf8'));
const { lettering } = await import(`${W}../wt-209/src/web/colour.ts`);
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const L = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const CAT = new Set(['rodalies', 'fgc', 'metro', 'tram']);
const all = track.lines.map((l) => ({ ...l, cat: CAT.has(l.network), on: ratio(l.colour, '#ffffff') }));
const under = all.filter((l) => l.on < 3);
const cat = all.filter((l) => l.cat);
console.log(`Lines ${all.length}: Catalonia ${cat.length} (${under.filter((l) => l.cat).length} under 3:1), beyond ${all.length - cat.length} (${under.filter((l) => !l.cat).length} under 3:1)`);
const lettered = under.map((l) => ({ name: l.name, network: l.network, colour: l.colour, on: l.on, to: lettering(l.colour, '#ffffff') })).map((r) => ({ ...r, after: ratio(r.to, '#ffffff') }));
const after = lettered.map((r) => r.after);
console.log(`after lettering on #ffffff: min ${Math.min(...after).toFixed(3)}, max ${Math.max(...after).toFixed(3)}; Catalonia: min ${Math.min(...lettered.filter((r) => CAT.has(r.network)).map((r) => r.after)).toFixed(3)} max ${Math.max(...lettered.filter((r) => CAT.has(r.network)).map((r) => r.after)).toFixed(3)}`);
// Compare with notes.md's table, row by row (Line, colour, before, lettered, after).
const notes = readFileSync(`${W}notes.md`, 'utf8');
const rows = [...notes.matchAll(/^\s*\| (\S+) \| (\S+) \| `(#[0-9A-Fa-f]{6})` \| ([\d.]+) \| `(#[0-9a-f]{6})` \| ([\d.]+) \|$/gm)];
let bad = 0;
for (const [, name, , colour, before, to, aft] of rows) {
  const mine = lettered.find((r) => r.name === name && r.colour === colour && CAT.has(r.network));
  const ok = mine && mine.on.toFixed(1) === before && mine.to === to && mine.after.toFixed(1) === aft;
  if (!ok) { bad++; console.log('MISMATCH', name, colour, before, to, aft, mine && [mine.on.toFixed(2), mine.to, mine.after.toFixed(2)]); }
}
console.log(`notes.md table rows: ${rows.length}, mismatches: ${bad}`);
const missing = lettered.filter((r) => CAT.has(r.network) && !rows.some(([, n, , c]) => n === r.name && c === r.colour));
console.log('Catalan Lines under 3:1 missing from notes.md:', missing.map((r) => r.name));
// Lines between 3 and 4.5 in Catalonia, which `letter` also darkens (it darkens to 4.5, not 3).
const mid = all.filter((l) => l.cat && l.on >= 3 && l.on < 4.5).sort((a, b) => a.on - b.on);
console.log(`Catalan Lines 3–4.5:1 on white (also darkened by letter): ${mid.length}:`, mid.map((l) => `${l.name} ${l.on.toFixed(2)}`).join(', '));
console.log('Beyond Catalonia under 3:1:', lettered.filter((r) => !CAT.has(r.network)).map((r) => `${r.name}/${r.network} ${r.on.toFixed(2)}→${r.after.toFixed(2)}`).join('; '));
