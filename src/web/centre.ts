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

/** How long a pointer down on the map holds it still at most, in ms: a drag in the making moves within a moment, and a lift that never came must not hold it for good. */
const PRESSED = 3000;

/**
 * The pointers down on the map, which hold it where it is (#581). The jump that pans the map with a
 * Train ends the press MapLibre has seen but not yet a move of, so the drag never starts. Each pointer
 * holds it from its press to its lift, or its cancel, or PRESSED, whichever comes first: a `pointerup`
 * can fail to come, as the context menu or a pointer let go out of the window may have it.
 */
export function pointersDown() {
  const down = new Map<number, number>();
  return {
    press: (id: number, now: number) => void down.set(id, now),
    lift: (id: number) => void down.delete(id),
    holds: (now: number) => [...down.values()].some((at) => now - at < PRESSED),
  };
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
