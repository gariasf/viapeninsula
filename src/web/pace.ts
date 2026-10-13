// How often Trains move at rest (#666): as often as the fastest Line with a Train in view asks.
import type { Point } from '../bundle.ts';

/**
 * The top speed of the fastest Line with a Train in view, in m/s, from each Line's top speed by its ID:
 * 0 where none is, as where the view has no Trains, which quarterPixel() makes endless.
 */
export function fastestInView(trains: Iterable<{ line: string; at: Point }>, inView: (at: Point) => boolean, topSpeeds: Map<string, number>): number {
  let fastest = 0;
  for (const { line, at } of trains) {
    const speed = topSpeeds.get(line) ?? 0;
    if (speed > fastest && inView(at)) fastest = speed;
  }
  return fastest;
}
