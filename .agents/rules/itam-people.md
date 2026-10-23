# ITAM: people, joiners and leavers

Read this before changing who signs in, a person's 归属 tab, offboarding and handover, onboarding kits, joiners' equipment or a leaver's account.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

- Only IT signs in (2026-10-05). Employees are people in the register —
  they hold devices, seats and stock, they leave, their equipment is
  recovered — but not accounts: there is no Employee permission set, no
  我的资产 page, no `itam.assetsIHold` / `itam.myPerson` record access and
  no `filter[view]=mine` on the device list. An IT person has both a person
  record and an account, joined by `people.userId`; an employee's
  `userId` is empty. So every field that names a user names somebody in IT:
  `/itam/users` offers the accounts assigned a permission set that grants a
  business operation of this application (`itam.<collection>`), less
  leavers — not `root`, which holds none, and not a role name or a
  department — while a lookup by `ids` still answers for anybody. A
  purchase order and a disposal therefore name a 负责人 (`ownerId`,
  renamed from `requesterId` by `202610050001_request_owner`), the IT
  person who follows the request through; whoever it is for is its
  department and its description, and the department no longer follows the
  person picked. `reconcile-grants.ts` deletes the stored Employee set with
  its assignments (`REMOVED_SETS`), strips the `my-assets` page grant and
  renames `requesterId` in saved field lists (`RENAMED_FIELDS`). Do not
  reintroduce employee sign-in or self-service pages without a new
  decision in `docs/IMPLEMENTATION_PLAN.md`.
- A person's 归属 tab **is** the recovery table, for everybody (2026-10-04,
  `client/components/itam/person-belongings.tsx`, the route child
  `holdings`). It was three plain lists — devices, stock, seats — with
  nothing to do to any of them, and a 待回收 card above once the person had
  left. The card was the better shape and nothing about it was really about
  leaving: taking a device back from whoever holds it is the same act either
  way, and it was offered only on each device's own page. So the card is the
  tab and leaving adds a line rather than a second list. The tab carries no
  count beside its name. 我的待办's 离职交接 pane renders this component
  alone, not the whole person page: the queue asks what to do, and the rest
  of a person record is not it.
- 入职 is the mirror of 离职, with one difference (2026-10-05): what a
  leaver must hand back is a fact in the register, while what a joiner
  should get is a rule. The rule is **data**, 入职配置 (`onboardingKits`,
  migration `202610050005_onboarding_kits`): one kit per department and
  position — the empty position being the department's default, and a
  department with no kit taking its parent's — whose `items` are a JSON
  list of { modelId | categoryId | softwareProductId, quantity }. Kits have
  **no page of their own** since 2026-10-06: a department's 入职配置 tab
  (`DepartmentKits`, route child `onboarding`, reading
  `GET /itam/master/departments/:id/onboarding-kits`) holds its default kit —
  or says which department above it it takes one from, with a button to
  start its own from a copy — and its **positions** (`departments.positions`,
  migration `202610060005_department_positions`, filled from the people and
  kits already there by the seed `202610060002_…`), each set to 用部门默认配置
  or 自定义配置, which creates the position's kit from a copy of the default
  (switching back deletes it, so it takes `delete` on kits). A person's 职位
  is **chosen from their department's positions** (`positionOf` on the
  field, `PositionSelect`; changing the department clears it), so it is
  spelled the way its kit is attached; one saved otherwise — an import, the
  assistant — joins the department's list (`enlistPosition`), and a
  position still held by somebody in the department cannot be removed
  (`POSITION_IN_USE`), while removing one takes its kit with it. Held or
  not, it can be renamed (2026-10-22, `renamePosition`, `POST
departments/:id/positions/rename`): its holders and its kit move to the
  new name, and another position's name is refused (`POSITION_TAKEN`). A
  kit's changes are told on its department's history
  (`onboardingKitChanged`), and deleting a model, category or product
  takes it out of every kit (`pruneKitItems`). The old
  `onboarding-kits` page grant is stripped (`STALE_PAGES`). Each kit row is
  chosen by asset type (设备 … 授权) and then a model of that type or, for 授权,
  a software product, and shows its asset-type tag first (`KitItems`; the
  picker shows the tags too, and each row adds the next below it — the
  添加物品 button is only for an empty list). A position's own kit is a
  自定义配置 switch, off by default; 改为沿用上级部门 shows only under a
  parent and asks first, since it deletes the department's kit. A department
  has no code or cost center (dropped 2026-10-06,
  `202610060006_drop_department_code_cost_center`: nothing read them; an HR
  or finance sync would be the decision to bring them back), and
  `RENAMED_FIELDS` in `reconcile-grants.ts` maps a dropped field to `null`
  to strip it from saved field lists. One per department and position is
  enforced by scoping the department within the position
  (`UNIQUE_SCOPES`), since an empty value is skipped. The arithmetic is
  **deterministic**, `server/providers/itam/onboarding.ts`: what the person
  holds or has reserved counts first, each thing towards one item; the rest
  is proposed from stock — a device in stock and unreserved, the person's
  own location first, then the longest warranty; a stock item with enough
  on hand; an entitlement with a free seat (an ended subscription offers
  none, and a subscription seat is proposed under the person's e-mail as
  its account — with no e-mail it cannot be assigned from the card) —
  and what an **open 新员工配备 order** for their department and joining
  day still has to deliver counts as `onOrder` (the plan lists those
  `orders`), so asking again never orders the same laptop twice; what is
  left is the shortfall. **Every joiner is worked out together**
  (2026-10-06, `allocate`; `plan(id)` is one joiner's slice of it,
  `plans()` all of them): earliest first day first, then whoever was
  entered first, each taking from shared pools, so two joiners are never
  proposed the same laptop, the last mouse or the last seat. What stock
  cannot cover is **planned** (`OnboardingPlanLine.planned`, each with a
  `supply` saying where from and from when, and no button): first an order
  bought for them, then any other order placed (`ordered` /
  `partiallyReceived`, so it has an `expectedAt`) whose goods are made ready
  by the joining day, then the devices and seats of people with a leave date
  (from that date, a device plus `onboardingPrepDays`, and not one due for
  replacement or out of warranty by then). A joiner already started counts
  only on what is here today. A shortfall carries `orderBy`, the joining day
  less the preparation days (devices) and `purchaseLeadDays` — both in
  提醒阈值, 3 and 7 by default. Nothing is held by a plan: it is recomputed
  on every reading and only a reservation commits. Devices in repair are not
  counted. 入职供需 (`/onboarding-supply`, linked beside the
  heading of the workbench's 入职准备 column, no menu entry and no page grant; `GET
/itam/workbench/onboarding-supply`, people `read` and devices `reserve`)
  is one row per joiner (2026-10-22): date, progress, 缺 / 在途 / 归还
  counts (缺 red once a last order day has passed, orange before), and under
  it only the lines not taken straight from stock — short, with the last day
  to order and 起草采购单 for that item, or coming on an order or back from a
  leaver. 起草采购单 above the list drafts for every shortage. A 需要采购
  card listing the shortages across joiners stood above it for the day and
  was removed as a repetition; listing every line repeated each joiner's
  入职配备 card. The demo shows all three sources: stock, an Adobe seat on
  a placed order, an IntelliJ seat and a test iPhone short. 全部执行 carries on past a refused item and
  names each refusal, and its toast counts what went through.
  `GET /itam/master/people/:id/onboarding` returns it; it writes nothing.
  The 归属 tab of an active person whose 入职日期 is ahead or within the
  last 30 days opens on 入职配备 (`OnboardingPlanCard`): the kit, 已配备
  N / M, and one button per proposal through the operation that already
  exists — 预留 until the joining day while they have not started, 分配
  once they have, 领用, 分配席位 — with 全部执行 running them in order.
  The card's only AI is 挑选 / 重新挑选 in its strip. The header's 准备
  (配备计划), a chat that proposed the plan 全部执行 already runs, was
  removed on 2026-10-22.
- 起草采购单 (beside the card's 缺 N 项需采购, and on 入职供需) opens the
  purchase order's own create dialog filled in (2026-10-22;
  `DraftOrdersButton`, `POST /itam/purchase-orders/joiner-proposals`,
  `proposeJoinerOrders` in `onboarding-orders.ts`, which creates nothing):
  新员工配备, needed by the joining day, their department, the vendor each
  item was last bought from (empty where none was), a line per item short.
  Several proposals — another vendor, another joiner — follow one another
  as 第 1 / 2 张; what was saved opens in the drawer at the end. Per joiner,
  not merged across them: the plan counts an order as a joiner's own only by
  department and needed-by date (`ownOrders`), so a merged order would be
  proposed again. A kit item naming a category is left out and said in the
  toast. It asked Asset Steward in the chat, then drafted straight away,
  the same day.
  The workbench's 入职准备 (`pendingOnboarding`, right after 离职交接) lists
  **joiners** — people entered in the register no more than 30 days before
  their first day (`isJoiner`; staff entered long after they started, such
  as a whole register imported at go-live, are not measured against a kit)
  — however far off their first day, or started, for as long as their kit
  is not all in hand (`isPrepared`: each item held, reserved or marked
  不需要; with no kit, while no device is held or reserved), granted by
  `reserve`; each card says how far off the day is (还有 N 天 / 今天入职 /
  已入职 N 天). Until 2026-10-06 it took only those starting within 14
  days, so a joiner entered a month ahead sat on nobody's board. An item the
  joiner will not be given — their own monitor, another laptop — is marked
  **不需要** on the 入职配备 card (`POST /itam/master/people/:id/onboarding/
waive`, people `update`, `people.onboardingWaived`, migration
  `202610060003_joiner_status`): nothing is proposed, ordered or chosen
  for it, it counts on neither side of 已配备 N / M, and taking the mark
  back (撤回) reopens the joiner. Once in hand a joiner is stamped
  `onboardingCompletedAt` and not worked out again, so the register's
  history of joiners is not recomputed on every reading; the card steps
  aside once they are equipped and a month in. 在职状态 is the two dates
  (`employmentFor`): **待入职** (`pending`) before the first day, 已离职
  once the leave date has come, 在职 otherwise; it is off the create form,
  every person picker offers anybody not 已离职 (`employmentStatus:ne`),
  and the people import no longer sends a status of its own, which made
  every row of it fail. A joiner has a **入职负责人** (`people.onboardingOwnerId`,
  2026-10-06, migration `202610060001_person_onboarding_owner`): the IT
  person who gets them equipped, starting at whoever enters the person
  (people entered before stay empty), editable beside 入职日期. Under
  我负责的, 入职准备 is the joiners whose 入职负责人 the reader is; and a
  leaving IT person's handover list includes the active joiners they own
  whose joining day is ahead or within 30 days (`OWNED_BY_USER`'s new
  `since` condition), not every person they ever entered. Each proposed
  device on the 入职配备 card has 更换: a picker of devices of that model
  (or category) in stock and held for nobody, and the chosen one is what
  预留, 分配 and 全部执行 act on. The seeds write a kit per department (the ones the AI business
  notes describe) and a designer's in Product; the demo adds two joiners.
  Choosing which device is the service's, never the model's. The AI side
  is the `onboarding` skill (`ai/skills/onboarding/SKILL.md`): Asset Steward reads
  the plan with `itam onboarding plan` (under the user's people grant),
  explains it, and proposes exactly its proposals as one plan — a
  `reserve_device` step (granted by `reserve`, until the joining day)
  before they start, `assign_device` after, `issue_stock`, `assign_seat` —
  with one 新员工配备 `create_purchase_order` for the shortfall, asking for
  the vendor, which is why that step is Asset Steward's and not a button (`itemType`
  on each plan line says what the line would be bought as). The 入职配备
  card's AI shortcut (准备) asks with the person pinned. A seat proposed to a
  person always names them as holder: the seat card shows 持有人 even when
  empty (`always` on the card's row), since an account-only subscription
  seat looked complete on the card while it belonged to nobody (found
  testing 2026-10-05). The kits are no longer
  listed in the seeded AI business notes, which point to 入职配置.
- A leaver's **sign-in goes with them** (2026-10-05,
  `server/providers/itam/leaver-accounts.ts`): marking somebody as left
  marks a person, not an account, so a sign-in the person record links went
  on working until somebody remembered it. It is disabled, and its sessions
  revoked, at the moment the person becomes 已离职 — 标记离职, a leave date
  entered in the past, or the nightly job reaching it — and re-enabled when
  the leave is undone, but only if leaving is what disabled it (the
  `accountDisabledOnLeaving` / `accountRestoredOnReturning` events on the
  person are how it knows; an account an administrator disabled for a
  reason of their own stays disabled). It goes through the users plugin's
  **management** service, never the account service beneath it, because
  only the management layer asks authorization whether the account may go —
  `assertSubjectRemovable` refuses the last active holder of the root set
  (`requireActiveAssignment`), so marking an administrator as left can never
  lock the platform out. It never disables the reader's own sign-in, which
  they could not then undo. And it runs after the transaction that changed
  the person committed — `createMasterDataService` takes it as `leavers` and
  calls it after each of the three — because the users plugin opens a
  transaction of its own and SQLite has one connection. The recovery
  endpoint returns `account` (name, username, `disabled`,
  `disabledOnLeaving`, and `canDisable` from an `authorize` on
  `{ type: 'user', id }` / `disable`); the 归属 tab opens on it — a settled
  line when leaving disabled it, an `Alert` linking to 设置 → 用户 (or
  naming the platform administrator, for a reader who may not) when it did
  not: the last administrator, the reader's own account, or somebody who
  left before this existed. The offboarding skill says the same.
- The 归属 tab takes things back **in batches** (2026-10-05): a box on
  every row whose own button would act now — not a device at the repair
  shop, a consumable to confirm or a settled row — and on every record
  still to hand over, with a select-all in front of each list. Ticking shows
  a bar with the one act (批量收回 / 批量移交). A batch is the row's own act
  performed once per ticked row, through the same endpoint, so each meets
  the rules it would alone: devices take the return dialog's answers once
  for all of them (`DeviceReturnDialog` takes a `title`, `description` and
  lead-in for this), stock is taken back in full, seats go one request per
  entitlement, and records are each PATCHed to the one new owner. A row
  that fails stays ticked with the service's reason in the dialog, while
  the rest settle; pressing again retries exactly those. This is the
  application's first multi-select — `DataTable` gained `rowKey` for it,
  after the tab's earlier rewrite of `id` into a key leaked into the seat
  reclaim's request.
- Every row is read from the **live record**, and the snapshot is only the
  denominator (`belongingsSnapshot`, a history event written on every
  transition into `left` — the button, an update whose date derives it, and
  the nightly `markDueLeavers`). It stores identities, never fields: a
  returned device is in stock and a stored copy of its status would be a
  staler second answer, so `belongingsSnapshot(id)` rebuilds each row from
  the record and falls back to the payload only for one since deleted.
  Progress is the snapshot's size, which is why the list keeps settled rows
  instead of shrinking — a count of five that becomes a count of two says
  nothing about which three. Settled means **no longer in their name**,
  which correctly covers a transfer, a scrapping and a device marked lost.
- A settled row says 已处理 and nothing else (2026-10-04): not 已归还 /
  已回收 / 已移交, because the column answers one question — is there still
  something for me to do about this one — and the answer is the same however
  it left. It also drops the device status and the 负责人 that the open rows
  carry: both exist to say whether the thing can be taken back and who to
  tell, and a settled row has neither question, while reading them live made
  them drift (a returned device assigned to a colleague changed the 负责人 on
  a row about somebody who left weeks ago). Which act it was is read on the
  record, a click away. The share clause names the unsettled rows out loud —
  其中未处理的 N 项由你负责 — because the sentence it hangs off introduces
  the whole snapshot while the count has always covered only what is left.
- Somebody who has left is not offered as a 负责人: `leftUserIds()` in
  `server/routes/itam/users.ts` drops them from every picker, beside the
  rule that a picker offers only accounts holding an `itam.*` operation.
  Asked with `ids` the endpoint is a **name lookup** instead and answers
  regardless, like the approver lookup — a record already naming them must
  still read back, or the row that needs handing over cannot show whose it
  is.
- Resolving a holder's **name** is not checking whether they may **receive**
  something (2026-10-05). The two were one function, so the rule about
  handing things out refused the taking back that shares the lookup: 归还 on
  a leaver's accessories was refused with "cannot issue to a person who has
  left", from the button trying to collect them; reclaiming their seat logged
  a bare id because the caller swallowed the same refusal to get a label; and
  changing that seat's key failed outright. Stock has `holderRow` (the holder
  must exist, whichever way the goods go) beside `requireIssuable`, and seats
  have `holderLabel` beside `requireAssignable`. Devices were always right —
  `assertTarget` is reached only by assign, loan, transfer and reserve.
- `OWNED_BY_USER` and the recovery handlings live in
  `server/providers/itam/recovery.ts`, which is the shared home for
  offboarding knowledge: the 归属 tab lists from it, master data snapshots
  from it, the nightly job notifies from it and the workbench decides
  membership from it, and none of those owns the others. Every record in it
  names its person through `ownerId`; handing a purchase order, a disposal
  or a stocktake over hands its card over with it.
