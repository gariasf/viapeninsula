import { execFileSync, spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

/** Yields the lines of one file of a GTFS feed, or nothing if the feed hasn't got that file. */
export type Source = (file: string) => AsyncIterable<string> | undefined;

/** Downloads a GTFS zip as `name` into the system's temporary folder, to read from there. */
export async function download(url: string, name: string): Promise<Source> {
  const res = await fetch(url);
  // Never print a query string: TMB's holds its key.
  if (!res.ok) throw new Error(`${url.split('?')[0]}: HTTP ${res.status}`);
  const file = join(tmpdir(), name);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
  return zipSource(file);
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

/**
 * The service_ids that run on a day (YYYY-MM-DD): those calendar.txt runs that weekday, less the ones
 * calendar_dates.txt removes that day, plus the ones it adds. A feed may have either file alone.
 */
export async function serviceIdsOn(source: Source, day: string): Promise<Set<string>> {
  const date = day.replaceAll('-', '');
  const weekday = WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()] ?? 'sunday';
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
