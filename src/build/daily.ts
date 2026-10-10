// The daily build: turns the operators' timetables into a bundle for each of the next three service
// days, today's first, and publishes them to R2, so a build that fails leaves the map the days
// before it published. A Network one of whose timetables can't be downloaded or read, or gives it
// no Lines, is built from the copy of them that last built it, which the build keeps in .cache
// (readTimetables()), so the others build as ever. The bundle is built by region, one after another
// (ADR-0014): each region's Networks have a track file, the same for each day, so the map can draw
// the Lines before the Trains come, and a Trips file for each day, with its Closures. A region whose
// build fails goes without new files, and the manifest names those of its last build, so the
// others publish as ever (buildRegions()), but for the first build that makes a manifest by region,
// which has none to keep, and fails (manifestOf()). Beside them it writes out/report.json, each
// spot its log names, once (report.ts), which it publishes after the manifest, and it prints what
// changed since the last build's, in the run's job summary too. In Actions, once it has published,
// it writes out/comment.md where a problem spot is new, which daily.yml posts on the standing
// "Build report" issue.
// `npm run daily` publishes; `npm run daily -- --dry-run` only writes the files to out/. The secrets
// a timetable's URL needs, as TMB's TMB_APP_ID and TMB_APP_KEY, come from the environment, which
// `npm run daily` loads from .env.local.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync, constants } from 'node:zlib';
import { addDays, LIVE_URL, madridDate, type Manifest, type Network } from '../bundle.ts';
import { LONG_DISTANCE, NETWORKS, regionsOf, type NetworkConfig, type Timetable } from '../networks.ts';
import { download, feedStart, type Source } from './gtfs.ts';
import { manifestOf } from './manifest.ts';
import { ownRails, RAILWAYS, readFeed, readTimetables, unlisted, type Feed } from './networks.ts';
import { crop, toBorder } from './border.ts';
import { measures, reported, summary } from './measures.ts';
import { osm } from './osm.ts';
import { buildRegion, buildRegions, sharedStretches } from './regions.ts';
import { railsBeside, traceRuns, traceShapes } from './track.ts';
import { collect, comment, diff, type Found, type Spot } from './report.ts';
import { closuresOf, placeTrips } from './trips.ts';

const BUCKET = 'viapeninsula-live';

const today = madridDate(new Date());
const DAYS = [0, 1, 2].map((n) => addDays(today, n));
const report = collect();
// Every Network's timetables, downloaded at once, and why they couldn't be, where one couldn't: that
// doesn't stop the others, and its Network's are read from their copy (readTimetables()). Renfe's
// long-distance timetable's too, whose Networks aren't on the map yet (#258).
const longDistance = Promise.all(LONG_DISTANCE.map(downloaded));
const downloads = await Promise.all(NETWORKS.map(downloaded));
// The rails of every kind any Network runs on, the nodes where Trains change gauge on them, and Spain's border.
const { rails, changers, border } = await osm(RAILWAYS);
// The last build's manifest names the files of a region whose build fails, and yesterday's bundle,
// whose last Trains can still be running, and its report is what this build's is diffed against, with
// each Network's Trips on each day of the week.
const [lastManifest, lastReport] = await Promise.all([
  lastPublished<Manifest>('manifest.json', "yesterday's bundle goes unnamed, and a region that fails fails the build, with no last files to keep"),
  lastPublished<Spot[]>('report.json', 'every spot is new'),
]);
// The Train numbers each Network's timetables list on each of DAYS, with their Stations, whose Trains
// Renfe's long-distance timetable lists too are theirs (unlisted()).
const listed = DAYS.map((): Map<string, Set<string>>[] => []);
await mkdir('out/days', { recursive: true });
// Each region, one after another: its Networks read and built, its Lines drawn side by side, and its
// files written. A region that fails keeps the files of its last build (buildRegions()).
const results = await buildRegions(
  regionsOf(downloads.map((d) => ({ id: d.network.id, region: d.network.region, ...d }))),
  (region) => {
    console.log(`Region ${region.id}: ${region.networks.map((n) => n.network.name).join(', ')}`);
    return buildRegion(region, {
      dates: DAYS,
      async network({ network, failed }) {
        const read = await readTimetables(network, failed, readDays, report.add);
        for (const [i, parts] of read.days.entries()) listed[i]?.push(...parts.map((p) => p.listed));
        return build(network, read);
      },
      write,
      log: console.warn,
      report: report.add,
      last: lastReport,
    });
  },
  { report, last: lastReport },
);
const built = results.flatMap(({ id, built: region }) => (region ? [{ id, ...region }] : []));
// Where Lines of two regions run along each other's track, they're drawn over each other, not side by side.
sharedStretches(built);
// How the Lines are drawn, for comparing one day's track, or one change to sideBySide(), with another (#160).
const drawn = measures({ shapes: built.flatMap((r) => r.track.shapes), strokes: built.flatMap((r) => r.track.strokes), lines: built.flatMap((r) => r.track.lines) });
const logged = `Lines drawn: ${summary(drawn)}`;
console.log(logged);
for (const found of reported(drawn, logged)) report.add(found);

// Renfe's long-distance Trains, each one Trip made from the parts its timetable lists it in, less those
// a Network on the map lists too, are counted and traced, each run of them along the rails of its Line's
// gauge to Spain's border (#259), but not drawn till #262 and #263, so nothing of them goes in the report
// yet: what their traces find is logged, as the calls their Trains drop are (#403). A long-distance
// timetable that can't be read, nor its copy, as before a build has kept one, is logged, and stops
// nothing else.
for (const { network, failed } of await longDistance) {
  try {
    const { days } = await readTimetables(network, failed, readDays, () => {});
    const trains = days.map((parts, i) => {
      const trips = parts.flatMap((p) => p.trips);
      const kept = unlisted(trips, listed[i] ?? []);
      console.log(`${network.name}'s Trains on ${DAYS[i]}: ${kept.length}, and ${trips.length - kept.length} left to the Networks on the map that list them too`);
      return kept;
    });
    const stations = (days[0] ?? []).flatMap((p) => p.stations);
    const traced = traceRuns(toBorder(border, stations, trains), stations, rails, changers, network.runningSide, console.log, () => {});
    const each = traced.days.map((trips, i) => `${trips.length} of its ${trains[i]?.length} Trains on ${DAYS[i]}`);
    console.log(`${network.name}'s runs traced: ${traced.shapes.length}, with ${each.join(', ')}`);
  } catch (error) {
    console.warn(`${network.name}'s Trains aren't read or traced: ${error instanceof Error ? error.message : error}`);
  }
}

const spots = report.spots();
const manifest = manifestOf(results.map(({ id, built: region }) => ({ id, days: region?.days })), lastManifest);
await writeFile('out/manifest.json', JSON.stringify(manifest));
await writeFile('out/report.json', JSON.stringify(spots));
// The diff and the comment only report, so a last report they can't read, as one of an older shape,
// doesn't stop the build, and the comment then tells of every problem spot, as with no last report,
// so that none goes untold. The comment links this attempt at the run, so there's one only in Actions.
const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT } = process.env;
const run = GITHUB_RUN_ID && `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/attempts/${GITHUB_RUN_ATTEMPT}`;
let changes: string;
let news: string | undefined;
try {
  changes = diff(lastReport, spots);
  if (run) news = comment(lastReport, spots, run);
} catch (error) {
  changes = `Couldn't diff the build report against the last one: ${error}`;
  if (run) news = comment(undefined, spots, run);
}
console.log(changes);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${changes}\n`);

if (!process.argv.includes('--dry-run')) {
  // The bundles go up first, so the manifest never names a file that isn't there yet. The CDN
  // passes a file stored with brotli as it is to browsers that take it, which squeezes it about
  // twice as small as the CDN would on the fly.
  for (const key of new Set(built.flatMap((r) => r.days.flatMap((d) => [d.track, d.trips])))) publish(key, 'public, max-age=31536000, immutable', 'br');
  publish('manifest.json', 'public, max-age=60');
  publish('report.json', 'public, max-age=60');
  // Only once the report is up, as the next build diffs against it, so that it doesn't tell of the same spots again.
  if (news) await writeFile('out/comment.md', news);
}

/**
 * What a Network's timetables give it on each of DAYS, the Lines each gives it, which are those of
 * every day in it, and the day they were last updated where its terms ask the map to show it.
 * ponytail: each Network reads its own feeds once for each day, so Renfe's one file, which 15
 * Networks share, is read 45 times: a dry run on a Mac took 277 s with them all on 7 October 2026,
 * against 126 s with only Rodalies and Madrid on it (#253), and the daily job has 60 minutes. If it
 * grows slow, read each URL once for every day and split it by `routes.idPrefix`
 * (docs/research/network-config.md, "The cost").
 */
async function readDays(feeds: (Feed & { gtfs: Source })[]) {
  // A feed starts the day its operator publishes it, which can't be after today.
  const dated = feeds.find((f) => f.updated);
  const published = dated && (await feedStart(dated.gtfs));
  const days = await Promise.all(DAYS.map((day) => Promise.all(feeds.map((feed) => readFeed(feed.gtfs, day, feed)))));
  return { published, days, lines: (days[0] ?? []).map((p) => p.lines) };
}

/**
 * A Network from what its timetables give it (readDays()), with the day they were last updated
 * where its terms ask the map to show it: its Lines, Stations and track traced along
 * OpenStreetMap's rails of its own kind (ADR-0004), which are those of every day in its timetables,
 * and its Trips on each of DAYS, none where its timetable has none (dayTrips()), all within Spain:
 * its Trips are placed on their whole track, which is then cut at the border. And the Closures its
 * replacement buses make on each of DAYS (closuresOf()). What its tracing and placing log goes into
 * the report too, with the OpenStreetMap ways its Stations are on.
 */
function build(config: NetworkConfig, { published, days }: Awaited<ReturnType<typeof readDays>>) {
  const { id, name, profile, runningSide, colour, pillZoom, credit, live } = config;
  const network: Network = { id, name, profile, runningSide, colour, pillZoom, credit: { ...credit, ...(published && { updated: published < today ? published : today }) }, live };
  const parts = days[0] ?? [];
  const [lines, stations] = [parts.flatMap((p) => p.lines), parts.flatMap((p) => p.stations)];
  // The Stations it places where its config says, rather than where its timetables do (readFeed(), #367).
  for (const [stationId, { lat, lon, source }] of Object.entries(config.stations ?? {})) {
    const station = stations.find((s) => s.id === stationId);
    console.log(station ? `${name} puts ${station.name} (${stationId}) at ${lat}, ${lon}: ${source}` : `${name}'s timetables have no Station ${stationId}, so its override of where it is isn't applied`);
  }
  const own = ownRails(rails, config);
  const near = railsBeside(own, stations);
  const found = (f: Found) => report.add({ ...f, network: id, ways: [...new Set(f.stations?.flatMap((s) => near.get(s.id)?.map((c) => c.way.id) ?? []))] });
  const shapes = traceShapes(parts.flatMap((p) => p.shapes), stations, own, network.runningSide, console.log, found);
  const cropped = crop(border, stations, shapes, days.map((day) => day.flatMap((p) => p.trips)));
  const trips = cropped.days.map((trips, day) => placeTrips(trips, shapes, stations, network.profile.topSpeed, console.log, (f) => found({ ...f, day })));
  const closures = days.map((day, i) => closuresOf(day.flatMap((p) => p.buses), day.flatMap((p) => p.trips), parts.flatMap((p) => p.shapes), cropped.stations, console.log, (f) => found({ ...f, day: i })));
  return { network, lines, stations: cropped.stations, shapes: cropped.shapes, trips, closures };
}

/** A file the last build published, or none where there's none, or where it can't be read, which is logged. */
async function lastPublished<T>(file: string, otherwise: string): Promise<T | undefined> {
  return fetch(`${LIVE_URL}/${file}`)
    .then((res) => {
      if (res.status === 404) return undefined;
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return res.json() as Promise<T>;
    })
    .catch((error: unknown) => {
      console.warn(`Couldn't read the last ${file}, so ${otherwise}:`, error);
      return undefined;
    });
}

/** A Network once its timetables are downloaded, with why one couldn't be, where one couldn't. */
async function downloaded<N extends Pick<NetworkConfig, 'timetables'>>(network: N): Promise<{ network: N; failed: unknown }> {
  return { network, failed: await Promise.all(network.timetables.map(async (t) => download(address(t), t.prefix))).then(() => undefined, (error: unknown) => error) };
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
