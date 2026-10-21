import type { ItamRecord } from './api.js';
import { masterDataByName } from './master-data.js';

/** Root-first chain from the tree's nodes to `nodeId`, itself included. */
export function treeChain(
  nodes: readonly ItamRecord[],
  nodeId: unknown,
): ItamRecord[] {
  const chain: ItamRecord[] = [];
  let current = nodes.find((entry) => entry.id === nodeId);
  while (current && chain.length < 10) {
    chain.unshift(current);
    const parentId = current.parentId;
    current = parentId
      ? nodes.find((entry) => entry.id === parentId)
      : undefined;
  }
  return chain;
}

/** Whether a field points into a tree collection (a parent included). */
export function isTreeReference(field: {
  readonly reference?: { readonly collection: string };
}): boolean {
  return Boolean(
    field.reference && masterDataByName(field.reference.collection)?.tree,
  );
}

/** The chain's names joined for a single line: 上海总部 › 3 楼. */
export function treePathLabel(
  nodes: readonly ItamRecord[],
  nodeId: unknown,
): string {
  return treeChain(nodes, nodeId)
    .map((entry) => (typeof entry.name === 'string' ? entry.name : ''))
    .join(' › ');
}
