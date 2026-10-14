import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  notifications: {
    approvalRequested: '待你审批：{{title}}',
    commentMentioned: '{{actor}} 在 {{title}} 中提到了你',
    commentReplied: '{{actor}} 在 {{title}} 中回复了评论',
    approvalApproved: '已批准：{{title}}',
    approvalRejected: '已拒绝：{{title}}',
    approvalBody: '有一条申请在等你的决定',
    auditStarted: '盘点已开始：{{name}}',
    auditStartedBody: '计划截止 {{date}}',
    loanOverdue: '借出逾期：{{deviceNo}}',
    loanOverdueBody: '预计归还日期 {{date}}',
    leaverRecovery: '待回收：{{name}} 的资产',
    leaverRecoveryBody: '其中 {{count}} 项由你负责',
  },
};

export default zhCN;
