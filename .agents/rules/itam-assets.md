# ITAM: asset types and their operations

Read this before changing devices, stock items, entitlements, stocktakes, repairs or disposals, or naming anything about assets.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

- Naming is precise on purpose: 资产 (asset) is the umbrella for the five
  asset types, so the individually tracked item is a device everywhere —
  the `devices` table and `deviceId` / `deviceNo` columns, the `devices`
  service and `/itam/devices` routes, the `device` value of `appliesTo`,
  `assigneeType`, `holderType` and the allocation subject / target types,
  the `devices` collection in permission grants, history and reminders.
  Only umbrella names keep "asset": the 资产 navigation group
  (`assetsGroup`). Category `appliesTo` values are `device` /
  `accessory` / `consumable` / `component` / `entitlement`; the labels
  (设备 … 授权) live in the locales.
- A stock movement says where the goods came from, and the opening
  movement of a new item is no exception: `insertItem` marks it `created`
  only when the caller named no source, so an item first stocked by
  receiving a purchase order keeps that order (its 来源 links the order,
  and `/itam/stock/:id/purchases` and the unit price read back through it
  — stamping `created` filed the arrival as a manual entry).
- Stock items carry no purchase fields (vendor, price, currency, date,
  order): each batch may come from a different order, so
  `/itam/stock/:id/purchases` reads them from the purchase receipts through
  the order and its line, and `stockUnitPrices()` gives reports a
  quantity-weighted unit price. Manual stock-in records no purchase; goods
  bought through an order arrive by receiving that order.
- There is no ticket / service-desk module (removed 2026-09-19, migration
  `202609190004_drop_tickets`): the application is an asset register, and
  requests reach IT through an external ITSM or directly on the asset.
  Repairs, disposals and purchase orders are created from the device, list
  or their own pages. Do not reintroduce a
  `tickets` collection or employee request pages without a new decision in
  `docs/IMPLEMENTATION_PLAN.md`.
- There is no contract module either (removed 2026-09-25, migration
  `202609250006_drop_contracts`): signed terms live in the legal or
  contract system, and what the register needs from them is on its own
  records — a device's warranty end, a subscription's renewal date and
  price. Purchase orders stay and carry no contract. The seeds grant
  neither tickets nor contracts, so a data reset leaves nothing for
  `reconcile-grants.ts` to strip; it still strips them from sets saved
  before. Do not reintroduce `contracts` / `contractCoverages` without a
  new decision in `docs/IMPLEMENTATION_PLAN.md`.
- There is no device discovery either (removed 2026-09-27, migration
  `202609270004_drop_discovery`): it only reconciled a CSV exported from an
  MDM or scanner by hand, so a device's last-discovered time and the
  "in use but not discovered" reminder said when someone last remembered to
  export, not when the device was seen. Gone with it: the `/discovery` page,
  `/api/itam/discovery/*`, `discoveryImports` / `discoveryCandidates`,
  `devices.lastDiscoveredAt`, the `notDiscovered` reminder, the `discovery`
  settings section and the `discoveryNormalization` AI capability. A match
  used to copy hardware details into a device's `attributes.hardware`; those
  stay as facts about the device. Do not reintroduce discovery without a new
  decision in `docs/IMPLEMENTATION_PLAN.md` — a live MDM / Intune connection
  would be that decision, not a CSV page.
- Stock items (accessories, consumables, components) link to purchase orders
  and nothing else: no repair order (`repairs.device_id` is a device), no
  disposal (`disposal_devices` holds devices), no audit task (`AuditScope`
  counts devices). Confirmed 2026-09-24; see the decision in
  `docs/IMPLEMENTATION_PLAN.md`. A device's disposal still returns its
  installed components to stock, as a movement whose source is that disposal.
  A quantity is corrected by 调整数量 (`POST /itam/stock/:id/adjust`,
  `stock.adjust`, 2026-09-28): a signed quantity, a reason from a list that
  follows the direction (`STOCK_GAIN_REASONS` / `STOCK_LOSS_REASONS`,
  stored in `stockMovements.reason`) and a note, required for `other`; one
  `adjust` movement, authorized as `update` like an entitlement's
  调整席位; a decrease stops at what is in stock — what a holder has is
  taken back first.
- A renewal is decided on two counts (2026-10-17, in place of the 授权续费
  agent): seats in use against seats bought, and seats people who have
  left still hold. 需要关注's renewing, ending and maintenance cards show
  both on each entitlement (`ReminderPreview.figures` and `leavers`,
  `leaverSeatCounts` in `entitlements.ts`); the seats API marks a seat
  whose holder has left (`holderLeft`), the 席位 tab tags it 已离职, and
  the entitlement page's notice offers 全部收回 for those seats while any
  is held. There is no usage data to weigh beyond that (dropped
  2026-09-25).
- Software entitlements are one collection, `entitlements`, with
  `kind = perpetual | subscription` (merged 2026-09-20, migration
  `202609200002_merge_entitlements`); seats live in `entitlementSeats`
  (`holderType` person / device, `holderId` nullable, `account` for
  subscriptions); there are no bills (dropped 2026-09-25: the cost is the
  estimate from unit price or cycle cost, spend is finance's) and no
  business owner beside the record's owner. There is no `licenses`
  or `subscriptions` table, service, route or page: kind-specific rules
  live inside `server/providers/itam/entitlements.ts`, and the client
  shows kind-specific fields through `visibleWhen` on one field list.
  Purchase lines use
  `itemType = perpetual | subscription`, reminders
  `entitlementExpiring` / `entitlementOverAllocated`.
  `reconcile-grants.ts` strips the old collection and page grants at
  start-up (also the never-built `tags` / `deviceTags` tables, dropped by
  `202609200007_drop_tags`, and the software install records nothing fed,
  dropped by `202609200008_drop_software_installs`: the application does
  not scan devices, so compliance compares seats with assignments only).
  Seat usage is not tracked
  either (decided 2026-09-25, migration `202609250001_drop_seat_usage`):
  no last-used date, no usage import, no "unused seats" view, and
  `reconcile-grants.ts` drops every stored `itam.*` grant on an operation
  `collections.ts` no longer declares (`DECLARED_OPERATIONS`) — the plugin
  skips such a grant with a warning and throws at a development start. `idleSeatRatio` stays because the 闲置
  compliance status counts unassigned seats, not usage. Like stock items, an entitlement carries no purchase order,
  price or contract (migration `202609200003_drop_entitlement_purchase_fields`):
  receiving an order line either creates one or adds seats to an existing
  one (`entitlementId` on the receive input, `receiveWithin`), the
  receipts are its purchase history (`/itam/entitlements/:id/purchases`,
  `entitlementPurchaseCosts()` for reports). A perpetual entitlement never expires; only its
  maintenance does, so fixed-term licenses are subscriptions. Category and
  manufacturer follow the software product (`fromProduct` on create and
  product change; never edited directly), the way a device's follow its
  model; there is no vendor, price, contract, data-region or sensitive-data
  field on the record. The receipts show in its 采购单 tab. A subscription has one price, `unitPrice`,
  read per seat per cycle (`perSeat`) or for the whole cycle (`flat`):
  there is no cycle cost and no usage model (migration
  `202609250004_single_subscription_price`), and `annualCost()` is the only
  formula. Any billing model may state a seat count; `seatsRequired()`
  says when it must. A subscription is dated by one field, `expiryDate`
  (next renewal date), and `autoRenew`: on, `advanceRenewals()` rolls a
  passed date forward by whole cycles each day; off, the date is the end
  and an ended subscription still holding seats raises `entitlementEnded`.
  There is no renewal decision, no term start and no renew operation
  (migration `202609250005_subscription_auto_renew`, decided 2026-09-25).
- A stocktake has a 负责人 again (2026-10-05, `202610050002_audit_owner`),
  beside the executors who count. It lost the field on 2026-09-27
  (`202609270002_drop_audit_owner`) because it was nearly always the
  creator and nothing on a stocktake was ever handed over; offboarding made
  the second half false, and the creator — stamped once — could not be
  handed over at all. It starts at whoever creates the task (the create
  dialog asks, starting at the reader), is editable while the task is open
  (the page's rule is only that it is not finished or called off), and is
  what 进行中的盘点 and the leaver's handover list read. Existing rows took
  their creator.
- Taking a disposal back makes it a draft again, the way a purchase order's
  withdrawal does — there is no `withdrawn` status (dropped 2026-09-27,
  migration `202609270001_drop_disposal_withdrawn`), and the timeline is
  what says it was withdrawn. So a disposal is editable and deletable in
  `draft`, editable and submittable again in `rejected` (重新提交审批), read
  only in `pendingApproval` (withdraw first), `approved` and `executed`.
  An approved one is not frozen whole, though: what the decision did not
  reach — the recipient and the data-wipe answer — stays editable until it
  is carried out (`EDITABLE_STATUSES` / `SETTLED_EDITABLE` in
  `disposals.ts`, `approvedDisposal` on the fields the decision did settle).
  Carrying it out belongs to the people the request went through — the side
  that raised it, or whoever was asked to decide or decided (`NOT_INVOLVED`,
  the same rule as cancelling a purchase order) — and the execution names
  who did it (`executedById`, defaulting to whoever pressed the button),
  the date, the proceeds (any method may bring something in), the cost with
  its currency and what became of the data.
- A disposal states how it will be carried out when it is created — 接收方
  (供应商 / 名称), 数据清除, 清除方式 — beside who follows it through
  (负责人, required, starting at whoever is filing it) and what is being
  scrapped (报废设备, straight after 报废原因). They are ordinary fields of an
  open disposal, not lifecycle ones: `update` already refuses anything past
  `draft` / `withdrawn` / `rejected`, so they change only while the request
  is open, and `execute` keeps what it does not mention. 处置日期 / 收入 /
  支出 / 执行人 wait for the execution. The recipient is one
  party named one way — a vendor on the books (接收方（供应商）) or a typed
  name (接收方) — so answering one hides the other on every form, the
  service refuses a write that states both, and naming it the other way at
  execution replaces it. It is one question everywhere, including the
  record's own page: 接收方 is a single row whose editor asks 供应商 or
  其他 first (`alternateField` on the field, `RecipientInput` behind it),
  and `recipientName` is only its other half — never a row or an editor of
  its own. 数据清除 is required (every disposal answers 已清除 / 未清除 /
  无需清除, so the select offers no empty choice) and 清除方式 is its
  `dependent`: the two edit as one cascading control and save in one write,
  so 已清除 can never be stored without a method — `update` and `execute`
  both refuse that pair. 执行人 is never asked for in advance — it is
  whoever executed it — and it means who carried out the **disposal**, not
  who wiped the data; the wipe is described by 数据清除 / 清除方式 alone. A stored grant written
  before these were request fields refuses the form with a bare "Not
  allowed", so `reconcile-grants.ts` adds them to the stored policies
  (`ADDED_FIELDS`, which covers `read` as well as the writes) — the seeds cannot, they only add whole resources.
- A repair is filed under a kind of fault (`faultCategory`, 2026-10-17,
  migration `202610170003_repair_fault_category`, optional): screen,
  keyboard, battery, power, storage, network, system, peripheral,
  physical, other — `REPAIR_FAULT_CATEGORIES` in `repairs.ts` and
  `operations.ts`, which must agree. The new repair form
  (`RepairCreateDialog`, from the device page and, as `Create`, the repairs
  list) says above its fields, without a model, the device's warranty, age,
  book value and repair count, and starts a device under warranty as a
  warranty repair to its own vendor; it asks for the fault first, with
  诊断 — 维修单整理 — right under it (2026-10-20)
  (see `itam-assistant.md`).
- A repair belongs to its 负责人 (`ownerId`, 2026-09-28, migration
  `202609280005_repair_owner`): it starts at whoever files the repair and
  may be reassigned. **Its 负责人 completes it — or a supervisor**
  (2026-10-05): whoever may clear a repair away, i.e. holds `delete` on
  repairs (the asset manager and root), may also close one somebody else
  follows, so a repair whose 负责人 is away or has left is not stuck until
  it is handed over. The route decides it (`maybeDecide(…, 'repairs',
'delete')`) and passes `supervises` to `complete`; `requireOwner` refuses
  anyone else with `NOT_OWNER`. IT support holds `complete` and not
  `delete`, so it finishes only its own. **Deleting is the grant's alone**:
  only the same supervisors hold `delete`, so the owner check that used to
  sit there would only refuse what the grant allowed. That is why the
  `complete` and `delete` grants are no longer `recordsICreated`: a
  record-level scope cannot express "may be handed over". `reconcile-grants.ts` strips that
  stale scope from saved sets through `UNSCOPED_OPERATIONS` /
  `UNSCOPED_ACTIONS`, dropping only a scope that **narrows** — `allRecords`
  is what the seeds themselves write, and rewriting it would make a freshly
  seeded database reconcile on every start-up.
- A count answers with one of three buttons — 一致 / 未找到 / 有差异 — and
  the one it answered with is filled in, green for 一致 (`--success` in
  `client/styles.css`, the token every preset carries). A device can be in
  the wrong place, with the wrong holder and in the wrong status at once, so
  there is one `mismatch` result rather than three (merged 2026-09-27,
  migration `202609270004_merge_audit_differences`) and the item's own
  actual location, holder (with its kind, like the booked one) and status
  say what differs. Resolving it is `updateToActual`, which writes every
  recorded value back. A difference must differ in everything it states:
  the service refuses any counted value that repeats the books, and one
  that records nothing at all; the dialog marks the offending row and says
  why the save is not offered.
  Finishing a task marks everything uncounted as not found, so the button
  only appears once nothing is uncounted. The line above the items reads
  进度 / 盘点结果 / 设备 — counts that filter, results that filter, and a
  box that narrows as it is typed — all client-side, so the counts stay
  true while the view narrows.
- Each audit result has exactly one way of being settled — 有差异 →
  `updateToActual`, 未找到 → `markLost`, 账外 → `register` — so the resolve
  dialog offers that one as its confirm and 标记不处理 (`markVerified`)
  beside it, with no list to pick from. `updateToActual` writes every value
  the count recorded, and passes the counted location into the assignment:
  assigning a device moves it to its holder's place unless told otherwise,
  which would undo the location the same count recorded.
- An entitlement's seats tab is a state table (who holds a seat now), not a
  movement log, and the history tab carries what happened. Stock is the other
  way round (`historyTab: false`) because a stock item's whole life is in and
  out; an entitlement's is not. Confirmed 2026-09-24 — do not "unify" the two
  without a new decision in `docs/IMPLEMENTATION_PLAN.md`.
- An entitlement's seat count is stated when it is created and never edited
  afterwards: the field is read-only on the detail page
  (`readonlyWhen: values.id !== undefined`), and the count moves through
  receiving a purchase order or the 调整席位 operation
  (`POST /itam/entitlements/:id/adjust-seats`, `adjustSeats`), which takes a
  signed quantity and a reason and writes a `seatsAdded` / `seatsRemoved`
  event. It is authorized as `update`, because that is the grant that used to
  edit the field. Seats already held are the floor — reclaim before reducing —
  and an entitlement that counts no seats (site, free, a subscription not
  billed per seat) refuses the operation. This is the stock model applied to
  seats: a quantity nobody can edit, changed by operations that say how many
  and why (decided 2026-09-24).
- Extended fields belong to every asset type, not only devices (2026-09-28,
  migration `202609280002_stock_entitlement_attributes`). A category carries
  a `fieldTemplate` whatever it applies to, and the editor on its page has
  always offered one — but only `devices` had an `attributes` document to
  put the answers in, so a template on an accessory or software category
  described fields nobody could fill. `stockItems` and `entitlements` now
  carry the same document, and `ExtendedFields`
  (`client/components/itam/extended-fields.tsx`) renders it under 基本信息 on
  the generic detail page the way the device page does — and renders
  **nothing at all** when the category defines none, because an empty
  扩展字段 heading says less than no heading. Adding a field to a Collection
  is not enough on its own: every stored grant states an explicit list, so
  `ADDED_FIELDS` in `reconcile-grants.ts` is what an existing database
  learns it from.
- **A serial belongs to one device** (2026-10-16): create, batch create,
  receiving and edit refuse a serial another device has, compared as MDM
  matching compares them — trimmed, ignoring case (`normalizeSerial`) — and
  across makers (`serialTaken` in `devices.ts`); a placeholder serial is no
  serial. It was an exact match within one maker, so a lower-case copy got
  in. Serials two devices share from before are still MDM's `ambiguous`.
- **A new device starts 库存中, 使用中 or 借出中** (2026-10-16): 创建设备
  asks for the status, then where it goes — 使用中 to a person, a place or
  another device (去向类型, 去向), 借出中 to a person (借用人) until an
  expected return date, as the 分配 and 借出 dialogs allow — then the
  负责人; sent as `assignTo` / `loanTo` with
  `POST /itam/devices`, the service assigns or loans in the create's
  transaction (`create(…, start)`, which also takes that action), so a
  refused one leaves no device. Other statuses need more (a repair order,
  a disposal) and stay the device page's acts. Longer record forms are
  two fields to a row by default (`RecordFormDialog`, more than four
  fields).
- **A model fills its category's extended fields too, as the defaults its
  new devices start with** (2026-10-06, migration
  `202610060004_model_attributes`, `models.attributes`). Every template field
  shows on the model page and in the create dialog (right after the
  specification once a category is chosen, together under 扩展字段 on a
  tinted ground — `section` on `RecordFormDialog`), and AI 整理 fills them,
  each held to its type by `/capture/match` (a select only to one of its
  options); its specification leaves out what a field already holds.
  Creating a device copies the model's values into the device's own
  `attributes`, with whatever the caller states winning
  (`buildCreateValues` in `devices.ts`, so the page, batches, receiving, CSV
  import and audit registration all do it); from then on the two are edited
  separately — upgrading one laptop's memory does not change its model, and
  correcting the model changes no device already made. There is no live
  inheritance and no per-field 填写位置: a first version had both (a
  `scope: 'model'` on template fields, devices reading the model's value until
  they stated their own) and was dropped the same day as more than the
  register needs; the migration's comment still describes it, since an
  applied migration is not edited. Software products keep no values.
- The device list has a board beside its table (2026-10-22, `DeviceBoard`
  in `client/pages/itam/devices/devices-list.tsx`, `?layout=board`; the
  table stays the default): a column per state a device is in while the
  company has it — 库存中, 使用中, 借出中, 维修中, 待报废, 已丢失 — through
  the shared `createStatusBoard`. A card is the device's number / name,
  model, and who has it, or where it is kept while nobody does. The status
  tags are all light tints: 使用中 green, 待报废 grey with 已停用 and 已报废,
  red only for 已丢失.
