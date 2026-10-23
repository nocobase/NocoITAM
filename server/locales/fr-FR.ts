import type { AppServerResource } from './en-US.js';

const frFR: AppServerResource = {
  notifications: {
    approvalRequested: 'Approbation demandée : {{title}}',
    commentMentioned: '{{actor}} vous a mentionné dans {{title}}',
    commentReplied: '{{actor}} a répondu dans {{title}}',
    approvalApproved: 'Approuvé : {{title}}',
    approvalRejected: 'Rejeté : {{title}}',
    approvalBody: 'Une demande attend votre décision',
    auditStarted: 'Inventaire commencé : {{name}}',
    auditStartedBody: 'Prévu jusqu’au {{date}}',
    loanOverdue: 'Prêt en retard : {{deviceNo}}',
    loanOverdueBody: 'Retour prévu le {{date}}',
    leaverRecovery: 'À récupérer auprès de {{name}}',
    leaverRecoveryBody: '{{count}} de ses éléments sont à régler par vous',
  },
};

export default frFR;
