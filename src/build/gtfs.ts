import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as wait } from 'node:timers/promises';

/** Yields the lines of one file of a GTFS feed, or nothing if the feed hasn't got that file. */
export type Source = (file: string) => AsyncIterable<string> | undefined;

/**
 * How long each try at downloading a timetable gets, and how long after one that fails it's tried
 * once more: TRAM's server answered 499 after 4 minutes on 5 October 2026 (#286).
 */
const TRY = { limit: 2 * 60_000, again: 60_000 };

/** Each URL's download while it's under way, which timetables that share the URL wait for together. */
const underway = new Map<string, Promise<Buffer>>();

/**
 * Downloads the GTFS zip of the timetable whose IDs start with `prefix` to zipFile(prefix), to read
 * from there. A try that fails or takes longer than `limit` is tried once more, `again` later.
 * Timetables downloading one URL at once share its download, tried with the first one's `limit` and
 * `again`, as every Cercanías núcleo shares Renfe's one file, and each is told why it failed. With a
 * `cache`, a URL whose file is kept there is read from it, not downloaded, and one that's downloaded
 * is kept there, as a dry run keeps the day's feeds (#730). With NAP's `key`, the URL is NAP's
 * downloadLink, which gives the file's link, and both are tried as one (napLink()).
 */
export async function download(url: string, prefix: string, { limit = TRY.limit, again = TRY.again, cache, key }: { limit?: number; again?: number; cache?: string; key?: string } = {}): Promise<void> {
  let zip = underway.get(url);
  if (!zip) {
    zip = (cache ? cached(url, cache, () => downloaded(url, limit, again, key)) : downloaded(url, limit, again, key)).finally(() => underway.delete(url));
    underway.set(url, zip);
  }
  await writeFile(zipFile(prefix), await zip);
}

/**
 * A URL's file from `dir`, where it's kept, or else got and kept there, named by a hash of the URL,
 * as its query string can hold a secret. It's written whole before it takes its name, so that a
 * build that reads the cache at the same time never reads part of it.
 */
async function cached(url: string, dir: string, get: () => Promise<Buffer>): Promise<Buffer> {
  const file = join(dir, `${createHash('sha256').update(url).digest('hex').slice(0, 16)}.zip`);
  const kept = await readFile(file).catch(() => undefined);
  if (kept) {
    // Never print a query string: TMB's holds its key.
    console.log(`${url.split('?')[0]}: from the feed cache, ${file}`);
    return kept;
  }
  const zip = await get();
  await mkdir(dir, { recursive: true });
  await writeFile(`${file}.${process.pid}`, zip);
  await rename(`${file}.${process.pid}`, file);
  return zip;
}

/** A URL's file, as download() tries it. */
async function downloaded(url: string, limit: number, again: number, key?: string): Promise<Buffer> {
  for (let tries = 1; ; tries++) {
    let failed: unknown;
    try {
      const res = await fetch(key ? await napLink(url, key, limit) : url, { signal: AbortSignal.timeout(limit) });
      if (res.ok) return Buffer.from(await res.arrayBuffer());
      failed = `HTTP ${res.status}`;
    } catch (error) {
      // fetch() gives why it failed, as a connection refused, as the cause.
      failed = (error as Error).cause ?? error;
    }
    // Never print a query string: TMB's holds its key.
    if (tries === 2) throw new Error(`${url.split('?')[0]}: ${failed}`);
    await wait(again);
  }
}

/**
 * The link to a file on NAP, Spain's National Access Point, from its downloadLink (`url`), which takes
 * the key in an ApiKey header and answers with the link. The link isn't printed.
 */
async function napLink(url: string, key: string, limit: number): Promise<string> {
  const res = await fetch(url, { headers: { ApiKey: key }, signal: AbortSignal.timeout(limit) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for its link`);
  // Plain text, as on 14 Oct 2026, though its API's description says a JSON string: either is read.
  const link = (await res.text()).trim().replace(/^"(.*)"$/, '$1');
  if (!URL.canParse(link)) throw new Error('No link to the file in its answer');
  return link;
}

/** The secret that NAP's API takes in an ApiKey header, from the environment. */
export const NAP_KEY = 'NAP_API_KEY';

/**
 * The day NAP last updated a file (YYYY-MM-DD), its fechaActualizacion, from the dataset that lists it,
 * which NAP's API gives at /api/Fichero/<dataset>, beside the file's downloadLink (`url`), as the file of
 * that ID. NAP answers /api/Fichero/<file> with nothing.
 */
export async function napUpdated(url: string, dataset: number, key: string): Promise<string> {
  const [api, id] = url.split('/downloadLink/');
  const res = await fetch(`${api}/${dataset}`, { headers: { ApiKey: key }, signal: AbortSignal.timeout(TRY.limit) });
  if (!res.ok) throw new Error(`NAP's dataset ${dataset} has no date: HTTP ${res.status}`);
  return napDate((await res.json()) as NapDataset, Number(id));
}

/** A dataset as NAP's API gives it (its ConjuntoDatoAPI): what napDate() reads of it. */
export interface NapDataset {
  ficherosDto?: { ficheroId: number; fechaActualizacion: string }[] | null;
}

/** The day NAP last updated a dataset's file of an ID (YYYY-MM-DD), by its fechaActualizacion. */
export function napDate(dataset: NapDataset, id: number): string {
  const day = dataset.ficherosDto?.find((f) => f.ficheroId === id)?.fechaActualizacion?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (!day) throw new Error(`NAP gives no date for its file ${id}`);
  return day;
}

/** A secret from the environment, which must never be printed. */
export function secret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} isn't set`);
  return value;
}

/** Where download() keeps a timetable's GTFS zip, in the system's temporary folder, until that's cleared. */
export function zipFile(prefix: string): string {
  return join(tmpdir(), `${prefix}.zip`);
}

/** Streams files straight out of a GTFS zip: Renfe's stop_times alone is 240 MB unzipped. */
export function zipSource(zip: string): Source {
  const files = new Set(execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n'));
  return (file) => (files.has(file) ? unzipped(zip, file) : undefined);
}

async function* unzipped(zip: string, file: string) {
  const unzip = spawn('unzip', ['-p', zip, file], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exit = new Promise<number | null>((resolve) => unzip.on('close', resolve));
  yield* createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  if ((await exit) !== 0) throw new Error(`Couldn't read ${file} from ${zip}`);
}

/** Reads an unzipped feed, such as a test fixture. */
export function dirSource(dir: string): Source {
  return (file) => (existsSync(join(dir, file)) ? createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity }) : undefined);
}

/**
 * Splits one CSV line into fields, trimming each. Renfe's feeds are fixed-width exports padded with
 * spaces, header names included, and untrimmed IDs don't join: the live match drops from 100% to 76%.
 */
export function parseLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line.charAt(i);
    if (quoted && c === '"' && line.charAt(i + 1) === '"') {
      field += '"';
      i++;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (c === ',' && !quoted) {
      fields.push(field.trim());
      field = '';
    } else {
      field += c;
    }
  }
  fields.push(field.trim());
  return fields;
}

/**
 * Yields each row of a GTFS file with the given columns, failing if the file lacks one, unless it may
 * be `blank`, read as empty. A file the feed hasn't got fails too, unless it's optional.
 */
export async function* rows<K extends string>(
  source: Source,
  file: string,
  columns: readonly K[],
  { optional = false, blank = [] as readonly K[] } = {},
): AsyncGenerator<Record<K, string>> {
  const lines = source(file);
  if (!lines && !optional) throw new Error(`The feed has no ${file}`);
  let at: number[] | undefined;
  for await (const line of lines ?? []) {
    if (!line.trim()) continue;
    const fields = parseLine(line);
    if (at) {
      const pos = at;
      yield Object.fromEntries(columns.map((c, i) => [c, fields[pos[i] ?? -1] ?? ''])) as Record<K, string>;
      continue;
    }
    at = columns.map((c) => fields.indexOf(c));
    const missing = columns.filter((c) => !fields.includes(c) && !blank.includes(c));
    if (missing.length) throw new Error(`${file} has no ${missing.join(', ')} column`);
  }
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/** A day's weekday (YYYY-MM-DD), as calendar.txt names it. */
export function weekdayOf(day: string): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? 'sunday';
}

/**
 * The service_ids that run on a day (YYYY-MM-DD): those calendar.txt runs that weekday, less the ones
 * calendar_dates.txt removes that day, plus the ones it adds. A feed may have either file alone.
 */
export async function serviceIdsOn(source: Source, day: string): Promise<Set<string>> {
  const date = day.replaceAll('-', '');
  const weekday = weekdayOf(day);
  const running = new Set<string>();
  for await (const c of rows(source, 'calendar.txt', ['service_id', weekday, 'start_date', 'end_date'], { optional: true })) {
    if (c[weekday] === '1' && c.start_date <= date && date <= c.end_date) running.add(c.service_id);
  }
  for await (const d of rows(source, 'calendar_dates.txt', ['service_id', 'date', 'exception_type'], { optional: true })) {
    if (d.date !== date) continue;
    if (d.exception_type === '1') running.add(d.service_id);
    if (d.exception_type === '2') running.delete(d.service_id);
  }
  return running;
}

/** The day a feed's timetable starts (YYYY-MM-DD), from its feed_info.txt. */
export async function feedStart(source: Source): Promise<string> {
  let start = '';
  for await (const f of rows(source, 'feed_info.txt', ['feed_start_date'])) start ||= f.feed_start_date;
  const [, year, month, day] = /^(\d{4})(\d{2})(\d{2})$/.exec(start) ?? [];
  if (!day) throw new Error(`feed_info.txt starts on "${start}", not a date`);
  return `${year}-${month}-${day}`;
}

/** A GTFS time, such as 25:10:00 for 01:10 the next morning, in seconds into the service day. */
export function seconds(time: string): number {
  const [h = NaN, m = NaN, s = NaN] = time.split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

/**
 * When a service day's timetable reads 00:00:00, in ms since 1970: noon less 12 hours in Spain, as
 * GTFS has it, so that times past midnight and on the nights the clocks change come out right.
 */
export function noonMinus12h(day: string): number {
  const noon = Date.parse(`${day}T12:00:00Z`);
  // Spain's clocks run this far ahead of UTC then.
  const ahead = Date.parse(`${new Date(noon).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T')}Z`) - noon;
  return noon - ahead - 12 * 3600_000;
}
