import { expect, test } from 'vitest';
import type { Alerts, Trip } from '../bundle.ts';
import { cardAlerts } from './cards.ts';
import { byStretch, firstAndLast, racksAndFuniculars, toAndFromFrance, whatsWrong } from './now.ts';

let made = 0;
/** A Trip of a Line from 10:00 to 11:00 by the day's timetable. */
const trip = (line: string, from = 10 * 3600, to = 11 * 3600): Trip => ({
  id: `t${++made}`,
  line,
  shape: 's',
  headsign: 'there',
  calls: [
    { station: 'a', arrival: from, departure: from, dist: 0 },
    { station: 'b', arrival: to, departure: to, dist: 1000 },
  ],
});
/** A Train on the map of a Line, Live and on time unless said. */
const train = (line: string, { delay = 0, live = true, unreported = false }: { delay?: number; live?: boolean; unreported?: boolean } = {}) => ({ trip: trip(line), train: { delay, live, unreported } });
const cancelled = (line: string) => ({ trip: trip(line), cancelled: true as const });
const NETWORKS = [{ id: 'rodalies' }, { id: 'fgc' }, { id: 'tram' }, { id: 'metro' }, { id: 'cercanias-madrid' }];
const LINES = ['rodalies:R1', 'rodalies:R2S', 'rodalies:R4', 'rodalies:R16', 'rodalies:R11', 'rodalies:R3', 'rodalies:R7', 'fgc:S1', 'tram:T1', 'tram:T2', 'tram:T3', 'metro:L1', 'cercanias-madrid:C1'].map((id) => ({ id, network: id.split(':')[0] ?? '' }));
const NOON = Date.UTC(2026, 9, 10, -2);
/** 10:30 on the day. */
const AT = NOON + 10.5 * 3_600_000;
const wrong = (nows: Parameters<typeof whatsWrong>[2], { unavailable = [] as string[], closures = [] as Parameters<typeof whatsWrong>[4] } = {}) => whatsWrong(NETWORKS, LINES, nows, unavailable, closures, NOON, AT);

test("Now counts a Train late as its chip shows it, +5 min or more, and puts a Network with one late in trouble, with its Lines ranked by how many of their Trains are late or Cancelled (#474)", () => {
  const { trouble, quiet } = wrong([
    train('rodalies:R4', { delay: 293 }),
    train('rodalies:R4', { delay: 269 }),
    train('rodalies:R2S', { delay: 400 }),
    train('rodalies:R2S', { delay: 4800 }),
    train('rodalies:R2S', { delay: 60 }),
    cancelled('rodalies:R1'),
    train('rodalies:R16', { delay: 120 }),
    train('fgc:S1', { delay: 260 }),
    train('cercanias-madrid:C1'),
  ]);
  expect(trouble.map((n) => n.id)).toEqual(['rodalies']);
  const [rodalies] = trouble;
  expect(rodalies).toMatchObject({ trains: 6, live: 6, scheduled: 0, unreported: 0, late: 3, cancelled: 1, unavailable: false });
  // R2S's 2 late ahead of R1's 1 Cancelled and R4's 1 late, those two in the map's order; R16, none, isn't listed. No single Train's Delay: +80 min is on R2S's screen only.
  expect(rodalies?.lines).toEqual([
    { id: 'rodalies:R2S', trains: 3, late: 2, cancelled: 0, unreported: 0 },
    { id: 'rodalies:R1', trains: 0, late: 0, cancelled: 1, unreported: 0 },
    { id: 'rodalies:R4', trains: 2, late: 1, cancelled: 0, unreported: 0 },
  ]);
  expect(quiet).toEqual(['fgc', 'cercanias-madrid']);
});

test('A Network whose live data is unavailable is in trouble with nothing late, its Trains all Scheduled (#474)', () => {
  const { trouble, quiet } = wrong([train('cercanias-madrid:C1', { live: false }), train('cercanias-madrid:C1', { live: false }), train('fgc:S1')], { unavailable: ['cercanias-madrid'] });
  expect(trouble).toEqual([{ id: 'cercanias-madrid', trains: 2, live: 0, scheduled: 2, unreported: 0, late: 0, cancelled: 0, unavailable: true, lines: [] }]);
  expect(quiet).toEqual(['fgc']);
});

test("A Closure the map draws puts its Line's Network in trouble, and the Metro, with no Delays to show, is never in the quiet line (#474)", () => {
  const { trouble, quiet } = wrong([train('tram:T1'), train('metro:L1'), train('rodalies:R4', { live: false }), train('rodalies:R4', { live: false, unreported: true })], { closures: [{ line: 'tram:T2' }] });
  expect(trouble.map((n) => n.id)).toEqual(['tram']);
  expect(quiet).toEqual(['rodalies']);
  // Scheduled, besides those with no live data.
  expect(wrong([train('rodalies:R4', { live: false }), train('rodalies:R4', { live: false, unreported: true }), cancelled('rodalies:R4')]).trouble[0]).toMatchObject({ trains: 2, live: 0, scheduled: 1, unreported: 1 });
});

test("The Closures the map draws are grouped by stretch, T1–T3 Francesc Macià – Montesa as one, either way round, a single track apart from a closed one (#474)", () => {
  const closures = [
    { line: 'tram:T1', stations: ['FM', 'Montesa'], kind: 'closed' },
    { line: 'tram:T5', stations: ['Glòries', 'CJ'], kind: 'closed' },
    { line: 'tram:T2', stations: ['Montesa', 'FM'], kind: 'closed' },
    { line: 'tram:T3', stations: ['FM', 'Montesa'], kind: 'closed' },
    { line: 'rodalies:R3', stations: ['FM', 'Montesa'], kind: 'single' },
  ] satisfies Parameters<typeof byStretch>[0];
  expect(byStretch(closures)).toEqual([
    { lines: ['tram:T1', 'tram:T2', 'tram:T3'], stations: ['FM', 'Montesa'], kind: 'closed' },
    { lines: ['tram:T5'], stations: ['Glòries', 'CJ'], kind: 'closed' },
    { lines: ['rodalies:R3'], stations: ['FM', 'Montesa'], kind: 'single' },
  ]);
});

/** On 10 Oct 2026, a Saturday, at a time of day by Barcelona's clock, in ms since 1970. */
const on10 = (hours: number, minutes: number) => NOON + (hours * 60 + minutes) * 60_000;

test("The first Trains of the day show only until 09:00, and the last from 20:00: each Network's first leaving and last arriving, after midnight too (#474)", () => {
  const day = [trip('rodalies:R2S', 4 * 3600 + 45 * 60, 6 * 3600), trip('rodalies:R2S', 25 * 3600 + 30 * 60, 25 * 3600 + 57 * 60), trip('fgc:S1', 5 * 3600, 5 * 3600 + 1800)];
  // The day before's, led by its day, which leaves later than any of today's but isn't today's.
  const before = { ...trip('rodalies:R4', 23 * 3600 - 86400, 27 * 3600 - 86400), id: '2026-10-09/r4' };
  const trips = [...day, before];
  const shown = (hours: number, minutes: number) => firstAndLast(NETWORKS, LINES, trips, '2026-10-10', NOON, on10(hours, minutes));
  expect(shown(8, 59)).toEqual({ first: [{ id: 'rodalies', at: on10(4, 45) }, { id: 'fgc', at: on10(5, 0) }] });
  expect(shown(9, 1)).toEqual({});
  expect(shown(19, 59)).toEqual({});
  expect(shown(20, 1)).toEqual({ last: [{ id: 'rodalies', at: on10(25, 57) }, { id: 'fgc', at: on10(5, 30) }] });
});

test("Trains to and from France show only where one is running or leaving within the hour (#474)", () => {
  // R11 by way of Cerbère, R3 to La Tor de Querol, and AVE Int to Perpignan and beyond, by its UIC code.
  const r11 = trip('rodalies:R11', 10 * 3600 + 59 * 60);
  r11.calls.splice(1, 0, { station: 'adif:79316', arrival: 11 * 3600, departure: 11 * 3600, dist: 500 });
  const r3 = trip('rodalies:R3', 11 * 3600 + 61 * 60 - 3600);
  r3.calls[1] = { station: 'adif:77310', arrival: 13 * 3600, departure: 13 * 3600, dist: 1000 };
  const ave = { ...trip('ave-larga-distancia:AVE Int'), calls: [{ station: 'adif:87374', arrival: 9 * 3600, departure: 9 * 3600, dist: 0 }, { station: 'adif:71801', arrival: 12 * 3600, departure: 12 * 3600, dist: 1 }] };
  const elsewhere = trip('rodalies:R1', 10 * 3600 + 30 * 60);
  const running = { trip: ave, train: { live: true, unreported: false } };
  const nows = [running, { trip: r11 }, { trip: r3 }, { trip: elsewhere }];
  // At 10:00, R11 leaves in 59 minutes and R3 in 61.
  expect(toAndFromFrance(nows, NOON, on10(10, 0)).map((n) => n.trip)).toEqual([ave, r11]);
  expect(toAndFromFrance(nows, NOON, on10(10, 2)).map((n) => n.trip)).toEqual([ave, r11, r3]);
});

test('The rack railway and the funiculars show only while they run, from their first Train of the day to their last, with their Trains now, none between runs (#474)', () => {
  const lines = [
    { id: 'fgc:MM', kind: 'rack' as const },
    { id: 'fgc:FV', kind: 'funicular' as const },
    { id: 'fgc:S1', kind: 'commuter' as const },
  ];
  // The rack railway runs 08:48 to 18:00, the funicular 07:10 to 07:30 only, and S1 all day.
  const trips = [trip('fgc:MM', 8 * 3600 + 48 * 60, 9 * 3600), trip('fgc:MM', 17 * 3600, 18 * 3600), trip('fgc:FV', 7 * 3600 + 600, 7 * 3600 + 1800), trip('fgc:S1', 0, 86000)];
  const rack = { trip: trips[0] as Trip, train: { live: true, unreported: false } };
  expect(racksAndFuniculars(lines, trips, [rack], NOON, on10(8, 50))).toEqual([{ id: 'fgc:MM', trains: 1, live: true }]);
  // Between its runs: not running now.
  expect(racksAndFuniculars(lines, trips, [], NOON, on10(12, 0))).toEqual([{ id: 'fgc:MM', trains: 0, live: false }]);
  expect(racksAndFuniculars(lines, trips, [], NOON, on10(18, 1))).toEqual([]);
});

test("The Alerts on the map are all those on its Lines and Stations, newest first and those that don't say when last, a Line's with no Trips, run by bus only, too (#474)", () => {
  const said = [{ language: 'es', text: '…' }];
  const alerts: Alerts = {
    renfe: { read: on10(15, 8), status: 'ok', alerts: [{ id: 'C9', lines: ['cercanias-madrid:C9'], stations: [], from: on10(6, 0), description: said }, { id: 'lift', lines: [], stations: ['adif:71801'], description: said }, { id: 'old', lines: ['rodalies:R2S'], stations: [], from: Date.UTC(2025, 4, 1), description: said }, { id: 'away', lines: ['cercanias-sevilla:C1'], stations: [], from: on10(15, 0), description: said }] },
    tram: { read: on10(15, 7), status: 'ok', alerts: [{ id: 'sc-287', lines: ['tram:T1', 'tram:T2'], stations: [], from: on10(9, 0), description: said }] },
  };
  const lines = ['rodalies:R2S', 'tram:T1', 'tram:T2', 'cercanias-madrid:C9'];
  expect(cardAlerts(alerts, { lines, stations: ['adif:71801'] }, 'en', on10(15, 9)).alerts.map((a) => a.id)).toEqual(['sc-287', 'C9', 'old', 'lift']);
});
