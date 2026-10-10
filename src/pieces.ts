// The track file's traced shapes as pieces of track the shapes share, and its slots as chains
// (ADR-0015). The build writes a track as a StoredTrack (encodeTrack()); the page, the recorder and
// the measures read it back as the Track the build made (decodeTrack()), so the engine and the map see
// what they always did.

import { EARTH, STRETCH, type Point, type Shape, type Track } from './bundle.ts';

/** A track as the build made it, or as its file stores it. */
export type TrackFile = Track | StoredTrack;

/** A track file with its traced shapes as pieces: the centrelines and curves stay in `shapes`. */
export interface StoredTrack extends Track {
  traced: Traced;
}

/** The traced shapes of a track, in the order it has them, before its centrelines. */
export interface Traced {
  /**
   * The pieces of track the shapes are made of: each a run of points between junctions, shape ends and
   * turn-backs, stored once, for every shape that runs it, either way. A piece is its first point,
   * in millionths of a degree, `[lon, lat]`, then its second point as the change from the first, and
   * each point after as the change in that change, as a straight track's are nearly nothing.
   */
  pieces: number[][];
  /** The names of the levels the shapes' `levelsAt` give. */
  levels: string[];
  /** Each shape as the pieces it runs, or as it is where its points can't be pieces. */
  shapes: (Shape | Run)[];
}

/** A traced shape as the pieces it runs, with what its distances and its levels need beyond them. */
export interface Run {
  id: string;
  /** Piece numbers, counted from 1, negative where the shape runs a piece backwards. */
  pieces: number[];
  /**
   * Where its distances aren't the rounded sum of the great-circle lengths from its first point to
   * each, as the build's come from points it has rounded since, a metre off: for each, how many
   * points on from the last fix, and what to add.
   */
  fixes?: number[];
  /** Its distances, the first and then the change at each point, where there are more fixes than points: as a shape cut at the border keeps counting from where it began. */
  dist?: number[];
  /** Its levels, as for each, how many points on from the one before the level starts at, and its name's number in `Traced.levels`. */
  levelsAt?: number[];
  /** Its levels as the shape has them, where one starts between two points. */
  levels?: Shape['levels'];
}

/** A point's coordinates are on the grid shapes are written on: millionths of a degree. */
const MICRO = 1e6;

/**
 * Whether a coordinate is whole millionths of a degree, and less than `limit` degrees from 0: a point's
 * key, its longitude's millionths times 2^28 and its latitude's added, stays whole up to 33° of longitude.
 */
function onGrid(degrees: number, limit: number): boolean {
  return Math.round(degrees * MICRO) / MICRO === degrees && Math.abs(degrees) < limit;
}

/** Great-circle distance in metres: build/track.ts's metres(), which a shape's `dist` is the rounded sum of. */
function metres(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}

/** The track as its file stores it: its traced shapes as pieces. */
export function encodeTrack(track: Track): StoredTrack {
  const { shapes, ...rest } = track;
  return { ...rest, shapes: shapes.filter((s) => s.id.startsWith(STRETCH)), traced: encodeTraced(shapes.filter((s) => !s.id.startsWith(STRETCH))) };
}

/** The track a file stores, or the file itself where it's of a build before #257, with its shapes whole. */
export function decodeTrack(file: TrackFile): Track {
  if (!('traced' in file)) return file;
  const { traced, shapes, ...rest } = file;
  return { ...rest, shapes: [...decodeTraced(traced), ...shapes] };
}

function encodeTraced(shapes: Shape[]): Traced {
  // Each point once, by its coordinates in millionths of a degree.
  const ids = new Map<number, number>();
  const xs: number[] = [];
  const ys: number[] = [];
  const node = ([lon, lat]: Point) => {
    const [x, y] = [Math.round(lon * MICRO), Math.round(lat * MICRO)];
    const key = x * 2 ** 28 + y;
    let id = ids.get(key);
    if (id === undefined) {
      id = xs.length;
      ids.set(key, id);
      xs.push(x);
      ys.push(y);
    }
    return id;
  };
  // A shape whose points aren't on the grid, or whose distances aren't whole metres, or that is only a
  // point, goes in as it is: it has no pieces to share.
  const whole = shapes.map((s) => s.coords.length < 2 || s.coords.some(([lon, lat]) => !onGrid(lon, 33) || !onGrid(lat, 90)) || s.dist.some((d) => !Number.isInteger(d)));
  const sequences = shapes.map((s, i) => (whole[i] ? [] : s.coords.map(node)));
  // Where a piece must end: at a shape's ends, where it turns back, and at a point that isn't just
  // carried on along one track, which has anything but two points next to it among all the shapes'.
  const next = xs.map(() => new Set<number>());
  const ends = new Set<number>();
  for (const q of sequences) {
    for (const [i, v] of q.entries()) {
      const before = q[i - 1];
      if (before === undefined) ends.add(v);
      else {
        next[v]?.add(before);
        next[before]?.add(v);
      }
      if (i === q.length - 1 || (before !== undefined && before === q[i + 1])) ends.add(v);
    }
  }
  const ending = (v: number) => ends.has(v) || next[v]?.size !== 2;
  // Each shape cut at those points into runs, a piece for each run, found again by its first inner point
  // where it has one, or by its two ends, and told from its twin run the other way by which way it leaves.
  const known = new Map<string, number>();
  const pieces: number[][] = [];
  const runs = sequences.map((q): number[] => {
    const list: number[] = [];
    let from = 0;
    for (let i = 1; i < q.length; i++) {
      if (!ending(q[i] ?? -1)) continue;
      const run = q.slice(from, i + 1);
      from = i;
      const [a, b, z] = [run[0] ?? 0, run[1] ?? 0, run[run.length - 2] ?? 0];
      // Its inner points belong to it alone: the one nearer its start or its end, whichever has the lower number, are the same either way round.
      const key = run.length > 2 ? `${Math.min(b, z)}` : `${Math.min(a, b)} ${Math.max(a, b)}`;
      const found = known.get(key);
      if (found === undefined) {
        known.set(key, pieces.length);
        list.push(pieces.length + 1);
        pieces.push(run);
        continue;
      }
      const first = pieces[found] ?? [];
      list.push(a === first[0] && b === first[1] ? found + 1 : -(found + 1));
    }
    return list;
  });
  const names: string[] = [];
  return {
    pieces: pieces.map((run) => {
      const out = [xs[run[0] ?? 0] ?? 0, ys[run[0] ?? 0] ?? 0];
      let [dx, dy] = [0, 0];
      for (let k = 1; k < run.length; k++) {
        const [a, b] = [run[k - 1] ?? 0, run[k] ?? 0];
        const [x, y] = [(xs[b] ?? 0) - (xs[a] ?? 0), (ys[b] ?? 0) - (ys[a] ?? 0)];
        out.push(x - dx, y - dy);
        [dx, dy] = [x, y];
      }
      return out;
    }),
    levels: names,
    shapes: shapes.map((s, i): Shape | Run => {
      if (whole[i]) return s;
      const run: Run = { id: s.id, pieces: runs[i] ?? [] };
      const fixes: number[] = [];
      let last = 0;
      for (const [k, d] of distancesOf(s.coords).entries()) {
        if (d === s.dist[k]) continue;
        fixes.push(k - last, (s.dist[k] ?? 0) - d);
        last = k;
      }
      if (fixes.length > s.coords.length) run.dist = s.dist.map((d, k) => d - (s.dist[k - 1] ?? 0));
      else if (fixes.length) run.fixes = fixes;
      const levelsAt = s.levels && levelsAtVertices(s, names);
      if (levelsAt) run.levelsAt = levelsAt;
      else if (s.levels) run.levels = s.levels;
      return run;
    }),
  };
}

/** The distances a shape's points give: the rounded running sum of the great-circle lengths between them. */
function distancesOf(coords: Point[]): number[] {
  let sum = 0;
  return coords.map((p, i) => Math.round((sum += i ? metres(coords[i - 1] ?? p, p) : 0)));
}

/** A shape's levels as the vertices they start at, where every one does, by the names' numbers in `names`, which it adds to. */
function levelsAtVertices({ dist, levels }: Shape, names: string[]): number[] | undefined {
  const out: number[] = [];
  let last = 0;
  for (const [from, level] of levels ?? []) {
    // The first point at or beyond the distance, found by halving.
    let [lo, hi] = [0, dist.length - 1];
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((dist[mid] ?? 0) < from) lo = mid + 1;
      else hi = mid;
    }
    if (dist[lo] !== from) return undefined;
    let name = names.indexOf(level);
    if (name < 0) name = names.push(level) - 1;
    out.push(lo - last, name);
    last = lo;
  }
  return out;
}

function decodeTraced({ pieces, levels: names, shapes }: Traced): Shape[] {
  const points = pieces.map((p): Point[] => {
    const [x, y] = [p[0] ?? 0, p[1] ?? 0];
    const out: Point[] = [[x / MICRO, y / MICRO]];
    let [px, py, dx, dy] = [x, y, 0, 0];
    for (let k = 2; k < p.length; k += 2) {
      dx += p[k] ?? 0;
      dy += p[k + 1] ?? 0;
      [px, py] = [px + dx, py + dy];
      out.push([px / MICRO, py / MICRO]);
    }
    return out;
  });
  return shapes.map((s): Shape => {
    if (!('pieces' in s)) return s;
    const coords: Point[] = [];
    for (const ref of s.pieces) {
      const run = points[Math.abs(ref) - 1] ?? [];
      const along = ref < 0 ? run.toReversed() : run;
      // Where a piece comes on after another, its first point is the one before's last.
      for (const p of coords.length ? along.slice(1) : along) coords.push(p);
    }
    let dist: number[];
    if (s.dist) {
      let sum = 0;
      dist = s.dist.map((d) => (sum += d));
    } else {
      dist = distancesOf(coords);
      let at = 0;
      for (let k = 0; k < (s.fixes?.length ?? 0); k += 2) {
        at += s.fixes?.[k] ?? 0;
        dist[at] = (dist[at] ?? 0) + (s.fixes?.[k + 1] ?? 0);
      }
    }
    let levels = s.levels;
    if (s.levelsAt) {
      let at = 0;
      levels = [];
      for (let k = 0; k < s.levelsAt.length; k += 2) {
        at += s.levelsAt[k] ?? 0;
        levels.push([dist[at] ?? 0, names[s.levelsAt[k + 1] ?? 0] ?? '']);
      }
    }
    return { id: s.id, coords, dist, ...(levels && { levels }) };
  });
}
