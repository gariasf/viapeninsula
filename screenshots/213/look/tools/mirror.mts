// #213 look-measure: mirror today's live files once, so that every shot and perf run reads the same ones (--out).
//   node mirror.mts <dir> <date,...>   e.g. node mirror.mts ../live 2026-10-21,2026-10-22
// The manifest and alerts.json as they are now, the zoomed-out file, and every region's track and Trips of the dates.
import fs from 'node:fs';
import path from 'node:path';

const LIVE = 'https://viapeninsula-live.gariasf.com';
const [dir, dates] = [path.resolve(process.argv[2]!), new Set(process.argv[3]!.split(','))];
const get = async (key: string) => {
  const file = path.join(dir, key);
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const res = await fetch(`${LIVE}/${key}`);
  if (!res.ok) throw new Error(`${key}: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return body;
};
const manifest = JSON.parse((await get('manifest.json')).toString()) as { regions: { id: string; days: { date: string; track: string; trips: string }[] }[]; zoomedOut: string };
await get('alerts.json');
const keys = new Set([manifest.zoomedOut, ...manifest.regions.flatMap((r) => r.days.filter((d) => dates.has(d.date)).flatMap((d) => [d.track, d.trips]))]);
for (const key of keys) console.log(key, (await get(key)).length);
console.log(`${keys.size + 2} files, ${manifest.regions.length} regions`);
