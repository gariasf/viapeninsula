import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { START, step, type Responses } from './step.ts';

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
  expect(trips.filter((t) => !t.startsWith('rodalies:51'))).toEqual([]);
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
  expect(START.due).toEqual(['rodalies']);
  expect(run().due).toEqual(['rodalies']);
});
