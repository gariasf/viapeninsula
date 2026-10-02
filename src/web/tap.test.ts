import { expect, test } from 'vitest';
import type { Stroke } from '../bundle.ts';
import { linesAt } from './tap.ts';

/** A stroke of a Line along a shape, at a side. */
const stroke = (line: string, shape: string, side = 0, more: Partial<Stroke> = {}): Stroke => ({ line, shape, from: 0, to: 100, side, ...more });
/** Tapped on a Line's stroke along a shape, from 0 to 100 m along it, as stroke() makes it. */
const tap = (line: string, shape: string) => ({ line, shape, from: 0, to: 100 });

test("a tap on one Line's stroke along a Stretch names every Line on the Stretch, in its order", () => {
  const strokes = [stroke('R2', 'stretch:3', 1), stroke('R1', 'stretch:3', -1), stroke('R4', 'stretch:3', 0), stroke('L1', 'stretch:4')];
  expect(linesAt([tap('R4', 'stretch:3')], strokes)).toEqual(['R1', 'R4', 'R2']);
});

test('a Line drawn in more than one zoom band, or in pieces, counts once', () => {
  const strokes = [stroke('R1', 'stretch:3', -1), stroke('R1', 'stretch:3', -1, { band: 2 }), stroke('R2', 'stretch:3', 1)];
  expect(linesAt([tap('R1', 'stretch:3'), tap('R2', 'stretch:3')], strokes)).toEqual(['R1', 'R2']);
});

test("a curve across a node, or a Line on its own track, names the Lines whose strokes were tapped, in the order they're drawn", () => {
  const strokes = [stroke('R1', 'stretch:link0', -1), stroke('R2', 'stretch:link1', 1)];
  expect(linesAt([tap('R2', 'stretch:link1'), tap('R1', 'stretch:link0')], strokes)).toEqual(['R2', 'R1']);
  // Zoomed right in, on shared grey track, every Line on it.
  expect(linesAt([tap('R1', 'rodalies:51_R1'), tap('R4', 'rodalies:51_R4'), tap('R1', 'rodalies:51_R1_INV')], [])).toEqual(['R1', 'R4']);
});

test('two Stretches tapped at once name the first Stretch, then the next', () => {
  const strokes = [stroke('R1', 'stretch:3', -1), stroke('R4', 'stretch:3', 1), stroke('L1', 'stretch:4', 0), stroke('R4', 'stretch:4', 1)];
  expect(linesAt([tap('L1', 'stretch:4'), tap('R1', 'stretch:3')], strokes)).toEqual(['L1', 'R4', 'R1']);
});

test("a centreline runs through Stretch after Stretch: only the Lines on the tapped stroke's Stretch are named", () => {
  // One centreline, a Stretch of R1 and R4 to 100 m, then one of R1, R2 and R4 on to 300 m, cut at 200 m where R4 goes into a tunnel.
  const strokes = [stroke('R1', 'stretch:0', -1), stroke('R4', 'stretch:0', 1), stroke('R1', 'stretch:0', -1, { from: 100, to: 300 }), stroke('R2', 'stretch:0', 0, { from: 100, to: 300 }), stroke('R4', 'stretch:0', 1, { from: 100, to: 200 }), stroke('R4', 'stretch:0', 1, { from: 200, to: 300, under: 1 })];
  expect(linesAt([tap('R1', 'stretch:0')], strokes)).toEqual(['R1', 'R4']);
  expect(linesAt([{ line: 'R2', shape: 'stretch:0', from: 100, to: 300 }], strokes)).toEqual(['R1', 'R2', 'R4']);
  expect(linesAt([{ line: 'R4', shape: 'stretch:0', from: 200, to: 300 }], strokes)).toEqual(['R1', 'R2', 'R4']);
});

test('nothing tapped names no Line', () => {
  expect(linesAt([], [stroke('R1', 'stretch:3')])).toEqual([]);
});
