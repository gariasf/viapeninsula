// OpenStreetMap's rails for Catalonia and a margin beyond its land border, and the border itself, from Overpass.

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { madridDate, type Point } from '../bundle.ts';

/** A way as Overpass returns it with `out geom`. */
export interface OsmWay {
  id: number;
  nodes: number[];
  geometry: { lat: number; lon: number }[];
  tags: Record<string, string>;
}

const MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// overpass-api.de refuses requests without one.
const USER_AGENT = 'viapeninsula (https://github.com/gariasf/viapeninsula)';

/** Rails change slowly, so a copy less than a week old saves asking Overpass again. */
const FRESH = 7 * 24 * 60 * 60 * 1000;

/**
 * Rails within this many metres beyond Catalonia's border are fetched too, so a Line's track reaches
 * the first Station beyond it: Nonaspe, on R15 to Caspe, is about 6 km past it.
 * ponytail: one margin sized from Nonaspe; widen it if a Line's first Station beyond lies further.
 */
const MARGIN = 10_000;

/** The ways in Catalonia, or within MARGIN of its border, whose `railway` tag is one of these, from the cache or from Overpass. */
export async function osmRails(railways: string[], cache = '.cache'): Promise<OsmWay[]> {
  const rail = `way["railway"~"^(${railways.join('|')})$"]`;
  // The margin runs along the land border only, the ways Catalonia shares with Aragon, Valencia,
  // France and Andorra: around the whole border, coast and all, Overpass runs out of memory.
  const landBorder =
    'rel["ISO3166-2"="ES-CT"];way(r)->.ct;rel["ISO3166-2"~"^ES-(AR|VC)$"];way(r)->.es;' +
    'rel["ISO3166-1"~"^(FR|AD)$"]["admin_level"="2"];way(r)->.abroad;(way.ct.es;way.ct.abroad;)->.border;';
  const query = `[out:json][timeout:180];area["ISO3166-2"="ES-CT"]->.catalonia;${landBorder}(${rail}(area.catalonia);${rail}(around.border:${MARGIN}););out body geom qt;`;
  return overpass(query, cache, "OpenStreetMap's rails", parse);
}

/** Catalonia's border, as the ways that make it up, in no order, from the cache or from Overpass. */
export async function catalonia(cache = '.cache'): Promise<Point[][]> {
  const query = '[out:json][timeout:180];rel["ISO3166-2"="ES-CT"];way(r);out skel geom qt;';
  return overpass(query, cache, "Catalonia's border", (text) => {
    const { elements } = JSON.parse(text) as { elements: Pick<OsmWay, 'geometry'>[] };
    if (!elements.length) throw new Error("Overpass found no border for Catalonia");
    return elements.map((way) => way.geometry.map((g): Point => [g.lon, g.lat]));
  });
}

/** What Overpass answers a query, read by `parse`, from a copy less than FRESH old or else the first mirror that answers. */
async function overpass<T>(query: string, cache: string, what: string, parse: (text: string) => T): Promise<T> {
  const file = join(cache, `osm-${createHash('sha256').update(query).digest('hex').slice(0, 12)}.json`);
  const age = await stat(file).then((s) => Date.now() - s.mtimeMs, () => Infinity);
  if (age < FRESH) return parse(await readFile(file, 'utf8'));

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
      const parsed = parse(text);
      await mkdir(cache, { recursive: true });
      await writeFile(file, text);
      return parsed;
    } catch (error) {
      console.warn(`${mirror}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (age === Infinity) throw new Error(`Couldn't download ${what} from any Overpass mirror`);
  console.warn(`Using ${what} from ${Math.round(age / 86_400_000)} days ago`);
  return parse(await readFile(file, 'utf8'));
}

function parse(text: string): OsmWay[] {
  const json = JSON.parse(text) as { elements: OsmWay[]; remark?: string };
  // A query that runs out of time still answers 200, with what it found so far and a remark.
  if (json.remark) throw new Error(json.remark);
  if (!json.elements.length) throw new Error('Overpass found no rails');
  // Some lines are mapped as rail before they open, with the date they will: 2027 for El Prat airport's new tunnel.
  const today = madridDate(new Date());
  return json.elements.filter((way) => !(way.tags.opening_date && way.tags.opening_date > today));
}
