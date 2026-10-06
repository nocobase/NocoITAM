// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { groupedMove } from '../../client/lib/itam/tree-move.js';

// Top-level categories of two types interleaved in the shared order.
const rows = [
  { id: 'A', parentId: null, sort: 0, appliesTo: 'device' },
  { id: 'B', parentId: null, sort: 1, appliesTo: 'accessory' },
  { id: 'C', parentId: null, sort: 2, appliesTo: 'accessory' },
  { id: 'D', parentId: null, sort: 3, appliesTo: 'device' },
];
const device = (row: { appliesTo?: unknown }) => row.appliesTo === 'device';

describe('a move within one group of a grouped tree', () => {
  it('lands after the group sibling it was dropped after', () => {
    // A dragged below D: in the device group that is position 1 (after D);
    // taken as is, the service would put A back before D.
    expect(
      groupedMove(rows, { id: 'A', parentId: null, index: 1 }, device),
    ).toEqual({ id: 'A', parentId: null, index: 3 });
  });

  it('lands before the group sibling it was dropped before', () => {
    expect(
      groupedMove(rows, { id: 'D', parentId: null, index: 0 }, device),
    ).toEqual({ id: 'D', parentId: null, index: 0 });
  });

  it('keeps a move inside a parent as it is', () => {
    const children = [
      ...rows,
      { id: 'E', parentId: 'A', sort: 0, appliesTo: 'device' },
      { id: 'F', parentId: 'A', sort: 1, appliesTo: 'device' },
    ];
    expect(
      groupedMove(children, { id: 'F', parentId: 'A', index: 0 }, device),
    ).toEqual({ id: 'F', parentId: 'A', index: 0 });
  });
});
