import { expect, test } from 'vitest';
import { APART, atZoom, BANDS, beside, daysNeeded, daysOf, DEGREE, joinTrips, joinTracks, onStroke, pixelMetres, smoothId, type DayTrips, type Manifest, type ManifestDay, type Network, type Shape, type Slot, type Station, type Track, type Trip } from './bundle.ts';

test('finds the point a distance along a line, moved to its right, or its left where negative', () => {
  // 1 km east along the equator, where a degree is DEGREE metres both ways.
  const east: Shape = { id: 'east', coords: [[0, 0], [1000 / DEGREE, 0]], dist: [0, 1000] };
  const metres = ([lon, lat]: [number, number]) => [lon * DEGREE, lat * DEGREE].map((m) => Math.round(m * 100) / 100);
  expect(metres(beside(east, 400, 5))).toEqual([400, -5]);
  expect(metres(beside(east, 400, -5))).toEqual([400, 5]);
  // At either end, it looks along the line's first or last metres.
  expect(metres(beside(east, 0, 5))).toEqual([0, -5]);
  expect(metres(beside(east, 1000, 5))).toEqual([1000, -5]);
});

test("zoomed out, a Train goes on its Line's stroke: along the centreline it follows in the zoom's band, at its side, and half a line width to the side its Trains keep to", () => {
  // Its own track runs 1 km east along the equator, 30 m south of a centreline running back west.
  const own: Shape = { id: 'own', coords: [[0, -30 / DEGREE], [1000 / DEGREE, -30 / DEGREE]], dist: [0, 1000] };
  const west: Shape = { id: 'stretch:0', coords: [[1000 / DEGREE, 0], [0, 0]], dist: [0, 1000] };
  // Smoothed for zoom 12's band, 5 m further north.
  const smoothed: Shape = { id: smoothId('stretch:0', BANDS.indexOf(12)), coords: [[1000 / DEGREE, 5 / DEGREE], [0, 5 / DEGREE]], dist: [0, 1000] };
  const shapes = new Map([own, west, smoothed].map((s) => [s.id, s]));
  const slots: Slot[] = [{ line: 'R1', shape: 'own', from: 0, to: 1000, side: 1, on: 'stretch:0', at: [1000, 0] }];
  const metres = (p: [number, number] | undefined) => p && [p[0] * DEGREE, p[1] * DEGREE].map((m) => Math.round(m * 10) / 10);
  // At zoom 11, on the centreline as it is, a line width north, its right as it runs west, and half one
  // back south, the right of a Train running east.
  const width = (zoom: number) => atZoom(APART, zoom) * pixelMetres(zoom, 0);
  expect(metres(onStroke(slots, shapes, 400, 11, 1))).toEqual([400, Math.round((width(11) * (1 - 0.5)) * 10) / 10]);
  // At zoom 12, on the one smoothed for its band, keeping left.
  expect(metres(onStroke(slots, shapes, 400, 12, -1))).toEqual([400, Math.round((5 + width(12) * (1 + 0.5)) * 10) / 10]);
  // Where its Line has no slot, nowhere.
  expect(onStroke(slots, shapes, 1200, 12, 1)).toBeUndefined();
  expect(onStroke(undefined, shapes, 400, 12, 1)).toBeUndefined();
  // Below zoom 10, on its slot on the band's own graph, here along its own track, and no other's.
  const own9: Slot = { line: 'R1', shape: 'own', from: 0, to: 1000, side: 0, on: 'own', at: [0, 1000], band: BANDS.indexOf(9) };
  expect(metres(onStroke([...slots, own9], shapes, 400, 9, 1))).toEqual([400, Math.round((-30 - width(9) * 0.5) * 10) / 10]);
  expect(onStroke(slots, shapes, 400, 9, 1)).toBeUndefined();
  expect(metres(onStroke([own9, ...slots], shapes, 400, 11, 1))).toEqual(metres(onStroke(slots, shapes, 400, 11, 1)));
});

// Made up: Friday's first Train comes onto the map at 05:00 and its last leaves it at 00:40, Saturday's
// first at 00:05 and its last at 23:30, and Sunday's first at 06:00.
/** A moment in Spain's summer time, as `2026-09-26T12:00`, in ms since 1970. */
const madrid = (moment: string) => Date.parse(`${moment}+02:00`);
/** A manifest day whose first Train comes onto the map at `from` and whose last leaves it at `to`. */
const day = (date: string, from: string, to: string): ManifestDay => ({ date, track: `${date}.track`, trips: `${date}.trips`, from: madrid(from), to: madrid(to) });
const WEEKEND = [
  day('2026-09-25', '2026-09-25T05:00', '2026-09-26T00:40'),
  day('2026-09-26', '2026-09-26T00:05', '2026-09-26T23:30'),
  day('2026-09-27', '2026-09-27T06:00', '2026-09-28T00:10'),
];
/** The dates the map needs at a moment, fetching an hour early and keeping an hour late, with a board left empty on `emptyBoard`. */
const needed = (moment: string, emptyBoard?: string) => daysNeeded(WEEKEND, madrid(moment), { early: 60 * 60_000, late: 60 * 60_000, emptyBoard })?.days.map((d) => d.date);

test('in the daytime the map needs only today', () => {
  expect(needed('2026-09-26T12:00')).toEqual(['2026-09-26']);
  expect(needed('2026-09-26T03:00')).toEqual(['2026-09-26']);
});

test("the map needs the next day from `early` before its first Train, and the day before until `late` after its last", () => {
  expect(needed('2026-09-25T23:04')).toEqual(['2026-09-25']);
  expect(needed('2026-09-25T23:05')).toEqual(['2026-09-25', '2026-09-26']);
  expect(needed('2026-09-26T01:40')).toEqual(['2026-09-25', '2026-09-26']);
  expect(needed('2026-09-26T01:41')).toEqual(['2026-09-26']);
});

test("the map needs the next day once today's last Train has left the map", () => {
  expect(needed('2026-09-26T23:29')).toEqual(['2026-09-26']);
  expect(needed('2026-09-26T23:30')).toEqual(['2026-09-26', '2026-09-27']);
});

test('the map needs the next day while a Station board has had no departures left today', () => {
  expect(needed('2026-09-26T21:00', '2026-09-26')).toEqual(['2026-09-26', '2026-09-27']);
  // One left empty the day before counts for nothing.
  expect(needed('2026-09-26T21:00', '2026-09-25')).toEqual(['2026-09-26']);
});

test("where the manifest is out of date, its last day stands for today, with no next day", () => {
  expect(needed('2026-09-29T12:00', '2026-09-27')).toEqual(['2026-09-27']);
});

/** A region's entry for a service day, with the files it names for it. */
const entry = (region: string, date: string, from: string, to: string, noTrips?: string[]): ManifestDay => ({
  ...day(date, from, to),
  track: `${region}.track`,
  trips: `${region}.${date}.trips`,
  ...(noTrips && { noTrips }),
});

test("joins each service day's entries of the regions as one: its first Train coming onto the map from any of them and its last leaving it, the Networks with none, and each region's files", () => {
  const manifest: Manifest = {
    regions: [
      { id: 'catalonia', days: [entry('catalonia', '2026-09-26', '2026-09-26T05:00', '2026-09-27T00:40', ['tram']), entry('catalonia', '2026-09-27', '2026-09-27T06:00', '2026-09-28T00:10')] },
      { id: 'cercanias-madrid', days: [entry('cercanias-madrid', '2026-09-26', '2026-09-26T04:30', '2026-09-26T23:30', ['cercanias-madrid']), entry('cercanias-madrid', '2026-09-25', '2026-09-25T04:30', '2026-09-26T00:10')] },
    ],
  };
  expect(daysOf(manifest)).toEqual([
    { date: '2026-09-25', from: madrid('2026-09-25T04:30'), to: madrid('2026-09-26T00:10'), regions: [{ id: 'cercanias-madrid', track: 'cercanias-madrid.track', trips: 'cercanias-madrid.2026-09-25.trips' }] },
    {
      date: '2026-09-26',
      from: madrid('2026-09-26T04:30'),
      to: madrid('2026-09-27T00:40'),
      noTrips: ['tram', 'cercanias-madrid'],
      regions: [
        { id: 'catalonia', track: 'catalonia.track', trips: 'catalonia.2026-09-26.trips' },
        { id: 'cercanias-madrid', track: 'cercanias-madrid.track', trips: 'cercanias-madrid.2026-09-26.trips' },
      ],
    },
    { date: '2026-09-27', from: madrid('2026-09-27T06:00'), to: madrid('2026-09-28T00:10'), regions: [{ id: 'catalonia', track: 'catalonia.track', trips: 'catalonia.2026-09-27.trips' }] },
  ]);
});

test('times a service day by the regions with Trains that day, one with none having no times, which the manifest holds as null', () => {
  // A region with no Trips that day: Infinity and -Infinity, which JSON has as null.
  const none = { ...entry('cercanias-cadiz', '2026-09-26', '2026-09-26T05:00', '2026-09-26T23:00'), from: Infinity, to: -Infinity };
  const manifest = JSON.parse(JSON.stringify({ regions: [{ id: 'cercanias-cadiz', days: [none] }, { id: 'catalonia', days: [entry('catalonia', '2026-09-26', '2026-09-26T05:00', '2026-09-27T00:40')] }] })) as Manifest;
  expect(daysOf(manifest)[0]).toMatchObject({ from: madrid('2026-09-26T05:00'), to: madrid('2026-09-27T00:40') });
  // A day none of them has Trains on is never wanted for its Trains, as before.
  const empty = JSON.parse(JSON.stringify({ regions: [{ id: 'cercanias-cadiz', days: [none] }] })) as Manifest;
  const [only] = daysOf(empty);
  expect(only?.from).toBe(Infinity);
  expect(only?.to).toBe(-Infinity);
});

test("the map needs the days of every region as it needs one region's", () => {
  const manifest: Manifest = {
    regions: [
      { id: 'catalonia', days: [entry('catalonia', '2026-09-26', '2026-09-26T05:00', '2026-09-26T23:30'), entry('catalonia', '2026-09-27', '2026-09-27T06:00', '2026-09-28T00:10')] },
      // Madrid's last Train leaves later.
      { id: 'cercanias-madrid', days: [entry('cercanias-madrid', '2026-09-26', '2026-09-26T05:30', '2026-09-27T00:10'), entry('cercanias-madrid', '2026-09-27', '2026-09-27T05:30', '2026-09-27T23:00')] },
    ],
  };
  const needs = (moment: string) => daysNeeded(daysOf(manifest), madrid(moment), { early: 60 * 60_000, late: 60 * 60_000 })?.days.map((d) => d.date);
  expect(needs('2026-09-26T23:45')).toEqual(['2026-09-26']);
  expect(needs('2026-09-27T00:11')).toEqual(['2026-09-26', '2026-09-27']);
});

/** A region's track of one Network, one Line, one Station that Line calls at, and one stroke, rail, slot and Network track, all named for it. */
const regional = (id: string, stations: Station[] = [{ id: `adif:${id}`, name: id, lon: 2, lat: 41 }]): Track => {
  const network: Network = { id, name: id, profile: { acceleration: 1, braking: 1, topSpeed: 40, dwell: 30 }, runningSide: 'right', colour: '#000', pillZoom: 10, credit: { text: id, url: '' } };
  const [line, shape] = [`${id}:C1`, `${id}:shape`];
  return {
    networks: [network],
    lines: [{ id: line, network: id, name: 'C1', colour: '#000', shapes: [shape], kind: 'commuter' }],
    stations,
    shapes: [{ id: shape, coords: [[2, 41], [2.1, 41]], dist: [0, 1000] }, { id: `stretch:${id}:0`, coords: [[2, 41], [2.1, 41]], dist: [0, 1000] }],
    strokes: [{ line, shape: `stretch:${id}:0`, from: 0, to: 1000, side: 0 }],
    rails: [{ line, shape, from: 0, to: 1000, side: 0 }],
    slots: [{ line, shape, from: 0, to: 1000, side: 0, on: `stretch:${id}:0`, at: [0, 1000] }],
    tracks: [{ line, shape, from: 0, to: 1000, side: 0 }],
  };
};

test("joins the regions' tracks as one: each region's Networks, Lines, shapes, strokes, rails, slots and Network tracks in turn", () => {
  const joined = joinTracks([regional('catalonia'), regional('cercanias-madrid'), regional('cercanias-leon')]);
  expect(joined.networks.map((n) => n.id)).toEqual(['catalonia', 'cercanias-madrid', 'cercanias-leon']);
  expect(joined.lines.map((l) => l.id)).toEqual(['catalonia:C1', 'cercanias-madrid:C1', 'cercanias-leon:C1']);
  expect(joined.shapes.map((s) => s.id)).toEqual(['catalonia:shape', 'stretch:catalonia:0', 'cercanias-madrid:shape', 'stretch:cercanias-madrid:0', 'cercanias-leon:shape', 'stretch:cercanias-leon:0']);
  for (const each of ['strokes', 'rails', 'slots', 'tracks'] as const) expect(joined[each].map((s) => s.line)).toEqual(['catalonia:C1', 'cercanias-madrid:C1', 'cercanias-leon:C1']);
});

test("joins the regions' tracks with a Station that two of them have once, as the first has it, naming the Networks of both", () => {
  const sharedByLeon: Station = { id: 'adif:15210', name: 'León', lon: -5.57, lat: 42.6, networks: ['cercanias-leon'] };
  const sharedByBilbao: Station = { id: 'adif:15210', name: 'León FEVE', lon: -5.571, lat: 42.601, networks: ['cercanias-bilbao'] };
  const joined = joinTracks([regional('cercanias-leon', [sharedByLeon]), regional('cercanias-bilbao', [sharedByBilbao, { id: 'adif:13100', name: 'Bilbao', lon: -2.9, lat: 43.2, networks: ['cercanias-bilbao'] }])]);
  expect(joined.stations).toEqual([{ ...sharedByLeon, networks: ['cercanias-leon', 'cercanias-bilbao'] }, { id: 'adif:13100', name: 'Bilbao', lon: -2.9, lat: 43.2, networks: ['cercanias-bilbao'] }]);
  // The files the map loaded are left as they were.
  expect(sharedByLeon.networks).toEqual(['cercanias-leon']);
});

test("joins the regions' Trips of a day, and their Closures where they have any", () => {
  const trip = (id: string, line: string): Trip => ({ id, line, shape: 's', headsign: '', calls: [] });
  const day = (trips: Trip[], closures?: DayTrips['closures']): DayTrips => ({ serviceDay: '2026-10-10', noonMinus12h: madrid('2026-10-10T00:00'), trips, ...(closures && { closures }) });
  const closure = { line: 'rodalies:R3', stations: ['adif:1', 'adif:2'] as [string, string], from: 100, to: 200, kind: 'buses' as const };
  const joined = joinTrips([day([trip('a', 'rodalies:R1')], [closure]), day([trip('b', 'cercanias-madrid:C1')]), day([trip('c', 'cercanias-leon:C1')])]);
  expect(joined.trips.map((t) => t.id)).toEqual(['a', 'b', 'c']);
  expect(joined.closures).toEqual([closure]);
  expect([joined.serviceDay, joined.noonMinus12h]).toEqual(['2026-10-10', madrid('2026-10-10T00:00')]);
  // No Closures anywhere, none in it, as a day's own has none.
  expect('closures' in joinTrips([day([]), day([])])).toBe(false);
});

test("names no day for a manifest of an older shape, whose days hold every Network in one file, which this map can't read", () => {
  const older = { days: [{ date: '2026-10-09', track: 'days/track-a.json', trips: 'days/2026-10-09-b.json', from: 0, to: 1 }] } as unknown as Manifest;
  expect(daysOf(older)).toEqual([]);
});
