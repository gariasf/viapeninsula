// Records live data for the tests' fixtures (#31): the production snapshots as the map receives
// them, every 20 s for a quarter of an hour, with Renfe's four feeds fetched beside each, and that
// day's bundle cut down to the Trips the replay needs. `npm run record -- <dir> [minutes]` writes to <dir>:
//
// - vehicle_positions.json and trip_updates.json, as Renfe served them at the start, where it did,
//   which src/fetcher/fixtures/ keeps cut down to Rodalies' Trips and a few of other núcleos', and
//   vehicle_positions_LD.json and trip_updates_LD.json, its long-distance pair, whose Trains it names
//   by Train number (#261, #550). A file that didn't come is left out, the others kept;
// - renfe.ndjson.gz, those four feeds again at every step, as the fetcher reads them (#364, #550): a
//   line a step, `{ at, positions, updates, positionsLD, updatesLD }`, gzipped, in the order they
//   came, with `at` in ms since 1970, as a snapshot's is in replay.json.gz, and each feed as its file
//   parses, left out of the line where its fetch failed, and the line where all did. Each line has
//   the long-distance pair as Renfe served it then, where the fetcher reads it every other run: a
//   replay that wants its cadence takes every other line. A line can lack Madrid's Trains whole, as
//   Renfe drops them from about one fetch in five (docs/research/live-at-scale.md);
// - alerts.json, the operators' Alerts as the map reads them, once at the start, where they came,
//   which the Closures are made from (closuresAt()), as #345's count of the Trains inside one needs;
// - bundle.json, the whole bundle the replay is of, which the tests cut their Trips from: that day's,
//   joined with the other days the map would have had at the first snapshot and at the last
//   (daysNeeded(), #411, #549): the day before's, until an hour after its last Train is due off the
//   map, where the recording starts after midnight, and the next day's from an hour before its first
//   comes onto it, so that the Trains Renfe names by another day's service find their Trips, the
//   earlier days' Trips led by their day, `2026-10-06/<id>`, as joinDays() has them;
// - replay.json.gz, `{ bundle, received }` gzipped, what `jumps()` and `trainsAt()` take: the shapes
//   alone are megabytes. The engine tests keep those they pin in src/fixtures/, each named for its day.
//
// It needs no key: Renfe's feeds, the bundles, the Alerts and the snapshot are all public.

import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { daysNeeded, daysOf, joinTracks, joinTrips, LATE, LIVE_URL, madridDate, SOON, type Bundle, type DayFiles, type DayTrips, type Manifest, type Snapshot, type Trip } from './bundle.ts';
import { joinDays, namedIn, numberedIn, trainsAt, type Received } from './engine.ts';
import type { GtfsRt } from './fetcher/step.ts';
import { decodeTrack, type TrackFile } from './pieces.ts';

/**
 * A recording's bundle cut down to the Trips its replay needs: those its snapshots name, by their IDs
 * or, as Renfe's long-distance reports do, by their Train numbers, on whichever of the days joined
 * (joinDays()) they run, though no Train runs them, as a Cancelled one's doesn't (#427); and those
 * Live at any second of the replay: the Metro's Blocks name none. And every Trip a Block could run, on
 * its Line within an hour of the replay (the engine matches within half an hour): cutting one a Block
 * ran while it was off the map, such as waiting at its first Station, would have the Block run another.
 */
export function cut(bundle: Bundle, received: Received[]): Bundle {
  const [named, numbered] = [namedIn(bundle), numberedIn(bundle)];
  // A report can be about any Trip of its ID, or of its Train number where it names no ID, and the
  // engine picks the one whose timetable runs nearest when it was reported (reportsByTrip()): keep each.
  const kept = new Set(received.flatMap((r) => r.snapshot.reports.flatMap((report) => (report.trip ? (named.get(report.trip) ?? []) : (numbered.get(report.number ?? '') ?? [])).map((t) => t.id))));
  for (let at = received[0]?.at ?? 0; at <= (received.at(-1)?.at ?? 0); at += 1000) {
    for (const train of trainsAt(bundle, at, received.filter((r) => r.at <= at))) if (train.live) kept.add(train.trip.id);
  }
  const blockLines = new Set(received.flatMap((r) => r.snapshot.reports.flatMap((report) => (report.block ? [report.block.line] : []))));
  const [from = 0, to = 0] = [received[0]?.at ?? 0, received.at(-1)?.at ?? 0].map((at) => (at - bundle.noonMinus12h) / 1000);
  const blockCouldRun = ({ line, calls }: Trip) => blockLines.has(line) && (calls[0]?.arrival ?? Infinity) < to + 3600 && (calls.at(-1)?.departure ?? -Infinity) > from - 3600;
  const trips = bundle.trips.filter((t) => kept.has(t.id) || blockCouldRun(t));
  const [lines, shapes] = [new Set(trips.map((t) => t.line)), new Set(trips.map((t) => t.shape))];
  return {
    ...bundle,
    lines: bundle.lines.filter((l) => lines.has(l.id)),
    stations: [],
    shapes: bundle.shapes.filter((s) => shapes.has(s.id)),
    strokes: [],
    rails: [],
    slots: [],
    trips,
  };
}

/**
 * One of Renfe's buses, by the Trip a report names: a Cercanías Trip's ID is its service and its
 * Train number, the five digits after the four digits and the letter of the service, as in
 * `cercanias-madrid:1081S80030C8b`, and a bus's begins with 8 (#567). None of the 101,906 rail Trips of
 * Renfe's file of 10 October 2026 has one, and 10,444 of its 11,224 bus Trips, `route_type` 3, do. A
 * bus isn't a Train (CONTEXT): the build leaves it out, so no report of it can name a Trip of the bundle.
 * ponytail: the 780 others are León's `…BUS`, whose numbers begin with 0, and count as rail Trips here:
 * none was named in the ten recordings of 6, 7 and 10 October. Match their ending too if one is.
 */
const BUS = /^[a-z-]+:\d{4}[A-Z]8\d{4}/;

/**
 * How many reports the snapshots make of a Trip the bundle has none of, and of how many Trips, as
 * Renfe's of a Train that starts after midnight are, named by the next day's service, in the bundle of
 * the day before alone (#411): the engine drops them. A report is counted once however many
 * snapshots repeat it, by its Trip and the time its operator made it. A report the engine finds its
 * Trip by otherwise isn't one: a Metro Block's, a rack Train's by its Line and the end of its ID,
 * and a long-distance Train's by its number. Nor is one of a bus of Renfe's (BUS), which no bundle
 * has: it's left out of both counts, and `buses` says how many Trips they were.
 */
export function unmatched(bundle: Bundle, received: Received[]): { reports: number; trips: number; buses: number } {
  const named = namedIn(bundle);
  const [lost, buses] = [new Map<string, Set<number>>(), new Set<string>()];
  for (const { snapshot } of received) {
    for (const { trip, line, at } of snapshot.reports) {
      if (!trip || line || named.has(trip)) continue;
      if (BUS.test(trip)) buses.add(trip);
      else lost.set(trip, (lost.get(trip) ?? new Set<number>()).add(at));
    }
  }
  return { reports: [...lost.values()].reduce((sum, times) => sum + times.size, 0), trips: lost.size, buses: buses.size };
}

/**
 * A line of renfe.ndjson.gz: when Renfe's feeds had all come or failed, in ms since 1970, and each as
 * it parsed: its Cercanías pair and its long-distance pair (#550), left out where its fetch failed.
 */
export interface RenfeLine {
  at: number;
  positions?: GtfsRt;
  updates?: GtfsRt;
  positionsLD?: GtfsRt;
  updatesLD?: GtfsRt;
}

/**
 * How many Trips Renfe's trip updates ADD over a recording, once each however many steps list them,
 * that no snapshot names: `scheduleRelationship` ADDED, `SPECIAL_10_91065C4A`, a `routeId` and all
 * the stops with times, as for a Madrid C4a Train that no timetable has. The fetcher drops them, as
 * an ID that starts with no núcleo's code goes to none of its Networks (renfeTrip()), so they're in
 * no report, and no count of unmatched()'s (#567). Those of the Cercanías pair alone: a long-distance
 * Train is named by its number, which no report's `trip` is, so an ADDED one has no ID to set against
 * the snapshots'. None has been seen in its files.
 */
export function added(renfe: RenfeLine[], received: Received[]): number {
  const named = new Set(received.flatMap(({ snapshot }) => snapshot.reports.flatMap(({ trip }) => (trip ? [trip.slice(trip.indexOf(':') + 1)] : []))));
  const ids = renfe.flatMap(({ updates }) => (updates?.entity ?? []).flatMap(({ tripUpdate }) => (tripUpdate?.trip?.scheduleRelationship === 'ADDED' && tripUpdate.trip.tripId ? [tripUpdate.trip.tripId.trim()] : [])));
  return new Set(ids.filter((id) => !named.has(id))).size;
}

/**
 * The bundle a recording is cut over (#411, #549): the days the map would have had at the recording's
 * first snapshot and at its last (daysNeeded()), joined as the map joins them (joinDays()), so that
 * the Trains Renfe names by the next day's service after midnight find their Trips, and so do those
 * still running from the day before, which keep its service in their names until they're off the
 * map. The recording has `first`, the bundle of `today`, the date it started on, and the manifest's
 * `days` give the others, through `load`, over the map's hours (SOON, LATE), though not its `emptyBoard`,
 * the next day a viewer's empty board asks for. A day the manifest has none of for the date of a snapshot,
 * or whose bundle doesn't come, is left out, and `why` says so for the last line.
 * ponytail: the days at the first and last snapshot alone, as #549 has it, so a day that comes onto
 * the map and leaves it between them is missed, which none does within a recording of 100 minutes:
 * ask daysNeeded() at each snapshot if one shows.
 */
export async function withDays(first: Bundle, today: string, received: Received[], days: DayFiles[], load: (day: DayFiles) => Promise<Bundle>): Promise<{ bundle: Bundle; why: string }> {
  const moments = [received[0], received.at(-1)].flatMap((r) => (r ? [r.at] : []));
  const dates = [...new Set([today, ...moments.flatMap((at) => daysNeeded(days, at, { early: SOON, late: LATE })?.days.map((d) => d.date) ?? [])])].sort();
  const bundles = await Promise.all(
    dates.map(async (date) => {
      const files = days.find((d) => d.date === date);
      return date === today ? first : files && (await load(files).catch((error) => void console.warn(error)));
    }),
  );
  const why = [
    ...[...new Set(moments.map((at) => madridDate(new Date(at))))].filter((date) => !days.some((d) => d.date === date)).map((date) => `the manifest has no bundle for ${date}`),
    ...dates.filter((_, i) => !bundles[i]).map((date) => `${date}'s bundle didn't come`),
  ];
  return { bundle: joinDays(bundles.filter((bundle) => bundle !== undefined)), why: why.length ? ` (${why.join(', and ')})` : '' };
}

if (import.meta.main) {
  const [dir, minutes = '15'] = process.argv.slice(2);
  if (!dir) throw new Error('Usage: npm run record -- <dir> [minutes]');
  await mkdir(dir, { recursive: true });

  // As a browser on the site asks, so the CDN serves the copy viewers get (it varies by Origin).
  const get = async (url: string) => {
    const res = await fetch(url, { headers: { Origin: 'https://viapeninsula.gariasf.com' }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return res.text();
  };

  // Renfe's feeds are for the fixtures and the audits alone, so a recording goes on without them, as
  // one an audit leaves running in Actions does (#233), and without any that doesn't come, each file
  // by itself: its Cercanías pair, and the long-distance pair of the Trains it names by number (#550).
  const RENFE = {
    positions: 'https://gtfsrt.renfe.com/vehicle_positions.json',
    updates: 'https://gtfsrt.renfe.com/trip_updates.json',
    positionsLD: 'https://gtfsrt.renfe.com/vehicle_positions_LD.json',
    updatesLD: 'https://gtfsrt.renfe.com/trip_updates_LD.json',
  };
  await Promise.all(
    Object.values(RENFE).map(async (url) => {
      const file = basename(url);
      try {
        await writeFile(join(dir, file), await get(url));
        console.log(`${file} recorded at ${new Date().toISOString()}`);
      } catch (error) {
        console.warn(`${file} not recorded: ${error}`);
      }
    }),
  );

  // The Alerts the map reads, at the start, which a recording's Closures are made from (#364).
  // ponytail: once, so an Alert that comes or goes while it records is missed; keep each change in a
  // file of its own if that matters.
  try {
    await writeFile(join(dir, 'alerts.json'), await get(`${LIVE_URL}/alerts.json`));
  } catch (error) {
    console.warn(`The Alerts not recorded: ${error}`);
  }

  const today = madridDate(new Date());
  const days = daysOf(JSON.parse(await get(`${LIVE_URL}/manifest.json`)) as Manifest);
  const day = days.find((d) => d.date === today);
  if (!day) throw new Error(`The manifest has no bundle for ${today}: publish it with \`npm run daily\` first`);
  // A day's regions' tracks and Trips, joined as the map joins them: each track read back from its pieces (decodeTrack()).
  const bundleOf = async ({ regions }: DayFiles): Promise<Bundle> => {
    const files = await Promise.all(regions.map(async (r) => [decodeTrack(JSON.parse(await get(`${LIVE_URL}/${r.track}`)) as TrackFile), JSON.parse(await get(`${LIVE_URL}/${r.trips}`)) as DayTrips] as const));
    return { ...joinTracks(files.map(([track]) => track)), ...joinTrips(files.map(([, trips]) => trips)) };
  };
  const first = await bundleOf(day);

  // As the map does: each look for live data records the snapshot got, or where none came, the last
  // one. And with each look, Renfe's four feeds as they parse, in a line (#364, #550), fetched beside
  // it and not waited for, so that a Renfe that's slow doesn't hold the next look up.
  const feed = (url: string) => get(url).then((text) => JSON.parse(text) as GtfsRt).catch((error) => void console.warn(error));
  const received: Received[] = [];
  const renfe: RenfeLine[] = [];
  const looks: Promise<void>[] = [];
  for (const end = Date.now() + Number(minutes) * 60_000; Date.now() < end; await new Promise((done) => setTimeout(done, 20_000))) {
    looks.push(
      Promise.all([feed(RENFE.positions), feed(RENFE.updates), feed(RENFE.positionsLD), feed(RENFE.updatesLD)]).then(([positions, updates, positionsLD, updatesLD]) => {
        if (positions || updates || positionsLD || updatesLD) renfe.push({ at: Date.now(), positions, updates, positionsLD, updatesLD });
      }),
    );
    let snapshot: Snapshot | undefined;
    try {
      snapshot = JSON.parse(await get(`${LIVE_URL}/snapshot.json`));
    } catch (error) {
      console.warn(error);
      snapshot = received.at(-1)?.snapshot;
    }
    if (snapshot) received.push({ snapshot, at: Date.now() });
    console.log(`${received.length} snapshots, ${renfe.length} of Renfe's feeds`);
  }
  await Promise.all(looks);
  if (renfe.length) await writeFile(join(dir, 'renfe.ndjson.gz'), gzipSync(`${renfe.map((line) => JSON.stringify(line)).join('\n')}\n`));

  const { bundle, why } = await withDays(first, today, received, days, bundleOf);
  await writeFile(join(dir, 'bundle.json'), JSON.stringify(bundle));

  const replay = cut(bundle, received);
  await writeFile(join(dir, 'replay.json.gz'), gzipSync(JSON.stringify({ bundle: replay, received })));
  const lost = unmatched(bundle, received);
  const specials = renfe.length ? `; ${added(renfe, received)} Trips Renfe ADDED are named by no snapshot` : '';
  console.log(`replay.json.gz: ${received.length} snapshots, ${replay.trips.length} of ${bundle.trips.length} Trips; ${lost.reports} reports of ${lost.trips} Trips name no Trip of the bundle, leaving out ${lost.buses} of Renfe's buses (Train numbers that begin with 8)${specials}${why}`);
}
