# ITAM: purchasing, receiving and approvals

Read this before changing purchase orders, their lines, receiving, approvals or a request's 负责人.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

- **The order's state moves through its lifecycle** (2026-10-19,
  `server/lifecycles/purchase-orders.ts`, see the record lifecycle in
  [itam-foundations](itam-foundations.md)):
  submit, withdraw, approve / reject, order, `receivePartly`, `complete` and
  cancel are transitions fired in the service's transaction. Receiving fires
  only when the lines change where the order stands — the first delivery
  (`receivePartly`) and the last (`complete`); more of an order already partly
  received fires nothing. Who may submit, decide and cancel is the
  transitions' guards; ordering and receiving stay with the grant. The approver
  and the owner are told through retried effects.
- Receiving's `extra` accepts only what the receipt dialog asks for each
  line type (`RECEIVE_EXTRA` in `procurement.ts`), because it is laid over
  what the order settled; and a purchase line's `itemType` must be its
  model's category kind (`setLines`).
- A request belongs to its 负责人, or to whoever wrote it before handing it
  over. A purchase order's `update`, `setLines`, `submit` and `withdraw`
  all call `requireOwner` (`NOT_OWNER`, the repair's rule name), and a
  disposal's `submit` and `withdraw` do the same.
  Holding the grant is not enough: the permission set that grants `update`
  and `submit` also grants `approve`, so without the check an approver could
  rewrite or file a request instead of deciding it. The one write it does
  not cover is **handing the request over**: a write of `ownerId` and
  nothing else (`onlyHandsOver`) is taken from anybody who may update the
  record, in any open status — waiting for a decision and approved
  included — and refused once it is closed (2026-10-05). Handing a request
  over is not editing what it asks for, and a request whose 负责人 had left
  was stuck: only its owner or its creator could touch it, and in the
  ordinary case both were the person who had gone. The open statuses are
  `OPEN_PURCHASE_ORDER_STATUSES` / `OPEN_DISPOSAL_STATUSES` in
  `recovery.ts`, which the leaver's handover list reads too; the pages
  offer the field through `DomainConfig.handover`, ahead of the record's
  own `editable` and the field's `readonlyWhen`. Receiving, ordering and
  cancelling stay with the grant — they are the buyer's steps, not the
  负责人's. The pages hide what the service refuses: `raisedBy()` in
  `client/lib/itam/procurement.ts`, and `DomainConfig.editable` takes the
  reader's id for it. A rule the page states and the service does not
  enforce is not a rule.
- A purchase order's and a disposal's 负责人 is asked for when it is
  created (starting at whoever files it) and is anybody's to hand over
  while the request is open, so a request is **handed over** rather than
  cancelled and asked again — the approval does not settle it, since who
  follows a request through is not part of what was approved. It is
  the one person-field either document has: each once carried a 负责人
  beside a 申请人 and dropped it (`202609250008_drop_purchase_order_owner`,
  `202609190003_drop_disposal_owner`) because it only held a copy, and
  when employees stopped signing in the 申请人 became the 负责人
  (`202610050001_request_owner`) — whoever the request is for is its
  department and description. A repair's owner came the other way: its
  only person-field was the immutable `createdById` and `complete` was
  granted by it, so the record could not be handed over at all.
- A request that was rejected (or, for a disposal, withdrawn) is being asked
  again rather than asked for the first time, so its button reads
  重新提交审批 (`procurement.resubmit` / `disposals.resubmit`).
- Receiving a purchase order line is the check: a device arrives **in
  stock**, with no state before it. The 待入库 status and the order's
  「入库确认」 step went on 2026-09-26 (migration
  `202609260001_drop_pending_receipt` moves the rows that were in it), so
  `DEVICE_STATUSES` starts at `inStock` and there is no `confirmReceipt`
  transition. An order is received in **one** form, 到货入库 on its lines
  card (2026-10-05; there is no per-line 入库 any more), covering every
  line still to arrive. Each device is its own record: a row per unit with
  its serial, while the place (required), owning department (the order's,
  by default), warranty end and keeper are asked once per line, and the
  model, vendor and ownership are the order's. Accessories, consumables and
  components are a quantity into the stock item of that very model — only
  that model's, because a batch of docks does not join the keyboards — or,
  with none, a new record at a place asked for. An entitlement line asks
  加入已有授权 / 创建新授权, starting on the one already on the books for
  that product, and adds its seats there or opens a new one. **Joining
  changes no term**: a renewal is its own act on the entitlement's page, so
  the form asks for the terms only when opening one (授权方式, 维保到期,
  共用密钥 for a perpetual; 计费方式, 计费周期, 单价, 到期日期,
  自动续订 for a subscription, rendered from `ENTITLEMENT_FIELDS` so the
  labels match its page), and shows the joined record's terms disabled, so
  the receiver sees what the seats inherit. What the order already answers
  is never asked again: the name starts at the model's or product's own
  name, the price at the line's, the keeper at the receiver, and
  `startDate` / `currency` come
  from the order itself. Nothing a receipt creates carries a note. There is no service line type — it was the one that
  produced nothing (removed 2026-09-26,
  `202609260002_drop_service_lines`), and a line carries no free text
  either (`202609260004_drop_line_description`): a line is its model or its
  software product, and the pickers show each one's category and maker
  beside the name.
- Receiving is **one batch** (2026-10-05, `ReceiptDialog` in
  `client/pages/itam/procurement/receipt-dialog.tsx`, `POST
/itam/purchase-orders/:id/receive-batch`, `receiveBatch` in
  `procurement.ts`): every line of the order in one form and one
  transaction. A device row's serial can be a column pasted from a
  spreadsheet, which splits into rows, or scanned: a scanner in keyboard
  mode ends each code with Enter or Tab, either of which moves to the next
  row, and a row added for the next scan is not received while it is still
  empty. The rules decide before anything is written (`checkBatch` in
  `server/providers/itam/receipt-plan.ts`, asked live through `POST
/:id/receipt-check`): more than a line has left, a serial twice in the
  batch or already on the books, or a device without the serial its
  category requires refuses the **whole** batch (`RECEIPT_ISSUES`), because
  half a delivery on the books is wrong in a way nobody sees. This replaced
  the per-line dialog, which received one device at a time and made twenty
  laptops twenty dialogs. The order's 入库记录 tab lists its devices in a
  table of their own — number and name, serial, status, place, arrival —
  and every row there opens its record in the drawer.
- An approved purchase order states what it asks for: its request fields
  (事由, 说明, 部门, 需求日期, 供应商, 币种) go read-only once it reaches
  `approved` (`SETTLED_STATUSES` / `SETTLED_EDITABLE` in `procurement.ts`,
  `settled` in `client/lib/itam/procurement.ts`), because the approval was
  given for what the order said then. Its lines are fixed too — `setLines`
  refuses past `UNDECIDED_STATUSES`, and wrong lines mean cancelling the
  order and asking again, so nobody reads an approval that no longer
  describes the order (decided 2026-09-26, replacing the earlier
  change-with-a-reason; `history.summaries.linesChangedWithReason` stays for
  the rows that were written then). The delivery dates are answers, not
  fields: 标记已下单 takes both
  下单日期 (today) and 预计到货日期 (a week out) and neither may be left
  out, 到货入库 sets 实际到货日期, and each reads on the page only once it
  has one (`visibleWhen`), so an order shows no dates that have not
  happened. `orderedAt` / `receivedAt` are in `LIFECYCLE_FIELDS` and are
  never edited by hand.
- Calling a purchase order off belongs to the people it went through: the
  side that raised it, or whoever was asked to decide it or decided it
  (`NOT_INVOLVED`; the page reads the approval trail for the same answer).
  Cancelling covers `pendingApproval`, `approved` and `ordered` — a draft is
  deleted, and a rejected order is fixed and asked again rather than called
  off, so it has no cancel.
- A rejected purchase order goes back to being editable, like a draft: its
  fields and lines change (`EDITABLE_STATUSES` / `UNDECIDED_STATUSES` in
  `procurement.ts`, mirrored by `EDITABLE` / `UNDECIDED` in `lines-tab.tsx`)
  and it submits again. Resubmitting one that cannot be changed would ask the
  approver to reconsider the very thing they refused. A line change needs a
  reason only once something has been decided on the order, so `draft` and
  `rejected` need none. `pendingApproval` stays uneditable — withdraw first.
- An approval is addressed, not routed: the submitter names one person who
  holds that operation (`POST /itam/purchase-orders/:id/submit` and the
  disposal's take `approverId`, stored as the approval's `approverIds`), and
  `GET /itam/users/approvers?filter[subject]=…` lists the candidates by
  reading the permission sets that grant `itam.<collection>/approve` and their
  user assignments. Naming one is required — `approvals.request` refuses an
  empty `approverId` ("Choose an approver") — and only that person may decide
  it (`NOT_APPROVER`). The requester **may** name themselves (2026-09-27): a
  deployment with one Asset Manager has nobody else who may approve, and
  refusing it left that person's own requests undecidable forever. So an
  approval addressed to an id that belongs to nobody can never be decided,
  which is why the demo asks a real second account. The
  amount tiers that used to route it were removed on 2026-09-25 with
  `202609250009_drop_approval_tiers`.
- A purchase order's summary strip names its approver from the moment it is
  submitted, right after the status: whoever the latest request was addressed
  to while it waits, and whoever decided it afterwards
  (`PurchaseOrderApprover` reads `/approvals`, newest first, because
  resubmitting may ask someone else). A draft has been asked of nobody, and
  withdrawing puts it back to draft, so it shows none.
- An approval waits on whoever it names, including the requester: naming
  yourself is allowed (a deployment with one Asset Manager has nobody else),
  so `approvals.pendingFor` excludes the requester only from an approval
  that names **no** approver. Excluding them from their own addressed
  approval left it decidable from the record page alone, while 待我审批 and
  the list's 待我审批 view both reported nothing waiting.
- **报价比较 was removed** (2026-10-23, migration
  `202610270005_drop_purchase_quote_comparisons`): weighing an order
  against suppliers' quotes (tasks `purchaseQuote` and
  `quoteRecommendation`, table `purchaseQuoteComparisons`) went from the
  order page, the approval assistant's material and the reading tasks. A
  supplier's quote can still fill a draft's lines through 解析单据.
