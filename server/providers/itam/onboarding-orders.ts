import type { DatabaseAuthorizationConditions } from '@nocobase/app-plugin-authorization/server';
import type { DatabaseManager } from '@nocobase/db';

import { asText, type Row } from './collection-query.js';
import type { OperationContext } from './devices.js';
import {
  isPrepared,
  type OnboardingPlanLine,
  type OnboardingService,
} from './onboarding.js';
import type {
  LineInput,
  LineItemType,
  ProcurementService,
} from './procurement.js';

/**
 * 起草采购单 for what joiners are short of (2026-10-22), without a model: the
 * plan already says what, how many, for whom and by when, and the vendor is
 * the one the item was last bought from. The drafts open for a person to
 * check and submit; nothing is ordered. It replaces asking Asset Steward in
 * the chat, which took a conversation to do what is arithmetic.
 *
 * One draft per vendor and joiner (people of one department starting the
 * same day share one): a 新员工配备 order counts as a joiner's own only when
 * its department and needed-by date are theirs (`ownOrders` in
 * `onboarding.ts`), so an order spanning joiners would leave their shortfall
 * standing and the next press would order it again.
 */
export interface JoinerOrderRequest {
  /** Only this joiner's shortfall; every joiner's when absent. */
  readonly personId?: string;
  /** Only these plan lines (`OnboardingPlanLine['key']`). */
  readonly keys?: readonly string[];
  /** The vendor for an item with no purchase to go by, by line key. */
  readonly vendors?: Readonly<Record<string, string>>;
  /** The language the drafts' description is written in. */
  readonly locale?: string;
}

export interface JoinerOrderResult {
  readonly created: readonly {
    readonly id: string;
    readonly orderNo: string;
  }[];
  /** Items no vendor could be found for: nothing is drafted until named. */
  readonly needsVendor: readonly {
    readonly key: string;
    readonly name: string;
  }[];
  /** Items naming a category rather than a model: a person picks the model. */
  readonly skipped: readonly { readonly key: string; readonly name: string }[];
}

interface Short {
  readonly personId: string;
  readonly line: OnboardingPlanLine;
}

/** Statuses an order no longer counts in as the place an item was bought. */
const WITHDRAWN = ['cancelled', 'rejected'];

export async function draftJoinerOrders(
  dependencies: {
    readonly database: DatabaseManager;
    readonly onboarding: OnboardingService;
    readonly procurement: ProcurementService;
  },
  request: JoinerOrderRequest,
  context: OperationContext,
  conditions: DatabaseAuthorizationConditions,
  lineConditions?: DatabaseAuthorizationConditions,
): Promise<JoinerOrderResult> {
  const { database, onboarding, procurement } = dependencies;
  const plans = await onboarding.plans();
  const shorts: Short[] = [];
  for (const [personId, plan] of plans) {
    if (request.personId && personId !== request.personId) continue;
    if (isPrepared(plan)) continue;
    for (const line of plan.lines)
      if (
        !line.waived &&
        line.shortfall > 0 &&
        (!request.keys || request.keys.includes(line.key))
      )
        shorts.push({ personId, line });
  }
  const skipped = unique(
    shorts.filter((short) => short.line.target.type === 'category'),
  );
  const buyable = shorts.filter(
    (short) => short.line.target.type !== 'category',
  );

  // Where each item was last bought, and as what (a software product's
  // order line says perpetual or subscription).
  const last = new Map<
    string,
    { vendorId: string | null; itemType: LineItemType | null }
  >();
  for (const { line } of buyable) {
    if (last.has(line.key)) continue;
    const column =
      line.target.type === 'model' ? 'modelId' : 'softwareProductId';
    const row = await database
      .query()
      .selectFrom('purchaseOrderLines')
      .innerJoin(
        'purchaseOrders',
        'purchaseOrders.id',
        'purchaseOrderLines.purchaseOrderId',
      )
      .select([
        'purchaseOrders.vendorId as vendorId',
        'purchaseOrderLines.itemType as itemType',
      ])
      .where(`purchaseOrderLines.${column}`, '=', line.target.id)
      .where('purchaseOrders.status', 'not in', WITHDRAWN)
      .where('purchaseOrders.vendorId', 'is not', null)
      .orderBy('purchaseOrders.createdAt', 'desc')
      .executeTakeFirst<Row>();
    last.set(line.key, {
      vendorId: asText(row?.vendorId) ?? null,
      itemType: (asText(row?.itemType) as LineItemType | undefined) ?? null,
    });
  }
  const vendorOf = (key: string) =>
    request.vendors?.[key] ?? last.get(key)?.vendorId ?? null;
  const needsVendor = unique(
    buyable.filter((short) => !vendorOf(short.line.key)),
  );
  if (needsVendor.length > 0 || buyable.length === 0)
    return { created: [], needsVendor, skipped };

  // A software product never bought here: its entitlements say which kind.
  const softwareKind = async (productId: string): Promise<LineItemType> => {
    const row = await database
      .query()
      .selectFrom('entitlements')
      .select(['kind'])
      .where('softwareProductId', '=', productId)
      .orderBy('createdAt', 'desc')
      .executeTakeFirst<Row>();
    return asText(row?.kind) === 'perpetual' ? 'perpetual' : 'subscription';
  };

  const people = new Map(
    (
      await database
        .query()
        .selectFrom('people')
        .select(['id', 'name', 'departmentId', 'hireDate'])
        .where('id', 'in', [...new Set(buyable.map((short) => short.personId))])
        .execute<Row>()
    ).map((row) => [String(row.id), row]),
  );
  const groups = new Map<
    string,
    {
      vendorId: string;
      departmentId: string | null;
      hireDate: string | null;
      people: Set<string>;
      lines: Map<string, { line: OnboardingPlanLine; quantity: number }>;
    }
  >();
  for (const { personId, line } of buyable) {
    const person = people.get(personId);
    const vendorId = vendorOf(line.key)!;
    const departmentId = asText(person?.departmentId) ?? null;
    const hireDate = asText(person?.hireDate) ?? null;
    const key = `${vendorId}|${departmentId ?? ''}|${hireDate ?? ''}`;
    const group = groups.get(key) ?? {
      vendorId,
      departmentId,
      hireDate,
      people: new Set<string>(),
      lines: new Map<string, { line: OnboardingPlanLine; quantity: number }>(),
    };
    group.people.add(personId);
    const entry = group.lines.get(line.key);
    group.lines.set(line.key, {
      line,
      quantity: (entry?.quantity ?? 0) + line.shortfall,
    });
    groups.set(key, group);
  }

  const chinese = (request.locale ?? '').startsWith('zh');
  const created: { id: string; orderNo: string }[] = [];
  for (const group of groups.values()) {
    const names = [...group.people].map(
      (id) => asText(people.get(id)?.name) ?? '',
    );
    const description = chinese
      ? `新员工配备：${names.join('、')}${group.hireDate ? `，${group.hireDate} 入职` : ''}`
      : `New hire kit: ${names.join(', ')}${group.hireDate ? `, joining ${group.hireDate}` : ''}`;
    const order = await procurement.create(
      {
        reason: 'newHire',
        description,
        vendorId: group.vendorId,
        ...(group.departmentId ? { departmentId: group.departmentId } : {}),
        ...(group.hireDate ? { neededBy: group.hireDate } : {}),
      },
      context,
      conditions,
    );
    const lines: LineInput[] = [];
    for (const { line, quantity } of group.lines.values()) {
      const model = line.target.type === 'model';
      lines.push({
        itemType: model
          ? ((line.itemType as LineItemType | null) ?? 'device')
          : (last.get(line.key)?.itemType ??
            (await softwareKind(line.target.id))),
        ...(model
          ? { modelId: line.target.id }
          : { softwareProductId: line.target.id }),
        quantity,
      });
    }
    await procurement.setLines(
      String(order.id),
      lines,
      context,
      conditions,
      lineConditions,
    );
    created.push({ id: String(order.id), orderNo: String(order.orderNo) });
  }
  return { created, needsVendor: [], skipped };
}

/** Each line once, by its key, named by its item. */
function unique(
  shorts: readonly Short[],
): { readonly key: string; readonly name: string }[] {
  const seen = new Map<string, string>();
  for (const { line } of shorts)
    if (!seen.has(line.key)) seen.set(line.key, line.target.name);
  return [...seen].map(([key, name]) => ({ key, name }));
}
