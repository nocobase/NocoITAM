import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { useApi, type ItamRecord } from '@/lib/itam/api';
import { errorMessage, text } from '@/lib/itam/format';
import {
  PURCHASE_ORDERS_PATH,
  type LineItemType,
} from '@/lib/itam/procurement';
import { useCurrentUserId } from '@/lib/itam/permissions';
import { useOpenRecord } from '@/lib/itam/record-drawer';
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
  icon = true,
  className,
  children,
}: {
  readonly personId?: string;
  readonly keys?: readonly string[];
  /** Off where it sits among small words, as in a card's progress line. */
  readonly icon?: boolean;
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
  const [created, setCreated] = useState<readonly ItamRecord[]>([]);

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
      setCreated([]);
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
    setCreated([]);
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

  const order = proposal?.orders[index];
  return (
    <>
      <Button
        variant='ghost'
        // Words like the row's other actions, its padding taken back.
        className={cn('-mx-2.5 text-primary hover:text-primary', className)}
        disabled={propose.isPending}
        onClick={() => propose.mutate()}
      >
        {icon ? <FilePlus2 data-icon='inline-start' /> : null}
        {children ?? t('onboarding.draftOrder')}
      </Button>
      {proposal && order ? (
        <PurchaseOrderCreateDialog
          // A fresh form for each proposed order.
          key={index}
          open
          initialValues={me ? { ownerId: me, ...order.values } : order.values}
          initialLines={order.lines}
          step={{ index: index + 1, total: proposal.orders.length }}
          onOpenChange={(open) => {
            // Closing stops the run; what was saved stays.
            if (!open) void finish(created);
          }}
          onCreated={(record) => {
            const made = [...created, record];
            if (index + 1 < proposal.orders.length) {
              setCreated(made);
              setIndex(index + 1);
            } else void finish(made);
          }}
        />
      ) : null}
    </>
  );
}
