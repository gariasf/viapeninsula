// A followed Train held in the middle of the map (#325): when it's off the middle, and what the viewer
// does that lets the map go.

/** How far off the middle a Train is, in px, before the map jumps to it: a quarter of a pixel, as quarterPixel() has Trains move. */
const DRIFT = 0.25;

/** Whether a Train `dx` and `dy` px off the middle is far enough for the map to jump to it. */
export const drifted = (dx: number, dy: number) => Math.hypot(dx, dy) >= DRIFT;

/** The part of a MapLibre event that tells what moved the map. */
interface Moved {
  type: string;
  originalEvent?: { touches?: ArrayLike<unknown>; key?: string; shiftKey?: boolean };
}

/**
 * Whether a move of the map is the viewer's hand taking it off the Train, which lets go: a `dragstart`
 * by mouse or one finger, or a `movestart` by an arrow key. A pinch's drift fires `dragstart` too, with
 * two fingers down, and zooming and turning keep the Train in the middle.
 */
export function letsGo({ type, originalEvent: e }: Moved): boolean {
  if (!e) return false;
  if (type === 'dragstart') return e.touches === undefined || e.touches.length < 2;
  return type === 'movestart' && !e.shiftKey && !!e.key?.startsWith('Arrow');
}

/**
 * Runs `run` at once, and then no more often than every `ms`: calls in between make it run once more
 * when the time's up, so that the last one is never lost.
 */
export function atMostEvery(ms: number, run: () => void): () => void {
  let [last, timer] = [-Infinity, undefined as ReturnType<typeof setTimeout> | undefined];
  return () => {
    if (timer !== undefined) return;
    const wait = last + ms - Date.now();
    const go = () => {
      timer = undefined;
      last = Date.now();
      run();
    };
    if (wait <= 0) go();
    else timer = setTimeout(go, wait);
  };
}
