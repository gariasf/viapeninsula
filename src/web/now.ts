// Now (#474, #328's pick): what's wrong on the map and what's notable on it at this moment, of the regions loaded, as
// the legend's count is (ADR-0014). Pure, with nothing from the page, so that Node tests it.

import { madridDate, type Alerts, type Line, type Network, type Trip } from '../bundle.ts';
import type { Shown } from './closures.ts';
import { cancelledNow, isLate } from './line.ts';

/** The Metro, which Now leaves out of the line of Networks with nothing late or Cancelled: TMB runs it by headway, so it has no Delays to show (CONTEXT.md). */
export const METRO = 'metro';

/** A Trip as Now takes it, as tripsAt() has it: its Train on the map, with its Delay, or Cancelled, or neither. */
export type NowTrip = { trip: Trip; train?: { live: boolean; unreported: boolean; delay?: number }; cancelled?: true };

/** A Line's or a Network's Trains on the map now: how many, how many late (isLate()), of those Cancelled whose runs haven't ended (cancelledNow()), and with no live data. */
interface Counted {
  trains: number;
  late: number;
  cancelled: number;
  unreported: number;
}

/** A Network in trouble: its Trains on the map, Live and Scheduled besides those with no live data, and its Lines with Trains late or Cancelled, ranked. */
export interface Troubled extends Counted {
  id: string;
  live: number;
  scheduled: number;
  unavailable: boolean;
  lines: ({ id: string } & Counted)[];
}

/**
 * What's wrong on the map now (#474): each Network in trouble, in the map's order, which is `networks`', with a Train late or
 * Cancelled, its live data unavailable, or a Closure the map draws on one of its Lines; but no single Train's Delay,
 * which can be a GPS Delay far from its operator's (#466). Its Lines with Trains late or Cancelled, the most first,
 * then in `lines`' order. And the Networks with Trains on the map and nothing wrong, but for the Metro (METRO).
 * Given each Trip's Train now (`nows`), the Networks whose live data is unavailable, the Closures the map draws, when
 * the day's timetable reads 00:00 and the time now, in ms since 1970.
 */
export function whatsWrong(networks: Pick<Network, 'id'>[], lines: Pick<Line, 'id' | 'network'>[], nows: NowTrip[], unavailable: string[], closures: Pick<Shown, 'line'>[], noonMinus12h: number, at: number) {
  const count = () => ({ trains: 0, live: 0, scheduled: 0, late: 0, cancelled: 0, unreported: 0 });
  const byLine = new Map(lines.map((l) => [l.id, count()]));
  for (const now of nows) {
    const c = byLine.get(now.trip.line);
    if (!c || !now.train) continue;
    c.trains++;
    // A Train with no live data is Scheduled, but counted apart.
    if (now.train.live) c.live++;
    else if (now.train.unreported) c.unreported++;
    else c.scheduled++;
    if (isLate(now.train.delay)) c.late++;
  }
  for (const now of cancelledNow(nows, noonMinus12h, at)) {
    const c = byLine.get(now.trip.line);
    if (c) c.cancelled++;
  }
  const networkOf = new Map(lines.map((l) => [l.id, l.network]));
  const closed = new Set(closures.map((c) => networkOf.get(c.line)));
  const all = networks.map(({ id }): Troubled => {
    const own = lines.filter((l) => l.network === id).map((l) => ({ id: l.id, ...(byLine.get(l.id) ?? count()) }));
    const sum = (key: keyof ReturnType<typeof count>) => own.reduce((n, l) => n + l[key], 0);
    const ranked = own.filter((l) => l.late || l.cancelled).sort((a, b) => b.late + b.cancelled - (a.late + a.cancelled));
    return { id, trains: sum('trains'), live: sum('live'), scheduled: sum('scheduled'), unreported: sum('unreported'), late: sum('late'), cancelled: sum('cancelled'), unavailable: unavailable.includes(id), lines: ranked.map(({ live: _, scheduled: __, ...l }) => l) };
  });
  const inTrouble = (n: Troubled) => n.late > 0 || n.cancelled > 0 || n.unavailable || closed.has(n.id);
  return { trouble: all.filter(inTrouble), quiet: all.filter((n) => !inTrouble(n) && n.trains && n.id !== METRO).map((n) => n.id) };
}

/**
 * The Closures the map draws, by stretch (#474): those of one kind between the same two Stations, either way round, as
 * one, with their Lines in the order given, as T1, T2 and T3's from Francesc Macià to Montesa are; in the order their
 * first comes, its Stations as it has them.
 */
export function byStretch(closures: Pick<Shown, 'line' | 'stations' | 'kind'>[]) {
  const stretches = new Map<string, { lines: string[]; stations: [string, string]; kind: Shown['kind'] }>();
  for (const { line, stations, kind } of closures) {
    const key = `${kind} ${stations.toSorted().join(' ')}`;
    const stretch = stretches.get(key) ?? { lines: [], stations, kind };
    stretch.lines.push(line);
    stretches.set(key, stretch);
  }
  return [...stretches.values()];
}

/** Until when of a day, by Barcelona's clock, in minutes, Now shows each Network's first Train, and from when its last: about 09:00 and about 20:00, as #328 picked. */
const [FIRST_UNTIL, LAST_FROM] = [9 * 60, 20 * 60];

/** The minutes since midnight of a moment, in ms since 1970, by Barcelona's clock. */
const minutesOfDay = (at: number) => {
  const [hours = 0, minutes = 0] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).format(at).split(':').map(Number);
  return hours * 60 + minutes;
};

/**
 * The first and last Trains, at this moment only (#474): until FIRST_UNTIL, when each Network's first of today's Trips
 * leaves its first Station, and after midnight, beside them, the day before's last still to arrive at its last; from
 * LAST_FROM, when today's last arrives, after midnight too; nothing in between. Each in ms since 1970, by `trips`'
 * clock, whose 00:00 is `noonMinus12h` and whose last day is `serviceDay`, an earlier day's Trips led by their day
 * (joinDays()); for the Networks of `networks` that have any, in its order. Days are Barcelona's, by its clock.
 */
export function firstAndLast(networks: Pick<Network, 'id'>[], lines: Pick<Line, 'id' | 'network'>[], trips: Pick<Trip, 'id' | 'line' | 'calls'>[], serviceDay: string, noonMinus12h: number, at: number): { first?: Times; last?: Times } {
  const minutes = minutesOfDay(at);
  const network = new Map(lines.map((l) => [l.id, l.network]));
  // Each Network's first Train's leaving or last's arriving of a day, by Barcelona's date.
  const of = (date: string, which: 'first' | 'last'): Times => {
    const times = new Map<string, number>();
    for (const trip of trips) {
      if ((/^(\d{4}-\d{2}-\d{2})\//.exec(trip.id)?.[1] ?? serviceDay) !== date) continue;
      const [id, time] = [network.get(trip.line), which === 'first' ? trip.calls[0]?.departure : trip.calls.at(-1)?.arrival];
      if (id === undefined || time === undefined) continue;
      const had = times.get(id);
      if (had === undefined || (which === 'first' ? time < had : time > had)) times.set(id, time);
    }
    return networks.flatMap(({ id }) => (times.has(id) ? [{ id, at: noonMinus12h + (times.get(id) ?? 0) * 1000 }] : []));
  };
  const today = madridDate(new Date(at));
  if (minutes >= LAST_FROM) return { last: of(today, 'last') };
  if (minutes >= FIRST_UNTIL) return {};
  // ponytail: the day before by 24 hours, so on the night the clocks go back, an hour after midnight names today again; ask by service day if that hour shows.
  const still = of(madridDate(new Date(at - 86_400_000)), 'last').filter((l) => l.at >= at);
  return { ...(still.length && { last: still }), first: of(today, 'first') };
}

/** When each Network's first or last Train leaves or arrives, in ms since 1970 (firstAndLast()). */
type Times = { id: string; at: number }[];

/**
 * Whether a Station is in France: Cerbère and La Tor de Querol, by their Adif codes, as Rodalies' R11 and R3 reach them, and
 * those Renfe's long-distance timetable names by their UIC codes, France's being 87, as Perpignan. None of them is on the map.
 */
const inFrance = (station: string) => station === 'adif:79316' || station === 'adif:77310' || /^adif:87\d{3}$/.test(station);

/** How soon a Train to or from France has to be leaving its first Station for Now to show it before it runs, in ms: within the hour, as #328 picked. */
const LEAVING = 60 * 60_000;

/**
 * The Trains to and from France at this moment (#474): of `nows`, in their order, the Trips calling at a Station in France
 * whose Trains are on the map, or leave their first Station by their timetable within LEAVING after `at`, in ms since 1970, and
 * aren't Cancelled.
 */
export function toAndFromFrance<N extends Pick<NowTrip, 'trip' | 'train' | 'cancelled'>>(nows: N[], noonMinus12h: number, at: number): N[] {
  return nows.filter(({ trip, train, cancelled }) => {
    if (cancelled || !trip.calls.some((c) => inFrance(c.station))) return false;
    const leaves = noonMinus12h + (trip.calls[0]?.departure ?? -Infinity) * 1000;
    return !!train || (leaves > at && leaves - at <= LEAVING);
  });
}

/**
 * The rack railway and the funiculars at this moment (#474): of `lines`, in their order, those of those kinds while they
 * run, from their first Train of a service day leaving to its last arriving, by `trips`, whose 00:00 is `noonMinus12h`, at
 * `at`, in ms since 1970; each with how many of its Trains are on the map (`nows`), none between runs, and whether one is Live.
 */
export function racksAndFuniculars(lines: Pick<Line, 'id' | 'kind'>[], trips: Pick<Trip, 'id' | 'line' | 'calls'>[], nows: Pick<NowTrip, 'trip' | 'train'>[], noonMinus12h: number, at: number) {
  const seconds = (at - noonMinus12h) / 1000;
  return lines.flatMap(({ id, kind }) => {
    if (kind !== 'rack' && kind !== 'funicular') return [];
    // Each service day's span apart, an earlier day's Trips led by their day (joinDays()), so that the night between two days' runs isn't one.
    const days = new Map<string, [number, number]>();
    for (const t of trips) {
      if (t.line !== id) continue;
      const day = /^\d{4}-\d{2}-\d{2}\//.exec(t.id)?.[0] ?? '';
      const [from, to] = days.get(day) ?? [Infinity, -Infinity];
      days.set(day, [Math.min(from, t.calls[0]?.departure ?? Infinity), Math.max(to, t.calls.at(-1)?.arrival ?? -Infinity)]);
    }
    const running = [...days.values()].some(([from, to]) => from <= seconds && seconds <= to);
    const trains = nows.flatMap((n) => (n.trip.line === id && n.train ? [n.train] : []));
    return running ? [{ id, trains: trains.length, live: trains.some((t) => t.live) }] : [];
  });
}

/**
 * The Lines the Alerts are on that the map has none of (`lines`), of Networks it has loaded (`networks`), as Madrid's C9,
 * Valencia's C5 and Murcia–Alicante's C2, which only buses run (#580): Now lists their Alerts too, with their Network (#474).
 */
export function alertedLines(alerts: Alerts, networks: Pick<Network, 'id'>[], lines: Pick<Line, 'id'>[]): string[] {
  const [loaded, known] = [new Set(networks.map((n) => n.id)), new Set(lines.map((l) => l.id))];
  return [...new Set(Object.values(alerts).flatMap((feed) => feed.alerts.flatMap((a) => a.lines)))].filter((line) => !known.has(line) && loaded.has(line.split(':')[0] ?? ''));
}
