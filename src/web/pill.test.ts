import { expect, test } from 'vitest';
import type { Kind } from '../bundle.ts';
import { boxOf, DASHED_RING, dashedDot, dashedOutline, dashesAcross, FOLLOWED_TEXT, haloScale, outlineOf, OUTLINES_OF, outlinePath, PILL_TEXT, pillReach, pillText, pulse, targetRings } from './pill.ts';

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

/** The furthest a path reaches either side of its middle and above and below it. */
const extent = (path: [number, number][]) => [Math.max(...path.map(([x]) => Math.abs(x))), Math.max(...path.map(([, y]) => Math.abs(y)))];

test("a Scheduled pill's outline, which its dashes ring, reaches as far as its box, whatever its outline, and lettered at 8, 10 or 12 px (#519)", () => {
  for (const outline of ['round', 'pointed', 'slanted', 'badge'] as const) {
    for (const size of [8, PILL_TEXT, FOLLOWED_TEXT]) {
      const box = boxOf(outline, width('R2N'), size);
      const [x, y] = extent(outlinePath(outline, box));
      expect(x).toBeCloseTo(box[0], 5);
      expect(y).toBeCloseTo(box[1], 5);
    }
  }
});

test("a pointed outline's ends are points 2 px across, and a slanted one's top is ahead of its bottom, leaning forward as italics do", () => {
  const box = boxOf('pointed', width('R2N'), PILL_TEXT);
  const tips = outlinePath('pointed', box).filter(([x]) => x === box[0]);
  expect(tips.map(([, y]) => y).sort((a, b) => a - b)).toEqual([-1, 1]);
  const slanted = outlinePath('slanted', boxOf('slanted', width('AVE'), PILL_TEXT));
  const rightmost = (wanted: number) => Math.max(...slanted.filter(([, y]) => y === wanted).map(([x]) => x));
  expect(rightmost(-7.5) - rightmost(7.5)).toBeCloseTo(6, 5);
});

test("the followed Train's target rings it 11 and 17 px out from its pill's box, so that a three-letter pill isn't cut and the inner ring clears its dashes (#519)", () => {
  const box = boxOf('pointed', width('R2N'), FOLLOWED_TEXT);
  const corner = Math.hypot(...box);
  expect(targetRings(corner)).toEqual([corner + 11, corner + 17]);
  expect(targetRings(corner)[0] - 2.5 / 2).toBeGreaterThan(corner + DASHED_RING);
});

test('its pulse goes out from its outer ring 11 px further every 1.6 s, fading from 35%', () => {
  expect(pulse(30, 0)).toEqual([30, 0.35]);
  expect(pulse(30, 800)).toEqual([35.5, 0.175]);
  expect(pulse(30, 1600)).toEqual([30, 0.35]);
});

test("below zoom 12 a Live Train's halo is 0.6 of its size, and from 12 as large, or on the dark basemap 1.6 times as large, as a glow (#519)", () => {
  expect([haloScale(11.9, false), haloScale(11.9, true)]).toEqual([0.6, 0.6]);
  expect([haloScale(12, false), haloScale(14, true)]).toEqual([1, 1.6]);
});

test("a Scheduled pill's dashed outline is the pill's own with its straight sides as long as the most whole dashes they hold, which MapLibre stretches the rest of the way, less than a dash's step (#519)", () => {
  // R1's round pill holds 1, its straight sides 7 px; R2N's pointed one 4 at 10 px, of 20, and 3 at 8 px, of 16.4; and L's badge none.
  for (const [outline, name, size, n] of [['round', 'R1', PILL_TEXT, 1], ['pointed', 'R2N', PILL_TEXT, 4], ['pointed', 'R2N', 8, 3], ['badge', 'L', PILL_TEXT, 0]] as const) {
    expect(dashesAcross(outline, boxOf(outline, width(name), size))).toBe(n);
  }
});

/** The field a dashed outline's image reads at a point, x right and y down in px from its middle, 0 to 1, as MapLibre takes it: from 0.75 its fill, from 0.5 its ring, under it nothing. */
const fieldAt = ({ width: w, height: h, data }: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number) => data[(Math.floor(h / 2 + 2 * y) * w + Math.floor(w / 2 + 2 * x)) * 4 + 3]! / 255;

test("a dashed outline's image is filled within its outline, and just outside it ringed in 3 px dashes and 2 px gaps, a gap at the middle of its top, where MapLibre stretches it", () => {
  const image = dashedOutline('badge', 2);
  // A badge 15 px high with 10 px more of straight side: its top 7.5 px up, from 12.5 px left of its middle to 12.5 right.
  expect(fieldAt(image, 0.25, 0)).toBeGreaterThan(0.75);
  expect(fieldAt(image, 0.25, -7.25)).toBeGreaterThan(0.75);
  // Just outside its top: a gap at its middle, ±1 px, then a dash from 1 to 4 px either way, and a gap from 4 to 6.
  expect(fieldAt(image, 0.25, -8.25)).toBeLessThan(0.5);
  expect(fieldAt(image, 2.25, -8.25)).toBeGreaterThan(0.5);
  expect(fieldAt(image, -2.75, -8.25)).toBeGreaterThan(0.5);
  expect(fieldAt(image, 4.75, -8.25)).toBeLessThan(0.5);
  expect(fieldAt(image, 2.25, -8.25)).toBeLessThan(0.75);
  // Beyond the ring's 2 px, nothing.
  expect(fieldAt(image, 2.25, -10.25)).toBeLessThan(0.5);
  expect(image.stretchX).toEqual([[image.width / 2 - 2, image.width / 2 + 2]]);
});

test("a Scheduled dot's ring is DOT_DASHES dashes round a dot, out to half its radius beyond it, with nothing within it, drawn with no halo", () => {
  const image = dashedDot(10);
  expect(fieldAt(image, 0.25, 0.25)).toBeLessThan(0.7);
  // Its first dash straddles the top, 12.5 px up: the ring's middle.
  expect(fieldAt(image, 0.25, -12.25)).toBeGreaterThan(0.75);
  // And a gap half a step round, 22.5° from the top.
  expect(fieldAt(image, 12.5 * Math.sin(Math.PI / 8), -12.5 * Math.cos(Math.PI / 8))).toBeLessThan(0.7);
});
