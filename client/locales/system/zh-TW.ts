import settings from './settings-zh-TW.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalZhTW from '#extensions/nocobase-device-approval/locales/zh-TW';
import inboxZhTW from '#extensions/nocobase-inbox/locales/zh-TW';

/** The Traditional Chinese (Taiwan) copy of what the template ships; see `./en-US.ts`. */
const systemZhTW: SystemResource = {
  flowDiagram: {
    controls: '流程圖控制',
    fitView: '符合畫布',
    fullscreen: '全螢幕',
    exitFullscreen: '結束全螢幕',
    escapeHint: '按 Escape 結束',
    leavesTo: '可轉到',
    arrivesFrom: '來自',
    otherRoutes: '其他流轉',
    minimap: '流程縮圖導覽',

    configure: '設定',
    overview: '流程縮圖導覽',
    actualSize: '實際大小',
    states: '狀態',
    transitions: '轉換',
    configurable: '可設定參數',
    current: '目前',
    visited: '已經過',
    initial: '初始狀態',
    final: '終止狀態',
    state: '狀態',
    zoomOut: '縮小',
    zoomIn: '放大',
    fit: '符合畫布',

    empty: '暫無可顯示的狀態。',
    loading: '正在排列流程圖…',
    failed: '無法排列此流程圖。',
    nodeHelp: '按 Enter 或空白鍵選擇狀態。',
    edgeHelp: '按 Enter 或空白鍵選擇轉換。',
  },
  settings,
  'auth.preparingSession': '正在準備登入工作階段…',
  'auth.connectionFailed': '連線失敗',
  'auth.connectionFailedDescription':
    '即時連線暫時無法就緒。請重試以進入應用，或登出。',

  'auth.passwordResetSuccess': '密碼已重設，請使用新密碼登入。',
  'auth.requestNewResetLink': '重新申請重設連結',

  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalZhTW,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxZhTW,
  // The UI Library component of the header's inbox button.
  'inboxButton.title': '收件匣',
  'inboxButton.pending': '收件匣，{{count}} 項待處理',
  'inboxButton.unread': '收件匣，{{count}} 則未讀',
  'inboxButton.pendingHint': '{{count}} 項等你處理，處理後減少。',
  'inboxButton.unreadHint': '{{count}} 則未讀，閱讀後減少。',
  'auth.welcome': '歡迎回來',
  'auth.loginDescription': '使用使用者名稱或電子郵件和密碼登入。',
  'auth.registerTitle': '建立帳戶',
  'auth.registerDescription': '建立帳戶以開始使用。',
  'auth.forgotTitle': '忘記密碼',
  'auth.forgotDescription': '輸入電子郵件，如果帳戶存在，我們將寄送重設連結。',
  'auth.passwordResetUnavailable': '未開放自助重設密碼，請聯絡管理員重設密碼。',
  'auth.capabilityLoadFailed': '無法確認是否已開放自助重設密碼。',
  'auth.retry': '重試',
  'auth.loading': '載入中',
  'auth.resetDescription': '為帳戶設定新密碼。',
  'auth.resetTitle': '重設密碼',
  'auth.identifier': '使用者名稱或電子郵件',
  'auth.password': '密碼',
  'auth.signIn': '登入',
  'auth.signingIn': '正在登入…',
  'auth.hidePassword': '隱藏密碼',
  'auth.showPassword': '顯示密碼',
  'auth.forgotLink': '忘記密碼？',
  'auth.noAccount': '還沒有帳戶？',
  'auth.signUp': '註冊',
  'auth.createAccount': '建立帳戶',
  'auth.creatingAccount': '正在建立帳戶…',
  'auth.name': '姓名',
  'auth.username': '使用者名稱',
  'auth.email': '電子郵件',
  'auth.confirmPassword': '確認密碼',
  'auth.existingAccount': '已有帳戶？',
  'auth.passwordMismatch': '兩次輸入的密碼不一致。',
  'auth.resetting': '正在重設…',
  'auth.newPassword': '新密碼',
  'auth.confirmNewPassword': '確認新密碼',
  'auth.invalidResetLink': '此密碼重設連結無效或已過期。',
  'auth.backToSignIn': '返回登入',
  'auth.sendResetLink': '寄送重設連結',
  'auth.sending': '正在寄送…',
  'auth.resetSent': '如果帳戶存在，重設連結已寄出。',
  'auth.rememberPassword': '記得密碼？',
  'auth.methods': '登入方式',
  'auth.or': '或使用以下方式繼續',
  'auth.continueWith': '使用 {provider} 繼續',
  'auth.about': '關於此應用',
  'auth.platform': 'AI 原生應用平台',
  'auth.marketingTitleFirst': '讓 AI 自由建構。',
  'auth.marketingTitleSecond': 'NocoBase 保障',
  'auth.marketingTitleThird': '可靠運作。',
  'auth.marketingDescription':
    '讓 AI 在靈活的前端框架上建構每一種體驗，由 NocoBase 保障底層資料、權限與治理。',
  'auth.frontend': 'AI 原生前端',
  'auth.frontendDescription': '在靈活的框架上自由建構介面。',
  'auth.foundation': 'NocoBase 基礎能力',
  'auth.foundationDescription': '可靠的資料、存取控制與治理。',
  'auth.marketingFooter': '自由建構，可靠支撐。',
  'status.loading': '載入中',
  'status.loadingPage': '正在載入頁面',
  'status.denied': '無權存取',
  'status.pageFailed': '無法載入頁面',
  'status.retry': '重試',
  'navigation.brandHome': 'NocoBase 首頁',
  'navigation.brandApps': 'NocoBase 應用',
  'routeOverlay.close': '關閉',
  'status.deniedDescription': '你沒有存取 {{label}} 的權限。',
  'status.routeFailedDescription':
    '無法載入 {{packageName}} 的路由 {{label}}。',
  shell: {
    buildFreely: 'AI 自由建構',
    reliability: '<brand>NocoBase</brand> 保障可靠',
  },
  home: {
    platform: 'NocoBase · AI 原生應用平台',
    title: '說出需求，由 Agent 來建構',
    description:
      '這個應用透過和 Coding Agent 對話來開發。用平常的話說明業務需要什麼，它會在這個專案裡撰寫頁面、資料模型、API 和業務流程。',
    steps: {
      describe: {
        title: '描述需求',
        description: '說明誰來使用、要記錄哪些資料、希望發生什麼。',
      },
      build: {
        title: '交給 Agent 建構',
        description: '它會閱讀這個專案和內建能力，然後撰寫程式碼。',
      },
      review: {
        title: '檢查並調整',
        description: '重新整理頁面試用，有需要再用同樣的方式提出修改。',
      },
    },
    example: {
      title: '可以這樣提出需求',
      text: '幫我做一個採購單應用。\n\n採購單包含編號、採購項目、申請人、金額和簽核狀態。申請人可以建立採購單，只能檢視自己的採購單；簽核人可以檢視所有待簽核的採購單，並核准或駁回。\n簽核完成後，在收件匣通知申請人，點選即可開啟對應的採購單。',
      hint: '貼到在這個專案中開啟的 Claude Code、Codex、Cursor 或其他 Coding Agent 即可。',
    },
    capabilitiesTitle: '內建能力',
    capabilitiesDescription:
      'Agent 會直接使用這些能力，不必從零開發。開啟任一項，取得可以修改和複製的提示詞。',
    viewPrompts: '檢視提示詞（{{count}}）',
    prompt: {
      label: '提示詞',
      hint: '複製前可以依自己的業務修改提示詞。關閉對話框後，修改不會保留。',
      copy: '複製',
      copiedShort: '已複製',
      copied: '提示詞已複製',
      copyFailed: '無法複製，請選取文字後手動複製。',
      reset: '還原預設',
    },
    capabilities: {
      auth: {
        title: '驗證',
        description: '登入、註冊、重設密碼，以及企業單一登入。',
        prompts: {
          disableSignUp: {
            label: '關閉註冊',
            text: '這個應用只供公司員工使用，帳號由管理員統一建立。\n請關閉自助註冊，登入頁不再顯示註冊連結。\n現有員工仍能使用原帳號和密碼登入，保留忘記密碼連結。',
          },
          companySso: {
            label: '企業帳號登入',
            text: '請讓員工使用公司的身分平台登入，採用 OIDC。\n\n保留原有的帳號密碼登入，並增加「企業帳號」按鈕。\n按下後進入企業身分平台，登入成功後回到應用首頁。\n\n首次登入允許建立應用帳號，以身分平台穩定的使用者識別碼識別使用者。\n不要依姓名或電子郵件相同自動關聯既有帳號，新帳號沿用應用的預設權限。\n\n請列出身分平台管理員需要提供的資訊，以及需要登記的回呼網址。',
          },
          apiKeys: {
            label: 'API 金鑰',
            text: '在使用者選單中增加「整合金鑰」項目，使用應用內建的 API 金鑰能力。\n員工只能管理自己建立的金鑰，建立時填寫用途和有效天數。\n建立後只顯示一次完整金鑰，並提示立即複製保存。\n清單顯示每把金鑰的名稱、可辨識的片段、狀態、到期時間和最近使用時間，確認後可以撤銷。\n不要在清單、記錄或詳細資料中顯示完整金鑰。',
          },
        },
      },
      dataSources: {
        title: '資料來源',
        description: '選擇應用資料庫，並使用既有外部資料庫中的業務資料。',
        prompts: {
          postgres: {
            label: '切換資料庫',
            text: '把應用資料庫從 SQLite 切換為 PostgreSQL。\n連線資訊從伺服器的執行設定讀取，不寫進原始碼。\n說明需要安裝哪個資料庫驅動程式、要填寫哪些設定，並提醒我既有資料不會自動移轉。',
          },
          externalDatabase: {
            label: '外部資料庫',
            text: '將公司既有的財務資料庫以唯讀外部資料來源接入，不修改其中的資料表。\n依供應商編號比對，在供應商詳細資料增加「結算資料」區塊，顯示結算週期、信用額度和結算狀態，並標明資料來源。\n供應商聯絡資訊仍從應用資料庫讀取，結算資料直接從外部資料庫讀取，不匯入。\n連線憑證從伺服器的執行設定讀取。',
          },
        },
      },
      authorization: {
        title: '權限',
        description: '控制誰能開啟哪些頁面、執行哪些操作、檢視哪些記錄。',
        prompts: {
          jobs: {
            label: '職務',
            text: '請為應用建立「採購申請人」和「訂單簽核人」兩個職務。\n採購申請人可以進入訂單頁面，檢視本人申請的訂單。\n訂單簽核人可以進入訂單頁面、檢視訂單，並核准或駁回待簽核的訂單。\n只有應用管理員可以變更權限和人員指派。\n請使用應用既有的權限能力，讓管理員之後可以調整權限和指派人員。',
          },
          dataScopes: {
            label: '資料範圍',
            text: '採購申請人只能檢視自己的訂單，以訂單的申請人欄位判斷歸屬。\n訂單簽核人可以檢視所有訂單，並處理待簽核的申請。\n管理員可以在權限集中分別調整每個職務的訂單檢視範圍。',
          },
          restrictions: {
            label: '限制規則',
            text: 'Bob 暫時協助審核採購單，只能檢視金額不超過 2,000 的訂單。\n為他的「檢視訂單」操作增加金額上限，保留他既有的職務和資料範圍。\n限制同時套用在他本人的訂單和分享給他的訂單。\n管理員可以調整金額或移除規則；移除前請說明他的可見範圍可能擴大。',
          },
        },
      },
      workflow: {
        title: '工作流程',
        description:
          '讓業務單據依階段推進，處理等待、逾時、重試，並記錄誰做了什麼。',
        prompts: {
          stages: {
            label: '流程階段',
            text: '為採購單增加處理流程：待簽核 → 待採購 → 已到貨 → 已完成。\n簽核人可以核准或駁回，駁回必須填寫原因，採購單退回申請人修改後重新送出。\n採購人員下單後進入待採購；確認到貨並上傳簽收單後進入已到貨，申請人確認後完成。\n採購單詳細資料只提供目前階段的操作，一般編輯不能變更階段。\n在伺服器端檢查階段和必填資訊，不要覆蓋別人已送出的結果。',
          },
          backgroundExport: {
            label: '背景匯出',
            text: '增加訂單報表頁面，將現有訂單匯出為 CSV。\n送出後進入等待處理，由背景產生，完成後提供下載連結。\n顯示目前階段、檔名、匯出的訂單數，以及送出和系統處理的記錄。\n產生失敗時依規則重試，最終失敗則保留給負責人處理；重複執行不能產生重複的報表檔案。\n重新整理頁面後仍可看到進度和結果，只有獲得授權的人員可以匯出訂單。',
          },
          history: {
            label: '處理歷程',
            text: '在訂單詳細資料顯示目前階段和處理歷程。\n每筆記錄顯示操作人、時間、操作、前後階段，以及駁回原因或簽收單。\n系統自動執行的操作標明由系統執行。\n重新整理頁面後仍保留進度和歷程，完成後可以回顧整個處理過程。',
          },
        },
      },
      scheduler: {
        title: '排程任務',
        description: '在設定的時間執行業務工作，並檢視下次執行時間和結果。',
        prompts: {
          reminder: {
            label: '每日提醒',
            text: '為現有的訂單應用增加「待簽核訂單提醒」。\n\n每個工作日北京時間上午 9 點，找出待簽核的訂單，依簽核人彙總，並向每位簽核人傳送一則站內通知。\n通知顯示待簽核訂單數量，並連結到待簽核訂單清單；沒有待簽核訂單時不傳送。\n管理員可以檢視排程和執行記錄，並暫停或恢復提醒。',
          },
          weeklyReport: {
            label: '每週報表',
            text: '每週一北京時間上午 8 點產生上週的銷售彙總，並通知銷售主管。\n內容包含銷售額、訂單數量和各區域合計。管理員可以檢視任務和執行記錄。',
          },
        },
      },
      notification: {
        title: '通知',
        description:
          '在業務事件發生時，透過站內訊息、電子郵件或群組機器人傳送訊息。',
        prompts: {
          inApp: {
            label: '站內訊息',
            text: '在目前的應用中加入訂單簽核，並透過站內訊息通知申請人簽核結果。\n\n訂單包含編號、名稱、申請人、金額和簽核狀態。\n申請人可以檢視自己的訂單；簽核人可以檢視待簽核訂單並核准或駁回。如果已有訂單和簽核功能，請直接沿用。\n\n核准或駁回後，只向該訂單的申請人傳送一則站內訊息。\n標題說明訂單已核准或已駁回，內文包含訂單編號、名稱和簽核結果。\n點選訊息可開啟對應的訂單詳細資料。\n待簽核時不傳送，同一個簽核結果只通知一次。\n通知傳送失敗不影響已儲存的簽核結果。',
          },
          email: {
            label: '電子郵件',
            text: '在現有的訂單簽核通知中加入電子郵件，使用應用已設定的郵件管道。\n\n訂單核准或駁回後，將結果寄到申請人帳戶的電子郵件地址。\n主旨包含訂單編號，內文包含訂單名稱和結果。\n保留既有的站內訊息；申請人沒有電子郵件地址時，只傳送站內訊息。\n郵件寄送失敗不能影響簽核結果或站內訊息。',
          },
        },
      },
      mail: {
        title: '郵件',
        description: '連結個人信箱，閱讀、回覆和寄送業務郵件。',
        prompts: {
          providers: {
            label: '郵件服務商',
            text: '在伺服器設定的 mail.providers 中為應用設定 mailbox.org：\n- IMAP 收信伺服器：imap.mailbox.org，連接埠 993，SSL/TLS。\n- SMTP 寄信伺服器：smtp.mailbox.org，連接埠 465，SSL/TLS。\n使用者在信箱帳號頁面填寫自己的電子郵件地址、使用者名稱和密碼，並選擇首次同步的起始日期；信箱密碼絕不寫進設定或原始碼。',
          },
          mailCenter: {
            label: '郵件中心',
            text: '應用已內建郵件功能，請直接沿用，不要重新開發或另外安裝外掛。\n在導覽中增加「郵件中心」和「信箱帳號」兩個頁面，分別使用郵件功能提供的郵件工作區和信箱帳號頁面。\n使用者可以連結自己的信箱、同步來信、閱讀郵件和附件並回覆；回覆時保留原主旨和對話脈絡，收件人為原寄件人。\n每位使用者只處理自己連結的信箱。',
          },
          correspondence: {
            label: '客戶往來郵件',
            text: '在客戶詳細資料中加入往來郵件區塊，沿用應用內建的郵件閱讀和撰寫元件。\n顯示寄件人或收件人符合目前客戶聯絡人電子郵件地址的郵件。業務人員可以閱讀郵件、檢視附件，並使用自己連結的信箱回覆。',
          },
        },
      },
      file: {
        title: '檔案',
        description: '上傳檔案並附加到記錄，支援預覽和下載。',
        prompts: {
          attachments: {
            label: '附件',
            text: '為我現有的訂單管理應用加入採購附件。\n\n在訂單詳細資料中加入附件區，每筆訂單可以有多個檔案，支援 PDF、圖片和 DOCX。\n顯示檔名和大小，並提供預覽、下載和移除附件的操作。\n上傳後，讓使用者將附件儲存到目前的訂單；重新開啟訂單時仍可看到。\n能存取訂單的人都可以檢視和下載其附件；申請人和簽核人可以新增或移除附件。\n移除附件只解除它與目前訂單的關聯，保留檔案。',
          },
          avatar: {
            label: '大頭貼',
            text: '為每位員工加入大頭貼，每人一張圖片。\n支援上傳和更換大頭貼，並在員工清單和詳細資料中顯示。\n更換後使用新的大頭貼，重新整理頁面後仍能顯示。',
          },
        },
      },
      i18n: {
        title: '語言',
        description: '切換介面語言、新增語言，並設定預設語言。',
        prompts: {
          addLanguage: {
            label: '新增語言',
            text: '為我的應用加入西班牙語。翻譯介面和伺服器訊息，並在語言選單中加入西班牙語。',
          },
          defaultLanguage: {
            label: '預設語言',
            text: '將簡體中文設為應用的預設語言，供尚未選擇語言的人使用。語言選單中繼續保留英文。',
          },
        },
      },
      theme: {
        title: '主題',
        description: '調整色彩、字型和密度，並切換淺色和深色。',
        prompts: {
          changeTheme: {
            label: '修改主題',
            text: '修改「緊湊」主題：主色改為藍色，並稍微加大圓角。保留目前的字型、字級和緊湊間距。',
          },
          newTheme: {
            label: '新增主題',
            text: '建立一個「森林」主題：以綠色為主色，背景柔和，圓角適中，陰影輕淡。',
          },
        },
      },
    },
  },

  appearance: {
    title: '外觀',
    mode: '色彩模式',
    preset: '主題',
    light: '淺色',
    dark: '深色',
    system: '跟隨系統',
    themes: { default: '寬鬆', compact: '緊湊' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: '關閉',
    save: '儲存',
    cancel: '取消',
    confirm: '確認',
    language: '語言',
  },
  notices: {
    serverLocaleFallback: '伺服器不支援此語言，伺服器端內容已改以英文顯示。',
    languageChangeFailed: '未能完成語言切換，請重試。',
  },
  account: {
    signOutFailed: '登出失敗，請重試。',
    openMenu: '開啟帳戶選單',
    fallback: '帳戶',
    signOut: '登出',
    signingOut: '正在登出…',
  },
  navigation: {
    home: '首頁',
    open: '開啟導覽',
    close: '關閉導覽',
    expand: '展開導覽',
    collapse: '收合導覽',
    toggle: '展開或收合導覽',
    label: '應用導覽',
    description: '前往本應用的頁面。',
    breadcrumb: '麵包屑',
    breadcrumbMore: '顯示中間層級',
    back: '返回',
  },
  dataTable: {
    noResults: '沒有結果。',
    sortAscending: '升冪',
    sortDescending: '降冪',
    hideColumn: '隱藏',
    view: '檢視',
    toggleColumns: '顯示欄',
    selectedCount: '已選取 {{selected}} / {{total}} 列。',
    rowsPerPage: '每頁列數',
    pageOf: '第 {{page}} 頁，共 {{pageCount}} 頁',
    firstPage: '第一頁',
    previousPage: '上一頁',
    nextPage: '下一頁',
    lastPage: '最後一頁',
  },
  datePicker: {
    placeholder: '選擇日期',
    rangePlaceholder: '選擇日期範圍',
  },
};

export default systemZhTW;
