import { expect, test } from 'vitest';
import type { Point } from '../bundle.ts';
import { bannerNetworks } from './banner.ts';

/** The map's view over Barcelona, its south-west and north-east corners, as MapLibre gives its bounds. */
const BARCELONA: [Point, Point] = [
  [2.05, 41.32],
  [2.25, 41.45],
];
/** Barcelona-Sants and Madrid-Atocha, where a Train can be drawn. */
const [SANTS, ATOCHA]: [Point, Point] = [
  [2.1404, 41.3793],
  [-3.6893, 40.4066],
];

test('a Network whose live data is unavailable is named only while one of its Trains is in view', () => {
  const trains = [
    { network: 'rodalies', at: SANTS },
    { network: 'cercanias-madrid', at: ATOCHA },
  ];
  expect(bannerNetworks({ unavailable: ['rodalies', 'cercanias-madrid'], noTrips: [] }, { trains, tracks: [] }, BARCELONA)).toEqual({ unavailable: ['rodalies'], noTrips: [] });
});

test("while the map follows one of its Trains, a Network whose live data is unavailable is named wherever the view", () => {
  const trains = [{ network: 'cercanias-madrid', at: ATOCHA }];
  expect(bannerNetworks({ unavailable: ['cercanias-madrid'], noTrips: [] }, { trains, followedNetwork: 'cercanias-madrid', tracks: [] }, BARCELONA).unavailable).toEqual(['cercanias-madrid']);
});

test('a Network with no Trips today, and so no Trains, is named only while any of its track is in view', () => {
  const tracks = [
    { network: 'rodalies', coordinates: [[2.127, 41.374], SANTS, [2.16, 41.388]] as Point[] },
    { network: 'cercanias-madrid', coordinates: [[-3.7, 40.4], ATOCHA, [-3.67, 40.41]] as Point[] },
  ];
  expect(bannerNetworks({ unavailable: [], noTrips: ['rodalies', 'cercanias-madrid'] }, { trains: [], tracks }, BARCELONA)).toEqual({ unavailable: [], noTrips: ['rodalies'] });
});

test('zoomed right in, a stretch of track across the view counts, though none of its points lies in it', () => {
  // About 250 m either way around Sants, and a straight 4 km of track across it, a point at each end.
  const view: [Point, Point] = [
    [2.137, 41.377],
    [2.143, 41.382],
  ];
  const tracks = [{ network: 'rodalies', coordinates: [[2.12, 41.37], [2.16, 41.39]] as Point[] }];
  expect(bannerNetworks({ unavailable: [], noTrips: ['rodalies'] }, { trains: [], tracks }, view).noTrips).toEqual(['rodalies']);
  // One that passes the view's north-west corner by, about 300 m off.
  const by = [{ network: 'rodalies', coordinates: [[2.13, 41.38], [2.14, 41.39]] as Point[] }];
  expect(bannerNetworks({ unavailable: [], noTrips: ['rodalies'] }, { trains: [], tracks: by }, view).noTrips).toEqual([]);
});
