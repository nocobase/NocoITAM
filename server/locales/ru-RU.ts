import type { AppServerResource } from './en-US.js';

const ruRU: AppServerResource = {
  notifications: {
    approvalRequested: 'Запрос на согласование: {{title}}',
    commentMentioned: '{{actor}} упомянул(а) вас в «{{title}}»',
    commentReplied: '{{actor}} ответил(а) в «{{title}}»',
    approvalApproved: 'Согласовано: {{title}}',
    approvalRejected: 'Отклонено: {{title}}',
    approvalBody: 'Заявка ожидает вашего решения',
    auditStarted: 'Инвентаризация начата: {{name}}',
    auditStartedBody: 'Запланирована до {{date}}',
    loanOverdue: 'Просрочен возврат: {{deviceNo}}',
    loanOverdueBody: 'Ожидаемая дата возврата: {{date}}',
    leaverRecovery: 'Вернуть имущество: {{name}}',
    leaverRecoveryBody: 'Позиций, которые вам нужно урегулировать: {{count}}',
  },
};

export default ruRU;
