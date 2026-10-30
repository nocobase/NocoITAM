# ITAM: the assistant

Read this before changing Asset Steward, its tools, commands or plans, the chat, a page's AI shortcut, AI 整理, receiving by delivery document, or any call to a model.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

- **The assistant runs on the Agents plugin's OnlineAgent service**
  (`@nocobase/app-plugin-agents` 1.0, template 1.0.0-beta.73,
  2026-10-20). Plugin 1.0 keeps no online agents an application creates:
  its migration `202610240020_ag_runner_agents` deleted Asset Steward, the
  two work agents and every other online agent, and a native conversation
  is answered by the plugin's own agent `online`, inside this process, with
  the tools the application registers. So Asset Steward is the **global
  scope** of every native conversation (`registerAssistant` in
  `server/providers/itam-agents/assistant.ts`,
  `registerOnlineAgentGlobalScope`): ITAM's tools, the enabled chat models
  as `service/model` with the default chat model of Agent 团队 → 模型
  first, and a system prompt of its instructions (`preset.ts`), the work
  guide (`ITAM_WORK_GUIDE` in `skill.ts`), the time zone and the business
  notes. Global rather than a named scope because the plugin's chat client
  creates a conversation with no scope of the application's choosing. A
  runner agent cannot take native tools, so ITAM's own ways of asking go to
  `online` alone (`ITAM_AGENT` in `client/lib/itam/ai-chat.tsx`), and the
  chat shows that agent as 资产管家 / Asset Steward (`useAgentText` in
  `client/lib/itam/agent-text.ts`, used by the chat block in place of the
  plugin's, which names it "Online agent" with no setting to change it).
  `server/providers/itam-agents/` (`ItamAgentsProvider`) also gives the
  plugin ITAM's two business actions — `itam.records/view` and
  `itam.plans/create` (`actions.ts`) — and the gate (`gate.ts`), the
  conversation rules (`rules.ts`), the page-context kinds (`context.ts`) and
  the `itam` conversation source, all for an agent on a runner. At start it
  creates, once each, the model services from `ai.llmServices` in
  `config.yml` (`model-services.ts`, `agents.models.services`; the keys are
  stored encrypted, so `secrets.keys` must be configured) and puts the
  method skills of `ai/skills/` in the plugin's library (`library.ts`,
  copied into `dist` by the build hook; marker `agents-skills-v1`, so what
  an administrator changes on Agent 团队 → 技能 is kept). The skills are
  written in English (2026-10-29); the model still answers in the AI working
  language. A library skill still word for word a version ITAM shipped is
  brought up to the current SKILL.md at start (`refreshShippedSkills`, by
  the hashes in `shipped-skills.ts`), so a release that changes a SKILL.md
  adds the hash of the version it replaces there; an edited one is kept. Nothing of it may
  stop the application starting: a failure is logged and retried at the
  next start. The conversations from before 1.0 carry no binding the plugin
  can open, so ITAM's migration `202610270003_delete_pre_agents_1_conversations`
  deletes them with their messages (the user's choice, 2026-10-20).
- **The assistant is Asset Steward, 资产管家** (2026-10-16; it was Noco
  until then): `ASSISTANT_NAME` in `assistant.ts`, `ai.assistantName` and
  `ai.assistantDescription` in the chat, the first line of its
  instructions and the background prompts. The `source: 'noco'` of a
  background pick keeps the old word: it is a stored key, not a name.
- Asset Steward reads the register through **tools** (`ITAM_TOOLS` in
  `assistant.ts`): `itam_context`, `itam_search`, `itam_record_get`,
  `itam_stats`, `itam_availability`, `itam_model_match`,
  `itam_onboarding_plan`, `itam_device_sync_review`, `itam_plan_ops`,
  `itam_plan_create` and `itam_read_skill` (a method skill from the
  library). Each runs `server/providers/itam-agents/reads.ts` as the person
  chatting (`readerFor(container, context.user.id)` → `scopeFor`), exactly
  as the pages would show it; a refusal comes back as `{ error }` for the
  model to act on, not thrown. A tool's output must be plain JSON, and only
  what its `public` projection gives reaches the page and the saved
  history: by default that a tool ran and, when refused, why — without a
  projection the call would not show at all. The chat draws each as one
  quiet line (`ToolLine`, `client/lib/itam/tool-renderers.ts` through
  `AIToolRendererProvider`, `ai.tools.*`). The same reads are also the
  **commands** of `server/routes/itam/agent-commands.ts` under
  `/api/assistant/*` (not `/itam/*`, whose `auth.required()` refuses a run's
  token), kept for an agent on a runner, which reaches ITAM through its
  command line; the plan's input (`plan-input.ts`) is shared by both.
  Asset Steward **changes nothing itself**: it writes one **plan**
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
  kept with the conversation it was proposed in (the tool context's
  `sessionId` is the conversation's id), expires after a day, and its
  outcome goes back to the conversation as news (`plan-news.ts`). The card
  is `client/components/itam/ai/plan-card.tsx`, placed among a
  conversation's messages through the plugin's `ChatExtensionsContext`
  (`client/lib/itam/chat-extensions.tsx`, the conversation's plans by their
  time); unticking a step leaves it out. A card that follows an agent's
  reply sits inside it, above its time and copy row (2026-10-22,
  `Application change (ITAM)` in the block's `conversation-view.tsx` and
  `message-item.tsx`: `withCards` / `attached`): the row closes the reply.
  A step's details stay folded behind 显示详情 / 收起详情 and, unfolded,
  read as a name and value a row on a light panel under it (`StepParams`,
  2026-10-22: 查看参数 said nothing, and one line joined by dots read as a
  blur) — in chat and in MDM 跟进's cards alike. A record step's check lists
  its record's own fields, its `assignTo` as `assigneeId`, not `collection`
  and an `input` object (`checkOf` in `plans.ts`); a check is kept with the
  step, so a plan proposed before reads as it did. Submitting, deciding, ordering,
  cancelling, executing a disposal and deleting are never plan steps — they
  stay on the pages.
- The chat itself is the UI Library's `agent-chat` block in
  `client/extensions/nocobase-agent-chat/` (written from the registry: the
  CLI could not install it), around the shell through `AgentChatShell` in
  `client/layouts/agent-chat.tsx`, and a full page at
  `/agent-chat/:conversationId`. Plugin 1.0 messages are AI SDK
  `UIMessage`s (text, `tool-*` and data parts; `appUIMessageText` for the
  text), sent through the plugin's chat controller and streamed back; a
  new conversation's model is chosen before its first message
  (`NewChatChoice`). ITAM's ways of asking from outside the panel — the ask
  box, the global search, a page's shortcut — start one through
  `useStartConversation` (`ai-chat.tsx`), which submits through
  `useChatController().submissions` as the composer does and resolves with
  the conversation's id. Since 2026-10-16 the panel looks
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
  its tools. `useItamAi()` says whether a model is there (`/itam/ai/status`:
  the default chat model, which it also names so the ask box offers it
  first) and opens or starts conversations. Every AI shortcut on a page is blue text with a sparkle
  (`AiShortcut`), not a button.
- **The web** (2026-10-20): DeepSeek's Search and Fetch APIs
  (`server/providers/itam/web-search.ts`), with the key of a DeepSeek model
  service of the plugin — the default chat model's service when it is
  DeepSeek's, else the first enabled one — read through
  `models.services.connectionFor`; with none there is no web search, and
  `/itam/ai/status` says so (`webSearch`). Asset Steward gets
  `itam_web_search` and `itam_web_fetch` only then (the global scope leaves
  them out otherwise, and its prompt adds `WEB_GUIDE` or `NO_WEB_GUIDE` from
  `skill.ts`); their public projection shows the query or page and the pages
  found, never their text. AI 整理 of a model or software product searches
  the material first and hands the results to the reading as `web` (the
  first three with their text), told to cite them in `sources`; the server
  keeps only sources the search found, and answers `searched`. Each
  successful call is billed by DeepSeek (about $0.75 per 1,000). The
  method skills name the runner's `itam …` commands; the work guide maps
  them to the tools, so an installed skill needs no edit.
- ITAM's **own model calls** go through the plugin's model gateway
  (`server/providers/itam/ai-model.ts`: `openSession`, `askJson` with a zod
  shape spelled out as JSON Schema, asked once more when the reply does not
  hold it, and `readSkill` from the library), with the default chat model
  of Agent 团队 → 模型 (`itamModel`). They
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
- **The AI working language** (2026-10-20, `ai-language.ts`): everything
  the models write — the form readings, the approval review, MDM 跟进 — is
  in `general.aiLanguage` (设置 → 通用 → 基本设置), `auto` meaning the
  deployment's locale (`APP_DEFAULT_LOCALE`, then `i18n.defaultLocale`),
  never the reader's interface. `aiLanguageToken` answers it synchronously,
  read at start and kept current through `settings.onSaved`. Asset
  Steward's chat still answers in the language it is asked in.
- Both diagnoses also return the person's description tidied
  (`description`: every fact they gave, nothing added, at most 200
  characters), shown under the result with 填入 (`TidiedDescription`); it
  replaces what they wrote only when they choose to (2026-10-20).
- **报废诊断** (2026-10-20, task `disposalTriage`, grant `disposals.create`):
  the disposal's description is the material and the page sends its
  `deviceIds` (the first twenty are read); the server reads each device as
  the person with `repairFacts`, which also gives its `ownership` and
  holder. The model fills the reason, method (`returnToLessor` for anything
  leased or borrowed) and data wipe (`notRequired` only for devices that
  hold no data), says `dispose` or `reconsider`, and names the devices that
  should not be disposed of yet. The form (`client/pages/itam/disposals/
triage.tsx`, under the description) fills only what is still empty,
  marked 请核对. It helps the requester before submitting; the approval
  review weighs the request again for the approver.
- **维修单整理** (2026-10-17, task `repairTriage`, grant `repairs.create`):
  the fault description is the material and the page sends only
  `deviceId`; the server reads the device as the person (`repairFacts` in
  `ai-reading.ts`: model, age, warranty, book value when they may see
  costs, the last repairs, and how often its model was repaired in the last
  year by kind) and the model answers the kind of fault, repair / replace /
  inspect, how to repair it (the method: vendorWarranty only under
  warranty, which the facts state as \`underWarranty\`; null to replace) and
  at most three reasons, the first always the warranty (2026-10-20). The
  form fills the kind, and the method while none is chosen, marked
  请核对, and shows the rest under the fault description, which the form
  starts with since 2026-10-20 (`fieldFooters` / `autoFocusField` of
  `RecordFormDialog`); told to replace, it offers 改为创建报废, which
  opens a disposal for the device with the fault and reason
  `uneconomicalRepair` (`onReplace`). The person decides. Chosen over a
  background agent because it is asked at the moment a repair is filed,
  with the material on screen.
- **读维修单 / 读处置证明** (2026-10-23, tasks `repairReport` with grant
  `repairs.complete`, `disposalCertificate` with `disposals.execute`): a box
  at the top of 完成维修 and 执行报废 (`DocumentReading` in
  `client/components/itam/ai/document-reading.tsx`) takes pasted text and
  any number of files, chosen or dropped, read together as one material.
  Each file is attached to the record first and read as text through
  `POST /itam/attachments/:ownerType/:ownerId/document-text`, which reads
  only a file linked to that record, under its `read`. The server builds the
  context from the id the page sends (the repair and its device, or the
  disposal's devices with their serials) and checks the reading against the
  register: a repair report's or quote's device — its printed serial
  (`serialMatches`) or another make and model the model names
  (`otherDevice`) make `deviceMatches` false, shown as 单据上的设备不是这台, a
  certificate's serials (`missing`, `extra`) and its recipient matched to a
  vendor by name (`recipientVendorId`). The dialog fills only what the
  document states, marks `uncertain` fields 请核对, and saves nothing until
  the person confirms.
- **报价 / 修还是换** (2026-10-23, task `repairQuote`, grant `repairs.update`;
  migration `202610270004_repair_quotes`): a quote arrives while the device
  is away, so it is recorded on the repair page (记录报价 beside 完成维修,
  `client/components/itam/repair-quote.tsx`), never in the completion. The
  dialog reads as 完成维修 does (2026-10-23, replacing the AI 整理 /
  表单录入 tabs it had first): the document box above the form; reading a quote weighs
  it in the same call, and a typed one is weighed with 评估修还是换. Advice belongs to the amount
  and work it was given for — changing either hides it until weighed again
  — and is saved with the quote, so the repair keeps the advice it was
  given at that price
  (`quoteRecommendation`, `quoteReasons`). Without the advice's reasons the page
  shows the rule in their place — the quote's share of the book value,
  amber from half, and a passed replacement date — and 继续维修 / 改为报废 for whoever may finish the
  repair. 改为报废 records `quoteDecision`, completes the repair as
  `scrapped` (改为报废, its own ending beside `cancelled`) with the device
  to pending disposal, and opens a disposal
  filled from the quote. A new quote clears the decision; completing
  defaults its cost to the quote.
- **Work agents** (2026-10-16, after
  NocoCRM's): agents that work on a record without being asked in a
  conversation, and only suggest. Until plugin 1.0 each was an online
  agent of the plugin, created at start, whose model and instructions an
  administrator set on Agent 团队 → Agent; 1.0 deleted them (2026-10-20). A
  run now asks the gateway with the default chat model and the instructions
  ITAM writes for the work (`workRun` in `ai-model.ts`,
  `workInstructions` in `server/providers/itam-agents/work-agents.ts`), and
  its method is its skill in the library (`WORK_SKILLS` in `skill.ts`),
  which administrators edit on Agent 团队 → 技能. Each run
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
    else). The card offers the one decision its comment was drafted for
    (批准 or 拒绝, 2026-10-23); the other way is the request's own 审批 after
    忽略. Deciding from the review is the request's own decision under its
    `approve` grant (`POST /itam/agentRuns/:id/decide`, the run accepted
    first so its own `settled` leaves it so, reopened when the decision is
    refused); 忽略 leaves the request waiting; 修改 (按我的意思重做 until
    2026-10-16) runs again with the approver's words, replacing the waiting
    one. The card offers no 讨论: a conversation about the request went the
    same day.
  - **Where it shows**: 收件箱 (`/inbox`,
    first in the menu, its badge the runs waiting, `useInboxCount`) is the
    template's inbox block with the reviews added to its To do view as a
    collection category (`client/pages/itam/inbox.tsx`; a suggestion shows
    its request's own page beside the list, 2026-10-16), and NocoCRM's
    application changes to the block (`client/extensions/nocobase-inbox/`,
    each marked): the two views are tabs labelled AI 建议 (first, the
    default, counting what waits) and 通知 (with 全部标为已读 at its head);
    `/notifications` and the bell open 通知 (`?view=all`). A notification
    ITAM sent shows the record it is about beside the list — the record's
    own page through `RecordPane`, at the comment its `?focus=` names — and
    on a phone opens that page (2026-10-16, after NocoCRM's): the block's
    source asks `/api/itam/notices` which record each of the reader's own
    in-app items opens (`server/providers/itam/notices.ts`), and the
    renderer is `client/components/itam/inbox-notices.ts`. The request's page shows 等你决定 under its
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
  - **The demo never asks a model** (2026-10-16). Importing it filed and
    decided dozens of requests and pulled from the demo's platforms, and
    each set an agent to work: a hundred approval reviews, most superseded
    a moment later, and an MDM follow-up. `onRequested` is now told the
    request's context and the agents' provider skips `sourceType: 'demo'`;
    `onSynced` skips a pull with trigger `demo`. The demo writes the
    suggestions instead (`demo-suggestions.ts`): a review per request
    still waiting, the MDM follow-up through `afterSync(by, { answerer,
locale })` — its own plans, the answers given — and the joiners'
    picks through `advise(personId, { runner, trigger: 'demo' })`. Each
    reads its numbers and tags from the records, so the text matches
    whatever the import made. A new agent or a new demo request needs its
    suggestion written there too.
  - **No agent for what a rule decides** (2026-10-17). 离职回收 and
    授权续费 were built as work agents and removed the same day: what a
    leaver hands back is the rule in `recovery.ts`, and what a renewal
    turns on (seats in use, seats leavers hold) is counted, not judged —
    the model could only guess what the register does not hold (who will
    need the software). A work agent is for a judgement a rule cannot make
    and the register holds the material for, as 审批审阅 has. Removing one
    takes it out of `AGENTS` and `WORK_AGENTS`, and 收件箱 and
    its count read only the agents in `AGENTS`, so its old runs stop
    showing (the plugin agent it once had went with plugin 1.0). The plan
    operations they added (`adjust_entitlement_seats`,
    `set_entitlement_auto_renew`) stay for Asset Steward.
- **完善** (2026-10-20) on a category's page header (`RefineCategoryAction`,
  for whoever may update it while a model is there) suggests the whole
  category at once — rules, defaults and extended fields — in the dialog
  that creates one (`CategoryCreateDialog` with `record`): it opens on
  "正在完善…", asks task `categoryFields` (the category as the person reads
  it, its kind's other categories, under `categories.update`), and shows the
  form with each value it changed tagged 修改 (what it was on hover, the
  dialog's `changes`), the fields under it tagged 新增 or 修改
  (`FieldTemplateEditor`'s `marks`; a field's key never changes, its changes
  come as `changes` with a reason), and the column beside for what it said
  and a line to adjust (task `category` with the form, the category itself no
  duplicate and never its own parent). Saving updates the category; closing
  drops it all. Turning on straight-line depreciation brings useful life and
  residual rate with it. The 扩展字段 card itself only edits by hand: a
  suggestion there for the fields above it read wrong.
- **What AI wrote is tagged in the history** (2026-10-20): a save from
  AI 整理 or 完善 sends `$origin: 'ai'` in its input (`useItamMutations`
  turns it into `?origin=ai`; the master-data routes pass it to the service),
  so its lines carry `origin: 'ai'` beside the person who saved them; the
  timeline tags them ✨ AI 建议, and a plan Asset Steward proposed
  (`agent`) ✨ 资产管家提议. A route that saves what AI filled passes the
  origin the same way.
- An AI create meets the page dialog's bar: `REQUIRED_ON_CREATE` in
  `server/routes/itam/ai-records.ts` lists what each create dialog requires
  beyond its input schema (conditional ones included, and a device's serial
  when its category requires one), checked when a plan holding a
  `create_record` step is proposed and again when it runs. A new required
  field on a create dialog is added there too. Its field guide
  (`createFieldGuide()`, generated from the routes' own schemas on first
  use — at load it ran before those schemas were loaded once the tools
  imported it from a provider) is what `itam_plan_ops` shows, so a field
  added to a page reaches the assistant by itself.
- **Asset Steward chooses a joiner's equipment when asked** (2026-10-06,
  `server/providers/itam/onboarding-advisor.ts`, migration
  `202610060002_onboarding_runs`), reversing "nothing AI runs outside a
  conversation" for this one job. The rule picks among identical laptops by
  place and warranty; Asset Steward also weighs repairs, the replacement date, notes
  and the business notes, and says why. A run is one call to the Agents
  plugin's model gateway (`createAssistantRunner`, `openSession` /
  `askJson` in `ai-model.ts`, template 1.0.0-beta.64) with the default chat model and
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
  A run starts **only when the 入职负责人 asks** — 挑选 / 重新挑选 (重新建议 until 2026-10-22; each says what it does on hover)
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
- The new purchase order's AI 整理 fills **the form's own fields**
  (2026-10-30), not a list kept beside them: the dialog sends `fields`, made
  from the field definitions it shows (`captureFields`,
  `client/lib/itam/capture-fields.ts`) — key, label, type, options,
  `reference` and the field's own rule, its `aiHint` — and the reading
  answers `{ values, uncertain, lines }`. The shared method is the
  **`form-capture`** skill (`ai/skills/form-capture/SKILL.md`, title AI
  organise, `READING_SKILLS`), which names no ITAM object so any form can
  use it; what is particular to a form stays in its task prompt
  (`TASKS.purchaseOrder`: the lines and the catalog) and in its fields'
  `aiHint`. The server adds `records`, the names each reference's register
  holds (`referenceNames`, at most 300, only registers the person may read),
  so the reading writes the register's name for "marketing team" or 東京
  rather than the material's own; `resolveFields` in `purchase-capture.ts`
  then checks each value by its type, and a reference matching nothing
  comes back in `unplaced` under its key. A new manufacturer is filled the
  same way (2026-10-30): its fields' `aiHint` carry what the task prompt
  said of each, the reading answers `{ values, uncertain, sources }`, and
  the task prompt only says the fields come from the web pages rather than
  the material, which is usually just the maker's name. Models and
  software products keep the catalog skill, and the repair and disposal
  diagnoses are judgements rather than forms, so they keep their own
  prompts; moving a form onto the skill means giving its fields an
  `aiHint` where the generic method is not enough. Beside the form
  the panel is as tall as the form (at least 24rem) and its adjustments
  scroll inside it (`CaptureTurns`, shared with the model and category
  dialogs); on a phone the panel comes above the form. A document dropped
  on the material is taken as the upload, and a picture is refused before
  it is uploaded, since only text is read.
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
  types the maker and the model, and the model fills the rest from the web
  when it can be searched (see the web above), else from what it reliably
  knows, and the dialog says which. How to look a record up
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
  **完善** (`EnrichAction` in
  `client/pages/itam/master/master-domain-parts.tsx`, for whoever may update
  the record). Since 2026-10-21 it opens the record's own form, as a
  category's 完善 does: `MasterCreateDialog` with `record`, which runs the
  same `model` / `softwareProduct` reading as AI 整理 as it opens, with
  `context.refine` (the server adds `REFINE_READING`: check and complete
  the record, keep what is right) and the web when there is one. The form
  marks 修改 where the reading differs from the record (`changes`, the old
  value in the tooltip), the record itself is no duplicate, an adjustment
  goes beside the form, and saving updates the record with `$origin: 'ai'`
  (AI 建议 in its history). Until then (2026-10-06, as AI 补充) it asked
  Asset Steward in the chat for an `update_master_record` plan, which the
  catalog skill and the tool still support.
- A manufacturer is looked up on the web too (2026-10-21, the `manufacturer`
  reading: name, official site, support site, business support phone and
  mailbox, only when a page states them). `ManufacturerCaptureDialog` is
  its one form, opened three ways: 创建制造商 beside an AI 整理 that named a
  maker the books lack (looked up as it opens), 创建制造商 on the list
  (AI 整理 / 表单录入), and 完善 on a maker's page (`context.refine`, 修改
  where it differs, saved as an update). What a reading asks for when it
  fills nothing is its reply, not an error (`CaptureFailure`, every AI
  整理).
- `ai.llmServices` in `config.yml` (typed by `server/config/ai.ts`, this
  application's own section since template 1.0.0-beta.64) is read **once**:
  at a start where the Agents plugin has no model service of that name, it
  is created there (`model-services.ts`), and from then on the service is
  the plugin's, edited on Agent 团队 → 模型 — a key changed in `config.yml`
  later does not reach it. The plugin stores keys encrypted with
  `secrets.keys`, so a configuration without one cannot create them: the
  start logs a warning and the assistant has no model until it is added.
- **On a Demo Mode deployment nothing can be sent to Asset Steward**
  (2026-10-25). The plugin refuses every write, and a new conversation is
  one (`DEMO_READ_ONLY`), so `useAgentReadiness` answers unavailable with
  `ai.demoReadOnly`: the global search takes no question, and the
  panel's and the conversation page's composers get `useDemoChatInput()`.
  The dock still takes one and opens the panel on a new conversation with
  it in the composer (`useAskDraft`), so a visitor sees the step up to the
  send. The conversations the demo comes with stay readable. A question the dock could not send now says why in a toast
  and stays in the box; before, the box stayed open on it without a word.
- **Demo Mode opens on the demo's first conversation** (2026-10-25). The
  demo writes its conversations so the fixture's first (the leaver's, with
  its plan) is the newest and heads the list. ✨ opens the latest when the
  panel holds none, and on a Demo Mode deployment also when the one it was
  left on is no longer the account's (`useToggleAssistant`); a panel
  restored open on such a conversation moves to it as well
  (`useDemoConversationFallback`, in `ItamChatPanel`). The daily reset and
  the account switcher made the remembered one gone more often than not.
