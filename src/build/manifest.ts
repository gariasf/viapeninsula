// Each service day's Trips, and the manifest that names each day's bundle, and when the map needs it.

import { addDays, type Bundle, type Closure, type DayTrips, type Manifest, type ManifestDay, type Network, type Trip } from '../bundle.ts';
import { noonMinus12h, weekdayOf } from './gtfs.ts';
import type { Found, Spot } from './report.ts';

/**
 * Each day's Trips, every Network's. A Network whose timetable has no Trips on a day, as Renfe's had
 * no Rodalies Trips after 4 October 2026, goes without them that day, and is logged, and reported by
 * how many days after today it is, so the other Networks build and publish as ever (ADR-0010); its
 * Lines, Stations and track, which come from every day of its timetable, still do. A region's Networks
 * having no Trips at all today is no failure: the build of every region fails where none has any
 * (buildRegions()), which is a broken build, not a day without Trains. On a later day it can mean
 * timetables that end before it, whose next ones come before that day.
 * Each Network's Trips today are logged, and reported by the day of the week beside the last report's
 * counts for the other days, so that the summary names a Network with many fewer than the last report
 * has for the same day (moved()). It keeps them however few: a holiday runs a Sunday's timetable. A
 * day it has no Trips, which is named apart, keeps the last count, so that the next week compares
 * with the last day it had some.
 * Each day has every Network's Closures that day too, where there are any, and each Network's today,
 * where it has any, are logged and reported.
 * ponytail: a drop that lasts is named once on each day of the week, then is the count to compare
 * with, and a last report that can't be read starts the counts again, with none to compare with for
 * a week; keep a dropped day's last count, or read an older report, if either ever hides a drop.
 */
export function dayTrips(days: string[], networks: { network: Network; trips: Trip[][]; closures?: Closure[][] }[], log = console.warn, report: (found: Found) => void = () => {}, last: Spot[] = []): DayTrips[] {
  const built = days.map((serviceDay, i) => {
    for (const { network, trips } of networks) {
      if (trips[i]?.length) continue;
      const line = `${network.name}'s timetable has no Trips on ${serviceDay}`;
      log(line);
      report({ kind: 'notrips', network: network.id, day: i, text: [line] });
    }
    const closures = networks.flatMap((n) => n.closures?.[i] ?? []);
    return { serviceDay, noonMinus12h: noonMinus12h(serviceDay), trips: networks.flatMap((n) => n.trips[i] ?? []), ...(closures.length > 0 && { closures }) };
  });
  const today = built[0]?.serviceDay ?? '';
  for (const { network, trips, closures } of networks) {
    const count = trips[0]?.length ?? 0;
    const line = `${network.name}'s Trips on ${today}: ${count}`;
    log(line);
    // A last report it can't read, as one of an older shape, has none.
    const before = Array.isArray(last) ? last.find((s) => s?.kind === 'trips' && s.network === network.id)?.numbers : undefined;
    report({ kind: 'trips', network: network.id, text: [line], numbers: { ...before, ...(count > 0 && { [weekdayOf(today)]: count }) } });
    const closed = closures?.[0]?.length;
    if (!closed) continue;
    const closedLine = `${network.name}'s Closures on ${today}: ${closed}`;
    log(closedLine);
    report({ kind: 'closures', network: network.id, text: [closedLine], numbers: { closures: closed } });
  }
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
 * The manifest naming each region's days built, and for each the day before them where the last
 * manifest named it: its last Trains can still be running past midnight. A region that's given no days
 * is one whose build failed: it keeps what the last manifest names for it from that day before on, so
 * that the others publish as ever, and each day's Trips are those built with the track named beside
 * them. A region with none left is left out, so that a stale day never stands for today. Where the
 * last manifest names days in an older shape, as one bundle of one file, or one file of track and
 * one of Trips for each day, whole Networks in each, the map can't read them, so they're left out.
 * The regions are in the order given.
 */
export function manifestOf(regions: { id: string; days?: ManifestDay[] }[], previous?: Manifest): Manifest {
  const first = regions.flatMap((r) => r.days?.map((d) => d.date) ?? []).sort()[0];
  if (!first) throw new Error('No region was built');
  const before = addDays(first, -1);
  const named = (id: string) => (Array.isArray(previous?.regions) ? previous.regions.find((r) => r.id === id)?.days : undefined) ?? [];
  return {
    regions: regions.flatMap(({ id, days }) => {
      const last = named(id).filter((d) => d.track && d.trips);
      const all = days ? [...last.filter((d) => d.date === before), ...days] : last.filter((d) => d.date >= before);
      return all.length ? [{ id, days: all }] : [];
    }),
  };
}
