import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { catalonia, osmRails } from './osm.ts';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const RAILWAYS = ['rail', 'narrow_gauge', 'subway', 'tram', 'funicular'];

const temp = () => mkdtemp(join(tmpdir(), 'viapeninsula-'));

/** An extract as Geofabrik serves it, made with osmium from OpenStreetMap's XML. */
async function extract(xml: string): Promise<Uint8Array<ArrayBuffer>> {
  const dir = await temp();
  await writeFile(join(dir, 'in.osm'), `<osm version="0.6">${xml}</osm>`);
  execFileSync('osmium', ['cat', '-o', join(dir, 'out.osm.pbf'), join(dir, 'in.osm')]);
  return new Uint8Array(await readFile(join(dir, 'out.osm.pbf')));
}

const xmlNode = (id: number, lat: number, lon: number) => `<node id="${id}" version="1" lat="${lat}" lon="${lon}"/>`;
const xmlWay = (id: number, nodes: number[], tags: Record<string, string>, version = 1) =>
  `<way id="${id}" version="${version}">${nodes.map((n) => `<nd ref="${n}"/>`).join('')}${Object.entries(tags)
    .map(([k, v]) => `<tag k="${k}" v="${v}"/>`)
    .join('')}</way>`;

// Portbou's track runs on into France through the tunnel, so Spain's extract and Languedoc-Roussillon's
// both have it, whole. Spain's also has a road, which isn't rail.
const SPAIN =
  xmlNode(1, 41.38, 2.14) + xmlNode(2, 41.381, 2.141) + xmlNode(3, 42.43, 3.16) + xmlNode(4, 42.44, 3.15) + xmlNode(5, 41.39, 2.15) +
  xmlWay(10, [1, 2], { railway: 'rail', name: 'Línia R2 Sud, via Vilanova i la Geltrú' }) +
  xmlWay(11, [2, 5], { highway: 'primary' }) +
  xmlWay(12, [3, 4], { railway: 'rail', tunnel: 'yes' });
const LANGUEDOC = (portbou = xmlWay(12, [3, 4], { railway: 'rail', tunnel: 'yes' })) =>
  xmlNode(3, 42.43, 3.16) + xmlNode(4, 42.44, 3.15) + xmlNode(6, 42.46, 3.14) + portbou + xmlWay(13, [4, 6], { railway: 'rail' });

const RAILS = [
  { id: 10, nodes: [1, 2], geometry: [{ lat: 41.38, lon: 2.14 }, { lat: 41.381, lon: 2.141 }], tags: { railway: 'rail', name: 'Línia R2 Sud, via Vilanova i la Geltrú' } },
  { id: 12, nodes: [3, 4], geometry: [{ lat: 42.43, lon: 3.16 }, { lat: 42.44, lon: 3.15 }], tags: { railway: 'rail', tunnel: 'yes' } },
  { id: 13, nodes: [4, 6], geometry: [{ lat: 42.44, lon: 3.15 }, { lat: 42.46, lon: 3.14 }], tags: { railway: 'rail' } },
];

/** Geofabrik, serving Spain's extract and Languedoc-Roussillon's, and Midi-Pyrénées' with no rails. */
async function geofabrik(spain = SPAIN, languedoc = LANGUEDOC()) {
  const files: Record<string, Uint8Array<ArrayBuffer>> = {
    'europe/spain': await extract(spain),
    'europe/france/languedoc-roussillon': await extract(languedoc),
    'europe/france/midi-pyrenees': await extract(''),
  };
  const asked: { url: string; agent: string | null }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    asked.push({ url, agent: new Headers(init.headers).get('User-Agent') });
    const file = files[/^https:\/\/download\.geofabrik\.de\/(.+)-latest\.osm\.pbf$/.exec(url)?.[1] ?? ''];
    return file ? new Response(file) : new Response('Not found', { status: 404 });
  });
  return asked;
}

test("downloads the rails in Spain's extract and those of France's regions beyond Catalonia's border from Geofabrik, and keeps them for the next run", async () => {
  const cache = await temp();
  const asked = await geofabrik();

  expect(await osmRails(RAILWAYS, cache)).toEqual(RAILS);
  expect(asked.map((a) => a.url)).toEqual([
    'https://download.geofabrik.de/europe/spain-latest.osm.pbf',
    'https://download.geofabrik.de/europe/france/languedoc-roussillon-latest.osm.pbf',
    'https://download.geofabrik.de/europe/france/midi-pyrenees-latest.osm.pbf',
  ]);
  expect(asked.every((a) => a.agent?.includes('viapeninsula'))).toBe(true);

  const again = await geofabrik();
  expect(await osmRails(RAILWAYS, cache)).toEqual(RAILS);
  expect(again).toEqual([]);
});

test('uses its copy, with a warning, when Geofabrik fails once the copy is a week old, and downloads the rails again when it answers', async () => {
  const cache = await temp();
  await geofabrik();
  await osmRails(RAILWAYS, cache);
  const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000);
  for (const file of await readdir(cache)) await utimes(join(cache, file), eightDaysAgo, eightDaysAgo);

  vi.stubGlobal('fetch', async () => new Response('Service Unavailable', { status: 503 }));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await osmRails(RAILWAYS, cache)).toEqual(RAILS);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('8 days ago'));

  const asked = await geofabrik();
  expect(await osmRails(RAILWAYS, cache)).toEqual(RAILS);
  expect(asked).toHaveLength(3);
});

test('keeps the newer of two versions of a way, from extracts published a day apart', async () => {
  // Geofabrik publishes the extracts one after another from about midnight UTC, so a build then can
  // get Spain's from one day and France's from the next, and osmium merges two versions of a way as two.
  const renamed = { railway: 'rail', tunnel: 'yes', name: 'Túnel de Portbou' };
  await geofabrik(SPAIN, LANGUEDOC(xmlWay(12, [3, 4], renamed, 2)));
  expect((await osmRails(RAILWAYS, await temp())).filter((way) => way.id === 12)).toEqual([
    { id: 12, nodes: [3, 4], geometry: [{ lat: 42.43, lon: 3.16 }, { lat: 42.44, lon: 3.15 }], tags: renamed },
  ]);
});

test('fails when Geofabrik fails and there is no copy', async () => {
  vi.stubGlobal('fetch', async () => new Response('Service Unavailable', { status: 503 }));
  await expect(osmRails(RAILWAYS, await temp())).rejects.toThrow("Couldn't get OpenStreetMap's rails");
});

test("leaves out rails that haven't opened yet", async () => {
  // Like the new tunnel to El Prat airport, mapped as rail with the year it opens.
  const opening = (id: number, date: string) => xmlWay(id, [1, 2], { railway: 'rail', opening_date: date });
  await geofabrik(xmlNode(1, 41.3, 2.07) + xmlNode(2, 41.29, 2.07) + opening(20, '2999') + opening(21, '2009-02-12'));
  expect((await osmRails(RAILWAYS, await temp())).map((way) => way.id)).toEqual([12, 13, 21]);
});

test("downloads Catalonia's border from the next Overpass mirror when one times out or finds none, and keeps it for the next run", async () => {
  const cache = await temp();
  const border = { type: 'way', geometry: [{ lat: 42.43, lon: 3.16 }, { lat: 42.44, lon: 3.15 }] };
  const asked: { url: string; agent: string | null }[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    asked.push({ url, agent: new Headers(init.headers).get('User-Agent') });
    if (asked.length === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    return new Response(JSON.stringify({ elements: asked.length === 2 ? [] : [border] }));
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  expect(await catalonia(cache)).toEqual([[[3.16, 42.43], [3.15, 42.44]]]);
  expect(asked.map((a) => a.url)).toEqual([
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ]);
  // overpass-api.de refuses requests without a User-Agent.
  expect(asked.every((a) => a.agent?.includes('viapeninsula'))).toBe(true);

  asked.length = 0;
  expect(await catalonia(cache)).toEqual([[[3.16, 42.43], [3.15, 42.44]]]);
  expect(asked).toEqual([]);
});
