import settings from './settings-vi-VN.js';
import type { SystemResource } from './en-US.js';
import deviceApprovalViVN from '#extensions/nocobase-device-approval/locales/vi-VN';
import inboxViVN from '#extensions/nocobase-inbox/locales/vi-VN';

/** The Vietnamese copy of what the template ships; see `./en-US.ts`. */
const systemViVN: SystemResource = {
  flowDiagram: {
    controls: 'Điều khiển sơ đồ',
    fitView: 'Vừa khung nhìn',
    fullscreen: 'Toàn màn hình',
    exitFullscreen: 'Thoát toàn màn hình',
    escapeHint: 'Nhấn Escape để thoát',
    leavesTo: 'Chuyển đến',
    arrivesFrom: 'Đến từ',
    otherRoutes: 'Các luồng khác',
    minimap: 'Tổng quan sơ đồ',

    configure: 'Cấu hình',
    overview: 'Tổng quan sơ đồ',
    actualSize: 'Kích thước thực',
    states: 'Trạng thái',
    transitions: 'Chuyển trạng thái',
    configurable: 'Tham số',
    current: 'Hiện tại',
    visited: 'Đã qua',
    initial: 'Trạng thái đầu',
    final: 'Trạng thái cuối',
    state: 'Trạng thái',
    zoomOut: 'Thu nhỏ',
    zoomIn: 'Phóng to',
    fit: 'Vừa khung nhìn',

    empty: 'Không có trạng thái nào để hiển thị.',
    loading: 'Đang bố trí sơ đồ…',
    failed: 'Không thể bố trí sơ đồ này.',
    nodeHelp: 'Nhấn Enter hoặc phím cách để chọn một trạng thái.',
    edgeHelp: 'Nhấn Enter hoặc phím cách để chọn một chuyển trạng thái.',
  },
  settings,
  'auth.preparingSession': 'Đang chuẩn bị phiên làm việc…',
  'auth.connectionFailed': 'Không thể kết nối',
  'auth.connectionFailedDescription':
    'Không thể chuẩn bị kết nối thời gian thực. Hãy thử lại để vào ứng dụng, hoặc đăng xuất.',

  'auth.passwordResetSuccess':
    'Mật khẩu của bạn đã được đặt lại. Hãy đăng nhập bằng mật khẩu mới.',
  'auth.requestNewResetLink': 'Yêu cầu liên kết đặt lại mới',

  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalViVN,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxViVN,
  // The UI Library component of the header's inbox button.
  'inboxButton.title': 'Hộp thư đến',
  'inboxButton.pending': 'Hộp thư đến, {{count}} việc đang chờ',
  'inboxButton.unread': 'Hộp thư đến, {{count}} chưa đọc',
  'inboxButton.pendingHint':
    '{{count}} việc đang chờ bạn; con số giảm dần khi chúng được xử lý.',
  'inboxButton.unreadHint':
    '{{count}} mục chưa đọc; con số giảm dần khi bạn đọc chúng.',
  'auth.welcome': 'Chào mừng bạn trở lại',
  'auth.loginDescription':
    'Đăng nhập bằng tên người dùng hoặc email và mật khẩu.',
  'auth.registerTitle': 'Tạo tài khoản',
  'auth.registerDescription': 'Tạo tài khoản để bắt đầu.',
  'auth.forgotTitle': 'Quên mật khẩu',
  'auth.forgotDescription':
    'Nhập email của bạn, chúng tôi sẽ gửi liên kết đặt lại nếu tài khoản tồn tại.',
  'auth.passwordResetUnavailable':
    'Chưa bật tính năng tự đặt lại mật khẩu. Hãy liên hệ quản trị viên để đặt lại mật khẩu.',
  'auth.capabilityLoadFailed':
    'Không thể kiểm tra tính năng đặt lại mật khẩu có khả dụng hay không.',
  'auth.retry': 'Thử lại',
  'auth.loading': 'Đang tải',
  'auth.resetDescription': 'Chọn mật khẩu mới cho tài khoản của bạn.',
  'auth.resetTitle': 'Đặt lại mật khẩu',
  'auth.identifier': 'Tên người dùng hoặc email',
  'auth.password': 'Mật khẩu',
  'auth.signIn': 'Đăng nhập',
  'auth.signingIn': 'Đang đăng nhập…',
  'auth.hidePassword': 'Ẩn mật khẩu',
  'auth.showPassword': 'Hiện mật khẩu',
  'auth.forgotLink': 'Quên mật khẩu?',
  'auth.noAccount': 'Chưa có tài khoản?',
  'auth.signUp': 'Đăng ký',
  'auth.createAccount': 'Tạo tài khoản',
  'auth.creatingAccount': 'Đang tạo tài khoản…',
  'auth.name': 'Họ tên',
  'auth.username': 'Tên người dùng',
  'auth.email': 'Email',
  'auth.confirmPassword': 'Xác nhận mật khẩu',
  'auth.existingAccount': 'Đã có tài khoản?',
  'auth.passwordMismatch': 'Mật khẩu không khớp.',
  'auth.resetting': 'Đang đặt lại…',
  'auth.newPassword': 'Mật khẩu mới',
  'auth.confirmNewPassword': 'Xác nhận mật khẩu mới',
  'auth.invalidResetLink':
    'Liên kết đặt lại mật khẩu này không hợp lệ hoặc đã hết hạn.',
  'auth.backToSignIn': 'Quay lại đăng nhập',
  'auth.sendResetLink': 'Gửi liên kết đặt lại',
  'auth.sending': 'Đang gửi…',
  'auth.resetSent': 'Nếu tài khoản tồn tại, liên kết đặt lại đã được gửi.',
  'auth.rememberPassword': 'Bạn nhớ mật khẩu?',
  'auth.methods': 'Phương thức đăng nhập',
  'auth.or': 'Hoặc tiếp tục với',
  'auth.continueWith': 'Tiếp tục với {provider}',
  'auth.about': 'Về ứng dụng này',
  'auth.platform': 'Nền tảng ứng dụng thuần AI',
  'auth.marketingTitleFirst': 'Để AI tự do xây dựng.',
  'auth.marketingTitleSecond': 'NocoBase giữ cho nó',
  'auth.marketingTitleThird': 'luôn tin cậy.',
  'auth.marketingDescription':
    'Trao cho AI một framework giao diện linh hoạt để định hình từng trải nghiệm, trong khi NocoBase bảo vệ dữ liệu, quyền hạn và việc quản trị bên dưới.',
  'auth.frontend': 'Giao diện thuần AI',
  'auth.frontendDescription':
    'Tự do kết hợp giao diện trên một framework linh hoạt.',
  'auth.foundation': 'Nền móng NocoBase',
  'auth.foundationDescription':
    'Dữ liệu, kiểm soát truy cập và quản trị đáng tin cậy.',
  'auth.marketingFooter': 'Tự do ở bên trên. Vững tin ở bên dưới.',
  'status.loading': 'Đang tải',
  'status.loadingPage': 'Đang tải trang',
  'status.denied': 'Không có quyền truy cập',
  'status.pageFailed': 'Không thể tải trang',
  'status.retry': 'Thử lại',
  'navigation.brandHome': 'Trang chủ NocoBase',
  'navigation.brandApps': 'Ứng dụng NocoBase',
  'routeOverlay.close': 'Đóng',
  'status.deniedDescription': 'Bạn không có quyền truy cập {{label}}.',
  'status.routeFailedDescription':
    'Không thể tải route {{label}} từ {{packageName}}.',
  shell: {
    buildFreely: 'AI tự do xây dựng.',
    reliability: '<brand>NocoBase</brand> giữ cho nó luôn tin cậy.',
  },
  home: {
    platform: 'NocoBase · Nền tảng ứng dụng thuần AI',
    title: 'Hãy mô tả, tác tử của bạn sẽ xây dựng',
    description:
      'Ứng dụng này được phát triển bằng cách trò chuyện với tác tử lập trình của bạn. Hãy nói nhu cầu nghiệp vụ bằng lời thường, tác tử sẽ viết trang, mô hình dữ liệu, API và quy trình nghiệp vụ trong dự án này.',
    steps: {
      describe: {
        title: 'Mô tả nhu cầu',
        description: 'Nói rõ ai sử dụng, lưu dữ liệu gì và điều gì cần xảy ra.',
      },
      build: {
        title: 'Để tác tử xây dựng',
        description:
          'Tác tử đọc dự án này cùng các tính năng có sẵn, rồi viết mã.',
      },
      review: {
        title: 'Kiểm tra và tinh chỉnh',
        description:
          'Làm mới trang để dùng thử, rồi yêu cầu thay đổi theo cách tương tự.',
      },
    },
    example: {
      title: 'Hãy thử một yêu cầu như sau',
      text: 'Xây dựng ứng dụng đơn mua hàng.\n\nMỗi đơn có số đơn, mặt hàng, người đề nghị, số tiền và trạng thái phê duyệt. Người đề nghị tạo đơn và chỉ thấy đơn của mình; người duyệt thấy mọi đơn đang chờ và phê duyệt hoặc từ chối.\nSau khi có quyết định, thông báo cho người đề nghị trong hộp thư đến kèm liên kết đến đơn.',
      hint: 'Dán vào Claude Code, Codex, Cursor hoặc bất kỳ tác tử lập trình nào được mở trong dự án này.',
    },
    capabilitiesTitle: 'Tính năng có sẵn',
    capabilitiesDescription:
      'Tác tử của bạn dùng trực tiếp các tính năng này thay vì tự xây từ đầu. Mở một mục để lấy câu lệnh có thể sửa và sao chép.',
    viewPrompts: 'Xem câu lệnh ({{count}})',
    prompt: {
      label: 'Câu lệnh',
      hint: 'Sửa câu lệnh cho phù hợp với nghiệp vụ của bạn trước khi sao chép. Thay đổi không được lưu sau khi đóng hộp thoại.',
      copy: 'Sao chép',
      copiedShort: 'Đã sao chép',
      copied: 'Đã sao chép câu lệnh',
      copyFailed: 'Không thể sao chép. Hãy chọn văn bản và sao chép thủ công.',
      reset: 'Khôi phục mặc định',
    },
    capabilities: {
      auth: {
        title: 'Xác thực',
        description:
          'Đăng nhập, đăng ký, đặt lại mật khẩu và đăng nhập một lần của công ty.',
        prompts: {
          disableSignUp: {
            label: 'Tắt đăng ký',
            text: 'Ứng dụng này chỉ dành cho nhân viên công ty. Quản trị viên tạo mọi tài khoản.\nTắt tính năng tự đăng ký và gỡ bỏ liên kết đăng ký khỏi trang đăng nhập.\nNhân viên hiện có vẫn phải đăng nhập được bằng tài khoản và mật khẩu của mình.\nGiữ liên kết quên mật khẩu.',
          },
          companySso: {
            label: 'SSO của công ty',
            text: 'Cho phép nhân viên đăng nhập bằng nền tảng định danh của công ty qua OIDC.\n\nGiữ đăng nhập bằng tài khoản và mật khẩu, đồng thời thêm nút Tài khoản công ty.\nNút này mở nền tảng định danh của công ty. Sau khi đăng nhập thành công, quay về trang chủ của ứng dụng.\n\nCho phép lần đăng nhập đầu tiên tạo tài khoản ứng dụng, được định danh bằng mã người dùng ổn định của nền tảng.\nKhông tự động liên kết tài khoản bằng cách so khớp tên hoặc email. Tài khoản mới dùng quyền mặc định của ứng dụng.\n\nLiệt kê các thông tin mà quản trị viên nền tảng định danh phải cung cấp và URL callback họ cần đăng ký.',
          },
          apiKeys: {
            label: 'Khóa API',
            text: 'Thêm mục Khóa tích hợp vào menu người dùng, dùng tính năng khóa API có sẵn của ứng dụng.\nNhân viên chỉ quản lý các khóa do mình tạo, nhập mục đích và thời hạn hiệu lực tính theo ngày.\nChỉ hiển thị khóa đầy đủ một lần sau khi tạo, kèm lời nhắc sao chép và lưu lại ngay.\nLiệt kê tên, một đoạn nhận dạng, trạng thái, ngày hết hạn và lần dùng gần nhất của mỗi khóa, và cho phép thu hồi sau khi xác nhận.\nKhông bao giờ hiển thị khóa đầy đủ trong danh sách, nhật ký hay trang chi tiết.',
          },
        },
      },
      dataSources: {
        title: 'Nguồn dữ liệu',
        description:
          'Chọn cơ sở dữ liệu của ứng dụng và dùng dữ liệu nghiệp vụ từ các cơ sở dữ liệu bên ngoài hiện có.',
        prompts: {
          postgres: {
            label: 'Đổi cơ sở dữ liệu',
            text: 'Chuyển cơ sở dữ liệu của ứng dụng từ SQLite sang PostgreSQL.\nĐọc thông tin kết nối từ cấu hình chạy của máy chủ, không phải từ mã nguồn.\nGiải thích cần cài driver cơ sở dữ liệu nào và điền những thiết lập nào, đồng thời nhắc tôi rằng dữ liệu hiện có không được di chuyển tự động.',
          },
          externalDatabase: {
            label: 'Cơ sở dữ liệu bên ngoài',
            text: 'Kết nối cơ sở dữ liệu tài chính hiện có của công ty làm nguồn dữ liệu bên ngoài chỉ đọc; không sửa các bảng của nó.\nSo khớp hồ sơ theo mã nhà cung cấp và thêm phần Thanh toán vào trang chi tiết nhà cung cấp, hiển thị chu kỳ thanh toán, hạn mức tín dụng và trạng thái thanh toán, có ghi rõ nguồn.\nTiếp tục đọc thông tin liên hệ của nhà cung cấp từ cơ sở dữ liệu của ứng dụng, và đọc dữ liệu thanh toán trực tiếp từ cơ sở dữ liệu bên ngoài mà không nhập vào.\nĐọc thông tin xác thực kết nối từ cấu hình chạy của máy chủ.',
          },
        },
      },
      authorization: {
        title: 'Phân quyền',
        description:
          'Kiểm soát ai được mở trang nào, thực hiện thao tác nào và xem hồ sơ nào.',
        prompts: {
          jobs: {
            label: 'Vị trí công việc',
            text: 'Tạo các vị trí công việc Người đề nghị mua hàng và Người duyệt đơn cho ứng dụng.\nNgười đề nghị mua hàng có thể vào trang đơn hàng và xem các đơn do mình đề nghị.\nNgười duyệt đơn có thể vào trang đơn hàng, xem đơn và phê duyệt hoặc từ chối các đơn đang chờ.\nChỉ quản trị viên ứng dụng mới được thay đổi quyền và việc phân công.\nDùng tính năng phân quyền có sẵn của ứng dụng để quản trị viên có thể điều chỉnh quyền và phân công người sau này.',
          },
          dataScopes: {
            label: 'Phạm vi dữ liệu',
            text: 'Chỉ cho người đề nghị mua hàng xem đơn của chính mình, dùng trường người đề nghị của đơn để xác định quyền sở hữu.\nNgười duyệt đơn có thể xem mọi đơn và xử lý các phê duyệt đang chờ.\nQuản trị viên có thể điều chỉnh phạm vi xem đơn của từng vị trí công việc trong bộ quyền của vị trí đó.',
          },
          restrictions: {
            label: 'Giới hạn',
            text: 'Bob đang tạm thời hỗ trợ duyệt đơn mua hàng và chỉ được xem các đơn có giá trị từ 2.000 trở xuống.\nThêm giới hạn số tiền vào thao tác Xem đơn hàng của anh ấy, giữ nguyên vị trí công việc và phạm vi dữ liệu hiện có.\nÁp dụng giới hạn cho đơn của chính anh ấy và các đơn được chia sẻ với anh ấy.\nQuản trị viên có thể thay đổi số tiền hoặc gỡ bỏ quy tắc; trước khi gỡ bỏ, hãy giải thích rằng phạm vi anh ấy nhìn thấy có thể mở rộng.',
          },
        },
      },
      workflow: {
        title: 'Quy trình',
        description:
          'Đưa hồ sơ nghiệp vụ qua các giai đoạn, có chờ đợi, hết hạn, thử lại và lịch sử ai đã làm gì.',
        prompts: {
          stages: {
            label: 'Giai đoạn',
            text: 'Thêm quy trình cho đơn mua hàng: Chờ phê duyệt → Chờ mua → Đã nhận → Hoàn tất.\nNgười duyệt phê duyệt hoặc từ chối; việc từ chối cần nêu lý do và trả đơn về người đề nghị để sửa và gửi lại.\nSau khi người mua hàng đặt mua, đơn ở trạng thái chờ mua; xác nhận giao hàng kèm biên nhận có chữ ký sẽ chuyển đơn sang Đã nhận, và xác nhận của người đề nghị sẽ hoàn tất đơn.\nTrang chi tiết đơn chỉ cung cấp các thao tác của giai đoạn hiện tại, và việc sửa thông thường không thể thay đổi giai đoạn.\nKiểm tra giai đoạn và thông tin bắt buộc trên máy chủ, và không bao giờ ghi đè kết quả mà người khác đã gửi.',
          },
          backgroundExport: {
            label: 'Xuất dữ liệu nền',
            text: 'Thêm trang báo cáo đơn hàng để xuất các đơn hiện có ra CSV.\nSau khi gửi, yêu cầu xuất chờ được xử lý, được tạo ở chế độ nền và hoàn tất kèm liên kết tải xuống.\nHiển thị giai đoạn hiện tại, tên tệp, số đơn đã xuất, cùng hồ sơ gửi và hồ sơ xử lý của hệ thống.\nThử lại việc tạo thất bại theo quy tắc, và giữ lại lần thất bại cuối cùng để người phụ trách xử lý; chạy lại không được tạo trùng tệp báo cáo.\nGiữ tiến độ và kết quả sau khi làm mới trang, và chỉ cho phép người được phân quyền xuất đơn hàng.',
          },
          history: {
            label: 'Lịch sử',
            text: 'Hiển thị giai đoạn hiện tại và lịch sử xử lý trong trang chi tiết đơn.\nMỗi mục hiển thị ai đã thực hiện, khi nào, thao tác gì, giai đoạn trước và sau, cùng lý do từ chối hoặc biên nhận có chữ ký nếu có.\nĐánh dấu các thao tác tự động là do hệ thống thực hiện.\nGiữ tiến độ và lịch sử sau khi làm mới trang, để có thể xem lại toàn bộ quy trình sau khi hoàn tất.',
          },
        },
      },
      scheduler: {
        title: 'Tác vụ định kỳ',
        description:
          'Chạy công việc nghiệp vụ vào thời điểm định sẵn, và xem lần chạy tiếp theo cùng kết quả.',
        prompts: {
          reminder: {
            label: 'Nhắc nhở hằng ngày',
            text: 'Thêm lời nhắc Đơn đang chờ vào ứng dụng đơn hàng hiện có.\n\nLúc 09:00 giờ Bắc Kinh mỗi ngày làm việc, tìm các đơn đang chờ phê duyệt, nhóm theo người duyệt và gửi cho mỗi người duyệt một thông báo trong ứng dụng.\nGhi số đơn đang chờ và liên kết đến danh sách đơn đang chờ. Không gửi gì khi không có đơn nào đang chờ.\nQuản trị viên có thể xem lịch chạy và hồ sơ thực thi, và tạm dừng hoặc tiếp tục lời nhắc.',
          },
          weeklyReport: {
            label: 'Báo cáo hằng tuần',
            text: 'Lúc 08:00 giờ Bắc Kinh mỗi thứ Hai, tạo bản tổng hợp doanh số tuần trước và thông báo cho trưởng phòng kinh doanh.\nGồm doanh thu, số đơn và tổng theo khu vực. Quản trị viên có thể xem tác vụ và hồ sơ thực thi.',
          },
        },
      },
      notification: {
        title: 'Thông báo',
        description:
          'Gửi tin nhắn trong ứng dụng, email hoặc tin nhắn bot nhóm khi có sự kiện xảy ra.',
        prompts: {
          inApp: {
            label: 'Tin nhắn trong ứng dụng',
            text: 'Thêm phê duyệt đơn hàng vào ứng dụng hiện tại và thông báo kết quả cho người đề nghị qua tin nhắn trong ứng dụng.\n\nĐơn hàng gồm số đơn, tên, người đề nghị, số tiền và trạng thái phê duyệt.\nNgười đề nghị có thể xem đơn của mình. Người duyệt có thể xem các đơn đang chờ và phê duyệt hoặc từ chối. Dùng lại tính năng đơn hàng và phê duyệt hiện có nếu có.\n\nSau khi phê duyệt hoặc từ chối, chỉ gửi một tin nhắn trong ứng dụng cho người đề nghị của đơn.\nTiêu đề cho biết đơn đã được phê duyệt hay bị từ chối. Nội dung gồm số đơn, tên và kết quả phê duyệt.\nNhấp vào tin nhắn sẽ mở trang chi tiết đơn tương ứng.\nKhông gửi khi phê duyệt đang chờ. Chỉ thông báo một lần cho cùng một kết quả phê duyệt.\nThông báo thất bại không ảnh hưởng đến kết quả phê duyệt đã lưu.',
          },
          email: {
            label: 'Email',
            text: 'Thêm email vào các thông báo phê duyệt đơn hàng hiện có, dùng kênh email đã cấu hình của ứng dụng.\n\nSau khi đơn được phê duyệt hoặc bị từ chối, gửi kết quả đến email tài khoản của người đề nghị.\nGhi số đơn trong tiêu đề, tên đơn và kết quả trong nội dung.\nGiữ các tin nhắn trong ứng dụng hiện có. Nếu người đề nghị không có địa chỉ email, chỉ gửi tin nhắn trong ứng dụng.\nEmail thất bại không được ảnh hưởng đến kết quả phê duyệt hay tin nhắn trong ứng dụng.',
          },
        },
      },
      mail: {
        title: 'Thư điện tử',
        description:
          'Kết nối hộp thư cá nhân, rồi đọc, trả lời và gửi email nghiệp vụ.',
        prompts: {
          providers: {
            label: 'Nhà cung cấp thư',
            text: 'Cấu hình mailbox.org cho ứng dụng trong mail.providers của cấu hình máy chủ:\n- Máy chủ thư đến IMAP: imap.mailbox.org, cổng 993, SSL/TLS.\n- Máy chủ thư đi SMTP: smtp.mailbox.org, cổng 465, SSL/TLS.\nNgười dùng nhập địa chỉ email, tên người dùng và mật khẩu của mình trên trang tài khoản hộp thư và chọn ngày bắt đầu đồng bộ lần đầu; không bao giờ ghi mật khẩu hộp thư vào cấu hình hay mã nguồn.',
          },
          mailCenter: {
            label: 'Trung tâm thư',
            text: 'Thư điện tử đã có sẵn trong ứng dụng này; hãy dùng lại thay vì xây lại hoặc cài plugin khác.\nThêm các trang Trung tâm thư và Tài khoản hộp thư vào điều hướng, dùng trang không gian làm việc thư và trang tài khoản hộp thư mà tính năng thư cung cấp.\nNgười dùng có thể kết nối hộp thư của mình, đồng bộ thư đến, đọc thư và tệp đính kèm, và trả lời, giữ nguyên tiêu đề gốc và ngữ cảnh hội thoại, gửi thư trả lời cho người gửi ban đầu.\nMỗi người dùng làm việc với các hộp thư mình đã kết nối.',
          },
          correspondence: {
            label: 'Email khách hàng',
            text: 'Thêm phần thư từ vào trang chi tiết khách hàng, dùng lại các thành phần đọc và soạn thư có sẵn của ứng dụng.\nHiển thị các thư có người gửi hoặc người nhận trùng với địa chỉ email liên hệ của khách hàng hiện tại. Nhân viên kinh doanh có thể đọc thư, xem tệp đính kèm và trả lời bằng hộp thư mình đã kết nối.',
          },
        },
      },
      file: {
        title: 'Tệp',
        description:
          'Tải tệp lên, đính kèm vào hồ sơ, và xem trước hoặc tải xuống.',
        prompts: {
          attachments: {
            label: 'Tệp đính kèm',
            text: 'Thêm tệp đính kèm mua hàng vào ứng dụng quản lý đơn hàng hiện có của tôi.\n\nThêm khu vực tệp đính kèm vào trang chi tiết đơn. Mỗi đơn có thể có nhiều tệp, gồm PDF, hình ảnh và DOCX.\nHiển thị tên tệp và kích thước, cùng các thao tác xem trước, tải xuống và gỡ bỏ tệp đính kèm.\nSau khi tải lên, cho phép người dùng lưu tệp đính kèm vào đơn hiện tại. Giữ chúng khi mở lại đơn.\nAi có quyền truy cập đơn đều có thể xem và tải xuống tệp đính kèm của đơn. Người đề nghị và người duyệt có thể thêm hoặc gỡ bỏ tệp đính kèm.\nGỡ bỏ tệp đính kèm chỉ hủy liên kết tệp khỏi đơn hiện tại; vẫn giữ lại tệp.',
          },
          avatar: {
            label: 'Ảnh đại diện',
            text: 'Thêm ảnh đại diện cho mỗi nhân viên, mỗi nhân viên một ảnh.\nHỗ trợ tải lên và thay ảnh đại diện, và hiển thị trong danh sách và trang chi tiết nhân viên.\nDùng ảnh đại diện mới sau khi thay và giữ hiển thị sau khi làm mới trang.',
          },
        },
      },
      i18n: {
        title: 'Ngôn ngữ',
        description:
          'Chuyển ngôn ngữ giao diện, thêm ngôn ngữ và đặt ngôn ngữ mặc định.',
        prompts: {
          addLanguage: {
            label: 'Thêm ngôn ngữ',
            text: 'Thêm tiếng Tây Ban Nha vào ứng dụng của tôi. Dịch giao diện và thông điệp của máy chủ, và thêm tiếng Tây Ban Nha vào menu ngôn ngữ.',
          },
          defaultLanguage: {
            label: 'Ngôn ngữ mặc định',
            text: 'Đặt tiếng Trung giản thể làm ngôn ngữ mặc định của ứng dụng cho những người chưa chọn ngôn ngữ. Giữ tiếng Anh trong menu ngôn ngữ.',
          },
        },
      },
      theme: {
        title: 'Chủ đề',
        description:
          'Điều chỉnh màu sắc, phông chữ và mật độ, và chuyển giữa sáng và tối.',
        prompts: {
          changeTheme: {
            label: 'Đổi chủ đề',
            text: 'Cập nhật chủ đề Gọn: dùng màu xanh dương làm màu chính và tăng nhẹ độ bo góc. Giữ phông chữ, cỡ chữ và khoảng cách gọn hiện tại.',
          },
          newTheme: {
            label: 'Chủ đề mới',
            text: 'Tạo chủ đề Rừng với màu xanh lá làm màu chính, nền dịu, góc bo vừa phải và đổ bóng nhẹ.',
          },
        },
      },
    },
  },

  appearance: {
    title: 'Giao diện',
    mode: 'Chế độ màu',
    preset: 'Chủ đề',
    light: 'Sáng',
    dark: 'Tối',
    system: 'Theo hệ thống',
    themes: { default: 'Thoáng', compact: 'Gọn' },
  },
  app: {
    title: 'NocoBase',
  },
  actions: {
    close: 'Đóng',
    save: 'Lưu',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    language: 'Ngôn ngữ',
  },
  notices: {
    serverLocaleFallback:
      'Máy chủ không hỗ trợ ngôn ngữ này, nên thông điệp của máy chủ sẽ dùng tiếng Anh.',
    languageChangeFailed:
      'Không thể hoàn tất việc đổi ngôn ngữ. Vui lòng thử lại.',
  },
  account: {
    signOutFailed: 'Không thể đăng xuất. Vui lòng thử lại.',
    openMenu: 'Mở menu tài khoản',
    fallback: 'Tài khoản',
    signOut: 'Đăng xuất',
    signingOut: 'Đang đăng xuất…',
  },
  navigation: {
    home: 'Trang chủ',
    open: 'Mở điều hướng',
    close: 'Đóng điều hướng',
    expand: 'Mở rộng điều hướng',
    collapse: 'Thu gọn điều hướng',
    toggle: 'Mở rộng hoặc thu gọn điều hướng',
    label: 'Điều hướng ứng dụng',
    description: 'Đi đến một trang của ứng dụng này.',
    breadcrumb: 'Đường dẫn',
    breadcrumbMore: 'Hiện các cấp ở giữa',
    back: 'Quay lại',
  },
  dataTable: {
    noResults: 'Không có kết quả.',
    sortAscending: 'Tăng dần',
    sortDescending: 'Giảm dần',
    hideColumn: 'Ẩn',
    view: 'Hiển thị',
    toggleColumns: 'Ẩn/hiện cột',
    selectedCount: 'Đã chọn {{selected}} / {{total}} dòng.',
    rowsPerPage: 'Số dòng mỗi trang',
    pageOf: 'Trang {{page}} / {{pageCount}}',
    firstPage: 'Đến trang đầu',
    previousPage: 'Đến trang trước',
    nextPage: 'Đến trang sau',
    lastPage: 'Đến trang cuối',
  },
  datePicker: {
    placeholder: 'Chọn ngày',
    rangePlaceholder: 'Chọn khoảng ngày',
  },
};

export default systemViVN;
