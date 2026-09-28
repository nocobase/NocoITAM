import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Perpetual licenses and SaaS subscriptions become one `entitlements` table
 * with a `kind` (docs/IMPLEMENTATION_PLAN.md, 2026-09-20): the user works
 * with one 授权 object, and the two workflows (seat compliance vs billing
 * and renewal) are columns of one record rather than two tables. Seats and
 * bills follow: a seat holds a person or device and, for subscriptions,
 * the account. Everything that named the old tables — history, change
 * log, reminders, attachment links, contract coverage, receipts, purchase
 * lines, pending AI actions, demo bookkeeping — is rewritten in place.
 *
 * The perpetual `licenseType` (perpetual / fixed term / trial) disappears:
 * a perpetual entitlement never expires (only its maintenance does), so a
 * fixed-term or trial license becomes a flat-fee yearly subscription with
 * its expiry date. Rolling back recreates the old schema and copies the
 * rows back by kind.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609200002_merge_entitlements',

  async up({ builder, query }) {
    await builder.createCollection('entitlements', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      // perpetual | subscription
      collection.string('kind', { length: 16 }).notNull();
      collection.string('softwareProductId', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      // Perpetual: perUser | perDevice | concurrent | perCore | site | free
      collection.string('licensingModel', { length: 16 }).nullable();
      // null = unlimited (site licence, flat-fee subscription)
      collection.integer('seatCount').nullable();
      collection.integer('assignedCount').notNull().defaultTo(0);
      // compliant | overAllocated | idle — computed for both kinds
      collection.string('complianceStatus', { length: 16 }).notNull();
      collection.text('productKey').nullable();
      collection.boolean('reassignable').notNull().defaultTo(true);
      collection.date('startDate').nullable();
      collection.date('expiryDate').nullable();
      collection.date('maintenanceExpiryDate').nullable();
      collection.string('vendorId', { length: 64 }).nullable();
      collection.string('purchaseOrderId', { length: 64 }).nullable();
      collection
        .decimal('purchasePrice', { precision: 18, scale: 2 })
        .nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.string('contractId', { length: 64 }).nullable();
      // Subscription: perSeat | usage | flat
      collection.string('billingModel', { length: 16 }).nullable();
      // Subscription: month | quarter | year
      collection.string('billingCycle', { length: 16 }).nullable();
      collection.decimal('unitPrice', { precision: 18, scale: 2 }).nullable();
      collection.decimal('cycleCost', { precision: 18, scale: 2 }).nullable();
      collection.decimal('annualCost', { precision: 18, scale: 2 }).nullable();
      collection.boolean('autoRenew').notNull().defaultTo(false);
      // Subscription: notDue | underReview | renew | reduceSeats | cancel | renewed
      collection.string('renewalDecision', { length: 16 }).nullable();
      collection.string('businessOwnerId', { length: 64 }).nullable();
      collection.string('consoleUrl', { length: 512 }).nullable();
      collection.string('dataRegion', { length: 128 }).nullable();
      // yes | no | unknown
      collection.string('sensitiveData', { length: 8 }).nullable();
      collection.text('notes').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_entitlements' });
      collection.index('kind', { name: 'idx_entitlements_kind' });
      collection.index('softwareProductId', {
        name: 'idx_entitlements_product',
      });
      collection.index('complianceStatus', {
        name: 'idx_entitlements_compliance',
      });
      collection.index('expiryDate', { name: 'idx_entitlements_expiry' });
      collection.index('renewalDecision', {
        name: 'idx_entitlements_decision',
      });
    });
    await builder.createCollection('entitlementSeats', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('entitlementId', { length: 64 }).notNull();
      // person | device
      collection.string('holderType', { length: 16 }).notNull();
      // A subscription account need not belong to a known person.
      collection.string('holderId', { length: 64 }).nullable();
      collection.string('account', { length: 255 }).nullable();
      collection.datetime('assignedAt').notNull();
      collection.datetime('lastUsedAt').nullable();
      collection.datetime('releasedAt').nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.primary('id', { name: 'pk_entitlement_seats' });
      collection.index(['entitlementId', 'releasedAt'], {
        name: 'idx_entitlement_seats_entitlement',
      });
      collection.index(['holderType', 'holderId', 'releasedAt'], {
        name: 'idx_entitlement_seats_holder',
      });
      collection.index('account', { name: 'idx_entitlement_seats_account' });
    });
    await builder.createCollection('entitlementBills', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('entitlementId', { length: 64 }).notNull();
      collection.date('periodStart').notNull();
      collection.date('periodEnd').notNull();
      collection.decimal('amount', { precision: 18, scale: 2 }).notNull();
      collection.string('currency', { length: 8 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_entitlement_bills' });
      collection.index(['entitlementId', 'periodStart'], {
        name: 'idx_entitlement_bills_entitlement',
      });
    });

    type Row = Record<string, unknown>;
    const licenses = await query
      .selectFrom('licenses')
      .selectAll()
      .execute<Row>();
    for (const row of licenses) {
      const perpetual = row.licenseType === 'perpetual';
      await query
        .insertInto('entitlements')
        .values({
          id: row.id,
          kind: perpetual ? 'perpetual' : 'subscription',
          softwareProductId: row.softwareProductId,
          name: row.name,
          licensingModel: perpetual ? row.licensingModel : null,
          seatCount: row.seatCount ?? null,
          assignedCount: row.assignedCount ?? 0,
          complianceStatus: row.complianceStatus ?? 'compliant',
          productKey: perpetual ? (row.productKey ?? null) : null,
          reassignable: row.reassignable ?? true,
          startDate: row.effectiveDate ?? null,
          expiryDate: perpetual
            ? null
            : (row.expiryDate ?? row.maintenanceExpiryDate ?? row.createdAt),
          maintenanceExpiryDate: perpetual
            ? (row.maintenanceExpiryDate ?? null)
            : null,
          vendorId: row.vendorId ?? null,
          purchaseOrderId: row.purchaseOrderId ?? null,
          purchasePrice: perpetual ? (row.purchasePrice ?? null) : null,
          currency: row.currency ?? null,
          contractId: row.contractId ?? null,
          billingModel: perpetual ? null : 'flat',
          billingCycle: perpetual ? null : 'year',
          unitPrice: null,
          cycleCost: perpetual ? null : (row.purchasePrice ?? null),
          annualCost: perpetual ? null : (row.purchasePrice ?? null),
          autoRenew: false,
          renewalDecision: perpetual ? null : 'notDue',
          businessOwnerId: null,
          consoleUrl: null,
          dataRegion: null,
          sensitiveData: perpetual ? null : 'unknown',
          notes: row.notes ?? null,
          ownerId: row.ownerId,
          createdById: row.createdById ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })
        .execute();
    }
    const subscriptions = await query
      .selectFrom('subscriptions')
      .selectAll()
      .execute<Row>();
    for (const row of subscriptions) {
      const seatCount =
        row.seatCount === null || row.seatCount === undefined
          ? null
          : Number(row.seatCount);
      await query
        .insertInto('entitlements')
        .values({
          id: row.id,
          kind: 'subscription',
          softwareProductId: row.softwareProductId,
          name: row.name,
          licensingModel: null,
          seatCount,
          assignedCount: row.assignedCount ?? 0,
          complianceStatus:
            seatCount !== null && Number(row.assignedCount ?? 0) > seatCount
              ? 'overAllocated'
              : 'compliant',
          productKey: null,
          reassignable: true,
          startDate: row.startDate ?? null,
          expiryDate: row.expiryDate ?? null,
          maintenanceExpiryDate: null,
          vendorId: row.providerVendorId ?? null,
          purchaseOrderId: null,
          purchasePrice: null,
          currency: row.currency ?? null,
          contractId: row.contractId ?? null,
          billingModel: row.billingModel,
          billingCycle: row.billingCycle,
          unitPrice: row.unitPrice ?? null,
          cycleCost: row.cycleCost ?? null,
          annualCost: row.annualCost ?? null,
          autoRenew: row.autoRenew ?? false,
          renewalDecision: row.renewalDecision ?? 'notDue',
          businessOwnerId: row.businessOwnerId ?? null,
          consoleUrl: row.consoleUrl ?? null,
          dataRegion: row.dataRegion ?? null,
          sensitiveData: row.sensitiveData ?? 'unknown',
          notes: row.notes ?? null,
          ownerId: row.itOwnerId,
          createdById: row.createdById ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })
        .execute();
    }
    for (const seat of await query
      .selectFrom('licenseSeats')
      .selectAll()
      .execute<Row>()) {
      await query
        .insertInto('entitlementSeats')
        .values({
          id: seat.id,
          entitlementId: seat.licenseId,
          holderType: seat.holderType,
          holderId: seat.holderId,
          account: null,
          assignedAt: seat.assignedAt,
          lastUsedAt: seat.lastUsedAt ?? null,
          releasedAt: seat.releasedAt ?? null,
          actorId: seat.actorId ?? null,
        })
        .execute();
    }
    for (const seat of await query
      .selectFrom('subscriptionSeats')
      .selectAll()
      .execute<Row>()) {
      await query
        .insertInto('entitlementSeats')
        .values({
          id: seat.id,
          entitlementId: seat.subscriptionId,
          holderType: 'person',
          holderId: seat.personId ?? null,
          account: seat.account,
          assignedAt: seat.assignedAt,
          lastUsedAt: seat.lastUsedAt ?? null,
          releasedAt: seat.releasedAt ?? null,
          actorId: seat.actorId ?? null,
        })
        .execute();
    }
    for (const bill of await query
      .selectFrom('subscriptionBills')
      .selectAll()
      .execute<Row>()) {
      await query
        .insertInto('entitlementBills')
        .values({
          id: bill.id,
          entitlementId: bill.subscriptionId,
          periodStart: bill.periodStart,
          periodEnd: bill.periodEnd,
          amount: bill.amount,
          currency: bill.currency ?? null,
          notes: bill.notes ?? null,
          createdById: bill.createdById ?? null,
          createdAt: bill.createdAt,
        })
        .execute();
    }

    // Everything that pointed at the old tables by name.
    const OLD = ['licenses', 'subscriptions'];
    for (const table of ['historyEvents', 'changeLogs', 'reminders'] as const)
      await query
        .updateTable(table)
        .set({ subjectType: 'entitlements' })
        .where('subjectType', 'in', OLD)
        .execute();
    // Renamed fields keep their change history readable.
    for (const [from, to] of [
      ['effectiveDate', 'startDate'],
      ['providerVendorId', 'vendorId'],
      ['itOwnerId', 'ownerId'],
    ] as const)
      await query
        .updateTable('changeLogs')
        .set({ field: to })
        .where('subjectType', '=', 'entitlements')
        .where('field', '=', from)
        .execute();
    await query
      .deleteFrom('changeLogs')
      .where('subjectType', '=', 'entitlements')
      .where('field', '=', 'licenseType')
      .execute();
    for (const [from, to] of [
      ['subscriptionExpiring', 'entitlementExpiring'],
      ['licenseOverAllocated', 'entitlementOverAllocated'],
    ] as const)
      await query
        .updateTable('reminders')
        .set({ kind: to })
        .where('kind', '=', from)
        .execute();
    await query
      .updateTable('attachmentLinks')
      .set({ ownerType: 'entitlements' })
      .where('ownerType', 'in', OLD)
      .execute();
    await query
      .updateTable('demoRecords')
      .set({ collection: 'entitlements' })
      .where('collection', 'in', OLD)
      .execute();
    await query
      .updateTable('contractCoverages')
      .set({ targetType: 'entitlement' })
      .where('targetType', 'in', ['license', 'subscription'])
      .execute();
    await query
      .updateTable('purchaseReceipts')
      .set({ generatedType: 'entitlement' })
      .where('generatedType', 'in', ['license', 'subscription'])
      .execute();
    await query
      .updateTable('purchaseOrderLines')
      .set({ itemType: 'perpetual' })
      .where('itemType', '=', 'license')
      .execute();
    // Seat events on people and devices named the license or subscription.
    const seatEvents = await query
      .selectFrom('historyEvents')
      .select(['id', 'payload'])
      .where('type', 'in', ['seatAssign', 'seatReclaim'])
      .execute<{ id: string; payload: unknown }>();
    for (const event of seatEvents) {
      const payload = parseJson(event.payload);
      if (!payload) continue;
      const entitlementId = payload.licenseId ?? payload.subscriptionId;
      if (entitlementId === undefined) continue;
      delete payload.licenseId;
      delete payload.subscriptionId;
      await query
        .updateTable('historyEvents')
        .set({ payload: JSON.stringify({ ...payload, entitlementId }) })
        .where('id', '=', event.id)
        .execute();
    }
    // Pending assistant proposals carry the operation input.
    const actions = await query
      .selectFrom('aiActions')
      .select(['id', 'payload', 'rows'])
      .where('actionType', 'in', ['seatAssign', 'seatReclaim'])
      .execute<{ id: string; payload: unknown; rows: unknown }>();
    for (const action of actions) {
      const payload = parseJson(action.payload);
      const rows = parseJsonArray(action.rows);
      const rename = (input: Record<string, unknown>) => {
        if ('licenseId' in input) {
          input.entitlementId = input.licenseId;
          delete input.licenseId;
        }
        return input;
      };
      await query
        .updateTable('aiActions')
        .set({
          payload: JSON.stringify(payload ? rename(payload) : {}),
          ...(rows
            ? {
                rows: JSON.stringify(
                  rows.map((row) =>
                    row.params && typeof row.params === 'object'
                      ? {
                          ...row,
                          params: rename(row.params as Record<string, unknown>),
                        }
                      : row,
                  ),
                ),
              }
            : {}),
        })
        .where('id', '=', action.id)
        .execute();
    }

    await builder.dropCollection('subscriptionBills');
    await builder.dropCollection('subscriptionSeats');
    await builder.dropCollection('licenseSeats');
    await builder.dropCollection('subscriptions');
    await builder.dropCollection('licenses');
  },

  async down({ builder, query }) {
    await builder.createCollection('licenses', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('softwareProductId', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('licensingModel', { length: 16 }).notNull();
      collection.string('licenseType', { length: 16 }).notNull();
      collection.integer('seatCount').nullable();
      collection.integer('assignedCount').notNull().defaultTo(0);
      collection.string('complianceStatus', { length: 16 }).notNull();
      collection.text('productKey').nullable();
      collection.date('effectiveDate').nullable();
      collection.date('expiryDate').nullable();
      collection.date('maintenanceExpiryDate').nullable();
      collection.string('vendorId', { length: 64 }).nullable();
      collection.string('purchaseOrderId', { length: 64 }).nullable();
      collection
        .decimal('purchasePrice', { precision: 18, scale: 2 })
        .nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.string('contractId', { length: 64 }).nullable();
      collection.boolean('reassignable').notNull().defaultTo(true);
      collection.text('notes').nullable();
      collection.string('ownerId', { length: 64 }).notNull();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_licenses' });
      collection.index('softwareProductId', { name: 'idx_licenses_product' });
      collection.index('complianceStatus', { name: 'idx_licenses_compliance' });
      collection.index('expiryDate', { name: 'idx_licenses_expiry' });
    });
    await builder.createCollection('licenseSeats', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('licenseId', { length: 64 }).notNull();
      collection.string('holderType', { length: 16 }).notNull();
      collection.string('holderId', { length: 64 }).notNull();
      collection.datetime('assignedAt').notNull();
      collection.datetime('lastUsedAt').nullable();
      collection.datetime('releasedAt').nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.primary('id', { name: 'pk_license_seats' });
      collection.index(['licenseId', 'releasedAt'], {
        name: 'idx_license_seats_license',
      });
      collection.index(['holderType', 'holderId', 'releasedAt'], {
        name: 'idx_license_seats_holder',
      });
    });
    await builder.createCollection('subscriptions', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('softwareProductId', { length: 64 }).notNull();
      collection.string('name', { length: 255 }).notNull();
      collection.string('providerVendorId', { length: 64 }).nullable();
      collection.string('consoleUrl', { length: 512 }).nullable();
      collection.string('billingModel', { length: 16 }).notNull();
      collection.integer('seatCount').nullable();
      collection.integer('assignedCount').notNull().defaultTo(0);
      collection.string('billingCycle', { length: 16 }).notNull();
      collection.decimal('unitPrice', { precision: 18, scale: 2 }).nullable();
      collection.decimal('cycleCost', { precision: 18, scale: 2 }).nullable();
      collection.string('currency', { length: 8 }).nullable();
      collection.decimal('annualCost', { precision: 18, scale: 2 }).nullable();
      collection.date('startDate').nullable();
      collection.date('expiryDate').notNull();
      collection.boolean('autoRenew').notNull().defaultTo(false);
      collection.string('renewalDecision', { length: 16 }).notNull();
      collection.string('businessOwnerId', { length: 64 }).notNull();
      collection.string('itOwnerId', { length: 64 }).notNull();
      collection.string('dataRegion', { length: 128 }).nullable();
      collection
        .string('sensitiveData', { length: 8 })
        .notNull()
        .defaultTo('unknown');
      collection.string('contractId', { length: 64 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.primary('id', { name: 'pk_subscriptions' });
      collection.index('softwareProductId', {
        name: 'idx_subscriptions_product',
      });
      collection.index('expiryDate', { name: 'idx_subscriptions_expiry' });
      collection.index('renewalDecision', {
        name: 'idx_subscriptions_decision',
      });
    });
    await builder.createCollection('subscriptionSeats', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('subscriptionId', { length: 64 }).notNull();
      collection.string('personId', { length: 64 }).nullable();
      collection.string('account', { length: 255 }).notNull();
      collection.datetime('assignedAt').notNull();
      collection.datetime('lastUsedAt').nullable();
      collection.datetime('releasedAt').nullable();
      collection.string('actorId', { length: 64 }).nullable();
      collection.primary('id', { name: 'pk_subscription_seats' });
      collection.index(['subscriptionId', 'releasedAt'], {
        name: 'idx_subscription_seats_subscription',
      });
      collection.index(['personId', 'releasedAt'], {
        name: 'idx_subscription_seats_person',
      });
      collection.index('account', { name: 'idx_subscription_seats_account' });
    });
    await builder.createCollection('subscriptionBills', (collection) => {
      collection.string('id', { length: 64 }).notNull();
      collection.string('subscriptionId', { length: 64 }).notNull();
      collection.date('periodStart').notNull();
      collection.date('periodEnd').notNull();
      collection.decimal('amount', { precision: 18, scale: 2 }).notNull();
      collection.string('currency', { length: 8 }).nullable();
      collection.text('notes').nullable();
      collection.string('createdById', { length: 64 }).nullable();
      collection.datetime('createdAt').notNull();
      collection.primary('id', { name: 'pk_subscription_bills' });
      collection.index(['subscriptionId', 'periodStart'], {
        name: 'idx_subscription_bills_subscription',
      });
    });

    type Row = Record<string, unknown>;
    const entitlements = await query
      .selectFrom('entitlements')
      .selectAll()
      .execute<Row>();
    const kinds = new Map(entitlements.map((row) => [row.id, row.kind]));
    for (const row of entitlements) {
      if (row.kind === 'subscription') {
        await query
          .insertInto('subscriptions')
          .values({
            id: row.id,
            softwareProductId: row.softwareProductId,
            name: row.name,
            providerVendorId: row.vendorId ?? null,
            consoleUrl: row.consoleUrl ?? null,
            billingModel: row.billingModel ?? 'perSeat',
            seatCount: row.seatCount ?? null,
            assignedCount: row.assignedCount ?? 0,
            billingCycle: row.billingCycle ?? 'year',
            unitPrice: row.unitPrice ?? null,
            cycleCost: row.cycleCost ?? null,
            currency: row.currency ?? null,
            annualCost: row.annualCost ?? null,
            startDate: row.startDate ?? null,
            expiryDate: row.expiryDate ?? row.createdAt,
            autoRenew: row.autoRenew ?? false,
            renewalDecision: row.renewalDecision ?? 'notDue',
            businessOwnerId: row.businessOwnerId ?? row.ownerId,
            itOwnerId: row.ownerId,
            dataRegion: row.dataRegion ?? null,
            sensitiveData: row.sensitiveData ?? 'unknown',
            contractId: row.contractId ?? null,
            notes: row.notes ?? null,
            createdById: row.createdById ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })
          .execute();
      } else {
        await query
          .insertInto('licenses')
          .values({
            id: row.id,
            softwareProductId: row.softwareProductId,
            name: row.name,
            licensingModel: row.licensingModel ?? 'perUser',
            licenseType: 'perpetual',
            seatCount: row.seatCount ?? null,
            assignedCount: row.assignedCount ?? 0,
            complianceStatus: row.complianceStatus ?? 'compliant',
            productKey: row.productKey ?? null,
            effectiveDate: row.startDate ?? null,
            expiryDate: row.expiryDate ?? null,
            maintenanceExpiryDate: row.maintenanceExpiryDate ?? null,
            vendorId: row.vendorId ?? null,
            purchaseOrderId: row.purchaseOrderId ?? null,
            purchasePrice: row.purchasePrice ?? null,
            currency: row.currency ?? null,
            contractId: row.contractId ?? null,
            reassignable: row.reassignable ?? true,
            notes: row.notes ?? null,
            ownerId: row.ownerId,
            createdById: row.createdById ?? null,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          })
          .execute();
      }
    }
    for (const seat of await query
      .selectFrom('entitlementSeats')
      .selectAll()
      .execute<Row>()) {
      if (kinds.get(seat.entitlementId) === 'subscription') {
        await query
          .insertInto('subscriptionSeats')
          .values({
            id: seat.id,
            subscriptionId: seat.entitlementId,
            personId: seat.holderId ?? null,
            account: seat.account ?? '',
            assignedAt: seat.assignedAt,
            lastUsedAt: seat.lastUsedAt ?? null,
            releasedAt: seat.releasedAt ?? null,
            actorId: seat.actorId ?? null,
          })
          .execute();
      } else if (seat.holderId) {
        await query
          .insertInto('licenseSeats')
          .values({
            id: seat.id,
            licenseId: seat.entitlementId,
            holderType: seat.holderType,
            holderId: seat.holderId,
            assignedAt: seat.assignedAt,
            lastUsedAt: seat.lastUsedAt ?? null,
            releasedAt: seat.releasedAt ?? null,
            actorId: seat.actorId ?? null,
          })
          .execute();
      }
    }
    for (const bill of await query
      .selectFrom('entitlementBills')
      .selectAll()
      .execute<Row>()) {
      await query
        .insertInto('subscriptionBills')
        .values({
          id: bill.id,
          subscriptionId: bill.entitlementId,
          periodStart: bill.periodStart,
          periodEnd: bill.periodEnd,
          amount: bill.amount,
          currency: bill.currency ?? null,
          notes: bill.notes ?? null,
          createdById: bill.createdById ?? null,
          createdAt: bill.createdAt,
        })
        .execute();
    }
    const subscriptionIds = entitlements
      .filter((row) => row.kind === 'subscription')
      .map((row) => String(row.id));
    const perpetualIds = entitlements
      .filter((row) => row.kind !== 'subscription')
      .map((row) => String(row.id));
    const split = async (
      table: 'historyEvents' | 'changeLogs' | 'reminders',
      column: 'subjectType',
    ) => {
      for (const [ids, value] of [
        [subscriptionIds, 'subscriptions'],
        [perpetualIds, 'licenses'],
      ] as const) {
        await query
          .updateTable(table)
          .set({ [column]: value })
          .where(column, '=', 'entitlements')
          .where('subjectId', 'in', ids.length > 0 ? ids : ['__none__'])
          .execute();
      }
    };
    await split('historyEvents', 'subjectType');
    await split('changeLogs', 'subjectType');
    await split('reminders', 'subjectType');
    for (const [from, to] of [
      ['entitlementExpiring', 'subscriptionExpiring'],
      ['entitlementOverAllocated', 'licenseOverAllocated'],
    ] as const)
      await query
        .updateTable('reminders')
        .set({ kind: to })
        .where('kind', '=', from)
        .execute();
    for (const [ids, value] of [
      [subscriptionIds, 'subscriptions'],
      [perpetualIds, 'licenses'],
    ] as const) {
      const safe = ids.length > 0 ? ids : ['__none__'];
      await query
        .updateTable('attachmentLinks')
        .set({ ownerType: value })
        .where('ownerType', '=', 'entitlements')
        .where('ownerId', 'in', safe)
        .execute();
      await query
        .updateTable('demoRecords')
        .set({ collection: value })
        .where('collection', '=', 'entitlements')
        .where('recordId', 'in', safe)
        .execute();
      await query
        .updateTable('contractCoverages')
        .set({
          targetType: value === 'licenses' ? 'license' : 'subscription',
        })
        .where('targetType', '=', 'entitlement')
        .where('targetId', 'in', safe)
        .execute();
      await query
        .updateTable('purchaseReceipts')
        .set({
          generatedType: value === 'licenses' ? 'license' : 'subscription',
        })
        .where('generatedType', '=', 'entitlement')
        .where('generatedId', 'in', safe)
        .execute();
    }
    await query
      .updateTable('purchaseOrderLines')
      .set({ itemType: 'license' })
      .where('itemType', '=', 'perpetual')
      .execute();

    await builder.dropCollection('entitlementBills');
    await builder.dropCollection('entitlementSeats');
    await builder.dropCollection('entitlements');
  },
});

function parseJson(value: unknown): Record<string, unknown> | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed: unknown =
    typeof value === 'string' ? JSON.parse(value || 'null') : value;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? { ...(parsed as Record<string, unknown>) }
    : undefined;
}

function parseJsonArray(value: unknown): Record<string, unknown>[] | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed: unknown =
    typeof value === 'string' ? JSON.parse(value || 'null') : value;
  return Array.isArray(parsed)
    ? (parsed as Record<string, unknown>[])
    : undefined;
}

export default migration;
