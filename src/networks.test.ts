import { expect, test } from 'vitest';
import { NETWORKS, regionOf, regionsOf } from './networks.ts';

test("puts Catalonia's four Networks in one region and each other Network in a region of its own, its ID", () => {
  const regions = regionsOf(NETWORKS).map((r) => [r.id, r.networks.map((n) => n.id)]);
  expect(regions[0]).toEqual(['catalonia', ['rodalies', 'fgc', 'tram', 'metro']]);
  // The 14 other núcleos, one region each, which makes 15.
  expect(regions).toHaveLength(15);
  expect(regions.slice(1).every(([id, networks]) => networks?.length === 1 && networks[0] === id)).toBe(true);
});

test("keeps each region's Networks together, in the order of the Networks, so that the regions' tracks join up as the Networks list them", () => {
  expect(regionsOf(NETWORKS).flatMap((r) => r.networks)).toEqual(NETWORKS);
});

test('a region is what a Network names, or its ID where it names none', () => {
  expect(regionOf({ id: 'cercanias-madrid' })).toBe('cercanias-madrid');
  expect(regionOf({ id: 'fgc', region: 'catalonia' })).toBe('catalonia');
});

test('groups Networks that name a region by where the first of them comes, though others come between', () => {
  const [a, b, c] = [{ id: 'a', region: 'x' }, { id: 'b' }, { id: 'c', region: 'x' }];
  expect(regionsOf([a, b, c])).toEqual([{ id: 'x', networks: [a, c] }, { id: 'b', networks: [b] }]);
});
