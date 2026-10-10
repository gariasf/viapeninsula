// Replays recordings second by second and counts, by Network, where a followed Train's card and the Train
// drawn on the map disagree (#352): the yardstick is cardVsMap.ts's. `npm run card-vs-map -- <dir>...`
// reads each <dir>'s bundle.json (a whole day's, as `npm run record` or a Record run's artifact has it)
// and replay.json.gz, and prints one JSON object of counts, in Train-seconds, to stdout. Nothing in the
// map changes: the engine's own onMap() is what it samples, from a copy of src/engine.ts with it exported.
//
// - `LIMIT=<seconds>` replays only that long, for a look;
// - `ZOOM=<n>` is the zoom the followed pill's reach is worked out at (13, the follow zoom's floor);
// - the Networks' live traits are src/networks.ts's, as an older bundle's can differ or be missing.

import { rmSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { DEGREE, type Bundle, type Station, type Trip } from './bundle.ts';
import { differences, type Moment, type Near } from './cardVsMap.ts';
import type { Received } from './engine.ts';
import { NETWORKS } from './networks.ts';

// The engine with its onMap() exported: the replay's own answer for each Trip, and what it knows about it.
const engineSource = await readFile(new URL('./engine.ts', import.meta.url), 'utf8');
const engineCopy = join(await mkdtemp(join(tmpdir(), 'card-vs-map-')), 'engine.ts');
// The copy imports only bundle.ts: say so if the engine ever imports another sibling, which the copy couldn't find in the temporary directory.
if ((engineSource.match(/from '\.\//g) ?? []).length !== 1 || !engineSource.includes("from './bundle.ts'")) throw new Error("src/engine.ts imports more than ./bundle.ts: make the copy resolve them too");
await writeFile(engineCopy, `${engineSource.replace("from './bundle.ts'", `from '${new URL('./bundle.ts', import.meta.url).href}'`)}\nexport { onMap };\n`);
process.on('exit', () => rmSync(dirname(engineCopy), { recursive: true, force: true }));
interface OnMap {
  train?: { dist: number; lon: number; lat: number; standsAt?: string; live: boolean };
  trip: Trip;
  now: number;
  time: number;
  delay: number;
  calls: Trip['calls'];
  network: { id: string; profile: Moment['profile'] };
  profile: Moment['profile'];
  said?: { confirmed?: number; report: { position?: unknown } };
}
const { onMap } = (await import(pathToFileURL(engineCopy).href)) as {
  onMap: (bundle: Bundle, at: number, received: Received[]) => { of: (trip: Trip) => OnMap | undefined };
};

const [PILL_TEXT, FOLLOWED_TEXT, PILL_PADDING, ARROW_GAP] = [10, 12, 2, 7];
const zoom = Number(process.env.ZOOM ?? 13);
/** How long ago a report can have been, in ms, for the card's `confirmed N s ago` to name the Station it pins the Train to as where it is. */
const CONFIRMED = 30_000;
/** Followed pill half-lengths along its track, in px, as main.ts's boxOf() has them, with the name's width as its fallback measure (6 px a letter at PILL_TEXT) has it. */
const boxAcross = (kind: string, name: string) => {
  const [w, across] = { commuter: [15, 9], regional: [12, 2] }[kind] ?? [15, 13];
  return Math.max(w!, w! - across! + ((name.length * 6 * FOLLOWED_TEXT) / PILL_TEXT) + 2 * PILL_PADDING) / 2;
};
/** Metres a px is on the ground at a latitude, at the map's zoom, 512 px tiles. */
const metresPerPx = (lat: number) => (40_075_016.686 / (512 * 2 ** zoom)) * Math.cos((lat * Math.PI) / 180);

type Counts = Record<string, number>;
const results: Record<string, Record<string, { all: Counts; live: Counts }>> = {};

for (const dir of process.argv.slice(2)) {
  const found: (typeof results)[string] = (results[dir] = {});
  const bundle = JSON.parse(await readFile(join(dir, 'bundle.json'), 'utf8')) as Bundle;
  for (const n of bundle.networks) {
    const config = NETWORKS.find((x) => x.id === n.id);
    if (config) n.live = config.live;
  }
  const { received } = JSON.parse(gunzipSync(await readFile(join(dir, 'replay.json.gz'))).toString()) as { received: Received[] };
  if (!received.length) throw new Error(`${dir}: no snapshots`);
  const t0 = received[0]?.at ?? 0;
  const t1 = Math.min(received.at(-1)?.at ?? 0, t0 + Number(process.env.LIMIT || Infinity) * 1000);
  if (Number.isNaN(t1)) throw new Error(`LIMIT=${process.env.LIMIT} isn't a number of seconds`);
  const keyOf = new Map(bundle.stations.map((s) => [s.id, s.place ?? s.name]));
  const lineOf = new Map(bundle.lines.map((l) => [l.id, l]));
  const networkOf = (trip: Trip) => lineOf.get(trip.line)?.network ?? '';
  // Stations by a grid of about 0.0045 degrees (500 m), to look for those near a Train.
  const cell = (lon: number, lat: number) => `${Math.floor(lon / 0.0045)} ${Math.floor(lat / 0.0045)}`;
  const grid = new Map<string, Station[]>();
  for (const s of bundle.stations) grid.set(cell(s.lon, s.lat), [...(grid.get(cell(s.lon, s.lat)) ?? []), s]);
  const nearTo = (lon: number, lat: number, radius: number): Near[] => {
    const [cx, cy] = [Math.floor(lon / 0.0045), Math.floor(lat / 0.0045)];
    const kx = DEGREE * Math.cos((lat * Math.PI) / 180);
    // As many cells either way as the radius reaches, which at low zooms is more than the next one.
    const [sx, sy] = [Math.ceil(radius / (0.0045 * kx)), Math.ceil(radius / (0.0045 * DEGREE))];
    const near: Near[] = [];
    for (let x = cx - sx; x <= cx + sx; x++) {
      for (let y = cy - sy; y <= cy + sy; y++) {
        for (const s of grid.get(`${x} ${y}`) ?? []) {
          const metres = Math.hypot((s.lon - lon) * kx, (s.lat - lat) * DEGREE);
          if (metres <= radius) near.push({ key: s.place ?? s.name, metres });
        }
      }
    }
    return near.sort((a, b) => a.metres - b.metres);
  };
  // Trips that can be on the map within the window: up to 4 h late, or an hour early, as a Scheduled Train is.
  const [from, to] = [(t0 - bundle.noonMinus12h) / 1000, (t1 - bundle.noonMinus12h) / 1000];
  const candidates = bundle.trips.filter((t) => (t.calls[0]?.arrival ?? Infinity) - 3600 <= to && (t.calls.at(-1)?.departure ?? -Infinity) + 4 * 3600 >= from);
  const was = new Map<string, number>();
  let stalled = new Map<string, number>();
  let heard = 0;
  for (let at = t0; at <= t1; at += 1000) {
    while (received[heard] && (received[heard]?.at ?? Infinity) <= at) heard++;
    const { of } = onMap(bundle, at, received.slice(0, heard));
    const now = new Map<string, number>();
    const stalling = new Map<string, number>();
    for (const trip of candidates) {
      const o = of(trip);
      const { train } = o ?? {};
      if (!o || !train) continue;
      const network = networkOf(trip);
      const row = (found[network] ??= { all: {}, live: {} });
      const line = lineOf.get(trip.line);
      const half = boxAcross(line?.kind ?? 'commuter', line?.name ?? '') * metresPerPx(train.lat);
      // As the operator runs it: its calls as `o.calls` has them, one for one (cutTrip(), #346).
      const made = o.trip;
      const calls = o.calls.map((c) => ({ ...c, key: keyOf.get(c.station) ?? c.station }));
      const position = o.said?.report.position as { near?: string } | undefined;
      const fresh = o.said?.confirmed !== undefined && bundle.noonMinus12h + o.now * 1000 - o.said.confirmed <= CONFIRMED;
      const pinned = train.live && fresh && typeof position?.near === 'string' ? made.calls.find((c) => c.station === position.near) : undefined;
      const m: Moment = {
        at,
        noon: bundle.noonMinus12h,
        now: o.now,
        time: o.time,
        delay: o.delay,
        dist: train.dist,
        calls,
        standing: !!train.standsAt,
        near: nearTo(train.lon, train.lat, half + ARROW_GAP * metresPerPx(train.lat)),
        reach: { pill: half, arrow: half + ARROW_GAP * metresPerPx(train.lat) },
        profile: o.profile,
        ...(pinned && { pin: { dist: pinned.dist, call: made.calls.indexOf(pinned) } }),
      };
      const d = differences(m);
      if (!d) continue;
      // What the card would give were its Delay at least how far the Train is drawn behind its timetable, and were it that, which a countdown in seconds would follow.
      const lag = o.now - o.time;
      const held = differences({ ...m, delay: Math.max(o.delay, lag) });
      const counts = [row.all, ...(train.live ? [row.live] : [])];
      const add = (key: string, n = 1) => counts.forEach((c) => (c[key] = (c[key] ?? 0) + n));
      add('seconds');
      if (d.standingHeaderNext) add('standing');
      if (d.atNextBeforeArriving) add('1.atNextBeforeArriving');
      if (d.at) add(`a.at.${d.at}`);
      if (d.pill) add(`2.pill.${d.pill}`);
      if (d.arrow) add(`2.arrow.${d.arrow}`);
      if (d.arrow && d.graced) add('2.arrow.graced');
      if (d.at === 'notCall') add('4.atNotCall');
      if (d.nowFar) add('b.nowFar');
      if (d.nowByMinute) add('3.nowByMinute');
      if (d.nowByDelay) add('5.nowByDelay');
      if (d.timeOff > 60) add('5.drawnAhead60');
      if (d.timeOff < -60) add('5.drawnBehind60');
      if (d.pinnedAway) add(`6.pinnedAway.${d.pinnedAway}`);
      if (m.pin) {
        const off = Math.abs(m.pin.dist - m.dist);
        add(off <= 200 ? '6.pin.le200' : off <= 500 ? '6.pin.le500' : off <= 1000 ? '6.pin.le1000' : off <= 2000 ? '6.pin.le2000' : '6.pin.gt2000');
      }
      if (d.readsNow) add('b.readsNow');
      if (d.nowFar) add(d.toGo <= 20 ? 'b.toGo.le20' : d.toGo <= 40 ? 'b.toGo.le40' : d.toGo <= 60 ? 'b.toGo.le60' : 'b.toGo.gt60');
      if (d.timeOff > 20) add('5.drawnAhead20');
      if (d.timeOff < -20) add('5.drawnBehind20');
      if (m.pin) add('6.pinned');
      if (held?.nowFar) add('fix.maxDelay.nowFar');
      if (held?.nowByDelay) add('fix.maxDelay.nowByDelay');
      if (held && held.timeOff > 60) add('fix.maxDelay.drawnAhead60');
      // The Delay measures, as jumps() and the stalls have them: Live in both seconds, moves faster than top speed + 5%, not moving at all more than 20 m from any call.
      now.set(trip.id, train.dist);
      const before = was.get(trip.id);
      if (train.live && before !== undefined) {
        add('delay.liveSeconds');
        if (Math.abs(train.dist - before) > o.network.profile.topSpeed * 1.05) add('delay.jumps');
        const still = Math.abs(train.dist - before) < 0.1 && made.calls.every((c) => Math.abs(c.dist - train.dist) > 20);
        const run = still ? (stalled.get(trip.id) ?? 0) + 1 : 0;
        if (still) stalling.set(trip.id, run);
        if (still) add('delay.stallSeconds');
        if (run === 30) add('delay.stalls30');
      }
    }
    was.clear();
    for (const [id, dist] of now) was.set(id, dist);
    stalled = stalling;
  }
  console.error(`${dir}: ${Math.round((t1 - t0) / 1000)} s`);
}
console.log(JSON.stringify({ zoom, results }, null, 1));
