# ITAM: the assistant

Read this before changing Asset Steward, its commands or plans, the chat, a page's AI shortcut, AI 整理, receiving by delivery document, or any call to a model.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

- **The assistant runs on the Agents plugin** (`@nocobase/app-plugin-agents`,
  template 1.0.0-beta.64, after NocoCRM's); the AI employee plugin, its
  `ai/` employee and tools, the `nocobase-ai` Registry copy, the unseen
  chats and every page tool are gone. `server/providers/itam-agents/`
  (`ItamAgentsProvider`) gives the plugin ITAM's two business actions —
  `itam.records/view` and `itam.plans/create` (`actions.ts`) — and the gate
  (`gate.ts`: a person holds both, a run what its agent is configured with),
  the `itam-assistant` preset, the `itam-work` skill every online run gets
  (`skill.ts`: the commands and the plan's shape), the conversation rules
  (`rules.ts`: how to read the register, the business notes and the time
  zone, kept current through `settings.onSaved`), the page-context kinds
  (`context.ts`) and the `itam` conversation source. At start it creates,
  once each, the model services from `ai.llmServices` in `config.yml`
  (`model-services.ts`, in their `sort` order; the keys are stored
  encrypted, so `secrets.keys` must be configured), Asset Steward as an online agent
  open to everyone with every chat model, the system's default chat agent
  (`assistant.ts`), and the five method skills of `ai/skills/` in the
  plugin's library, attached to Asset Steward (`library.ts`, copied into `dist` by
  the build hook). A marker row in `itamSettings` (`agents-noco-v1`,
  `agents-skills-v1`, `markers.ts`) records each, so what an administrator
  changes on Agent 团队 → Agent / 技能 / 模型 is never overwritten. Nothing of it
  may stop the application starting: a failure is logged and retried at the
  next start.
- **The assistant is Asset Steward, 资产管家** (2026-10-16; it was Noco
  until then). The agent's `name` is the English and its `nameText`
  (`ai.assistantName`) shows it in the viewer's language; the first line of
  its instructions and the background prompts use the name too. At start,
  `renameFormer` in `assistant.ts` renames an assistant still called Noco
  — name, translation and that first line — and leaves one an administrator
  renamed alone. The marker (`agents-noco-v1`) and the `source: 'noco'` of a
  background pick keep the old word: they are stored keys, not names.
- Asset Steward reads the register through **commands**, the routes of
  `server/routes/itam/agent-commands.ts` under `/api/assistant/*` (not
  `/itam/*`, whose `auth.required()` refuses a run's token): `itam context`,
  `search`, `record get`, `stats`, `availability`, `model match`,
  `onboarding plan`, and `plan ops | create | list | get`. Each is a
  `describeRoute` with `cliRoute({ action })`, the plugin builds the run's
  command line from them, and the guard there refuses an action the run
  does not hold and answers any write `PLAN_REQUIRED`. What they read is
  `server/providers/itam-agents/reads.ts`, as the person the run works for
  (`readerFor(container, userId)` → `scopeFor`), exactly as the pages would
  show it. Asset Steward **changes nothing itself**: it writes one **plan**
  (`server/providers/itam/plans.ts`, tables `itamPlans` / `itamPlanSteps`,
  migration `202610120001_itam_plans`) whose steps are the operations it
  could once call directly — `AI_WRITE_SCHEMAS` (`ai-writes.ts`) and
  `AI_RECORD_SCHEMAS` (`routes/itam/ai-records.ts`), named without `itam_`
  — checked by their screens when proposed (a refused step is named,
  `steps.N`) and carried out by `runWrite` / `runRecordTool` as the person
  who confirms. The steps run **one after another**, not in one
  transaction: the services open their own, and SQLite has one connection.
  A refused step stops the plan there, the steps before it staying done,
  and the card and the outcome say how far it got. A later step names what
  an earlier one created by `$n` or its `ref`. A plan is its proposer's,
  expires after a day, and its outcome goes back to the conversation as
  news and as an input that wakes the agent (`plan-news.ts`). The card is
  `client/components/itam/ai/plan-card.tsx`, placed among a conversation's
  messages through the plugin's `ChatExtensionsContext`
  (`client/lib/itam/chat-extensions.tsx`); unticking a step leaves it out.
  Submitting, deciding, ordering, cancelling, executing a disposal and
  deleting are never plan steps — they stay on the pages.
- The chat itself is the UI Library's `agent-chat` block in
  `client/extensions/nocobase-agent-chat/` (written from the registry: the
  CLI could not install it), around the shell through `AgentChatShell` in
  `client/layouts/agent-chat.tsx`, and a full page at
  `/agent-chat/:conversationId`. A model is sent as its service and name
  alone (`modelRef` in `conversation-view.tsx`), since plugin 0.1.0-beta.8
  refuses the labels and effort a model choice carries, which made every
  model but the agent's default unpickable. Since 2026-10-16 the panel looks
  and sits as NocoCRM's does, through `Application change (ITAM)` edits to
  the block: fixed at the window's right edge over the whole height, 28rem
  (`chat-panel.tsx`, drawn by `AgentChatShell`), the header and page making
  room for it from 1280px (`itam-page-main` / `itam-agent-panel-open` in
  `client/styles.css`, the record drawer moving left of it through
  `itam-record-drawer`) and lying over the page narrower, with no docked,
  floating or expanded forms; its header one row — history, the agent's
  round avatar, the title (still renamed in place) over "agent · what it
  does", ⋯ (archive), new, the conversation's page, close — every button a
  ghost icon with a tooltip (`panel-header.tsx`); the agent's reply plain
  text with no avatar, name or bubble and the reader's message a grey
  bubble, each with its time and a copy button on hover
  (`message-item.tsx`); no greeting on a new conversation in the panel; and
  the composer one line tall with a soft shadow, a focus ring and small round
  buttons (`client/components/agent-composer.tsx`, its panel form). The
  header's ✨ button (`AgentChatButton`) leads the header's actions in the
  theme button's frame with the sparkle in the primary colour, toggles the
  panel as ⌘J does — opening on the latest conversation when the panel holds
  none, as on arriving (`useToggleAssistant` in `client/lib/itam/conversations.ts`,
  2026-10-16; the phone's round button too, a new conversation being the
  panel's +) — and while `/itam/ai/status` says the assistant cannot
  answer stays, disabled, saying why (`ai.unavailable`). An ask box floats
  at the bottom of the main column (`AssistantDock` in
  `client/components/itam/ai/assistant-dock.tsx`, ported from NocoCRM's dock
  on 2026-10-16, mounted inside `<main>` in `app-layout.tsx`): one line
  ("问任何问题…", on a record's page too — its name wrapped the box) until focused,
  then the ask composer (`ask-composer.tsx`) with files and the model, and
  while in use a veil over the whole page under it, drawn as a dialog's backdrop, so a press beside it only closes it (2026-10-16, as NocoCRM's), and the page's suggested questions above it (`RECORD_QUESTIONS` by the kind
  of record the page offers, else `PAGE_QUESTIONS` by path; `ai.dock.q.*`).
  A question starts a new conversation about that record and opens the
  panel on it (`useAskAgent` in `client/lib/itam/ask.ts`); on a phone it is
  a round ✨ button that opens the panel with the record pinned. It hides
  while the panel is open, on the workbench, a conversation's page and
  设置, and for everyone when 设置 → 通用 → AI 助手 switches it off
  (`ai.assistantDock`, on by default); its border is `.itam-ai-border` in
  `client/styles.css`, mixed in oklab since this theme's card colour carries
  a hue of 0. `Page` and `DetailPage` keep room at their foot for it. The
  generic detail page and the device page offer their record to the chat
  (`useAiPageContext` with `recordKindOf`, `client/lib/itam/record-kind.ts`)
  so the box, and the panel's composer, know it. The conversations have a
  page of their own (`client/pages/itam/agent-chat.tsx`, 2026-10-16, laid
  out as NocoCRM's): `/agent-chat`, its heading over a rule with 收起 (back
  to the page the reader came from, the conversation in the panel) and
  新对话, the list in a column at the left and the conversation open beside
  it; `/agent-chat/:conversationId` is a child route rendering nothing
  (`route-address.tsx`), so the page stays mounted between conversations,
  and `/agent-chat/new` starts one — the block's `ChatConversationPage`
  takes a null conversation, and the first message moves the address
  within the same route, so the view stays. The list is NocoCRM's
  (`ConversationList` in `client/components/itam/ai/conversation-list.tsx`,
  also the panel's history): each row the agent's avatar, the title, the
  time and the latest message (`你：`, or the agent's name, first; the
  plugin's list has no preview, so each row reads its last message), a dot
  while a reply is unread, no search or filters; the archived ones behind
  显示已归档 at its foot (`?archived=1`). With no conversation the page is an
  empty state. The conversation fills the column under a header of the
  avatar, the title (click to rename) over "Asset Steward · what it does" and a ⋯
  menu (archive), over a rule, with no greeting on a new one; an archived
  conversation shows 这个对话已归档。 and 取消归档 in place of the composer. The global search's 问 AI answers in its own
  dialog on a conversation listed nowhere until the reader goes on asking
  in it (2026-10-16; see the global search in `itam-ui.md`). It has no menu entry: the panel's history ends
  in a link to it, and the panel's 全屏打开 lands there. A page offers what it
  shows through `useAiPageContext({ kind, id, label })`
  (`client/lib/itam/ai-chat.tsx`): the record's chip sits above the composer
  and `ask(prompt)` starts a conversation with it pinned. A page context
  carries ids only; the server resolves each kind (`context.ts`) from a
  per-person snapshot of the collections they may read, taken by
  `/itam/ai/status` (the plugin resolves inside its own transaction, where
  authorization cannot be asked on SQLite). Asset Steward then reads the record with
  its commands. `useItamAi()` says whether a model is there (`/itam/ai/status`:
  Asset Steward's first model, else the system default) and opens or starts
  conversations. Every AI shortcut on a page is blue text with a sparkle
  (`AiShortcut`), not a button. There is no web search.
- ITAM's **own model calls** go through the plugin's model gateway
  (`server/providers/itam/ai-model.ts`: `openSession`, `askJson` with a zod
  shape spelled out as JSON Schema, asked once more when the reply does not
  hold it, and `readSkill` from the library), with Asset Steward's first model. They
  are the forms filled from material — AI 整理 on a purchase order or its
  lines, a new model or software product, a delivery document —
  `POST /itam/ai/read` (`ai-reading.ts`, each task under the grant its form
  needs), which answers in the shape the form's own handler took when a page
  tool delivered it, so the same server checks (`/capture/match`, a receipt
  run's `/draft`) still decide what the form takes; and Asset Steward choosing a
  joiner's equipment (`createAssistantRunner` in `onboarding-advisor.ts`).
  A purchase reading is given the models and products on the books to pick
  ids from. Documents are read as text on the server (`document-text.ts`:
  exceljs, mammoth, unpdf); a picture is not read.
- **维修单整理** (2026-10-17, task `repairTriage`, grant `repairs.create`):
  the fault description is the material and the page sends only
  `deviceId`; the server reads the device as the person (`repairFacts` in
  `ai-reading.ts`: model, age, warranty, book value when they may see
  costs, the last repairs, and how often its model was repaired in the last
  year by kind) and the model answers the kind of fault, repair / replace /
  inspect and at most three reasons. The form fills the kind, marked
  请核对, and shows the rest beside it; the person decides. Chosen over a
  background agent because it is asked at the moment a repair is filed,
  with the material on screen.
- **Work agents** (2026-10-16, plan "Work agents", step 1, after
  NocoCRM's): agents that work on a record without being asked in a
  conversation, and only suggest. One plugin agent per work, created once
  at start (`server/providers/itam-agents/work-agents.ts`, marker
  `agents-work-v1`, owner-only, no actions, its method skill attached —
  `WORK_SKILLS` in `skill.ts` go into the library but not onto Asset Steward), is how
  an administrator sets its model and instructions on Agent 团队 → Agent; a run
  asks the gateway with them (`openSession({ work })`, falling back to
  Asset Steward's model) and its use shows under the agent's name on 用量. Each run
  is a row of `itamAgentRuns` (migration `202610160001_agent_runs`,
  `server/providers/itam/agent-runs.ts`): running → pending with its
  structured result, or failed with a reason code shown where the result
  would be (`unavailable`, `unreadable`, `timedOut`, `notFound`); accepted or
  dismissed by its decider; superseded by a newer run on the record or the
  record decided elsewhere. A run left running past 10 minutes (or queued a
  day) reads as failed. Runs are tasks of the jobs service, queue
  `itamAgentRuns` (`agent-jobs.ts`, `server/config/jobs.ts`, two at a time),
  queued again at start on the memory queue. Each agent and trigger has a
  switch (`agent-switches.ts`, an `itamSettings` row; changing one needs the
  `itam.settings` update); an automatic start asks it, a person asking by
  hand never does.
  - **审批审阅**, shown as 审批助手 since 2026-10-17
    (`server/providers/itam/approval-review.ts`, skill
    `ai/skills/approval-review`, eval set `evals/approval-review.ts`, run
    through `POST /itam/ai/evals/approval-review`): the approvals service
    announces a request, a decision and a withdrawal once their transaction
    commits (`onRequested` / `onSettled`, `connection.afterCommit`), and the
    agents' provider starts a review on each request. It reads as the
    approver (`readerFor`): the order with its lines, in-stock and idle
    devices of the same models and categories, earlier prices the approver
    may read, or a disposal's devices with book value and repairs, and the
    last decided requests of the kind; it returns a recommendation (approve,
    conditional, reject, needMore), the calculation, the basis, what could
    serve instead, risks, what is missing, and a drafted comment. Only the
    approver sees the result (`/itam/agentRuns/latest` blanks it for anyone
    else). Deciding from the review is the request's own decision under its
    `approve` grant (`POST /itam/agentRuns/:id/decide`, the run accepted
    first so its own `settled` leaves it so, reopened when the decision is
    refused); 忽略 leaves the request waiting; 按我的意思重做 runs again with
    the approver's words, replacing the waiting one.
  - **Where it shows** (`frontend-standard.md` §S1–S4): 收件箱 (`/inbox`,
    first in the menu, its badge the runs waiting, `useInboxCount`) is the
    template's inbox block with the reviews added to its To do view as a
    collection category (`client/pages/itam/inbox.tsx`), and NocoCRM's
    application changes to the block (`client/extensions/nocobase-inbox/`,
    each marked): the two views are tabs labelled AI 建议 (first, the
    default, counting what waits) and 通知 (with 全部标为已读 at its head);
    `/notifications` and the bell open 通知 (`?view=all`). The request's page shows 等你决定 under its
    title (`DomainConfig.Decisions` → `DetailPage`'s `decisions`, built by
    `createApprovalDecisions`), with one line offering 审阅 while the
    request waits on the reader and no review is open. Both use
    `ApprovalReviewCard` (`client/components/itam/ai/approval-review.tsx`):
    an amber edge, the recommendation as a tag, what is asked, the basis
    folded, the comment to edit, the recommended decision as the solid
    button. 智能体工作 (`/agent-work`, page grant `agent-work` for both IT
    roles via `ADDED_PAGES`) shows each agent's switches, 7/30-day counts
    with the acceptance rate, and its runs on records the reader may read.
  - **MDM 跟进** (2026-10-17) is the second work agent: what a device sync
    leaves for a person to judge, as a plan in 收件箱, its card the plan's
    own (`DeviceSyncRunCard`); see `itam-device-sync.md`. A run of either
    agent goes to the job queue's one handler, which picks the agent's
    worker by `run.agent`.
  - **No agent for what a rule decides** (2026-10-17). 离职回收 and
    授权续费 were built as work agents and removed the same day: what a
    leaver hands back is the rule in `recovery.ts`, and what a renewal
    turns on (seats in use, seats leavers hold) is counted, not judged —
    the model could only guess what the register does not hold (who will
    need the software). A work agent is for a judgement a rule cannot make
    and the register holds the material for, as 审批审阅 has. Removing one
    takes it out of `AGENTS` and `WORK_AGENTS`; `provisionWorkAgents`
    deletes its plugin agent at the next start (archived first, as the
    plugin asks; found by its `agentWork.<agent>.name` key, so also when the
    marker no longer lists it) and drops it from the marker, and 收件箱 and
    its count read only the agents in `AGENTS`, so its old runs stop
    showing. The plan operations they added (`adjust_entitlement_seats`,
    `set_entitlement_auto_renew`) stay for Asset Steward.
- An AI create meets the page dialog's bar: `REQUIRED_ON_CREATE` in
  `server/routes/itam/ai-records.ts` lists what each create dialog requires
  beyond its input schema (conditional ones included, and a device's serial
  when its category requires one), checked when a plan holding a
  `create_record` step is proposed and again when it runs. A new required
  field on a create dialog is added there too. Its field guide
  (`CREATE_FIELD_GUIDE`, generated from the routes' own schemas) is what
  `itam plan ops` shows, so a field added to a page reaches the assistant by
  itself.
- **Asset Steward chooses a joiner's equipment when asked** (2026-10-06,
  `server/providers/itam/onboarding-advisor.ts`, migration
  `202610060002_onboarding_runs`), reversing "nothing AI runs outside a
  conversation" for this one job. The rule picks among identical laptops by
  place and warranty; Asset Steward also weighs repairs, the replacement date, notes
  and the business notes, and says why. A run is one call to the Agents
  plugin's model gateway (`createAssistantRunner`, `openSession` /
  `askJson` in `ai-model.ts`, template 1.0.0-beta.64) with Asset Steward's model and
  this job's instructions (`PROMPTS`) as the whole system prompt, answered
  in `ADVICE_SCHEMA`'s shape; the message is the joiner, the kit, the
  business notes and each item's candidates as JSON. It has no conversation,
  tool or skill to wander into — which, run as the AI employee, it did
  (2026-10-06: it summarised the workbench or guessed skill names). An
  answer that keeps no valid pick is recorded as `failed`, not as chosen. It
  writes only its `onboardingRuns` row: per kit item (`OnboardingPlanLine.key`,
  `<target type>:<target id>`) the picks and a reason each, held by
  `validAdvice` to that item's own candidates and to as many as it needs.
  `plan()` puts a pick first **while it is still free** (marked
  `source: 'noco'` with its `reason`) and otherwise falls back to the rule,
  so a pick taken since needs no clean-up; `plan(id, { candidates: true })`
  is what the run is shown. A device Asset Steward picked for one joiner (their
  latest finished run) is **held back** from every other joiner's
  candidates and proposals (`heldForOthers`), or two joiners of one
  department were both offered the laptop it had just chosen for the first.
  A run starts **only when the 入职负责人 asks** — 挑选 / 重新建议
  on the card, which only they may press (`advise`, `POST /itam/master/people/:id/onboarding/advise`,
  `NOT_OWNER`) — for a joiner not yet equipped, however far off their
  first day, when Asset Steward has a choice (some item with more candidates than it
  needs). Runs are queued one at a time. It also ran after every save of a
  person and nightly (`itam.onboarding-advice`, 02:30) until later the same
  day, notifying the owner of what it found; that went, because it spent a
  model run on joiners nobody had looked at yet and held their picks back
  from the others. A database that synchronised the nightly task keeps its
  definition until `scheduler sync --finalize`; a firing before then finds
  no definition and runs nothing.
  The card shows the run under its heading — choosing, chosen with
  Asset Steward's summary, or failed — and each pick's reason under its item; the
  buttons stay the person's. `ai.onboardingAdvice` in ITAM's settings
  (入职建议, on by default) switches it off; no usable model starts
  nothing.
- Receiving **by delivery document** is the first work the assistant
  carries rather than answers (2026-10-05, the NocoITAM plan's first
  vertical; offboarding stays rules and people). 按送货单入库 on the order's
  lines card picks the file and opens 到货入库 already reading it:
  the file is kept as the order's attachment, a run is started
  (`receiptRuns`, `202610050003_receipt_runs`, `receipt-runs.ts`), and the
  model reads it on the server under the `receiving` skill
  (`ai/skills/receiving/SKILL.md`), one gateway call (`POST /itam/ai/read`,
  task `deliveryDocument`, template 1.0.0-beta.64) answering with the rows
  the run's `/draft` takes — what the page tool `prefillReceipt` used to
  hand over. The server's
  rules turn that into the plan the form opens on (`planReceipt`): a row
  whose part code is a line's model `code` goes there whatever the
  assistant guessed (`matchConflict` says when they differ), entitlements
  and unmatched rows are listed, never forced onto a line. Every value it
  filled carries a sparkle naming where in the document it came from, and
  loses it once the receiver types over it. A warranty the document states
  (保修 36 个月, or an end date) fills a device line's 保修截止日期, counted
  from the delivery date (`warrantyEnd` in `receipt-plan.ts`, 2026-10-06);
  one it does not state stays empty, and the form says the service works it
  out from the model's 保修月数, as it always did. Nothing is received until the
  receiver presses 入库; that batch closes the run (`saved`, with `final`
  and per-field `stats`: kept / changed / removed / added), its `received`
  events read `origin: 'agent'` under the receiver's name and name the
  document. A run belongs to whoever started it (`NOT_RUN_ACTOR`); closing
  the form discards it, and a reading that gave no rows fails it — the run
  is the record. 设置 shows
  the boundary, the acceptance counts and the latest runs (`GET
/itam/ai/receipt-runs`, the settings grant). The server reads the
  document as text when the run starts (`document-text.ts`, kept in
  `receiptRuns.documentText`), and that text is what the model reads. CSV
  and plain text are decoded as they are — a CSV loader that takes the first
  line for the column names lost every column of a delivery note whose
  header block comes first — spreadsheets row by row under their sheet's
  name (exceljs), Word as its raw text (mammoth) and PDF page by page
  (unpdf). A picture, or a legacy .xls / .doc, is not read, and the form
  says so; do not add an OCR library for them. 解析单据 on a draft's lines is **AI 整理, lines
  only** (2026-10-06; until then it opened the side panel and Asset Steward placed
  lines through `addDraftLines`, unchecked by the server's matching): the
  shortcut sits beside 编辑 and opens the editor itself, keeps the file on
  the order, reads it through `POST /itam/purchase-orders/:id/document-text`
  (only a file linked to that order, under `update`) and runs
  `usePurchaseOrderCapture` with `orderId` — the `purchaseLines` reading,
  and `/capture/match`, which takes `create` or `update`. What it read
  joins the lines under edit (请核对 where
  it was unsure), in place of the blank row an empty order opens on; what it
  could not place is listed above them with its picker and 创建型号 (the
  same `CaptureNotice`), and an adjustment replaces only the lines it
  added — the order's own go to the model as `existingLines`.
- 新建采购单 opens on **AI 整理** whenever the assistant is available
  (2026-10-06, after NocoCRM's lead and opportunity capture), with 表单录入
  beside it; without the assistant there are no tabs. The requester pastes
  what they have or uploads a document, and the model fills the dialog
  (`client/lib/itam/use-purchase-capture.ts`): one gateway call
  (`POST /itam/ai/read`, task `purchaseOrder`), given the models and
  products on the books to take ids from, answering in the shape the page
  tool `fillPurchaseOrder` once took (template 1.0.0-beta.64 replaced the
  unseen conversation it ran in, and with it the 2026-09-27 rule that no
  model call happens outside a conversation). The server checks the reading before the dialog
  takes it (`POST /itam/purchase-orders/capture/match`,
  `server/providers/itam/purchase-capture.ts`, under `create`): a printed
  part code decides by the model's `code`, an id the assistant gives must
  exist — and a printed code no model holds is placed, marked 请核对, on the
  one code on the books it starts with when at most three characters are
  over (`modelByCodePrefix`, 2026-10-06: a PDF's text layer ran the quantity
  "4" into "CT32G56C46S5") — and anything else matches only by an identical name (a model with
  or without its maker in front; a vendor or department identical or the
  only one containing it). What matches nothing is never put on a line — an
  M4 must not become the M3 the books hold. A vendor or department the text
  named but the books lack is said **under its own field** while that field
  is empty (`UnplacedNote` in `create-dialog.tsx`, 2026-10-06), where a
  vendor can also be created (创建供应商, from the note or the foot of the
  vendor list, `FieldInput`'s `onCreate`); a department is only chosen. The
  lines it could not place stay in the column beside the form. A field or
  line the assistant was unsure of carries 请核对 (`ReviewMark`, whose
  tooltip says what it means — there is no sentence above the form) until it
  is changed. Adjusting happens in the dialog: each instruction is a new
  reading of the material, with the form as it stands and the request.
  An uploaded document is read by `POST /itam/purchase-orders/capture/
document-text`, which reads only a file uploaded within the hour and
  attached to nothing — there is no order yet to scope it by — and the
  saved order takes it as an attachment. The file plugin stamps `createdAt`
  in UTC without the `Z`, so that window is compared in that form, not
  through `dbDateTime()`.
- A line AI 整理 could not place is placed by the reader, never by the
  assistant (2026-10-06): each row in the column beside the form carries a
  picker that starts at the document's own wording without its
  configuration (`pickerSearch`: 16GB/512GB, 27英寸 would rule every model
  out of a word-by-word search) nor, beside other words, the Chinese that
  only names the kind of thing (显示器, 笔记本内存); when that finds nothing
  it opens on the first of `pickerSearches` that does — the model-number
  word, then the part code. A model's or product's search also matches its
  maker's name (`searchByReference` on both, 2026-10-06), since a document
  writes "Crucial DDR5-5600" and the books "DDR5-5600 32 GB SO-DIMM". A
  different spelling of a model on the
  books is the common case — and, for whoever may create
  one, 创建型号 / 创建软件产品 at the foot of that list
  (`ReferenceSelect`'s `onCreate`). Creating opens `QuickCreateDialog`
  (`client/components/itam/quick-create-dialog.tsx`), the collection's own
  form over the dialog, starting at the line's name and part code. Either
  way the pick goes through `/capture/match` again (`place` in
  `use-purchase-capture.ts`), so its line type follows the record's
  category, and the line joins the lines in place of the blank row. The
  assistant creates no master data: three spellings of one model would
  split every report. A line row's own model and product pickers offer the
  same 创建… entry, narrowing a new model's category to the line's kind,
  since `setLines` refuses a model of another kind.
- 创建型号 and 创建软件产品 open on **AI 整理** too (2026-10-06,
  `MasterCreateDialog` in `client/components/itam/master-create-dialog.tsx`,
  the master domain's `Create` and `QuickCreateDialog` alike): the reader
  types the maker and the model, and the model fills the rest from what it
  reliably knows — there is no web search on the Agents plugin's gateway
  (template 1.0.0-beta.64), and the dialog says so. How to look a record up
  and fill the form is the `catalog` skill (`ai/skills/catalog/SKILL.md`,
  型号与软件产品资料, 2026-10-06), read from the plugin's skill library into
  the system prompt, so the rules are a document the business can change.
  One gateway call (`POST /itam/ai/read`, task `model` or
  `softwareProduct`, with the categories and their fields) answers in the
  shape the page tools `fillModel` / `fillSoftwareProduct` once took
  (`client/lib/itam/use-master-capture.ts`), which the server checks first (`POST /itam/master/:collection/capture/match`,
  `server/providers/itam/master-capture.ts`, under `create`): the category
  must exist and be of the record's kind, the maker is matched by name like
  a vendor and **never created** — the dialog offers 新建制造商 with the name
  — values a field would refuse are dropped (a date that does not exist, a
  non-http website), and records of the same part code or name are listed
  above the form, with a second list of possible ones — the same maker and
  every word of one name inside the other, as the lists search
  (2026-10-06), since "MacBook Air 13 英寸（M3）" is the books' "MacBook Air
  13 M3" without matching it exactly. That check is the server's, not the
  `catalog` skill's. Only dates a page states are filled; the prompt forbids
  estimating them. A model the search cannot confirm is still handed back
  with what the reader's own words give — name, maker, closest category,
  marked 请核对 — and nothing else (2026-10-06): the empty form it used to
  leave made the reader type even the maker. The pages it cites are listed (links only). The form is
  `RecordFormDialog`, which takes its values from outside for this
  (`values` / `onValuesChange`, `initialFormValues`), plus `marks`
  (请核对), `titleAside`, `replacement` and `aside`. A dialog opened from
  the aside renders as a sibling of the form, never inside it: a submit in
  a portal still bubbles to the form around it in React's tree.
  A model's or software product's own page offers the same check as
  **AI 补充** (2026-10-06, `EnrichAction` in
  `client/pages/itam/master/master-domain-parts.tsx`, for whoever may update
  the record): it starts a conversation with the record pinned. Under the
  `catalog` skill's 补充已有记录 section Asset Steward reads the record and its
  category with its commands, says what it found, then proposes the change
  as a plan with one `update_master_record` step (`ai-writes.ts`): only the
  fields the lookup fills — a model's code, specification, warranty, dates
  and extended fields (held to the template by `holdAttributes`, merged into
  what it holds), a product's delivery method, description and website —
  never the name, maker or category. The user confirms or declines the
  plan, and asks in the conversation for another selection.
- `ai.llmServices` in `config.yml` (typed by `server/config/ai.ts`, this
  application's own section since template 1.0.0-beta.64) is read **once**:
  at a start where the Agents plugin has no model service of that name, it
  is created there (`model-services.ts`), and from then on the service is
  the plugin's, edited on Agent 团队 → 模型 — a key changed in `config.yml`
  later does not reach it. The plugin stores keys encrypted with
  `secrets.keys`, so a configuration without one cannot create them: the
  start logs a warning and the assistant has no model until it is added.
