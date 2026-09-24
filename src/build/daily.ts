// The daily build: turns the operators' timetables into today's bundle and publishes it to R2.
// `npm run daily` publishes; `npm run daily -- --dry-run` only writes the files to out/. TMB's
// timetable needs TMB_APP_ID and TMB_APP_KEY in the environment, which `npm run daily` loads from
// .env.local.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { madridDate, type Bundle, type Manifest, type Network } from '../bundle.ts';
import { download, feedStart, noonMinus12h, type Source } from './gtfs.ts';
import {
  FGC_FEED,
  METRO_FEED,
  onFgcRails,
  onMetroRails,
  onRodaliesRails,
  onTramRails,
  readFeed,
  RODALIES_FEED,
  TRAMBAIX_FEED,
  TRAMBESOS_FEED,
  type Feed,
} from './networks.ts';
import { osmRails, type OsmWay } from './osm.ts';
import { sideBySide } from './sideBySide.ts';
import { traceShapes } from './track.ts';
import { placeTrips } from './trips.ts';

const BUCKET = 'viapeninsula-live';

const serviceDay = madridDate(new Date());
const [renfe, fgc, trambaix, trambesos, tmb] = await Promise.all([
  download('https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip', 'renfe-cercanias.zip'),
  download('https://www.fgc.cat/google/google_transit.zip', 'fgc.zip'),
  download('https://opendata.tram.cat/GTFS/zip/TBX.zip', 'tram-tbx.zip'),
  download('https://opendata.tram.cat/GTFS/zip/TBS.zip', 'tram-tbs.zip'),
  download(`https://api.tmb.cat/v1/static/datasets/gtfs.zip?${new URLSearchParams({ app_id: secret('TMB_APP_ID'), app_key: secret('TMB_APP_KEY') })}`, 'tmb.zip'),
]);
// TMB's terms ask for the day its data was last updated to be shown. Its feed starts the day TMB
// publishes it, and it can't have been published after today.
const published = await feedStart(tmb);
const rails = await osmRails(['rail', 'narrow_gauge', 'subway', 'tram', 'funicular']);
const networks = [
  await build([[RODALIES_FEED, renfe]], onRodaliesRails),
  await build([[FGC_FEED, fgc]], onFgcRails),
  await build([[TRAMBAIX_FEED, trambaix], [TRAMBESOS_FEED, trambesos]], onTramRails),
  await build([[METRO_FEED, tmb]], onMetroRails, { updated: published < serviceDay ? published : serviceDay }),
];
const [lines, shapes] = [networks.flatMap((n) => n.lines), networks.flatMap((n) => n.shapes)];
const bundle: Bundle = {
  serviceDay,
  noonMinus12h: noonMinus12h(serviceDay),
  networks: networks.map((n) => n.network),
  lines,
  stations: networks.flatMap((n) => n.stations),
  shapes,
  strokes: sideBySide(lines, shapes),
  trips: networks.flatMap((n) => n.trips),
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

/**
 * A Network from its operator's feeds, with the day they were last updated where its terms ask the
 * map to show it: its Lines, Stations and Trips, and its track traced along OpenStreetMap's rails of
 * its own kind (ADR-0004).
 */
async function build(feeds: [[Feed, Source], ...[Feed, Source][]], onRails: (way: OsmWay) => boolean, extra: Pick<Network, 'updated'> = {}) {
  const network: Network = { ...feeds[0][0].network, ...extra };
  const parts = await Promise.all(feeds.map(([feed, gtfs]) => readFeed(gtfs, serviceDay, feed)));
  const [lines, stations, trips] = [parts.flatMap((p) => p.lines), parts.flatMap((p) => p.stations), parts.flatMap((p) => p.trips)];
  // No Trips at all means a broken download or a changed feed, not a day without Trains.
  if (!trips.length) throw new Error(`${network.name}'s timetable has no Trips on ${serviceDay}`);
  const shapes = traceShapes(parts.flatMap((p) => p.shapes), stations, rails.filter(onRails));
  return { network, lines, stations, shapes, trips: placeTrips(trips, lines, shapes, stations, network.profile.topSpeed) };
}

/** A secret from the environment, which must never be printed. */
function secret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set`);
  return value;
}

function publish(key: string, cacheControl: string) {
  execFileSync(
    'npx',
    ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--remote', '--file', join('out', key), '--content-type', 'application/json', '--cache-control', cacheControl],
    { stdio: 'inherit' },
  );
}
