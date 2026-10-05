import { expect, test } from 'vitest';
import type { Station } from '../bundle.ts';
import { collect, type Found } from './report.ts';

const station = (id: string, lon: number, lat: number): Station => ({ id, name: `${id}'s name`, lon, lat });
const [A, B, C] = [station('adif:1', 2, 41), station('adif:2', 2.1, 41.1), station('adif:3', 2.2, 41.2)];

/** The report of these spots. */
function report(...found: Found[]) {
  const collected = collect();
  for (const f of found) collected.add(f);
  return collected.spots();
}

test("keys each spot by its kind, its Line or Network and its Stations, never by a Trip, a shape's way back, or a day", () => {
  const spots = report(
    { kind: 'kept', why: 'nopath', line: 'rodalies:R3', shape: 'rodalies:51_R3', stations: [C, B, A], text: [''] },
    { kind: 'turn', line: 'rodalies:R16', shape: 'rodalies:51_R16:back', stations: [B], text: [''] },
    { kind: 'branch', line: 'rodalies:R2N', shape: 'rodalies:51_R2N', stations: [A, B], text: [''] },
    { kind: 'trip', why: 'fast', line: 'metro:L1', trip: 'metro:1.1.11828731', stations: [B, A], text: [''] },
    { kind: 'notrips', network: 'rodalies', day: 2, text: [''] },
    { kind: 'length', line: 'rodalies:R16', shape: 'rodalies:51_R16_INV:back', text: [''], numbers: { percent: 0.6 } },
    { kind: 'node', zoom: 7, point: [-3.67716, 40.45778], text: [''], numbers: { size: 15.1 } },
    { kind: 'measures', text: [''], numbers: { breaks: 236 } },
  );
  // In order of key.
  expect(spots.map((s) => s.key)).toEqual([
    'branch rodalies:R2N adif:1 adif:2',
    'kept rodalies:R3 adif:1 adif:3 nopath',
    'length rodalies:R16 rodalies:51_R16_INV',
    'measures',
    'node 7 40.458 -3.677',
    'notrips rodalies 2',
    'trip metro:L1 fast adif:1 adif:2',
    'turn rodalies:R16 adif:2',
  ]);
});

test('joins a spot found again: each line of the log once, the ways beside it, the number furthest from 0, and each Trip once a day', () => {
  const spots = report(
    { kind: 'length', line: 'rodalies:R2', shape: 'rodalies:51_R2', text: ['R2: -0.1%'], numbers: { percent: -0.1 } },
    { kind: 'length', line: 'rodalies:R2', shape: 'rodalies:51_R2:back', text: ['R2:back: -0.2%'], numbers: { percent: -0.2 } },
    { kind: 'trip', why: 'off', line: 'rodalies:R2N', trip: 'to França', day: 0, stations: [C], ways: [7, 3], text: ['to França is left out'] },
    { kind: 'trip', why: 'off', line: 'rodalies:R2N', trip: 'to França', day: 0, stations: [C], ways: [5, 3], text: ['to França is left out'] },
    { kind: 'trip', why: 'off', line: 'rodalies:R2N', trip: 'to França later', day: 0, stations: [C], text: ['to França later is left out'] },
    { kind: 'trip', why: 'off', line: 'rodalies:R2N', trip: 'to França', day: 1, stations: [C], text: ['to França is left out'] },
  );
  expect(spots).toEqual([
    { kind: 'length', key: 'length rodalies:R2 rodalies:51_R2', line: 'rodalies:R2', text: ['R2: -0.1%', 'R2:back: -0.2%'], numbers: { percent: -0.2 } },
    {
      kind: 'trip',
      key: 'trip rodalies:R2N off adif:3',
      line: 'rodalies:R2N',
      stations: [{ id: 'adif:3', name: "adif:3's name" }],
      point: [2.2, 41.2],
      ways: [3, 5, 7],
      text: ['to França is left out', 'to França later is left out'],
      numbers: { trips: 2 },
    },
  ]);
});

test('places a spot halfway between its first and last Stations, to about a metre, unless it knows where it is', () => {
  const [kept, node] = report(
    { kind: 'kept', why: 'off', line: 'rodalies:R15', stations: [A, B, station('adif:4', 2.123456789, 41.987654321)], text: [''] },
    { kind: 'node', zoom: 9, point: [2.17598, 41.39514], text: [''], numbers: { size: 13.9 } },
  );
  expect(kept?.point).toEqual([2.06173, 41.49383]);
  expect(node?.point).toEqual([2.17598, 41.39514]);
});
