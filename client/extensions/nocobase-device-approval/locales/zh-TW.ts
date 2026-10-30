import type { DeviceApprovalLocale } from './en-US.js';

const zhTW: DeviceApprovalLocale = {
  formFeedback: {
    field: '此欄位的值未通過驗證，請檢查並修改後重試。',
    invalid: '請檢查標記的欄位後重試。',
    failed: '儲存失敗，已保留您的輸入，請重試。',
    network: '無法連線，請檢查網路後重試。已保留您的輸入。',
    denied: '目前的權限無法送出此表單。已保留您的輸入。',
  },
  'deviceApproval.title': '核准裝置登入',
  'deviceApproval.description':
    '命令列或其他裝置要求以你的身分登入。只有在登入是你自己發起時才核准。',
  'deviceApproval.enterCode': '輸入裝置上顯示的代碼。',
  'deviceApproval.codeLabel': '代碼',
  'deviceApproval.continue': '繼續',
  'deviceApproval.checking': '正在檢查代碼…',
  'deviceApproval.confirm': '請確認此代碼與裝置上顯示的一致。',
  'deviceApproval.client': '由 {{client}} 發起',
  'deviceApproval.approve': '核准',
  'deviceApproval.approving': '正在核准…',
  'deviceApproval.deny': '拒絕',
  'deviceApproval.denying': '正在拒絕…',
  'deviceApproval.approved':
    '裝置已核准。請回到終端機繼續操作，可以關閉此頁面。',
  'deviceApproval.denied': '已拒絕請求，裝置未登入。可以關閉此頁面。',
  'deviceApproval.expired': '此代碼已過期。請在裝置上重新發起登入。',
  'deviceApproval.invalid': '此代碼無效。請對照裝置上的代碼後重試。',
  'deviceApproval.notYours': '此代碼已由另一個帳號處理中。',
  'deviceApproval.error': '發生錯誤，請重試。',
  'deviceApproval.retry': '重試',
  'deviceApproval.otherCode': '輸入其他代碼',
};

export default zhTW;
