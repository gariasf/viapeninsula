// Trains standing together at a Station drawn side by side across their track, as on platforms,
// where their pills would cover each other (#129).
import { parallel, rightOf } from './names.ts';

/**
 * How quickly a Train eases aside and back, in ms: about two thirds of the rest of the way in each EASE
 * the map draws it, and in any one drawing no further than it would in STEP, so that however seldom
 * the map draws Trains, as zoomed out, where they move slowest on screen, it takes several drawings.
 */
const [EASE, STEP] = [100, 40];
/**
 * How long the map remembers since when a Train it no longer draws as a pill has stood at its Station,
 * in ms, as while the viewer looks elsewhere or zooms out, so that drawn again, it keeps its place.
 */
const FORGET = 10 * 60_000;

/** A Train the map draws as a pill, where it's drawn before spreading() moves it aside. */
export interface Drawn {
  id: string;
  /** Where it's drawn on screen, in px, x right and y down, as the map lays it out flat. */
  at: [x: number, y: number];
  /** Which way it heads on screen, in degrees clockwise from up. */
  heading: number;
  /** How far right of its track it's drawn, in px, as beside its Line's stroke zoomed out. */
  aside: number;
  /** How far its pill reaches either side of it and above and below it, in px, with its edge. */
  box: [number, number];
  /** The Network it runs on, by its ID. */
  network: string;
  /** The Station it stands at, while it stands at one. */
  standsAt?: string;
  /** Whether it stays where it's drawn, as the followed Train does. */
  fixed: boolean;
}

/**
 * What moves Trains standing together at a Station apart: given the Trains drawn as pills, as often
 * as the map draws them, and the moment, in ms, how far further right of its track to draw each one
 * it moves (apart()), in px, easing.
 */
export function spreading(): (drawn: Drawn[], now: number) => Map<string, number> {
  /** Each Train as the map last drew it: the Station it stood at and since when, how far it was moved, and when it was drawn. */
  const was = new Map<string, { standsAt?: string; since: number; moved: number; drawn: number }>();
  let last: number | undefined;
  return (drawn, now) => {
    const eased = 1 - Math.exp(-Math.min(now - (last ?? now), STEP) / EASE);
    for (const [id, { drawn: at }] of was) if (now - at > FORGET) was.delete(id);
    const since = new Map(
      drawn.map((t) => {
        const before = was.get(t.id);
        return [t.id, t.standsAt && before?.standsAt === t.standsAt ? before.since : now];
      }),
    );
    const target = apart(drawn, since);
    const moved = new Map<string, number>();
    for (const t of drawn) {
      const before = was.get(t.id);
      // Drawn again after a while, it eases out from its track.
      const [from, to] = [before && before.drawn === last ? before.moved : 0, target.get(t.id) ?? 0];
      const at = Math.abs(to - from) < 0.1 ? to : from + (to - from) * eased;
      if (at) moved.set(t.id, at);
      was.set(t.id, { standsAt: t.standsAt, since: since.get(t.id) ?? now, moved: at, drawn: now });
    }
    last = now;
    return moved;
  };
}

/**
 * How far further right of its track to draw each Train standing at a Station whose pill touches
 * another's standing there, or passing it (passes()), where they're drawn on their tracks, in px: the
 * newest first, each as near its own track as it goes, its pill's edge there, clear of every other
 * pill standing there, moved already or staying put, and of each passing it that it touches.
 * ponytail: not of one passing it that it doesn't touch on its own track, which it can come to cover
 * moved apart, as on a track further out. Clearing all of them had a Train at Sants go 3 pills' height
 * out at zoom 12, where the Trains running in and out were many, and it no longer read as at its
 * Station. Clear those too, only up to a pill's height or so, if covering them shows.
 */
function apart(drawn: Drawn[], since: Map<string, number>): Map<string, number> {
  const stays = (t: Drawn) => !t.standsAt || t.fixed;
  const [staying, at] = [drawn.filter(stays), new Map<string | undefined, Drawn[]>()];
  for (const t of drawn) at.set(t.standsAt, [...(at.get(t.standsAt) ?? []), t]);
  // The pills each Train standing at a Station keeps clear of: those standing there too, and those passing it that it touches.
  const around = new Map(
    drawn.flatMap((t) => (stays(t) ? [] : [[t, [...(at.get(t.standsAt) ?? []).filter((o) => o !== t), ...staying.filter((o) => o.standsAt !== t.standsAt && passes(o, t) && touches(t, o))]] as const])),
  );
  const moving = [...around].flatMap(([t, others]) => (others.some((o) => touches(t, o)) ? [t] : [])).sort((a, b) => (since.get(b.id) ?? 0) - (since.get(a.id) ?? 0));
  const [target, moved, toMove] = [new Map<string, number>(), new Map<Drawn, Drawn>(), new Set(moving)];
  for (const t of moving) {
    toMove.delete(t);
    const right = rightOf(t.heading, 0);
    // Those still to move go round it.
    const others = (around.get(t) ?? []).flatMap((o) => moved.get(o) ?? (toMove.has(o) ? [] : [o]));
    let out = toEdge(t.box, t.heading + 90);
    for (let past = true; past; ) {
      past = false;
      for (const o of others) {
        const clear = clearOf(t, right, out, o);
        if (clear > out) [out, past] = [clear, true];
      }
    }
    moved.set(t, { ...t, at: [t.at[0] + (out - t.aside) * right[0], t.at[1] + (out - t.aside) * right[1]] });
    target.set(t.id, out - t.aside);
  }
  return target;
}

/**
 * How far right of its track a Train's pill `out` px right of it has to go, in px, to clear another's:
 * as far as it is, where it doesn't cover it, and otherwise past it.
 */
function clearOf({ at: [x, y], aside, box: [width, height] }: Drawn, [rx, ry]: [number, number], out: number, other: Drawn): number {
  // How far right of its track it covers the other: from `from` to `to`, where it's within reach of it both across and up and down the screen.
  let [from, to] = [-Infinity, Infinity];
  for (const [off, way, reach] of [
    [x - aside * rx - other.at[0], rx, width + other.box[0]],
    [y - aside * ry - other.at[1], ry, height + other.box[1]],
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

/** Whether a Train that stays where it's drawn runs past a standing one's Station: one of its Network, along its track either way. */
function passes(t: Drawn, standing: Drawn): boolean {
  return t.network === standing.network && parallel(t.heading, standing.heading);
}

/** Whether two Trains' pills overlap, where they're drawn. */
function touches({ at: [ax, ay], box: [aw, ah] }: Drawn, { at: [bx, by], box: [bw, bh] }: Drawn): boolean {
  return Math.abs(ax - bx) < aw + bw && Math.abs(ay - by) < ah + bh;
}
