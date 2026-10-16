import { expect, test } from 'vitest';
import type { Shape, Slot } from '../bundle.ts';
import { drawnAt, fewer, interchangesOf, markedNetworks, onLines } from './stations.ts';

/** A place of a Network, `east` and `north` metres from Passeig de Gràcia, named from `nameZoom`. */
const place = (id: string, name: string, networks: string[], [east, north]: [number, number], nameZoom = 12, stations = [id]) => ({
  id,
  name,
  networks,
  stations,
  nameZoom,
  lon: 2.165 + east / (111_195 * Math.cos((41.39 * Math.PI) / 180)),
  lat: 41.39 + north / 111_195,
});
const none = { join: [], apart: [], names: {} };

test('places of other Networks within 350 m that share a word are one interchange, named by the highest tier, without "Barcelona"', () => {
  const places = [
    place('adif:71802', 'Barcelona-Passeig de Gràcia', ['rodalies'], [0, 0], 9),
    place('tmb:P.6660327', 'Passeig de Gràcia', ['metro'], [200, 120], 12, ['tmb:1.327', 'tmb:1.425', 'tmb:1.230']),
    // Near, but sharing no word but the common ones.
    place('fgc:PR', 'Provença', ['fgc'], [-300, 100]),
    // Sharing a word, but too far.
    place('tmb:P.6660999', 'Gràcia', ['metro'], [0, 900]),
  ];
  expect(interchangesOf(places, none).map(({ name, places }) => ({ name, places }))).toEqual([{ name: 'Passeig de Gràcia', places: ['adif:71802', 'tmb:P.6660327'] }]);
});

test('the hand list joins what the rule misses, keeps apart what it shouldn\'t join, and names what it names wrong', () => {
  const places = [
    place('fgc:PR', 'Provença', ['fgc'], [0, 0]),
    place('tmb:P.6660328', 'Diagonal', ['metro'], [200, 200], 12, ['tmb:1.328', 'tmb:1.521']),
    place('adif:71708', 'Bellvitge - Gornal', ['rodalies'], [5000, 0]),
    place('fgc:GO', 'Gornal', ['fgc'], [5100, 0]),
    place('adif:1', 'Sant Vicenç de Castellet', ['rodalies'], [9000, 0]),
    place('fgc:SV', 'Sant Vicenç-Castellgalí', ['fgc'], [9200, 0]),
  ];
  const hand = { join: [['fgc:PR', 'tmb:P.6660328']] as [string, string][], apart: [['fgc:SV', 'adif:1']] as [string, string][], names: { 'adif:71708': 'Bellvitge - Gornal' } };
  expect(interchangesOf(places, hand).map(({ name, places, how }) => ({ name, places, how }))).toEqual([
    { name: 'Diagonal', places: ['fgc:PR', 'tmb:P.6660328'], how: 'hand' },
    { name: 'Bellvitge - Gornal', places: ['adif:71708', 'fgc:GO'], how: 'rule' },
  ]);
});

test("one Network's places together aren't an interchange, but one place several Networks serve is, its marks in Rodalies, FGC, Metro, TRAM's order", () => {
  const places = [
    place('fgc:SG', 'Sant Gervasi', ['fgc'], [0, 0]),
    place('fgc:PM', 'Pl. Molina', ['fgc'], [50, 50]),
    place('fgc:MC', 'Martorell Central', ['fgc', 'rodalies'], [9000, 0], 11, ['fgc:MC', 'adif:72209']),
    // One Station two Networks' Trains call at.
    place('adif:15400', 'Matallana', ['cercanias-leon', 'cercanias-bilbao'], [20000, 0]),
  ];
  expect(interchangesOf(places, none)).toEqual([{ id: 'interchange:fgc:MC', name: 'Martorell Central', places: ['fgc:MC'], networks: ['rodalies', 'fgc'], lon: places[2]?.lon, lat: places[2]?.lat, how: 'one place' }]);
});

test("a place is marked by its own Networks, not long distance's or Media Distancia's, unless they're all it has", () => {
  const everywhere = (n: string) => n === 'ave-larga-distancia' || n === 'media-distancia-avant';
  expect(markedNetworks(['rodalies', 'ave-larga-distancia', 'media-distancia-avant'], everywhere)).toEqual(['rodalies']);
  expect(markedNetworks(['ave-larga-distancia'], everywhere)).toEqual(['ave-larga-distancia']);
});

/** A centreline running east 1 km, and Lines along it from 0 to 1,000 m of their shapes, at sides. */
const east: Shape = { id: 'stretch:1', coords: [[2.1, 41.39], [2.112, 41.39]], dist: [0, 1000] };
const slot = (line: string, side: number, band?: number): Slot => ({ line, shape: `${line}-shape`, from: 0, to: 1000, side, on: 'stretch:1', at: [0, 1000], band });
const slotsOf = (...slots: Slot[]) => new Map(slots.map((s) => [`${s.line} ${s.shape}`, [s]]));

test("on the bands, a Station's dot lies in the middle of its own Lines' strokes, turned as they are", () => {
  const shapes = new Map([[east.id, east]]);
  const slots = slotsOf(slot('R1', -1), slot('R2', 0), slot('R4', 1), slot('L3', 2));
  const calls = [{ line: 'R1', shape: 'R1-shape', dist: 500 }, { line: 'R2', shape: 'R2-shape', dist: 500 }];
  const on = onLines(calls, slots, shapes, 3);
  expect(on?.point[0]).toBeCloseTo(2.106, 6);
  expect(on?.side).toBe(-0.5);
  expect(on?.heading).toBeCloseTo(90, 6);
  // Only R4: on its own stroke. In a band the Lines aren't drawn in, nowhere.
  expect(onLines([{ line: 'R4', shape: 'R4-shape', dist: 500 }], slots, shapes, 3)?.side).toBe(1);
  expect(onLines(calls, slotsOf(slot('R1', -1, 5)), shapes, 3)).toBeUndefined();
});

test("the Metro's and TRAM's places in neither tier aren't drawn below zoom 11, and are from 12; Rodalies' and FGC's stay", () => {
  const pillZoom = new Map([['rodalies', 10], ['fgc', 10], ['metro', 12], ['tram', 12]]);
  const few = fewer([{ id: 'tmb:P.1', larger: 0, networks: ['metro'] }, { id: 'tmb:P.2', larger: 1, networks: ['metro'] }, { id: 'tram:1', larger: 0, networks: ['metro', 'tram'] }, { id: 'adif:1', larger: 0, networks: ['rodalies'] }], pillZoom);
  expect(few).toEqual(new Set(['tmb:P.1', 'tram:1']));
  const dot = (band: number) => ({ kind: 'dot', band, few: true }) as const;
  expect([10.9, 11.4, 12].map((zoom) => drawnAt(dot(zoom < 11.5 ? 4 : 5), zoom))).toEqual([false, true, true]);
});

test('only what is drawn takes a tap and the pointer: dots in their own band below 13, marks and badges from 13, and on the rails from 15 their Stations\' marks', () => {
  // Band 5 is zoom 12, from 11.5 to 12.5.
  expect([11.4, 12, 12.6].map((zoom) => drawnAt({ kind: 'dot', band: 5 }, zoom))).toEqual([false, true, false]);
  expect([12.6, 12.9, 13, 14.9, 15].map((zoom) => drawnAt({ kind: 'dot', band: 6 }, zoom))).toEqual([true, false, false, false, false]);
  expect([12.6, 12.9, 14.9, 15].map((zoom) => drawnAt({ kind: 'badge' }, zoom))).toEqual([false, true, true, false]);
  // A place's mark gives way on the rails to its Stations', but where none of them is on its track, it stays.
  expect([12.9, 15].map((zoom) => drawnAt({ kind: 'mark', railed: true }, zoom))).toEqual([true, false]);
  expect(drawnAt({ kind: 'mark', railed: false }, 16)).toBe(true);
  expect([14.9, 15].map((zoom) => drawnAt({ kind: 'rails' }, zoom))).toEqual([false, true]);
});
