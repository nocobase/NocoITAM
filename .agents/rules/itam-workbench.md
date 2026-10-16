# ITAM: workbench, reminders and to-dos

Read this before changing the workbench board, 需要关注, a to-do card or its scope, the status boards, or the scheduled jobs.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

- The page is called 待办, To-dos in English (2026-10-14; it was 工作台 /
  Workbench, and older
  rules and plan entries still say so). Not 任务, which 盘点任务, 定时任务
  and 维护任务 already use. The route `/workbench`, its page grant id and the
  code's `workbench` names are unchanged, so stored page grants still apply.

- Time-driven work lives in `server/providers/itam/maintenance.ts`
  (`runJob('leavers' | 'daily' | 'monthly')`) and is scheduled through the
  scheduler plugin (2026-09-28): `server/providers/itam-schedules.ts`
  registers the `app.itam.maintenance` target and defines
  `itam.mark-leavers` (01:50, before the daily run; 人员在职状态更新 since
  2026-10-06, which also moves 待入职 joiners to 在职 on their first day),
  `itam.daily-maintenance`
  (02:00) and
  `itam.monthly-depreciation` (1st, 03:00) in the ITAM time zone,
  so each execution — status, reason, counts — shows at 设置 → 定时任务
  (page grant `scheduler.schedules`, both IT roles') and can be
  disabled there. The target runs the job inside `start()` and returns
  `completed` / `failed`; there is no application run log (`jobRuns` dropped
  by `202609280001_drop_job_runs`) and no manual run, because the plugin
  offers none. A schedule
  is code: change the cron in the provider, never the plugin's tables. 需要关注
  is **live** (2026-10-05): `reminderCounts()` / `reminders(kind)` in
  `maintenance.ts` run the rules (`collect`) when asked, so the workbench
  says what is true when it is read rather than what was true at 02:00, and
  refreshes with the change signal like the to-dos. Nothing writes the
  `reminders` table any more; it stays only as the Collection 需要关注's
  `read` is granted through. The daily job reports what it did (renewals,
  released reservations, overdue loans notified), not these counts. Test
  the service and the provider's target (`tests/logic/itam-schedules.test.ts`),
  not the clock.
- 需要关注 is a column of **risk cards** (2026-10-05, the workbench board's
  first column): one card per rule that found something — its count large
  and bold, its sentence beside it in a quieter grey, and, lighter still,
  the first few records it found by name
  (`ReminderSummary.preview`, up to three, soonest first for a dated rule,
  used/total for 超量使用 and 低于水位) — worst first, then the biggest.
  The rules at zero come last, each a dimmed row of its own — `0` and the
  sentence, not a card (2026-10-06): `0` is still an answer, it says the
  check ran, and folding them into 其余 N 项都是 0 hid which checks those were.
  Only a `critical` rule is red: severity is the rule's, not today's.
  `REMINDER_GROUPS` (设备, 授权, 库存 — **not** 资产, the umbrella over all
  five kinds) now only orders rules among equals. There are eleven rules:
  低于水位 is three (`lowAccessories`, `lowConsumables`, `lowComponents`),
  each opening its own page, since a cable, a toner and a spare SSD are
  three different errands; 采购到货逾期 is not a rule any more — an overdue
  order is a 待验收到货 to-do, and its card, the purchase board and its
  summary strip say 到货逾期 N 天 (`OverdueBadge`, `daysOverdue` in
  `client/lib/itam/format.ts`). Device sync added two rules on 2026-10-15
  and took them out the same day: 只在 MDM and 只在台账 are counts on the
  MDM 核对 column after 借出逾期 (see `itam-device-sync.md`), so MDM is one
  place on the board, not a column and two risks. Neither 需要关注 nor 待办 carries a count
  beside its heading: a sum of unrelated rules is not something anybody acts
  on.
- An entitlement's dates are three reminders, not one (2026-09-28): a
  subscription that will **charge** (`entitlementRenewing`, auto-renew on,
  monthly ones excluded — twelve notices a year that the same bill is coming
  is noise), one that will **stop** (`entitlementEnding`, auto-renew off),
  and a perpetual licence whose **support** ends
  (`entitlementMaintenance`). They ask for opposite acts, and one line
  saying "renewing or ending" could not say which. `expiringWhere` takes an
  `ExpiryHorizon`; `'any'` is the three together, which is what the
  entitlements page's own 即将到期 statistic counts.
- A reminder must ask for an act. The two cross-record patterns —
  供应商连续延迟交货 and 同批次设备集中报修 — were removed a week after they
  were added (2026-09-28, migration `202609280008_drop_pattern_reminders`,
  taking the `PATTERN_KINDS` split, the 发现的模式 card,
  `ReminderSummary.findings` and four thresholds with them). Each stated
  something true and neither had a next step: a vendor's delivery record is
  read when somebody picks a vendor, which happens in the purchase order's
  own form, and a batch's repair history is read on the model. A standing
  alert nobody acts on teaches people to skip a row, and a list with one
  skippable row stops being read. The vendor rule also could not clear
  itself — it judged the most recent N arrivals with no time limit, so a
  vendor you stopped buying from kept the warning for ever. Both facts are
  worth having as **statistics on the vendor and the model**; that is not a
  reminder. Do not reintroduce either without a new decision in
  `docs/IMPLEMENTATION_PLAN.md`.
- 待办 (it was 我的待办) is **one queue for the whole team** (2026-10-05):
  `GET /itam/workbench/my-work` lists everybody's records on every card,
  so work addressed to somebody away is still seen, and `?scope=mine`
  (the 全部 / 我负责的 switch in the workbench's header,
  `client/lib/itam/work-scope.ts`, remembered per browser) narrows each
  card back to the reader's part by the rules below. A row's buttons keep
  their own rules either way — another person's approval is still only
  theirs to decide — so 待审批 (no longer 待我审批) links to every pending
  request in the team view. The sidebar entry carries no count. The
  queue is **live**: every successful write through `/api/itam`
  (`server/itam-changes.ts`, an application-wide HTTP middleware
  registered in `server/app.ts`), every confirmed AI write and every
  scheduled job calls `itamChangesToken.touched()`, which publishes one
  data-free event on the public realtime topic `itam:changes`
  (`server/providers/itam/changes.ts`, debounced); `useLiveWork()`, mounted
  by the app layout, then invalidates `['itam', WORKBENCH_PATH]` — also
  when the connection reopens, since missed events are not replayed. A
  new way of writing outside those three paths must call `touched()`
  itself.
- With 我负责的, a card is scoped by the rule its own operation enforces, and a
  card may be **narrower** than that rule but never wider: an approver may
  also carry out a disposal (`NOT_INVOLVED`), which is a permission rather
  than their work. Five of the seven are addressed to one person by the
  service itself, so the card can only be that person's — 待我审批 by the
  approval's named approver (`NOT_APPROVER`), 维修中 by
  `repairs.ownerId` (a supervisor may also close one, but it is the
  负责人's work), 进行中的盘点 by
  its 负责人 or its `executorIds` (the one who answers for it, and the
  people who count), 待到货入库 by
  `raisedTheOrder` and 待执行报废 by the same rule on its disposal.
  Showing those to anybody else would be a row with a button that refuses.
- The other two — 离职交接 and 借出逾期 — are **everybody's**
  (2026-10-04), because their act is granted by permission rather than by
  ownership: narrowing them to the thing's `ownerId` was a convention, and
  a convention must not hide work in the inbox of somebody on holiday. Each
  half still asks for **its own act** rather than for `read`, which is the
  weaker test: devices for `return`, stock holdings for `issue` (the grant
  that moves a quantity either way), seats for `assignSeat` and a record to
  hand over for `update`: a permission set with people and devices and no
  归还 would otherwise have seen a card whose every button refuses. Each
  row carries the reader's share instead: `MyWorkRecord.count` where the
  record stands for several (a leaver's holdings — absent, not `0`, when
  none is theirs), `MyWorkRecord.mine` where the record _is_ the one thing
  (an overdue loan), and the loans preview reads the reader's own first so
  a list of everybody's opens on the part that is theirs. The 负责人 is
  still who to ask; it is on the row rather than in the query. Membership
  for a leaver is **anything unsettled** — a device in a status
  `RECOVERABLE_DEVICE_STATUSES` covers (derived from `deviceHandling`, so
  the count agrees with the page it opens), a stock holding, an unreleased
  seat, or a record still naming them through `OWNED_BY_USER`. A record
  counts only while it is **still open**, by that entry's `open` statuses
  (2026-10-05): a purchase order completed two years ago names whoever
  raised it as a fact about what happened, and listing it grew the handover
  half with every document somebody ever filed. An asset declares no `open`
  — a device's 负责人 must be somebody who is here for as long as the
  register holds it. A stocktake is in the list by its 负责人 like every
  other record, not by its executors (2026-10-05): it went in on 2026-10-04
  through its `executorIds` list, which needed a list match and a handover
  that swapped one name in the array, and that machinery went when the
  stocktake got its owner back — the people who count come and go while a
  count runs, and the owner, who is still here, is who notices when one of
  them leaves. A task the leaver only counts on is not theirs to hand over.
  That last
  one closed the hole the owner scope left: a leaver who held nothing and
  owned four records was in nobody's queue, while changing the name on a
  purchase order is its creator's to do and holding a device never made
  anybody that. The owner scope also disagreed with the progress beside it
  — returning one thing emptied the reader's share and the whole person
  left their queue at 已处理 1 / 8.
- There is no 收件箱 / 待办 page any more (2026-10-05): the to-dos are the
  workbench's board, and 通知 opens from a bell in the header
  (`client/components/itam/notification-bell.tsx`, a dot while anything is
  unread, shown by `HeaderActions` only in the app layout). The `/notifications`
  route stays, without a menu entry, so it checks no page grant;
  `reconcile-grants.ts` strips the stored `inbox` and `notifications` page
  grants (`STALE_PAGES`).
- The workbench **is** the to-do board (2026-10-05,
  `client/pages/itam/workbench.tsx`) and nothing else: 需要关注 as the first
  column, then one column per kind of to-do (`useWorkCards` in
  `client/lib/itam/my-work.ts` decides which records and merges the two
  kinds of approval). Each
  column lists up to `MY_WORK_PREVIEW` (50) records as cards that open in
  the record drawer, scrolls on its own and keeps its place when empty —
  dimmed, saying 暂无待办 — because a column that vanishes at zero cannot
  be told from one the reader does not have. There is no greeting, no AI
  shortcut and no device-status or 90-day expiry card: where the devices
  stand is the 概览 report and what expires is 保修与到期 (twelve months),
  read with a period and filters. The workbench answers "what must I do";
  the reports answer "how are we doing".
  A 离职交接 card is a person rather than a document (2026-10-05): name
  with the job right after it, the leave date under them, then a bar of 已处理 N / M — `MyWorkRecord.progress`,
  counted against the newest belongings snapshot exactly as the 归属 tab
  counts it (`handoverProgress` in `workbench.ts`), restricted to the
  kinds the reader may act on. The global search is the sidebar's search button and
  ⌘K; the field beside the workbench's title that also opened it went on
  2026-10-06 — a third way into the same dialog, on one page only.
- The board shows only what is waiting; there is no 已完成 (2026-10-05,
  migration `202610050004_drop_handover_completed`). It had one for a
  day — a column, then a folded list under each column, then a
  `handoverCompleted` event to date a leaver by — and each step added a
  rule for when a to-do counts as finished, which every new kind of to-do
  would have needed too. What it was for is an act's own answer: a row
  that vanishes says nothing about whether the act worked, so the act
  says so. `useAnnounce()` (`client/lib/itam/announce.ts`) rereads
  `['itam']` and shows a success toast — 已归还 / 已收回 / 已将 … 移交给 …,
  and the batch versions — adding, for each person involved who has left
  with a handover under way, 还剩 N 项 or 已全部处理完毕 from the same plan
  their 归属 tab reads (the recovery endpoint returns the person's `name`
  for this). The 归属 tab, the device page's return, the stock holders'
  take-back, the entitlement's reclaim and the device page's holdings
  lists all announce. Looking back is the record's timeline, the
  leaver's settled rows and the reports. Still no to-do table: the to-dos
  are the records' own state.
- `MyWorkItem.records` comes back with the counts: a card is never
  collapsed, so lazy fetching would only make the workbench 1+N requests.
  Each kind's records are read under the decision that its **action** needs,
  which is not always `read`: 维修中 is scoped by `complete` and by
  `repairs.ownerId`, because every IT reader reads every repair and only its
  负责人 finishes one, and a to-do nobody can act on is not a to-do.
- A to-do card and a 需要关注 reminder must not describe the same records:
  the same devices on one screen, once as work and once as risk, read as two
  problems. 借出逾期 (then 设备借出逾期未还) was both, so the `loanOverdue` **reminder** went
  (2026-09-28, migration `202609280006_drop_loan_overdue_reminder`): the card
  answers "which ones" live, from the same query, while a stored row was a
  staler second answer that 需要关注 had to be told to hide. The card has
  listed everybody's since 2026-10-04, which is also what makes dropping
  that reminder whole — while it was scoped to the device's 负责人, nobody
  held the overdue loans as a set, and the 人员 reminder section went the
  same way when 离职交接 became a to-do. The daily job still **notifies** the
  device's 负责人 — only them since 2026-10-05, since a borrower is a person
  in the register, not an account — `notifyOverdueLoans` in `maintenance.ts` runs that query and sends,
  writing no row. What made a notification once-only was never the reminders
  table but the key the notification plugin deduplicates on
  (`loanOverdue:<device>:<date>`), so a rule may leave the reminder layer
  and keep its notification.
- A record listed on a card is tagged with its kind only when its title is
  just a number (采购单, 报废单, 维修单); a device reads 编号 / 名称 and an
  audit task reads its name, so both name themselves.
- 待我审批 is **one card covering two to-dos**: the service keeps
  `pendingPurchaseApprovals` and `pendingDisposalApprovals` separate,
  because each has its own count and its own list and a number can only
  point at one list; the card merges them for display, tagging each record
  采购 / 报废 and, past the preview, linking each kind separately. An
  approval names its subject in the singular (`ApprovalSubject`:
  `purchaseOrder` / `disposal`), which is not the collection a grant is
  asked for — filtering by the collection name matches nothing, silently.
- 待我审批 is one component, `createMyApprovalView` in
  `client/components/itam/my-approval-view.tsx`, given a collection, a list
  path and a label; purchase orders and disposals both mount it as their
  domain's `Views`. Which records are waiting on _this_ reader lives in the
  approval rather than the record, so the list route answers
  `filter[view]=myApproval` by resolving the reader's pending approvals to
  ids (`approvals.pendingFor`) and listing those. A reader who cannot
  approve that kind of request sees no toggle.

## Boards and exports

采购、盘点和报废 open on a board by status (`createStatusBoard` in
`client/components/itam/status-board.tsx`, a domain's `Board`): one column
per status in the order work moves, each paging on its own with the
server's total in its header, cards that open the record. A card has no
labels: its heading and a right-aligned figure (`meta`), a line or two of
what it is about (`lines`, each optionally with an icon that says what the
value is — such a line is a size smaller), and who / when in small muted
text (`footer`), each a field key or a function of the record. A
document's card is one spec (`client/components/itam/board-card-specs.ts`,
drawn by `BoardCards` in `board-cards.tsx`), shared by its board and the
workbench's columns, which read the full rows by id — so a purchase
order, a stocktake or a disposal looks the same in both (2026-10-05). Each card is
its number, then two or three icon lines — a purchase order's amount and
vendor; a disposal's book value, then its method and device count on one line; a repair's
device, fault and expected return (`REPAIR_CARD`, which only the
workbench draws, repairs having no board) — then its 负责人 with the time
it was raised to the minute; a stocktake's lines are its period, how far
the count has got (已盘 N / M 台, or 应盘 M 台 before it starts) and its
differences. A card carries its kind's tag (`BoardCardSpec.kind`: 采购 / 报废 / 维修 /
盘点) on its board and on the workbench alike, a stocktake included even
though its name says what it is: every document card reads the same way. An
overdue loan is drawn from its to-do (`LOAN_CARD`, the 设备 tag through
`BoardCardEntry.badge`): the device, 借给 whom — the server returns the
borrower's name as the record's `subtitle` — and when it was due back.
The workbench's columns run 需要关注 (on a warning-tinted ground, since it
holds risks rather than to-dos), 离职交接, 待审批, 采购中,
待执行报废, 维修中, 借出逾期, 进行中的盘点. 待下单 (`pendingOrders`,
2026-10-05) is the approved purchase orders nobody has placed yet, granted
by `order` and scoped like 待到货入库: without it an approved order sat in
已批准 with nothing on the board asking for it. The two are one column,
采购中, since 2026-10-06 (`purchasingCard` in `client/lib/itam/my-work.ts`):
they follow one order through and are the same people's work. They stay two
to-dos underneath, each granted by its own act, and each card says which
step it is at — its status tag on a line under the vendor, with 到货逾期
beside it when the goods are late (`PURCHASING_CARD` in
`board-card-specs.ts`; the purchase board keeps its own card, its columns
saying the status). Overdue deliveries come first, then the orders to place, then the
rest of the deliveries. In the team view (全部) a
待审批 card addressed to the reader says 待你审批 after the time on its
bottom line — the 负责人 before it is the part that truncates, so a long
name never pushes the time or the marker off the card — (`MyWorkRecord.mine`, from `approvals.pendingFor` asked for the
reader; `BoardCardEntry.marker`); under 我负责的 every card there is, so
none says it, and the column itself is the 待我审批 filter. On the 采购 and
报废 pages the 待我审批 toggle (a domain's `Views`) sits beside the title,
in `PageHeader`'s `aside`, not on a row of its own. The board takes the rest
of the page's height (`Page fill`): columns reach the bottom and scroll
their own cards, so the sideways scrollbar sits at the foot of the page
rather than under the shortest column (2026-10-04; they used to be as tall
as their cards). A column is a light tint of the foreground, because
`bg-muted` is the page's own grey, and its heading is a dot in the
status's colour, its name and its count in a small pill — not the coloured
tag, whose row read as noise. The dots are their own maps beside the tag
tones (`PO_STATUS_DOT`, `AUDIT_STATUS_DOT`, `DISPOSAL_STATUS_DOT`, a
domain's `dots`), since a tag's light fill is no colour for a dot; keep
each in step with its tone map. A board page
drops `Page`'s width limit, and its columns share the width between 15 and
22rem, so as many statuses as fit are on screen and a short board fills
the row; a card's number and figure are its strongest text, its who / when
sits under a hairline (2026-10-05). `?layout=table`
is the list. A named view (`filter.view`: 待我审批, 到货逾期) decides the
statuses itself, so it always reads as the list. Status changes stay the
record's own actions — cards are not dragged, because each step asks for
something (an approver, the order dates).

CSV exports write a reference as the name the pages show — the lookup in
`server/providers/itam/reference-names.ts`, which the AI tools' `…Name`
fields share — and imports accept those names, so an export re-imports.
A collection the caller may not read keeps its ids.

A board's sideways scroller (the status boards' and the workbench's) carries
`scroll-shown` (template 1.0.0-beta.68, `client/styles.css`): every other
scrollbar is thin and shows only while its element scrolls, while a board is
wider than the page and a mouse without a sideways wheel moves it only by its
bar, so that one always shows. Held on its empty space, a board also drags
sideways (2026-10-14, as NocoCRM's does): `useDragPan` in
`client/hooks/use-drag-pan.ts`, spread on the scroller, skips presses on
links, buttons and fields — the cards are buttons — and touch, which keeps
its native swipe. A joiner's card keeps its date and its
countdown each whole (`whitespace-nowrap`, wrapping between them), since the
template's roomier spacing narrowed the column's text.
