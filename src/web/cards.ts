// What the cards work out from the days on the map and the engine's Trains: minutes to go, Nearby's rows, how far along its Trip a followed Train is, and a board's Lines (#321); and from alerts.json, the Alerts each shows (#342).
import type { Alert, Alerts, Call, Trip, Words } from '../bundle.ts';
import type { Pass } from '../engine.ts';
import type { Language } from './i18n.ts';

/** The whole minutes from `now` to `at`, both in ms since 1970, as a clock showing minutes reads them, as a board shows times: none for a time this minute, or past. */
export function minutesTo(at: number, now: number): number {
  return Math.max(0, Math.floor(at / 60_000) - Math.floor(now / 60_000));
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

/** The Lines whose Trips call at any of `stations`, a place's, as a board names them: of `lines`, in their order. */
export function linesCallingAt(trips: Trip[], stations: string[], lines: string[]): string[] {
  const here = new Set(stations);
  const calling = new Set(trips.filter((trip) => trip.calls.some((c) => here.has(c.station))).map((trip) => trip.line));
  return lines.filter((line) => calling.has(line));
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
 * The Alerts a card shows, from alerts.json: a followed Train's, those on its Line; a board's, those
 * on its place's Stations and on the Lines that call there. Newest first, whichever operator's they
 * are, and last those that don't say when they began, as each feed has them. Each in `lang`, the
 * viewer's language, where its feed has it, or else in the feed's own, its first (ADR-0012). And
 * where it's over STALE before `now`, when the feed read longest ago of those whose Alerts it shows
 * was read, all times in ms since 1970.
 * ponytail: a card with no Alerts says nothing of a feed that has gone unread. Say when its feed was read
 * there too if that's missed, once the page knows which feed has a Line's Alerts.
 */
export function cardAlerts(alerts: Alerts, { lines, stations }: { lines: string[]; stations: string[] }, lang: Language, now: number): { alerts: CardAlert[]; asOf?: number } {
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
  return { alerts: shown.sort((a, b) => (b.from ?? 0) - (a.from ?? 0)), ...(now - read > STALE && { asOf: read }) };
}
