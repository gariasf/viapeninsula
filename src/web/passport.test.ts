import { expect, test } from 'vitest';
import type { Trip } from '../bundle.ts';
import { passport, rideOf, rideStep, stamps, totals, type Ride, type RideNow } from './passport.ts';

const NOON = Date.UTC(2026, 9, 20, 22); // 00:00 of the service day, in ms.
const at = (seconds: number) => NOON + seconds * 1000;
/** An R11 from Barcelona-Sants at 08:00 to Portbou at 10:00, and on to Cerbère, in France, which isn't on the map. */
const TRIP: Trip = {
  id: 'R11_1',
  line: 'rodalies:R11',
  shape: 's',
  headsign: 'Cerbère',
  calls: [
    { station: 'sants', arrival: 28_800, departure: 28_800, dist: 0 },
    { station: 'girona', arrival: 34_200, departure: 34_260, dist: 100_000 },
    { station: 'portbou', arrival: 36_000, departure: 36_060, dist: 160_000 },
    { station: 'cerbere', arrival: 36_600, departure: 36_600, dist: 163_000 },
  ],
};
const onMap = (station: string) => station !== 'cerbere';
const KEY = '2026-10-21/R11_1';
const train = (stations: string[], live = false, delay = 0): RideNow => ({ trip: TRIP, train: { live, delay, upcoming: stations.map((station) => ({ station })) } });
const coming = (live = false): RideNow => ({ trip: TRIP, coming: { live } });
const step = (riding: Parameters<typeof rideStep>[0], now: RideNow | undefined, seconds: number) => rideStep(riding, KEY, now, at(seconds), NOON, onMap);

test('starts a Ride on a Train followed before it leaves its first Station, or within a minute after, and not later', () => {
  expect(step(undefined, coming(), 28_000).riding).toEqual({ key: KEY, live: false });
  expect(step(undefined, train(['sants', 'girona', 'portbou', 'cerbere']), 28_790).riding).toEqual({ key: KEY, live: false });
  expect(step(undefined, train(['girona', 'portbou', 'cerbere']), 28_855).riding).toEqual({ key: KEY, live: false });
  expect(step(undefined, train(['girona', 'portbou', 'cerbere']), 28_870).riding).toBeUndefined();
  // Running two minutes late, it left at 08:02, so a follow at 08:02:50 is within the minute.
  expect(step(undefined, train(['girona', 'portbou', 'cerbere'], false, 120), 28_970).riding).toEqual({ key: KEY, live: false });
});

test("ends a Ride at the Trip's last Station on the map: a Train into France at the border", () => {
  const riding = { key: KEY, live: false };
  expect(step(riding, train(['girona', 'portbou', 'cerbere']), 34_000)).toEqual({ riding });
  expect(step(riding, train(['portbou', 'cerbere']), 35_990)).toEqual({ riding });
  expect(step(riding, train(['cerbere']), 36_070)).toEqual({ done: true });
  expect(step(riding, { trip: TRIP, ended: at(36_600) }, 36_700)).toEqual({ done: true });
  // Off the map past the border, as a tab hidden meanwhile finds it, it's done once it was due at its last Station there.
  expect(step(riding, { trip: TRIP }, 35_900)).toEqual({ riding });
  expect(step(riding, { trip: TRIP }, 36_010)).toEqual({ done: true });
  expect(step(riding, undefined, 36_010)).toEqual({ riding });
});

test('gives no Ride for a Train Cancelled on the way, nor for another Train followed', () => {
  expect(step({ key: KEY, live: true }, { trip: TRIP, cancelled: true }, 30_000)).toEqual({});
  expect(step({ key: '2026-10-21/R11_2', live: true }, train(['girona', 'portbou', 'cerbere']), 30_000)).toEqual({});
});

test('says a Ride was seen Live once live data confirmed the Train, even if it went Scheduled after', () => {
  let { riding } = step(undefined, coming(), 28_000);
  ({ riding } = step(riding, train(['girona', 'portbou', 'cerbere'], true), 29_000));
  ({ riding } = step(riding, train(['portbou', 'cerbere'], false), 35_000));
  expect(riding).toEqual({ key: KEY, live: true });
});

test("carries on a Ride a page reloaded before the Train's last Station kept, but not one reloaded after it", () => {
  const restored = { key: KEY, live: true, restored: true as const };
  expect(step(restored, train(['portbou', 'cerbere']), 35_000)).toEqual({ riding: { key: KEY, live: true } });
  expect(step(restored, { trip: TRIP, ended: at(36_600) }, 37_000)).toEqual({});
  expect(step(restored, train(['cerbere']), 36_070)).toEqual({});
});

/** A browser's storage, as local storage keeps strings by their keys. */
function storage() {
  const kept = new Map<string, string>();
  return { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value), removeItem: (key: string) => void kept.delete(key), kept };
}
const names: Record<string, string> = { sants: 'Barcelona-Sants', girona: 'Girona', portbou: 'Portbou' };
const R11 = rideOf(TRIP, KEY, { network: 'rodalies', kind: 'regional' }, true, NOON, (s) => names[s]);

test("makes a Ride of its Trip's Stations on the map: from, to, minutes, km and those called at", () => {
  expect(R11).toEqual({ key: KEY, line: 'rodalies:R11', network: 'rodalies', kind: 'regional', at: at(28_800), from: 'Barcelona-Sants', to: 'Portbou', minutes: 120, km: 160, stations: ['Barcelona-Sants', 'Girona', 'Portbou'], live: true });
});

test('stores nothing till turned on, keeps Rides newest first and the Ride under way across a reload, under one versioned key, and Clear empties it', () => {
  const store = storage();
  const kept = passport(() => store);
  expect(kept.on()).toBe(false);
  kept.setRiding({ key: KEY, live: false });
  kept.add(R11);
  expect(store.kept.size).toBe(0);
  kept.turnOn();
  kept.setRiding({ key: KEY, live: false });
  kept.add(R11);
  const later = { ...R11, key: '2026-10-22/R11_1', at: R11.at + 86_400_000 };
  kept.add(later);
  kept.add(R11);
  expect([...store.kept.keys()]).toEqual(['passport:1']);
  const again = passport(() => store);
  expect(again.on()).toBe(true);
  expect(again.rides()).toEqual([later, R11]);
  expect(again.riding()).toEqual({ key: KEY, live: false, restored: true });
  again.clear();
  expect(again.on()).toBe(false);
  expect(store.kept.size).toBe(0);
});

test('never throws where storage is blocked or full, and lasts for the page then', () => {
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('blocked'); } };
  const kept = passport(() => blocked);
  expect(kept.on()).toBe(false);
  kept.turnOn();
  kept.add(R11);
  expect(kept.rides()).toEqual([R11]);
  kept.clear();
  expect(kept.on()).toBe(false);
  const odd = storage();
  odd.setItem('passport:1', '{not json');
  expect(passport(() => odd).on()).toBe(false);
});

test('earns a Stamp for each Line, kind of service and Network once, dated by its first Ride, filled once one was seen Live', () => {
  const ringed: Ride = { ...R11, live: false };
  const l3: Ride = { ...R11, key: 'b', line: 'metro:L3', network: 'metro', kind: 'metro', at: R11.at + 1000, live: false };
  const r11Live: Ride = { ...R11, key: 'c', at: R11.at + 2000, live: true };
  expect(stamps([r11Live, l3, ringed])).toEqual([
    { id: 'line:rodalies:R11', at: R11.at, live: true },
    { id: 'kind:regional', at: R11.at, live: true },
    { id: 'network:rodalies', at: R11.at, live: true },
    { id: 'line:metro:L3', at: R11.at + 1000, live: false },
    { id: 'kind:metro', at: R11.at + 1000, live: false },
    { id: 'network:metro', at: R11.at + 1000, live: false },
  ]);
  expect(totals([r11Live, l3])).toEqual({ rides: 2, minutes: 240, km: 320, stations: ['Barcelona-Sants', 'Girona', 'Portbou'] });
});
