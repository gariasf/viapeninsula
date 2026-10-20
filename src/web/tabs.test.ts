import { expect, test } from 'vitest';
import { currentTab } from './tabs.ts';

test("marks Nearby's tab current while the panel shows the viewer's nearby Trains, or that it's finding where they are or can't", () => {
  expect(currentTab({ nearMe: [2.17, 41.39] })).toBe('nearby');
  for (const why of ['locating', 'retrying', 'refused', 'failed', 'unsupported']) expect(currentTab({ nearMe: why })).toBe('nearby');
});

test("marks Search's tab current while the panel shows Search", () => {
  expect(currentTab({ searching: true })).toBe('search');
});

test("marks Favourites' tab current while the panel shows Favourites (#472)", () => {
  expect(currentTab({ favouritesShown: true })).toBe('favourites');
  expect(currentTab({ boardPlace: 'adif:71801', favouritesShown: true })).toBeUndefined();
});

test('marks no tab current while the panel shows a followed Train or a board, though one opened from Nearby has a Back to it (#322), nor while it shows nothing', () => {
  expect(currentTab({ following: { day: '2026-10-11', trip: 'rodalies:R2_77001' } })).toBeUndefined();
  expect(currentTab({ boardPlace: 'adif:71801' })).toBeUndefined();
  // As the panel shows a Train, then a board, before Nearby or Search, where more than one is held.
  expect(currentTab({ following: { day: '2026-10-11', trip: 'rodalies:R2_77001' }, nearMe: [2.17, 41.39] })).toBeUndefined();
  expect(currentTab({ boardPlace: 'adif:71801', searching: true })).toBeUndefined();
  expect(currentTab({})).toBeUndefined();
  expect(currentTab({ searching: false })).toBeUndefined();
});
