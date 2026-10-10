import { expect, test } from 'vitest';
import type { Bundle, Network, Report } from './bundle.ts';
import { joinDays, trainsAt, type Received } from './engine.ts';
import { NETWORKS } from './networks.ts';
import { cut, unmatched } from './record.ts';

// Made up: R1's Trips from Badalona to El Masnou, on two days' timetables as Rodalies' are around
// midnight. The night's runs from 23:50 to 00:20 on both days, and on the second day's an early one
// from 00:05 to 00:30. Friday's has one for 22:00 to 22:30, which Renfe says was Cancelled, and one
// at noon that nothing reports.
const PROFILE = { acceleration: 1, braking: 1, topSpeed: 160 / 3.6, dwell: 30 };
const RODALIES: Network = { id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE, runningSide: 'right', colour: '#000', pillZoom: 10, credit: { text: '', url: '' }, live: NETWORKS.find((n) => n.id === 'rodalies')?.live };
const [BADALONA, MASNOU] = [{ dist: 18429, lon: 2.24892096, lat: 41.4458838 }, { dist: 24701, lon: 2.3103772, lat: 41.4770363 }];

/** A service day's bundle of these Trips, by their IDs and the times they leave Badalona and arrive at El Masnou, in seconds into the day. */
function day(serviceDay: string, trips: Record<string, [leaves: number, arrives: number]>): Bundle {
  return {
    serviceDay,
    // Midnight in Barcelona, which is noon less 12 hours on any day the clocks don't change.
    noonMinus12h: Date.parse(`${serviceDay}T00:00:00+02:00`),
    networks: [RODALIES],
    lines: [{ id: 'R1', network: 'rodalies', name: 'R1', colour: '#000', shapes: ['R1'], kind: 'commuter' }],
    stations: [],
    shapes: [{ id: 'R1', coords: [[BADALONA.lon, BADALONA.lat], [MASNOU.lon, MASNOU.lat]], dist: [BADALONA.dist, MASNOU.dist] }],
    strokes: [],
    rails: [],
    slots: [],
    tracks: [],
    trips: Object.entries(trips).map(([id, [leaves, arrives]]) => ({
      id,
      line: 'R1',
      shape: 'R1',
      headsign: 'El Masnou',
      calls: [
        { station: 'Badalona', arrival: leaves, departure: leaves, dist: BADALONA.dist },
        { station: 'El Masnou', arrival: arrives, departure: arrives, dist: MASNOU.dist },
      ],
    })),
  };
}

const NIGHT: [number, number] = [23 * 3600 + 50 * 60, 24 * 3600 + 20 * 60];
const [FRIDAY, SATURDAY] = [
  day('2026-09-25', { late: [22 * 3600, 22 * 3600 + 30 * 60], night: NIGHT, noon: [12 * 3600, 12 * 3600 + 30 * 60] }),
  day('2026-09-26', { night: NIGHT, early: [5 * 60, 30 * 60] }),
];

/** What Rodalies' feed has at a moment in Barcelona on Saturday 26 September: the Trips it reports, each a few minutes on from Badalona. */
const AT = Date.parse('2026-09-26T00:10:00+02:00');
const reporting = (...trips: string[]): Received[] => [
  {
    at: AT,
    snapshot: {
      generated: AT,
      feeds: { rodalies: { lastSuccess: AT, lastAttempt: AT, status: 'ok', every: 20_000 } },
      reports: trips.map((trip): Report => ({ trip, at: AT, position: { lon: (BADALONA.lon + MASNOU.lon) / 2, lat: (BADALONA.lat + MASNOU.lat) / 2 } })),
    },
  },
];

test('counts the reports that name a Trip the bundle has none of, once each however many snapshots repeat them, and the Trips they name', () => {
  // Renfe names a Train that starts after midnight by the next day's service: Friday's bundle has no `early`.
  const [a, b] = [reporting('early', 'night')[0] as Received, reporting('early')[0] as Received];
  const again = { ...b, at: AT + 20_000 };
  expect(unmatched(FRIDAY, [a, again])).toEqual({ reports: 1, trips: 1 });
  // A report an operator makes again, later, is another.
  const later = { ...again, snapshot: { ...again.snapshot, reports: [{ trip: 'early', at: AT + 20_000 }] } };
  expect(unmatched(FRIDAY, [a, later])).toEqual({ reports: 2, trips: 1 });
});

test("a report after midnight finds the Trip it names in the next day's bundle, joined with the day's as the map joins them", () => {
  const received = reporting('early', 'night');
  expect(unmatched(FRIDAY, received)).toEqual({ reports: 1, trips: 1 });
  expect(unmatched(joinDays([FRIDAY, SATURDAY]), received)).toEqual({ reports: 0, trips: 0 });
});

test("counts no report that names no Trip: a Metro Block's, a rack Train's by its Line, or a long-distance Train's by its number", () => {
  const received = reporting();
  received[0]?.snapshot.reports.push({ block: { line: 'R1', number: '1' }, at: AT }, { line: 'R1', trip: 'x|y', at: AT }, { number: '15001', at: AT });
  expect(unmatched(FRIDAY, received)).toEqual({ reports: 0, trips: 0 });
});

test("cuts a recording that crossed midnight to the Trips its snapshots name, whichever of the days joined runs them, and those its Trains run", () => {
  const joined = joinDays([FRIDAY, SATURDAY]);
  const received = reporting('early', 'night');
  received[0]?.snapshot.reports.push({ trip: 'late', at: AT, cancelled: true });
  const trips = (bundle: Bundle) => bundle.trips.map((t) => t.id);
  expect(trips(joined)).toEqual(['2026-09-25/late', '2026-09-25/night', '2026-09-25/noon', 'night', 'early']);
  // Friday's Cancelled Trip is named, though no Train runs it, so it's kept as one of a day alone would be;
  // and so are both of the night's, which a report names alike. The noon one, which nothing names, goes.
  expect(trips(cut(joined, received))).toEqual(['2026-09-25/late', '2026-09-25/night', 'night', 'early']);
  // And the Trains it draws are the whole's: the night's is Friday's, 00:10 in its 24 hours.
  const [whole, kept] = [trainsAt(joined, AT, received), trainsAt(cut(joined, received), AT, received)];
  expect(whole.map((t) => [t.trip.id, t.live])).toEqual([['2026-09-25/night', true], ['early', true]]);
  expect(kept.map((t) => [t.trip.id, t.dist, t.live])).toEqual(whole.map((t) => [t.trip.id, t.dist, t.live]));
});

test("cuts a recording of one day to the Trips its snapshots name, by their operators' names as it did before the days were joined", () => {
  const received = reporting('night');
  expect(cut(FRIDAY, received).trips.map((t) => t.id)).toEqual(['night']);
  // The Lines and shapes of the Trips kept, and no Stations, strokes or slots: the replay doesn't need them.
  expect(cut(FRIDAY, received)).toMatchObject({ lines: [{ id: 'R1' }], shapes: [{ id: 'R1' }], stations: [], strokes: [], rails: [], slots: [] });
  expect(cut(FRIDAY, reporting()).trips).toEqual([]);
});

test("keeps the Trips of a Line a Metro Block reported could run within an hour of the replay, where cutting one it ran while off the map would have it run another", () => {
  const received = reporting();
  received[0]?.snapshot.reports.push({ block: { line: 'R1', number: '1' }, at: AT });
  // Friday's night Trip runs until 00:20 and Saturday's early one starts at 00:05. Saturday's night one is 23
  // hours on, and Friday's two that ended at 22:30 and 12:30 are more than an hour back.
  expect(cut(joinDays([FRIDAY, SATURDAY]), received).trips.map((t) => t.id)).toEqual(['2026-09-25/night', 'early']);
});
