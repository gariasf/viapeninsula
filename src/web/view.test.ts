import { expect, test } from 'vitest';
import { openingView, type View } from './view.ts';

/** Where the map opens the first time. */
const BARCELONA: View = { center: [2.17, 41.39], zoom: 11, bearing: 0, pitch: 0 };
/** Girona, zoomed in, turned and tilted. */
const GIRONA: View = { center: [2.8249, 41.9794], zoom: 13.5, bearing: -20.5, pitch: 30 };

test('opens on Barcelona at zoom 11 the first time, with no view kept on the device', () => {
  expect(openingView('', null)).toEqual(BARCELONA);
});

test('opens where the viewer last left the map, kept on their device, when the link names nothing', () => {
  expect(openingView('', JSON.stringify(GIRONA))).toEqual(GIRONA);
});

test('a link that names a view opens on Barcelona, whatever view is kept', () => {
  // MapLibre opens the link's own view over this one.
  for (const link of ['#map=12/40.4168/-3.7038', '#map=14/41.3793/2.1404&station=adif:71801']) {
    expect(openingView(link, JSON.stringify(GIRONA))).toEqual(BARCELONA);
  }
});

test('a link that names only a Station or a Train opens where the viewer last left the map, or on Barcelona the first time', () => {
  // The map eases from there to a Station it knows (#292) or a running Train it follows, and stays
  // there for a Station it doesn't know or a Train that has finished (#306).
  for (const link of ['#station=adif:71801', '#station=adif:nope', '#train=2026-10-05/rodalies:R2_77001']) {
    expect(openingView(link, JSON.stringify(GIRONA))).toEqual(GIRONA);
    expect(openingView(link, null)).toEqual(BARCELONA);
  }
});

test('opens on Barcelona when the view kept is unreadable, so that a bad one never stops the map', () => {
  const unreadable = [
    'Girona',
    'null',
    '5',
    '{}',
    '{"center":[2.8249,41.9794]}',
    JSON.stringify({ ...GIRONA, center: ['2.8249', '41.9794'] }),
    // NaN is kept as null.
    JSON.stringify({ ...GIRONA, zoom: NaN }),
    // MapLibre throws on a latitude past a pole.
    JSON.stringify({ ...GIRONA, center: [2.8249, 95] }),
  ];
  for (const kept of unreadable) expect(openingView('', kept)).toEqual(BARCELONA);
});
