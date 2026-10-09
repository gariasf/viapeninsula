// A spot's rails, feed shapes and Stations, cut out of the last local build's to keep as a test's
// fixture (#251, docs/research/build-report.md, section 5). `npm run snippet -- <lat,lon or spot key>
// <name> [km]` keeps the ways of OpenStreetMap's rails that come within that many km of the spot, 2
// unless given, as the build keeps them in .cache/, and the shapes and Stations there of the spot's
// Line, or of every Line for a lat,lon, from the timetables the build last read, kept in .cache/ too
// (readTimetables()). It writes them to src/build/fixtures/osm/<name>.json, with the credits for
// their data. A spot key names a spot in out/report.json, so first run `npm run daily -- --dry-run`,
// which keeps the rails and timetables too.
// docs/review-a-build-report.md says when to cut one, and how.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { madridDate, type Point, type Station } from '../bundle.ts';
import { NETWORKS } from '../networks.ts';
import { zipSource } from './gtfs.ts';
import { copyOf, RAILWAYS, readFeed } from './networks.ts';
import { osm, type OsmWay } from './osm.ts';
import type { Spot } from './report.ts';
import { metres, nearest, type FeedShape } from './track.ts';

/** OpenStreetMap's rails, and feed shapes with the Stations their Trips serve. */
export interface Snippet {
  rails: OsmWay[];
  shapes: FeedShape[];
  stations: Station[];
}

/**
 * What of a snippet lies within some metres of a point: each way that comes that close, whole, so that
 * its nodes still join the ways they join; each shape's points there; and the Stations there that the
 * shapes' Trips serve. A shape's way back (`<id>:back`, eachWay()) is left out where the shape itself is
 * there: the way back is the same points reversed.
 * ponytail: a shape's points, so a coarse one, as RT2's of 19 points, loses a straight that crosses the
 * circle with no point in it; cut its straights at the circle if a snippet ever needs one. And a shape
 * run both ways is traced only the way the feed draws it: keep its way back too if a trap ever shows
 * only that way, where the feed has no shape of its own for it, as R16 has 51_R16_INV.
 */
export function cut({ rails, shapes, stations }: Snippet, point: Point, within: number): Snippet {
  const near = (p: Point) => metres(p, point) <= within;
  const there = new Set(stations.filter((s) => near([s.lon, s.lat])).map((s) => s.id));
  const ids = new Set(shapes.map((shape) => shape.id));
  const kept = shapes.flatMap((shape) => {
    const coords = shape.coords.filter(near);
    const forward = shape.id.replace(/:back$/, '');
    return coords.length && (forward === shape.id || !ids.has(forward)) ? [{ ...shape, coords, stations: shape.stations.filter((id) => there.has(id)) }] : [];
  });
  const served = new Set(kept.flatMap((shape) => shape.stations));
  return {
    rails: rails.filter((way) => nearest(way.geometry.map((g): Point => [g.lon, g.lat]), point).metres <= within),
    shapes: kept,
    stations: stations.filter((s) => served.has(s.id)),
  };
}

if (import.meta.main) {
  const [at = '', name, given = '2'] = process.argv.slice(2);
  const km = Number(given);
  if (!name || !(km > 0)) throw new Error('Usage: npm run snippet -- <lat,lon or spot key> <name> [km]');
  const latLon = /^(-?[\d.]+),(-?[\d.]+)$/.exec(at);
  const spot = latLon ? undefined : (JSON.parse(await readFile('out/report.json', 'utf8')) as Spot[]).find((s) => s.key === at);
  const point: Point | undefined = latLon ? [Number(latLon[2]), Number(latLon[1])] : spot?.point;
  if (!point) throw new Error(`out/report.json has no spot "${at}" with a point`);

  // The spot's Network's timetables, or every Network's, as the daily build last read them: their
  // copies, which a download it couldn't build the Network from doesn't replace (readTimetables()).
  const networks = NETWORKS.filter((n) => !spot?.network || n.id === spot.network);
  const missing = networks.flatMap((n) => n.timetables.map((t) => copyOf(t))).find((zip) => !existsSync(zip));
  if (missing) throw new Error(`No copy of a timetable at ${missing}: run npm run daily -- --dry-run first`);
  const today = madridDate(new Date());
  const feeds = await Promise.all(networks.flatMap((network) => network.timetables.map((t) => readFeed(zipSource(copyOf(t)), today, { network, ...t }))));
  const shapes = feeds.flatMap((f) => f.shapes).filter((s) => !spot?.line || s.line === spot.line);
  // Each Station once, as two of a Network's timetables can both have it.
  const stations = [...new Map(feeds.flatMap((f) => f.stations).map((s) => [s.id, s])).values()];
  const { rails, downloaded } = await osm(RAILWAYS);
  const snippet = cut({ rails, shapes, stations }, point, km * 1000);
  if (!snippet.shapes.length) throw new Error(`No shape of ${spot?.line ?? 'any Line'} comes within ${km} km of ${at} in the timetables the build last read`);

  const source = {
    rails: `OpenStreetMap's, from Geofabrik's extracts downloaded on ${downloaded}. © OpenStreetMap contributors, under the Open Database License (ODbL) 1.0: https://www.openstreetmap.org/copyright`,
    timetables: networks.filter((n) => snippet.shapes.some((s) => s.line.startsWith(`${n.id}:`))).map((n) => n.credit),
  };
  const dir = 'src/build/fixtures/osm';
  const json = JSON.stringify({ at, km, source, ...snippet });
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/${name}.json`, json);
  console.log(`${dir}/${name}.json: ${snippet.rails.length} ways, ${snippet.shapes.length} shapes, ${snippet.stations.length} Stations, ${Math.round(Buffer.byteLength(json) / 1024)} KB`);
}
