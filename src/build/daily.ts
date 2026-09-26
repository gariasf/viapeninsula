// The daily build: turns the operators' timetables into a bundle for each of the next three service
// days, today's first, and publishes them to R2, so a build that fails leaves the map the days before
// it published. Each day's bundle comes in two files, so the map can draw the Lines before the Trips
// come: the track, which is the same file for each day, and the day's Trips.
// `npm run daily` publishes; `npm run daily -- --dry-run` only writes the files to out/. TMB's
// timetable needs TMB_APP_ID and TMB_APP_KEY in the environment, which `npm run daily` loads from
// .env.local.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { addDays, LIVE_URL, madridDate, type DayTrips, type Manifest, type Network, type Track } from '../bundle.ts';
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
import { crop } from './border.ts';
import { catalonia, osmRails, type OsmWay } from './osm.ts';
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
const [rails, border] = await Promise.all([osmRails(['rail', 'narrow_gauge', 'subway', 'tram', 'funicular']), catalonia()]);
const networks = [
  await build([[RODALIES_FEED, renfe]], onRodaliesRails),
  await build([[FGC_FEED, fgc]], onFgcRails),
  await build([[TRAMBAIX_FEED, trambaix], [TRAMBESOS_FEED, trambesos]], onTramRails),
  await build([[METRO_FEED, tmb]], onMetroRails, { updated: published < today ? published : today }),
];
const [lines, shapes] = [networks.flatMap((n) => n.lines), networks.flatMap((n) => n.shapes)];
const { strokes, sides } = sideBySide(lines, shapes);

await mkdir('out/days', { recursive: true });
const track: Track = {
  networks: networks.map((n) => n.network),
  lines,
  stations: networks.flatMap((n) => n.stations),
  shapes,
  strokes,
  sides,
};
const trackKey = await write('days/track', track, `${track.lines.length} Lines, ${track.stations.length} Stations, ${track.shapes.length} shapes`);
const built = await Promise.all(
  DAYS.map(async (serviceDay, i) => {
    const trips: DayTrips = { serviceDay, noonMinus12h: noonMinus12h(serviceDay), trips: networks.flatMap((n) => n.trips[i] ?? []) };
    const key = await write(`days/${serviceDay}`, trips, `${trips.trips.length} Trips`);
    return manifestDay({ ...track, ...trips }, { track: trackKey, trips: key });
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
  // The bundles go up first, so the manifest never names a file that isn't there yet. The CDN
  // passes a file stored with brotli as it is to browsers that take it, which squeezes it about
  // twice as small as the CDN would on the fly.
  for (const key of [trackKey, ...built.map((d) => d.trips)]) publish(key, 'public, max-age=31536000, immutable', 'br');
  publish('manifest.json', 'public, max-age=60');
}

/**
 * A Network from its operator's feeds, with the day they were last updated where its terms ask the
 * map to show it: its Lines, Stations and track traced along OpenStreetMap's rails of its own kind
 * (ADR-0004), which are those of every day in its feeds, and its Trips on each of DAYS, all within
 * Catalonia: its Trips are placed on their whole track, which is then cut at the border.
 * ponytail: reads each feed once for each day, about 5 s a day for the lot; read stop_times once for
 * every day if the build grows slow.
 */
async function build(feeds: [[Feed, Source], ...[Feed, Source][]], onRails: (way: OsmWay) => boolean, extra: Pick<Network, 'updated'> = {}) {
  const network: Network = { ...feeds[0][0].network, ...extra };
  const days = await Promise.all(DAYS.map((day) => Promise.all(feeds.map(([feed, gtfs]) => readFeed(gtfs, day, feed)))));
  const parts = days[0] ?? [];
  const [lines, stations] = [parts.flatMap((p) => p.lines), parts.flatMap((p) => p.stations)];
  const shapes = traceShapes(parts.flatMap((p) => p.shapes), stations, rails.filter(onRails), network.runningSide);
  const cropped = crop(border, stations, shapes, days.map((day) => day.flatMap((p) => p.trips)));
  const trips = cropped.days.map((trips, i) => {
    // No Trips at all today means a broken download or a changed feed, not a day without Trains. On a
    // later day it can mean a timetable that ends before it, and the next one comes before that day.
    if (!trips.length && !i) throw new Error(`${network.name}'s timetable has no Trips on ${DAYS[i]}`);
    if (!trips.length) console.warn(`${network.name}'s timetable has no Trips on ${DAYS[i]}`);
    return placeTrips(trips, lines, shapes, stations, network.profile.topSpeed);
  });
  return { network, lines, stations: cropped.stations, shapes: cropped.shapes, trips };
}

/** A secret from the environment, which must never be printed. */
function secret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set`);
  return value;
}

/**
 * Writes a file to out/, named by its content, so it can be cached for good and a rebuild never
 * serves a stale copy, and beside it a copy squeezed with brotli, `<key>.br`, and gives its key.
 */
async function write(prefix: string, content: object, what: string): Promise<string> {
  const json = Buffer.from(JSON.stringify(content));
  const key = `${prefix}-${createHash('sha256').update(json).digest('hex').slice(0, 12)}.json`;
  const br = brotliCompressSync(json, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: json.length } });
  await Promise.all([writeFile(join('out', key), json), writeFile(join('out', `${key}.br`), br)]);
  console.log(`${key}: ${what}, ${Math.round(json.length / 1024)} KB, ${Math.round(br.length / 1024)} KB with brotli`);
  return key;
}

/** Uploads a file from out/, or where it's encoded, its encoded copy, `<key>.<encoding>`. */
function publish(key: string, cacheControl: string, encoding?: string) {
  execFileSync(
    'npx',
    [
      'wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--remote',
      '--file', join('out', encoding ? `${key}.${encoding}` : key),
      '--content-type', 'application/json',
      '--cache-control', cacheControl,
      ...(encoding ? ['--content-encoding', encoding] : []),
    ],
    { stdio: 'inherit' },
  );
}
