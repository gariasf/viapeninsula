// The Closures the map draws (#341, ADR-0012): read from an Alert's words, or the timetable's (#340), and where.
import { BANDS, closestOnSegment, DEGREE, drawnIn, NEXT, pieces, slotAt, type Alerts, type Bundle, type Line, type Point, type Shape, type Slot, type Station, type Stroke, type Zone } from '../bundle.ts';

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
 * down to a single track, the Alert whose words say so, by its feed's ID and its own, none for the
 * timetable's, and when it began, in ms since 1970, where it says.
 */
export interface Shown {
  line: string;
  stations: [string, string];
  kind: 'closed' | 'single';
  alert?: { feed: string; id: string };
  from?: number;
}

/** Which part of a Line a Closure is of: its Line and its Stations, either way round. */
export const closureKey = ({ line, stations }: Pick<Shown, 'line' | 'stations'>) => `${line} ${stations.toSorted().join(' ')}`;

/**
 * The Closures the map draws at `now` (ms since 1970), one for each part of a Line (ADR-0012). From
 * the Alerts in alerts.json within their active period, as each feed gives it, so Renfe's while
 * they're in the file, as theirs have no end: the stretches each Alert's words, in its feed's own
 * language, say are closed or down to a single track, read against the Stations of its Lines'
 * Networks, on each of its Lines, which the Line's track then places, or leaves to words where it
 * doesn't run by both (placeOn()): not against those its Trips call at that day, which a closure can
 * cut short. Then the timetable's of the service day, from its first bus to its last (#340). The
 * Alerts' first, newest first: where an Alert and the timetable, or two Alerts, close one part, it's
 * drawn once, with the first's words.
 */
export function closuresAt(
  alerts: Alerts,
  day: Pick<Bundle, 'noonMinus12h' | 'closures'> & { lines: Pick<Line, 'id' | 'network'>[]; stations: Pick<Station, 'id' | 'name' | 'networks'>[] },
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
    const stations = [...new Map(alert.lines.flatMap(stationsOf).map((s) => [s.id, s])).values()];
    for (const { stations: ends, says } of stretchesIn(alert.description[0]?.text ?? '', stations)) {
      if (says !== 'closed' && says !== 'single') continue;
      for (const line of alert.lines) {
        const ids = new Set(stationsOf(line).map((s) => s.id));
        if (ends.every((s) => ids.has(s))) add({ line, stations: ends, kind: says, alert: { feed, id: alert.id }, ...(alert.from !== undefined && { from: alert.from }) });
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

/** The words that say what a stretch is, before it in its clause: Renfe's Spanish, and TRAM's Catalan and English (#341). */
const SAYING: [words: string, says: Says][] = [
  ['servicio alternativo por carretera', 'closed'],
  ['no presta servicio', 'closed'],
  ['interrumpida', 'closed'],
  ['sense servei', 'closed'],
  ['no service', 'closed'],
  ['via unica', 'single'],
  ['circulacion ferroviaria', 'running'],
  ['se mantiene', 'running'],
];

/** How a stretch is named: the word before its first Station, and those that can come between its two, a dash too, as in "entre Ripoll - Puigcerdà". */
const NAMING: Record<string, string[]> = { entre: ['y', 'e', 'i', '-'], de: ['a'], desde: ['hasta'], between: ['and'] };

/** A text's words, as they're matched: in lower case, without accents or punctuation, but for a dash between spaces, a word of its own. */
const wordsOf = (text: string): string[] =>
  [...text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').matchAll(/[\p{L}\p{N}]+|(?<!\S)[-–](?!\S)/gu)].map(([word]) => (word === '–' ? '-' : word));

/** Where `run` comes in `words`, as a whole, from `at`, or -1. */
const runAt = (words: string[], run: string[], at = 0) => (run.every((w, k) => words[at + k] === w) ? at : -1);

/**
 * The Station a stretch's end names, from `at` among its clause's words, and how many words it
 * takes: one whose whole name starts there, as Puigcerdà does "Puigcerdà/La Tor de Querol", or else the one
 * whose name holds the words there, as Maçanet-Massanes holds "Maçanet", the most of them that one
 * Station's name holds, where no other Station's holds as many. The longest first, followed by one of
 * `next` where it's given.
 */
function endAt(words: string[], at: number, names: { id: string; words: string[] }[], next?: string[]): { id: string; length: number } | undefined {
  const whole = names.filter((n) => n.words.length && runAt(words, n.words, at) === at).map((n) => ({ id: n.id, length: n.words.length }));
  const within = names.flatMap((n) => {
    let length = 0;
    while (at + length < words.length && n.words.some((_, i) => runAt(n.words, words.slice(at, at + length + 1), i) === i)) length++;
    return length ? [{ id: n.id, length }] : [];
  });
  const held = within.filter((w) => words.slice(at, at + w.length).join('').length >= 4 && !within.some((o) => o.id !== w.id && o.length >= w.length));
  return [...whole, ...held].sort((a, b) => b.length - a.length).find((end) => !next || next.includes(words[at + end.length] ?? ''));
}

/**
 * The stretches an Alert's words name between two of `stations`, "entre X y Y", "de X a Y", "desde X
 * hasta Y", "entre X i Y" and "between X and Y", each once, matched in lower case, without accents or
 * punctuation, by whole names or names within names (endAt()); each with what the last words before
 * it in its clause that say so say of it, where they do: a clause ends at a comma too.
 */
export function stretchesIn(text: string, stations: { id: string; name: string }[]): { stations: [string, string]; says?: Says }[] {
  const names = stations.map(({ id, name }) => ({ id, words: wordsOf(name) }));
  const saying = SAYING.map(([words, says]) => ({ words: wordsOf(words), says }));
  const found = new Map<string, { stations: [string, string]; says?: Says }>();
  for (const clause of text.split(/[.,;:!?\n]/)) {
    const words = wordsOf(clause);
    for (const [i, word] of words.entries()) {
      // Its own opening words only, not those every object has, as "constructor".
      const a = Object.hasOwn(NAMING, word) && endAt(words, i + 1, names, NAMING[word]);
      const b = a && endAt(words, i + 2 + a.length, names);
      if (!a || !b || a.id === b.id || found.has(`${a.id} ${b.id}`)) continue;
      const before = words.slice(0, i);
      const said = saying.flatMap(({ words: w, says }) => before.flatMap((_, at) => (at + w.length <= i && runAt(before, w, at) === at ? [{ at, says }] : []))).sort((x, y) => y.at - x.at)[0];
      found.set(`${a.id} ${b.id}`, { stations: [a.id, b.id], ...(said && { says: said.says }) });
    }
  }
  return [...found.values()];
}
