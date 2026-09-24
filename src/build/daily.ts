// The daily build: turns the operators' timetables into today's bundle and publishes it to R2.
// `npm run daily` publishes; `npm run daily -- --dry-run` only writes the files to out/.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { madridDate, type Bundle, type Manifest } from '../bundle.ts';
import { noonMinus12h, zipSource } from './gtfs.ts';
import { osmRails } from './osm.ts';
import { buildRodalies, onRodaliesRails, RODALIES } from './rodalies.ts';
import { sideBySide } from './sideBySide.ts';
import { traceShapes } from './track.ts';
import { placeTrips } from './trips.ts';

const RENFE_CERCANIAS = 'https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip';
const BUCKET = 'viapeninsula-live';

const serviceDay = madridDate(new Date());
const rodalies = await buildRodalies(zipSource(await download(RENFE_CERCANIAS, 'renfe-cercanias.zip')), serviceDay);
// No Trips at all means a broken download or a changed feed, not a day without Trains.
if (!rodalies.trips.length) throw new Error(`Renfe's timetable has no Rodalies Trips on ${serviceDay}`);
const rails = await osmRails(['rail']);
// Each Network's track follows OpenStreetMap's rails of its own kind (ADR-0004).
const shapes = traceShapes(rodalies.shapes, rodalies.stations, rails.filter(onRodaliesRails));
const bundle: Bundle = {
  serviceDay,
  noonMinus12h: noonMinus12h(serviceDay),
  networks: [RODALIES],
  lines: rodalies.lines,
  stations: rodalies.stations,
  shapes,
  strokes: sideBySide(rodalies.lines, shapes),
  trips: placeTrips(rodalies.trips, rodalies.lines, shapes, rodalies.stations, RODALIES.profile.topSpeed),
};

// Named by content, so the bundle can be cached for good and a rebuild never serves a stale copy.
const json = JSON.stringify(bundle);
const key = `days/${serviceDay}-${createHash('sha256').update(json).digest('hex').slice(0, 12)}.json`;
const manifest: Manifest = { days: [{ date: serviceDay, bundle: key }] };

await mkdir('out/days', { recursive: true });
await writeFile(join('out', key), json);
await writeFile('out/manifest.json', JSON.stringify(manifest));
console.log(
  `${key}: ${bundle.lines.length} Lines, ${bundle.stations.length} Stations, ${bundle.shapes.length} shapes, ${bundle.trips.length} Trips, ${Math.round(json.length / 1024)} KB`,
);

if (!process.argv.includes('--dry-run')) {
  // The bundle goes up first, so the manifest never names a file that isn't there yet.
  publish(key, 'public, max-age=31536000, immutable');
  publish('manifest.json', 'public, max-age=60');
}

async function download(url: string, name: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const file = join(tmpdir(), name);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return file;
}

function publish(key: string, cacheControl: string) {
  execFileSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--remote', '--file', join('out', key), '--content-type', 'application/json', '--cache-control', cacheControl],
    { stdio: 'inherit' },
  );
}
