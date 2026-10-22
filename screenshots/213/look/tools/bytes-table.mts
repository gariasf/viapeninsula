// loads.jsonl's runs as tables: what each variant loaded before the first Lines came, by where from, against A; and the
// ground's tiles each view took in all, cold. The last run of each spot, variant, device and scheme counts.
import fs from 'node:fs';
import path from 'node:path';
const DATA = path.resolve(import.meta.dirname, '..');
type Res = { url: string; start: number; bytes: number; status?: number };
type Run = { spot: string; v213: string; device: string; scheme: string; firstLines?: number; resources: Res[]; errors: string[]; terrain: boolean };
const runs = new Map<string, Run>();
for (const l of fs.readFileSync(path.join(DATA, process.argv[3] ?? 'bytes.jsonl'), 'utf8').trim().split('\n')) {
  const r = JSON.parse(l) as Run & { hill?: true; credits?: true };
  if (r.hill || r.credits) continue;
  runs.set(`${r.spot} ${r.v213} ${r.device} ${r.scheme}`, r);
}
const from = (url: string) => {
  const u = new URL(url);
  if (u.host === 'tiles.mapterhorn.com') return 'ground';
  if (u.host === 'tiles.openfreemap.org') return 'basemap';
  if (u.host === 'viapeninsula.gariasf.com') return 'site';
  if (u.host === 'viapeninsula-live.gariasf.com') {
    const f = u.pathname.slice(1);
    const region = /^days\/(?:track-|\d{4}-\d\d-\d\d-)(.+)-[0-9a-f]{12}\.json$/.exec(f)?.[1];
    return region ? `live ${region}${f.startsWith('days/track-') ? ' track' : ' trips'}` : `live ${f.replace(/-[0-9a-f]{12}\.json$/, '').replace(/^days\//, '')}`;
  }
  return u.host;
};
const kb = (b: number) => (b / 1024).toFixed(0);
const sum = (rs: Res[]) => rs.reduce((a, r) => a + r.bytes, 0);
const mode = process.argv[2] ?? 'before';
const spots = [...new Set([...runs.values()].map((r) => r.spot))];
for (const spot of spots) {
  for (const device of ['laptop', 'phone']) {
    const of = [...runs.values()].filter((r) => r.spot === spot && r.device === device && r.scheme === 'light');
    if (!of.length) continue;
    if (mode === 'before') {
      const rows = new Map<string, Record<string, [number, number]>>();
      for (const r of of) {
        const before = r.resources.filter((x) => r.firstLines !== undefined && x.start < r.firstLines);
        for (const x of before) {
          const row = rows.get(from(x.url)) ?? {};
          const [n, b] = row[r.v213] ?? [0, 0];
          row[r.v213] = [n + 1, b + x.bytes];
          rows.set(from(x.url), row);
        }
      }
      const vs = of.map((r) => r.v213);
      console.log(`\n${spot}, ${device}, light: before the first Lines (requests, KB over the wire)\n| from | ${vs.join(' | ')} |\n|---|${vs.map(() => '---|').join('')}`);
      for (const [k, row] of [...rows].sort()) console.log(`| ${k} | ${vs.map((v) => (row[v] ? `${row[v]![0]}, ${kb(row[v]![1])}` : '–')).join(' | ')} |`);
      console.log(`| **in all** | ${of.map((r) => { const b = r.resources.filter((x) => r.firstLines !== undefined && x.start < r.firstLines); return `${b.length}, ${kb(sum(b))}`; }).join(' | ')} |`);
      console.log(`| first Lines, ms | ${of.map((r) => Math.round(r.firstLines ?? -1)).join(' | ')} |`);
    } else {
      for (const r of of.filter((x) => x.terrain)) {
        const g = r.resources.filter((x) => from(x.url) === 'ground');
        const z = [...new Set(g.map((x) => new URL(x.url).pathname.split('/')[1]))].join(',');
        console.log(`${spot} ${r.v213} ${device}: ground tiles ${g.length}, ${kb(sum(g))} KB, zooms ${z}, ${g.filter((x) => x.status !== 200).length} not 200`);
      }
    }
  }
}
