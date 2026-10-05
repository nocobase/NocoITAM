import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { unrestricted } from './authz-filter.js';
import { asText, decodeRow, type Row } from './collection-query.js';
import type { HistoryService } from './history.js';
import type { MasterDataService } from './master-data.js';
import { OWNED_BY_USER, recoveryPlan } from './recovery.js';

/**
 * When a leaver's handover was finished (2026-10-05).
 *
 * The board's 已完成 used to date a finished leaver by their leave date,
 * which is when the handover started, not when it ended: the last laptop
 * returned three weeks later read as done on the day they left. Nothing
 * else records the moment, because a handover ends with whichever act
 * settles its last item — a return, a stock take-back, a seat reclaimed, a
 * record handed over, a device scrapped — and none of those knows it was
 * the last.
 *
 * So the moment is noticed rather than announced: after every burst of
 * writes (`itamChangesToken`, which every ITAM route, confirmed AI write and
 * scheduled job already signals) this looks at the leavers whose newest
 * belongings snapshot has no completion after it, and writes a
 * `handoverCompleted` event on each one who has nothing left in their name.
 * The event is the record: it shows on the person's timeline, and the board
 * dates them by it.
 *
 * Settled is read unrestricted, as the snapshot was written: whether the
 * handover is over is a fact about the person, not about what one reader
 * may see. A leaver with nothing at leaving has no snapshot and so no
 * handover to complete.
 */
export interface HandoverCompletion {
  /**
   * Records a completion for every leaver whose handover just ended.
   * `late` is the start-up pass: what it finds settled was settled before
   * anything watched, at a moment nobody knows, so the event says it was
   * recorded late and nothing dates the handover by it.
   */
  check(actorId?: string, options?: { readonly late?: boolean }): Promise<void>;
}

export const handoverCompletionToken: ServiceToken<HandoverCompletion> =
  createServiceToken<HandoverCompletion>('itam/handover-completion');

export const HANDOVER_COMPLETED = 'handoverCompleted';
const SNAPSHOT = 'belongingsSnapshot';

export function createHandoverCompletion(dependencies: {
  readonly database: DatabaseManager;
  readonly history: HistoryService;
  readonly masterData: MasterDataService;
}): HandoverCompletion {
  const { database, history, masterData } = dependencies;
  const everything = new Map(
    OWNED_BY_USER.map((entry) => [
      entry.collection,
      unrestricted(entry.collection, 'read'),
    ]),
  );

  return {
    async check(actorId, options = {}) {
      const leavers = await database
        .query()
        .selectFrom('people')
        .select(['id'])
        .where('employmentStatus', '=', 'left')
        .execute<Row>();
      if (leavers.length === 0) return;
      // Newest first, so the first of each type seen per person is theirs.
      const events = await database
        .query()
        .selectFrom('historyEvents')
        .select(['subjectId', 'type', 'createdAt'])
        .where('subjectType', '=', 'people')
        .where('type', 'in', [SNAPSHOT, HANDOVER_COMPLETED])
        .where(
          'subjectId',
          'in',
          leavers.map((row) => String(row.id)),
        )
        .orderBy('createdAt', 'desc')
        .execute<Row>();
      // Only somebody whose latest word is a snapshot: a handover under way.
      const latest = new Map<string, string>();
      for (const event of events) {
        const person = String(event.subjectId);
        if (!latest.has(person)) latest.set(person, String(event.type));
      }
      for (const [person, type] of latest) {
        if (type !== SNAPSHOT) continue;
        const items = recoveryPlan(await masterData.personHoldings(person));
        if (items.some((item) => item.handling !== 'none')) continue;
        if ((await masterData.personOwnedRecords(person, everything)).length)
          continue;
        await history.record({
          subjectType: 'people',
          subjectId: person,
          type: HANDOVER_COMPLETED,
          summary: 'Handover completed',
          ...(options.late ? { payload: { recordedLate: true } } : {}),
          actorId,
          origin: actorId ? 'human' : 'schedule',
        });
      }
    },
  };
}

/** When each leaver's latest handover was completed, if it has been. */
export async function handoverCompletedAt(
  database: DatabaseManager,
  people: readonly string[],
): Promise<Map<string, string>> {
  const completed = new Map<string, string>();
  if (people.length === 0) return completed;
  const events = await database
    .query()
    .selectFrom('historyEvents')
    .select(['subjectId', 'type', 'createdAt', 'payload'])
    .where('subjectType', '=', 'people')
    .where('type', 'in', [SNAPSHOT, HANDOVER_COMPLETED])
    .where('subjectId', 'in', [...people])
    .orderBy('createdAt', 'desc')
    .execute<Row>();
  const seen = new Set<string>();
  for (const event of events) {
    const person = String(event.subjectId);
    if (seen.has(person)) continue;
    seen.add(person);
    // A completion counts only when nothing has been snapshotted since:
    // somebody who came back and left again has a new handover open.
    // One recorded late, at start-up, has no moment to give.
    const payload = decodeRow(event).payload as
      { readonly recordedLate?: boolean } | null | undefined;
    if (event.type === HANDOVER_COMPLETED && !payload?.recordedLate) {
      const at = asText(event.createdAt);
      if (at) completed.set(person, at);
    }
  }
  return completed;
}
