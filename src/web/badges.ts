// Where the map names Lines by badges (#191, ADR-0008).
import type { Stroke } from '../bundle.ts';

/** A Line's stroke as it's drawn in a zoom band: how many metres less of it at its start and end, where curves take over (cutIn()). */
export type Drawn = Omit<Stroke, 'band' | 'cut'> & { band: number; cut: [start: number, end: number] };

/** A Stretch as it's drawn in a zoom band: along its centreline from where all its Lines are drawn to where they all still are, and its Lines in its order (ADR-0006). */
export interface DrawnStretch {
  shape: string;
  band: number;
  from: number;
  to: number;
  lines: string[];
}

/**
 * The Stretches strokes are drawn along, in each band. A centreline runs on through Stretch after
 * Stretch, each as far as the same Lines run along it: where one joins or leaves, or all end, a
 * Stretch ends, but not where a Line's stroke is only split, as where it goes into a tunnel. A
 * Stretch a node absorbs in a band, so that none of it is drawn with all its Lines, has none there.
 */
export function stretches(strokes: Drawn[]): DrawnStretch[] {
  const along = new Map<string, Drawn[]>();
  for (const s of strokes) along.set(`${s.band} ${s.shape}`, [...(along.get(`${s.band} ${s.shape}`) ?? []), s]);
  return [...along.values()].flatMap((on) => {
    const { shape, band } = on[0] as Drawn;
    const ends = [...new Set(on.flatMap((s) => [s.from, s.to]))].sort((a, b) => a - b);
    const found: DrawnStretch[] = [];
    let last: DrawnStretch | undefined;
    for (const [i, a] of ends.slice(0, -1).entries()) {
      const b = ends[i + 1] as number;
      const covering = on.filter((s) => s.from <= a && s.to >= b).sort((x, y) => x.side - y.side);
      const lines = [...new Set(covering.map((s) => s.line))];
      const from = Math.max(a, ...covering.map((s) => s.from + s.cut[0]));
      const to = Math.min(b, ...covering.map((s) => s.to - s.cut[1]));
      if (!lines.length || from >= to) last = undefined;
      else if (last && last.to === a && last.lines.join() === lines.join()) last.to = to;
      else found.push((last = { shape, band, from, to, lines }));
    }
    return found;
  });
}
