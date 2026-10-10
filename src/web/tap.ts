// Which Lines a tap on their strokes names (#193, ADR-0008), and the room its popup has (#341).
import { LINK, STRETCH, type Stroke } from '../bundle.ts';

/**
 * The Lines drawn where a tap fell, by their IDs, from the strokes it fell on, in the order they come.
 * A stroke along a Stretch names every Line on the Stretch, in its order (ADR-0006): those whose
 * strokes along its centreline overlap it, as a centreline runs on through Stretch after Stretch. A
 * curve across a node, or a Line on its own track (a shared grey one too, #139), names its own Line.
 * Each Line once.
 */
export function linesAt(tapped: Pick<Stroke, 'line' | 'shape' | 'from' | 'to'>[], strokes: Stroke[]): string[] {
  const named = new Set<string>();
  for (const { line, shape, from, to } of tapped) {
    const stretch = shape.startsWith(STRETCH) && !shape.startsWith(LINK) ? strokes.filter((s) => s.shape === shape && s.from < to && s.to > from).sort((a, b) => a.side - b.side) : [];
    for (const s of stretch.length ? stretch : [{ line }]) named.add(s.line);
  }
  return [...named];
}

/**
 * The room a tap's popup has round the point it points from, `at`, on a map `size` px across and high,
 * kept `inset` px in from its edges: the widest and highest it can be, in px, and still fit wherever
 * MapLibre puts it by the same insets (its `padding`). MapLibre puts a popup above the point, or below
 * it where it doesn't fit above; and centred on it, or from it to the right or the left where it
 * doesn't fit centred. So it's as wide as the widest of those across, and as high as the room above or
 * below, whichever is higher: in whole px, as MapLibre measures the popup in whole px, rounded, and a
 * popup rounded up past its room would go where it doesn't fit.
 */
export function popupRoom(at: { x: number; y: number }, size: { width: number; height: number }, inset: { top: number; right: number; bottom: number; left: number }) {
  const [left, right, above, below] = [at.x - inset.left, size.width - inset.right - at.x, at.y - inset.top, size.height - inset.bottom - at.y];
  return { width: Math.floor(Math.max(2 * Math.min(left, right), left, right)), height: Math.floor(Math.max(above, below)) };
}
