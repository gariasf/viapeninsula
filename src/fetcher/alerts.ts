// The operators' Alerts (ADR-0012): each run, the answers of the alerts feeds that were due in, and
// alerts.json out, a file of its own on R2 beside the snapshot (ADR-0003). It's pure, as the fetcher
// step is, and never loads timetable data either: Renfe's route_ids end with their Line's name.

import type { Alert, AlertFeed, Alerts, Words } from '../bundle.ts';
import { LIVE_SOURCES, RODALIES, type LiveSource } from '../networks.ts';
import { HALVES, json, ms, networkOf, onTime, tramToken, type Fetched, type Get, type State } from './step.ts';

/** The validators Renfe gives its file, which a conditional request names. */
export interface Validators {
  etag?: string;
  modified?: string;
}

/** An answer to a request for alerts: its body, and its validators where it gives them. */
export interface Answer extends Validators {
  text: string;
}

/** An answer's body, with the validators it gives. */
async function withValidators(res: Response): Promise<Answer> {
  return { text: await res.text(), etag: res.headers.get('etag') ?? undefined, modified: res.headers.get('last-modified') ?? undefined };
}

/** This run's answers to each source's requests for its alerts, by its ID, then by what the fetcher calls each file. */
type AlertResponses = Record<string, Record<string, Fetched<Answer>>>;

/**
 * What the fetcher keeps of a source's alerts between runs: what alerts.json says of them, how many runs
 * have passed since they were last asked for, and the validators of the file it last read, with how it
 * read it (readingOf()).
 */
interface Kept extends AlertFeed, Validators {
  waited: number;
  readWith?: string;
}

/** What the fetcher keeps of each source's alerts between runs, by its ID, and when it last wrote alerts.json, in ms since 1970. */
export interface AlertsState {
  feeds: Record<string, Kept>;
  written?: number;
}

/**
 * How long alerts.json goes unwritten at most, in ms: about 5 minutes, so that the time it says a feed
 * was last read is never more than that behind, though what else it holds stays the same for hours.
 */
const REWRITE = 300_000;

/**
 * How alertsOf() reads Alerts, as a number to make one more whenever it reads them otherwise: then the
 * next run reads Renfe's file afresh, though Renfe hasn't changed it, rather than keep what it read.
 */
const READING = 1;

/** How a source's alerts are read: by READING, with the source's config as it is now, which names its Networks. */
const readingOf = (source: LiveSource) => JSON.stringify([READING, source]);

/** What the fetcher starts from: no alerts read. */
export const ALERTS_START: AlertsState = { feeds: {} };

/**
 * This run's answers from each source's alerts that are due, by its ID: Renfe's with a conditional
 * request, which it answers with 304 and no body while its file is the one the fetcher read, where it
 * read it as it would now; and TRAM's for each of its halves, with the access token its adapter keeps in
 * the live data's state, and none while it keeps none. They never ask for a token, so TRAM's refusals
 * here never hold its live data back.
 */
export async function fetchAlerts({ feeds }: AlertsState, live: State, get: Get, sources = LIVE_SOURCES): Promise<AlertResponses> {
  const asked = sources.flatMap((source) => {
    const { id, format, alerts } = source;
    const kept = feeds[id];
    // Due as the step's sources are, counted in runs.
    if (!alerts || !onTime(kept?.waited, alerts.every)) return [];
    if (format === 'tram') {
      const token = tramToken(live, id);
      if (!token) return [];
      const init = { headers: { authorization: `Bearer ${token}` } };
      // TRAM's API numbers Trambaix 1 and Trambesòs 2.
      const halves = HALVES.map(async (half, i) => [`${half} GtfsRealtimeAlerts`, await get(`${alerts.url}?networkId=${i + 1}`, withValidators, init)] as const);
      return [Promise.all(halves).then((answers) => [id, Object.fromEntries(answers)] as const)];
    }
    // A file read otherwise than it would be now, as before a Network was added to the config, is asked for whole.
    const same = kept?.readWith === readingOf(source) ? kept : undefined;
    const headers = { ...(same?.etag && { 'if-none-match': same.etag }), ...(same?.modified && { 'if-modified-since': same.modified }) };
    return [get(alerts.url, withValidators, { headers }).then((answer) => [id, { alerts: answer }] as const)];
  });
  return Object.fromEntries(await Promise.all(asked));
}

/**
 * One run: the stored state, this run's answers and the time now (ms since 1970) go in; the next state
 * comes out, and alerts.json where it's to be written: where a feed's Alerts, or what its last try
 * says, have changed since the last run, or it has gone unwritten for REWRITE.
 */
export function readAlerts(state: AlertsState, responses: AlertResponses, now: number, sources = LIVE_SOURCES): { state: AlertsState; file?: Alerts } {
  const feeds: Record<string, Kept> = {};
  for (const source of sources) {
    if (!source.alerts) continue;
    const [kept, answers] = [state.feeds[source.id], responses[source.id]];
    if (answers) feeds[source.id] = { ...tried(source, kept, answers, now), waited: 0 };
    else if (kept) feeds[source.id] = { ...kept, waited: kept.waited + 1 };
  }
  // What the file holds of each feed, but for when it was read.
  const holds = (of: Record<string, Kept>) => JSON.stringify(Object.entries(of).map(([id, { status, alerts }]) => [id, status, alerts]));
  if (state.written !== undefined && now < state.written + REWRITE && holds(feeds) === holds(state.feeds)) return { state: { feeds, written: state.written } };
  const file = Object.fromEntries(Object.entries(feeds).map(([id, { read, status, alerts }]) => [id, { read, status, alerts }]));
  return { state: { feeds, written: now }, file };
}

/**
 * A source's alerts after a try: as its answers give them, or where Renfe answers that its file is the
 * one kept, as kept. Where any answer fails, the last ones it read, and why. A file that stays the same
 * for hours is no failure: Renfe's did on 7 October 2026, as alerts rarely change.
 */
function tried(source: LiveSource, kept: Kept | undefined, answers: Record<string, Fetched<Answer>>, now: number): Omit<Kept, 'waited'> {
  const fetched = Object.values(answers);
  try {
    if (kept && fetched.every((f) => 'status' in f && f.status === 304)) return { ...kept, read: now, status: 'ok' };
    // All its files' Alerts in one list, as TRAM's halves can both give one.
    const alerts = alertsOf(source, Object.entries(answers).flatMap(([file, f]) => gtfsRt(file, f).entity ?? []));
    // Renfe's one file gives the validators for the next run's conditional request.
    const { alerts: renfe } = answers;
    const { etag, modified } = renfe && 'body' in renfe ? renfe.body : {};
    return { read: now, status: 'ok', alerts, etag, modified, readWith: readingOf(source) };
  } catch (error) {
    return { ...kept, alerts: kept?.alerts ?? [], status: (error as Error).message };
  }
}

/** An answer's text, as the step reads its files. */
const textOf = (fetched: Fetched<Answer>): Fetched => ('error' in fetched ? fetched : { ...fetched, body: fetched.body.text });

/** A file of GTFS-RT alerts, from its answer, or an error that says why it can't be read. Every feed has a header, so JSON without one, such as an error's, isn't one. */
function gtfsRt(file: string, fetched: Fetched<Answer>): GtfsRtAlerts {
  const feed = json<GtfsRtAlerts | null>(file, textOf(fetched));
  if (!feed?.header) throw new Error(`${file}: not GTFS-RT`);
  return feed;
}

/** GTFS-RT alerts, as Renfe's and TRAM's JSON have them: the parts the fetcher reads, with times in seconds since 1970. */
interface GtfsRtAlerts {
  header?: object;
  entity?: { id: string; alert?: GtfsRtAlert }[];
}

interface GtfsRtAlert {
  activePeriod?: { start?: string | number; end?: string | number }[];
  informedEntity?: { routeId?: string; stopId?: string }[];
  effect?: string | null;
  headerText?: Translated;
  descriptionText?: Translated;
}

type Translated = { translation?: Words[] };

/**
 * A source's Alerts on the Lines of the Networks its config names, and Renfe's on Stations, from the
 * entities of all its files, newest first. A stop_id doesn't say which núcleo it's in, so every
 * Station's is kept: the map shows those of the Stations it has. Entities with one ID and the same
 * words are one Alert, on the Lines and Stations of them all, as Renfe gives some twice.
 */
function alertsOf(source: LiveSource, entities: NonNullable<GtfsRtAlerts['entity']>): Alert[] {
  const alerts = new Map<string, Alert>();
  for (const { id, alert } of entities) {
    const named = alert?.informedEntity ?? [];
    const lines = named.flatMap(({ routeId }) => (routeId ? (lineOf(source, routeId.trim()) ?? []) : []));
    // Renfe's stop_ids are Adif's, as its Stations are in the bundle.
    const stations = named.flatMap(({ stopId }) => (stopId && source.format === 'renfe' ? [`adif:${stopId.trim()}`] : []));
    if (!alert || !(lines.length || stations.length)) continue;
    const [header, description = []] = [words(alert.headerText), words(alert.descriptionText)];
    // Renfe tags every entry es, but Rodalies' Alerts give their Catalan second.
    if (lines.some((line) => line.startsWith(`${RODALIES.id}:`))) for (const second of [header?.[1], description[1]]) if (second?.language === 'es') second.language = 'ca';
    const said = { ...period(alert.activePeriod), effect: alert.effect ?? undefined, header, description };
    const key = JSON.stringify([id, said]);
    const same = alerts.get(key);
    alerts.set(key, { id, lines: [...new Set([...(same?.lines ?? []), ...lines])], stations: [...new Set([...(same?.stations ?? []), ...stations])], ...said });
  }
  return [...alerts.values()].sort((a, b) => (b.from ?? 0) - (a.from ?? 0) || a.id.localeCompare(b.id));
}

/** A route's Line, as the bundle names it, where its Network is one the source's config names: TRAM's routes 1–6 are T1–T6, and a route_id of Renfe's ends with its Line's name, after the núcleo, a T and four digits, as 51T0146R1 is R1's. */
function lineOf(source: LiveSource, route: string): string | undefined {
  const network = networkOf(source, route);
  const name = source.format === 'tram' ? `T${route}` : route.match(/^\d+T\d{4}(.+)$/)?.[1];
  return network && name ? `${network}:${name}` : undefined;
}

/** An Alert's words, each in a language, without the spaces and line breaks the operator leaves after them. */
const words = (translated: Translated | undefined) => translated?.translation?.map(({ language, text }) => ({ language, text: text.trim() }));

/** When an Alert begins, over all its active periods, and when it ends, in ms since 1970, where each says. */
function period(periods: GtfsRtAlert['activePeriod'] = []): Pick<Alert, 'from' | 'to'> {
  const [starts, ends] = [periods.map((p) => p.start), periods.map((p) => p.end)];
  return {
    from: starts.length && starts.every(Boolean) ? ms(Math.min(...starts.map(Number))) : undefined,
    to: ends.length && ends.every(Boolean) ? ms(Math.max(...ends.map(Number))) : undefined,
  };
}
