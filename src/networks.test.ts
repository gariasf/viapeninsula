import { expect, test } from 'vitest';
import { AVE_LARGA_DISTANCIA, EUSKOTREN, EVERYWHERE, LIVE_SOURCES, NETWORKS, OUIGO, regionOf, regionsOf } from './networks.ts';

test("puts Catalonia's four Networks in one region, Ouigo and AVE y Larga Distancia in long distance's, which every view loads, and each other Network in a region of its own, its ID, Media Distancia y Avant and Euskotren too, which load by the area in view (#263, #265)", () => {
  const regions = regionsOf(NETWORKS).map((r) => [r.id, r.networks.map((n) => n.id)]);
  expect(regions[0]).toEqual(['catalonia', ['rodalies', 'fgc', 'tram', 'metro']]);
  // The 14 other núcleos, one region each, Euskotren's, Media Distancia y Avant's and long distance's, which makes 18.
  expect(regions).toHaveLength(18);
  expect(regions.at(-2)).toEqual(['media-distancia-avant', ['media-distancia-avant']]);
  expect(regions.slice(1, -1).every(([id, networks]) => networks?.length === 1 && networks[0] === id)).toBe(true);
  expect(regions.at(-1)).toEqual([EVERYWHERE, ['ouigo', 'ave-larga-distancia']]);
});

test("lists AVE y Larga Distancia last, so that its track below zoom 7, which the file below zoom 7 has in the Networks' order, is drawn over every other Network's, and its region is built once every Network that can list its Trains has been (unlisted())", () => {
  expect(NETWORKS.at(-1)).toBe(AVE_LARGA_DISTANCIA);
});

test("lists Ouigo just before AVE y Larga Distancia, so that its track below zoom 7 is drawn under theirs, and over every other Network's (#264)", () => {
  expect(NETWORKS.at(-2)).toBe(OUIGO);
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

test("names the Station a stop of Euskotren's live data is at as its timetable names it: its platform's StopPlace (#265)", () => {
  const source = LIVE_SOURCES.find((s) => s.id === 'euskotren');
  const [stop, station] = source?.format === 'gtfs-rt' ? source.stations : [/$^/, ''];
  const [{ operator, stopPrefix = '' }] = EUSKOTREN.timetables;
  // Zuhatzu-Galdakao's platform, as both feeds name it, and the StopPlace the timetable has it in.
  expect('ES:Euskotren:Quay:2598_Plataforma_Q1:'.replace(stop, station)).toBe(`${operator}:${'ES:Euskotren:StopPlace:2598:'.slice(stopPrefix.length)}`);
});
