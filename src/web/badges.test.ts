import { expect, test } from 'vitest';
import { type Drawn, stretches } from './badges.ts';

/** A Line's stroke along a shape in zoom band 3, from 0 to 100 m along it, at a side, drawn whole. */
const stroke = (line: string, shape: string, side = 0, more: Partial<Drawn> = {}): Drawn => ({ line, shape, from: 0, to: 100, side, band: 3, cut: [0, 0], ...more });

test("a Stretch's Lines come in its order, where its strokes are drawn", () => {
  const strokes = [stroke('R2', 'stretch:3', 1), stroke('R1', 'stretch:3', -1), stroke('R4', 'stretch:3', 0)];
  expect(stretches(strokes)).toEqual([{ shape: 'stretch:3', band: 3, from: 0, to: 100, lines: ['R1', 'R4', 'R2'] }]);
});

test('a centreline runs through Stretch after Stretch, which end where Lines join or leave, not where one goes into a tunnel', () => {
  // A Stretch of R1 and R4 to 100 m, then one of R1, R2 and R4 on to 300 m, cut at 200 m where R4 goes into a tunnel.
  const strokes = [stroke('R1', 'stretch:0', -1), stroke('R4', 'stretch:0', 1), stroke('R1', 'stretch:0', -1, { from: 100, to: 300 }), stroke('R2', 'stretch:0', 0, { from: 100, to: 300 }), stroke('R4', 'stretch:0', 1, { from: 100, to: 200 }), stroke('R4', 'stretch:0', 1, { from: 200, to: 300, under: 1 })];
  expect(stretches(strokes)).toEqual([
    { shape: 'stretch:0', band: 3, from: 0, to: 100, lines: ['R1', 'R4'] },
    { shape: 'stretch:0', band: 3, from: 100, to: 300, lines: ['R1', 'R2', 'R4'] },
  ]);
});

test('where curves take over, a Stretch is drawn from where all its Lines are', () => {
  const strokes = [stroke('R1', 'stretch:3', -1, { cut: [10, 0] }), stroke('R2', 'stretch:3', 1, { cut: [30, 5] })];
  expect(stretches(strokes)).toEqual([{ shape: 'stretch:3', band: 3, from: 30, to: 95, lines: ['R1', 'R2'] }]);
});

test('a Stretch a node absorbs in a band has none there, but it has in the next', () => {
  const strokes = [stroke('R1', 'stretch:3', -1, { cut: [60, 40] }), stroke('R1', 'stretch:3', -1, { band: 4 })];
  expect(stretches(strokes)).toEqual([{ shape: 'stretch:3', band: 4, from: 0, to: 100, lines: ['R1'] }]);
});

test("a Line drawn in pieces counts once, and a gap in a centreline's strokes parts its Stretches", () => {
  const strokes = [stroke('R1', 'stretch:3', 0, { to: 50 }), stroke('R1', 'stretch:3', 0, { from: 50 }), stroke('R1', 'stretch:3', 0, { from: 150, to: 200 })];
  expect(stretches(strokes)).toEqual([
    { shape: 'stretch:3', band: 3, from: 0, to: 100, lines: ['R1'] },
    { shape: 'stretch:3', band: 3, from: 150, to: 200, lines: ['R1'] },
  ]);
});
