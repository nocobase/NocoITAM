import type { AppServerResource } from './en-US.js';

const zhTW: AppServerResource = {
  notifications: {
    approvalRequested: '待你簽核：{{title}}',
    commentMentioned: '{{actor}} 在 {{title}} 中提及了你',
    commentReplied: '{{actor}} 在 {{title}} 中回覆了留言',
    approvalApproved: '已核准：{{title}}',
    approvalRejected: '已駁回：{{title}}',
    approvalBody: '有一份申請在等你決定',
    auditStarted: '盤點已開始：{{name}}',
    auditStartedBody: '預計截止 {{date}}',
    loanOverdue: '借出逾期：{{deviceNo}}',
    loanOverdueBody: '預計歸還日期 {{date}}',
    leaverRecovery: '待收回：{{name}} 的資產',
    leaverRecoveryBody: '其中 {{count}} 項由你處理',
  },
};

export default zhTW;
