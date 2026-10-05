// The daily build: turns the operators' timetables into a bundle for each of the next three service
// days, today's first, and publishes them to R2, so a build that fails leaves the map the days before
// it published. Each day's bundle comes in two files, so the map can draw the Lines before the Trips
// come: the track, which is the same file for each day, and the day's Trips. Beside them it writes
// out/report.json: each spot its log names, once (report.ts).
// `npm run daily` publishes; `npm run daily -- --dry-run` only writes the files to out/. The secrets
// a timetable's URL needs, as TMB's TMB_APP_ID and TMB_APP_KEY, come from the environment, which
// `npm run daily` loads from .env.local.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { addDays, LIVE_URL, madridDate, type Manifest, type Network, type Track } from '../bundle.ts';
import { NETWORKS, type NetworkConfig, type Timetable } from '../networks.ts';
import { download, feedStart, type Source } from './gtfs.ts';
import { dayTrips, manifestDay, manifestOf } from './manifest.ts';
import { onRails, readFeed, type Feed } from './networks.ts';
import { crop } from './border.ts';
import { measures, reported, summary } from './measures.ts';
import { osm } from './osm.ts';
import { sideBySide } from './sideBySide.ts';
import { fine, railsBeside, stationsOf, traceShapes } from './track.ts';
import { collect, type Found } from './report.ts';
import { placeTrips } from './trips.ts';

const BUCKET = 'viapeninsula-live';

const today = madridDate(new Date());
const DAYS = [0, 1, 2].map((n) => addDays(today, n));
const report = collect();
// Every Network's timetables, downloaded at once.
const downloaded = await Promise.all(
  NETWORKS.map(async (network) => ({
    network,
    feeds: await Promise.all(network.timetables.map(async (t) => ({ ...t, network, gtfs: await download(address(t), `${t.prefix}.zip`) }))),
  })),
);
// The rails of every kind any Network runs on, and Spain's border. The kinds are sorted, so the copy
// osm() keeps isn't named by the Networks' order.
const { rails, border } = await osm([...new Set(NETWORKS.flatMap((n) => n.rails.railway))].sort());
const networks = [];
for (const { network, feeds } of downloaded) networks.push(await build(network, feeds));
const eachDay = dayTrips(DAYS, networks, console.warn, report.add);
const [lines, traced] = [networks.flatMap((n) => n.lines), networks.flatMap((n) => n.shapes)];
const { strokes, centrelines, rails: ownTrack, slots, tracks } = await sideBySide(lines, traced);
const shapes = [...traced, ...centrelines];
// How the Lines are drawn, for comparing one day's track, or one change to sideBySide(), with another (#160).
const drawn = measures({ shapes, strokes, lines });
const logged = `Lines drawn: ${summary(drawn)}`;
console.log(logged);
for (const found of reported(drawn, logged)) report.add(found);

await mkdir('out/days', { recursive: true });
const track: Track = {
  networks: networks.map((n) => n.network),
  lines,
  stations: stationsOf(networks),
  shapes,
  strokes,
  rails: ownTrack,
  slots,
  tracks,
};
const trackKey = await write('days/track', track, `${track.lines.length} Lines, ${track.stations.length} Stations, ${track.shapes.length} shapes`);
const built = await Promise.all(
  eachDay.map(async (trips) => {
    const key = await write(`days/${trips.serviceDay}`, trips, `${trips.trips.length} Trips`);
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
await writeFile('out/report.json', JSON.stringify(report.spots()));

if (!process.argv.includes('--dry-run')) {
  // The bundles go up first, so the manifest never names a file that isn't there yet. The CDN
  // passes a file stored with brotli as it is to browsers that take it, which squeezes it about
  // twice as small as the CDN would on the fly.
  for (const key of [trackKey, ...built.map((d) => d.trips)]) publish(key, 'public, max-age=31536000, immutable', 'br');
  publish('manifest.json', 'public, max-age=60');
}

/**
 * A Network from its operator's timetables, with the day they were last updated where its terms ask
 * the map to show it: its Lines, Stations and track traced along OpenStreetMap's rails of its own kind
 * (ADR-0004), which are those of every day in its timetables, and its Trips on each of DAYS, none where
 * its timetable has none (dayTrips()), all within Spain: its Trips are placed on their whole track,
 * which is then cut at the border. What its tracing and placing log goes into the report too, with the
 * OpenStreetMap ways its Stations are on.
 * ponytail: reads each feed once for each day, about 5 s a day for the lot; read stop_times once for
 * every day if the build grows slow.
 */
async function build(config: NetworkConfig, feeds: (Feed & { gtfs: Source })[]) {
  // A feed starts the day its operator publishes it, which can't be after today.
  const dated = feeds.find((f) => f.updated);
  const published = dated && (await feedStart(dated.gtfs));
  const { id, name, profile, runningSide, colour, pillZoom, credit, live } = config;
  const network: Network = { id, name, profile, runningSide, colour, pillZoom, credit: { ...credit, ...(published && { updated: published < today ? published : today }) }, live };
  const days = await Promise.all(DAYS.map((day) => Promise.all(feeds.map((feed) => readFeed(feed.gtfs, day, feed)))));
  const parts = days[0] ?? [];
  const [lines, stations] = [parts.flatMap((p) => p.lines), parts.flatMap((p) => p.stations)];
  const own = fine(rails.filter(onRails(config.rails)));
  const near = railsBeside(own, stations);
  const found = (f: Found) => report.add({ ...f, network: id, ways: [...new Set(f.stations?.flatMap((s) => near.get(s.id)?.map((c) => c.way.id) ?? []))] });
  const shapes = traceShapes(parts.flatMap((p) => p.shapes), stations, own, network.runningSide, console.log, found);
  const cropped = crop(border, stations, shapes, days.map((day) => day.flatMap((p) => p.trips)));
  const trips = cropped.days.map((trips, day) => placeTrips(trips, lines, shapes, stations, network.profile.topSpeed, console.log, (f) => found({ ...f, day })));
  return { network, lines, stations: cropped.stations, shapes: cropped.shapes, trips };
}

/** A timetable's URL, with the secrets its query needs. */
function address({ url, query }: Timetable): string {
  return query ? `${url}?${new URLSearchParams(Object.entries(query).map(([param, name]) => [param, secret(name)]))}` : url;
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
