// #210 review: the name each interchange gets by the prototype's rule (the place of the highest tier, then the most
// Stations, then the shortest name, without "Barcelona"), from the tiers in main.ts. `node rev-interchange-names.mjs`.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const main = readFileSync(new URL('../wt-210/src/web/main.ts', import.meta.url), 'utf8');
const tiers = main.slice(main.indexOf('const TIERS'), main.indexOf('const UNTIERED')).split(/nameZoom: (?=\d)/).slice(1).map((block) => ({ nameZoom: +block.match(/^(\d+)/)[1], places: [...block.matchAll(/'([a-z]+:[A-Za-z0-9.:]+)'/g)].map((m) => m[1]) }));
const zoomOf = (id) => tiers.find((t) => t.places.includes(id))?.nameZoom ?? 12;
const out = execFileSync('node', [new URL('./rev-interchanges.mjs', import.meta.url).pathname], { encoding: 'utf8' });
// Re-read the groups from the places, as rev-interchanges.mjs makes them.
const track = JSON.parse(readFileSync(new URL('./live/days/track-catalonia-7fe9f856832c.json', import.meta.url), 'utf8'));
const groups = new Map();
for (const s of track.stations) groups.set(s.place ?? s.id, [...(groups.get(s.place ?? s.id) ?? []), s]);
const places = [...groups].map(([id, g]) => ({ id, name: g[0].name, n: g.length, nameZoom: zoomOf(id) }));
const byName = new Map(places.map((p) => [p.name, p]));
for (const line of out.split('\n').filter((l) => l.startsWith('  ') && !/^\s+J? ?\d+ m/.test(l) && !l.includes(' m  '))) {
  const members = line.trim().replace(/\s+\(\d+ m\)$/, '').split(' + ').map((s) => s.replace(/ \[[^\]]+\]$/, ''));
  const ps = members.map((n) => byName.get(n)).filter(Boolean);
  const named = ps.toSorted((a, b) => a.nameZoom - b.nameZoom || b.n - a.n || a.name.length - b.name.length)[0];
  console.log(`${named.name.replace(/^Barcelona\s*-?\s*/, '').padEnd(28)} <- ${members.join(' + ')}  (tiers ${ps.map((p) => p.nameZoom).join('/')})`);
}
