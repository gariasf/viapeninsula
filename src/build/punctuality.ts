// The Delay history's daily job (#807): replays a service day's snapshots, which the fetcher keeps (#806), through
// the engine with that day's bundle, as the map would have drawn them, and writes the day's record, a file for each
// Network, of each Call's Delay as the map had it as the Train reached the Call (docs/research/punctuality.md,
// section 1), and the day's snapshots compacted, a file for each Network too, kept 400 days (pick 2), to work the day
// out again when a Delay rule changes (section 5). It runs in Actions after each daily build
// (.github/workflows/punctuality.yml). `npm run punctuality` records the service day before today in Madrid, once
// its last Train has left the map and the fetcher has put the slot it left in, waiting for that; `-- --day
// <YYYY-MM-DD>` another day; `--dry-run` writes the files to out/punctuality/ (`--out`, so that two runs can be
// compared) and puts none; `--aggregates` only works out the aggregates again (#808), as when ending TRAM's
// agreement deletes its records (section 5). Wrangler reads and writes the history's bucket, by the maintainer's
// login, or in Actions by the daily build's R2 token, as CLOUDFLARE_API_TOKEN, and puts the aggregates in the
// bundles' bucket.

import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs, promisify } from 'node:util';
import { brotliCompressSync, brotliDecompressSync, constants, gunzipSync } from 'node:zlib';
import { addDays, daysOf, joinTracks, joinTrips, LATE, LIVE_URL, madridDate, SOON, type Bundle, type Call, type DayFiles, type DayTrips, type Manifest, type Network, type Report, type Snapshot, type Track, type Trip } from '../bundle.ts';
import { delaysAt, joinDays, KEEP, namedIn, works, type DelaySource, type Received } from '../engine.ts';
import { nameOf, SLOT } from '../fetcher/history.ts';
import { AVE_LARGA_DISTANCIA, METRO, NETWORKS } from '../networks.ts';
import { decodeTrack, type TrackFile } from '../pieces.ts';
import { unmatched } from '../record.ts';
import { aggregate, summarize, yearOf, type DaySummary, type LinesFile } from './aggregates.ts';

/** A region's track and Trips files for a day, as the manifest names them. */
type Files = Pick<DayFiles['regions'][number], 'track' | 'trips'>;

/**
 * A service day as the job records it: its date, when its timetable reads 00:00:00 (Bundle's `noonMinus12h`),
 * its Trips, as its Trips files have them, in their order, each the Trip of the bundle that's replayed, and the
 * track and Trips files of each Network's region, which its record names, and the stamp of the code that replays
 * it: the commit, and a hash of src/engine.ts, whose rules give each Delay (section 5, "When the Delay rules change").
 */
export interface Day {
  date: string;
  noonMinus12h: number;
  trips: Trip[];
  files: (network: string) => Files;
  commit: string;
  rules: string;
}

/**
 * A Network's record of a service day (section 1's sketch). It says how much of the day's 24 hours, from its
 * timetable's 00:00:00, the snapshots cover (section 5, "Gaps"): the fetcher's runs seen, of 4,320, and the
 * minutes the Network's feed was working, of 1,440, those in which a run had it work as the engine judges it
 * (works()). Its Trips are those of its region's Trips file that are the Network's, in the file's order, and it
 * counts apart, by their indexes there, those its operator Cancelled, none of whose Calls has a Delay then, and
 * those live data never named, which are never on time, and the reports that name a Trip none of the days joined
 * has, as Renfe's of Trains it adds, which the engine drops, as unmatched() counts them. For each Trip, a Delay
 * for each Call, in whole seconds, early negative, or none (`null`) where there is none, and where each came from,
 * a byte (FROM, SKIPPED, LAST_KNOWN, UNCONFIRMED), or `null` for a Trip none of whose Calls has either.
 */
export interface DayRecord extends Files {
  day: string;
  commit: string;
  rules: string;
  runs: number;
  feeds: Record<string, number>;
  cancelled: number[];
  unreported: number[];
  unmatched: { reports: number; trips: number };
  delays: ((number | null)[] | null)[];
  from: ((number | null)[] | null)[];
}

/** Where a Call's Delay came from, a byte (section 1): measured from the Train's own position, carried on from its last GPS Delay, or its operator's figure. */
const FROM: Record<DelaySource, number> = { measured: 1, carried: 2, operator: 3 };

/** A Call at a Station its operator has said the Train won't stop at, which holds no Delay (#346). */
const SKIPPED = 0;

/** A last Call's Delay where its Train was no longer Live there, the last that live data gave it (pick 4). */
const LAST_KNOWN = 4;

/** Added to a byte where the Delay is a GPS Delay no report after it has confirmed (pick 5): it's kept, flagged, and left out of the aggregates. */
export const UNCONFIRMED = 8;

/** How long before a Train reaches its last Call live data can have last placed it for the Call to keep its last-known Delay, in ms (pick 4). */
const PLACED = 10 * 60_000;

/**
 * How often the map looks at its Trains as the replay has it, in ms: at each snapshot, as one arrives, and where
 * the next is later than this, as where the fetcher missed runs, between them too, so that Trains turn Scheduled
 * there as they would on a map, rather than reach every Call since at the next snapshot.
 */
const STEP = 20_000;

/** A day, in ms. */
const DAY = 86_400_000;

/**
 * Whether a Network's Trips are recorded: those whose live data the map has, but for the Metro's, whose Delay is
 * against whichever Trip its Block runs (#103). Euskotren's are, though the map shows none: a disrupted day's
 * Delays still land in the record (#825).
 */
export const recorded = (network: Network | undefined) => !!network?.live && network.id !== METRO.id;

/**
 * Each Network's record of a service day, from the snapshots of it in order, through the engine with a bundle of
 * its Trips and the days' before and after it, joined (joinDays()), as the map has them around midnight. At each
 * look (STEP) the map draws its Trains by the snapshots it has kept (KEEP), and each Call of a Trip live data has
 * named that its Train's drawn time has reached since the last look, on arrival, or at the first Call it makes on
 * departure, takes the Train's Delay then, as the follow panel has it, if it's Live, or at the last it makes, if
 * live data last placed it within PLACED. Only its first time there counts, though the Train is drawn back
 * and reaches it again; but not a time while it's Cancelled, so that a Train that runs after all keeps its Delays.
 * A Call at a Station its operator said at any look that the Train wouldn't stop at is Skipped, though running
 * late it reached the Station after Renfe had dropped it from its list, as it does once the timetable has left
 * it (Skipped's `since`). Only the recorded Networks' Trips are (recorded()).
 */
export function recordDay(bundle: Bundle, day: Day, received: Iterable<Received>): Map<string, DayRecord> {
  const networks = new Map(bundle.networks.map((n) => [n.id, n]));
  const networkOf = new Map(bundle.lines.map((l) => [l.id, networks.get(l.network)]));
  const records = new Map<string, DayRecord>();
  // Where each Trip recorded is: its Network's record, and its index in that Network's Trips.
  const placeOf = new Map<Trip, [DayRecord, number]>();
  for (const trip of day.trips) {
    const network = networkOf.get(trip.line);
    if (!network || !recorded(network)) continue;
    const record = records.get(network.id) ?? { day: day.date, ...day.files(network.id), commit: day.commit, rules: day.rules, runs: 0, feeds: {}, cancelled: [], unreported: [], unmatched: { reports: 0, trips: 0 }, delays: [], from: [] };
    records.set(network.id, record);
    placeOf.set(trip, [record, record.delays.length]);
    record.delays.push(null);
    record.from.push(null);
  }
  // A Call's Delay and byte, in its Trip's row, which comes with the first.
  const keep = (trip: Trip, c: number, delay: number | null, byte: number) => {
    const [record, i] = placeOf.get(trip) as [DayRecord, number];
    const [delays, from] = [record.delays[i] ?? trip.calls.map(() => null), record.from[i] ?? trip.calls.map(() => null)];
    [delays[c], from[c], record.delays[i], record.from[i]] = [delay, byte, delays, from];
  };
  const kept: Received[] = [];
  // Where in its timetable each Trip's Train was drawn at the last look, the Calls their Trains have reached, and
  // those their operators have said they won't stop at.
  let drawn = new Map<Trip, number>();
  const [reached, skipped] = [new Set<Call>(), new Map<Trip, Set<Call>>()];
  // The Trips live data has named, and those it has had Cancelled.
  const [heard, cancels] = [new Set<Trip>(), new Set<Trip>()];
  let last: number | undefined;
  const look = (moment: number) => {
    while ((kept[0]?.at ?? Infinity) <= moment - KEEP) kept.shift();
    const gap = last === undefined ? STEP / 1000 : (moment - last) / 1000;
    last = moment;
    const now = new Map<Trip, number>();
    for (const d of delaysAt(bundle, moment, kept)) {
      if (!placeOf.has(d.trip)) continue;
      heard.add(d.trip);
      // A Train first named now is taken to have reached only what it has since the last look.
      const was = drawn.get(d.trip) ?? d.time - gap;
      now.set(d.trip, d.time);
      if (d.cancelled) {
        cancels.add(d.trip);
        continue;
      }
      for (const call of d.skips) skipped.set(d.trip, (skipped.get(d.trip) ?? new Set()).add(call));
      const calls = d.trip.calls;
      const makes = (call: Call) => !d.skips.includes(call);
      const [first, end] = d.skips.length ? [calls.findIndex(makes), calls.findLastIndex(makes)] : [0, calls.length - 1];
      calls.forEach((call, c) => {
        const due = c === first ? call.departure : call.arrival;
        if (reached.has(call) || !(was < due && due <= d.time)) return;
        reached.add(call);
        const lastKnown = !d.live && c === end && d.placed !== undefined && d.placed <= PLACED;
        if (!makes(call) || !d.source || !(d.live || lastKnown)) return;
        keep(d.trip, c, Math.round(d.delay), (d.live ? FROM[d.source] : LAST_KNOWN) + (d.unconfirmed ? UNCONFIRMED : 0));
      });
    }
    drawn = now;
  };
  // Each Network's reports that name a Trip none of the days joined has, by the Network their Trip's ID leads with.
  const [named, lost] = [namedIn(bundle), new Map<string, Received[]>()];
  // The runs within the day's 24 hours, and the minutes of them each Network's feed worked.
  const [runs, minutes] = [new Set<number>(), new Map<string, Set<number>>()];
  for (const r of received) {
    const { generated, feeds, reports } = r.snapshot;
    if (generated >= day.noonMinus12h && generated < day.noonMinus12h + DAY) {
      runs.add(generated);
      for (const network of records.keys()) if (works(feeds[network], generated)) minutes.set(network, (minutes.get(network) ?? new Set()).add(Math.floor((generated - day.noonMinus12h) / 60_000)));
    }
    const lostNow = new Map<string, Report[]>();
    for (const report of reports) {
      const network = report.trip && !named.has(report.trip) ? report.trip.slice(0, report.trip.indexOf(':')) : undefined;
      if (!network || !records.has(network)) continue;
      const of = lostNow.get(network) ?? [];
      lostNow.set(network, of);
      of.push(report);
    }
    for (const [network, of] of lostNow) {
      const snapshots = lost.get(network) ?? [];
      lost.set(network, snapshots);
      snapshots.push({ at: r.at, snapshot: { ...r.snapshot, reports: of } });
    }
    while (last !== undefined && r.at - last > STEP * 1.5) look(last + STEP);
    kept.push(r);
    look(r.at);
  }
  for (const [trip, calls] of skipped) trip.calls.forEach((call, c) => calls.has(call) && keep(trip, c, null, SKIPPED));
  // A Trip Cancelled that ran after all, as FEVE's 71832 did on 10 October 2026 (#429), has its Delays.
  for (const [trip, [record, i]] of placeOf) {
    if (!heard.has(trip)) record.unreported.push(i);
    else if (cancels.has(trip) && !record.delays[i]?.some((delay) => delay !== null)) record.cancelled.push(i);
  }
  for (const [network, record] of records) {
    const { reports, trips } = unmatched(bundle, lost.get(network) ?? []);
    Object.assign(record, { runs: runs.size, feeds: { [network]: minutes.get(network)?.size ?? 0 }, unmatched: { reports, trips } });
  }
  return records;
}

/** The Network whose part holds what names a Train only by its number, as Renfe's long-distance live data does: the first whose live data names Trains by number, as the engine has it. */
const BY_NUMBER = AVE_LARGA_DISTANCIA.id;

/**
 * A run's snapshot as the compacted day keeps it (pick 2), a part for each Network, by their IDs, so that ending
 * TRAM's agreement deletes TRAM's files alone (section 5, "Keeping"): each with the run's `generated`, its
 * Network's feed's freshness, and the reports and Skipped Stations of its Trips, its Lines' Blocks, as the Metro's
 * are, and its Lines' Trains, as Geotren's of the rack are, in the snapshot's order. What names a Train only by its
 * number goes with BY_NUMBER's.
 * ponytail: the four fields a Snapshot has; one the fetcher adds is lost here, and from the replay, which goes by
 * the parts joined again, until it's added.
 */
export function partsOf({ generated, feeds, reports, skipped }: Snapshot): [network: string, part: Snapshot][] {
  const parts = new Map<string, Snapshot>();
  const partOf = (network: string) => {
    const part = parts.get(network) ?? { generated, feeds: {}, reports: [] };
    parts.set(network, part);
    return part;
  };
  const networkOf = (named: string | undefined) => (named ? named.slice(0, named.indexOf(':')) : BY_NUMBER);
  for (const [network, feed] of Object.entries(feeds)) partOf(network).feeds[network] = feed;
  for (const report of reports) partOf(networkOf(report.trip ?? report.block?.line ?? report.line)).reports.push(report);
  for (const skips of skipped ?? []) (partOf(networkOf(skips.trip)).skipped ??= []).push(skips);
  return [...parts].sort(([a], [b]) => (a < b ? -1 : 1));
}

/** A run's snapshot from its parts (partsOf()), in their order: its reports are each part's in turn. */
export function joinParts(parts: Snapshot[]): Snapshot {
  const skipped = parts.flatMap((p) => p.skipped ?? []);
  return { generated: parts[0]?.generated ?? NaN, feeds: Object.assign({}, ...parts.map((p) => p.feeds)), reports: parts.flatMap((p) => p.reports), ...(skipped.length > 0 && { skipped }) };
}

/**
 * A compacted day's runs, in order: each Network's file as its lines, the Networks in order of their IDs, as
 * partsOf() gives them, so that each run's parts join as they did when the day was first replayed, from its
 * chunks, and the day is worked out again to the byte (section 5, "When the Delay rules change").
 */
export function* runsOf(files: string[][]): Generator<Snapshot> {
  const heads = files.map((lines) => ({ lines, i: 0, part: undefined as Snapshot | undefined }));
  const next = (head: (typeof heads)[number]) => {
    while (head.i < head.lines.length && !head.lines[head.i]) head.i++;
    head.part = head.i < head.lines.length ? JSON.parse(head.lines[head.i++] ?? '') : undefined;
  };
  heads.forEach(next);
  for (;;) {
    const generated = Math.min(...heads.flatMap((h) => (h.part ? [h.part.generated] : [])));
    if (!Number.isFinite(generated)) return;
    const parts: Snapshot[] = [];
    for (const head of heads) {
      if (head.part?.generated !== generated) continue;
      parts.push(head.part);
      next(head);
    }
    yield joinParts(parts);
  }
}

/** The history's bucket (#806): not public, as it holds TRAM's data. */
const BUCKET = 'viapeninsula-history';

/** The bundles' bucket, behind the CDN (LIVE_URL), where the aggregates go (#808). */
const LIVE_BUCKET = 'viapeninsula-live';

/**
 * What the job writes, under the history's bucket: a service day's record of a Network, and its compacted history,
 * which a lifecycle rule on `compacted/` deletes after 400 days, as #806's deletes `history/` after 7 (pick 2). And
 * a day's bundle files, as the manifest named them when the job last ran (DayFiles), for a later run that needs
 * them once the live manifest doesn't: it names no day before yesterday, and a day's replay joins the day before.
 */
const KEYS = {
  /** The aggregates (#808), in the bundles' bucket, public beside the bundles and read through the CDN as the snapshot is (ADR-0011). */
  lines: 'punctuality/lines.json',
  linesYear: 'punctuality/lines-year.json',
  stations: 'punctuality/stations.json',
  trains: (network: string) => `punctuality/trains/${network}.json`,
  record: (date: string, network: string) => `${date}/${network}.json`,
  compacted: (date: string, network: string) => `compacted/${date}/${network}.ndjson.br`,
  files: (date: string) => `${date}/files.json`,
};

if (import.meta.main) {
  const { values } = parseArgs({ options: { day: { type: 'string' }, out: { type: 'string', default: 'out/punctuality' }, 'dry-run': { type: 'boolean' }, aggregates: { type: 'boolean' } } });
  const [date, out, dryRun] = [values.day ?? addDays(madridDate(new Date()), -1), values.out, !!values['dry-run']];
  const run = promisify(execFile);
  // An object of the history's bucket, or none where it isn't there, or can't be read twice running, which the
  // log says, with why: a token that can't read the bucket reads as every object missing. `strict`, as the
  // aggregates read, throws on any error but the object not being there, as their public files would lose a
  // Network's day and not say so (#808).
  const get = async (key: string, strict = false): Promise<Buffer | undefined> => {
    let why: unknown;
    for (const _ of [1, 2]) {
      try {
        return (await run('npx', ['wrangler', 'r2', 'object', 'get', `${BUCKET}/${key}`, '--remote', '--pipe'], { encoding: 'buffer', maxBuffer: 1 << 28 })).stdout;
      } catch (error) {
        why = error;
      }
    }
    const lines = String((why as { stderr?: Buffer })?.stderr ?? why).trim().split('\n');
    const error = lines.find((line) => line.includes('ERROR')) ?? lines[0];
    if (strict && !error?.includes('does not exist')) throw new Error(`${key} isn't read: ${error}`);
    console.warn(`${key} isn't read: ${error}`);
    return undefined;
  };
  const fetched = async <T>(key: string): Promise<T> => {
    const res = await fetch(`${LIVE_URL}/${key}`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
    return (await res.json()) as T;
  };

  // The days joined, each as the live manifest names it or, where it no longer does, as the job kept it, in out/
  // first, where a dry run of a day the bucket has no files of finds them.
  const listed = daysOf(await fetched<Manifest>('manifest.json'));
  const filesOf = async (day: string, strict = false) => {
    const named = listed.find((d) => d.date === day);
    if (named) return named;
    const local = join(out, KEYS.files(day));
    const kept = existsSync(local) ? readFileSync(local) : await get(KEYS.files(day), strict);
    return kept && (JSON.parse(kept.toString()) as DayFiles);
  };
  // Each track once: a build's days share one.
  const tracks = new Map<string, Promise<Track>>();
  const trackOf = (key: string) => {
    const track = tracks.get(key) ?? fetched<TrackFile>(key).then(decodeTrack);
    tracks.set(key, track);
    return track;
  };
  // A day's regions joined as the map joins them, and each Network's region's files, with only the recorded
  // Networks' Trips (recorded()), as the Metro's are the slowest to match, and the shapes they run on.
  const bundleOf = async ({ regions }: DayFiles): Promise<{ bundle: Bundle; files: Map<string, Files> }> => {
    const read = await Promise.all(regions.map(async (r) => ({ track: await trackOf(r.track), trips: await fetched<DayTrips>(r.trips), files: { track: r.track, trips: r.trips } })));
    const joined = { ...joinTracks(read.map((r) => r.track)), ...joinTrips(read.map((r) => r.trips)) };
    const lines = new Set(joined.lines.filter((l) => recorded(joined.networks.find((n) => n.id === l.network))).map((l) => l.id));
    const trips = joined.trips.filter((t) => lines.has(t.line));
    const shapes = new Set(trips.map((t) => t.shape));
    return {
      bundle: { ...joined, trips, shapes: joined.shapes.filter((s) => shapes.has(s.id)), strokes: [], rails: [], slots: [], tracks: [] },
      files: new Map(read.flatMap((r) => r.track.networks.map((n) => [n.id, r.files] as const))),
    };
  };

  // Brotli at quality 11 with a 16 MB window, as daily.ts squeezes the bundles but for the window, to say how big
  // each record is, and at 9 for the compacted day: 11 took more than 8 minutes for 17 October 2026's 279 MB.
  const brotli = (text: string, quality = 11) => brotliCompressSync(text, { params: { [constants.BROTLI_PARAM_QUALITY]: quality, [constants.BROTLI_PARAM_LGWIN]: 24, [constants.BROTLI_PARAM_SIZE_HINT]: text.length } });
  const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

  /**
   * The aggregates (#808) of the 30 days to the service day before today in Madrid, whichever day the job records,
   * so that a Delay rule's change re-running the last 30 leaves them whole: each day's records as out/ has them,
   * where this run wrote them, or the bucket, with their Trips, as their Networks' are in their region's Trips
   * file, and the Lines' year from the year file the CDN serves. Into out/live/, and the bundles' bucket, squeezed.
   */
  const aggregates = async () => {
    const last = addDays(madridDate(new Date()), -1);
    const summaries: DaySummary[] = [];
    for (let n = -29; n <= 0; n++) {
      const day = addDays(last, n);
      if (!(await filesOf(day, true))) continue;
      // A day's records at once, and each Trips file once: Rodalies', FGC's and TRAM's are Catalonia's.
      const networks = NETWORKS.filter(recorded).map((n) => n.id);
      const bodies = await Promise.all(networks.map((network) => (existsSync(join(out, KEYS.record(day, network))) ? readFileSync(join(out, KEYS.record(day, network))) : get(KEYS.record(day, network), true))));
      const tripsFiles = new Map<string, Promise<DayTrips>>();
      for (const [i, network] of networks.entries()) {
        const body = bodies[i];
        if (!body) continue;
        const record = JSON.parse(body.toString()) as DayRecord;
        const file = tripsFiles.get(record.trips) ?? fetched<DayTrips>(record.trips);
        tripsFiles.set(record.trips, file);
        summaries.push(summarize(network, record, (await file).trips.filter((t) => t.line.startsWith(`${network}:`))));
      }
    }
    const { lines, stations, trains } = aggregate(summaries);
    const res = await fetch(`${LIVE_URL}/${KEYS.linesYear}`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok && res.status !== 404) throw new Error(`${KEYS.linesYear}: HTTP ${res.status}`);
    const files: [string, object][] = [[KEYS.lines, lines], [KEYS.linesYear, yearOf(res.ok ? ((await res.json()) as LinesFile) : undefined, lines)], [KEYS.stations, stations], ...[...trains].map(([network, file]): [string, object] => [KEYS.trains(network), file])];
    console.log(`The aggregates of ${lines.days.join(', ')}${Object.keys(lines.gaps).length ? `, leaving out ${Object.entries(lines.gaps).map(([network, days]) => `${network}'s ${days.join(', ')}`).join('; ')}` : ''}`);
    for (const [key, content] of files) {
      const json = JSON.stringify(content);
      const br = brotli(json);
      await mkdir(dirname(join(out, 'live', key)), { recursive: true });
      await writeFile(join(out, 'live', key), json);
      await writeFile(join(out, 'live', `${key}.br`), br);
      console.log(`${key}: ${kb(json.length)}, ${kb(br.length)} with brotli`);
    }
    // Rewritten each day, as daily.ts' manifest and report are each build, which the CDN keeps an hour.
    if (!dryRun) {
      for (const [key] of files) execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${LIVE_BUCKET}/${key}`, '--remote', '--file', join(out, 'live', `${key}.br`), '--content-type', 'application/json', '--content-encoding', 'br', '--cache-control', 'public, max-age=3600'], { stdio: 'inherit' });
    }
  };
  if (values.aggregates) {
    await aggregates();
    process.exit();
  }

  const [dayBefore, theDay, dayAfter] = await Promise.all(
    [-1, 0, 1].map(async (n) => {
      const files = await filesOf(addDays(date, n));
      if (!files) console.warn(`${addDays(date, n)}'s bundle isn't known: the replay goes without its Trips`);
      return files && bundleOf(files);
    }),
  );
  if (!theDay) throw new Error(`Neither the manifest nor the history's bucket names ${date}'s bundle`);
  const { bundle } = theDay;
  const joined = joinDays([dayBefore?.bundle, bundle, dayAfter?.bundle].filter((b) => b !== undefined));
  const offset = dayBefore?.bundle.trips.length ?? 0;
  const commit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const rules = createHash('sha256').update(await readFile(new URL('../engine.ts', import.meta.url))).digest('hex').slice(0, 12);
  const files = (network: string) => {
    const known = theDay.files.get(network);
    if (!known) throw new Error(`No region of ${date}'s has ${network}`);
    return known;
  };
  const day: Day = { date, noonMinus12h: bundle.noonMinus12h, trips: joined.trips.slice(offset, offset + bundle.trips.length), files, commit, rules };

  // From an hour before the day's first recorded Train comes onto the map to an hour after its last leaves it, as
  // the map keeps a day's bundle (SOON, LATE).
  const times = bundle.trips.flatMap((t) => [t.calls[0]?.arrival ?? NaN, t.calls.at(-1)?.departure ?? NaN]);
  const [start, end] = [bundle.noonMinus12h + Math.min(...times) * 1000 - SOON, bundle.noonMinus12h + Math.max(...times) * 1000 + LATE];
  // The fetcher puts a slot at its first run after the slot ends.
  const ready = end - (end % SLOT) + SLOT + 60_000;
  if (Date.now() < ready) {
    console.log(`${date}'s history is all there at ${new Date(ready).toISOString()}: waiting ${Math.ceil((ready - Date.now()) / 60_000)} minutes`);
    await sleep(ready - Date.now());
  }

  // The day's runs. Once compacted, the day is replayed from its compacted files, which are never written again,
  // so that a run that finds fewer of its chunks, as one near their 7 days, can't shorten them; then only the
  // Networks whose compacted file is read are recorded, so that one it can't read keeps its record. Until then,
  // from the fetcher's chunks, eight at a time into out/, where a dry run finds them the next time.
  const compactedFiles = new Map<string, string[]>();
  const networkIds = bundle.networks.map((n) => n.id).sort();
  const bodies = await Promise.all(networkIds.map((network) => (existsSync(join(out, KEYS.compacted(date, network))) ? readFileSync(join(out, KEYS.compacted(date, network))) : get(KEYS.compacted(date, network)))));
  bodies.forEach((body, i) => body && compactedFiles.set(networkIds[i] as string, brotliDecompressSync(body).toString().split('\n')));
  const slots: string[] = [];
  for (let slot = start - (start % SLOT); slot <= end; slot += SLOT) slots.push(nameOf(slot));
  const chunks: (string | undefined)[] = [];
  for (let i = 0; i < slots.length && !compactedFiles.size; i += 8) {
    const batch = slots.slice(i, i + 8).map(async (key) => {
      const file = join(out, key);
      if (existsSync(file)) return file;
      const body = await get(key);
      if (!body) return undefined;
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, body);
      return file;
    });
    chunks.push(...(await Promise.all(batch)));
  }
  function* fromChunks(): Generator<Snapshot> {
    for (const chunk of chunks) for (const line of chunk ? gunzipSync(readFileSync(chunk)).toString().split('\n') : []) if (line) yield JSON.parse(line);
  }
  if (compactedFiles.size) console.log(`${date}: from its compacted files, ${compactedFiles.size} Networks'`);
  else {
    const missing = slots.filter((_, i) => !chunks[i]);
    if (missing.length === slots.length) throw new Error(`The history's bucket has neither the fetcher's chunks of ${date} nor its compacted files: nothing is written`);
    console.log(`${date}: ${slots.length - missing.length} of ${slots.length} slots of the fetcher's history${missing.length ? `, but for ${missing.join(', ')}` : ''}`);
  }
  const runs = compactedFiles.size ? runsOf([...compactedFiles.values()]) : fromChunks();

  // Each run's snapshot, in order, as its parts by Network joined again, so that a day replayed from its compacted
  // files is replayed as this one is, each part a line of its Network's. A run twice, as a slot put again could
  // have it, is replayed once.
  const compacted = new Map<string, string[]>();
  function* snapshots(): Generator<Received> {
    let last = -Infinity;
    for (const snapshot of runs) {
      if (snapshot.generated <= last) continue;
      last = snapshot.generated;
      const parts = partsOf(snapshot);
      for (const [network, part] of parts) {
        const lines = compacted.get(network) ?? [];
        compacted.set(network, lines);
        lines.push(JSON.stringify(part));
      }
      const replayed = joinParts(parts.map(([, part]) => part));
      yield { snapshot: replayed, at: replayed.generated };
    }
  }
  const started = performance.now();
  const records = recordDay(joined, day, snapshots());
  console.log(`Replayed in ${Math.round((performance.now() - started) / 1000)} s`);

  const written: [key: string, contentType: string][] = [];
  const write = async (key: string, body: string | Buffer, contentType: string) => {
    await mkdir(dirname(join(out, key)), { recursive: true });
    await writeFile(join(out, key), body);
    written.push([key, contentType]);
  };
  for (const [network, record] of records) {
    if (compactedFiles.size && !compactedFiles.has(network)) {
      console.warn(`${KEYS.record(date, network)} is left as it is: its Network's compacted file isn't read`);
      continue;
    }
    const json = JSON.stringify(record);
    await write(KEYS.record(date, network), json, 'application/json');
    const calls = record.delays.reduce((n, delays) => n + (delays?.filter((d) => d !== null).length ?? 0), 0);
    console.log(`${KEYS.record(date, network)}: ${record.delays.length} Trips, ${calls} Calls with a Delay, ${kb(json.length)}, ${kb(brotli(json).length)} with brotli; ${record.runs} runs, the feed ${record.feeds[network]} minutes`);
  }
  if (!compactedFiles.size) for (const [network, lines] of compacted) await write(KEYS.compacted(date, network), brotli(`${lines.join('\n')}\n`, 9), 'application/x-ndjson');
  for (const files of listed) await write(KEYS.files(files.date), JSON.stringify(files), 'application/json');
  if (!dryRun) {
    for (const [key, contentType] of written) execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--remote', '--file', join(out, key), '--content-type', contentType], { stdio: 'inherit' });
  }
  await aggregates();
}
