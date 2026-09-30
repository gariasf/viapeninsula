// How MapLibre draws a line offset from its track: simplified by its GeoJSON source, and each point
// moved along its join's miter, as its line shader does, with nothing to remove the loops that makes.

/** How far MapLibre simplifies a GeoJSON source, in px at each zoom: its default tolerance. */
export const TOLERANCE = 0.375;

/** A line with only the points it needs to stay within a tolerance of itself (Douglas–Peucker, as geojson-vt). */
export function simplify(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length < 3) return points;
  const keep = new Set([0, points.length - 1]);
  const stack: [number, number][] = [[0, points.length - 1]];
  for (let next = stack.pop(); next; next = stack.pop()) {
    const [a, b] = next;
    const [[ax, ay], [bx, by]] = [points[a] ?? [0, 0], points[b] ?? [0, 0]];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    let [far, at] = [tolerance, -1];
    for (let i = a + 1; i < b; i++) {
      const [x, y] = points[i] ?? [0, 0];
      const off = Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / length;
      if (off > far) [far, at] = [off, i];
    }
    if (at < 0) continue;
    keep.add(at);
    stack.push([a, at], [at, b]);
  }
  return points.filter((_, i) => keep.has(i));
}

/** A line's points moved so many metres to its right, each along its join's miter. */
export function offset(points: [number, number][], metres: number): [number, number][] {
  const right = (a: [number, number], b: [number, number]): [number, number] => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[1] - a[1]) / length, -(b[0] - a[0]) / length];
  };
  return points.map((p, i) => {
    // The segments either side of the point, where an end's missing one comes out as none.
    const [n1, n2] = [right(points[i - 1] ?? p, p), right(p, points[i + 1] ?? p)];
    const join = [n1[0] + n2[0], n1[1] + n2[1]] as const;
    const length = Math.hypot(join[0], join[1]) || 1;
    const [jx, jy] = [join[0] / length, join[1] / length];
    // A floor on the half-angle's cosine, so a hairpin doesn't shoot off.
    const miter = 1 / Math.max(0.05, jx * n1[0] + jy * n1[1], jx * n2[0] + jy * n2[1]);
    return [p[0] + metres * jx * miter, p[1] + metres * jy * miter];
  });
}

/** The segments of a line, by the index of the point each ends at, that run back the other way once it's offset so many metres: where it folds. */
export function folded(points: [number, number][], metres: number): number[] {
  const off = offset(points, metres);
  return points.flatMap(([bx, by], i) => {
    const [[ax, ay], [cx, cy], [dx, dy]] = [points[i - 1] ?? [bx, by], off[i - 1] ?? [0, 0], off[i] ?? [0, 0]];
    return i && (bx - ax) * (dx - cx) + (by - ay) * (dy - cy) < 0 ? [i] : [];
  });
}
