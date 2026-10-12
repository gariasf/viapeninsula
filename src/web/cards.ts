// What the cards work out from the days on the map and the engine's Trains: minutes to go, and a followed Train's countdown in seconds in its last minute (#456), how long ago live data placed it (#612), Nearby's rows, how far along its Trip a followed Train is and where it is by how it's drawn, and the Station it passes without stopping (#455, #457), and a board's Lines (#321, #529), and the order the cards name Lines in (#399); and from alerts.json, the Alerts each shows (#342).
// Pure, with nothing from the page, as the measure of the card against the map (src/cardVsMap.ts) runs whereabouts(), passedPlace() and countdownTo() under Node.
import { DEGREE, type Alert, type Alerts, type Call, type Line, type Place, type Trip, type Words } from '../bundle.ts';
import type { Pass } from '../engine.ts';
import type { Language } from './i18n.ts';

/** The whole minutes from `now` to `at`, both in ms since 1970, as a clock showing minutes reads them, as a board shows times: none for a time this minute, or past. */
export function minutesTo(at: number, now: number): number {
  return Math.max(0, Math.floor(at / 60_000) - Math.floor(now / 60_000));
}

/** What a followed Train's card counts down by: `n` whole seconds, in its last minute, or whole minutes before it. 0 seconds is now. */
export interface Countdown {
  n: number;
  unit: 'seconds' | 'minutes';
}

/**
 * The countdown a followed Train's card gives to `at`, its next Station's time as the card shows it, with its
 * Delay in, by `now`, the map's time (mapTime()), both in ms since 1970 (#456): in whole seconds from 59 s out,
 * rounded up, so that 0, which the card says as now, is only once `at` has come or is past; and before that in
 * the whole minutes a board gives for that time (minutesTo()), as the time beside it shows it, so that the card
 * and a board agree to the minute, but for a time 59 s and a part out within one clock minute, which a board
 * reads as now and this as a minute, as it hasn't come. A board's rows and Nearby's keep the minutes, which read
 * now for a time from the start of its minute, as a clock does.
 */
export function countdownTo(at: number, now: number): Countdown {
  // To the ms, as the clocks count: a Train held at its Station is expected exactly now, a part of a ms off by two clocks' rounding.
  const seconds = Math.ceil(Math.round(at - now) / 1000);
  // From 60 s on it's a minute, which minutesTo() reads as 0 only within one clock minute, just under it.
  return seconds < 60 ? { n: Math.max(0, seconds), unit: 'seconds' } : { n: Math.max(1, minutesTo(at, now)), unit: 'minutes' };
}

/**
 * How long until a second less of the time to `at` is left, in ms, which is when countdownTo(`at`, `now`) next
 * changes in its last minute (before that its minutes change with the clock's, and this only keeps a refresh
 * on the time's seconds), or a second where it reads now, which doesn't change. So that a card refreshed then
 * shows each number once: refreshed a second after its last refresh, which a frame makes a little more each
 * time, it skipped one about every two minutes (#456).
 */
export function untilTick(at: number, now: number): number {
  const left = Math.round(at - now);
  return left > 0 ? left % 1_000 || 1_000 : 1_000;
}

/**
 * When a followed Train is expected at a Station it has still to come to, in ms since 1970, and whether the card
 * counts down to it: when it arrives at the one it's coming to, and when it leaves the one it stands at (`standing`),
 * counting down to either. Not at its Trip's last Station (`ends`): the Train doesn't leave there, and the `departure`
 * it's given is the dwell the engine makes up for it to stay on the map, or a layover's end where its timetable has one,
 * so it's when it arrived, with no countdown (#607). A Station it calls at again later, as a Line that turns back does,
 * isn't its last.
 */
export function due({ arrival, departure }: { arrival: number; departure: number }, standing: boolean, ends: boolean): { at: number; countdown: boolean } {
  return standing && !ends ? { at: departure, countdown: true } : { at: arrival, countdown: !standing };
}

/**
 * How long ago live data placed a Train, `ms` before: to the second under a minute and to the minute after, as
 * `confirmed 12 s ago` and `last confirmed 3 min ago` say it. Its number and unit are joined by a no-break space
 * (U+00A0), as toGo()'s are, so that a line of the status line never ends between them (#612).
 */
export function ago(ms: number): string {
  return ms < 60_000 ? `${Math.max(0, Math.round(ms / 1000))}\u00A0s` : `${Math.round(ms / 60_000)}\u00A0min`;
}

/** How many passes Nearby counts down to in a row. */
const PASSES = 3;

/** One of Nearby's rows: a Line and destination's next Train, and its next passes, in minutes to go, each Live or Scheduled. */
export interface NearbyRow {
  next: Pass;
  passes: { minutes: number; live: boolean }[];
}

/**
 * Nearby's rows, given its passes soonest first: one for each Line and destination, in the order of
 * each one's next Train, with that Train and its next PASSES passes, in minutes from `now`. Passes in
 * the same minute count once, as the first of them.
 */
export function nearbyRows(passes: Pass[], now: number): NearbyRow[] {
  const rows = new Map<string, NearbyRow>();
  for (const pass of passes) {
    const key = `${pass.trip.line} ${pass.trip.headsign}`;
    const row = rows.get(key) ?? { next: pass, passes: [] };
    rows.set(key, row);
    const minutes = minutesTo(pass.at, now);
    if (row.passes.length < PASSES && !row.passes.some((p) => p.minutes === minutes)) row.passes.push({ minutes, live: pass.live });
  }
  return [...rows.values()];
}

/** Where the Trips a board needs are: on their way, on the map, or failed to come (regionLoader()). */
export type TripsState = 'coming' | 'came' | 'failed';

/**
 * Where the Trips a board needs are, given the regions the map has loaded, those of them whose files have
 * come at the end of a look, and whether that look had a file fail: by the regions, not by the bundle, which
 * has the first regions' Trips before another's, as the map loads a region when it comes into view (#266).
 */
export function tripsState(loaded: Iterable<string>, came: ReadonlySet<string>, failed: boolean): TripsState {
  return [...loaded].every((id) => came.has(id)) ? 'came' : failed ? 'failed' : 'coming';
}

/**
 * What a board's list of next departures is, where it has `departures` of them: their rows; or where it
 * has none, that none can be had, once the day's Trips have come, or have failed to, as the map tries
 * them again each minute; or, while they're on their way, nothing under its label, as under Nearby's
 * heading (#324): that none are to come is what it would say of Trips it hasn't got, and then fill in (#379).
 * The same while the next day's, which a board with none left today asks for, are on their way (`next`,
 * #596), but not where a file has failed, which the map looks for again each minute: the board says that
 * none can be had meanwhile, and doesn't go back to its label for each try.
 */
export function boardList(trips: TripsState, departures: number, next = false): 'rows' | 'none' | 'label' {
  if (departures) return 'rows';
  return trips === 'coming' || (next && trips !== 'failed') ? 'label' : 'none';
}

/**
 * What a board with none left today asks the map for (#597): the next day's Trips, once the Trips of its
 * own regions have come (`own`) and it hasn't asked today (`asked`); or, where they haven't and the last
 * look had a file fail, a look again at once for the files that failed (`again`), as that look would wait
 * for every file of the next day's, once for a run of looks that have had a file fail (`retried`) and then
 * by the minute's. Nothing while its own regions' Trips are on their way: it has none because they haven't come.
 */
export function boardAsks(own: boolean, trips: TripsState, asked: boolean, retried: boolean): 'next' | 'again' | undefined {
  if (own) return asked ? undefined : 'next';
  return trips === 'failed' && !retried ? 'again' : undefined;
}

/**
 * Whether the next day's Trips, which a board with none left today asked for (`asked`), are on their way
 * (#596): the map is looking for the days it needs, and the last day of its bundle, today's where it has
 * none, isn't past `today` yet, as it is once they're on it.
 */
export function nextOnItsWay(looking: boolean, asked: boolean, lastDay: string | undefined, today: string): boolean {
  return looking && asked && (lastDay ?? today) <= today;
}

/**
 * How far along its Trip a Train is, in metres, and how long the Trip is, by its legs from Station to
 * Station, so that a Trip which runs back along its track adds up both ways: given its calls, how far
 * along its shape it's drawn, and how many Stations it has still to leave, the one it stands at too.
 */
export function progress(calls: Call[], dist: number, toLeave: number): { done: number; length: number } {
  const legs = calls.slice(1).map((call, i) => Math.abs(call.dist - (calls[i]?.dist ?? call.dist)));
  // The leg it's on, which ends at the first Station it has still to leave.
  const on = calls.length - toLeave - 1;
  const sum = (lengths: number[]) => lengths.reduce((total, length) => total + length, 0);
  const length = sum(legs);
  if (on < 0) return { done: 0, length };
  if (on >= legs.length) return { done: length, length };
  return { done: sum(legs.slice(0, on)) + Math.min(Math.abs(dist - (calls[on]?.dist ?? dist)), legs[on] ?? 0), length };
}

/**
 * Where a followed Train is by how it's drawn (#455), in the words a card says it in: `standing` at
 * the first Station it has still to leave, where it stands at it; otherwise `arriving` at that Station
 * while it's drawn within `reach` metres of it, `leaving` the Station it left last within as far after
 * it, `passing` the place it passes without stopping within as far of that (`passed`, from
 * passedPlace(), #457), and `between` the two where it's none of those. Given its Trip's calls, how
 * far along its shape it's drawn, how many Stations it has still to leave, whether it stands at the
 * first of them, how far its followed pill reaches either side of it, in metres (pillReach()), so that
 * a card says arriving where the pill sits on the Station's dot, how far each call is drawn from the
 * dot of its place and how far that dot is from the Station (`dot`), and the place it passes, if there
 * is one, with how far it's drawn from its dot. The dot the map shows its place as is the middle of
 * the place's Stations, so at an interchange not where a Line's own Trains stop, and the pill can be
 * on it a hundred metres or more short of their platform, or past it. A Station is within reach where
 * its platform is along the Trip, or its dot is, or the Train is on the stretch between the two (#609):
 * where they're more than two reaches apart the Train doesn't leave the one before it comes to the
 * other, which a card going by each alone said as `between` for the stretch in the middle. None where
 * it has none left to leave. Where both Stations are within reach, as on a leg shorter than twice it,
 * it's arriving: the Station it runs on to is the one its card's time and countdown are for. It passes
 * a place only where neither of its Stations is within reach, so that a card says no less of its calls
 * than it did.
 */
export function whereabouts<C extends Pick<Call, 'dist'>, P = never>(
  calls: C[],
  dist: number,
  toLeave: number,
  standing: boolean,
  reach: number,
  dot: (call: C) => { away: number; offset: number } = () => ({ away: Infinity, offset: 0 }),
  passed?: { place: P; away: number },
): Whereabouts<C, P> | undefined {
  const [next, last] = [calls[calls.length - toLeave], calls[calls.length - toLeave - 1]];
  if (!next) return undefined;
  if (standing) return { at: 'standing', next };
  // Within reach of the platform, of the dot, or of the stretch between them, where the two distances sum to the dot's
  // offset from the platform for a Train on the line between them, and to that and two reaches at most at its ends and beside it.
  // ponytail: an ellipse about that line, by the Train's way along its Trip and its straight line to the dot, so a track that
  // bends away from the line by more than a reach or two is not all taken in. Go by the track's own way between them if
  // a `Between` shows there.
  const within = (call: C) => {
    const along = Math.abs(call.dist - dist);
    if (along <= reach) return true;
    const { away, offset } = dot(call);
    return away <= reach || along + away <= offset + 2 * reach;
  };
  // Short of its first Station, which the engine draws no Train in, it can only be on its way there.
  if (!last || within(next)) return { at: 'arriving', next };
  if (within(last)) return { at: 'leaving', last, next };
  return passed && passed.away <= reach ? { at: 'passing', last, next, place: passed.place } : { at: 'between', last, next };
}

/** Where a followed Train is, with the calls it's at or between: the Station it's arriving at or stands at is `next`, the one it's leaving `last`, and the place it's passing, as the caller has it, `place`. */
export type Whereabouts<C, P = never> = { at: 'arriving' | 'standing'; next: C } | { at: 'leaving' | 'between'; last: C; next: C } | { at: 'passing'; last: C; next: C; place: P };

/**
 * The place a followed Train, drawn at `at`, passes without stopping, and how far from its dot, if it's
 * near one (#457): of the places of `network`, the Network the Train runs for, those its Trains stop
 * at, the one whose dot is nearest to it, within `within` metres, that its Trip has no call at: none
 * of its Stations is one of the Stations `called`, and it isn't shown with the name of one, since to a
 * viewer a Station is its name. A Train passes a Station of its own railway without stopping, not a
 * metro or tram stop its tunnel runs by, nor the other half of an interchange it calls at, which are
 * other Networks' places, as the map shows them (ADR-0005). A track built before #243 names no
 * place's Networks, and none is passed.
 * ponytail: the name is the one the map shows, to the letter, and on 10 Oct 2026's track covers none:
 * the 17 names that two places share are each one of the TRAM's and one of the Metro's, which `network`
 * leaves out. It's there for a Network's own two places of one name, which the map would name twice.
 * ponytail: every place on the page is looked at each time, a few hundred to a thousand and some (586
 * on 7 Oct 2026's track, 1,173 on 10 Oct's with Cercanías): a cell of them by position if it shows.
 */
export function passedPlace<P extends Pick<Place, 'name' | 'lon' | 'lat' | 'stations' | 'networks'>>(
  places: Iterable<P>,
  at: { lon: number; lat: number },
  called: readonly { station: string; name: string }[],
  within: number,
  network: string,
): { place: P; away: number } | undefined {
  const kx = DEGREE * Math.cos((at.lat * Math.PI) / 180);
  const [stations, names] = [new Set(called.map((c) => c.station)), new Set(called.map((c) => c.name))];
  let nearest: { place: P; away: number } | undefined;
  for (const place of places) {
    const dy = (place.lat - at.lat) * DEGREE;
    if (Math.abs(dy) > within) continue;
    const away = Math.hypot((place.lon - at.lon) * kx, dy);
    if (away <= within && away < (nearest?.away ?? Infinity) && place.networks.includes(network) && !names.has(place.name) && !place.stations.some((station) => stations.has(station))) nearest = { place, away };
  }
  return nearest;
}

/** How Lines' names are put in order: digits as numbers, in English whatever the viewer's language, so that every device has the same order. */
const NAMES = new Intl.Collator('en', { numeric: true });

/**
 * `lines` in the order the cards name them (#399), as a new array: each Network's together, the
 * Networks in the order the track lists them, and a Network's Lines in the order of their names, digits
 * as numbers (T1, T2, T3; R1, R2, R2N, R2S, R3 … R11, RL4; C1, C4, C4a, C5 … C10), not in the order
 * its timetable lists them, which is the order the track has them in and `lines` stays in: the build's
 * side-by-side order goes by that where nothing else decides (#162), and nothing the map draws is read
 * from this one.
 */
export function inNameOrder<L extends Pick<Line, 'network' | 'name'>>(lines: L[]): L[] {
  const rank = new Map([...new Set(lines.map((l) => l.network))].map((network, i) => [network, i]));
  return lines.toSorted((a, b) => (rank.get(a.network) ?? 0) - (rank.get(b.network) ?? 0) || NAMES.compare(a.name, b.name));
}

/** The Lines whose Trips call at any of `stations`, a place's, as a board names them: of `lines`, in their order. */
export function linesCallingAt(trips: Trip[], stations: string[], lines: string[]): string[] {
  const here = new Set(stations);
  const calling = new Set(trips.filter((trip) => trip.calls.some((c) => here.has(c.station))).map((trip) => trip.line));
  return lines.filter((line) => calling.has(line));
}

/**
 * The Lines a board names, of `order` (the cards' order): those of the place's timetable, which calls at
 * its Stations on any day (`lines`, #392), whether or not a Trip of them calls on the days on the map and
 * whether or not an Alert is on them (#529), so that where works stop a Line's Trains at a Station for the
 * day the board names it and shows the Alert that says why, and where a day has none of its Trips, or
 * they haven't come, it names them as it will when they have (#594); and those whose Trips call there,
 * which a track built before #392, that names no Lines, has alone.
 */
export function linesOnBoard(trips: Trip[], place: { stations: string[]; lines?: string[] }, order: string[]): string[] {
  const calling = new Set(linesCallingAt(trips, place.stations, order));
  const timetable = new Set(place.lines);
  return order.filter((line) => calling.has(line) || timetable.has(line));
}

/**
 * The ID a Trip that a link names, `<service day>/<Trip>` as `follow()` takes it, has among the Trips of days
 * joined (joinDays()) whose last day is `serviceDay`: led by its day, but for the last day's, whose Trips go by
 * their own IDs. A bare ID is the last day's.
 */
export function linkedTrip(link: string, serviceDay: string | undefined): string {
  const [, day, trip] = /^(\d{4}-\d{2}-\d{2})\/(.*)$/.exec(link) ?? [];
  return day && trip && day !== serviceDay ? link : (trip ?? link);
}

/** Whose words each feed's Alerts are, by its ID in alerts.json. */
const OPERATORS: Record<string, string> = { renfe: 'Renfe', tram: 'TRAM' };

/**
 * An Alert as a card shows it: the Lines it's on of those the card asks about, in the card's order;
 * its title, where it has one, and its words, each in one language, by its code, where its feed says;
 * when it began, where it says; and whose words they are.
 */
export interface CardAlert {
  id: string;
  lines: string[];
  header?: Words;
  description?: Words;
  from?: number;
  by: string;
}

/**
 * How long ago a feed's Alerts can have been read before a card says when, in ms: while a feed and the
 * fetcher work, alerts.json says it read them no more than about 10 minutes ago, as TRAM's are read
 * every 5 minutes into a file written every 5, and the page has the file up to 2 minutes after, by
 * its cache and its minute; so 15, as #339's note on #342 has it.
 */
const STALE = 15 * 60_000;

/**
 * How long ago a feed's file can have last changed before a card says when, in ms: a day. Renfe's
 * stood unchanged from 7 October 2026, 09:32 CEST, for days, as alerts rarely change, so its 304s,
 * which count as reads, can't say it (#390).
 */
const UNCHANGED = 24 * 3_600_000;

/**
 * The Alerts a card shows, from alerts.json: a followed Train's, those on its Line; a board's, those
 * on its place's Stations and on the Lines that call there. Newest first, whichever operator's they
 * are, and last those that don't say when they began, as each feed has them. Each in `lang`, the
 * viewer's language, where its feed has it, or else in the feed's own, its first (ADR-0012). And
 * where it's over STALE before `now`, when the feed read longest ago of those whose Alerts it shows
 * was read; and, beside it, each feed whose Alerts it shows and whose file last changed over a day
 * before `now`, by whose Alerts they are, and when its file did (#390); all times in ms since 1970.
 * ponytail: a card with no Alerts says nothing of a feed that has gone unread, or whose file has stood.
 * Say it there too if that's missed, once the page knows which feed has a Line's Alerts.
 */
export function cardAlerts(
  alerts: Alerts,
  { lines, stations }: { lines: string[]; stations: string[] },
  lang: Language,
  now: number,
): { alerts: CardAlert[]; asOf?: number; changed: { by: string; at: number }[] } {
  const on = (alert: Alert) => alert.lines.some((line) => lines.includes(line)) || alert.stations.some((station) => stations.includes(station));
  const inLang = (words: Words[]) => words.find((w) => w.language === lang) ?? words[0];
  const shown = Object.entries(alerts).flatMap(([feed, { alerts }]) =>
    alerts.filter(on).map(({ id, lines: named, header, description, from }): CardAlert => ({
      id,
      lines: lines.filter((line) => named.includes(line)),
      ...(header && { header: inLang(header) }),
      description: inLang(description),
      from,
      by: OPERATORS[feed] ?? feed,
    })),
  );
  const read = Math.min(...Object.values(alerts).flatMap(({ read, alerts }) => (read !== undefined && alerts.some(on) ? [read] : [])));
  const changed = Object.entries(alerts).flatMap(([feed, f]) => (f.changed !== undefined && now - f.changed > UNCHANGED && f.alerts.some(on) ? [{ by: OPERATORS[feed] ?? feed, at: f.changed }] : []));
  return { alerts: shown.sort((a, b) => (b.from ?? 0) - (a.from ?? 0)), ...(now - read > STALE && { asOf: read }), changed };
}

/** A part of an Alert's words: text as its operator wrote it, or an address in it, as written, to link to (#391). */
export type Part = string | { address: string };

/**
 * An Alert's words in the parts a card shows them in (#391): the text between as it was, and each
 * `http://` or `https://` address in it, in any case, up to the next white space, as a part of its own,
 * but for a `.`, `,`, `;`, `:` or `)` that ends it, which is the sentence's and stays text. No other
 * kind of address is one, so a link never runs `javascript:` or `data:`; and none is made or changed:
 * put back together, the parts are the words as they were, line breaks too.
 * ponytail: an address whose own last character is a `)` that closes a `(` in it, as Wikipedia's do,
 * is cut short there, and one that runs on into another with no white space between is one. Count the
 * brackets, and stop at a scheme, if an operator sends such a one.
 */
export function linkedWords(text: string): Part[] {
  return text.split(/(https?:\/\/\S*[^\s.,;:)])/i).flatMap((part, i): Part[] => (i % 2 ? [{ address: part }] : part ? [part] : []));
}
