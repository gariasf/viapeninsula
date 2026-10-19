import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, test } from 'vitest';
import { places, type Track } from '../bundle.ts';
import { decodeTrack, encodeTrack } from '../pieces.ts';
import { namePlacer, nameWork, packFile, type NamePlace, type Sizes } from './placeNames.ts';

// As main.ts's, at 19 Oct 2026: the worker and the page lay names out with the same, whatever they are.
const SIZES: Sizes = { dot: [[7, 1.5], [14, 5]], ring: [[7, 0.5], [14, 1.5]], pillHalo: 1.5, nameGap: 3, nameZooms: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18], top: 2, signSize: [[12.5, 0.75], [13, 0.8], [15, 1]], signZoom: 13 };

// One region's track, Barcelona's of 7 Oct 2026, as its file stores it and as the page reads it.
const { bundle } = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/replay-2026-10-07.json.gz', import.meta.url))).toString()) as { bundle: Track };
const file = encodeTrack(bundle);
const track = decodeTrack(file);
const named: NamePlace[] = places(track.stations).map((p, i) => ({ id: p.id, dot: [p.lon, p.lat], served: p.networks, size: [6 * p.name.length, 14], nameZoom: [9, 12][i % 2] ?? 12, larger: i % 3 === 0 ? SIZES.top : 0, marks: i % 4, type: 11 }));
const keep = new Map(track.lines.map((l) => [l.id, 1]));
const pills = new Map(track.lines.map((l) => [l.id, { zoom: 10, box: [24, 9] as [number, number] }]));

test("the worker lays every name out where the page does, from the region's file handed over as typed arrays (#777)", { timeout: 60_000 }, () => {
  const page = namePlacer(SIZES);
  page.put([track], false, keep, named);
  const work = nameWork();
  work({ sizes: SIZES });
  const packed = packFile(file);
  // As postMessage() hands it over: a copy, its numbers' buffers moved rather than copied.
  const ask = { put: { regions: [{ key: 1, file: packed }], keep: [...keep], places: named } };
  expect(work(structuredClone(ask, { transfer: [packed.numbers.buffer, packed.lengths.buffer] }))).toBeUndefined();
  expect(packed.numbers.byteLength).toBe(0);
  for (const bearing of [0, 37, -120]) {
    const where = page.lay(pills, bearing);
    expect(where).toHaveLength(named.length);
    expect(Object.keys(where[0] ?? {})).toContain('anchor12');
    expect(work(structuredClone({ lay: { pills: [...pills], bearing, ask: 7 } }))).toEqual({ ask: 7, where });
  }
  // A region it holds isn't handed over again.
  page.put([track], false, keep, named.slice(1));
  work(structuredClone({ put: { regions: [{ key: 1 }], keep: [...keep], places: named.slice(1) } }));
  expect(work({ lay: { pills: [...pills], bearing: 0 } })?.where).toEqual(page.lay(pills, 0));
});
