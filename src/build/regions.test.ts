import { expect, test } from 'vitest';
import { STRETCH, type Network, type Shape, type Station, type Track, type Trip } from '../bundle.ts';
import { noonMinus12h } from './gtfs.ts';
import { manifestOf } from './manifest.ts';
import { buildRegion, buildRegions, sharedStretches, type BuiltNetwork } from './regions.ts';
import { collect, diff, type Found, type Spot } from './report.ts';

// Track drawn in metres east (x) and north (y) of a point in Barcelona, as sideBySide.test.ts has it.
const [LON, LAT] = [2.17, 41.39];
const M = (6_371_008.8 * Math.PI) / 180;
const COS = Math.cos((LAT * Math.PI) / 180);
const at = (x: number, y: number): [number, number] => [Math.round((LON + x / (M * COS)) * 1e5) / 1e5, Math.round((LAT + y / M) * 1e5) / 1e5];
/** A shape from one point to another, in metres, with a point every 100 m. */
function shape(id: string, [x0, y0]: [number, number], [x1, y1]: [number, number]): Shape {
  const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 100);
  const points = Array.from({ length: n + 1 }, (_, i) => at(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n));
  return { id, coords: points, dist: points.map((_, i) => Math.round((Math.hypot(x1 - x0, y1 - y0) * i) / n)) };
}

const PROFILE = { acceleration: 1, braking: 1, topSpeed: 44, dwell: 30 };

/**
 * A Network of one Line along one shape from x metres to another, with Trips on each of the days that
 * leave at the minutes given, and one Station at each end.
 */
function network(id: string, [from, to]: [number, number], y: number, leaves: number[][]): BuiltNetwork {
  const stations: Station[] = [
    { id: `adif:${id}-1`, name: `${id} 1`, lon: at(from, y)[0], lat: at(from, y)[1] },
    { id: `adif:${id}-2`, name: `${id} 2`, lon: at(to, y)[0], lat: at(to, y)[1] },
  ];
  const line = `${id}:C1`;
  const trip = (day: number, minute: number): Trip => ({
    id: `${id}:${day}.${minute}`,
    line,
    shape: `${id}:shape`,
    headsign: '',
    calls: [
      { station: stations[0]?.id ?? '', arrival: minute * 60, departure: minute * 60, dist: 0 },
      { station: stations[1]?.id ?? '', arrival: minute * 60 + 600, departure: minute * 60 + 600, dist: to - from },
    ],
  });
  const net: Network = { id, name: id, profile: PROFILE, runningSide: 'right', colour: '#000', pillZoom: 10, credit: { text: id, url: '' } };
  return {
    network: net,
    lines: [{ id: line, network: id, name: 'C1', colour: `#${id.length}00`, shapes: [`${id}:shape`], kind: 'commuter' }],
    stations,
    shapes: [shape(`${id}:shape`, [from, y], [to, y])],
    trips: leaves.map((day, d) => day.map((minute) => trip(d, minute))),
    closures: leaves.map(() => []),
  };
}

const DATES = ['2026-10-10', '2026-10-11', '2026-10-12'];

/** What a build of a region gets: each Network from the table, the files it writes noted, in the order, by name. */
function deps(table: Record<string, BuiltNetwork | Error>, files: { prefix: string; content: object }[] = []) {
  const [log, found]: [string[], Found[]] = [[], []];
  return {
    files,
    log,
    found,
    deps: {
      dates: DATES,
      network: async ({ id }: { id: string }) => {
        const built = table[id];
        if (!built) throw new Error(`${id} isn't in the table`);
        if (built instanceof Error) throw built;
        return built;
      },
      write: async (prefix: string, content: object) => {
        files.push({ prefix, content });
        return `${prefix}-0123456789ab.json`;
      },
      log: (line: string) => log.push(line),
      report: (f: Found) => found.push(f),
    },
  };
}

test("builds a region's Networks into one track file and a Trips file for each day, named for the region, and the manifest's days for them", async () => {
  const table = {
    rodalies: network('rodalies', [0, 5000], 0, [[300, 360], [300], [300]]),
    // On Rodalies' track for 2 km, as FGC's Lines are with Rodalies' in Catalonia.
    fgc: network('fgc', [1000, 3000], 0, [[320], [320], [320]]),
  };
  const { deps: d, files } = deps(table);
  const built = await buildRegion({ id: 'catalonia', networks: [{ id: 'rodalies' }, { id: 'fgc' }] }, d);
  expect(files.map((f) => f.prefix)).toEqual(['days/track-catalonia', ...DATES.map((day) => `days/${day}-catalonia`)]);
  // One track with both Networks' Lines, Stations and shapes, and Stretches with the region's IDs, drawn side by side where they share.
  const track = files[0]?.content as Track;
  expect(track.networks.map((n) => n.id)).toEqual(['rodalies', 'fgc']);
  expect(track.lines.map((l) => l.id)).toEqual(['rodalies:C1', 'fgc:C1']);
  expect(track.stations.map((s) => [s.id, s.networks])).toEqual([['adif:rodalies-1', ['rodalies']], ['adif:rodalies-2', ['rodalies']], ['adif:fgc-1', ['fgc']], ['adif:fgc-2', ['fgc']]]);
  expect(track.shapes.filter((s) => !s.id.startsWith(STRETCH)).map((s) => s.id)).toEqual(['rodalies:shape', 'fgc:shape']);
  expect(track.shapes.some((s) => s.id.startsWith(`${STRETCH}catalonia:`))).toBe(true);
  expect(track.shapes.filter((s) => s.id.startsWith(STRETCH)).every((s) => s.id.startsWith(`${STRETCH}catalonia:`) || s.id.startsWith(`${STRETCH}linkcatalonia:`))).toBe(true);
  // Where FGC's Line runs on Rodalies' track, the two are drawn side by side along one Stretch.
  const drawn = track.strokes.filter((st) => st.band === undefined && st.line === 'fgc:C1' && !st.shape.startsWith(`${STRETCH}link`));
  expect(drawn).toHaveLength(1);
  const [fgc] = drawn;
  const beside = track.strokes.filter((st) => st.band === undefined && st.line === 'rodalies:C1' && st.shape === fgc?.shape && st.from < (fgc?.to ?? 0) && st.to > (fgc?.from ?? 0));
  expect(beside).toHaveLength(1);
  expect(Math.abs((beside[0]?.side ?? NaN) - (fgc?.side ?? NaN))).toBe(1);
  // Each day's Trips file holds both Networks' Trips of that day, and the manifest names it with the one track.
  const day0 = files[1]?.content as { trips: Trip[]; serviceDay: string; noonMinus12h: number };
  expect([day0.serviceDay, day0.noonMinus12h]).toEqual(['2026-10-10', noonMinus12h('2026-10-10')]);
  expect(day0.trips.map((t) => t.id)).toEqual(['rodalies:0.300', 'rodalies:0.360', 'fgc:0.320']);
  expect(built.days.map(({ date, track: t, trips }) => [date, t, trips])).toEqual(
    DATES.map((day) => [day, 'days/track-catalonia-0123456789ab.json', `days/${day}-catalonia-0123456789ab.json`]),
  );
  // The first Train comes onto the map at its first Station at 05:00 less the dwell, and the last leaves at 06:10 plus it: 30 s.
  expect(built.days[0]).toMatchObject({ from: noonMinus12h('2026-10-10') + (300 * 60 - 30) * 1000, to: noonMinus12h('2026-10-10') + (360 * 60 + 600 + 30) * 1000 });
  expect(built.track).toBe(track);
});

test("builds a region whose Networks have no Trips today as the others, its track and an empty day, and names them, rather than failing it", async () => {
  const table = { 'cercanias-cadiz': network('cercanias-cadiz', [0, 3000], 0, [[], [300], [300]]) };
  const { deps: d, log, found } = deps(table);
  const built = await buildRegion({ id: 'cercanias-cadiz', networks: [{ id: 'cercanias-cadiz' }] }, d);
  expect(built.days.map((day) => day.date)).toEqual(DATES);
  expect(built.days[0]?.noTrips).toEqual(['cercanias-cadiz']);
  expect(built.days[1]?.noTrips).toBeUndefined();
  expect(log).toContain("cercanias-cadiz's timetable has no Trips on 2026-10-10");
  expect(found.find((f) => f.kind === 'notrips')).toMatchObject({ network: 'cercanias-cadiz', day: 0 });
});

test("builds each region one after another, and leaves out one whose build fails, as it logs and reports, so that the others are built", async () => {
  const [events, log, found]: [string[], string[], Found[]] = [[], [], []];
  const regions = ['catalonia', 'cercanias-madrid', 'cercanias-leon'].map((id) => ({ id, networks: [{ id }] }));
  const result = await buildRegions(
    regions,
    async ({ id }) => {
      events.push(`start ${id}`);
      await new Promise((done) => setTimeout(done, 5));
      if (id === 'cercanias-madrid') throw new Error("Cercanías Madrid has no copy of its timetables to build it from: Couldn't read stop_times.txt\nunzip: end of central directory not found");
      events.push(`end ${id}`);
      return { days: [], id };
    },
    { log: (line) => log.push(line), report: { add: (f) => found.push(f), carry: () => {} }, last: [] },
  );
  expect(events).toEqual(['start catalonia', 'end catalonia', 'start cercanias-madrid', 'start cercanias-leon', 'end cercanias-leon']);
  expect(result).toEqual([{ id: 'catalonia', built: { days: [], id: 'catalonia' } }, { id: 'cercanias-madrid' }, { id: 'cercanias-leon', built: { days: [], id: 'cercanias-leon' } }]);
  // Logged and reported with the first line of why, as a Network built from its copy is.
  const line = "cercanias-madrid isn't built, and keeps the files of its last build: Cercanías Madrid has no copy of its timetables to build it from: Couldn't read stop_times.txt";
  expect(log).toEqual([line, expect.stringMatching(/^Error: Cercanías Madrid has no copy[\s\S]*unzip: end of central directory not found[\s\S]*at /)]);
  expect(found).toEqual([{ kind: 'region', region: 'cercanias-madrid', text: [line] }]);
});

test("carries the spots of the last report for the Networks of a region whose build failed, which no other region's are", async () => {
  const spot = (network: string): Spot => ({ kind: 'trips', key: `trips ${network}`, network, text: [''], numbers: { friday: 1 } });
  const last = [spot('rodalies'), spot('fgc'), spot('cercanias-madrid'), { kind: 'measures', key: 'measures', text: [''] } as Spot];
  const report = collect();
  await buildRegions(
    [{ id: 'catalonia', networks: [{ id: 'rodalies' }, { id: 'fgc' }] }, { id: 'cercanias-madrid', networks: [{ id: 'cercanias-madrid' }] }],
    async ({ id }) => {
      if (id === 'catalonia') throw new Error('sideBySide failed');
      return { days: [] };
    },
    { log: () => {}, report, last },
  );
  expect(report.spots().map((s) => s.key)).toEqual(['region catalonia', 'trips fgc', 'trips rodalies']);
  // Of the last report's, only the region's failure is new.
  expect(diff(last, report.spots())).toContain('1 new');
});

test("fails the build where none of the regions has Trips today, which is a broken build rather than a day without Trains", async () => {
  const empty = (id: string) => ({ id, networks: [{ id }] });
  const { deps: d } = deps({ a: network('a', [0, 3000], 0, [[], [300], [300]]), b: network('b', [0, 3000], 100, [[], [300], [300]]) });
  const regions = [empty('a'), empty('b')];
  await expect(buildRegions(regions, (r) => buildRegion(r, d), { log: () => {}, report: { add: () => {}, carry: () => {} }, last: [] })).rejects.toThrow("No Network's timetable has Trips on 2026-10-10");
  // One of them having some is enough.
  const { deps: ok } = deps({ a: network('a', [0, 3000], 0, [[], [300], [300]]), b: network('b', [0, 3000], 100, [[300], [300], [300]]) });
  const built = await buildRegions(regions, (r) => buildRegion(r, ok), { log: () => {}, report: { add: () => {}, carry: () => {} }, last: [] });
  expect(built.map((r) => r.id)).toEqual(['a', 'b']);
});

test("a region that fails keeps its last files in the manifest while the others' new ones are published", async () => {
  const table = {
    rodalies: network('rodalies', [0, 5000], 0, [[300], [300], [300]]),
    madrid: new Error('Cercanías Madrid has no copy of its timetables to build it from: HTTP 503'),
  };
  const { deps: d, files } = deps(table);
  const regions = [{ id: 'catalonia', networks: [{ id: 'rodalies' }] }, { id: 'cercanias-madrid', networks: [{ id: 'madrid' }] }];
  const results = await buildRegions(regions, (r) => buildRegion(r, d), { log: () => {}, report: { add: () => {}, carry: () => {} }, last: [] });
  // The last manifest named Madrid's files for yesterday and the days to come.
  const entry = (date: string) => ({ date, track: 'days/track-madrid-old.json', trips: `days/${date}-madrid-old.json`, from: 1, to: 2 });
  const last = { regions: [{ id: 'cercanias-madrid', days: ['2026-10-09', '2026-10-10', '2026-10-11'].map(entry) }] };
  const manifest = manifestOf(results.map(({ id, built }) => ({ id, days: built?.days })), last);
  expect(manifest.regions.map((r) => [r.id, r.days.map((x) => x.trips)])).toEqual([
    ['catalonia', DATES.map((day) => `days/${day}-catalonia-0123456789ab.json`)],
    ['cercanias-madrid', ['2026-10-09', '2026-10-10', '2026-10-11'].map((day) => `days/${day}-madrid-old.json`)],
  ]);
  // Only the built region's files were written.
  expect(files.every((f) => f.prefix.endsWith('catalonia'))).toBe(true);
});

test("logs each pair of regions whose Lines share a Stretch, how many, how long and where, or says none do", () => {
  const [a, b] = [network('leon', [0, 5000], 0, [[300]]), network('bilbao', [3000, 6000], 20, [[300]])];
  const track = (n: BuiltNetwork): Track => ({ networks: [n.network], lines: n.lines, stations: n.stations, shapes: n.shapes, strokes: [], rails: [], slots: [], tracks: [] });
  const log: string[] = [];
  const found = sharedStretches([{ id: 'cercanias-leon', track: track(a) }, { id: 'cercanias-bilbao', track: track(b) }], (line) => log.push(line));
  expect(found).toHaveLength(1);
  expect(log).toHaveLength(1);
  // A Stretch of about 2 km on Leon's track, where Bilbao's C1 runs 20 m from it, from 3 km along.
  expect(log[0]).toMatch(/^cercanias-leon and cercanias-bilbao share 1 Stretch, \d\.\d km, from 41\.3\d+,2\.\d+: bilbao:C1, leon:C1\. Their Lines are drawn over each other there, not side by side \(ADR-0014\)$/);
  const none = [network('leon', [0, 5000], 0, [[300]]), network('bilbao', [0, 5000], 5000, [[300]])];
  const quiet: string[] = [];
  expect(sharedStretches(none.map((n) => ({ id: n.network.id, track: track(n) })), (line) => quiet.push(line))).toEqual([]);
  expect(quiet).toEqual(['No Stretch is shared by two regions']);
});
