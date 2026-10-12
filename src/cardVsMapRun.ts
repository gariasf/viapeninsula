// Replays recordings second by second and counts, by Network, where a followed Train's card and the Train
// drawn on the map disagree (#352): the yardstick is cardVsMap.ts's. `npm run card-vs-map -- <dir>...`
// reads each <dir>'s bundle.json (a whole day's, or that joined with the day before's and the next day's
// as the map would have had them, as `npm run record` or a Record run's artifact has it) and replay.json.gz, and prints
// one JSON object of counts, in Train-seconds, to stdout. Nothing in the map changes: the engine's own
// onMap() is what it samples, from a copy of src/engine.ts with it exported.
//
// - `LIMIT=<seconds>` replays only that long, for a look;
// - `ZOOM=<n>` is the zoom the followed pill's reach is worked out at (13, the follow zoom's floor),
//   as the card works it out at the map's (pillReach(), which holds at the zoom its Line's Trains are
//   pills from, below it), and the zoom AT's 7 px are metres at, how near a Station a Train is drawn for
//   its dot to be at it (50 m at 13, 12 m at 15), so that what is counted at a dot says the same at every zoom (#608);
// - `STATIONS=1` counts each Station by its own coordinates, keyed by its place or else its name, as #352's note did
//   (its sections 1 and 2), not as the places the map shows; the card goes by the place's dot either way (#455);
// - the Networks' live traits are src/networks.ts's, as an older bundle's can differ or be missing.
//
// Whose `now` is whose: `b.nowFar`, `b.readsNow`, `3.nowByMinute` and `5.nowByDelay` are the minute-reading card's, as a
// board's rows say it and the followed Train's card did until #456, kept as #352 counted them; the followed Train's
// countdown in seconds is under `s.` (`s.nowFar`, `s.nowByMinute`, `s.reads.*`, `s.steps.*`), and what it reads where
// the other said now with the Train far under `b.nowFar.reads.*` (#456). And `4.atNotCall` and `2.pill.notCall` are what the card
// leaves unnamed of the places it has no call at, by the card's rule since #457 (`w.passing`: where neither Station of its calls is
// within the pill's reach it names the nearest place of its own Network's within it that isn't a call, or named as one): `.own` those
// the Train's own Network's Trains stop at, which it names, so that they're 0 where it says `Between` or `Passing`, as the ticket's
// "at 0 where the card says it" reads (the maintainer's, 11 Oct 2026), and `.other` those only another Network's stop at, which it never
// names, a dot under the pill that is another railway's; and `.<what the card says>` of them by what it says; of `4.atNotCall` also
// `.own.<what the card says>` and `.other.<…>`, and `.namedAsCall.<…>` those named as one of the Trip's calls (the TRAM's Glòries beside
// the Metro's), which the card names no more than any other Network's. Of both, `.before` is the same counted with the card as #455 and
// #456 left it, before it named the place it passes, `.before.<what it said>` of them by what it said, and `.before.own` and
// `.before.own.<…>` of those the Train's own Network's places: the column of the measure since #455, by the dots the map draws
// (#352's own, which counted each Station by its own coordinates under the card before #455, is the note's section 2, and with
// STATIONS=1 its yardstick).
// `w.passing.nearCall` (within 150 m of the dot of one of its Trip's calls, as FGC's Sant Gervasi is of Pl. Molina), `w.passing.still` how
// many of those seconds a Live Train is drawn still in, `w.passing.episodes` how many times it begins to, `w.nearer.arriving` and
// `.leaving` the seconds the card names its Station with a place it could pass nearer, and `w.flaps.passingReturns`, `.afterPassing` and
// `.other` which words come back within 10 s: a place it passes coming back, the words before it after it, and any other, as #455
// counted them.

import { rmSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { DEGREE, pixelMetres, places, type Bundle, type Place, type Trip } from './bundle.ts';
import { AT, differences, type Moment, type Near } from './cardVsMap.ts';
import { passedPlace } from './web/cards.ts';
import type { Received } from './engine.ts';
import { NETWORKS } from './networks.ts';
import { ARROW_GAP, boxOf, FOLLOWED_TEXT, outlineOf, pillReach } from './web/pill.ts';

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

const zoom = Number(process.env.ZOOM ?? 13);
/** How long ago a report can have been, in ms, for the card's `confirmed N s ago` to name the Station it pins the Train to as where it is. */
const CONFIRMED = 30_000;
/** How many seconds a card's words can come back in, as a flap: the Train says one thing, another, and the first again within this many. */
const FLAP = 10;

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
  // The Stations as the map shows them: a place at the middle of its Stations, which the card names by (places()),
  // or with STATIONS=1 each Station by its own coordinates, as #352's note had them.
  const shown = places(bundle.stations);
  const byStation = !!process.env.STATIONS;
  const dots = byStation ? bundle.stations.map((s) => ({ key: s.place ?? s.name, lon: s.lon, lat: s.lat })) : shown.map((p) => ({ key: p.id, lon: p.lon, lat: p.lat }));
  const keyOf = byStation ? new Map(bundle.stations.map((s) => [s.id, s.place ?? s.name])) : new Map(shown.flatMap((p) => p.stations.map((id): [string, string] => [id, p.id])));
  // The dot the map draws each Station's place at, which the card goes by whichever of those it counts.
  const placeOf = new Map(shown.flatMap((p) => p.stations.map((id): [string, Place] => [id, p])));
  // How far each Station is from the dot of its place, in metres: the card goes by the stretch between its platform and the dot too (#609).
  const stationAt = new Map(bundle.stations.map((s) => [s.id, s]));
  const offsetOf = new Map([...placeOf].map(([id, p]) => {
    const s = stationAt.get(id) ?? p;
    return [id, Math.hypot((s.lon - p.lon) * DEGREE * Math.cos((p.lat * Math.PI) / 180), (s.lat - p.lat) * DEGREE)];
  }));
  const nameOf = new Map(bundle.stations.map((s) => [s.id, s.name]));
  // The name the map shows each of those keys' place with, which the card compares with its Trip's calls' (#457).
  const shownAs = new Map(bundle.stations.map((s) => [keyOf.get(s.id) ?? s.id, placeOf.get(s.id)?.name ?? s.name]));
  // Whose Trains stop at each of those keys' Stations, to say whose a place the card leaves unnamed is (#457).
  const servedBy = new Map<string, Set<string>>();
  for (const s of bundle.stations) {
    const key = keyOf.get(s.id) ?? s.id;
    servedBy.set(key, new Set([...(servedBy.get(key) ?? []), ...(s.networks ?? [])]));
  }
  const lineOf = new Map(bundle.lines.map((l) => [l.id, l]));
  // The zoom each Network's Trains are drawn as pills from: round pills from zoom 10 where a track names none (main.ts's show()).
  const pillZoomOf = new Map(bundle.networks.map((n) => [n.id, n.pillZoom]));
  const networkOf = (trip: Trip) => lineOf.get(trip.line)?.network ?? '';
  // Places by a grid of about 0.0045 degrees (500 m), to look for those near a Train.
  const cell = (lon: number, lat: number) => `${Math.floor(lon / 0.0045)} ${Math.floor(lat / 0.0045)}`;
  const grid = new Map<string, typeof dots>();
  for (const p of dots) grid.set(cell(p.lon, p.lat), [...(grid.get(cell(p.lon, p.lat)) ?? []), p]);
  // The same for the places themselves, which the card's passedPlace() looks at, as the page does at all of them.
  const placeGrid = new Map<string, Place[]>();
  for (const p of shown) placeGrid.set(cell(p.lon, p.lat), [...(placeGrid.get(cell(p.lon, p.lat)) ?? []), p]);
  /** What `of` has in the cells a circle of `radius` metres about a point reaches, which are more than it holds. */
  const around = <T>(of: Map<string, T[]>, lon: number, lat: number, radius: number): T[] => {
    const [cx, cy] = [Math.floor(lon / 0.0045), Math.floor(lat / 0.0045)];
    const kx = DEGREE * Math.cos((lat * Math.PI) / 180);
    // As many cells either way as the radius reaches, which at low zooms is more than the next one.
    const [sx, sy] = [Math.ceil(radius / (0.0045 * kx)), Math.ceil(radius / (0.0045 * DEGREE))];
    const found: T[] = [];
    for (let x = cx - sx; x <= cx + sx; x++) for (let y = cy - sy; y <= cy + sy; y++) found.push(...(of.get(`${x} ${y}`) ?? []));
    return found;
  };
  const nearTo = (lon: number, lat: number, radius: number): Near[] => {
    const kx = DEGREE * Math.cos((lat * Math.PI) / 180);
    const near: Near[] = [];
    for (const p of around(grid, lon, lat, radius)) {
      const metres = Math.hypot((p.lon - lon) * kx, (p.lat - lat) * DEGREE);
      if (metres <= radius) near.push({ key: p.key, metres });
    }
    return near.sort((a, b) => a.metres - b.metres);
  };
  // Trips that can be on the map within the window: up to 4 h late, or an hour early, as a Scheduled Train is.
  const [from, to] = [(t0 - bundle.noonMinus12h) / 1000, (t1 - bundle.noonMinus12h) / 1000];
  const candidates = bundle.trips.filter((t) => (t.calls[0]?.arrival ?? Infinity) - 3600 <= to && (t.calls.at(-1)?.departure ?? -Infinity) + 4 * 3600 >= from);
  const was = new Map<string, number>();
  // What each Train's card said in each of the last FLAP seconds, to count the words that come back.
  let saying = new Map<string, string[]>();
  // The time and Station each Train's countdown counted to in the last second, to count the steps its Delay gives it (#456).
  let counting = new Map<string, { countsTo: string; expected: number }>();
  let stalled = new Map<string, number>();
  let heard = 0;
  for (let at = t0; at <= t1; at += 1000) {
    while (received[heard] && (received[heard]?.at ?? Infinity) <= at) heard++;
    const { of } = onMap(bundle, at, received.slice(0, heard));
    const now = new Map<string, number>();
    const stalling = new Map<string, number>();
    const said = new Map<string, string[]>();
    const counted = new Map<string, { countsTo: string; expected: number }>();
    for (const trip of candidates) {
      const o = of(trip);
      const { train } = o ?? {};
      if (!o || !train) continue;
      const network = networkOf(trip);
      const row = (found[network] ??= { all: {}, live: {} });
      const line = lineOf.get(trip.line);
      // The followed pill's reach as the card has it: boxOf() with the name as wide as textWidth() has it with no canvas, 6 px a letter at PILL_TEXT.
      const box = boxOf(outlineOf(line?.kind ?? 'commuter'), (line?.name.length ?? 0) * 6, FOLLOWED_TEXT);
      const pillZoom = pillZoomOf.get(line?.network ?? '') ?? 10;
      const half = pillReach(box, zoom, pillZoom, train.lat);
      const px = pixelMetres(Math.max(zoom, pillZoom), train.lat);
      const arrowReach = half + ARROW_GAP * px;
      // How near a Station it's drawn for its dot to be at it: AT px at the zoom its pill is drawn at, as its reach is, so that the count says the same at every zoom (#608).
      const atReach = AT * px;
      // As the operator runs it: its calls as `o.calls` has them, one for one (cutTrip(), #346).
      const made = o.trip;
      const kx = DEGREE * Math.cos((train.lat * Math.PI) / 180);
      // Whose Station a place is: its Network's Trains stop there, or only another's, to say whose a place the card leaves unnamed is (#457).
      const ownPlace = (key: string | undefined) => servedBy.get(key ?? '')?.has(line?.network ?? '') ?? false;
      const calls = o.calls.map((c) => {
        const place = placeOf.get(c.station);
        return { ...c, key: keyOf.get(c.station) ?? c.station, offset: offsetOf.get(c.station) ?? 0, away: place ? Math.hypot((place.lon - train.lon) * kx, (place.lat - train.lat) * DEGREE) : Infinity };
      });
      // The place it passes, as the card has it: of its own Network's, the places' dots whichever Stations `near` counts by, none the Stations it calls at, or named as one.
      const hit = passedPlace(around(placeGrid, train.lon, train.lat, half), train, o.calls.map((c) => ({ station: c.station, name: nameOf.get(c.station) ?? c.station })), half, line?.network ?? '');
      const position = o.said?.report.position as { near?: string } | undefined;
      const fresh = o.said?.confirmed !== undefined && bundle.noonMinus12h + o.now * 1000 - o.said.confirmed <= CONFIRMED;
      const pinned = train.live && fresh && typeof position?.near === 'string' ? made.calls.find((c) => c.station === position.near) : undefined;
      const m: Moment = {
        // The map's time, mapTime(): the device's second and behind(), which the engine's `now` has in.
        at: bundle.noonMinus12h + o.now * 1000,
        noon: bundle.noonMinus12h,
        now: o.now,
        time: o.time,
        delay: o.delay,
        dist: train.dist,
        calls,
        standing: !!train.standsAt,
        // The places within the arrow's reach, and within `reach.at` if that is more, which it's not while AT is the arrow's gap's 7 px: near holds all that is counted from it.
        near: nearTo(train.lon, train.lat, Math.max(atReach, arrowReach)),
        reach: { pill: half, arrow: arrowReach, at: atReach },
        ...(hit && { passed: { key: keyOf.get(hit.place.stations[0] ?? '') ?? hit.place.id, metres: hit.away } }),
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
      if (d.says.at === 'standing') add('standing');
      if (d.standingHeaderNext) add('1.standingHeaderNext');
      // What the card says (#455): how long each of its words lasts, and how often they change and come straight back.
      add(`w.${d.says.at}`);
      if (d.says.at === 'passing') {
        // A place it names is its own Network's (#457). Whether it's within 150 m of the dot of one of its Trip's calls, as FGC's Sant Gervasi is of Pl. Molina;
        // and whether a Live Train is held, drawn still in this second.
        if (hit && o.calls.some((c) => { const there = placeOf.get(c.station); return !!there && Math.hypot((there.lon - hit.place.lon) * kx, (there.lat - hit.place.lat) * DEGREE) <= 150; })) add('w.passing.nearCall');
        const prior = was.get(trip.id);
        if (train.live && prior !== undefined && Math.abs(train.dist - prior) < 0.1) add('w.passing.still');
      }
      // Where the card names the Station it comes to or left, and the place it would pass is nearer the Train than that Station: where the nearer would say `passing`.
      if (hit && (d.says.at === 'arriving' || d.says.at === 'leaving')) {
        const upcoming = calls.filter((c) => c.departure >= o.time);
        const named = d.says.at === 'arriving' ? upcoming[0] : calls[calls.length - upcoming.length - 1];
        if (named && hit.away < Math.min(Math.abs(named.dist - train.dist), named.away)) add(`w.nearer.${d.says.at}`);
      }
      const [words, lately] = [`${d.says.at} ${d.says.key}`, saying.get(trip.id)];
      said.set(trip.id, [...(lately ?? []), words].slice(-FLAP));
      if (lately && lately.at(-1) !== words) {
        add('w.changes');
        if (d.says.at === 'passing') add('w.passing.episodes');
        if (lately.slice(0, -1).includes(words)) {
          add('w.flaps');
          // Of those, which are a place it passes coming back (#457), which are the words before it coming back after it (a passage of under FLAP seconds, which
          // is no flap of the card's), and the rest, as #455 counted them.
          const between = lately.slice(lately.lastIndexOf(words) + 1);
          add(d.says.at === 'passing' ? 'w.flaps.passingReturns' : between.every((w) => w.startsWith('passing ')) ? 'w.flaps.afterPassing' : 'w.flaps.other');
        }
      }
      if (d.atNextBeforeArriving) add('1.atNextBeforeArriving');
      if (d.at) add(`a.at.${d.at}`);
      if (d.pill) add(`2.pill.${d.pill}`);
      if (d.arrow) add(`2.arrow.${d.arrow}`);
      if (d.arrow && d.graced) add('2.arrow.graced');
      if (d.at === 'notCall') {
        add('4.atNotCall');
        const whose = ownPlace(d.atKey) ? 'own' : 'other';
        add(`4.atNotCall.${whose}`);
        add(`4.atNotCall.${whose}.${d.says.at}`);
        // A place named as one of its calls, which the card doesn't have it pass, though it's not a call by its key.
        if (o.calls.some((c) => (nameOf.get(c.station) ?? c.station) === shownAs.get(d.atKey ?? ''))) add(`4.atNotCall.namedAsCall.${d.says.at}`);
      }
      if (d.pill === 'notCall') {
        add(ownPlace(d.pillKey) ? '2.pill.notCall.own' : '2.pill.notCall.other');
        add(`2.pill.notCall.${d.says.at}`);
      }
      // As the card was before it named the place it passes, by what it said, and of those the Train's own Network's places, `.own`.
      const unnamedBefore = m.passed ? differences({ ...m, passed: undefined }) : d;
      if (unnamedBefore?.at === 'notCall') {
        add('4.atNotCall.before');
        add(`4.atNotCall.before.${unnamedBefore.says.at}`);
        if (ownPlace(unnamedBefore.atKey)) {
          add('4.atNotCall.before.own');
          add(`4.atNotCall.before.own.${unnamedBefore.says.at}`);
        }
      }
      if (unnamedBefore?.pill === 'notCall') {
        add('2.pill.notCall.before');
        if (ownPlace(unnamedBefore.pillKey)) add('2.pill.notCall.before.own');
      }
      if (d.nowFar) add('b.nowFar');
      // The followed Train's countdown (#456), beside the minute-reading card's `b.nowFar` above and its `3.nowByMinute` and `5.nowByDelay` below:
      // what it reads (`s.reads`), that it reads now with the Train far only by the Delay (`s.nowFar`, `s.nowByMinute`), what it reads where the
      // minute-reading card said now with the Train far (`b.nowFar.reads`, and the seconds it read: `b.nowFar.n`: a time 59 s and a part out within
      // one clock minute reads a minute), and what it reads with the Train drawn at its Station (`s.atNext`).
      const inSeconds = d.reads.unit === 'seconds';
      add(!inSeconds ? 's.reads.minutes' : d.reads.n ? 's.reads.seconds' : 's.reads.now');
      if (d.countdownNowFar) add('s.nowFar');
      if (d.countdownNowFar && d.expected > m.at) add('s.nowByMinute');
      if (d.nowFar) add(!inSeconds ? 'b.nowFar.reads.minutes' : d.reads.n ? 'b.nowFar.reads.seconds' : 'b.nowFar.reads.now');
      if (d.nowFar && inSeconds && d.reads.n) add(d.reads.n <= 10 ? 'b.nowFar.n.le10' : d.reads.n <= 20 ? 'b.nowFar.n.le20' : d.reads.n <= 40 ? 'b.nowFar.n.le40' : 'b.nowFar.n.le59');
      if (d.atNext) {
        add('s.atNext');
        if (d.readsNow) add('s.atNext.minuteReadsNow');
        if (inSeconds && d.reads.n === 0) add('s.atNext.now');
        if (inSeconds && d.reads.n > 10) add('s.atNext.over10');
        if (inSeconds && d.reads.n > 20) add('s.atNext.over20');
      }
      // How steady its seconds are: the card's time for the same Station moved by a new Delay, by more than 2 s or 10 s, later or earlier.
      const prior = counting.get(trip.id);
      counted.set(trip.id, { countsTo: d.countsTo, expected: d.expected });
      if (inSeconds && prior?.countsTo === d.countsTo) {
        add('s.steps.of');
        const step = d.expected - prior.expected;
        if (Math.abs(step) > 2_000) add(step > 0 ? 's.steps.later2' : 's.steps.earlier2');
        if (Math.abs(step) > 10_000) add(step > 0 ? 's.steps.later10' : 's.steps.earlier10');
      }
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
      // Only a Live Train's distance is kept for the next second, so that the second a report first places a Scheduled Train is no jump (#534).
      const before = was.get(trip.id);
      if (train.live) now.set(trip.id, train.dist);
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
    saying = said;
    counting = counted;
    stalled = stalling;
  }
  console.error(`${dir}: ${Math.round((t1 - t0) / 1000)} s`);
}
console.log(JSON.stringify({ zoom, results }, null, 1));
