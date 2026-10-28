import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Names the purchase order on the seats an order brought in (2026-10-28).
 *
 * An entitlement's history read 席位增加 1 for seats received on an order,
 * the same as seats added by hand; the event knew its order only as its
 * source. Received seats now record the order's id and number, which the
 * timeline shows and links: 席位增加 1（采购单 PO-000085）. This gives the
 * events written before the same two fields, from their source.
 *
 * `down` takes the two fields off those events again.
 */
const events = async (
  query: Parameters<MigrationDefinition['up']>[0]['query'],
) =>
  query
    .selectFrom('historyEvents')
    .innerJoin(
      'purchaseOrders',
      'purchaseOrders.id',
      'historyEvents.sourceId',
    )
    .select([
      'historyEvents.id as id',
      'historyEvents.payload as payload',
      'purchaseOrders.id as orderId',
      'purchaseOrders.orderNo as orderNo',
    ])
    .where('historyEvents.type', '=', 'seatsAdded')
    .where('historyEvents.sourceType', '=', 'purchaseOrder')
    .execute<{
      id: string;
      payload: unknown;
      orderId: string;
      orderNo: string;
    }>();

function parseJson(value: unknown): Record<string, unknown> {
  const parsed: unknown =
    typeof value === 'string' ? JSON.parse(value || 'null') : value;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? { ...(parsed as Record<string, unknown>) }
    : {};
}

const migration: MigrationDefinition = defineMigration({
  name: '202610280004_seats_added_order',
  async up({ query }) {
    for (const event of await events(query)) {
      const payload = parseJson(event.payload);
      if (payload.purchaseOrderId) continue;
      await query
        .updateTable('historyEvents')
        .set({
          payload: {
            ...payload,
            purchaseOrderId: event.orderId,
            targetLabel: event.orderNo,
          },
        })
        .where('id', '=', event.id)
        .execute();
    }
  },
  async down({ query }) {
    for (const event of await events(query)) {
      const {
        purchaseOrderId: _order,
        targetLabel: _label,
        ...payload
      } = parseJson(event.payload);
      await query
        .updateTable('historyEvents')
        .set({ payload })
        .where('id', '=', event.id)
        .execute();
    }
  },
});

export default migration;
