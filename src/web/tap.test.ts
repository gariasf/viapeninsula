import { expect, test } from 'vitest';
import type { Stroke } from '../bundle.ts';
import { linesAt } from './tap.ts';

/** A stroke of a Line along a shape, at a side. */
const stroke = (line: string, shape: string, side = 0, more: Partial<Stroke> = {}): Stroke => ({ line, shape, from: 0, to: 100, side, ...more });

test("a tap on one Line's stroke along a Stretch names every Line on the Stretch, in its order", () => {
  const strokes = [stroke('R2', 'stretch:3', 1), stroke('R1', 'stretch:3', -1), stroke('R4', 'stretch:3', 0), stroke('L1', 'stretch:4')];
  expect(linesAt([{ line: 'R4', shape: 'stretch:3' }], strokes)).toEqual(['R1', 'R4', 'R2']);
});

test('a Line drawn in more than one zoom band, or in pieces, counts once', () => {
  const strokes = [stroke('R1', 'stretch:3', -1), stroke('R1', 'stretch:3', -1, { band: 2 }), stroke('R2', 'stretch:3', 1)];
  expect(linesAt([{ line: 'R1', shape: 'stretch:3' }, { line: 'R2', shape: 'stretch:3' }], strokes)).toEqual(['R1', 'R2']);
});

test("a curve across a node, or a Line on its own track, names the Lines whose strokes were tapped, in the order they're drawn", () => {
  const strokes = [stroke('R1', 'stretch:link0', -1), stroke('R2', 'stretch:link1', 1)];
  expect(linesAt([{ line: 'R2', shape: 'stretch:link1' }, { line: 'R1', shape: 'stretch:link0' }], strokes)).toEqual(['R2', 'R1']);
  // Zoomed right in, on shared grey track, every Line on it.
  expect(linesAt([{ line: 'R1', shape: 'rodalies:51_R1' }, { line: 'R4', shape: 'rodalies:51_R4' }, { line: 'R1', shape: 'rodalies:51_R1_INV' }], [])).toEqual(['R1', 'R4']);
});

test('two Stretches tapped at once name the first Stretch, then the next', () => {
  const strokes = [stroke('R1', 'stretch:3', -1), stroke('R4', 'stretch:3', 1), stroke('L1', 'stretch:4', 0), stroke('R4', 'stretch:4', 1)];
  expect(linesAt([{ line: 'L1', shape: 'stretch:4' }, { line: 'R1', shape: 'stretch:3' }], strokes)).toEqual(['L1', 'R4', 'R1']);
});

test('nothing tapped names no Line', () => {
  expect(linesAt([], [stroke('R1', 'stretch:3')])).toEqual([]);
});
