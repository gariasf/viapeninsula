import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

/** Yields the lines of one file of a GTFS feed. */
export type Source = (file: string) => AsyncIterable<string>;

/** Streams files straight out of a GTFS zip: Renfe's stop_times alone is 240 MB unzipped. */
export function zipSource(zip: string): Source {
  return async function* (file) {
    const unzip = spawn('unzip', ['-p', zip, file], { stdio: ['ignore', 'pipe', 'inherit'] });
    const exit = new Promise<number | null>((resolve) => unzip.on('close', resolve));
    yield* createInterface({ input: unzip.stdout, crlfDelay: Infinity });
    if ((await exit) !== 0) throw new Error(`Couldn't read ${file} from ${zip}`);
  };
}

/** Reads an unzipped feed, such as a test fixture. */
export function dirSource(dir: string): Source {
  return (file) => createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity });
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

/** Yields each row of a GTFS file with the given columns, failing if the file lacks one. */
export async function* rows<K extends string>(
  source: Source,
  file: string,
  columns: readonly K[],
): AsyncGenerator<Record<K, string>> {
  let at: number[] | undefined;
  for await (const line of source(file)) {
    if (!line.trim()) continue;
    const fields = parseLine(line);
    if (at) {
      const pos = at;
      yield Object.fromEntries(columns.map((c, i) => [c, fields[pos[i] ?? -1] ?? ''])) as Record<K, string>;
      continue;
    }
    at = columns.map((c) => fields.indexOf(c));
    const missing = columns.filter((c) => !fields.includes(c));
    if (missing.length) throw new Error(`${file} has no ${missing.join(', ')} column`);
  }
}
