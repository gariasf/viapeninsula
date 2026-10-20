import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import type { Shape, Slot } from '../bundle.ts';
import { drawnAt, fewer, interchangesOf, markedNetworks, onLines, readOf, type Interchange, type Tiered } from './stations.ts';

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
  expect(interchangesOf(places, none)).toEqual([{ id: 'interchange:fgc:MC', name: 'Martorell Central', named: 'fgc:MC', places: ['fgc:MC'], networks: ['rodalies', 'fgc'], lon: places[2]?.lon, lat: places[2]?.lat, how: 'one place' }]);
});

// Barcelona's and Madrid's places as S2's join shows them on 19 Oct 2026, with their region's, Media Distancia's and long
// distance's Stations, marked as show() marks them, and the interchanges main made of them then (#838).
const REAL: { hand: Parameters<typeof interchangesOf>[1] } & Record<'barcelona' | 'madrid', { places: Tiered[]; interchanges: Interchange[] }> = JSON.parse(
  gunzipSync(readFileSync(new URL('../fixtures/interchanges-2026-10-19.json.gz', import.meta.url))).toString(),
);

test('a real day\'s places make the same interchanges, ids, names and how, in the same order, as they did comparing every pair', () => {
  for (const city of ['barcelona', 'madrid'] as const) expect(interchangesOf(REAL[city].places, REAL.hand)).toEqual(REAL[city].interchanges);
  expect(REAL.barcelona.interchanges).toHaveLength(40);
});

/** interchangesOf() as main had it before #838, comparing every pair of places: what the grid's must make. */
function everyPair(places: Tiered[], hand: Parameters<typeof interchangesOf>[1] & object): Interchange[] {
  const parent = new Map(places.map((p) => [p.id, p.id]));
  const root = (id: string): string => (parent.get(id) === id ? id : root(parent.get(id) ?? id));
  const byHand = new Set<string>();
  const apart = new Set(hand.apart.flatMap(([a, b]) => [`${a} ${b}`, `${b} ${a}`]));
  const COMMON = new Set(['barcelona', 'de', 'del', 'la', 'el', 'les', 'els', 'i', 'estacio', 'placa', 'pl', 'sant', 'santa', 'av', 'avinguda']);
  const words = places.map((p) => new Set(p.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !COMMON.has(w))));
  const metres = (a: Tiered, b: Tiered) => Math.hypot((a.lon - b.lon) * 111_195 * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * 111_195);
  places.forEach((a, i) => {
    for (let j = i + 1; j < places.length; j++) {
      const b = places[j] as Tiered;
      if (apart.has(`${a.id} ${b.id}`) || a.networks.some((n) => b.networks.includes(n)) || metres(a, b) > 350 || ![...(words[i] ?? [])].some((w) => words[j]?.has(w))) continue;
      parent.set(root(a.id), root(b.id));
    }
  });
  for (const [a, b] of hand.join) {
    if (!parent.has(a) || !parent.has(b)) continue;
    parent.set(root(a), root(b));
    byHand.add(a);
  }
  const groups = new Map<string, Tiered[]>();
  for (const p of places) groups.set(root(p.id), [...(groups.get(root(p.id)) ?? []), p]);
  const rank = (n: string) => (['rodalies', 'fgc', 'metro', 'tram'].indexOf(n) + 5) % 5;
  return [...groups.values()].flatMap((group) => {
    const networks = [...new Set(group.flatMap((p) => p.networks))].toSorted((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    const [named] = group.toSorted((a, b) => a.nameZoom - b.nameZoom || b.stations.length - a.stations.length || a.name.length - b.name.length);
    if (!named || networks.length < 2 || (group.length === 1 && named.stations.length < 2)) return [];
    const ids = group.map((p) => p.id).sort();
    const name = ids.map((id) => hand.names[id]).find((n) => n !== undefined) ?? named.name.replace(/^Barcelona\s*-?\s*/, '');
    const how = group.length === 1 ? 'one place' : group.some((p) => byHand.has(p.id)) ? 'hand' : 'rule';
    return [{ id: `interchange:${ids[0]}`, name, named: named.id, places: ids, networks, lon: group.reduce((s, p) => s + p.lon, 0) / group.length, lat: group.reduce((s, p) => s + p.lat, 0) / group.length, how }];
  });
}

test('any places, anywhere on Earth, make the same interchanges on the grid as comparing every pair, those NEAR apart too', () => {
  let seed = 838;
  const random = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);
  const pick = <T,>(xs: T[]) => xs[Math.floor(random() * xs.length)] as T;
  for (let round = 0; round < 300; round++) {
    // A town of places around a point anywhere, a few km across, some exactly NEAR north, east or both of another,
    const [lon0, lat0] = [(random() - 0.5) * 360, (random() - 0.5) * 170];
    const places: Tiered[] = [];
    for (let k = 0; k < 40; k++) {
      const of = places.length && random() < 0.3 ? pick(places) : undefined;
      const [dx, dy] = of ? pick([[350, 0], [-350, 0], [0, 350], [0, -350], [247.4, 247.4], [349.9, 0], [350.1, 0]]) : [(random() - 0.5) * 3000, (random() - 0.5) * 3000];
      const lat = (of?.lat ?? lat0) + dy / 111_195;
      const lon = (of?.lon ?? lon0) + dx / (111_195 * Math.cos((lat * Math.PI) / 180));
      places.push({ id: `p${k}`, name: `${pick(['Barcelona ', 'Plaça ', ''])}${pick(['Sants', 'Gràcia', 'Clot', 'Sant Andreu'])} ${pick(['Nord', 'Sud', 'Arc', ''])}`, networks: [...new Set([pick(['rodalies', 'fgc', 'metro', 'tram', 'ld']), pick(['metro', 'tram', 'ld'])])].slice(0, 1 + Math.floor(random() * 2)), stations: random() < 0.2 ? ['a', 'b'] : ['a'], nameZoom: pick([10, 12, 14]), lon, lat });
    }
    // and one far off, north or south, that the cells must be wide enough for where the town is.
    places.push({ id: 'far', name: 'Sants', networks: ['tram'], stations: ['a'], nameZoom: 12, lon: lon0, lat: (random() - 0.5) * 170 });
    const hand = { join: [[`p${round % 40}`, `p${(round * 7) % 40}`]] as [string, string][], apart: [[`p${round % 40}`, `p${(round + 1) % 40}`]] as [string, string][], names: { [`p${round % 40}`]: 'By hand' } };
    expect(interchangesOf(places, hand)).toEqual(everyPair(places, hand));
  }
});

test('what interchangesOf() reads of the places changes with each field of a place, so show() never keeps stale interchanges', () => {
  const places = REAL.barcelona.places.slice(0, 3);
  for (const field of Object.keys(places[1] as Tiered) as (keyof Tiered)[]) {
    const was = places[1]?.[field];
    const other = typeof was === 'string' ? `${was}x` : typeof was === 'number' ? was + 1e-9 : [...(was as string[]), 'x'];
    expect(readOf(places.with(1, { ...(places[1] as Tiered), [field]: other })), field).not.toBe(readOf(places));
  }
  expect(readOf(places.toReversed())).not.toBe(readOf(places));
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
