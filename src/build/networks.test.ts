import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { places } from '../bundle.ts';
import { dirSource } from './gtfs.ts';
import { FGC_FEED, METRO_FEED, onFgcRails, onMetroRails, onRodaliesRails, readFeed, RODALIES_FEED, TRAMBAIX_FEED } from './networks.ts';

// Rows cut verbatim from Renfe's Cercanías feed of 2026-09-24: an R2S and an R7 Trip, an R3
// rail-replacement bus, and a C1 Trip in Madrid, all running on Thursday 24 September.
const renfe = dirSource(fileURLToPath(new URL('fixtures/rodalies', import.meta.url)));
const rodalies = await readFeed(renfe, '2026-09-24', RODALIES_FEED);
const line = (name: string) => rodalies.lines.find((l) => l.name === name);

test('keeps only Rodalies Lines that run Trains', () => {
  // Not C1 (Madrid), and not R3, whose only Trip here is a bus.
  expect(rodalies.lines.map((l) => l.name).sort()).toEqual(['R2S', 'R7']);
});

test("uses Renfe's Line colours, fixing the ones it gets wrong", () => {
  expect(line('R2S')?.colour).toBe('#146520');
  expect(line('R7')?.colour).toBe('#B57CBB');
});

test('keeps the Stations Rodalies Trains serve, with Adif codes and names as published', () => {
  expect(rodalies.stations).toHaveLength(18);
  expect(rodalies.stations).toContainEqual({ id: 'adif:71801', name: 'Barcelona-Sants', lon: 2.14101688, lat: 41.3798632 });
  expect(rodalies.stations.map((s) => s.name)).toContain('Barcelona Estació de França');
  const ids = rodalies.stations.map((s) => s.id);
  expect(ids).not.toContain('adif:77102'); // La Garriga, served only by the bus here
  expect(ids).not.toContain('adif:18000'); // Madrid-Atocha
});

test("gives each Line its shapes as the feed draws them, with the Stations their Trips serve", () => {
  expect(line('R2S')?.shapes).toEqual(['rodalies:51_R2S']);
  expect(rodalies.shapes.map((s) => s.id).sort()).toEqual(['rodalies:51_R2S', 'rodalies:51_R7']);

  const r2s = rodalies.shapes.find((s) => s.id === 'rodalies:51_R2S');
  expect(r2s?.coords).toHaveLength(338);
  expect(r2s?.coords[0]).toEqual([1.5229805, 41.1856559]);
  expect(r2s?.stations).toHaveLength(13);
  const r7 = rodalies.shapes.find((s) => s.id === 'rodalies:51_R7');
  expect([...(r7?.stations ?? [])].sort()).toEqual(['adif:72503', 'adif:78706', 'adif:78707', 'adif:78708', 'adif:78800']);
});

test('runs on Iberian-gauge rails only, so never on the high-speed line', () => {
  const kinds: Record<string, string>[] = [
    { gauge: '1668' },
    { gauge: '1435;1668' }, // three rails, for both gauges
    { gauge: '1668', highspeed: 'yes' }, // the line to València past Vandellòs, which R16 takes
    { gauge: '1435', highspeed: 'yes' }, // the high-speed line
    { gauge: '1000' },
  ];
  expect(kinds.map((tags) => onRodaliesRails({ id: 1, nodes: [], geometry: [], tags: { railway: 'rail', ...tags } }))).toEqual([true, true, true, false, false]);
});

test("keeps the day's Trips that are Trains, with their Line, destination, Train number and calls", () => {
  // Not the C1 (Madrid), and not the R3 bus.
  expect(rodalies.trips.map((t) => t.id)).toEqual(['rodalies:5165J25478R2S', 'rodalies:5165J77801R7']);
  expect(rodalies.trips.find((t) => t.id === 'rodalies:5165J77801R7')).toEqual({
    id: 'rodalies:5165J77801R7',
    line: 'rodalies:R7',
    shape: 'rodalies:51_R7',
    // Renfe publishes no headsigns, so it's the last Station's name.
    headsign: 'Cerdanyola Universitat',
    number: '77801',
    // Seconds into the service day: 06:26 is 23,160 s.
    calls: [
      { station: 'adif:78800', arrival: 23160, departure: 23160 },
      { station: 'adif:78708', arrival: 23340, departure: 23340 },
      { station: 'adif:78707', arrival: 23520, departure: 23520 },
      { station: 'adif:78706', arrival: 23640, departure: 23700 },
      { station: 'adif:72503', arrival: 24000, departure: 24000 },
    ],
  });
});

test('leaves out the Trips of other days, but not the Lines and Stations they serve', async () => {
  const friday = await readFeed(renfe, '2026-09-25', RODALIES_FEED);
  expect(friday.trips).toEqual([]);
  expect(friday.lines).toEqual(rodalies.lines);
  expect(friday.stations).toEqual(rodalies.stations);
});

// Rows cut verbatim from FGC's feed of 2026-09-16: two L12 Trips, one on a normal Thursday and one
// on La Mercè, and a Vallvidrera funicular and a Montserrat rack railway Trip on the Thursday.
const fgc = dirSource(fileURLToPath(new URL('fixtures/fgc', import.meta.url)));

test("reads FGC's service days from calendar_dates.txt alone, as its feed has no calendar.txt", async () => {
  const thursday = await readFeed(fgc, '2026-10-01', FGC_FEED);
  expect(thursday.trips.map((t) => t.id).sort()).toEqual([
    'fgc:6350da927c76|652dc7e303',
    'fgc:684bdae302747664|782dc7e303',
    'fgc:6c4bdae302747640fd55c10d40|622dc7e302',
  ]);
  const merce = await readFeed(fgc, '2026-09-24', FGC_FEED);
  expect(merce.trips.map((t) => t.id)).toEqual(['fgc:6c4bdaeb02777640fd55c1|622dc4e303']);
});

test('keeps the Vallvidrera funicular and the Montserrat rack railway, in their colours', async () => {
  const { lines } = await readFeed(fgc, '2026-10-01', FGC_FEED);
  expect(lines.map(({ name, colour }) => ({ name, colour }))).toEqual([
    { name: 'L12', colour: '#b2aed3' },
    { name: 'MM', colour: '#000000' },
    { name: 'FV', colour: '#0A57A3' },
  ]);
});

test("gives FGC's Stations FGC's codes, with their platforms rolled into them", async () => {
  const { stations, trips } = await readFeed(fgc, '2026-10-01', FGC_FEED);
  // Each platform is a stop of its own in FGC's feed, such as SR4 for platform 4 at Sarrià.
  expect(stations).toContainEqual({ id: 'fgc:SR', name: 'Sarrià', lon: 2.125574875, lat: 41.39849938 });
  expect(stations.map((s) => s.id).sort()).toEqual(['fgc:MM', 'fgc:MO', 'fgc:MP', 'fgc:RE', 'fgc:SR', 'fgc:VR', 'fgc:VS']);
  expect(trips.find((t) => t.line === 'fgc:MM')).toEqual({
    id: 'fgc:6350da927c76|652dc7e303',
    line: 'fgc:MM',
    shape: 'fgc:100049',
    headsign: 'Montserrat',
    calls: [
      { station: 'fgc:MO', arrival: 28080, departure: 28080 },
      { station: 'fgc:MP', arrival: 28260, departure: 28500 },
      { station: 'fgc:MM', arrival: 29280, departure: 29280 },
    ],
  });
});

// Rows cut verbatim from TRAM's Trambaix feed of 2026-09-24: T2's first Trip on Thursday 1 October.
const tram = dirSource(fileURLToPath(new URL('fixtures/tram', import.meta.url)));

test("keeps TRAM's T2, which its feed files as rail rather than tram, and heads each Trip for its last Station", async () => {
  const { lines, stations, trips } = await readFeed(tram, '2026-10-01', TRAMBAIX_FEED);
  expect(lines.map(({ id, colour }) => ({ id, colour }))).toEqual([{ id: 'tram:T2', colour: '#80FF80' }]);
  const [trip] = trips;
  expect([trip?.id, trip?.shape]).toEqual(['tram:TBX:2555_0194', 'tram:TBX:1']);
  // TRAM's feed has no headsigns.
  expect(trip?.headsign).toBe('Llevant-L.Planes');
  // Each platform is a stop of its own, such as A_FRMC for platform A at Francesc Macià.
  expect(trip?.calls[0]).toEqual({ station: 'tram:ST-172', arrival: 17760, departure: 17760 });
  expect(stations).toHaveLength(24);
});

// Rows cut verbatim from TMB's feed of 2026-09-21: an L11 Trip, the Montjuïc funicular's Trips for
// weekdays and weekends, and a bus on line 13.
const tmb = dirSource(fileURLToPath(new URL('fixtures/tmb', import.meta.url)));

test("keeps TMB's metro and funicular Trips, and none of its buses", async () => {
  const { lines, stations, trips } = await readFeed(tmb, '2026-10-01', METRO_FEED);
  expect(lines.map((l) => l.id)).toEqual(['metro:L11', 'metro:FM']);
  expect(new Set(trips.map((t) => t.line))).toEqual(new Set(['metro:L11', 'metro:FM']));
  expect(stations.map((s) => s.name)).not.toContain('Poble Espanyol'); // a stop on line 13
});

test('runs the Montjuïc funicular every 10 minutes, from 07:30 on weekdays and 09:00 at weekends, as frequencies.txt has it', async () => {
  const funicular = async (day: string) => (await readFeed(tmb, day, METRO_FEED)).trips.filter((t) => t.line === 'metro:FM');
  const thursday = await funicular('2026-10-01');
  const up = thursday.filter((t) => t.headsign === 'Parc de Montjuïc');
  // Up from Paral·lel and down from Parc de Montjuïc at once, at 07:30, 07:40 and so on up to 21:50.
  expect(up).toHaveLength(87);
  expect(thursday).toHaveLength(2 * 87);
  expect(up[0]).toEqual({
    id: 'metro:1.79.1@07:30:00',
    line: 'metro:FM',
    shape: 'metro:1.99.9900.1',
    headsign: 'Parc de Montjuïc',
    calls: [
      { station: 'tmb:1.9901', arrival: 27000, departure: 27000 },
      { station: 'tmb:1.9902', arrival: 27120, departure: 27120 },
    ],
  });
  expect(up.at(-1)?.calls.map((c) => c.departure)).toEqual([78600, 78720]); // 21:50 to 21:52

  const saturday = await funicular('2026-10-03');
  expect(saturday).toHaveLength(2 * 78);
  expect(saturday[0]?.id).toBe('metro:1.80.1@09:00:00');
});

test("gives the Metro TMB's stops as Stations, one for each Line calling there, rather than the stations grouping them", async () => {
  const { stations } = await readFeed(tmb, '2026-10-01', METRO_FEED);
  // L11's stop at Trinitat Nova, not the station it shares with L3 and L4 (P.6660339).
  expect(stations).toContainEqual({ id: 'tmb:1.1136', name: 'Trinitat Nova', lon: 2.1832, lat: 41.4499, place: 'tmb:P.6660339' });
  expect(stations.map((s) => s.id)).not.toContain('tmb:P.6660339');
});

test('draws the Stations TMB groups in one station as one place, at the middle of its Lines, and every other Station as its own', () => {
  const stations = [
    { id: 'tmb:1.327', name: 'Passeig de Gràcia', lon: 2.1649, lat: 41.3918, place: 'tmb:P.6660327' }, // L3
    { id: 'tmb:1.437', name: 'Passeig de Gràcia', lon: 2.1683, lat: 41.3915, place: 'tmb:P.6660327' }, // L4
    { id: 'tmb:1.225', name: 'Passeig de Gràcia', lon: 2.1693, lat: 41.3927, place: 'tmb:P.6660327' }, // L2
    { id: 'tmb:1.1136', name: 'Trinitat Nova', lon: 2.1832, lat: 41.4499, place: 'tmb:P.6660339' },
    // Renfe's station beside the Metro's goes by Adif's code, in no group of TMB's.
    { id: 'adif:71802', name: 'Barcelona-Passeig de Gràcia', lon: 2.1652, lat: 41.3919 },
  ];
  const drawn = places(stations);
  expect(drawn).toHaveLength(3);
  expect(drawn[0]?.name).toBe('Passeig de Gràcia');
  expect(drawn[0]?.lon).toBeCloseTo(2.1675);
  expect(drawn[0]?.lat).toBeCloseTo(41.392);
  expect(drawn.slice(1)).toEqual([
    { name: 'Trinitat Nova', lon: 2.1832, lat: 41.4499 },
    { name: 'Barcelona-Passeig de Gràcia', lon: 2.1652, lat: 41.3919 },
  ]);
});

/** A way with these tags, as OpenStreetMap has Catalonia's rails. */
const way = (tags: Record<string, string>) => ({ id: 1, nodes: [], geometry: [], tags });
const FGC_NAME = 'Ferrocarrils de la Generalitat de Catalunya';
const TMB_NAME = 'Transports Metropolitans de Barcelona';

test("runs FGC on its own rails, of all three gauges, and on its funiculars", () => {
  const kinds: Record<string, string>[] = [
    { railway: 'rail', gauge: '1435', operator: FGC_NAME }, // Barcelona–Vallès
    { railway: 'rail', gauge: '1668', operator: FGC_NAME }, // Lleida–La Pobla
    { railway: 'narrow_gauge', gauge: '1000', operator: FGC_NAME }, // Llobregat–Anoia, and the Montserrat rack railway
    { railway: 'subway', gauge: '1000', operator: 'FGC' }, // Llobregat–Anoia under Barcelona
    { railway: 'funicular', gauge: '1000', operator: FGC_NAME }, // Vallvidrera
    { railway: 'rail', gauge: '1668', operator: 'Adif' },
    { railway: 'subway', gauge: '1435', operator: TMB_NAME },
  ];
  expect(kinds.map((tags) => onFgcRails(way(tags)))).toEqual([true, true, true, true, true, false, false]);
});

test("runs the Metro on underground rails and the Montjuïc funicular, but not on FGC's lines under Barcelona", () => {
  const kinds: Record<string, string>[] = [
    { railway: 'subway', gauge: '1435', operator: TMB_NAME },
    { railway: 'subway', gauge: '1674', operator: TMB_NAME }, // L1's broad gauge
    { railway: 'subway', gauge: '1435' }, // no operator mapped
    { railway: 'funicular', gauge: '1200', operator: TMB_NAME }, // Montjuïc
    { railway: 'subway', gauge: '1435', operator: FGC_NAME }, // Barcelona–Vallès under Barcelona
    { railway: 'tram', gauge: '1435', operator: 'TRAM' },
  ];
  expect(kinds.map((tags) => onMetroRails(way(tags)))).toEqual([true, true, true, true, false, false]);
});
