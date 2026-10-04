// Rounds the corners of the rails the map draws zoomed in (#203). OpenStreetMap maps a curve as
// straight lengths between its points, which zoomed in show as facets: the page rounds each bend
// into an arc as it draws it, rather than the daily build, which would make the track file about a
// quarter larger. Trains still run on the shape as it is, at a bend up to ROUND outside its arc.

import { DEGREE, type Point } from '../bundle.ts';

/** How far a bend's arc may stray from its corner, in metres. */
const ROUND = 2;
/** A bend gentler than this is left as it is: 1°. */
const GENTLE = Math.PI / 180;
/** How much an arc turns from one point to the next, at most: 3°. */
const ARC = Math.PI / 60;
/** How far apart an arc's points are, at least, in metres. */
const ARC_STEP = 1;
/** A corner sharper than this is a turn back, not a bend, and stays as it is. */
const SHARP = (2 * Math.PI) / 3;

/**
 * A line with each bend rounded into a circular arc that strays from its corner by up to ROUND,
 * and takes up no more than half of either side, so that the arcs of two bends in a row meet.
 * Each arc is worked from the same end whichever way a line runs, so two Lines on the same rails
 * draw the same curve.
 */
export function rounded(points: Point[]): Point[] {
  const out = points.slice(0, 1);
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1], points[i], points[i + 1]] as [Point, Point, Point];
    const backwards = a[0] > c[0] || (a[0] === c[0] && a[1] > c[1]);
    const arc = backwards ? fillet(c, b, a).reverse() : fillet(a, b, c);
    out.push(...(arc.length ? arc : [b]));
  }
  if (points.length > 1) out.push(points.at(-1) as Point);
  return out;
}

/** The arc that rounds the corner at b from a to c, from a's side to c's, or none if it stays a corner. */
function fillet(a: Point, b: Point, c: Point): Point[] {
  const kx = Math.cos((b[1] * Math.PI) / 180);
  // In metres from the corner.
  const [u, v] = [a, c].map((p): Point => [(p[0] - b[0]) * kx * DEGREE, (p[1] - b[1]) * DEGREE]) as [Point, Point];
  const [lu, lv] = [Math.hypot(...u), Math.hypot(...v)];
  const turn = Math.PI - Math.acos(Math.max(-1, Math.min(1, (u[0] * v[0] + u[1] * v[1]) / (lu * lv))));
  const half = turn / 2;
  // How far from the corner the arc starts on either side: as far as ROUND allows, or half the shorter side.
  const t = Math.min((ROUND / (1 / Math.cos(half) - 1)) * Math.tan(half), lu / 2, lv / 2);
  if (!(turn >= GENTLE && turn < SHARP && t > 0.1)) return [];
  const r = t / Math.tan(half);
  const steps = Math.max(1, Math.min(Math.ceil(turn / ARC), Math.floor((r * turn) / ARC_STEP)));
  // The arc's centre, on the corner's bisector, and the way the arc turns.
  const [ux, uy, vx, vy] = [u[0] / lu, u[1] / lu, v[0] / lv, v[1] / lv];
  const [bx, by] = [ux + vx, uy + vy];
  const lb = Math.hypot(bx, by);
  const far = r / Math.cos(half);
  const centre: Point = [(bx / lb) * far, (by / lb) * far];
  const way = Math.sign(ux * vy - uy * vx) || 1;
  const start: Point = [ux * t - centre[0], uy * t - centre[1]];
  return Array.from({ length: steps + 1 }, (_, k) => {
    const angle = -way * turn * (k / steps);
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const p: Point = [centre[0] + start[0] * cos - start[1] * sin, centre[1] + start[0] * sin + start[1] * cos];
    return [b[0] + p[0] / (kx * DEGREE), b[1] + p[1] / DEGREE];
  });
}
