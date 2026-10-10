// A yardstick for how far a followed Train's card and the Train drawn on the map disagree, second by second (#352), as jumps() is one for Live Trains' jumps (#31).
//
// The card (trainAt() and the strip in main.ts) and the drawn Train come from one moment of the
// timetable, so they can't disagree about which leg the Train is on: what can differ is what the
// words say about it, how near a Station the pill is drawn, and the time the card gives against the
// moment the drawn Train gets there. This takes one Train at one second and says which of those
// differ; src/cardVsMapRun.ts runs it over a recording (`npm run card-vs-map`).

import type { Call, SpeedProfile } from './bundle.ts';

/** How near a Station a Train is drawn, in metres, for its dot to be at it: about 7 px at zoom 13. */
export const AT = 50;

/** How far short of a Station a Train can be, in metres, before the card reading `now` for it is early by more than a Station's dot. */
export const FAR = 200;

/** How far the card's time can be from the drawn Train's, in seconds, before it's more than a minute of a clock showing minutes. */
export const OFF = 60;

/** A Station near the drawn Train, by the key the card names places by (their `place`, or else name), and how far in metres. */
export interface Near {
  key: string;
  metres: number;
}

/** One Train at one second, as the engine has it and as the card's text would be built from it. */
export interface Moment {
  /** The clock the card counts its minutes to go by, in ms since 1970 (the device's, `Date.now()`, as main.ts has it; #356 makes it the map's), and the service day's noon minus 12 h (`bundle.noonMinus12h`), which the Trip's seconds count from. */
  at: number;
  noon: number;
  /** Seconds into the service day by the fetcher's clock, which the drawn Train runs by, and where in its timetable it's drawn, the same way. */
  now: number;
  time: number;
  /** How late the card's times run, in seconds: Followed's `delay` or, for a Metro Train, the one it works from. */
  delay: number;
  /** How far along its shape it's drawn, in metres. */
  dist: number;
  /** Its Trip's calls as it makes them, with the key the card names each by. */
  calls: (Call & { key: string })[];
  /** Whether it stands at the first Station it has still to leave. */
  standing: boolean;
  /** Every Station within `reach` of where it's drawn, nearest first. */
  near: Near[];
  /** How far its followed pill reaches along its track, in metres: its box alone, and with its arrow. */
  reach: { pill: number; arrow: number };
  profile: SpeedProfile;
  /** Where its last report pinned it to a Station, as Renfe's do: how far along its Trip that Station is, in metres, and its place in the Trip's calls. */
  pin?: { dist: number; call: number };
}

/** Which kind of Station a drawn Train is at or covers, against the one the card has it at or just left. */
export type Kind = 'next' | 'otherCall' | 'notCall';

/** What differs between the card and the drawn Train in one second: each flag one of the ticket's causes, counted on its own. */
export interface Differences {
  /** Cause 1: the card says `Left A` and the header `Next station B` while the Train is drawn at B, or stands at B and the header still says next. */
  atNextBeforeArriving: boolean;
  standingHeaderNext: boolean;
  /** The card's Station isn't the one the Train is drawn at: at a Station the card doesn't have it at or just left, by kind. */
  at: Kind | undefined;
  /** Cause 2 and 4: the followed pill, and with its arrow, covers a Station the card doesn't have the Train at or just left, by kind. */
  pill: Kind | undefined;
  arrow: Kind | undefined;
  /** Of what its arrow covers, whether it's the next Station and within the speed model's braking distance of it: where `Arriving at B` would be true. */
  graced: boolean;
  /** The countdown reads `now` (0 minutes), and while the Train is more than FAR from the Station it counts to, and how many seconds it has still to go there by the drawn Train. */
  readsNow: boolean;
  nowFar: boolean;
  toGo: number;
  /** Cause 3, of those: the card's time hasn't come by the device's clock, and the minute alone reads 0. */
  nowByMinute: boolean;
  /** Cause 5, of those: the card's time has come by the clock, the drawn Train behind its Delay. */
  nowByDelay: boolean;
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
  if (!next) return undefined;
  // Which Station the card has it at (standing: the next) or just left (`now · Left A`), if it has left one.
  const lastLeft = m.standing ? undefined : m.calls[earlier - 1];
  const has = (m.standing ? next : lastLeft)?.key;
  const kindOf = (key: string): Kind => (key === next.key ? 'next' : m.calls.some((c) => c.key === key) ? 'otherCall' : 'notCall');
  const unnamed = (metres: number) => m.near.find((n) => n.metres <= metres && n.key !== has);
  const kind = (n: Near | undefined) => n && kindOf(n.key);

  const due = m.standing ? next.departure : next.arrival;
  const expected = m.noon + (due + m.delay) * 1000;
  const reads0 = Math.floor(expected / 60_000) - Math.floor(m.at / 60_000) <= 0;
  const gap = Math.abs(next.dist - m.dist);
  const nowFar = reads0 && !m.standing && gap > FAR;
  // How long the drawn Train has to its timetable's time for the Station, in seconds: its own clock, whatever the card counts by.
  const toGo = due - m.time;
  // How far short of a Station the speed model has a Train braking at most: where `Arriving at B` would be true.
  const brake = m.profile.topSpeed ** 2 / (2 * m.profile.braking);
  const arrow = unnamed(m.reach.arrow);
  return {
    atNextBeforeArriving: !m.standing && m.near.some((n) => n.metres <= AT && n.key === next.key),
    standingHeaderNext: m.standing,
    at: kind(unnamed(AT)),
    pill: kind(unnamed(m.reach.pill)),
    arrow: kind(arrow),
    graced: arrow?.key === next.key && gap <= brake,
    readsNow: reads0,
    nowFar,
    toGo,
    nowByMinute: nowFar && expected > m.at,
    nowByDelay: nowFar && expected <= m.at,
    // The card's time is `due + delay`; the drawn Train is `now - time` behind its timetable, and gets there at `due + (now - time)`.
    timeOff: m.delay - (m.now - m.time),
    pinnedAway: m.pin && Math.abs(m.pin.dist - m.dist) > FAR ? (m.pin.call >= earlier ? 'short' : 'past') : undefined,
  };
}
