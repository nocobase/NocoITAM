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
}

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
