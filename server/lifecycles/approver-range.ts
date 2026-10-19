import {
  normalizeReviewerSelections,
  type ParameterGroup,
  type ReviewerSelection,
} from '@nocobase/lifecycle';

/**
 * Whom a submitter may ask to approve a request — a lifecycle parameter an
 * administrator sets on 设置 → 流程 (2026-10-18 for disposals, 2026-10-19
 * for purchase orders too). Each lifecycle with an approval declares it
 * under a group key of its own; the approver directory
 * (`server/providers/itam/approvers.ts`) resolves it among the people who
 * hold the approval.
 */

/**
 * Who a range may name: everyone who may approve that kind of request
 * (`anyone`, the one reference `*`), a permission set by key (`role`), or a
 * user by id. Each selection is a group of its own, so the range is their
 * union, always narrowed to the people who hold the approval.
 */
export const APPROVER_SELECTOR_TYPES = ['anyone', 'role', 'user'] as const;

/** Before an administrator narrows it: whoever may approve, as always. */
export const DEFAULT_APPROVER_RANGE: readonly ReviewerSelection[] = [
  { group: 1, type: 'anyone', referenceId: '*' },
];

export interface ApproverRangeParameters {
  /** Who a submitter may ask to approve. */
  readonly approverRange: readonly ReviewerSelection[];
}

/**
 * The range's parameter group under `key`. Read live, when a request is
 * submitted and when the picker lists the candidates; a request already
 * waiting keeps the approver it asked. Never rename a key once stored, and
 * raise `schemaVersion` only with a migration of the stored versions.
 */
export function approverRangeGroup(key: string): ParameterGroup {
  return {
    key,
    title: 'Approvers',
    schemaVersion: 1,
    fields: {
      approverRange: {
        type: 'reviewers',
        title: 'Who may be asked to approve',
        parse: (value) =>
          normalizeReviewerSelections(value, APPROVER_SELECTOR_TYPES),
        bindings: [{ transition: 'submit' }],
      },
    },
  };
}
