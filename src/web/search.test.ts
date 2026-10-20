import { expect, test } from 'vitest';
import type { Kind, ManifestRegion, Point, Trip, ZoomedOut } from '../bundle.ts';
import type { Coming, Followed, TripNow } from '../engine.ts';
import { regionsNeeded } from './regions.ts';
import { findLines, findPlaces, keyboardRise, networkNames, numbered, results, searchPlaces } from './search.ts';

/** Some Lines of 12 Oct 2026, as the file below zoom 7 lists them: their IDs, Networks, names and kinds of service. */
const LINES: [id: string, kind: Kind][] = [
  ['rodalies:R11', 'regional'],
  ['rodalies:R4', 'commuter'],
  ['rodalies:RG1', 'commuter'],
  ['fgc:S1', 'commuter'],
  ['tram:T3', 'tram'],
  ['metro:L2', 'metro'],
  ['metro:L3', 'metro'],
  ['metro:L4', 'metro'],
  ['metro:FM', 'funicular'],
  ['cercanias-valencia:C6', 'commuter'],
];

/** Some Stations of 12 Oct 2026, as the build names them, by region: their IDs, names, Lines, and the places their operators group them in. */
const STATIONS: [region: string, id: string, name: string, lines: string[], place?: string][] = [
  // Two of its eleven Lines, as the build lists them, by their IDs.
  ['catalonia', 'adif:71801', 'Barcelona-Sants', ['rodalies:R11', 'rodalies:R4']],
  ['catalonia', 'adif:72305', "L'Hospitalet de Llobregat", ['rodalies:R4']],
  ['catalonia', 'adif:78607', 'Vacarisses-Torreblanca', ['rodalies:R4']],
  ['catalonia', 'adif:78700', 'Terrassa Estació del Nord', ['rodalies:R4']],
  ['catalonia', 'adif:78710', 'Terrassa Est', ['rodalies:R4']],
  ['catalonia', 'adif:79300', 'Girona', ['rodalies:R11', 'rodalies:RG1']],
  ['catalonia', 'fgc:TR', 'Terrassa - Rambla', ['fgc:S1']],
  // FGC's, with a double space and a lower-case "nord".
  ['catalonia', 'fgc:EN', 'Terrassa  Estació del nord', ['fgc:S1']],
  ['catalonia', 'fgc:NA', 'Terrassa Nacions Unides', ['fgc:S1']],
  ['catalonia', 'tram:ST-200', 'Torreblanca', ['tram:T3']],
  // The Metro's, a Station for each Line, which TMB groups in one place (ADR-0005).
  ['catalonia', 'tmb:1.210', 'Paral·lel', ['metro:L2'], 'tmb:P.6660210'],
  ['catalonia', 'tmb:1.323', 'Paral·lel', ['metro:L3'], 'tmb:P.6660210'],
  ['catalonia', 'tmb:1.9901', 'Paral·lel', ['metro:FM'], 'tmb:P.6660210'],
  ['catalonia', 'tmb:1.426', 'Girona', ['metro:L4'], 'tmb:P.6660426'],
  ['cercanias-valencia', 'adif:65306', 'Torreblanca', ['cercanias-valencia:C6']],
];

/** The file below zoom 7's Stations, their names and its Lines, as the build makes them of these. */
const FILE: Pick<ZoomedOut, 'stations' | 'names' | 'lines'> = {
  stations: {},
  names: {},
  lines: LINES.map(([id, kind]) => ({ id, network: id.split(':')[0] ?? '', name: id.split(':')[1] ?? '', colour: '#000', kind })),
};
for (const [region, id, name, lines, place] of STATIONS) {
  (FILE.stations[region] ??= []).push(id);
  ((FILE.names ??= {})[region] ??= []).push({ name, lines, ...(place && { place }) });
}

const PLACES = searchPlaces(FILE);

test("finds no Station in a file below zoom 7 built before #471, which names none, rather than failing, as the page would where it got one, its manifest cached or the build not yet run (#471)", () => {
  expect(searchPlaces({ stations: FILE.stations })).toEqual([]);
  expect(findPlaces(searchPlaces({ stations: FILE.stations }), 'terrassa')).toEqual([]);
});
/** The names of the places Search finds for a query, in order. */
const found = (query: string) => findPlaces(PLACES, query).map(({ place }) => place.name);

test("finds a Station by the start of each word typed of its name, in any order, accents, capitals and the Catalan middle dot aside, and lists the places it finds by their names so compared (#471)", () => {
  const terrassa = ['Terrassa Est', 'Terrassa Estació del Nord', 'Terrassa  Estació del nord', 'Terrassa Nacions Unides', 'Terrassa - Rambla'];
  expect(found('terrassa')).toEqual(terrassa);
  expect(found('TERRASSA')).toEqual(terrassa);
  expect(found('  Terrassa ')).toEqual(terrassa);
  expect(found('terr est')).toEqual(['Terrassa Est', 'Terrassa Estació del Nord', 'Terrassa  Estació del nord']);
  expect(found('estacio nord')).toEqual(['Terrassa Estació del Nord', 'Terrassa  Estació del nord']);
  expect(found('Nord Estació')).toEqual(['Terrassa Estació del Nord', 'Terrassa  Estació del nord']);
  // A word's start only.
  expect(found('rassa')).toEqual([]);
  expect(found('terrassa x')).toEqual([]);
  // One place for the Metro's Stations TMB groups, with their Lines in the order the cards name them.
  for (const query of ['paral·lel', 'Parallel', 'paral']) expect(found(query)).toEqual(['Paral·lel']);
  expect(findPlaces(PLACES, 'paral')[0]?.place).toMatchObject({ stations: ['tmb:1.210', 'tmb:1.323', 'tmb:1.9901'], lines: ['metro:FM', 'metro:L2', 'metro:L3'] });
  // R4 before R11, digits as numbers, as a board names them, not as the build lists them.
  expect(findPlaces(PLACES, 'sants')[0]?.place.lines).toEqual(['rodalies:R4', 'rodalies:R11']);
  expect(found("l'hospitalet")).toEqual(["L'Hospitalet de Llobregat"]);
  expect(found('hospitalet llob')).toEqual(["L'Hospitalet de Llobregat"]);
  // A query with no word in it finds nothing, not every place.
  for (const query of ['', '   ', '-', "'", '·']) expect(found(query)).toEqual([]);
});

test("gives two places that read alike a row each, which names their Networks, in the order of the file's regions, as the build joins no Station by name: 80 to 202 km apart, as Girona's, or an interchange #572 will join (#471)", () => {
  const rows = (query: string) => findPlaces(PLACES, query).map(({ place, alike }) => [place.name, place.networks, alike]);
  expect(rows('girona')).toEqual([
    ['Girona', ['rodalies'], true],
    ['Girona', ['metro'], true],
  ]);
  // TRAM's Torreblanca and Valencia's, and Vacarisses-Torreblanca, which reads otherwise.
  expect(rows('torreblanca')).toEqual([
    ['Torreblanca', ['tram'], true],
    ['Torreblanca', ['cercanias-valencia'], true],
    ['Vacarisses-Torreblanca', ['rodalies'], false],
  ]);
  // Their double space and lower-case "nord" aside; and Terrassa Est reads otherwise.
  expect(rows('terrassa est')).toEqual([
    ['Terrassa Est', ['rodalies'], false],
    ['Terrassa Estació del Nord', ['rodalies'], true],
    ['Terrassa  Estació del nord', ['fgc'], true],
  ]);
});

test("names a Network, where two places read alike, by the short name the file below zoom 7 gives it, and by its name where it gives none, as a Cercanías núcleo's or a file from before short names, as the maintainer picked (#471)", () => {
  const networks = [
    { id: 'rodalies', name: 'Rodalies de Catalunya', short: 'Rodalies' },
    { id: 'fgc', name: 'Ferrocarrils de la Generalitat de Catalunya', short: 'FGC' },
    { id: 'cercanias-valencia', name: 'Cercanías Valencia' },
  ];
  expect([...networkNames(networks)]).toEqual([
    ['rodalies', 'Rodalies'],
    ['fgc', 'FGC'],
    ['cercanias-valencia', 'Cercanías Valencia'],
  ]);
});

/** A Trip of Train number `number`, of `line`, leaving its first Station `departs` seconds into its service day. */
const trip = (number: string | undefined, departs = 0, line = 'rodalies:R4'): Trip => ({
  id: `${line}_${number}_${departs}`,
  line,
  shape: '',
  headsign: 'Manresa',
  ...(number && { number }),
  calls: [{ station: 'adif:71801', arrival: departs, departure: departs, dist: 0 }],
});

test('finds Trips by the start of their Train numbers, from two digits, and by nothing else (#471)', () => {
  // 25774's has 774 in it, and 77 too, but doesn't start with them.
  const trips = [trip('77428'), trip('77432'), trip('25478'), trip('25774'), trip(undefined), trip('7742', 0, 'cercanias-madrid:C4')];
  const numbers = (query: string) => numbered(trips, query).map((t) => t.number);
  expect(numbers('77')).toEqual(['77428', '77432', '7742']);
  expect(numbers('774')).toEqual(['77428', '77432', '7742']);
  expect(numbers(' 7742 ')).toEqual(['77428', '7742']);
  expect(numbers('77428')).toEqual(['77428']);
  for (const query of ['7', '', '77 4', '77a', 'r4', '-77']) expect(numbers(query)).toEqual([]);
});

/** A Trip's Train where it is in its day, as tripsAt() says it, as much as Search reads of it. */
const at = (where: 'running' | 'within' | 'leaving' | 'cancelled' | 'ended', number: string, departs = 0): TripNow => {
  const t = trip(number, departs);
  if (where === 'running') return { trip: t, train: { trip: t } as Followed };
  if (where === 'within') return { trip: t, coming: { trip: t, within: { line: t.line, stations: ['a', 'b'], kind: 'closed' } } as Coming };
  if (where === 'leaving') return { trip: t, coming: { trip: t } as Coming };
  return where === 'cancelled' ? { trip: t, cancelled: true } : { trip: t, ended: 0 };
};

test("lists the Trips found by number with those running first, on the map or within a closed Closure, then those still to leave, Cancelled and ended, each by its number, then by when it leaves, the first six of them, and says how many more (#471)", () => {
  const found = [at('ended', '77402'), at('leaving', '77440'), at('cancelled', '77436'), at('running', '77432'), at('leaving', '77438', 7200), at('within', '77430'), at('running', '77428'), at('leaving', '77438', 3600)];
  const [section, ...rest] = results('774', [], found);
  expect(rest).toEqual([]);
  expect(section && 'trains' in section && section.trains.map(({ trip }) => [trip.number, trip.calls[0]?.departure])).toEqual([
    ['77428', 0],
    ['77430', 0],
    ['77432', 0],
    ['77438', 3600],
    ['77438', 7200],
    ['77440', 0],
  ]);
  expect(section && 'trains' in section && section.more).toBe(2);
  expect(results('774', [], found.slice(0, 6))).toMatchObject([{ more: 0 }]);
  // Fewer than six: none more, and Cancelled before ended, whatever their numbers.
  expect(results('774', [], found.slice(0, 3))).toMatchObject([{ more: 0 }]);
  const [few] = results('774', [], [at('ended', '77402'), at('cancelled', '77436')]);
  expect(few && 'trains' in few && few.trains.map(({ trip }) => trip.number)).toEqual(['77436', '77402']);
});

test('shows Stations, then Train numbers, each only where it finds some, and nothing for a query that finds neither (#471)', () => {
  // Made up: a Station whose name has a number in it, which no Station of 12 Oct 2026 has two digits of.
  const places = [...PLACES, { id: 'fgc:XX', name: 'Apeadero 774', stations: ['fgc:XX'], networks: ['fgc'], lines: ['fgc:S1'] }];
  const sections = (query: string, found: TripNow[] = []) => results(query, places, found).map((s) => ('places' in s ? 'Stations' : 'Train numbers'));
  expect(sections('terrassa')).toEqual(['Stations']);
  expect(sections('774', [at('running', '77428')])).toEqual(['Stations', 'Train numbers']);
  expect(sections('254', [at('running', '25478')])).toEqual(['Train numbers']);
  expect(sections('xyz')).toEqual([]);
  expect(sections('254')).toEqual([]);
});

test("raises Search's sheet over the on-screen keyboard while it's up, from 8 px under the visual viewport's top to 8 px over its bottom, the keyboard's top, and not while it's down, for a browser's bars, nor where the page is zoomed (#471)", () => {
  // A 390 × 844 phone, with no keyboard.
  expect(keyboardRise(844, { height: 844, offsetTop: 0, scale: 1 })).toBeUndefined();
  // Android's keyboard, 336 px, which shrinks the visual viewport from the bottom: the sheet from 8 px to 500.
  expect(keyboardRise(844, { height: 508, offsetTop: 0, scale: 1 })).toEqual({ bottom: 344, height: 492 });
  // iOS's, 380 px with its bar, with the visual viewport scrolled 120 px down the page: from 128 px to 576.
  expect(keyboardRise(844, { height: 464, offsetTop: 120, scale: 1 })).toEqual({ bottom: 268, height: 448 });
  // A browser's bar, 56 px, and a pinch zoom, which shrinks the visual viewport too.
  expect(keyboardRise(844, { height: 788, offsetTop: 0, scale: 1 })).toBeUndefined();
  expect(keyboardRise(844, { height: 422, offsetTop: 200, scale: 2 })).toBeUndefined();
});

test("gives a place it finds in a region the map hasn't loaded a Station the file below zoom 7 lists for that region, which a `station=` link loads, as Valencia's Torreblanca, found from Barcelona, and TRAM's a Station of the region loaded (#471)", () => {
  const [tram, valencia] = findPlaces(PLACES, 'torreblanca');
  const regions: Pick<ManifestRegion, 'id' | 'networks' | 'extent'>[] = [
    { id: 'catalonia', networks: ['rodalies', 'fgc', 'tram', 'metro'], extent: [-0.86, 40.595, 3.162, 42.447] },
    { id: 'cercanias-valencia', networks: ['cercanias-valencia'], extent: [-0.788, 38.969, 0.456, 40.472] },
  ];
  const barcelona = { bounds: [[2.1, 41.35], [2.25, 41.45]] as [Point, Point], zoom: 12 };
  expect(regionsNeeded(regions, barcelona)).toEqual(['catalonia']);
  expect(regionsNeeded(regions, barcelona, { station: valencia?.place.stations[0], stations: FILE.stations })).toEqual(['catalonia', 'cercanias-valencia']);
  expect(regionsNeeded(regions, barcelona, { station: tram?.place.stations[0], stations: FILE.stations })).toEqual(['catalonia']);
});

test("finds a Line by the start of its name, its hyphens and spaces aside, in the order the cards name Lines, and lists Lines first (#473)", () => {
  const names = (query: string) => findLines(FILE.lines ?? [], query).map((l) => l.id);
  expect(names('r4')).toEqual(['rodalies:R4']);
  expect(names('L')).toEqual(['metro:L2', 'metro:L3', 'metro:L4']);
  expect(names('c 6')).toEqual(['cercanias-valencia:C6']);
  expect(names('R1')).toEqual(['rodalies:R11']);
  expect(names('terrassa')).toEqual([]);
  expect(names(' ')).toEqual([]);
  const sections = results('r4', PLACES, [], FILE.lines).map((s) => Object.keys(s)[0]);
  expect(sections).toEqual(['lines']);
  expect(results('girona', PLACES, [], FILE.lines).map((s) => Object.keys(s)[0])).toEqual(['places']);
});
