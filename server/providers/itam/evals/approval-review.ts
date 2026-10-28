import type { ApprovalReview, ReviewSubject } from '../approval-review.js';

/**
 * The eval set of the `approval-review` skill (2026-10-16):
 * requests as the review reads them, and the
 * recommendations a person who knows the method would accept. What the
 * skill teaches is the judgement — buy, take from stock, ask for more,
 * dispose or keep using — so that is what is scored; the wording is not.
 * Run them before changing the skill, the work agent's instructions or its
 * model: `POST
 * /api/itam/ai/evals/approval-review`. A case added from real use — a
 * request an approver decided otherwise than the review recommended — is
 * the most useful kind.
 *
 * Ids and numbers are only labels; nothing here is read from the database.
 */

export interface ReviewEvalCase {
  readonly id: string;
  readonly title: string;
  readonly subject: ReviewSubject;
  readonly material: Readonly<Record<string, unknown>>;
  /** The recommendations that pass. */
  readonly expect: readonly ApprovalReview['recommendation'][];
}

const laptop = { modelId: 'model-mbp14', model: 'MacBook Pro 14 M3' };

export const APPROVAL_REVIEW_EVALS: readonly ReviewEvalCase[] = [
  {
    id: 'new-hires-stock-on-shelf',
    title: 'Laptops for joiners while the same model sits in stock',
    subject: 'purchaseOrder',
    material: {
      request: { title: 'PO-000031 新员工配备', amount: 41_994 },
      purchaseOrder: {
        record: {
          orderNo: 'PO-000031',
          reason: 'newHire',
          description: '10 月入职的 3 名销售',
        },
        related: {
          lines: [
            { ...laptop, itemType: 'device', quantity: 3, unitPrice: 13_998 },
          ],
        },
      },
      inStockOrIdle: [
        {
          ...laptop,
          availableDevices: {
            total: 2,
            rows: [
              { deviceNo: 'DE-000012', status: 'inStock' },
              { deviceNo: 'DE-000015', status: 'inStock' },
            ],
          },
          idleDevices: { total: 0, rows: [] },
        },
      ],
      earlierPrices: [
        { orderNo: 'PO-000022', ...laptop, quantity: 2, unitPrice: 13_998 },
      ],
      precedents: [
        { title: 'PO-000022 新员工配备', amount: 27_996, status: 'approved' },
      ],
    },
    expect: ['conditional'],
  },
  {
    id: 'stock-replenishment-above-minimum',
    title: 'Mice ordered while stock is well above its minimum',
    subject: 'purchaseOrder',
    material: {
      request: { title: 'PO-000032 库存补充', amount: 2_990 },
      purchaseOrder: {
        record: { orderNo: 'PO-000032', reason: 'stockReplenishment' },
        related: {
          lines: [
            {
              itemType: 'stock',
              description: 'Logitech M650 鼠标',
              quantity: 50,
              unitPrice: 59.8,
            },
          ],
        },
      },
      inStockOrIdle: [
        {
          stock: [
            {
              name: 'Logitech M650 鼠标',
              totalQuantity: 60,
              usedQuantity: 12,
              available: 48,
              minimumQuantity: 10,
            },
          ],
        },
      ],
      earlierPrices: [],
      precedents: [],
    },
    expect: ['reject', 'needMore'],
  },
  {
    id: 'fault-replacement-nothing-spare',
    title: 'One laptop to replace a broken one, nothing spare, usual price',
    subject: 'purchaseOrder',
    material: {
      request: { title: 'PO-000033 故障替换', amount: 13_998 },
      purchaseOrder: {
        record: {
          orderNo: 'PO-000033',
          reason: 'faultReplacement',
          description: 'DE-000044 主板损坏，维修报价 6,800，已送修两次',
        },
        related: {
          lines: [
            { ...laptop, itemType: 'device', quantity: 1, unitPrice: 13_998 },
          ],
        },
      },
      inStockOrIdle: [
        {
          ...laptop,
          availableDevices: { total: 0, rows: [] },
          idleDevices: { total: 0, rows: [] },
        },
      ],
      earlierPrices: [
        { orderNo: 'PO-000022', ...laptop, quantity: 2, unitPrice: 13_998 },
      ],
      precedents: [
        { title: 'PO-000027 故障替换', amount: 13_998, status: 'approved' },
      ],
    },
    expect: ['approve'],
  },
  {
    id: 'project-monitors-overpriced',
    title: 'Project monitors at a third above what they cost before',
    subject: 'purchaseOrder',
    material: {
      request: { title: 'PO-000034 项目专用', amount: 41_990 },
      purchaseOrder: {
        record: {
          orderNo: 'PO-000034',
          reason: 'project',
          description: '数据中台项目组 10 人',
        },
        related: {
          lines: [
            {
              modelId: 'model-u2723',
              model: 'Dell U2723QE',
              itemType: 'device',
              quantity: 10,
              unitPrice: 4_199,
            },
          ],
        },
      },
      inStockOrIdle: [
        {
          modelId: 'model-u2723',
          model: 'Dell U2723QE',
          availableDevices: { total: 0, rows: [] },
          idleDevices: { total: 0, rows: [] },
        },
      ],
      earlierPrices: [
        {
          orderNo: 'PO-000018',
          model: 'Dell U2723QE',
          quantity: 6,
          unitPrice: 3_150,
        },
        {
          orderNo: 'PO-000009',
          model: 'Dell U2723QE',
          quantity: 4,
          unitPrice: 3_199,
        },
      ],
      precedents: [],
    },
    expect: ['conditional', 'needMore'],
  },
  {
    id: 'new-hires-no-one-named',
    title: 'Five laptops for joiners nobody is named for',
    subject: 'purchaseOrder',
    material: {
      request: { title: 'PO-000035 新员工配备', amount: 69_990 },
      purchaseOrder: {
        record: { orderNo: 'PO-000035', reason: 'newHire', description: '' },
        related: {
          lines: [
            { ...laptop, itemType: 'device', quantity: 5, unitPrice: 13_998 },
          ],
        },
      },
      inStockOrIdle: [
        {
          ...laptop,
          availableDevices: { total: 0, rows: [] },
          idleDevices: { total: 0, rows: [] },
        },
      ],
      earlierPrices: [],
      precedents: [],
      joinersNextTwoMonths: 0,
    },
    expect: ['needMore', 'reject'],
  },
  {
    id: 'old-laptops-end-of-life',
    title: 'Six-year-old laptops at no book value, data wiped',
    subject: 'disposal',
    material: {
      request: { title: 'DP-000011 到期淘汰', amount: 0 },
      disposal: {
        record: {
          disposalNo: 'DP-000011',
          reason: 'endOfLife',
          method: 'scrap',
          dataWipe: 'wiped',
          wipeMethod: 'erase',
        },
      },
      devices: [
        {
          deviceNo: 'DE-000003',
          model: 'ThinkPad T480',
          purchaseDate: '2020-03-02',
          currentBookValue: 0,
          repairs: { count: 2 },
        },
        {
          deviceNo: 'DE-000004',
          model: 'ThinkPad T480',
          purchaseDate: '2020-03-02',
          currentBookValue: 0,
          repairs: { count: 1 },
        },
        {
          deviceNo: 'DE-000007',
          model: 'ThinkPad T480',
          purchaseDate: '2020-05-18',
          currentBookValue: 0,
          repairs: { count: 0 },
        },
      ],
      precedents: [
        { title: 'DP-000008 到期淘汰', amount: 0, status: 'approved' },
      ],
    },
    expect: ['approve'],
  },
  {
    id: 'young-laptop-cheap-repair',
    title:
      'A one-year-old laptop disposed as not worth repairing after one cheap repair',
    subject: 'disposal',
    material: {
      request: { title: 'DP-000012 维修不经济', amount: 9_800 },
      disposal: {
        record: {
          disposalNo: 'DP-000012',
          reason: 'uneconomicalRepair',
          method: 'scrap',
          dataWipe: 'notWiped',
        },
      },
      devices: [
        {
          deviceNo: 'DE-000052',
          ...laptop,
          purchaseDate: '2025-09-20',
          currentBookValue: 9_800,
          repairs: {
            count: 1,
            results: [{ fault: '键盘失灵', result: 'repaired', cost: 380 }],
          },
        },
      ],
      precedents: [],
    },
    expect: ['reject', 'needMore'],
  },
  {
    id: 'batch-one-still-valuable',
    title: 'A batch for disposal with one device still worth a good deal',
    subject: 'disposal',
    material: {
      request: { title: 'DP-000013 性能不足', amount: 3_100 },
      disposal: {
        record: {
          disposalNo: 'DP-000013',
          reason: 'insufficientPerformance',
          method: 'scrap',
          dataWipe: 'wiped',
        },
      },
      devices: [
        {
          deviceNo: 'DE-000020',
          model: 'Latitude 5400',
          purchaseDate: '2019-11-01',
          currentBookValue: 0,
          repairs: { count: 0 },
        },
        {
          deviceNo: 'DE-000021',
          model: 'Latitude 5400',
          purchaseDate: '2019-11-01',
          currentBookValue: 0,
          repairs: { count: 0 },
        },
        {
          deviceNo: 'DE-000048',
          model: 'Latitude 5440',
          purchaseDate: '2024-06-10',
          currentBookValue: 3_100,
          repairs: { count: 0 },
        },
      ],
      precedents: [],
    },
    expect: ['conditional'],
  },
];
