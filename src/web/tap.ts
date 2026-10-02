// Which Lines a tap on their strokes names (#193, ADR-0008).
import { LINK, STRETCH, type Stroke } from '../bundle.ts';

/**
 * The Lines drawn where a tap fell, by their IDs, from the strokes it fell on, as the map drew them:
 * along a Stretch, every Line on it, in the Stretch's order (ADR-0006), as a curve across a node or on
 * a Line's own track (shared grey ones too, #139), the Line drawn, each Line once, Stretch by Stretch
 * in the order the strokes come.
 */
export function linesAt(tapped: { line: string; shape: string }[], strokes: Stroke[]): string[] {
  const named = new Set<string>();
  for (const { line, shape } of tapped) {
    const stretch = shape.startsWith(STRETCH) && !shape.startsWith(LINK) ? strokes.filter((s) => s.shape === shape).sort((a, b) => a.side - b.side) : [];
    for (const s of stretch.length ? stretch : [{ line }]) named.add(s.line);
  }
  return [...named];
}
