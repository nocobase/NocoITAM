import type { AppServerResource } from './en-US.js';

const deDE: AppServerResource = {
  notifications: {
    approvalRequested: 'Freigabe angefordert: {{title}}',
    commentMentioned: '{{actor}} hat Sie in {{title}} erwähnt',
    commentReplied: '{{actor}} hat in {{title}} geantwortet',
    approvalApproved: 'Freigegeben: {{title}}',
    approvalRejected: 'Abgelehnt: {{title}}',
    approvalBody: 'Eine Anfrage wartet auf Ihre Entscheidung',
    auditStarted: 'Inventur gestartet: {{name}}',
    auditStartedBody: 'Geplant bis {{date}}',
    loanOverdue: 'Verleih überfällig: {{deviceNo}}',
    loanOverdueBody: 'Rückgabe erwartet am {{date}}',
    leaverRecovery: 'Rücknahme von {{name}}',
    leaverRecoveryBody: 'Sie klären {{count}} der Zuweisungen dieser Person',
  },
};

export default deDE;
