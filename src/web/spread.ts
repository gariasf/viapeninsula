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

/** Whether two Trains' pills overlap, where they're drawn. */
function touches({ at: [ax, ay], box: [aw, ah] }: Drawn, { at: [bx, by], box: [bw, bh] }: Drawn): boolean {
  return Math.abs(ax - bx) < aw + bw && Math.abs(ay - by) < ah + bh;
}
