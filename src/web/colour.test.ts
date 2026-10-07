import { expect, test } from 'vitest';
import { contrast, lettering } from './colour.ts';

/** The dark basemap's paper, OpenFreeMap's dark style's background. */
const PAPER = '#0c0c0c';

test('weighs two colours against each other as WCAG does, the lighter over the darker', () => {
  expect(contrast('#000000', '#ffffff')).toBeCloseTo(21);
  expect(contrast('#ffffff', '#000000')).toBeCloseTo(21);
  expect(contrast('#ce1126', '#ce1126')).toBe(1);
});

test('a Line whose colour reads at 4.5:1 on the dark paper is lettered in it', () => {
  // TRAM's T1 and Rodalies' R2, as their feeds give them.
  for (const colour of ['#FF0D0D', '#26A741']) expect(lettering(colour, PAPER)).toBe(colour);
});

test('a darker Line is lettered in its colour mixed with white, no further than it takes to read at 4.5:1', () => {
  // FGC's MM, black, Cercanías Madrid's C4, under 3:1, and Metro's L1, under 4.5:1.
  for (const colour of ['#000000', '#2C2A86', '#CE1126']) {
    const lettered = contrast(lettering(colour, PAPER), PAPER);
    expect(lettered).toBeGreaterThanOrEqual(4.5);
    expect(lettered).toBeLessThan(4.7);
  }
});

test('mixed with white, a Line keeps its hue', () => {
  // C4's blue, its blue the most and its green the least.
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(lettering('#2C2A86', PAPER).slice(i, i + 2), 16));
  expect(b).toBeGreaterThan(r);
  expect(r).toBeGreaterThan(g);
});
