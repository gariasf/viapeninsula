// #209: each Line under 3:1 on white, its colour against white before and after lettering() darkens it on white (`letter`).
import { readFileSync } from 'node:fs';
import { contrast, lettering } from '../wt-209/src/web/colour.ts';
const track = JSON.parse(readFileSync(new URL('live/days/track-ea0eeb528cfe.json', import.meta.url), 'utf8'));
const names = new Map(track.networks.map((n: { id: string; name: string }) => [n.id, n.name]));
const catalonia = new Set(['rodalies', 'fgc', 'metro', 'tram']);
const rows = track.lines
  .map((l: { name: string; colour: string; network: string }) => ({ ...l, before: contrast(l.colour, '#ffffff'), after: lettering(l.colour, '#ffffff') }))
  .filter((l: { before: number }) => l.before < 3)
  .sort((a: { before: number }, b: { before: number }) => a.before - b.before);
const fmt = (r: { name: string; network: string; colour: string; before: number; after: string }) => `| ${r.name} | ${names.get(r.network)} | \`${r.colour}\` | ${r.before.toFixed(1)} | \`${r.after}\` | ${contrast(r.after, '#ffffff').toFixed(1)} |`;
const cat = rows.filter((r: { network: string }) => catalonia.has(r.network));
console.log(`${track.lines.length} Lines on the map, ${rows.length} under 3:1 on white, ${cat.length} of them in Catalonia.`);
console.log('| Line | Network | Colour | On white | Lettered | On white |\n| --- | --- | --- | --- | --- | --- |');
console.log(cat.map(fmt).join('\n'));
console.log('\nBeyond Catalonia:');
console.log(rows.filter((r: { network: string }) => !catalonia.has(r.network)).map(fmt).join('\n'));
