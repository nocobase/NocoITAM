import type { ReactElement } from 'react';

import { masterDataPath, useItamList, type ItamRecord } from '@/lib/itam/api';
import { masterDataByName } from '@/lib/itam/master-data';
import { treeChain } from '@/lib/itam/tree';

import { RecordLink } from './record-link.js';

const text = (value: unknown): string =>
  typeof value === 'string' ? value : '';

/**
 * A reference into a tree collection read with its ancestors, the last
 * one a link: 终端设备 › 笔记本电脑, 技术部 › 研发. The tree is loaded
 * once per collection and shared through the query cache.
 */
export function TreePath({
  collection,
  nodeId,
  drawer,
  show = 'path',
}: {
  readonly collection: string;
  readonly nodeId: unknown;
  /** `false` navigates to the node's page even inside a detail page. */
  readonly drawer?: boolean;
  /**
   * `path` reads the node with its ancestors; a list column may show
   * only the node itself (`leaf`) or only its top-level ancestor (`root`).
   */
  readonly show?: 'path' | 'leaf' | 'root';
}): ReactElement | null {
  const nodes = useItamList<ItamRecord>(masterDataPath(collection), {
    pageSize: 500,
  });
  if (!nodes.data) return null;
  const full = treeChain(nodes.data.data, nodeId);
  const chain =
    show === 'leaf'
      ? full.slice(-1)
      : show === 'root'
        ? full.slice(0, 1)
        : full;
  if (chain.length === 0) return null;
  const route = masterDataByName(collection)?.route ?? collection;
  return (
    <span
      className='inline-flex flex-wrap items-baseline gap-x-1'
      // A shortened chain keeps the whole path on hover.
      title={
        chain.length < full.length
          ? full.map((entry) => text(entry.name)).join(' › ')
          : undefined
      }
    >
      {chain.map((entry, index) =>
        index < chain.length - 1 ? (
          <span key={entry.id} className='text-muted-foreground'>
            {text(entry.name)} ›
          </span>
        ) : (
          <RecordLink
            key={entry.id}
            to={`/${route}/${entry.id}`}
            drawer={drawer}
            className='text-link'
            // Inside a clickable table row the link, not the row, wins.
            onClick={(event) => event.stopPropagation()}
          >
            {text(entry.name)}
          </RecordLink>
        ),
      )}
    </span>
  );
}
