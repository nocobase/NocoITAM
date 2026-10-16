import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useApi } from './api.js';
import { PURCHASE_ORDERS_PATH } from './procurement.js';

/**
 * 报价比较 on the client (2026-10-17; `server/providers/itam/quote-comparisons.ts`):
 * the quotes a draft order is weighed against, as read by Noco and checked
 * by the requester, and the table the server counts from them.
 */

export const QUOTE_LIMIT = 5;

export interface QuoteLine {
  readonly lineId: string | null;
  readonly description?: string | null;
  readonly partCode?: string | null;
  readonly quantity?: number | null;
  readonly unitPrice?: number | null;
}

export interface Quote {
  readonly fileId?: string | null;
  readonly fileName?: string | null;
  readonly vendorName: string;
  readonly vendorId?: string | null;
  readonly currency?: string | null;
  readonly validUntil?: string | null;
  readonly deliveryDays?: number | null;
  readonly deliveryDate?: string | null;
  readonly warranty?: string | null;
  readonly paymentTerms?: string | null;
  readonly notes?: string | null;
  readonly lines: readonly QuoteLine[];
}

export interface Recommendation {
  readonly quoteIndex: number | null;
  readonly reasons: readonly string[];
  readonly said?: string;
}

export interface QuoteCell {
  readonly unitPrice: number | null;
  readonly quantity: number | null;
  readonly amount: number | null;
}

export interface ComparisonRow {
  readonly lineId: string;
  readonly itemType: string | null;
  readonly modelId: string | null;
  readonly softwareProductId: string | null;
  readonly quantity: number;
  readonly lastPrice: {
    readonly unitPrice: number;
    readonly orderNo: string | null;
    readonly vendorName: string | null;
    readonly at: string | null;
  } | null;
  readonly cells: readonly (QuoteCell | null)[];
  readonly lowest: number | null;
}

export interface QuoteTotal {
  readonly amount: number | null;
  readonly covered: number;
  readonly missing: number;
  readonly extras: number;
}

export interface ComparisonView {
  readonly purchaseOrderId: string;
  readonly quotes: readonly Quote[];
  readonly recommendation: Recommendation | null;
  readonly chosenIndex: number | null;
  readonly rows: readonly ComparisonRow[];
  readonly totals: readonly QuoteTotal[];
  readonly prices: boolean;
  readonly updatedAt: string;
}

export interface ComparisonInput {
  readonly quotes: readonly Quote[];
  readonly recommendation?: Recommendation | null;
  readonly chosenIndex?: number | null;
}

const keyOf = (orderId: string) =>
  ['itam', PURCHASE_ORDERS_PATH, 'quote-comparison', orderId] as const;

export function useQuoteComparison(
  orderId: string,
): UseQueryResult<ComparisonView | null> {
  const api = useApi();
  return useQuery({
    queryKey: keyOf(orderId),
    queryFn: async () =>
      (
        await api.request<{ data: ComparisonView | null }>({
          path: `${PURCHASE_ORDERS_PATH}/${orderId}/quote-comparison`,
        })
      ).data,
    enabled: Boolean(orderId),
  });
}

export function useSaveQuoteComparison(
  orderId: string,
): UseMutationResult<ComparisonView, Error, ComparisonInput> {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input) =>
      (
        await api.request<{ data: ComparisonView }>({
          path: `${PURCHASE_ORDERS_PATH}/${orderId}/quote-comparison`,
          method: 'POST',
          json: input,
        })
      ).data,
    onSuccess: (view) => queryClient.setQueryData(keyOf(orderId), view),
  });
}

const numberOf = (value: unknown): number | null => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const parsed =
    typeof value === 'number' ? value : Number(value.replace(/[,，\s]/g, ''));
  if (value === '') return null;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const textOf = (value: unknown, limit = 500): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed.slice(0, limit) : null;
};

/** A quote as the reading gave it, in the shape the server keeps. */
export function quoteFromReading(
  reading: Readonly<Record<string, unknown>>,
  lineIds: ReadonlySet<string>,
  file: { readonly fileId?: string; readonly fileName?: string },
): Quote {
  const lines = Array.isArray(reading.lines) ? reading.lines : [];
  const days = numberOf(reading.deliveryDays);
  return {
    ...(file.fileId ? { fileId: file.fileId } : {}),
    ...(file.fileName ? { fileName: file.fileName.slice(0, 500) } : {}),
    vendorName: textOf(reading.vendorName, 200) ?? '',
    currency: textOf(reading.currency, 8),
    validUntil: textOf(reading.validUntil),
    deliveryDays: days === null ? null : Math.round(days),
    deliveryDate: textOf(reading.deliveryDate),
    warranty: textOf(reading.warranty),
    paymentTerms: textOf(reading.paymentTerms),
    notes: textOf(reading.notes, 2000),
    lines: lines.slice(0, 200).map((entry) => {
      const line = (entry ?? {}) as Record<string, unknown>;
      const lineId = textOf(line.lineId, 64);
      return {
        lineId: lineId && lineIds.has(lineId) ? lineId : null,
        description: textOf(line.description),
        partCode: textOf(line.partCode),
        quantity: numberOf(line.quantity),
        unitPrice: numberOf(line.unitPrice),
      };
    }),
  };
}
