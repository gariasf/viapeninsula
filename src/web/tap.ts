// Which Lines a tap on their strokes names (#193, ADR-0008).
import { LINK, STRETCH, type Stroke } from '../bundle.ts';

/**
 * The Lines drawn where a tap fell, by their IDs, from the strokes it fell on, in the order they come.
 * A stroke along a Stretch names every Line on the Stretch, in its order (ADR-0006). A curve across a
 * node, or a Line on its own track (a shared grey one too, #139), names its own Line. Each Line once.
 */
export function linesAt(tapped: Pick<Stroke, 'line' | 'shape'>[], strokes: Stroke[]): string[] {
  const named = new Set<string>();
  for (const { line, shape } of tapped) {
    const stretch = shape.startsWith(STRETCH) && !shape.startsWith(LINK) ? strokes.filter((s) => s.shape === shape).sort((a, b) => a.side - b.side) : [];
    for (const s of stretch.length ? stretch : [{ line }]) named.add(s.line);
  }
  return [...named];
}
