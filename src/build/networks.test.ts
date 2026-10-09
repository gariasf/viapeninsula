import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, expect, test, vi } from 'vitest';
import { places } from '../bundle.ts';
import { RODALIES, TRAM, type NetworkConfig } from '../networks.ts';
import { dirSource, rows, seconds, zipFile, zipSource, type Source } from './gtfs.ts';
import { copyOf, FGC_FEED, METRO_FEED, onFgcRails, onMetroRails, onRodaliesRails, readFeed, readTimetables, RODALIES_FEED, TRAMBAIX_FEED, type Feed } from './networks.ts';
import type { Found } from './report.ts';
import { closuresOf } from './trips.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

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

test("gives each Line its shapes as the feed draws them, with the Stations their Trips serve, and each shape its Line", () => {
  expect(line('R2S')?.shapes).toEqual(['rodalies:51_R2S']);
  expect(rodalies.shapes.map((s) => s.id).sort()).toEqual(['rodalies:51_R2S', 'rodalies:51_R7:back']);

  const r2s = rodalies.shapes.find((s) => s.id === 'rodalies:51_R2S');
  expect(r2s?.line).toBe('rodalies:R2S');
  expect(r2s?.coords).toHaveLength(338);
  expect(r2s?.coords[0]).toEqual([1.5229805, 41.1856559]);
  expect(r2s?.stations).toHaveLength(13);
  const r7 = rodalies.shapes.find((s) => s.id === 'rodalies:51_R7:back');
  expect(r7?.line).toBe('rodalies:R7');
  expect([...(r7?.stations ?? [])].sort()).toEqual(['adif:72503', 'adif:78706', 'adif:78707', 'adif:78708', 'adif:78800']);
});

test('turns a shape its Trips run backwards round, so that each way can be traced on its own track', () => {
  // R7's shape starts at Cerdanyola Universitat, where its Trip here ends: it runs from Montcada-Bifurcació.
  expect(line('R7')?.shapes).toEqual(['rodalies:51_R7:back']);
  expect(rodalies.trips.find((t) => t.line === 'rodalies:R7')?.shape).toBe('rodalies:51_R7:back');
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
    shape: 'rodalies:51_R7:back',
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

// Rows cut verbatim from Renfe's Cercanías feed of 2026-10-07, with every 25th point of its shapes:
// R3's and R13's replacement buses on some of their runs that day, a Train of R3's from La Garriga to
// La Tor de Querol, and two of R13's, from La Plana-Picamoixons to Barcelona and from Lleida to Les
// Borges Blanques, as no R13 Train ran between them in the whole timetable.
const works = dirSource(fileURLToPath(new URL('fixtures/rodalies-buses', import.meta.url)));
const closed = await readFeed(works, '2026-10-07', RODALIES_FEED);

test("reads the day's replacement buses, which Renfe lists as Trips of bus routes under their Line's own name, and makes no Trains or Stations of them", async () => {
  expect(closed.lines.map((l) => l.name)).toEqual(['R3', 'R13']);
  expect(closed.trips.map((t) => t.id)).toEqual(['rodalies:5178X35541R3', 'rodalies:5178X33500R13', 'rodalies:5178X30542R13']);
  expect(closed.buses).toHaveLength(9);
  expect(closed.buses.find((b) => b.id === 'rodalies:5178X87400R3')).toEqual({
    id: 'rodalies:5178X87400R3',
    line: 'rodalies:R3',
    calls: [
      { station: { id: 'adif:78802', name: 'Barcelona Fabra i Puig', lon: 2.18332907, lat: 41.4303481 }, arrival: 21600, departure: 21600 },
      { station: { id: 'adif:77102', name: 'La Garriga', lon: 2.28879559, lat: 41.6846272 }, arrival: 24360, departure: 24360 },
    ],
  });
  // A stop that only buses call at, all the days of the timetable.
  expect(closed.buses.flatMap((b) => b.calls.map((c) => c.station.name))).toContain('Montblanc');
  expect(closed.stations.map((s) => s.name)).not.toContain('Montblanc');
  expect((await readFeed(works, '2026-10-08', RODALIES_FEED)).buses).toEqual([]);
});

/** Seconds into the service day at a time of it, such as 24:24. */
const at = (time: string) => seconds(`${time}:00`);

// The bundle's Stations: crop() leaves out La Tor de Querol, beyond Spain's border, where one of the buses ends.
const inSpain = closed.stations.filter((s) => s.id !== 'adif:77310');

test("closes only the part of its buses' run that none of a Line's Trains runs that day: R13 between La Plana-Picamoixons and Les Borges Blanques, not on to Lleida, where its Trains shuttle from Les Borges Blanques, and none of R3's, whose buses run beside its Trains", () => {
  const closures = closuresOf(closed.buses, closed.trips, closed.shapes, inSpain, () => {});
  expect(closures).toEqual([
    // Les Borges Blanques at 05:33 to La Plana-Picamoixons, and back from 21:30 to 22:41, though only buses call at the Stations between.
    { line: 'rodalies:R13', stations: ['adif:73003', 'adif:73100'], from: at('05:33'), to: at('22:41'), kind: 'buses' },
  ]);
});

test("closes a part up to where a bus's run on its Line's track ends though none of the Line's Trains calls there that day, as Madrid's C8b buses close Villalba de Guadarrama – Cercedilla on 10–12 Oct, where its Trains end at Villalba: R13's, had only its shuttle from Lleida run, from Les Borges Blanques to La Plana-Picamoixons", () => {
  const shuttle = closed.trips.filter((t) => t.id === 'rodalies:5178X33500R13');
  expect(closuresOf(closed.buses, shuttle, closed.shapes, inSpain, () => {}).filter((c) => c.line === 'rodalies:R13')).toEqual([
    { line: 'rodalies:R13', stations: ['adif:73003', 'adif:73100'], from: at('05:33'), to: at('22:41'), kind: 'buses' },
  ]);
});

test("closes the whole of each bus's run on its Line's track on a day none of the Line's Trains runs any of it: R3's, had none of its Trains run, by Ripoll to Puigcerdà, up to Spain's border, where its Trains leave the map, which its shuttles between La Molina and Planoles join, as they run inside it, and from the first Station on R3's track that a bus calls at", () => {
  const closures = closuresOf(closed.buses, [], closed.shapes, inSpain, () => {});
  expect(closures.filter((c) => c.line === 'rodalies:R3')).toEqual([
    // Puigcerdà at 05:35 to Vic, Vic to La Tor de Querol, and Vic at 21:25 to Puigcerdà at 24:24. These
    // buses call at La Molina and Planoles, and the shuttles between them, either way, run from 06:01 to 23:58.
    { line: 'rodalies:R3', stations: ['adif:77109', 'adif:77309'], from: at('05:35'), to: at('24:24'), kind: 'buses' },
    // From Fabra i Puig, which isn't on R3's track, to Centelles, leaving La Garriga at 06:26.
    { line: 'rodalies:R3', stations: ['adif:77102', 'adif:77105'], from: at('06:26'), to: at('07:08'), kind: 'buses' },
  ]);
});

test("keeps a part apart from a Closure it lies inside where its buses run outside that Closure's hours: R3's 06:01 shuttle from La Molina to Planoles, beside only the 07:25 bus from Vic to Puigcerdà", () => {
  const buses = closed.buses.filter((b) => ['rodalies:5178X85379R3', 'rodalies:5178X85378R3'].includes(b.id));
  expect(closuresOf(buses, [], closed.shapes, inSpain, () => {})).toEqual([
    { line: 'rodalies:R3', stations: ['adif:77109', 'adif:77309'], from: at('07:25'), to: at('10:24'), kind: 'buses' },
    { line: 'rodalies:R3', stations: ['adif:77304', 'adif:77306'], from: at('06:01'), to: at('06:49'), kind: 'buses' },
  ]);
});

test("reports and logs where R3's buses run off its track, from Fabra i Puig to La Garriga, where no R3 Train runs in the whole timetable, rather than make a Closure there, but not where they run on beyond Spain's border", () => {
  const [log, found]: [string[], Found[]] = [[], []];
  closuresOf(closed.buses, closed.trips, closed.shapes, inSpain, (l) => log.push(l), (f) => found.push(f));
  const fabra = { id: 'adif:78802', name: 'Barcelona Fabra i Puig', lon: 2.18332907, lat: 41.4303481 };
  const garriga = { id: 'adif:77102', name: 'La Garriga', lon: 2.28879559, lat: 41.6846272 };
  const text = ["rodalies:R3's buses Barcelona Fabra i Puig → La Garriga make no Closure: the Line has no track there"];
  expect(found).toEqual([
    { kind: 'bus', line: 'rodalies:R3', trip: 'rodalies:5178X87400R3', stations: [fabra, garriga], text },
    // On to Centelles, beside R3's Trains.
    { kind: 'bus', line: 'rodalies:R3', trip: 'rodalies:5178X88361R3', stations: [fabra, garriga], text },
  ]);
  // Once, however many buses run there.
  expect(log).toEqual(text);
});

test('leaves out the Trips of other days, but not the Lines and Stations they serve', async () => {
  const friday = await readFeed(renfe, '2026-09-25', RODALIES_FEED);
  expect(friday.trips).toEqual([]);
  expect(friday.lines).toEqual(rodalies.lines);
  expect(friday.stations).toEqual(rodalies.stations);
});

// Rows cut verbatim from FGC's feed of 2026-09-16: two L12 Trips, one on a normal Thursday and one
// on La Mercè, and a Vallvidrera funicular and a Montserrat rack railway Trip on the Thursday. And,
// from its feed of 2026-09-25, an R53 Trip on Sunday 4 October, without its calls or shape.
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
    { name: 'R5', colour: '#3dbfc3' },
  ]);
});

test("runs R53's Trips on R5, the Line the public knows, since R53 is only FGC's name for R5's late Trips", async () => {
  const { lines, trips } = await readFeed(fgc, '2026-10-04', FGC_FEED);
  expect(lines.map((l) => l.id)).toContain('fgc:R5');
  expect(lines.map((l) => l.id)).not.toContain('fgc:R53');
  expect(trips.find((t) => t.id === 'fgc:625cdae602743e|602dc4e006')?.line).toBe('fgc:R5');
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
  const { lines, stations, trips, buses } = await readFeed(tmb, '2026-10-01', METRO_FEED);
  expect(lines.map((l) => l.id)).toEqual(['metro:L11', 'metro:FM']);
  expect(new Set(trips.map((t) => t.line))).toEqual(new Set(['metro:L11', 'metro:FM']));
  expect(stations.map((s) => s.name)).not.toContain('Poble Espanyol'); // a stop on line 13
  // Line 13 is a city bus, not one in a Line's place: no Line has its name.
  expect(buses).toEqual([]);
});

test("gives each Line its kind of service: its Network's, but for the Lines it names otherwise", async () => {
  const kinds = async (gtfs: Source, feed: Feed) => Object.fromEntries((await readFeed(gtfs, '2026-10-01', feed)).lines.map((l) => [l.name, l.kind]));
  expect(await kinds(renfe, RODALIES_FEED)).toEqual({ R2S: 'commuter', R7: 'commuter' });
  expect(await kinds(fgc, FGC_FEED)).toEqual({ L12: 'commuter', MM: 'rack', FV: 'funicular', R5: 'regional' });
  expect(await kinds(tram, TRAMBAIX_FEED)).toEqual({ T2: 'tram' });
  expect(await kinds(tmb, METRO_FEED)).toEqual({ L11: 'metro', FM: 'funicular' });
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
    { id: 'tmb:1.327', name: 'Passeig de Gràcia', lon: 2.1649, lat: 41.3918, place: 'tmb:P.6660327', networks: ['metro'] }, // L3
    { id: 'tmb:1.437', name: 'Passeig de Gràcia', lon: 2.1683, lat: 41.3915, place: 'tmb:P.6660327', networks: ['metro'] }, // L4
    { id: 'tmb:1.225', name: 'Passeig de Gràcia', lon: 2.1693, lat: 41.3927, place: 'tmb:P.6660327', networks: ['metro'] }, // L2
    { id: 'tmb:1.1136', name: 'Trinitat Nova', lon: 2.1832, lat: 41.4499, place: 'tmb:P.6660339', networks: ['metro'] },
    // Renfe's station beside the Metro's goes by Adif's code, in no group of TMB's.
    { id: 'adif:71802', name: 'Barcelona-Passeig de Gràcia', lon: 2.1652, lat: 41.3919, networks: ['rodalies'] },
  ];
  const drawn = places(stations);
  expect(drawn).toHaveLength(3);
  // Its board lists each of its Lines' Stations.
  expect(drawn[0]).toMatchObject({ id: 'tmb:P.6660327', name: 'Passeig de Gràcia', stations: ['tmb:1.327', 'tmb:1.437', 'tmb:1.225'], networks: ['metro'] });
  expect(drawn[0]?.lon).toBeCloseTo(2.1675);
  expect(drawn[0]?.lat).toBeCloseTo(41.392);
  expect(drawn.slice(1)).toEqual([
    { id: 'tmb:P.6660339', name: 'Trinitat Nova', stations: ['tmb:1.1136'], networks: ['metro'], lon: 2.1832, lat: 41.4499 },
    { id: 'adif:71802', name: 'Barcelona-Passeig de Gràcia', stations: ['adif:71802'], networks: ['rodalies'], lon: 2.1652, lat: 41.3919 },
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

// Networks of their own, whose timetables download to zipFile()s no dry run's do: one with a timetable
// as Rodalies has, and one with two as TRAM has.
const PREFIX = `copy-test-${process.pid}`;
const NETWORK: NetworkConfig = { ...RODALIES, timetables: [{ ...RODALIES.timetables[0], prefix: PREFIX }] };
const [TBX, ...TBS] = TRAM.timetables;
const PAIR: NetworkConfig = { ...TRAM, timetables: [{ ...TBX, prefix: `${PREFIX}-a` }, ...TBS.map((t) => ({ ...t, prefix: `${PREFIX}-b` }))] };

afterAll(async () => {
  for (const prefix of [PREFIX, `${PREFIX}-a`, `${PREFIX}-b`]) await rm(zipFile(prefix), { force: true });
});

const temp = () => mkdtemp(join(tmpdir(), 'viapeninsula-'));

/** A timetable with routes of these Lines, downloaded as download() does, to zipFile(). */
async function downloaded(prefix: string, ...lines: string[]) {
  const dir = await temp();
  await writeFile(join(dir, 'routes.txt'), ['route_short_name', ...lines].join('\n'));
  await rm(zipFile(prefix), { force: true });
  execFileSync('zip', ['-qj', zipFile(prefix), join(dir, 'routes.txt')]);
}

/** The names of a timetable's routes. */
async function names(gtfs: Source) {
  const found: string[] = [];
  for await (const r of rows(gtfs, 'routes.txt', ['route_short_name'])) found.push(r.route_short_name);
  return found;
}

/** Reads the Lines each of a Network's timetables gives it, as the build does, here only by the names of their routes. */
const read = async (feeds: (Feed & { gtfs: Source })[]) => ({ lines: await Promise.all(feeds.map((f) => names(f.gtfs))) });

/** A cache with a copy of a Network's timetables that gave it these Lines, each timetable's, kept on 5 Oct 2026. */
async function copied(network: NetworkConfig, ...each: string[][]) {
  const cache = await temp();
  for (const [i, t] of network.timetables.entries()) await downloaded(t.prefix, ...(each[i] ?? []));
  await readTimetables(network, undefined, read, () => {}, cache);
  const noon = new Date('2026-10-05T12:00:00Z');
  for (const file of await readdir(cache)) await utimes(join(cache, file), noon, noon);
  return cache;
}

const RENFE_499 = new Error('https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip: HTTP 499');

test('builds a Network from its new timetables, and keeps them as its copy in place of the last', async () => {
  const [cache, found]: [string, Found[]] = [await temp(), []];
  await downloaded(PREFIX, 'R1');
  expect(await readTimetables(NETWORK, undefined, read, (f) => found.push(f), cache)).toEqual({ lines: [['R1']] });
  await downloaded(PREFIX, 'R1', 'R2');
  expect(await readTimetables(NETWORK, undefined, read, (f) => found.push(f), cache)).toEqual({ lines: [['R1', 'R2']] });
  expect(found).toEqual([]);
  // At copyOf(), where npm run snippet reads it.
  expect(await names(zipSource(copyOf(NETWORK.timetables[0], cache)))).toEqual(['R1', 'R2']);

  vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await readTimetables(NETWORK, RENFE_499, read, () => {}, cache)).toEqual({ lines: [['R1', 'R2']] });
});

test("builds a Network whose timetable fails to download from the copy that last built it, and reports it with the copy's date and why", async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const [cache, found]: [string, Found[]] = [await copied(NETWORK, ['R1', 'R2']), []];
  // A download that fails can leave an older one where it downloads to, as a dry run's.
  await downloaded(PREFIX, 'R3');
  expect(await readTimetables(NETWORK, RENFE_499, read, (f) => found.push(f), cache)).toEqual({ lines: [['R1', 'R2']] });
  expect(found).toEqual([
    {
      kind: 'copy',
      network: 'rodalies',
      text: ['Rodalies de Catalunya is built from the copy of its timetables kept on 2026-10-05: https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip: HTTP 499'],
    },
  ]);
});

test("builds a Network from its copy where its timetable's download isn't a zip unzip can read", async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const [cache, found]: [string, Found[]] = [await copied(NETWORK, ['R1']), []];
  // As an error page served as the zip.
  await writeFile(zipFile(PREFIX), '<html>Service Unavailable</html>');
  expect(await readTimetables(NETWORK, undefined, read, (f) => found.push(f), cache)).toEqual({ lines: [['R1']] });
  expect(found).toEqual([{ kind: 'copy', network: 'rodalies', text: [expect.stringMatching(/^Rodalies de Catalunya is built from the copy of its timetables kept on 2026-10-05: .*unzip/)] }]);
});

test("builds a Network from its copy where its new timetable gives it no Lines, as Renfe's of 5 Oct 2026 gave Rodalies, and keeps the copy", async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const [cache, found]: [string, Found[]] = [await copied(NETWORK, ['R1']), []];
  await downloaded(PREFIX);
  expect(await readTimetables(NETWORK, undefined, read, (f) => found.push(f), cache)).toEqual({ lines: [['R1']] });
  expect(found).toEqual([
    { kind: 'copy', network: 'rodalies', text: ['Rodalies de Catalunya is built from the copy of its timetables kept on 2026-10-05: https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip gives it no Lines'] },
  ]);
  expect(await readTimetables(NETWORK, RENFE_499, read, () => {}, cache)).toEqual({ lines: [['R1']] });
});

test("builds a Network from its copy where one of its timetables gives it no Lines, though the other does, as either of TRAM's could, and keeps the copy", async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const [cache, found]: [string, Found[]] = [await copied(PAIR, ['T1'], ['T4']), []];
  await downloaded(`${PREFIX}-a`, 'T1', 'T2');
  await downloaded(`${PREFIX}-b`);
  expect(await readTimetables(PAIR, undefined, read, (f) => found.push(f), cache)).toEqual({ lines: [['T1'], ['T4']] });
  expect(found).toEqual([{ kind: 'copy', network: 'tram', text: ['TRAM is built from the copy of its timetables kept on 2026-10-05: https://opendata.tram.cat/GTFS/zip/TBS.zip gives it no Lines'] }]);
  expect(await readTimetables(PAIR, RENFE_499, read, () => {}, cache)).toEqual({ lines: [['T1'], ['T4']] });
});

test('fails with no copy to build the Network from, as the build did before it kept one, as with a copy kept before it had one of its timetables', async () => {
  await expect(readTimetables(NETWORK, RENFE_499, read, () => {}, await temp())).rejects.toThrow(
    'Rodalies de Catalunya has no copy of its timetables to build it from: https://ssl.renfe.com/ftransit/Fichero_CER_FOMENTO/fomento_transit.zip: HTTP 499',
  );
  const before = await copied({ ...PAIR, timetables: [PAIR.timetables[0]] }, ['T1']);
  await expect(readTimetables(PAIR, new Error('HTTP 503'), read, () => {}, before)).rejects.toThrow('TRAM has no copy of its timetables to build it from: HTTP 503');
});
