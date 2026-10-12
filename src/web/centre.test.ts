import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { atMostEvery, drifted, letsGo, outsideMiddle, pointersDown, tapZooms } from './centre.ts';

test('a Train a quarter pixel or more off the middle has the map jump to it, and one nearer holds it still', () => {
  expect(drifted(0, 0)).toBe(false);
  expect(drifted(0.17, 0.17)).toBe(false);
  expect(drifted(0, 0.25)).toBe(true);
  expect(drifted(-3, 4)).toBe(true);
});

test("a drag by mouse or one finger lets go, and a pinch's drift, with two fingers down, does not", () => {
  expect(letsGo({ type: 'dragstart', originalEvent: {} })).toBe(true);
  expect(letsGo({ type: 'dragstart', originalEvent: { touches: [{}] } })).toBe(true);
  expect(letsGo({ type: 'dragstart', originalEvent: { touches: [{}, {}] } })).toBe(false);
  expect(letsGo({ type: 'dragstart' })).toBe(false);
});

test('the arrow keys let go, and the keys that zoom, turn and tilt, and a turn by mouse, do not', () => {
  const key = (k: string, shiftKey = false) => letsGo({ type: 'movestart', originalEvent: { key: k, shiftKey } });
  expect(key('ArrowLeft')).toBe(true);
  expect(key('ArrowDown')).toBe(true);
  expect(key('ArrowLeft', true)).toBe(false);
  expect(key('+')).toBe(false);
  expect(letsGo({ type: 'movestart', originalEvent: {} })).toBe(false);
  expect(letsGo({ type: 'movestart' })).toBe(false);
});

test("a Train is outside the middle 60% of the map beside the panel once it's in the outer fifth of that part on a side, or beyond it", () => {
  const none = { top: 0, right: 0, bottom: 0, left: 0 };
  const size = { width: 1000, height: 600 };
  // No panel: the middle 60% is x 200 to 800 and y 120 to 480.
  expect(outsideMiddle({ x: 500, y: 300 }, size, none)).toBe(false);
  expect(outsideMiddle({ x: 200, y: 120 }, size, none)).toBe(false);
  expect(outsideMiddle({ x: 800, y: 480 }, size, none)).toBe(false);
  expect(outsideMiddle({ x: 199, y: 300 }, size, none)).toBe(true);
  expect(outsideMiddle({ x: 801, y: 300 }, size, none)).toBe(true);
  expect(outsideMiddle({ x: 500, y: 119 }, size, none)).toBe(true);
  expect(outsideMiddle({ x: 500, y: 481 }, size, none)).toBe(true);
  // A card over the left 400 px: the part beside it is x 400 to 1000, and its middle 60% x 520 to 880.
  const card = { ...none, left: 400 };
  expect(outsideMiddle({ x: 700, y: 300 }, size, card)).toBe(false);
  expect(outsideMiddle({ x: 520, y: 300 }, size, card)).toBe(false);
  expect(outsideMiddle({ x: 519, y: 300 }, size, card)).toBe(true);
  expect(outsideMiddle({ x: 881, y: 300 }, size, card)).toBe(true);
  // A sheet over the bottom 300 px: the part above it is y 0 to 300, and its middle 60% y 60 to 240.
  const sheet = { ...none, bottom: 300 };
  expect(outsideMiddle({ x: 500, y: 150 }, size, sheet)).toBe(false);
  expect(outsideMiddle({ x: 500, y: 59 }, size, sheet)).toBe(true);
  expect(outsideMiddle({ x: 500, y: 241 }, size, sheet)).toBe(true);
  // The panel is on the left or at the bottom, but each side is read: 200 px over the top and 300 px down the right leave x 0 to 700
  // and y 200 to 600, and a middle 60% of x 140 to 560 and y 280 to 520.
  const strips = { ...none, top: 200, right: 300 };
  expect(outsideMiddle({ x: 300, y: 400 }, size, strips)).toBe(false);
  expect(outsideMiddle({ x: 140, y: 280 }, size, strips)).toBe(false);
  expect(outsideMiddle({ x: 560, y: 520 }, size, strips)).toBe(false);
  expect(outsideMiddle({ x: 139, y: 400 }, size, strips)).toBe(true);
  expect(outsideMiddle({ x: 561, y: 400 }, size, strips)).toBe(true);
  expect(outsideMiddle({ x: 300, y: 279 }, size, strips)).toBe(true);
  expect(outsideMiddle({ x: 300, y: 521 }, size, strips)).toBe(true);
  // Far off the screen, as a Train that comes out of a Closure 14 km away at zoom 13 is.
  expect(outsideMiddle({ x: 2000, y: -1500 }, size, card)).toBe(true);
});

test("MapLibre's zoom for a double-click or a double-tap is told from the ease that carries a gesture on, and from the app's own", () => {
  const zoom = { zoom: 15, around: { lng: 2.17, lat: 41.38 } };
  // A double-click, shift's zoom out too, from the click's own event.
  expect(tapZooms(zoom, { originalEvent: { type: 'dblclick' } })).toBe(true);
  // A double-tap and a two-finger tap, from the touch that ends the second tap.
  expect(tapZooms(zoom, { originalEvent: { type: 'touchend' } })).toBe(true);
  // The ease that goes on from a pinch ends in its touchend too, and keeps its gesture's around: it's marked noMoveStart.
  expect(tapZooms({ ...zoom, noMoveStart: true }, { originalEvent: { type: 'touchend' } })).toBe(false);
  expect(tapZooms(zoom, { originalEvent: { type: 'wheel' } })).toBe(false);
  // The app's own eases give no event, and a zoom with no `around` is about the middle already.
  expect(tapZooms(zoom)).toBe(false);
  expect(tapZooms({ zoom: 13 })).toBe(false);
  expect(tapZooms({ zoom: 15 }, { originalEvent: { type: 'dblclick' } })).toBe(false);
  // An ease about a point that doesn't zoom, as a turn or a tilt about it, is not a zoom to take it from.
  expect(tapZooms({ around: zoom.around }, { originalEvent: { type: 'dblclick' } })).toBe(false);
});

test('a pointer down on the map holds it from its press to its lift or its cancel, and two fingers hold it till both are up', () => {
  const down = pointersDown();
  expect(down.holds(0)).toBe(false);
  down.press(7, 100);
  expect(down.holds(100)).toBe(true);
  expect(down.holds(900)).toBe(true);
  down.press(8, 950);
  down.lift(7, 990);
  expect(down.holds(1000)).toBe(true);
  down.lift(8, 1040);
  expect(down.holds(1050)).toBe(false);
  // A lift of a pointer that was never down, or twice, holds nothing and takes nothing: one down on the map stays.
  down.press(10, 1060);
  down.lift(8);
  down.lift(9);
  expect(down.holds(1100)).toBe(true);
  down.lift(10);
  expect(down.holds(1150)).toBe(false);
});

test('a touch short enough to be a tap holds it for the half second in which a second tap makes a double-tap, as a jump would forget the first', () => {
  const down = pointersDown();
  down.press(5, 1000, true);
  down.lift(5, 1100);
  expect(down.holds(1100)).toBe(true);
  expect(down.holds(1599)).toBe(true);
  expect(down.holds(1600)).toBe(false);
  // The second tap holds from its own lift as well.
  down.press(6, 1300, true);
  down.lift(6, 1380);
  expect(down.holds(1879)).toBe(true);
  expect(down.holds(1880)).toBe(false);
  // A mouse's click has its dblclick, which keeps no state; a touch held as long as a tap may last is a press; a cancelled one is none.
  down.press(1, 5000);
  down.lift(1, 5050);
  expect(down.holds(5051)).toBe(false);
  down.press(7, 6000, true);
  down.lift(7, 6500);
  expect(down.holds(6501)).toBe(false);
  down.press(8, 7000, true);
  down.lift(8);
  expect(down.holds(7001)).toBe(false);
});

test('a press holds it for 3 s at most, so that a lift that never came does not hold it for good', () => {
  const down = pointersDown();
  down.press(1, 0);
  expect(down.holds(2999)).toBe(true);
  expect(down.holds(3000)).toBe(false);
  // A press since holds it from its own moment, as the one before it does not.
  down.press(2, 10_000);
  expect(down.holds(12_999)).toBe(true);
  expect(down.holds(13_000)).toBe(false);
  // A mouse is always pointer 1, so a press after one whose lift never came is the same ID: it holds from its own moment too.
  down.press(1, 20_000);
  expect(down.holds(22_999)).toBe(true);
  expect(down.holds(23_000)).toBe(false);
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test('a call runs at once, then at most once a second, the last one held back to the second', () => {
  const run = vi.fn();
  const limited = atMostEvery(1000, run);
  limited();
  expect(run).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(300);
  limited();
  vi.advanceTimersByTime(300);
  limited();
  expect(run).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(400);
  expect(run).toHaveBeenCalledTimes(2);
  // Nothing was called since: nothing runs.
  vi.advanceTimersByTime(5000);
  expect(run).toHaveBeenCalledTimes(2);
  limited();
  expect(run).toHaveBeenCalledTimes(3);
});
