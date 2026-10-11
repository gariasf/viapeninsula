import { expect, test, vi } from 'vitest';
import type { Bundle, DayFiles, Network, Report } from './bundle.ts';
import { joinDays, trainsAt, type Received } from './engine.ts';
import { NETWORKS } from './networks.ts';
import { cut, unmatched, withNextDay } from './record.ts';

// Made up: R1's Trips from Badalona to El Masnou, on two days' timetables as Rodalies' are around
// midnight. The night's runs from 23:50 to 00:20 on both days, and on the second day's an early one
// from 00:05 to 00:30. Friday's has one for 22:00 to 22:30, which Renfe says was Cancelled, and one
// at noon that nothing reports.
const PROFILE = { acceleration: 1, braking: 1, topSpeed: 160 / 3.6, dwell: 30 };
const RODALIES: Network = { id: 'rodalies', name: 'Rodalies de Catalunya', profile: PROFILE, runningSide: 'right', colour: '#000', pillZoom: 10, credit: { text: '', url: '' }, live: NETWORKS.find((n) => n.id === 'rodalies')?.live };
const [BADALONA, MASNOU] = [{ dist: 18429, lon: 2.24892096, lat: 41.4458838 }, { dist: 24701, lon: 2.3103772, lat: 41.4770363 }];

/** A service day's bundle of these Trips, by their IDs and the times they leave Badalona and arrive at El Masnou, in seconds into the day, and their Train numbers where they have one. */
function day(serviceDay: string, trips: Record<string, [leaves: number, arrives: number, number?: string]>): Bundle {
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
    trips: Object.entries(trips).map(([id, [leaves, arrives, number]]) => ({
      id,
      line: 'R1',
      shape: 'R1',
      headsign: 'El Masnou',
      ...(number && { number }),
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

/** What Rodalies' feed has at a moment (ms since 1970): the Trips it reports, each halfway along from Badalona to El Masnou. */
const reportingAt = (at: number, ...trips: string[]): Received[] => [
  {
    at,
    snapshot: {
      generated: at,
      feeds: { rodalies: { lastSuccess: at, lastAttempt: at, status: 'ok', every: 20_000 } },
      reports: trips.map((trip): Report => ({ trip, at, position: { lon: (BADALONA.lon + MASNOU.lon) / 2, lat: (BADALONA.lat + MASNOU.lat) / 2 } })),
    },
  },
];

/** And at 00:10 in Barcelona on Saturday 26 September. */
const AT = Date.parse('2026-09-26T00:10:00+02:00');
const reporting = (...trips: string[]): Received[] => reportingAt(AT, ...trips);

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
  // And one naming a Trip of the first day alone is matched by its operator's name, though joinDays() leads its ID with its day.
  expect(unmatched(SATURDAY, reporting('late'))).toEqual({ reports: 1, trips: 1 });
  expect(unmatched(joinDays([FRIDAY, SATURDAY]), reporting('late'))).toEqual({ reports: 0, trips: 0 });
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

test("keeps the Trips a report names by their Train number as it keeps those it names by their IDs, on whichever of the days joined, though no Train runs them: a Cancelled one's, and one Renfe's report of has no position", () => {
  // Renfe's long-distance feed names a Train by its number alone (#261), and has no position for a Cancelled one.
  const [friday, saturday] = [
    day('2026-09-25', { late: [22 * 3600, 22 * 3600 + 30 * 60, '15007'], night: [...NIGHT, '15001'], noon: [12 * 3600, 12 * 3600 + 30 * 60, '15002'] }),
    day('2026-09-26', { night: [...NIGHT, '15001'], morning: [5 * 3600, 5 * 3600 + 30 * 60, '15062'] }),
  ];
  const joined = joinDays([friday, saturday]);
  const received = reporting();
  received[0]?.snapshot.reports.push({ number: '15007', at: AT, cancelled: true }, { number: '15001', at: AT, delay: 120 });
  // The night's Trip of 15001 runs on both days, and the report names both alike, as one of an ID does. Nothing names the noon one, or the morning's.
  expect(cut(joined, received).trips.map((t) => t.id)).toEqual(['2026-09-25/late', '2026-09-25/night', 'night']);
  // None of them is Live, so the Live rule keeps none: Friday's night Trip is drawn Scheduled, and the Cancelled one isn't drawn.
  const [whole, kept] = [trainsAt(joined, AT, received), trainsAt(cut(joined, received), AT, received)];
  expect(whole.map((t) => [t.trip.id, t.live])).toEqual([['2026-09-25/night', false]]);
  expect(kept.map((t) => [t.trip.id, t.dist, t.live])).toEqual(whole.map((t) => [t.trip.id, t.dist, t.live]));
  // And its reports are matched by their number, so unmatched() has none of them to count.
  expect(unmatched(joined, received)).toEqual({ reports: 0, trips: 0 });
});

test("cuts a recording of one day to the Trips its snapshots name, by their operators' names as it did before the days were joined", () => {
  const received = reporting('night');
  expect(cut(FRIDAY, received).trips.map((t) => t.id)).toEqual(['night']);
  // The Lines and shapes of the Trips kept, and no Stations, strokes or slots: the replay doesn't need them.
  expect(cut(FRIDAY, received)).toMatchObject({ lines: [{ id: 'R1' }], shapes: [{ id: 'R1' }], stations: [], strokes: [], rails: [], slots: [] });
  expect(cut(FRIDAY, reporting()).trips).toEqual([]);
});

test("keeps the Trip a Live Train runs that no report names by its ID, as a rack Train's is named by its Line and the end of its ID", () => {
  const rack = day('2026-09-25', { 'rack|7': NIGHT, 'rack|8': NIGHT });
  const received = reporting('elsewhere|7');
  for (const report of received[0]?.snapshot.reports ?? []) report.line = 'R1';
  expect(trainsAt(rack, AT, received).map((t) => [t.trip.id, t.live])).toContainEqual(['rack|7', true]);
  expect(cut(rack, received).trips.map((t) => t.id)).toEqual(['rack|7']);
});

test("keeps the Trips of a Line a Metro Block reported could run within an hour of the replay, where cutting one it ran while off the map would have it run another", () => {
  const received = reporting();
  received[0]?.snapshot.reports.push({ block: { line: 'R1', number: '1' }, at: AT });
  // Friday's night Trip runs until 00:20 and Saturday's early one starts at 00:05. Saturday's night one is 23
  // hours on, and Friday's two that ended at 22:30 and 12:30 are more than an hour back.
  expect(cut(joinDays([FRIDAY, SATURDAY]), received).trips.map((t) => t.id)).toEqual(['2026-09-25/night', 'early']);
});

/** The manifest's entry for a service day, whose files `load` stands in for. */
const entry = (date: string): DayFiles => ({ date, from: 0, to: 0, regions: [] });

test("joins the next day to a recording whose last snapshot falls after midnight in Madrid, by that clock and not UTC's", async () => {
  const load = async ({ date }: DayFiles) => [FRIDAY, SATURDAY].find((b) => b.serviceDay === date) as Bundle;
  const ids = async (last: string) => (await withNextDay(FRIDAY, '2026-09-25', Date.parse(last), [entry('2026-09-25'), entry('2026-09-26')], load)).bundle.trips.map((t) => t.id);
  // 23:59:59 in Madrid on Friday is 21:59:59 UTC, in summer time; midnight is 22:00:00.
  expect(await ids('2026-09-25T21:59:59Z')).toEqual(['late', 'night', 'noon']);
  expect(await ids('2026-09-25T22:00:00Z')).toEqual(['2026-09-25/late', '2026-09-25/night', '2026-09-25/noon', 'night', 'early']);
});

test("says why a recording that went past midnight has its day's bundle alone: the manifest has no next day, or its bundle didn't come", async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const last = Date.parse('2026-09-26T00:05:00+02:00');
  const none = await withNextDay(FRIDAY, '2026-09-25', last, [entry('2026-09-25')], async () => SATURDAY);
  expect(none).toEqual({ bundle: FRIDAY, why: ' (its snapshots go past midnight, and the manifest has no bundle for 2026-09-26)' });
  const lost = await withNextDay(FRIDAY, '2026-09-25', last, [entry('2026-09-25'), entry('2026-09-26')], async () => Promise.reject(new Error('HTTP 503')));
  expect(lost).toEqual({ bundle: FRIDAY, why: " (its snapshots go past midnight, and 2026-09-26's bundle didn't come)" });
  warn.mockRestore();
});

test('joins the next day across the night the clocks go back, 25 hours long, so that a Train still running from the day before is where its report says', async () => {
  // Sunday 25 October 2026's timetable reads 00:00:00 at noon less 12 hours: 01:00, still summer time, an hour after midnight.
  const [saturday, sunday] = [day('2026-10-24', { late: NIGHT }), { ...day('2026-10-25', { early: [5 * 60, 30 * 60] }), noonMinus12h: Date.parse('2026-10-24T23:00:00Z') }];
  const load = async ({ date }: DayFiles) => [saturday, sunday].find((b) => b.serviceDay === date) as Bundle;
  // Its report at 00:10 on Sunday, 22:10 UTC on Saturday, of Saturday's Trip that runs until 00:20.
  const at = Date.parse('2026-10-24T22:10:00Z');
  const received = reportingAt(at, 'late');
  expect(unmatched(saturday, received)).toEqual({ reports: 0, trips: 0 });
  const { bundle, why } = await withNextDay(saturday, '2026-10-24', at, [entry('2026-10-24'), entry('2026-10-25')], load);
  expect(why).toBe('');
  // Saturday's Trip is 25 hours behind Sunday's clock, not 24: its 23:50 leaves 70 minutes before Sunday's 00:00.
  expect(bundle.trips.map((t) => [t.id, t.calls[0]?.departure])).toEqual([['2026-10-24/late', NIGHT[0] - 90_000], ['early', 5 * 60]]);
  expect(trainsAt(bundle, at, received).map((t) => [t.trip.id, t.live])).toEqual([['2026-10-24/late', true]]);
});
