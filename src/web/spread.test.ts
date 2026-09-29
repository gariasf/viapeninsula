import { expect, test } from 'vitest';
import { spreading, type Drawn } from './spread.ts';

// Made up, on screen, in px: x right and y down. Heading right, up the screen is a Train's left, and
// down its right, where its pill reaches 5 px with its edge.
/** A Train drawn as a pill 20×10 px with its edge, on its track, heading so many degrees clockwise from up, one of Rodalies' standing at Station X unless it says. */
const pill = (id: string, [x, y]: [number, number], heading: number, more: Partial<Drawn> = {}): Drawn => ({ id, at: [x, y], heading, aside: 0, box: [10, 5], network: 'rodalies', standsAt: 'X', fixed: false, ...more });

/** How far further right of its track each Train moved apart is drawn, in px, once it has eased there, drawn from `now` 30 times a second for 3 s. */
const settled = (spread: ReturnType<typeof spreading>, drawn: Drawn[], now: number) => {
  for (let t = now; t < now + 3000; t += 1000 / 30) spread(drawn, t);
  return Object.fromEntries(spread(drawn, now + 3000));
};

test('two Trains standing at a Station whose pills touch go side by side across their track, to its right, the newer nearest it', () => {
  const spread = spreading();
  spread([pill('first', [0, 0], 90)], 0);
  const both = [pill('first', [0, 0], 90), pill('second', [0, 0], 90)];
  // Each pill's edge just clear of the next, and the newer's of the track.
  expect(settled(spread, both, 1000)).toEqual({ second: 5, first: 15 });
});

test('going opposite ways, each goes to the right of its own direction, from where each is drawn beside its track', () => {
  // Each drawn 2 px to its right, keeping to its side of a double track: one below the track, one above.
  const pair = [pill('east', [0, 2], 90, { aside: 2 }), pill('west', [0, -2], 270, { aside: 2 })];
  expect(settled(spreading(), pair, 0)).toEqual({ east: 3, west: 3 });
});

test('three standing together going the same way sit one after another, the newest nearest the track', () => {
  const spread = spreading();
  spread([pill('first', [0, 0], 90)], 0);
  spread([pill('first', [0, 0], 90), pill('second', [0, 0], 90)], 1000);
  const three = [pill('first', [0, 0], 90), pill('second', [0, 0], 90), pill('third', [0, 0], 90)];
  expect(settled(spread, three, 2000)).toEqual({ third: 5, second: 15, first: 25 });
});

test('of three standing together, the two going one way sit one after another and the third goes the other side', () => {
  const spread = spreading();
  spread([pill('west', [0, 0], 270)], 0);
  spread([pill('west', [0, 0], 270), pill('first', [0, 0], 90)], 1000);
  const three = [pill('west', [0, 0], 270), pill('first', [0, 0], 90), pill('second', [0, 0], 90)];
  expect(settled(spread, three, 2000)).toEqual({ west: 5, second: 5, first: 15 });
});

test("Trains standing at a Station whose pills don't touch, or touching at different Stations, stay where they are", () => {
  // Zoomed in, the tracks of a large Station lie far enough apart that pills 10 px high on them just clear each other.
  expect(settled(spreading(), [pill('north', [0, -5], 90), pill('south', [0, 5], 90)], 0)).toEqual({});
  expect(settled(spreading(), [pill('here', [0, 0], 90), pill('next door', [15, 0], 90, { standsAt: 'Y' })], 0)).toEqual({});
});

test('a Train passing a Station stays on its track, and one standing there that it would touch moves clear of it while it passes, and back once it has', () => {
  const spread = spreading();
  const passing = (x: number) => [pill('standing', [0, 0], 90), pill('passing', [x, 0], 90, { standsAt: undefined })];
  expect(settled(spread, passing(-25), 0)).toEqual({});
  // Its pill would touch the standing one's from 20 px away.
  expect(settled(spread, passing(-15), 100_000)).toEqual({ standing: 10 });
  expect(settled(spread, passing(0), 200_000)).toEqual({ standing: 10 });
  expect(settled(spread, passing(25), 300_000)).toEqual({});
});

test("only a Train of the Station's Network running along its track passes it: one of another, or crossing the track, leaves a Train standing there where it is", () => {
  const passing = (more: Partial<Drawn>) => [pill('standing', [0, 0], 90), pill('passing', [-10, 0], 90, { standsAt: undefined, ...more })];
  expect(settled(spreading(), passing({ network: 'metro' }), 0)).toEqual({});
  expect(settled(spreading(), passing({ heading: 150 }), 0)).toEqual({});
  // Within 30° of the track's line, either way, it passes.
  expect(settled(spreading(), passing({ heading: 115 }), 0)).toEqual({ standing: 10 });
  expect(settled(spreading(), passing({ heading: 270 }), 0)).toEqual({ standing: 10 });
});

test('the followed Train never moves aside, and those standing with it move round it', () => {
  const spread = spreading();
  spread([pill('first', [0, 0], 90)], 0);
  const group = (followed: string) => [pill('first', [0, 0], 90), pill('second', [0, 0], 90), pill('west', [0, 0], 270)].map((t) => (t.id === followed ? { ...t, fixed: true, box: [12, 6] as [number, number] } : t));
  expect(settled(spread, group(''), 1000)).toEqual({ second: 5, first: 15, west: 5 });
  // Followed, it goes back onto its track, and the others round it, its pill reaching 6 px.
  expect(settled(spread, group('second'), 100_000)).toEqual({ first: 11, west: 11 });
});

test('a Train eases aside and back rather than jumping, part of the way each time Trains are drawn, however long since they last were', () => {
  const spread = spreading();
  spread([pill('first', [0, 0], 90)], 0);
  const both = [pill('first', [0, 0], 90), pill('second', [0, 0], 90)];
  // Drawn as the second comes in, a second on, each has gone part of the way, and a little further each drawing.
  const [first, second] = [spread(both, 1000), spread(both, 1250)];
  expect(first.get('second')).toBeGreaterThan(0);
  expect(first.get('first')).toBeGreaterThan(0);
  expect(second.get('second')).toBeGreaterThan(first.get('second') ?? 0);
  expect(second.get('second')).toBeLessThan(5);
  expect(second.get('first')).toBeGreaterThan(first.get('first') ?? 0);
  expect(second.get('first')).toBeLessThan(15);
  expect(settled(spread, both, 1250)).toEqual({ second: 5, first: 15 });
  // The second gone, as off the map, the first eases back.
  const back = spread([pill('first', [0, 0], 90)], 4300).get('first') ?? 0;
  expect(back).toBeGreaterThan(0);
  expect(back).toBeLessThan(15);
  expect(settled(spread, [pill('first', [0, 0], 90)], 4300)).toEqual({});
});

test('each keeps its place while it stands there, and when one leaves, the others close up once it has gone', () => {
  const spread = spreading();
  const standing = (...ids: string[]) => ids.map((id) => pill(id, [0, 0], 90));
  spread(standing('first'), 0);
  spread(standing('first', 'second'), 1000);
  expect(settled(spread, standing('first', 'second', 'third'), 2000)).toEqual({ third: 5, second: 15, first: 25 });
  // The second leaves, and runs on its track past the others, which stay clear of it.
  const leaving = (x: number) => [...standing('first', 'third'), pill('second', [x, 0], 90, { standsAt: undefined })];
  expect(settled(spread, leaving(0), 10_000)).toEqual({ third: 10, first: 20 });
  expect(settled(spread, leaving(25), 20_000)).toEqual({ third: 5, first: 15 });
});

test('standing on different tracks of a Station, each goes out from its own track, clear of those moved already', () => {
  const spread = spreading();
  spread([pill('first', [0, 0], 90)], 0);
  // The second's track 8 px right of the first's: the second goes 5 px out, and the first past it.
  expect(settled(spread, [pill('first', [0, 0], 90), pill('second', [0, 8], 90)], 1000)).toEqual({ second: 5, first: 23 });
});

test("moved apart, a Train goes on past any other standing at its Station that it would cover, which stays where it is, but not past one passing that it didn't touch", () => {
  const spread = spreading();
  spread([pill('first', [0, 0], 90)], 0);
  // On a track 20 px right of theirs, one standing there that neither touches, and then one passing there instead.
  const others = (other: Drawn) => [pill('first', [0, 0], 90), pill('second', [0, 0], 90), other];
  expect(settled(spread, others(pill('beside', [0, 20], 90)), 1000)).toEqual({ second: 5, first: 30 });
  expect(settled(spread, others(pill('passing', [0, 20], 270, { standsAt: undefined })), 10_000)).toEqual({ second: 5, first: 15 });
});

test('the followed Train standing at the Station is gone round whichever way it heads', () => {
  const followed = pill('followed', [0, 0], 0, { fixed: true, box: [12, 6] });
  expect(settled(spreading(), [followed, pill('standing', [0, 0], 90)], 0)).toEqual({ standing: 11 });
});

test('each keeps its place when the map stops drawing them for a while, as while it looks elsewhere, and draws them again', () => {
  const spread = spreading();
  const standing = (...ids: string[]) => ids.map((id) => pill(id, [0, 0], 90));
  // They come in B, C, A, and the map lists them A, B, C.
  spread(standing('B'), 0);
  spread(standing('B', 'C'), 1000);
  expect(settled(spread, standing('A', 'B', 'C'), 2000)).toEqual({ A: 5, C: 15, B: 25 });
  spread([], 10_000);
  expect(settled(spread, standing('A', 'B', 'C'), 60_000)).toEqual({ A: 5, C: 15, B: 25 });
});

test('how far apart they go comes from their pills, as the track lies across them on screen', () => {
  const spread = spreading();
  spread([pill('first', [0, 0], 45)], 0);
  // Across a track running up and to the right, a pill 20×10 px reaches 7.07 px, at its corners.
  const moved = settled(spread, [pill('first', [0, 0], 45), pill('second', [0, 0], 45)], 1000);
  expect(moved.second).toBeCloseTo(7.071, 3);
  expect(moved.first).toBeCloseTo(21.213, 3);
});
