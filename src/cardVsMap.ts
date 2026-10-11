// A yardstick for how far a followed Train's card and the Train drawn on the map disagree, second by second (#352), as jumps() is one for Live Trains' jumps (#31).
//
// The card (trainAt() and the strip in main.ts) and the drawn Train come from one moment of the
// timetable, so they can't disagree about which leg the Train is on: what can differ is what the
// words say about it, how near a Station the pill is drawn, and the time the card gives against the
// moment the drawn Train gets there. This takes one Train at one second and says which of those
// differ; src/cardVsMapRun.ts runs it over a recording (`npm run card-vs-map`). Its words are the
// card's own, by whereabouts() (#455): where it says the Train is, by how far it's drawn from its
// Stations, against how far the followed pill reaches; and its countdown, by countdownTo() (#456),
// beside what the minute-reading card, as a board's rows are, would have said.

import type { Call, SpeedProfile } from './bundle.ts';
import { countdownTo, minutesTo, whereabouts, type Countdown } from './web/cards.ts';

/** How near a Station a Train is drawn, in metres, for its dot to be at it: about 7 px at zoom 13. */
export const AT = 50;

/** How far short of a Station a Train can be, in metres, before the card reading `now` for it is early by more than a Station's dot. */
export const FAR = 200;

/** How far the card's time can be from the drawn Train's, in seconds, before it's more than a minute of a clock showing minutes. */
export const OFF = 60;

/** A place's dot near the drawn Train, where the map shows Stations as one, by the key the card names places by (places()'s ID), and how far in metres. */
export interface Near {
  key: string;
  metres: number;
}

/** One Train at one second, as the engine has it and as the card's text would be built from it. */
export interface Moment {
  /** The clock the card counts its time to go by, in ms since 1970: the map's time, mapTime(), as main.ts has it since #356 (the device's second and `behind()`, which is 0 in every second of the six recordings, so it's the device's there); and the service day's noon minus 12 h (`bundle.noonMinus12h`), which the Trip's seconds count from. */
  at: number;
  noon: number;
  /** Seconds into the service day by the fetcher's clock, which the drawn Train runs by, and where in its timetable it's drawn, the same way. */
  now: number;
  time: number;
  /** How late the card's times run, in seconds: Followed's `delay` or, for a Metro Train, the one it works from. */
  delay: number;
  /** How far along its shape it's drawn, in metres. */
  dist: number;
  /** Its Trip's calls as it makes them, with the key the card names each by and how far the Train is drawn from the dot of its Station's place, in metres, where `near` is not that. */
  calls: (Call & { key: string; away?: number })[];
  /** Whether it stands at the first Station it has still to leave. */
  standing: boolean;
  /** Every place's dot within `reach` of where it's drawn, nearest first. */
  near: Near[];
  /** How far its followed pill reaches along its track, in metres: its box alone, which the card goes by (pillReach()), and with its arrow. */
  reach: { pill: number; arrow: number };
  profile: SpeedProfile;
  /** Where its last report pinned it to a Station, as Renfe's do: how far along its Trip that Station is, in metres, and its place in the Trip's calls. */
  pin?: { dist: number; call: number };
}

/** Which kind of Station a drawn Train is at or covers, against the one the card has it at or just left. */
export type Kind = 'next' | 'otherCall' | 'notCall';

/** What differs between the card and the drawn Train in one second: each flag one of the ticket's causes, counted on its own. */
export interface Differences {
  /** What the card says of where the Train is, and the Station or Stations it names: A, B or `A – B` by the key the card names them by. */
  says: { at: 'arriving' | 'standing' | 'leaving' | 'between'; key: string };
  /**
   * Cause 1: the Train is drawn at B without standing there, and the card doesn't say it's arriving
   * there: before #455 it said `Left A` and the header `Next station B`. And it stands at B and the
   * header doesn't say so, which it said as `Next station` then too.
   */
  atNextBeforeArriving: boolean;
  standingHeaderNext: boolean;
  /** The card's Station isn't the one the Train is drawn at: at a Station the card doesn't have it at or just left, by kind. */
  at: Kind | undefined;
  /** Cause 2 and 4: the followed pill, and with its arrow, covers a Station the card doesn't have the Train at or just left, by kind. */
  pill: Kind | undefined;
  arrow: Kind | undefined;
  /** Of what its arrow covers, whether it's the next Station and within the speed model's braking distance of it: where `Arriving at B` would be true by braking, which the card doesn't go by (the pill's reach, #352's pick). */
  graced: boolean;
  /**
   * What the minute-reading card, as a board's rows are (minutesTo()), reads `now` (0 minutes) for, and while the Train is more
   * than FAR from the Station it counts to, and how many seconds it has still to go there by the drawn Train: #352's column,
   * kept as it was, for what the followed Train's card said until #456 and a board's rows still say.
   */
  readsNow: boolean;
  nowFar: boolean;
  toGo: number;
  /** Cause 3, of those: the card's time hasn't come by the clock, and the minute alone reads 0. */
  nowByMinute: boolean;
  /** Cause 5, of those: the card's time has come by the clock, the drawn Train behind its Delay. */
  nowByDelay: boolean;
  /**
   * What the followed Train's countdown reads (#456), by countdownTo(): the seconds to the card's time in its last minute, the
   * minutes a board shows before that; and whether it reads now (0 s) while the Train is more than FAR from the Station it counts
   * to, which it does only once the card's time has come, so only by the Delay: `nowByMinute` for it is none by its rule.
   */
  reads: Countdown;
  countdownNowFar: boolean;
  /** The card's time for the Station it counts down to, with its Delay, in ms since 1970, and which Station and which of its times it counts to (`B arrives`, `B leaves`): to see its steps. */
  expected: number;
  countsTo: string;
  /** The Train is drawn within AT of its next Station, and doesn't stand there: the last of its way in. */
  atNext: boolean;
  /** Cause 5: the card's time for its next Station against when the drawn Train gets there, in seconds: positive where the Train is drawn ahead of its Delay. */
  timeOff: number;
  /** Cause 6: the Train's last report pins it to a Station, and it's drawn more than FAR from that Station along its Trip, short of it or already past it. */
  pinnedAway: 'short' | 'past' | undefined;
}

/** The leg's words and time the card would give for one Train at one second, against where it's drawn: undefined where it has no Station left to leave. */
export function differences(m: Moment): Differences | undefined {
  const upcoming = m.calls.filter((c) => c.departure >= m.time);
  const earlier = m.calls.length - upcoming.length;
  const next = upcoming[0];
  // What the card says: it stands at the next, or is arriving at it within the pill's reach, or leaving the one it left within as far after it, or between them,
  // by how far along its Trip each is and how far its place's dot is, as the card goes by both.
  const dot = (call: { key: string; away?: number }) => call.away ?? m.near.find((n) => n.key === call.key)?.metres ?? Infinity;
  const says = whereabouts(m.calls, m.dist, upcoming.length, m.standing, m.reach.pill, dot);
  if (!next || !says) return undefined;
  // Which Station the card has it at: the one it names, as arriving at, standing at or leaving; none, between two.
  const named = says.at === 'between' ? undefined : (says.at === 'leaving' ? says.last : says.next);
  const has = named?.key;
  const kindOf = (key: string): Kind => (key === next.key ? 'next' : m.calls.some((c) => c.key === key) ? 'otherCall' : 'notCall');
  const unnamed = (metres: number, covers = (_: Near) => true) => m.near.find((n) => n.metres <= metres && n.key !== has && covers(n));
  const kind = (n: Near | undefined) => n && kindOf(n.key);
  // Its arrow points ahead, so it covers no Station it has left, unless the Trip comes back to it.
  const left = new Set(m.calls.slice(0, earlier).map((c) => c.key));
  const ahead = (n: Near) => !left.has(n.key) || upcoming.some((c) => c.key === n.key);

  const due = m.standing ? next.departure : next.arrival;
  const expected = m.noon + (due + m.delay) * 1000;
  const reads0 = minutesTo(expected, m.at) === 0;
  const gap = Math.abs(next.dist - m.dist);
  const far = !m.standing && gap > FAR;
  const nowFar = reads0 && far;
  const reads = countdownTo(expected, m.at);
  const atNext = !m.standing && m.near.some((n) => n.metres <= AT && n.key === next.key);
  // How long the drawn Train has to its timetable's time for the Station, in seconds: its own clock, whatever the card counts by.
  const toGo = due - m.time;
  // How far short of a Station the speed model has a Train braking at most: where `Arriving at B` would be true by braking, which the card doesn't go by (the pill's reach, #352's pick).
  const brake = m.profile.topSpeed ** 2 / (2 * m.profile.braking);
  const arrow = unnamed(m.reach.arrow, ahead);
  return {
    says: { at: says.at, key: says.at === 'between' ? `${says.last.key} – ${says.next.key}` : (named?.key ?? '') },
    atNextBeforeArriving: atNext && says.at !== 'arriving',
    standingHeaderNext: m.standing && says.at !== 'standing',
    at: kind(unnamed(AT)),
    pill: kind(unnamed(m.reach.pill)),
    arrow: kind(arrow),
    graced: arrow?.key === next.key && gap <= brake,
    readsNow: reads0,
    nowFar,
    toGo,
    nowByMinute: nowFar && expected > m.at,
    nowByDelay: nowFar && expected <= m.at,
    reads,
    countdownNowFar: reads.n === 0 && far,
    expected,
    countsTo: `${next.key} ${m.standing ? 'leaves' : 'arrives'}`,
    atNext,
    // The card's time is `due + delay`; the drawn Train is `now - time` behind its timetable, and gets there at `due + (now - time)`.
    timeOff: m.delay - (m.now - m.time),
    pinnedAway: m.pin && Math.abs(m.pin.dist - m.dist) > FAR ? (m.pin.call >= earlier ? 'short' : 'past') : undefined,
  };
}
