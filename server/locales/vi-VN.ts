import type { AppServerResource } from './en-US.js';

const viVN: AppServerResource = {
  notifications: {
    approvalRequested: 'Yêu cầu phê duyệt: {{title}}',
    commentMentioned: '{{actor}} đã nhắc đến bạn trong {{title}}',
    commentReplied: '{{actor}} đã phản hồi trong {{title}}',
    approvalApproved: 'Đã phê duyệt: {{title}}',
    approvalRejected: 'Bị từ chối: {{title}}',
    approvalBody: 'Có một yêu cầu đang chờ bạn quyết định',
    auditStarted: 'Đã bắt đầu kiểm kê: {{name}}',
    auditStartedBody: 'Dự kiến đến {{date}}',
    loanOverdue: 'Quá hạn trả: {{deviceNo}}',
    loanOverdueBody: 'Dự kiến trả vào {{date}}',
    leaverRecovery: 'Thu hồi từ {{name}}',
    leaverRecoveryBody: '{{count}} tài sản người này đứng tên do bạn xử lý',
  },
};

export default viVN;
