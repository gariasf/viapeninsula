// Trains standing together at a Station drawn side by side across their track, as on platforms,
// once the viewer taps their pills, which cover each other (#129).
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

/** Trains a tap spread: the Station they stood at, and which, by their IDs, the tapped one first. */
export interface Group {
  station: string;
  ids: Set<string>;
}

/**
 * The group a tap on a Train's pill spreads: it and each Train standing at its Station whose pill
 * touches its, or touches one of those, where they're drawn. None where it touches no other there.
 */
export function groupOf(drawn: Drawn[], id: string): Group | undefined {
  const tapped = drawn.find((t) => t.id === id);
  if (!tapped?.standsAt) return undefined;
  const there = drawn.filter((t) => t.standsAt === tapped.standsAt);
  const group = [tapped];
  for (const t of group) for (const o of there) if (!group.includes(o) && touches(t, o)) group.push(o);
  return group.length > 1 ? { station: tapped.standsAt, ids: new Set(group.map((t) => t.id)) } : undefined;
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
 * How far further right of where it's drawn to draw each Train of a group still standing at its
 * Station, in px: in the group's order, each as near its own track as it goes, its pill's edge there,
 * clear of the group's pills moved already. Others, as one coming in after the tap, aren't moved, nor
 * moved round, so that nothing moves of itself.
 */
function apart(drawn: Drawn[], { station, ids }: Group): Map<string, number> {
  const there = [...ids].flatMap((id) => drawn.find((t) => t.id === id && t.standsAt === station) ?? []);
  const [target, placed] = [new Map<string, number>(), [] as Drawn[]];
  for (const t of there) {
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

/** A Train's pill as covered() checks it: where it's drawn, how far its pill reaches with its edge, and its name, either side of it and above and below it, in px. */
export interface Named extends Pick<Drawn, 'id' | 'at' | 'box'> {
  name: [number, number];
}

/**
 * The Trains whose names a pill drawn over them meets, where they're drawn, by their IDs: MapLibre draws
 * a layer's names after all its pills, so a covered pill's name would lie on the pill over it (#513). A
 * pill that only grazes another's outline, clear of its name, leaves the name (the maintainer's pick,
 * 19 Oct 2026). Drawn over another is the one lower on screen, and of two level the earlier in `drawn`,
 * as MapLibre draws a layer's symbols that may overlap (symbol-z-order `auto`, by its anchor's y), and the
 * followed Train's over them all, in its own layer.
 * ponytail: MapLibre ranks by y rounded to its tile's units (1/16 px at the tile's zoom), so two pills a
 * hair off level may be ranked the other way. Round `at` to those units if a name is seen over a pill there.
 * Swept by x, so that only pills near each other across the screen are compared.
 */
export function covered(drawn: Named[], followed?: string): Set<string> {
  const ranked = drawn.map((pill, order) => ({ pill, order, left: pill.at[0] - pill.box[0] })).sort((a, b) => a.left - b.left);
  const over = (a: (typeof ranked)[number], b: (typeof ranked)[number]) =>
    b.pill.id !== followed && (a.pill.id === followed || a.pill.at[1] > b.pill.at[1] || (a.pill.at[1] === b.pill.at[1] && a.order < b.order));
  const under = new Set<string>();
  ranked.forEach((one, i) => {
    for (const other of ranked.slice(i + 1)) {
      if (other.left >= one.pill.at[0] + one.pill.box[0]) break;
      const [top, bottom] = over(one, other) ? [one, other] : [other, one];
      if (touches(top.pill, { at: bottom.pill.at, box: bottom.pill.name })) under.add(bottom.pill.id);
    }
  });
  return under;
}

/** Whether two Trains' pills overlap, where they're drawn. */
function touches({ at: [ax, ay], box: [aw, ah] }: Pick<Drawn, 'at' | 'box'>, { at: [bx, by], box: [bw, bh] }: Pick<Drawn, 'at' | 'box'>): boolean {
  return Math.abs(ax - bx) < aw + bw && Math.abs(ay - by) < ah + bh;
}
