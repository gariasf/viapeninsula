// Logs every interchange interchangesOf() makes on a build's tracks, all regions joined, stations of one ID merged.
import { readFileSync, readdirSync } from 'node:fs';
const W = process.argv[2]!;
const B = process.argv[3]!;
const { places } = await import(`${W}/src/bundle.ts`);
const { interchangesOf, markedNetworks } = await import(`${W}/src/web/stations.ts`);
const main = readFileSync(`${W}/src/web/main.ts`, 'utf8');
const tiers = [...main.matchAll(/nameZoom: (\d+),\n\s+larger: \d,\n\s+size: \d+,\n\s+places: \[([\s\S]*?)\]/g)].map((m) => ({ nameZoom: Number(m[1]), ids: [...m[2]!.matchAll(/'([a-z-]+:[^']+)',/g)].map((x) => x[1]) }));
const byId = new Map<string, any>();
for (const f of readdirSync(`${B}/days`).filter((f) => f.startsWith('track-') && f.endsWith('.json'))) {
  for (const s of JSON.parse(readFileSync(`${B}/days/${f}`, 'utf8')).stations) {
    const had = byId.get(s.id);
    byId.set(s.id, had ? { ...had, networks: [...new Set([...(had.networks ?? []), ...(s.networks ?? [])])] } : s);
  }
}
const wide = new Set(['ave-larga-distancia','media-distancia-avant','ouigo']);
const ps = places([...byId.values()]).map((p: any) => ({ ...p, networks: markedNetworks(p.networks, (n: string) => wide.has(n)), nameZoom: tiers.find((t) => t.ids.includes(p.id))?.nameZoom ?? 12 }));
const name = new Map(ps.map((p: any) => [p.id, p]));
const all = interchangesOf(ps);
const km = (a: any, b: any) => Math.round(Math.hypot((a.lon - b.lon) * 111_195 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 111_195));
console.log(`# Interchanges the build makes (${all.length}), ${B.split('/').at(-2)}\n`);
for (const i of all) {
  const members = i.places.map((id: string) => name.get(id));
  const apart = members.length > 1 ? Math.max(...members.flatMap((a: any) => members.map((b: any) => km(a, b)))) : 0;
  console.log(`- **${i.name}** (${i.how}; ${i.networks.join('+')}; ${apart} m): ${members.map((p: any) => `${p.name} \`${p.id}\` [${p.networks.join(',')}]`).join(' · ')}`);
}
