import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { NumberingKind, SettingsService } from './settings.js';

/**
 * Sequential business numbers (DE-000001, PO-000012…). The sequence row is
 * updated inside the caller's transaction so a rolled-back create does not
 * burn a number that a concurrent create already skipped past.
 */
export interface NumberingService {
  next(
    kind: NumberingKind,
    options?: {
      readonly connection?: DatabaseConnection;
    },
  ): Promise<string>;
  format(kind: NumberingKind, value: number): Promise<string>;
  /**
   * Moves every sequence back to just past the highest number still in use
   * (never forward, never below the rule's start). For clearing the demo:
   * its records go and their numbers with them, so importing again starts
   * where the remaining data ends instead of after every number the demo
   * ever took. A number freed this way is handed out again, which is only
   * right where the records that held it are gone for good.
   */
  rewind(options?: { readonly connection?: DatabaseConnection }): Promise<void>;
}

/** Where each kind's numbers are stored. */
const NUMBERED: Readonly<
  Record<NumberingKind, { readonly table: string; readonly column: string }>
> = {
  device: { table: 'devices', column: 'deviceNo' },
  purchaseOrder: { table: 'purchaseOrders', column: 'orderNo' },
  disposal: { table: 'disposals', column: 'disposalNo' },
  repair: { table: 'repairs', column: 'repairNo' },
};

export const numberingServiceToken: ServiceToken<NumberingService> =
  createServiceToken<NumberingService>('itam/numbering-service');

export function createNumberingService(
  database: DatabaseManager,
  settings: SettingsService,
): NumberingService {
  const format = async (kind: NumberingKind, value: number) => {
    const rule = (await settings.get('numbering'))[kind];
    return `${rule.prefix}${String(value).padStart(rule.width, '0')}`;
  };

  return {
    format,
    async rewind(options = {}) {
      const query = options.connection
        ? options.connection.query
        : database.query();
      const rules = await settings.get('numbering', options.connection);
      for (const [kind, { table, column }] of Object.entries(NUMBERED) as [
        NumberingKind,
        (typeof NUMBERED)[NumberingKind],
      ][]) {
        const rule = rules[kind];
        const current = await query
          .selectFrom('numberSequences')
          .select('nextValue')
          .where('key', '=', kind)
          .executeTakeFirst();
        if (!current) continue;
        // Only numbers under the current prefix compete for the sequence;
        // one written under an earlier prefix can never collide with it.
        const rows = await query
          .selectFrom(table)
          .select(column)
          .where(column, 'like', `${rule.prefix}%`)
          .execute<Record<string, unknown>>();
        let highest = rule.start - 1;
        for (const row of rows) {
          const value = row[column];
          if (typeof value !== 'string' || !value.startsWith(rule.prefix))
            continue;
          const digits = value.slice(rule.prefix.length);
          if (/^\d+$/.test(digits)) highest = Math.max(highest, Number(digits));
        }
        const next = Math.min(Number(current.nextValue), highest + 1);
        if (next !== Number(current.nextValue))
          await query
            .updateTable('numberSequences')
            .set({ nextValue: next, updatedAt: new Date() })
            .where('key', '=', kind)
            .execute();
      }
    },
    async next(kind, options = {}) {
      const rule = (await settings.get('numbering', options.connection))[kind];
      // One sequence per kind: a sequence per category under the same
      // prefix handed out the same number twice (removed 2026-09-27).
      const key = kind;
      const query = options.connection
        ? options.connection.query
        : database.query();
      const now = new Date();
      const current = await query
        .selectFrom('numberSequences')
        .select('nextValue')
        .where('key', '=', key)
        .executeTakeFirst();
      const value = current ? Number(current.nextValue) : rule.start;
      if (current) {
        await query
          .updateTable('numberSequences')
          .set({ nextValue: value + 1, updatedAt: now })
          .where('key', '=', key)
          .execute();
      } else {
        await query
          .insertInto('numberSequences')
          .values({ key, nextValue: value + 1, updatedAt: now })
          .execute();
      }
      return `${rule.prefix}${String(value).padStart(rule.width, '0')}`;
    },
  };
}
