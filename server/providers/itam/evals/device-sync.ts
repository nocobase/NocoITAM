import type { EvalCase } from '../skill-evals.js';

/**
 * The eval set of the `device-sync` skill (device sync, step 4,
 * 2026-10-15): situations as `itam device-sync review` shows them, and what
 * a person who knows the method would propose for each — the standard
 * answers. Run them before changing the skill, its instructions or Asset Steward's
 * model: `POST
 * /api/itam/ai/evals/device-sync`. A case added from real use — a
 * difference a person settled otherwise than Asset Steward proposed — is the most
 * useful kind.
 *
 * Ids in the cases are only labels; nothing here is read from the database.
 */
export const DEVICE_SYNC_EVALS: readonly EvalCase[] = [
  {
    id: 'user-mismatch-handed-over',
    title: 'A laptop handed to a colleague without a transfer',
    question: 'DE-000049 在 Intune 上的主用户是赵敏，帮我看看怎么处理。',
    data: {
      differences: [
        {
          kind: 'userMismatch',
          deviceId: 'dev-49',
          deviceNo: 'DE-000049',
          status: 'inUse',
          assigneeId: 'person-liu',
          assigneeName: '刘洋（销售部，2026-08-31 已离职）',
          personId: 'person-zhao',
          userName: '赵敏（销售部）',
          lastSyncAt: '2026-10-14T09:10:00Z',
        },
      ],
      history: [
        '2026-09-01 刘洋 交接工作给 赵敏（人员备注）',
        '2026-09-03 Intune 主用户变为 zhao.min@example.com',
      ],
    },
    expect: [{ subject: 'dev-49', action: 'transfer', target: 'person-zhao' }],
  },
  {
    id: 'shelf-device-in-use',
    title: 'A device on the shelf that someone uses every day',
    question: '库存里的 DE-000037 为什么每天都在同步？',
    data: {
      differences: [
        {
          kind: 'statusMismatch',
          deviceId: 'dev-37',
          deviceNo: 'DE-000037',
          status: 'inStock',
          personId: 'person-chen',
          userName: '陈杰（技术部）',
          lastSyncAt: '2026-10-14T08:00:00Z',
        },
      ],
    },
    expect: [{ subject: 'dev-37', action: 'assign', target: 'person-chen' }],
  },
  {
    id: 'disposed-still-online',
    title: 'A disposed laptop still signing in',
    question: '这台已报废的电脑怎么还在线？',
    data: {
      differences: [
        {
          kind: 'statusMismatch',
          critical: true,
          deviceId: 'dev-12',
          deviceNo: 'DE-000012',
          status: 'disposed',
          personId: null,
          userName: 'unknown@contractor.example',
          lastSyncAt: '2026-10-13T22:00:00Z',
        },
      ],
    },
    // Nothing to change on the register: the platform must be acted on,
    // and that is the administrator's, not a plan step.
    expect: [{ subject: 'dev-12', action: 'escalate' }],
  },
  {
    id: 'silent-laptop',
    title: 'A laptop in use that has not synced for seven weeks',
    question: 'DE-000048 失联了，要标记丢失吗？',
    data: {
      differences: [
        {
          kind: 'stale',
          deviceId: 'dev-48',
          deviceNo: 'DE-000048',
          status: 'inUse',
          assigneeId: 'person-zhang',
          assigneeName: '张伟（研发部，在职）',
          lastSyncAt: '2026-08-26T09:00:00Z',
        },
      ],
    },
    // Lost is a person's finding: ask first, never mark it in a plan.
    expect: [{ subject: 'dev-48', action: 'verify' }],
  },
  {
    id: 'unregistered-batch',
    title: 'Three platform devices the register lacks',
    question: '把管理平台里台账没有的这几台处理一下。',
    data: {
      unregistered: [
        {
          id: 'md-laptop',
          serialNo: 'PF5DEMO01',
          deviceName: 'LAPTOP-PF5DEMO01',
          manufacturer: 'Lenovo',
          model: 'ThinkPad T14 Gen 5',
          suggestedModelId: 'model-thinkpad-t14-gen5',
          personId: 'person-chen',
          userName: '陈杰',
          matchState: 'unlinked',
          sources: ['intune'],
        },
        {
          id: 'md-vm',
          serialNo: null,
          deviceName: 'BUILD-VM-07',
          manufacturer: 'Microsoft Corporation',
          model: 'Virtual Machine',
          suggestedModelId: null,
          personId: null,
          matchState: 'unlinked',
          sources: ['intune'],
        },
        {
          id: 'md-shared',
          serialNo: 'C02DUP',
          deviceName: 'MacBook-Zhao',
          manufacturer: 'Apple',
          model: 'MacBook Pro 14 M3',
          suggestedModelId: 'model-macbook-pro-14-m3',
          personId: 'person-zhao',
          userName: '赵敏',
          matchState: 'ambiguous',
          candidates: [
            {
              id: 'dev-51',
              label: 'DE-000051 / SH-LT-005（分配给 赵敏）',
            },
            {
              id: 'dev-88',
              label: 'DE-000088 / SH-LT-031（库存中，2024 年购入）',
            },
          ],
          sources: ['jamf', 'intune'],
        },
      ],
    },
    expect: [
      { subject: 'md-laptop', action: 'register' },
      { subject: 'md-vm', action: 'ignore' },
      { subject: 'md-shared', action: 'link', target: 'dev-51' },
    ],
  },
  {
    id: 'ambiguous-without-evidence',
    title: 'A shared serial with nothing to tell the candidates apart',
    question: '这台序列号重复的设备该关联哪一台？',
    data: {
      unregistered: [
        {
          id: 'md-dup',
          serialNo: 'SN-DUP-9',
          deviceName: 'DESKTOP-9',
          manufacturer: 'Dell',
          model: 'OptiPlex 7010',
          suggestedModelId: 'model-optiplex-7010',
          personId: null,
          matchState: 'ambiguous',
          candidates: [
            { id: 'dev-61', label: 'DE-000061 / OptiPlex 7010（库存中）' },
            { id: 'dev-62', label: 'DE-000062 / OptiPlex 7010（库存中）' },
          ],
          sources: ['intune'],
        },
      ],
    },
    expect: [{ subject: 'md-dup', action: 'verify' }],
  },
];
