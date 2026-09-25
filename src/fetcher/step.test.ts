import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { PbfWriter } from 'pbf';
import { expect, test } from 'vitest';
import { START, step, TIMEOUT, type Fetched, type Responses, type Stored } from './step.ts';

// Renfe's Cercanías feeds as recorded at 21:37 on Thursday 24 September 2026, cut down to Rodalies'
// Trains and a few of other núcleos'.
const recorded = (file: string) => ({ status: 200, body: readFileSync(new URL(`fixtures/${file}`, import.meta.url), 'utf8') });
const RENFE = { positions: recorded('vehicle_positions.json'), updates: recorded('trip_updates.json') };

/** When the run fetched them. */
const NOW = Date.parse('2026-09-24T21:37:00+02:00');

/** The fetcher's first run, fetching Renfe's feeds. */
const run = (rodalies: Responses['rodalies'] = RENFE) => step(START.state, { rodalies }, NOW);

test("makes one report for each Rodalies Train in Renfe's feeds, and none for other núcleos' Trains", () => {
  const trips = run().snapshot.reports.map((r) => r.trip);
  expect(trips).toHaveLength(46);
  expect(new Set(trips).size).toBe(trips.length);
  expect(trips.filter((t) => !t?.startsWith('rodalies:51'))).toEqual([]);
});

/** What the run reports about a Trip. */
const report = (trip: string) => run().snapshot.reports.find((r) => r.trip === `rodalies:${trip}`);

test('gives a Train running between Stations its GPS position, and one standing at or coming into a Station only that Station', () => {
  // IN_TRANSIT_TO, between Calafell and Segur de Calafell.
  expect(report('5165J25478R2S')?.position).toEqual({ lon: 1.5816284, lat: 41.190075 });
  // STOPPED_AT Cerdanyola del Vallès, and INCOMING_AT Barcelona-Sants: Renfe pins both to the Station's coordinates.
  expect(report('5165J77865R7')?.position).toEqual({ near: 'adif:78706' });
  expect(report('5165J25793R1')?.position).toEqual({ near: 'adif:71801' });
  // Of the 46 Trains, 17 are in transit.
  const positions = run().snapshot.reports.map((r) => r.position);
  expect(positions.filter((p) => p && 'lon' in p)).toHaveLength(17);
  expect(positions.filter((p) => p && 'near' in p)).toHaveLength(29);
});

test("gives a Train no position where Renfe knows no Station for it, as its stop 00000 says", () => {
  // Made up: the R7 at a stop Renfe gives as 00000, which the research found once in 343 stops.
  const positions = { ...RENFE.positions, body: RENFE.positions.body.replace('"stopId": "78706"', '"stopId": "00000"') };
  expect(run({ ...RENFE, positions }).snapshot.reports.find((r) => r.trip === 'rodalies:5165J77865R7')?.position).toBeUndefined();
});

test('gives each Train the time Renfe reported it and the Delay of its trip update', () => {
  const reported = Date.parse('2026-09-24T21:36:46+02:00');
  expect(report('5165J25478R2S')).toEqual({ trip: 'rodalies:5165J25478R2S', at: reported, position: { lon: 1.5816284, lat: 41.190075 }, delay: 60 });
  expect(report('5165J25793R1')).toEqual({ trip: 'rodalies:5165J25793R1', at: reported, position: { near: 'adif:71801' }, delay: -60 });
});

test('marks a Train Cancelled when Renfe cancels its Trip', () => {
  // Renfe cancels a Trip with a trip update that says only that, as it does another núcleo's
  // 4665J70061C1 here. None of Rodalies' was cancelled, so here's one of its Trips that Renfe doesn't report.
  const updates = JSON.parse(RENFE.updates.body);
  updates.entity.push({ id: 'TUCANCEL_5165J28480R2N', tripUpdate: { trip: { tripId: '5165J28480R2N', scheduleRelationship: 'CANCELED' } } });
  const { reports } = run({ ...RENFE, updates: { status: 200, body: JSON.stringify(updates) } }).snapshot;
  expect(reports).toContainEqual({ trip: 'rodalies:5165J28480R2N', at: Date.parse('2026-09-24T21:36:49+02:00'), cancelled: true });
  expect(reports.filter((r) => r.cancelled)).toHaveLength(1);
});

test("trims IDs padded with spaces, as they are in Renfe's timetable", () => {
  const pad = ({ status, body }: typeof RENFE.positions) => ({ status, body: body.replace(/"(tripId|stopId)": "([^"]*)"/g, '"$1": "  $2  "') });
  expect(run({ positions: pad(RENFE.positions), updates: pad(RENFE.updates) }).snapshot.reports).toEqual(run().snapshot.reports);
});

test('writes a snapshot of a few kilobytes, as the CDN compresses it', () => {
  // These 46 Trains take 786 bytes.
  expect(gzipSync(JSON.stringify(run().snapshot)).length).toBeLessThan(2000);
});

test("records when Renfe's feeds were last tried and last read, how the last try went, and how often they're tried", () => {
  const fine = { lastSuccess: NOW, lastAttempt: NOW, status: 'ok', every: 20_000 };
  expect(run().snapshot.feeds).toEqual({ rodalies: fine });
  expect(run().state.feeds).toEqual({ rodalies: fine });

  // Each run after, 20 s apart, finds one of the feeds down, garbled or empty.
  const failures: [Responses['rodalies'], string][] = [
    [{ ...RENFE, positions: { status: 503, body: '' } }, 'vehicle_positions: HTTP 503'],
    [{ ...RENFE, positions: { error: 'Error: no answer in 10 s' } }, 'vehicle_positions: Error: no answer in 10 s'],
    [{ ...RENFE, updates: { status: 200, body: '<html>' } }, 'trip_updates: not JSON'],
    [{ ...RENFE, updates: { status: 200, body: '' } }, 'trip_updates: empty'],
  ];
  let state = run().state;
  for (const [i, [rodalies, status]] of failures.entries()) {
    const later = NOW + (i + 1) * 20_000;
    const failed = step(state, { rodalies }, later);
    expect(failed.snapshot.feeds).toEqual({ rodalies: { lastSuccess: NOW, lastAttempt: later, status, every: 20_000 } });
    state = failed.state;
  }
});

test("keeps Renfe's last good reports through runs whose responses fail", () => {
  const good = run();
  // Each run after, 20 s apart, finds one of the feeds down, garbled or empty.
  const failures: Responses['rodalies'][] = [
    { ...RENFE, positions: { status: 503, body: '' } },
    { ...RENFE, updates: { error: 'Error: no answer in 10 s' } },
    { ...RENFE, updates: { status: 200, body: '<html>' } },
    { ...RENFE, positions: { status: 200, body: '' } },
  ];
  let state = good.state;
  for (const [i, rodalies] of failures.entries()) {
    const failed = step(state, { rodalies }, NOW + (i + 1) * 20_000);
    expect(failed.snapshot.reports).toEqual(good.snapshot.reports);
    state = failed.state;
  }
  // The next run that works replaces them, even where Renfe's feeds report no Trains at all.
  const none = { status: 200, body: '{"header": {"timestamp": "1790278640"}}' };
  expect(step(state, { rodalies: { positions: none, updates: none } }, NOW + 100_000).snapshot.reports).toEqual([]);
});

test('fetches Renfe on every run', () => {
  expect(START.due).toContain('rodalies');
  expect(run().due).toContain('rodalies');
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
const fgcRun = (fgc: Responses['fgc'] = FGC) => step(START.state, { fgc }, FGC_NOW);

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

test('writes a snapshot of a few kilobytes with every Network, as the CDN compresses it', () => {
  // These 174 Trains take 3,216 bytes. With all 104 of the Metro's that morning, 236 took 3,934.
  const three = step(step(run().state, { fgc: FGC }, NOW + 20_000).state, { tram: { token: TOKEN, ...TRAM } }, NOW + 40_000);
  const all = step(three.state, { metro: METRO }, NOW + 60_000).snapshot;
  expect(all.reports).toHaveLength(46 + 62 + 24 + 42);
  expect(gzipSync(JSON.stringify(all)).length).toBeLessThan(4000);
});

/** A trip-updates file that FGC wrote at a moment, listing no Trains. */
function writtenAt(moment: number): Uint8Array {
  const pbf = new PbfWriter();
  pbf.writeMessage(1, (_: null, header: PbfWriter) => header.writeVarintField(3, moment / 1000), null);
  return pbf.finish();
}

/** What FGC answers a refresh with: its responses, as the Worker gets them, and how many requests its API has left today. */
interface Answer {
  positions?: Fetched;
  updates?: Fetched<Uint8Array>;
  remaining?: number;
}

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
      const { remaining, positions = { ...FGC.positions, remaining }, updates = { status: 200, body: writtenAt(t - 60_000), remaining } } = answer(t);
      const lookup = stored.state.fgc?.file ? undefined : { ...FGC.lookup, remaining };
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
  expect(stored.state.feeds.fgc).toMatchObject({ status: 'ok', every: 300_000 });
  // At 1,000 left, it's every 2 minutes.
  expect(seconds(FGC_NOW, refreshes(FGC_NOW, 5, () => ({ remaining: 1000 })).made)).toEqual([0, 120, 240]);
});

test("stops fetching FGC once its API has no requests left, until the quota resets at 00:00 UTC, and says why", () => {
  const from = Date.parse('2026-09-25T23:50:00Z');
  const { made, stored } = refreshes(from, 9.5, () => ({ remaining: 0 }));
  expect(seconds(from, made)).toEqual([0]);
  // Its Trains turn Scheduled 6 minutes after, as they would with FGC fetched every 2 minutes and failing.
  expect(stored.state.feeds.fgc).toEqual({ lastSuccess: from, lastAttempt: from, status: 'no requests left until 00:00 UTC', every: 120_000 });
  // The first run after 00:00 UTC fetches it again.
  expect(seconds(from, refreshes(from + 580_000, 1, undefined, stored).made)).toEqual([600]);
  // Where that refresh gets no answers, the day before's count is no longer what FGC has left.
  const unanswered = { error: 'Error: no answer in 10 s' };
  const cut = refreshes(from + 580_000, 3, () => ({ positions: unanswered, updates: unanswered }), stored);
  expect(seconds(from, cut.made)).toEqual([600, 720]);
  expect(cut.stored.state.feeds.fgc).toMatchObject({ status: 'geotren: Error: no answer in 10 s', every: 120_000 });
  // A request turned away as Too Many Requests, whose answer doesn't say none are left, is tried again 2 minutes later.
  const refused = refreshes(from, 3, (t) => (t > from ? {} : { positions: { status: 429, body: '{}' } }));
  expect(seconds(from, refused.made)).toEqual([0, 120]);
});

test("keeps where the trip-updates file is, and looks it up again only when its download fails or the file's time stops advancing", () => {
  // Refreshes 2 minutes apart: FGC writes the file a minute before each, until the third, whose
  // download fails. From the fifth, FGC stops writing it, and from the eighth writes it again.
  const written = [0, 2, undefined, 6, 6, 6, 6, 14, 16].map((m) => m !== undefined && FGC_NOW + (m - 1) * 60_000);
  const { made } = refreshes(FGC_NOW, 18, (t) => {
    const at = written[(t - FGC_NOW) / 120_000];
    return { updates: at ? { status: 200, body: writtenAt(at) } : { status: 404, body: new Uint8Array() } };
  });
  expect(made.map((m) => m.requests.includes('lookup'))).toEqual([true, false, false, true, false, true, false, false, false]);
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
const tramRun = (tram: Responses['tram'] = { token: TOKEN, ...TRAM }) => step(START.state, { tram }, TRAM_NOW);

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

test("gives a moving TRAM Train its distance since its Trip's first Station, and one standing at a Station, where that reads 0, that Station, each with TRAM's Delay", () => {
  // A T1 towards Bon Viatge, 6,120 m from Francesc Macià, between La Sardana and Montesa, 10 s late.
  expect(tramReport('TBX:2579_0094')).toEqual({ trip: 'tram:TBX:2579_0094', at: TRAM_NOW, position: { along: 6120 }, delay: 10 });
  // A T2 towards Llevant-Les Planes standing at Cornellà Centre, at the platform TRAM numbers 1019, 82 s early.
  expect(tramReport('TBX:2579_0198')).toEqual({ trip: 'tram:TBX:2579_0198', at: TRAM_NOW, position: { near: 'tram:1019' }, delay: -82 });
  // Of the 24 Trains, 6 are between Stations.
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
type TramAnswer = Partial<NonNullable<Responses['tram']>>;

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

test('fetches TRAM on every run', () => {
  expect(START.due).toContain('tram');
  expect(tramRun().due).toContain('tram');
  expect(run().due).toContain('tram');
});

/**
 * The fetcher's runs every 20 s from a moment, for so many minutes, each fetching TRAM where it's
 * due, as the Worker does: asking for an access token first where the step keeps none. TRAM answers
 * as recorded, and issues each token for an hour, unless it answers otherwise. Gives the runs that
 * asked for a token, and what the fetcher stores at the end.
 */
function tramRuns(from: number, minutes: number, answer: (moment: number) => TramAnswer = () => ({}), stored: Stored = START) {
  const asked: { at: number }[] = [];
  for (let t = from; t < from + minutes * 60_000; t += 20_000) {
    const token = stored.state.tram?.token ? undefined : TOKEN;
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

test('asks for another access token as soon as TRAM refuses the one it has', () => {
  // TRAM turns the third run away as unauthorized, as it would a token it had stopped accepting.
  const refused = { status: 401, body: '' };
  const { asked } = tramRuns(TRAM_NOW, 2, (t) => (t === TRAM_NOW + 40_000 ? { TBS: { ...TRAM.TBS, updates: { ...refused, body: new Uint8Array() } } } : {}));
  expect(seconds(TRAM_NOW, asked)).toEqual([0, 60]);
});

test('says why where TRAM issues no access token, and asks for one again on the next run', () => {
  // Without a token, the Worker doesn't ask TRAM for its data.
  const none = { error: 'no access token' };
  const unissued: [Fetched, string][] = [
    [{ status: 401, body: '{"error": "invalid_client"}' }, 'token: HTTP 401'],
    [{ error: 'Error: no answer in 10 s' }, 'token: Error: no answer in 10 s'],
    [{ status: 200, body: '{"error": "server_error"}' }, 'token: none issued'],
  ];
  for (const [token, status] of unissued) {
    const failed = step(START.state, { tram: { token, TBX: { positions: none, updates: none }, TBS: { positions: none, updates: none } } }, TRAM_NOW);
    expect(failed.snapshot.feeds).toEqual({ tram: { lastAttempt: TRAM_NOW, status, every: 20_000 } });
  }
  const { asked } = tramRuns(TRAM_NOW, 1, (t) => (t === TRAM_NOW ? { token: unissued[0]?.[0] } : {}));
  expect(seconds(TRAM_NOW, asked)).toEqual([0, 20]);
});

test('never writes the access token into the snapshot', () => {
  const { stored } = tramRuns(TRAM_NOW, 1);
  expect(stored.state.tram?.token).toBe('made-up token');
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
const metroRun = (metro: Fetched = METRO) => step(START.state, { metro }, METRO_NOW);

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
  const later = step(metroRun().state, { metro: metroRecorded('estacions-1315.json') }, Date.parse('2026-09-25T13:15:41+02:00'));
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
    const failed = step(state, { metro }, later);
    expect(failed.snapshot.feeds).toEqual({ metro: { lastSuccess: METRO_NOW, lastAttempt: later, status, every: 40_000 } });
    state = failed.state;
  }
});

test("keeps the Metro's last good reports through runs whose responses fail", () => {
  const good = metroRun();
  const failures: Fetched[] = [{ status: 503, body: '' }, { error: 'Error: no answer in 10 s' }, { status: 200, body: '' }];
  let state = good.state;
  for (const [i, metro] of failures.entries()) {
    const failed = step(state, { metro }, METRO_NOW + (i + 1) * 40_000);
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
    const due = stored.due.includes('metro');
    if (due) fetched.push({ at: t });
    stored = step(stored.state, due ? { metro: METRO } : {}, due ? t + taking : t);
  }
  return fetched;
}

test('fetches the Metro no more often than every 30 s, the rate declared to TMB: every other run, from its first', () => {
  expect(seconds(METRO_NOW, metroRuns(METRO_NOW, 3))).toEqual([0, 40, 80, 120, 160]);
  // TMB took up to 16 s to answer when recorded, and the Worker waits for 10 at most, so a run fetching it can end much later than the runs without.
  expect(seconds(METRO_NOW, metroRuns(METRO_NOW, 3, TIMEOUT))).toEqual([0, 40, 80, 120, 160]);
});
