import type { AppServerResource } from './en-US.js';

const ptBR: AppServerResource = {
  notifications: {
    approvalRequested: 'Aprovação solicitada: {{title}}',
    commentMentioned: '{{actor}} mencionou você em {{title}}',
    commentReplied: '{{actor}} respondeu em {{title}}',
    approvalApproved: 'Aprovado: {{title}}',
    approvalRejected: 'Rejeitado: {{title}}',
    approvalBody: 'Uma solicitação aguarda a sua decisão',
    auditStarted: 'Inventário iniciado: {{name}}',
    auditStartedBody: 'Previsto até {{date}}',
    loanOverdue: 'Empréstimo atrasado: {{deviceNo}}',
    loanOverdueBody: 'Devolução prevista em {{date}}',
    leaverRecovery: 'Recolher de {{name}}',
    leaverRecoveryBody: '{{count}} dos itens em seu nome cabem a você resolver',
  },
};

export default ptBR;
