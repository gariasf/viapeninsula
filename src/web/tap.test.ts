import { expect, test } from 'vitest';
import type { Stroke } from '../bundle.ts';
import { linesAt, popupRoom } from './tap.ts';

/** A stroke of a Line along a shape, at a side. */
const stroke = (line: string, shape: string, side = 0, more: Partial<Stroke> = {}): Stroke => ({ line, shape, from: 0, to: 100, side, ...more });
/** Tapped on a Line's stroke along a shape, from 0 to 100 m along it, as stroke() makes it. */
const tap = (line: string, shape: string) => ({ line, shape, from: 0, to: 100 });

test("a tap on one Line's stroke along a Stretch names every Line on the Stretch, in its order", () => {
  const strokes = [stroke('R2', 'stretch:3', 1), stroke('R1', 'stretch:3', -1), stroke('R4', 'stretch:3', 0), stroke('L1', 'stretch:4')];
  expect(linesAt([tap('R4', 'stretch:3')], strokes)).toEqual(['R1', 'R4', 'R2']);
});

test('a Line drawn in more than one zoom band, or in pieces, counts once', () => {
  const strokes = [stroke('R1', 'stretch:3', -1), stroke('R1', 'stretch:3', -1, { band: 2 }), stroke('R2', 'stretch:3', 1)];
  expect(linesAt([tap('R1', 'stretch:3'), tap('R2', 'stretch:3')], strokes)).toEqual(['R1', 'R2']);
});

test("a curve across a node, or a Line on its own track, names the Lines whose strokes were tapped, in the order they're drawn", () => {
  const strokes = [stroke('R1', 'stretch:link0', -1), stroke('R2', 'stretch:link1', 1)];
  expect(linesAt([tap('R2', 'stretch:link1'), tap('R1', 'stretch:link0')], strokes)).toEqual(['R2', 'R1']);
  // Zoomed right in, on shared grey track, every Line on it.
  expect(linesAt([tap('R1', 'rodalies:51_R1'), tap('R4', 'rodalies:51_R4'), tap('R1', 'rodalies:51_R1_INV')], [])).toEqual(['R1', 'R4']);
});

test('two Stretches tapped at once name the first Stretch, then the next', () => {
  const strokes = [stroke('R1', 'stretch:3', -1), stroke('R4', 'stretch:3', 1), stroke('L1', 'stretch:4', 0), stroke('R4', 'stretch:4', 1)];
  expect(linesAt([tap('L1', 'stretch:4'), tap('R1', 'stretch:3')], strokes)).toEqual(['L1', 'R4', 'R1']);
});

test("a centreline runs through Stretch after Stretch: only the Lines on the tapped stroke's Stretch are named", () => {
  // One centreline, a Stretch of R1 and R4 to 100 m, then one of R1, R2 and R4 on to 300 m, cut at 200 m where R4 goes into a tunnel.
  const strokes = [stroke('R1', 'stretch:0', -1), stroke('R4', 'stretch:0', 1), stroke('R1', 'stretch:0', -1, { from: 100, to: 300 }), stroke('R2', 'stretch:0', 0, { from: 100, to: 300 }), stroke('R4', 'stretch:0', 1, { from: 100, to: 200 }), stroke('R4', 'stretch:0', 1, { from: 200, to: 300, under: 1 })];
  expect(linesAt([tap('R1', 'stretch:0')], strokes)).toEqual(['R1', 'R4']);
  expect(linesAt([{ line: 'R2', shape: 'stretch:0', from: 100, to: 300 }], strokes)).toEqual(['R1', 'R2', 'R4']);
  expect(linesAt([{ line: 'R4', shape: 'stretch:0', from: 200, to: 300 }], strokes)).toEqual(['R1', 'R2', 'R4']);
});

test('nothing tapped names no Line', () => {
  expect(linesAt([], [stroke('R1', 'stretch:3')])).toEqual([]);
});

/**
 * Where MapLibre's Popup puts a box `w` px across and `h` high pointing from `at`, on a map `size`
 * across and high, by its insets (its `padding`), as its `_update()` does with no anchor given, by the
 * box's size in whole px, as offsetWidth and offsetHeight round it: its edges, in px.
 */
function placed(at: { x: number; y: number }, w: number, h: number, size: { width: number; height: number }, inset: { top: number; right: number; bottom: number; left: number }) {
  const [width, height] = [Math.round(w), Math.round(h)];
  const vertical = at.y < height + inset.top ? 'top' : at.y > size.height - height - inset.bottom ? 'bottom' : '';
  const across = at.x < width / 2 + inset.left ? 'left' : at.x > size.width - width / 2 - inset.right ? 'right' : '';
  const left = across === 'left' ? at.x : across === 'right' ? at.x - w : at.x - w / 2;
  const top = vertical === 'top' ? at.y : vertical === 'bottom' || !across ? at.y - h : at.y - h / 2;
  return { left, right: left + w, top, bottom: top + h };
}

test("a tap's popup fits the map inside its insets wherever it points from, on a phone and a wide window, folded or open", () => {
  const misfits: string[] = [];
  for (const [size, inset] of [
    [{ width: 390, height: 844 }, { top: 64, right: 16, bottom: 142, left: 16 }],
    [{ width: 1280, height: 800 }, { top: 64, right: 16, bottom: 162, left: 16 }],
  ] as const) {
    // A tap's point is rarely a whole px, as the map projects it.
    for (let x = inset.left + 0.3; x <= size.width - inset.right; x++) {
      for (let y = inset.top + 0.3; y <= size.height - inset.bottom; y += 4) {
        const room = popupRoom({ x, y }, size, inset);
        // Folded, the Lines' pills and the fold; open, as wide and high as the cards' CSS lets it, or the room.
        for (const [w, h] of [[120, 80], [Math.min(300, room.width), Math.min(365, room.height)]] as const) {
          const box = placed({ x, y }, w, h, size, inset);
          if (box.left < inset.left || box.right > size.width - inset.right || box.top < inset.top || box.bottom > size.height - inset.bottom) misfits.push(`${size.width} ${x},${y} ${w}×${h}`);
        }
      }
    }
  }
  expect(misfits).toEqual([]);
});

test("a tap's popup is as wide as the cards let it be where that fits, and narrower only where it doesn't", () => {
  const [phone, inset] = [{ width: 390, height: 844 }, { top: 64, right: 16, bottom: 142, left: 16 }];
  // Mid-screen, and near either side, 300 px fits; at x 147, where #341's measure found it cut off, 262 px, centred on the tap.
  expect([195, 40, 350].map((x) => popupRoom({ x, y: 400 }, phone, inset).width >= 300)).toEqual([true, true, true]);
  expect(popupRoom({ x: 147, y: 400 }, phone, inset).width).toBe(262);
  // Tapped mid-screen, as high as the room above the tap, under the corners' cards, as that's larger than below.
  expect(popupRoom({ x: 195, y: 407 }, phone, inset).height).toBe(343);
});
