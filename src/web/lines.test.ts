import { expect, test } from 'vitest';
import { along, BANDS, coveredIn, cutIn, GRAPH_BAND, inBand, smoothId, type DayFiles, type DayTrips, type Line, type Shape, type Stroke, type Track } from '../bundle.ts';
import { byRegion, drawnFrom, drawnLines, type Drawing } from './lines.ts';
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

test('draws a stroke cut back alike in every band from GRAPH_BAND once, band-less, and each band still draws every stroke as it is there, point for point (#734)', () => {
  // A centreline 10 km east, a point every 10 m, and a copy smoothed for zoom 12's band.
  const line = (id: string): Shape => ({ id, coords: Array.from({ length: 1001 }, (_, k): [number, number] => [2 + k * 0.0001, 41]), dist: Array.from({ length: 1001 }, (_, k) => k * 10) });
  const shapes = new Map<string, Shape>([line('s:a'), { ...line(smoothId('s:b', BANDS.indexOf(12))), coords: line('').coords.map(([x]): [number, number] => [x, 41.001]) }, line('s:b')].map((s) => [s.id, s]));
  const graph = BANDS.flatMap((_, band) => (band >= GRAPH_BAND ? [band] : []));
  const stroke = (shape: string, cut: [number, number][]): Stroke => ({ line: 'L', shape, from: 1000, to: 9000, side: 1, cut });
  const strokes = [
    stroke('s:a', graph.map(() => [105, 55])), // alike
    stroke('s:a', graph.map((_, k) => [100 * k + 5, 0])), // each band its own
    stroke('s:a', graph.map((_, k) => [105, 10 * k])), // each band its own end
    stroke('s:a', graph.map(() => [5000, 3000])), // cut away in every band
    { ...stroke('s:a', graph.map(() => [105, 55])), covered: [[GRAPH_BAND, 3000, 4000] as [number, number, number]] }, // alike, but covered in a band
    stroke('s:b', graph.map(() => [105, 55])), // alike, but along a centreline smoothed in one band
    { ...stroke('s:a', [[105, 55]]), band: GRAPH_BAND }, // a curve's band only
  ];
  const lines = new Map<string, Line>([['L', { id: 'L', network: 'n', name: 'L', colour: '#f00', shapes: [], kind: 'regional' } as Line]]);
  const features = drawnLines(strokes, { shapes, lines, lettering: () => '#fff', rank: 0, nameSize: 12 });
  for (const band of graph) {
    const drawn = features.filter((f) => (f.properties?.band ?? band) === band).map((f) => (f.geometry as GeoJSON.LineString).coordinates);
    const expected = strokes.flatMap((s) => {
      const [start, end] = cutIn(s, band);
      if ((s.band ?? band) !== band || start + end >= s.to - s.from) return [];
      return coveredIn({ ...s, from: s.from + start, to: s.to - end }, band).map((p) => along(inBand(shapes, s.shape, band) as Shape, p.from, p.to));
    });
    expect(drawn).toEqual(expected);
  }
  // The stroke cut alike goes once, without a band; the others once in each band they're drawn in.
  expect(features.map((f) => f.properties?.band)).toEqual([undefined, ...graph, ...graph, GRAPH_BAND, GRAPH_BAND, GRAPH_BAND, ...graph.slice(1), ...graph, GRAPH_BAND]);
});

test("draws Media Distancia's and long distance's Lines under the other regions' where they share track, but over those in tunnels, and keeps every region in the manifest's order, names and all (#736, #787)", () => {
  const shapes = new Map<string, Shape>([['s', { id: 's', coords: [[2, 41], [2.01, 41]], dist: [0, 840] }]]);
  const lines = new Map<string, Line>(['R15', 'R2', 'C1', 'Avant', 'Alvia'].map((name): [string, Line] => [name, { id: name, network: 'n', name, colour: '#f00', shapes: [], kind: 'regional' } as Line]));
  const stroke = (line: string, under?: number): Stroke => ({ line, shape: 's', from: 0, to: 840, side: 0, band: GRAPH_BAND, ...(under && { under }) });
  const drawn = (strokes: Stroke[], rank: number, under = false) => drawnLines(strokes, { shapes, lines, lettering: () => '#fff', rank, under, nameSize: 12 }).map((f) => f.properties as { line: string; sort: number; rank: number });
  // Catalonia first in the manifest, Madrid next, Media Distancia y Avant just before long distance, last.
  const features = [...drawn([stroke('R15'), stroke('R2'), stroke('R15', 1)], 0), ...drawn([stroke('C1')], 1), ...drawn([stroke('Avant')], 15, true), ...drawn([stroke('Alvia')], 16, true)];
  const order = features.toSorted((a, b) => a.sort - b.sort).map((f) => `${f.line}${f === features[2] ? ' in a tunnel' : ''}`);
  expect(order).toEqual(['R15 in a tunnel', 'Avant', 'Alvia', 'R15', 'C1', 'R2']);
  // Their names are still placed in the manifest's order, long distance's last.
  expect(features.map((f) => f.rank)).toEqual([0, 0, 0, 1, 15, 16]);
});

test("draws long distance's and Media Distancia's Networks from every zoom, Metro's and TRAM's from zoom 10, and the rest from zoom 7, by their Lines' kinds (#781)", () => {
  const from = drawnFrom([
    { network: 'ave-larga-distancia', kind: 'long-distance' },
    { network: 'media-distancia-avant', kind: 'regional' },
    // Rodalies runs regional Lines too, but mostly commuter ones.
    { network: 'rodalies', kind: 'commuter' },
    { network: 'rodalies', kind: 'regional' },
    // FGC's funicular and rack Lines don't make it local.
    { network: 'fgc', kind: 'commuter' },
    { network: 'fgc', kind: 'funicular' },
    // The Metro's Montjuïc funicular doesn't take it from zoom 10.
    { network: 'metro', kind: 'metro' },
    { network: 'metro', kind: 'funicular' },
    { network: 'tram', kind: 'tram' },
    // Cercanías Cádiz's T1 is a tram.
    { network: 'cercanias-cadiz', kind: 'commuter' },
    { network: 'cercanias-cadiz', kind: 'tram' },
  ]);
  expect(Object.fromEntries(from)).toEqual({ 'ave-larga-distancia': 0, 'media-distancia-avant': 0, rodalies: 7, fgc: 7, metro: 10, tram: 10, 'cercanias-cadiz': 7 });
});

test("leaves a Line's strokes out of the bands below its Network's zoom: Metro's and TRAM's below zoom 10 (#781)", () => {
  const shape: Shape = { id: 'a', coords: [[2, 41], [2.01, 41]], dist: [0, 1000] };
  const lines = new Map<string, Line>([
    ['L1', { id: 'L1', network: 'metro', name: 'L1', colour: '#f00', shapes: ['a'], kind: 'metro' }],
    ['R1', { id: 'R1', network: 'rodalies', name: 'R1', colour: '#0f0', shapes: ['a'], kind: 'commuter' }],
  ]);
  const strokes = ['L1', 'R1'].flatMap((line) => BANDS.map((_, band) => ({ line, shape: 'a', from: 0, to: 1000, side: 0, band }) as Stroke));
  const features = drawnLines(strokes, { shapes: new Map([['a', shape]]), lines, lettering: () => undefined, rank: 0, nameSize: 12, shownFrom: drawnFrom(lines.values()) });
  const bands = (line: string) => features.filter((f) => f.properties?.line === line).map((f) => BANDS[f.properties?.band]);
  expect(bands('L1')).toEqual([10, 11, 12, 13, 14]);
  expect(bands('R1')).toEqual(BANDS);
});
