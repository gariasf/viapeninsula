// The daily build: turns the operators' timetables into a bundle for each of the next three service
// days, today's first, and publishes them to R2, so a build that fails leaves the map the days
// before it published. A Network one of whose timetables can't be downloaded or read, or gives it
// no Lines, is built from the copy of them that last built it, which the build keeps in .cache
// (readTimetables()), so the others build as ever. The bundle is built by region, one after another
// (ADR-0014): each region's Networks have a track file, the same for each day, so the map can draw
// the Lines before the Trains come, and a Trips file for each day, with its Closures. A region whose
// build fails goes without new files, and the manifest names those of its last build, so the
// others publish as ever (buildRegions()), but for the first build that makes a manifest by region,
// which has none to keep, and fails (manifestOf()). The manifest names each region's Networks and
// where it lies too, and the file below zoom 7, so that the map loads only the regions it needs
// (zoomedOut(), #266). Beside them it writes out/report.json, each spot its log names, once
// (report.ts), which it publishes after the manifest, and it prints what changed since the last
// build's, in the run's job summary too. In Actions, once it has published, it writes
// out/comment.md where a problem spot is new, which daily.yml posts on the standing "Build report"
// issue.
// `npm run daily` publishes; `npm run daily -- --dry-run` only writes the files to out/, and reads
// the timetables from the feed cache, the main checkout's .cache/feeds/<today>, where they're kept from the first dry run
// of the day, so that every dry run of a day builds on the same feeds (#730).
// `--dry-run --region <id>` builds only that region and writes only its files: none of the others',
// nor the manifest, the file below zoom 7 or the report. A change whose effects cross regions, as long
// distance's Lines share Stretches with Catalonia's, needs a full run. Long distance's region reads the
// Networks before it too, for the Trains they list, which it leaves to them (unlisted()).
// The secrets a timetable's URL needs, as TMB's TMB_APP_ID and TMB_APP_KEY, come from the
// environment, which `npm run daily` loads from .env.local.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { brotliCompressSync, constants } from 'node:zlib';
import { addDays, LIVE_URL, madridDate, profiled, type Manifest, type Network } from '../bundle.ts';
import { MEDIA_DISTANCIA_AVANT, NETWORKS, regionsOf, type NetworkConfig, type Timetable } from '../networks.ts';
import { decodeTrack, type TrackFile } from '../pieces.ts';
import { download, type Source } from './gtfs.ts';
import { manifestOf } from './manifest.ts';
import { ownRails, RAILWAYS, readFeed, readTimetables, rest, twinned, untaken, updatedOn, type Feed } from './networks.ts';
import { crop, toBorder } from './border.ts';
import { measures, reported, summary } from './measures.ts';
import { osm } from './osm.ts';
import { buildRegion, buildRegions, failedRegions, sharedStretches, zoomedOut } from './regions.ts';
import { railGraphs, railsBeside, traceOwn, traceRuns, traceShapes, withLines } from './track.ts';
import { collect, comment, diff, type Found, type Spot } from './report.ts';
import { closuresOf, placeDays, placeRuns, unserved, type FeedTrip } from './trips.ts';

const BUCKET = 'viapeninsula-live';

const { 'dry-run': dryRun, region: only } = parseArgs({ options: { 'dry-run': { type: 'boolean' }, region: { type: 'string' } } }).values;
const REGIONS = regionsOf(NETWORKS);
if (only && !REGIONS.some((r) => r.id === only)) throw new Error(`There's no region ${only}: the regions are ${REGIONS.map((r) => r.id).join(', ')}`);
if (only && !dryRun) throw new Error('--region builds only some regions, so it never publishes: add --dry-run');
// The regions built, and with long distance's, the Networks of those before it, read only for the Trains they list.
const wanted = only ? REGIONS.filter((r) => r.id === only) : REGIONS;
const listers = wanted.some((r) => r.networks.some((n) => n.timetables.every((t) => t.shapeless))) ? REGIONS.slice(0, REGIONS.indexOf(wanted[0]!)).flatMap((r) => r.networks) : [];
const today = madridDate(new Date());
const DAYS = [0, 1, 2].map((n) => addDays(today, n));
const report = collect();
// A dry run's feed cache: today's alone, as the feeds change from day to day, in the main checkout's
// .cache/, which its worktrees share, so that their dry runs and main's baseline build on the same feeds.
const FEEDS = join(dryRun ? dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim()) : '', '.cache', 'feeds');
if (dryRun) for (const day of await readdir(FEEDS).catch(() => [])) if (day !== today) await rm(join(FEEDS, day), { recursive: true, force: true });
// Every Network's timetables, downloaded at once, and why they couldn't be, where one couldn't: that
// doesn't stop the others, and its Network's are read from their copy (readTimetables()). And Media
// Distancia y Avant's once more, which every region's build reads before its own, for the Trips its
// Trains run under other numbers (twins, #488).
// Downloaded once, where its region is wanted too, so that two writes of its copy don't race.
const longDistance = downloaded(MEDIA_DISTANCIA_AVANT);
const downloads = await Promise.all([...listers, ...wanted.flatMap((r) => r.networks)].map((n) => (n === MEDIA_DISTANCIA_AVANT ? longDistance : downloaded(n))));
// The rails of every kind any Network runs on, the nodes where Trains change gauge on them, and Spain's border.
const { rails, changers, border } = await osm(RAILWAYS);
// The last build's manifest names the files of a region whose build fails, and yesterday's bundle,
// whose last Trains can still be running, and its report is what this build's is diffed against, with
// each Network's Trips on each day of the week.
const [lastManifest, lastReport] = await Promise.all([
  lastPublished<Manifest>('manifest.json', "yesterday's bundle goes unnamed, and a region that fails fails the build, with no last files to keep"),
  lastPublished<Spot[]>('report.json', 'every spot is new'),
]);
// The Train numbers each Network's timetables list on each of DAYS, with their Stations, and their Trips,
// whose calls are theirs where Renfe's long-distance timetable lists the Train too (rest(), #547).
const listed = DAYS.map((): { network: string; listed: Map<string, Set<string>>[]; trips: FeedTrip[] }[] => []);
await mkdir('out/days', { recursive: true });
// A Network that can't be read lists none, as in a full run, where its region fails.
for (const { network, failed } of downloads.slice(0, listers.length)) if (!network.timetables.every((t) => t.shapeless)) await readTimetables(network, failed, readDays, () => {}).then((read) => addListed(network.name, read), (error: unknown) => console.warn(`${network.name} isn't read: ${error instanceof Error ? error.message : error}`));
// Media Distancia y Avant's Trains, read before the regions are built, so that a Rodalies or núcleo Trip one
// of them makes all the calls of, at the same minutes, under another number, answers to that number too
// (twinned(), #488). A timetable that can't be read, nor its copy, twins none, and is logged.
// Its own region's build takes this read, with the route names neither of Renfe's long-distance Networks
// takes (untaken(), #401), and reads its timetables again only where this failed.
// ponytail: not AVE y Larga Distancia's, which twin none of them on 13 and 17 Oct 2026, and are read in its
// own region's build, after the others; read them here too if one shows up as a Trip's twin.
const { network: md, failed: mdFailed } = await longDistance;
// Its problems, as a copy read where the download failed, are reported where its region is built, which takes this read.
const mdWanted = wanted.some((r) => r.networks.includes(md));
const longRead = await readTimetables(md, mdFailed, readLong, mdWanted ? report.add : () => {}).catch((error: unknown) => (console.warn(`${md.name}'s Trains aren't read, so they twin no Trip: ${error instanceof Error ? error.message : error}`), undefined));
// With those it leaves out as run by road (#562), whose stretches by rail a Trip of another Network can be, as Sevilla's C3 34772 is 18773's.
const twins = DAYS.map((_, i) => (longRead?.days[i] ?? []).flatMap((p) => [...p.trips, ...p.road]));
// Each region, one after another: its Networks read and built, its Lines drawn side by side, and its
// files written. A region that fails keeps the files of its last build (buildRegions()).
const results = await buildRegions(
  regionsOf(downloads.slice(listers.length).map((d) => ({ id: d.network.id, region: d.network.region, ...d }))),
  (region) => {
    console.log(`Region ${region.id}: ${region.networks.map((n) => n.network.name).join(', ')}`);
    return buildRegion(region, {
      dates: DAYS,
      async network({ network, failed }) {
        const read = (network.id === md.id && longRead) || (await readTimetables(network, failed, readDays, report.add));
        // The route names of Renfe's long-distance timetable that no Network takes (#401).
        if (read === longRead) for (const found of longRead.routes) report.add(found);
        // Built before its own Train numbers are listed: one whose timetable has no shapes leaves to a
        // Network before it the calls of the Trains that one lists (rest()). Listed even where its build fails, as
        // its region's last files still draw its Trains.
        // Not one of Renfe's long-distance timetable's, whose two Networks take its Trains between them by their
        // routes' names (#401): AVE y Larga Distancia's Trains are none of Media Distancia y Avant's (#263).
        try {
          return build(network, read);
        } finally {
          if (!network.timetables.every((t) => t.shapeless)) addListed(network.name, read);
        }
      },
      write,
      log: console.warn,
      report: report.add,
      last: lastReport,
    });
  },
  { report, last: lastReport },
);
if (only) {
  const failed = results.find((r) => r.failed);
  if (failed) throw new Error(`${failed.id} isn't built: ${failed.failed}`);
} else {
  const built = results.flatMap(({ id, built: region }) => (region ? [{ id, ...region }] : []));
  // Where Lines of two regions run along each other's track, they're drawn over each other, not side by side.
  sharedStretches(built);
  // How the Lines are drawn, for comparing one day's track, or one change to sideBySide(), with another (#160).
  const drawn = measures({ shapes: built.flatMap((r) => r.track.shapes), strokes: built.flatMap((r) => r.track.strokes), lines: built.flatMap((r) => r.track.lines) });
  const logged = `Lines drawn: ${summary(drawn)}`;
  console.log(logged);
  for (const found of reported(drawn, logged)) report.add(found);

  // Each region's days, a failed region's from the last manifest, which its spot says how many of (#452).
  const named = manifestOf(results.map(({ id, built: region }) => ({ id, days: region?.days })), lastManifest);
  for (const found of failedRegions(results, named, lastManifest)) report.add(found);
  const spots = report.spots();
  // Then each region's Networks and where it lies, and the file below zoom 7, which the map needs to
  // load only the regions in view (#266): a failed region's from its last track file.
  const { regions, file } = await zoomedOut(
    named,
    new Map(built.map((r) => [r.id, r.track])),
    async (key) => {
      const last = await lastPublished<TrackFile>(key, "the build fails, as the map would lose its region's track below zoom 7");
      if (!last) throw new Error(`No ${key} to draw a region whose build failed below zoom 7 from`);
      return decodeTrack(last);
    },
  );
  const below = await write('days/zoomed-out', file, `${file.networks.length} Networks, ${file.tracks.length} Network tracks`);
  const manifest: Manifest = { regions, zoomedOut: below };
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

  if (!dryRun) {
    // The bundles go up first, so the manifest never names a file that isn't there yet. The CDN
    // passes a file stored with brotli as it is to browsers that take it, which squeezes it about
    // twice as small as the CDN would on the fly.
    for (const key of new Set([...built.flatMap((r) => r.days.flatMap((d) => [d.track, d.trips])), below])) publish(key, 'public, max-age=31536000, immutable', 'br');
    publish('manifest.json', 'public, max-age=60');
    publish('report.json', 'public, max-age=60');
    // Only once the report is up, as the next build diffs against it, so that it doesn't tell of the same spots again.
    if (news) await writeFile('out/comment.md', news);
  }
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
async function readDays(feeds: (Feed & { gtfs: Source; readOn: string })[]) {
  // A feed starts the day its operator publishes it, which can't be after today (build()); one with no
  // start of its own, as TRAM's, is dated the day it was read.
  const published = await updatedOn(feeds);
  const days = await Promise.all(DAYS.map((day) => Promise.all(feeds.map((feed) => readFeed(feed.gtfs, day, feed)))));
  return { published, days, lines: (days[0] ?? []).map((p) => p.lines) };
}

/** What a long-distance timetable gives its Network (readDays()), and the route names neither of its Networks takes (untaken(), #401). */
async function readLong(feeds: (Feed & { gtfs: Source; readOn: string })[]) {
  return { ...(await readDays(feeds)), routes: (await Promise.all(feeds.map((f) => untaken(f.gtfs)))).flat() };
}

/**
 * A Network from what its timetables give it (readDays()), with the day they were last updated
 * where its terms ask the map to show it: its Lines, Stations and track traced along
 * OpenStreetMap's rails of its own kind (ADR-0004), which are those of every day in its timetables,
 * and its Trips on each of DAYS, none where its timetable has none (dayTrips()), all within Spain:
 * its Trips are placed on their whole track, which is then cut at the border. Where its timetable has
 * no shapes, as Renfe's long-distance one, its track is the traces of its Trips' runs on DAYS, each
 * along the rails of its Line's gauges, and its Stations are those its Trips call at (#259, #262). And
 * the Closures its replacement buses make on each of DAYS (closuresOf()). What its tracing and placing
 * log goes into the report too, with the OpenStreetMap ways its Stations are on; so does what its timetables find
 * wrong with their own Trips on each of DAYS, as a TRAM Trip's stop numbers (readFeed(), #406).
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
  // The Stations it names as its config spells them, rather than as its timetables do (readFeed(), #571).
  for (const [stationId, { name: spelt, source }] of Object.entries(config.stationNames ?? {})) {
    console.log(stations.some((s) => s.id === stationId) ? `${name} spells ${stationId} as ${spelt}: ${source}` : `${name}'s timetables have no Station ${stationId}, so its spelling of its name isn't applied`);
  }
  const shapeless = config.timetables.every((t) => t.shapeless);
  const own = ownRails(rails, config);
  const near = railsBeside(own, stations);
  const found = (f: Found) => report.add({ ...f, network: id, ways: [...new Set(f.stations?.flatMap((s) => near.get(s.id)?.map((c) => c.way.id) ?? []))] });
  // What its timetables' own Trips give away, as each day's were read (readFeed()).
  for (const [i, day] of days.entries()) for (const part of day) for (const f of part.found) found({ ...f, day: i });
  const feeds = parts.flatMap((p) => p.shapes);
  const graphs = railGraphs(feeds, stations, own, network.runningSide);
  // A Station a shape's trace leaves out, as it lies off the feed's shape on a branch, is reported only if no Trip
  // of its Line runs a trace of its own through it on these days (#601): it's logged either way.
  const branches: Found[] = [];
  const shapes = traceShapes(feeds, stations, own, network.runningSide, console.log, (f) => (f.kind === 'branch' ? branches.push(f) : found(f)), graphs);
  // Its Trips, each with the numbers Media Distancia y Avant runs it under, as R15's 30501 as 17501 (twinned(), #488).
  const trips = days.map((day, i) => (shapeless ? day.flatMap((p) => p.trips) : twinned(day.flatMap((p) => p.trips), twins[i] ?? [])));
  for (const [i, day] of trips.entries()) {
    const twin = day.filter((t) => t.twins).length;
    if (twin) console.log(`${name}'s Trips on ${DAYS[i]} that Media Distancia y Avant runs under another number too: ${twin}`);
  }
  const cropped = crop(border, stations, shapes, trips);
  // Each Line's top speed, its own where its profile has one, as AVE's 300 km/h (#260), or its Network's.
  const speeds = new Map(lines.map((l) => [l.id, profiled(network, l)?.profile.topSpeed ?? profile.topSpeed]));
  const topSpeed = (line: string) => speeds.get(line) ?? profile.topSpeed;
  // A timetable with no shapes, as Renfe's long-distance one, has each run of its Trips, but for the Trains a
  // Network before it lists too, traced through their Stations instead, cut at Spain's border with the first call
  // beyond it, and its Trips placed on their runs' traces (#259, #262). A Trip of a timetable with shapes that
  // doesn't fit its feed's shape runs on a trace through its own Stations, which its Line has too (#280).
  const placed = shapeless
    ? placeRuns(traceRuns(toBorder(border, stations, unlistedTrains(config, days)), stations, rails, changers, runningSide, console.log, found), stations, topSpeed, console.log, found)
    : placeDays(cropped.days, shapes, stations, topSpeed, (unfit) => traceOwn(unfit, feeds, stations, graphs, console.log, found), console.log, found);
  for (const f of unserved(branches, placed.days, placed.shapes)) found(f);
  const traces = crop(border, stations, placed.shapes, []).shapes;
  const lineOf = new Map(placed.days.flat().map((t) => [t.shape, t.line]));
  const closures = days.map((day, i) => closuresOf(day.flatMap((p) => p.buses), day.flatMap((p) => p.trips), feeds, cropped.stations, console.log, (f) => found({ ...f, day: i })));
  // A timetable with no shapes has as its Stations those its Trips call at: the traces they're placed on are all its track.
  const calledAt = placed.days.flat().map((t) => ({ line: t.line, stations: t.calls.map((c) => c.station) }));
  const served = new Set(calledAt.flatMap((t) => t.stations));
  return {
    network,
    lines: lines.map((l) => ({ ...l, shapes: [...l.shapes, ...traces.filter((s) => lineOf.get(s.id) === l.id).map((s) => s.id)] })),
    stations: shapeless ? withLines(cropped.stations.filter((s) => served.has(s.id)), calledAt) : withLines(cropped.stations, feeds),
    shapes: [...cropped.shapes, ...traces],
    trips: placed.days,
    closures,
    left: parts.flatMap((p) => p.left),
  };
}

/** The Train numbers a Network's timetables list on each of DAYS, as long distance leaves those Trains to it (unlisted()). */
function addListed(network: string, read: Awaited<ReturnType<typeof readDays>>) {
  for (const [i, parts] of read.days.entries()) listed[i]?.push({ network, listed: parts.map((p) => p.listed), trips: parts.flatMap((p) => p.trips) });
}

/**
 * Each day's Trips of a Network of Renfe's long-distance timetable, each a Train made one Trip from its
 * parts, less the calls of those a Network built before it lists too, which are that one's (#258), its
 * Trips' calls left to it (rest(), #547): how many of each it logs, and the Trips and calls it keeps of them.
 */
function unlistedTrains(network: Pick<NetworkConfig, 'name'>, days: { trips: FeedTrip[] }[][]): FeedTrip[][] {
  return days.map((parts, i) => {
    const trips = parts.flatMap((p) => p.trips);
    const listers = listed[i] ?? [];
    const kept = rest(trips, listers.flatMap((l) => l.listed), listers.flatMap((l) => l.trips));
    const all = new Set(trips);
    const whole = new Set(kept.filter((t) => all.has(t)));
    console.log(`${network.name}'s Trains on ${DAYS[i]}: ${whole.size}, and ${trips.length - whole.size} the Networks on the map list too`);
    // The Trips and calls it keeps of those, by the Networks that list them (#547).
    const by = new Map<string, [trips: number, calls: number]>();
    for (const t of kept.filter((k) => !whole.has(k))) {
      const train = trips.find((o) => o.number === t.number) ?? t;
      const names = listers.filter((l) => l.listed.some((m) => m.get(t.number ?? '')?.size) || twinned(l.trips, [train]).some((o) => o.twins)).map((l) => l.network);
      const key = names.join(' and ') || 'none';
      const [n = 0, c = 0] = by.get(key) ?? [];
      by.set(key, [n + 1, c + t.calls.length]);
    }
    for (const [names, [n, c]] of by) console.log(`${network.name} keeps ${n} Trips, ${c} calls, on ${DAYS[i]} of Trains ${names} list${names.includes(' and ') ? '' : 's'} too, which their Trips don't make`);
    return kept;
  });
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
  return { network, failed: await Promise.all(network.timetables.map(async (t) => download(address(t), t.prefix, { cache: dryRun ? join(FEEDS, today) : undefined }))).then(() => undefined, (error: unknown) => error) };
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
