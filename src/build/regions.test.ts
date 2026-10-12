import { expect, test } from 'vitest';
import { STRETCH, type Manifest, type Network, type Shape, type Station, type Track, type Trip } from '../bundle.ts';
import { EVERYWHERE } from '../networks.ts';
import { decodeTrack, type StoredTrack } from '../pieces.ts';
import { noonMinus12h } from './gtfs.ts';
import { manifestOf } from './manifest.ts';
import { buildRegion, buildRegions, failedRegions, sharedStretches, trackFile, zoomedOut, type BuiltNetwork } from './regions.ts';
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

/** A region's files as a manifest names them, one for each of these days. */
const named = (region: string, ...dates: string[]) => dates.map((date) => ({ date, track: `days/track-${region}-old.json`, trips: `days/${date}-${region}-old.json`, from: 1, to: 2 }));

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
  // Its file stores the traced shapes as pieces and its slots as chains, which the map reads back as the track the build made.
  const file = files[0]?.content as StoredTrack;
  expect(file.traced.shapes.map((s) => s.id)).toEqual(['rodalies:shape', 'fgc:shape']);
  expect(file.shapes.every((s) => s.id.startsWith(STRETCH))).toBe(true);
  expect(file).not.toHaveProperty('slots');
  const track = decodeTrack(file);
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
  // What the map reads of the file, once fetched as JSON, is the track built.
  expect(JSON.parse(JSON.stringify(track))).toEqual(JSON.parse(JSON.stringify(built.track)));
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

test("builds each region one after another, and leaves out one whose build fails, as it logs, with why, so that the others are built", async () => {
  const [events, log]: [string[], string[]] = [[], []];
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
    { log: (line) => log.push(line), report: { carry: () => {} }, last: [] },
  );
  expect(events).toEqual(['start catalonia', 'end catalonia', 'start cercanias-madrid', 'start cercanias-leon', 'end cercanias-leon']);
  // Why it failed, in one line, as a Network built from its copy gives its reason, for the report (failedRegions()).
  const why = "Cercanías Madrid has no copy of its timetables to build it from: Couldn't read stop_times.txt";
  expect(result).toEqual([{ id: 'catalonia', built: { days: [], id: 'catalonia' } }, { id: 'cercanias-madrid', failed: why }, { id: 'cercanias-leon', built: { days: [], id: 'cercanias-leon' } }]);
  expect(log).toEqual([`cercanias-madrid isn't built: ${why}`, expect.stringMatching(/^Error: Cercanías Madrid has no copy[\s\S]*unzip: end of central directory not found[\s\S]*at /)]);
});

test("carries the spots of the last report for the Networks of a region whose build failed, which no other region's are", async () => {
  const spot = (network: string): Spot => ({ kind: 'trips', key: `trips ${network}`, network, text: [''], numbers: { friday: 1 } });
  const last = [spot('rodalies'), spot('fgc'), spot('cercanias-madrid'), { kind: 'measures', key: 'measures', text: [''] } as Spot];
  const report = collect();
  const results = await buildRegions(
    [{ id: 'catalonia', networks: [{ id: 'rodalies' }, { id: 'fgc' }] }, { id: 'cercanias-madrid', networks: [{ id: 'cercanias-madrid' }] }],
    async ({ id }) => {
      if (id === 'catalonia') throw new Error('sideBySide failed');
      return { days: [] };
    },
    { log: () => {}, report, last },
  );
  expect(report.spots().map((s) => s.key)).toEqual(['trips fgc', 'trips rodalies']);
  // The region's failure is a spot of its own once the manifest says what's kept (failedRegions()), and the only one new.
  const kept: Manifest = { regions: [{ id: 'catalonia', days: named('catalonia', '2026-10-10', '2026-10-11') }] };
  const manifest = manifestOf(results.map(({ id, built }) => ({ id, days: built && named(id, '2026-10-11') })), kept);
  for (const found of failedRegions(results, manifest, kept, () => {})) report.add(found);
  expect(report.spots().map((s) => s.key)).toEqual(['region catalonia', 'trips fgc', 'trips rodalies']);
  expect(diff(last, report.spots())).toContain('1 new');
});

test("leaves out a region whose build failed where the last report can't be read, as one of an older shape, rather than stop the build for it", async () => {
  const regions = [{ id: 'catalonia', networks: [{ id: 'rodalies' }] }, { id: 'cercanias-madrid', networks: [{ id: 'cercanias-madrid' }] }];
  for (const odd of [{ spots: [] }, [null]]) {
    const report = collect();
    const results = await buildRegions(
      regions,
      async ({ id }) => {
        if (id === 'catalonia') throw new Error('sideBySide failed');
        return { days: [] };
      },
      { log: () => {}, report, last: odd as unknown as Spot[] },
    );
    expect(results.map((r) => [r.id, r.built !== undefined, r.failed])).toEqual([['catalonia', false, 'sideBySide failed'], ['cercanias-madrid', true, undefined]]);
    // Nothing of the last report to carry, and the region's failure is there to report all the same.
    expect(report.spots()).toEqual([]);
  }
});

test("fails the build where none of the regions has Trips today, which is a broken build rather than a day without Trains", async () => {
  const empty = (id: string) => ({ id, networks: [{ id }] });
  const { deps: d } = deps({ a: network('a', [0, 3000], 0, [[], [300], [300]]), b: network('b', [0, 3000], 100, [[], [300], [300]]) });
  const regions = [empty('a'), empty('b')];
  await expect(buildRegions(regions, (r) => buildRegion(r, d), { log: () => {}, report: { carry: () => {} }, last: [] })).rejects.toThrow("No Network's timetable has Trips on 2026-10-10");
  // One of them having some is enough.
  const { deps: ok } = deps({ a: network('a', [0, 3000], 0, [[], [300], [300]]), b: network('b', [0, 3000], 100, [[300], [300], [300]]) });
  const built = await buildRegions(regions, (r) => buildRegion(r, ok), { log: () => {}, report: { carry: () => {} }, last: [] });
  expect(built.map((r) => r.id)).toEqual(['a', 'b']);
});

test("a region that fails keeps its last files in the manifest while the others' new ones are published", async () => {
  const table = {
    rodalies: network('rodalies', [0, 5000], 0, [[300], [300], [300]]),
    madrid: new Error('Cercanías Madrid has no copy of its timetables to build it from: HTTP 503'),
  };
  const { deps: d, files } = deps(table);
  const regions = [{ id: 'catalonia', networks: [{ id: 'rodalies' }] }, { id: 'cercanias-madrid', networks: [{ id: 'madrid' }] }];
  const results = await buildRegions(regions, (r) => buildRegion(r, d), { log: () => {}, report: { carry: () => {} }, last: [] });
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

test("a region whose track file wouldn't read back as built fails like any other: nothing of it is written, the manifest keeps its last files, and it's logged and reported", async () => {
  // A traced shape with a field its file can't carry.
  const odd = network('madrid', [0, 5000], 200, [[300], [300], [300]]);
  odd.shapes = odd.shapes.map((s) => ({ ...s, kind: 'x' }) as Shape);
  const { deps: d, files } = deps({ rodalies: network('rodalies', [0, 5000], 0, [[300], [300], [300]]), madrid: odd });
  const regions = [{ id: 'catalonia', networks: [{ id: 'rodalies' }] }, { id: 'cercanias-madrid', networks: [{ id: 'madrid' }] }];
  const [log, report] = [[] as string[], collect()];
  const results = await buildRegions(regions, (r) => buildRegion(r, d), { log: (line) => log.push(line), report, last: [] });
  expect(results.map((r) => [r.id, r.built !== undefined])).toEqual([['catalonia', true], ['cercanias-madrid', false]]);
  const entry = (date: string) => ({ date, track: 'days/track-madrid-old.json', trips: `days/${date}-madrid-old.json`, from: 1, to: 2 });
  const last = { regions: [{ id: 'cercanias-madrid', days: ['2026-10-09', '2026-10-10', '2026-10-11'].map(entry) }] };
  const manifest = manifestOf(results.map(({ id, built }) => ({ id, days: built?.days })), last);
  expect(manifest.regions.find((r) => r.id === 'cercanias-madrid')?.days.map((x) => x.track)).toEqual(Array(3).fill('days/track-madrid-old.json'));
  // Neither its track nor its Trips were written, and the others' were.
  expect(files.map((f) => f.prefix).filter((p) => p.includes('madrid'))).toEqual([]);
  expect(files.some((f) => f.prefix === 'days/track-catalonia')).toBe(true);
  expect(log[0]).toContain("cercanias-madrid isn't built: cercanias-madrid's track file doesn't give back the track built");
  // And reported once the manifest says it keeps three days of its last files: its spot, which the manifest of the other region's is no part of.
  for (const found of failedRegions(results, manifest, last, () => {})) report.add(found);
  expect(report.spots().map((s) => [s.key, s.numbers?.days])).toEqual([['region cercanias-madrid', 3]]);
});

/** The report's spot for a failed Madrid, as the build makes it after the manifest of a day on which Catalonia built `dates` and the last manifest named Madrid's days `kept`. */
function madrid(dates: string[], kept: string[] | undefined, why = 'HTTP 503') {
  const last: Manifest = { regions: [{ id: 'catalonia', days: named('catalonia', ...dates) }, ...(kept ? [{ id: 'cercanias-madrid', days: named('cercanias-madrid', ...kept) }] : [])] };
  const results = [{ id: 'catalonia', built: { days: named('catalonia', ...dates) } }, { id: 'cercanias-madrid', failed: why }];
  const manifest = manifestOf(results.map(({ id, built }) => ({ id, days: built?.days })), last);
  const log: string[] = [];
  return { found: failedRegions(results, manifest, last, (line) => log.push(line)), manifest, log };
}

test("says in a failed region's spot how many days of its last build's files the manifest still names for it, with those it keeps, from the day before the days built on (#452)", () => {
  // Madrid's last build, on the 9th, named its three days, the 9th to the 11th, and the 8th. The build of the 10th keeps the 9th, 10th and 11th.
  const { found, log } = madrid(['2026-10-10', '2026-10-11', '2026-10-12'], ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']);
  const text = "cercanias-madrid isn't built, and keeps the files of its last build for 3 more days: HTTP 503";
  expect(found).toEqual([{ kind: 'region', region: 'cercanias-madrid', text: [text], numbers: { days: 3 } }]);
  expect(log).toEqual([text]);
});

test("counts a failed region's days down by one a build, says 1 more day for the last, and that it has gone from the map once none is left (#452)", () => {
  // Each build names Madrid's files for the days from the day before it on, of the last build's.
  const kept = ['2026-10-09', '2026-10-10', '2026-10-11'];
  const says = (day: number, from: string[]) => {
    const dates = [day, day + 1, day + 2].map((d) => `2026-10-${d}`);
    const { found, manifest } = madrid(dates, from);
    return [found[0]?.text[0], found[0]?.numbers?.days, manifest.regions.find((r) => r.id === 'cercanias-madrid')?.days.map((d) => d.date)];
  };
  expect(says(10, kept)).toEqual(["cercanias-madrid isn't built, and keeps the files of its last build for 3 more days: HTTP 503", 3, kept]);
  expect(says(11, kept)).toEqual(["cercanias-madrid isn't built, and keeps the files of its last build for 2 more days: HTTP 503", 2, kept.slice(1)]);
  expect(says(12, kept.slice(1))).toEqual(["cercanias-madrid isn't built, and keeps the files of its last build for 1 more day: HTTP 503", 1, kept.slice(2)]);
  // The last manifest, the 12th's, names the 11th's file alone, and the 13th's build keeps from the 12th on: none, so the manifest leaves Madrid out.
  expect(says(13, kept.slice(2))).toEqual(["cercanias-madrid isn't built, and has gone from the map: HTTP 503", 0, undefined]);
});

test("says a failed region the last manifest names no day of has no files of a last build, as one a config change added whose first build fails, and keeps one spot's key through the days so that the report shows its days as changed, not new and gone (#452)", () => {
  const never = madrid(['2026-10-10', '2026-10-11', '2026-10-12'], undefined);
  expect(never.found).toEqual([{ kind: 'region', region: 'cercanias-madrid', text: ["cercanias-madrid isn't built, and has no files of a last build: HTTP 503"], numbers: { days: 0 } }]);
  // Nor does a last manifest of one bundle, the shape before regions, name any region's files.
  const oneBundle = { days: [{ date: '2026-10-09', track: 'days/track-a.json', trips: 'days/2026-10-09-b.json', from: 0, to: 1 }] } as unknown as Manifest;
  expect(failedRegions([{ id: 'cercanias-madrid', failed: 'HTTP 503' }], { regions: [] }, oneBundle, () => {})).toMatchObject([{ text: ["cercanias-madrid isn't built, and has no files of a last build: HTTP 503"], numbers: { days: 0 } }]);
  expect(failedRegions([{ id: 'cercanias-madrid', failed: 'HTTP 503' }], { regions: [] }, undefined, () => {})).toMatchObject([{ numbers: { days: 0 } }]);
  // The same region's spot of two builds, a day apart, differs in its days and its text alone: its key's the same.
  const [day1, day2] = [madrid(['2026-10-10', '2026-10-11', '2026-10-12'], ['2026-10-09', '2026-10-10', '2026-10-11']).found, madrid(['2026-10-11', '2026-10-12', '2026-10-13'], ['2026-10-10', '2026-10-11']).found];
  const [a, b] = [collect(), collect()];
  for (const f of day1) a.add(f);
  for (const f of day2) b.add(f);
  expect(a.spots().map((s) => s.key)).toEqual(['region cercanias-madrid']);
  expect(b.spots().map((s) => s.key)).toEqual(['region cercanias-madrid']);
  expect(diff(a.spots(), b.spots())).toContain('`region cercanias-madrid`: days (3 → 2)');
  expect(diff(a.spots(), b.spots())).toContain('0 new, 0 gone, 1 changed');
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

test("gives a region's track as the file that stores its slots as chains, says where they stay whole, and refuses a track its file wouldn't give back as it was built, here a slot with more than the chains carry", () => {
  const { shapes, lines } = network('rodalies', [0, 5000], 0, [[300]]);
  const track: Track = { networks: [], lines, stations: [], shapes, strokes: [], rails: [], slots: [], tracks: [] };
  const slot = { line: 'rodalies:C1', shape: 'rodalies:shape', from: 0, to: 5000, side: 0, on: 'rodalies:shape', at: [0, 5000] as [number, number] };
  const said: string[] = [];
  expect(trackFile({ ...track, slots: [slot] }, 'catalonia', (line) => said.push(line))).toHaveProperty('chains');
  expect(said).toEqual([]);
  // One that doesn't follow the one before keeps them all whole, and the build says so.
  const gap = trackFile({ ...track, slots: [{ ...slot, to: 3000, at: [0, 3000] }, { ...slot, from: 4000, at: [4000, 5000] }] }, 'catalonia', (line) => said.push(line));
  expect(gap).toHaveProperty('slots');
  expect(gap).not.toHaveProperty('chains');
  expect(said).toEqual(["catalonia's slots are whole in its track file, not chains: one doesn't follow the one before along its shape, or names a Line or shape its track hasn't"]);
  expect(() => trackFile({ ...track, slots: [{ ...slot, crowded: true } as typeof slot] }, 'catalonia')).toThrow("catalonia's track file doesn't give back the track built");
});

/** A region's track of one Network, its Line along a shape from x metres to another, y metres north, with its Network's track along all of it. */
function regionTrack(id: string, [from, to]: [number, number], y: number): Track {
  const { network: n, lines, stations, shapes } = network(id, [from, to], y, [[300]]);
  return { networks: [n], lines, stations, shapes, strokes: [], rails: [], slots: [], tracks: [{ line: `${id}:C1`, shape: `${id}:shape`, from: 0, to: to - from, side: 0 }] };
}

test("names each region's Networks and where it lies in the manifest, and puts every region's Networks, Network tracks and Stations in the file below zoom 7, a failed region's from the track file the manifest names for it, and leaves the region every view loads with no extent", async () => {
  const entry = (region: string, date: string) => ({ date, track: `days/track-${region}-old.json`, trips: `days/${date}-${region}.json`, from: 1, to: 2 });
  const manifest = {
    regions: [
      { id: 'catalonia', days: [entry('catalonia', '2026-10-10')] },
      // Its build failed: the manifest names its last build's files, from yesterday on.
      { id: 'cercanias-madrid', days: [entry('cercanias-madrid', '2026-10-09'), entry('cercanias-madrid', '2026-10-10')] },
      { id: EVERYWHERE, days: [entry(EVERYWHERE, '2026-10-10')] },
    ],
  };
  // Catalonia's 5 km east from Barcelona, long distance's 2 km of it 2 km north, and Madrid's 3 km between, made up.
  const built = new Map([['catalonia', regionTrack('rodalies', [0, 5000], 0)], [EVERYWHERE, regionTrack('ave-larga-distancia', [0, 2000], 2000)]]);
  const read: string[] = [];
  const { regions, file } = await zoomedOut(manifest, built, async (key) => {
    read.push(key);
    return regionTrack('cercanias-madrid', [1000, 4000], 1000);
  });
  expect(read).toEqual(['days/track-cercanias-madrid-old.json']);
  // The manifest's days as they were, then the Networks and where each lies, outward to a thousandth of a degree.
  expect(regions).toEqual([
    { ...manifest.regions[0], networks: ['rodalies'], extent: [2.17, 41.39, 2.23, 41.39] },
    { ...manifest.regions[1], networks: ['cercanias-madrid'], extent: [2.181, 41.398, 2.218, 41.399] },
    { ...manifest.regions[2], networks: ['ave-larga-distancia'] },
  ]);
  expect(file.networks.map((n) => n.id)).toEqual(['rodalies', 'cercanias-madrid', 'ave-larga-distancia']);
  // Each straight track by its ends, to a ten-thousandth of a degree.
  expect(file.tracks).toEqual([
    { network: 'rodalies', coordinates: [[2.17, 41.39], [2.2299, 41.39]] },
    { network: 'cercanias-madrid', coordinates: [[2.182, 41.399], [2.218, 41.399]] },
    { network: 'ave-larga-distancia', coordinates: [[2.17, 41.408], [2.194, 41.408]] },
  ]);
  expect(file.stations).toEqual({ catalonia: ['adif:rodalies-1', 'adif:rodalies-2'], 'cercanias-madrid': ['adif:cercanias-madrid-1', 'adif:cercanias-madrid-2'], [EVERYWHERE]: ['adif:ave-larga-distancia-1', 'adif:ave-larga-distancia-2'] });
  // Where that file can't be read, the build fails, rather than lose the region's track below zoom 7.
  await expect(zoomedOut(manifest, built, () => Promise.reject(new Error('HTTP 503')))).rejects.toThrow('HTTP 503');
});
