import settings from './settings-ko-KR.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalKoKR from '#extensions/nocobase-device-approval/locales/ko-KR';
import inboxKoKR from '#extensions/nocobase-inbox/locales/ko-KR';

/** The Korean copy of what the template ships; see `./en-US.ts`. */
const systemKoKR: SystemResource = {
  flowDiagram: {
    controls: '흐름도 조작',
    fitView: '화면에 맞추기',
    fullscreen: '전체 화면',
    exitFullscreen: '전체 화면 종료',
    escapeHint: 'Esc 키를 눌러 종료',
    leavesTo: '다음 상태',
    arrivesFrom: '이전 상태',
    otherRoutes: '기타 전환',
    minimap: '흐름도 개요',

    configure: '설정',
    overview: '흐름도 개요',
    actualSize: '실제 크기',
    states: '상태',
    transitions: '전환',
    configurable: '매개변수',
    current: '현재',
    visited: '거쳐 온 상태',
    initial: '초기 상태',
    final: '최종 상태',
    state: '상태',
    zoomOut: '축소',
    zoomIn: '확대',
    fit: '화면에 맞추기',

    empty: '표시할 상태가 없습니다.',
    loading: '흐름도를 배치하는 중…',
    failed: '이 흐름도를 배치할 수 없습니다.',
    nodeHelp: 'Enter 또는 Space 키를 눌러 상태를 선택합니다.',
    edgeHelp: 'Enter 또는 Space 키를 눌러 전환을 선택합니다.',
  },
  settings,
  'auth.preparingSession': '세션을 준비하는 중…',
  'auth.connectionFailed': '연결할 수 없습니다',
  'auth.connectionFailedDescription':
    '실시간 연결을 준비할 수 없습니다. 다시 시도하여 애플리케이션에 들어가거나 로그아웃하십시오.',

  'auth.passwordResetSuccess':
    '비밀번호가 재설정되었습니다. 새 비밀번호로 로그인하십시오.',
  'auth.requestNewResetLink': '재설정 링크 다시 요청',

  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalKoKR,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxKoKR,
  // The UI Library component of the header's inbox button.
  'inboxButton.title': '수신함',
  'inboxButton.pending': '수신함, 처리 대기 {{count}}건',
  'inboxButton.unread': '수신함, 읽지 않음 {{count}}건',
  'inboxButton.pendingHint':
    '처리를 기다리는 항목이 {{count}}건 있습니다. 처리하면 줄어듭니다.',
  'inboxButton.unreadHint':
    '읽지 않은 항목이 {{count}}건 있습니다. 읽으면 줄어듭니다.',
  'auth.welcome': '다시 오신 것을 환영합니다',
  'auth.loginDescription':
    '사용자 이름 또는 이메일과 비밀번호로 로그인하십시오.',
  'auth.registerTitle': '계정 만들기',
  'auth.registerDescription': '계정을 만들어 시작하십시오.',
  'auth.forgotTitle': '비밀번호 찾기',
  'auth.forgotDescription':
    '이메일을 입력하십시오. 계정이 있으면 재설정 링크를 보내 드립니다.',
  'auth.passwordResetUnavailable':
    '셀프 서비스 비밀번호 재설정이 활성화되어 있지 않습니다. 관리자에게 비밀번호 재설정을 요청하십시오.',
  'auth.capabilityLoadFailed':
    '비밀번호 재설정을 사용할 수 있는지 확인할 수 없습니다.',
  'auth.retry': '다시 시도',
  'auth.loading': '불러오는 중',
  'auth.resetDescription': '계정의 새 비밀번호를 설정하십시오.',
  'auth.resetTitle': '비밀번호 재설정',
  'auth.identifier': '사용자 이름 또는 이메일',
  'auth.password': '비밀번호',
  'auth.signIn': '로그인',
  'auth.signingIn': '로그인하는 중…',
  'auth.hidePassword': '비밀번호 숨기기',
  'auth.showPassword': '비밀번호 표시',
  'auth.forgotLink': '비밀번호를 잊으셨습니까?',
  'auth.noAccount': '계정이 없으십니까?',
  'auth.signUp': '회원 가입',
  'auth.createAccount': '계정 만들기',
  'auth.creatingAccount': '계정을 만드는 중…',
  'auth.name': '이름',
  'auth.username': '사용자 이름',
  'auth.email': '이메일',
  'auth.confirmPassword': '비밀번호 확인',
  'auth.existingAccount': '이미 계정이 있으십니까?',
  'auth.passwordMismatch': '비밀번호가 일치하지 않습니다.',
  'auth.resetting': '재설정하는 중…',
  'auth.newPassword': '새 비밀번호',
  'auth.confirmNewPassword': '새 비밀번호 확인',
  'auth.invalidResetLink':
    '이 비밀번호 재설정 링크는 유효하지 않거나 만료되었습니다.',
  'auth.backToSignIn': '로그인으로 돌아가기',
  'auth.sendResetLink': '재설정 링크 보내기',
  'auth.sending': '보내는 중…',
  'auth.resetSent': '계정이 있으면 재설정 링크를 보냈습니다.',
  'auth.rememberPassword': '비밀번호가 기억나셨습니까?',
  'auth.methods': '로그인 방법',
  'auth.or': '또는 다음으로 계속',
  'auth.continueWith': '{provider}(으)로 계속',
  'auth.about': '이 애플리케이션 정보',
  'auth.platform': 'AI 네이티브 애플리케이션 플랫폼',
  'auth.marketingTitleFirst': 'AI는 자유롭게 만들고,',
  'auth.marketingTitleSecond': 'NocoBase는',
  'auth.marketingTitleThird': '신뢰성을 지킵니다.',
  'auth.marketingDescription':
    'AI는 유연한 프런트엔드 프레임워크로 각 경험을 만들고, NocoBase는 그 아래의 데이터, 권한, 거버넌스를 지킵니다.',
  'auth.frontend': 'AI 네이티브 프런트엔드',
  'auth.frontendDescription':
    '유연한 프레임워크 위에서 자유롭게 화면을 구성합니다.',
  'auth.foundation': 'NocoBase 기반',
  'auth.foundationDescription': '신뢰할 수 있는 데이터, 접근 제어, 거버넌스.',
  'auth.marketingFooter': '위에는 자유를, 아래에는 안심을.',
  'status.loading': '불러오는 중',
  'status.loadingPage': '페이지를 불러오는 중',
  'status.denied': '접근이 거부되었습니다',
  'status.pageFailed': '페이지를 불러올 수 없습니다',
  'status.retry': '다시 시도',
  'navigation.brandHome': 'NocoBase 홈',
  'navigation.brandApps': 'NocoBase 애플리케이션',
  'routeOverlay.close': '닫기',
  'status.deniedDescription': '{{label}}에 접근할 권한이 없습니다.',
  'status.routeFailedDescription':
    '{{packageName}}의 라우트 {{label}}을(를) 불러올 수 없습니다.',
  shell: {
    buildFreely: 'AI는 자유롭게 만듭니다.',
    reliability: '<brand>NocoBase</brand>가 신뢰성을 지킵니다.',
  },
  home: {
    platform: 'NocoBase · AI 네이티브 애플리케이션 플랫폼',
    title: '설명하면 에이전트가 만듭니다',
    description:
      '이 애플리케이션은 코딩 에이전트와 대화하며 개발합니다. 업무에 필요한 것을 평소 말로 알려 주면, 에이전트가 이 프로젝트에 페이지, 데이터 모델, API, 업무 프로세스를 작성합니다.',
    steps: {
      describe: {
        title: '필요한 것 설명',
        description:
          '누가 사용하는지, 어떤 데이터를 다루는지, 무엇이 일어나야 하는지 알려 줍니다.',
      },
      build: {
        title: '에이전트가 구축',
        description: '이 프로젝트와 내장 기능을 읽은 다음 코드를 작성합니다.',
      },
      review: {
        title: '확인하고 다듬기',
        description:
          '페이지를 새로 고쳐 사용해 보고, 같은 방식으로 변경을 요청합니다.',
      },
    },
    example: {
      title: '이렇게 요청해 보십시오',
      text: '구매 주문 애플리케이션을 만들어 주세요.\n\n주문에는 번호, 품목, 신청자, 금액, 승인 상태가 있습니다. 신청자는 주문을 만들고 자신의 주문만 볼 수 있습니다. 검토자는 승인 대기 중인 모든 주문을 보고 승인하거나 반려합니다.\n결정이 나면 주문 링크와 함께 신청자의 수신함으로 알려 주세요.',
      hint: '이 프로젝트에서 연 Claude Code, Codex, Cursor 등 코딩 에이전트에 붙여 넣으십시오.',
    },
    capabilitiesTitle: '내장 기능',
    capabilitiesDescription:
      '에이전트는 이 기능들을 처음부터 만들지 않고 그대로 사용합니다. 하나를 열면 편집하고 복사할 수 있는 프롬프트가 표시됩니다.',
    viewPrompts: '프롬프트 보기 ({{count}})',
    prompt: {
      label: '프롬프트',
      hint: '복사하기 전에 업무에 맞게 프롬프트를 편집하십시오. 대화 상자를 닫으면 변경 내용은 저장되지 않습니다.',
      copy: '복사',
      copiedShort: '복사됨',
      copied: '프롬프트를 복사했습니다',
      copyFailed: '복사할 수 없습니다. 텍스트를 선택하여 직접 복사하십시오.',
      reset: '기본값으로 되돌리기',
    },
    capabilities: {
      auth: {
        title: '인증',
        description: '로그인, 회원 가입, 비밀번호 재설정, 사내 통합 로그인.',
        prompts: {
          disableSignUp: {
            label: '회원 가입 닫기',
            text: '이 애플리케이션은 회사 직원 전용입니다. 모든 계정은 관리자가 만듭니다.\n셀프 가입을 비활성화하고 로그인 페이지에서 회원 가입 링크를 제거해 주세요.\n기존 직원은 계속 자신의 계정과 비밀번호로 로그인할 수 있어야 합니다.\n비밀번호 찾기 링크는 유지해 주세요.',
          },
          companySso: {
            label: '사내 SSO',
            text: '직원이 OIDC를 사용해 회사의 ID 플랫폼으로 로그인할 수 있게 해 주세요.\n\n계정·비밀번호 로그인은 유지하고 "회사 계정" 버튼을 추가해 주세요.\n버튼을 누르면 회사 ID 플랫폼이 열립니다. 로그인에 성공하면 애플리케이션 홈페이지로 돌아옵니다.\n\n첫 로그인 시 애플리케이션 계정을 만들 수 있게 하고, ID 플랫폼의 변하지 않는 사용자 식별자로 식별해 주세요.\n이름이나 이메일이 일치한다고 계정을 자동으로 연결하지 마세요. 새 계정에는 애플리케이션의 기본 권한을 부여합니다.\n\nID 플랫폼 관리자가 제공해야 할 정보와 등록해야 할 콜백 URL을 정리해 주세요.',
          },
          apiKeys: {
            label: 'API 키',
            text: '애플리케이션에 내장된 API 키 기능을 사용해 사용자 메뉴에 "연동 키" 항목을 추가해 주세요.\n직원은 자신이 만든 키만 관리하며, 용도와 유효 기간(일)을 입력합니다.\n전체 키는 생성 직후 한 번만 보여 주고, 바로 복사해 보관하라고 안내해 주세요.\n각 키의 이름, 식별 가능한 일부, 상태, 만료일, 마지막 사용 시각을 나열하고, 확인 후 취소할 수 있게 해 주세요.\n목록, 로그, 상세 화면에는 전체 키를 절대 표시하지 마세요.',
          },
        },
      },
      dataSources: {
        title: '데이터 소스',
        description:
          '애플리케이션 데이터베이스를 선택하고 기존 외부 데이터베이스의 업무 데이터를 활용합니다.',
        prompts: {
          postgres: {
            label: '데이터베이스 전환',
            text: '애플리케이션 데이터베이스를 SQLite에서 PostgreSQL로 전환해 주세요.\n연결 정보는 소스 코드가 아니라 서버의 런타임 설정에서 읽어 주세요.\n설치할 데이터베이스 드라이버와 입력할 설정 항목을 설명하고, 기존 데이터는 자동으로 이전되지 않는다는 점을 알려 주세요.',
          },
          externalDatabase: {
            label: '외부 데이터베이스',
            text: '회사의 기존 재무 데이터베이스를 읽기 전용 외부 데이터 소스로 연결해 주세요. 그 테이블은 수정하지 마세요.\n공급업체 번호로 레코드를 대조하고, 공급업체 상세에 "정산" 섹션을 추가해 정산 주기, 신용 한도, 정산 상태를 출처와 함께 표시해 주세요.\n공급업체 연락처는 계속 애플리케이션 데이터베이스에서 읽고, 정산 데이터는 가져오지 않고 외부 데이터베이스에서 직접 읽어 주세요.\n연결 인증 정보는 서버의 런타임 설정에서 읽어 주세요.',
          },
        },
      },
      authorization: {
        title: '권한',
        description:
          '누가 어떤 페이지를 열고, 어떤 작업을 실행하고, 어떤 레코드를 볼 수 있는지 제어합니다.',
        prompts: {
          jobs: {
            label: '직무',
            text: '애플리케이션에 "구매 신청자"와 "주문 검토자" 직무를 만들어 주세요.\n구매 신청자는 주문 페이지에 들어가 자신이 신청한 주문을 볼 수 있습니다.\n주문 검토자는 주문 페이지에 들어가 주문을 보고, 승인 대기 중인 주문을 승인하거나 반려할 수 있습니다.\n권한과 할당은 애플리케이션 관리자만 변경할 수 있습니다.\n관리자가 나중에 권한을 조정하고 담당자를 할당할 수 있도록 애플리케이션의 기존 권한 기능을 사용해 주세요.',
          },
          dataScopes: {
            label: '데이터 범위',
            text: '구매 신청자는 자신의 주문만 볼 수 있게 하고, 소유자 판단에는 주문의 신청자 필드를 사용해 주세요.\n주문 검토자는 모든 주문을 보고 승인 대기 건을 처리할 수 있습니다.\n관리자는 각 직무의 권한 세트에서 주문 조회 범위를 조정할 수 있습니다.',
          },
          restrictions: {
            label: '제한',
            text: 'Bob은 임시로 구매 주문 검토를 돕고 있으며, 2,000 이하의 주문만 볼 수 있습니다.\n그의 "주문 보기" 작업에 금액 한도를 추가하고, 기존 직무와 데이터 범위는 유지해 주세요.\n이 한도는 그 자신의 주문과 그에게 공유된 주문에 모두 적용해 주세요.\n관리자는 금액을 바꾸거나 규칙을 삭제할 수 있습니다. 삭제하기 전에 그의 조회 범위가 넓어질 수 있다는 점을 설명해 주세요.',
          },
        },
      },
      workflow: {
        title: '워크플로',
        description:
          '업무 레코드를 단계별로 진행하며 대기, 시간 초과, 재시도, 누가 무엇을 했는지의 이력을 다룹니다.',
        prompts: {
          stages: {
            label: '단계',
            text: '구매 주문에 다음 프로세스를 추가해 주세요: 승인 대기 → 구매 대기 → 입고 완료 → 완료.\n검토자는 승인하거나 반려합니다. 반려에는 사유가 필요하며, 주문은 신청자에게 돌아가 수정 후 다시 제출됩니다.\n구매 담당자가 발주하면 주문은 구매 대기가 되고, 서명된 인수증으로 납품을 확인하면 입고 완료로 넘어가며, 신청자가 확인하면 완료됩니다.\n주문 상세에는 현재 단계의 작업만 표시하고, 일반 편집으로는 단계를 바꿀 수 없게 해 주세요.\n단계와 필수 정보는 서버에서 검증하고, 다른 사람이 이미 제출한 결과를 덮어쓰지 마세요.',
          },
          backgroundExport: {
            label: '백그라운드 내보내기',
            text: '기존 주문을 CSV로 내보내는 주문 보고서 페이지를 추가해 주세요.\n제출하면 내보내기는 처리 대기 상태가 되고, 백그라운드에서 생성되어 다운로드 링크와 함께 완료됩니다.\n현재 단계, 파일 이름, 내보낸 주문 수, 제출 및 시스템 처리 기록을 표시해 주세요.\n생성에 실패하면 규칙에 따라 재시도하고, 최종 실패는 담당자가 처리할 수 있도록 남겨 두세요. 다시 실행해도 중복된 보고서 파일을 만들지 않아야 합니다.\n페이지를 새로 고쳐도 진행 상황과 결과가 보이게 하고, 권한이 있는 사람만 주문을 내보낼 수 있게 해 주세요.',
          },
          history: {
            label: '이력',
            text: '주문 상세에 현재 단계와 처리 이력을 표시해 주세요.\n각 항목에는 작업자, 시각, 작업, 전후 단계, 반려 사유나 서명된 인수증을 표시합니다.\n자동으로 실행된 작업은 시스템이 한 것으로 표시해 주세요.\n페이지를 새로 고쳐도 진행 상황과 이력이 유지되어, 완료 후 전체 과정을 되돌아볼 수 있게 해 주세요.',
          },
        },
      },
      scheduler: {
        title: '예약 작업',
        description:
          '정해진 시각에 업무를 실행하고, 다음 실행과 그 결과를 확인합니다.',
        prompts: {
          reminder: {
            label: '매일 알림',
            text: '기존 주문 애플리케이션에 "승인 대기 주문 알림"을 추가해 주세요.\n\n평일 매일 오전 9:00(베이징 시간)에 승인 대기 중인 주문을 찾아 검토자별로 묶고, 각 검토자에게 앱 내 알림을 한 건씩 보내 주세요.\n승인 대기 주문 수를 포함하고 승인 대기 주문 목록 링크를 붙여 주세요. 승인 대기 주문이 없으면 아무것도 보내지 마세요.\n관리자는 일정과 실행 기록을 보고, 알림을 일시 중지하거나 재개할 수 있습니다.',
          },
          weeklyReport: {
            label: '주간 보고서',
            text: '매주 월요일 오전 8:00(베이징 시간)에 지난주 매출 요약을 만들어 영업 관리자에게 알려 주세요.\n매출액, 주문 수, 지역별 합계를 포함해 주세요. 관리자는 작업과 실행 기록을 볼 수 있습니다.',
          },
        },
      },
      notification: {
        title: '알림',
        description:
          '어떤 일이 일어나면 앱 내 메시지, 이메일, 그룹 봇 메시지를 보냅니다.',
        prompts: {
          inApp: {
            label: '앱 내 메시지',
            text: '현재 애플리케이션에 주문 승인을 추가하고, 결과를 앱 내 메시지로 신청자에게 알려 주세요.\n\n주문에는 번호, 이름, 신청자, 금액, 승인 상태가 있습니다.\n신청자는 자신의 주문을 볼 수 있습니다. 검토자는 승인 대기 중인 주문을 보고 승인하거나 반려할 수 있습니다. 기존 주문 및 승인 기능이 있으면 재사용해 주세요.\n\n승인 또는 반려 후에는 그 주문의 신청자에게만 앱 내 메시지를 한 건 보내 주세요.\n제목으로 주문이 승인되었는지 반려되었는지 알리고, 본문에는 주문 번호, 이름, 승인 결과를 포함합니다.\n메시지를 클릭하면 해당 주문 상세가 열립니다.\n승인 대기 중에는 보내지 마세요. 같은 승인 결과는 한 번만 알립니다.\n알림에 실패해도 저장된 승인 결과에는 영향이 없습니다.',
          },
          email: {
            label: '이메일',
            text: '애플리케이션에 설정된 이메일 채널을 사용해 기존 주문 승인 알림에 이메일을 추가해 주세요.\n\n주문이 승인되거나 반려되면 결과를 신청자의 계정 이메일로 보내 주세요.\n제목에는 주문 번호를, 본문에는 주문 이름과 결과를 포함해 주세요.\n기존 앱 내 메시지는 유지해 주세요. 신청자에게 이메일 주소가 없으면 앱 내 메시지만 보내 주세요.\n이메일 발송에 실패해도 승인 결과나 앱 내 메시지에 영향을 주지 않아야 합니다.',
          },
        },
      },
      mail: {
        title: '메일',
        description:
          '개인 메일함을 연결하고 업무 메일을 읽고, 답장하고, 보냅니다.',
        prompts: {
          providers: {
            label: '메일 제공업체',
            text: '서버 설정의 mail.providers에 애플리케이션용 mailbox.org를 설정해 주세요:\n- IMAP 수신 서버: imap.mailbox.org, 포트 993, SSL/TLS.\n- SMTP 발신 서버: smtp.mailbox.org, 포트 465, SSL/TLS.\n사용자는 메일함 계정 페이지에서 자신의 이메일 주소, 사용자 이름, 비밀번호를 입력하고 첫 동기화를 시작할 날짜를 선택합니다. 메일함 비밀번호를 설정이나 소스 코드에 절대 쓰지 마세요.',
          },
          mailCenter: {
            label: '메일 센터',
            text: '메일 기능은 이 애플리케이션에 내장되어 있습니다. 다시 만들거나 다른 플러그인을 설치하지 말고 재사용해 주세요.\n메일 기능이 제공하는 메일 작업 공간과 메일함 계정 페이지를 사용해 내비게이션에 "메일 센터"와 "메일함 계정" 페이지를 추가해 주세요.\n사용자는 자신의 메일함을 연결하고, 수신 메시지를 동기화하고, 메시지와 첨부 파일을 읽고, 원래 제목과 대화 맥락을 유지한 채 원래 보낸 사람에게 답장할 수 있습니다.\n각 사용자는 자신이 연결한 메일함으로 작업합니다.',
          },
          correspondence: {
            label: '고객 메일',
            text: '애플리케이션에 내장된 메일 읽기·작성 컴포넌트를 재사용해 고객 상세에 주고받은 메일 섹션을 추가해 주세요.\n보낸 사람 또는 받는 사람이 현재 고객의 연락처 이메일 주소와 일치하는 메시지를 표시해 주세요. 영업 담당자는 자신이 연결한 메일함을 사용해 메시지를 읽고, 첨부 파일을 보고, 답장할 수 있습니다.',
          },
        },
      },
      file: {
        title: '파일',
        description:
          '파일을 업로드하여 레코드에 첨부하고, 미리 보거나 다운로드합니다.',
        prompts: {
          attachments: {
            label: '첨부 파일',
            text: '기존 주문 관리 애플리케이션에 구매 첨부 파일을 추가해 주세요.\n\n주문 상세에 첨부 파일 영역을 추가해 주세요. 각 주문에는 PDF, 이미지, DOCX 등 여러 파일을 첨부할 수 있습니다.\n파일 이름과 크기를 표시하고, 첨부 파일을 미리 보기, 다운로드, 제거하는 작업을 제공해 주세요.\n업로드 후 사용자가 첨부 파일을 현재 주문에 저장할 수 있게 하고, 주문을 다시 열어도 남아 있게 해 주세요.\n주문에 접근할 수 있는 사람은 누구나 첨부 파일을 보고 다운로드할 수 있습니다. 신청자와 검토자는 첨부 파일을 추가하거나 제거할 수 있습니다.\n첨부 파일을 제거하면 현재 주문과의 연결만 해제하고 파일 자체는 보존해 주세요.',
          },
          avatar: {
            label: '아바타',
            text: '직원마다 아바타 이미지를 한 장씩 추가해 주세요.\n아바타 업로드와 교체를 지원하고, 직원 목록과 상세에 표시해 주세요.\n교체 후에는 새 아바타를 사용하고, 페이지를 새로 고쳐도 보이게 해 주세요.',
          },
        },
      },
      i18n: {
        title: '언어',
        description:
          '인터페이스 언어를 전환하고, 언어를 추가하고, 기본 언어를 설정합니다.',
        prompts: {
          addLanguage: {
            label: '언어 추가',
            text: '애플리케이션에 스페인어를 추가해 주세요. 인터페이스와 서버 메시지를 번역하고 언어 메뉴에 스페인어를 추가해 주세요.',
          },
          defaultLanguage: {
            label: '기본 언어',
            text: '아직 언어를 선택하지 않은 사람을 위해 중국어(간체)를 애플리케이션의 기본 언어로 설정해 주세요. 언어 메뉴에서는 영어도 계속 선택할 수 있게 해 주세요.',
          },
        },
      },
      theme: {
        title: '테마',
        description: '색상, 글꼴, 밀도를 조정하고 라이트와 다크를 전환합니다.',
        prompts: {
          changeTheme: {
            label: '테마 변경',
            text: '"컴팩트" 테마를 수정해 주세요: 기본 색상을 파란색으로 하고 모서리 둥글기를 조금 키워 주세요. 현재 글꼴, 글자 크기, 촘촘한 간격은 그대로 유지해 주세요.',
          },
          newTheme: {
            label: '새 테마',
            text: '초록색을 기본 색상으로 하고, 부드러운 배경, 적당히 둥근 모서리, 은은한 그림자를 가진 "포레스트" 테마를 만들어 주세요.',
          },
        },
      },
    },
  },

  appearance: {
    title: '화면 모양',
    mode: '색상 모드',
    preset: '테마',
    light: '라이트',
    dark: '다크',
    system: '시스템 설정',
    themes: { default: '여유 있게', compact: '컴팩트' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: '닫기',
    save: '저장',
    cancel: '취소',
    confirm: '확인',
    language: '언어',
  },
  notices: {
    serverLocaleFallback:
      '서버가 이 언어를 지원하지 않으므로 서버 메시지는 영어로 표시됩니다.',
    languageChangeFailed: '언어를 변경할 수 없습니다. 다시 시도하십시오.',
  },
  account: {
    signOutFailed: '로그아웃할 수 없습니다. 다시 시도하십시오.',
    openMenu: '계정 메뉴 열기',
    fallback: '계정',
    signOut: '로그아웃',
    signingOut: '로그아웃하는 중…',
  },
  navigation: {
    home: '홈',
    open: '내비게이션 열기',
    close: '내비게이션 닫기',
    expand: '내비게이션 펼치기',
    collapse: '내비게이션 접기',
    toggle: '내비게이션 펼치기/접기',
    label: '애플리케이션 내비게이션',
    description: '이 애플리케이션의 페이지로 이동합니다.',
    breadcrumb: '이동 경로',
    breadcrumbMore: '중간 단계 표시',
    back: '뒤로',
  },
  dataTable: {
    noResults: '결과가 없습니다.',
    sortAscending: '오름차순',
    sortDescending: '내림차순',
    hideColumn: '숨기기',
    view: '보기',
    toggleColumns: '열 표시 전환',
    selectedCount: '{{total}}행 중 {{selected}}행 선택됨.',
    rowsPerPage: '페이지당 행 수',
    pageOf: '{{page}} / {{pageCount}} 페이지',
    firstPage: '첫 페이지로 이동',
    previousPage: '이전 페이지로 이동',
    nextPage: '다음 페이지로 이동',
    lastPage: '마지막 페이지로 이동',
  },
  datePicker: {
    placeholder: '날짜 선택',
    rangePlaceholder: '기간 선택',
  },
};

export default systemKoKR;
