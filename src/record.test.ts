import { expect, test, vi } from 'vitest';
import type { Bundle, DayFiles, Network, Report } from './bundle.ts';
import { joinDays, trainsAt, type Received } from './engine.ts';
import { NETWORKS } from './networks.ts';
import { added, cut, unmatched, withDays, type RenfeLine } from './record.ts';

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
  expect(unmatched(FRIDAY, [a, again])).toEqual({ reports: 1, trips: 1, buses: 0 });
  // A report an operator makes again, later, is another.
  const later = { ...again, snapshot: { ...again.snapshot, reports: [{ trip: 'early', at: AT + 20_000 }] } };
  expect(unmatched(FRIDAY, [a, later])).toEqual({ reports: 2, trips: 1, buses: 0 });
});

test("a report after midnight finds the Trip it names in the next day's bundle, joined with the day's as the map joins them", () => {
  const received = reporting('early', 'night');
  expect(unmatched(FRIDAY, received)).toEqual({ reports: 1, trips: 1, buses: 0 });
  expect(unmatched(joinDays([FRIDAY, SATURDAY]), received)).toEqual({ reports: 0, trips: 0, buses: 0 });
  // And one naming a Trip of the first day alone is matched by its operator's name, though joinDays() leads its ID with its day.
  expect(unmatched(SATURDAY, reporting('late'))).toEqual({ reports: 1, trips: 1, buses: 0 });
  expect(unmatched(joinDays([FRIDAY, SATURDAY]), reporting('late'))).toEqual({ reports: 0, trips: 0, buses: 0 });
});

test("counts no report that names no Trip: a Metro Block's, a rack Train's by its Line, or a long-distance Train's by its number", () => {
  const received = reporting();
  received[0]?.snapshot.reports.push({ block: { line: 'R1', number: '1' }, at: AT }, { line: 'R1', trip: 'x|y', at: AT }, { number: '15001', at: AT });
  expect(unmatched(FRIDAY, received)).toEqual({ reports: 0, trips: 0, buses: 0 });
});

// Reports as the fetcher made them from Renfe's Cercanías feed on Saturday 10 October 2026 at 13:16, cut from the
// snapshots of the recording of that time: Madrid's C8b and C9 and Murcia/Alicante's C2 are Renfe's buses, Trips of
// route_type 3 in its timetable whose Train numbers begin with 8, which the build leaves out as they aren't Trains
// (CONTEXT); and Sevilla's C4 23631 is a rail Trip it leaves out for its track (#365). The same four, 20 s later.
const REPORTED: Report[] = [
  { trip: 'cercanias-madrid:1081S80030C8b', at: 1791630947000, delay: 0, position: { near: 'adif:12006' } },
  { trip: 'cercanias-murcia-alicante:4181S84914C2', at: 1791630944000, delay: 300, position: { near: 'adif:06006' } },
  { trip: 'cercanias-madrid:1081S80684C9', at: 1791630947000, delay: 1920, position: { near: 'adif:12023' } },
  { trip: 'cercanias-sevilla:3081S23631C4', at: 1791631023000, delay: 0, position: { near: 'adif:51003' } },
];
const REPORTED_AGAIN: Report[] = [
  { trip: 'cercanias-madrid:1081S80030C8b', at: 1791630965000, delay: 0, position: { near: 'adif:12006' } },
  { trip: 'cercanias-murcia-alicante:4181S84914C2', at: 1791630964000, delay: 360, position: { near: 'adif:06006' } },
  { trip: 'cercanias-madrid:1081S80684C9', at: 1791630965000, delay: 1980, position: { near: 'adif:12023' } },
  { trip: 'cercanias-sevilla:3081S23631C4', at: 1791631043000, delay: 0, position: { near: 'adif:51003' } },
];

test("leaves Renfe's buses out of the reports that name no Trip of the bundle, the Trips whose Train numbers begin with 8, and says how many Trips they were (#567)", () => {
  const snapshot = (at: number, reports: Report[]): Received => ({ at, snapshot: { generated: at, feeds: {}, reports } });
  const received = [snapshot(AT, REPORTED), snapshot(AT + 20_000, REPORTED_AGAIN)];
  // Sevilla's rail Trip is the one left, with a report for each time its operator made one.
  expect(unmatched(FRIDAY, received)).toEqual({ reports: 2, trips: 1, buses: 3 });
});

// Rows of Renfe's trip updates of Tuesday 6 October 2026 at 17:13, from that day's first recording: a Sevilla Trip
// of its timetable, and two it ADDED, Madrid's C4a from Atocha to Chamartín, and to Alcobendas, with the stops it lists.
const UPDATES = JSON.parse(`{"header":{"gtfsRealtimeVersion":"2.0","timestamp":"1791299575"},"entity":[
  {"id":"TUUPDATE_3077M23553C1","tripUpdate":{"trip":{"tripId":"3077M23553C1","scheduleRelationship":"SCHEDULED"},"stopTimeUpdate":[{"arrival":{"delay":600,"time":"1791299816"},"stopId":"50701"}],"vehicle":{"wheelchairAccessible":"WHEELCHAIR_INACCESSIBLE"},"delay":600}},
  {"id":"TUADDED_SPECIAL_10_91065C4A","tripUpdate":{"trip":{"tripId":"SPECIAL_10_91065C4A","scheduleRelationship":"ADDED","routeId":"10T0014C4a"},"stopTimeUpdate":[{"stopSequence":1,"arrival":{"time":"1791299520"},"departure":{"time":"1791299520"},"stopId":"18000"},{"stopSequence":2,"arrival":{"time":"1791299640"},"departure":{"time":"1791299640"},"stopId":"18001"},{"stopSequence":3,"arrival":{"time":"1791299880"},"departure":{"time":"1791299880"},"stopId":"18002"},{"stopSequence":4,"arrival":{"time":"1791300240"},"departure":{"time":"1791300240"},"stopId":"17000"}],"vehicle":{"wheelchairAccessible":"WHEELCHAIR_INACCESSIBLE"}}},
  {"id":"TUADDED_SPECIAL_10_91063C4A","tripUpdate":{"trip":{"tripId":"SPECIAL_10_91063C4A","scheduleRelationship":"ADDED","routeId":"10T0014C4a"},"stopTimeUpdate":[{"stopSequence":1,"arrival":{"time":"1791297840"},"departure":{"time":"1791297840"},"stopId":"18000"},{"stopSequence":2,"arrival":{"time":"1791299820"},"departure":{"time":"1791299820"},"stopId":"19003"}],"vehicle":{"wheelchairAccessible":"WHEELCHAIR_INACCESSIBLE"}}}
]}`) as NonNullable<RenfeLine['updates']>;

test("counts the Trips Renfe ADDs, once each however many steps list them, that no snapshot names, which the fetcher drops as their IDs start with no núcleo's code (#567)", () => {
  const steps: RenfeLine[] = [{ at: AT, updates: UPDATES }, { at: AT + 20_000, updates: UPDATES }, { at: AT + 40_000 }];
  const received = reporting('night');
  expect(added(steps, received)).toBe(2);
  // One a snapshot names, as the fetcher would if it kept them under a Network, isn't left to count.
  received[0]?.snapshot.reports.push({ trip: 'cercanias-madrid:SPECIAL_10_91065C4A', at: AT });
  expect(added(steps, received)).toBe(1);
  expect(added([], received)).toBe(0);
  // The fetcher trims a trip_id to name a Trip by (renfeTrip()), so an ADDED one with spaces after it is the one a snapshot names.
  const padded = JSON.parse(JSON.stringify(UPDATES).replace('"SPECIAL_10_91065C4A"', '"SPECIAL_10_91065C4A  "')) as typeof UPDATES;
  expect(added([{ at: AT, updates: padded }], received)).toBe(1);
  // And a long-distance Train is named by its number, which no report's `trip` is, so its trip updates aren't read.
  expect(added([{ at: AT, updatesLD: UPDATES }], [])).toBe(0);
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
  received[0]?.snapshot.reports.push({ number: '15007', at: AT, cancelled: true }, { number: '15001', at: AT, delay: 120 }, { number: '99999', at: AT });
  // The night's Trip of 15001 runs on both days, and the report names both alike, as one of an ID does. Nothing names the noon one, or the morning's.
  expect(cut(joined, received).trips.map((t) => t.id)).toEqual(['2026-09-25/late', '2026-09-25/night', 'night']);
  // None of them is Live, so the Live rule keeps none: Friday's night Trip is drawn Scheduled, and the Cancelled one isn't drawn.
  const [whole, kept] = [trainsAt(joined, AT, received), trainsAt(cut(joined, received), AT, received)];
  expect(whole.map((t) => [t.trip.id, t.live])).toEqual([['2026-09-25/night', false]]);
  expect(kept.map((t) => [t.trip.id, t.dist, t.live])).toEqual(whole.map((t) => [t.trip.id, t.dist, t.live]));
  // And unmatched() counts none of them, those of a Trip the bundle has or of none (99999): it counts the Trips reports name by their IDs.
  expect(unmatched(joined, received)).toEqual({ reports: 0, trips: 0, buses: 0 });
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

/**
 * The manifest's entry for a service day, as the build gives it from its Trips: when its first Train
 * comes onto the map and its last leaves it, in ms since 1970. Friday's is from noon to 00:20 on
 * Saturday, and Saturday's from 00:05 to 00:20 on Sunday.
 */
const entry = ({ serviceDay, noonMinus12h, trips }: Bundle): DayFiles => ({
  date: serviceDay,
  from: noonMinus12h + 1000 * Math.min(...trips.map((t) => t.calls[0]?.arrival ?? Infinity)),
  to: noonMinus12h + 1000 * Math.max(...trips.map((t) => t.calls.at(-1)?.departure ?? -Infinity)),
  regions: [],
});

const idsOf = (bundle: Bundle) => bundle.trips.map((t) => t.id);
const BOTH = ['2026-09-25/late', '2026-09-25/night', '2026-09-25/noon', 'night', 'early'];

/**
 * The bundle `npm run record` cuts a recording over, which started at `from` on the day of `first`,
 * and whose last snapshot came at `to`, given the manifest's `days`, whose bundles are Friday's and
 * Saturday's unless `fails`; and the days its bundles were fetched for, which `first` isn't, as the
 * recording has it already.
 */
async function over(first: Bundle, [from, to]: [string, string], days: DayFiles[], fails = false) {
  const asked: string[] = [];
  const load = async ({ date }: DayFiles) => {
    asked.push(date);
    if (fails) throw new Error('HTTP 503');
    return [FRIDAY, SATURDAY].find((b) => b.serviceDay === date) as Bundle;
  };
  const received = [...reportingAt(Date.parse(from)), ...reportingAt(Date.parse(to))];
  return { ...(await withDays(first, first.serviceDay, received, days, load)), asked };
}

test("joins the day before's bundle to a recording that starts after midnight, until an hour after the day's last Train is due off the map, as the map keeps it (#549)", async () => {
  const days = [entry(FRIDAY), entry(SATURDAY)];
  // Friday's last Train, the night's, is due off the map at 00:20, so the map keeps its bundle until 01:20.
  const early = await over(SATURDAY, ['2026-09-26T00:02:00+02:00', '2026-09-26T00:06:00+02:00'], days);
  expect([idsOf(early.bundle), early.why, early.asked]).toEqual([BOTH, '', ['2026-09-25']]);
  expect(idsOf((await over(SATURDAY, ['2026-09-26T01:19:00+02:00', '2026-09-26T01:23:00+02:00'], days)).bundle)).toEqual(BOTH);
  // More than an hour after, there are no Trains of the day before still running to match, and its bundle isn't fetched.
  const late = await over(SATURDAY, ['2026-09-26T01:21:00+02:00', '2026-09-26T01:25:00+02:00'], days);
  expect([idsOf(late.bundle), late.asked]).toEqual([['night', 'early'], []]);
  // And a recording with no snapshot has its day's.
  expect(await withDays(SATURDAY, '2026-09-26', [], days, async () => FRIDAY)).toEqual({ bundle: SATURDAY, why: '' });
});

test("joins the next day to a recording whose last snapshot falls after midnight in Madrid, by that clock and not UTC's (#411)", async () => {
  // Saturday's first Train comes at 05:00 here, further than an hour from midnight.
  const days = [entry(FRIDAY), { ...entry(SATURDAY), from: Date.parse('2026-09-26T05:00:00+02:00') }];
  const ids = async (last: string) => idsOf((await over(FRIDAY, ['2026-09-25T23:30:00+02:00', last], days)).bundle);
  // 23:59:59 in Madrid on Friday is 21:59:59 UTC, in summer time; midnight is 22:00:00.
  expect(await ids('2026-09-25T21:59:59Z')).toEqual(['late', 'night', 'noon']);
  // Friday's bundle stays, joined, as its last Train is due off the map at 00:20: Trains still running from it keep its service in their names.
  expect(await ids('2026-09-25T22:00:00Z')).toEqual(BOTH);
});

test("joins the next day an hour before its first Train comes onto the map, as the map does, to a recording that ends before midnight", async () => {
  const days = [entry(FRIDAY), entry(SATURDAY)];
  // Saturday's first Train, the early one, is due at 00:05.
  expect(idsOf((await over(FRIDAY, ['2026-09-25T23:00:00+02:00', '2026-09-25T23:04:00+02:00'], days)).bundle)).toEqual(['late', 'night', 'noon']);
  expect(idsOf((await over(FRIDAY, ['2026-09-25T23:06:00+02:00', '2026-09-25T23:10:00+02:00'], days)).bundle)).toEqual(BOTH);
});

test("says why a recording has fewer days than the map would: the manifest has no bundle for the day a snapshot falls on, or a day's bundle didn't come", async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const [from, last] = ['2026-09-25T23:50:00+02:00', '2026-09-26T00:05:00+02:00'];
  const none = await over(FRIDAY, [from, last], [entry(FRIDAY)]);
  expect([none.bundle, none.why]).toEqual([FRIDAY, ' (the manifest has no bundle for 2026-09-26)']);
  const next = await over(FRIDAY, [from, last], [entry(FRIDAY), entry(SATURDAY)], true);
  expect([next.bundle, next.why]).toEqual([FRIDAY, " (2026-09-26's bundle didn't come)"]);
  // The day before's, for a recording that starts after midnight.
  const before = await over(SATURDAY, [last, last], [entry(FRIDAY), entry(SATURDAY)], true);
  expect([before.bundle, before.why]).toEqual([SATURDAY, " (2026-09-25's bundle didn't come)"]);
  warn.mockRestore();
});

test('joins the next day across the night the clocks go back, 25 hours long, so that a Train still running from the day before is where its report says', async () => {
  // Sunday 25 October 2026's timetable reads 00:00:00 at noon less 12 hours: 01:00, still summer time, an hour after midnight.
  const [saturday, sunday] = [day('2026-10-24', { late: NIGHT }), { ...day('2026-10-25', { early: [5 * 60, 30 * 60] }), noonMinus12h: Date.parse('2026-10-24T23:00:00Z') }];
  // Its report at 00:10 on Sunday, 22:10 UTC on Saturday, of Saturday's Trip that runs until 00:20.
  const [first, at] = [Date.parse('2026-10-24T21:58:00Z'), Date.parse('2026-10-24T22:10:00Z')];
  const received = [...reportingAt(first, 'late'), ...reportingAt(at, 'late')];
  expect(unmatched(saturday, received)).toEqual({ reports: 0, trips: 0, buses: 0 });
  const load = async ({ date }: DayFiles) => [saturday, sunday].find((b) => b.serviceDay === date) as Bundle;
  const { bundle, why } = await withDays(saturday, '2026-10-24', received, [entry(saturday), entry(sunday)], load);
  expect(why).toBe('');
  // Saturday's Trip is 25 hours behind Sunday's clock, not 24: its 23:50 leaves 70 minutes before Sunday's 00:00.
  expect(bundle.trips.map((t) => [t.id, t.calls[0]?.departure])).toEqual([['2026-10-24/late', NIGHT[0] - 90_000], ['early', 5 * 60]]);
  expect(trainsAt(bundle, at, received).map((t) => [t.trip.id, t.live])).toEqual([['2026-10-24/late', true]]);
});
