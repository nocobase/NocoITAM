import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  useMemo,
  useState,
  type DragEvent,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface TreeNode {
  readonly id: string;
  readonly parentId?: string | null;
  readonly label: ReactNode;
  readonly sort?: number;
  /** Muted columns shown to the right of the label (type, updated time, …). */
  readonly details?: readonly {
    key: string;
    value: ReactNode;
    width?: string;
  }[];
}

export interface TreeMove {
  readonly id: string;
  /** New parent; null for the root. */
  readonly parentId: string | null;
  /** Position among the new siblings. */
  readonly index: number;
}

export interface TreeViewProps {
  readonly nodes: readonly TreeNode[];
  /** Count shown beside each node, e.g. devices at that node. */
  readonly counts?: Readonly<Record<string, number>>;
  /** Word shown before a node's count saying what it counts (设备 / 库存 / 授权). */
  readonly countLabel?: (node: TreeNode) => ReactNode;
  /** Whether the count of a node should include its descendants. */
  readonly subtreeCounts?: boolean;
  readonly onSelect?: (id: string) => void;
  readonly selectedId?: string;
  /** When set, nodes can be dragged above / below siblings or onto a parent. */
  readonly onMove?: (move: TreeMove) => void;
  /** Start with every parent collapsed (remount with a `key` to re-apply). */
  readonly defaultCollapsed?: boolean;
  /** Rendered at the end of each row, e.g. an actions menu. */
  readonly rowActions?: (id: string) => ReactNode;
  /** Without its own card, for trees grouped inside one (categories). */
  readonly bare?: boolean;
}

interface Built {
  readonly node: TreeNode;
  readonly children: Built[];
}

type DropPlace = 'before' | 'after' | 'inside';

/** A nested list built from flat parent references; every node is expandable. */
export function TreeView({
  nodes,
  counts,
  countLabel,
  subtreeCounts = true,
  onSelect,
  selectedId,
  onMove,
  defaultCollapsed = false,
  rowActions,
  bare = false,
}: TreeViewProps): ReactElement {
  const roots = useMemo(() => build(nodes), [nodes]);
  const parents = useMemo(() => {
    const ids = new Set<string>();
    const walk = (items: readonly Built[]) => {
      for (const item of items) {
        if (item.children.length > 0) {
          ids.add(item.node.id);
          walk(item.children);
        }
      }
    };
    walk(roots);
    return ids;
  }, [roots]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() =>
    defaultCollapsed ? new Set(parents) : new Set(),
  );
  const [dragging, setDragging] = useState<string>();
  const [drop, setDrop] = useState<{ id: string; place: DropPlace }>();
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const total = (built: Built): number =>
    (counts?.[built.node.id] ?? 0) +
    (subtreeCounts
      ? built.children.reduce((sum, child) => sum + total(child), 0)
      : 0);

  // A node cannot land inside itself or its own subtree.
  const isWithin = (id: string, ancestor: string): boolean => {
    let current = byId.get(id)?.parentId ?? null;
    const seen = new Set<string>();
    while (current) {
      if (current === ancestor) return true;
      if (seen.has(current)) break;
      seen.add(current);
      current = byId.get(current)?.parentId ?? null;
    }
    return false;
  };
  const placeFor = (event: DragEvent<HTMLElement>): DropPlace => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
  };
  const finish = () => {
    setDragging(undefined);
    setDrop(undefined);
  };
  const dropOn = (target: Built, siblings: readonly Built[]) => {
    if (!dragging || !drop || drop.id !== target.node.id || !onMove) return;
    if (dragging === target.node.id || isWithin(target.node.id, dragging))
      return;
    if (drop.place === 'inside') {
      onMove({
        id: dragging,
        parentId: target.node.id,
        index: target.children.length,
      });
      return;
    }
    const parentId = target.node.parentId ?? null;
    const others = siblings.filter((item) => item.node.id !== dragging);
    const at = others.findIndex((item) => item.node.id === target.node.id);
    onMove({
      id: dragging,
      parentId,
      index: drop.place === 'before' ? at : at + 1,
    });
  };

  const render = (items: readonly Built[], depth: number): ReactNode =>
    items.map((item) => {
      const isCollapsed = collapsed.has(item.node.id);
      const hasChildren = item.children.length > 0;
      const mark = drop?.id === item.node.id ? drop.place : undefined;
      return (
        <li key={item.node.id}>
          <div
            className={cn(
              'relative flex items-center gap-1 rounded-md py-1 pr-2 pl-1 text-sm hover:bg-muted',
              selectedId === item.node.id && 'bg-muted',
              dragging === item.node.id && 'opacity-40',
              mark === 'inside' && 'bg-primary/10 ring-1 ring-primary/40',
              mark === 'before' &&
                'before:absolute before:inset-x-2 before:top-0 before:h-0.5 before:bg-primary',
              mark === 'after' &&
                'after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary',
            )}
            draggable={Boolean(onMove)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', item.node.id);
              setDragging(item.node.id);
            }}
            onDragEnd={finish}
            onDragOver={(event) => {
              if (!dragging || dragging === item.node.id) return;
              if (isWithin(item.node.id, dragging)) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              const place = placeFor(event);
              if (drop?.id !== item.node.id || drop.place !== place)
                setDrop({ id: item.node.id, place });
            }}
            onDragLeave={(event) => {
              if (
                drop?.id === item.node.id &&
                !event.currentTarget.contains(event.relatedTarget as Node)
              )
                setDrop(undefined);
            }}
            onDrop={(event) => {
              event.preventDefault();
              dropOn(item, items);
              finish();
            }}
          >
            {/* No handle: the whole row drags (`draggable` above). */}
            <button
              type='button'
              className={cn(
                'flex size-5 items-center justify-center rounded text-muted-foreground',
                // A leaf keeps the arrow's room, so siblings' names line up
                // whether or not they have children of their own.
                !hasChildren && 'invisible',
              )}
              aria-label={isCollapsed ? 'expand' : 'collapse'}
              onClick={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(item.node.id)) next.delete(item.node.id);
                  else next.add(item.node.id);
                  return next;
                })
              }
            >
              {isCollapsed ? (
                <ChevronRight className='size-4' />
              ) : (
                <ChevronDown className='size-4' />
              )}
            </button>
            <button
              type='button'
              className='flex min-w-0 flex-1 items-center justify-between gap-6 text-left'
              onClick={() => onSelect?.(item.node.id)}
            >
              <span className='min-w-0 flex-1 truncate'>{item.node.label}</span>
              {item.node.details?.map((detail) => (
                <span
                  key={detail.key}
                  className={cn(
                    // Right-aligned so the gap to the count badge is the same
                    // whatever the text length (类型：公司 vs 资产类型：设备).
                    'hidden shrink-0 truncate text-right text-xs text-muted-foreground sm:inline',
                    detail.width ?? 'w-24',
                  )}
                >
                  {detail.value}
                </span>
              ))}
              {counts ? (
                <Badge
                  variant='secondary'
                  className='w-20 shrink-0 justify-center gap-1 tabular-nums'
                >
                  {countLabel ? (
                    <span className='font-normal text-muted-foreground'>
                      {countLabel(item.node)}
                    </span>
                  ) : null}
                  {total(item)}
                </Badge>
              ) : null}
            </button>
            {rowActions ? (
              <span
                className='shrink-0'
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                {rowActions(item.node.id)}
              </span>
            ) : null}
          </div>
          {hasChildren && !isCollapsed ? (
            // Children sit one step in, along a guide line that drops from
            // their parent's arrow, so what belongs to what reads at a
            // glance rather than from an indent the width of the arrow.
            <ul className='ml-[0.875rem] border-l border-border pl-2'>
              {render(item.children, depth + 1)}
            </ul>
          ) : null}
        </li>
      );
    });

  return (
    <ul
      className={
        bare ? undefined : 'rounded-lg border border-border bg-card p-2'
      }
    >
      {render(roots, 0)}
    </ul>
  );
}

function build(nodes: readonly TreeNode[]): Built[] {
  const byParent = new Map<string | null, TreeNode[]>();
  const ids = new Set(nodes.map((node) => node.id));
  for (const node of nodes) {
    const parent =
      node.parentId && ids.has(node.parentId) ? node.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), node]);
  }
  const sortNodes = (list: TreeNode[]) =>
    [...list].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const grow = (parent: string | null): Built[] =>
    sortNodes(byParent.get(parent) ?? []).map((node) => ({
      node,
      children: grow(node.id),
    }));
  return grow(null);
}
