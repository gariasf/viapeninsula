// The Closures the map draws (#341, ADR-0012): read from an Alert's words, or the timetable's (#340), and where.
import { BANDS, closestOnSegment, DEGREE, drawnIn, NEXT, pieces, slotAt, type Alerts, type Bundle, type Call, type Line, type Point, type Shape, type Slot, type Station, type Stroke, type Zone } from '../bundle.ts';

/** How far from a shape, in metres, a Station can be and lie on it, as the build has a Trip's calls (src/build/trips.ts). */
const REACH = 300;

/**
 * Where a Closure's Stations lie along its Line's shapes: on each that passes both within REACH, from
 * the nearer its start to the further, in whole metres along it, the shortest way between them first,
 * and none that goes a fifth further, as round a loop; as a Line's Trains each way can run on a track
 * of their own. Its Line's track there, which the timetable's Closures have though no Trip of their
 * day runs it (#340).
 * ponytail: where a shape comes nearest each, so on one that passes a Station twice, as one running
 * out and back does, maybe the other time. Take each time, as trips.ts's passes() does, if that shows.
 */
export function placeOn(ends: [Point, Point], shapes: Shape[]): { shape: string; from: number; to: number }[] {
  const nearest = ({ coords, dist }: Shape, p: Point) => {
    const kx = DEGREE * Math.cos((p[1] * Math.PI) / 180);
    let best = { along: 0, metres: Infinity };
    for (let i = 1; i < coords.length; i++) {
      const [a, b, start = 0, stop = 0] = [coords[i - 1], coords[i], dist[i - 1], dist[i]];
      const [t, metres] = a && b ? closestOnSegment(a, b, p, kx) : [0, Infinity];
      if (metres < best.metres) best = { along: start + t * (stop - start), metres };
    }
    return best;
  };
  const placed = shapes.flatMap((shape) => {
    const [a, b] = ends.map((p) => nearest(shape, p));
    if (!a || !b || a.metres > REACH || b.metres > REACH) return [];
    return [{ shape: shape.id, from: Math.round(Math.min(a.along, b.along)), to: Math.round(Math.max(a.along, b.along)) }];
  });
  const shortest = Math.min(...placed.map((p) => p.to - p.from));
  return placed.filter((p) => p.to - p.from <= 1.2 * shortest).sort((x, y) => x.to - x.from - (y.to - y.from));
}

/**
 * A Closure on its Line's stroke from `from` to `to` metres along one of its shapes, given the Line's
 * slots along that shape and its curves (zones()), as its Trains go there (onStroke()): in each zoom
 * band, along the centrelines of the Stretches it's drawn on, at its side, but where a curve across a
 * node takes over, along the curve, in its pieces, all the way from the first part of it the Closure
 * reaches to the last, though the shape leaves a centreline before the curve does; at a fork, the
 * curve to or from where the shape goes.
 */
export function closureStrokes(line: string, { from, to }: { from: number; to: number }, slots: Slot[], curves: Map<string, Zone[]>): Stroke[] {
  return BANDS.flatMap((_, band) => {
    const drawn: Stroke[] = [];
    // Each curve it's on, from how far along it to how far.
    const onCurves = new Map<Stroke, [number, number]>();
    for (const slot of slots) {
      if (!drawnIn(slot, band) || slot.to <= from || to <= slot.from) continue;
      const ends = [Math.max(from, slot.from), Math.min(to, slot.to)].map((d) => slotAt(slot, d).at);
      // What's left of it on the centreline, as the curves take over their parts of it.
      let left: [number, number][] = [[Math.min(...ends), Math.max(...ends)]];
      // How far along the shape a point along the centreline is, and whether the shape goes there.
      const [start, stop] = slot.at;
      const dist = (at: number) => slot.from + ((slot.to - slot.from) * (at - start)) / (stop - start || 1);
      const goes = (other: string, at: number) => slots.some((s) => s.on === other && s.from - NEXT <= dist(at) && dist(at) <= s.to + NEXT);
      const rank = (z: Zone) => {
        const middle = (z.at[0] + z.at[1]) / 2;
        return z.others.every((o) => goes(o, middle)) ? 2 : z.others.some((o) => goes(o, middle)) ? 1 : 0;
      };
      const over = (curves.get(`${line} ${band}`) ?? []).filter((z) => z.on === slot.on && z.at[0] !== z.at[1]);
      for (const zone of over.toSorted((a, b) => rank(b) - rank(a))) {
        const [[a0, a1], [x0, x1]] = [zone.at, zone.along];
        const [low, high] = [Math.min(a0, a1), Math.max(a0, a1)];
        left = left.flatMap(([p, q]) => {
          const [u, v] = [Math.max(p, low), Math.min(q, high)];
          if (u >= v) return [[p, q]];
          // The curve's part for it, in proportion.
          const [xu = 0, xv = 0] = [u, v].map((a) => x0 + ((x1 - x0) * (a - a0)) / (a1 - a0));
          const [was = Infinity, wasTo = -Infinity] = onCurves.get(zone.link) ?? [];
          onCurves.set(zone.link, [Math.min(was, xu, xv), Math.max(wasTo, xu, xv)]);
          return [...(p < u ? [[p, u] as [number, number]] : []), ...(v < q ? [[v, q] as [number, number]] : [])];
        });
      }
      drawn.push(...left.map(([p, q]) => ({ line, shape: slot.on, from: p, to: q, side: slot.side, band })));
    }
    for (const [link, [a, b]] of onCurves) {
      for (const piece of pieces(link)) if (piece.from < b && a < piece.to) drawn.push({ line, shape: link.shape, from: Math.max(a, piece.from), to: Math.min(b, piece.to), side: piece.side, band });
    }
    return drawn;
  });
}

/**
 * A Closure the map draws: its Line, its two Stations, whether it's closed, by buses or nothing, or
 * down to a single track, the Alert whose words say so, by its feed's ID and its own, with what it
 * says, its period, effect and words, as the fetcher tells one Alert of an ID from another, none for
 * the timetable's, and when it began, in ms since 1970, where it says.
 */
export interface Shown {
  line: string;
  stations: [string, string];
  kind: 'closed' | 'single';
  alert?: { feed: string; id: string; said: string };
  from?: number;
}

/** Which part of a Line a Closure is of: its Line and its Stations, either way round. */
export const closureKey = ({ line, stations }: Pick<Shown, 'line' | 'stations'>) => `${line} ${stations.toSorted().join(' ')}`;

/** A row of what a tap on Closures names (tappedRows()): one Alert's, or one of the timetable's. */
export interface Tapped {
  /** The last of its Closures in the order `shown` has them, which its Stations and its start come from; not `all`'s last, which is in Lines' order. */
  closure: Shown;
  /** The Lines it's on, each once, in the order the cards name Lines. */
  on: string[];
  /** Its Closures, by their Lines' place in that order. */
  all: Shown[];
}

/**
 * What a tap on the Closures `shown` with these `keys` (closureKey()) names: a row for each Alert that
 * makes any of them, as `shown` has the Alerts, newest first, then one for each of the timetable's, which
 * are one for each part of a Line, in the order of their Lines (a Line's parts as the day's file lists
 * them). A row's Lines and Closures are in `order` too, the order the cards name Lines in (#399), not as
 * its Alert lists them (#341).
 */
export function tappedRows(shown: Shown[], keys: string[], order: string[]): Tapped[] {
  const place = (c: Shown) => order.indexOf(c.line);
  const tapped = shown.filter((c) => keys.includes(closureKey(c)));
  const rows = new Map<string, { closure: Shown; all: Shown[] }>();
  for (const closure of [...tapped.filter((c) => c.alert), ...tapped.filter((c) => !c.alert).toSorted((a, b) => place(a) - place(b))]) {
    const by = closure.alert ? `${closure.alert.feed} ${closure.alert.id}` : closureKey(closure);
    rows.set(by, { closure, all: [...(rows.get(by)?.all ?? []), closure] });
  }
  return [...rows.values()].map(({ closure, all }) => ({ closure, on: order.filter((id) => all.some((c) => c.line === id)), all: all.toSorted((a, b) => place(a) - place(b)) }));
}

/** What names a Closure an Alert makes and what that Alert says, as `lifted` remembers them (hiding()). */
const liftKey = (c: Shown) => `${closureKey(c)} ${c.alert?.feed} ${c.alert?.id} ${c.alert?.said}`;

/**
 * How long a feed's Alerts file can stand unchanged before its Closures stop hiding Trains, in ms: 48 h.
 * Renfe's stood from 7 Oct 2026, 07:32 UTC, for days, its 7 Oct incidents still closing R1, R3 and C1,
 * where Trains ran again (#735). Its Alerts are still listed, with the file's age (#390).
 */
const STOOD = 48 * 3_600_000;

/**
 * The Closures among those shown that hide their Lines' Trains (#345): all but those an Alert closes
 * that a Live Train of their Line has been seen within since that Alert last changed, its period,
 * effect or words, as `lifted` remembers them, which this adds those `seen` to (seenWithin()), with
 * the time `at` (ms since 1970) they were first seen (liftedSince(), #422), and those of a feed whose
 * file, as `alerts` has it, last changed over STOOD before `at` (#735). The timetable's, which no
 * Trip of their day runs through, are never lifted.
 */
export function hiding(shown: Shown[], seen: readonly Shown[], lifted: Map<string, number>, at: number, alerts: Alerts): Shown[] {
  for (const c of seen) if (c.alert && !lifted.has(liftKey(c))) lifted.set(liftKey(c), at);
  const stood = (feed: string) => at - (alerts[feed]?.changed ?? at) > STOOD;
  return shown.filter((c) => !c.alert || !(lifted.has(liftKey(c)) || stood(c.alert.feed)));
}

/** When a Live Train of a Closure's Line was first seen within it, as `lifted` has it (ms since 1970), where its Alert hasn't changed since; none where it isn't lifted. */
export const liftedSince = (c: Shown, lifted: ReadonlyMap<string, number>): number | undefined => (c.alert ? lifted.get(liftKey(c)) : undefined);

/**
 * The feeds whose Alerts' periods are when they show, not when their works are, so that a Closure one
 * makes is in force only at the moments the timetable runs the Trains of its Alert's Lines short of it
 * (turnedBack(), ADR-0012, #397): TRAM's, whose `sc-280` showed from 1 Oct for works on 10–12 Oct.
 * Renfe's have no end, and a Live Train within lifts what they hide (#345).
 * ponytail: by the feed's ID, here. Give the source a trait in src/networks.ts, and the Alerts file
 * the feed's, when another operator's Alerts make Closures and their periods mean something else.
 */
const BY_TIMETABLE = ['tram'];

/**
 * Half the hour around a moment, in seconds, whose Trips of an Alert's Lines say whether its Closure is
 * in force (turnedBack()). On 7–12 Oct 2026 no TRAM Alert's Lines together went more than 15 minutes of
 * their service day with none of their Trips running (T6's, `sc-286`'s, on 7 Oct, 05:58–06:14), so by
 * day the hour never lets a Closure go out between two.
 */
const AROUND = 30 * 60;

/** A Trip as the page's days give it, but for what closuresAt() reads of it: its Line, and its calls' Stations and times. */
type TripCalls = { line: string; calls: Pick<Call, 'station' | 'arrival' | 'departure'>[] };

/**
 * Whether the closed Closure of an Alert's `lines`, between two Stations, is in force at a moment by the
 * timetable (#397): some Trip of any of them runs at some time within AROUND of it, and none of the Trips
 * that do calls at both Stations, as a timetable that turns them back at its ends has them, as T1–T3's at
 * Montesa on 10–12 Oct. Where none runs, as at night, or one calls at both, as every one of T1–T3's did
 * on 7–9 Oct, the days the build kept files of, it isn't. It goes by the Alert's Lines together, not each
 * Line's own, as the Alert is one: T1 has 5, 1 and 2 Trips on 10–12 Oct, where T2 and T3 have 122–160,
 * and its Closure is in force with theirs. `trips` are those of the days the map has joined, on the last
 * day's clock (joinDays()), and `at` is the moment in seconds into that day.
 * ponytail: a Trip that calls at both Stations crosses the stretch, as closuresOf() has it (src/build/
 * trips.ts), which holds where a Trip calls at every Station on its way, as TRAM's do: none of the
 * 20 stop patterns of its two timetables of 10 Oct skips one. A feed whose Trains skip Stations needs
 * the Trip's own track between the two. And it goes over every Trip on the page for each Closure, once
 * a minute: 0.3 ms more for `closuresAt()` with the 12,190 Trips of Catalonia's day file of 9 Oct,
 * and 0.6 ms with five times that. Index them by Line if the page ever has many more.
 */
function turnedBack(trips: TripCalls[], lines: string[], [a, b]: [string, string], at: number): boolean {
  let running = false;
  for (const { line, calls } of trips) {
    const [first, last] = [calls[0], calls.at(-1)];
    if (!lines.includes(line) || !first || !last || first.departure > at + AROUND || last.arrival < at - AROUND) continue;
    if (calls.some((c) => c.station === a) && calls.some((c) => c.station === b)) return false;
    running = true;
  }
  return running;
}

/**
 * The Closures the map draws at `now` (ms since 1970), one for each part of a Line (ADR-0012). From
 * the Alerts in alerts.json within their active period, as each feed gives it, so Renfe's while
 * they're in the file, as theirs have no end: the stretches each Alert's words, in its feed's own
 * language, say are closed or down to a single track, read against the Stations of its Lines'
 * Networks, on each of its Lines, which the Line's track then places, or leaves to words where it
 * doesn't run by both (placeOn()): not against those its Trips call at that day, which a closure can
 * cut short, and none from an Alert about some of the Trains of its Lines, not theirs (aboutSomeTrains()).
 * TRAM's closed ones only at the moments the Trips of their Alert's Lines in the days joined turn back
 * short of their Stations (turnedBack()), as its Alerts' periods are when they show, not when their
 * works are (BY_TIMETABLE, #397).
 * Then the timetable's of the service day, from its first bus to its last (#340). The Alerts' first,
 * newest first: where an Alert and the timetable, or two Alerts, close one part, it's drawn once, with
 * the first's words.
 */
export function closuresAt(
  alerts: Alerts,
  day: Pick<Bundle, 'noonMinus12h' | 'closures'> & {
    lines: Pick<Line, 'id' | 'network'>[];
    stations: Pick<Station, 'id' | 'name' | 'networks'>[];
    trips: TripCalls[];
  },
  now: number,
): Shown[] {
  const found = new Map<string, Shown>();
  const add = (shown: Shown) => {
    if (!found.has(closureKey(shown))) found.set(closureKey(shown), shown);
  };
  const network = new Map(day.lines.map((l) => [l.id, l.network]));
  const ofNetwork = new Map<string, Pick<Station, 'id' | 'name'>[]>();
  for (const s of day.stations) for (const n of s.networks ?? []) ofNetwork.set(n, [...(ofNetwork.get(n) ?? []), s]);
  const stationsOf = (line: string) => ofNetwork.get(network.get(line) ?? '') ?? [];
  const live = Object.entries(alerts).flatMap(([feed, { alerts }]) => alerts.map((alert) => ({ feed, alert })));
  for (const { feed, alert } of live.sort((a, b) => (b.alert.from ?? 0) - (a.alert.from ?? 0))) {
    if ((alert.from ?? -Infinity) > now || now > (alert.to ?? Infinity)) continue;
    const text = alert.description[0]?.text ?? '';
    if (aboutSomeTrains(text)) continue;
    const stations = [...new Map(alert.lines.flatMap(stationsOf).map((s) => [s.id, s])).values()];
    for (const { stations: ends, says } of stretchesIn(text, stations)) {
      if (says !== 'closed' && says !== 'single') continue;
      // Not a single track, which its Trains run through: the timetable can't tell.
      if (says === 'closed' && BY_TIMETABLE.includes(feed) && !turnedBack(day.trips, alert.lines, ends, (now - day.noonMinus12h) / 1000)) continue;
      for (const line of alert.lines) {
        const ids = new Set(stationsOf(line).map((s) => s.id));
        const said = JSON.stringify([alert.from, alert.to, alert.effect, alert.header, alert.description]);
        if (ends.every((s) => ids.has(s))) add({ line, stations: ends, kind: says, alert: { feed, id: alert.id, said }, ...(alert.from !== undefined && { from: alert.from }) });
      }
    }
  }
  for (const c of day.closures ?? []) {
    const [from, to] = [day.noonMinus12h + c.from * 1000, day.noonMinus12h + c.to * 1000];
    if (from <= now && now <= to) add({ line: c.line, stations: c.stations, kind: 'closed', from });
  }
  return [...found.values()];
}

/** What the words before a stretch say of it: closed, down to a single track, or running. */
export type Says = 'closed' | 'single' | 'running';

/** The words that say what a stretch is, before it in its clause, or anywhere in one that would go on after a comma with the clause before it: Renfe's Spanish, and TRAM's Catalan and English (#341, #396, #552). */
const SAYING: [words: string, says: Says][] = [
  ['servicio alternativo por carretera', 'closed'],
  ['servicio alternativo por autobus', 'closed'],
  ['plan alternativo de transporte por carretera', 'closed'],
  ['no presta servicio', 'closed'],
  ['interrumpida', 'closed'],
  ['sense servei', 'closed'],
  ['servei alternatiu', 'closed'],
  ['no service', 'closed'],
  ['via unica', 'single'],
  ['circulacion ferroviaria', 'running'],
  ['se mantiene', 'running'],
  ['se realiza con trenes', 'running'],
];

/** How a stretch is named: the word before its first Station, and those that can come between its two, a dash too, as in "entre Ripoll - Puigcerdà". */
const NAMING: Record<string, string[]> = { entre: ['y', 'e', 'i', '-'], de: ['a'], desde: ['hasta'], between: ['and'] };

/** The words that can come between that word and the first Station, as in "entre las estaciones de Los Rosales y Cazalla-Constantina" (#396). */
const STATIONS_OF = ['las', 'estaciones', 'de'];

/**
 * The words that join a stretch to the one before it, after a comma, as in "entre A y B, y entre C y D" (#396).
 * ponytail: a clause that goes on has no words of its own among SAYING's, before its stretch or after it; others,
 * as "se circula con normalidad", aren't read, so it goes on with what the clause before said. Each goes in
 * SAYING with the file that has it.
 */
const AND = ['y', 'e', 'i', 'and'];

/**
 * A text's words, as they're matched: in lower case, without accents or punctuation, but for a dash between
 * spaces, a word of its own, and "St" as "Sant".
 * ponytail: only "St", the one abbreviation a Station's name has in the bundle (FGC's "St. Llorenç de Montgai", and
 * TRAM's "Estació St.Adrià" till its config spelt it out, #571); "Sta." or another goes in with the name that has it.
 * A full stop ends a sentence before its words are made, so a name's "St." is read as "Sant" and an Alert's own isn't.
 */
const wordsOf = (text: string): string[] =>
  [...text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').matchAll(/[\p{L}\p{N}]+|(?<!\S)[-–](?!\S)/gu)].map(([word]) => (word === '–' ? '-' : word === 'st' ? 'sant' : word));

/** Where `run` comes in `words`, as a whole, from `at`, or -1. */
const runAt = (words: string[], run: string[], at = 0) => (run.every((w, k) => words[at + k] === w) ? at : -1);

/**
 * The words that name Trains by where they leave, or come from, which an Alert has where it's about
 * some of its Lines' Trains, as in "Tren con salida a las 09:27h de la estación de BENACAZÓN, no presta
 * servicio entre las estaciones de X y Y", or "para los trenes con origen/destino Madrid: Se establece
 * un Plan Alternativo de Transporte por carretera entre las estaciones de X y Y" (#396).
 * ponytail: the two wordings 9 Oct's file has. An Alert worded otherwise is read as its Line's, which a
 * day's file shows, and each new wording goes here; and an Alert that closes its Line and also names
 * one of its Trains in these words makes no Closure either, as the whole Alert is read (ADR-0012).
 */
const SOME_TRAINS = [
  ['tren', 'con', 'salida'],
  ['trenes', 'con', 'origen'],
];

/**
 * Whether an Alert's words are about some of its Lines' Trains, not the Lines': a stretch it names is
 * where those Trains don't run, with the Lines' others running there, as Sevilla's C3's Trains did on
 * 10 Oct between Los Rosales and Cazalla-Constantina, which a plan for Madrid's names (#396).
 */
function aboutSomeTrains(text: string): boolean {
  const words = wordsOf(text);
  return SOME_TRAINS.some((run) => words.some((_, at) => runAt(words, run, at) === at));
}

/**
 * The words a Station's name can have in one spelling and not in another: "de", as TRAM's timetable's "Estació
 * St.Adrià" was "Estació de Sant Adrià" in its Alerts, which its config now spells (#571), and "la", as Adif's
 * "València-La Font de Sant Lluís" is "Valencia Font de Sant Lluis" in Renfe's (#396).
 * ponytail: the two that 9 Oct's file needs, as each is one more way for two Stations to read alike: "del",
 * "el", "les", "els", "las" and "los" change no reading in any file we have. Another goes in with the file that has it.
 */
const LINKS = ['de', 'la'];

/** How many of `words` from `at` a name takes, whole, but for those words, or 0. */
function spanAt(words: string[], name: string[], at: number): number {
  let [i, j] = [at, 0];
  while (j < name.length) {
    if (words[i] === name[j]) [i, j] = [i + 1, j + 1];
    else if (LINKS.includes(words[i] ?? '')) i++;
    else if (LINKS.includes(name[j] ?? '')) j++;
    else return 0;
  }
  return i - at;
}

/**
 * The Station a stretch's end names, from `at` among its clause's words, and how many words it
 * takes: one whose whole name starts there, but for its link words (spanAt()), as Puigcerdà does "Puigcerdà/La Tor de Querol", or else the one
 * whose name holds the words there, as Maçanet-Massanes holds "Maçanet", the most of them that one
 * Station's name holds, where no other Station's holds as many. The longest first, followed by one of
 * `next` where it's given.
 */
function endAt(words: string[], at: number, names: { id: string; words: string[] }[], next?: string[]): { id: string; length: number } | undefined {
  const whole = names.flatMap((n) => {
    const length = spanAt(words, n.words, at);
    return length ? [{ id: n.id, length }] : [];
  });
  const within = names.flatMap((n) => {
    let length = 0;
    while (at + length < words.length && n.words.some((_, i) => runAt(n.words, words.slice(at, at + length + 1), i) === i)) length++;
    return length ? [{ id: n.id, length }] : [];
  });
  const held = within.filter((w) => words.slice(at, at + w.length).join('').length >= 4 && !within.some((o) => o.id !== w.id && o.length >= w.length));
  return [...whole, ...held].sort((a, b) => b.length - a.length).find((end) => !next || next.includes(words[at + end.length] ?? ''));
}

/**
 * The stretches an Alert's words name between two of `stations`, "entre X y Y", "entre las estaciones
 * de X y Y", "de X a Y", "desde X hasta Y", "entre X i Y" and "between X and Y", each once, matched in
 * lower case, without accents or punctuation, by whole names, but for the link words one spelling has
 * and another hasn't, or names within names (endAt()); each with what the last words before it in its
 * clause that say so say of it, where they do. A clause ends at a comma too, but one whose stretch has
 * only a joining word before it, "y", "e", "i" or "and", and none of those words of its own, goes on with what
 * the clause before said (#396).
 */
export function stretchesIn(text: string, stations: { id: string; name: string }[]): { stations: [string, string]; says?: Says }[] {
  const names = stations.map(({ id, name }) => ({ id, words: wordsOf(name) }));
  const saying = SAYING.map(([words, says]) => ({ words: wordsOf(words), says }));
  /** What the last of those words in `words` say, where there are any. */
  const sayingIn = (words: string[]) =>
    saying.flatMap(({ words: w, says }) => words.flatMap((_, at) => (runAt(words, w, at) === at ? [{ at, says }] : []))).sort((x, y) => y.at - x.at)[0]?.says;
  const found = new Map<string, { stations: [string, string]; says?: Says }>();
  for (const sentence of text.split(/[.!?\n]/)) {
    // What the clause before said, for the next to go on with where a comma ended the one before and it opens with its stretch.
    let carried: Says | undefined;
    let comma = false;
    for (const clause of sentence.split(/(?<=[,;:])/)) {
      const words = wordsOf(clause);
      // What it says of itself, before its stretch or after, where it does; and so whether it can go on with what the one before said.
      const own = sayingIn(words);
      const before = own === undefined && comma ? carried : undefined;
      let goesOn = false;
      for (const [i, word] of words.entries()) {
        // Its own opening words only, not those every object has, as "constructor".
        if (!Object.hasOwn(NAMING, word)) continue;
        const first = i + 1 + (runAt(words, STATIONS_OF, i + 1) === i + 1 ? STATIONS_OF.length : 0);
        const a = endAt(words, first, names, NAMING[word]);
        const b = a && endAt(words, first + a.length + 1, names);
        if (!a || !b || a.id === b.id) continue;
        // "…, y entre C y D": only a joining word before the opening word of a stretch that follows a comma.
        const joins = comma && i > 0 && words.slice(0, i).every((w) => AND.includes(w));
        goesOn ||= joins;
        if (found.has(`${a.id} ${b.id}`)) continue;
        const says = sayingIn(words.slice(0, i)) ?? (joins ? before : undefined);
        found.set(`${a.id} ${b.id}`, { stations: [a.id, b.id], ...(says && { says }) });
      }
      carried = own ?? (goesOn ? carried : undefined);
      comma = clause.endsWith(',');
    }
  }
  return [...found.values()];
}
