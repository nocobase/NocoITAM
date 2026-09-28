import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Drops the two cross-record patterns: 供应商连续延迟交货 and
 * 同批次设备集中报修 (decided 2026-09-28, a week after they were added).
 *
 * Both stated something true and neither asked for an act. Everything else
 * on the workbench answers "what do I do today" — decide this request,
 * receive these goods, count this task, chase this device. "This vendor's
 * last three deliveries were late" is read at the moment somebody picks a
 * vendor, which happens in the purchase order's own form; "three of this
 * batch are in for repair" is read on the model. A standing alert nobody
 * acts on is one people learn to skip, and a list where one row is skipped
 * is a list that stops being read.
 *
 * The vendor rule had a second problem of its own: it judged a vendor's
 * most recent N arrivals with no time limit, so a vendor you stopped buying
 * from kept the warning for ever — the only thing that could clear it was
 * another delivery from the vendor the warning was telling you to avoid.
 *
 * Gone with them: the `PATTERN_KINDS` split and the 发现的模式 card,
 * `ReminderSummary.findings`, the four thresholds
 * (`lateDeliveryDays` / `lateDeliveryOrders` / `batchDefectDays` /
 * `batchDefectDevices`) and the demo data that was arranged to trip them.
 * The facts are worth keeping as statistics on the vendor and the model —
 * that is a separate piece of work, not a reminder.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202609280008_drop_pattern_reminders',

  async up({ query }) {
    await query
      .deleteFrom('reminders')
      .where('kind', 'in', ['vendorLateDeliveries', 'batchDefect'])
      .execute();
    // The thresholds are one stored document; the four keys leave it the
    // way every other retired setting has.
    const row = await query
      .selectFrom('itamSettings')
      .select(['key', 'value'])
      .where('key', '=', 'thresholds')
      .executeTakeFirst<{ key: string; value: unknown }>();
    if (!row) return;
    const value =
      typeof row.value === 'string'
        ? (JSON.parse(row.value) as Record<string, unknown>)
        : ((row.value ?? {}) as Record<string, unknown>);
    for (const key of [
      'lateDeliveryDays',
      'lateDeliveryOrders',
      'batchDefectDays',
      'batchDefectDevices',
    ])
      delete value[key];
    await query
      .updateTable('itamSettings')
      .set({ value })
      .where('key', '=', 'thresholds')
      .execute();
  },

  async down() {
    // Nothing to restore: the rows were derived and nothing computes them,
    // and the settings fall back to their defaults when a key is absent.
  },
});

export default migration;
