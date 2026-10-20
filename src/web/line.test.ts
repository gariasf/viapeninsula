import { expect, test } from 'vitest';
import type { Trip } from '../bundle.ts';
import { cancelledNow, lineState, lineStrip, onStrip } from './line.ts';

let made = 0;
/** A Trip of R4 calling at these Stations, a minute apart. */
const trip = (stations: string[], line = 'rodalies:R4'): Trip => ({
  id: `t${++made}`,
  line,
  shape: 's',
  headsign: stations.at(-1) ?? '',
  calls: stations.map((station, i) => ({ station, arrival: i * 60, departure: i * 60, dist: i * 1000 })),
});
/** `n` Trips each way between two Stations of a run, inclusive. */
const each = (n: number, run: string[]) => Array.from({ length: n }, () => [trip(run), trip(run.toReversed())]).flat();
const R4 = ['SVC', 'Vilafranca', 'Martorell', 'Terrassa', 'Manresa'];

test("A Line's strip lists its Stations in order, a solid bar at its ends, and a hollow one where 4 or more of a day's Trips start or end", () => {
  // As R4: through Trains, short-turns at Terrassa (4 start or end there), and one at Martorell (2, under the rule).
  const strip = lineStrip([...each(3, R4), ...each(2, ['Martorell', 'Vilafranca']).slice(0, 2), ...each(2, ['SVC', 'Terrassa'])]);
  expect(strip.map((s) => s.station)).toEqual(R4);
  expect(strip.map((s) => s.mark)).toEqual(['end', undefined, undefined, 'turn', 'end']);
  // 2 × 2 Trips each way start or end there, of the 6 + 4 that call.
  expect(strip[3]).toMatchObject({ turns: 4, calls: 10 });
});

test('A run beyond the Line\'s end that few of its Trips go on to is a spur, dashed, with how many go on and end there', () => {
  // As R2S: 2 of its Trips go on past Sant Vicenç de Calders to Flix, longer than any other.
  const R2S = ['França', 'Sants', 'Vilanova', 'SVC'];
  const strip = lineStrip([...each(10, R2S), ...each(1, [...R2S, 'Reus', 'Flix'])]);
  expect(strip.map((s) => s.station)).toEqual([...R2S, 'Reus', 'Flix']);
  expect(strip.map((s) => s.mark)).toEqual(['end', undefined, undefined, 'end', 'spur', 'spur']);
  expect(strip[3]?.goOn).toEqual({ n: 2, to: 'Flix' });
  expect(strip[5]?.endsHere).toBe(2);
});

test("A spur off the Line short of its end, as R16's to Ulldecona from L'Aldea, goes after the end, on the one strip, its Station where it forks saying so", () => {
  const R16 = ['França', 'Sants', 'Tarragona', "L'Aldea", 'Tortosa'];
  const strip = lineStrip([...each(10, R16), trip(['Tortosa', "L'Aldea", 'Ulldecona']), trip(["L'Aldea", 'Ulldecona']), trip(['Ulldecona', "L'Aldea", 'Tortosa'])]);
  expect(strip.map((s) => s.station)).toEqual([...R16, 'Ulldecona']);
  expect(strip.map((s) => s.mark)).toEqual(['end', undefined, undefined, undefined, 'end', 'spur']);
  expect(strip[3]?.branchOff).toEqual({ n: 3, to: 'Ulldecona' });
  // The Line's end, which the spur goes after on the strip, doesn't say so: its Trains don't go on from there.
  expect(strip[4]?.goOn).toBeUndefined();
  expect(strip[5]?.endsHere).toBe(3);
});

test("A spur off the Line's first Station short of it, the strip's start, says so at its fork too", () => {
  const strip = lineStrip([...each(10, ['A', 'B', 'C', 'D', 'E']), ...each(1, ['X', 'B', 'C', 'D'])]);
  expect(strip.map((s) => s.station)).toEqual(['X', 'A', 'B', 'C', 'D', 'E']);
  expect(strip[2]?.branchOff).toEqual({ n: 2, to: 'X' });
  expect(strip[1]?.goOn).toBeUndefined();
});

test("A Line whose far end few Trips reach but no Station beyond does keeps it its own end, and a short-turn's Stations within it", () => {
  // Stations only some Trips call at, between others, go where those Trips have them.
  const strip = lineStrip([...each(4, ['A', 'B', 'D']), ...each(1, ['A', 'B', 'C', 'D'])]);
  expect(strip.map((s) => s.station)).toEqual(['A', 'B', 'C', 'D']);
  expect(strip.map((s) => s.mark)).toEqual(['end', undefined, undefined, 'end']);
});

test('A spur says its Trains go on as far as all of them do, and its own end how many end there', () => {
  // As R2's: 11 of its Trains go on past Granollers Centre to Sant Celoni, and 3 of them on to Maçanet-Massanes.
  const R2 = ['Castelldefels', 'Sants', 'Granollers'];
  const strip = lineStrip([...each(25, R2), ...each(4, [...R2, 'Cardedeu', 'Sant Celoni']), ...each(1, [...R2, 'Cardedeu', 'Sant Celoni', 'Maçanet']), trip([...R2, 'Cardedeu', 'Sant Celoni', 'Maçanet'])]);
  expect(strip[2]?.goOn).toEqual({ n: 11, to: 'Sant Celoni' });
  expect(strip.at(-1)).toMatchObject({ station: 'Maçanet', endsHere: 3 });
});

test("A spur counts the Trains that go on to it though some skip its first Station, as Asturias C1's past Pola de Lena", () => {
  // 18 of its Trains go on to Puente de los Fierros, 2 of them not calling at La Cobertoria: 18 go on, not 16.
  const C1 = ['Gijón', 'Oviedo', 'Mieres', 'Pola de Lena'];
  const strip = lineStrip([...each(40, C1), ...each(8, [...C1, 'La Cobertoria', 'Campomanes', 'Fierros']), ...each(1, [...C1, 'Campomanes', 'Fierros'])]);
  expect(strip.map((s) => s.station)).toEqual([...C1, 'La Cobertoria', 'Campomanes', 'Fierros']);
  expect(strip[3]?.goOn).toEqual({ n: 18, to: 'Fierros' });
});

/** A Train on R4 now: on its Trip from `from` to `to`, with these Stations still to leave, Live or not and so late. */
const running = (stations: string[], toLeave: number, { live = true, delay = 0, standsAt = undefined as string | undefined } = {}) => {
  const t = trip(stations);
  return { trip: t, live, delay, standsAt, upcoming: t.calls.slice(t.calls.length - toLeave) };
};

test("A Line's Trains are rows on its strip after the Station they're between it and the next, or stand at, each the way it goes", () => {
  const strip = lineStrip(each(3, R4));
  const down = running(R4, 3);
  const up = running(R4.toReversed(), 3);
  const standing = running(R4, 2, { standsAt: 'Terrassa' });
  const rows = onStrip(strip, [down, up, standing]);
  // Down, between Vilafranca and Martorell; up, between Terrassa and Martorell; standing at Terrassa.
  expect(rows).toEqual([
    { train: down, after: 1, way: 1 },
    { train: up, after: 2, way: -1 },
    { train: standing, after: 3, way: 1 },
  ]);
});

test("A Line's state: how many Trains now, how many 5 minutes late or more and the worst, or none now", () => {
  expect(lineState([running(R4, 2, { delay: 290 }), running(R4, 2, { delay: 1210 }), running(R4, 2, { delay: 300 })])).toEqual({ trains: 3, late: 2, worst: 20, live: true });
  // None late: no worst.
  expect(lineState([running(R4, 2, { delay: 120 })])).toEqual({ trains: 1, late: 0, live: true });
  expect(lineState([])).toEqual({ trains: 0, late: 0, live: false });
});

test("A Network whose live data is unavailable has its Line's Trains all Scheduled", () => {
  expect(lineState([running(R4, 2, { live: false }), running(R4, 3, { live: false })])).toEqual({ trains: 2, late: 0, live: false });
});

test("A Line's Cancelled Trains are those whose runs haven't ended, by their timetable", () => {
  const noon = Date.UTC(2026, 9, 10, -2) - 0;
  const [early, late] = [trip(['SVC', 'Manresa']), trip(['SVC', 'Manresa'])];
  // 14:36 to 15:36 and 15:00 to 16:00: at 15:40 the first's run has ended.
  early.calls = early.calls.map((c, i) => ({ ...c, arrival: (14 * 60 + 36 + i * 60) * 60, departure: (14 * 60 + 36 + i * 60) * 60 }));
  late.calls = late.calls.map((c, i) => ({ ...c, arrival: (15 * 60 + i * 60) * 60, departure: (15 * 60 + i * 60) * 60 }));
  const nows = [{ trip: early, cancelled: true as const }, { trip: late, cancelled: true as const }, { trip: trip(['SVC', 'Manresa']), ended: 0 }];
  expect(cancelledNow(nows, noon, noon + (15 * 60 + 9) * 60_000).map((c) => c.trip)).toEqual([early, late]);
  expect(cancelledNow(nows, noon, noon + (15 * 60 + 40) * 60_000).map((c) => c.trip)).toEqual([late]);
});
