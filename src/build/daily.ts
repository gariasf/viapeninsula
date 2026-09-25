// The daily build: turns the operators' timetables into a bundle for each of the next three service
// days, today's first, and publishes them to R2, so a build that fails leaves the map the days before
// it published.
// `npm run daily` publishes; `npm run daily -- --dry-run` only writes the files to out/. TMB's
// timetable needs TMB_APP_ID and TMB_APP_KEY in the environment, which `npm run daily` loads from
// .env.local.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { addDays, LIVE_URL, madridDate, type Bundle, type Manifest, type Network } from '../bundle.ts';
import { download, feedStart, noonMinus12h, type Source } from './gtfs.ts';
import { manifestDay, manifestOf } from './manifest.ts';
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

const today = madridDate(new Date());
const DAYS = [0, 1, 2].map((n) => addDays(today, n));
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
  await build([[METRO_FEED, tmb]], onMetroRails, { updated: published < today ? published : today }),
];
const [lines, shapes] = [networks.flatMap((n) => n.lines), networks.flatMap((n) => n.shapes)];
const strokes = sideBySide(lines, shapes);

await mkdir('out/days', { recursive: true });
const built = await Promise.all(
  DAYS.map(async (serviceDay, i) => {
    const bundle: Bundle = {
      serviceDay,
      noonMinus12h: noonMinus12h(serviceDay),
      networks: networks.map((n) => n.network),
      lines,
      stations: networks.flatMap((n) => n.stations),
      shapes,
      strokes,
      trips: networks.flatMap((n) => n.trips[i] ?? []),
    };
    // Named by content, so the bundle can be cached for good and a rebuild never serves a stale copy.
    const json = JSON.stringify(bundle);
    const key = `days/${serviceDay}-${createHash('sha256').update(json).digest('hex').slice(0, 12)}.json`;
    await writeFile(join('out', key), json);
    console.log(
      `${key}: ${bundle.lines.length} Lines, ${bundle.stations.length} Stations, ${bundle.shapes.length} shapes, ${bundle.trips.length} Trips, ${Math.round(json.length / 1024)} KB`,
    );
    return manifestDay(bundle, key);
  }),
);
// The last build's manifest names the bundle for yesterday, whose last Trains can still be running.
const previous = await fetch(`${LIVE_URL}/manifest.json`)
  .then((res) => (res.ok ? (res.json() as Promise<Manifest>) : undefined))
  .catch((error: unknown) => {
    console.warn("Couldn't read the last manifest, so yesterday's bundle goes unnamed:", error);
    return undefined;
  });
await writeFile('out/manifest.json', JSON.stringify(manifestOf(built, previous)));

if (!process.argv.includes('--dry-run')) {
  // The bundles go up first, so the manifest never names a file that isn't there yet.
  for (const { bundle } of built) publish(bundle, 'public, max-age=31536000, immutable');
  publish('manifest.json', 'public, max-age=60');
}

/**
 * A Network from its operator's feeds, with the day they were last updated where its terms ask the
 * map to show it: its Lines, Stations and track traced along OpenStreetMap's rails of its own kind
 * (ADR-0004), which are those of every day in its feeds, and its Trips on each of DAYS.
 * ponytail: reads each feed once for each day, about 5 s a day for the lot; read stop_times once for
 * every day if the build grows slow.
 */
async function build(feeds: [[Feed, Source], ...[Feed, Source][]], onRails: (way: OsmWay) => boolean, extra: Pick<Network, 'updated'> = {}) {
  const network: Network = { ...feeds[0][0].network, ...extra };
  const days = await Promise.all(DAYS.map((day) => Promise.all(feeds.map(([feed, gtfs]) => readFeed(gtfs, day, feed)))));
  const parts = days[0] ?? [];
  const [lines, stations] = [parts.flatMap((p) => p.lines), parts.flatMap((p) => p.stations)];
  const shapes = traceShapes(parts.flatMap((p) => p.shapes), stations, rails.filter(onRails));
  const trips = days.map((day, i) => {
    const trips = day.flatMap((p) => p.trips);
    // No Trips at all today means a broken download or a changed feed, not a day without Trains. On a
    // later day it can mean a timetable that ends before it, and the next one comes before that day.
    if (!trips.length && !i) throw new Error(`${network.name}'s timetable has no Trips on ${DAYS[i]}`);
    if (!trips.length) console.warn(`${network.name}'s timetable has no Trips on ${DAYS[i]}`);
    return placeTrips(trips, lines, shapes, stations, network.profile.topSpeed);
  });
  return { network, lines, stations, shapes, trips };
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
