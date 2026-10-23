import type { DeviceApprovalLocale } from './en-US.js';

const jaJP: DeviceApprovalLocale = {
  'deviceApproval.title': 'デバイスを承認',
  'deviceApproval.description':
    'コマンドラインまたは別のデバイスが、あなたとしてサインインしようとしています。サインインをご自身で開始した場合にのみ承認してください。',
  'deviceApproval.enterCode':
    'デバイスに表示されているコードを入力してください。',
  'deviceApproval.codeLabel': 'コード',
  'deviceApproval.continue': '続行',
  'deviceApproval.checking': 'コードを確認しています…',
  'deviceApproval.confirm':
    'このコードがデバイスに表示されているコードと一致することを確認してください。',
  'deviceApproval.client': '{{client}} からの要求',
  'deviceApproval.approve': '承認',
  'deviceApproval.approving': '承認しています…',
  'deviceApproval.deny': '拒否',
  'deviceApproval.denying': '拒否しています…',
  'deviceApproval.approved':
    'デバイスを承認しました。ターミナルに戻って続行してください。このページは閉じてかまいません。',
  'deviceApproval.denied':
    '要求を拒否しました。デバイスはサインインしていません。このページは閉じてかまいません。',
  'deviceApproval.expired':
    'このコードは期限切れです。デバイスでもう一度サインインを開始してください。',
  'deviceApproval.invalid':
    'このコードは無効です。デバイスの表示と照らし合わせて、もう一度お試しください。',
  'deviceApproval.notYours': 'このコードは別のアカウントで承認処理中です。',
  'deviceApproval.error': '問題が発生しました。もう一度お試しください。',
  'deviceApproval.retry': '再試行',
  'deviceApproval.otherCode': '別のコードを入力',
};

export default jaJP;
