import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, FilePlus2 } from 'lucide-react';
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { useApi, type ItamRecord } from '@/lib/itam/api';
import { errorMessage, text } from '@/lib/itam/format';
import {
  PURCHASE_ORDERS_PATH,
  type LineItemType,
} from '@/lib/itam/procurement';
import { useCurrentUserId } from '@/lib/itam/permissions';
import type { PurchaseLineDraft } from '@/lib/itam/purchase-lines';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { useReferenceNames } from '@/lib/itam/references';
import { cn } from '@/lib/utils';
import { PurchaseOrderCreateDialog } from '@/pages/itam/procurement/create-dialog';

interface ProposedOrder {
  readonly values: Readonly<Record<string, unknown>>;
  readonly lines: readonly {
    readonly itemType: LineItemType;
    readonly modelId: string | null;
    readonly softwareProductId: string | null;
    readonly quantity: number;
  }[];
  readonly people: readonly string[];
}

/** An order's place among the proposed ones: a vendor and a joiner's day. */
const keyOf = (order: ProposedOrder) =>
  [
    order.values.vendorId,
    order.values.departmentId,
    order.values.neededBy,
    ...order.people,
  ].join('|');

interface Proposal {
  readonly orders: readonly ProposedOrder[];
  readonly skipped: readonly { readonly key: string; readonly name: string }[];
}

/**
 * 起草采购单 for what joiners are short of (2026-10-22): opens the purchase
 * order's own create dialog filled in — 新员工配备, needed by the joining
 * day, their department, the vendor each item was last bought from, a line
 * per item short — to be checked, priced and saved as a draft or submitted.
 * Several orders (another vendor, another joiner) follow one another, 第 1 /
 * 2 张; nothing is created until a dialog is saved. It asked Asset Steward
 * in the chat, then drafted straight away, before.
 *
 * Without `personId` and `keys` it proposes every joiner's shortfall.
 */
export function DraftOrdersButton({
  personId,
  keys,
  className,
  children,
}: {
  readonly personId?: string;
  readonly keys?: readonly string[];
  readonly className?: string;
  readonly children?: ReactNode;
}): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const toaster = useToaster();
  const queryClient = useQueryClient();
  const openRecord = useOpenRecord();
  // Whoever presses it follows the order through, as on any order they file.
  const me = useCurrentUserId();
  const [proposal, setProposal] = useState<Proposal>();
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
          ids: (proposal?.orders ?? []).map((order) =>
            text(order.values.vendorId),
          ),
        },
      ],
      [proposal],
    ),
  ).vendors;

  const skippedNote = (skipped: Proposal['skipped']) =>
    skipped.length > 0
      ? t('onboarding.drafts.skipped', {
          items: skipped
            .map((item) => item.name)
            .join(t('common.listSeparator')),
        })
      : undefined;

  const propose = useMutation({
    mutationFn: async () =>
      (
        await api.request<{ data: Proposal }>({
          path: `${PURCHASE_ORDERS_PATH}/joiner-proposals`,
          method: 'POST',
          json: {
            ...(personId ? { personId } : {}),
            ...(keys ? { keys } : {}),
            ...(i18n?.language ? { locale: i18n.language } : {}),
          },
        })
      ).data,
    onSuccess: (result) => {
      if (result.orders.length === 0) {
        const note = skippedNote(result.skipped);
        toaster.show({
          type: note ? 'warning' : 'info',
          title: note ?? t('onboarding.drafts.nothing'),
        });
        return;
      }
      setSaved({});
      setMoved({});
      setIndex(0);
      setProposal(result);
    },
    onError: (error) => {
      toaster.show({ type: 'error', title: errorMessage(error) });
    },
  });

  /** Every dialog done or closed: say what was made, open the first. */
  const finish = async (made: readonly ItamRecord[]) => {
    const skipped = proposal?.skipped ?? [];
    setProposal(undefined);
    setSaved({});
    setMoved({});
    if (made.length === 0) return;
    await queryClient.invalidateQueries({ queryKey: ['itam'] });
    const note = skippedNote(skipped);
    toaster.show({
      type: 'success',
      title: t('onboarding.drafts.created', {
        count: made.length,
        orders: made
          .map((order) => text(order.orderNo))
          .join(t('common.listSeparator')),
      }),
      ...(note ? { description: note } : {}),
    });
    const [first] = made;
    if (first) openRecord(`/procurement/${text(first.id)}`);
  };

  /** How an order is named in the switcher and in 移到…. */
  const labelOf = (order: ProposedOrder, at: number) => {
    const vendor = order.values.vendorId
      ? vendorNames?.get(text(order.values.vendorId))
      : undefined;
    return `${String(at + 1)}. ${order.people.join(t('common.listSeparator'))} · ${vendor ?? t('onboarding.drafts.noVendor')}`;
  };

  // Every proposed order, to switch between (2026-10-22): each keeps what
  // was typed into it, and one saved shows its number instead.
  const switcher =
    proposal && proposal.orders.length > 1 ? (
      <div className='flex flex-wrap gap-1.5'>
        {proposal.orders.map((order, at) => {
          const done = saved[at];
          const vendor = order.values.vendorId
            ? vendorNames?.get(text(order.values.vendorId))
            : undefined;
          return (
            <Button
              key={keyOf(order)}
              size='sm'
              variant={at === index ? 'default' : 'outline'}
              disabled={Boolean(done)}
              onClick={() => setIndex(at)}
            >
              {done ? <Check data-icon='inline-start' /> : null}
              {`${String(at + 1)}. ${order.people.join(t('common.listSeparator'))}`}
              <span className='opacity-70'>
                {done
                  ? text(done.orderNo)
                  : (vendor ?? t('onboarding.drafts.noVendor'))}
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
        // Green words with their icon everywhere, no ground on hover — the
        // words fade a little instead (2026-10-22); no padding, so they sit
        // the row's own gap from what is beside them.
        className={cn(
          'h-auto gap-1 p-0 text-primary hover:bg-transparent hover:text-primary/80 has-data-[icon=inline-start]:pl-0 dark:hover:bg-transparent',
          className,
        )}
        disabled={propose.isPending}
        onClick={() => propose.mutate()}
      >
        <FilePlus2 data-icon='inline-start' />
        {children ?? t('onboarding.draftOrder')}
      </Button>
      {/* Each proposed order its own dialog, all kept mounted so what is
          typed into one survives looking at another; one shown at a time. */}
      {proposal?.orders.map((order, at) => (
        <PurchaseOrderCreateDialog
          key={keyOf(order)}
          open={at === index && !saved[at]}
          initialValues={me ? { ownerId: me, ...order.values } : order.values}
          initialLines={order.lines}
          header={switcher}
          // A line may go to any other order not saved yet (2026-10-22):
          // one never bought here joins a vendor's order instead.
          moveTargets={proposal.orders.flatMap((other, j) =>
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
            const left = proposal.orders.findIndex((_, j) => !next[j]);
            if (left === -1) void finish(Object.values(next));
            else setIndex(left);
          }}
        />
      ))}
    </>
  );
}
