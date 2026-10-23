import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FilePlus2 } from 'lucide-react';
import { useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useApi } from '@/lib/itam/api';
import { errorMessage } from '@/lib/itam/format';
import { PURCHASE_ORDERS_PATH } from '@/lib/itam/procurement';
import { useOpenRecord } from '@/lib/itam/record-drawer';
import { cn } from '@/lib/utils';

import { ReferenceSelect } from './reference-select.js';

interface DraftResult {
  readonly created: readonly {
    readonly id: string;
    readonly orderNo: string;
  }[];
  readonly needsVendor: readonly {
    readonly key: string;
    readonly name: string;
  }[];
  readonly skipped: readonly { readonly key: string; readonly name: string }[];
}

/**
 * 起草采购单 for what joiners are short of (2026-10-22): drafts straight
 * away and opens the draft in the drawer to be checked and submitted — a
 * draft per vendor, the vendor where each item was last bought. An item
 * never bought here asks for its vendor first, in a small dialog. It
 * replaced asking Asset Steward in the chat for the same arithmetic.
 *
 * Without `personId` and `keys` it drafts for every joiner's shortfall.
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
  const [asking, setAsking] = useState<DraftResult['needsVendor']>([]);
  const [vendors, setVendors] = useState<Record<string, string>>({});

  const draft = useMutation({
    mutationFn: async (chosen?: Record<string, string>) =>
      (
        await api.request<{ data: DraftResult }>({
          path: `${PURCHASE_ORDERS_PATH}/draft-for-joiners`,
          method: 'POST',
          json: {
            ...(personId ? { personId } : {}),
            ...(keys ? { keys } : {}),
            ...(chosen ? { vendors: chosen } : {}),
            ...(i18n?.language ? { locale: i18n.language } : {}),
          },
        })
      ).data,
    onSuccess: async (result) => {
      if (result.needsVendor.length > 0) {
        setAsking(result.needsVendor);
        return;
      }
      setAsking([]);
      setVendors({});
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
      const skipped = result.skipped.map((item) => item.name);
      if (result.created.length === 0) {
        toaster.show({
          type: skipped.length > 0 ? 'warning' : 'info',
          title:
            skipped.length > 0
              ? t('onboarding.drafts.skipped', {
                  items: skipped.join(t('common.listSeparator')),
                })
              : t('onboarding.drafts.nothing'),
        });
        return;
      }
      toaster.show({
        type: 'success',
        title: t('onboarding.drafts.created', {
          count: result.created.length,
          orders: result.created
            .map((order) => order.orderNo)
            .join(t('common.listSeparator')),
        }),
        ...(skipped.length > 0
          ? {
              description: t('onboarding.drafts.skipped', {
                items: skipped.join(t('common.listSeparator')),
              }),
            }
          : {}),
      });
      // The first draft opens to be checked; the toast names the rest.
      const [first] = result.created;
      if (first) openRecord(`/procurement/${first.id}`);
    },
    onError: (error) => {
      toaster.show({ type: 'error', title: errorMessage(error) });
    },
  });

  const named = asking.every((item) => Boolean(vendors[item.key]));
  return (
    <>
      <Button
        variant='ghost'
        // Words like the row's other actions, its padding taken back.
        className={cn('-mx-2.5 text-primary hover:text-primary', className)}
        disabled={draft.isPending}
        onClick={() => draft.mutate(undefined)}
      >
        {icon ? <FilePlus2 data-icon='inline-start' /> : null}
        {children ?? t('onboarding.draftOrder')}
      </Button>
      <Dialog
        open={asking.length > 0}
        onOpenChange={(open) => {
          if (!open) setAsking([]);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('onboarding.drafts.vendorTitle')}</DialogTitle>
            <DialogDescription>
              {t('onboarding.drafts.vendorHint')}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            {asking.map((item) => (
              <div key={item.key} className='space-y-1.5'>
                <Label>{item.name}</Label>
                <ReferenceSelect
                  reference={{ collection: 'vendors' }}
                  value={vendors[item.key] ?? null}
                  onChange={(value) =>
                    setVendors((current) => {
                      const next = { ...current };
                      if (value) next[item.key] = value;
                      else delete next[item.key];
                      return next;
                    })
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => setAsking([])}>
              {t('actions.cancel')}
            </Button>
            <Button
              disabled={!named || draft.isPending}
              onClick={() => draft.mutate(vendors)}
            >
              {t('onboarding.draftOrder')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
