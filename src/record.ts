// Records live data for the tests' fixtures (#31): the production snapshots as the map receives
// them, every 20 s for a quarter of an hour, with Renfe's two feeds fetched beside each, and that
// day's bundle cut down to the Trips the replay needs. `npm run record -- <dir> [minutes]` writes to <dir>:
//
// - vehicle_positions.json and trip_updates.json, as Renfe served them at the start, where it did,
//   which src/fetcher/fixtures/ keeps cut down to Rodalies' Trips and a few of other núcleos';
// - renfe.ndjson.gz, those two feeds again at every step, as the fetcher reads them each run (#364):
//   a line a step, `{ at, positions, updates }`, gzipped, in the order they came, with `at` in ms
//   since 1970, as a snapshot's is in replay.json.gz, and each feed as its file parses, left out of
//   the line where its fetch failed, and the line where both did. A line can lack Madrid's Trains
//   whole, as Renfe drops them from about one fetch in five (docs/research/live-at-scale.md);
// - alerts.json, the operators' Alerts as the map reads them, once at the start, where they came,
//   which the Closures are made from (closuresAt()), as #345's count of the Trains inside one needs;
// - bundle.json, the whole bundle the replay is of, which the tests cut their Trips from: that day's,
//   and where the last snapshot falls after midnight in Madrid, the next day's joined with it as the
//   map joins them (#411), so that the Trains Renfe names by the next day's service after midnight
//   find their Trips, the first day's Trips led by their day, `2026-10-06/<id>`, as joinDays() has them;
// - replay.json.gz, `{ bundle, received }` gzipped, what `jumps()` and `trainsAt()` take: the shapes
//   alone are megabytes. The engine tests keep those they pin in src/fixtures/, each named for its day.
//
// It needs no key: Renfe's feeds, the bundles, the Alerts and the snapshot are all public.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { addDays, daysOf, joinTracks, joinTrips, LIVE_URL, madridDate, type Bundle, type DayFiles, type DayTrips, type Manifest, type Snapshot, type Trip } from './bundle.ts';
import { joinDays, namedIn, numberedIn, trainsAt, type Received } from './engine.ts';
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
  // A report can be about any Trip of its ID, or of its Train number where it names no ID, and the engine picks the one whose timetable runs nearest when it was reported (reportsByTrip()): keep each.
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
 * How many reports the snapshots make of a Trip the bundle has none of, and of how many Trips, as
 * Renfe's of a Train that starts after midnight are, named by the next day's service, in the bundle of
 * the day before alone (#411): the engine drops them. A report is counted once however many
 * snapshots repeat it, by its Trip and the time its operator made it. A report the engine finds its
 * Trip by otherwise isn't one: a Metro Block's, a rack Train's by its Line and the end of its ID,
 * and a long-distance Train's by its number.
 */
export function unmatched(bundle: Bundle, received: Received[]): { reports: number; trips: number } {
  const named = namedIn(bundle);
  const lost = new Map<string, Set<number>>();
  for (const { snapshot } of received) {
    for (const { trip, line, at } of snapshot.reports) if (trip && !line && !named.has(trip)) lost.set(trip, (lost.get(trip) ?? new Set<number>()).add(at));
  }
  return { reports: [...lost.values()].reduce((sum, times) => sum + times.size, 0), trips: lost.size };
}

/**
 * The bundle a recording is cut over (#411): the day it started on, `first`, and where its last
 * snapshot, `last` in ms since 1970, falls after midnight in Madrid, the next day's joined to it as
 * the map joins them (joinDays()), from the manifest's `days` through `load`, so that the Trains
 * Renfe names by the next day's service after midnight find their Trips. Where the manifest has no
 * bundle for that day, or it doesn't come, the day's alone, and `why` says so for the last line.
 * ponytail: forward only, so a recording that starts after midnight has its own day's alone and the
 * Trains still running from the day before match no Trip; join the day before's too if that shows.
 */
export async function withNextDay(first: Bundle, today: string, last: number, days: DayFiles[], load: (day: DayFiles) => Promise<Bundle>): Promise<{ bundle: Bundle; why: string }> {
  if (madridDate(new Date(last)) <= today) return { bundle: first, why: '' };
  const tomorrow = addDays(today, 1);
  const files = days.find((d) => d.date === tomorrow);
  const next = files && (await load(files).catch((error) => void console.warn(error)));
  if (next) return { bundle: joinDays([first, next]), why: '' };
  return { bundle: first, why: ` (its snapshots go past midnight, and ${files ? `${tomorrow}'s bundle didn't come` : `the manifest has no bundle for ${tomorrow}`})` };
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
  // one an audit leaves running in Actions does (#233).
  const RENFE = { positions: 'https://gtfsrt.renfe.com/vehicle_positions.json', updates: 'https://gtfsrt.renfe.com/trip_updates.json' };
  try {
    const [positions, updates] = await Promise.all([get(RENFE.positions), get(RENFE.updates)]);
    await writeFile(join(dir, 'vehicle_positions.json'), positions);
    await writeFile(join(dir, 'trip_updates.json'), updates);
    console.log(`Renfe's feeds recorded at ${new Date().toISOString()}`);
  } catch (error) {
    console.warn(`Renfe's feeds not recorded: ${error}`);
  }

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
  // one. And with each look, Renfe's feeds as they parse, in a line (#364), fetched beside it and not
  // waited for, so that a Renfe that's slow doesn't hold the next look up.
  const feed = (url: string) => get(url).then((text) => JSON.parse(text) as unknown).catch((error) => void console.warn(error));
  const received: Received[] = [];
  const renfe: string[] = [];
  const looks: Promise<void>[] = [];
  for (const end = Date.now() + Number(minutes) * 60_000; Date.now() < end; await new Promise((done) => setTimeout(done, 20_000))) {
    looks.push(
      Promise.all([feed(RENFE.positions), feed(RENFE.updates)]).then(([positions, updates]) => {
        if (positions || updates) renfe.push(JSON.stringify({ at: Date.now(), positions, updates }));
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
  if (renfe.length) await writeFile(join(dir, 'renfe.ndjson.gz'), gzipSync(`${renfe.join('\n')}\n`));

  const { bundle, why } = await withNextDay(first, today, received.at(-1)?.at ?? 0, days, bundleOf);
  await writeFile(join(dir, 'bundle.json'), JSON.stringify(bundle));

  const replay = cut(bundle, received);
  await writeFile(join(dir, 'replay.json.gz'), gzipSync(JSON.stringify({ bundle: replay, received })));
  const lost = unmatched(bundle, received);
  console.log(`replay.json.gz: ${received.length} snapshots, ${replay.trips.length} of ${bundle.trips.length} Trips; ${lost.reports} reports of ${lost.trips} Trips name no Trip of the bundle${why}`);
}
