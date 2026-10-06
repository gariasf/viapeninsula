// Which Networks the banner names: only those in view (#247, ADR-0010).
import type { Point } from '../bundle.ts';

/** The Networks a banner names, by their IDs: those whose live data is unavailable, and those with no Trips today (#226). */
export interface Banner {
  unavailable: string[];
  noTrips: string[];
}

/** A stretch of a Network's track, as the map draws each Network's track once zoomed out (#190). */
export interface NetworkTrack {
  network: string;
  coordinates: Point[];
}

/**
 * Of the Networks a banner could name, those it names, by their IDs, in the order given (ADR-0010):
 * each whose live data is unavailable while one of its Trains is drawn in the view, a box by its
 * south-west and north-east corners, or the map follows one of its Trains, wherever that is; and each
 * with no Trips today, and so no Trains, while any of its track is in the view (#226).
 */
export function bannerNetworks(
  { unavailable, noTrips }: Banner,
  { trains, followedNetwork, tracks }: { trains: { network: string; at: Point }[]; followedNetwork?: string; tracks: NetworkTrack[] },
  [[west, south], [east, north]]: [Point, Point],
): Banner {
  const inView = ([lon, lat]: Point) => lon >= west && lon <= east && lat >= south && lat <= north;
  // Each of a track's points, and the stretch from it to the next, which can cross the view with no point in it.
  const across = (coordinates: Point[]) =>
    coordinates.some(([lon, lat], i) => {
      const [toLon, toLat] = coordinates[i + 1] ?? [lon, lat];
      if (Math.max(lon, toLon) < west || Math.min(lon, toLon) > east || Math.max(lat, toLat) < south || Math.min(lat, toLat) > north) return false;
      // It passes the view by where all four of the view's corners lie on one side of it.
      const corners: Point[] = [
        [west, south],
        [west, north],
        [east, south],
        [east, north],
      ];
      const sides = corners.map(([x, y]) => Math.sign((toLon - lon) * (y - lat) - (toLat - lat) * (x - lon)));
      return !sides.every((side) => side > 0) && !sides.every((side) => side < 0);
    });
  return {
    unavailable: unavailable.filter((id) => id === followedNetwork || trains.some((t) => t.network === id && inView(t.at))),
    noTrips: noTrips.filter((id) => tracks.some((t) => t.network === id && across(t.coordinates))),
  };
}
