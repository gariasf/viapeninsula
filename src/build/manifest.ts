// The manifest that names each service day's bundle, and when the map needs it.

import { addDays, type Bundle, type Manifest, type ManifestDay } from '../bundle.ts';

/**
 * A day's entry in the manifest: its bundle, and when its first Train comes onto the map and its last
 * leaves it, standing its Network's dwell at either end, where it may run past midnight.
 */
export function manifestDay(bundle: Bundle, key: string): ManifestDay {
  const dwell = new Map(bundle.lines.map((l) => [l.id, bundle.networks.find((n) => n.id === l.network)?.profile.dwell ?? 0]));
  let [from, to] = [Infinity, -Infinity];
  for (const { line, calls } of bundle.trips) {
    from = Math.min(from, (calls[0]?.arrival ?? Infinity) - (dwell.get(line) ?? 0));
    to = Math.max(to, (calls.at(-1)?.departure ?? -Infinity) + (dwell.get(line) ?? 0));
  }
  return { date: bundle.serviceDay, bundle: key, from: bundle.noonMinus12h + from * 1000, to: bundle.noonMinus12h + to * 1000 };
}

/**
 * The manifest naming the days built, and the day before them where the last manifest named it:
 * its last Trains can still be running past midnight.
 */
export function manifestOf(built: ManifestDay[], previous?: Manifest): Manifest {
  const before = addDays(built[0]?.date ?? '', -1);
  return { days: [...(previous?.days.filter((d) => d.date === before) ?? []), ...built] };
}
