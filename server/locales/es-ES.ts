import type { AppServerResource } from './en-US.js';

const esES: AppServerResource = {
  notifications: {
    approvalRequested: 'Aprobación solicitada: {{title}}',
    commentMentioned: '{{actor}} le ha mencionado en {{title}}',
    commentReplied: '{{actor}} ha respondido en {{title}}',
    approvalApproved: 'Aprobada: {{title}}',
    approvalRejected: 'Rechazada: {{title}}',
    approvalBody: 'Hay una solicitud pendiente de su decisión',
    auditStarted: 'Inventario iniciado: {{name}}',
    auditStartedBody: 'Previsto hasta el {{date}}',
    loanOverdue: 'Préstamo vencido: {{deviceNo}}',
    loanOverdueBody: 'Devolución prevista el {{date}}',
    leaverRecovery: 'Recuperar los activos de {{name}}',
    leaverRecoveryBody:
      'Le corresponde resolver {{count}} de los elementos a su nombre',
  },
};

export default esES;
