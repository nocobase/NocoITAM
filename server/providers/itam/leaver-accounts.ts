import type { UserAdministrationService } from '@nocobase/app-plugin-authentication';
import type { UserManagementService } from '@nocobase/app-plugin-users/server/tokens';
import type { DatabaseManager } from '@nocobase/db';
import {
  createServiceToken,
  type ServiceToken,
} from '@nocobase/service-provider';

import { asText, type Row } from './collection-query.js';
import type { HistoryService } from './history.js';

/**
 * A leaver's sign-in goes with them (2026-10-05).
 *
 * Marking somebody as left marks a person, not an account, so a sign-in the
 * person record links went on working until somebody remembered to disable
 * it. This disables it at the moment they become 已离职 — the button, a
 * leave date that has passed, or the nightly job reaching it — and revokes
 * its sessions, so a browser already signed in stops too.
 *
 * It goes through the users plugin's management service, never the account
 * service beneath it: only the management layer asks the authorization
 * plugin whether the account may go (`assertSubjectRemovable`), and that is
 * what refuses the last active holder of the root set — so marking an
 * administrator as left can never lock the platform out. A refusal, or no
 * users plugin at all, leaves the account as it was, and the 归属 tab keeps
 * reminding the reader instead.
 *
 * It never disables the reader's own sign-in: whoever marks themselves as
 * left by mistake could not undo it once locked out.
 *
 * What it did is a history event on the person (`accountDisabledOnLeaving`),
 * and that is what coming back reads: the leave undone re-enables only an
 * account leaving disabled, never one an administrator disabled for a
 * reason of their own.
 *
 * Every call runs after the transaction that changed the person committed:
 * the management service opens a transaction of its own, and SQLite has one
 * connection.
 */
export interface LeaverAccounts {
  /** Somebody just became 已离职. */
  left(personId: string, actorId?: string): Promise<void>;
  /** Somebody stopped being 已离职. */
  returned(personId: string, actorId?: string): Promise<void>;
  /** Whether leaving disabled this person's sign-in and it is disabled now. */
  disabledOnLeaving(personId: string): Promise<boolean>;
}

export const leaverAccountsToken: ServiceToken<LeaverAccounts> =
  createServiceToken<LeaverAccounts>('itam/leaver-accounts');

const DISABLED = 'accountDisabledOnLeaving';
const RESTORED = 'accountRestoredOnReturning';

export function createLeaverAccounts(dependencies: {
  readonly database: DatabaseManager;
  readonly history: HistoryService;
  /** Resolved when used: the plugins register after this provider. */
  readonly management: () => UserManagementService | undefined;
  readonly accounts: () => UserAdministrationService | undefined;
  readonly log?: (message: string, error: unknown) => void;
}): LeaverAccounts {
  const { database, history, management, accounts, log } = dependencies;

  const userOf = async (personId: string): Promise<string | null> => {
    const row = await database
      .query()
      .selectFrom('people')
      .select(['userId'])
      .where('id', '=', personId)
      .executeTakeFirst<Row>();
    return asText(row?.userId) ?? null;
  };

  /** The newer of this person's two account events, if either was written. */
  const lastEvent = async (personId: string): Promise<string | null> => {
    const row = await database
      .query()
      .selectFrom('historyEvents')
      .select(['type'])
      .where('subjectType', '=', 'people')
      .where('subjectId', '=', personId)
      .where('type', 'in', [DISABLED, RESTORED])
      .orderBy('createdAt', 'desc')
      .executeTakeFirst<Row>();
    return asText(row?.type) ?? null;
  };

  return {
    async left(personId, actorId) {
      const userId = await userOf(personId);
      if (!userId || userId === actorId) return;
      const users = management();
      const account = await accounts()?.get(userId);
      if (!users || !account || account.disabledAt !== null) return;
      try {
        await users.disable(userId);
        await users.revokeSessions(userId);
      } catch (error) {
        // The last administrator, most likely: the account stays as it was
        // and the page goes on reminding.
        log?.(`Could not disable the sign-in of person ${personId}`, error);
        return;
      }
      await history.record({
        subjectType: 'people',
        subjectId: personId,
        type: DISABLED,
        summary: `Sign-in ${account.username ?? account.name} disabled on leaving`,
        payload: { userId, targetLabel: account.username ?? account.name },
        actorId,
        origin: actorId ? 'human' : 'schedule',
      });
    },

    async returned(personId, actorId) {
      if ((await lastEvent(personId)) !== DISABLED) return;
      const userId = await userOf(personId);
      const users = management();
      const account = userId ? await accounts()?.get(userId) : undefined;
      if (!userId || !users || !account || account.disabledAt === null)
        return;
      try {
        await users.enable(userId);
      } catch (error) {
        log?.(`Could not re-enable the sign-in of person ${personId}`, error);
        return;
      }
      await history.record({
        subjectType: 'people',
        subjectId: personId,
        type: RESTORED,
        summary: `Sign-in ${account.username ?? account.name} enabled again`,
        payload: { userId, targetLabel: account.username ?? account.name },
        actorId,
        origin: actorId ? 'human' : 'schedule',
      });
    },

    async disabledOnLeaving(personId) {
      if ((await lastEvent(personId)) !== DISABLED) return false;
      const userId = await userOf(personId);
      const account = userId ? await accounts()?.get(userId) : undefined;
      return Boolean(account && account.disabledAt !== null);
    },
  };
}
