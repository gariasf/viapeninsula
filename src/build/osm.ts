// OpenStreetMap's rails, from Geofabrik's extracts filtered with osmium (ADR-0009), and Catalonia's
// border, from Overpass.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { madridDate, type Point } from '../bundle.ts';

/** One of OpenStreetMap's ways, with its nodes' positions. */
export interface OsmWay {
  id: number;
  nodes: number[];
  geometry: { lat: number; lon: number }[];
  tags: Record<string, string>;
}

/**
 * Geofabrik's extracts that hold the rails the Lines run on: Spain's, and those of the French
 * regions along Catalonia's border, as Spain's reaches only a little way into France.
 * ponytail: the regions today's Lines reach; Portugal and Aquitaine come with the Lines that cross there (ADR-0009).
 */
const EXTRACTS = ['europe/spain', 'europe/france/languedoc-roussillon', 'europe/france/midi-pyrenees'];

/** How long all of EXTRACTS may take to download: Spain's 1.5 GB took 4 min on a home line, and the daily job has an hour. */
const DOWNLOAD = 20 * 60_000;

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// overpass-api.de refuses requests without one.
const USER_AGENT = 'viapeninsula (https://github.com/gariasf/viapeninsula)';

/** Rails change slowly, so a copy less than a week old saves downloading them again. */
const FRESH = 7 * 24 * 60 * 60 * 1000;

const run = promisify(execFile);

/** The ways in Geofabrik's EXTRACTS whose `railway` tag is one of these, from the cache or from Geofabrik. */
export async function osmRails(railways: string[], cache = '.cache'): Promise<OsmWay[]> {
  return kept(join(cache, `rails-${hash(JSON.stringify([EXTRACTS, railways]))}.opl`), "OpenStreetMap's rails", () => geofabrik(railways), rails);
}

/** Catalonia's border, as the ways that make it up, in no order, from the cache or from Overpass. */
export async function catalonia(cache = '.cache'): Promise<Point[][]> {
  const query = '[out:json][timeout:180];rel["ISO3166-2"="ES-CT"];way(r);out skel geom qt;';
  const read = (text: string) => {
    const { elements } = JSON.parse(text) as { elements: Pick<OsmWay, 'geometry'>[] };
    if (!elements.length) throw new Error("Overpass found no border for Catalonia");
    return elements.map((way) => way.geometry.map((g): Point => [g.lon, g.lat]));
  };
  return kept(join(cache, `osm-${hash(query)}.json`), "Catalonia's border", () => overpass(query, read), read);
}

/**
 * What `get` gives, read by `read`, kept in `file`: a copy less than FRESH old is read without
 * getting it again, and when getting it fails, the last copy is, however old, with a warning. With
 * no copy, it fails.
 */
async function kept<T>(file: string, what: string, get: () => Promise<string>, read: (text: string) => T): Promise<T> {
  const age = await stat(file).then((s) => Date.now() - s.mtimeMs, () => Infinity);
  if (age < FRESH) return read(await readFile(file, 'utf8'));
  try {
    const text = await get();
    const got = read(text);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text);
    return got;
  } catch (error) {
    if (age === Infinity) throw new Error(`Couldn't get ${what}`, { cause: error });
    console.warn(`Couldn't get ${what} (${error instanceof Error ? error.message : error}), so using the copy from ${Math.round(age / 86_400_000)} days ago`);
    return read(await readFile(file, 'utf8'));
  }
}

/**
 * The ways in EXTRACTS whose `railway` tag is one of these, with their nodes' positions, as osmium
 * writes them in its text format, OPL.
 */
async function geofabrik(railways: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'viapeninsula-'));
  try {
    const signal = AbortSignal.timeout(DOWNLOAD);
    const parts: string[] = [];
    // One extract on disk at a time, until its rails are out of it: Spain's is 1.5 GB, its rails 4 MB.
    // ponytail: each extract's latest file only; its dated files are there if that fails with no copy kept.
    for (const [i, extract] of EXTRACTS.entries()) {
      const url = `https://download.geofabrik.de/${extract}-latest.osm.pbf`;
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal });
      if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
      await writeFile(join(dir, 'extract.osm.pbf'), res.body);
      const part = join(dir, `${i}.osm.pbf`);
      await run('osmium', ['tags-filter', '-o', part, join(dir, 'extract.osm.pbf'), `w/railway=${railways.join(',')}`]);
      parts.push(part);
    }
    // Neighbouring extracts overlap, and merging keeps one copy of what they share, unless they're
    // from different days: then it keeps both versions of what changed in between, the newer last.
    await run('osmium', ['merge', '-o', join(dir, 'rails.osm.pbf'), ...parts]);
    await run('osmium', ['add-locations-to-ways', '-f', 'opl,add_metadata=false', '-o', join(dir, 'rails.opl'), join(dir, 'rails.osm.pbf')]);
    return await readFile(join(dir, 'rails.opl'), 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** What the first Overpass mirror to answer a query answers, if `read` can read it. */
async function overpass(query: string, read: (text: string) => unknown): Promise<string> {
  for (const mirror of MIRRORS) {
    try {
      const res = await fetch(mirror, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(200_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      read(text);
      return text;
    } catch (error) {
      console.warn(`${mirror}: ${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error('no Overpass mirror answered');
}

/**
 * The ways in OPL, each a line of fields that start with a letter: `w` its id, `T` its tags and `N`
 * its nodes, as n<id>x<lon>y<lat>. Characters that would break a line up are escaped as %<hex>%.
 */
function rails(opl: string): OsmWay[] {
  const unescape = (s: string) => s.replace(/%([0-9a-f]+)%/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
  const ways = opl.split('\n').flatMap((line): OsmWay[] => {
    if (!line.startsWith('w')) return [];
    const field = new Map(line.split(' ').map((f) => [f.charAt(0), f.slice(1)]));
    const way: OsmWay = { id: Number(field.get('w')), nodes: [], geometry: [], tags: {} };
    for (const tag of field.get('T')?.split(',') ?? []) {
      const [key = '', value = ''] = tag.split('=').map(unescape);
      way.tags[key] = value;
    }
    for (const node of field.get('N')?.split(',') ?? []) {
      const [, id, lon, lat] = /^n(\d+)x([-\d.]+)y([-\d.]+)$/.exec(node) ?? [];
      if (!id || !lon || !lat) continue; // a node with no position in the extracts
      way.nodes.push(Number(id));
      way.geometry.push({ lat: Number(lat), lon: Number(lon) });
    }
    return [way];
  });
  if (!ways.length) throw new Error("Geofabrik's extracts have no rails");
  // Each way's last version, the newest, where two extracts from different days both have it.
  const newest = new Map(ways.map((way) => [way.id, way]));
  // Some lines are mapped as rail before they open, with the date they will: 2027 for El Prat airport's new tunnel.
  const today = madridDate(new Date());
  return [...newest.values()].filter((way) => !(way.tags.opening_date && way.tags.opening_date > today));
}

/** A short name for some text, the start of its SHA-256, which changes when the text does. */
function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}
