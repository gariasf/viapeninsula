import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, expect, test, vi } from 'vitest';
import { places, type Point } from '../bundle.ts';
import { AVE_LARGA_DISTANCIA, CERCANIAS_ASTURIAS, CERCANIAS_BILBAO, CERCANIAS_SANTANDER, CERCANIAS_ZARAGOZA, MEDIA_DISTANCIA_AVANT, NETWORKS, RODALIES, TRAM, type NetworkConfig } from '../networks.ts';
import { dirSource, rows, seconds, zipFile, zipSource, type Source } from './gtfs.ts';
import { copyOf, FGC_FEED, joinParts, meeting, METRO_FEED, onFgcRails, onMetroRails, onRails, onRodaliesRails, ownRails, readFeed, readTimetables, RODALIES_FEED, TRAMBAIX_FEED, unlisted, untaken, type Feed } from './networks.ts';
import type { Found } from './report.ts';
import type { Snippet } from './snippet.ts';
import { nearest, traceShapes } from './track.ts';
import { closuresOf, placeTrips, type FeedTrip } from './trips.ts';

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

test('runs on Iberian-gauge rails only, so never on the high-speed line where it has its gauge tag', () => {
  const kinds: Record<string, string>[] = [
    { gauge: '1668' },
    { gauge: '1435;1668' }, // three rails, for both gauges
    { gauge: '1668', highspeed: 'yes' }, // the line to València past Vandellòs, which R16 takes
    { gauge: '1435', highspeed: 'yes' }, // the high-speed line
    { gauge: '1000' },
  ];
  expect(kinds.map((tags) => onRodaliesRails({ id: 1, nodes: [], geometry: [], tags: { railway: 'rail', ...tags } }))).toEqual([true, true, true, false, false]);
});

test("counts a way with no gauge tag as every gauge's rails where a Network names gauges, as it does a way of two, and still not a way of another gauge (#479)", () => {
  // Six ways of Adif's left-hand track between Villallana and Mieres have railway=rail and no gauge.
  const kinds: Record<string, string>[] = [
    { railway: 'rail' },
    { railway: 'rail', gauge: '' },
    { railway: 'narrow_gauge' }, // FEVE's
    { railway: 'rail', gauge: '1668' },
    { railway: 'rail', gauge: '1000' },
    { railway: 'rail', gauge: '1435;1668' },
    { railway: 'rail', gauge: '1435' }, // the high-speed line
    { railway: 'tram' },
    {},
    // A yard or a siding with no gauge tag counts too, as every way does: that is the pick of #479, not only the mainline's.
    { railway: 'rail', service: 'yard' },
    { railway: 'tram', gauge: '1435' },
  ];
  const on = (rails: NetworkConfig['rails']) => kinds.map((tags) => onRails(rails)({ id: 1, nodes: [], geometry: [], tags }));
  // Iberian and metre gauge.
  expect(on(CERCANIAS_ASTURIAS.rails)).toEqual([true, true, true, true, true, true, false, false, false, true, false]);
  // Iberian gauge alone, and the kinds of rail its config names.
  expect(on(RODALIES.rails)).toEqual([true, true, false, true, false, true, false, false, false, true, false]);
  // A Network that names no gauge takes every way of its kinds, tagged or not.
  expect(on(TRAM.rails)).toEqual([false, false, false, false, false, false, false, true, false, false, true]);
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
  // TRAM's feed has no headsigns, and the Station's name is as TRAM's site spells it, not as its feed shortens it (#571).
  expect(trip?.headsign).toBe('Llevant | Les Planes');
  // Each platform is a stop of its own, such as A_FRMC for platform A at Francesc Macià.
  expect(trip?.calls[0]).toEqual({ station: 'tram:ST-172', arrival: 17760, departure: 17760 });
  expect(stations).toHaveLength(24);
});

/** That feed's Trip with the row of its 13th stop left out of stop_times.txt, so that its numbers run 1…12, 14…24. */
const skipping: Source = (file) => {
  const lines = tram(file);
  if (file !== 'stop_times.txt' || !lines) return lines;
  return (async function* () {
    for await (const l of lines) if (l.split(',')[4] !== '13') yield l;
  })();
};

test("reports a TRAM Trip whose stop numbers don't run 1…n, with its Line, and none whose do, as all 5,576 Trips in its feeds of 9 and 10 October 2026 do (#406)", async () => {
  expect((await readFeed(tram, '2026-10-01', TRAMBAIX_FEED)).found).toEqual([]);
  const log: string[] = [];
  const { found, trips } = await readFeed(skipping, '2026-10-01', TRAMBAIX_FEED, (l) => log.push(l));
  const text = "tram:TBX:2555_0194's stop numbers don't run 1…23: its call 13 is numbered 14";
  expect(found).toEqual([{ kind: 'sequence', line: 'tram:T2', trip: 'tram:TBX:2555_0194', text: [text] }]);
  expect(log).toEqual([text]);
  // The Trip is read all the same: the report only says what its numbers would name.
  expect(trips.map((t) => t.calls.length)).toEqual([23]);
});

test("checks stop numbers only of the timetables whose config says its live data names a stop by one, TRAM's two, as FGC's feed has 632 Trips whose numbers skip one and the Metro's 342 that start after 1 (10 Oct 2026)", async () => {
  expect(NETWORKS.flatMap((n) => n.timetables.filter((t) => t.stopNumbers).map((t) => t.prefix))).toEqual(['tram:TBX', 'tram:TBS']);
  expect((await readFeed(skipping, '2026-10-01', { ...TRAMBAIX_FEED, stopNumbers: undefined })).found).toEqual([]);
});

// Rows cut verbatim from TRAM's feeds of 12 October 2026 (#571): Trambaix's T3 Trips of 13 October between Francesc
// Macià and Sant Feliu, and Trambesòs's T5 Trips between Ciutadella and Glòries and T6's between Estació St.Adrià and
// Can Jaumandreu, which have the other five Stations whose names the feeds shorten.
// They have no shapes.txt, which the real feeds' do and the Trips here don't need, so they're read as a shapeless timetable.
const tramT3 = dirSource(fileURLToPath(new URL('fixtures/tram-t3', import.meta.url)));
const tramBesos = dirSource(fileURLToPath(new URL('fixtures/tram-besos', import.meta.url)));
const TRAMBESOS_FEED: Feed = { network: TRAM, ...(TRAM.timetables[1] ?? TRAM.timetables[0]) };

test("spells out TRAM's eight short Station names as its own site does, in its Stations and in the headsigns of the Trips that end at them, which the T2 test above has for Llevant (#571)", async () => {
  const name = (stations: { id: string; name: string }[], id: string) => stations.find((s) => s.id === id)?.name;
  const t2 = await readFeed(tram, '2026-10-01', TRAMBAIX_FEED);
  expect(name(t2.stations, 'tram:ST-178')).toBe('Zona Universitària');
  expect(name(t2.stations, 'tram:ST-193')).toBe('Fontsanta | Fatjó');
  expect(name(t2.stations, 'tram:ST-230')).toBe('Llevant | Les Planes');
  const t3 = await readFeed(tramT3, '2026-10-13', { ...TRAMBAIX_FEED, shapeless: true });
  expect(name(t3.stations, 'tram:ST-197')).toBe('Hospital Sant Joan Despí | TV3');
  expect(name(t3.stations, 'tram:ST-201')).toBe('Sant Feliu | Consell Comarcal');
  expect(t3.trips.map((t) => [t.id, t.headsign])).toEqual([
    ['tram:TBX:2555_0362', 'Sant Feliu | Consell Comarcal'],
    ['tram:TBX:2555_0363', 'Francesc Macià'],
  ]);
  const besos = await readFeed(tramBesos, '2026-10-13', { ...TRAMBESOS_FEED, shapeless: true });
  expect(name(besos.stations, 'tram:ST-202')).toBe('Ciutadella | Vila Olímpica');
  expect(name(besos.stations, 'tram:ST-203')).toBe('Wellington | UPF');
  expect(name(besos.stations, 'tram:ST-229')).toBe('Estació de Sant Adrià');
  expect(besos.trips.map((t) => [t.id, t.headsign])).toEqual([
    ['tram:TBS:1987_0295', 'Glòries'],
    ['tram:TBS:1987_0296', 'Ciutadella | Vila Olímpica'],
    ['tram:TBS:1987_0407', 'Estació de Sant Adrià'],
    ['tram:TBS:1987_0408', 'Can Jaumandreu'],
  ]);
});

test("leaves the names of TRAM's other Stations as its feeds have them, those its config doesn't spell out, which aren't shortened (#571)", async () => {
  const { stations } = await readFeed(tramBesos, '2026-10-13', { ...TRAMBESOS_FEED, shapeless: true });
  const names = stations.map((s) => s.name);
  expect(names).toEqual(expect.arrayContaining(['Marina', 'Auditori/Teatre Nacional', 'Glòries', 'Can Jaumandreu', 'Parc del Besòs']));
  // Not the shortened names, which no Station has now.
  for (const short of ['Ciutadella|V.O.', 'Wellington|UPF', 'Estació St.Adrià']) expect(names).not.toContain(short);
});

test("has TRAM's lines page as the source of each of the eight names its config spells out (#571)", () => {
  expect(Object.keys(TRAM.stationNames ?? {})).toHaveLength(8);
  for (const [id, { source }] of Object.entries(TRAM.stationNames ?? {})) expect(source, id).toBe('https://www.tram.cat/ca/linies-i-horaris');
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
    { id: 'tmb:1.327', name: 'Passeig de Gràcia', lon: 2.1649, lat: 41.3918, place: 'tmb:P.6660327', networks: ['metro'], lines: ['metro:L3'] }, // L3
    { id: 'tmb:1.437', name: 'Passeig de Gràcia', lon: 2.1683, lat: 41.3915, place: 'tmb:P.6660327', networks: ['metro'], lines: ['metro:L4'] }, // L4
    { id: 'tmb:1.225', name: 'Passeig de Gràcia', lon: 2.1693, lat: 41.3927, place: 'tmb:P.6660327', networks: ['metro'], lines: ['metro:L2'] }, // L2
    { id: 'tmb:1.1136', name: 'Trinitat Nova', lon: 2.1832, lat: 41.4499, place: 'tmb:P.6660339', networks: ['metro'] },
    // Renfe's station beside the Metro's goes by Adif's code, in no group of TMB's.
    { id: 'adif:71802', name: 'Barcelona-Passeig de Gràcia', lon: 2.1652, lat: 41.3919, networks: ['rodalies'] },
  ];
  const drawn = places(stations);
  expect(drawn).toHaveLength(3);
  // Its board lists each of its Lines' Stations.
  expect(drawn[0]).toMatchObject({ id: 'tmb:P.6660327', name: 'Passeig de Gràcia', stations: ['tmb:1.327', 'tmb:1.437', 'tmb:1.225'], networks: ['metro'], lines: ['metro:L2', 'metro:L3', 'metro:L4'] });
  expect(drawn[0]?.lon).toBeCloseTo(2.1675);
  expect(drawn[0]?.lat).toBeCloseTo(41.392);
  expect(drawn.slice(1)).toEqual([
    { id: 'tmb:P.6660339', name: 'Trinitat Nova', stations: ['tmb:1.1136'], networks: ['metro'], lines: [], lon: 2.1832, lat: 41.4499 },
    { id: 'adif:71802', name: 'Barcelona-Passeig de Gràcia', stations: ['adif:71802'], networks: ['rodalies'], lines: [], lon: 2.1652, lat: 41.3919 },
  ]);
});

// Rows cut from Renfe's long-distance feed of 2026-10-10, without the spaces it pads each line with:
// the Trips it lists Alvia 00622 Barcelona–Vigo, Alvia 00190, Reg.Exp. 17307 and MD 18030 in on
// Saturday 10 October, and one Trip each of Avlo 05095, Euromed 01072, Proximidad 38304 and 15210,
// which Rodalies runs on its RT2 and this feed lists as a Regional. The feed has no shapes.
const longDistance = dirSource(fileURLToPath(new URL('fixtures/long-distance', import.meta.url)));
const AVE_FEED: Feed = { network: AVE_LARGA_DISTANCIA, ...AVE_LARGA_DISTANCIA.timetables[0] };
const MD_FEED: Feed = { network: MEDIA_DISTANCIA_AVANT, ...MEDIA_DISTANCIA_AVANT.timetables[0] };

test("splits Renfe's long-distance timetable into its two Networks, whose Lines are named as Renfe names them in public rather than in the feed's capitals and typo, and coloured as their config says, as the feed gives every route F2F5F5", async () => {
  const lines = async (feed: Feed) => (await readFeed(longDistance, '2026-10-10', feed)).lines.map(({ id, colour, kind, shapes }) => ({ id, colour, kind, shapes }));
  expect(await lines(AVE_FEED)).toEqual([
    { id: 'ave-larga-distancia:Alvia', colour: '#81005E', kind: 'long-distance', shapes: [] },
    { id: 'ave-larga-distancia:Euromed', colour: '#81005E', kind: 'long-distance', shapes: [] },
    { id: 'ave-larga-distancia:Avlo', colour: '#81005E', kind: 'long-distance', shapes: [] },
  ]);
  expect(await lines(MD_FEED)).toEqual([
    { id: 'media-distancia-avant:Regional', colour: '#000000', kind: 'regional', shapes: [] },
    { id: 'media-distancia-avant:Reg.Exp.', colour: '#000000', kind: 'regional', shapes: [] },
    { id: 'media-distancia-avant:MD', colour: '#000000', kind: 'regional', shapes: [] },
    { id: 'media-distancia-avant:Proximidad', colour: '#000000', kind: 'regional', shapes: [] },
  ]);
});

test("gives a Line the profile its Network's config names for it, as Avlo's 300 km/h, and a Line the config names none for has none, and runs as its Network's does", async () => {
  const profiles = async (feed: Feed) => (await readFeed(longDistance, '2026-10-10', feed)).lines.map(({ id, profile }) => [id, profile]);
  expect(await profiles(AVE_FEED)).toEqual([
    ['ave-larga-distancia:Alvia', undefined],
    ['ave-larga-distancia:Euromed', undefined],
    ['ave-larga-distancia:Avlo', { topSpeed: 300 / 3.6 }],
  ]);
  expect((await profiles(MD_FEED)).map(([, profile]) => profile)).toEqual([undefined, undefined, undefined, undefined]);
  // A Network whose config names none, as every Network on the map, has no Line with one: its bundle is as it was.
  expect(rodalies.lines.length).toBeGreaterThan(0);
  expect(rodalies.lines.every((l) => !('profile' in l))).toBe(true);
});

test("makes each Train's Trips on a day one Trip: Alvia 00622's six one Barcelona–Vigo, with Ourense's arrival and departure one call, and Alvia 00190's identical twins one", async () => {
  const { trips } = await readFeed(longDistance, '2026-10-10', AVE_FEED);
  // By its Train number, which is its trip_short_name.
  expect(trips.map((t) => [t.number, t.id])).toEqual([
    ['00190', 'ave-larga-distancia:0019032026-10-10'],
    ['00622', 'ave-larga-distancia:0062212026-10-10'],
    ['01072', 'ave-larga-distancia:0107212026-10-09'],
    ['05095', 'ave-larga-distancia:0509512026-10-09'],
  ]);
  const alvia = trips.find((t) => t.number === '00622');
  expect(alvia).toMatchObject({ line: 'ave-larga-distancia:Alvia', headsign: 'Vigo Urzaiz' });
  expect(alvia?.calls).toHaveLength(25);
  expect(alvia?.calls[0]).toEqual({ station: 'adif:71801', arrival: at('09:05'), departure: at('09:05') }); // Barcelona-Sants
  // Its Trip to Ourense arrives there at 20:59, and the one from Lleida leaves at 21:01, as its Trip to Vigo does.
  expect(alvia?.calls.filter((c) => c.station === 'adif:22100')).toEqual([{ station: 'adif:22100', arrival: at('20:59'), departure: at('21:01') }]);
  expect(alvia?.calls.at(-1)).toEqual({ station: 'adif:08223', arrival: at('22:57'), departure: at('22:57') }); // Vigo Urzaiz
  expect(trips.find((t) => t.number === '00190')?.calls).toHaveLength(12);
});

test("drops a Train's calls in its other Trips that lie outside the run they share with the one it's made from, and logs its Train number, Station and time: Reg.Exp. 17307 is one Trip Soria–Madrid, as its Trip to Baides and its Trip from there are run by road", async () => {
  const log: string[] = [];
  const { trips } = await readFeed(longDistance, '2026-10-10', MD_FEED, (l) => log.push(l));
  const [regExp, ...more] = trips.filter((t) => t.number === '17307');
  expect(more).toEqual([]);
  expect(regExp).toMatchObject({ id: 'media-distancia-avant:1730712026-10-09', line: 'media-distancia-avant:Reg.Exp.', headsign: 'Madrid-Chamartín-Clara Campoamor' });
  // Soria at 18:30 to Chamartín at 23:30, through Sigüenza and Matillas.
  expect(regExp?.calls).toHaveLength(13);
  expect(regExp?.calls.map((c) => c.station)).not.toContain('adif:70300'); // Baides
  expect(log.filter((l) => l.includes(' 17307 '))).toEqual([
    'media-distancia-avant:Reg.Exp. 17307 drops its call at Baides at 19:55 on 2026-10-10: it lies outside the run its Trips share',
    'media-distancia-avant:Reg.Exp. 17307 drops its call at Baides at 20:30 on 2026-10-10: it lies outside the run its Trips share',
  ]);
});

test("joins the Trip a Train is made from in a call another of its Trips makes between two they share, in time: MD 18030's at Linares-Baeza, between Almuradiel and Jaén, all run by road, where that Trip calls at Vilches and Mengíbar", async () => {
  const log: string[] = [];
  const { trips } = await readFeed(longDistance, '2026-10-10', MD_FEED, (l) => log.push(l));
  const md = trips.find((t) => t.number === '18030');
  expect(md?.id).toBe('media-distancia-avant:1803022026-10-09');
  expect(md?.calls.slice(-5)).toEqual([
    { station: 'adif:50202', arrival: at('11:54'), departure: at('12:09') }, // Almuradiel-Viso del Marqués
    { station: 'adif:50207', arrival: at('12:49'), departure: at('12:49') }, // Vilches
    { station: 'adif:50300', arrival: at('13:04'), departure: at('13:04') }, // Linares-Baeza
    { station: 'adif:03001', arrival: at('13:29'), departure: at('13:29') }, // Mengíbar-Artichuela
    { station: 'adif:03100', arrival: at('13:58'), departure: at('13:58') }, // Jaén
  ]);
  // Its Trips from Vilches to Linares-Baeza and on to Mengíbar join it there, but for Vilches at 12:30 and Mengíbar at 13:34, 19 and 5 minutes off its own.
  expect(log.filter((l) => l.includes(' 18030 '))).toEqual([
    'media-distancia-avant:MD 18030 drops its call at Vilches at 12:30 on 2026-10-10: it lies outside the run its Trips share',
    'media-distancia-avant:MD 18030 drops its call at Mengíbar-Artichuela at 13:34 on 2026-10-10: it lies outside the run its Trips share',
  ]);
});

// Rows cut from Renfe's long-distance feed of 2026-10-10, without the spaces it pads each line with: the
// Trips that run on Tuesday 13 October of the Trains it lists in parts that don't run the same length,
// which Renfe runs by road on Zaragoza–Teruel's line (18500, 18502, 18506, 18511, 18515 and 18517), at
// Baides (Regional 35402 and 35403) and on Intercity 01460's and 01463's Lorca branch, and of MD 18034,
// whose two longest Trips call differently. Of their services, only the exceptions to that day: none.
const parts = dirSource(fileURLToPath(new URL('fixtures/long-distance-parts', import.meta.url)));
const day = '2026-10-13';

test("makes a Train of its Trip that runs its whole way though another has more calls, as Zaragoza–Teruel's Trains of the Trip from end to end by Cariñena, not of the one with the villages between Calamocha and Encinacorba, which would have them start or end there and lose their run to Zaragoza", async () => {
  const log: string[] = [];
  const { trips } = await readFeed(parts, day, MD_FEED, (l) => log.push(l));
  const run = (number: string) => {
    const [trip, ...more] = trips.filter((t) => t.number === number);
    expect(more).toEqual([]);
    return trip;
  };
  // Teruel at 06:10 to Zaragoza Delicias at 09:24, where its Trip to Encinacorba has 17 calls, to 08:50.
  const r18500 = run('18500');
  expect(r18500?.id).toBe('media-distancia-avant:1850012026-10-09');
  expect(r18500?.calls).toHaveLength(13);
  expect(r18500?.calls[0]).toEqual({ station: 'adif:67200', arrival: at('06:10'), departure: at('06:10') });
  expect(r18500?.calls.at(-1)).toEqual({ station: 'adif:04040', arrival: at('09:24'), departure: at('09:24') });
  // Its other Trips' calls that lie outside the run they share are logged as ever, 15 of them: the villages' from Navarrete's 07:54, Cariñena's 09:06 to Zaragoza Delicias' 09:40, and Encinacorba's 08:10.
  const dropped = log.filter((l) => l.includes(' 18500 '));
  expect(dropped).toHaveLength(15);
  expect(dropped[0]).toBe('media-distancia-avant:Regional 18500 drops its call at Navarrete at 07:54 on 2026-10-13: it lies outside the run its Trips share');
  // València at 15:15 to Zaragoza Delicias at 21:01, where its Trip to Encinacorba has 19, to 20:23.
  const r18506 = run('18506');
  expect(r18506?.id).toBe('media-distancia-avant:1850612026-10-09');
  expect(r18506?.calls).toHaveLength(16);
  expect([r18506?.calls[0]?.station, r18506?.calls.at(-1)?.station]).toEqual(['adif:65000', 'adif:04040']);
  expect(r18506?.calls.at(-1)?.arrival).toBe(at('21:01'));
  // Zaragoza Delicias at 08:15 to València at 14:01, where its Trip from Encinacorba has 21, from 08:41.
  const r18511 = run('18511');
  expect(r18511?.id).toBe('media-distancia-avant:1851112026-10-09');
  expect(r18511?.calls).toHaveLength(18);
  expect([r18511?.calls[0]?.station, r18511?.calls.at(-1)?.station]).toEqual(['adif:04040', 'adif:65000']);
  expect(r18511?.calls[0]?.departure).toBe(at('08:15'));
  // Its longest Trip runs the whole way and calls at the villages too, so it was always the one.
  const r18517 = run('18517');
  expect(r18517?.id).toBe('media-distancia-avant:1851722026-10-09');
  expect(r18517?.calls).toHaveLength(22);
  expect([r18517?.calls[0]?.station, r18517?.calls.at(-1)?.station]).toEqual(['adif:04040', 'adif:67200']);
});

test("makes a Train of the one of its Trips that runs its whole way where another has as many calls: MD 18502's and 18515's, whose Trips to and from Encinacorba tie with theirs from València and from Zaragoza, and Regional 35402's and 35403's, whose Trips to and from Baides, where Renfe's road shuttle is, tie with theirs to and from Sigüenza", async () => {
  const { trips } = await readFeed(parts, day, MD_FEED, () => {});
  const ends = (number: string) => {
    const t = trips.find((trip) => trip.number === number);
    return [t?.id.split(':')[1], t?.calls.length, t?.calls[0]?.station, t?.calls.at(-1)?.station];
  };
  // València to Zaragoza Delicias, 16 calls against its Trip to Encinacorba's 16.
  expect(ends('18502')).toEqual(['1850212026-10-09', 16, 'adif:65000', 'adif:04040']);
  // Zaragoza Delicias to València, 13 against its Trip from Encinacorba's 13.
  expect(ends('18515')).toEqual(['1851512026-10-09', 13, 'adif:04040', 'adif:65000']);
  // Madrid-Chamartín to Sigüenza, 15 against its Trip to Baides's 15.
  expect(ends('35402')).toEqual(['3540212026-10-12', 15, 'adif:17000', 'adif:70302']);
  // Sigüenza to Madrid-Chamartín, 26 against its Trip from Baides's 26, which leaves there at 06:25, before the 06:48 it leaves Sigüenza.
  expect(ends('35403')).toEqual(['3540312026-10-12', 26, 'adif:70302', 'adif:17000']);
});

test("makes a Train of the one of its Trips whose ID sorts first where more than one runs its whole way with as many calls, as Intercity 01460's and 01463's, from and to Cartagena, not Lorca, whose branch has no rails, and logs the calls it leaves out", async () => {
  const log: string[] = [];
  const { trips } = await readFeed(parts, day, AVE_FEED, (l) => log.push(l));
  const ends = (number: string) => {
    const t = trips.find((trip) => trip.number === number);
    return [t?.id.split(':')[1], t?.calls.length, t?.calls[0]?.station, t?.calls.at(-1)?.station];
  };
  expect(ends('01460')).toEqual(['0146012026-10-10', 11, 'adif:61307', 'adif:65000']); // Cartagena to València
  expect(ends('01463')).toEqual(['0146312026-10-10', 11, 'adif:65000', 'adif:61307']);
  // With Torre-Pacheco and Balsicas, then Murcia del Carmen, where the Lorca branch joins.
  expect(trips.find((t) => t.number === '01460')?.calls.slice(0, 4).map((c) => c.station)).toEqual(['adif:61307', 'adif:61304', 'adif:61303', 'adif:61200']);
  // The Lorca branch's calls are dropped, and logged.
  expect(log.filter((l) => l.includes(' 01460 ')).map((l) => l.replace(/ on .*/, ''))).toEqual([
    'ave-larga-distancia:Intercity 01460 drops its call at Lorca-Sutullena at 11:03',
    'ave-larga-distancia:Intercity 01460 drops its call at Totana at 11:29',
    'ave-larga-distancia:Intercity 01460 drops its call at Alhama de Murcia at 11:44',
  ]);
});

test("makes the same Trains of a day whatever order its timetable lists a Train's Trips in, and logs the same calls dropped", async () => {
  const backwards: Source = (file) => {
    const lines = parts(file);
    if (file !== 'trips.txt' || !lines) return lines;
    return (async function* () {
      const all: string[] = [];
      for await (const l of lines) all.push(l);
      yield* [all[0] ?? '', ...all.slice(1).reverse()];
    })();
  };
  for (const feed of [AVE_FEED, MD_FEED]) {
    const read = async (source: Source) => {
      const log: string[] = [];
      const { trips } = await readFeed(source, day, feed, (l) => log.push(l));
      return { trips: trips.toSorted((a, b) => (a.number ?? '').localeCompare(b.number ?? '')), log: log.toSorted() };
    };
    const forwards = await read(parts);
    expect(forwards.trips.length).toBeGreaterThan(0);
    expect(await read(backwards)).toEqual(forwards);
  }
});

/** A Trip of Train 00001 calling at Stations at times, each a moment. */
const part = (id: string, ...calls: [station: string, time: string][]): FeedTrip => ({
  id,
  line: 'MD',
  shape: '',
  headsign: '',
  number: '00001',
  calls: calls.map(([station, time]) => ({ station, arrival: at(time), departure: at(time) })),
});
const longest = part('a', ['A', '10:00'], ['B', '10:10'], ['C', '10:20']);

test("takes a call of a Train's other Trip at one of its Stations up to 2 minutes from its own for that one, but not one 3 minutes off", () => {
  const log: string[] = [];
  const joined = joinParts([longest, part('b', ['B', '10:12'], ['C', '10:20']), part('c', ['A', '10:03'], ['B', '10:10'])], new Map(), '2026-10-10', (l) => log.push(l));
  expect(joined).toEqual([longest]);
  expect(log).toEqual(['MD 00001 drops its call at A at 10:03 on 2026-10-10: it lies outside the run its Trips share']);
});

test("logs a call it drops once, where one of a Train's Trips ends and another starts, as MD 35807's Trips from Sevilla and to Madrid do at Fuente del Arco, which the one it's made from passes", () => {
  const log: string[] = [];
  const stations = new Map([['X', { id: 'X', name: 'Fuente del Arco', lon: -5.94, lat: 38.13 }]]);
  joinParts([longest, part('d', ['A', '10:00'], ['X', '10:05']), part('e', ['X', '10:05'], ['C', '10:20'])], stations, '2026-10-10', (l) => log.push(l));
  expect(log).toEqual(['MD 00001 drops its call at Fuente del Arco at 10:05 on 2026-10-10: it lies outside the run its Trips share']);
});

test("makes a Train of its Trip that starts at a Station none of its Trips calls at after another call and ends at one none calls at before another, though one that does neither has more calls: W runs from A to Z, M has 4 calls to E, where S, from E to Z, starts", () => {
  const log: string[] = [];
  const whole = part('w', ['A', '10:00'], ['C', '10:20'], ['Z', '10:40']);
  const more = part('m', ['A', '10:00'], ['B', '10:10'], ['C', '10:20'], ['E', '10:25']);
  const [joined, ...rest] = joinParts([more, whole, part('s', ['E', '10:25'], ['Z', '10:40'])], new Map(), '2026-10-10', (l) => log.push(l));
  expect(rest).toEqual([]);
  expect(joined?.id).toBe('w');
  // M's call at B, between two it shares, joins, and E, which lies outside the run they share, doesn't.
  expect(joined?.calls.map((c) => c.station)).toEqual(['A', 'B', 'C', 'Z']);
  expect(log).toEqual(['MD 00001 drops its call at E at 10:25 on 2026-10-10: it lies outside the run its Trips share']);
});

test("makes a Train of its Trip with the most calls where none of its Trips runs its whole way, as where one ends at the Station another starts at, and of the one whose ID sorts first where they tie, whatever order they come in, and never of a part with a single call, whose Station no other calls at", () => {
  const [x, y] = [part('x', ['A', '10:00'], ['B', '10:10'], ['C', '10:20']), part('y', ['C', '10:20'], ['D', '10:30'], ['E', '10:40'])];
  expect(joinParts([x, y], new Map(), '2026-10-10', () => {}).map((t) => t.id)).toEqual(['x']);
  expect(joinParts([y, x], new Map(), '2026-10-10', () => {}).map((t) => t.id)).toEqual(['x']);
  const longer = part('z', ['C', '10:20'], ['D', '10:30'], ['F', '10:35'], ['E', '10:40']);
  expect(joinParts([x, longer], new Map(), '2026-10-10', () => {}).map((t) => t.id)).toEqual(['z']);
  // A part of one call at a Station none of the others calls at starts and ends where none of them does, and runs nowhere.
  expect(joinParts([x, y, part('o', ['Q', '10:15'])], new Map(), '2026-10-10', () => {}).map((t) => t.id)).toEqual(['x']);
});

// Rows cut verbatim from Renfe's Cercanías feed of 2026-10-10: the Trips of Rodalies' Trains 33527 and 33518
// that run on Tuesday 13 October, and 77500's, an R4 Trip of its own, with their routes, Stations and service,
// and their shapes' points, every 25th. Renfe lists 33527 as an R4 Trip from Manresa to Rajadell, which ends at
// 16:46 as its RL4 Trip on to Lleida-Pirineus starts, and 33518 as an RL4 Trip from Lleida-Pirineus to Manresa,
// at 21:30, and an R4 Trip of one call, at Manresa at 21:30.
const rajadell = dirSource(fileURLToPath(new URL('fixtures/rodalies-rajadell', import.meta.url)));

/** A feed's stop_times.txt with the rows `edit` changes, as a Train's Trips that don't quite meet would have them. */
const edited = (source: Source, edit: (row: string) => string): Source => (file) => {
  const lines = source(file);
  if (file !== 'stop_times.txt' || !lines) return lines;
  return (async function* () {
    for await (const l of lines) yield edit(l);
  })();
};

test("makes the Trips of one Train number that meet at a Station in the same minute one Trip, named by the Line of most of its run, as R4's 33527 from Manresa to Rajadell and RL4's on from there to Lleida-Pirineus are one RL4 Trip, and logs each join with its Train number and Station (#467)", async () => {
  const log: string[] = [];
  const { trips } = await readFeed(rajadell, '2026-10-13', RODALIES_FEED, (l) => log.push(l));
  const one = trips.filter((t) => t.number === '33527');
  expect(one.map((t) => t.id)).toEqual(['rodalies:5184M33527RL4']);
  expect(one[0]).toMatchObject({ line: 'rodalies:RL4', shape: 'rodalies:51_RL4', headsign: 'Lleida-Pirineus' });
  // Manresa at 16:34, Rajadell once, at 16:46, and the 14 Stations on to Lleida-Pirineus at 18:34.
  expect(one[0]?.calls).toHaveLength(16);
  expect(one[0]?.calls[0]).toEqual({ station: 'adif:78600', arrival: at('16:34'), departure: at('16:34') });
  expect(one[0]?.calls[1]).toEqual({ station: 'adif:78506', arrival: at('16:46'), departure: at('16:46') });
  expect(one[0]?.calls.at(-1)).toEqual({ station: 'adif:78400', arrival: at('18:34'), departure: at('18:34') });
  expect(log.filter((l) => l.includes(' 33527 '))).toEqual(['rodalies:RL4 33527 joins its rodalies:R4 Trip at Rajadell at 16:46 on 2026-10-13: the two meet there in the same minute']);
});

test("makes the R4 Trip of one call that Renfe lists beside an RL4 Train's last, as 33518's at Manresa at 21:30 beside its RL4 Trip from Lleida-Pirineus, one Trip with it, which the build left out for calling at fewer than two Stations (#467)", async () => {
  const log: string[] = [];
  const { trips } = await readFeed(rajadell, '2026-10-13', RODALIES_FEED, (l) => log.push(l));
  const one = trips.filter((t) => t.number === '33518');
  expect(one.map((t) => t.id)).toEqual(['rodalies:5184M33518RL4']);
  expect(one[0]).toMatchObject({ line: 'rodalies:RL4', shape: 'rodalies:51_RL4:back', headsign: 'Manresa' });
  expect(one[0]?.calls).toHaveLength(16);
  expect(one[0]?.calls[0]).toEqual({ station: 'adif:78400', arrival: at('19:28'), departure: at('19:28') });
  expect(one[0]?.calls.at(-1)).toEqual({ station: 'adif:78600', arrival: at('21:30'), departure: at('21:30') });
  expect(log.filter((l) => l.includes(' 33518 '))).toEqual(['rodalies:RL4 33518 joins its rodalies:R4 Trip at Manresa at 21:30 on 2026-10-13: the two meet there in the same minute']);
  // The R4 Trip of 77500, which meets no other, stays.
  expect(trips.map((t) => t.id).sort()).toEqual(['rodalies:5184M33518RL4', 'rodalies:5184M33527RL4', 'rodalies:5184M77500R4']);
});

test("takes the IDs of the Trips a Trip is made one with, which live data names the Train by while it runs their part, and no Trip's that is made one with none (#467)", async () => {
  const { trips } = await readFeed(rajadell, '2026-10-13', RODALIES_FEED, () => {});
  const joined = new Map(trips.map((t) => [t.id, t.joined]));
  expect(joined.get('rodalies:5184M33518RL4')).toEqual(['rodalies:5184M33518R4']);
  expect(joined.get('rodalies:5184M33527RL4')).toEqual(['rodalies:5184M33527R4']);
  expect(joined.get('rodalies:5184M77500R4')).toBeUndefined();
  expect(trips.find((t) => t.id === 'rodalies:5184M77500R4')).not.toHaveProperty('joined');
});

test("serves the Stations of a Trip made one from another's on the shape of the Trip it's named by, and not on the shape of the Trip it takes in unless that shape's other Trips call there: R4's 33527 no longer has Rajadell on its shape, with RL4's 33527 from Manresa on to it, though R4's 77500 still has its own (#467)", async () => {
  const { shapes } = await readFeed(rajadell, '2026-10-13', RODALIES_FEED, () => {});
  const served = (id: string) => shapes.find((s) => s.id === id)?.stations.sort();
  const [manresa, rajadell_] = ['adif:78600', 'adif:78506'];
  // 33527's R4 Trip ran on R4's shape from Manresa to Rajadell: it has none of it left, but 77500's Stations.
  expect(served('rodalies:51_R4_INV')).not.toContain(rajadell_);
  expect(served('rodalies:51_R4_INV')).toContain('adif:78700');
  // Every Station of the two RL4 Trips is RL4's, Manresa and Rajadell too.
  expect(served('rodalies:51_RL4')).toEqual(expect.arrayContaining([manresa, rajadell_, 'adif:78400']));
  // The R4 Trip of one call at Manresa was the only Trip of its shape here: RL4's 33518 serves Manresa now.
  expect(served('rodalies:51_R4')).toEqual([]);
  // And R4's Trip from Manresa to Rajadell, the one Trip that ran 51_R4_INV back, no longer has a way back of its own.
  expect(shapes.map((s) => s.id).sort()).toEqual(['rodalies:51_R4', 'rodalies:51_R4_INV', 'rodalies:51_RL4', 'rodalies:51_RL4:back']);
});

test("leaves a shape no way back for a Trip it was made one from, as 33527's R4 Trip from Manresa to Rajadell was the only one to run R4's shape back where another runs it from Rajadell to Manresa (#467)", async () => {
  // Made up: 77500 calls at Rajadell and then Manresa on R4's shape, which is the way its feed draws it from Rajadell on.
  const forwards = edited(rajadell, (row) => (row.startsWith('5184M77500R4,07:00:00,07:00:00,78700') ? row.replace(',78700,', ',78506,') : row.startsWith('5184M77500R4,07:03:00,07:03:00,78710') ? row.replace(',78710,', ',78600,') : row));
  const { shapes } = await readFeed(forwards, '2026-10-13', RODALIES_FEED, () => {});
  const ids = shapes.map((s) => s.id);
  expect(ids).toContain('rodalies:51_R4_INV');
  expect(ids).not.toContain('rodalies:51_R4_INV:back');
});

test("leaves a long-distance Train's parts to joinParts() though they share a service day and meet in the same minute, as MD 18030's from Vilches to Linares-Baeza and on to Mengíbar would (#467)", async () => {
  // Renfe gives each part a service_id of its own, so none shares a day with another: made so here.
  const shared: Source = (file) => {
    const lines = longDistance(file);
    if (file !== 'trips.txt' || !lines) return lines;
    return (async function* () {
      for await (const l of lines) yield l.replace(/2026-10-092026-10-3118030[234]/, '2026-10-092026-10-31180301');
    })();
  };
  const log: string[] = [];
  const { trips } = await readFeed(shared, '2026-10-10', MD_FEED, (l) => log.push(l));
  expect(log.filter((l) => l.includes(' joins its '))).toEqual([]);
  expect(trips.find((t) => t.number === '18030')?.joined).toBeUndefined();
});

test("serves a shape the same Stations on a day its Trains don't run, as it does on one they do, and joins none then (#467)", async () => {
  const log: string[] = [];
  const [on, off] = [await readFeed(rajadell, '2026-10-13', RODALIES_FEED, () => {}), await readFeed(rajadell, '2026-10-14', RODALIES_FEED, (l) => log.push(l))];
  expect(off.trips).toEqual([]);
  expect(log).toEqual([]);
  expect(off.shapes).toEqual(on.shapes);
});

test("leaves a call where one Trip ends and the next starts in the same minute, arriving as the first does and leaving as the second does, at the minute they meet (#467)", async () => {
  // 33527's RL4 Trip leaves Rajadell at 16:46:30, 30 s after its R4 Trip arrives.
  const slow = edited(rajadell, (row) => (row.startsWith('5184M33527RL4,16:46:00,16:46:00,78506') ? row.replace('16:46:00,16:46:00', '16:46:30,16:46:30') : row));
  const { trips } = await readFeed(slow, '2026-10-13', RODALIES_FEED, () => {});
  expect(trips.find((t) => t.number === '33527')?.calls[1]).toEqual({ station: 'adif:78506', arrival: at('16:46'), departure: at('16:46') + 30 });
});

test("keeps a Train's Trips apart where they meet at a Station but not in the same minute, as 33527's R4 Trip, which ends at Rajadell at 16:46, and its RL4 Trip, which starts there at 16:47 (#467)", async () => {
  const late = edited(rajadell, (row) => (row.startsWith('5184M33527RL4,16:46:00,16:46:00,78506') ? row.replace('16:46:00,16:46:00', '16:47:00,16:47:00') : row));
  const log: string[] = [];
  const { trips } = await readFeed(late, '2026-10-13', RODALIES_FEED, (l) => log.push(l));
  expect(trips.filter((t) => t.number === '33527').map((t) => [t.id, t.calls.length])).toEqual([['rodalies:5184M33527R4', 2], ['rodalies:5184M33527RL4', 15]]);
  expect(log.filter((l) => l.includes(' 33527 '))).toEqual([]);
});

test("keeps a Train's Trips apart where they end and start in the same minute at two Stations, as 33527's R4 Trip, were it to end at Aguilar de Segarra at 16:46 as its RL4 Trip starts at Rajadell (#467)", async () => {
  const elsewhere = edited(rajadell, (row) => (row.startsWith('5184M33527R4,16:46:00,16:46:00,78506') ? row.replace(',78506,', ',78505,') : row));
  const { trips } = await readFeed(elsewhere, '2026-10-13', RODALIES_FEED, () => {});
  expect(trips.filter((t) => t.number === '33527').map((t) => [t.id, t.calls.length])).toEqual([['rodalies:5184M33527R4', 2], ['rodalies:5184M33527RL4', 15]]);
});

test("keeps the Trips of one Train number of two Networks apart, as R15's 30550, from Quinto to Barcelona Estació de França, and Zaragoza's C1, from Zaragoza Delicias to Miraflores, which each Network's timetable lists under its own, though they met at Quinto at 12:20 (#467)", async () => {
  // Rows cut verbatim from Renfe's Cercanías feed of 2026-10-10: R15's Trip 30550 and C1's, on Tuesday 13 October.
  const both = dirSource(fileURLToPath(new URL('fixtures/r15-zaragoza-c1', import.meta.url)));
  const zaragoza: Feed = { network: CERCANIAS_ZARAGOZA, ...CERCANIAS_ZARAGOZA.timetables[0] };
  const keeps = async (source: Source) => {
    const r15 = (await readFeed(source, '2026-10-13', RODALIES_FEED, () => {})).trips;
    const c1 = (await readFeed(source, '2026-10-13', zaragoza, () => {})).trips;
    return [r15, c1].map((trips) => trips.map((t) => [t.id, t.line, t.number, t.calls.length, t.joined]));
  };
  const apart = [[['rodalies:5184M30550R15', 'rodalies:R15', '30550', 24, undefined]], [['cercanias-zaragoza:7084M30550C1', 'cercanias-zaragoza:C1', '30550', 4, undefined]]];
  expect(await keeps(both)).toEqual(apart);
  // C1's last call at Quinto, not Miraflores, at the minute R15's first is.
  const meets = edited(both, (row) => (row.startsWith('7084M30550C1,11:57:00,11:57:00,71100') ? row.replace('11:57:00,11:57:00,71100', '12:20:00,12:20:00,71105') : row));
  expect(await keeps(meets)).toEqual(apart);
});

test("makes the same Trips of a day whatever order its timetable lists a Train's Trips that meet in, and logs the same joins (#467)", async () => {
  const backwards: Source = (file) => {
    const lines = rajadell(file);
    if (!['trips.txt', 'stop_times.txt'].includes(file) || !lines) return lines;
    return (async function* () {
      const all: string[] = [];
      for await (const l of lines) all.push(l);
      yield* [all[0] ?? '', ...all.slice(1).reverse()];
    })();
  };
  const read = async (source: Source) => {
    const log: string[] = [];
    const { trips, shapes } = await readFeed(source, '2026-10-13', RODALIES_FEED, (l) => log.push(l));
    return { trips: trips.toSorted((a, b) => a.id.localeCompare(b.id)), shapes: shapes.map((s) => [s.id, s.stations.toSorted()]).sort(), log: log.toSorted() };
  };
  const forwards = await read(rajadell);
  expect(forwards.log).toHaveLength(2);
  expect(await read(backwards)).toEqual(forwards);
});

test("finds the runs of a Train's Trips that meet, each in the order its Trips run, whatever order they're given in, and none for a Trip that meets no other (#467)", () => {
  const [a, b, c] = [part('a', ['A', '10:00'], ['B', '10:10']), part('b', ['B', '10:10'], ['C', '10:20']), part('c', ['C', '10:20'], ['D', '10:30'])];
  const ids = (runs: FeedTrip[][]) => runs.map((run) => run.map((t) => t.id));
  // Three Trips that each start where the one before ends make one run, and the Trip of another Station none.
  const other = part('x', ['X', '10:15'], ['Y', '10:25']);
  expect(ids(meeting([c, other, a, b]))).toEqual([['a', 'b', 'c']]);
  expect(ids(meeting([b, a, other]))).toEqual([['a', 'b']]);
  // A minute off, at the same Station, or the same minute at another, is no meeting.
  expect(meeting([a, part('late', ['B', '10:11'], ['C', '10:20'])])).toEqual([]);
  expect(meeting([a, part('else', ['E', '10:10'], ['C', '10:20'])])).toEqual([]);
  // Seconds into one minute are one: the Train arrives at 10:10:00 and the next Trip leaves at 10:10:30.
  const half = { ...b, calls: b.calls.map((call, i) => (i ? call : { ...call, arrival: at('10:10') + 30, departure: at('10:10') + 30 })) };
  expect(ids(meeting([a, half]))).toEqual([['a', 'b']]);
  // A Trip of one call, which starts and ends where it is, goes with the Trip that ends there in that minute, and after it.
  const stub = part('s', ['B', '10:10']);
  expect(ids(meeting([stub, a]))).toEqual([['a', 's']]);
  // Of two Trips that start where one ends, in the same minute, the one that ends first goes with it, and the other none.
  expect(ids(meeting([part('b2', ['B', '10:10'], ['C', '10:25']), a, b]))).toEqual([['a', 'b']]);
});

// Rows cut verbatim from Renfe's Cercanías feed of 2026-10-10: RT2's Train 15210 from Salou-Port
// Aventura to Tarragona on Tuesday 13 October, and 15211 back on Saturday 17 October, with their shapes.
const rt2 = dirSource(fileURLToPath(new URL('fixtures/rodalies-rt2', import.meta.url)));

test("lists the Train numbers of the day's Trips, with the Stations each calls at", async () => {
  expect((await readFeed(rt2, '2026-10-13', RODALIES_FEED)).listed).toEqual(new Map([['15210', new Set(['adif:65411', 'adif:71500'])]]));
  expect((await readFeed(rt2, '2026-10-17', RODALIES_FEED)).listed).toEqual(new Map([['15211', new Set(['adif:71500', 'adif:65411'])]]));
});

test("reads a Cercanías Trip's Train number from its trip_id though its feed gains trip_short_names, as Renfe's long-distance one has, with something else in them", async () => {
  const named: Source = (file) => {
    const lines = rt2(file);
    if (file !== 'trips.txt' || !lines) return lines;
    return (async function* () {
      let header = true;
      for await (const l of lines) {
        yield `${l.trimEnd()},${header ? 'trip_short_name' : 'RT2'}`;
        header = false;
      }
    })();
  };
  expect((await readFeed(named, '2026-10-13', RODALIES_FEED)).trips.map((t) => t.number)).toEqual(['15210']);
});

test("fails to read a timetable that loses its shapes.txt, though its Trips name no shapes either, unless it says it has none, as Renfe's long-distance one does, so that the Network is built from its copy", async () => {
  const shapeless: Source = (file) => {
    const lines = renfe(file);
    if (file === 'shapes.txt' || !lines) return undefined;
    if (file !== 'trips.txt') return lines;
    return (async function* () {
      let header = true;
      for await (const l of lines) {
        // Each Trip's shape_id, its last field, blank.
        yield header ? l : l.trimEnd().replace(/[^,]*$/, '');
        header = false;
      }
    })();
  };
  await expect(readFeed(shapeless, '2026-09-24', RODALIES_FEED)).rejects.toThrow('The feed has no shapes.txt');
});

test("leaves a Train that Rodalies or a núcleo lists too to their timetable, which has its shapes, by its Train number and a Station they share: RT2's 15210, a Regional in Renfe's long-distance one", async () => {
  const { trips } = await readFeed(longDistance, '2026-10-13', MD_FEED, () => {});
  expect(trips.map((t) => t.number)).toEqual(['15210', '17307', '18030', '38304']);
  const { listed } = await readFeed(rt2, '2026-10-13', RODALIES_FEED);
  expect(unlisted(trips, [listed]).map((t) => t.number)).toEqual(['17307', '18030', '38304']);
  // Another Train of that number, which calls at none of its Stations, isn't the same.
  expect(unlisted(trips, [new Map([['15210', new Set(['adif:71801'])]])])).toEqual(trips);
});

test("lists every day's Train numbers on a day it has none of its Trips, so that, as Renfe's Cercanías file of 10 Oct 2026 has none of Rodalies' from 22 October, the long-distance one's Trains on Rodalies' regional Lines still aren't long distance's", async () => {
  const { listed } = await readFeed(rt2, '2026-10-22', RODALIES_FEED);
  expect(listed).toEqual(
    new Map([
      ['15210', new Set(['adif:65411', 'adif:71500'])],
      ['15211', new Set(['adif:71500', 'adif:65411'])],
    ]),
  );
  const { trips } = await readFeed(longDistance, '2026-10-22', MD_FEED, () => {});
  expect(unlisted(trips, [listed]).map((t) => t.number)).toEqual(['17307', '18030', '38304']);
});

test("gives each long-distance Trip the rails its Line runs on, and a Regional whose route's ID ends VRFV, as the ex-FEVE regionals' do, metre gauge", async () => {
  const [standard, both, iberian] = [{ railway: ['rail'], gauges: ['1435'], orElse: ['1668'] }, { railway: ['rail'], gauges: ['1435', '1668'] }, { railway: ['rail'], gauges: ['1668'] }];
  const gauges = async (gtfs: Source, day: string, feed: Feed) => Object.fromEntries((await readFeed(gtfs, day, feed, () => {})).trips.map((t) => [`${t.line} ${t.number}`, t.gauges]));
  expect(await gauges(longDistance, '2026-10-10', AVE_FEED)).toEqual({
    'ave-larga-distancia:Alvia 00190': both,
    'ave-larga-distancia:Alvia 00622': both,
    'ave-larga-distancia:Euromed 01072': both,
    'ave-larga-distancia:Avlo 05095': standard,
  });
  // RT2's 15210, which this timetable files as a Regional, as if on a route of the ex-FEVE regionals'.
  const feve: Source = (file) => {
    const lines = longDistance(file);
    if (!lines || !['routes.txt', 'trips.txt'].includes(file)) return lines;
    return (async function* () {
      for await (const l of lines) yield l.replace('6541171500VRR', '6541171500VRFV');
    })();
  };
  expect(await gauges(feve, '2026-10-13', MD_FEED)).toEqual({
    'media-distancia-avant:Regional 15210': { railway: ['rail', 'narrow_gauge'], gauges: ['1000'] },
    'media-distancia-avant:Reg.Exp. 17307': iberian,
    'media-distancia-avant:MD 18030': iberian,
    'media-distancia-avant:Proximidad 38304': iberian,
  });
});

test('gives every long-distance Line the rails it runs on, so that none of its Trips goes untraced', () => {
  for (const { timetables, lines } of [AVE_LARGA_DISTANCIA, MEDIA_DISTANCIA_AVANT]) {
    for (const route of timetables[0].routes?.names ?? []) expect(lines.gauges?.[lines.names?.[route] ?? route], route).toBeDefined();
  }
});

// Rows cut verbatim from Renfe's long-distance feed of 2026-10-10, without the spaces it pads each line
// with: the first route of each of the 13 names its 660 routes are under.
const ROUTES = [
  '1700037606GL023,1071,ALVIA,,,2,,F2F5F5,',
  '1120013200GL026,1071,Intercity,,,2,,F2F5F5,',
  '2230894346GL026,1071,TRENCELTA,,,2,,F2F5F5,',
  '7180160911GL012,1071,EUROMED,,,2,,F2F5F5,',
  '5100360000AV006,1071,AVE,,,2,,F2F5F5,',
  '6000051003LC112,1071,AVLO,,,2,,F2F5F5,',
  '1060017000AV008,1071,AVANT,,,2,,F2F5F5,',
  '0822331412VRX,1071,MD,,,2,,F2F5F5,',
  '6000087089AV016,1071,AVE INT,,,2,,F2F5F5,',
  '1541010600VRR,1071,REGIONAL,,,2,,F2F5F5,',
  '2020015100VRE,1071,REG.EXP.,,,2,,F2F5F5,',
  '5050650413VRN,1071,PROXIMDAD,,,2,,F2F5F5,',
  '6540071801AV008,1071,AVANT EXP,,,2,,F2F5F5,',
];

/** A feed that has only these routes, under the header Renfe's long-distance one has. */
const routesOf = (...rows: string[]): Source => (file) =>
  file === 'routes.txt'
    ? (async function* () {
        yield 'route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_url,route_color,route_text_color';
        yield* rows;
      })()
    : undefined;

test("reports no route of Renfe's long-distance feed of 10 Oct 2026, whose 660 routes are under 13 names that AVE y Larga Distancia and Media Distancia y Avant take between them", async () => {
  expect(await untaken(routesOf(...ROUTES), () => {})).toEqual([]);
});

test('reports each route name neither Network takes once, with how many routes have it, compared as written: a new name, Intercity in capitals, and AVANT EXP with a full stop', async () => {
  const unknown = [
    '1700037606GL999,1071,IRYO,,,2,,F2F5F5,',
    '1120013200GL998,1071,INTERCITY,,,2,,F2F5F5,',
    '1700037606GL998,1071,IRYO,,,2,,F2F5F5,',
    '6540071801AV998,1071,AVANT EXP.,,,2,,F2F5F5,',
  ];
  const log: string[] = [];
  const found = await untaken(routesOf(...ROUTES, ...unknown), (l) => log.push(l));
  const ends = 'that neither AVE y Larga Distancia nor Media Distancia y Avant takes, so no Network has the Trips under that name';
  expect(found).toEqual([
    { kind: 'route', route: 'IRYO', text: [`"IRYO" names 2 routes of Renfe's long-distance timetable ${ends}`] },
    { kind: 'route', route: 'INTERCITY', text: [`"INTERCITY" names 1 route of Renfe's long-distance timetable ${ends}`] },
    { kind: 'route', route: 'AVANT EXP.', text: [`"AVANT EXP." names 1 route of Renfe's long-distance timetable ${ends}`] },
  ]);
  expect(log).toEqual(found.flatMap((f) => f.text));
});

test("puts a Station its timetable has away from its platforms at their middle, as Renfe has Antequera AV 430 m from them, beyond the 200 m a Station's rails may be, so that its Trips can be traced", async () => {
  // Rows cut from Renfe's long-distance feed of 2026-10-10: MD 13062 from Antequera AV, to its second call.
  const files: Record<string, string[]> = {
    'routes.txt': ['route_id,agency_id,route_short_name,route_long_name,route_desc,route_type,route_url,route_color,route_text_color', '0203055020VRX,1071,MD,,,2,,F2F5F5,'],
    'trips.txt': ['route_id,service_id,trip_id,trip_headsign,trip_short_name,direction_id,block_id,shape_id,wheelchair_accessible', '0203055020VRX,2026-10-092026-11-03130621,1306212026-10-09,,13062,,,,2'],
    'stop_times.txt': [
      'trip_id,arrival_time,departure_time,stop_id,stop_sequence,stop_headsign,pickup_type,drop_off_type,shape_dist_traveled',
      '1306212026-10-09,9:55:00,9:55:00,02030,01,,0,1,',
      '1306212026-10-09,10:14:00,10:15:00,02003,02,,0,0,',
    ],
    'stops.txt': [
      'stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon,zone_id,stop_url,location_type,parent_station,stop_timezone,wheelchair_boarding',
      '02030,,Antequera AV,,37.0334437,-4.5612901,,,,,Europe/Madrid,1',
      '02003,,Antequera-Santa Ana,,37.0698810,-4.7190140,,,,,Europe/Madrid,1',
    ],
    'calendar.txt': ['service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date', '2026-10-092026-11-03130621,1,1,1,1,1,1,1,20261009,20261103'],
  };
  const antequera: Source = (file) => {
    const lines = files[file];
    return lines && (async function* () {
      yield* lines;
    })();
  };
  expect((await readFeed(antequera, '2026-10-10', MD_FEED)).stations).toEqual([
    { id: 'adif:02030', name: 'Antequera AV', lon: -4.56158, lat: 37.02951 },
    { id: 'adif:02003', name: 'Antequera-Santa Ana', lon: -4.719014, lat: 37.069881 },
  ]);
});

// Rows cut verbatim from Renfe's Cercanías feed of 2026-10-10: C2's first Trip of Saturday 10 October
// from Oviedo to El Entrego, at the four Stations it ends at, and its shape's points within 4 km of
// the middle of Ciaño and El Entrego. And, as the build kept them on 9 October, the rails there:
// `npm run snippet -- "kept cercanias-asturias:C2 adif:16010 adif:16011 nopath" langreo 4`.
const asturias = dirSource(fileURLToPath(new URL('fixtures/cercanias-asturias', import.meta.url)));
const { rails: langreo } = JSON.parse(readFileSync(new URL('fixtures/osm/langreo.json', import.meta.url), 'utf8')) as Snippet;

/** The Trip, read from Renfe's rows for a Network as it's configured, traced along the rails and placed. */
async function c2Trip(network: NetworkConfig) {
  const { stations, shapes, trips } = await readFeed(asturias, '2026-10-10', { network, ...network.timetables[0] });
  const left: string[] = [];
  const traced = traceShapes(shapes, stations, ownRails(langreo, network), network.runningSide, () => {});
  const placed = placeTrips(trips, traced, stations, () => network.profile.topSpeed, (l) => left.push(l));
  return { stations, placed, left };
}

test("places C2's Trip to El Entrego where Cercanías Asturias's config has Sama and El Entrego, on Adif's line, rather than where Renfe's timetable has them, beside FEVE's Langreo line 0.8 and 0.4 km off, which left the Trip out", async () => {
  const published = await c2Trip({ ...CERCANIAS_ASTURIAS, stations: undefined });
  expect(published.placed).toEqual([]);
  expect(published.left).toEqual(['cercanias-asturias:2081S22200C2 is left out: Sama is 0.3 km off its track']);

  const configured = await c2Trip(CERCANIAS_ASTURIAS);
  expect(configured.placed.map((t) => t.id)).toEqual(['cercanias-asturias:2081S22200C2']);
  expect(configured.left).toEqual([]);
  // It moves those two Stations, of the four the Trip calls at, and no other.
  const moved = configured.stations.filter((s, i) => s.lon !== published.stations[i]?.lon || s.lat !== published.stations[i]?.lat);
  expect(moved.map((s) => s.id)).toEqual(['adif:16009', 'adif:16011']);
});

// Rows cut verbatim from Renfe's Cercanías feed of 2026-10-10: C1's Trip 6281S26906C1 of Saturday 10 October
// from Santander to Renedo, at its Stations from Muriedas-Bahía to Boo, and its shape's points within 2 km of
// Maliaño. And, as the build had them on 9 October, the rails there:
// `npm run snippet -- 43.4161415,-3.8410762 maliano 2`.
const santander = dirSource(fileURLToPath(new URL('fixtures/cercanias-santander', import.meta.url)));
const { rails: maliano } = JSON.parse(readFileSync(new URL('fixtures/osm/maliano.json', import.meta.url), 'utf8')) as Snippet;

/** The Trip, read from Renfe's rows for a Network as it's configured, traced along the rails and placed, and how far from its trace Maliaño is, in metres. */
async function c1Trip(network: NetworkConfig) {
  const { stations, shapes, trips } = await readFeed(santander, '2026-10-10', { network, ...network.timetables[0] });
  const left: string[] = [];
  const traced = traceShapes(shapes, stations, ownRails(maliano, network), network.runningSide, () => {});
  const placed = placeTrips(trips, traced, stations, () => network.profile.topSpeed, (l) => left.push(l));
  const maliaño = stations.find((s) => s.id === 'adif:14220');
  const trace = traced.find((s) => s.id === placed[0]?.shape);
  const off = maliaño && trace ? nearest(trace.coords, [maliaño.lon, maliaño.lat]).metres : NaN;
  return { stations, traced, placed, left, off };
}

test("puts Maliaño on Adif's track, where C1 runs, with Cercanías Santander's config having it at OpenStreetMap's stop for it, 0.16 km from where Renfe's timetable has it, on FEVE's line 65 m from Adif's (#494)", async () => {
  const published = await c1Trip({ ...CERCANIAS_SANTANDER, stations: undefined });
  expect(published.placed.map((t) => t.id)).toEqual(['cercanias-santander:6281S26906C1']);
  expect(published.left).toEqual([]);
  // 65.47 m to Adif's way: a figure the rails' simplification could take past 65.5, so a range.
  expect(published.off).toBeGreaterThan(60);
  expect(published.off).toBeLessThan(70);

  const configured = await c1Trip(CERCANIAS_SANTANDER);
  expect(configured.placed.map((t) => t.id)).toEqual(['cercanias-santander:6281S26906C1']);
  expect(configured.left).toEqual([]);
  expect(configured.off).toBeLessThan(1);
  // It moves Maliaño, of the three Stations the Trip calls at, and no other, and C1's trace is the line it was: its
  // vertices are each on the other's, but for the one Renfe's point made on it, 18 mm from the line.
  const moved = configured.stations.filter((s, i) => s.lon !== published.stations[i]?.lon || s.lat !== published.stations[i]?.lat);
  expect(moved.map((s) => s.id)).toEqual(['adif:14220']);
  const apart = (a: Point[], b: Point[]) => Math.max(...a.map((p) => nearest(b, p).metres));
  expect(published.traced.map((s) => s.id)).toEqual(['cercanias-santander:62_C1:back']);
  for (const [i, shape] of published.traced.entries()) {
    const other = configured.traced[i]?.coords ?? [];
    expect([apart(shape.coords, other), apart(other, shape.coords)].every((m) => m < 0.1)).toBe(true);
  }
});

test("gives each shape of a Network of two gauges the rails its Line runs on, as Cercanías Asturias' C2 runs on Adif's Iberian gauge, to be traced on those alone, and its Trips none, as they're placed on their shapes (#366)", async () => {
  const { shapes, trips } = await readFeed(asturias, '2026-10-10', { network: CERCANIAS_ASTURIAS, ...CERCANIAS_ASTURIAS.timetables[0] });
  expect(shapes.map((s) => [s.id, s.gauges])).toEqual([['cercanias-asturias:20_C2:back', { railway: ['rail'], gauges: ['1668'] }]]);
  expect(trips.map((t) => [t.id, t.gauges])).toEqual([['cercanias-asturias:2081S22200C2', undefined]]);
});

// Rows cut verbatim from Renfe's Cercanías feed of 2026-10-10: C4's first Trips of Saturday 10 October,
// 71500 from Bilbao la Concordia to La Calzada and 71503 back, and the train Renfe files under C4 too,
// FEVE's from Bilbao la Concordia to León's La Asunción Universidad, 71876, and 71891 back, which call at
// 43 Stations of the La Robla line that no other Trip of núcleo 60 does, with C4's shape both ways.
const bilbao = dirSource(fileURLToPath(new URL('fixtures/cercanias-bilbao', import.meta.url)));

/** Cercanías Bilbao's timetable of that day, read for a Network as it's configured. */
const readBilbao = (network: NetworkConfig, log: (line: string) => void = () => {}) => readFeed(bilbao, '2026-10-10', { network, ...network.timetables[0] }, log);

test("leaves out the Trips that call at a Station beyond the Network, as Renfe files FEVE's Bilbao–León train under Cercanías Bilbao's C4, with the Stations only they call at, so that its shape's Stations end at La Calzada (#368)", async () => {
  const published = await readBilbao({ ...CERCANIAS_BILBAO, beyond: undefined });
  expect(published.trips.map((t) => t.number)).toEqual(['71500', '71876', '71503', '71891']);
  expect(published.stations).toHaveLength(21 + 43);

  const configured = await readBilbao(CERCANIAS_BILBAO);
  expect(configured.trips.map((t) => t.number)).toEqual(['71500', '71503']);
  expect(configured.stations.map((s) => s.name)).toContain('Balmaseda');
  expect(configured.stations.map((s) => s.name)).toContain('La Calzada');
  expect(configured.stations).toHaveLength(21);
  // The 43 are none of its shapes' Stations, which is what its trace runs through, and its Line's shapes are as they were.
  expect(configured.shapes.map((s) => [s.id, s.stations.length])).toEqual([['cercanias-bilbao:60_C4:back', 21], ['cercanias-bilbao:60_C4_INV:back', 21]]);
  expect(published.shapes.map((s) => [s.id, s.stations.length])).toEqual([['cercanias-bilbao:60_C4:back', 64], ['cercanias-bilbao:60_C4_INV:back', 64]]);
  expect(configured.lines.map((l) => [l.name, l.shapes])).toEqual(published.lines.map((l) => [l.name, l.shapes]));
});

test("lists no Train number of a Trip it leaves out as the Network's, so that Renfe's long-distance timetable, which lists 71876 and 71891 as Regionals, doesn't leave them to the Network", async () => {
  const { listed } = await readBilbao(CERCANIAS_BILBAO);
  expect([...listed.keys()]).toEqual(['71500', '71503']);
  const long = [{ id: 'media-distancia-avant:0545105778VRFV', line: 'media-distancia-avant:Regional', shape: '', headsign: '', number: '71876', calls: [{ station: 'adif:05451', arrival: 0, departure: 0 }, { station: 'adif:05803', arrival: 1, departure: 1 }] }];
  expect(unlisted(long, [listed])).toEqual(long);
  expect(unlisted(long, [(await readBilbao({ ...CERCANIAS_BILBAO, beyond: undefined })).listed])).toEqual([]);
});

test("logs and gives back each Trip it leaves out, with the Station beyond it calls at", async () => {
  const log: string[] = [];
  const { left } = await readBilbao(CERCANIAS_BILBAO, (l) => log.push(l));
  expect(left).toEqual([
    'cercanias-bilbao:6081S71876C4 is left out: it calls at Arla Berrón, a Station beyond Cercanías Bilbao',
    'cercanias-bilbao:6081S71891C4 is left out: it calls at Arla Berrón, a Station beyond Cercanías Bilbao',
  ]);
  expect(log).toEqual(left);
  // Not the Trips of a day it doesn't run on.
  expect((await readFeed(bilbao, '2026-10-11', { network: CERCANIAS_BILBAO, ...CERCANIAS_BILBAO.timetables[0] }, () => {})).left).toEqual([]);
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
