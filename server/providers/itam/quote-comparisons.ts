import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';
import { z } from 'zod';

import { asText, type Row } from './collection-query.js';
import { BusinessRuleError, RecordNotFoundError } from './errors.js';

/**
 * 报价比较 (2026-10-17): the quotes a purchase order is weighed against
 * before it is sent for approval. Each quote is read from its document by
 * Asset Steward (`ai-reading.ts`, task `purchaseQuote`) and checked by the person;
 * what is counted is counted here, without a model — each line's price in
 * each quote, the lowest, what a quote left out, every quote's total, and
 * what the same model or product cost on the last order that bought it.
 * Asset Steward's recommendation (task `quoteRecommendation`) and the quote the
 * requester took are kept with it. One comparison per order, replaced when
 * redone, and only while the order is a draft or was sent back, by its
 * requester — as its lines are. The approval assistant reads it.
 */

export const QUOTE_LIMIT = 5;

const money = z.number().min(0).nullable().optional();
const short = z.string().trim().max(500).nullable().optional();

export const quoteSchema = z
  .object({
    fileId: z.string().max(64).nullable().optional(),
    fileName: short,
    vendorName: z.string().trim().max(200),
    vendorId: z.string().max(64).nullable().optional(),
    currency: z.string().trim().max(8).nullable().optional(),
    validUntil: short,
    deliveryDays: z.number().int().min(0).max(3650).nullable().optional(),
    deliveryDate: short,
    warranty: short,
    paymentTerms: short,
    notes: z.string().trim().max(2000).nullable().optional(),
    lines: z
      .array(
        z
          .object({
            lineId: z.string().max(64).nullable().optional(),
            description: short,
            partCode: short,
            quantity: z.number().min(0).nullable().optional(),
            unitPrice: money,
          })
          .strict(),
      )
      .max(200),
  })
  .strict();

export const recommendationSchema = z
  .object({
    quoteIndex: z
      .number()
      .int()
      .min(0)
      .max(QUOTE_LIMIT - 1)
      .nullable(),
    reasons: z.array(z.string().trim().max(500)).max(5),
    said: z.string().trim().max(1000).optional(),
  })
  .strict();

export const comparisonInputSchema = z
  .object({
    quotes: z.array(quoteSchema).min(1).max(QUOTE_LIMIT),
    recommendation: recommendationSchema.nullable().optional(),
    chosenIndex: z
      .number()
      .int()
      .min(0)
      .max(QUOTE_LIMIT - 1)
      .nullable()
      .optional(),
  })
  .strict();

export type Quote = z.infer<typeof quoteSchema>;
export type ComparisonInput = z.infer<typeof comparisonInputSchema>;

/** One price in the table: a quote's for one of the order's lines. */
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
  /** What it cost on the last order that bought it, and from whom. */
  readonly lastPrice: {
    readonly unitPrice: number;
    readonly orderNo: string | null;
    readonly vendorName: string | null;
    readonly at: string | null;
  } | null;
  /** One per quote; null where the quote left the line out. */
  readonly cells: readonly (QuoteCell | null)[];
  /** The quote with the lowest unit price, when two or more priced it. */
  readonly lowest: number | null;
}

export interface QuoteTotal {
  readonly amount: number | null;
  /** The order's lines it prices, and those it leaves out. */
  readonly covered: number;
  readonly missing: number;
  /** What it adds that the order does not ask for. */
  readonly extras: number;
}

export interface ComparisonView {
  readonly purchaseOrderId: string;
  readonly quotes: readonly Quote[];
  readonly recommendation: z.infer<typeof recommendationSchema> | null;
  readonly chosenIndex: number | null;
  readonly rows: readonly ComparisonRow[];
  readonly totals: readonly QuoteTotal[];
  /** Whether prices are shown: a role without cost access sees none. */
  readonly prices: boolean;
  readonly updatedAt: string;
}

export interface QuoteComparisonService {
  /** The order's comparison with its table; null when it has none. */
  view(
    orderId: string,
    options: { readonly prices: boolean },
  ): Promise<ComparisonView | null>;
  /** Saves (replaces) the order's comparison, as its requester. */
  save(
    orderId: string,
    input: ComparisonInput,
    actorId: string,
  ): Promise<ComparisonView>;
}

export const quoteComparisonServiceToken: ServiceToken<QuoteComparisonService> =
  createServiceToken<QuoteComparisonService>('itam/quote-comparisons');

const EDITABLE = new Set(['draft', 'rejected']);
/** Orders whose price was really paid: not a draft, nor one turned down. */
const BOUGHT = ['approved', 'ordered', 'partiallyReceived', 'completed'];

const numberOf = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parsed = (value: unknown): unknown =>
  typeof value === 'string' ? (JSON.parse(value) as unknown) : value;

export function createQuoteComparisonService(
  database: DatabaseManager,
): QuoteComparisonService {
  const linesOf = (orderId: string) =>
    database
      .query()
      .selectFrom('purchaseOrderLines')
      .select([
        'id',
        'itemType',
        'modelId',
        'softwareProductId',
        'quantity',
        'sort',
      ])
      .where('purchaseOrderId', '=', orderId)
      .orderBy('sort')
      .execute<Row>();

  /** The last price paid for each model or product, on another order. */
  const lastPrices = async (
    orderId: string,
    lines: readonly Row[],
  ): Promise<Map<string, ComparisonRow['lastPrice']>> => {
    const prices = new Map<string, ComparisonRow['lastPrice']>();
    for (const line of lines) {
      const field = line.modelId
        ? 'purchaseOrderLines.modelId'
        : line.softwareProductId
          ? 'purchaseOrderLines.softwareProductId'
          : null;
      const item = asText(line.modelId) ?? asText(line.softwareProductId);
      if (!field || !item || prices.has(item)) continue;
      const row = await database
        .query()
        .selectFrom('purchaseOrderLines')
        .innerJoin(
          'purchaseOrders',
          'purchaseOrders.id',
          'purchaseOrderLines.purchaseOrderId',
        )
        .leftJoin('vendors', 'vendors.id', 'purchaseOrders.vendorId')
        .select([
          'purchaseOrderLines.unitPrice as unitPrice',
          'purchaseOrders.orderNo as orderNo',
          'purchaseOrders.createdAt as at',
          'vendors.name as vendorName',
        ])
        .where(field, '=', item)
        .where('purchaseOrders.id', '!=', orderId)
        .where('purchaseOrders.status', 'in', BOUGHT)
        .where('purchaseOrderLines.unitPrice', 'is not', null)
        .orderBy('purchaseOrders.createdAt', 'desc')
        .executeTakeFirst<Row>();
      const unitPrice = numberOf(row?.unitPrice);
      prices.set(
        item,
        row && unitPrice !== null
          ? {
              unitPrice,
              orderNo: asText(row.orderNo) ?? null,
              vendorName: asText(row.vendorName) ?? null,
              at: asText(row.at)?.slice(0, 10) ?? null,
            }
          : null,
      );
    }
    return prices;
  };

  /** The table: what is counted, never what is judged. */
  const tableOf = async (
    orderId: string,
    quotes: readonly Quote[],
    prices: boolean,
  ) => {
    const lines = await linesOf(orderId);
    const last: ReadonlyMap<string, ComparisonRow['lastPrice']> = prices
      ? await lastPrices(orderId, lines)
      : new Map();
    const lineIds = new Set(lines.map((line) => String(line.id)));
    const rows: ComparisonRow[] = lines.map((line) => {
      const quantity = numberOf(line.quantity) ?? 0;
      const cells = quotes.map((quote) => {
        const priced = quote.lines.find(
          (entry) => entry.lineId === String(line.id),
        );
        if (!priced) return null;
        const unitPrice = prices ? (priced.unitPrice ?? null) : null;
        const count = priced.quantity ?? quantity;
        return {
          unitPrice,
          quantity: priced.quantity ?? null,
          amount: unitPrice === null ? null : unitPrice * count,
        };
      });
      const offered = cells
        .map((cell, index) => ({ index, price: cell?.unitPrice ?? null }))
        .filter(
          (entry): entry is { index: number; price: number } =>
            entry.price !== null,
        );
      const lowest =
        offered.length >= 2
          ? offered.reduce((best, entry) =>
              entry.price < best.price ? entry : best,
            ).index
          : null;
      const item = asText(line.modelId) ?? asText(line.softwareProductId);
      return {
        lineId: String(line.id),
        itemType: asText(line.itemType) ?? null,
        modelId: asText(line.modelId) ?? null,
        softwareProductId: asText(line.softwareProductId) ?? null,
        quantity,
        lastPrice: (item ? last.get(item) : null) ?? null,
        cells,
        lowest,
      };
    });
    const totals: QuoteTotal[] = quotes.map((quote, index) => {
      const covered = rows.filter((row) => row.cells[index]).length;
      const extras = quote.lines.filter(
        (entry) => !entry.lineId || !lineIds.has(entry.lineId),
      ).length;
      const amounts = rows
        .map((row) => row.cells[index]?.amount ?? null)
        .filter((amount): amount is number => amount !== null);
      return {
        amount:
          prices && amounts.length
            ? amounts.reduce((sum, amount) => sum + amount, 0)
            : null,
        covered,
        missing: rows.length - covered,
        extras,
      };
    });
    return { rows, totals };
  };

  const stored = async (orderId: string) => {
    const row = await database
      .query()
      .selectFrom('purchaseQuoteComparisons')
      .selectAll()
      .where('purchaseOrderId', '=', orderId)
      .executeTakeFirst<Row>();
    if (!row) return null;
    return {
      quotes: z.array(quoteSchema).catch([]).parse(parsed(row.quotes)),
      recommendation: recommendationSchema
        .nullable()
        .catch(null)
        .parse(parsed(row.recommendation) ?? null),
      chosenIndex: numberOf(row.chosenIndex),
      updatedAt: asText(row.updatedAt) ?? '',
    };
  };

  const service: QuoteComparisonService = {
    async view(orderId, { prices }) {
      const found = await stored(orderId);
      if (!found) return null;
      const quotes = prices
        ? found.quotes
        : found.quotes.map((quote) => ({
            ...quote,
            lines: quote.lines.map((line) => ({ ...line, unitPrice: null })),
          }));
      return {
        purchaseOrderId: orderId,
        quotes,
        recommendation: found.recommendation,
        chosenIndex: found.chosenIndex,
        ...(await tableOf(orderId, quotes, prices)),
        prices,
        updatedAt: found.updatedAt,
      };
    },

    async save(orderId, input, actorId) {
      const order = await database
        .query()
        .selectFrom('purchaseOrders')
        .select(['id', 'status', 'ownerId', 'createdById'])
        .where('id', '=', orderId)
        .executeTakeFirst<Row>();
      if (!order) throw new RecordNotFoundError('purchaseOrders', orderId);
      if (!EDITABLE.has(String(order.status)))
        throw new BusinessRuleError(
          'Quotes are compared before the order is sent for approval',
          'INVALID_STATUS',
        );
      if (
        actorId !== asText(order.ownerId) &&
        actorId !== asText(order.createdById)
      )
        throw new BusinessRuleError(
          'Only the owner can edit, submit or withdraw this request',
          'NOT_OWNER',
        );
      if (
        input.chosenIndex !== null &&
        input.chosenIndex !== undefined &&
        input.chosenIndex >= input.quotes.length
      )
        throw new BusinessRuleError('No such quote', 'INVALID_QUOTE');
      // A line a quote names must be one of this order's.
      const lineIds = new Set(
        (await linesOf(orderId)).map((line) => String(line.id)),
      );
      const quotes = input.quotes.map((quote) => ({
        ...quote,
        lines: quote.lines.map((line) => ({
          ...line,
          lineId: line.lineId && lineIds.has(line.lineId) ? line.lineId : null,
        })),
      }));
      const now = new Date();
      await database.transaction(async (connection) => {
        await connection.query
          .deleteFrom('purchaseQuoteComparisons')
          .where('purchaseOrderId', '=', orderId)
          .execute();
        await connection.query
          .insertInto('purchaseQuoteComparisons')
          .values({
            id: crypto.randomUUID(),
            purchaseOrderId: orderId,
            quotes,
            recommendation: input.recommendation ?? null,
            chosenIndex: input.chosenIndex ?? null,
            createdById: actorId,
            createdAt: now,
            updatedAt: now,
          })
          .execute();
      });
      return (await service.view(orderId, { prices: true }))!;
    },
  };
  return service;
}
