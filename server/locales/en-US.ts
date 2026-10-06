import type { LocaleResource } from '@nocobase/i18n';

// The application's own server-side wording. It is empty because every string the server produces today belongs to a
// plugin's namespace; add keys here as the application starts producing its own, and use `overrides` to reword a
// plugin's.
const enUS = {
  // Every notification the register sends. They are keys rather than prose
  // because the message is written into somebody's inbox, and this
  // application does not write English into a record.
  notifications: {
    approvalRequested: 'Approval requested: {{title}}',
    approvalApproved: 'Approved: {{title}}',
    approvalRejected: 'Rejected: {{title}}',
    approvalBody: 'A request is waiting for your decision',
    auditStarted: 'Audit started: {{name}}',
    auditStartedBody: 'Planned until {{date}}',
    loanOverdue: 'Loan overdue: {{deviceNo}}',
    loanOverdueBody: 'Expected back on {{date}}',
    leaverRecovery: 'Recover from {{name}}',
    leaverRecoveryBody: '{{count}} of their holdings are yours to settle',
  },
};

export type AppServerResource = LocaleResource<typeof enUS>;

export default enUS;
