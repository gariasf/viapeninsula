import { expect, test } from 'vitest';
import { boxOf, FOLLOWED_TEXT, OUTLINES_OF, pillReach } from './pill.ts';

/** A Line's name as wide as textWidth() has it where there's no canvas to measure it on: 6 px a letter, at PILL_TEXT. */
const width = (name: string) => name.length * 6;

/** Barcelona's latitude. */
const LAT = 41.4;

test("a followed pill reaches half its width either side of its Train: its outline's, or its Line's name and its padding where that's wider", () => {
  // R1's round pill, R2S's pointed one and L3's badge, as the followed Train's, lettered at 12 px.
  expect(boxOf('round', width('R1'), FOLLOWED_TEXT)[0]).toBeCloseTo(12.2, 5);
  expect(boxOf('pointed', width('R2S'), FOLLOWED_TEXT)[0]).toBeCloseTo(17.8, 5);
  expect(boxOf('badge', width('L3'), FOLLOWED_TEXT)[0]).toBeCloseTo(10.2, 5);
  // A name too short to fill its outline leaves the outline's own width: half of a badge's 15 px.
  expect(boxOf('badge', width('L'), FOLLOWED_TEXT)[0]).toBe(7.5);
});

test('a pill reaches above and below its Train as far as its Line\'s name is high, and its edge', () => {
  expect(boxOf('round', width('R1'), FOLLOWED_TEXT)[1]).toBeCloseTo(8.7, 5);
  expect(boxOf('round', width('R1'), 10)[1]).toBeCloseTo(7.5, 5);
});

test('Lines are outlined by their kinds of service, and a kind the map has none for is round', () => {
  expect(OUTLINES_OF).toMatchObject({ commuter: 'round', regional: 'pointed', metro: 'badge', tram: 'badge' });
  expect(OUTLINES_OF['long-distance']).toBeUndefined();
});

test("the followed pill's reach along its track is 130 m at zoom 13 for a regional Line's name of three letters, and follows the zoom", () => {
  const box = boxOf('pointed', width('R2S'), FOLLOWED_TEXT);
  const at13 = pillReach(box, 13, 10, LAT);
  expect(at13).toBeGreaterThan(125);
  expect(at13).toBeLessThan(130);
  // A zoom in, a pixel is half the metres: it reaches half as far on the ground; a zoom out, twice.
  expect(pillReach(box, 14, 10, LAT)).toBeCloseTo(at13 / 2, 5);
  expect(pillReach(box, 12, 10, LAT)).toBeCloseTo(at13 * 2, 5);
});

test("below the zoom its Line's Trains are pills from, no pill is drawn, so its reach goes no further than at that zoom", () => {
  const box = boxOf('badge', width('L1'), FOLLOWED_TEXT);
  // The Metro's Trains are pills from zoom 12.
  expect(pillReach(box, 9, 12, LAT)).toBe(pillReach(box, 12, 12, LAT));
  expect(pillReach(box, 12, 12, LAT)).toBe(pillReach(box, 12, 10, LAT));
  expect(pillReach(box, 14, 12, LAT)).toBeLessThan(pillReach(box, 12, 12, LAT));
});
