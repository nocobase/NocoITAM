import type { DeviceApprovalLocale } from './en-US.js';

const koKR: DeviceApprovalLocale = {
  formFeedback: {
    field: '이 값이 거부되었습니다. 확인 후 다시 시도하세요.',
    invalid: '표시된 필드를 확인한 후 다시 시도하세요.',
    failed: '저장하지 못했습니다. 입력한 내용은 유지됩니다. 다시 시도하세요.',
    network:
      '연결할 수 없습니다. 연결을 확인한 후 다시 시도하세요. 입력한 내용은 유지됩니다.',
    denied:
      '현재 권한으로는 이 양식을 제출할 수 없습니다. 입력한 내용은 유지됩니다.',
  },
  'deviceApproval.title': '기기 승인',
  'deviceApproval.description':
    '명령줄 또는 다른 기기가 회원님 계정으로 로그인하려고 합니다. 직접 로그인을 시작한 경우에만 승인하십시오.',
  'deviceApproval.enterCode': '기기에 표시된 코드를 입력하십시오.',
  'deviceApproval.codeLabel': '코드',
  'deviceApproval.continue': '계속',
  'deviceApproval.checking': '코드를 확인하는 중…',
  'deviceApproval.confirm':
    '이 코드가 기기에 표시된 코드와 일치하는지 확인하십시오.',
  'deviceApproval.client': '{{client}}의 요청',
  'deviceApproval.approve': '승인',
  'deviceApproval.approving': '승인하는 중…',
  'deviceApproval.deny': '거부',
  'deviceApproval.denying': '거부하는 중…',
  'deviceApproval.approved':
    '기기를 승인했습니다. 터미널로 돌아가 계속하십시오. 이 페이지는 닫아도 됩니다.',
  'deviceApproval.denied':
    '요청을 거부했습니다. 기기는 로그인되지 않았습니다. 이 페이지는 닫아도 됩니다.',
  'deviceApproval.expired':
    '이 코드는 만료되었습니다. 기기에서 로그인을 다시 시작하십시오.',
  'deviceApproval.invalid':
    '유효하지 않은 코드입니다. 기기에 표시된 코드와 비교한 후 다시 시도하십시오.',
  'deviceApproval.notYours': '다른 계정에서 이미 이 코드를 승인하고 있습니다.',
  'deviceApproval.error': '문제가 발생했습니다. 다시 시도하십시오.',
  'deviceApproval.retry': '다시 시도',
  'deviceApproval.otherCode': '다른 코드 입력',
};

export default koKR;
