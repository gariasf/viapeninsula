// Each service day's Trips, and the manifest that names each day's bundle, and when the map needs it.

import { addDays, type Bundle, type DayTrips, type Manifest, type ManifestDay, type Network, type Trip } from '../bundle.ts';
import { noonMinus12h } from './gtfs.ts';
import type { Found } from './report.ts';

/**
 * Each day's Trips, every Network's. A Network whose timetable has no Trips on a day, as Renfe's had
 * no Rodalies Trips after 4 October 2026, goes without them that day, and is logged, and reported by
 * how many days after today it is, so the other Networks build and publish as ever (ADR-0010); its
 * Lines, Stations and track, which come from every day of its timetable, still do. No Trips at all on
 * the first day, today, means a broken build, not a day without Trains, so it throws. On a later day
 * it can mean timetables that end before it, whose next ones come before that day.
 */
export function dayTrips(days: string[], networks: { network: Network; trips: Trip[][] }[], log = console.warn, report: (found: Found) => void = () => {}): DayTrips[] {
  const built = days.map((serviceDay, i) => {
    for (const { network, trips } of networks) {
      if (trips[i]?.length) continue;
      const line = `${network.name}'s timetable has no Trips on ${serviceDay}`;
      log(line);
      report({ kind: 'notrips', network: network.id, day: i, text: [line] });
    }
    return { serviceDay, noonMinus12h: noonMinus12h(serviceDay), trips: networks.flatMap((n) => n.trips[i] ?? []) };
  });
  if (!built[0]?.trips.length) throw new Error(`No Network's timetable has Trips on ${days[0]}`);
  return built;
}

/**
 * A day's entry in the manifest: its track and Trips files, when its first Train comes onto the map and its last
 * leaves it, standing its Network's dwell at either end, where it may run past midnight, and the Networks with no Trips that day.
 */
export function manifestDay(bundle: Bundle, files: Pick<ManifestDay, 'track' | 'trips'>): ManifestDay {
  const dwell = new Map(bundle.lines.map((l) => [l.id, bundle.networks.find((n) => n.id === l.network)?.profile.dwell ?? 0]));
  let [from, to] = [Infinity, -Infinity];
  for (const { line, calls } of bundle.trips) {
    from = Math.min(from, (calls[0]?.arrival ?? Infinity) - (dwell.get(line) ?? 0));
    to = Math.max(to, (calls.at(-1)?.departure ?? -Infinity) + (dwell.get(line) ?? 0));
  }
  const networkOf = new Map(bundle.lines.map((l) => [l.id, l.network]));
  const running = new Set(bundle.trips.map((t) => networkOf.get(t.line)));
  const noTrips = bundle.networks.flatMap((n) => (running.has(n.id) ? [] : [n.id]));
  return { date: bundle.serviceDay, ...files, from: bundle.noonMinus12h + from * 1000, to: bundle.noonMinus12h + to * 1000, ...(noTrips.length > 0 && { noTrips }) };
}

/**
 * The manifest naming the days built, and the day before them where the last manifest named it:
 * its last Trains can still be running past midnight. Where it named it in a bundle of one file, as
 * builds did before the track and Trips were split, the map can't read it, so it's left out.
 */
export function manifestOf(built: ManifestDay[], previous?: Manifest): Manifest {
  const before = addDays(built[0]?.date ?? '', -1);
  return { days: [...(previous?.days.filter((d) => d.date === before && d.track && d.trips) ?? []), ...built] };
}
