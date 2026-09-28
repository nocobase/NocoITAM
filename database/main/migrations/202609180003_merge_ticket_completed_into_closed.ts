import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * A ticket ends in one state, `closed`; how it got there is a field. The
 * former `completed` status (the requester confirmed the resolution) becomes
 * `closed` with `closeMethod = requesterConfirmed`; tickets already closed by
 * the handler or by the timeout keep that distinction through the event the
 * close wrote.
 */
type Row = Record<string, unknown>;

const AUTO_CLOSE_SUMMARY = 'Closed automatically (no confirmation)';

const migration: MigrationDefinition = defineMigration({
  name: '202609180003_merge_ticket_completed_into_closed',
  async up({ builder, query }) {
    await builder.alterCollection('tickets', (collection) => {
      // requesterConfirmed | handlerClosed | autoClosed
      collection.string('closeMethod', { length: 32 }).nullable();
    });
    await query
      .updateTable('tickets')
      .set({ status: 'closed', closeMethod: 'requesterConfirmed' })
      .where('status', '=', 'completed')
      .where('closeMethod', 'is', null)
      .execute();
    const closed = await query
      .selectFrom('tickets')
      .select('id')
      .where('status', '=', 'closed')
      .where('closeMethod', 'is', null)
      .execute<{ id: string }>();
    for (const { id } of closed) {
      const auto = await query
        .selectFrom('historyEvents')
        .select('id')
        .where('subjectType', '=', 'tickets')
        .where('subjectId', '=', id)
        .where('summary', '=', AUTO_CLOSE_SUMMARY)
        .executeTakeFirst<{ id: string }>();
      await query
        .updateTable('tickets')
        .set({ closeMethod: auto ? 'autoClosed' : 'handlerClosed' })
        .where('id', '=', id)
        .execute();
    }
    await rewriteStatus(query, 'completed', 'closed');
  },
  async down({ builder, query }) {
    await query
      .updateTable('tickets')
      .set({ status: 'completed' })
      .where('status', '=', 'closed')
      .where('closeMethod', '=', 'requesterConfirmed')
      .execute();
    await rewriteStatus(query, 'closed', 'completed', 'requesterConfirmed');
    await builder.alterCollection('tickets', (collection) => {
      collection.dropField('closeMethod');
    });
  },
});

/** Status values inside ticket events and change logs follow the rename. */
async function rewriteStatus(
  query: Parameters<NonNullable<MigrationDefinition['up']>>[0]['query'],
  from: string,
  to: string,
  onlyCloseMethod?: string,
): Promise<void> {
  let tickets = query.selectFrom('tickets').select('id');
  if (onlyCloseMethod)
    tickets = tickets.where('closeMethod', '=', onlyCloseMethod);
  const ids = (await tickets.execute<{ id: string }>()).map((row) => row.id);
  for (const id of ids) {
    const events = await query
      .selectFrom('historyEvents')
      .select(['id', 'payload'])
      .where('subjectType', '=', 'tickets')
      .where('subjectId', '=', id)
      .where('type', '=', 'statusChange')
      .execute<Row>();
    for (const event of events) {
      const text = event.payload;
      if (typeof text !== 'string') continue;
      const next = text.split(`"to":"${from}"`).join(`"to":"${to}"`);
      if (next !== text)
        await query
          .updateTable('historyEvents')
          .set({ payload: next })
          .where('id', '=', event.id)
          .execute();
    }
    const changes = await query
      .selectFrom('changeLogs')
      .select(['id', 'newValue'])
      .where('subjectType', '=', 'tickets')
      .where('subjectId', '=', id)
      .where('field', '=', 'status')
      .execute<Row>();
    for (const change of changes) {
      if (change.newValue === JSON.stringify(from))
        await query
          .updateTable('changeLogs')
          .set({ newValue: JSON.stringify(to) })
          .where('id', '=', change.id)
          .execute();
    }
  }
}

export default migration;
