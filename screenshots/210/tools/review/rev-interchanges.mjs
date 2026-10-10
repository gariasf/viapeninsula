// #210 review: the interchanges `badge` and `capsule` find, re-derived from the saved track files with code of my own:
// places as the app makes them (a Station's `place`, else its ID; the middle of their Stations), then places of other
// Networks within 350 m sharing a word of their names (the prototype's COMMON words left out), joined transitively, and a
// place several Networks serve. Prints them, then every pair of places of other Networks within 600 m by distance alone,
// marked by whether the rule joins them, for reading by hand. `node rev-interchanges.mjs [--all]`.
import { readdirSync, readFileSync } from 'node:fs';
const dir = new URL('./live/days/', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.startsWith('track-') && (process.argv.includes('--all') || f.includes('catalonia')));
const byId = new Map();
for (const f of files) {
  for (const s of JSON.parse(readFileSync(dir + f, 'utf8')).stations) {
    const had = byId.get(s.id);
    byId.set(s.id, had ? { ...had, networks: [...new Set([...(had.networks ?? []), ...(s.networks ?? [])])] } : s);
  }
}
const groups = new Map();
for (const s of byId.values()) groups.set(s.place ?? s.id, [...(groups.get(s.place ?? s.id) ?? []), s]);
const places = [...groups].map(([id, g]) => ({ id, name: g[0].name, stations: g.map((s) => s.id), networks: [...new Set(g.flatMap((s) => s.networks ?? []))], lon: g.reduce((a, s) => a + s.lon, 0) / g.length, lat: g.reduce((a, s) => a + s.lat, 0) / g.length }));
const R = 6_371_008.8;
const rad = (d) => (d * Math.PI) / 180;
const metres = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2));
const COMMON = ['barcelona', 'de', 'del', 'la', 'el', 'les', 'els', 'i', 'estacio', 'placa', 'sant', 'santa', 'av', 'avinguda'];
const words = (name) => new Set(name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !COMMON.includes(w)));
const other = (a, b) => !a.networks.some((n) => b.networks.includes(n));
const shares = (a, b) => [...words(a.name)].some((w) => words(b.name).has(w));
// Joined transitively, as union-find does.
const root = new Map(places.map((p) => [p.id, p.id]));
const find = (id) => (root.get(id) === id ? id : find(root.get(id)));
const pairs = [];
for (let i = 0; i < places.length; i++) {
  for (let j = i + 1; j < places.length; j++) {
    const [a, b] = [places[i], places[j]];
    if (!other(a, b)) continue;
    const m = metres(a, b);
    if (m <= 600) pairs.push({ a, b, m, joined: m <= 350 && shares(a, b) });
    if (m <= 350 && shares(a, b)) root.set(find(a.id), find(b.id));
  }
}
const sets = new Map();
for (const p of places) sets.set(find(p.id), [...(sets.get(find(p.id)) ?? []), p]);
const interchanges = [...sets.values()].filter((g) => new Set(g.flatMap((p) => p.networks)).size > 1);
const label = (p) => `${p.name} [${p.networks.join('+')}]`;
console.log(`${places.length} places, ${interchanges.length} interchanges (${interchanges.filter((g) => g.length > 1).length} groups, ${interchanges.filter((g) => g.length === 1).length} places of several Networks):`);
for (const g of interchanges.sort((x, y) => x[0].lat - y[0].lat)) {
  const span = g.length > 1 ? Math.max(...g.flatMap((a) => g.map((b) => metres(a, b)))) : 0;
  console.log(`  ${g.map(label).join(' + ')}${span ? `  (${Math.round(span)} m)` : ''}`);
}
console.log(`\nPairs of places of other Networks within 600 m (J = the rule joins them):`);
for (const { a, b, m, joined } of pairs.sort((x, y) => x.m - y.m)) console.log(`  ${joined ? 'J' : ' '} ${Math.round(m)} m  ${label(a)} — ${label(b)}`);
