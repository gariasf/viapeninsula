// OpenStreetMap's rails for Catalonia, from Overpass.

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { madridDate } from '../bundle.ts';

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

/** The ways in Catalonia whose `railway` tag is one of these, from the cache or from Overpass. */
export async function osmRails(railways: string[], cache = '.cache'): Promise<OsmWay[]> {
  const query = `[out:json][timeout:180];area["ISO3166-2"="ES-CT"]->.catalonia;way["railway"~"^(${railways.join('|')})$"](area.catalonia);out body geom qt;`;
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
      const ways = parse(text);
      await mkdir(cache, { recursive: true });
      await writeFile(file, text);
      return ways;
    } catch (error) {
      console.warn(`${mirror}: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (age === Infinity) throw new Error("Couldn't download OpenStreetMap's rails from any Overpass mirror");
  console.warn(`Using OpenStreetMap's rails from ${Math.round(age / 86_400_000)} days ago`);
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
