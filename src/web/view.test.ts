import { expect, test } from 'vitest';
import { markOf, openingView, TILT, toggledPitch, type View } from './view.ts';

/** Where the map opens the first time, tilted. */
const BARCELONA: View = { center: [2.17, 41.39], zoom: 11, bearing: 0, pitch: TILT };
/** Girona, zoomed in, turned and tilted. */
const GIRONA: View = { center: [2.8249, 41.9794], zoom: 13.5, bearing: -20.5, pitch: 30 };

test('opens on Barcelona at zoom 11, tilted, the first time, with no view kept on the device', () => {
  expect(openingView('', null)).toEqual(BARCELONA);
});

test('opens where the viewer last left the map, kept on their device, when the link names nothing', () => {
  expect(openingView('', JSON.stringify(GIRONA))).toEqual(GIRONA);
});

test('a link that names a view opens on Barcelona, flat, whatever view is kept', () => {
  // MapLibre opens the link's own view over this one, and a link that names no pitch flat (#326).
  for (const link of ['#map=12/40.4168/-3.7038', '#map=14/41.3793/2.1404&station=adif:71801']) {
    expect(openingView(link, JSON.stringify(GIRONA))).toEqual({ ...BARCELONA, pitch: 0 });
  }
});

test('a link that names only a Station or a Train opens where the viewer last left the map, or on Barcelona the first time', () => {
  // The map eases from there to a Station it knows (#292) or a running Train it follows, and stays
  // there for a Station it doesn't know or a Train that isn't running (#306).
  for (const link of ['#station=adif:71801', '#station=adif:nope', '#train=2026-10-05/rodalies:R2_77001']) {
    expect(openingView(link, JSON.stringify(GIRONA))).toEqual(GIRONA);
    expect(openingView(link, null)).toEqual(BARCELONA);
  }
});

test('keeps the pitch the viewer left the map at, flat as well as tilted', () => {
  expect(openingView('', JSON.stringify({ ...GIRONA, pitch: 0 })).pitch).toBe(0);
  expect(openingView('', JSON.stringify({ ...GIRONA, pitch: 60 })).pitch).toBe(60);
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

test("rings the point a link's mark= names, as a report's links do, by its latitude and longitude", () => {
  expect(markOf('#map=15/43.29878/-5.68332&mark=43.29878,-5.68332')).toEqual([-5.68332, 43.29878]);
  expect(markOf('#mark=-33.9,151')).toEqual([151, -33.9]);
});

test('rings nothing where the link names no mark, or one that is not a latitude and a longitude', () => {
  // The last two are past a pole, and past 180° of longitude.
  const malformed = ['', '43.29878', '43.29878,', ',-5.68332', '43.29878,-5.68332,7', 'Sama', '43.29878;-5.68332', '95,0', '0,181'];
  expect(markOf('#map=15/43.29878/-5.68332')).toBeUndefined();
  for (const mark of malformed) expect(markOf(`#map=15/43.29878/-5.68332&mark=${mark}`)).toBeUndefined();
});

test('the tilt button flattens a tilted map, however far it is tilted, and tilts a flat one', () => {
  expect(toggledPitch(0)).toBe(TILT);
  expect(toggledPitch(TILT)).toBe(0);
  expect(toggledPitch(7)).toBe(0);
});
