import type { DemoConversationSet } from '../demo-conversations.js';

/**
 * Asset Steward's conversations in the English demo, held on a fresh import
 * on 2026-10-24 (prices in USD) and turned into placeholders by
 * `demo-conversations.ts`'s rules. Regenerate from a new capture rather than
 * editing an answer by hand: the steps and the answer must stay what the
 * assistant did.
 */
export const EN_US: DemoConversationSet = {
  language: 'en-US',
  currency: 'USD',
  conversations: [
    {
      key: 'leaver',
      owners: ['importer'],
      turns: [
        {
          user: "Mark Taylor has left. What does he still hold that hasn't been dealt with?",
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: "I'll start by reading today's context and finding Mark Taylor's record.",
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
                q: 'Mark Taylor',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:mark.taylor@northbridge.example}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_read_skill',
              input: {
                name: 'offboarding',
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
                  assigneeId: '{{ref:person:mark.taylor@northbridge.example}}',
                },
                pageSize: 50,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'repairs',
                filter: {
                  ownerId: '393910484467718',
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
                  ownerId: '393910484467718',
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
                  ownerId: '393910484467718',
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
                  ownerId: '393910484467718',
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
                  onboardingOwnerId: '393910484467718',
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
                  ownerId: '393910484467718',
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
                  ownerId: '393910484467718',
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
                id: '{{ref:device:9}}',
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
                collection: 'stockItems',
                id: '{{ref:stockItem:Dell WD22TB4 dock}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'entitlements',
                filter: {
                  ownerId: '393910484467718',
                },
                pageSize: 50,
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
              tool: 'itam_device_sync_review',
              input: {
                view: 'checks',
                deviceId: '{{ref:device:9}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_device_sync_review',
              input: {
                view: 'checks',
                deviceId: '{{ref:device:6}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_plan_create',
              input: {
                title:
                  "Recover Mark Taylor's remaining asset (laptop, dock, Figma seat)",
                summary:
                  "Mark Taylor (IT Support Engineer) left on {{date:-2}}. He still holds {{no:devices:9:DE-000009}} / SH-LT-011 (in use), one Dell WD22TB4 dock, and one Figma Organization seat (mark.taylor@northbridge.example). {{no:devices:6:DE-000006}} / SH-LT-006 is excluded because it is at Northbridge Repair Center under {{no:repairs:1:RP-000001}} (expected back {{date:4}}) and cannot be returned until the repair is finished. The laptop is sent back to the warehouse and must be wiped before reassignment; reclaiming the seat does not disable the Figma account — that is done in Figma's own admin console.",
                steps: [
                  {
                    op: 'return_devices',
                    params: {
                      title:
                        'Return {{no:devices:9:DE-000009}} / SH-LT-011 to stock (warehouse, pending wipe)',
                      items: [
                        {
                          deviceId: '{{ref:device:9}}',
                          nextStatus: 'inStock',
                          locationId: 'loc-hq-warehouse',
                          condition:
                            'Returned by leaver Mark Taylor; wipe before reassigning.',
                        },
                      ],
                    },
                  },
                  {
                    op: 'take_back_stock',
                    params: {
                      title: 'Take back 1 × Dell WD22TB4 dock from Mark Taylor',
                      stockItemId: '{{ref:stockItem:Dell WD22TB4 dock}}',
                      holderType: 'person',
                      holderId:
                        '{{ref:person:mark.taylor@northbridge.example}}',
                      quantity: 1,
                      notes: 'Leaver recovery {{date:-2}}',
                    },
                  },
                  {
                    op: 'reclaim_seats',
                    params: {
                      title: "Reclaim Mark Taylor's Figma Organization seat",
                      items: [
                        {
                          entitlementId:
                            '{{ref:entitlement:Figma Organization}}',
                          seatId:
                            '{{ref:seat:Figma Organization|mark.taylor@northbridge.example}}',
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
              text: '**Conclusion**：Mark Taylor (IT Support Engineer, left **{{date:-2}}**) still has **4 items** in his name — I have proposed recovery of **3**. One device must wait for its repair, and **6 records** he owns need a new owner.\n\n**Can be recovered now**\n- **{{no:devices:9:DE-000009}} / SH-LT-011** (MacBook Air 13 M3, in use) → back to stock in the warehouse, wipe before reassigning. Owner: Super Admin.\n- **Dell WD22TB4 dock ×1** (accessory) → returned to stock. Owner: Emily Carter.\n- **Figma Organization seat ×1** (mark.taylor@northbridge.example) → reclaimed; the subscription has 12 seats, $6.43/seat/month ($925.92/year), renews {{date:25}}. Owner: Daniel Brooks.\n\n**Must wait / decided by a person**\n- **{{no:devices:6:DE-000006}} / SH-LT-006** (Latitude 5440) is in repair — **{{no:repairs:1:RP-000001}}**, at Northbridge Repair Center, expected back **{{date:4}}**. It cannot be returned until the repair completes; the 2 components inside and the 1 TB SSD in {{no:devices:9:DE-000009}} travel with their devices. Owner: Ryan Mitchell. (Out of warranty, book value $64.30, past its planned replacement date — a disposal decision for later, not mine to make.)\n\n**Records he is responsible for that need handing over** (the "In their name" tab → select → bulk transfer, to a person you choose)\n- **{{no:devices:4:DE-000004}} / SH-LT-004** — MacBook Pro 14 M3, held by Sophia Turner, in repair **{{no:repairs:11:RP-000011}}** (expected {{date:6}}).\n- **{{no:devices:5:DE-000005}} / SH-LT-005** — MacBook Pro 14 M3, on loan to Chloe Adams, return was due **{{date:-7}}** (overdue).\n- **{{no:repairs:11:RP-000011}}** — repair in progress.\n- **{{no:disposals:1:DP-000007}}** — draft disposal.\n- **{{no:purchase_orders:60:PO-000060}}** — draft purchase order (R&D department, Northbridge IT Supply).\n- **Q3 count · warehouse** — stock count in progress since {{date:-4}}.\n\n**Notes**\n- His ITAM sign-in account was disabled automatically on leaving ({{date:-2}}) — nothing to do there.\n- Reclaiming the Figma seat does **not** deactivate the account: switch off mark.taylor@northbridge.example in Figma\'s own admin console.\n- {{no:devices:9:DE-000009}} still checked in to Intune on **{{date:0}} 06:10** under his account — collect it and wipe it before it is reassigned.\n\nI have put the three recoverable items into one plan (laptop to stock, dock to stock, Figma seat reclaimed) — it is waiting for you to confirm on the card.',
            },
          ],
        },
      ],
      plan: {
        title:
          "Recover Mark Taylor's remaining asset (laptop, dock, Figma seat)",
        summary:
          "Mark Taylor (IT Support Engineer) left on {{date:-2}}. He still holds {{no:devices:9:DE-000009}} / SH-LT-011 (in use), one Dell WD22TB4 dock, and one Figma Organization seat (mark.taylor@northbridge.example). {{no:devices:6:DE-000006}} / SH-LT-006 is excluded because it is at Northbridge Repair Center under {{no:repairs:1:RP-000001}} (expected back {{date:4}}) and cannot be returned until the repair is finished. The laptop is sent back to the warehouse and must be wiped before reassignment; reclaiming the seat does not disable the Figma account — that is done in Figma's own admin console.",
        steps: [
          {
            op: 'return_devices',
            ref: null,
            params: {
              title:
                'Return {{no:devices:9:DE-000009}} / SH-LT-011 to stock (warehouse, pending wipe)',
              items: [
                {
                  deviceId: '{{ref:device:9}}',
                  nextStatus: 'inStock',
                  locationId: 'loc-hq-warehouse',
                  condition:
                    'Returned by leaver Mark Taylor; wipe before reassigning.',
                },
              ],
            },
          },
          {
            op: 'take_back_stock',
            ref: null,
            params: {
              title: 'Take back 1 × Dell WD22TB4 dock from Mark Taylor',
              stockItemId: '{{ref:stockItem:Dell WD22TB4 dock}}',
              holderType: 'person',
              holderId: '{{ref:person:mark.taylor@northbridge.example}}',
              quantity: 1,
              notes: 'Leaver recovery {{date:-2}}',
            },
          },
          {
            op: 'reclaim_seats',
            ref: null,
            params: {
              title: "Reclaim Mark Taylor's Figma Organization seat",
              items: [
                {
                  entitlementId: '{{ref:entitlement:Figma Organization}}',
                  seatId:
                    '{{ref:seat:Figma Organization|mark.taylor@northbridge.example}}',
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
          user: 'Which devices are overdue on loan? Who has them, and how should we follow up?',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: "I'll start by checking the current context.",
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
              type: 'text',
              text: 'I see two loans flagged. Let me check all devices currently on loan and read the flagged ones.',
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
                collection: 'devices',
                id: '{{ref:device:5}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: 'Both on-loan devices are past their due date. Let me check the borrowers and make sure no other loan is past due.',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'people',
                q: 'Chloe Adams',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'people',
                q: 'Lucas Martin',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'devices',
                filter: {
                  'expectedReturnDate:lte': '{{date:0}}',
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
                collection: 'people',
                id: '{{ref:person:lucas.martin@northbridge.example}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:chloe.adams@northbridge.example}}',
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
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:mark.taylor@northbridge.example}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: "**All 2 devices on loan are overdue** — and there is nothing else outstanding (no other device in the register has a return date on or before today, {{dmony:0}}).\n\n| Device | Model | With | Due | Overdue |\n|---|---|---|---|---|\n| {{no:devices:5:DE-000005}} / SH-LT-005 | MacBook Pro 14 M3 | Chloe Adams, Presales Consultant, Sales | {{date:-7}} | **7 days** |\n| {{no:devices:98:DE-000098}} / SH-LT-031 | Latitude 5440 | Lucas Martin, QA Engineer, R&D | {{date:-2}} | **2 days** |\n\nBoth are 3F laptops, and both borrowers are still active — but each one already has their own primary machine in use:\n\n- **Chloe Adams** — primary SH-LT-010 (MacBook Air 13 M3) + monitor SH-MON-002, phone SH-PH-001. SH-LT-005 is a second machine.\n- **Lucas Martin** — primary SH-LT-003 (MacBook Pro 14 M3) + SH-LT-020 (ThinkPad T14) + monitor SH-MON-011. SH-LT-031 is a third machine.\n\n**How I'd follow up**\n\n1. **Chase today** — chloe.adams@northbridge.example and lucas.martin@northbridge.example, both by mail and phone; ask for a firm return date. Since neither needs the loaner as their working machine, the ask is \"return it\", not \"extend it\".\n2. **Fix the owner on {{no:devices:5:DE-000005}}** — its asset owner is Mark Taylor, who left on {{date:-2}}, so nobody in IT is currently watching that record. Reassign ownership to IT Operations on the device page as part of the chase.\n3. **Close the loans on return** — check both in to stock at 3F with a condition note, and wipe before they are reassigned. I can put that check-in into one plan for you the moment the machines are physically back — say the word and I'll propose it.\n4. **If a borrower still needs one** — the loan has to be closed and re-issued with a new due date; I can't just push the date out. Worth knowing for SH-LT-005: warranty runs out **{{date:28}}** and its book value is only **$174.63**, so if it comes back faulty it is a replacement, not a repair.\n5. **If nothing by end of week** — escalate to the IT Asset Manager, with the two device numbers above.\n\nOne thing the register also shows that isn't a loan: Mark Taylor's own kit is still unreturned (SH-LT-006 in repair, SH-LT-011 in use) — that's on the leaver checklist, not this list.",
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
          user: 'Which software subscriptions renew or end in the next 30 days, and roughly how much will they cost?',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: "I'll start by reading the context, then look at the entitlement expiry data.",
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
              type: 'text',
              text: 'Now let me pull the entitlements and the expiry report.',
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
              type: 'tool',
              tool: 'itam_stats',
              input: {
                report: 'expiry',
                from: '{{date:0}}',
                to: '{{date:30}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: 'Let me read the four that fall inside the window.',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:Zoom Workplace Pro (annual)}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:Figma Professional (trial)}}',
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
              tool: 'itam_record_get',
              input: {
                collection: 'entitlements',
                id: '{{ref:entitlement:Zoom Workplace Pro}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '**4 entitlements fall inside {{date:0}} → {{date:30}}** (subscriptions and maintenance), roughly **$1,505 a year** of committed renewal plus one optional $129.\n\n| Entitlement | Date | Term | Seats / price | Approx. cost |\n|---|---|---|---|---|\n| Zoom Workplace Pro (annual) | renews {{date:5}} (5 days) | annual, auto-renew **on** | 25 of 27 used | **$578.61 / year** (27 × $21.43) |\n| Figma Professional (trial) | ends {{date:6}} (6 days) | annual, auto-renew **off** | no seats held | **$129 / year** if kept (flat) |\n| Office LTSC 2024 | maintenance ends {{date:20}} | perpetual licence | 4 assigned / 3 seats | no price on record |\n| Figma Organization | renews {{date:25}} (25 days) | monthly, auto-renew **on** | 10 of 12 used | **$77.16 / month ≈ $925.92 / year** (12 × $6.43) |\n\n**Total**: about **$1,504.53 a year** already set to renew, **+ $129** only if the Figma trial becomes a paid plan.\n\nWorth knowing before you renew:\n\n- **Zoom**: the 7-day subscription reminder threshold is nearly up. Two seats are free, and a separate Zoom Workplace Pro entitlement (3 seats, $64.29/year) already lapsed on **{{date:-10}}** with auto-renew off — Ethan Brown still holds that seat.\n- **Figma Organization**: Mark Taylor left on **{{date:-2}}** but still holds a seat, and 2 of 12 are unused — reclaiming before renewal and adjusting seats at renewal is the cheaper path.\n- **Office LTSC 2024**: it is over-allocated — 4 devices ({{no:devices:1:DE-000001}} to {{no:devices:4:DE-000004}}) share 3 seats, which is a compliance issue independent of the maintenance date.\n\nNo plan is needed for a lookup; if you want the Figma seat reclamation or a seat change at renewal prepared as a plan, say which and I will put it on a card for you to confirm.',
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
          user: "Noah Harris is joining soon. Are his laptop and software ready? What's still missing?",
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: "I'll start with the context and find Noah's record.",
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
                q: 'Noah Harris',
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
                personId: '{{ref:person:noah.harris@northbridge.example}}',
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
                collection: 'entitlements',
                q: 'IntelliJ',
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
              tool: 'itam_search',
              input: {
                collection: 'entitlements',
                filter: {
                  view: 'idle',
                },
              },
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
                id: '{{ref:person:mark.taylor@northbridge.example}}',
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
                id: '{{ref:device:16}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '**Status**（hire date **{{date:5}}**, in 5 days; kit: Research & Development standard kit）: laptop yes, software not yet — **prepared 1 / 8**.\n\n**Laptop — ready**\n- **{{no:devices:16:DE-000016}} / SH-LT-051**, MacBook Pro 14 M3, in stock at Level 3, reserved for Noah until **{{date:5}}**, warranty to {{date:655}}. Still needs imaging and an asset label before day one.\n\n**Still missing (7 items, all coverable from stock except one)**\n- Monitor U2723QE → **{{no:devices:20:DE-000020}} / SH-MON-007** (at his floor, warranty to 2029-03, never repaired; SH-MON-006 was passed over — one dead pixel)\n- Dell WD22TB4 dock ×1 — in stock\n- Logitech MX Keys ×1 — in stock\n- Logitech MX Master 3S ×1 — in stock (only **3** left against a minimum of 5)\n- Microsoft 365 Business Standard seat — free, for noah.harris@northbridge.example\n- Zoom Workplace Pro (annual) seat — free, same account\n- **IntelliJ IDEA Ultimate — this is the real gap**: the entitlement is **11 / 11** seats assigned, no free seat, no idle or leaver seat to reclaim, and no purchase order is in flight for him. The latest order date was **{{date:-2}}**, so it is already overdue.\n\n**Two things only people can do**\n- Seats are register entries only: create his accounts in the Microsoft 365 admin center, the Zoom admin portal and JetBrains, and add him to the right groups.\n- The reserved laptop must be assigned to him on his first day, not before.\n\n**If you want it all in one plan**: I can propose reserving the monitor, the dock, the keyboard and mouse, and giving him the Microsoft 365 and Zoom seats — plus a draft purchase order for the missing IntelliJ seat. The purchase order needs a vendor: the last IntelliJ order ({{no:purchase_orders:58:PO-000058}}, April) came from **Northbridge IT Supply**. Shall I use that one, or another vendor?',
            },
          ],
        },
        {
          user: 'Yes, use Northbridge IT Supply and put it all in one plan.',
          parts: [
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
                title:
                  "Complete Noah Harris's onboarding kit (monitor, accessories, seats, IntelliJ order)",
                summary:
                  'Noah Harris (Research & Development, Frontend Engineer) joins {{date:5}}. The standard Research & Development kit needs 8 items; his laptop {{no:devices:16:DE-000016}} / SH-LT-051 is already reserved for him until {{date:5}}. This plan covers the remaining 7: the monitor and three accessories from stock, the two free software seats, and one draft purchase order for the IntelliJ IDEA Ultimate seat that has no free, idle or leaver seat (11/11 assigned) and no order in flight — its latest order date {{date:-2}} has passed.',
                steps: [
                  {
                    op: 'reserve_device',
                    params: {
                      title:
                        'Reserve monitor {{no:devices:20:DE-000020}} / SH-MON-007 for Noah Harris until {{date:5}}',
                      deviceId: '{{ref:device:20}}',
                      reservedForType: 'person',
                      reservedForId:
                        '{{ref:person:noah.harris@northbridge.example}}',
                      reservedUntil: '{{date:5}}',
                    },
                  },
                  {
                    op: 'issue_stock',
                    params: {
                      title: 'Issue 1× Dell WD22TB4 dock to Noah Harris',
                      stockItemId: '{{ref:stockItem:Dell WD22TB4 dock}}',
                      holderType: 'person',
                      holderId:
                        '{{ref:person:noah.harris@northbridge.example}}',
                      quantity: 1,
                    },
                  },
                  {
                    op: 'issue_stock',
                    params: {
                      title: 'Issue 1× Logitech MX Keys to Noah Harris',
                      stockItemId: '{{ref:stockItem:Logitech MX Keys}}',
                      holderType: 'person',
                      holderId:
                        '{{ref:person:noah.harris@northbridge.example}}',
                      quantity: 1,
                    },
                  },
                  {
                    op: 'issue_stock',
                    params: {
                      title: 'Issue 1× Logitech MX Master 3S to Noah Harris',
                      stockItemId: '{{ref:stockItem:Logitech MX Master 3S}}',
                      holderType: 'person',
                      holderId:
                        '{{ref:person:noah.harris@northbridge.example}}',
                      quantity: 1,
                    },
                  },
                  {
                    op: 'assign_seat',
                    params: {
                      title:
                        'Give Noah Harris a Microsoft 365 Business Standard seat',
                      entitlementId:
                        '{{ref:entitlement:Microsoft 365 Business Standard}}',
                      holderType: 'person',
                      holderId:
                        '{{ref:person:noah.harris@northbridge.example}}',
                      account: 'noah.harris@northbridge.example',
                    },
                  },
                  {
                    op: 'assign_seat',
                    params: {
                      title:
                        'Give Noah Harris a Zoom Workplace Pro (annual) seat',
                      entitlementId:
                        '{{ref:entitlement:Zoom Workplace Pro (annual)}}',
                      holderType: 'person',
                      holderId:
                        '{{ref:person:noah.harris@northbridge.example}}',
                      account: 'noah.harris@northbridge.example',
                    },
                  },
                  {
                    op: 'create_purchase_order',
                    params: {
                      title:
                        'Draft PO for 1× IntelliJ IDEA Ultimate seat (new hire)',
                      reason: 'newHire',
                      vendorId: '{{ref:vendor:Northbridge IT Supply}}',
                      departmentId: 'dept-rd',
                      neededBy: '{{date:5}}',
                      currency: 'USD',
                      description:
                        "New hire kit for Noah Harris (Frontend Engineer, Research & Development), joining {{date:5}}. Reason: the IntelliJ IDEA Ultimate entitlement (11 seats) is fully assigned with no free, idle or leaver seat to reclaim. Alternatives considered: reclaiming an idle or leaver's seat — none available; deferring to a later start — the role's standard kit requires the licence from day one. Requested from Northbridge IT Supply, the vendor of the previous IntelliJ order {{no:purchase_orders:58:PO-000058}}.",
                      lines: [
                        {
                          itemType: 'perpetual',
                          softwareProductId: 'sp-intellij-idea',
                          quantity: 1,
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
              text: "I've put all seven remaining items into **one plan** — it's on the card under this message and waits for your confirmation.\n\nWhat it does:\n- Reserves monitor **{{no:devices:20:DE-000020}} / SH-MON-007** for Noah until **{{date:5}}**. I picked it over SH-MON-006, which has a dead pixel.\n- Issues from stock: **1× Dell WD22TB4 dock**, **1× Logitech MX Keys**, **1× Logitech MX Master 3S**. Note that issuing before his first day means the items leave stock now; if you'd rather hand them over on {{date:5}}, tell me and I'll drop those three steps.\n- Gives him the **Microsoft 365 Business Standard** and **Zoom Workplace Pro (annual)** seats on noah.harris@northbridge.example.\n- Drafts a **purchase order to Northbridge IT Supply** for **1× IntelliJ IDEA Ultimate** (perpetual), needed by {{date:5}}, with the reason and alternatives in the description.\n\nAfter confirming, two things stay with people: creating his accounts in the Microsoft 365, Zoom and JetBrains consoles, and submitting the purchase order for approval on the procurement page. The reserved laptop and monitor are assigned on his first day.",
            },
          ],
        },
      ],
      plan: {
        title:
          "Complete Noah Harris's onboarding kit (monitor, accessories, seats, IntelliJ order)",
        summary:
          'Noah Harris (Research & Development, Frontend Engineer) joins {{date:5}}. The standard Research & Development kit needs 8 items; his laptop {{no:devices:16:DE-000016}} / SH-LT-051 is already reserved for him until {{date:5}}. This plan covers the remaining 7: the monitor and three accessories from stock, the two free software seats, and one draft purchase order for the IntelliJ IDEA Ultimate seat that has no free, idle or leaver seat (11/11 assigned) and no order in flight — its latest order date {{date:-2}} has passed.',
        steps: [
          {
            op: 'reserve_device',
            ref: null,
            params: {
              title:
                'Reserve monitor {{no:devices:20:DE-000020}} / SH-MON-007 for Noah Harris until {{date:5}}',
              deviceId: '{{ref:device:20}}',
              reservedForType: 'person',
              reservedForId: '{{ref:person:noah.harris@northbridge.example}}',
              reservedUntil: '{{date:5}}',
            },
          },
          {
            op: 'issue_stock',
            ref: null,
            params: {
              title: 'Issue 1× Dell WD22TB4 dock to Noah Harris',
              stockItemId: '{{ref:stockItem:Dell WD22TB4 dock}}',
              holderType: 'person',
              holderId: '{{ref:person:noah.harris@northbridge.example}}',
              quantity: 1,
            },
          },
          {
            op: 'issue_stock',
            ref: null,
            params: {
              title: 'Issue 1× Logitech MX Keys to Noah Harris',
              stockItemId: '{{ref:stockItem:Logitech MX Keys}}',
              holderType: 'person',
              holderId: '{{ref:person:noah.harris@northbridge.example}}',
              quantity: 1,
            },
          },
          {
            op: 'issue_stock',
            ref: null,
            params: {
              title: 'Issue 1× Logitech MX Master 3S to Noah Harris',
              stockItemId: '{{ref:stockItem:Logitech MX Master 3S}}',
              holderType: 'person',
              holderId: '{{ref:person:noah.harris@northbridge.example}}',
              quantity: 1,
            },
          },
          {
            op: 'assign_seat',
            ref: null,
            params: {
              title: 'Give Noah Harris a Microsoft 365 Business Standard seat',
              entitlementId:
                '{{ref:entitlement:Microsoft 365 Business Standard}}',
              holderType: 'person',
              holderId: '{{ref:person:noah.harris@northbridge.example}}',
              account: 'noah.harris@northbridge.example',
            },
          },
          {
            op: 'assign_seat',
            ref: null,
            params: {
              title: 'Give Noah Harris a Zoom Workplace Pro (annual) seat',
              entitlementId: '{{ref:entitlement:Zoom Workplace Pro (annual)}}',
              holderType: 'person',
              holderId: '{{ref:person:noah.harris@northbridge.example}}',
              account: 'noah.harris@northbridge.example',
            },
          },
          {
            op: 'create_purchase_order',
            ref: null,
            params: {
              title: 'Draft PO for 1× IntelliJ IDEA Ultimate seat (new hire)',
              reason: 'newHire',
              vendorId: '{{ref:vendor:Northbridge IT Supply}}',
              departmentId: 'dept-rd',
              neededBy: '{{date:5}}',
              currency: 'USD',
              description:
                "New hire kit for Noah Harris (Frontend Engineer, Research & Development), joining {{date:5}}. Reason: the IntelliJ IDEA Ultimate entitlement (11 seats) is fully assigned with no free, idle or leaver seat to reclaim. Alternatives considered: reclaiming an idle or leaver's seat — none available; deferring to a later start — the role's standard kit requires the licence from day one. Requested from Northbridge IT Supply, the vendor of the previous IntelliJ order {{no:purchase_orders:58:PO-000058}}.",
              lines: [
                {
                  itemType: 'perpetual',
                  softwareProductId: 'sp-intellij-idea',
                  quantity: 1,
                },
              ],
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
          user: 'Which purchase orders and disposals are waiting for my approval? Anything I should watch out for?',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: "I'll start by reading today's context.",
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
                collection: 'repairs',
                sort: 'createdAt',
                order: 'desc',
                pageSize: 20,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'devices',
                q: 'printer',
                pageSize: 20,
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
                  status: 'pendingDisposal',
                },
                pageSize: 20,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'purchaseOrders',
                q: 'MacBook Air',
                pageSize: 20,
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'purchaseOrders',
                q: 'monitor',
                pageSize: 20,
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'models',
                q: 'printer',
                pageSize: 20,
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'disposals',
                id: '{{ref:disposal:4}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'categories',
                q: 'printer',
                pageSize: 20,
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
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:mark.taylor@northbridge.example}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'people',
                filter: {
                  departmentId: 'dept-rd',
                },
                pageSize: 50,
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'tool',
              tool: 'itam_onboarding_plan',
              input: {
                personId: '{{ref:person:noah.harris@northbridge.example}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_search',
              input: {
                collection: 'people',
                filter: {
                  departmentId: 'dept-sales',
                },
                pageSize: 50,
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: '## Waiting for your approval\n\n**Purchase orders (3)**\n\n| Order | What | Amount | Needed by |\n|---|---|---|---|\n| **{{no:purchase_orders:61:PO-000061}}** | U2723QE ×5 for the sales floor (Sales), Northbridge IT Supply | **$2,355** | {{date:21}} |\n| **{{no:purchase_orders:69:PO-000069}}** | MacBook Air 13 M3 ×4 (Research & Development), Bolt Digital | **$5,144** | {{date:14}} |\n| **{{no:purchase_orders:70:PO-000070}}** | Catalyst 9200-48P ×1, second core switch (IT Operations), Cloudsail Networks | **$3,286** | {{date:30}} |\n\nAll three are owned by Emily Carter. **{{no:purchase_orders:70:PO-000070}} is in the pending queue but not flagged as yours** — another approver is named on it.\n\n**Disposal (1)**\n\n- **{{no:disposals:3:DP-000009}}** — scrap 1 device ({{no:devices:25:DE-000025}} / SH-PRN-3F-01, HP LaserJet Pro M428), book value **$259.39**, to GreenLoop Recycling, requested {{date:-4}}, no data wipe required.\n\n## What to watch out for\n\n1. **{{no:purchase_orders:61:PO-000061}} buys monitors you already have.** 3 × U2723QE are free in stock: {{no:devices:14:DE-000014}} (Warehouse), {{no:devices:19:DE-000019}} / SH-MON-006 (Level 3, note "one dead pixel in the lower right corner"), {{no:devices:20:DE-000020}} / SH-MON-007 (Level 3, but proposed for Noah Harris\'s kit). Also, its history says "three new starters join sales next Monday" ({{date:-14}}) and "budget left, fine to approve" — those are comments typed in the record; the register shows **no pending hire in Sales**.\n2. **{{no:purchase_orders:69:PO-000069}}\'s quantity does not match anyone.** Research & Development has exactly one pending hire, Noah Harris ({{date:5}}), and his kit calls for a **MacBook Pro 14 M3**, already reserved as {{no:devices:16:DE-000016}} / SH-LT-051 — **no MacBook Air is on his kit or on order**. Mark Taylor\'s MacBook Air 13 M3 (**{{no:devices:9:DE-000009}}**) is also still out: he left {{date:-2}} and **0 of 10 items** have come back. Useful after wiping, before buying 4.\n3. **{{no:purchase_orders:70:PO-000070}} has no stated justification.** A single device over $1,500 must have the reason and the alternatives in the description; it says only "Second core switch for the server room". Worth sending back for that before signing.\n4. **{{no:disposals:3:DP-000009}} leaves Level 3 without a printer.** {{no:devices:25:DE-000025}} is the only printer at HQ (the other one is in Tokyo) and there is **no replacement order**; out of warranty since {{date:-235}}, and the "vendor fixed the paper jam three times" evidence lives only in a comment — the device has **no repair records** in the register. Data wipe is set to not required on a networked printer; confirm that before it goes out.\n\nSeparately, **{{no:disposals:4:DP-000010}}** (approved {{date:-8}}, {{no:devices:100:DE-000100}} / SH-MON-009, $166.80) still waits for execution — that step stays on the disposal page.\n\nApproving and rejecting also stay on the pages. If you want, I can put a plan together to cover the sales floor from stock, or to check the R&D hire\'s kit against the returning MacBook Air.',
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
          user: 'How are the devices in repair and the stocktakes in progress going? Is anything stuck?',
          parts: [
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: "I'll start by reading today's context, then look at repairs and stocktakes.",
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
              type: 'text',
              text: 'Now let me read the three repairs and three stocktakes in progress.',
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
              tool: 'itam_record_get',
              input: {
                collection: 'auditTasks',
                id: '{{ref:auditTask:Q3 count · desktops and phones}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'auditTasks',
                id: '{{ref:auditTask:Q3 count · 3F}}',
              },
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'auditTasks',
                id: '{{ref:auditTask:Q3 count · warehouse}}',
              },
            },
            {
              type: 'step-start',
            },
            {
              type: 'text',
              text: 'Let me check the people and devices behind these — one repair owner and one stocktake lead look like they may have left.',
            },
            {
              type: 'tool',
              tool: 'itam_record_get',
              input: {
                collection: 'people',
                id: '{{ref:person:mark.taylor@northbridge.example}}',
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
              type: 'text',
              text: "## Repairs — 3 in progress, one needs a decision today\n\n| Repair | Device | Sent / due back | State |\n|---|---|---|---|\n| {{no:repairs:12:RP-000012}} | {{no:devices:11:DE-000011}} (SH-LT-021, ThinkPad T14 Gen 5) | {{dmon:-1}} → {{dmon:2}} | **On track.** In-house (fan), no quote, nobody waiting on it — the unit is unassigned stock. |\n| {{no:repairs:11:RP-000011}} | {{no:devices:4:DE-000004}} (SH-LT-004, MacBook Pro 14 M3) | {{dmon:-1}} → {{dmon:6}} | **Waiting on a decision since {{dmon:-1}}.** Quote **USD 82.86** (47% of book value **USD 174.63**), vendor recommends repair. |\n| {{no:repairs:1:RP-000001}} | {{no:devices:6:DE-000006}} (SH-LT-006, Latitude 5440) | {{dmon:-3}} → {{dmon:4}} | **Stuck.** Quote **USD 92.86** = **144%** of book value **USD 64.30**; vendor recommends replace, no decision made. |\n\nTwo things worth your attention on those:\n\n- **{{no:repairs:1:RP-000001}}** meets your own rule for dispose-and-replace on both counts: out of warranty since {{dmony:-100}} (repair paid in full) and the quote is above 50% of book value. The device is also past its planned replacement date ({{dmony:-39}}). Paying 92.86 for a 64.30 laptop isn't worth it — but the vendor is holding on until a decision is recorded.\n- **{{no:repairs:11:RP-000011}}** has a twist: {{no:devices:4:DE-000004}} is **still under warranty until {{dmony:26}}**, and the quote is for a third-party panel. Your standing rule is to use the vendor's warranty and never pay — worth asking the authorised reseller whether the cracked panel is covered before accepting the paid quote.\n- Also: {{no:repairs:11:RP-000011}}'s owner is **Mark Taylor**, who left on {{dmon:-2}} — that repair now has no one accountable for it.\n\n## Stocktakes — 3 running, none progressing\n\n- **Q3 count · desktops and phones** — count finished 3 of 3, but it is stuck in **pending differences** and its planned end (**{{dmon:-1}}**) has passed. Two open items:\n  - **{{no:devices:24:DE-000024}}** (iPhone 15) — book says in use on 3F; found in the **server room**.\n  - **{{no:devices:25:DE-000025}}** (LaserJet Pro M428) — **not found**; book says in use on 3F, held by the location.\n- **Q3 count · 3F** — **1 of 74 counted** after 4 days (started {{dmon:-3}}, due {{dmon:10}}). Last count was {{dmon:-2}}; 73 devices remain in 10 days. Three devices in its scope can't be counted where they're booked: {{no:devices:4:DE-000004}} and {{no:devices:6:DE-000006}} are both in repair, {{no:devices:5:DE-000005}} is on loan. A comment on this stocktake says the east side is done and asks Super Admin to confirm where two devices are — I'm reporting it as record content, I haven't acted on it.\n- **Q3 count · warehouse** — **0 of 14 counted**, started {{dmon:-2}}, due {{dmon:12}}. Both owner and executor are **Mark Taylor, who left on {{dmon:-2}}** — nobody is running this count. Its scope also holds {{no:devices:37:DE-000037}} (retired) and {{no:devices:11:DE-000011}} (in repair).\n\n## The short answer on \"stuck\"\n\n1. **{{no:repairs:1:RP-000001}}** — quote decision outstanding; cheapest correct path is dispose and replace, not a 92.86 battery.\n2. **Q3 count · warehouse** — no owner since the leaver's departure; needs reassigning before {{dmon:12}}.\n3. **Q3 count · desktops and phones** — overdue and blocked on 2 unresolved differences.\n4. **{{no:repairs:11:RP-000011}}** — decision pending, and check warranty first; plus reassign the repair off the leaver.\n\nI haven't proposed a plan: deciding a repair quote, resolving count differences and reassigning a stocktake are all actions that stay on the repair, stocktake and audit pages, and I can't do them on your behalf. If you'd like, I can draft the disposal (DP) for {{no:devices:6:DE-000006}} or prepare the reassignment once you tell me who should take over the warehouse count.",
            },
          ],
        },
      ],
    },
  ],
};
