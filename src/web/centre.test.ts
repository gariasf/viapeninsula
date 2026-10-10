import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { atMostEvery, drifted, letsGo } from './centre.ts';

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
