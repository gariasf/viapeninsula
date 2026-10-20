// The Passport (#332): the Rides a viewer takes, following a Train from its first Station to its last, and the Stamps
// they earn, kept only in their browser, from when they turn it on (ADR-0011).

import type { Trip } from '../bundle.ts';

/** Where a followed Train is, as the engine's tripsAt() has it, as much as a Ride needs. */
export type RideNow = { trip: Trip } & ({ train: { live: boolean; delay?: number; upcoming: { station: string }[] } } | { coming: { live: boolean; within?: unknown } } | { cancelled: true } | { ended: number } | { off: true });

/** A Ride under way: the Train's key, its service day and Trip as the link has it, whether it was seen Live, and that it was read back from storage, by a page reloaded, till the next step has it still running. */
export interface Riding {
  key: string;
  live: boolean;
  restored?: true;
}

/** How long after its Train leaves its first Station a follow still begins a Ride, in ms. */
const LATE = 60_000;

/**
 * A Ride's next step, at a moment `at` (ms since 1970), for the Train followed, `key`, where it is now (`now`: `off` where
 * it's off the map past the border, and none where nothing's known): the Ride under way, or that it's `done`, or neither. A Ride begins
 * before the Train leaves its Trip's first Station on the map, `onMap`, or within LATE after, running its Delay late,
 * and is done once it has left its last there, or ended, or off the map, was due there: a Train into France ends at the border. A Train Cancelled
 * gives none, nor one read back from storage once the Train had ended, as the page wasn't back in time.
 */
export function rideStep(riding: Riding | undefined, key: string, now: RideNow | undefined, at: number, noonMinus12h: number, onMap: (station: string) => boolean): { riding?: Riding; done?: true } {
  if (riding?.key !== key) riding = undefined;
  if (!now) return riding ? { riding } : {};
  if ('cancelled' in now) return {};
  if ('ended' in now) return riding && !riding.restored ? { done: true } : {};
  const calls = now.trip.calls.filter((c) => onMap(c.station));
  const [first, last] = [calls[0], calls.at(-1)];
  if (!first || !last) return {};
  if ('off' in now) return riding && !riding.restored && at >= noonMinus12h + last.arrival * 1000 ? { done: true } : riding ? { riding } : {};
  const { live } = 'train' in now ? now.train : now.coming;
  const upcoming = 'train' in now ? now.train.upcoming.map((c) => c.station) : undefined;
  if (upcoming && !upcoming.includes(last.station)) return riding && !riding.restored ? { done: true } : {};
  if (riding) return { riding: { key, live: riding.live || live } };
  const left = noonMinus12h + (first.departure + (('train' in now && now.train.delay) || 0)) * 1000;
  const begins = 'coming' in now ? !now.coming.within || at <= left + LATE : upcoming?.includes(first.station) || at <= left + LATE;
  return begins ? { riding: { key, live } } : {};
}

/** A Ride taken: its Train's key, its Line, the Line's Network and kind of service, when it left its first Station on the map (ms since 1970), that Station's and its last's names, its minutes and km as its timetable has them, the names of the Stations it called at there, and whether it was seen Live. */
export interface Ride {
  key: string;
  line: string;
  network: string;
  kind: string;
  at: number;
  from: string;
  to: string;
  minutes: number;
  km: number;
  stations: string[];
  live: boolean;
}

/** The Ride a Trip makes, of its Stations on the map, those `name` names, from its first to its last. */
export function rideOf(trip: Trip, key: string, line: { network: string; kind: string }, live: boolean, noonMinus12h: number, name: (station: string) => string | undefined): Ride {
  const calls = trip.calls.filter((c) => name(c.station) !== undefined);
  const [first, last] = [calls[0], calls.at(-1)];
  const metres = calls.reduce((sum, c, i) => sum + Math.abs(c.dist - (calls[i - 1]?.dist ?? c.dist)), 0);
  return {
    key,
    line: trip.line,
    ...line,
    at: noonMinus12h + (first?.departure ?? 0) * 1000,
    from: name(first?.station ?? '') ?? '',
    to: name(last?.station ?? '') ?? '',
    minutes: Math.round(((last?.arrival ?? 0) - (first?.departure ?? 0)) / 60),
    km: Math.round(metres / 100) / 10,
    stations: calls.map((c) => name(c.station) ?? ''),
    live,
  };
}

/** What it's kept under on the viewer's device, as JSON, in local storage, as the view, the language and Favourites are: its version after the colon. Its being there is the Passport's being on. */
const KEY = 'passport:1';

/**
 * The viewer's Passport, read from `storage` once: off, storing nothing, until turned on; then its Rides, one a
 * Train, and the Ride under way, which a page reloaded reads back as `restored`. Storage that's blocked or full
 * keeps nothing, and it lasts for the page's life: nothing throws. Clear erases it and turns it off.
 */
export function passport(storage: () => Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
  let kept: { rides: Ride[]; riding?: Riding } | undefined;
  try {
    const read = JSON.parse(storage().getItem(KEY) ?? 'null') as typeof kept;
    if (read && Array.isArray(read.rides)) kept = { rides: read.rides, ...(read.riding && { riding: { ...read.riding, restored: true } }) };
  } catch {
    // Storage is off, or what's kept isn't JSON: it's off.
  }
  const write = () => {
    try {
      if (kept) storage().setItem(KEY, JSON.stringify(kept));
      else storage().removeItem(KEY);
    } catch {
      // Storage is off or full: it lasts until the page closes.
    }
  };
  return {
    on: () => !!kept,
    turnOn() {
      kept ??= { rides: [] };
      write();
    },
    clear() {
      kept = undefined;
      write();
    },
    /** Newest first. */
    rides: (): readonly Ride[] => kept?.rides ?? [],
    riding: () => kept?.riding,
    setRiding(riding: Riding | undefined) {
      if (!kept || JSON.stringify(riding) === JSON.stringify(kept.riding)) return;
      kept = { rides: kept.rides, ...(riding && { riding }) };
      write();
    },
    /** Keeps `ride`, once a Train, newest first. */
    add(ride: Ride) {
      if (!kept || kept.rides.some((r) => r.key === ride.key)) return;
      kept = { rides: [ride, ...kept.rides].sort((a, b) => b.at - a.at), ...(kept.riding && { riding: kept.riding }) };
      write();
    },
  };
}

/** A Stamp earned: a Line's (`line:<ID>`), a kind of service's (`kind:<kind>`) or a Network's (`network:<ID>`), when its first Ride left, and whether one of its Rides was seen Live. */
export interface Stamp {
  id: string;
  at: number;
  live: boolean;
}

/** The Stamps `rides` earn, in the order they were first earned. */
export function stamps(rides: readonly Ride[]): Stamp[] {
  const earned = new Map<string, Stamp>();
  for (const ride of rides.toSorted((a, b) => a.at - b.at)) {
    for (const id of [`line:${ride.line}`, `kind:${ride.kind}`, `network:${ride.network}`]) {
      const stamp = earned.get(id);
      if (stamp) stamp.live ||= ride.live;
      else earned.set(id, { id, at: ride.at, live: ride.live });
    }
  }
  return [...earned.values()];
}

/** The Passport's totals: Rides, minutes, km, and the Stations called at, by name, in alphabetical order. */
export function totals(rides: readonly Ride[]) {
  return {
    rides: rides.length,
    minutes: rides.reduce((sum, r) => sum + r.minutes, 0),
    km: Math.round(rides.reduce((sum, r) => sum + r.km, 0) * 10) / 10,
    stations: [...new Set(rides.flatMap((r) => r.stations))].sort((a, b) => a.localeCompare(b)),
  };
}
