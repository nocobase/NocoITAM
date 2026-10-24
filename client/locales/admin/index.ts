// ITAM's own copy for the administration pages of 设置 (client/pages/settings/):
// what it adds to NocoBase 3's prepared Users page (inviting, the pending
// invitations, a password reset, deletion; accounts/), API keys and
// Scheduled tasks, the page grants' titles in the role editor, and the
// titles authorization shows for ITAM's resources. The prepared Users and
// Roles pages and the permission editor read the template's copy instead
// (client/locales/system/settings-*.ts, 2026-10-24). English first, Chinese
// second; `adminIn` picks one.
export const adminWording = {
  common: {
    loading: ['Loading', '加载中'],
    retry: ['Retry', '重试'],
    signInAgain: ['Sign in again', '重新登录'],
    loadFailed: ['Could not load {{what}}.', '无法加载{{what}}。'],
    forbidden: [
      'You do not have access to {{what}}.',
      '你没有权限查看{{what}}。',
    ],
    sessionEnded: ['Your session has ended.', '你的登录已过期。'],
    notFound: [
      'This record does not exist or has been deleted.',
      '记录不存在或已被删除。',
    ],
    backToList: ['Back to the list', '返回列表'],
    cancel: ['Cancel', '取消'],
    save: ['Save', '保存'],
    create: ['Create', '创建'],
    done: ['Done', '完成'],
    actions: ['Actions', '操作'],
    actionsFor: ['Actions for "{{name}}"', '“{{name}}”的操作'],
    refresh: ['Refresh', '刷新'],
    loadMore: ['Load more', '加载更多'],
    copy: ['Copy', '复制'],
    copied: ['Copied', '已复制'],
    failed: ['Something went wrong. Try again.', '操作没有成功，请重试。'],
    network: [
      'The server could not be reached. Check the connection and try again.',
      '无法连接服务器，请检查网络后重试。',
    ],
  },
  users: {
    what: ['the users', '用户'],
    invite: ['Invite users', '邀请用户'],
    managedRole: ['Managed by the application', '由应用管理'],
    actions: {
      password: ['Reset password', '重置密码'],
      delete: ['Delete', '删除'],
    },
    dialogs: {
      passwordTitle: ['Reset password', '重置密码'],
      passwordDescription: [
        'A new password for "{{name}}". Their other sessions stay signed in; sign them out everywhere as well if the old password leaked.',
        '为“{{name}}”设置新密码。对方已登录的会话不受影响；如果旧密码泄露，请同时让对方退出所有登录。',
      ],
      inviteTitle: ['Invite users', '邀请用户'],
      inviteDescription: [
        'Each address gets a link to create an account, valid for seven days.',
        '每个地址会收到一个创建账号的链接，七天内有效。',
      ],
    },
    fields: {
      newPassword: ['New password', '新密码'],
      confirmPassword: ['Confirm password', '确认密码'],
      roles: ['Roles', '角色'],
      emails: ['Email addresses', '邮箱地址'],
    },
    hints: {
      password: ['At least 8 characters.', '至少 8 位。'],
      emails: [
        'One per line, or separated by commas, semicolons or spaces.',
        '每行一个，或用逗号、分号、空格分隔。',
      ],
      rolesDefault: [
        'Every signed-in user also gets the default access, whatever their roles.',
        '无论角色如何，每个登录用户都有默认权限。',
      ],
    },
    errors: {
      name: ['Enter a name', '请输入姓名'],
      emailFormat: ['The email address is invalid', '邮箱格式不正确'],
      username: [
        'A username uses letters, digits, dots, hyphens and underscores',
        '用户名只能包含字母、数字、点、连字符和下划线',
      ],
      password: ['The password needs at least 8 characters', '密码至少 8 位'],
      mismatch: ['The passwords do not match', '两次输入的密码不一致'],
      roles: ['Choose at least one role', '至少选择一个角色'],
      emailTaken: ['This email address is already in use', '这个邮箱已被使用'],
      usernameTaken: ['This username is already in use', '这个用户名已被使用'],
      lastAdministrator: [
        'The last administrator cannot lose the role.',
        '最后一位管理员不能失去这个角色。',
      ],
      self: ['You cannot delete yourself.', '不能删除自己。'],
      holdsRecords: [
        'This user still answers for records; disable them instead.',
        '这个用户仍是一些记录的负责人，请改为停用。',
      ],
      emailsRequired: ['Enter at least one address', '请至少输入一个地址'],
      emailsInvalid: [
        'These addresses are invalid: {{list}}',
        '这些地址无效：{{list}}',
      ],
      emailsTooMany: [
        'Invite at most {{max}} addresses at a time',
        '每次最多邀请 {{max}} 个地址',
      ],
    },
    toasts: {
      password: ['Reset the password of "{{name}}"', '已重置“{{name}}”的密码'],
      deleted: ['Deleted user "{{name}}"', '已删除用户“{{name}}”'],
    },
    confirm: {
      deleteTitle: ['Delete user "{{name}}"?', '删除用户“{{name}}”？'],
      deleteBody: [
        'This cannot be undone. Someone who still answers for records cannot be deleted; disable them instead.',
        '删除后无法恢复。仍是记录负责人的用户不能删除，请改为停用。',
      ],
    },
  },
  invitations: {
    title: ['Pending invitations', '待接受的邀请'],
    description: [
      'Invitations not yet accepted; a link works once, for seven days.',
      '还没有被接受的邀请；每个链接只能用一次，七天内有效。',
    ],
    invitedBy: [
      'Invited by {{name}} · expires {{date}}',
      '邀请人 {{name}} · {{date}} 过期',
    ],
    pending: ['Pending', '待接受'],
    expired: ['Expired', '已过期'],
    resend: ['Resend', '重新发送'],
    copyLink: ['Copy link', '复制链接'],
    revoke: ['Revoke', '撤销'],
    send: ['Send', '发送'],
    sent: ['Invitation sent', '邀请已发送'],
    linkOnly: [
      'Invitation created; copy the link to send it yourself',
      '邀请已创建，请复制链接自行发送',
    ],
    existing: ['Already has an account', '已有账号'],
    resultsTitle: ['Invitations', '邀请结果'],
    revokeTitle: [
      'Revoke the invitation to {{email}}?',
      '撤销给 {{email}} 的邀请？',
    ],
    revokeBody: ['The invitation link stops working.', '邀请链接将失效。'],
    revoked: [
      'Revoked the invitation to {{email}}',
      '已撤销给 {{email}} 的邀请',
    ],
    resent: [
      'Sent the invitation to {{email}} again',
      '已重新发送给 {{email}} 的邀请',
    ],
    resentLink: [
      'A new link was created; copy it to send it yourself',
      '已生成新链接，请复制后自行发送',
    ],
    what: ['the invitations', '邀请'],
  },
  keys: {
    // The access a limited key is given (new.tsx), as the permission editor
    // lays it out.
    headings: {
      business: ['Business operations', '业务操作'],
      administration: ['Administration', '管理'],
    },
    levelFor: ['How far "{{name}}" reaches', '“{{name}}”的范围'],
    // The page's title, the menu entry's words (navigation).
    title: ['API keys', 'API 密钥'],
    what: ['your API keys', 'API 密钥'],
    description: [
      'Keys that let scripts and agents call the application as you.',
      '让脚本和 Agent 以你的身份调用系统的密钥。',
    ],
    new: ['New API key', '新建 API 密钥'],
    columns: {
      name: ['Name', '名称'],
      access: ['Access', '访问范围'],
      created: ['Created', '创建时间'],
      expires: ['Expires', '过期时间'],
      lastUsed: ['Last used', '最近使用'],
    },
    full: ['Everything I can do', '我能做的一切'],
    limited: ['Only what I choose', '仅我选择的'],
    limitedCount: ['Limited ({{count}})', '有限（{{count}}）'],
    neverUsed: ['Never used', '从未使用'],
    neverExpires: ['Never', '永不过期'],
    days: ['{{count}} days', '{{count}} 天'],
    expired: ['Expired', '已过期'],
    fields: {
      name: ['Name', '名称'],
      description: ['Description', '描述'],
      expires: ['Expires', '有效期'],
      access: ['Access', '访问范围'],
    },
    levels: {
      read: ['Read', '读取'],
      write: ['Read and write', '读写'],
      admin: ['Administer', '管理'],
    },
    emptyTitle: ['No API keys yet', '还没有 API 密钥'],
    emptyBody: [
      'Create one to let a script or an agent call the application as you.',
      '创建一个，让脚本或 Agent 以你的身份调用系统。',
    ],
    emptyNoCreate: [
      'You may not create API keys; ask an administrator.',
      '你没有创建 API 密钥的权限，请联系管理员。',
    ],
    secretTitle: ['Copy your new key', '复制新密钥'],
    secretWarning: [
      'Copy it now: it is not shown again.',
      '现在复制：关闭后不再显示。',
    ],
    secretLabel: ['API key', 'API 密钥'],
    rotatedTitle: ['New secret for "{{name}}"', '“{{name}}”的新密钥'],
    rotate: ['Rotate', '轮换'],
    delete: ['Delete', '删除'],
    errors: {
      name: ['Enter a name', '请输入名称'],
      tooLong: ['Use at most {{max}} characters', '最多 {{max}} 个字符'],
      access: ['Choose at least one permission', '至少选择一项权限'],
      creation: ['You may not create API keys.', '你没有创建 API 密钥的权限。'],
    },
    toasts: {
      created: ['Created API key "{{name}}"', '已创建 API 密钥“{{name}}”'],
      rotated: ['Rotated "{{name}}"', '已轮换“{{name}}”'],
      deleted: ['Deleted API key "{{name}}"', '已删除 API 密钥“{{name}}”'],
    },
    confirm: {
      rotateTitle: ['Rotate "{{name}}"?', '轮换“{{name}}”？'],
      rotateBody: [
        'A new secret replaces the current one, which stops working at once.',
        '新密钥会替换当前密钥，当前密钥立即失效。',
      ],
      deleteTitle: ['Delete API key "{{name}}"?', '删除 API 密钥“{{name}}”？'],
      deleteBody: [
        'Anything using it stops working at once. This cannot be undone.',
        '使用它的地方会立即失效，删除后无法恢复。',
      ],
    },
  },
  // How a permission set's 权限 drawer names this application's Collections
  // and their operations: server/providers/itam/authz-resources.ts registers
  // these keys as the titles (`authzTitle`), worded as the pages word the
  // actions. Every Collection and operation needs one —
  // tests/logic/authz-titles.test.ts checks it.
  // The page grants the role editor names that no menu entry of their own
  // titles (client/pages/settings/page-permission-titles.ts): 设置's tabs,
  // which became one page (2026-10-16), and the Agents plugin's page of the
  // runners' agents, routed without a menu entry.
  pages: {
    itamSettings: [
      'Settings: General, MDM, Flows, Receiving from delivery notes, Demo data; Business guidance',
      '设置：通用、MDM、流程、按送货单入库、演示数据；业务指导',
    ],
    scheduledTasks: ['Settings: Scheduled tasks', '设置：定时任务'],
    runnerAgents: ['Agents (from runners)', 'Agent（来自运行器）'],
  },
  authz: {
    settings: ['ITAM settings', 'ITAM 设置'],
    settingsActions: { read: ['View', '查看'], update: ['Edit', '编辑'] },
    collections: {
      manufacturers: ['Manufacturers', '制造商'],
      vendors: ['Vendors', '供应商'],
      categories: ['Categories', '分类'],
      models: ['Models', '型号'],
      softwareProducts: ['Software products', '软件产品'],
      locations: ['Locations', '位置'],
      departments: ['Departments', '部门'],
      onboardingKits: ['Onboarding kits', '入职配置'],
      people: ['People', '人员'],
      devices: ['Devices', '设备'],
      stockItems: ['Stock items', '库存物品'],
      entitlements: ['Entitlements', '授权'],
      purchaseOrders: ['Purchase orders', '采购单'],
      approvals: ['Approvals', '审批'],
      attachmentLinks: ['Attachments', '附件'],
      repairs: ['Repairs', '维修单'],
      auditTasks: ['Audit tasks', '盘点任务'],
      disposals: ['Disposals', '报废单'],
      purchaseOrderLines: ['Purchase order lines', '采购明细'],
      purchaseReceipts: ['Purchase receipts', '到货记录'],
      stockHoldings: ['Stock holdings', '库存持有'],
      stockMovements: ['Stock movements', '库存流水'],
      entitlementSeats: ['Entitlement seats', '授权席位'],
      auditItems: ['Audit items', '盘点明细'],
      disposalDevices: ['Disposal devices', '报废清单'],
      historyEvents: ['History', '历史'],
      changeLogs: ['Change logs', '变更记录'],
      allocations: ['Allocations', '分配记录'],
      reminders: ['Reminders', '提醒'],
    },
    operations: {
      people: { markLeft: ['Mark as left', '标记离职'] },
      devices: {
        assign: ['Assign', '分配'],
        return: ['Return', '归还'],
        transfer: ['Transfer', '调拨'],
        loan: ['Loan', '借出'],
        // Cancelling a reservation is the same grant.
        reserve: ['Reserve', '预留'],
        correctStatus: ['Correct status', '修正状态'],
        export: ['Export', '导出'],
      },
      stockItems: {
        // Taking back (and uninstalling) is the same grant.
        issue: ['Issue and take back', '发放与收回'],
        stockIn: ['Stock in', '入库'],
        export: ['Export', '导出'],
      },
      entitlements: {
        // Reclaiming a seat and setting a seat's key are the same grant.
        assignSeat: ['Assign and reclaim seats', '分配和回收席位'],
        viewKey: ['Show key', '查看密钥'],
        export: ['Export', '导出'],
      },
      purchaseOrders: {
        // Withdrawing is the same grant.
        submit: ['Submit for approval', '提交审批'],
        approve: ['Approve or reject', '审批'],
        order: ['Mark as ordered', '标记已下单'],
        receive: ['Receive', '到货入库'],
        export: ['Export', '导出'],
      },
      approvals: { decide: ['Approve or reject', '审批'] },
      repairs: { complete: ['Complete repair', '完成维修'] },
      auditTasks: {
        start: ['Start audit', '开始盘点'],
        // Registering a device found off the books is the same grant.
        count: ['Record count results', '登记盘点结果'],
        finish: ['Finish count', '完成盘点'],
        resolve: ['Resolve differences', '处理差异'],
        cancel: ['Cancel count', '取消盘点'],
        export: ['Export', '导出'],
      },
      disposals: {
        submit: ['Submit for approval', '提交审批'],
        approve: ['Approve or reject', '审批'],
        execute: ['Execute disposal', '执行报废'],
        export: ['Export', '导出'],
      },
    },
  },
  schedules: {
    // The page's title, the menu entry's words (navigation).
    title: ['Scheduled tasks', '定时任务'],
    what: ['the scheduled tasks', '定时任务'],
    whatOne: ['this scheduled task', '这个定时任务'],
    description: [
      "The application's recurring tasks and how their runs went.",
      '系统的定时任务，以及它们的运行情况。',
    ],
    columns: {
      task: ['Task', '任务'],
      schedule: ['Schedule', '计划'],
      status: ['Status', '状态'],
      lastRun: ['Last run', '上次运行'],
      nextRun: ['Next run', '下次运行'],
      runs: ['Runs', '运行次数'],
      on: ['On', '启用'],
    },
    switchFor: ['Run "{{title}}"', '运行“{{title}}”'],
    status: {
      active: ['Active', '运行中'],
      paused: ['Paused', '已暂停'],
      inactive: ['Inactive', '已失效'],
    },
    target: {
      disabled: ['Target off', '目标已关闭'],
      missing: ['Target missing', '目标缺失'],
      invalid: ['Target invalid', '目标无效'],
    },
    resumed: ['Resumed "{{title}}"', '已恢复“{{title}}”'],
    paused: ['Paused "{{title}}"', '已暂停“{{title}}”'],
    inactiveHint: [
      'The application no longer defines this task.',
      '应用已不再定义这个任务。',
    ],
    fields: {
      key: ['Key', '标识'],
      schedule: ['Schedule', '计划'],
      timezone: ['Time zone', '时区'],
      target: ['Target', '目标'],
      status: ['Status', '状态'],
      runs: ['Runs', '运行次数'],
      succeeded: ['Succeeded', '成功次数'],
      lastRun: ['Last run', '上次运行'],
      nextRun: ['Next run', '下次运行'],
    },
    history: ['Run history', '运行记录'],
    historyEmpty: ['This task has not run yet.', '这个任务还没有运行过。'],
    started: ['Started', '开始'],
    finished: ['Finished', '结束'],
    reason: ['Reason', '原因'],
    cap: [
      'Only the first {{count}} tasks are shown.',
      '只显示前 {{count}} 个任务。',
    ],
    emptyTitle: ['No scheduled tasks', '没有定时任务'],
    emptyBody: [
      'The application and its plugins define none.',
      '应用和插件都没有定义定时任务。',
    ],
    occurrence: {
      pending: ['Pending', '等待中'],
      running: ['Running', '运行中'],
      waiting: ['Waiting', '等待结果'],
      succeeded: ['Succeeded', '成功'],
      failed: ['Failed', '失败'],
      skipped: ['Skipped', '已跳过'],
      cancelled: ['Cancelled', '已取消'],
      timed_out: ['Timed out', '超时'],
      triggered: ['Triggered', '已触发'],
    },
  },
} as const;

type Wording = { readonly [key: string]: Wording | readonly [string, string] };
/** The settings pages' copy in one language, the shape a locale file's `admin` takes. */
export type AdminResource = Picked<typeof adminWording>;

type Picked<T> = {
  -readonly [K in keyof T]: T[K] extends readonly [string, string]
    ? string
    : Picked<T[K]>;
};

/** The wording in one language: 0 English, 1 Chinese. */
export function adminIn<T extends Wording>(tree: T, index: 0 | 1): Picked<T> {
  return Object.fromEntries(
    Object.entries(tree).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? (value as readonly [string, string])[index]
        : adminIn(value as Wording, index),
    ]),
  ) as Picked<T>;
}
