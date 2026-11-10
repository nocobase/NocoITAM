import type { AdminResource } from './index.js';

/** The settings pages' copy in Vietnamese; see `./index.ts`. */
const adminViVN: AdminResource = {
  common: {
    loading: 'Đang tải',
    retry: 'Thử lại',
    signInAgain: 'Đăng nhập lại',
    loadFailed: 'Không thể tải {{what}}.',
    forbidden: 'Bạn không có quyền truy cập {{what}}.',
    sessionEnded: 'Phiên làm việc của bạn đã kết thúc.',
    notFound: 'Hồ sơ này không tồn tại hoặc đã bị xóa.',
    backToList: 'Quay lại danh sách',
    cancel: 'Hủy',
    save: 'Lưu',
    create: 'Tạo',
    done: 'Xong',
    actions: 'Thao tác',
    actionsFor: 'Thao tác cho "{{name}}"',
    refresh: 'Làm mới',
    loadMore: 'Tải thêm',
    copy: 'Sao chép',
    copied: 'Đã sao chép',
    failed: 'Đã xảy ra lỗi. Hãy thử lại.',
    network: 'Không thể kết nối đến máy chủ. Hãy kiểm tra kết nối và thử lại.',
  },
  users: {
    what: 'danh sách người dùng',
    invite: 'Mời người dùng',
    managedRole: 'Do ứng dụng quản lý',
    actions: {
      password: 'Đặt lại mật khẩu',
      delete: 'Xóa',
    },
    dialogs: {
      passwordTitle: 'Đặt lại mật khẩu',
      passwordDescription:
        'Mật khẩu mới cho "{{name}}". Các phiên khác của người này vẫn giữ đăng nhập; nếu mật khẩu cũ bị lộ, hãy đăng xuất họ khỏi mọi nơi.',
      inviteTitle: 'Mời người dùng',
      inviteDescription:
        'Mỗi địa chỉ nhận một liên kết để tạo tài khoản, có hiệu lực trong bảy ngày.',
    },
    fields: {
      newPassword: 'Mật khẩu mới',
      confirmPassword: 'Xác nhận mật khẩu',
      roles: 'Vai trò',
      emails: 'Địa chỉ email',
    },
    hints: {
      password: 'Ít nhất 8 ký tự.',
      emails:
        'Mỗi dòng một địa chỉ, hoặc phân tách bằng dấu phẩy, dấu chấm phẩy hay khoảng trắng.',
      rolesDefault:
        'Mọi người dùng đã đăng nhập đều có quyền truy cập mặc định, bất kể vai trò.',
    },
    errors: {
      name: 'Hãy nhập họ tên',
      emailFormat: 'Địa chỉ email không hợp lệ',
      username:
        'Tên người dùng chỉ gồm chữ cái, chữ số, dấu chấm, dấu gạch ngang và dấu gạch dưới',
      password: 'Mật khẩu cần ít nhất 8 ký tự',
      mismatch: 'Mật khẩu không khớp',
      roles: 'Hãy chọn ít nhất một vai trò',
      emailTaken: 'Địa chỉ email này đã được sử dụng',
      usernameTaken: 'Tên người dùng này đã được sử dụng',
      lastAdministrator: 'Quản trị viên cuối cùng không thể mất vai trò này.',
      self: 'Bạn không thể xóa chính mình.',
      holdsRecords:
        'Người dùng này vẫn đang phụ trách một số hồ sơ; hãy vô hiệu hóa thay vì xóa.',
      emailsRequired: 'Hãy nhập ít nhất một địa chỉ',
      emailsInvalid: 'Các địa chỉ này không hợp lệ: {{list}}',
      emailsTooMany: 'Mỗi lần chỉ mời tối đa {{max}} địa chỉ',
    },
    toasts: {
      password: 'Đã đặt lại mật khẩu của "{{name}}"',
      deleted: 'Đã xóa người dùng "{{name}}"',
    },
    confirm: {
      deleteTitle: 'Xóa người dùng "{{name}}"?',
      deleteBody:
        'Không thể hoàn tác. Người vẫn đang phụ trách hồ sơ thì không thể xóa; hãy vô hiệu hóa thay vì xóa.',
    },
  },
  invitations: {
    title: 'Lời mời đang chờ',
    description:
      'Các lời mời chưa được chấp nhận; mỗi liên kết chỉ dùng được một lần, trong bảy ngày.',
    invitedBy: 'Do {{name}} mời · hết hạn {{date}}',
    pending: 'Đang chờ',
    expired: 'Đã hết hạn',
    resend: 'Gửi lại',
    copyLink: 'Sao chép liên kết',
    revoke: 'Thu hồi',
    send: 'Gửi',
    sent: 'Đã gửi lời mời',
    linkOnly: 'Đã tạo lời mời; hãy sao chép liên kết để tự gửi',
    existing: 'Đã có tài khoản',
    resultsTitle: 'Lời mời',
    revokeTitle: 'Thu hồi lời mời gửi {{email}}?',
    revokeBody: 'Liên kết mời sẽ không còn hoạt động.',
    revoked: 'Đã thu hồi lời mời gửi {{email}}',
    resent: 'Đã gửi lại lời mời cho {{email}}',
    resentLink: 'Đã tạo liên kết mới; hãy sao chép để tự gửi',
    what: 'các lời mời',
  },
  keys: {
    headings: {
      business: 'Thao tác nghiệp vụ',
      administration: 'Quản trị',
    },
    levelFor: 'Phạm vi của "{{name}}"',
    // The page's title, the menu entry's words (navigation).
    title: 'Khóa API',
    what: 'các khóa API của bạn',
    description:
      'Các khóa cho phép tập lệnh và tác tử gọi ứng dụng dưới danh nghĩa của bạn.',
    new: 'Khóa API mới',
    columns: {
      name: 'Tên',
      access: 'Quyền truy cập',
      created: 'Ngày tạo',
      expires: 'Hết hạn',
      lastUsed: 'Lần dùng gần nhất',
    },
    full: 'Mọi việc tôi có thể làm',
    limited: 'Chỉ những gì tôi chọn',
    limitedCount: 'Có giới hạn ({{count}})',
    neverUsed: 'Chưa từng dùng',
    neverExpires: 'Không bao giờ',
    days: '{{count}} ngày',
    expired: 'Đã hết hạn',
    fields: {
      name: 'Tên',
      description: 'Mô tả',
      expires: 'Thời hạn',
      access: 'Quyền truy cập',
    },
    levels: {
      read: 'Đọc',
      write: 'Đọc và ghi',
      admin: 'Quản trị',
    },
    emptyTitle: 'Chưa có khóa API',
    emptyBody:
      'Hãy tạo một khóa để tập lệnh hoặc tác tử gọi ứng dụng dưới danh nghĩa của bạn.',
    emptyNoCreate: 'Bạn không được tạo khóa API; hãy hỏi quản trị viên.',
    secretTitle: 'Sao chép khóa mới của bạn',
    secretWarning: 'Hãy sao chép ngay: khóa sẽ không được hiển thị lại.',
    secretLabel: 'Khóa API',
    rotatedTitle: 'Khóa bí mật mới cho "{{name}}"',
    rotate: 'Xoay vòng',
    delete: 'Xóa',
    errors: {
      name: 'Hãy nhập tên',
      tooLong: 'Tối đa {{max}} ký tự',
      access: 'Hãy chọn ít nhất một quyền',
      creation: 'Bạn không được tạo khóa API.',
    },
    toasts: {
      created: 'Đã tạo khóa API "{{name}}"',
      rotated: 'Đã xoay vòng "{{name}}"',
      deleted: 'Đã xóa khóa API "{{name}}"',
    },
    confirm: {
      rotateTitle: 'Xoay vòng "{{name}}"?',
      rotateBody:
        'Một khóa bí mật mới thay thế khóa hiện tại, khóa hiện tại ngừng hoạt động ngay lập tức.',
      deleteTitle: 'Xóa khóa API "{{name}}"?',
      deleteBody:
        'Mọi thứ đang dùng khóa này sẽ ngừng hoạt động ngay lập tức. Không thể hoàn tác.',
    },
  },
  // How a permission set's permissions drawer names this application's Collections
  // and their operations; see `./index.ts`.
  pages: {
    itamSettings:
      'Cài đặt: Chung, MDM, Quy trình, Nhận hàng từ phiếu giao hàng, Dữ liệu demo; Hướng dẫn nghiệp vụ',
    scheduledTasks: 'Cài đặt: Tác vụ định kỳ',
    runnerAgents: 'Agent (từ runner)',
  },
  authz: {
    settings: 'Cài đặt ITAM',
    settingsActions: { read: 'Xem', update: 'Sửa' },
    collections: {
      manufacturers: 'Nhà sản xuất',
      vendors: 'Nhà cung cấp',
      categories: 'Danh mục',
      models: 'Mẫu',
      softwareProducts: 'Sản phẩm phần mềm',
      locations: 'Vị trí',
      departments: 'Phòng ban',
      onboardingKits: 'Bộ cấp phát nhân viên mới',
      people: 'Nhân sự',
      devices: 'Thiết bị',
      stockItems: 'Mặt hàng tồn kho',
      entitlements: 'Quyền sử dụng',
      purchaseOrders: 'Đơn mua hàng',
      approvals: 'Phê duyệt',
      attachmentLinks: 'Tệp đính kèm',
      repairs: 'Phiếu sửa chữa',
      auditTasks: 'Đợt kiểm kê',
      disposals: 'Phiếu thanh lý',
      purchaseOrderLines: 'Dòng đơn mua hàng',
      purchaseReceipts: 'Phiếu nhận hàng',
      stockHoldings: 'Mục tồn kho đang giữ',
      stockMovements: 'Biến động tồn kho',
      entitlementSeats: 'Suất quyền sử dụng',
      auditItems: 'Mục kiểm kê',
      disposalDevices: 'Thiết bị thanh lý',
      historyEvents: 'Lịch sử',
      changeLogs: 'Nhật ký thay đổi',
      allocations: 'Hồ sơ cấp phát',
      reminders: 'Lời nhắc',
    },
    operations: {
      people: { markLeft: 'Đánh dấu nghỉ việc' },
      devices: {
        assign: 'Cấp phát',
        return: 'Thu hồi',
        transfer: 'Điều chuyển',
        loan: 'Cho mượn',
        // Cancelling a reservation is the same grant.
        reserve: 'Giữ chỗ',
        correctStatus: 'Sửa trạng thái',
        export: 'Xuất CSV',
      },
      stockItems: {
        // Taking back (and uninstalling) is the same grant.
        issue: 'Xuất và thu hồi',
        stockIn: 'Nhập kho',
        export: 'Xuất CSV',
      },
      entitlements: {
        // Reclaiming a seat and setting a seat's key are the same grant.
        assignSeat: 'Giao và thu hồi suất',
        viewKey: 'Hiện khóa',
        export: 'Xuất CSV',
      },
      purchaseOrders: {
        // Withdrawing is the same grant.
        submit: 'Gửi phê duyệt',
        approve: 'Phê duyệt hoặc từ chối',
        order: 'Đánh dấu đã đặt hàng',
        receive: 'Nhận hàng',
        export: 'Xuất CSV',
      },
      approvals: { decide: 'Phê duyệt hoặc từ chối' },
      repairs: { complete: 'Hoàn tất sửa chữa' },
      auditTasks: {
        start: 'Bắt đầu kiểm kê',
        // Registering a device found off the books is the same grant.
        count: 'Ghi kết quả đếm',
        finish: 'Kết thúc đếm',
        resolve: 'Xử lý chênh lệch',
        cancel: 'Hủy đếm',
        export: 'Xuất CSV',
      },
      disposals: {
        submit: 'Gửi phê duyệt',
        approve: 'Phê duyệt hoặc từ chối',
        execute: 'Thực hiện thanh lý',
        export: 'Xuất CSV',
      },
    },
  },
  schedules: {
    // The page's title, the menu entry's words (navigation).
    title: 'Tác vụ định kỳ',
    what: 'các tác vụ định kỳ',
    whatOne: 'tác vụ định kỳ này',
    description:
      'Các tác vụ định kỳ của ứng dụng và kết quả các lần chạy của chúng.',
    columns: {
      task: 'Tác vụ',
      schedule: 'Lịch chạy',
      status: 'Trạng thái',
      lastRun: 'Lần chạy trước',
      nextRun: 'Lần chạy tiếp theo',
      runs: 'Số lần chạy',
      on: 'Bật',
    },
    switchFor: 'Chạy "{{title}}"',
    status: {
      active: 'Đang hoạt động',
      paused: 'Đã tạm dừng',
      inactive: 'Không hoạt động',
    },
    target: {
      disabled: 'Đích đã tắt',
      missing: 'Thiếu đích',
      invalid: 'Đích không hợp lệ',
    },
    resumed: 'Đã tiếp tục "{{title}}"',
    paused: 'Đã tạm dừng "{{title}}"',
    inactiveHint: 'Ứng dụng không còn định nghĩa tác vụ này.',
    fields: {
      key: 'Khóa',
      schedule: 'Lịch chạy',
      timezone: 'Múi giờ',
      target: 'Đích',
      status: 'Trạng thái',
      runs: 'Số lần chạy',
      succeeded: 'Số lần thành công',
      lastRun: 'Lần chạy trước',
      nextRun: 'Lần chạy tiếp theo',
    },
    history: 'Lịch sử chạy',
    historyEmpty: 'Tác vụ này chưa chạy lần nào.',
    started: 'Bắt đầu',
    finished: 'Kết thúc',
    reason: 'Lý do',
    cap: 'Chỉ hiển thị {{count}} tác vụ đầu tiên.',
    emptyTitle: 'Không có tác vụ định kỳ',
    emptyBody: 'Ứng dụng và các plugin của nó không định nghĩa tác vụ nào.',
    occurrence: {
      pending: 'Đang chờ',
      running: 'Đang chạy',
      waiting: 'Đang chờ kết quả',
      succeeded: 'Thành công',
      failed: 'Thất bại',
      skipped: 'Đã bỏ qua',
      cancelled: 'Đã hủy',
      timed_out: 'Hết thời gian',
      triggered: 'Đã kích hoạt',
    },
  },
  notificationTemplates: {
    intro:
      'Các thông báo hệ thống tự gửi: mỗi loại được gửi khi nào, ai nhận và nội dung ở từng ngôn ngữ. Không thể thay đổi gì ở đây.',
    search: 'Tìm kiếm',
    searchPlaceholder: 'Tên hoặc mô tả',
    category: 'Danh mục',
    channel: 'Kênh',
    all: 'Tất cả',
    empty: 'Chưa có thông báo nào được đăng ký.',
    whatOne: 'mẫu thông báo này',
    when: 'Khi nào gửi',
    who: 'Ai nhận',
    conditions: 'Điều kiện gửi',
    language: 'Ngôn ngữ',
    source: 'Cung cấp bởi',
    channels: 'Kênh gửi',
    channelsHint:
      'Đã thiết lập và đã bật không có nghĩa là kết nối chắc chắn hoạt động.',
    channelState: {
      configured: 'Đã thiết lập',
      unconfigured: 'Chưa thiết lập',
      enabled: 'Đã bật',
      disabled: 'Đã tắt',
      unknown: 'Không rõ',
    },
    variables: 'Biến',
    preview: 'Xem trước',
    previewLanguage: 'Ngôn ngữ xem trước',
    previewAllLanguages:
      'Email này gồm tất cả các ngôn ngữ cùng lúc; mọi người nhận đều nhận cùng một nội dung.',
    example: 'Ví dụ',
    definition: 'Mẫu gốc',
    synthetic:
      'Dữ liệu mẫu hư cấu. Xem trước không gửi gì và không thay đổi gì.',
    html: 'Bản HTML',
    channelTypes: {
      'in-app': 'Trong ứng dụng',
      email: 'Email',
    },
    contributors: {
      itam: 'NocoITAM',
      users: 'Người dùng',
    },
    categories: {
      accounts: 'Tài khoản',
      devices: 'Thiết bị',
      people: 'Nhân sự',
      comments: 'Bình luận',
    },
    always:
      'Không bao giờ gửi cho người có thao tác gây ra thông báo, và mỗi người nhận chỉ nhận một lần.',
    itamLanguage:
      'Bằng ngôn ngữ mặc định của ứng dụng, bất kể ngôn ngữ giao diện của người nhận; nội dung bình luận hiển thị đúng như khi viết.',
    items: {
      loanOverdue: {
        name: 'Quá hạn trả thiết bị mượn',
        trigger:
          'Lần kiểm tra ban đêm phát hiện thiết bị đang cho mượn đã quá ngày trả dự kiến.',
        recipients: 'Người phụ trách thiết bị.',
        rule: 'Một lần cho mỗi thiết bị và ngày trả dự kiến; khoản mượn vẫn quá hạn sẽ không được báo lại.',
        variables: {
          deviceNo: 'Mã thiết bị.',
          date: 'Ngày trả dự kiến.',
        },
      },
      leaverRecovery: {
        name: 'Thu hồi khi nghỉ việc',
        trigger:
          'Tác vụ ban đêm chuẩn bị thu hồi cho người đã đánh dấu nghỉ việc nhưng vẫn giữ thiết bị, tồn kho hoặc suất giấy phép.',
        recipients:
          'Mỗi người phụ trách một phần tài sản đó, chỉ được báo phần của mình.',
        rule: 'Một lần cho mỗi người nghỉ việc và người phụ trách.',
        variables: {
          name: 'Tên người nghỉ việc.',
          count: 'Số tài sản người nhận cần xử lý.',
        },
      },
      commentMentioned: {
        name: 'Được nhắc đến trong bình luận',
        trigger: 'Bình luận trên một bản ghi nhắc đến đồng nghiệp bằng @.',
        recipients: 'Từng đồng nghiệp được nhắc đến.',
        rule: 'Mỗi người chỉ một lần cho mỗi bình luận.',
        variables: {
          actor: 'Người viết bình luận.',
          title: 'Bản ghi được bình luận.',
          text: 'Nội dung bình luận, rút gọn, giữ nguyên lời người viết.',
        },
      },
      commentReplied: {
        name: 'Trả lời trong chuỗi bình luận',
        trigger: 'Có người bình luận trên bản ghi mà người khác đã bình luận.',
        recipients:
          'Mọi người đã viết trong chuỗi thảo luận; người được @-nhắc đến trong câu trả lời sẽ nhận thông báo nhắc đến thay vào đó.',
        rule: 'Mỗi người chỉ một lần cho mỗi bình luận.',
        variables: {
          actor: 'Người viết bình luận.',
          title: 'Bản ghi được bình luận.',
          text: 'Nội dung bình luận, rút gọn, giữ nguyên lời người viết.',
        },
      },
      usersInvitation: {
        name: 'Lời mời người dùng',
        trigger:
          'Quản trị viên mời ai đó hoặc gửi lại lời mời, và chọn gửi qua email.',
        recipients: 'Địa chỉ email của người được mời.',
        rule: 'Được gửi với mọi lời mời gửi qua email; không có công tắc để tắt.',
        language:
          'Một email gồm tất cả ngôn ngữ được hỗ trợ, tiêu đề bằng tiếng Anh; đổi ngôn ngữ xem trước không làm thay đổi nội dung.',
        variables: {
          app: 'Tên ứng dụng.',
          inviter: 'Người gửi lời mời.',
          items: 'Vai trò hoặc quyền truy cập được cấp.',
          date: 'Thời điểm lời mời hết hạn.',
          url: 'Liên kết mời dùng một lần; bản xem trước dùng liên kết hư cấu.',
        },
      },
    },
  },
};

export default adminViVN;
