import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PbfWriter } from 'pbf';
import { expect, test } from 'vitest';
import type { Snapshot } from '../bundle.ts';
import { unavailable } from '../engine.ts';
import { LIVE_SOURCES } from '../networks.ts';
import { fetchDue, START, step, TIMEOUT, UNSET, type Fetched, type FgcOwn, type FgcResponses, type Get, type RenfeResponses, type Responses, type State, type Stored, type TramOwn, type TramResponses } from './step.ts';

// Renfe's Cercanías feeds as recorded at 15:57 on Friday 25 September 2026, cut down to Rodalies'
// Trains and a few of other núcleos'.
const recorded = (file: string) => ({ status: 200, body: readFileSync(new URL(`fixtures/${file}`, import.meta.url), 'utf8') });
const RENFE = { positions: recorded('vehicle_positions.json'), updates: recorded('trip_updates.json') };

/** When the run fetched them. */
const NOW = Date.parse('2026-09-25T15:57:11+02:00');

/** The fetcher's first run, fetching Renfe's feeds. */
const run = (renfe: RenfeResponses = RENFE) => step(START.state, { renfe }, NOW);

test("makes one report for each Rodalies Train in Renfe's feeds, and none for other núcleos' Trains", () => {
  const trips = run().snapshot.reports.map((r) => r.trip);
  expect(trips).toHaveLength(67);
  expect(new Set(trips).size).toBe(trips.length);
  expect(trips.filter((t) => !t?.startsWith('rodalies:51'))).toEqual([]);
});

/** What the run reports about a Trip. */
const report = (trip: string) => run().snapshot.reports.find((r) => r.trip === `rodalies:${trip}`);

test('gives a Train running between Stations its GPS position, and one standing at or coming into a Station only that Station', () => {
  // IN_TRANSIT_TO, between Sils and Caldes de Malavella.
  expect(report('5166V15261RG1')?.position).toEqual({ lon: 2.775004, lat: 41.82224 });
  // STOPPED_AT La Granada, and INCOMING_AT Granollers Centre: Renfe pins both to the Station's coordinates.
  expect(report('5166V77538R4')?.position).toEqual({ near: 'adif:72205' });
  expect(report('5166V28444R2N')?.position).toEqual({ near: 'adif:79100' });
  // Of the 57 Trains Renfe places, 18 are in transit.
  const positions = run().snapshot.reports.map((r) => r.position);
  expect(positions.filter((p) => p && 'lon' in p)).toHaveLength(18);
  expect(positions.filter((p) => p && 'near' in p)).toHaveLength(39);
});

test("gives a Train no position where Renfe knows no Station for it, as its stop 00000 says", () => {
  // Made up: the R4 at a stop Renfe gives as 00000, which the research found once in 343 stops.
  const positions = { ...RENFE.positions, body: RENFE.positions.body.replace('"stopId": "72205"', '"stopId": "00000"') };
  expect(run({ ...RENFE, positions }).snapshot.reports.find((r) => r.trip === 'rodalies:5166V77538R4')?.position).toBeUndefined();
});

test('gives each Train the time Renfe reported it and the Delay of its trip update', () => {
  const reported = Date.parse('2026-09-25T15:57:06+02:00');
  expect(report('5166V15261RG1')).toEqual({ trip: 'rodalies:5166V15261RG1', at: reported, position: { lon: 2.775004, lat: 41.82224 }, delay: 60 });
  expect(report('5166V28444R2N')).toEqual({ trip: 'rodalies:5166V28444R2N', at: reported, position: { near: 'adif:79100' }, delay: -60 });
});

test('marks a Train Cancelled when Renfe cancels its Trip', () => {
  // Renfe cancels a Trip with a trip update that says only that, as it does eleven of Rodalies' here,
  // and another núcleo's 4666V70155C1. It still places one of their Trains, coming into Mataró.
  const { reports } = run().snapshot;
  expect(reports).toContainEqual({ trip: 'rodalies:5166V77640R4', at: Date.parse('2026-09-25T15:57:09+02:00'), cancelled: true });
  expect(reports).toContainEqual({ trip: 'rodalies:5166V25756R1', at: Date.parse('2026-09-25T15:57:06+02:00'), cancelled: true, position: { near: 'adif:79500' } });
  expect(reports.filter((r) => r.cancelled)).toHaveLength(11);
});

test("trims IDs padded with spaces, as they are in Renfe's timetable", () => {
  const pad = ({ status, body }: typeof RENFE.positions) => ({ status, body: body.replace(/"(tripId|stopId)": "([^"]*)"/g, '"$1": "  $2  "') });
  expect(run({ positions: pad(RENFE.positions), updates: pad(RENFE.updates) }).snapshot.reports).toEqual(run().snapshot.reports);
});

test('writes a snapshot of a few kilobytes, as the CDN compresses it', () => {
  // These 67 Trains take 989 bytes.
  expect(gzipSync(JSON.stringify(run().snapshot)).length).toBeLessThan(2000);
});

test("records when Renfe's feeds were last tried and last read, how the last try went, and how often they're tried", () => {
  const fine = { lastSuccess: NOW, lastAttempt: NOW, status: 'ok', every: 20_000 };
  expect(run().snapshot.feeds.rodalies).toEqual(fine);
  expect(run().state.freshness).toEqual({ renfe: fine });

  // Each run after, 20 s apart, finds one of the feeds down, garbled or empty.
  const failures: [RenfeResponses, string][] = [
    [{ ...RENFE, positions: { status: 503, body: '' } }, 'vehicle_positions: HTTP 503'],
    [{ ...RENFE, positions: { error: 'Error: no answer in 10 s' } }, 'vehicle_positions: Error: no answer in 10 s'],
    [{ ...RENFE, updates: { status: 200, body: '<html>' } }, 'trip_updates: not JSON'],
    [{ ...RENFE, updates: { status: 200, body: '' } }, 'trip_updates: empty'],
  ];
  let state = run().state;
  for (const [i, [renfe, status]] of failures.entries()) {
    const later = NOW + (i + 1) * 20_000;
    const failed = step(state, { renfe }, later);
    expect(failed.snapshot.feeds.rodalies).toEqual({ lastSuccess: NOW, lastAttempt: later, status, every: 20_000 });
    state = failed.state;
  }
});

test("keeps Renfe's last good reports through runs whose responses fail", () => {
  const good = run();
  // Each run after, 20 s apart, finds one of the feeds down, garbled or empty.
  const failures: RenfeResponses[] = [
    { ...RENFE, positions: { status: 503, body: '' } },
    { ...RENFE, updates: { error: 'Error: no answer in 10 s' } },
    { ...RENFE, updates: { status: 200, body: '<html>' } },
    { ...RENFE, positions: { status: 200, body: '' } },
  ];
  let state = good.state;
  for (const [i, renfe] of failures.entries()) {
    const failed = step(state, { renfe }, NOW + (i + 1) * 20_000);
    expect(failed.snapshot.reports).toEqual(good.snapshot.reports);
    state = failed.state;
  }
  // The runs that work after replace them, even where Renfe's feeds report no Trains at all: but as
  // they feed several Networks, those of one that vanishes from them stay two runs more (below).
  const kept = [60, 80, 100].map((header, i) => {
    const none = { status: 200, body: `{"header": {"timestamp": "${1790344600 + header}"}}` };
    const done = step(state, { renfe: { positions: none, updates: none } }, NOW + (5 + i) * 20_000);
    state = done.state;
    return done.snapshot.reports.length;
  });
  expect(kept).toEqual([67, 67, 0]);
});

/** Renfe's feeds as recorded, those of 15:57:09 unless others are given, with both headers saying a moment, in ms since 1970. */
function renfeAt(moment: number, { positions, updates }: RenfeResponses = RENFE): RenfeResponses {
  const at = (fetched: Fetched) => ('body' in fetched ? { ...fetched, body: fetched.body.replace(/"timestamp": "\d+"/, `"timestamp": "${moment / 1000}"`) } : fetched);
  return { positions: at(positions), updates: at(updates) };
}

/** When Renfe's headers say it wrote the recorded feeds. */
const RENFE_WRITTEN = Date.parse('2026-09-25T15:57:09+02:00');

test("counts a run whose Renfe feed says it hasn't been updated since the last as a failed try, keeping its reports", () => {
  const good = run();
  const later = NOW + 20_000;
  // 20 s later, one of the feeds still has the header it had.
  const stuck: [RenfeResponses, string][] = [
    [{ ...renfeAt(RENFE_WRITTEN + 20_000), positions: RENFE.positions }, 'vehicle_positions: not updated since 13:57:09 UTC'],
    [{ ...renfeAt(RENFE_WRITTEN + 20_000), updates: RENFE.updates }, 'trip_updates: not updated since 13:57:09 UTC'],
  ];
  for (const [renfe, status] of stuck) {
    const failed = step(good.state, { renfe }, later);
    expect(failed.snapshot.feeds.rodalies).toEqual({ lastSuccess: NOW, lastAttempt: later, status, every: 20_000 });
    expect(failed.snapshot.reports).toEqual(good.snapshot.reports);
  }
});

/** Each run, 20 s apart from a moment, NOW unless another is given, fetching these files from Renfe. */
function renfeRuns(files: RenfeResponses[], from = NOW): ReturnType<typeof step>[] {
  let state = START.state;
  return files.map((renfe, i) => {
    const done = step(state, { renfe }, from + i * 20_000);
    state = done.state;
    return done;
  });
}

/** Renfe's feeds as recorded at 15:57:09, with headers that say these moments, in seconds after then. */
const headersAt = (seconds: number[]) => seconds.map((s) => renfeAt(RENFE_WRITTEN + s * 1000));

test("counts a Renfe header earlier than the last as updated, and real time again after a time in the future", () => {
  const statuses = (headers: number[]) => renfeRuns(headersAt(headers)).map((done) => done.snapshot.feeds.rodalies?.status);
  // Failover to a server whose clock is a minute behind, which then stops.
  expect(statuses([0, -60, -40, -40])).toEqual(['ok', 'ok', 'ok', 'vehicle_positions: not updated since 13:56:29 UTC']);
  // A time an hour in the future, then real time again.
  expect(statuses([0, 3600, 40, 60])).toEqual(['ok', 'ok', 'ok', 'ok']);
});

test("while Renfe's headers stay put, Rodalies' live data is unavailable from the third run, and a header repeated once changes nothing", () => {
  /** Whether Rodalies' live data is unavailable after each run. */
  const unavailableAfter = (headers: number[]) =>
    renfeRuns(headersAt(headers)).map(({ snapshot }, i, runs) => unavailable(undefined, snapshot.generated, runs.slice(0, i + 1).map((done) => ({ snapshot: done.snapshot, at: done.snapshot.generated }))).filter((n) => n === 'rodalies'));
  expect(unavailableAfter([0, 0, 0, 0, 0])).toEqual([[], [], [], ['rodalies'], ['rodalies']]);
  // Renfe's headers move every 18-22 s, and the runs are 20 s apart, so one sometimes repeats.
  expect(unavailableAfter([0, 20, 20, 40, 60, 60, 80])).toEqual([[], [], [], [], [], [], []]);
});

test('fetches Renfe on every run', () => {
  expect(START.due).toContain('renfe');
  expect(run().due).toContain('renfe');
});

/** The live sources, with Renfe's feeding Cercanías Sevilla too, whose trip_ids start with its núcleo, 30. */
const WITH_SEVILLA = LIVE_SOURCES.map((s) => (s.id === 'renfe' ? { ...s, networks: { ...s.networks, '30': 'cercanias-sevilla' } } : s));

test("sends each of Renfe's Trains to the Network its source names by how its trip_id starts", () => {
  const { reports } = step(START.state, { renfe: RENFE }, NOW, WITH_SEVILLA).snapshot;
  // Sevilla's two Trains, both coming into a Station late, besides Rodalies' 67. Núcleo 46's
  // cancelled Trip goes to no Network, as the sources name none for it.
  const reported = Date.parse('2026-09-25T15:57:06+02:00');
  expect(reports.filter((r) => !r.trip?.startsWith('rodalies:'))).toEqual([
    { trip: 'cercanias-sevilla:3066V23639C4', at: reported, position: { near: 'adif:51009' }, delay: 900 },
    { trip: 'cercanias-sevilla:3066V23551C1', at: reported, position: { near: 'adif:51112' }, delay: 840 },
  ]);
  expect(reports).toHaveLength(67 + 2);
});

test("sends a Train to the Network of the longest start its trip_id has, whichever order its source's config names them in", () => {
  // Made up: a Network for every trip_id that starts with 5, named before Rodalies' 51.
  const nested = LIVE_SOURCES.map((s) => (s.id === 'renfe' ? { ...s, networks: { '5': 'other', ...s.networks } } : s));
  const networks = step(START.state, { renfe: RENFE }, NOW, nested).snapshot.reports.map((r) => r.trip?.split(':')[0]);
  expect(new Set(networks)).toEqual(new Set(['rodalies']));
});

// Renfe's Cercanías feeds as recorded at 07:44:01 on Monday 5 October 2026, and at 07:44:41, when
// both came back with fresh headers and every núcleo's Trains but Madrid's, as about one fetch in
// five does (docs/research/live-at-scale.md). Cut down to a Train of each of Madrid's Lines, and
// one each of Asturias' and Valencia's.
const WITH_MADRID = { positions: recorded('madrid/vehicle_positions.json'), updates: recorded('madrid/trip_updates.json') };
const WITHOUT_MADRID = { positions: recorded('madrid/vehicle_positions-without.json'), updates: recorded('madrid/trip_updates-without.json') };

/** When the run fetched the files with Madrid's Trains. */
const MONDAY = Date.parse('2026-10-05T07:44:01+02:00');

/** When Renfe's headers say it wrote the files without Madrid's Trains, and Renfe's next files 20 s, 40 s… after, without them too. */
const WITHOUT_WRITTEN = Date.parse('2026-10-05T07:44:38+02:00');
const stillWithout = (seconds: number) => renfeAt(WITHOUT_WRITTEN + seconds * 1000, WITHOUT_MADRID);

test("reports Madrid's Trains in Renfe's feeds as Cercanías Madrid's, read as Rodalies' are, and gives both Networks Renfe's freshness", () => {
  const { snapshot } = step(START.state, { renfe: WITH_MADRID }, MONDAY);
  // A Train of each of Madrid's Lines, and none of Asturias' or Valencia's.
  expect(snapshot.reports.map((r) => r.trip).sort()).toEqual([
    'cercanias-madrid:1076L19530C5',
    'cercanias-madrid:1076L19814C1',
    'cercanias-madrid:1076L20012C3',
    'cercanias-madrid:1076L20219C4a',
    'cercanias-madrid:1076L20410C4b',
    'cercanias-madrid:1076L20602C8b',
    'cercanias-madrid:1076L21004C8a',
    'cercanias-madrid:1076L21106C10',
    'cercanias-madrid:1076L21509C2',
    'cercanias-madrid:1076L21804C7',
  ]);
  // C8b's, running between Stations: its GPS, and its trip update's Delay.
  expect(snapshot.reports).toContainEqual({ trip: 'cercanias-madrid:1076L20602C8b', at: Date.parse('2026-10-05T07:43:58+02:00'), position: { lon: -3.6947744, lat: 40.488266 }, delay: 960 });
  // C1's, standing at Chamartín, which Renfe pins it to.
  expect(snapshot.reports.find((r) => r.trip === 'cercanias-madrid:1076L19814C1')?.position).toEqual({ near: 'adif:17000' });
  const fine = { lastSuccess: MONDAY, lastAttempt: MONDAY, status: 'ok', every: 20_000 };
  expect(snapshot.feeds).toEqual({ rodalies: fine, 'cercanias-madrid': fine });
});

test("keeps a Network's last reports for two runs where it vanishes from a feed that still answers, and drops them on the third", () => {
  const runs = renfeRuns([WITH_MADRID, WITHOUT_MADRID, stillWithout(20), stillWithout(40)], MONDAY);
  const madrid = runs[0]?.snapshot.reports;
  expect(madrid).toHaveLength(10);
  expect(runs.map((r) => r.snapshot.reports)).toEqual([madrid, madrid, madrid, []]);
  // Renfe's feeds worked all along.
  expect(runs.map((r) => r.snapshot.feeds['cercanias-madrid']?.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
});

test('holds a Network afresh each time it vanishes from its feed, once it has come back', () => {
  // Madrid's Trains go for a run, come back, then go for good.
  const back = renfeAt(WITHOUT_WRITTEN + 20_000, WITH_MADRID);
  const runs = renfeRuns([WITH_MADRID, WITHOUT_MADRID, back, stillWithout(40), stillWithout(60), stillWithout(80)], MONDAY);
  expect(runs.map((r) => r.snapshot.reports.length)).toEqual([10, 10, 10, 10, 10, 0]);
});

/** The live sources, with Renfe's feeding Cercanías Asturias too, whose trip_ids start with its núcleo, 20. */
const WITH_ASTURIAS = LIVE_SOURCES.map((s) => (s.id === 'renfe' ? { ...s, networks: { ...s.networks, '20': 'cercanias-asturias' } } : s));

test("keeps the last reports of only the Network that has vanished, and the others' from the feed", () => {
  const first = step(START.state, { renfe: WITH_MADRID }, MONDAY, WITH_ASTURIAS);
  const second = step(first.state, { renfe: WITHOUT_MADRID }, MONDAY + 20_000, WITH_ASTURIAS);
  const of = (network: string, { reports }: Snapshot) => reports.filter((r) => r.trip?.startsWith(`${network}:`));
  expect(of('cercanias-madrid', second.snapshot)).toEqual(of('cercanias-madrid', first.snapshot));
  // Asturias' Train as the second files have it, coming into Serín.
  expect(of('cercanias-asturias', second.snapshot)).toEqual([{ trip: 'cercanias-asturias:2076L22001C1', at: Date.parse('2026-10-05T07:44:35+02:00'), position: { near: 'adif:15302' }, delay: 660 }]);
});

test("drops a source's reports as soon as their Trains vanish from answers that work, where it feeds one Network", () => {
  // Made up: Renfe's feeds for Rodalies alone. A feed of one Network can't drop its Trains but all at
  // once, as Renfe's did on 28 September with a header and no Trains, which the map tells (#124).
  const alone = LIVE_SOURCES.map((s) => (s.id === 'renfe' ? { ...s, networks: { '51': 'rodalies' } } : s));
  const good = step(START.state, { renfe: RENFE }, NOW, alone);
  const none = { status: 200, body: `{"header": {"timestamp": "${(RENFE_WRITTEN + 20_000) / 1000}"}}` };
  const after = step(good.state, { renfe: { positions: none, updates: none } }, NOW + 20_000, alone);
  expect(after.snapshot.reports).toEqual([]);
  expect(after.missed).toEqual({});
});

test('says which Networks each try that worked found missing, and for how many tries in a row, once a try', () => {
  // Madrid's Trains go for three tries in a row, with a try that fails after the first, and stay gone.
  const failed = { ...WITH_MADRID, positions: { status: 503, body: '' } };
  const runs = renfeRuns([WITH_MADRID, WITHOUT_MADRID, failed, stillWithout(40), stillWithout(60), stillWithout(80)], MONDAY);
  const madrid = (tries: number) => ({ renfe: { 'cercanias-madrid': tries } });
  expect(runs.map((r) => r.missed)).toEqual([{}, madrid(1), {}, madrid(2), madrid(3), {}]);
});

test('fetches a source as often as its config says, counted in runs however long they take, and says so in its freshness', () => {
  // Made up: Renfe's feeds fetched every minute, every third run, though each answer takes 10 s.
  const slower = LIVE_SOURCES.map((s) => (s.id === 'renfe' ? { ...s, every: 60_000 } : s));
  let stored: ReturnType<typeof step> | undefined;
  const fetched: number[] = [];
  for (let t = NOW; t < NOW + 3 * 60_000; t += 20_000) {
    const due = (stored ?? START).due.includes('renfe');
    if (due) fetched.push((t - NOW) / 1000);
    stored = step((stored ?? START).state, due ? { renfe: renfeAt(RENFE_WRITTEN + t - NOW) } : {}, due ? t + TIMEOUT : t, slower);
  }
  expect(fetched).toEqual([0, 60, 120]);
  expect(stored?.snapshot.feeds.rodalies).toMatchObject({ status: 'ok', every: 60_000 });
});

test("writes how fresh Renfe's feeds are under each Network they feed, so the map tells each one's Trains as it does Rodalies'", () => {
  const good = step(START.state, { renfe: RENFE }, NOW, WITH_SEVILLA);
  const fine = { lastSuccess: NOW, lastAttempt: NOW, status: 'ok', every: 20_000 };
  expect(good.snapshot.feeds).toEqual({ rodalies: fine, 'cercanias-madrid': fine, 'cercanias-sevilla': fine });
  // A try that fails, fails for both.
  const failed = step(good.state, { renfe: { ...RENFE, positions: { status: 503, body: '' } } }, NOW + 20_000, WITH_SEVILLA);
  const down = { lastSuccess: NOW, lastAttempt: NOW + 20_000, status: 'vehicle_positions: HTTP 503', every: 20_000 };
  expect(failed.snapshot.feeds).toEqual({ rodalies: down, 'cercanias-madrid': down, 'cercanias-sevilla': down });
});

// FGC's live data as recorded at 10:31 on Friday 25 September 2026: Geotren's positions, which FGC
// last updated at 10:30:11, the trip-updates file FGC wrote at 10:30:03, and where that file is.
const fgcRecorded = (file: string) => readFileSync(new URL(`fixtures/fgc/${file}`, import.meta.url));
const FGC = {
  lookup: { status: 200, body: fgcRecorded('lookup.json').toString(), remaining: 4931 },
  positions: { status: 200, body: fgcRecorded('positions.json').toString(), remaining: 4930 },
  updates: { status: 200, body: new Uint8Array(fgcRecorded('trip_updates.pb')), remaining: 4929 },
};

/** When the run fetched them. */
const FGC_NOW = Date.parse('2026-09-25T10:31:15+02:00');

/** The fetcher's first run, fetching FGC, for which it looks up where the trip-updates file is. */
const fgcRun = (fgc: FgcResponses = FGC) => step(START.state, { fgc }, FGC_NOW);

/** What the run reports about an FGC Trip. */
const fgcReport = (trip: string) => fgcRun().snapshot.reports.find((r) => r.trip === `fgc:${trip}`);

test("makes one report for each FGC Train in Geotren or FGC's trip updates, by its Trip", () => {
  // Geotren places 53 Trains, and the trip updates cover 49 of them and 9 more.
  const trips = fgcRun().snapshot.reports.map((r) => r.trip);
  expect(trips).toHaveLength(62);
  expect(new Set(trips).size).toBe(trips.length);
  expect(trips.filter((t) => !t?.startsWith('fgc:'))).toEqual([]);
});

test('gives an FGC Train running between Stations its coordinates, and one standing at a Station only that Station', () => {
  const positions = fgcRun().snapshot.reports.map((r) => r.position);
  expect(positions.filter((p) => p && 'lon' in p)).toHaveLength(26);
  expect(positions.filter((p) => p && 'near' in p)).toHaveLength(27);
});

test('gives each FGC Train the time FGC last updated Geotren, the Unit type Geotren has, and when the trip updates expect it at its next Station', () => {
  const updated = Date.parse('2026-09-25T10:30:11.284+02:00');
  // An S1 coming into Plaça Catalunya, a Unit of FGC's series 113.
  expect(fgcReport('6c4bdae202757640fd55c1|6a2dc7eb02')).toEqual({
    trip: 'fgc:6c4bdae202757640fd55c1|6a2dc7eb02',
    at: updated,
    position: { lon: 2.167769780884024, lat: 41.385793761631476 },
    unitType: '113',
    expected: { station: 'fgc:PC', at: Date.parse('2026-09-25T10:31:01+02:00') },
  });
  // An R5 standing at Olesa de Montserrat, two 213s coupled. The trip updates give its platform, OL1.
  expect(fgcReport('625cdae21f726b1bb950|602dc3e207')).toEqual({
    trip: 'fgc:625cdae21f726b1bb950|602dc3e207',
    at: updated,
    position: { near: 'fgc:OL' },
    unitType: '213x2',
    expected: { station: 'fgc:OL', at: Date.parse('2026-09-25T10:29:10+02:00') },
  });
  // An RL2 towards La Pobla de Segur, whose Unit type Geotren doesn't give, and which the trip updates don't cover.
  expect(fgcReport('624ddab200727613a612|1f28c4e306')).toEqual({
    trip: 'fgc:624ddab200727613a612|1f28c4e306',
    at: updated,
    position: { lon: 0.73823, lat: 41.692527 },
  });
});

test('reports an FGC Train only the trip updates cover as FGC last updated it, with when they expect it at its next Station', () => {
  // An S1 that has just reached Terrassa Nacions Unides, the end of its Trip.
  expect(fgcReport('6c4bdae202757640fd55c1|6a2dc7e401')).toEqual({
    trip: 'fgc:6c4bdae202757640fd55c1|6a2dc7e401',
    at: Date.parse('2026-09-25T10:29:54+02:00'),
    expected: { station: 'fgc:NA', at: Date.parse('2026-09-25T10:30:00+02:00') },
  });
});

test("names Montserrat's rack Trains, which Geotren has on lines M1 and M2, the timetable's Line MM", () => {
  // Geotren as recorded at 14:47 on Friday 25 September 2026: the three rack Trains, whose ids carry
  // a calendar FGC's timetable doesn't have, and an S1. The recording didn't ask for record_timestamp,
  // so theirs is the time the fetcher's snapshot then had for that update, 14:46:02.
  const positions = { status: 200, body: fgcRecorded('rack.json').toString() };
  const reports = fgcRun({ ...FGC, positions }).snapshot.reports.filter((r) => r.position);
  expect(reports.map((r) => [r.trip, r.line])).toEqual([
    ['fgc:6c4bdae202757640fd55c1|6a2dc6e000', undefined],
    ['fgc:6d4fdaec|652dc7e702', 'fgc:MM'],
    ['fgc:6d4fdaec|652dc7e703', 'fgc:MM'],
    ['fgc:6d4fdaec|652dc7e701', 'fgc:MM'],
  ]);
});

test('writes a snapshot of a few kilobytes with every Network, as the CDN compresses it', () => {
  // These 195 Trains take 3,457 bytes. The production snapshots in the engine tests' replay, of 272
  // to 311 Trains each, took 4,456 to 5,146.
  const three = step(step(run().state, { fgc: FGC }, NOW + 20_000).state, { tram: { token: TOKEN, ...TRAM } }, NOW + 40_000);
  const all = step(three.state, { tmb: METRO }, NOW + 60_000).snapshot;
  expect(all.reports).toHaveLength(67 + 62 + 24 + 42);
  expect(gzipSync(JSON.stringify(all)).length).toBeLessThan(4000);
});

/** A trip-updates file that FGC wrote at a moment, listing no Trains. */
function writtenAt(moment: number): Uint8Array {
  const pbf = new PbfWriter();
  pbf.writeMessage(1, (_: null, header: PbfWriter) => header.writeVarintField(3, moment / 1000), null);
  return pbf.finish();
}

/** Geotren as recorded, with FGC saying it last updated it at a moment rather than 10:30:11. */
const geotrenAt = (moment: number) => ({ status: 200, body: FGC.positions.body.replaceAll('2026-09-25T08:30:11.284000+00:00', new Date(moment).toISOString()) });

test("counts a refresh whose Geotren FGC hasn't updated since the last as a failed try, keeping its reports", () => {
  const good = fgcRun();
  const later = FGC_NOW + 120_000;
  // 2 minutes later, FGC has written its trip updates again, but Geotren still says 10:30:11.
  const failed = step(good.state, { fgc: { ...FGC, lookup: undefined, updates: { status: 200, body: writtenAt(FGC_NOW + 60_000) } } }, later);
  expect(failed.snapshot.feeds).toEqual({ fgc: { lastSuccess: FGC_NOW, lastAttempt: later, status: 'geotren: not updated since 08:30:11 UTC', every: 120_000 } });
  expect(failed.snapshot.reports).toEqual(good.snapshot.reports);
  // Once it's updated again, so are the reports.
  const updated = step(failed.state, { fgc: { ...FGC, lookup: undefined, positions: geotrenAt(later) } }, later + 120_000);
  expect(updated.snapshot.feeds.fgc).toMatchObject({ lastSuccess: later + 120_000, status: 'ok' });
});

/** What FGC answers a refresh with: its responses, as the Worker gets them, and how many requests its API has left today. */
interface Answer {
  positions?: Fetched;
  updates?: Fetched<Uint8Array>;
  remaining?: number;
}

/** What FGC's adapter keeps, as the step stores it. */
const fgcOwn = (state: State) => state.own?.fgc as FgcOwn | undefined;

/**
 * The fetcher's runs every 20 s from a moment, for so many minutes, each fetching FGC where it's due,
 * as the Worker does: the trip-updates file from where the step has it, or where the run looks it up.
 * By default FGC answers with Geotren as recorded and a trip-updates file written a minute before,
 * and a refresh takes no time. Gives the requests each refresh made, by when, and what the fetcher
 * stores at the end.
 */
function refreshes(from: number, minutes: number, answer: (moment: number) => Answer = () => ({}), stored: Stored = START, taking = 0) {
  const made: { at: number; requests: string[] }[] = [];
  for (let t = from; t < from + minutes * 60_000; t += 20_000) {
    const responses: Responses = {};
    if (stored.due.includes('fgc')) {
      const { remaining, positions = { ...geotrenAt(t - 60_000), remaining }, updates = { status: 200, body: writtenAt(t - 60_000), remaining } } = answer(t);
      const lookup = fgcOwn(stored.state)?.file ? undefined : { ...FGC.lookup, remaining };
      responses.fgc = { positions, updates, lookup };
      made.push({ at: t, requests: [...(lookup ? ['lookup'] : []), 'positions', 'updates'] });
    }
    stored = step(stored.state, responses, responses.fgc ? t + taking : t);
  }
  return { made, stored };
}

/** When each refresh from a moment on was, in seconds from it. */
const seconds = (from: number, made: { at: number }[]) => made.map((m) => (m.at - from) / 1000);

test("records when FGC was last tried and last read, how the last try went, and how often it's tried", () => {
  const fine = { lastSuccess: FGC_NOW, lastAttempt: FGC_NOW, status: 'ok', every: 120_000 };
  expect(fgcRun().snapshot.feeds).toEqual({ fgc: fine });

  // Each refresh after, 2 minutes apart, finds one of the responses down, garbled or empty.
  const failures: [Answer, string][] = [
    [{ positions: { status: 503, body: '' } }, 'geotren: HTTP 503'],
    [{ positions: { status: 200, body: '<html>' } }, 'geotren: not JSON'],
    [{ positions: { status: 200, body: '{"results": [{"id": "6c4bdae202757640fd55c1|6a2dc7eb02"}]}' } }, 'geotren: no record_timestamp'],
    [{ updates: { error: 'Error: no answer in 10 s' } }, 'trip_updates: Error: no answer in 10 s'],
    [{ updates: { status: 200, body: new TextEncoder().encode('<html>') } }, 'trip_updates: not GTFS-RT'],
    [{ updates: { status: 200, body: new Uint8Array() } }, 'trip_updates: empty'],
  ];
  let state = fgcRun().state;
  for (const [i, [answer, status]] of failures.entries()) {
    const later = FGC_NOW + (i + 1) * 120_000;
    const failed = step(state, { fgc: { ...FGC, lookup: undefined, ...answer } }, later);
    expect(failed.snapshot.feeds).toEqual({ fgc: { lastSuccess: FGC_NOW, lastAttempt: later, status, every: 120_000 } });
    state = failed.state;
  }
});

test("keeps FGC's last good reports through refreshes whose responses fail", () => {
  const good = fgcRun();
  const failures: Answer[] = [{ positions: { status: 503, body: '' } }, { updates: { error: 'Error: no answer in 10 s' } }, { updates: { status: 200, body: new Uint8Array() } }];
  let state = good.state;
  for (const [i, answer] of failures.entries()) {
    const failed = step(state, { fgc: { ...FGC, lookup: undefined, ...answer } }, FGC_NOW + (i + 1) * 120_000);
    expect(failed.snapshot.reports).toEqual(good.snapshot.reports);
    state = failed.state;
  }
});

test('fetches FGC every 2 minutes, from its first run, with 2 requests: Geotren and the trip-updates file', () => {
  const { made } = refreshes(FGC_NOW, 10);
  expect(seconds(FGC_NOW, made)).toEqual([0, 120, 240, 360, 480]);
  // Only the first refresh has to look up where the trip-updates file is.
  expect(made.map((m) => m.requests.length)).toEqual([3, 2, 2, 2, 2]);
  // FGC's answers can take half a second longer than Renfe's, so a refresh ends later than the runs without one.
  expect(seconds(FGC_NOW, refreshes(FGC_NOW, 10, undefined, START, 600).made)).toEqual([0, 120, 240, 360, 480]);
});

test('slows FGC to every 5 minutes once its API has fewer than 1,000 requests left today', () => {
  const { made, stored } = refreshes(FGC_NOW, 12, () => ({ remaining: 999 }));
  expect(seconds(FGC_NOW, made)).toEqual([0, 300, 600]);
  expect(stored.state.freshness.fgc).toMatchObject({ status: 'ok', every: 300_000 });
  // At 1,000 left, it's every 2 minutes.
  expect(seconds(FGC_NOW, refreshes(FGC_NOW, 5, () => ({ remaining: 1000 })).made)).toEqual([0, 120, 240]);
});

test("stops fetching FGC once its API has no requests left, until the quota resets at 00:00 UTC, and says why", () => {
  const from = Date.parse('2026-09-25T23:50:00Z');
  const { made, stored } = refreshes(from, 9.5, () => ({ remaining: 0 }));
  expect(seconds(from, made)).toEqual([0]);
  // Its Trains turn Scheduled 6 minutes after, as they would with FGC fetched every 2 minutes and failing.
  expect(stored.state.freshness.fgc).toEqual({ lastSuccess: from, lastAttempt: from, status: 'no requests left until 00:00 UTC', every: 120_000 });
  // The first run after 00:00 UTC fetches it again.
  expect(seconds(from, refreshes(from + 580_000, 1, undefined, stored).made)).toEqual([600]);
  // Where that refresh gets no answers, the day before's count is no longer what FGC has left.
  const unanswered = { error: 'Error: no answer in 10 s' };
  const cut = refreshes(from + 580_000, 3, () => ({ positions: unanswered, updates: unanswered }), stored);
  expect(seconds(from, cut.made)).toEqual([600, 720]);
  expect(cut.stored.state.freshness.fgc).toMatchObject({ status: 'geotren: Error: no answer in 10 s', every: 120_000 });
  // A request turned away as Too Many Requests, whose answer doesn't say none are left, is tried again 2 minutes later.
  const refused = refreshes(from, 3, (t) => (t > from ? {} : { positions: { status: 429, body: '{}' } }));
  expect(seconds(from, refused.made)).toEqual([0, 120]);
});

test("keeps where the trip-updates file is, and looks it up again only when its download fails or the file's time stays the same", () => {
  // Refreshes 2 minutes apart: FGC writes the file a minute before each, until the third, whose
  // download fails. From the fifth, FGC stops writing it, and from the eighth writes it again.
  const written = [0, 2, undefined, 6, 6, 6, 6, 14, 16].map((m) => m !== undefined && FGC_NOW + (m - 1) * 60_000);
  const { made } = refreshes(FGC_NOW, 18, (t) => {
    const at = written[(t - FGC_NOW) / 120_000];
    return { updates: at ? { status: 200, body: writtenAt(at) } : { status: 404, body: new Uint8Array() } };
  });
  expect(made.map((m) => m.requests.includes('lookup'))).toEqual([true, false, false, true, false, true, false, false, false]);
});

/** Which refreshes, 2 minutes apart from the start, look up the trip-updates file, where FGC wrote it at these minutes after the first. */
function lookedUp(written: number[]): boolean[] {
  const answers = written.map((m) => ({ updates: { status: 200, body: writtenAt(FGC_NOW + m * 60_000) } }));
  return refreshes(FGC_NOW, 2 * written.length, (t) => answers[(t - FGC_NOW) / 120_000] ?? {}).made.map((m) => m.requests.includes('lookup'));
}

test("keeps where the trip-updates file is when its time is earlier than the last, and when it's real time again after a time in the future", () => {
  // Failover, at the third refresh, to a server whose clock is 10 minutes behind, which from the fifth stops writing the file.
  expect(lookedUp([-1, 1, -7, -5, -5, -5, -5])).toEqual([true, false, false, false, false, true, false]);
  // A time an hour in the future, then real time again.
  expect(lookedUp([-1, 59, 3, 5, 7])).toEqual([true, false, false, false, false]);
});

test('looks up the trip-updates file once whenever its time stays the same, even at a time it stayed at before', () => {
  // From the third refresh, FGC stops writing the file, and from the fifth writes it again. From the
  // seventh, a copy from when it stopped is served again, and stays.
  expect(lookedUp([-1, 1, 1, 1, 9, 11, 1, 1, 1, 1])).toEqual([true, false, false, true, false, false, false, false, true, false]);
});

test('stays within about 1,440 FGC requests a day, under a third of the 5,000 its API allows each IP', () => {
  const { made } = refreshes(Date.parse('2026-09-25T00:00:00Z'), 24 * 60, () => ({ remaining: 4000 }));
  expect(made.flatMap((m) => m.requests)).toHaveLength(1 + 720 * 2);
});

// TRAM's live data as recorded at 11:44:50 on Friday 25 September 2026: where the Units of
// Trambaix (TBX) and Trambesòs (TBS) were, and their trip updates, which name each Unit's Trip.
const tramRecorded = (file: string) => readFileSync(new URL(`fixtures/tram/${file}`, import.meta.url));
const TRAM = {
  TBX: { positions: { status: 200, body: tramRecorded('vehicles-tbx.json').toString() }, updates: { status: 200, body: new Uint8Array(tramRecorded('updates-tbx.pb')) } },
  TBS: { positions: { status: 200, body: tramRecorded('vehicles-tbs.json').toString() }, updates: { status: 200, body: new Uint8Array(tramRecorded('updates-tbs.pb')) } },
};

/** An access token, made up, as TRAM issues one for an hour. */
const TOKEN = { status: 200, body: JSON.stringify({ resource: 'resource_server', access_token: 'made-up token', token_type: 'Bearer', expires_in: 3599 }) };

/** When the run fetched them. */
const TRAM_NOW = Date.parse('2026-09-25T11:44:50+02:00');

/** The fetcher's first run, fetching TRAM, for which it asks for an access token. */
const tramRun = (tram: TramResponses = { token: TOKEN, ...TRAM }) => step(START.state, { tram }, TRAM_NOW);

test('makes one report for each Train TRAM has in service whose trip update names its Trip', () => {
  // Trambaix has 16 Units in service and Trambesòs 12. The trip updates name the Trips of 15 and 9:
  // the other 4 stand where their next Trip starts, before it does.
  const trips = tramRun().snapshot.reports.map((r) => r.trip);
  expect(trips.filter((t) => t?.startsWith('tram:TBX:'))).toHaveLength(15);
  expect(trips.filter((t) => t?.startsWith('tram:TBS:'))).toHaveLength(9);
  expect(new Set(trips).size).toBe(trips.length);
});

/** What the run reports about a TRAM Trip. */
const tramReport = (trip: string) => tramRun().snapshot.reports.find((r) => r.trip === `tram:${trip}`);

test("gives a TRAM Train its distance since its Trip's first Station, and where that reads 0, the stop it's at or has just left, each with TRAM's Delay", () => {
  // A T1 towards Bon Viatge, 6,120 m from Francesc Macià, between La Sardana and Montesa, 10 s late.
  expect(tramReport('TBX:2579_0094')).toEqual({ trip: 'tram:TBX:2579_0094', at: TRAM_NOW, position: { along: 6120 }, delay: 10 });
  // A T2 towards Llevant-Les Planes at Cornellà Centre or just gone from it, at the platform TRAM
  // numbers 1019, 82 s early.
  expect(tramReport('TBX:2579_0198')).toEqual({ trip: 'tram:TBX:2579_0198', at: TRAM_NOW, position: { near: 'tram:1019' }, delay: -82 });
  // Of the 24 Trains, TRAM gives 6 a distance, and the other 18 the stop they're at or have just left.
  const positions = tramRun().snapshot.reports.map((r) => r.position);
  expect(positions.filter((p) => p && 'along' in p)).toHaveLength(6);
  expect(positions.filter((p) => p && 'near' in p)).toHaveLength(18);
});

test('never reports a Unit out of service, which TRAM puts on line 0, even where a trip update names its Trip', () => {
  // TRAM has 7 of Trambaix's Units on line 0 and 8 of Trambesòs', none of them in its trip updates.
  // Made up: the T1 between La Sardana and Montesa taken out of service, with its trip update left.
  const units = JSON.parse(TRAM.TBX.positions.body).map((v: { vehicleId: number }) => (v.vehicleId === 7 ? { ...v, lineId: 0, lineName: '0' } : v));
  const { reports } = tramRun({ token: TOKEN, ...TRAM, TBX: { ...TRAM.TBX, positions: { status: 200, body: JSON.stringify(units) } } }).snapshot;
  expect(reports.map((r) => r.trip)).not.toContain('tram:TBX:2579_0094');
  expect(reports).toHaveLength(23);
});

/** Some of what TRAM answers a run with. */
type TramAnswer = Partial<TramResponses>;

test("records when TRAM was last tried and last read, how the last try went, and how often it's tried", () => {
  const fine = { lastSuccess: TRAM_NOW, lastAttempt: TRAM_NOW, status: 'ok', every: 20_000 };
  expect(tramRun().snapshot.feeds).toEqual({ tram: fine });

  // Each run after, 20 s apart, finds one of the responses down, garbled or empty.
  const failures: [TramAnswer, string][] = [
    [{ TBX: { ...TRAM.TBX, positions: { status: 503, body: '' } } }, 'TBX activevehicles: HTTP 503'],
    [{ TBS: { ...TRAM.TBS, positions: { status: 200, body: '<html>' } } }, 'TBS activevehicles: not JSON'],
    [{ TBS: { ...TRAM.TBS, positions: { status: 200, body: '{"message": "An error has occurred."}' } } }, 'TBS activevehicles: not a list'],
    [{ TBX: { ...TRAM.TBX, updates: { error: 'Error: no answer in 10 s' } } }, 'TBX gtfsrealtime: Error: no answer in 10 s'],
    [{ TBX: { ...TRAM.TBX, updates: { status: 200, body: new TextEncoder().encode('<html>') } } }, 'TBX gtfsrealtime: not GTFS-RT'],
    [{ TBS: { ...TRAM.TBS, updates: { status: 200, body: new Uint8Array() } } }, 'TBS gtfsrealtime: empty'],
  ];
  let state = tramRun().state;
  for (const [i, [answer, status]] of failures.entries()) {
    const later = TRAM_NOW + (i + 1) * 20_000;
    const failed = step(state, { tram: { ...TRAM, ...answer } }, later);
    expect(failed.snapshot.feeds).toEqual({ tram: { lastSuccess: TRAM_NOW, lastAttempt: later, status, every: 20_000 } });
    state = failed.state;
  }
});

test("keeps TRAM's last good reports through runs whose responses fail, for both halves where one does", () => {
  const good = tramRun();
  const failures: TramAnswer[] = [{ TBS: { ...TRAM.TBS, positions: { status: 503, body: '' } } }, { TBX: { ...TRAM.TBX, updates: { error: 'Error: no answer in 10 s' } } }];
  let state = good.state;
  for (const [i, answer] of failures.entries()) {
    const failed = step(state, { tram: { ...TRAM, ...answer } }, TRAM_NOW + (i + 1) * 20_000);
    expect(failed.snapshot.reports).toEqual(good.snapshot.reports);
    state = failed.state;
  }
});

test("counts a run whose trip updates TRAM hasn't written again since the last as a failed try, for either half, keeping its reports", () => {
  const good = tramRun();
  const later = TRAM_NOW + 20_000;
  const rewritten = (half: 'TBX' | 'TBS') => ({ ...TRAM[half], updates: { status: 200, body: writtenAt(TRAM_NOW) } });
  // 20 s later, one of the halves' trip updates still has the header it had: TBX's 11:44:44, TBS' 11:44:46.
  const stuck: [TramAnswer, string][] = [
    [{ TBS: rewritten('TBS') }, 'TBX gtfsrealtime: not updated since 09:44:44 UTC'],
    [{ TBX: rewritten('TBX') }, 'TBS gtfsrealtime: not updated since 09:44:46 UTC'],
  ];
  for (const [answer, status] of stuck) {
    const failed = step(good.state, { tram: { ...TRAM, ...answer } }, later);
    expect(failed.snapshot.feeds).toEqual({ tram: { lastSuccess: TRAM_NOW, lastAttempt: later, status, every: 20_000 } });
    expect(failed.snapshot.reports).toEqual(good.snapshot.reports);
  }
});

test('fetches TRAM on every run', () => {
  expect(START.due).toContain('tram');
  expect(tramRun().due).toContain('tram');
  expect(run().due).toContain('tram');
});

/** What TRAM's adapter keeps, as the step stores it. */
const tramOwn = (state: State) => state.own?.tram as TramOwn | undefined;

/**
 * The fetcher's runs every 20 s from a moment, for so many minutes, each fetching TRAM where it's
 * due, as the Worker does: asking for an access token first where the step keeps none. TRAM answers
 * as recorded, and issues each token for an hour, unless it answers otherwise. Gives the runs that
 * asked for a token, and what the fetcher stores at the end.
 */
function tramRuns(from: number, minutes: number, answer: (moment: number) => TramAnswer = () => ({}), stored: Stored = START) {
  const asked: { at: number }[] = [];
  for (let t = from; t < from + minutes * 60_000; t += 20_000) {
    const token = tramOwn(stored.state)?.access ? undefined : TOKEN;
    if (token && stored.due.includes('tram')) asked.push({ at: t });
    stored = step(stored.state, stored.due.includes('tram') ? { tram: { token, ...TRAM, ...answer(t) } } : {}, t);
  }
  return { asked, stored };
}

test('asks for an access token once an hour, keeping it in stored state for every run it lasts', () => {
  expect(seconds(TRAM_NOW, tramRuns(TRAM_NOW, 60).asked)).toEqual([0]);
  // TRAM's tokens last 3,599 s: long enough for the run 3,580 s after the one that asked, but not the next.
  expect(seconds(TRAM_NOW, tramRuns(TRAM_NOW, 180).asked)).toEqual([0, 3600, 7200]);
});

/** TRAM's answer to a run whose access token it refuses on its data, as unauthorized. */
const REFUSED = { TBS: { ...TRAM.TBS, updates: { status: 401, body: new Uint8Array() } } };

test('asks for another access token as soon as TRAM refuses the one it has', () => {
  // TRAM turns the third run away, as it would a token it had stopped accepting. The first wait is
  // the 20 s between runs, so the next run asks at once.
  const { asked } = tramRuns(TRAM_NOW, 2, (t) => (t === TRAM_NOW + 40_000 ? REFUSED : {}));
  expect(seconds(TRAM_NOW, asked)).toEqual([0, 60]);
});

test('says where TRAM refuses its access token, and that it waits before trying again', () => {
  const afterRefusal = step(tramRuns(TRAM_NOW, 1).stored.state, { tram: { ...TRAM, ...REFUSED } }, TRAM_NOW + 60_000);
  expect(afterRefusal.snapshot.feeds.tram?.status).toBe('TBS gtfsrealtime: HTTP 401; backing off, next try at 09:46:10 UTC');
  expect(tramOwn(afterRefusal.state)?.backoff).toEqual({ failed: TRAM_NOW + 60_000, wait: 20_000 });
  expect(afterRefusal.due).toContain('tram');
});

test('waits twice as long after each run whose access token TRAM refuses, though it issued it, up to 30 minutes', () => {
  const { asked, stored } = tramRuns(TRAM_NOW, 120, () => REFUSED);
  expect(seconds(TRAM_NOW, asked)).toEqual([0, 20, 60, 140, 300, 620, 1260, 2540, 4340, 6140]);
  expect(tramOwn(stored.state)?.backoff).toEqual({ failed: TRAM_NOW + 6_140_000, wait: 1_800_000 });
  expect(stored.state.freshness.tram?.status).toBe('TBS gtfsrealtime: HTTP 401; backing off, next try at 11:57:10 UTC');
});

/** What TRAM gives a run whose request for an access token gets this answer, and no token: the Worker then asks it for no data. */
const noToken = (token: Fetched): TramResponses => {
  const none = { error: 'no access token' };
  return { token, TBX: { positions: none, updates: none }, TBS: { positions: none, updates: none } };
};

test('says why where TRAM answers with no access token, and that it waits before asking again', () => {
  const unissued: [Fetched, string][] = [
    [{ status: 401, body: '{"error": "invalid_client"}' }, 'token: HTTP 401'],
    [{ status: 400, body: '{"error": "invalid_request"}' }, 'token: HTTP 400'],
    [{ status: 200, body: '{"error": "server_error"}' }, 'token: none issued'],
  ];
  for (const [token, status] of unissued) {
    const failed = step(START.state, { tram: noToken(token) }, TRAM_NOW);
    expect(failed.snapshot.feeds).toEqual({ tram: { lastAttempt: TRAM_NOW, status: `${status}; backing off, next try at 09:45:10 UTC`, every: 20_000 } });
    expect(tramOwn(failed.state)?.backoff).toEqual({ failed: TRAM_NOW, wait: 20_000 });
  }
});

/** TRAM's answer to a request for an access token it won't issue, as to wrong credentials. */
const UNISSUED = { token: { status: 401, body: '{"error": "invalid_client"}' } };

test('waits twice as long after each request for an access token TRAM refuses, up to 30 minutes', () => {
  const { asked, stored } = tramRuns(TRAM_NOW, 120, () => UNISSUED);
  // 20 s, 40 s, 80 s and so on, until 2,560 s is capped at 1,800 s.
  expect(seconds(TRAM_NOW, asked)).toEqual([0, 20, 60, 140, 300, 620, 1260, 2540, 4340, 6140]);
  expect(tramOwn(stored.state)?.backoff).toEqual({ failed: TRAM_NOW + 6_140_000, wait: 1_800_000 });
  expect(stored.state.freshness.tram?.status).toBe('token: HTTP 401; backing off, next try at 11:57:10 UTC');
});

/** Requests for an access token that TRAM gives no answer, or a server error, and what its status then says. */
const UNANSWERED: [Fetched, string][] = [
  [{ error: 'Error: no answer in 10 s' }, 'token: Error: no answer in 10 s'],
  [{ status: 503, body: 'Service Unavailable' }, 'token: HTTP 503'],
];

test("asks for an access token on every run while TRAM gives its requests no answer, or a server error, which isn't TRAM refusing its credentials", () => {
  for (const [token, status] of UNANSWERED) {
    const { asked, stored } = tramRuns(TRAM_NOW, 2, () => noToken(token));
    expect(seconds(TRAM_NOW, asked)).toEqual([0, 20, 40, 60, 80, 100]);
    expect(tramOwn(stored.state)?.backoff).toBeUndefined();
    // It says why, and not that it's backing off.
    expect(stored.state.freshness.tram?.status).toBe(status);
  }
});

test("waits twice as long after credentials TRAM refuses again, as if a request it gave no answer, or a server error, in between weren't there", () => {
  for (const [token, status] of UNANSWERED) {
    const refused = step(START.state, { tram: noToken(UNISSUED.token) }, TRAM_NOW);
    const between = step(refused.state, { tram: noToken(token) }, TRAM_NOW + 20_000);
    // Its wait of 20 s is over, so the next run asks again.
    expect(between.snapshot.feeds.tram?.status).toBe(status);
    expect(between.due).toContain('tram');
    const again = step(between.state, { tram: noToken(UNISSUED.token) }, TRAM_NOW + 40_000);
    expect(tramOwn(again.state)?.backoff).toEqual({ failed: TRAM_NOW + 40_000, wait: 40_000 });
    expect(again.snapshot.feeds.tram?.status).toBe('token: HTTP 401; backing off, next try at 09:46:10 UTC');
  }
});

/** TRAM's answer to both halves' data requests. */
const both = (positions: Fetched, updates: Fetched<Uint8Array>) => ({ TBX: { positions, updates }, TBS: { positions, updates } });

test("keeps the wait as it was where TRAM gives a token's data requests no answer, or a server error, which isn't TRAM accepting it", () => {
  const unanswered: TramAnswer[] = [both({ error: 'Error: no answer in 10 s' }, { error: 'Error: no answer in 10 s' }), both({ status: 503, body: '' }, { status: 503, body: new Uint8Array() })];
  for (const answer of unanswered) {
    // TRAM refuses the first run's token on its data, gives the next run's data requests no answer
    // or a server error, and refuses its token on the run after.
    const { asked, stored } = tramRuns(TRAM_NOW, 1, (t) => (t === TRAM_NOW + 20_000 ? answer : REFUSED));
    expect(seconds(TRAM_NOW, asked)).toEqual([0, 20]);
    expect(tramOwn(stored.state)?.backoff).toEqual({ failed: TRAM_NOW + 40_000, wait: 40_000 });
  }
});

test("waits only 20 s again where TRAM answers any of a token's data requests without refusing it, though it gives the rest no answer", () => {
  // As above, but TRAM answers Trambesòs' data requests on the run between.
  const { TBX } = both({ error: 'Error: no answer in 10 s' }, { error: 'Error: no answer in 10 s' });
  const { stored } = tramRuns(TRAM_NOW, 1, (t) => (t === TRAM_NOW + 20_000 ? { TBX } : REFUSED));
  expect(tramOwn(stored.state)?.backoff).toEqual({ failed: TRAM_NOW + 40_000, wait: 20_000 });
});

test('never waits where the Worker has no credentials for TRAM, since it asks TRAM for nothing', () => {
  const unset = step(START.state, { tram: noToken({ error: UNSET }) }, TRAM_NOW);
  expect(unset.snapshot.feeds.tram?.status).toBe('token: its credentials are not set');
  expect(tramOwn(unset.state)?.backoff).toBeUndefined();
  expect(unset.due).toContain('tram');
});

test('waits only 20 s again after failed tries, once TRAM accepts a token', () => {
  // TRAM issues no tokens for the first minute, then refuses the one it issues on the run at 60 s,
  // accepts the one at 140 s, and refuses it on the run at 240 s.
  const answer = (t: number): TramAnswer => (t < TRAM_NOW + 60_000 ? UNISSUED : t === TRAM_NOW + 60_000 || t === TRAM_NOW + 240_000 ? REFUSED : {});
  const { asked, stored } = tramRuns(TRAM_NOW, 5, answer);
  expect(seconds(TRAM_NOW, asked)).toEqual([0, 20, 60, 140, 260]);
  expect(tramOwn(stored.state)?.backoff).toBeUndefined();
});

test('never writes the access token into the snapshot', () => {
  const { stored } = tramRuns(TRAM_NOW, 1);
  expect(tramOwn(stored.state)?.access?.token).toBe('made-up token');
  expect(JSON.stringify(step(stored.state, { tram: TRAM }, TRAM_NOW + 60_000).snapshot)).not.toContain('made-up token');
});

// TMB's predictions for the Metro as recorded at 13:14:09 on Friday 25 September 2026: the next two
// trains each way at every Station of L1, L4, L11 and L9S, which has none, and the Montjuïc
// funicular, which has no Stations in them. And L1's again at 13:15:40.
const metroRecorded = (file: string) => ({ status: 200, body: readFileSync(new URL(`fixtures/metro/${file}`, import.meta.url), 'utf8') });
const METRO = metroRecorded('estacions.json');

/** When the run fetched them. */
const METRO_NOW = Date.parse('2026-09-25T13:14:09+02:00');

/** The fetcher's first run, fetching the Metro. */
const metroRun = (metro: Fetched = METRO) => step(START.state, { tmb: metro }, METRO_NOW);

test("makes one report for each Block TMB's predictions name, by its Line and TMB's number for it, which another Line's can share", () => {
  // L1 has 24 trains in its predictions, L4 16 and L11 2. L4 and L11 both have a 401 and a 402.
  const blocks = metroRun().snapshot.reports.map((r) => `${r.block?.line} ${r.block?.number}`);
  expect(blocks).toHaveLength(42);
  expect(new Set(blocks).size).toBe(42);
  expect(blocks).toEqual(expect.arrayContaining(['metro:L4 401', 'metro:L11 401', 'metro:L4 402', 'metro:L11 402']));
  // TMB predicts no trains for L9S or the funicular, so their Trains stay Scheduled.
  expect(new Set(blocks.map((b) => b.split(' ')[0]))).toEqual(new Set(['metro:L1', 'metro:L4', 'metro:L11']));
});

/** What the run reports about a Block, by its Line and TMB's number for it. */
const metroReport = (line: string, number: string, run = metroRun()) => run.snapshot.reports.find((r) => r.block?.line === `metro:${line}` && r.block.number === number);

test('gives each Block the Station it comes to next and when TMB expects it there, from its earliest prediction, as of when TMB made them', () => {
  // L1's 112 comes into Fondo, the end of the Line, at 13:15:38. TMB also expects it back at Santa Coloma at 13:17:31.
  expect(metroReport('L1', '112')).toMatchObject({ at: Date.parse('2026-09-25T13:14:09.532+02:00'), position: { next: { station: 'tmb:1.140', at: Date.parse('2026-09-25T13:15:38+02:00') } } });
  // L11's 401 comes to Ciutat Meridiana at 13:14:50, on its way to Can Cuiàs.
  expect(metroReport('L11', '401')?.position).toEqual({ next: { station: 'tmb:1.1139', at: Date.parse('2026-09-25T13:14:50+02:00') } });
});

test("heads each Block the way it runs along its Line, even coming into the Line's end, where TMB lists it under its next Trip's headsign", () => {
  // L1's 130 comes into Hospital de Bellvitge at 13:15:26, where TMB lists it for Fondo, and its 112 into Fondo, listed for Hospital de Bellvitge.
  expect(metroReport('L1', '130')?.headsign).toBe('Hospital de Bellvitge');
  expect(metroReport('L1', '112')?.headsign).toBe('Fondo');
  expect(metroReport('L11', '401')?.headsign).toBe('Can Cuiàs');
});

test('heads a Block back the other way once it has come to the end of its Line, from where TMB next expects it', () => {
  // By 13:15:40 L1's 112 has come into Fondo, and TMB expects it back at Santa Coloma at 13:17:31.
  const later = step(metroRun().state, { tmb: metroRecorded('estacions-1315.json') }, Date.parse('2026-09-25T13:15:41+02:00'));
  expect(metroReport('L1', '112', later)).toMatchObject({ headsign: 'Hospital de Bellvitge', position: { next: { station: 'tmb:1.139', at: Date.parse('2026-09-25T13:17:31+02:00') } } });
});

test("records when the Metro was last tried and last read, how the last try went, and how often it's tried", () => {
  const fine = { lastSuccess: METRO_NOW, lastAttempt: METRO_NOW, status: 'ok', every: 40_000 };
  expect(metroRun().snapshot.feeds).toEqual({ metro: fine });

  // Each run after, 40 s apart, finds TMB's answer refused, garbled, empty or missing.
  const failures: [Fetched, string][] = [
    [{ status: 401, body: 'Authentication failed. Authentication parameters missing' }, 'itransit: HTTP 401'],
    [{ status: 200, body: '<html>' }, 'itransit: not JSON'],
    [{ status: 200, body: '{"message": "An error has occurred."}' }, 'itransit: no Lines'],
    [{ status: 200, body: '' }, 'itransit: empty'],
    [{ error: 'Error: no answer in 10 s' }, 'itransit: Error: no answer in 10 s'],
  ];
  let state = metroRun().state;
  for (const [i, [metro, status]] of failures.entries()) {
    const later = METRO_NOW + (i + 1) * 40_000;
    const failed = step(state, { tmb: metro }, later);
    expect(failed.snapshot.feeds).toEqual({ metro: { lastSuccess: METRO_NOW, lastAttempt: later, status, every: 40_000 } });
    state = failed.state;
  }
});

test("keeps the Metro's last good reports through runs whose responses fail", () => {
  const good = metroRun();
  const failures: Fetched[] = [{ status: 503, body: '' }, { error: 'Error: no answer in 10 s' }, { status: 200, body: '' }];
  let state = good.state;
  for (const [i, metro] of failures.entries()) {
    const failed = step(state, { tmb: metro }, METRO_NOW + (i + 1) * 40_000);
    expect(failed.snapshot.reports).toEqual(good.snapshot.reports);
    state = failed.state;
  }
});

/**
 * The fetcher's runs every 20 s from a moment, for so many minutes, each fetching the Metro where
 * it's due, as the Worker does, and ending so many ms after it starts where it does. Gives the runs
 * that fetched it.
 */
function metroRuns(from: number, minutes: number, taking = 0) {
  const fetched: { at: number }[] = [];
  let stored = START;
  for (let t = from; t < from + minutes * 60_000; t += 20_000) {
    const due = stored.due.includes('tmb');
    if (due) fetched.push({ at: t });
    stored = step(stored.state, due ? { tmb: METRO } : {}, due ? t + taking : t);
  }
  return fetched;
}

test('fetches the Metro no more often than every 30 s, the rate declared to TMB: every other run, from its first', () => {
  expect(seconds(METRO_NOW, metroRuns(METRO_NOW, 3))).toEqual([0, 40, 80, 120, 160]);
  // TMB took up to 16 s to answer when recorded, and the Worker waits for 10 at most, so a run fetching it can end much later than the runs without.
  expect(seconds(METRO_NOW, metroRuns(METRO_NOW, 3, TIMEOUT))).toEqual([0, 40, 80, 120, 160]);
});

/** The Worker's secrets, made up. */
const SECRETS: Record<string, string> = { TRAM_CLIENT_ID: 'tram-id', TRAM_CLIENT_SECRET: 'tram-secret', TMB_APP_ID: 'tmb-id', TMB_APP_KEY: 'tmb-key' };

/** FGC's open data, and where its lookup says its trip-updates file is. */
const FGC_API = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets';
const FGC_FILE = `${FGC_API}/trip-updates-gtfs_realtime/files/735985017f62fd33b2fe46e31ce53829`;

/**
 * A Worker's `get` that answers FGC's lookup, the trip-updates file it names, and TRAM's request for
 * an access token as recorded, and gives every other request no answer. It notes each request it's
 * asked for: its method, URL, form and bearer token.
 */
function answering(asked: string[]): Get {
  const recorded: Record<string, BodyInit> = {
    [`${FGC_API}/trip-updates-gtfs_realtime/records?limit=1`]: FGC.lookup.body,
    [FGC_FILE]: FGC.updates.body,
    'https://opendata.tram.cat/connect/token': TOKEN.body,
  };
  return async (url, read, init) => {
    asked.push([init?.method ?? 'GET', url, init?.body && String(init.body), new Headers(init?.headers).get('authorization')].filter(Boolean).join(' '));
    const body = recorded[url];
    return body === undefined ? { error: `no answer from ${url}` } : { status: 200, body: await read(new Response(body)) };
  };
}

/** TRAM's data requests for both its halves, with the access token TRAM issued. */
const TRAM_DATA = [1, 2].flatMap((half) => [`GET https://opendata.tram.cat/api/v1/activevehicles?networkId=${half} Bearer made-up token`, `GET https://opendata.tram.cat/api/v1/gtfsrealtime?networkId=${half} Bearer made-up token`]);

test("asks each source for what its adapter needs, with the Worker's secrets its config names, which no error shows", async () => {
  const asked: string[] = [];
  const responses = await fetchDue(START, (name) => SECRETS[name], answering(asked));
  expect(asked.sort()).toEqual(
    [
      'GET https://gtfsrt.renfe.com/vehicle_positions.json',
      'GET https://gtfsrt.renfe.com/trip_updates.json',
      `GET ${FGC_API}/trip-updates-gtfs_realtime/records?limit=1`,
      `GET ${FGC_API}/posicionament-dels-trens/records?limit=100&select=id,lin,geo_point_2d,estacionat_a,tipus_unitat,record_timestamp`,
      `GET ${FGC_FILE}`,
      'POST https://opendata.tram.cat/connect/token grant_type=client_credentials&client_id=tram-id&client_secret=tram-secret',
      ...TRAM_DATA,
      'GET https://api.tmb.cat/v1/itransit/metro/estacions?app_id=tmb-id&app_key=tmb-key',
    ].sort(),
  );
  // TMB's key goes in the query, so it's taken out of the error, which the snapshot's status repeats.
  expect(responses.tmb).toEqual({ error: 'no answer from https://api.tmb.cat/v1/itransit/metro/estacions?app_id=…&app_key=…' });
});

test('asks FGC for no lookup, and TRAM for no access token, while the step keeps where the file is and the token', async () => {
  const kept = step(START.state, await fetchDue(START, (name) => SECRETS[name], answering([])), NOW);
  const asked: string[] = [];
  await fetchDue({ ...kept, due: ['fgc', 'tram'] }, (name) => SECRETS[name], answering(asked));
  expect(asked.sort()).toEqual([`GET ${FGC_API}/posicionament-dels-trens/records?limit=100&select=id,lin,geo_point_2d,estacionat_a,tipus_unitat,record_timestamp`, `GET ${FGC_FILE}`, ...TRAM_DATA].sort());
});

test("asks TRAM and TMB for nothing where the Worker hasn't their secrets, and says so", async () => {
  const asked: string[] = [];
  const { feeds } = step(START.state, await fetchDue(START, () => undefined, answering(asked)), NOW).snapshot;
  expect(asked.filter((request) => request.includes('tram') || request.includes('tmb'))).toEqual([]);
  expect(feeds.tram?.status).toBe('token: its credentials are not set');
  expect(feeds.metro?.status).toBe('itransit: its credentials are not set');
});
