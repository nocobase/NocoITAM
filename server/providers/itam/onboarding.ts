import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { asText, decodeRow, type Row } from './collection-query.js';
import { today } from './dates.js';

/**
 * 入职配备: what a new joiner should be given, what they already have, and
 * which items in stock would make up the rest (2026-10-05).
 *
 * The kit is the rule (`onboardingKits`, by department and position); this
 * is the arithmetic on it, deterministic so that "which laptop" is a
 * computed answer rather than a guess — the page lists it and Noco presents
 * it, and neither invents a device. It writes nothing: every proposal is
 * carried out by the operation that already exists for it (reserve, issue,
 * assign a seat), under the reader's own grants.
 *
 * A kit item is a model, a category (any model in it or below it) or a
 * software product. What the person already holds or has reserved counts
 * first, each thing towards one item only; what is left is proposed from
 * stock — a device in stock and unreserved, nearest first (the person's own
 * location), then the longest warranty; a stock item with enough on hand;
 * an entitlement with a free seat — and whatever stock cannot cover is the
 * shortfall, for a purchase order.
 */

export type KitTargetType = 'model' | 'category' | 'softwareProduct';
export type KitItemKind = 'device' | 'stock' | 'entitlement';

export interface OnboardingKit {
  readonly id: string;
  readonly name: string;
  readonly departmentId: string;
  readonly position: string | null;
}

/** Something the person has towards an item, or that is proposed for it. */
export interface PlanThing {
  readonly type: 'device' | 'stock' | 'seat';
  /** The device, the stock item or the entitlement. */
  readonly id: string;
  readonly label: string;
  /** A device already theirs: assigned, or reserved for them. */
  readonly state?: 'assigned' | 'reserved';
  /** Stock: how many. */
  readonly quantity?: number;
}

export interface OnboardingPlanLine {
  readonly target: {
    readonly type: KitTargetType;
    readonly id: string;
    readonly name: string;
  };
  readonly kind: KitItemKind;
  readonly required: number;
  readonly prepared: readonly PlanThing[];
  readonly preparedCount: number;
  readonly proposals: readonly PlanThing[];
  /** What neither they nor stock can cover: to be bought. */
  readonly shortfall: number;
}

export interface OnboardingPlan {
  readonly personId: string;
  readonly hireDate: string | null;
  /** The kit that applies, or null when none does. */
  readonly kit: OnboardingKit | null;
  readonly lines: readonly OnboardingPlanLine[];
  /** Totals over the lines: the card's 已配备 N / M. */
  readonly prepared: number;
  readonly required: number;
  /** Whether they already hold or have reserved any device at all. */
  readonly hasDevice: boolean;
}

export interface OnboardingService {
  /** The kit for a department and position, walking up the departments. */
  kitFor(
    departmentId: string | null,
    position: string | null,
  ): Promise<OnboardingKit | null>;
  plan(personId: string): Promise<OnboardingPlan | null>;
}

export const onboardingServiceToken: ServiceToken<OnboardingService> =
  createServiceToken<OnboardingService>('itam/onboarding');

const STOCK_KINDS = new Set(['accessory', 'consumable', 'component']);

const same = (a: unknown, b: unknown): boolean =>
  String(a ?? '')
    .trim()
    .toLowerCase() ===
  String(b ?? '')
    .trim()
    .toLowerCase();

export function createOnboardingService(
  database: DatabaseManager,
): OnboardingService {
  const q = () => database.query();

  const kitFor: OnboardingService['kitFor'] = async (departmentId, position) => {
    let current = departmentId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      seen.add(current);
      const kits = await q()
        .selectFrom('onboardingKits')
        .select(['id', 'name', 'departmentId', 'position'])
        .where('departmentId', '=', current)
        .execute<Row>();
      // The position's own kit first, then the department's default.
      const match =
        (position && kits.find((kit) => same(kit.position, position))) ||
        kits.find((kit) => !asText(kit.position));
      if (match)
        return {
          id: String(match.id),
          name: String(match.name),
          departmentId: String(match.departmentId),
          position: asText(match.position) ?? null,
        };
      const parent = await q()
        .selectFrom('departments')
        .select(['parentId'])
        .where('id', '=', current)
        .executeTakeFirst<Row>();
      current = asText(parent?.parentId) ?? null;
    }
    return null;
  };

  /** A category and every category below it. */
  const categoryTree = async (id: string): Promise<Set<string>> => {
    const all = await q()
      .selectFrom('categories')
      .select(['id', 'parentId'])
      .execute<Row>();
    const found = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const row of all)
        if (
          !found.has(String(row.id)) &&
          found.has(String(asText(row.parentId) ?? ''))
        ) {
          found.add(String(row.id));
          grew = true;
        }
    }
    return found;
  };

  const plan: OnboardingService['plan'] = async (personId) => {
    const person = await q()
      .selectFrom('people')
      .select(['id', 'departmentId', 'position', 'locationId', 'hireDate'])
      .where('id', '=', personId)
      .executeTakeFirst<Row>();
    if (!person) return null;
    const kit = await kitFor(
      asText(person.departmentId) ?? null,
      asText(person.position) ?? null,
    );
    const locationId = asText(person.locationId) ?? null;

    // What they have now: devices assigned or reserved to them, stock they
    // hold, seats they hold.
    const devices = (
      await q()
        .selectFrom('devices')
        .select([
          'id',
          'deviceNo',
          'name',
          'modelId',
          'categoryId',
          'assigneeType',
          'assigneeId',
        ])
        .where((eb) =>
          eb.or([
            eb.and([
              eb('assigneeType', '=', 'person'),
              eb('assigneeId', '=', personId),
            ]),
            eb.and([
              eb('reservedForType', '=', 'person'),
              eb('reservedForId', '=', personId),
            ]),
          ]),
        )
        .execute<Row>()
    ).map((row) => ({
      row,
      state:
        asText(row.assigneeType) === 'person' &&
        asText(row.assigneeId) === personId
          ? ('assigned' as const)
          : ('reserved' as const),
    }));
    const holdings = await q()
      .selectFrom('stockHoldings')
      .innerJoin('stockItems', 'stockItems.id', 'stockHoldings.stockItemId')
      .select([
        'stockItems.id as id',
        'stockItems.name as name',
        'stockItems.modelId as modelId',
        'stockItems.categoryId as categoryId',
        'stockHoldings.quantity as quantity',
      ])
      .where('stockHoldings.holderType', '=', 'person')
      .where('stockHoldings.holderId', '=', personId)
      .where('stockHoldings.quantity', '>', 0)
      .execute<Row>();
    const seats = await q()
      .selectFrom('entitlementSeats')
      .innerJoin(
        'entitlements',
        'entitlements.id',
        'entitlementSeats.entitlementId',
      )
      .select([
        'entitlements.id as id',
        'entitlements.name as name',
        'entitlements.softwareProductId as softwareProductId',
      ])
      .where('entitlementSeats.holderType', '=', 'person')
      .where('entitlementSeats.holderId', '=', personId)
      .where('entitlementSeats.releasedAt', 'is', null)
      .execute<Row>();

    const usedDevices = new Set<string>();
    const usedSeats = new Set<number>();
    // Stock held counts down as items claim it: a holding of two mice covers
    // two mouse lines, not every one.
    const heldStock = holdings.map((row) => ({
      row,
      left: Number(row.quantity) || 0,
    }));
    const proposedDevices = new Set<string>();
    const proposedStock = new Map<string, number>();

    const items = (
      kit
        ? ((decodeRow(
            (await q()
              .selectFrom('onboardingKits')
              .select(['items'])
              .where('id', '=', kit.id)
              .executeTakeFirst<Row>()) ?? {},
          ).items as unknown[] | undefined) ?? [])
        : []
    ).filter(
      (item): item is Record<string, unknown> =>
        typeof item === 'object' && item !== null,
    );

    const lines: OnboardingPlanLine[] = [];
    for (const item of items) {
      const required = Math.max(1, Number(item.quantity) || 1);
      const modelId = asText(item.modelId);
      const categoryId = asText(item.categoryId);
      const productId = asText(item.softwareProductId);

      if (productId) {
        const product = await q()
          .selectFrom('softwareProducts')
          .select(['id', 'name'])
          .where('id', '=', productId)
          .executeTakeFirst<Row>();
        // A product since deleted leaves nothing to plan.
        if (!product) continue;
        const prepared: PlanThing[] = [];
        seats.forEach((seat, index) => {
          if (prepared.length >= required || usedSeats.has(index)) return;
          if (asText(seat.softwareProductId) !== productId) return;
          usedSeats.add(index);
          prepared.push({
            type: 'seat',
            id: String(seat.id),
            label: String(seat.name),
          });
        });
        const proposals: PlanThing[] = [];
        let missing = required - prepared.length;
        if (missing > 0) {
          const entitlements = await q()
            .selectFrom('entitlements')
            .select([
              'id',
              'name',
              'seatCount',
              'kind',
              'autoRenew',
              'expiryDate',
            ])
            .where('softwareProductId', '=', productId)
            .execute<Row>();
          const now = today();
          for (const entitlement of entitlements) {
            if (missing <= 0) break;
            // An ended subscription hands out nothing.
            if (
              asText(entitlement.kind) === 'subscription' &&
              !entitlement.autoRenew &&
              (asText(entitlement.expiryDate) ?? '9999') < now
            )
              continue;
            const held = await q()
              .selectFrom('entitlementSeats')
              .select((eb) => [eb.fn.countAll().as('count')])
              .where('entitlementId', '=', String(entitlement.id))
              .where('releasedAt', 'is', null)
              .executeTakeFirst<Row>();
            const free =
              entitlement.seatCount === null ||
              entitlement.seatCount === undefined
                ? Number.POSITIVE_INFINITY
                : Number(entitlement.seatCount) - Number(held?.count ?? 0);
            if (free <= 0) continue;
            // One person holds one seat of a product.
            proposals.push({
              type: 'seat',
              id: String(entitlement.id),
              label: String(entitlement.name),
            });
            missing -= 1;
          }
        }
        lines.push({
          target: {
            type: 'softwareProduct',
            id: productId,
            name: String(product.name),
          },
          kind: 'entitlement',
          required,
          prepared,
          preparedCount: prepared.length,
          proposals,
          shortfall: Math.max(0, missing),
        });
        continue;
      }

      // A model, or a category: what kind of thing it is follows its
      // category, the way a purchase line's does.
      const target = modelId
        ? await q()
            .selectFrom('models')
            .select(['id', 'name', 'categoryId'])
            .where('id', '=', modelId)
            .executeTakeFirst<Row>()
        : categoryId
          ? await q()
              .selectFrom('categories')
              .select(['id', 'name'])
              .where('id', '=', categoryId)
              .executeTakeFirst<Row>()
          : undefined;
      if (!target) continue;
      const category = await q()
        .selectFrom('categories')
        .select(['appliesTo'])
        .where('id', '=', String(modelId ? target.categoryId : target.id))
        .executeTakeFirst<Row>();
      const appliesTo = asText(category?.appliesTo) ?? '';
      const kind: KitItemKind = STOCK_KINDS.has(appliesTo) ? 'stock' : 'device';
      const categories = categoryId ? await categoryTree(categoryId) : null;
      const fits = (row: Row) =>
        modelId
          ? asText(row.modelId) === modelId
          : Boolean(categories?.has(String(asText(row.categoryId) ?? '')));

      const prepared: PlanThing[] = [];
      const proposals: PlanThing[] = [];
      let missing = required;
      if (kind === 'device') {
        for (const { row, state } of devices) {
          if (missing <= 0) break;
          if (usedDevices.has(String(row.id)) || !fits(row)) continue;
          usedDevices.add(String(row.id));
          prepared.push({
            type: 'device',
            id: String(row.id),
            label: `${String(row.deviceNo)} / ${String(row.name)}`,
            state,
          });
          missing -= 1;
        }
        if (missing > 0) {
          let candidates = q()
            .selectFrom('devices')
            .select([
              'id',
              'deviceNo',
              'name',
              'modelId',
              'categoryId',
              'locationId',
              'warrantyEndDate',
            ])
            .where('status', '=', 'inStock')
            .where('reservedForId', 'is', null);
          candidates = modelId
            ? candidates.where('modelId', '=', modelId)
            : candidates.where('categoryId', 'in', [...(categories ?? [])]);
          const rows = (await candidates.execute<Row>())
            .filter((row) => !proposedDevices.has(String(row.id)))
            // Nearest first, then the longest warranty left.
            .sort(
              (a, b) =>
                Number(asText(b.locationId) === locationId) -
                  Number(asText(a.locationId) === locationId) ||
                (asText(b.warrantyEndDate) ?? '').localeCompare(
                  asText(a.warrantyEndDate) ?? '',
                ),
            );
          for (const row of rows.slice(0, missing)) {
            proposedDevices.add(String(row.id));
            proposals.push({
              type: 'device',
              id: String(row.id),
              label: `${String(row.deviceNo)} / ${String(row.name)}`,
            });
          }
          missing -= proposals.length;
        }
      } else {
        for (const held of heldStock) {
          if (missing <= 0) break;
          if (held.left <= 0 || !fits(held.row)) continue;
          const take = Math.min(held.left, missing);
          held.left -= take;
          missing -= take;
          prepared.push({
            type: 'stock',
            id: String(held.row.id),
            label: String(held.row.name),
            quantity: take,
          });
        }
        if (missing > 0) {
          let candidates = q()
            .selectFrom('stockItems')
            .select([
              'id',
              'name',
              'modelId',
              'categoryId',
              'locationId',
              'totalQuantity',
              'usedQuantity',
            ]);
          candidates = modelId
            ? candidates.where('modelId', '=', modelId)
            : candidates.where('categoryId', 'in', [...(categories ?? [])]);
          const rows = (await candidates.execute<Row>())
            .map((row) => ({
              row,
              available:
                (Number(row.totalQuantity) || 0) -
                (Number(row.usedQuantity) || 0) -
                (proposedStock.get(String(row.id)) ?? 0),
            }))
            .filter((entry) => entry.available > 0)
            .sort(
              (a, b) =>
                Number(asText(b.row.locationId) === locationId) -
                  Number(asText(a.row.locationId) === locationId) ||
                b.available - a.available,
            );
          for (const { row, available } of rows) {
            if (missing <= 0) break;
            const take = Math.min(available, missing);
            proposedStock.set(
              String(row.id),
              (proposedStock.get(String(row.id)) ?? 0) + take,
            );
            proposals.push({
              type: 'stock',
              id: String(row.id),
              label: String(row.name),
              quantity: take,
            });
            missing -= take;
          }
        }
      }
      const preparedCount = prepared.reduce(
        (sum, thing) => sum + (thing.quantity ?? 1),
        0,
      );
      lines.push({
        target: {
          type: modelId ? 'model' : 'category',
          id: String(target.id),
          name: String(target.name),
        },
        kind,
        required,
        prepared,
        preparedCount,
        proposals,
        shortfall: Math.max(0, missing),
      });
    }

    return {
      personId,
      hireDate: asText(person.hireDate) ?? null,
      kit,
      lines,
      prepared: lines.reduce(
        (sum, line) => sum + Math.min(line.preparedCount, line.required),
        0,
      ),
      required: lines.reduce((sum, line) => sum + line.required, 0),
      hasDevice: devices.length > 0,
    };
  };

  return { kitFor, plan };
}
