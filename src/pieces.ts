// The track file's traced shapes as pieces of track the shapes share, and its slots as chains
// (ADR-0015). The build writes a track as a StoredTrack (encodeTrack()); the page, the recorder and
// the measures read it back as the Track the build made (decodeTrack()), so the engine and the map see
// what they always did.

import { EARTH, STRETCH, type Line, type Point, type Shape, type Slot, type Track } from './bundle.ts';

/** A track as the build made it, or as its file stores it. */
export type TrackFile = Track | StoredTrack;

/**
 * A track file with its traced shapes as pieces and its slots as chains: the centrelines, smoothed
 * copies and curves are in `shapes`, as their points' second differences (Drawn), and the slots are whole in `slots` where one doesn't follow the
 * one before on its shape, or names a Line or shape the track hasn't (encodeTrack()): none of the build's does.
 */
export interface StoredTrack extends Omit<Track, 'slots' | 'shapes'> {
  shapes: (Shape | Drawn)[];
  traced: Traced;
  chains?: Chains;
  slots?: Slot[];
}

/**
 * Each shape's slots in one graph, one band, run on one after another from where its first starts, so
 * each is its length, its side, the centreline it goes on, and where on it. The runs are in the track's order.
 */
export interface Chains {
  /** The centrelines the slots go on, each once, as the first slot to go on it has it. */
  on: string[];
  /**
   * For each run, its Line's and its shape's places in the track's Lines and traced shapes, as the
   * change from the run before, its band's number plus 1, or 0 for the main graph, and how far along
   * the shape its first slot starts, which is 0 but for a shape cut at the border; then for each
   * slot: its length, its side, its centreline's place in `on` as the change from the slot before,
   * where it starts as the change from where the slot before ended, and how far it goes along the
   * centreline, negative where it goes back.
   */
  runs: number[][];
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
  /** Its distances, the first and then the change at each point, where its fixes would be more numbers than it has points: as a shape cut at the border keeps counting from where it began. */
  dist?: number[];
  /** Its levels, as for each, how many points on from the one before the level starts at, and its name's number in `Traced.levels`. */
  levelsAt?: number[];
  /** Its levels as the shape has them, where one starts between two points. */
  levels?: Shape['levels'];
}

/**
 * A centreline, a smoothed copy or a curve, whose points the build writes on a grid of hundred-thousandths
 * of a degree (#524): its first point in them, `[lon, lat]`, then its second point as the change from
 * the first, and each point after as the change in that change, as a piece's are.
 */
export interface Drawn {
  id: string;
  points: number[];
  /** Where its distances are in tenths of a metre, as a curve's are: its fixes and `dist` are in tenths too. */
  tenths?: 1;
  /** As a Run's: where its distances aren't the rounded sum of its points' lengths, how many points on from the last fix, and what to add. */
  fixes?: number[];
  /** As a Run's: its distances, the first and then the change at each point, where its fixes would be more numbers than it has points, as a centreline's on a band's own graph, which keeps the distances of the points it dropped. */
  dist?: number[];
}

/** A point's coordinates are on the grid shapes are written on: millionths of a degree. */
const MICRO = 1e6;
/** The grid the centrelines, smoothed copies and curves are written on: hundred-thousandths of a degree. */
const CENTI = 1e5;

/**
 * Whether a coordinate is whole steps of a grid, millionths of a degree unless given, and less than `limit` degrees from 0: a point's
 * key, its longitude's millionths times 2^28 and its latitude's added, stays whole up to 33° of longitude.
 * ponytail: a shape beyond 33° of longitude either way, which none of Spain's is, from the Canary
 * Islands at 18° W to Menorca at 4.4° E, is kept whole; key a point by a string if a region ever runs there.
 */
function onGrid(degrees: number, limit: number, grid = MICRO): boolean {
  return Math.round(degrees * grid) / grid === degrees && Math.abs(degrees) < limit;
}

/**
 * Great-circle distance in metres: build/track.ts's metres(), which a shape's `dist` is the rounded sum
 * of. It is a copy, so that the page needn't take the build's tracing in; pieces.test.ts has them agree
 * to the last bit, as a sum of them rounded would move a Train a metre where they don't.
 */
export function metres(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const h = Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 2 * EARTH * Math.asin(Math.sqrt(h));
}

/** The track as its file stores it: its traced shapes as pieces. */
export function encodeTrack(track: Track): StoredTrack {
  const { shapes, slots, ...rest } = track;
  const traced = shapes.filter((s) => !s.id.startsWith(STRETCH));
  const chains = encodeChains(slots, track.lines, traced);
  return { ...rest, shapes: shapes.filter((s) => s.id.startsWith(STRETCH)).map(encodeDrawn), traced: encodeTraced(traced), ...(chains ? { chains } : { slots }) };
}

/** The track a file stores, or the file itself where it's of a build before #257, with its shapes whole. */
export function decodeTrack(file: TrackFile): Track {
  if (!('traced' in file)) return file;
  const { traced, chains, shapes, slots, ...rest } = file;
  return {
    ...rest,
    shapes: [...decodeTraced(traced), ...shapes.map((s) => ('points' in s ? decodeDrawn(s) : s))],
    slots: chains ? decodeChains(chains, rest.lines, traced.shapes) : (slots ?? []),
  };
}

/**
 * The slots as chains, or none where they aren't: each run goes one slot on from the one before, and names a Line and a shape the track has.
 * ponytail: one slot that doesn't keeps every slot of the track whole, 393 KB brotli more on long distance's file (527.3 KB for 133.9):
 * trackFile() says so. Keep whole only that shape's run if a build ever has one.
 */
function encodeChains(slots: Slot[], lines: Line[], traced: Shape[]): Chains | undefined {
  const [lineAt, shapeAt] = [new Map(lines.map((l, i) => [l.id, i])), new Map(traced.map((s, i) => [s.id, i]))];
  const on: string[] = [];
  const placeOf = new Map<string, number>();
  const runs: number[][] = [];
  let [line, shape, band, to, at, here, row] = [0, 0, 0, 0, 0, 0, [] as number[]];
  for (const s of slots) {
    const [l, h, b] = [lineAt.get(s.line), shapeAt.get(s.shape), (s.band ?? -1) + 1];
    if (l === undefined || h === undefined) return undefined;
    if (!runs.length || l !== line || h !== shape || b !== band) {
      // A new run, in the places it's counted from: the last run's, and 0 for the first.
      row = [l - line, h - shape, b, s.from];
      runs.push(row);
      [line, shape, band, to, at, here] = [l, h, b, s.from, 0, 0];
    }
    if (s.from !== to) return undefined;
    let place = placeOf.get(s.on);
    if (place === undefined) {
      place = on.push(s.on) - 1;
      placeOf.set(s.on, place);
    }
    row.push(s.to - s.from, s.side, place - here, s.at[0] - at, s.at[1] - s.at[0]);
    [to, at, here] = [s.to, s.at[1], place];
  }
  return { on, runs };
}

/** The slots a Chains stores, in the order they were given: each run's slots one after another from where its first starts. */
function decodeChains({ on, runs }: Chains, lines: Line[], shapes: { id: string }[]): Slot[] {
  const slots: Slot[] = [];
  let [line, shape] = [0, 0];
  for (const row of runs) {
    line += row[0] ?? 0;
    shape += row[1] ?? 0;
    const band = (row[2] ?? 0) - 1;
    let [to, at, here] = [row[3] ?? 0, 0, 0];
    for (let k = 4; k < row.length; k += 5) {
      const from = to;
      to = from + (row[k] ?? 0);
      here += row[k + 2] ?? 0;
      const start = at + (row[k + 3] ?? 0);
      at = start + (row[k + 4] ?? 0);
      slots.push({
        line: lines[line]?.id ?? '',
        shape: shapes[shape]?.id ?? '',
        from,
        to,
        side: row[k + 1] ?? 0,
        on: on[here] ?? '',
        at: [start, at],
        ...(band >= 0 && { band }),
      });
    }
  }
  return slots;
}

/**
 * The traced shapes as the pieces they share: each point once, cut into runs where a shape ends or turns back
 * and where the shapes' tracks don't just carry on, each run a piece found again by its inner points, run
 * either way. A shape with no pieces to share goes in whole.
 */
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
    pieces: pieces.map((run) => differences(run.map((v): Point => [xs[v] ?? 0, ys[v] ?? 0]))),
    levels: names,
    shapes: shapes.map((s, i): Shape | Run => {
      if (whole[i]) return s;
      const run: Run = { id: s.id, pieces: runs[i] ?? [], ...storedDistances(s.dist, s.coords, 1) };
      const levelsAt = s.levels && levelsAtVertices(s, names);
      if (levelsAt) run.levelsAt = levelsAt;
      else if (s.levels) run.levels = s.levels;
      return run;
    }),
  };
}

/** The distances a shape's points give: the running sum of the great-circle lengths between them, rounded to whole `unit`s of a metre (1, or 10 for tenths), in those units. */
function distancesOf(coords: Point[], unit: number): number[] {
  let sum = 0;
  return coords.map((p, i) => Math.round((sum += i ? metres(coords[i - 1] ?? p, p) : 0) * unit));
}

/** A shape's distances, whole `unit`s of a metre, as the file stores them: the fixes to what its points give, or whole where those would be more numbers than it has points. */
function storedDistances(dist: number[], coords: Point[], unit: number): Pick<Run, 'fixes' | 'dist'> {
  const fixes: number[] = [];
  let last = 0;
  for (const [k, d] of distancesOf(coords, unit).entries()) {
    const own = Math.round((dist[k] ?? 0) * unit);
    if (d === own) continue;
    fixes.push(k - last, own - d);
    last = k;
  }
  if (fixes.length > coords.length) return { dist: dist.map((d, k) => Math.round(d * unit) - Math.round((dist[k - 1] ?? 0) * unit)) };
  return fixes.length ? { fixes } : {};
}

/** A shape's distances from what the file stores of them, in whole `unit`s of a metre, as metres. */
function readDistances({ fixes, dist }: Pick<Run, 'fixes' | 'dist'>, coords: Point[], unit: number): number[] {
  let out: number[];
  if (dist) {
    let sum = 0;
    out = dist.map((d) => (sum += d));
  } else {
    out = distancesOf(coords, unit);
    let at = 0;
    for (let k = 0; k < (fixes?.length ?? 0); k += 2) {
      at += fixes?.[k] ?? 0;
      out[at] = (out[at] ?? 0) + (fixes?.[k + 1] ?? 0);
    }
  }
  return unit === 1 ? out : out.map((d) => d / unit);
}

/** Points in whole steps of a grid, as the file stores them: the first, then the change to the second, then each change in that change. */
function differences(points: Point[]): number[] {
  const [x0, y0] = points[0] ?? [0, 0];
  const out = [x0, y0];
  let [dx, dy] = [0, 0];
  for (let k = 1; k < points.length; k++) {
    const [[ax, ay], [bx, by]] = [points[k - 1] ?? [0, 0], points[k] ?? [0, 0]];
    out.push(bx - ax - dx, by - ay - dy);
    [dx, dy] = [bx - ax, by - ay];
  }
  return out;
}

/** The points differences() stores, in degrees, on a grid of `grid` steps to a degree. */
function points(p: number[], grid: number): Point[] {
  const [x, y] = [p[0] ?? 0, p[1] ?? 0];
  const out: Point[] = [[x / grid, y / grid]];
  let [px, py, dx, dy] = [x, y, 0, 0];
  for (let k = 2; k < p.length; k += 2) {
    dx += p[k] ?? 0;
    dy += p[k + 1] ?? 0;
    [px, py] = [px + dx, py + dy];
    out.push([px / grid, py / grid]);
  }
  return out;
}

/**
 * A centreline, smoothed copy or curve as the file stores it, or as it is where its points aren't on
 * the 1e-5 grid, or its distances aren't whole metres or tenths.
 */
function encodeDrawn(s: Shape): Shape | Drawn {
  const unit = s.dist.every(Number.isInteger) ? 1 : 10;
  if (s.levels || s.coords.some(([lon, lat]) => !onGrid(lon, 180, CENTI) || !onGrid(lat, 90, CENTI)) || s.dist.some((d) => Math.round(d * unit) / unit !== d)) return s;
  const out: Drawn = { id: s.id, points: differences(s.coords.map(([lon, lat]) => [Math.round(lon * CENTI), Math.round(lat * CENTI)])) };
  if (unit === 10) out.tenths = 1;
  return { ...out, ...storedDistances(s.dist, s.coords, unit) };
}

/** The centreline, smoothed copy or curve a Drawn stores. */
function decodeDrawn(s: Drawn): Shape {
  const coords = points(s.points, CENTI);
  return { id: s.id, coords, dist: readDistances(s, coords, s.tenths ? 10 : 1) };
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

/**
 * The traced shapes the pieces make. A piece's points are one array of `[lon, lat]` for every shape that
 * runs it, so the shapes share their points as they share the track: nothing may change a point in place,
 * as nothing of the map's or the engine's does.
 */
function decodeTraced({ pieces, levels: names, shapes }: Traced): Shape[] {
  const runs = pieces.map((p) => points(p, MICRO));
  return shapes.map((s): Shape => {
    if (!('pieces' in s)) return s;
    const coords: Point[] = [];
    for (const ref of s.pieces) {
      const run = runs[Math.abs(ref) - 1] ?? [];
      const along = ref < 0 ? run.toReversed() : run;
      // Where a piece comes on after another, its first point is the one before's last.
      for (const p of coords.length ? along.slice(1) : along) coords.push(p);
    }
    const dist = readDistances(s, coords, 1);
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
