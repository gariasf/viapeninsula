import { expect, test } from 'vitest';
import { interchangesOf, markedNetworks } from './stations.ts';

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
