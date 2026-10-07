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

/** The light cards' colour, style.css's --card. */
const CARD = '#ffffff';

test('on a light card, a light Line is lettered in its colour mixed with black, no further than it takes to read at 4.5:1', () => {
  // Rodalies' R2N and R4, TRAM's T2 and FGC's L12, all under 3:1 on white, as their feeds give them.
  for (const colour of ['#D0DF00', '#F7A30D', '#80FF80', '#b2aed3']) {
    const lettered = contrast(lettering(colour, CARD), CARD);
    expect(lettered).toBeGreaterThanOrEqual(4.5);
    expect(lettered).toBeLessThan(4.7);
  }
});

test('on a light card, a Line whose colour reads at 4.5:1 is lettered in it, and a darkened one keeps its hue', () => {
  // The Metro's L1 and FGC's MM.
  for (const colour of ['#CE1126', '#000000']) expect(lettering(colour, CARD)).toBe(colour);
  // R4's orange, its red the most and its blue the least.
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => parseInt(lettering('#F7A30D', CARD).slice(i, i + 2), 16));
  expect(r).toBeGreaterThan(g);
  expect(g).toBeGreaterThan(b);
});
