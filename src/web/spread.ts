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

/** A Train the map draws as a pill, where it's drawn before spreading() moves it aside. */
export interface Drawn {
  id: string;
  /** Where it's drawn on screen, in px, x right and y down. */
  at: [x: number, y: number];
  /** Which way it heads on screen, in degrees clockwise from up. */
  heading: number;
  /** How far its pill reaches either side of it and above and below it, in px, with its edge. */
  box: [number, number];
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
 * were moved, as often as the map draws them, the moment, in ms, and the group spread, if any, how
 * far further right of where it's drawn to draw each one it moves (apart()), in px, easing. Those it
 * moved that are no longer spread, as once the group's folded or they leave, ease back.
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
 * group's pills moved already. Others, as one coming in after the tap, aren't moved, nor moved round,
 * so that nothing moves of itself.
 */
function apart(drawn: Drawn[], group: Group): Map<string, number> {
  const [target, placed] = [new Map<string, number>(), [] as Drawn[]];
  for (const t of held(drawn, group)) {
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
 * Station, and of a counted pile a tap spread (#828), each whose pill touches another of the group's where
 * they'd be drawn unspread, as Trains moving together do. Others, as one that leaves, ease back onto
 * their tracks, and once fewer than two are held, the group ends.
 */
export function held(drawn: Drawn[], { station, ids, pile }: Group): Drawn[] {
  const of = [...ids].flatMap((id) => drawn.find((t) => t.id === id) ?? []);
  return of.filter((t) => (station !== undefined && t.standsAt === station) || (pile && of.some((o) => o !== t && touches(t, o))));
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

/** A Train's pill as piles() takes it: where it's drawn, how far its pill reaches with its edge, and its name, either side of it and above and below it, in px. */
export interface Named extends Pick<Drawn, 'id' | 'at' | 'box'> {
  name: [number, number];
}

/**
 * The piles of Trains' pills where they're drawn, each by its top pill's ID: the IDs of the pills folded into it, which aren't
 * drawn, and which it counts (#828). MapLibre draws a layer's names after all its pills, so a pill's name would lie on a pill
 * drawn over it (#513). Walked topmost first, as MapLibre draws them, a pill folds into the topmost pill drawn over it whose
 * box meets its name, and is otherwise drawn: so no pill drawn has its name under another, one that only grazes another's
 * outline, clear of its name, keeps it (the maintainer's pick, 19 Oct 2026), and one under a folded pill isn't folded by it.
 * Drawn over another is the one lower on screen, and of two level the earlier in `drawn`, as MapLibre draws a layer's symbols
 * that may overlap (symbol-z-order `auto`, by its anchor's y), and the followed Train's over them all, in its own layer. It
 * never folds, nor do those `kept`, as a spread pile's (held()): one of those under a pill that meets its name is drawn, its
 * name over that pill, rather than hide what it was spread to show, and a pill it's drawn over folds into it as into any.
 * ponytail: MapLibre ranks by y rounded to its tile's units (1/16 px at the tile's zoom), so two pills a hair off level may
 * be ranked the other way. Round `at` to those units if a name is seen over a pill there.
 * A top pill's count, reaching `countBox` px either side of its box's top right corner and above and below it, lies past its
 * box over every pill but the followed Train's, so one drawn whose name a count meets folds into its pile too, with any pile
 * of its own: at 21 Oct 2026's peak, 9–18 drawn pills' names in Barcelona at zoom 12 lay under a count (#828's review).
 * ponytail: a pile folded so takes its own with it, though some of those may then lie clear of anything drawn: 2–12 at
 * Barcelona's zoom 12 at that peak. Walk them again if that shows.
 * ponytail: a count's reach as of one digit, so a "+10" a few px wider can lie on the edge of a name. Widen it by its digits
 * if that shows.
 * Swept by x, so that only pills near each other across the screen are compared.
 */
export function piles(drawn: Named[], followed?: string, kept?: ReadonlySet<string>, countBox?: [number, number]): Map<string, string[]> {
  // The followed Train's first, in a layer of its own over every pill.
  const first = (pill: Named) => (pill.id === followed ? 0 : 1);
  const walk = drawn
    .map((pill, order) => ({ pill, order }))
    .sort((a, b) => first(a.pill) - first(b.pill) || b.pill.at[1] - a.pill.at[1] || a.order - b.order)
    .map(({ pill }) => pill);
  // Each pill's name, and its count, were it counted: at its box's top right corner.
  const names = walk.map(({ at, name }) => ({ at, box: name }));
  const counts = countBox && walk.map(({ at: [x, y], box: [width, height] }) => ({ at: [x + width, y - height] as [number, number], box: countBox }));
  // For each pill, by its place in the walk, the places of those over it whose boxes meet its name, and of those whose counts
  // would meet it, comparing those whose boxes, or counts, are within reach across the screen.
  const [meets, counted, reach] = [walk.map(() => [] as number[]), walk.map(() => [] as number[]), countBox?.[0] ?? 0];
  const byLeft = walk
    .map((pill, rank) => ({ pill, rank, left: pill.at[0] - Math.max(pill.box[0], reach - pill.box[0]), right: pill.at[0] + pill.box[0] + reach }))
    .sort((a, b) => a.left - b.left);
  byLeft.forEach((one, i) => {
    for (let j = i + 1; j < byLeft.length && byLeft[j]!.left < one.right; j++) {
      const other = byLeft[j]!;
      const [top, bottom] = one.rank < other.rank ? [one, other] : [other, one];
      if (touches(top.pill, names[bottom.rank]!)) meets[bottom.rank]!.push(top.rank);
      if (!counts) continue;
      if (touches(counts[one.rank]!, names[other.rank]!)) counted[other.rank]!.push(one.rank);
      if (touches(counts[other.rank]!, names[one.rank]!)) counted[one.rank]!.push(other.rank);
    }
  });
  // Each folds into the topmost of those still drawn, if any.
  const [folded, out] = [new Set<number>(), new Map<string, string[]>()];
  walk.forEach((pill, rank) => {
    if (pill.id === followed || kept?.has(pill.id)) return;
    const top = Math.min(...meets[rank]!.filter((r) => !folded.has(r)));
    if (top === Infinity) return;
    folded.add(rank);
    const id = walk[top]!.id;
    out.set(id, [...(out.get(id) ?? []), pill.id]);
  });
  // A count is drawn over every pill but the followed Train's, so one drawn whose name a count meets folds into its pile too.
  walk.forEach((pill, rank) => {
    if (pill.id === followed || kept?.has(pill.id) || folded.has(rank)) return;
    const top = Math.min(...counted[rank]!.filter((r) => out.has(walk[r]!.id)));
    if (top === Infinity) return;
    folded.add(rank);
    const id = walk[top]!.id;
    out.set(id, [...out.get(id)!, pill.id, ...(out.get(pill.id) ?? [])]);
    out.delete(pill.id);
  });
  return out;
}

/** Whether two Trains' pills overlap, where they're drawn. */
function touches({ at: [ax, ay], box: [aw, ah] }: Pick<Drawn, 'at' | 'box'>, { at: [bx, by], box: [bw, bh] }: Pick<Drawn, 'at' | 'box'>): boolean {
  return Math.abs(ax - bx) < aw + bw && Math.abs(ay - by) < ah + bh;
}
