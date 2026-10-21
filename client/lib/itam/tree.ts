import { masterDataPath, useItamList, type ItamRecord } from './api.js';
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

/** `nodeId` and every node under it. */
export function subtreeOf(
  nodes: readonly ItamRecord[],
  nodeId: string,
): string[] {
  const ids = [nodeId];
  for (let at = 0; at < ids.length; at++)
    for (const node of nodes)
      if (node.parentId === ids[at] && !ids.includes(node.id))
        ids.push(node.id);
  return ids;
}

/**
 * A tree node and its descendants, from the list the tree pane reads (the
 * same query, so usually cached); undefined until it has loaded.
 */
export function useSubtree(
  collection: 'departments' | 'locations',
  nodeId: string,
): readonly string[] | undefined {
  const nodes = useItamList<ItamRecord>(masterDataPath(collection), {
    pageSize: 200,
    sort: 'sort',
  }).data?.data;
  return nodes ? subtreeOf(nodes, nodeId) : undefined;
}
