import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { atMostEvery, drifted, letsGo, pointersDown } from './centre.ts';

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

test('a pointer down on the map holds it from its press to its lift or its cancel, and two fingers hold it till both are up', () => {
  const down = pointersDown();
  expect(down.holds(0)).toBe(false);
  down.press(7, 100);
  expect(down.holds(100)).toBe(true);
  expect(down.holds(900)).toBe(true);
  down.press(8, 950);
  down.lift(7);
  expect(down.holds(1000)).toBe(true);
  down.lift(8);
  expect(down.holds(1050)).toBe(false);
  // A lift of a pointer that was never down, or twice, holds nothing and takes nothing.
  down.lift(8);
  down.lift(9);
  expect(down.holds(1100)).toBe(false);
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
