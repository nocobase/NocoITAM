import type { AppServerResource } from './en-US.js';

const jaJP: AppServerResource = {
  notifications: {
    approvalRequested: '承認依頼：{{title}}',
    commentMentioned: '{{actor}} さんが {{title}} であなたをメンションしました',
    commentReplied: '{{actor}} さんが {{title}} に返信しました',
    approvalApproved: '承認されました：{{title}}',
    approvalRejected: '却下されました：{{title}}',
    approvalBody: 'あなたの判断を待っている申請があります',
    auditStarted: '棚卸を開始しました：{{name}}',
    auditStartedBody: '{{date}} までの予定です',
    loanOverdue: '貸出期限超過：{{deviceNo}}',
    loanOverdueBody: '返却予定日は {{date}} です',
    leaverRecovery: '{{name}} さんからの回収',
    leaverRecoveryBody: '保有品のうち {{count}} 件をあなたが処理します',
  },
};

export default jaJP;
