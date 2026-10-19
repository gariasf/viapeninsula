// The Delay history's aggregates (#808): what the screens read of the last 30 days of records, by Line, Train and
// Station, as static files beside the bundles (docs/research/punctuality.md, section 1, "What the aggregates hold";
// ADR-0011). The daily job (punctuality.ts) sums each Network's record of a day (summarize()) and the days into the
// files (aggregate()).

import { addDays, trainKey, type Trip } from '../bundle.ts';
import type { DayRecord } from './punctuality.ts';

/** On time is within 5 minutes, early or late by less (pick 3), in seconds. */
export const ON_TIME = 300;

/** The Delays a Line's day counts its Calls within, in seconds: 1, 3, 5 and 15 minutes, so that Renfe's own 3 can be shown too (pick 3). */
const WITHIN = [60, 180, 300, 900];

/** The share of a day's minutes a Network's feed has to have worked for its day to count (section 5, "Gaps"): under it, the day reads as unreported Trips, which is not Trains not running. */
const COVERED = 0.9;

/** A byte's flag for a GPS Delay no report after it confirmed (punctuality.ts' UNCONFIRMED): left out of every figure (pick 5). */
const UNCONFIRMED = 8;

/**
 * The Lines with no figure, by their IDs, and the Networks, by theirs: those section 4 rates none, FGC's rack and
 * funicular, RL1 and RL2 (the Metro isn't recorded); and Euskotren, whose live times are its timetable's, so its
 * Delays are always 0 s and would read as 100% on time (#825).
 */
const NO_FIGURE = new Set(['fgc:MM', 'fgc:FV', 'fgc:RL1', 'fgc:RL2', 'euskotren']);

/** Whether a Line's Trains have a figure (NO_FIGURE): its ID leads with its Network's. */
export const rated = (line: string) => !NO_FIGURE.has(line) && !NO_FIGURE.has(line.slice(0, line.indexOf(':')));

/**
 * A Line's day: its Trips the timetable ran, those Cancelled, those live data named, and its Calls with a Delay
 * within 1, 3, 5 and 15 minutes (WITHIN), each counted once, in the first it's within, and those over 15.
 */
export type LineDay = [run: number, cancelled: number, reported: number, within1: number, within3: number, within5: number, within15: number, over: number];

/** A Station's day: its Calls with a Delay, those on time (ON_TIME), and the sum of their Delays, in seconds, which a file gives as the mean. */
export type StationDay = [calls: number, onTime: number, delay: number];

/** A Network's record of a service day, summed: by Line, by Station, and each Train's day figure by its key (trainKey()). */
export interface DaySummary {
  date: string;
  network: string;
  rules: string;
  /** The share of the day's 1,440 minutes the Network's feed worked (section 5, "Gaps"). */
  covered: number;
  lines: Map<string, LineDay>;
  stations: Map<string, StationDay>;
  /** A Train's day figure: its Delay at its last Call with one, in seconds, as railisland's "final delay". */
  trains: Map<string, number>;
}

/**
 * A Network's record of a day summed, from its Trips in the record's order. Only the rated Lines' (rated()), and
 * of their Calls only those whose Delay is confirmed (pick 5). A last Call's last-known Delay counts (pick 4).
 */
export function summarize(network: string, record: DayRecord, trips: Trip[]): DaySummary {
  if (trips.length !== record.delays.length) throw new Error(`${record.day}/${network}: ${record.delays.length} Trips recorded, ${trips.length} in its Trips file`);
  const summary: DaySummary = { date: record.day, network, rules: record.rules, covered: (record.feeds[network] ?? 0) / 1440, lines: new Map(), stations: new Map(), trains: new Map() };
  const [cancelled, unreported] = [new Set(record.cancelled), new Set(record.unreported)];
  trips.forEach((trip, i) => {
    if (!rated(trip.line)) return;
    const line = summary.lines.get(trip.line) ?? [0, 0, 0, 0, 0, 0, 0, 0];
    summary.lines.set(trip.line, line);
    line[0]++;
    if (cancelled.has(i)) line[1]++;
    if (!unreported.has(i)) line[2]++;
    let figure: number | undefined;
    record.delays[i]?.forEach((delay, c) => {
      const from = record.from[i]?.[c];
      const station = trip.calls[c]?.station;
      if (delay === null || from === null || from === undefined || from & UNCONFIRMED || !station) return;
      const bucket = 3 + WITHIN.filter((within) => delay > within).length;
      line[bucket] = (line[bucket] ?? 0) + 1;
      const day = summary.stations.get(station) ?? [0, 0, 0];
      summary.stations.set(station, day);
      day[0]++;
      if (delay <= ON_TIME) day[1]++;
      day[2] += delay;
      figure = delay;
    });
    if (figure !== undefined) summary.trains.set(trainKey(trip), figure);
  });
  return summary;
}

/** What each file says of its days, oldest first: the rules hash of src/engine.ts each was worked out at (section 5), and the days of each Network left out (section 5, "Gaps"). */
interface Days {
  days: string[];
  rules: string[];
  gaps: Record<string, string[]>;
}

/** Each rated Line's days, in the order of `days`, 0 where it ran no Trip or was left out. */
export interface LinesFile extends Days {
  lines: Record<string, (LineDay | 0)[]>;
}

/** Each Station's days: its Calls with a Delay, those on time and their mean, in seconds, 0 where none. */
export interface StationsFile extends Days {
  stations: Record<string, (StationDay | 0)[]>;
}

/**
 * A Network's Trains, a file for each Network, so that a followed Train's card reads one Network's: their keys
 * (trainKey()), in order, and for the Train at each index its days seen, the mean of its day figures, the days it
 * was on time (ON_TIME), and its worst day figure, in seconds. A column each, as a row each took FGC's 30 days
 * from 11.6 to 16.2 KB brotli'd, past a card's 13 (section 1).
 */
export interface TrainsFile extends Days {
  trains: { keys: string[]; seen: number[]; mean: number[]; onTime: number[]; worst: number[] };
}

/** The files from days' summaries: a day each, oldest first, with whatever Networks recorded it, but a Network's day its feed worked under COVERED of, which each file names. */
export function aggregate(summaries: DaySummary[]): { lines: LinesFile; stations: StationsFile; trains: Map<string, TrainsFile> } {
  const days = [...new Set(summaries.map((s) => s.date))].sort();
  const index = new Map(days.map((d, i) => [d, i]));
  const rules = days.map((d) => summaries.find((s) => s.date === d)?.rules ?? '');
  const gaps: Record<string, string[]> = {};
  const lines: LinesFile['lines'] = {};
  const stations: StationsFile['stations'] = {};
  const figures = new Map<string, Map<string, number[]>>();
  for (const s of summaries) {
    if (s.covered < COVERED) {
      (gaps[s.network] ??= []).push(s.date);
      continue;
    }
    const i = index.get(s.date) as number;
    for (const [id, day] of s.lines) (lines[id] ??= days.map(() => 0))[i] = day;
    for (const [id, [calls, onTime, delay]] of s.stations) {
      const row = (stations[id] ??= days.map(() => 0));
      const known = row[i] || [0, 0, 0];
      row[i] = [known[0] + calls, known[1] + onTime, known[2] + delay];
    }
    const trains = figures.get(s.network) ?? new Map<string, number[]>();
    figures.set(s.network, trains);
    for (const [key, figure] of s.trains) trains.set(key, [...(trains.get(key) ?? []), figure]);
  }
  for (const row of Object.values(stations)) row.forEach((day, i) => day && (row[i] = [day[0], day[1], Math.round(day[2] / day[0])]));
  const trains = new Map<string, TrainsFile>();
  for (const [network, of] of figures) {
    if (!of.size) continue;
    const keys = [...of.keys()].sort();
    const each = keys.map((key) => of.get(key) as number[]);
    const file: TrainsFile = {
      days,
      rules,
      gaps: { [network]: gaps[network] ?? [] },
      trains: { keys, seen: each.map((f) => f.length), mean: each.map((f) => Math.round(f.reduce((a, b) => a + b, 0) / f.length)), onTime: each.map((f) => f.filter((d) => d <= ON_TIME).length), worst: each.map((f) => Math.max(...f)) },
    };
    trains.set(network, file);
  }
  return { lines: { days, rules, gaps, lines }, stations: { days, rules, gaps, stations }, trains };
}

/**
 * The Lines' year: the year file's days before the fresh file's first, which aren't worked out again, and the fresh
 * file's, 365 days in all up to its last. A Line with no day left goes.
 */
export function yearOf(old: LinesFile | undefined, fresh: LinesFile): LinesFile {
  const [first, last] = [fresh.days[0] ?? '', fresh.days.at(-1) ?? ''];
  const from = addDays(last, -364);
  const kept = (old?.days ?? []).flatMap((d, i) => (d >= from && d < first ? [i] : []));
  const days = [...kept.map((i) => old?.days[i] as string), ...fresh.days];
  const lines: LinesFile['lines'] = {};
  for (const id of new Set([...Object.keys(old?.lines ?? {}), ...Object.keys(fresh.lines)])) {
    const row = [...kept.map((i) => old?.lines[id]?.[i] ?? 0), ...(fresh.lines[id] ?? fresh.days.map(() => 0))];
    if (row.some((day) => day)) lines[id] = row;
  }
  const gaps: LinesFile['gaps'] = {};
  for (const [network, of] of Object.entries(old?.gaps ?? {})) {
    const left = of.filter((d) => d >= from && d < first);
    if (left.length) gaps[network] = left;
  }
  for (const [network, of] of Object.entries(fresh.gaps)) gaps[network] = [...(gaps[network] ?? []), ...of];
  return { days, rules: [...kept.map((i) => old?.rules[i] ?? ''), ...fresh.rules], gaps, lines };
}
