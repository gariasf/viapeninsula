// A yardstick for how far a followed Train's card and the Train drawn on the map disagree, second by second (#352), as jumps() is one for Live Trains' jumps (#31).
//
// The card (trainAt() and the strip in main.ts) and the drawn Train come from one moment of the
// timetable, so they can't disagree about which leg the Train is on: what can differ is what the
// words say about it, how near a Station the pill is drawn, and the time the card gives against the
// moment the drawn Train gets there. This takes one Train at one second and says which of those
// differ; src/cardVsMapRun.ts runs it over a recording (`npm run card-vs-map`). Its words are the
// card's own, by whereabouts() (#455): where it says the Train is, by how far it's drawn from its
// Stations, against how far the followed pill reaches, and the place it passes without stopping, if
// it's on one (#457); and its countdown, by countdownTo() (#456), beside what the minute-reading
// card, as a board's rows are, would have said. Its times run the Delay the Train is drawn at (#610), which eases to
// the one live data gave as the Train does, where a board's rows run the one live data gave, and it has none at its
// Trip's last Station, where the Train stands arrived (#607).

import type { Call, SpeedProfile } from './bundle.ts';
import { countdownTo, due, minutesTo, whereabouts, type Countdown } from './web/cards.ts';

/** How near a Station a Train is drawn, in px on the screen, for its dot to be at it: about 50 m at zoom 13, 12 m at zoom 15. */
export const AT = 7;

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
  /** How late the card's times run, in seconds: the Delay the Train is drawn at, which the engine's `drawnDelay` has and its `delay`, a Metro Train's too, does not (#610). */
  delay: number;
  /** How late live data last gave it, in seconds, which a board's rows and Nearby's run (the engine's `delay`): the card's `delay` where none is given. */
  reported?: number;
  /** How far along its shape it's drawn, in metres. */
  dist: number;
  /** Its Trip's calls as it makes them, with the key the card names each by, how far the Train is drawn from the dot of its Station's place, in metres, where `near` is not that, and how far that dot is from the Station (none: 0). */
  calls: (Call & { key: string; away?: number; offset?: number })[];
  /** Whether it stands at the first Station it has still to leave. */
  standing: boolean;
  /** Every place's dot within the arrow's reach of where it's drawn, and within `reach.at` where that is more, nearest first. */
  near: Near[];
  /** How far its followed pill reaches along its track, in metres: its box alone, which the card goes by (pillReach()), and with its arrow; and how near a Station it's drawn for its dot to be at it, AT px at the zoom its pill is drawn at. */
  reach: { pill: number; arrow: number; at: number };
  /**
   * The place the card has it pass without stopping, the nearest of those of its own Network's it has no call at
   * (passedPlace(), over the places' dots, which the card goes by whichever Stations `near` counts by), by the key the card
   * names places by, and how far it's drawn from its dot, in metres, within its pill's reach or not (whereabouts() says);
   * none where it has none near.
   */
  passed?: Near;
  profile: SpeedProfile;
  /** Where its last report pinned it to a Station, as Renfe's do: how far along its Trip that Station is, in metres, and its place in the Trip's calls. */
  pin?: { dist: number; call: number };
}

/** Which kind of Station a drawn Train is at or covers, against the one the card has it at or just left. */
export type Kind = 'next' | 'otherCall' | 'notCall';

/** What differs between the card and the drawn Train in one second: each flag one of the ticket's causes, counted on its own. */
export interface Differences {
  /** What the card says of where the Train is, and the Station or Stations it names: A, B or `A – B` by the key the card names them by. */
  says: { at: 'arriving' | 'standing' | 'leaving' | 'passing' | 'between'; key: string };
  /**
   * Cause 1: the Train is drawn at B without standing there, and the card doesn't say it's arriving
   * there: before #455 it said `Left A` and the header `Next station B`. And it stands at B and the
   * header doesn't say so, which it said as `Next station` then too.
   */
  atNextBeforeArriving: boolean;
  standingHeaderNext: boolean;
  /** The card's Station isn't the one the Train is drawn at: at a Station the card doesn't name (the one it has it at, just left, or the place it passes), by kind, and by which key. */
  at: Kind | undefined;
  atKey: string | undefined;
  /** Cause 2 and 4: the followed pill, and with its arrow, covers a Station the card doesn't name, by kind; and which, for the pill. */
  pill: Kind | undefined;
  arrow: Kind | undefined;
  pillKey: string | undefined;
  /** Of what its arrow covers, whether it's the next Station and within the speed model's braking distance of it: where `Arriving at B` would be true by braking, which the card doesn't go by (the pill's reach, #352's pick). */
  graced: boolean;
  /**
   * What the minute-reading card, as a board's rows are (minutesTo()), reads `now` (0 minutes) for, and while the Train is more
   * than FAR from the Station it counts to, and how many seconds it has still to go there by the drawn Train: #352's column,
   * kept as it was, for what the followed Train's card said until #456 and a board's rows still say, by the Delay live data
   * gave, as they do (#610).
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
  /**
   * The card's time for the Station it counts down to, with the Delay the Train is drawn at, in ms since 1970, and which Station and which of
   * its times it counts to (`B arrives`, `B leaves`; where it stands at its Trip's last Station, `arrives`, as it's expected there when it arrived):
   * to see its steps. And whether it counts down to it, which it doesn't at its Trip's last Station, where it has stood since its time (#607).
   */
  expected: number;
  countsTo: string;
  countdown: boolean;
  /** The same time for the same Station by the Delay live data gave, as a board's row for it, or Nearby's, has it, in ms since 1970: where the card is later or earlier than live data (#610). */
  reportedAt: number;
  /** The Train is drawn within `reach.at` of its next Station, and doesn't stand there: the last of its way in. */
  atNext: boolean;
  /**
   * Cause 5: the Delay live data gave, which a board's rows run, against how late the Train is drawn, in seconds: positive where the Train is
   * drawn ahead of its Delay. It was the card's time for its next Station against when the drawn Train gets there until #610, when the card began
   * to run the Delay the Train is drawn at, which eases to live data's, so that its own is none, but for a Train held or let out (#610).
   */
  timeOff: number;
  /** Cause 6: the Train's last report pins it to a Station, and it's drawn more than FAR from that Station along its Trip, short of it or already past it. */
  pinnedAway: 'short' | 'past' | undefined;
}

/** The leg's words and time the card would give for one Train at one second, against where it's drawn: undefined where it has no Station left to leave. */
export function differences(m: Moment): Differences | undefined {
  const upcoming = m.calls.filter((c) => c.departure >= m.time);
  const earlier = m.calls.length - upcoming.length;
  const next = upcoming[0];
  // What the card says: it stands at the next, or is arriving at it within the pill's reach, or leaving the one it left within as far after it, or is passing the place
  // it has no call at within as far of it, or between them, by how far along its Trip each is, how far its place's dot is and the stretch between the two, as the card goes by all three.
  const dot = (call: { key: string; away?: number; offset?: number }) => ({ away: call.away ?? m.near.find((n) => n.key === call.key)?.metres ?? Infinity, offset: call.offset ?? 0 });
  const says = whereabouts(m.calls, m.dist, upcoming.length, m.standing, m.reach.pill, dot, m.passed && { place: m.passed, away: m.passed.metres });
  if (!next || !says) return undefined;
  // Which Station the card has it at: the one it names, as arriving at, standing at or leaving, or the place it passes; none, between two.
  const named = says.at === 'between' ? undefined : says.at === 'passing' ? says.place : (says.at === 'leaving' ? says.last : says.next);
  const has = named?.key;
  const kindOf = (key: string): Kind => (key === next.key ? 'next' : m.calls.some((c) => c.key === key) ? 'otherCall' : 'notCall');
  const unnamed = (metres: number, covers = (_: Near) => true) => m.near.find((n) => n.metres <= metres && n.key !== has && covers(n));
  const kind = (n: Near | undefined) => n && kindOf(n.key);
  const [atAt, pillAt] = [unnamed(m.reach.at), unnamed(m.reach.pill)];
  // Its arrow points ahead, so it covers no Station it has left, unless the Trip comes back to it.
  const left = new Set(m.calls.slice(0, earlier).map((c) => c.key));
  const ahead = (n: Near) => !left.has(n.key) || upcoming.some((c) => c.key === n.key);

  // Which of its times the card has for the Station: its arrival, or its departure where it stands there, but its arrival where it ends its Trip there (#607).
  const { at: dueAt, countdown } = due(next, m.standing, upcoming.length === 1);
  const reported = m.reported ?? m.delay;
  const expected = m.noon + (dueAt + m.delay) * 1000;
  const reportedAt = m.noon + (dueAt + reported) * 1000;
  // The minute-reading card: a board's row, by the Delay live data gave, which departs a Station it stands at, as before.
  const boardAt = m.noon + ((m.standing ? next.departure : next.arrival) + reported) * 1000;
  const reads0 = minutesTo(boardAt, m.at) === 0;
  const gap = Math.abs(next.dist - m.dist);
  const far = !m.standing && gap > FAR;
  const nowFar = reads0 && far;
  const reads = countdownTo(expected, m.at);
  const atNext = !m.standing && m.near.some((n) => n.metres <= m.reach.at && n.key === next.key);
  // How long the drawn Train has to its timetable's time for the Station, in seconds: its own clock, whatever the card counts by.
  const toGo = (m.standing ? next.departure : next.arrival) - m.time;
  // How far short of a Station the speed model has a Train braking at most: where `Arriving at B` would be true by braking, which the card doesn't go by (the pill's reach, #352's pick).
  const brake = m.profile.topSpeed ** 2 / (2 * m.profile.braking);
  const arrow = unnamed(m.reach.arrow, ahead);
  return {
    says: { at: says.at, key: says.at === 'between' ? `${says.last.key} – ${says.next.key}` : (named?.key ?? '') },
    atNextBeforeArriving: atNext && says.at !== 'arriving',
    standingHeaderNext: m.standing && says.at !== 'standing',
    at: kind(atAt),
    atKey: atAt?.key,
    pill: kind(pillAt),
    pillKey: pillAt?.key,
    arrow: kind(arrow),
    graced: arrow?.key === next.key && gap <= brake,
    readsNow: reads0,
    nowFar,
    toGo,
    nowByMinute: nowFar && boardAt > m.at,
    nowByDelay: nowFar && boardAt <= m.at,
    reads,
    countdownNowFar: reads.n === 0 && far,
    expected,
    countsTo: `${next.key} ${m.standing && countdown ? 'leaves' : 'arrives'}`,
    countdown,
    reportedAt,
    atNext,
    // The Delay live data gave less the Delay the drawn Train is at, `now - time`: a board's time for the Station, and the card's before #610, against the time the drawn Train gets there at, `due + (now - time)`.
    timeOff: reported - (m.now - m.time),
    pinnedAway: m.pin && Math.abs(m.pin.dist - m.dist) > FAR ? (m.pin.call >= earlier ? 'short' : 'past') : undefined,
  };
}
