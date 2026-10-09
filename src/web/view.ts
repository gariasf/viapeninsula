// Where the map opens: on Barcelona the first time, then where the viewer last left it (#245, ADR-0010),
// and the point a link has it ring (#254).
import type { Point } from '../bundle.ts';

/** A view of the map: its centre, its zoom, and its bearing and pitch, in degrees. */
export type View = { center: Point; zoom: number; bearing: number; pitch: number };

/** Barcelona, with the rest of Catalonia a zoom away. */
const BARCELONA: View = { center: [2.17, 41.39], zoom: 11, bearing: 0, pitch: 0 };

/**
 * What the view the viewer last left the map at is kept under on their device, as JSON, in local
 * storage, which keeps their language too. It never leaves the device.
 */
const VIEW_KEY = 'view';

/**
 * The view to open the map on: the one `kept` on this device, unless the page's `link` names a view, or
 * none is kept, when Barcelona. MapLibre opens a link's own view over it. A link that names only a
 * Station or a Train opens on the kept view, as one that names nothing does: the map eases from there to
 * a Station it knows (#292) or a running Train it follows, and stays there for a Station it doesn't know
 * or a Train that isn't running (#306). A kept view MapLibre can't open, such as one past a pole, would
 * stop the map, so it opens on Barcelona too.
 */
export function openingView(link: string, kept: string | null): View {
  const named = new URLSearchParams(link.slice(1));
  if (!kept || named.has('map')) return BARCELONA;
  try {
    const { center: [lon, lat], zoom, bearing, pitch } = JSON.parse(kept);
    if ([lon, lat, zoom, bearing, pitch].every(Number.isFinite) && Math.abs(lat) <= 90) return { center: [lon, lat], zoom, bearing, pitch };
  } catch {
    // Not a view as keepView() keeps it.
  }
  return BARCELONA;
}

/**
 * The point a link's `mark=<lat>,<lon>` names, which the map rings until the next tap, as a build
 * report's links do (#254): none where the link names none, or where it isn't a latitude and a
 * longitude, in degrees.
 */
export function markOf(link: string): Point | undefined {
  const [, lat, lon] = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(new URLSearchParams(link.slice(1)).get('mark') ?? '')?.map(Number) ?? [];
  return lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lon, lat] : undefined;
}

/** The last view kept on this device, as keepView() keeps it, if its storage can be read. */
export function lastView(): string | null {
  try {
    return localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
}

/** Keeps `view` on this device, for the map to open on next time. */
export function keepView(view: View) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(view));
  } catch {
    // Storage is off, as in some private windows: nothing is kept.
  }
}
