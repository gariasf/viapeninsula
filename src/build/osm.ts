// OpenStreetMap's rails and Spain's border, from Geofabrik's extracts filtered with osmium (ADR-0009).

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

/** The relation OpenStreetMap maps Spain's border by, by land and by sea, as osmium matches it. */
const SPAIN = 'r/ISO3166-1=ES';

const USER_AGENT = 'viapeninsula (https://github.com/gariasf/viapeninsula)';

/** Rails change slowly, so a copy less than a week old saves downloading them again. */
const FRESH = 7 * 24 * 60 * 60 * 1000;

const run = promisify(execFile);

/**
 * The ways in Geofabrik's EXTRACTS whose `railway` tag is one of these, the nodes on them where Trains
 * change gauge (`changers`), and Spain's border, as the ways that make it up, in no order, from the
 * cache or from Geofabrik, and the day that copy was downloaded.
 */
export async function osm(railways: string[], cache = '.cache') {
  const file = join(cache, `osm-${hash(JSON.stringify([EXTRACTS, railways, SPAIN]))}.opl`);
  const got = await kept(file, "OpenStreetMap's rails and Spain's border", () => geofabrik(railways), readOpl);
  return { ...got, downloaded: madridDate((await stat(file)).mtime) };
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
 * The ways in EXTRACTS whose `railway` tag is one of these, and those of Spain's border, with their
 * nodes' positions, as osmium writes them in its text format, OPL.
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
      const file = join(dir, 'extract.osm.pbf');
      await writeFile(file, res.body);
      const [rails, border] = [join(dir, `${i}.osm.pbf`), join(dir, `${i}-border.osm.pbf`)];
      await run('osmium', ['tags-filter', '-o', rails, file, `w/railway=${railways.join(',')}`]);
      // Spain's relation alone, as tags-filter would bring the regions it lists within it too, and
      // theirs, down to each town's; then the ways it's made of. getid exits 1 when the extract lacks
      // some, as each lacks those round the Canary Islands and the islets off Morocco.
      const { stdout } = await run('osmium', ['tags-filter', '-R', '-f', 'opl', file, SPAIN]);
      // Each of EXTRACTS borders Spain, so has its relation. Another so tagged would add rings that
      // turn the land inside them out.
      const relations = stdout.split('\n').filter((line) => line.startsWith('r'));
      if (relations.length !== 1) throw new Error(`${extract} has ${relations.length} relations matching ${SPAIN}, not Spain's alone`);
      await run('osmium', ['getid', '-r', '-o', border, file, ...(relations[0]?.match(/(?<=[M,])w\d+(?=@)/g) ?? [])]).catch((error: { code?: unknown }) => {
        if (error.code !== 1) throw error;
      });
      parts.push(rails, border);
    }
    // Neighbouring extracts overlap, and merging keeps one copy of what they share, unless they're
    // from different days: then it keeps both versions of what changed in between, the newer last.
    await run('osmium', ['merge', '-o', join(dir, 'merged.osm.pbf'), ...parts]);
    await run('osmium', ['add-locations-to-ways', '-f', 'opl,add_metadata=false', '-o', join(dir, 'merged.opl'), join(dir, 'merged.osm.pbf')]);
    return await readFile(join(dir, 'merged.opl'), 'utf8');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * The rails, their nodes where Trains change gauge, and Spain's border in OPL, where each way is a line
 * of fields that start with a letter: `w` its id, `T` its tags and `N` its nodes, as n<id>x<lon>y<lat>.
 * A node with tags, as a changer, is a line too, `n` its id. Characters that would break a line up are
 * escaped as %<hex>%.
 */
function readOpl(opl: string): { rails: OsmWay[]; changers: Set<number>; border: Point[][] } {
  const unescape = (s: string) => s.replace(/%([0-9a-f]+)%/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
  const fields = (line: string) => new Map(line.split(' ').map((f) => [f.charAt(0), f.slice(1)]));
  const tags = (field: Map<string, string>) => {
    const all: Record<string, string> = {};
    for (const tag of field.get('T')?.split(',') ?? []) {
      const [key = '', value = ''] = tag.split('=').map(unescape);
      all[key] = value;
    }
    return all;
  };
  const lines = opl.split('\n');
  // Where standard-gauge and Iberian-gauge track meet, as at Zaragoza Delicias (#259).
  const changers = new Set(
    lines.flatMap((line) => {
      const field = line.startsWith('n') ? fields(line) : undefined;
      return field && tags(field).railway === 'gauge_conversion' ? [Number(field.get('n'))] : [];
    }),
  );
  const ways = lines.flatMap((line): OsmWay[] => {
    if (!line.startsWith('w')) return [];
    const field = fields(line);
    const way: OsmWay = { id: Number(field.get('w')), nodes: [], geometry: [], tags: tags(field) };
    for (const node of field.get('N')?.split(',') ?? []) {
      const [, id, lon, lat] = /^n(\d+)x([-\d.]+)y([-\d.]+)$/.exec(node) ?? [];
      if (!id || !lon || !lat) continue; // a node with no position in the extracts
      way.nodes.push(Number(id));
      way.geometry.push({ lat: Number(lat), lon: Number(lon) });
    }
    return [way];
  });
  // Each way's last version, the newest, where two extracts from different days both have it.
  const newest = [...new Map(ways.map((way) => [way.id, way])).values()];
  const rails = newest.filter((way) => way.tags.railway);
  if (!rails.length) throw new Error("Geofabrik's extracts have no rails");
  // Each ring of Spain's border closes, where every way's ends meet another's, or its own: across a gap,
  // crop() would take the land on one side of it for the other. Rings no extract reaches are missing whole.
  // ponytail: the border's ways are those that aren't rails, so one also tagged as a railway would read
  // as a gap; take them by Spain's relation, merged in with them, if one ever is.
  const border = newest.filter((way) => !way.tags.railway);
  const ends = new Map<number | undefined, number>();
  for (const { nodes } of border) for (const node of [nodes[0], nodes.at(-1)]) ends.set(node, (ends.get(node) ?? 0) + 1);
  if (!border.length || [...ends.values()].some((n) => n % 2)) throw new Error("Spain's border isn't whole in Geofabrik's extracts");
  // Some lines are mapped as rail before they open, with the date they will: 2027 for El Prat airport's new tunnel.
  const today = madridDate(new Date());
  return {
    rails: rails.filter((way) => !(way.tags.opening_date && way.tags.opening_date > today)),
    changers,
    border: border.map((way) => way.geometry.map((g): Point => [g.lon, g.lat])),
  };
}

/** A short name for some text, the start of its SHA-256, which changes when the text does. */
function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}
