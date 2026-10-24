import type { DemoConversationSet } from '../demo-conversations.js';

/**
 * Asset Steward's conversations in the Chinese demo, held on a fresh import
 * on 2026-10-24 (prices in CNY) and turned into placeholders by
 * `demo-conversations.ts`'s rules. Regenerate from a new capture rather than
 * editing an answer by hand: the steps and the answer must stay what the
 * assistant did.
 */
export const ZH_CN: DemoConversationSet = {
  language: 'zh-CN',
  currency: 'CNY',
  conversations: [
    {
      key: 'leaver',
      owners: ['importer'],
      turns: [
        {
          user: '陈杰离职了，他名下还有哪些东西没处理？',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_context',
              input: {},
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_read_skill',
              input: {
                name: 'offboarding',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:chen.jie@northbridge.example}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'devices',
                filter: {
                  assigneeType: 'person',
                  assigneeId: '{{ref:person:chen.jie@northbridge.example}}',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'stockItems',
                filter: {
                  holderType: 'person',
                  holderId: '{{ref:person:chen.jie@northbridge.example}}',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'entitlements',
                filter: {
                  holderType: 'person',
                  holderId: '{{ref:person:chen.jie@northbridge.example}}',
                },
                pageSize: 50,
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'repairs',
                filter: {
                  ownerId: '393907556843526',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'purchaseOrders',
                filter: {
                  ownerId: '393907556843526',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'disposals',
                filter: {
                  ownerId: '393907556843526',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'auditTasks',
                filter: {
                  ownerId: '393907556843526',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'people',
                filter: {
                  onboardingOwnerId: '393907556843526',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'devices',
                filter: {
                  ownerId: '393907556843526',
                },
                pageSize: 50,
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'stockItems',
                id: '{{ref:stockItem:Dell WD22TB4 dock}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'stockItems',
                id: '{{ref:stockItem:Latitude 5440 battery}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:Figma Organization}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'repairs',
                filter: {
                  deviceId: '{{ref:device:6}}',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'disposals',
                id: '{{ref:disposal:1}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'purchaseOrders',
                id: '{{ref:purchaseOrder:60}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:Office LTSC 2024}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_device_sync_review',
              input: {
                view: 'checks',
                deviceId: '{{ref:device:9}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_plan_ops',
              input: {},
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_plan_create',
              input: {
                title: '回收陈杰名下的设备、扩展坞和 Figma 席位',
                summary:
                  '陈杰（IT 支持工程师，最后工作日 {{date:-2}}）名下可回收的有 3 项：使用中的笔记本 {{no:devices:9:DE-000009}} / SH-LT-011、领用的 Dell WD22TB4 扩展坞 1 个、Figma Organization 席位 1 个。维修中的 {{no:devices:6:DE-000006}} / SH-LT-006 等维修单 {{no:repairs:1:RP-000001}} 完成后再入库，不在此计划内；他负责的记录（2 台设备、1 张维修单、1 张采购草稿、1 张报废草稿、1 个盘点任务）需要人在「归属」页签移交，不在计划内。',
                steps: [
                  {
                    op: 'return_devices',
                    params: {
                      title: '归还 {{no:devices:9:DE-000009}} / SH-LT-011 入库',
                      items: [
                        {
                          deviceId: '{{ref:device:9}}',
                          nextStatus: 'inStock',
                        },
                      ],
                    },
                  },
                  {
                    op: 'take_back_stock',
                    params: {
                      title: '收回陈杰的 Dell WD22TB4 扩展坞 1 个',
                      stockItemId: '{{ref:stockItem:Dell WD22TB4 dock}}',
                      holderType: 'person',
                      holderId: '{{ref:person:chen.jie@northbridge.example}}',
                      quantity: 1,
                    },
                  },
                  {
                    op: 'reclaim_seats',
                    params: {
                      title: '回收陈杰的 Figma Organization 席位',
                      items: [
                        {
                          entitlementId:
                            '{{ref:entitlement:Figma Organization}}',
                          seatId:
                            '{{ref:seat:Figma Organization|chen.jie@northbridge.example}}',
                        },
                      ],
                    },
                  },
                ],
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '**结论**：陈杰（IT 支持工程师，最后工作日 {{date:-2}}）名下待处理的共 **10 项**：他持有的 **4 项**中 **3 项**我已提出回收，另外 **6 项**是他负责的记录，需要人来移交。\n\n**可以回收的**（已放进下面这张计划）\n- **设备**：{{no:devices:9:DE-000009}} / SH-LT-011（MacBook Air 13 M3），使用中，归还入库；负责人是我（Super Admin）。\n- **设备**：{{no:devices:6:DE-000006}} / SH-LT-006（Latitude 5440），维修中，**不归还**；要先等维修单 {{no:repairs:1:RP-000001}} 完成（送修 {{date:-3}}，预计 {{date:4}} 回件）；负责人是周宇。\n- **库存**：Dell WD22TB4 扩展坞 1 个，退回库存；库存记录负责人是吴静。\n- **席位**：Figma Organization 1 个（chen.jie@northbridge.example），回收；授权负责人是孙强。\n- {{date:-250}} 领用的 Latitude 5440 电池 1 块：这是耗材，已经消耗，没有持有记录，因此不需要退回。\n\n**需要你来处理的**\n- **他负责的 2 台设备**：{{no:devices:4:DE-000004}} / SH-LT-004（使用人王芳，维修单 {{no:repairs:11:RP-000011}} 维修中，预计 {{date:6}} 回件）、{{no:devices:5:DE-000005}} / SH-LT-005（借出给赵敏，应还日期 {{date:-7}}，**已逾期**）；请到「归属」页签勾选这两台设备并批量移交。\n- **维修单 {{no:repairs:11:RP-000011}}**（维修中）、**采购单 {{no:purchase_orders:60:PO-000060}}**（草稿：研发部笔记本换新 2 台 MacBook Pro 14 M3，¥31,998）、**报废单 {{no:disposals:1:DP-000007}}**（草稿：1 台，账面 ¥449.95，电池鼓包且已过保）、**盘点任务「三季度盘点 · 仓库」**（进行中）：这些记录要么移交，要么由你决定如何处理；设备、报废单和执行都不在我的改动范围内。\n\n**提醒**\n- ITAM 登录账号已随离职于 {{date:-2}} 自动停用，不需要再手动操作。\n- 回收席位**不会停用 Figma 账号**：请到 Figma 管理后台停用 chen.jie@northbridge.example；Figma Organization 于 {{date:25}} 续订，回收后可省下一个席位。\n- {{no:devices:9:DE-000009}} 今天（{{date:0}}）仍通过 Intune 在线，建议尽快收回，并按惯例先清除数据再重新分配。\n- {{no:disposals:1:DP-000007}} 与 {{no:repairs:1:RP-000001}} 指向同一台电池鼓包、已过保的机器；是等修好还是直接报废，需要由你决定。\n\n计划已生成，等你确认：归还 {{no:devices:9:DE-000009}}、收回 1 个扩展坞、回收 Figma 席位（共 3 步）；可以在卡片上跳过其中某几步。',
            },
          ],
        },
      ],
      plan: {
        title: '回收陈杰名下的设备、扩展坞和 Figma 席位',
        summary:
          '陈杰（IT 支持工程师，最后工作日 {{date:-2}}）名下可回收的有 3 项：使用中的笔记本 {{no:devices:9:DE-000009}} / SH-LT-011、领用的 Dell WD22TB4 扩展坞 1 个、Figma Organization 席位 1 个。维修中的 {{no:devices:6:DE-000006}} / SH-LT-006 等维修单 {{no:repairs:1:RP-000001}} 完成后再入库，不在此计划内；他负责的记录（2 台设备、1 张维修单、1 张采购草稿、1 张报废草稿、1 个盘点任务）需要人在「归属」页签移交，不在计划内。',
        steps: [
          {
            op: 'return_devices',
            ref: null,
            params: {
              title: '归还 {{no:devices:9:DE-000009}} / SH-LT-011 入库',
              items: [
                {
                  deviceId: '{{ref:device:9}}',
                  nextStatus: 'inStock',
                },
              ],
            },
          },
          {
            op: 'take_back_stock',
            ref: null,
            params: {
              title: '收回陈杰的 Dell WD22TB4 扩展坞 1 个',
              stockItemId: '{{ref:stockItem:Dell WD22TB4 dock}}',
              holderType: 'person',
              holderId: '{{ref:person:chen.jie@northbridge.example}}',
              quantity: 1,
            },
          },
          {
            op: 'reclaim_seats',
            ref: null,
            params: {
              title: '回收陈杰的 Figma Organization 席位',
              items: [
                {
                  entitlementId: '{{ref:entitlement:Figma Organization}}',
                  seatId:
                    '{{ref:seat:Figma Organization|chen.jie@northbridge.example}}',
                },
              ],
            },
          },
        ],
      },
    },
    {
      key: 'loans',
      owners: ['importer', 'support'],
      turns: [
        {
          user: '哪些设备借出逾期了？借给了谁，应该怎么跟进？',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_context',
              input: {},
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'devices',
                filter: {
                  status: 'onLoan',
                },
                pageSize: 50,
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'devices',
                id: '{{ref:device:5}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'devices',
                id: '{{ref:device:98}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:zhao.min@northbridge.example}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:liu.yang@northbridge.example}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'devices',
                id: '{{ref:device:2}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_device_sync_review',
              input: {
                view: 'checks',
                deviceId: '{{ref:device:98}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '**结论**：目前有 **2 台**设备借出逾期，且都尚未归还。按入库记录，这两台设备的状态都是「外借中」，均记在原定归还日之后。\n\n| 设备 | 型号 | 借用人 | 借出、原定归还 | 逾期 |\n|---|---|---|---|---|\n| {{no:devices:5:DE-000005}}、SH-LT-005 | MacBook Pro 14 M3 | 赵敏（销售部 售前顾问） | {{date:-10}} / **{{date:-7}}** | **7 天** |\n| {{no:devices:98:DE-000098}}、SH-LT-031 | Latitude 5440 | 刘洋（研发 测试工程师） | {{date:-12}} / **{{date:-2}}** | **2 天** |\n\n**需要特别注意的两点**\n- {{no:devices:5:DE-000005}} 的责任人登记为 **陈杰**，他在 **{{date:-2}}** 已离职，所以这台设备在归还入库后没有人接着跟进，需要先改责任人。\n- 两人手上都已经有在用的笔记本：赵敏另有 SH-LT-010，刘洋另有 SH-LT-003、SH-LT-020。也就是说，这两台设备都是**额外借用**，优先催回比较合理。\n\n**跟进建议（按优先级）**\n1. **刘洋（{{no:devices:98:DE-000098}}、SH-LT-031，逾期 2 天）**：由我负责，可以马上处理。先通过电话 **138 0013 0105** 或邮箱 liu.yang@northbridge.example 确认归还日期。另外，设备管理平台显示 SH-LT-002 的主要使用者是刘洋，与登记人张伟不一致，可以顺便确认他是否已经用不上这台借用的设备，如果能一起归还就最好。\n2. **赵敏（{{no:devices:5:DE-000005}}、SH-LT-005，逾期 7 天）**：这台设备是销售部借去用来做演示或备用的。联系她（**138 0013 0106**）；如果还需要用，就应补办续借并重设归还日，否则应在 3 个工作日内归还。\n3. **两处修正登记**：陈杰离职后，把 {{no:devices:5:DE-000005}} 的责任人转给在职的 IT 同事；两台设备归还入库前，要先按离职、归还流程清除数据，再重新分配。\n\n需要我起草一份计划吗？比如「{{no:devices:98:DE-000098}} 归还入库」或「{{no:devices:5:DE-000005}} 改责任人」。计划会等你在卡片上确认，我不会直接改动；你说的「续借延期」这类操作在页面上办理。',
            },
          ],
        },
      ],
    },
    {
      key: 'renewals',
      owners: ['importer', 'approver', 'writer'],
      turns: [
        {
          user: '未来 30 天有哪些软件订阅要续费或到期？大概要花多少钱？',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_context',
              input: {},
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'entitlements',
                filter: {
                  view: 'expiring',
                },
                pageSize: 50,
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'entitlements',
                filter: {
                  'expiryDate:gte': '{{date:0}}',
                  'expiryDate:lte': '{{date:30}}',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_stats',
              input: {
                report: 'expiry',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:Zoom Workplace Pro（年付）}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:Figma Professional（试用）}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:Office LTSC 2024}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:Figma Organization}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_web_search',
              input: {
                query: 'USD to CNY exchange rate today',
                count: 3,
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '**未来 30 天（{{date:0}} 至 {{date:30}}）有 3 项订阅要续费，另有 1 项永久授权的维护到期**：\n\n| 授权 | 到期日 | 续费方式 | 金额 |\n|---|---|---|---|\n| Zoom Workplace Pro（年付） | {{date:5}} | 自动续费，年付 | 27 席位 × USD 150 = **USD 4,050**（≈¥27,100） |\n| Figma Professional（试用） | {{date:6}} | 不自动续费 | 一次性 **USD 900**（≈¥6,000） |\n| Figma Organization | {{date:25}} | 自动续费，月付 | 12 席位 × USD 45 = **USD 540/月**，年化 **USD 6,480**（≈¥43,400） |\n| Office LTSC 2024 | {{date:20}}（维护到期） | 不自动续 | 登记里没有价格，需向厂商询价 |\n\n**钱怎么算**：30 天内实际支出约为 **USD 4,590（≈¥30,700）**，包括 Zoom 的年付费用和 Figma Organization 的当月费用。若按年化计算，两项订阅合计为 **USD 10,530（≈¥70,400）**，这里未计入 Office 的维护费用和 Figma 试用转正的 900 美元。\n\n**以下是几点需要留意的事项**：\n- **Figma Professional（试用）** 的 0 个席位正在使用，且不自动续费；如果没人使用，可以不续费，能省下 USD 900。\n- **Figma Organization** 的席位中有陈杰（{{date:-2}} 离职），但席位还未回收；续费前先收回该席位，就能把席位减到 11 个，并省下 **USD 45/月（≈¥3,600/年）**。\n- **Office LTSC 2024** 的席位为 4 个，而总席位只有 3 个，已经超额，并且维护将在 {{md:20}} 到期；是否需要续保，由您决定。\n\n汇率按 1 USD ≈ 6.69 CNY 估算，来源 [Wise 美元兑人民币](https://wise.com/zh-cn/currency-converter/cny-to-usd-rate)（近似中间价，实际以付款日为准）。需要我出一张计划，把这些续费前的调整（例如回收陈杰的 Figma 席位）拟出来吗？',
            },
          ],
        },
      ],
    },
    {
      key: 'joiner',
      owners: ['importer'],
      turns: [
        {
          user: '孙浩快入职了，他的电脑和软件准备好了吗？还缺什么？',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_context',
              input: {},
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'people',
                q: '孙浩',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_read_skill',
              input: {
                name: 'onboarding',
              },
            },
            {
              type: 'tool',
              tool: 'itam_onboarding_plan',
              input: {
                personId: '{{ref:person:sun.hao@northbridge.example}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_availability',
              input: {
                softwareProductId: 'sp-intellij-idea',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'purchaseOrders',
                q: 'IntelliJ',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:IntelliJ IDEA Ultimate}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:chen.jie@northbridge.example}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_plan_ops',
              input: {},
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_plan_create',
              input: {
                title: '为孙浩备好入职设备与软件（{{md:5}} 入职）',
                summary:
                  '孙浩 {{md:5}} 入职，配置为「研发 · 前端工程师」，共 8 项，笔记本 {{no:devices:16:DE-000016}} / SH-LT-051 已预留。此计划补齐其余可立即备齐的 6 项：显示器预留到入职日，扩展坞与键鼠按方案领用，Microsoft 365 与 Zoom 各分配 1 个席位（账号 sun.hao@northbridge.example）。IntelliJ IDEA Ultimate 没有空闲席位，需另行采购。',
                steps: [
                  {
                    op: 'reserve_device',
                    params: {
                      title:
                        '为孙浩预留显示器 {{no:devices:20:DE-000020}}（SH-MON-007），保留到 {{date:5}}',
                      deviceId: '{{ref:device:20}}',
                      reservedForType: 'person',
                      reservedForId:
                        '{{ref:person:sun.hao@northbridge.example}}',
                      reservedUntil: '{{date:5}}',
                    },
                  },
                  {
                    op: 'issue_stock',
                    params: {
                      title: '为孙浩领用 Dell WD22TB4 扩展坞 ×1',
                      stockItemId: '{{ref:stockItem:Dell WD22TB4 dock}}',
                      holderType: 'person',
                      holderId: '{{ref:person:sun.hao@northbridge.example}}',
                      quantity: 1,
                    },
                  },
                  {
                    op: 'issue_stock',
                    params: {
                      title: '为孙浩领用 Logitech MX Keys ×1',
                      stockItemId: '{{ref:stockItem:Logitech MX Keys}}',
                      holderType: 'person',
                      holderId: '{{ref:person:sun.hao@northbridge.example}}',
                      quantity: 1,
                    },
                  },
                  {
                    op: 'issue_stock',
                    params: {
                      title: '为孙浩领用 Logitech MX Master 3S ×1',
                      stockItemId: '{{ref:stockItem:Logitech MX Master 3S}}',
                      holderType: 'person',
                      holderId: '{{ref:person:sun.hao@northbridge.example}}',
                      quantity: 1,
                    },
                  },
                  {
                    op: 'assign_seat',
                    params: {
                      title: '为孙浩分配 Microsoft 365 商业标准版席位',
                      entitlementId:
                        '{{ref:entitlement:Microsoft 365 商业标准版}}',
                      holderType: 'person',
                      holderId: '{{ref:person:sun.hao@northbridge.example}}',
                      account: 'sun.hao@northbridge.example',
                    },
                  },
                  {
                    op: 'assign_seat',
                    params: {
                      title: '为孙浩分配 Zoom Workplace Pro（年付）席位',
                      entitlementId:
                        '{{ref:entitlement:Zoom Workplace Pro（年付）}}',
                      holderType: 'person',
                      holderId: '{{ref:person:sun.hao@northbridge.example}}',
                      account: 'sun.hao@northbridge.example',
                    },
                  },
                ],
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '**结论**：孙浩 {{md:5}} 入职（研发 · 前端工程师，3 楼），配置共 **8 项，已备 1 项**：笔记本 **{{no:devices:16:DE-000016}} / SH-LT-051** 已预留。其余 6 项库存/席位都够，**只有 IntelliJ IDEA Ultimate 缺 1 个，需要采购**。\n\n**还能从现有库存和席位补齐的**：\n- 显示器 **{{no:devices:20:DE-000020}} / SH-MON-007**（我挑选时避开了屏幕有坏点的 SH-MON-006）\n- Dell WD22TB4 扩展坞 ×1、Logitech MX Keys ×1、MX Master 3S ×1\n- Microsoft 365 商业标准版席位 ×1、Zoom Workplace Pro（年付）席位 ×1（账号 sun.hao@northbridge.example）\n\n**唯一的缺口**：IntelliJ IDEA Ultimate 11 个席位全部在用（11/11，无空闲），**缺 1 个**，下单截止日 {{date:-2}}，已过期，应尽快下单；参考 {{no:purchase_orders:58:PO-000058}}，上次供应商是**北桥 IT 供应有限公司**。\n\n**已拟一份计划**：预留显示器到入职日、领用扩展坞与键鼠、分配两个软件席位，**等你确认**后执行。领用等于现在就交出去，如果你想入职当天再发，可以只保留预留和席位。\n\n另有两件只能人工处理：分配席位不会在软件后台开通账号，M365 和 Zoom 需分别去各自后台为 sun.hao@northbridge.example 开号；预留的设备入职前要装系统、贴资产标签。\n\nIntelliJ 这 1 个席位，用 **北桥 IT 供应有限公司** 起草采购单可以吗？确认后我把采购单一并拟进计划（单价未知先不填）。',
            },
          ],
        },
      ],
      plan: {
        title: '为孙浩备好入职设备与软件（{{md:5}} 入职）',
        summary:
          '孙浩 {{md:5}} 入职，配置为「研发 · 前端工程师」，共 8 项，笔记本 {{no:devices:16:DE-000016}} / SH-LT-051 已预留。此计划补齐其余可立即备齐的 6 项：显示器预留到入职日，扩展坞与键鼠按方案领用，Microsoft 365 与 Zoom 各分配 1 个席位（账号 sun.hao@northbridge.example）。IntelliJ IDEA Ultimate 没有空闲席位，需另行采购。',
        steps: [
          {
            op: 'reserve_device',
            ref: null,
            params: {
              title:
                '为孙浩预留显示器 {{no:devices:20:DE-000020}}（SH-MON-007），保留到 {{date:5}}',
              deviceId: '{{ref:device:20}}',
              reservedForType: 'person',
              reservedForId: '{{ref:person:sun.hao@northbridge.example}}',
              reservedUntil: '{{date:5}}',
            },
          },
          {
            op: 'issue_stock',
            ref: null,
            params: {
              title: '为孙浩领用 Dell WD22TB4 扩展坞 ×1',
              stockItemId: '{{ref:stockItem:Dell WD22TB4 dock}}',
              holderType: 'person',
              holderId: '{{ref:person:sun.hao@northbridge.example}}',
              quantity: 1,
            },
          },
          {
            op: 'issue_stock',
            ref: null,
            params: {
              title: '为孙浩领用 Logitech MX Keys ×1',
              stockItemId: '{{ref:stockItem:Logitech MX Keys}}',
              holderType: 'person',
              holderId: '{{ref:person:sun.hao@northbridge.example}}',
              quantity: 1,
            },
          },
          {
            op: 'issue_stock',
            ref: null,
            params: {
              title: '为孙浩领用 Logitech MX Master 3S ×1',
              stockItemId: '{{ref:stockItem:Logitech MX Master 3S}}',
              holderType: 'person',
              holderId: '{{ref:person:sun.hao@northbridge.example}}',
              quantity: 1,
            },
          },
          {
            op: 'assign_seat',
            ref: null,
            params: {
              title: '为孙浩分配 Microsoft 365 商业标准版席位',
              entitlementId: '{{ref:entitlement:Microsoft 365 商业标准版}}',
              holderType: 'person',
              holderId: '{{ref:person:sun.hao@northbridge.example}}',
              account: 'sun.hao@northbridge.example',
            },
          },
          {
            op: 'assign_seat',
            ref: null,
            params: {
              title: '为孙浩分配 Zoom Workplace Pro（年付）席位',
              entitlementId: '{{ref:entitlement:Zoom Workplace Pro（年付）}}',
              holderType: 'person',
              holderId: '{{ref:person:sun.hao@northbridge.example}}',
              account: 'sun.hao@northbridge.example',
            },
          },
        ],
      },
    },
    {
      key: 'approvals',
      owners: ['importer'],
      turns: [
        {
          user: '等我审批的采购单和报废单有哪些？有没有需要特别注意的地方？',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_context',
              input: {},
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'purchaseOrders',
                id: '{{ref:purchaseOrder:61}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'purchaseOrders',
                id: '{{ref:purchaseOrder:69}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'purchaseOrders',
                id: '{{ref:purchaseOrder:70}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'disposals',
                id: '{{ref:disposal:3}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_availability',
              input: {
                modelId: 'model-u2723qe',
              },
            },
            {
              type: 'tool',
              tool: 'itam_availability',
              input: {
                modelId: 'model-macbook-air-13-m3',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'devices',
                filter: {
                  status: 'retired',
                },
                pageSize: 20,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'repairs',
                q: '打印机',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_model_match',
              input: {
                text: '打印机 多功能一体机',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'devices',
                q: 'Catalyst 9200',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'models',
                id: 'model-u2723qe',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'categories',
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'disposals',
                q: '{{no:disposals:3:DP-000009}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'devices',
                filter: {
                  categoryId: 'cat-printer',
                },
                pageSize: 30,
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'devices',
                id: '{{ref:device:25}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_onboarding_plan',
              input: {
                personId: '{{ref:person:sun.hao@northbridge.example}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_onboarding_plan',
              input: {
                personId: '{{ref:personName:林雪}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_availability',
              input: {
                modelId: 'model-macbook-pro-14-m3',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '今天（{{date:0}}）等你的审批的共有 **4 张**：3 张采购单、1 张报废单。\n\n## 采购单\n**{{no:purchase_orders:61:PO-000061}} 销售部显示器扩容**：5 × U2723QE，单价 **3,299** 元，合计 **16,495** 元；销售部，需要日 {{date:21}}，供应商北桥 IT 供应有限公司。\n- 库存里有 3 台同型号，但其中 2 台已被两位入职人员的配置选中（SH-MON-007 给孙浩、SH-MON-006 给林雪），实际能动的只有 **1 台**（仓库 SH-MON-003），因此订购 5 台有依据。\n- 单里留言说的“下周一有三位新人到岗”是 {{date:-14}} 的旧留言，需要日已排在 {{md:21}}，所以先确认是否仍按 {{md:21}} 要货。\n\n**{{no:purchase_orders:69:PO-000069}} 研发新员工 MacBook Air**：4 × MacBook Air 13 M3，单价 **8,999** 元，合计 **35,996** 元；研发，需要日 {{date:14}}，博思数码（Apple 授权经销商）。\n- 这张单**与入职配置不一致**：研发·前端工程师的配置是 MacBook Pro 14 M3（孙浩的 SH-LT-051 已预留），而林雪的 MacBook Pro 14 M3 也可由库存 SH-LT-052 提供。库存中 MacBook Air 13 M3 为 **0 台**。\n- 目前待入职只有 **2 人**（孙浩 {{md:5}}、林雪 {{md:12}}），这 4 台对应谁不明确。按“先用库存，库存没有再提采购”，建议先向吴静确认型号和人数，再批。\n\n**{{no:purchase_orders:70:PO-000070}} 机房第二台核心交换机**：1 × Catalyst 9200-48P，**23,000** 元；IT 运维，需要日 {{date:30}}，云帆网络科技。\n- 单价超过 **1 万元**；按规矩，说明里要写清理由和替代方案，而现在说明只有一句“机房第二台核心交换机”，需要补上。\n- 这张单在列表里**不在你名下**（“我的”标记为否），审批人可能另有其人，建议先确认由谁批。\n- 机房现有 1 台同型号（{{no:devices:23:DE-000023}}，2024-05 购入，保修到 2029-05），第二台做冗余的说法成立。\n\n## 报废单\n**{{no:disposals:3:DP-000009}} 打印机报废**：方式是销毁，{{no:devices:25:DE-000025}} SH-PRN-3F-01（LaserJet Pro M428），账面价值 **1,817.13** 元，回收商绿环回收。\n- **数据清除标为“不需要”**：它是 3 楼的网络打印机（IP 10.0.3.50），有地址簿和作业缓存；按流程，报废前应先清除数据，建议改成需要清除并写明方式。\n- 单里写“厂家已经修过三次卡纸”，但 {{no:devices:25:DE-000025}} 在系统里**没有任何维修记录**，查不到；因此“单次维修报价是否超过账面价值 50%（约 **908.57** 元）”这条报废依据也无法核对，建议先补维修记录或报价单。\n- 3 楼只有这 **1 台**在用打印机，销毁后 3 楼就没有打印机，需要同步安排替代设备（调拨或采购）。\n\n另外提醒一句：已批准待执行的还有 {{no:disposals:4:DP-000010}}，它不占审批位。\n\n以上只是读取到的现状，我没有改动任何记录；如果你需要我整理成给提交人的确认消息，或对某张单提出调整，请告诉我。',
            },
          ],
        },
      ],
    },
    {
      key: 'repairs',
      owners: ['importer', 'support'],
      turns: [
        {
          user: '正在维修的设备和进行中的盘点进展怎么样？有没有卡住的？',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '我先读一下今天的情况，再看维修和盘点。',
            },
            {
              type: 'tool',
              tool: 'itam_context',
              input: {},
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'repairs',
                id: '{{ref:repair:12}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'repairs',
                id: '{{ref:repair:1}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'repairs',
                id: '{{ref:repair:11}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'auditTasks',
                filter: {
                  view: 'inProgress',
                },
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'auditTasks',
                sort: 'createdAt',
                order: 'desc',
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'auditTasks',
                id: '{{ref:auditTask:三季度盘点 · 台式机与手机}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'auditTasks',
                id: '{{ref:auditTask:三季度盘点 · 3 楼}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'auditTasks',
                id: '{{ref:auditTask:三季度盘点 · 仓库}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'repairs',
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'devices',
                id: '{{ref:device:6}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'devices',
                id: '{{ref:device:4}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'devices',
                id: '{{ref:device:11}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'devices',
                id: '{{ref:device:24}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'devices',
                id: '{{ref:device:25}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:chen.jie@northbridge.example}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_plan_ops',
              input: {},
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'locations',
                ids: [
                  '{{ref:location:大会议室}}',
                  'loc-hq-floor-3',
                  'loc-hq-warehouse',
                  'loc-hq-server-room',
                ],
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '## 维修中的 3 台\n\n| 单号 / 设备 | 情况 | 预计返回 | 判断 |\n|---|---|---|---|\n| {{no:repairs:12:RP-000012}} · {{no:devices:11:DE-000011}} SH-LT-021（ThinkPad T14 Gen 5，内部清灰） | {{md:-1}} 送修 | {{md:2}} | 进度正常，还有 2 天 |\n| {{no:repairs:11:RP-000011}} · {{no:devices:4:DE-000004}} SH-LT-004（MacBook Pro 14 M3，王芳） | {{md:-1}} 送出至北桥维修中心，报价 **CNY 580**，约为账面价值 CNY 1,222.15 的 **47%**，系统建议维修 | {{md:6}} | **卡住**：报价决定一栏自 {{md:-1}} 起一直是空的 |\n| {{no:repairs:1:RP-000001}} · {{no:devices:6:DE-000006}} SH-LT-006（Latitude 5440，陈杰名下） | {{md:-3}} 送出，报价 **CNY 650**，为账面价值 CNY 449.95 的 **144%**，已过保（{{date:-100}}）、计划更换日（{{date:-39}}）已过 | {{md:4}} | **卡住**：报价决定也是空的；按规则应改为报废并更换 |\n\n两点附带问题：{{no:repairs:11:RP-000011}} 的负责人是陈杰，而他 {{md:-2}} 已离职，现在没有人跟进这张单；同时 {{no:devices:4:DE-000004}} 的保修到 {{date:26}} 仍未到期，屏幕碎裂是意外损坏，报价单里没有写明厂商保修为什么不覆盖，建议向供应商确认。\n\n## 盘点 3 个\n\n1. **三季度盘点 · 台式机与手机** — 差异待处理，最卡：计划结束日 {{md:-1}} 已过，3 台都盘完但 **2 项差异无人处理**：\n   - {{no:devices:24:DE-000024}} SH-PH-001（iPhone 15，赵敏）：账面在 3 楼，实际盘到在机房；\n   - {{no:devices:25:DE-000025}} SH-PRN-3F-01（LaserJet Pro M428 打印机）：**未找到**。\n2. **三季度盘点 · 3 楼** — 进行中，**1/74** 已盘（约 1%）。{{md:-3}} 开始，计划 {{md:10}} 结束，剩 10 天要盘 73 台；最后一次盘点是 {{md:-2}}，已经 2 天没进度。范围里有 4 台无法现场清点：{{no:devices:4:DE-000004}}、{{no:devices:6:DE-000006}} 在维修中，{{no:devices:5:DE-000005}}、{{no:devices:98:DE-000098}} 借出在外。另外周宇 {{md:-2}} 在盘点记录里留言，请 Super Admin 确认会议室两台设备的位置。\n3. **三季度盘点 · 仓库** — 进行中，**0/14**。{{md:-2}} 开始、计划 {{md:12}} 结束，但负责人和执行人都是陈杰，他 {{md:-2}} 离职后无人接手，一台都还没盘。\n\n**结论**：真正卡住的是三处：两张维修单等待报价决定，一张差异待处理的盘点，以及一次盘点换了执行人。\n\n接下来要我做什么，我就出**一条计划**给你确认：例如按规则为 {{no:devices:6:DE-000006}} 提报废单、再从库存给陈杰的位置补一台替换机；或者你只想先决定 {{no:repairs:11:RP-000011}} 修或不修。3 楼盘点的差异处理和更换执行人需要在盘点页上操作，我无法代做。',
            },
          ],
        },
      ],
    },
  ],
};
