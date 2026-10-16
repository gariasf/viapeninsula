import { expect, test } from 'vitest';
import type { Kind } from '../bundle.ts';
import { boxOf, FOLLOWED_TEXT, outlineOf, OUTLINES_OF, PILL_TEXT, pillReach, pillText } from './pill.ts';

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

test("Lines are outlined by their kinds of service, long distance's slanted at both ends, and those of a track that names no kinds are round", () => {
  expect(OUTLINES_OF).toEqual({ commuter: 'round', regional: 'pointed', 'long-distance': 'slanted', metro: 'badge', tram: 'badge', rack: 'badge', funicular: 'badge' });
  expect(['commuter', 'regional', 'long-distance', 'metro', undefined].map((kind) => outlineOf(kind as Kind))).toEqual(['round', 'pointed', 'slanted', 'badge', 'round']);
});

test("a long-distance pill is 2 px wider than a regional one with the same name, its slanted ends a pixel longer than a pointed one's, and as high", () => {
  expect(boxOf('slanted', width('AVE'), FOLLOWED_TEXT)[0]).toBeCloseTo(boxOf('pointed', width('AVE'), FOLLOWED_TEXT)[0] + 1, 5);
  expect(boxOf('slanted', width('AVE'), FOLLOWED_TEXT)[1]).toBe(boxOf('pointed', width('AVE'), FOLLOWED_TEXT)[1]);
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

test("long distance's and Media Distancia's pills, from zoom 9, are lettered at 8 px, 12.6 px high, so they give way to the local Lines' from 10 and the Metro's from 12, at 10 px (#780)", () => {
  expect([9, 10, 12].map(pillText)).toEqual([8, PILL_TEXT, PILL_TEXT]);
  expect(2 * boxOf('slanted', width('AVE'), pillText(9))[1]).toBeCloseTo(12.6, 5);
  // Euromed's, slanted, 49.6 px long rather than 58 px at 10 px.
  expect([pillText(9), PILL_TEXT].map((size) => 2 * boxOf('slanted', width('Euromed'), size)[0])).toEqual([expect.closeTo(49.6, 5), 58]);
});
