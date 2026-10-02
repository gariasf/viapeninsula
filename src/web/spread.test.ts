import { expect, test } from 'vitest';
import { groupOf, spreading, type Drawn, type Group } from './spread.ts';

// Made up, on screen, in px: x right and y down. Heading right, up the screen is a Train's left, and
// down its right, where its pill reaches 5 px with its edge.
/** A Train drawn as a pill 20×10 px with its edge, heading so many degrees clockwise from up, standing at Station X unless it says. */
const pill = (id: string, [x, y]: [number, number], heading: number, more: Partial<Drawn> = {}): Drawn => ({ id, at: [x, y], heading, box: [10, 5], standsAt: 'X', ...more });

/** How far further right of where it's drawn each Train moved apart is, in px, once it has eased there, drawn from `now` 30 times a second for 3 s. */
const settled = (spread: ReturnType<typeof spreading>, drawn: Drawn[], now: number, group?: Group) => {
  for (let t = now; t < now + 3000; t += 1000 / 30) spread(drawn, t, group);
  return Object.fromEntries(spread(drawn, now + 3000, group));
};

test('a tap on a pill that touches another standing at its Station spreads the two side by side across their track, to its right, the tapped one nearest', () => {
  const both = [pill('first', [0, 0], 90), pill('second', [0, 0], 90)];
  const group = groupOf(both, 'second');
  expect(group).toEqual({ station: 'X', ids: new Set(['second', 'first']) });
  // Each pill's edge just clear of the next, and the tapped one's of where it was drawn.
  expect(settled(spreading(), both, 0, group)).toEqual({ second: 5, first: 15 });
});

test('a tap on a pill that touches none standing at its Station spreads nothing: not one further along, nor one touching it at another Station, nor one passing', () => {
  expect(groupOf([pill('north', [0, -5], 90), pill('south', [0, 5], 90)], 'north')).toBeUndefined();
  expect(groupOf([pill('here', [0, 0], 90), pill('next door', [0, 0], 90, { standsAt: 'Y' })], 'here')).toBeUndefined();
  expect(groupOf([pill('here', [0, 0], 90), pill('passing', [0, 0], 90, { standsAt: undefined })], 'here')).toBeUndefined();
  expect(groupOf([pill('passing', [0, 0], 90, { standsAt: undefined }), pill('here', [0, 0], 90)], 'passing')).toBeUndefined();
});

test('three standing together going the same way sit one after another; with one going the other way, it goes the other side', () => {
  const three = [pill('first', [0, 0], 90), pill('second', [0, 0], 90), pill('third', [0, 0], 90)];
  expect(settled(spreading(), three, 0, groupOf(three, 'first'))).toEqual({ first: 5, second: 15, third: 25 });
  const mixed = [pill('west', [0, 0], 270), pill('first', [0, 0], 90), pill('second', [0, 0], 90)];
  expect(settled(spreading(), mixed, 0, groupOf(mixed, 'first'))).toEqual({ west: 5, first: 5, second: 15 });
});

test('the group takes in those touching one that touches the tapped one, at its Station', () => {
  // 18 px apart along the track, the outer two don't touch, but each touches the middle one.
  const row = [pill('west', [-18, 0], 90), pill('middle', [0, 0], 90), pill('east', [18, 0], 90)];
  expect(groupOf(row, 'west')?.ids).toEqual(new Set(['west', 'middle', 'east']));
});

test('spread, they stay so until the group is folded, as by a tap elsewhere, when they ease back', () => {
  const spread = spreading();
  const both = [pill('first', [0, 0], 90), pill('second', [0, 0], 90)];
  const group = groupOf(both, 'first');
  expect(settled(spread, both, 0, group)).toEqual({ first: 5, second: 15 });
  expect(settled(spread, both, 60_000, group)).toEqual({ first: 5, second: 15 });
  const back = spread(both, 63_100).get('second') ?? 0;
  expect(back).toBeGreaterThan(0);
  expect(back).toBeLessThan(15);
  expect(settled(spread, both, 63_100)).toEqual({});
});

test('a Train leaving a spread group eases back onto its track, and the others close up', () => {
  const spread = spreading();
  const three = [pill('first', [0, 0], 90), pill('second', [0, 0], 90), pill('third', [0, 0], 90)];
  const group = groupOf(three, 'first');
  expect(settled(spread, three, 0, group)).toEqual({ first: 5, second: 15, third: 25 });
  const leaving = [pill('first', [0, 0], 90), pill('second', [30, 0], 90, { standsAt: undefined }), pill('third', [0, 0], 90)];
  expect(settled(spread, leaving, 10_000, group)).toEqual({ first: 5, third: 15 });
});

test('a Train coming in to a spread group stays where it is drawn, and moves no other', () => {
  const both = [pill('first', [0, 0], 90), pill('second', [0, 0], 90)];
  const group = groupOf(both, 'first');
  expect(settled(spreading(), [...both, pill('newcomer', [0, 0], 90)], 0, group)).toEqual({ first: 5, second: 15 });
});

test('a Train eases aside rather than jumping, part of the way each time Trains are drawn, however long since they last were', () => {
  const spread = spreading();
  const both = [pill('first', [0, 0], 90), pill('second', [0, 0], 90)];
  const group = groupOf(both, 'first');
  spread(both, 0, group);
  const [first, second] = [spread(both, 1000, group), spread(both, 1250, group)];
  expect(first.get('second')).toBeGreaterThan(0);
  expect(second.get('second')).toBeGreaterThan(first.get('second') ?? 0);
  expect(second.get('second')).toBeLessThan(15);
});

test('how far apart they go comes from their pills, as the track lies across them on screen', () => {
  const both = [pill('first', [0, 0], 45), pill('second', [0, 0], 45)];
  // Across a track running up and to the right, a pill 20×10 px reaches 7.07 px, at its corners.
  const moved = settled(spreading(), both, 0, groupOf(both, 'first'));
  expect(moved.first).toBeCloseTo(7.071, 3);
  expect(moved.second).toBeCloseTo(21.213, 3);
});
