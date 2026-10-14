import { expect, test } from 'vitest';
import type { Bundle, DayFiles, DayTrips, ManifestRegion, Point, Shape, Track, Trip } from '../bundle.ts';
import { metres } from '../build/track.ts';
import { encodeTrack } from '../pieces.ts';
import { daysAsTheyCome, firstLook, forgetJoined, regionLoader, regionsCame, regionsNeeded } from './regions.ts';

/** A region's track of one Line and one Station, named for it. */
const track = (id: string): Track => ({
  networks: [{ id, name: id, profile: { acceleration: 1, braking: 1, topSpeed: 40, dwell: 30 }, runningSide: 'right', colour: '#000', pillZoom: 10, credit: { text: id, url: '' } }],
  lines: [{ id: `${id}:C1`, network: id, name: 'C1', colour: '#000', shapes: [], kind: 'commuter' }],
  stations: [{ id: `adif:${id}`, name: id, lon: 2, lat: 41 }],
  shapes: [],
  strokes: [],
  rails: [],
  slots: [],
  tracks: [],
});
const trip = (id: string): Trip => ({ id, line: `${id}:C1`, shape: 's', headsign: '', calls: [] });
const trips = (id: string): DayTrips => ({ serviceDay: '2026-10-10', noonMinus12h: 1, trips: [trip(id)] });

const IDS = ['catalonia', 'cercanias-madrid', 'cercanias-leon'];
const day: DayFiles = { date: '2026-10-10', from: 0, to: 1, regions: IDS.map((id) => ({ id, track: `${id}.track`, trips: `${id}.trips` })) };

/** What the map would fetch: each region's files by name, or a failure for those named in `broken`. */
function files(broken: string[] = []) {
  const asked: string[] = [];
  const get = <T>(key: string): Promise<T> => {
    asked.push(key);
    if (broken.includes(key)) return Promise.reject(new Error(`${key}: HTTP 404`));
    const id = key.replace(/\.(track|trips)$/, '');
    return Promise.resolve((key.endsWith('.track') ? track(id) : trips(id)) as T);
  };
  return { get, asked };
}

test("joins a day's regions' tracks and Trips, in the manifest's order, and gives its track on its own first", async () => {
  const { get, asked } = files();
  const load = regionLoader(get, new Map(), () => {});
  const only = await load.trackOf(day);
  expect(only.track.networks.map((n) => n.id)).toEqual(IDS);
  // The Trips are fetched only once the bundle asks for them.
  expect(asked).toEqual(IDS.map((id) => `${id}.track`));
  const bundle = await load.bundleOf(day);
  expect(bundle.trips.map((t) => t.id)).toEqual(IDS);
  expect(bundle.serviceDay).toBe('2026-10-10');
  // Its track is the one drawn already, so that nothing is drawn again.
  expect(bundle.stations).toBe(only.track.stations);
  expect(load.failed()).toBe(false);
});

test("leaves out a region whose track doesn't come, with its Trips, draws the rest, and says some failed so that the map looks again", async () => {
  const { get, asked } = files(['cercanias-madrid.track']);
  const [warned, load] = [[] as unknown[], regionLoader(get, new Map(), (e) => warned.push(e))];
  const bundle = await load.bundleOf(day);
  expect(bundle.networks.map((n) => n.id)).toEqual(['catalonia', 'cercanias-leon']);
  expect(bundle.trips.map((t) => t.id)).toEqual(['catalonia', 'cercanias-leon']);
  expect(asked).not.toContain('cercanias-madrid.trips');
  expect(load.failed()).toBe(true);
  expect(warned).toHaveLength(1);
});

test("leaves out a region whose Trips don't come, and keeps its Lines on the map", async () => {
  const { get } = files(['cercanias-leon.trips']);
  const load = regionLoader(get, new Map(), () => {});
  const bundle = await load.bundleOf(day);
  expect(bundle.networks.map((n) => n.id)).toEqual(IDS);
  expect(bundle.trips.map((t) => t.id)).toEqual(['catalonia', 'cercanias-madrid']);
  expect(load.failed()).toBe(true);
});

test("fails a day none of whose regions' tracks, or Trips, come", async () => {
  const noTracks = regionLoader(files(IDS.map((id) => `${id}.track`)).get, new Map(), () => {});
  await expect(noTracks.bundleOf(day)).rejects.toThrow("No region's track came for 2026-10-10");
  const noTrips = regionLoader(files(IDS.map((id) => `${id}.trips`)).get, new Map(), () => {});
  await expect(noTrips.bundleOf(day)).rejects.toThrow("No region's Trips came for 2026-10-10");
});

test("gives the same joined track again for the same files, as looking again after a region's file failed again draws nothing again", async () => {
  const joined = new Map<string, Track>();
  const first = await regionLoader(files(['cercanias-leon.trips']).get, joined, () => {}).bundleOf(day);
  const again = await regionLoader(files(['cercanias-leon.trips']).get, joined, () => {}).bundleOf(day);
  expect(again.stations).toBe(first.stations);
  // Other files are another track.
  const fewer = await regionLoader(files(['cercanias-leon.track']).get, joined, () => {}).bundleOf(day);
  expect(fewer.stations).not.toBe(first.stations);
});

test("forgets the joins of tracks that aren't all among the files the days now need, and keeps those that are, so that they don't pile up", async () => {
  const joined = new Map<string, Track>();
  await regionLoader(files().get, joined, () => {}).bundleOf(day);
  expect(joined.size).toBe(1);
  forgetJoined(joined, IDS.flatMap((id) => [`${id}.track`, `${id}.trips`]));
  expect(joined.size).toBe(1);
  // One of its files isn't needed any more: what's joined with it is no use again.
  forgetJoined(joined, ['catalonia.track', 'cercanias-leon.track']);
  expect(joined.size).toBe(0);
});

test("reads a track file that stores its shapes as pieces back as the track it was built from, once for however many loaders read it, and one built before pieces as it is", async () => {
  const coords: Point[] = [[2.1, 41.4], [2.2, 41.5], [2.3, 41.4], [2.1, 41.4]];
  let along = 0;
  const ring: Shape = { id: 'catalonia:ring', coords, dist: coords.map((p, i) => Math.round((along += i ? metres(coords[i - 1] ?? p, p) : 0))) };
  const built = { ...track('catalonia'), shapes: [ring] };
  const stored = encodeTrack(built);
  // What the page's fetched files hold: the same file for as long as its key is wanted.
  const fetched = new Map<string, unknown>([['catalonia.track', stored], ['catalonia.trips', trips('catalonia')], ['cercanias-leon.track', track('cercanias-leon')], ['cercanias-leon.trips', trips('cercanias-leon')]]);
  const get = <T>(key: string) => Promise.resolve(fetched.get(key) as T);
  const days: DayFiles = { ...day, regions: day.regions.filter((r) => r.id !== 'cercanias-madrid') };
  const first = await regionLoader(get, new Map(), () => {}).bundleOf(days);
  // The shape is the one built, between the other region's, which has none, and the Lines are both regions'.
  expect(first.shapes.map((s) => s.id)).toEqual(['catalonia:ring']);
  expect(first.shapes[0]).toEqual(ring);
  expect(first.lines.map((l) => l.id)).toEqual(['catalonia:C1', 'cercanias-leon:C1']);
  // Another loader, as the page's next look makes, finds the shape it decoded already.
  const again = await regionLoader(get, new Map(), () => {}).bundleOf(days);
  expect(again.shapes[0]).toBe(first.shapes[0]);
});

/** A service day's bundle, as a look makes it from its files: the Trips of these IDs on a day's clock. */
const bundleOf = (date: string, ...ids: string[]): Bundle => ({ ...track('catalonia'), serviceDay: date, noonMinus12h: Date.parse(`${date}T00:00:00Z`), trips: ids.map(trip) });
/** A day's files for these regions, named as the manifest names them, with none for the day where a region is left out. */
const filesFor = (date: string, ...ids: string[]): DayFiles => ({ date, from: 0, to: 1, regions: ids.map((id) => ({ id, track: `${id}.track`, trips: `${id}.${date}.trips` })) });
/** A promise a test settles when it likes, so that one day's files can come after another's. */
function wait<T>() {
  let [resolve, reject] = [(_: T) => {}, (_: unknown) => {}];
  const promise = new Promise<T>((yes, no) => ([resolve, reject] = [yes, no]));
  return { promise, resolve, reject };
}
/** The days a look needs, in this order, each of whose bundles comes (or fails) when a test says. */
function coming(...dates: string[]) {
  const waits = new Map(dates.map((date) => [date, wait<Bundle>()]));
  const days = dates.map((date) => filesFor(date));
  return { days, bundleOf: (day: DayFiles) => waits.get(day.date)?.promise ?? Promise.reject(new Error(`no ${day.date}`)), come: (bundle: Bundle) => waits.get(bundle.serviceDay)?.resolve(bundle), fail: (date: string, why: string) => waits.get(date)?.reject(new Error(why)) };
}
const [DAY, NEXT] = ['2026-10-11', '2026-10-12'];
/** The IDs of the Trips a step's bundle has, in its order. */
const tripsOf = (bundle: Bundle | undefined) => bundle?.trips.map((t) => t.id);

test("gives the day whose files come first on its own and joins the other's as they come, in the days' order, so that the map has the first day's Trips when they come and not when the last day's have (#593)", async () => {
  // Two days needed, as after midnight: the earlier slow, the later fast.
  const files = coming(DAY, NEXT);
  const steps = daysAsTheyCome(files.days, files.bundleOf);
  files.come(bundleOf(NEXT, 'n1'));
  const first = await steps.next();
  expect(tripsOf(first.value?.bundle)).toEqual(['n1']);
  expect(first.value?.complete).toBe(false);
  expect(first.value?.came.map((d) => d.date)).toEqual([NEXT]);
  // The earlier day's Trips run on the clock of the last, led by their day (joinDays()).
  files.come(bundleOf(DAY, 'd1'));
  const last = await steps.next();
  expect(tripsOf(last.value?.bundle)).toEqual([`${DAY}/d1`, 'n1']);
  expect(last.value?.complete).toBe(true);
  expect((await steps.next()).done).toBe(true);
});

test("gives the earlier day's Trips on their own where they come first, and the two joined once the later's do", async () => {
  const files = coming(DAY, NEXT);
  const steps = daysAsTheyCome(files.days, files.bundleOf);
  files.come(bundleOf(DAY, 'd1'));
  const first = await steps.next();
  // Alone, a day is the bundle of the files it came from, as the map had before this.
  expect(tripsOf(first.value?.bundle)).toEqual(['d1']);
  expect(first.value?.bundle?.serviceDay).toBe(DAY);
  files.come(bundleOf(NEXT, 'n1'));
  expect(tripsOf((await steps.next()).value?.bundle)).toEqual([`${DAY}/d1`, 'n1']);
});

test("keeps what the map had of a day until its new files come, so that a look that adds a region doesn't take a day's Trips off the map while another day's come", async () => {
  const [files, had] = [coming(DAY, NEXT), bundleOf(DAY, 'old')];
  const steps = daysAsTheyCome(files.days, files.bundleOf, new Map([[DAY, had]]));
  files.come(bundleOf(NEXT, 'n1'));
  const first = await steps.next();
  // The later day's new Trips, with the earlier day's as the map had them.
  expect(tripsOf(first.value?.bundle)).toEqual([`${DAY}/old`, 'n1']);
  expect(first.value?.complete).toBe(false);
  expect([...(first.value?.byDate ?? [])].map(([date]) => date)).toEqual([DAY, NEXT]);
  files.come(bundleOf(DAY, 'new'));
  const last = await steps.next();
  expect(tripsOf(last.value?.bundle)).toEqual([`${DAY}/new`, 'n1']);
  expect(last.value?.complete).toBe(true);
});

test("leaves out a day whose files fail, with what the map had of it, once the look is over, and says which failed and why", async () => {
  const [files, had] = [coming(DAY, NEXT), bundleOf(DAY, 'old')];
  const steps = daysAsTheyCome(files.days, files.bundleOf, new Map([[DAY, had]]));
  files.come(bundleOf(NEXT, 'n1'));
  expect(tripsOf((await steps.next()).value?.bundle)).toEqual([`${DAY}/old`, 'n1']);
  files.fail(DAY, 'HTTP 503');
  const last = await steps.next();
  expect(last.value?.complete).toBe(true);
  expect(tripsOf(last.value?.bundle)).toEqual(['n1']);
  expect(last.value?.lost.map(([day, why]) => [day.date, String(why)])).toEqual([[DAY, 'Error: HTTP 503']]);
});

test("has no bundle at the look's end where no day's files come, and no step before it: a day that fails while another is still to come is nothing to show", async () => {
  const files = coming(DAY, NEXT);
  const steps = daysAsTheyCome(files.days, files.bundleOf);
  files.fail(NEXT, 'HTTP 404');
  const step = steps.next();
  // The first failure is no step of its own, the look waiting on the other day as it was.
  await new Promise((resolve) => setTimeout(resolve));
  files.fail(DAY, 'HTTP 503');
  const { value } = await step;
  expect([value?.bundle, value?.complete, value?.lost.map(([day]) => day.date)]).toEqual([undefined, true, [NEXT, DAY]]);
  expect((await steps.next()).done).toBe(true);
});

test("is one step for days whose files come in the same turn, and the last for a day that fails after another's came, with that one's bundle as it was", async () => {
  const files = coming(DAY, NEXT);
  const steps = daysAsTheyCome(files.days, files.bundleOf);
  files.come(bundleOf(DAY, 'd1'));
  files.come(bundleOf(NEXT, 'n1'));
  const all = [];
  for await (const step of steps) all.push(step);
  expect(all.map((s) => [tripsOf(s.bundle), s.complete])).toEqual([[[`${DAY}/d1`, 'n1'], true]]);
  const more = coming(DAY, NEXT);
  const later = daysAsTheyCome(more.days, more.bundleOf);
  more.come(bundleOf(NEXT, 'n1'));
  const first = await later.next();
  more.fail(DAY, 'HTTP 503');
  const last = await later.next();
  // A day that fails is the look's last step, which is the same Trips as before it: the map shows them again as it must be told it's over.
  expect([tripsOf(first.value?.bundle), first.value?.complete]).toEqual([['n1'], false]);
  expect([tripsOf(last.value?.bundle), last.value?.complete, last.value?.bundle]).toEqual([['n1'], true, first.value?.bundle]);
});

test("shows a day's new bundle in place of the one the map had of it as it comes, and the bundle the map had of a day still to come until then (#593)", async () => {
  // A look for a region new to the map: both days' files asked for again, and both days on the map already.
  const [files, hadDay, hadNext] = [coming(DAY, NEXT), bundleOf(DAY, 'old'), bundleOf(NEXT, 'oldn')];
  const steps = daysAsTheyCome(files.days, files.bundleOf, new Map([[DAY, hadDay], [NEXT, hadNext]]));
  files.come(bundleOf(NEXT, 'n1'));
  const first = await steps.next();
  // The later day's new Trips, which are what the look is for, not the Trips it had of the day: only the other's are kept.
  expect(tripsOf(first.value?.bundle)).toEqual([`${DAY}/old`, 'n1']);
  expect(first.value?.byDate.get(NEXT)).not.toBe(hadNext);
  expect(first.value?.byDate.get(DAY)).toBe(hadDay);
});

test("is no step where a day fails first with the map's bundles of the days kept, which come on as they were until a day comes (#593)", async () => {
  const [files, hadDay, hadNext] = [coming(DAY, NEXT), bundleOf(DAY, 'old'), bundleOf(NEXT, 'oldn')];
  const steps = daysAsTheyCome(files.days, files.bundleOf, new Map([[DAY, hadDay], [NEXT, hadNext]]));
  files.fail(NEXT, 'HTTP 503');
  const step = steps.next();
  // Nothing new: the failed day's bundle the map had is what it still has, so no step re-joins them with none of the days come.
  await new Promise((resolve) => setTimeout(resolve));
  files.come(bundleOf(DAY, 'd2'));
  const { value } = await step;
  expect([tripsOf(value?.bundle), value?.complete, value?.came.map((d) => d.date)]).toEqual([['d2'], true, [DAY]]);
  expect((await steps.next()).done).toBe(true);
});

test("is the bundle of the step before it where the look's last step has the same days, so that the map has nothing to lay out again (#593)", async () => {
  // Three days, as a board with none left after midnight needs: the first two come, one after the other, and the third fails.
  const [LAST] = ['2026-10-13'];
  const files = coming(DAY, NEXT, LAST);
  const steps = daysAsTheyCome(files.days, files.bundleOf);
  files.come(bundleOf(DAY, 'd1'));
  expect(tripsOf((await steps.next()).value?.bundle)).toEqual(['d1']);
  files.come(bundleOf(NEXT, 'n1'));
  const joined = await steps.next();
  expect(tripsOf(joined.value?.bundle)).toEqual([`${DAY}/d1`, 'n1']);
  files.fail(LAST, 'HTTP 503');
  const last = await steps.next();
  expect([last.value?.complete, last.value?.lost.length]).toEqual([true, 1]);
  // The same object, not another joined from the same parts: the map lays a bundle out again when its Stations aren't the ones it drew.
  expect(last.value?.bundle).toBe(joined.value?.bundle);
});

test("the regions that have come are those loaded whose files for the days that have come are all in, and those with none in any day, which have nothing to wait for (#593)", () => {
  const [d1, d2] = [filesFor('2026-10-11', 'catalonia', 'cercanias-madrid'), filesFor('2026-10-12', 'catalonia', 'cercanias-madrid')];
  const fetched = new Set(['catalonia.track', 'catalonia.2026-10-11.trips', 'catalonia.2026-10-12.trips', 'cercanias-madrid.track', 'cercanias-madrid.2026-10-11.trips']);
  const loaded = ['catalonia', 'cercanias-madrid', 'cercanias-leon'];
  // Every day has come: Madrid's Trips of the 12th failed, and León has no file in either day.
  expect(regionsCame(loaded, [d1, d2], [d1, d2], (file) => fetched.has(file))).toEqual(['catalonia', 'cercanias-leon']);
  // The first day alone, as the map has it first: Madrid's files for it are all in.
  expect(regionsCame(loaded, [d1, d2], [d1], (file) => fetched.has(file))).toEqual(['catalonia', 'cercanias-madrid', 'cercanias-leon']);
  // Not a region whose track failed, whatever of its Trips are in.
  expect(regionsCame(loaded, [d1, d2], [d1], (file) => fetched.has(file) && file !== 'cercanias-madrid.track')).toEqual(['catalonia', 'cercanias-leon']);
  // A region whose files are in the other day alone has none to show for the first, though it has nothing to wait for in no day.
  const late = filesFor('2026-10-12', 'catalonia', 'cercanias-madrid', 'cercanias-sevilla');
  expect(regionsCame([...loaded, 'cercanias-sevilla'], [d1, late], [d1], () => true)).not.toContain('cercanias-sevilla');
  expect(regionsCame([...loaded, 'cercanias-sevilla'], [d1, late], [d1, late], () => true)).toContain('cercanias-sevilla');
});

// Where some regions lay, as the daily build of 10 Oct 2026 found them: west, south, east, north.
const REGIONS: Pick<ManifestRegion, 'id' | 'networks' | 'extent'>[] = [
  { id: 'catalonia', networks: ['rodalies', 'fgc', 'tram', 'metro'], extent: [-0.86, 40.596, 3.161, 42.447] },
  { id: 'cercanias-madrid', networks: ['cercanias-madrid'], extent: [-4.269, 40.035, -3.182, 40.738] },
  { id: 'cercanias-sevilla', networks: ['cercanias-sevilla'], extent: [-6.208, 36.912, -5.53, 37.933] },
  { id: 'cercanias-leon', networks: ['cercanias-leon'], extent: [-5.566, 42.616, -4.845, 42.865] },
  // Its C4 ran to León then, until #368: a region's extent can take in another's.
  { id: 'cercanias-bilbao', networks: ['cercanias-bilbao'], extent: [-5.566, 42.616, -2.882, 43.329] },
];
/** A phone's view, 390×844, at zoom 12, around a point: south-west and north-east corners. */
const phone = ([lon, lat]: Point): [Point, Point] => [[lon - 0.0335, lat - 0.054], [lon + 0.0335, lat + 0.054]];
const [BARCELONA, MADRID]: [Point, Point] = [[2.17, 41.39], [-3.69, 40.41]];

test('from zoom 7, where the map draws Lines and Trains, loads the regions in view, and none out of it', () => {
  expect(regionsNeeded(REGIONS, { bounds: phone(BARCELONA), zoom: 12 })).toEqual(['catalonia']);
  expect(regionsNeeded(REGIONS, { bounds: phone(MADRID), zoom: 12 })).toEqual(['cercanias-madrid']);
  // Out in the sea off Valencia, none.
  expect(regionsNeeded(REGIONS, { bounds: phone([0.5, 39.4]), zoom: 12 })).toEqual([]);
});

test('loads a region within half a view of the view, so that a pan comes onto its track drawn, but not one further off', () => {
  // West of Madrid's track, a quarter of the view's width short of it, and then seven tenths.
  expect(regionsNeeded(REGIONS, { bounds: phone([-4.32, 40.41]), zoom: 12 })).toEqual(['cercanias-madrid']);
  expect(regionsNeeded(REGIONS, { bounds: phone([-4.35, 40.41]), zoom: 12 })).toEqual([]);
});

test("below zoom 7 loads no region for the view, as the file below zoom 7 draws every region's track there, but one with no extent at every view, as long distance's is, and every region of a manifest from before #266", () => {
  // Spain at zoom 6.
  const spain: [Point, Point] = [[-9.5, 35.5], [4.5, 44]];
  expect(regionsNeeded(REGIONS, { bounds: spain, zoom: 6.9 })).toEqual([]);
  // A made-up region every view loads, far from Barcelona and zoomed out alike.
  const everywhere = [...REGIONS, { id: 'long-distance', networks: ['ave-larga-distancia', 'media-distancia-avant'] }];
  expect(regionsNeeded(everywhere, { bounds: spain, zoom: 5 })).toEqual(['long-distance']);
  expect(regionsNeeded(everywhere, { bounds: phone(BARCELONA), zoom: 12 })).toEqual(['catalonia', 'long-distance']);
  // A manifest that names no extents, as one before #266.
  expect(regionsNeeded(REGIONS.map(({ id }) => ({ id })), { bounds: phone(BARCELONA), zoom: 12 })).toEqual(REGIONS.map((r) => r.id));
});

test('loads the region of the Train a link names, by the Network its Trip leads with, those of the Station a link names, by the file below zoom 7, and those near the viewer for Nearby, wherever the map is', () => {
  const view = { bounds: phone(BARCELONA), zoom: 12 };
  expect(regionsNeeded(REGIONS, view, { train: '2026-10-10/cercanias-bilbao:C4_15212' })).toEqual(['catalonia', 'cercanias-bilbao']);
  // A Station in two regions, as León's was in León's and in Bilbao's, whose C4 ran to it until #368.
  const stations = { catalonia: ['adif:71801'], 'cercanias-leon': ['adif:15100'], 'cercanias-bilbao': ['adif:13200', 'adif:15100'] };
  expect(regionsNeeded(REGIONS, view, { station: 'adif:15100', stations })).toEqual(['catalonia', 'cercanias-leon', 'cercanias-bilbao']);
  // Until that file has come, it knows of none.
  expect(regionsNeeded(REGIONS, view, { station: 'adif:15100' })).toEqual(['catalonia']);
  // Nearby at Sevilla-Santa Justa, and 1.1 km south of Sevilla's track, where its Trains pass within 1,500 m, but not 2.2 km south.
  const nearby = (at: Point) => regionsNeeded(REGIONS, view, { nearby: { at, metres: 1500 } });
  expect(nearby([-5.975, 37.392])).toEqual(['catalonia', 'cercanias-sevilla']);
  expect(nearby([-5.9, 36.902])).toEqual(['catalonia', 'cercanias-sevilla']);
  expect(nearby([-5.9, 36.892])).toEqual(['catalonia']);
  // Zoomed out, or with no view, those alone.
  expect(regionsNeeded(REGIONS, { bounds: phone(BARCELONA), zoom: 6 }, { train: 'cercanias-madrid:4021C' })).toEqual(['cercanias-madrid']);
  expect(regionsNeeded(REGIONS, undefined, { train: 'cercanias-madrid:4021C' })).toEqual(['cercanias-madrid']);
});

test("loads a region with no extent, as long distance's, which every view needs and whose track file is larger than any view's own, only at the map's second look, so that it holds back neither the first Lines in view nor, zoomed out, the Network tracks (#262)", () => {
  const everywhere = [...REGIONS, { id: 'long-distance', networks: ['ave-larga-distancia'] }];
  expect(firstLook(everywhere, ['catalonia', 'long-distance'])).toEqual(['catalonia']);
  // Zoomed out, where no region is in view, none.
  expect(firstLook(everywhere, ['long-distance'])).toEqual([]);
  // Nor Media Distancia y Avant's, which has an extent, but one as large as the peninsula (#263).
  const md = [...everywhere, { id: 'media-distancia-avant', extent: [-8.77, 36.126, 3.162, 43.745] as ManifestRegion['extent'] }];
  expect(firstLook(md, ['catalonia', 'media-distancia-avant', 'long-distance'])).toEqual(['catalonia']);
  // Nor any of a manifest that names no extents, as one before #266, whose regions all come at the second.
  expect(firstLook(REGIONS.map(({ id }) => ({ id })), ['catalonia', 'cercanias-madrid'])).toEqual([]);
});
