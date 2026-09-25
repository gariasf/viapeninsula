// Records live data for the tests' fixtures (#31): Renfe's two feeds, fetched together, then the
// production snapshots as the map receives them, every 20 s for a quarter of an hour, with that
// day's bundle cut down to the Trips they name. `npm run record -- <dir> [minutes]` writes to <dir>:
//
// - vehicle_positions.json and trip_updates.json, as Renfe served them;
// - replay.json.gz, `{ bundle, received }` gzipped, what `jumps()` and `trainsAt()` take: the shapes alone are megabytes.
//
// It needs no key: Renfe's feeds, the bundles and the snapshot are all public.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { LIVE_URL, madridDate, type Bundle, type Manifest, type Snapshot } from './bundle.ts';
import { trainsAt, type Received } from './engine.ts';

const [dir, minutes = '15'] = process.argv.slice(2);
if (!dir) throw new Error('Usage: npm run record -- <dir> [minutes]');
await mkdir(dir, { recursive: true });

// As a browser on the site asks, so the CDN serves the copy viewers get (it varies by Origin).
const get = async (url: string) => {
  const res = await fetch(url, { headers: { Origin: 'https://viapeninsula.gariasf.com' }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
};

const [positions, updates] = await Promise.all([get('https://gtfsrt.renfe.com/vehicle_positions.json'), get('https://gtfsrt.renfe.com/trip_updates.json')]);
await writeFile(join(dir, 'vehicle_positions.json'), positions);
await writeFile(join(dir, 'trip_updates.json'), updates);
console.log(`Renfe's feeds recorded at ${new Date().toISOString()}`);

const today = madridDate(new Date());
const day = (JSON.parse(await get(`${LIVE_URL}/manifest.json`)) as Manifest).days.find((d) => d.date === today);
if (!day) throw new Error(`The manifest has no bundle for ${today}: publish it with \`npm run daily\` first`);
const bundle: Bundle = JSON.parse(await get(`${LIVE_URL}/${day.bundle}`));

// As the map does: each look for live data records the snapshot got, or where none came, the last one.
const received: Received[] = [];
for (const end = Date.now() + Number(minutes) * 60_000; Date.now() < end; await new Promise((done) => setTimeout(done, 20_000))) {
  let snapshot: Snapshot | undefined;
  try {
    snapshot = JSON.parse(await get(`${LIVE_URL}/snapshot.json`));
  } catch (error) {
    console.warn(error);
    snapshot = received.at(-1)?.snapshot;
  }
  if (snapshot) received.push({ snapshot, at: Date.now() });
  console.log(`${received.length} snapshots`);
}

// The Trips the snapshots name, and those Live at any second of the replay: the Metro's Blocks name none.
const kept = new Set(received.flatMap((r) => r.snapshot.reports.flatMap((report) => (report.trip ? [report.trip] : []))));
for (let at = received[0]?.at ?? 0; at <= (received.at(-1)?.at ?? 0); at += 1000) {
  for (const train of trainsAt(bundle, at, received.filter((r) => r.at <= at))) if (train.live) kept.add(train.trip.id);
}
const trips = bundle.trips.filter((t) => kept.has(t.id));
const [lines, shapes] = [new Set(trips.map((t) => t.line)), new Set(trips.map((t) => t.shape))];
const cut: Bundle = {
  ...bundle,
  lines: bundle.lines.filter((l) => lines.has(l.id)),
  stations: [],
  shapes: bundle.shapes.filter((s) => shapes.has(s.id)),
  strokes: [],
  trips,
};
await writeFile(join(dir, 'replay.json.gz'), gzipSync(JSON.stringify({ bundle: cut, received })));
console.log(`replay.json.gz: ${received.length} snapshots, ${trips.length} of ${bundle.trips.length} Trips`);
