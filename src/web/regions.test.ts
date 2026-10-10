import { expect, test } from 'vitest';
import type { DayFiles, DayTrips, Track, Trip } from '../bundle.ts';
import { regionLoader } from './regions.ts';

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
