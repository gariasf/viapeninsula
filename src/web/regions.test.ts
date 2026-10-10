import { expect, test } from 'vitest';
import type { DayFiles, DayTrips, ManifestRegion, Point, Shape, Track, Trip } from '../bundle.ts';
import { metres } from '../build/track.ts';
import { encodeTrack } from '../pieces.ts';
import { forgetJoined, regionLoader, regionsNeeded } from './regions.ts';

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

// Where some regions lie, as the daily build of 10 Oct 2026 found them: west, south, east, north.
const REGIONS: Pick<ManifestRegion, 'id' | 'networks' | 'extent'>[] = [
  { id: 'catalonia', networks: ['rodalies', 'fgc', 'tram', 'metro'], extent: [-0.86, 40.596, 3.161, 42.447] },
  { id: 'cercanias-madrid', networks: ['cercanias-madrid'], extent: [-4.269, 40.035, -3.182, 40.738] },
  { id: 'cercanias-sevilla', networks: ['cercanias-sevilla'], extent: [-6.208, 36.912, -5.53, 37.933] },
  { id: 'cercanias-leon', networks: ['cercanias-leon'], extent: [-5.566, 42.616, -4.845, 42.865] },
  // Its C4 runs to León (#368).
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

test("below zoom 7 loads no region for the view, as the file below zoom 7 draws every region's track there, but one with no extent at every view, as long distance's will be, and every region of a manifest from before #266", () => {
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
  // León's Station is in León's region and in Bilbao's, whose C4 runs to it.
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
