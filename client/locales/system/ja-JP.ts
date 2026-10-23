import settings from './settings-ja-JP.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalJaJP from '#extensions/nocobase-device-approval/locales/ja-JP';
import inboxJaJP from '#extensions/nocobase-inbox/locales/ja-JP';

/** The Japanese copy of what the template ships; see `./en-US.ts`. */
const systemJaJP: SystemResource = {
  flowDiagram: {
    controls: 'フロー図の操作',
    fitView: '全体を表示',
    fullscreen: '全画面表示',
    exitFullscreen: '全画面表示を終了',
    escapeHint: 'Escape キーで終了',
    leavesTo: '遷移先',
    arrivesFrom: '遷移元',
    otherRoutes: 'その他の遷移',
    minimap: 'フロー図の概観',

    configure: '設定',
    overview: 'フロー図の概観',
    actualSize: '実際のサイズ',
    states: '状態',
    transitions: '遷移',
    configurable: 'パラメーター',
    current: '現在',
    visited: '経由済み',
    initial: '初期状態',
    final: '終了状態',
    state: '状態',
    zoomOut: '縮小',
    zoomIn: '拡大',
    fit: '全体を表示',

    empty: '表示できる状態はありません。',
    loading: 'フロー図をレイアウトしています…',
    failed: 'このフロー図をレイアウトできませんでした。',
    nodeHelp: 'Enter キーまたは Space キーで状態を選択します。',
    edgeHelp: 'Enter キーまたは Space キーで遷移を選択します。',
  },
  settings,
  'auth.preparingSession': 'セッションを準備しています…',
  'auth.connectionFailed': '接続できません',
  'auth.connectionFailedDescription':
    'リアルタイム接続を準備できませんでした。再試行してアプリケーションに入るか、サインアウトしてください。',

  'auth.passwordResetSuccess':
    'パスワードをリセットしました。新しいパスワードでサインインしてください。',
  'auth.requestNewResetLink': 'リセット用のリンクを再発行',

  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalJaJP,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxJaJP,
  // The UI Library component of the header's inbox button.
  'inboxButton.title': '受信トレイ',
  'inboxButton.pending': '受信トレイ、対応待ち {{count}} 件',
  'inboxButton.unread': '受信トレイ、未読 {{count}} 件',
  'inboxButton.pendingHint':
    'あなたの対応を待っているものが {{count}} 件あります。処理すると減ります。',
  'inboxButton.unreadHint': '未読が {{count}} 件あります。読むと減ります。',
  'auth.welcome': 'おかえりなさい',
  'auth.loginDescription':
    'ユーザー名またはメールアドレスとパスワードでサインインしてください。',
  'auth.registerTitle': 'アカウントを作成',
  'auth.registerDescription': 'アカウントを作成して始めましょう。',
  'auth.forgotTitle': 'パスワードをお忘れの場合',
  'auth.forgotDescription':
    'メールアドレスを入力してください。アカウントが存在する場合は、リセット用のリンクを送信します。',
  'auth.passwordResetUnavailable':
    'セルフサービスのパスワードリセットは有効になっていません。パスワードのリセットは管理者に依頼してください。',
  'auth.capabilityLoadFailed':
    'パスワードリセットが利用できるか確認できませんでした。',
  'auth.retry': '再試行',
  'auth.loading': '読み込み中',
  'auth.resetDescription': 'アカウントの新しいパスワードを設定してください。',
  'auth.resetTitle': 'パスワードをリセット',
  'auth.identifier': 'ユーザー名またはメールアドレス',
  'auth.password': 'パスワード',
  'auth.signIn': 'サインイン',
  'auth.signingIn': 'サインインしています…',
  'auth.hidePassword': 'パスワードを隠す',
  'auth.showPassword': 'パスワードを表示',
  'auth.forgotLink': 'パスワードをお忘れですか？',
  'auth.noAccount': 'アカウントをお持ちでないですか？',
  'auth.signUp': '新規登録',
  'auth.createAccount': 'アカウントを作成',
  'auth.creatingAccount': 'アカウントを作成しています…',
  'auth.name': '氏名',
  'auth.username': 'ユーザー名',
  'auth.email': 'メールアドレス',
  'auth.confirmPassword': 'パスワード (確認)',
  'auth.existingAccount': 'アカウントをお持ちですか？',
  'auth.passwordMismatch': 'パスワードが一致しません。',
  'auth.resetting': 'リセットしています…',
  'auth.newPassword': '新しいパスワード',
  'auth.confirmNewPassword': '新しいパスワード (確認)',
  'auth.invalidResetLink':
    'このパスワードリセット用のリンクは無効か、期限が切れています。',
  'auth.backToSignIn': 'サインインに戻る',
  'auth.sendResetLink': 'リセット用のリンクを送信',
  'auth.sending': '送信しています…',
  'auth.resetSent':
    'アカウントが存在する場合は、リセット用のリンクを送信しました。',
  'auth.rememberPassword': 'パスワードを思い出しましたか？',
  'auth.methods': 'サインイン方法',
  'auth.or': 'または次の方法で続行',
  'auth.continueWith': '{provider} で続行',
  'auth.about': 'このアプリケーションについて',
  'auth.platform': 'AI ネイティブなアプリケーションプラットフォーム',
  'auth.marketingTitleFirst': 'AI は自由に構築し、',
  'auth.marketingTitleSecond': 'NocoBase が',
  'auth.marketingTitleThird': '信頼性を守る。',
  'auth.marketingDescription':
    'AI には柔軟なフロントエンドフレームワークで体験を形づくらせ、その土台となるデータ、権限、ガバナンスは NocoBase が守ります。',
  'auth.frontend': 'AI ネイティブなフロントエンド',
  'auth.frontendDescription':
    '柔軟なフレームワークの上で自由に画面を構築できます。',
  'auth.foundation': 'NocoBase の基盤',
  'auth.foundationDescription': '信頼できるデータ、アクセス制御、ガバナンス。',
  'auth.marketingFooter': '上には自由を。下には安心を。',
  'status.loading': '読み込み中',
  'status.loadingPage': 'ページを読み込み中',
  'status.denied': 'アクセスが拒否されました',
  'status.pageFailed': 'ページを読み込めませんでした',
  'status.retry': '再試行',
  'navigation.brandHome': 'NocoBase ホーム',
  'navigation.brandApps': 'NocoBase アプリケーション',
  'routeOverlay.close': '閉じる',
  'status.deniedDescription': '{{label}} にアクセスする権限がありません。',
  'status.routeFailedDescription':
    '{{packageName}} のルート {{label}} を読み込めませんでした。',
  shell: {
    buildFreely: 'AI が自由に構築。',
    reliability: '<brand>NocoBase</brand> が信頼性を支えます。',
  },
  home: {
    platform: 'NocoBase · AI ネイティブなアプリケーションプラットフォーム',
    title: '説明するだけで、エージェントが構築します',
    description:
      'このアプリケーションは、コーディングエージェントとの対話で開発します。業務に必要なことを普段の言葉で伝えると、エージェントがこのプロジェクトにページ、データモデル、API、業務フローを書き込みます。',
    steps: {
      describe: {
        title: '必要なことを説明',
        description:
          '誰が使うのか、どんなデータを扱うのか、何が起きるべきかを伝えます。',
      },
      build: {
        title: 'エージェントが構築',
        description:
          'このプロジェクトと組み込み機能を読み取り、コードを書きます。',
      },
      review: {
        title: '確認して改善',
        description: 'ページを再読み込みして試し、同じように変更を依頼します。',
      },
    },
    example: {
      title: 'たとえばこのように依頼します',
      text: '購買申請のアプリケーションを作ってください。\n\n申請には番号、品目、申請者、金額、承認ステータスがあります。申請者は申請を作成し、自分の申請だけを見られます。承認者は承認待ちのすべての申請を見て、承認または却下します。\n判断が出たら、申請へのリンクを付けて申請者の受信トレイに通知してください。',
      hint: 'このプロジェクトで開いた Claude Code、Codex、Cursor などのコーディングエージェントに貼り付けてください。',
    },
    capabilitiesTitle: '組み込み機能',
    capabilitiesDescription:
      'エージェントはこれらを一から作らず、そのまま使います。開くと、編集してコピーできるプロンプトが表示されます。',
    viewPrompts: 'プロンプトを表示 ({{count}})',
    prompt: {
      label: 'プロンプト',
      hint: 'コピーする前に、業務に合わせてプロンプトを編集してください。ダイアログを閉じると変更は保存されません。',
      copy: 'コピー',
      copiedShort: 'コピーしました',
      copied: 'プロンプトをコピーしました',
      copyFailed:
        'コピーできませんでした。テキストを選択して手動でコピーしてください。',
      reset: '既定に戻す',
    },
    capabilities: {
      auth: {
        title: '認証',
        description:
          'サインイン、新規登録、パスワードリセット、社内シングルサインオン。',
        prompts: {
          disableSignUp: {
            label: '新規登録を停止',
            text: 'このアプリケーションは社員専用です。アカウントはすべて管理者が作成します。\nセルフ登録を無効にし、サインインページから新規登録のリンクを削除してください。\n既存の社員は引き続き自分のアカウントとパスワードでサインインできるようにしてください。\nパスワードを忘れた場合のリンクは残してください。',
          },
          companySso: {
            label: '社内 SSO',
            text: '社員が OIDC を使って社内の ID 基盤でサインインできるようにしてください。\n\nアカウントとパスワードによるサインインは残し、「社内アカウント」ボタンを追加してください。\nボタンを押すと社内の ID 基盤が開きます。サインインに成功したら、アプリケーションのホームページに戻ります。\n\n初回サインイン時にアプリケーションのアカウントを作成できるようにし、ID 基盤の不変のユーザー識別子で識別してください。\n名前やメールアドレスの一致でアカウントを自動的に紐付けないでください。新しいアカウントにはアプリケーションのデフォルト権限を与えます。\n\nID 基盤の管理者が提供すべき情報と、登録が必要なコールバック URL を一覧にしてください。',
          },
          apiKeys: {
            label: 'API キー',
            text: 'アプリケーション組み込みの API キー機能を使って、ユーザーメニューに「連携キー」を追加してください。\n社員は自分が作成したキーだけを管理し、用途と有効日数を入力します。\nキーの全体は作成直後に一度だけ表示し、すぐにコピーして保管するよう促してください。\n各キーの名前、識別できる一部分、ステータス、有効期限、最終使用日時を一覧にし、確認のうえで取り消せるようにしてください。\n一覧、ログ、詳細にキーの全体を表示しないでください。',
          },
        },
      },
      dataSources: {
        title: 'データソース',
        description:
          'アプリケーションのデータベースを選び、既存の外部データベースの業務データを利用します。',
        prompts: {
          postgres: {
            label: 'データベースを切り替え',
            text: 'アプリケーションのデータベースを SQLite から PostgreSQL に切り替えてください。\n接続情報はソースコードではなく、サーバーの実行時設定から読み取ってください。\nインストールするデータベースドライバーと入力する設定項目を説明し、既存のデータは自動では移行されないことを注意してください。',
          },
          externalDatabase: {
            label: '外部データベース',
            text: '社内の既存の財務データベースを読み取り専用の外部データソースとして接続してください。そのテーブルは変更しないでください。\n仕入先番号でレコードを照合し、仕入先の詳細に「精算」セクションを追加して、精算サイクル、与信限度額、精算ステータスを出典付きで表示してください。\n仕入先の連絡先は引き続きアプリケーションのデータベースから読み取り、精算データはインポートせずに外部データベースから直接読み取ってください。\n接続の認証情報はサーバーの実行時設定から読み取ってください。',
          },
        },
      },
      authorization: {
        title: '権限',
        description:
          '誰がどのページを開き、どの操作を実行し、どのレコードを見られるかを制御します。',
        prompts: {
          jobs: {
            label: '職務',
            text: 'アプリケーションに「購買申請者」と「申請承認者」の職務を作成してください。\n購買申請者は申請ページに入り、自分が申請した申請を表示できます。\n申請承認者は申請ページに入り、申請を表示し、承認待ちの申請を承認または却下できます。\n権限と割り当てを変更できるのはアプリケーション管理者だけです。\n管理者が後から権限を調整し、担当者を割り当てられるよう、アプリケーションの既存の権限機能を使ってください。',
          },
          dataScopes: {
            label: 'データ範囲',
            text: '購買申請者が自分の申請だけを表示できるようにし、所有者の判定には申請の申請者フィールドを使ってください。\n申請承認者はすべての申請を表示し、承認待ちを処理できます。\n管理者は各職務の権限セットで申請の表示範囲を調整できます。',
          },
          restrictions: {
            label: '制限',
            text: 'Bob は一時的に購買申請の承認を手伝っており、2,000 以下の申請だけを表示できます。\n彼の「申請を表示」操作に金額の上限を追加し、既存の職務とデータ範囲は維持してください。\nこの上限は彼自身の申請にも、彼に共有された申請にも適用してください。\n管理者は金額を変更したりルールを削除したりできます。削除する前に、彼の表示範囲が広がる可能性があることを説明してください。',
          },
        },
      },
      workflow: {
        title: 'ワークフロー',
        description:
          '業務レコードを段階ごとに進め、待機、タイムアウト、再試行、誰が何をしたかの履歴を扱います。',
        prompts: {
          stages: {
            label: '段階',
            text: '購買申請に次の流れを追加してください：承認待ち → 購入待ち → 入荷済み → 完了。\n承認者は承認または却下します。却下には理由が必要で、申請は申請者に戻され、修正して再提出されます。\n購買担当者が発注すると購入待ちになり、受領書付きで納品を確認すると入荷済みに進み、申請者が確認すると完了します。\n申請の詳細には現在の段階の操作だけを表示し、通常の編集では段階を変更できないようにしてください。\n段階と必須情報はサーバーで検証し、ほかの人がすでに提出した結果を上書きしないでください。',
          },
          backgroundExport: {
            label: 'バックグラウンドでのエクスポート',
            text: '既存の申請を CSV にエクスポートする申請レポートのページを追加してください。\n送信後、エクスポートは処理待ちになり、バックグラウンドで生成され、ダウンロードリンク付きで完了します。\n現在の段階、ファイル名、エクスポートした申請の件数、送信とシステム処理の記録を表示してください。\n生成に失敗した場合はルールに従って再試行し、最終的な失敗は担当者が対応できるよう残してください。再実行しても重複したレポートファイルを作成しないでください。\nページを再読み込みしても進捗と結果が見えるようにし、申請をエクスポートできるのは権限のある人だけにしてください。',
          },
          history: {
            label: '履歴',
            text: '申請の詳細に現在の段階と処理履歴を表示してください。\n各項目には、操作者、日時、操作、前後の段階、却下理由や受領書を表示します。\n自動で実行された操作はシステムによるものと表示してください。\nページを再読み込みしても進捗と履歴が残り、完了後に全体の流れを振り返れるようにしてください。',
          },
        },
      },
      scheduler: {
        title: 'スケジュールタスク',
        description:
          '決まった時刻に業務を実行し、次回の実行とその結果を確認します。',
        prompts: {
          reminder: {
            label: '毎日のリマインダー',
            text: '既存の申請アプリケーションに「承認待ち申請のリマインダー」を追加してください。\n\n平日の毎朝 9:00 (北京時間) に承認待ちの申請を探し、承認者ごとにまとめて、各承認者にアプリ内通知を 1 件送ってください。\n承認待ちの件数を含め、承認待ち申請の一覧へのリンクを付けてください。承認待ちの申請がなければ何も送らないでください。\n管理者はスケジュールと実行記録を表示し、リマインダーを一時停止または再開できます。',
          },
          weeklyReport: {
            label: '週次レポート',
            text: '毎週月曜日の 8:00 (北京時間) に先週の売上サマリーを作成し、営業マネージャーに通知してください。\n売上高、受注件数、地域別の合計を含めてください。管理者はタスクと実行記録を表示できます。',
          },
        },
      },
      notification: {
        title: '通知',
        description:
          '何かが起きたときに、アプリ内メッセージ、メール、グループボットのメッセージを送ります。',
        prompts: {
          inApp: {
            label: 'アプリ内メッセージ',
            text: '現在のアプリケーションに申請の承認を追加し、結果をアプリ内メッセージで申請者に通知してください。\n\n申請には番号、名前、申請者、金額、承認ステータスがあります。\n申請者は自分の申請を表示できます。承認者は承認待ちの申請を表示し、承認または却下できます。既存の申請や承認の機能があれば再利用してください。\n\n承認または却下の後、その申請の申請者にだけアプリ内メッセージを 1 件送ってください。\nタイトルで申請が承認されたか却下されたかを示し、本文には申請番号、名前、承認結果を含めます。\nメッセージをクリックすると、該当する申請の詳細が開きます。\n承認待ちの間は送らないでください。同じ承認結果について通知するのは 1 回だけです。\n通知に失敗しても、保存された承認結果には影響しません。',
          },
          email: {
            label: 'メール',
            text: 'アプリケーションで設定済みのメールチャネルを使って、既存の申請承認の通知にメールを追加してください。\n\n申請が承認または却下されたら、結果を申請者のアカウントのメールアドレスに送ってください。\n件名には申請番号を、本文には申請の名前と結果を含めてください。\n既存のアプリ内メッセージは残してください。申請者にメールアドレスがなければ、アプリ内メッセージだけを送ってください。\nメールの送信に失敗しても、承認結果やアプリ内メッセージに影響しないようにしてください。',
          },
        },
      },
      mail: {
        title: 'メール',
        description:
          '個人のメールボックスを接続し、業務メールを読み、返信し、送信します。',
        prompts: {
          providers: {
            label: 'メールプロバイダー',
            text: 'サーバー設定の mail.providers に、アプリケーション用の mailbox.org を設定してください：\n- IMAP 受信サーバー：imap.mailbox.org、ポート 993、SSL/TLS。\n- SMTP 送信サーバー：smtp.mailbox.org、ポート 465、SSL/TLS。\nユーザーはメールボックスアカウントのページで自分のメールアドレス、ユーザー名、パスワードを入力し、初回同期を開始する日付を選びます。メールボックスのパスワードを設定やソースコードに書き込まないでください。',
          },
          mailCenter: {
            label: 'メールセンター',
            text: 'メール機能はこのアプリケーションに組み込まれています。作り直したり別のプラグインをインストールしたりせず、再利用してください。\nメール機能が提供するメールワークスペースとメールボックスアカウントのページを使って、ナビゲーションに「メールセンター」と「メールボックスアカウント」のページを追加してください。\nユーザーは自分のメールボックスを接続し、受信メッセージを同期し、メッセージと添付ファイルを読み、元の件名と会話の流れを保ったまま元の送信者に返信できます。\n各ユーザーは自分が接続したメールボックスで作業します。',
          },
          correspondence: {
            label: '顧客とのメール',
            text: 'アプリケーション組み込みのメール閲覧・作成コンポーネントを再利用して、顧客の詳細にやり取りのセクションを追加してください。\n送信者または受信者が現在の顧客の連絡先メールアドレスと一致するメッセージを表示してください。営業担当者は自分が接続したメールボックスを使って、メッセージを読み、添付ファイルを表示し、返信できます。',
          },
        },
      },
      file: {
        title: 'ファイル',
        description:
          'ファイルをアップロードしてレコードに添付し、プレビューやダウンロードを行います。',
        prompts: {
          attachments: {
            label: '添付ファイル',
            text: '既存の申請管理アプリケーションに購買の添付ファイルを追加してください。\n\n申請の詳細に添付ファイルの領域を追加してください。各申請には PDF、画像、DOCX など複数のファイルを付けられます。\nファイル名とサイズを表示し、プレビュー、ダウンロード、添付ファイルの削除の操作を用意してください。\nアップロード後、ユーザーが添付ファイルを現在の申請に保存できるようにし、申請を開き直しても残るようにしてください。\n申請にアクセスできる人は誰でも添付ファイルを表示・ダウンロードできます。申請者と承認者は添付ファイルを追加・削除できます。\n添付ファイルを削除しても現在の申請との紐付けを外すだけで、ファイルそのものは残してください。',
          },
          avatar: {
            label: 'アバター',
            text: '従業員ごとに 1 枚のアバター画像を追加してください。\nアバターのアップロードと差し替えに対応し、従業員の一覧と詳細に表示してください。\n差し替え後は新しいアバターを使い、ページを再読み込みしても表示されるようにしてください。',
          },
        },
      },
      i18n: {
        title: '言語',
        description:
          'インターフェースの言語を切り替え、言語を追加し、既定の言語を設定します。',
        prompts: {
          addLanguage: {
            label: '言語を追加',
            text: 'アプリケーションにスペイン語を追加してください。インターフェースとサーバーのメッセージを翻訳し、言語メニューにスペイン語を追加してください。',
          },
          defaultLanguage: {
            label: '既定の言語',
            text: '言語をまだ選んでいない人向けに、簡体字中国語をアプリケーションの既定の言語にしてください。言語メニューでは英語も引き続き選べるようにしてください。',
          },
        },
      },
      theme: {
        title: 'テーマ',
        description:
          '色、フォント、密度を調整し、ライトとダークを切り替えます。',
        prompts: {
          changeTheme: {
            label: 'テーマを変更',
            text: '「コンパクト」テーマを更新してください：メインカラーを青にし、角の丸みを少し大きくしてください。現在のフォント、文字サイズ、詰めた余白はそのままにしてください。',
          },
          newTheme: {
            label: '新しいテーマ',
            text: '緑をメインカラーとし、柔らかい背景、ほどよく丸い角、控えめな影を持つ「フォレスト」テーマを作成してください。',
          },
        },
      },
    },
  },

  appearance: {
    title: '外観',
    mode: 'カラーモード',
    preset: 'テーマ',
    light: 'ライト',
    dark: 'ダーク',
    system: 'システムに合わせる',
    themes: { default: 'ゆったり', compact: 'コンパクト' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: '閉じる',
    save: '保存',
    cancel: 'キャンセル',
    confirm: '確認',
    language: '言語',
  },
  notices: {
    serverLocaleFallback:
      'サーバーはこの言語に対応していないため、サーバーからのメッセージは英語で表示されます。',
    languageChangeFailed:
      '言語を切り替えられませんでした。もう一度お試しください。',
  },
  account: {
    signOutFailed: 'サインアウトできませんでした。もう一度お試しください。',
    openMenu: 'アカウントメニューを開く',
    fallback: 'アカウント',
    signOut: 'サインアウト',
    signingOut: 'サインアウトしています…',
  },
  navigation: {
    home: 'ホーム',
    open: 'ナビゲーションを開く',
    close: 'ナビゲーションを閉じる',
    expand: 'ナビゲーションを展開',
    collapse: 'ナビゲーションを折りたたむ',
    toggle: 'ナビゲーションを展開または折りたたむ',
    label: 'アプリケーションナビゲーション',
    description: 'このアプリケーションのページに移動します。',
    breadcrumb: 'パンくずリスト',
    breadcrumbMore: '中間の階層を表示',
    back: '戻る',
  },
  dataTable: {
    noResults: '結果がありません。',
    sortAscending: '昇順',
    sortDescending: '降順',
    hideColumn: '隠す',
    view: '表示',
    toggleColumns: '列の表示切り替え',
    selectedCount: '{{total}} 行中 {{selected}} 行を選択中。',
    rowsPerPage: '1 ページの行数',
    pageOf: '{{page}} / {{pageCount}} ページ',
    firstPage: '最初のページへ',
    previousPage: '前のページへ',
    nextPage: '次のページへ',
    lastPage: '最後のページへ',
  },
  datePicker: {
    placeholder: '日付を選択',
    rangePlaceholder: '期間を選択',
  },
};

export default systemJaJP;
