import type { AppServerResource } from './en-US.js';

const zhCN: AppServerResource = {
  notifications: {
    approvalRequested: '待你审批：{{title}}',
    approvalApproved: '已批准：{{title}}',
    approvalRejected: '已拒绝：{{title}}',
    approvalBody: '有一条申请在等你的决定',
    auditStarted: '盘点已开始：{{name}}',
    auditStartedBody: '计划截止 {{date}}',
    loanOverdue: '借出逾期：{{deviceNo}}',
    loanOverdueBody: '预计归还日期 {{date}}',
    leaverRecovery: '待回收：{{name}} 的资产',
    leaverRecoveryBody: '其中 {{count}} 项由你负责',
    onboardingAdvice: 'Noco 已为 {{name}} 挑好入职配备',
    onboardingAdviceBody: '{{count}} 项建议等你确认或更换',
  },
};

export default zhCN;
