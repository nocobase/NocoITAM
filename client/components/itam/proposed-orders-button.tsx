import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import type { ItamRecord } from '@/lib/itam/api';
import { text } from '@/lib/itam/format';
import type { LineItemType } from '@/lib/itam/procurement';
import { useCurrentUserId } from '@/lib/itam/permissions';
import type { PurchaseLineDraft } from '@/lib/itam/purchase-lines';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { useReferenceNames } from '@/lib/itam/references';
import { cn } from '@/lib/utils';
import { PurchaseOrderCreateDialog } from '@/pages/itam/procurement/create-dialog';

export interface ProposedOrder {
  /** Tells the order apart from the others proposed with it. */
  readonly key: string;
  /** How it is named in the switcher and in 移到…: what it is for. */
  readonly title: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly lines: readonly {
    readonly itemType: LineItemType;
    readonly modelId: string | null;
    readonly softwareProductId: string | null;
    readonly quantity: number;
  }[];
}

/**
 * 创建采购单 for orders proposed by the page it sits on (2026-10-22, from
 * the joiners' cards; since 2026-10-23 from 供需分析 alone): opens the
 * purchase order's own create dialog filled in, to be checked, priced and
 * saved as a draft or submitted. Several orders (another vendor) follow one
 * another, with a switcher; nothing is created until a dialog is saved.
 */
export function ProposedOrdersButton({
  orders,
  className,
  children,
}: {
  /** The orders to propose, worked out when it is pressed. */
  readonly orders: () => readonly ProposedOrder[];
  readonly className?: string;
  readonly children?: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const openRecord = useOpenRecord();
  // Whoever presses it follows the order through, as on any order they file.
  const me = useCurrentUserId();
  const [proposal, setProposal] = useState<readonly ProposedOrder[]>();
  const [index, setIndex] = useState(0);
  // The orders saved so far, by their place among the proposed ones.
  const [saved, setSaved] = useState<Readonly<Record<number, ItamRecord>>>({});
  // Lines moved between the proposed orders, by the order they went to.
  const [moved, setMoved] = useState<
    Readonly<Record<number, readonly { id: string; line: PurchaseLineDraft }[]>>
  >({});
  const vendorNames = useReferenceNames(
    useMemo(
      () => [
        {
          collection: 'vendors',
          ids: (proposal ?? []).map((order) => text(order.values.vendorId)),
        },
      ],
      [proposal],
    ),
  ).vendors;

  const propose = () => {
    const next = orders();
    if (next.length === 0) {
      toaster.show({ type: 'info', title: t('supplyDemand.orders.nothing') });
      return;
    }
    setSaved({});
    setMoved({});
    setIndex(0);
    setProposal(next);
  };

  /** Every dialog done or closed: say what was made, open the first. */
  const finish = async (made: readonly ItamRecord[]) => {
    setProposal(undefined);
    setSaved({});
    setMoved({});
    if (made.length === 0) return;
    await queryClient.invalidateQueries({ queryKey: ['itam'] });
    toaster.show({
      type: 'success',
      title: t('supplyDemand.orders.created', {
        count: made.length,
        orders: made
          .map((order) => text(order.orderNo))
          .join(t('common.listSeparator')),
      }),
    });
    const [first] = made;
    if (first) openRecord(`/procurement/${text(first.id)}`);
  };

  /** How an order is named in the switcher and in 移到…. */
  const labelOf = (order: ProposedOrder, at: number) => {
    const vendor = order.values.vendorId
      ? vendorNames?.get(text(order.values.vendorId))
      : undefined;
    return `${String(at + 1)}. ${order.title} · ${vendor ?? t('supplyDemand.orders.noVendor')}`;
  };

  // Every proposed order, to switch between (2026-10-22): each keeps what
  // was typed into it, and one saved shows its number instead.
  const switcher =
    proposal && proposal.length > 1 ? (
      <div className='flex flex-wrap gap-1.5'>
        {proposal.map((order, at) => {
          const done = saved[at];
          const vendor = order.values.vendorId
            ? vendorNames?.get(text(order.values.vendorId))
            : undefined;
          return (
            <Button
              key={order.key}
              size='sm'
              variant={at === index ? 'default' : 'outline'}
              disabled={Boolean(done)}
              onClick={() => setIndex(at)}
            >
              {done ? <Check data-icon='inline-start' /> : null}
              {`${String(at + 1)}. ${order.title}`}
              <span className='opacity-70'>
                {done
                  ? text(done.orderNo)
                  : (vendor ?? t('supplyDemand.orders.noVendor'))}
              </span>
            </Button>
          );
        })}
      </div>
    ) : undefined;

  return (
    <>
      <Button
        variant='ghost'
        // Green words, no icon (2026-10-23), underlined on hover as
        // every text link is (2026-10-23; no ground, no other colour); no
        // padding, so they sit the row's own gap from what is beside them.
        className={cn(
          'h-auto gap-1 p-0 text-primary underline-offset-4 hover:bg-transparent hover:text-primary hover:underline dark:hover:bg-transparent',
          className,
        )}
        onClick={propose}
      >
        {children ?? t('supplyDemand.orders.create')}
      </Button>
      {/* Each proposed order its own dialog, all kept mounted so what is
          typed into one survives looking at another; one shown at a time. */}
      {proposal?.map((order, at) => (
        <PurchaseOrderCreateDialog
          key={order.key}
          open={at === index && !saved[at]}
          initialValues={me ? { ownerId: me, ...order.values } : order.values}
          initialLines={order.lines}
          header={switcher}
          // A line may go to any other order not saved yet (2026-10-22):
          // one never bought here joins a vendor's order instead.
          moveTargets={proposal.flatMap((other, j) =>
            j !== at && !saved[j]
              ? [{ key: String(j), label: labelOf(other, j) }]
              : [],
          )}
          onMoveLine={(line, target) => {
            const to = Number(target);
            setMoved((current) => ({
              ...current,
              [to]: [...(current[to] ?? []), { id: crypto.randomUUID(), line }],
            }));
          }}
          inbox={moved[at]}
          onOpenChange={(open) => {
            // Closing stops the run; what was saved stays.
            if (!open) void finish(Object.values(saved));
          }}
          onCreated={(record) => {
            const next = { ...saved, [at]: record };
            setSaved(next);
            const left = proposal.findIndex((_, j) => !next[j]);
            if (left === -1) void finish(Object.values(next));
            else setIndex(left);
          }}
        />
      ))}
    </>
  );
}
