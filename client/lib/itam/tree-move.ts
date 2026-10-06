import type { TreeMove } from '@/components/itam/tree-view';

import type { ItamRecord } from './api.js';
import { text } from './format.js';

/**
 * A move made in one group of a grouped tree (categories by asset type), as
 * the service takes it. The tree places a node among its own group's
 * siblings, while the service orders all siblings together — top-level
 * categories of every type share the root — so the position becomes the
 * one just before the group sibling it now precedes, or just after the
 * group's last.
 */
export function groupedMove(
  rows: readonly ItamRecord[],
  move: TreeMove,
  inGroup: (row: ItamRecord) => boolean,
): TreeMove {
  const siblings = rows
    .filter(
      (row) =>
        (text(row.parentId) || null) === move.parentId && row.id !== move.id,
    )
    .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));
  const ofGroup = siblings.filter(inGroup);
  const before = ofGroup[move.index];
  const last = ofGroup.at(-1);
  const index = before
    ? siblings.indexOf(before)
    : last
      ? siblings.indexOf(last) + 1
      : siblings.length;
  return { ...move, index };
}
