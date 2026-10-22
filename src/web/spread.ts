// Trains standing together at a Station drawn side by side across their track, as on platforms,
// once the viewer taps their pills, which cover each other (#129). Pills that would lie on each other's
// names drawn as a pile, its top pill with a count, spread so by a tap on it, moving too (#828).
import { rightOf } from './names.ts';

/**
 * How quickly a Train eases aside and back, in ms: about two thirds of the rest of the way in each EASE
 * the map draws it, and in any one drawing no further than it would in STEP, so that however seldom
 * the map draws Trains, it takes several drawings.
 */
const [EASE, STEP] = [100, 40];

/** A Train's pill: where it's drawn, how far its pill reaches with its edge, and its name, either side of it and above and below it, in px. */
export interface Named {
  id: string;
  /** Where it's drawn on screen, in px, x right and y down. */
  at: [x: number, y: number];
  box: [number, number];
  name: [number, number];
}

/** A Train the map draws as a pill, where it's drawn before spreading() moves it aside. */
export interface Drawn extends Named {
  /** Which way it heads on screen, in degrees clockwise from up. */
  heading: number;
  /** The Station it stands at, while it stands at one. */
  standsAt?: string;
}

/**
 * Trains a tap spread: the Station they stood at, if the tapped one stood at one, and which, by their IDs, the tapped one
 * first; and whether it's the pile a tap on a counted pill spread (#828), whose Trains may be moving.
 */
export interface Group {
  station?: string;
  ids: Set<string>;
  pile?: true;
}

/**
 * The group a tap on a Train's pill spreads: it and each Train standing at its Station whose pill
 * touches its, or touches one of those, where they're drawn. None where it touches no other there.
 * A counted pill's pile spreads whole (#828): it, the Trains `folded` into it, moving or standing, and
 * those standing at its Station whose pills touch theirs, as above.
 */
export function groupOf(drawn: Drawn[], id: string, folded: string[] = []): Group | undefined {
  const tapped = drawn.find((t) => t.id === id);
  if (!tapped || (!tapped.standsAt && !folded.length)) return undefined;
  const there = drawn.filter((t) => tapped.standsAt && t.standsAt === tapped.standsAt);
  const group = [tapped, ...folded.flatMap((f) => drawn.find((t) => t.id === f) ?? [])];
  for (const t of group) for (const o of there) if (!group.includes(o) && touches(t, o)) group.push(o);
  if (group.length < 2) return undefined;
  const ids = new Set(group.map((t) => t.id));
  return folded.length ? { station: tapped.standsAt, ids, pile: true } : { station: tapped.standsAt, ids };
}

/**
 * What moves a tapped group of Trains apart: given the Trains drawn as pills that are in the group or
 * were moved, and those drawn near it, as often as the map draws them, the moment, in ms, and the group
 * spread, if any, how far further right of where it's drawn to draw each one it moves (apart()), in px,
 * easing. Those it moved that are no longer spread, as once the group's folded or they leave, ease back.
 */
export function spreading(): (drawn: Drawn[], now: number, group?: Group) => Map<string, number> {
  let [was, last] = [new Map<string, number>(), undefined as number | undefined];
  return (drawn, now, group) => {
    const eased = 1 - Math.exp(-Math.min(now - (last ?? now), STEP) / EASE);
    const target = group ? apart(drawn, group) : new Map<string, number>();
    const moved = new Map<string, number>();
    for (const t of drawn) {
      const [from, to] = [was.get(t.id) ?? 0, target.get(t.id) ?? 0];
      const at = Math.abs(to - from) < 0.1 ? to : from + (to - from) * eased;
      if (at) moved.set(t.id, at);
    }
    [was, last] = [moved, now];
    return moved;
  };
}

/**
 * How far further right of where it's drawn to draw each Train of a group held apart (held()), in
 * px: in the group's order, each as near its own track as it goes, its pill's edge there, clear of the
 * group's pills moved already and of the others drawn, where they're drawn. Those others, as one coming
 * in after the tap, aren't moved, but rather than land on one, as on its name, which would fold it into
 * the group's pill (piles()), the group's goes past it (#828).
 */
function apart(drawn: Drawn[], group: Group): Map<string, number> {
  const holding = held(drawn, group);
  const [target, placed] = [new Map<string, number>(), drawn.filter((t) => !holding.includes(t))];
  for (const t of holding) {
    const right = rightOf(t.heading, 0);
    let out = toEdge(t.box, t.heading + 90);
    for (let past = true; past; ) {
      past = false;
      for (const o of placed) {
        const clear = clearOf(t, right, out, o);
        if (clear > out) [out, past] = [clear, true];
      }
    }
    placed.push({ ...t, at: [t.at[0] + out * right[0], t.at[1] + out * right[1]] });
    target.set(t.id, out);
  }
  return target;
}

/**
 * Of a spread group's Trains drawn as pills, in its order, those it holds apart: each standing at its
 * Station, and of a counted pile a tap spread (#828), each, moving or not, while it lasts (lasts()).
 * Others, as one that leaves a group with no count, ease back onto their tracks.
 */
export function held(drawn: Drawn[], { station, ids, pile }: Group): Drawn[] {
  const of = [...ids].flatMap((id) => drawn.find((t) => t.id === id) ?? []);
  return pile ? of : of.filter((t) => station !== undefined && t.standsAt === station);
}

/**
 * Whether a spread group lasts: while two or more of its Trains are held apart (held()), drawn as pills, and of a counted
 * pile (#828), while two or more stand at its Station, as a tapped group does zoomed in (#129), or, where they'd be drawn
 * unspread, one of them would fold into another (piles()), as when its pile was drawn. Its count, which folds only into a pile
 * already, can't change that. So a moving pile ends once its Trains part, as one with no count once its Trains leave.
 */
export function lasts(drawn: Drawn[], group: Group, followed?: string): boolean {
  const of = held(drawn, group);
  return of.length > 1 && (!group.pile || of.filter((t) => group.station !== undefined && t.standsAt === group.station).length > 1 || piles(of, followed).size > 0);
}

/** A spread group with a tapped pile of one of its Trains' added (#828): those spread already first, keeping their places. */
export function joined(group: Group, more: Group): Group {
  return { station: group.station ?? more.station, ids: new Set([...group.ids, ...more.ids]), pile: true };
}

/**
 * How far right of where it's drawn a Train's pill `out` px right of it has to go, in px, to clear
 * another's: as far as it is, where it doesn't cover it, and otherwise past it.
 */
function clearOf({ at: [x, y], box: [width, height] }: Drawn, [rx, ry]: [number, number], out: number, other: Drawn): number {
  // How far right it covers the other: from `from` to `to`, where it's within reach of it both across and up and down the screen.
  let [from, to] = [-Infinity, Infinity];
  for (const [off, way, reach] of [
    [x - other.at[0], rx, width + other.box[0]],
    [y - other.at[1], ry, height + other.box[1]],
  ] as const) {
    if (!way) {
      if (Math.abs(off) >= reach) return out;
      continue;
    }
    const [a, b] = [(-reach - off) / way, (reach - off) / way];
    [from, to] = [Math.max(from, Math.min(a, b)), Math.min(to, Math.max(a, b))];
  }
  return from < out && out < to ? to : out;
}

/**
 * How far from its middle a pill reaching `box` px either side of it and above and below reaches the
 * way `angle` degrees clockwise from up, in px: to its box's edge, as far as a pill beside it goes, or
 * a Train's arrow (reach()).
 * ponytail: to the box, so the way off the level by a pointed or rounded end a pill reaches a few px
 * further than its outline does, and the arrow or pill beside it sits that much further out. Aim at the
 * outline itself if that shows.
 */
export function toEdge([halfWidth, halfHeight]: [number, number], angle: number): number {
  const a = (angle * Math.PI) / 180;
  return Math.min(halfWidth / Math.abs(Math.sin(a)), halfHeight / Math.abs(Math.cos(a)));
}

/** A pile of Trains' pills drawn as its top pill: the IDs of those folded into it, which aren't drawn and which its count counts, and the corner of its top pill's box its count is at, right (1) or left (-1) and down (1) or up (-1). */
export interface Pile {
  folded: string[];
  corner: [number, number];
}

/** A count's corners, as it tries them: top right, top left, bottom right and bottom left. */
const CORNERS: [number, number][] = [
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
];

/**
 * The piles of Trains' pills where they're drawn, by their top pills' IDs (#828). MapLibre draws a layer's names after all its
 * pills, so a pill's name would lie on a pill drawn over it (#513). Walked topmost first, as MapLibre draws them, a pill folds
 * into the topmost pill drawn over it whose box meets its name, and is otherwise drawn: so no pill drawn has its name under
 * another, one that only grazes another's outline, clear of its name, keeps it (the maintainer's pick, 19 Oct 2026), and one
 * under a folded pill isn't folded by it. Drawn over another is the one lower on screen, and of two level the earlier in
 * `drawn`, as MapLibre draws a layer's symbols that may overlap (symbol-z-order `auto`, by its anchor's y), and the followed
 * Train's over them all, in its own layer. It never folds, nor do those `kept`, as a spread pile's (held()): one of those under
 * a pill that meets its name is drawn, its name over that pill, rather than hide what it was spread to show, and a pill it's
 * drawn over folds into it as into any.
 * ponytail: MapLibre ranks by y rounded to its tile's units (1/16 px at the tile's zoom), so two pills a hair off level may
 * be ranked the other way. Round `at` to those units if a name is seen over a pill there.
 * A top pill's count, reaching `countBox` px either side of a corner of its box and above and below it, is drawn over every
 * pill but the followed Train's: at the first corner where it lies on no drawn pill's name, nor under the followed Train's
 * pill, and where it would at all four, at the top right, the pills whose names it lies on folding into its pile, each with
 * any pile of its own. At 21 Oct 2026's peak, a count at the top right lay on 9–18 drawn pills' names in Barcelona at zoom 12
 * (#828's review), and folding those all folded 2–12 Trains with nothing drawn on their names; at the first free corner,
 * counts fold 0–2 there, and 0–1 so.
 * ponytail: clear of the pills' names, but not of the Stations' names, which the counts are drawn over, as where those are is
 * laid out apart (namePlacer()) rather than on the page each frame, nor of other counts. Weigh them in if a count is seen to
 * hide one.
 * ponytail: a count's reach as of one digit, so a "+10" a few px wider can lie on the edge of a name. Widen it by its digits
 * if that shows.
 * Swept by x, so that only pills near each other across the screen are compared.
 */
export function piles(drawn: Named[], followed?: string, kept?: ReadonlySet<string>, countBox?: [number, number]): Map<string, Pile> {
  // The followed Train's first, in a layer of its own over every pill.
  const first = (pill: Named) => (pill.id === followed ? 0 : 1);
  const walk = drawn
    .map((_, order) => order)
    .sort((a, b) => first(drawn[a]!) - first(drawn[b]!) || drawn[b]!.at[1] - drawn[a]!.at[1] || a - b)
    .map((order) => drawn[order]!);
  // For each pill, by its place in the walk, the places of those over it whose boxes meet its name; and, were it counted, the
  // places of those its count would lie on, with at which corners, as bits, comparing those within reach across the screen.
  // Each list made only for a pill with something in it, as most have nothing, so as to leave the less garbage each frame.
  const [meets, lies, [countWidth, countHeight]] = [[] as number[][], [] as [number, number][][], countBox ?? [0, 0]];
  const left = (rank: number) => walk[rank]!.at[0] - walk[rank]!.box[0] - countWidth;
  const byLeft = walk.map((_, rank) => rank).sort((a, b) => left(a) - left(b));
  // Where the count of the pill at `a` would lie on the name of the one at `b`, or under the followed Train's pill, which is drawn over it.
  const lie = (a: number, b: number) => {
    const [pill, other] = [walk[a]!, walk[b]!];
    const [width, height] = other.id === followed && pill.id !== followed ? other.box : other.name;
    let at = 0;
    for (let c = 0; c < CORNERS.length; c++) {
      const [x, y] = CORNERS[c]!;
      if (Math.abs(pill.at[0] + x * pill.box[0] - other.at[0]) < countWidth + width && Math.abs(pill.at[1] + y * pill.box[1] - other.at[1]) < countHeight + height) at |= 1 << c;
    }
    if (at) (lies[a] ??= []).push([b, at]);
  };
  byLeft.forEach((one, i) => {
    const right = walk[one]!.at[0] + walk[one]!.box[0] + countWidth;
    for (let j = i + 1; j < byLeft.length && left(byLeft[j]!) < right; j++) {
      const other = byLeft[j]!;
      const [top, bottom] = [Math.min(one, other), Math.max(one, other)];
      const [over, under] = [walk[top]!, walk[bottom]!];
      if (Math.abs(over.at[0] - under.at[0]) < over.box[0] + under.name[0] && Math.abs(over.at[1] - under.at[1]) < over.box[1] + under.name[1]) (meets[bottom] ??= []).push(top);
      // Not where they're further apart up and down the screen than a count reaches.
      if (!countBox || Math.abs(over.at[1] - under.at[1]) >= over.box[1] + under.box[1] + countHeight) continue;
      lie(one, other);
      lie(other, one);
    }
  });
  // Each folds into the topmost of those still drawn, if any.
  const [folded, out] = [new Set<number>(), new Map<string, Pile>()];
  walk.forEach((pill, rank) => {
    if (!meets[rank] || pill.id === followed || kept?.has(pill.id)) return;
    let top = Infinity;
    for (const r of meets[rank]) if (r < top && !folded.has(r)) top = r;
    if (top === Infinity) return;
    folded.add(rank);
    const id = walk[top]!.id;
    const pile = out.get(id);
    if (pile) pile.folded.push(pill.id);
    else out.set(id, { folded: [pill.id], corner: CORNERS[0]! });
  });
  // Each count, topmost first, at the first corner where it lies on nothing drawn, or at the top right, folding what it lies on.
  walk.forEach((pill, rank) => {
    const pile = out.get(pill.id);
    if (!pile || folded.has(rank)) return;
    const on = (lies[rank] ?? []).filter(([r]) => !folded.has(r));
    const free = CORNERS.findIndex((_, c) => on.every(([, at]) => !(at & (1 << c))));
    if (free >= 0) return void (pile.corner = CORNERS[free]!);
    for (const [r, at] of on) {
      const { id } = walk[r]!;
      if (!(at & 1) || id === followed || kept?.has(id)) continue;
      folded.add(r);
      pile.folded.push(id, ...(out.get(id)?.folded ?? []));
      out.delete(id);
    }
  });
  return out;
}

/** Whether two Trains' pills overlap, where they're drawn. */
function touches({ at: [ax, ay], box: [aw, ah] }: Pick<Drawn, 'at' | 'box'>, { at: [bx, by], box: [bw, bh] }: Pick<Drawn, 'at' | 'box'>): boolean {
  return Math.abs(ax - bx) < aw + bw && Math.abs(ay - by) < ah + bh;
}
