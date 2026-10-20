import { expect, test } from 'vitest';
import { favourites, favouriteRows, type Favourite } from './favourites.ts';

const SANTS: Favourite = { kind: 'station', id: 'adif:71801', station: 'adif:71801', name: 'Barcelona-Sants' };
const R4: Favourite = { kind: 'line', id: 'rodalies:R4', name: 'R4' };
const L3: Favourite = { kind: 'line', id: 'metro:L3', name: 'L3' };

/** A browser's storage, as local storage keeps strings by their keys. */
function storage() {
  const kept = new Map<string, string>();
  return { getItem: (key: string) => kept.get(key) ?? null, setItem: (key: string, value: string) => void kept.set(key, value), kept };
}

test('keeps a Station and a Line, and removes them, in the order they were kept, across a page opened again', () => {
  const store = storage();
  const kept = favourites(() => store);
  kept.toggle(R4);
  kept.toggle(SANTS);
  kept.toggle(L3);
  expect(kept.has(R4)).toBe(true);
  expect(favourites(() => store).all()).toEqual([R4, SANTS, L3]);
  kept.toggle(R4);
  expect(kept.has(R4)).toBe(false);
  expect(favourites(() => store).all()).toEqual([SANTS, L3]);
});

test('keeps them under one versioned key, and reads nothing from one it can\'t read', () => {
  const store = storage();
  favourites(() => store).toggle(R4);
  expect([...store.kept.keys()]).toEqual(['favourites:1']);
  for (const unreadable of ['{', '{"kind":"line"}']) {
    store.kept.set('favourites:1', unreadable);
    expect(favourites(() => store).all()).toEqual([]);
  }
  // One it can't read, as a Train, or a Station with no Station ID, or none at all, is left out, and the rest kept.
  store.kept.set('favourites:1', JSON.stringify([{ kind: 'train', id: 'x', name: 'x' }, R4, { kind: 'station', id: 'a', name: 'A' }, null, SANTS]));
  expect(favourites(() => store).all()).toEqual([R4, SANTS]);
});

test('with storage blocked or full, the star still toggles for the page\'s life, and nothing throws', () => {
  const blocked = favourites(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
  const full = favourites(() => ({
    getItem: () => null,
    setItem: () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    },
  }));
  for (const kept of [blocked, full]) {
    kept.toggle(SANTS);
    expect(kept.all()).toEqual([SANTS]);
    kept.toggle(SANTS);
    expect(kept.all()).toEqual([]);
  }
});

test('the sheet shows kept Stations, then kept Lines, each Loading… till its regions have come, and one the map then lacks no longer on it', () => {
  const rows = favouriteRows([R4, SANTS, L3], (f) => f !== L3, (f) => f !== R4);
  expect(rows.stations).toEqual([{ ...SANTS, state: 'shown' }]);
  expect(rows.lines).toEqual([
    { ...R4, state: 'gone' },
    { ...L3, state: 'loading' },
  ]);
});
