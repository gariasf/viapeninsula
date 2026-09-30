import { expect, test } from 'vitest';
import { order, type Node } from './order.ts';

test('crosses two Lines where they part at a fork, not mid-stretch', async () => {
  // Edges 0 and 1 run east, one after the other, with Lines 0 and 1 on both. At the west end Line 0
  // comes in from the north-west (edge 2) and Line 1 from the south-west (edge 3); at the east end
  // Line 0 goes on to the south-east (edge 4) and Line 1 to the north-east (edge 5).
  const { PI } = Math;
  const nodes: Node[] = [
    {
      ends: [{ edge: 0, end: 0, angle: 0 }, { edge: 2, end: 1, angle: (3 * PI) / 4 }, { edge: 3, end: 1, angle: (-3 * PI) / 4 }],
      passes: [{ line: 0, from: 1, to: 0 }, { line: 1, from: 2, to: 0 }],
    },
    {
      ends: [{ edge: 0, end: 1, angle: PI }, { edge: 1, end: 0, angle: 0 }],
      passes: [{ line: 0, from: 0, to: 1 }, { line: 1, from: 0, to: 1 }],
    },
    {
      ends: [{ edge: 1, end: 1, angle: PI }, { edge: 4, end: 0, angle: -PI / 4 }, { edge: 5, end: 0, angle: PI / 4 }],
      passes: [{ line: 0, from: 0, to: 1 }, { line: 1, from: 0, to: 2 }],
    },
  ];
  const orders = await order([[1, 0], [1, 0], [0], [1], [0], [1]], nodes);
  // They cross at one fork or the other, so in one order all along, rather than between the edges.
  expect(orders[1]).toEqual(orders[0]);
  expect(orders[0]).toHaveLength(2);
});
