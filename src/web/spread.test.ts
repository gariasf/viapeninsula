import { expect, test } from 'vitest';
import { groupOf, held, piles, spreading, type Drawn, type Group, type Named } from './spread.ts';

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

test('spread, they stay so where they no longer touch where drawn, as zoomed in, where their tracks lie further apart', () => {
  const spread = spreading();
  const group = groupOf([pill('first', [0, 0], 90), pill('second', [0, 0], 90)], 'first');
  expect(settled(spread, [pill('first', [0, 0], 90), pill('second', [0, 0], 90)], 0, group)).toEqual({ first: 5, second: 15 });
  expect(settled(spread, [pill('first', [0, -20], 90), pill('second', [0, 20], 90)], 10_000, group)).toEqual({ first: 5, second: 5 });
});

/** A Train's pill as piles() takes it, its name 12×6 px in the middle of it, unless it says. */
const named = (id: string, at: [number, number], more: Partial<Named> = {}): Named => ({ id, at, box: [10, 5], name: [6, 3], ...more });

test('of two pills that meet, the one under, whose name the one drawn over it meets, folds into it: a pile drawn as its top pill, counting the other', () => {
  expect(piles([named('under', [0, 0]), named('over', [4, 1])])).toEqual(new Map([['over', ['under']]]));
  expect(piles([named('over', [4, 1]), named('under', [0, 0])])).toEqual(new Map([['over', ['under']]]));
});

test('of two pills level on screen, the earlier in the order is drawn over the other, and the later folds into it', () => {
  expect(piles([named('first', [0, 0]), named('second', [4, 0])])).toEqual(new Map([['first', ['second']]]));
});

test('a pill whose name the pill over it only grazes the outline of, beside or below its name, is drawn; one px into the name, it folds', () => {
  // The one over it reaches from x 7 to 27, its name only to 6; and from y 4 to 14, its name only to 3.
  expect(piles([named('under', [0, 0]), named('over', [17, 1])])).toEqual(new Map());
  expect(piles([named('under', [0, 0]), named('over', [0, 9])])).toEqual(new Map());
  expect(piles([named('under', [0, 0]), named('over', [15.9, 1])])).toEqual(new Map([['over', ['under']]]));
  expect(piles([named('under', [0, 0]), named('over', [0, 7.9])])).toEqual(new Map([['over', ['under']]]));
});

test('pills no other pill meets are all drawn: edge to edge, across or up and down, or apart', () => {
  expect(piles([named('west', [0, 0]), named('east', [20, 0]), named('south', [0, 10]), named('far', [100, 100])])).toEqual(new Map());
  // Wide apart across the screen but level, and level across but apart up and down.
  expect(piles([named('a', [0, 0]), named('b', [5, 30]), named('c', [40, 0])])).toEqual(new Map());
});

test('a pile folds into its top pill each under it whose name it meets; one whose name meets only a folded pill is drawn, as nothing drawn lies on it', () => {
  const pile = [named('beside', [-15, -1]), named('bottom', [0, 0]), named('middle', [1, 1]), named('top', [2, 2])];
  expect(piles(pile)).toEqual(new Map([['top', ['middle', 'bottom']]]));
});

test('a pill that two pills drawn over it meet folds into the topmost, and piles apart count apart', () => {
  // `left` and `right` both meet `under`'s name, but not each other's.
  expect(piles([named('under', [0, 0]), named('left', [-12, 1]), named('right', [12, 2])])).toEqual(new Map([['right', ['under']]]));
  expect(piles([named('a', [0, 0]), named('a over', [1, 1]), named('b', [100, 0]), named('b over', [101, 1])])).toEqual(
    new Map([
      ['a over', ['a']],
      ['b over', ['b']],
    ]),
  );
});

test('the followed Train, in a layer over every pill, never folds, and those whose names it meets, wherever they are on screen, fold into it and it counts them', () => {
  const followed = named('followed', [0, 5], { box: [20, 8] });
  expect(piles([followed, named('below', [25, 6]), named('apart', [45, 6])], 'followed')).toEqual(new Map([['followed', ['below']]]));
  expect(piles([named('lower', [0, 6]), followed], 'followed')).toEqual(new Map([['followed', ['lower']]]));
});

test('the Trains a spread pile holds apart never fold: one under a pill that meets its name is drawn, its name over that pill, and a pill under one of them, whose name it meets, folds into it', () => {
  expect(piles([named('spread', [0, 0]), named('over it', [4, 1])], undefined, new Set(['spread']))).toEqual(new Map());
  expect(piles([named('spread', [4, 1]), named('under it', [0, 0])], undefined, new Set(['spread']))).toEqual(new Map([['spread', ['under it']]]));
  // Nor under the followed Train, in its layer over them.
  expect(piles([named('spread', [0, 0]), named('followed', [4, -1])], 'followed', new Set(['spread']))).toEqual(new Map());
});

test('a tap on a counted pill spreads its pile, moving or standing: it, first, and those folded into it, and those standing at its Station whose pills touch them', () => {
  const moving = { standsAt: undefined };
  const pile = [pill('top', [0, 0], 90, moving), pill('folded', [2, 0], 90, moving), pill('passing', [4, 0], 90, moving), pill('far', [100, 0], 90, moving)];
  expect(groupOf(pile, 'top', ['folded'])).toEqual({ ids: new Set(['top', 'folded']), pile: true });
  // Standing at X: those standing there that touch the pile, chained, but not one at Y, nor one passing that isn't in it.
  const standing = [pill('top', [0, 0], 90), pill('folded', [2, 0], 90, moving), pill('beside', [18, 0], 90), pill('next', [36, 0], 90), pill('at Y', [0, 0], 90, { standsAt: 'Y' }), pill('passing', [4, 0], 90, moving)];
  expect(groupOf(standing, 'top', ['folded'])).toEqual({ station: 'X', ids: new Set(['top', 'folded', 'beside', 'next']), pile: true });
});

test('a spread pile of moving Trains goes side by side, each across its own track, as a standing group does', () => {
  const moving = { standsAt: undefined };
  const pile = [pill('top', [0, 0], 90, moving), pill('folded', [2, 0], 90, moving), pill('west', [1, 0], 270, moving)];
  expect(settled(spreading(), pile, 0, groupOf(pile, 'top', ['folded', 'west']))).toEqual({ top: 5, folded: 15, west: 5 });
});

test('a spread moving pile holds each of its Trains apart while, where it would be drawn unspread, its pill touches another of the pile, and ends once none does', () => {
  const moving = { standsAt: undefined };
  const spread = spreading();
  const together = [pill('top', [0, 0], 90, moving), pill('folded', [2, 0], 90, moving), pill('third', [4, 0], 90, moving)];
  const group = groupOf(together, 'top', ['folded', 'third'])!;
  expect(settled(spread, together, 0, group)).toEqual({ top: 5, folded: 15, third: 25 });
  // The third runs on ahead, clear of the others: it eases back onto its track, and they close up.
  const ahead = [pill('top', [0, 0], 90, moving), pill('folded', [2, 0], 90, moving), pill('third', [30, 0], 90, moving)];
  expect(held(ahead, group).map((t) => t.id)).toEqual(['top', 'folded']);
  expect(settled(spread, ahead, 10_000, group)).toEqual({ top: 5, folded: 15 });
  // Then all part: none is held, and the group ends.
  const parted = [pill('top', [0, 0], 90, moving), pill('folded', [0, 30], 90, moving), pill('third', [60, 0], 90, moving)];
  expect(held(parted, group)).toEqual([]);
});

test("a pile spread at a Station holds those standing there, touching or not, as a tapped group does, and one leaving while its pill still touches theirs; a tapped group with no count lets that one go at once, as before", () => {
  const three = [pill('first', [0, 0], 90), pill('second', [0, 0], 90), pill('third', [0, 0], 90)];
  const leaving = [pill('first', [0, -20], 90), pill('second', [0, 20], 90), pill('third', [2, 20], 90, { standsAt: undefined })];
  const pile = groupOf(three, 'first', ['second', 'third'])!;
  expect(held(leaving, pile).map((t) => t.id)).toEqual(['first', 'second', 'third']);
  expect(held(leaving, groupOf(three, 'first')!).map((t) => t.id)).toEqual(['first', 'second']);
});
