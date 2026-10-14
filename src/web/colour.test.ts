import { expect, test } from 'vitest';
import { contrast, darkInk, INK, lettering, standIn } from './colour.ts';

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

test('a colour written in three digits is the six it stands for, as INK is, #111', () => {
  // R2N's yellow-green against it: 12.8:1, which was NaN.
  expect(contrast('#D0DF00', '#111')).toBeCloseTo(12.8, 1);
  expect(contrast('#D0DF00', '#111')).toBe(contrast('#D0DF00', '#111111'));
  expect(contrast('#fff', '#000')).toBeCloseTo(21);
});

test('each digit of a colour written in three is doubled, not the three repeated: #f80 is #ff8800, not #f80f80', () => {
  // The three-digit colours of the other tests, #111, #fff and #000, read the same either way.
  expect(contrast('#f80', '#ff8800')).toBe(1);
  expect(contrast('#2A9', '#22aa99')).toBe(1);
});

test('a paper written #fff letters a Line as #ffffff does', () => {
  // R2N's, mixed with black no further than it takes to read at 4.5:1; and the Metro's L1, which reads already, as it is.
  expect(lettering('#D0DF00', '#fff')).toBe('#727b00');
  expect(lettering('#CE1126', '#fff')).toBe('#CE1126');
});

test('a Live Train is lettered in dark ink on the Lines white reads worst on, which it reads on at 4.5:1', () => {
  // TRAM's T2, Rodalies' R2N, RT1, R17, R1, R4, R13 and R2, Metro's L4 and L3, and FGC's R6, S8, S2 and S1, as their feeds and the config give them: 1.3:1 to 4.1:1 with white.
  const lines = ['#80FF80', '#D0DF00', '#39D4CC', '#F3B12E', '#7DBCEC', '#F7A30D', '#E52E87', '#26A741', '#F7A30E', '#1EB53A', '#b3b3b3', '#49C0DE', '#88BB0B', '#EF7900'];
  for (const colour of lines) {
    expect(darkInk(colour)).toBe(true);
    expect(contrast(colour, INK)).toBeGreaterThanOrEqual(4.5);
  }
});

test("white stays on the Lines it reads on better than ink does, as on Bilbao's C2, where neither reaches 4.5:1", () => {
  // The Metro's L1, TRAM's T3 at 4.50:1, Madrid's C4 and FGC's MM, black.
  for (const colour of ['#CE1126', '#0074E8', '#2C2A86', '#000000']) expect(darkInk(colour)).toBe(false);
  // Bilbao's C2 is 4.37:1 with white and 4.32 with ink.
  expect(darkInk('#0F8C2D')).toBe(false);
});

test("Media Distancia y Avant's black has a light grey stand-in for its Lines on the dark basemap, a mid grey for its track below zoom 7, and no other Network's colour changes (#263, #781)", () => {
  const file = { networks: [{ id: 'media-distancia-avant', colour: '#000000' }, { id: 'fgc', colour: '#F26100' }], lines: [{ network: 'media-distancia-avant', colour: '#000000' }, { network: 'fgc', colour: '#000000' }] };
  expect(standIn(file)).toEqual({ networks: [{ id: 'media-distancia-avant', colour: '#707070' }, { id: 'fgc', colour: '#F26100' }], lines: [{ network: 'media-distancia-avant', colour: '#D0D0D0' }, { network: 'fgc', colour: '#000000' }] });
  expect(contrast('#D0D0D0', '#0c0c0c')).toBeGreaterThan(12);
  // Its track reads on the paper and apart from the basemap's roads, but less than Ouigo's pink (#781).
  expect(contrast('#707070', '#3a3a3a')).toBeGreaterThan(2);
  expect(contrast('#707070', '#0c0c0c')).toBeLessThan(contrast('#E50A70', '#0c0c0c'));
  // A Trips file, with neither, as it is.
  expect(standIn({ trips: [] })).toEqual({ trips: [] });
});
