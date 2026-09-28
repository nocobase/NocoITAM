import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Rewrites the datetime values this database inherited as epoch milliseconds.
 *
 * Template beta.22 stored a datetime as the epoch millisecond count in a text
 * column; beta.43 writes the text a dialect reads back — local
 * `YYYY-MM-DDTHH:mm:ss.SSS` for a `datetime`, UTC with `Z` for a
 * `datetimeTz`. An upgraded database therefore held both, in the same column,
 * and SQLite compares them as text: every legacy value sorts before every new
 * one whatever the instant, so a range filter, an ordering or a threshold
 * spanning the upgrade answers wrongly.
 *
 * The instants are preserved: an epoch value is the same moment written the
 * way this database now writes it, so nothing on screen moves. The columns are
 * listed rather than discovered, because a migration states the change it
 * makes; they are every datetime column the collection metadata knew at the
 * time, plugin tables included, since a plugin cannot repair rows its own
 * migrations never wrote.
 */
type Kind = 'local' | 'tz';

const COLUMNS: readonly (readonly [string, string, Kind])[] = [
  ['account', 'access_token_expires_at', 'local'],
  ['account', 'created_at', 'local'],
  ['account', 'refresh_token_expires_at', 'local'],
  ['account', 'updated_at', 'local'],
  ['ai_actions', 'created_at', 'local'],
  ['ai_actions', 'decided_at', 'local'],
  ['ai_actions', 'snoozed_until', 'local'],
  ['ai_actions', 'updated_at', 'local'],
  ['ai_conversations', 'created_at', 'local'],
  ['ai_conversations', 'updated_at', 'local'],
  ['ai_employees', 'created_at', 'local'],
  ['ai_employees', 'updated_at', 'local'],
  ['ai_findings', 'created_at', 'local'],
  ['ai_findings', 'decided_at', 'local'],
  ['ai_findings', 'inspected_at', 'local'],
  ['ai_findings', 'snoozed_until', 'local'],
  ['ai_findings', 'updated_at', 'local'],
  ['ai_mcp_clients', 'created_at', 'local'],
  ['ai_mcp_clients', 'updated_at', 'local'],
  ['ai_messages', 'created_at', 'local'],
  ['ai_messages', 'updated_at', 'local'],
  ['ai_settings', 'created_at', 'local'],
  ['ai_settings', 'updated_at', 'local'],
  ['ai_tool_messages', 'created_at', 'local'],
  ['ai_tool_messages', 'updated_at', 'local'],
  ['allocations', 'created_at', 'local'],
  ['allocations', 'ended_at', 'local'],
  ['allocations', 'signed_at', 'local'],
  ['apikey', 'created_at', 'local'],
  ['apikey', 'expires_at', 'local'],
  ['apikey', 'last_refill_at', 'local'],
  ['apikey', 'last_request', 'local'],
  ['apikey', 'updated_at', 'local'],
  ['approvals', 'decided_at', 'local'],
  ['approvals', 'requested_at', 'local'],
  ['attachment_links', 'created_at', 'local'],
  ['audit_items', 'counted_at', 'local'],
  ['audit_items', 'created_at', 'local'],
  ['audit_items', 'resolved_at', 'local'],
  ['audit_items', 'updated_at', 'local'],
  ['audit_tasks', 'completed_at', 'local'],
  ['audit_tasks', 'created_at', 'local'],
  ['audit_tasks', 'started_at', 'local'],
  ['audit_tasks', 'updated_at', 'local'],
  ['authorization_default_access_rule_records', 'created_at', 'local'],
  ['authorization_default_access_rules', 'created_at', 'local'],
  ['authorization_default_access_rules', 'updated_at', 'local'],
  ['authorization_permission_set_assignments', 'created_at', 'local'],
  ['authorization_permission_set_assignments', 'updated_at', 'local'],
  ['authorization_permission_sets', 'created_at', 'local'],
  ['authorization_permission_sets', 'updated_at', 'local'],
  ['authorization_restriction_rule_assignments', 'created_at', 'local'],
  ['authorization_restriction_rule_records', 'created_at', 'local'],
  ['authorization_restriction_rules', 'created_at', 'local'],
  ['authorization_restriction_rules', 'updated_at', 'local'],
  ['authorization_sharing_rule_assignments', 'created_at', 'local'],
  ['authorization_sharing_rule_records', 'created_at', 'local'],
  ['authorization_sharing_rules', 'created_at', 'local'],
  ['authorization_sharing_rules', 'updated_at', 'local'],
  ['categories', 'created_at', 'local'],
  ['categories', 'updated_at', 'local'],
  ['change_logs', 'created_at', 'local'],
  ['contract_coverages', 'created_at', 'local'],
  ['contracts', 'created_at', 'local'],
  ['contracts', 'updated_at', 'local'],
  ['demo_records', 'created_at', 'local'],
  ['departments', 'created_at', 'local'],
  ['departments', 'updated_at', 'local'],
  ['devices', 'assigned_at', 'local'],
  ['devices', 'created_at', 'local'],
  ['devices', 'last_audited_at', 'local'],
  ['devices', 'last_discovered_at', 'local'],
  ['devices', 'updated_at', 'local'],
  ['discovery_candidates', 'created_at', 'local'],
  ['discovery_candidates', 'updated_at', 'local'],
  ['discovery_imports', 'imported_at', 'local'],
  ['disposal_devices', 'created_at', 'local'],
  ['disposals', 'created_at', 'local'],
  ['disposals', 'updated_at', 'local'],
  ['entitlement_bills', 'created_at', 'local'],
  ['entitlement_seats', 'assigned_at', 'local'],
  ['entitlement_seats', 'last_used_at', 'local'],
  ['entitlement_seats', 'released_at', 'local'],
  ['entitlements', 'created_at', 'local'],
  ['entitlements', 'updated_at', 'local'],
  ['history_events', 'created_at', 'local'],
  ['itam_files', 'created_at', 'local'],
  ['itam_files', 'updated_at', 'local'],
  ['itam_settings', 'updated_at', 'local'],
  ['job_runs', 'finished_at', 'local'],
  ['job_runs', 'started_at', 'local'],
  ['locations', 'created_at', 'local'],
  ['locations', 'updated_at', 'local'],
  ['manufacturers', 'created_at', 'local'],
  ['manufacturers', 'updated_at', 'local'],
  ['models', 'created_at', 'local'],
  ['models', 'updated_at', 'local'],
  ['notification_deliveries', 'created_at', 'tz'],
  ['notification_deliveries', 'lease_expires_at', 'tz'],
  ['notification_deliveries', 'next_run_at', 'tz'],
  ['notification_deliveries', 'updated_at', 'tz'],
  ['notification_delivery_attempts', 'finished_at', 'tz'],
  ['notification_delivery_attempts', 'started_at', 'tz'],
  ['notification_delivery_retry_audits', 'created_at', 'tz'],
  ['notification_dispatches', 'created_at', 'tz'],
  ['notification_dispatches', 'updated_at', 'tz'],
  ['notification_in_app_items', 'created_at', 'tz'],
  ['notification_in_app_items', 'read_at', 'tz'],
  ['notification_in_app_items', 'updated_at', 'tz'],
  ['number_sequences', 'updated_at', 'local'],
  ['people', 'created_at', 'local'],
  ['people', 'updated_at', 'local'],
  ['purchase_order_lines', 'created_at', 'local'],
  ['purchase_order_lines', 'updated_at', 'local'],
  ['purchase_orders', 'created_at', 'local'],
  ['purchase_orders', 'updated_at', 'local'],
  ['purchase_receipts', 'created_at', 'local'],
  ['reminders', 'computed_at', 'local'],
  ['reminders', 'resolved_at', 'local'],
  ['reminders', 'snoozed_until', 'local'],
  ['repairs', 'created_at', 'local'],
  ['repairs', 'updated_at', 'local'],
  ['schedule_definitions', 'created_at', 'tz'],
  ['schedule_definitions', 'deactivated_at', 'tz'],
  ['schedule_definitions', 'from_date', 'tz'],
  ['schedule_definitions', 'to_date', 'tz'],
  ['schedule_definitions', 'updated_at', 'tz'],
  ['schedule_occurrences', 'accepted_at', 'tz'],
  ['schedule_occurrences', 'created_at', 'tz'],
  ['schedule_occurrences', 'finished_at', 'tz'],
  ['schedule_occurrences', 'last_observed_at', 'tz'],
  ['schedule_occurrences', 'last_started_at', 'tz'],
  ['schedule_occurrences', 'observation_deadline_at', 'tz'],
  ['schedule_occurrences', 'started_at', 'tz'],
  ['schedule_occurrences', 'updated_at', 'tz'],
  ['schedule_sync_locks', 'created_at', 'tz'],
  ['schedule_sync_locks', 'updated_at', 'tz'],
  ['session', 'created_at', 'local'],
  ['session', 'expires_at', 'local'],
  ['session', 'updated_at', 'local'],
  ['software_products', 'created_at', 'local'],
  ['software_products', 'updated_at', 'local'],
  ['stock_holdings', 'created_at', 'local'],
  ['stock_holdings', 'updated_at', 'local'],
  ['stock_items', 'created_at', 'local'],
  ['stock_items', 'updated_at', 'local'],
  ['stock_movements', 'created_at', 'local'],
  ['user', 'created_at', 'local'],
  ['user', 'deleted_at', 'local'],
  ['user', 'disabled_at', 'local'],
  ['user', 'updated_at', 'local'],
  ['users_ai_employees', 'created_at', 'local'],
  ['users_ai_employees', 'updated_at', 'local'],
  ['vendors', 'created_at', 'local'],
  ['vendors', 'updated_at', 'local'],
  ['verification', 'created_at', 'local'],
  ['verification', 'expires_at', 'local'],
  ['verification', 'updated_at', 'local'],
  ['workflow_node_runs', 'expires_at', 'tz'],
  ['workflow_node_runs', 'finished_at', 'tz'],
  ['workflow_node_runs', 'started_at', 'tz'],
  ['workflow_runs', 'created_at', 'tz'],
  ['workflow_runs', 'expires_at', 'tz'],
  ['workflow_runs', 'finished_at', 'tz'],
  ['workflow_runs', 'started_at', 'tz'],
];

/** The text the query layer writes today for this instant. */
const encode = (epoch: number, kind: Kind): string => {
  const date = new Date(epoch);
  if (kind === 'tz') return date.toISOString();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 23);
};

const EPOCH = /^\d+(\.\d+)?$/;

interface KnexClient {
  (table: string): {
    distinct(column: string): {
      whereNotNull(column: string): Promise<Record<string, unknown>[]>;
    };
    where(
      column: string,
      value: unknown,
    ): {
      update(values: Record<string, unknown>): Promise<unknown>;
    };
  };
  schema: { hasTable(table: string): Promise<boolean> };
}

const migration: MigrationDefinition = defineMigration({
  name: '202609230006_normalize_legacy_datetimes',
  // Raw SQL on purpose: the value is rewritten as the stored text, without
  // the temporal encoding a typed write would apply to the epoch it replaces.
  async up({ connection }) {
    const client = await connection.client<KnexClient>();
    for (const [table, column, kind] of COLUMNS) {
      if (!(await client.schema.hasTable(table))) continue;
      const rows = await client(table).distinct(column).whereNotNull(column);
      for (const row of rows) {
        const value = row[column];
        const text = typeof value === 'number' ? String(value) : value;
        if (typeof text !== 'string' || !EPOCH.test(text)) continue;
        await client(table)
          .where(column, value)
          .update({ [column]: encode(Number(text), kind) });
      }
    }
  },
  async down() {
    // Deliberately empty: the reverse would write back a format this version
    // of the query layer neither writes nor compares correctly.
  },
});

export default migration;
