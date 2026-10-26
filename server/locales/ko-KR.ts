import type { AppServerResource } from './en-US.js';

const koKR: AppServerResource = {
  notifications: {
    approvalRequested: '승인 요청: {{title}}',
    commentMentioned: '{{actor}}님이 {{title}}에서 회원님을 멘션했습니다',
    commentReplied: '{{actor}}님이 {{title}}에 답글을 남겼습니다',
    approvalApproved: '승인됨: {{title}}',
    approvalRejected: '반려됨: {{title}}',
    approvalBody: '회원님의 결정을 기다리는 요청이 있습니다',
    auditStarted: '재고 실사 시작: {{name}}',
    auditStartedBody: '{{date}}까지 예정',
    loanOverdue: '대여 기한 초과: {{deviceNo}}',
    loanOverdueBody: '반납 예정일: {{date}}',
    leaverRecovery: '{{name}}님 보유 자산 회수',
    leaverRecoveryBody: '보유 항목 중 {{count}}건을 회원님이 처리해야 합니다',
  },
};

export default koKR;
