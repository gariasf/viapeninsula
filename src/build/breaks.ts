// A yardstick for how often the Lines drawn side by side break up, the same before and after a change (#138).

import { DEGREE, direction, pointAt, type Shape, type Stroke, type Track } from '../bundle.ts';

/** Strokes shorter than this, in metres, are stubs: sideBySide()'s SHORT before #138. */
const STUB = 150;
/** Steps less than this far apart, in metres, are at one place: sideBySide()'s NEAR. */
const NEAR = 45;
/** A Line out of place for less than this, in metres, is in a bundle, or out of it, for a short stretch. */
const JOIN = 1000;

/**
 * How the strokes break up. A step is a Line changing side from one stroke to the next; a stub is a
 * stroke under STUB; a swap is two Lines stepping past each other at one place; a join is a Line
 * stepping out for under JOIN and back to the side it left. So each swap is two steps too, and
 * each join two steps.
 */
export interface Breaks {
  steps: number;
  stubs: number;
  swaps: number;
  joins: number;
}

export function breaks(strokes: Stroke[], shapes: Shape[]): Breaks {
  const byId = new Map(shapes.map((s) => [s.id, s]));
  const found: Breaks = { steps: 0, stubs: strokes.filter((s) => s.to - s.from < STUB).length, swaps: 0, joins: 0 };
  // Where each step is, in metres, which way is right of its shape there, and its sides before and after.
  const steps: { line: string; x: number; y: number; right: [number, number]; was: number; is: number }[] = [];
  const byShape = new Map<string, Stroke[]>();
  for (const s of strokes) {
    const list = byShape.get(`${s.line} ${s.shape}`);
    if (list) list.push(s);
    else byShape.set(`${s.line} ${s.shape}`, [s]);
  }
  for (const list of byShape.values()) {
    list.sort((a, b) => a.from - b.from);
    const joined = (a?: Stroke, b?: Stroke) => a && b && Math.abs(a.to - b.from) <= 1;
    for (const [i, s] of list.entries()) {
      const [prev, next] = [list[i - 1], list[i + 1]];
      if (prev && next && joined(prev, s) && joined(s, next) && prev.side === next.side && s.side !== prev.side && s.to - s.from < JOIN) found.joins++;
      const shape = byId.get(s.shape);
      if (!shape || !prev || !joined(prev, s) || prev.side === s.side) continue;
      found.steps++;
      const [lon, lat] = pointAt(shape, s.from);
      const [dx, dy] = direction(shape, Math.max(0, s.from - 1), s.from + 1);
      const length = Math.hypot(dx, dy) || 1;
      const kx = DEGREE * Math.cos((lat * Math.PI) / 180);
      steps.push({ line: s.line, x: lon * kx, y: lat * DEGREE, right: [dy / length, -dx / length], was: prev.side, is: s.side });
    }
  }
  // ponytail: every pair of steps, fine for the map's few hundred; a grid as in sideBySide() if it grows.
  for (const [i, a] of steps.entries()) {
    for (const b of steps.slice(i + 1)) {
      if (a.line === b.line || Math.hypot(a.x - b.x, a.y - b.y) > NEAR) continue;
      // Which is right of the other, looking the way a's shape runs, before the steps and after; level
      // where they're under half a line width apart, as their shapes may not quite run alongside.
      const order = (sa: number, sb: number) => {
        const apart = sa - sb * (a.right[0] * b.right[0] + a.right[1] * b.right[1]);
        return Math.abs(apart) < 0.5 ? 0 : Math.sign(apart);
      };
      if (order(a.was, b.was) * order(a.is, b.is) < 0) found.swaps++;
    }
  }
  return found;
}

// Run as `node src/build/breaks.ts <track.json>`, on a day's track the daily build wrote or the map
// downloads: the breaks in its strokes, and in the strokes sideBySide() draws from its Lines now.
if (import.meta.main) {
  const { readFile } = await import('node:fs/promises');
  const { sideBySide } = await import('./sideBySide.ts');
  const track = JSON.parse(await readFile(process.argv[2] ?? '', 'utf8')) as Track;
  console.log('drawn', breaks(track.strokes, track.shapes));
  console.log('now  ', breaks(sideBySide(track.lines, track.shapes).strokes, track.shapes));
}
