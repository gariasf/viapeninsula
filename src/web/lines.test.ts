import { expect, test } from 'vitest';
import type { DayFiles, DayTrips, Track } from '../bundle.ts';
import { byRegion, type Drawing } from './lines.ts';
import { daysAsTheyCome, joinedFrom, regionLoader } from './regions.ts';

/** A region's track of one Station and no Lines, named for it. */
const track = (id: string): Track => ({ networks: [], lines: [], stations: [{ id: `adif:${id}`, name: id, lon: 2, lat: 41 }], shapes: [], strokes: [], rails: [], slots: [], tracks: [] });
/** A drawing of one Line and one rail, as the map makes a region's. */
const drawing = (): Drawing => ({ lines: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }], rails: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }] });

test("makes a region's Lines once for its track, hands MapLibre those of the regions new to it, and takes off those of regions no longer joined (#733)", () => {
  const regions = byRegion();
  const [catalonia, madrid, longDistance] = [track('catalonia'), track('cercanias-madrid'), track('long-distance')];
  let made = 0;
  const make = (t: Track) => regions.made(t, () => (made++, drawing()));
  const first = [make(catalonia), make(longDistance)];
  expect(regions.handOver(first)).toEqual({ add: first, remove: [] });
  // Madrid joins: Catalonia's and long distance's are made and handed over already.
  const second = [make(catalonia), make(madrid), make(longDistance)];
  expect(made).toBe(3);
  expect(regions.handOver(second)).toEqual({ add: [second[1]], remove: [] });
  expect(regions.handOver(second)).toEqual({ add: [], remove: [] });
  // Catalonia's file fails at a later look, and its day is drawn without it.
  expect(regions.handOver([make(madrid), make(longDistance)])).toEqual({ add: [], remove: [first[0]] });
  // Each feature has an ID of its own, which MapLibre takes it off by.
  const ids = second.flatMap((d) => [...d.lines, ...d.rails].map((f) => f.id));
  expect(new Set(ids).size).toBe(6);
});

test("lays a region new to the map out once, at its track, though its Trips and the next day's come after: every step is joined from the same regions' tracks (#733)", async () => {
  const ids = ['catalonia', 'long-distance'];
  // Two days, as after 23:00 (#659), of one build, which share each region's track file (ADR-0014).
  const days: DayFiles[] = ['2026-10-13', '2026-10-14'].map((date) => ({ date, from: 0, to: 1, regions: ids.map((id) => ({ id, track: `${id}.track`, trips: `${id}.${date}.trips` })) }));
  const files = new Map<string, unknown>(ids.flatMap((id) => [[`${id}.track`, track(id)], ...days.map((d): [string, DayTrips] => [`${id}.${d.date}.trips`, { serviceDay: d.date, noonMinus12h: Date.parse(d.date), trips: [] }])]));
  const load = regionLoader(<T>(key: string) => Promise.resolve(files.get(key) as T), new Map(), () => {});
  const { track: first } = await load.trackOf(days[0] as DayFiles);
  const shown = [first];
  for await (const { bundle } of daysAsTheyCome(days, load.bundleOf)) if (bundle) shown.push(bundle);
  expect(shown).toHaveLength(3);
  // show() lays the map out again only for Stations it hasn't drawn.
  expect(new Set(shown.map((s) => s.stations)).size).toBe(1);
  // And each region's Lines are made once, by its track.
  const regions = byRegion();
  let made = 0;
  for (const s of shown) for (const { track: t } of joinedFrom(s) ?? []) regions.made(t, () => (made++, drawing()));
  expect(joinedFrom(first)?.map((r) => r.id)).toEqual(ids);
  expect(made).toBe(2);
});
