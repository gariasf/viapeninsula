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
 * How long a pointer down on the map holds it still at most, in ms: a drag in the making moves within a
 * moment, and a lift that never came must not hold it for good.
 * ponytail: the one thing that ends a hold but its lift or its cancel. A press held still for longer and
 * then dragged loses its drag to the map's jump, as it did, and a pointer whose lift never came stays in
 * the map, holding nothing, till its ID is pressed again. Lift every pointer on `contextmenu`, `blur` and
 * a hidden tab too if a lost lift is seen to hold the map, or a slow press to lose its drag.
 */
const PRESSED = 3000;

/**
 * How long a touch is a tap, and how long after one a second tap makes a double-tap, in ms: MapLibre's
 * MAX_TOUCH_TIME and MAX_TAP_INTERVAL, both 500.
 */
const TAP = 500;

/**
 * The pointers down on the map, which hold it where it is (#581). The jump that pans the map with a
 * Train ends the press MapLibre has seen but not yet a move of, so the drag never starts. Each pointer
 * holds it from its press to its lift, or its cancel, or PRESSED, whichever comes first: a `pointerup`
 * can fail to come, as the context menu or a pointer let go out of the window may have it.
 * A touch short enough to be a tap goes on holding it for TAP after its lift (`now`, none for a cancel),
 * so that a second tap can come: the jump forgets the first tap, as MapLibre's recogniser of a double-tap
 * is reset by it, and a double-tap never zoomed while the map panned with a moving Train (#432). A mouse's
 * click has its `dblclick`, which keeps no state to forget.
 */
export function pointersDown() {
  const down = new Map<number, { at: number; touch: boolean }>();
  let tapped = -Infinity;
  return {
    press: (id: number, now: number, touch = false) => void down.set(id, { at: now, touch }),
    lift: (id: number, now?: number) => {
      const pointer = down.get(id);
      if (now !== undefined && pointer?.touch && now - pointer.at < TAP) tapped = now;
      down.delete(id);
    },
    holds: (now: number) => now - tapped < TAP || [...down.values()].some(({ at }) => now - at < PRESSED),
  };
}

/**
 * Whether an `easeTo()`, by its options and its event data, is MapLibre's zoom for a double-click or a
 * double-tap, or a two-finger tap's zoom out: about the point clicked or tapped, which it gives as
 * `around`, and which the handler has no option to make the middle, as the wheel's and a pinch's have
 * (#432). It starts from the event itself, a `dblclick` or the `touchend` of the second tap. The ease
 * that goes on from a pinch ends in a `touchend` too, but it's marked `noMoveStart`.
 */
export function tapZooms(options: { around?: unknown; zoom?: number; noMoveStart?: boolean }, eventData?: { originalEvent?: { type: string } }): boolean {
  const type = eventData?.originalEvent?.type;
  return (type === 'dblclick' || type === 'touchend') && options.around !== undefined && options.zoom !== undefined && !options.noMoveStart;
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
