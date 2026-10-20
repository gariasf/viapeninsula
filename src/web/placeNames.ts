// Where each place's name goes at each zoom, worked out off the page's main thread (#777): main.ts's putNames() and
// showNames() put each place's name beside its track and lay it out here, in a worker of their own (namesWorker.ts),
// or on the page where a track's regions can't be handed over (splitBy()). The worker is handed each region's track
// file once, as long as the map keeps it, its numbers as one typed array moved rather than copied (packFile()), and
// reads it as the page does (decodeTrack()), and the page gets back only each name's anchor and offset at each zoom.
import { APART, atZoom, EARTH, STRETCH, WIDTH, type Point, type Track } from '../bundle.ts';
import { decodeTrack, type StoredTrack } from '../pieces.ts';
import { dotCost, nameOffset, nameReach, nearestSide, sidesByJoin, underName, type Side, type Spot } from './names.ts';

/**
 * main.ts's sizes a name clears, in px at each zoom: a dot in neither tier and its ring, a pill's halo and the gap a
 * name keeps, the zooms names are laid out at, how much larger the top tier's dots are, and its marks' size from the
 * zoom they're drawn from.
 */
export interface Sizes {
  dot: [zoom: number, px: number][];
  ring: [zoom: number, px: number][];
  pillHalo: number;
  nameGap: number;
  nameZooms: number[];
  top: number;
  signSize: [zoom: number, size: number][];
  signZoom: number;
}

/**
 * A place's name, as putNames() has it: its place's ID, its dot, the Networks it serves, how wide and high its name is,
 * in px, the zoom it shows from, how much larger its dot is, its marks' width, and its type's size, in px.
 */
export interface NamePlace {
  id: string;
  dot: Point;
  served: string[];
  size: [width: number, height: number];
  nameZoom: number;
  larger: number;
  marks: number;
  type: number;
}

/** A Line's Trains' pill, as clearance() reads it: the zoom they're pills from, and how far one reaches either side and above and below, in px. */
export interface PillBox {
  zoom: number;
  box: [number, number];
}

/** Where a name goes: its anchor and its offset, in ems, at each of the zooms names are laid out at, as MapLibre reads them. */
export type Where = Record<string, unknown>;

/** A px's metres on the equator at a zoom. */
const pixelMetres = (zoom: number) => (2 * Math.PI * EARTH) / (512 * 2 ** zoom);

/**
 * Places' names put beside their tracks a join at a time (put()), and laid out as the map's bearing and the Trains'
 * pills are (lay()): main.ts's putNames() and showNames() before #777.
 */
export function namePlacer(c: Sizes) {
  /** Each place's sides of its track, worked out again at a join only where it can move them (sidesByJoin(), #733). */
  const placeSides = sidesByJoin();
  let names: (NamePlace & { sides: (bearing: number) => Side[] })[] = [];
  /** Where `names` were last laid out, for the pills clearance() read and the bearing it was at. */
  let laidOut: { names: typeof names; pills: Map<string, PillBox>; bearing: number; where: Where[] } | undefined;
  /**
   * How far out from its dot a place's name goes at a zoom, in px: NAME_GAP clear of the dot, `larger`
   * px larger than the smallest, and of each Train drawn along its tracks there, as a pill, or below its
   * Line's pill zoom a dot about as large as the place's, beside its Line's stroke zoomed out; or, for
   * a Line the spot marks `stroke`, of its stroke. MapLibre lays names out at whole zooms, so it's as far out as the map needs until the
   * next, where the Lines are drawn furthest apart and dots largest.
   * ponytail: clear of every Train but the followed one, which is drawn larger. Take in its pill too if
   * the names it covers show.
   */
  const clearance = (pills: Map<string, PillBox>, { from: [, lat], normal: [x, y], dot: dotBehind, lines: drawn }: Spot, larger: number, zoom: number): number => {
    const metresPerPx = pixelMetres(zoom) * Math.cos((lat * Math.PI) / 180);
    const dot = atZoom(c.dot, zoom + 1) + larger + atZoom(c.ring, zoom + 1);
    const apart = Math.max(atZoom(APART, zoom), atZoom(APART, zoom + 1));
    const reaches = drawn.map(({ line, toward, behind, stroke }) => {
      const pill = pills.get(line);
      const across = stroke ? atZoom(WIDTH, zoom + 1) / 2 : pill && zoom >= pill.zoom ? pill.box[0] * Math.abs(x) + pill.box[1] * Math.abs(y) + c.pillHalo : dot;
      return toward * apart + across - behind / metresPerPx;
    });
    return Math.max(dot - dotBehind / metresPerPx, ...reaches) + c.nameGap + dotBehind / metresPerPx;
  };
  /**
   * How much larger than a dot in neither tier a place is drawn at a zoom, in px, for its name to clear it (#572): as
   * MapLibre lays names out at whole zooms, as far as at the next, from SIGN_ZOOM its marks half as wide as they are, and
   * below it, the top tier's square, reaching a fifth further than its dot, and its corners a little more.
   */
  const drawnLarger = (larger: number, marks: number, zoom: number): number => {
    const next = zoom + 1;
    if (next >= c.signZoom) return Math.max(larger, (atZoom(c.signSize, next) * marks) / 2 - atZoom(c.dot, next));
    return larger === c.top ? larger + 0.4 * (atZoom(c.dot, next) + 2 + atZoom(c.ring, next)) : larger;
  };
  return {
    /**
     * Puts each place's name beside its own Networks' track, for a track joined from regions' (`tracks`, in its order),
     * or one track, `fresh` where its regions' IDs aren't their own (splitBy()), with the side each Line's Trains keep to.
     */
    put(tracks: Pick<Track, 'shapes' | 'slots' | 'lines'>[], fresh: boolean, keep: Map<string, number>, places: NamePlace[]): void {
      // Names go beside the track, not the stretches' centrelines, clear of the Trains on their Lines' strokes along those,
      // and of the other places' dots (#501).
      const centrelines = new Map(tracks.flatMap((t) => t.shapes.flatMap((s) => (s.id.startsWith(STRETCH) ? [[s.id, s] as const] : []))));
      const slots = tracks.flatMap((t) => t.slots ?? []).filter((s) => s.band === undefined);
      // A track built before #243 names no Station's Networks: its names go beside the nearest track of any. Each name
      // reaches furthest at the zoom it shows from, where the dots under it are looked for (#714).
      const where = places.map(({ id, dot, served, size, nameZoom }) => ({ id, dot, served, reach: nameReach(size, pixelMetres(nameZoom) * Math.cos((dot[1] * Math.PI) / 180)) }));
      const sides = placeSides(tracks, slots, (line) => keep.get(line) ?? 1, tracks.flatMap((t) => t.lines), centrelines, where, fresh);
      names = places.map((p, i) => ({ ...p, sides: sides[i] ?? (() => []) }));
    },
    /**
     * Where each name goes (Where), in the order put() had them: beside its own Networks' track (alongside(), sidesByJoin())
     * as the track lies on screen at the map's `bearing`, at each of the zooms on the side nearestSide() takes, as far out
     * from its dot as clearance() says, and off any track crossing its own there and any other place's dot (underName()).
     * ponytail: tries a name under a crossing track, or by another place's dot, at the zoom and the next, not
     * in between, and as far out at the next as at this one. Try more steps if a name lies across one mid-zoom.
     * ponytail: laid out flat, so on a tilted map a name sits a little nearer its track or further than
     * NAME_GAP. Work each normal out on screen with map.project() if that shows.
     */
    lay(pills: Map<string, PillBox>, bearing: number): Where[] {
      // A name whose sides, size, zoom, dot size and type size are as they were, at the bearing it was laid out at, goes where it went,
      // unless a Train's pill it clears changed (clearance()): at a join, those whose sides it can't move (sidesByJoin(), #733).
      const was = laidOut;
      const pillsAsWere = was !== undefined && was.bearing === bearing && [...pills].every(([line, p]) => samePill(was.pills.get(line), p));
      const before = new Map(pillsAsWere ? was.names.map((n, i) => [n.sides, { n, where: was.where[i] }]) : []);
      const where = names.map(({ dot, sides, size, nameZoom, larger, marks, type }) => {
        const had = before.get(sides);
        if (had?.where && had.n.size[0] === size[0] && had.n.size[1] === size[1] && had.n.nameZoom === nameZoom && had.n.larger === larger && had.n.marks === marks && had.n.type === type) return had.where;
        const at = sides(bearing);
        const properties = c.nameZooms.flatMap((zoom) => {
          // MapLibre lays names out at whole zooms, so a track crossing its own lies under one from this zoom to the next, at half the metres a px.
          const metresPerPx = pixelMetres(zoom) * Math.cos((dot[1] * Math.PI) / 180);
          // The Lines whose strokes lie under a name, or within `gap` px of it, at this zoom's Lines' spacing and width and the next's,
          // and what the dots near it cost.
          const underStep = (s: Spot, far: number, gap: number, step: number) => underName(s, far, size, metresPerPx / 2 ** step, atZoom(APART, zoom + step), gap + atZoom(WIDTH, zoom + step) / 2);
          const underAt = (s: Spot, far: number, gap: number) => underStep(s, far, gap, 0) + underStep(s, far, gap, 1);
          // Below the zoom it shows from, no name lies anywhere; from it, fewest under it first, with a place's dot near it
          // costing it Lines (DOT_COST), then fewest within NAME_GAP. Counted no further once it's `below` or more, where
          // it's only whether a slid name is under less than unslid (nearestSide(), #713).
          const under = (s: Spot, far: number, below = Infinity) => {
            if (zoom < nameZoom) return 0;
            const first = underStep(s, far, 0, 0);
            if (1000 * first >= below) return 1000 * first;
            const close = 1000 * (first + underStep(s, far, 0, 1));
            return close >= below ? close : close + underAt(s, far, c.nameGap);
          };
          // Slid along its track only where another place's dot costs a side (#713).
          const { spot, far } = nearestSide(at, (s) => clearance(pills, s, drawnLarger(larger, marks, zoom), zoom), under, (s, far) => dotCost(s, far, size, metresPerPx) > 0);
          // MapLibre offsets names in ems, and anchors one slid along its track by a corner (#713).
          return [
            [`anchor${zoom}`, spot.slid ?? spot.anchor],
            [`offset${zoom}`, nameOffset(spot, far, size).map((px) => px / type)],
          ];
        });
        return Object.fromEntries(properties);
      });
      laidOut = { names, pills, bearing, where };
      return where;
    },
  };
}

/** Whether a Line's Trains' pill is as large, and from the same zoom, as it was, or it had none: where a name clears it, it goes where it went (clearance()). */
function samePill(was: PillBox | undefined, pill: PillBox): boolean {
  return !was || (was.zoom === pill.zoom && was.box[0] === pill.box[0] && was.box[1] === pill.box[1]);
}

/** What of a region's track file the names need, its arrays of numbers taken out (`rest`), and those, one after another, as one array. */
export interface Packed {
  rest: unknown;
  numbers: Float64Array;
  lengths: Int32Array;
}

/**
 * What of a region's track file a worker needs, `parts`, by default the names' (its shapes, slots and Lines), with each of its arrays of numbers, the
 * pieces' points, the shapes' distances and the slots' chains, put one after another in `numbers`, for postMessage() to
 * move rather than copy: a structured clone of a track's points would cost what MapLibre's of the Lines does (#775).
 */
export function packFile(file: StoredTrack, parts: (keyof StoredTrack)[] = ['traced', 'chains', 'shapes', 'slots', 'lines']): Packed {
  const lists: number[][] = [];
  // Each array of numbers, and an empty one, as an empty one, in the order unpackFile() comes on them.
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      if (!v.every((x) => typeof x === 'number')) return v.map(strip);
      lists.push(v);
      return [];
    }
    return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)])) : v;
  };
  const rest = strip(Object.fromEntries(parts.map((part) => [part, file[part]])));
  const lengths = Int32Array.from(lists, (l) => l.length);
  const numbers = new Float64Array(lengths.reduce((sum, n) => sum + n, 0));
  let at = 0;
  for (const l of lists) {
    numbers.set(l, at);
    at += l.length;
  }
  return { rest, numbers, lengths };
}

/** The track a file packed (packFile()) stores, as decodeTrack() reads it, with only the parts packed. */
export function unpackFile<K extends keyof Track = 'shapes' | 'slots' | 'lines'>({ rest, numbers, lengths }: Packed): Pick<Track, K> {
  let [i, at] = [0, 0];
  const fill = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      if (v.length) return v.map(fill);
      const n = lengths[i++] ?? 0;
      at += n;
      return Array.from(numbers.subarray(at - n, at));
    }
    return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x)])) : v;
  };
  return decodeTrack(fill(rest) as StoredTrack);
}

/** What the page asks of the worker: the sizes names clear, first; at each join, the regions' tracks, by their keys, and the places' names; and their layout, which it answers with the ask's number. */
export type NamesAsk =
  | { sizes: Sizes }
  | { put: { regions: { key: number; file?: Packed }[]; keep: [line: string, side: number][]; places: NamePlace[] } }
  | { lay: { pills: [line: string, pill: PillBox][]; bearing: number; ask?: number } };

/**
 * What the worker does with what the page asks (NamesAsk): keeps the regions' tracks it's handed, by their keys, for as
 * long as the next join names them, puts the names beside them, and answers a layout with where each goes.
 */
export function nameWork() {
  /** The names, once the sizes they clear have come. */
  let placer: ReturnType<typeof namePlacer> | undefined;
  /** The regions' tracks, by their keys, in the last join's order. */
  let held = new Map<number, Pick<Track, 'shapes' | 'slots' | 'lines'>>();
  return (ask: NamesAsk): { ask?: number; where: Where[] } | undefined => {
    if ('sizes' in ask) placer = namePlacer(ask.sizes);
    else if ('put' in ask) {
      const { regions, keep, places } = ask.put;
      held = new Map(
        regions.map(({ key, file }) => {
          const track = file ? unpackFile(file) : held.get(key);
          if (!track) throw new Error(`No region's track by key ${key}`);
          return [key, track];
        }),
      );
      placer?.put([...held.values()], false, new Map(keep), places);
    } else return { ask: ask.lay.ask, where: placer?.lay(new Map(ask.lay.pills), ask.lay.bearing) ?? [] };
    return undefined;
  };
}
