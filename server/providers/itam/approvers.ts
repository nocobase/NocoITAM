import { userAdministrationServiceToken } from '@nocobase/app-plugin-authentication';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import {
  ParameterConfigurationError,
  resolveReviewerSelections,
  type LifecycleRuntime,
  type ReviewerSelection,
} from '@nocobase/lifecycle';
import {
  createServiceToken,
  type ServiceContainer,
  type ServiceToken,
} from '@nocobase/service-provider';

import type { ApproverRangeParameters } from '../../lifecycles/approver-range.js';
import {
  DISPOSAL_LIFECYCLE,
  disposalApproverRange,
} from '../../lifecycles/disposals.js';
import {
  PURCHASE_ORDER_LIFECYCLE,
  purchaseOrderApproverRange,
} from '../../lifecycles/purchase-orders.js';
import type { ApprovalSubject } from './approvals.js';
import { BusinessRuleError, ValidationError } from './errors.js';
import {
  LIFECYCLE_PARAMETER_SCOPE,
  lifecycleParameterStore,
} from './lifecycles.js';

/**
 * Who holds what, as the pickers offer people (moved out of the users route
 * 2026-10-18, so the services and 设置 → 流程 read the same answer): the
 * accounts a permission set of this application is assigned to, the ones
 * holding one business operation, and — for a request that is approved, a
 * purchase order or a disposal — the ones its approver range lets a
 * submitter ask.
 */

/** What each kind of request is approved under, and its range is kept as. */
const SUBJECTS = {
  disposal: {
    lifecycle: DISPOSAL_LIFECYCLE,
    resource: 'itam.disposals',
    group: disposalApproverRange,
    startRequest: 'start:itam-disposal-approver-range',
  },
  purchaseOrder: {
    lifecycle: PURCHASE_ORDER_LIFECYCLE,
    resource: 'itam.purchaseOrders',
    group: purchaseOrderApproverRange,
    startRequest: 'start:itam-purchase-order-approver-range',
  },
} as const satisfies Record<ApprovalSubject, unknown>;

/** A permission set as a picker names it: its key and its title. */
export interface ApproverRole {
  readonly key: string;
  readonly title: string;
}

export interface ApproverCandidate {
  readonly id: string;
  readonly name: string;
  readonly roles?: ApproverRole[];
}

export interface ApproverDirectory {
  /** The sign-ins among these whose person has left. */
  leftUserIds(userIds: readonly string[]): Promise<ReadonlySet<string>>;
  /** Which of this application's permission sets each account holds. */
  rolesOf(): Promise<Map<string, ApproverRole[]>>;
  /** Who holds `action` on `resource`: active, not leavers, by name. */
  holders(
    resource: string,
    action: string,
    q?: string,
  ): Promise<ApproverCandidate[]>;
  /**
   * Whom a submitter may ask to approve this kind of request: the people
   * holding its approval, narrowed by its approver range — the one saved,
   * or `rule` when a settings page checks one before saving it.
   */
  approversFor(
    subject: ApprovalSubject,
    q?: string,
    rule?: readonly ReviewerSelection[],
  ): Promise<ApproverCandidate[]>;
  /**
   * Whether a submitter may ask this person to approve. Always, while the
   * range is everyone who may approve — the approval itself is checked when
   * the approver decides, as it always was.
   */
  mayApprove(subject: ApprovalSubject, userId: string): Promise<boolean>;
  /** 设置 → 流程: the approver range, and what it offers now. */
  approverRangeView(subject: ApprovalSubject): Promise<ApproverRangeView>;
  /**
   * A new version of the range, made from the version the page showed
   * (`revision`): one saved meanwhile by someone else is a conflict, and a
   * request sent again under the same id saves nothing twice. A range that
   * leaves nobody to ask is refused, since nothing could then be submitted.
   */
  saveApproverRange(
    subject: ApprovalSubject,
    input: ApproverRangeInput,
    actorId: string,
  ): Promise<ApproverRangeView>;
}

/** The range as the settings page edits it. */
export interface ApproverRangeInput {
  /** Everyone who may approve, or only the sets and people chosen. */
  readonly anyone: boolean;
  readonly roles: readonly string[];
  readonly users: readonly string[];
  readonly revision: number;
  readonly requestId: string;
}

export interface ApproverRangeView {
  readonly anyone: boolean;
  readonly roles: readonly string[];
  readonly users: readonly string[];
  /** 0 before an administrator saved one. */
  readonly revision: number;
  readonly updatedById: string | null;
  readonly updatedAt: string | null;
  /** What may be chosen: the sets and people who hold the approval. */
  readonly roleOptions: readonly ApproverRole[];
  readonly userOptions: readonly ApproverCandidate[];
  /** Whom a submitter may pick under this range. */
  readonly approvers: readonly ApproverCandidate[];
}

/** A range as selections: each a group of its own, so any one is enough. */
function rangeOf(input: Omit<ApproverRangeInput, 'revision' | 'requestId'>) {
  if (input.anyone) return [{ group: 1, type: 'anyone', referenceId: '*' }];
  return [
    ...[...new Set(input.roles)].map((referenceId) => ({
      type: 'role',
      referenceId,
    })),
    ...[...new Set(input.users)].map((referenceId) => ({
      type: 'user',
      referenceId,
    })),
  ].map((selection, index) => ({ group: index + 1, ...selection }));
}

export const approverDirectoryToken: ServiceToken<ApproverDirectory> =
  createServiceToken<ApproverDirectory>('itam/approver-directory');

export function createApproverDirectory(
  container: ServiceContainer,
  lifecycles: () => LifecycleRuntime,
): ApproverDirectory {
  const database = container.resolve(databaseManagerToken);
  const store = lifecycleParameterStore(database);
  /**
   * The sign-ins whose person has left.
   *
   * Somebody who has left answers for nothing new: they cannot be picked
   * as a 负责人, the way they cannot be assigned a device. It
   * is read through `people.userId`, because that is what ties an account
   * to the register — an account with no person record is nobody's leaver
   * and stays pickable.
   *
   * A name lookup (`?ids=`) is never filtered: a record that already
   * names somebody must read back whoever that is, exactly as the
   * approvers endpoint answers for anybody when asked by id.
   */
  const leftUserIds = async (
    userIds: readonly string[],
  ): Promise<ReadonlySet<string>> => {
    if (userIds.length === 0) return new Set();
    const rows = await database
      .query()
      .selectFrom('people')
      .select('userId')
      .where('employmentStatus', '=', 'left')
      .where('userId', 'in', [...userIds])
      .execute<{ userId: string | null }>();
    return new Set(
      rows.map((row) => row.userId).filter((id): id is string => id !== null),
    );
  };

  type Grant = {
    resource: { type: string; id: string };
    actions: readonly { action: string }[];
  };
  /** A permission set as a picker names it: its key and its title. */
  type Role = ApproverRole;
  type Holder = ApproverCandidate;
  const isItamGrant = (grant: Grant) =>
    grant.resource.type === 'composite' &&
    grant.resource.id.startsWith('itam.');

  /**
   * The accounts assigned a permission set that grants anything matching
   * `granted`, each with the titles of those sets. Assignments to a group
   * or a role other than a user are not expanded: this application's sets
   * are assigned to users.
   */
  const assignedTo = async (
    granted: (grant: Grant) => boolean,
  ): Promise<Map<string, Role[]>> => {
    const holders = new Map<string, Role[]>();
    if (!container.has(authorizationToken)) return holders;
    const permissionSets = container.resolve(authorizationToken).permissionSets;
    for (const set of await permissionSets.list()) {
      if (!set.grants.some(granted)) continue;
      // A title is plain text or a translation descriptor; the picker
      // translates this application's own sets by key either way.
      const title =
        typeof set.title === 'string' ? set.title : (set.title?.key ?? set.key);
      for (const assignment of await permissionSets.listAssignments(set.key))
        if (assignment.subject.type === 'user') {
          const id = String(assignment.subject.id);
          holders.set(id, [
            ...(holders.get(id) ?? []),
            { key: set.key, title },
          ]);
        }
    }
    return holders;
  };

  /**
   * Which of this application's permission sets each account holds, so a
   * picker reads 孙强 · IT 资产经理 rather than a bare name: choosing a
   * 负责人 or an approver is choosing a role as much as a person
   * (2026-10-06). Only the sets granting an `itam.*` operation count —
   * those are what make somebody a candidate at all.
   */
  const rolesOf = () => assignedTo(isItamGrant);

  /**
   * Who holds one business operation, read from the permission sets that
   * grant it and the users assigned to them. Both pickers are this: an
   * approver of a kind of request, and the 负责人 a repair may be given
   * to. Neither is a role list — it is whoever the deployment's sets let
   * approve, or finish a repair, which is what the service will check.
   */
  const holdersOf = async (
    resource: string,
    action: string,
    q: string,
  ): Promise<Holder[]> => {
    if (!container.has(userAdministrationServiceToken)) return [];
    const ids = await assignedTo(
      (grant) =>
        grant.resource.type === 'composite' &&
        grant.resource.id === resource &&
        grant.actions.some((entry) => entry.action === action),
    );
    if (ids.size === 0) return [];
    const roles = await rolesOf();
    const users = container.resolve(userAdministrationServiceToken);
    const page = await users.list({
      userIds: [...ids.keys()],
      pageSize: 100,
    });
    const needle = q.trim().toLowerCase();
    const left = await leftUserIds(page.items.map((user) => user.id));
    return page.items
      .filter((user) => !user.disabledAt)
      .filter((user) => !left.has(user.id))
      .filter((user) => !needle || user.name.toLowerCase().includes(needle))
      .map((user) => ({
        id: user.id,
        name: user.name,
        roles: roles.get(user.id) ?? [],
      }));
  };

  /** The approver range as it stands: the administrator's, or the default. */
  const currentRange = async (
    subject: ApprovalSubject,
  ): Promise<readonly ReviewerSelection[]> =>
    (
      (await lifecycles().resolveParameters(SUBJECTS[subject].lifecycle, {
        record: null,
        purpose: 'preview',
        transactionHandle: undefined,
      })) as ApproverRangeParameters
    ).approverRange;
  const holdersFor = (subject: ApprovalSubject) =>
    holdersOf(SUBJECTS[subject].resource, 'approve', '');

  const directory: ApproverDirectory = {
    leftUserIds,
    rolesOf,
    holders: (resource, action, q = '') => holdersOf(resource, action, q),
    approverRangeView: (subject) => approverRangeView(subject),
    saveApproverRange: (subject, input, actorId) =>
      saveApproverRange(subject, input, actorId),
    async mayApprove(subject, userId) {
      const range = await currentRange(subject);
      if (range.some((selection) => selection.type === 'anyone')) return true;
      return (await directory.approversFor(subject, '', range)).some(
        (candidate) => candidate.id === userId,
      );
    },
    async approversFor(subject, q = '', rule) {
      const holders = await holdersFor(subject);
      const byId = new Map(holders.map((holder) => [holder.id, holder]));
      // Every selection resolves among people; whoever it names must still
      // hold the approval, so a range never widens who may approve.
      const allowed = new Set(
        await resolveReviewerSelections(
          rule ?? (await currentRange(subject)),
          { scope: 'itam', applicantId: '' },
          {
            selectors: {
              anyone: async () => [...byId.keys()],
              role: async (key) =>
                holders
                  .filter((holder) =>
                    (holder.roles ?? []).some((role) => role.key === key),
                  )
                  .map((holder) => holder.id),
              user: async (id) => (byId.has(id) ? [id] : []),
            },
            eligible: async (id) => byId.has(id),
          },
        ),
      );
      const needle = q.trim().toLowerCase();
      return holders.filter(
        (holder) =>
          allowed.has(holder.id) &&
          (!needle || holder.name.toLowerCase().includes(needle)),
      );
    },
  };
  async function approverRangeView(
    subject: ApprovalSubject,
  ): Promise<ApproverRangeView> {
    const [version, range, holders] = await Promise.all([
      store.read(LIFECYCLE_PARAMETER_SCOPE, SUBJECTS[subject].group.key),
      currentRange(subject),
      holdersFor(subject),
    ]);
    const roleOptions = new Map<string, ApproverRole>();
    for (const holder of holders)
      for (const role of holder.roles ?? []) roleOptions.set(role.key, role);
    return {
      anyone: range.some((selection) => selection.type === 'anyone'),
      roles: range.filter((s) => s.type === 'role').map((s) => s.referenceId),
      users: range.filter((s) => s.type === 'user').map((s) => s.referenceId),
      revision: version?.revision ?? 0,
      updatedById: version?.actorId ?? null,
      updatedAt: version?.at ?? null,
      roleOptions: [...roleOptions.values()],
      userOptions: holders,
      approvers: await directory.approversFor(subject, '', range),
    };
  }
  async function saveApproverRange(
    subject: ApprovalSubject,
    input: ApproverRangeInput,
    actorId: string,
  ): Promise<ApproverRangeView> {
    const holders = await holdersFor(subject);
    const roleKeys = new Set(
      holders.flatMap((holder) => (holder.roles ?? []).map((role) => role.key)),
    );
    if (!input.anyone) {
      if (input.roles.length === 0 && input.users.length === 0)
        throw new ValidationError('Choose who may be asked', 'roles');
      if (input.roles.some((key) => !roleKeys.has(key)))
        throw new ValidationError('Unknown permission set', 'roles');
      if (input.users.some((id) => !holders.some((holder) => holder.id === id)))
        throw new ValidationError(
          'Only someone who may approve this kind of request can be chosen',
          'users',
        );
    }
    const range = rangeOf(input);
    if (
      !input.anyone &&
      (await directory.approversFor(subject, '', range)).length === 0
    )
      throw new BusinessRuleError(
        'The range leaves nobody to ask for approval',
        'NO_APPROVERS',
      );
    try {
      await store.save({
        scope: LIFECYCLE_PARAMETER_SCOPE,
        group: SUBJECTS[subject].group,
        values: { approverRange: range },
        expectedRevision: input.revision,
        requestId: input.requestId,
        actorId,
        at: new Date().toISOString(),
      });
    } catch (error) {
      if (!(error instanceof ParameterConfigurationError)) throw error;
      throw error.code === 'CONFIGURATION_INVALID'
        ? new ValidationError(error.message, 'roles')
        : new BusinessRuleError(
            'The range was changed meanwhile; reload it and try again',
            'CONFLICT',
          );
    }
    return approverRangeView(subject);
  }
  return directory;
}

/** The permission set a deployment's approvers start as. */
export const DEFAULT_APPROVER_SET = 'itam-asset-manager';

/**
 * A deployment's first approver ranges (2026-10-18 for disposals,
 * 2026-10-19 for purchase orders): the IT Asset Manager set — the one this
 * application's seeds give both approvals to — saved as each range's first
 * version when the application starts and nobody has saved one, so
 * 设置 → 流程 opens with it ticked. Done at start rather than in a seed,
 * which may not use the parameter store's database manager. A range already
 * saved, or a deployment without that set, is left alone; the lifecycles'
 * own default stays everyone who may approve.
 */
export async function startApproverRange(
  container: ServiceContainer,
): Promise<void> {
  if (!container.has(authorizationToken)) return;
  const store = lifecycleParameterStore(
    container.resolve(databaseManagerToken),
  );
  const sets = await container
    .resolve(authorizationToken)
    .permissionSets.list();
  if (!sets.some((set) => set.key === DEFAULT_APPROVER_SET)) return;
  for (const subject of Object.values(SUBJECTS)) {
    if (await store.read(LIFECYCLE_PARAMETER_SCOPE, subject.group.key))
      continue;
    try {
      await store.save({
        scope: LIFECYCLE_PARAMETER_SCOPE,
        group: subject.group,
        values: {
          approverRange: [
            { group: 1, type: 'role', referenceId: DEFAULT_APPROVER_SET },
          ],
        },
        expectedRevision: 0,
        requestId: subject.startRequest,
        actorId: 'system',
        at: new Date().toISOString(),
      });
    } catch (error) {
      // Another instance starting beside this one saved it first.
      if (!(
        error instanceof ParameterConfigurationError &&
        error.code === 'CONFIGURATION_CONFLICT'
      ))
        throw error;
    }
  }
}
