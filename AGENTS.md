# Application Development Guidelines

This repository is a NocoBase Solution. The NocoSolution repository is cloned into `nocosolution/`, which this repository ignores: `nocosolution/guidelines/` holds the series-wide guidelines, starting with the guideline `solution-guideline.md`, and `nocosolution/NocoITAM/` holds this Solution's plans and phase documents. NocoSolution is a private, internal repository, so the clone is optional: code, builds, tests and CI never depend on it. Without access to it, `nocosolution/` does not exist, and every instruction below that refers to it is skipped.

- At the start of work, run `git pull && { if [ -e nocosolution/.git ]; then git -C nocosolution pull --ff-only || true; else GIT_TERMINAL_PROMPT=0 git clone --quiet --sparse https://github.com/nocobase/NocoSolution.git nocosolution 2>/dev/null && git -C nocosolution sparse-checkout set guidelines NocoITAM || true; fi; }`. The first run clones NocoSolution with only `guidelines/` and `NocoITAM/` checked out; later runs pull it. Without access to NocoSolution the clone fails silently and leaves nothing behind; that is expected and not an error. It is a separate repository, not a submodule, so nothing here records which of its commits is checked out. To read another Solution's documents, for cross-Solution integration, run `git -C nocosolution sparse-checkout add <OtherSolution>`; `git -C nocosolution sparse-checkout disable` restores the full tree.
- Before drafting or revising a plan, changing the skeleton, adding a temporary implementation, or designing cross-Solution integration, read the whole guideline `nocosolution/guidelines/solution-guideline.md`.
- Every other file in `nocosolution/guidelines/` states at its top what it covers and when it applies; before a task, check them and follow the ones that apply to it.
- Do not edit anything in `nocosolution/guidelines/`; in `nocosolution/`, change only `nocosolution/NocoITAM/`. When a plan departs from the guideline or needs something it does not cover, mark it in the plan as a departure from guideline section X.Y with the reason, or as a proposal for the guideline; the guideline's maintainer decides whether to update it.
- Changes to `nocosolution/NocoITAM/` are commits to NocoSolution, not to this repository: make them on a branch in `nocosolution/`, push it and merge it through a NocoSolution pull request, then switch `nocosolution/` back to `main` so the start-of-work command keeps it current. When a change here needs a document change there, open both and link each from the other.
- Never copy text from `nocosolution/` into this repository; write English documentation here instead.

This is a NocoBase 3 application. Do not apply globally installed NocoBase 2 Skills. You are building the application itself — its pages, its API, its database tables. Everything under this directory is application-owned source code that you may edit directly.

Do not create a plugin to add a feature. Plugins are separately published packages for capabilities shared across several applications; building one for this application's own feature adds a package boundary, a version, and a release process to work that belongs in `client/` and `server/`. Create one only when the user explicitly asks for a reusable published package.

## Default template scope

Default is the clean application starting point. It registers product capabilities but no `app-plugin-*-example` plugins, example pages, application sample services, or sample APIs. Keep runnable demonstrations in `app-template-examples`. Application-owned server routes start empty; the only built-in application provider exposes Authorization Permission Sets as direct roles in the Users page. The only application page is a localized homepage.

`database/main/` starts empty for application-owned migrations and seeds. Do not add article history, demo seeds, or compatibility copies from Examples to this template. Existing installations retain their own executed migration sources when upgrading.

## This application: ITAM

This application is the IT Asset Management system described in its
specification, `nocosolution/NocoITAM/SPEC.md` (in the optional NocoSolution clone; edit it
with targeted replacements only, never a formatter), built phase by phase per
`docs/IMPLEMENTATION_PLAN.md`. Read both before adding a feature; the plan
records which phase owns what and the decisions already taken, and stands on
its own when the clone is unavailable.

Where ITAM code lives, on top of the template layout below:

```text
server/providers/itam/        Services (settings, numbering, history, master data, …)
server/providers/itam/collections.ts  Collections as authorization sees them (actions, fields, cost fields)
server/providers/itam/errors.ts       Domain errors that routes map to HTTP responses
server/routes/itam/           /api/itam/* routes; http.ts holds the shared plumbing
client/lib/itam/              API hooks, field metadata, formatters, reference-name lookup
client/components/itam/       The shared UI kit (page header, data table, detail page, forms, …)
client/pages/itam/            Pages; list / detail pages are the generic domain pages driven by a DomainConfig
                              (master data: masterDomain() in master/master-domain.tsx, from client/lib/itam/master-data.ts)
client/layouts/ai-panel.tsx   The assistant side panel and header toggle (application chrome)
ai/                           The ITAM AI employee and its tools, loaded by the AI plugin
tests/support/                In-memory database and test-app harness with auth / authz doubles
```

Rules learned while building it:

- Inside `database.transaction(async (connection) => …)` every read and write,
  including calls into other services, must go through `connection.query`. The
  SQLite pool holds one connection, so a read through `database.query()` while
  a transaction is open waits forever. Services that may run inside a
  transaction accept an optional `connection`.
- A list page whose detail page is a child route renders `useOutlet()` first
  and shows the list only when no child matched; pages own their outlet.
- A datetime reads back as text: `YYYY-MM-DDTHH:mm:ss.SSS` local, or UTC with
  `Z` for a `datetimeTz` field. Format it through `client/lib/itam/format.ts`
  (which still accepts the epoch milliseconds beta.22 wrote), never
  `String(value)`. Compare one in a query through `dbDateTime()` in
  `server/providers/itam/dates.ts`: a `Date` bound into a comparison matches
  nothing, silently. Migration `202609230006_normalize_legacy_datetimes`
  rewrote the epoch values an upgraded database still held, because SQLite
  compares the two forms as text and sorted every legacy value first.
- A JSON field is encoded by the query layer itself since template beta.43, so
  a write passes the value — `set({ data: row.data })`. A `JSON.stringify`
  before the write stores the JSON of the JSON: the reads parse a string
  defensively and look right, while a JSON condition can never match. The read
  side hands back the decoded value; the tolerant `typeof value === 'string'`
  helpers stay only for rows written before this was fixed.
- `better-sqlite3` must stay at 13.x: 12.x aborts Node 24 with
  `RemoveEnvironmentCleanupHook` assertions during garbage collection.
- `client/react-providers.ts` mounts a TanStack QueryClient and the tooltip
  provider (`client/lib/itam/query-provider.tsx`); pages use the hooks in
  `client/lib/itam/api.ts` rather than Refine data hooks.
- A service that performs another domain's step inside its own transaction
  calls that service's `*Within(connection, …)` variant (or passes the
  optional trailing `connection`) with `unrestricted(collection, action)`
  conditions: the route already authorized the outer operation, and a nested
  `database.transaction` would deadlock on the single SQLite connection.
- Notifications go through `itamNotifierToken` after the transaction
  committed; it never notifies the actor, never throws, and needs the
  `notification.channels` in-app entry in `config.yml` to deliver.
- Time-driven work lives in `server/providers/itam/maintenance.ts`
  (`runJob('leavers' | 'daily' | 'monthly')`) and is scheduled through the
  scheduler plugin (2026-09-28): `server/providers/itam-schedules.ts`
  registers the `app.itam.maintenance` target and defines
  `itam.mark-leavers` (01:50, before the daily run; 人员在职状态更新 since
  2026-10-06, which also moves 待入职 joiners to 在职 on their first day),
  `itam.daily-maintenance`
  (02:00) and
  `itam.monthly-depreciation` (1st, 03:00) in the ITAM time zone,
  so each execution — status, reason, counts — shows at 设置 → 自动化 → 定时任务
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
  `client/lib/itam/format.ts`). Neither 需要关注 nor 待办 carries a count
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
- AI resources live in `ai/` (employees, tools). The AI plugin does **not**
  scan that directory: it registers only what an `AIResourceRegistrar` hands
  it, so `ai/index.ts` (`ItamAiResources`, `ITAM_TOOLS`) lists the employee
  and every tool, and the ITAM provider's `boot()` registers them — through
  a dynamic import, because the tools import the provider's services. A tool
  left out of `ITAM_TOOLS` does not exist at runtime
  (`tests/logic/ai-tools.test.ts` checks the employee names none that is
  missing). A tool gets only the actor, so it reaches the ITAM services
  through `server/providers/itam/ai-bridge.ts` and authorizes with
  `scopeFor(userId)`. Writes are the plugin's own confirmation flow (decided
  2026-09-27, following the CRM): each write tool is
  `defaultPermission: 'ASK'`, the plugin holds the call until the user
  confirms its card in the conversation, and `runWrite` in `server/providers/itam/ai-writes.ts` then
  runs it as that user through the page's service. A refusal is **thrown**
  (`refuse()`), never returned as `status: 'error'`, which would leave the
  card pending; a batch (return devices, reclaim seats) runs row by row and
  fails only when every row does. The card is
  `client/components/itam/ai/write-card.tsx`, registered for every write
  tool in `client/layouts/ai-panel.tsx`; before offering 确认 it asks
  `POST /itam/ai/screen` (arguments and grants). There is no action center,
  proposal table or `/ai-actions` page any more (migration
  `202609270005_drop_ai_actions`). A page asks Ava about itself through
  `useAiPageContext` (`client/lib/itam/ai-context.ts`): the element registers
  as page context and `ask()` sends it as the message's `workContext`, so its
  data goes along and its frontend tools (`presentRecords` on the
  global search, `addDraftLines` on purchase order lines — ALLOW, they
  change only what is on screen) become Ava's to call. The device list's
  own natural-language filter (`applyFilter`) went on 2026-10-05: asking
  Noco from the global search does the same for every list. There are no embedded capabilities of our
  own any more (`202609270006_drop_ai_embedded`). Write refs in effects and
  give frontend tools as typed object literals: the React Compiler lint
  refuses a ref read during render, and cannot see that
  `defineAIFrontendTool()` does not run `execute`. The global entry is
  a button in the header, left of the reader's menu (`AiHeaderButton` in
  `client/layouts/ai-panel.tsx`, through `HeaderActions`' `showAssistant`,
  2026-10-06), which opens the panel on the conversation in progress and
  closes it again; the plugin's floating launcher at the lower right went
  with it, since it covered that corner of every page. Ava's name, role, bio and greeting come from the
  locales (`ai.employee.*`): the plugin keeps a code-registered employee's
  texts in one language, so the panel wraps the service that lists employees,
  as the CRM does. The registrar also switches the plugin's own built-in
  employees off once and sorts Ava first (`ai/index.ts`), and keeps Noco's
  skill selection to this application's skills: the first registration
  writes all of `ITAM_SKILLS`, and a skill added later reaches a saved
  selection **once** — `ai.offeredSkills` in ITAM's settings records what
  was offered, so one the administrator removes stays removed (2026-10-06;
  until then a new skill never reached a deployment that had registered
  before it, and `getSkill('onboarding')` answered "Skill not found"). A new
  skill needs only its entry in `ITAM_SKILLS`. Every AI shortcut on
  a page is green text with a sparkle (`AiShortcut`,
  `client/components/itam/ai/ai-shortcut.tsx`), not a button, so it does not
  compete with the page's own actions. The chat's header has 展开 / 收起到侧边
  and 关闭: one `ChatSurface` switching between side panel and dialog, so the
  conversation stays mounted, and only the side panel pushes the page aside.
  The header button shows the NocoBase AI chat mark, which the Registry copy
  exports for it (`NocoBaseAIChatIcon`, marked "Application change (ITAM)";
  the unused floating launcher keeps its own two such edits). Nothing AI
  ran outside a conversation from step 3 (2026-09-27, migration
  `202609270008_drop_ai_findings`: no findings, no inspection, no instant
  check, no direct model calls) until the onboarding advisor (2026-10-06,
  below), which is the one exception: an unattended run, as a named person,
  writing only its own suggestions. Whether the assistant is available is the
  plugin's to say — `/itam/ai/status` reports a usable model and Ava enabled
  at 设置 → AI; ITAM's settings keep the business notes and the
  入职建议 switch (the web
  search switch went with `202609270009_drop_ai_web_search`: web search is
  the plugin's, per conversation). The rule-layer reminders stay: they need no model. The
  chat (`AIChatProvider`) mounts inside the panel only once `useAI()`
  reports discovery ready, Ava listed and a usable model: a chat mounted
  before discovery keeps the placeholder model it started with, and the
  Registry's send then returns without a word (the send button "does
  nothing"). Page shortcuts open the panel before triggering their task, so
  the chat that runs it is mounted. Creating
  any record and the stock / receiving operations are tools too
  (`server/routes/itam/ai-records.ts`, 2026-09-27): `itam_create_record`
  takes a collection and the fields its page's create schema accepts — the
  route's own zod schema, exported for this, so the assistant can propose
  exactly what the dialog can send — and calls the same service under the
  same `create` grant; `itam_stock_in` / `itam_issue_stock` /
  `itam_take_back_stock` / `itam_receive_purchase_line` wrap their
  operations. Its field guide is generated from those schemas
  (`CREATE_FIELD_GUIDE`), so a field added to a page reaches the assistant by
  itself. Flow steps (submit, decide, execute a disposal, mark ordered) stay
  on the pages. `ai/` compiles with the server
  (`tsconfig.server.json` includes it; `ai/tsconfig.json` lets lint find
  it), so anything it imports is a `dependency`.
- An AI create meets the page dialog's bar: `REQUIRED_ON_CREATE` in
  `server/routes/itam/ai-records.ts` lists what each create dialog requires
  beyond its input schema (conditional ones included, and a device's serial
  when its category requires one), checked by `/ai/screen` after the grant
  and again when the call runs. A new required field on a create dialog is
  added there too. The write card labels a create's fields from the
  collection's own field definitions (`definitionsOf` in `write-card.tsx`),
  and the plugin hands a renderer the tool's `content` itself as `output`.
- Receiving's `extra` accepts only what the receipt dialog asks for each
  line type (`RECEIVE_EXTRA` in `procurement.ts`), because it is laid over
  what the order settled; and a purchase line's `itemType` must be its
  model's category kind (`setLines`).
- `client/extensions/nocobase-ai` is the AI plugin's Registry item copied
  verbatim except where a comment says `Application change (ITAM)` — the
  floating trigger (from the CRM), the chat following the application's
  language (`use-ai-translate.ts`), tool step titles from `ai.tools.*`
  (`tool-call-card.tsx`), and two fixes without which page tools never
  ran: the transport sends the work context's `frontendTools` on the
  request, the only place the server reads them (`chat-transport.ts`), and
  an `executeFrontendTool` call is offered to the automatic approver,
  because this plugin version always marks it as needing approval
  (`use-automatic-tool-approval.ts`; the client still runs only a tool the
  page registered `ALLOW`); and, as in the CRM, sending a new message first
  declines every card still waiting (`declinePendingApprovals` in
  `chat-provider.tsx`), because the plugin's own handling of a message over
  a pending call leaves a DeepSeek conversation unable to continue; and a
  task may carry files already uploaded (`AIEmployeeTask.message.attachments`,
  `types.ts` and `triggerTask` in `chat-provider.tsx`), which receiving by
  delivery document hands its document over with. It is
  lint-ignored and upgraded by three-way
  merge, which keeps those, never rewritten. Application code imports it
  through `@/extensions/nocobase-ai`.
- `pnpm` 11 prints "Already up to date" on stdout before a script runs; a
  script whose stdout is parsed (see `scripts/utils/cli-hooks.mjs`) must pass
  `--silent`.
- CSV in and out goes through `server/providers/itam/csv.ts`; an importable
  collection is an entry in `IMPORT_SPECS` (`imports.ts`) naming its fields,
  header aliases and the reference collections resolved by name, plus its
  name in `IMPORTABLE` (`client/lib/itam/data.ts`). The client wizard is
  generic (`client/components/itam/import-export.tsx`), so a new collection
  needs no client code. A spec with `group` builds one record from several
  rows — purchase orders do, one row per line: `by` names the column the rows
  share (the file's own order number; the application still assigns its own),
  `lines` maps row fields to the child input's keys, and every other field is
  read from the group's first row, where a later row may repeat it but not
  contradict it. A grouped import creates only — there is no key to match an
  existing document on — and a group whose row fails is not written at all,
  because an order missing one of its lines is wrong in a way nobody sees.
  `commitGroups` writes the document through its service and the lines
  through `setLines` with `unrestricted()`, since the route authorized
  `create` on the collection and the draft being filled is the one this same
  call just created.
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
- The application is unreleased, so seeds are edited in place to the data
  wanted (no compensating seeds). An executed seed whose checksum changed
  is reported at start-up, and re-running a seed never rewrites present
  rows, so after editing one run `pnpm --silent data:reset --demo`
  (`scripts/data-reset.ts`): it wipes the ITAM tables and the ITAM
  seed history, re-runs the seeds and regenerates the demo, keeping users,
  sessions and permission sets. It is a script, not a `pnpm nocobase app`
  command, because since `@nocobase/app-cli` 1.0 (template beta.49) every
  application command ships in the deployment's `dist/cli`, and one that
  wipes the database must not. Migrations stay immutable once applied.
- Seeds carry data, not UI text: the category seed writes names and field
  labels in the deployment's default locale (`APP_DEFAULT_LOCALE`, else
  `i18n.defaultLocale` in `config.yml`) because a seed's context holds only
  the database. Tests pin `APP_DEFAULT_LOCALE=en-US` before seeding.
- Demo data uses the seeded categories (`cat-laptop`, …), manufacturers
  (`mfr-apple`, …), models (`model-macbook-pro-14-m3`, …), software
  products (`sp-figma`, …), locations (`loc-hq`, …) and departments
  (`dept-rd`, …); vendors and people are seeded too (`vendor-equipment`,
  `person-li-xiao`) but the demo creates its own, demo-marked vendors and
  people because it mutates them (a leaver, seat holders); it creates the
  rest of its master data itself;
  it refuses to run when a seed record is missing. The seeds reuse an
  existing manufacturer or product of the same name (names are unique), so
  a test that seeds must not create "Apple" or "Figma". Model seeds must be
  common models with their manufacturer part codes.
- Seeds may ship data files under `database/main/seeds/assets/`; the build
  copies that directory next to the compiled seeds. The model seed stores
  pictures the way an upload does (bytes under `<storage>/objects/`, a row
  in `itamFiles`), so tests point `APP_STORAGE_DIR` at a temporary
  directory (`tests/support/setup.ts`).
- Demo data is generated through the services, never by raw inserts, and
  every created id is tracked in `demoRecords`; `demo.clear()` deletes only
  what is tracked. Anything the generator creates must be deletable in the
  order `ORDER` in `demo.ts` lists. A date the services stamp themselves is
  corrected afterwards by a direct update, with a comment saying why — a
  loan overdue by a week, and `receivedAt` with its receipts, which would
  otherwise have an order placed in 2025 arriving today. The demo's requests
  are decided by another real account (`otherUser` in the provider prefers
  one that may approve purchase orders), so the approval trail reads as a
  colleague and the order left `pendingApproval` can actually be decided;
  with a single account it keeps a stand-in id and that order cannot.
  Purchase orders cover every status the list can show (2026-09-27: draft,
  审批中, 已批准, 已下单, 部分到货, 已完成, 已拒绝, 已取消), most of them two or
  three deep, and audit tasks every status of theirs (2026-10-05:
  `queuedOrder` and `auditTask` in `demo.ts`), so each board column holds
  cards. One placed order — PO-000020 on a fresh import — carries a line of
  every kind (desktops, keyboards, toner, memory, a perpetual licence and a
  subscription), so receiving it, by hand or from a delivery note, shows
  every way goods arrive. The extra orders are never received — receiving makes devices and
  stock — and the extra audits keep off the laptops, whose 400-day-old last
  count a matched count would stamp today.
  The two joiners are entered **last** (2026-10-06), because saving one sets
  Noco choosing their equipment, and four spare MacBook Pro 14s and two
  spare monitors give it something to weigh: the rule's pick (own floor,
  longest warranty) is SG-LT-050, whose keyboard was repaired twice, and
  SG-MON-006, with a dead pixel; SG-LT-053 is due for replacement within
  months.
- The ITAM settings page is **tabs**, one per settings document (基本设置,
  提醒阈值, 编号规则, AI 助手, 按送货单入库, 演示数据), the open one in the
  address as `?tab=` so a link can open it (2026-10-05).
- Demo data is imported and cleared from the 演示数据 tab of the settings
  page (after NocoCRM's, 2026-10-05): it lists the sign-ins the import
  creates — in the language picked before importing (中文 / English,
  `DEMO_LANGUAGES`; `POST /itam/demo/generate` takes `language`, else the
  deployment's locale), those of the import present after — and says when
  it was imported and how many records it holds. The language is not
  stored: `status()` reads it back from the demo's people, whose names
  differ per language. While nothing is imported, `DemoBanner`
  (`client/components/itam/demo-banner.tsx`, mounted under the header in
  `client/layouts/app-layout.tsx` — an application change to the layout)
  offers it to whoever holds the settings grant the demo endpoints require,
  links to `/settings/itam?tab=demo` and, dismissed, stays away in that
  browser. Clearing it takes its numbers too: `numbering.rewind()` moves
  each sequence back to just past the highest number still in use (never
  forward, only under the current prefix), so on a database that held only
  the demo the next import starts at PO-000001 again rather than climbing
  with every import. Real numbers are otherwise never reused.
- The demo creates its own sign-ins (2026-10-05, replacing the role
  accounts `manager` and `support`): the IT staff as people with names —
  two asset managers, 孙强 `sunqiang` and 吴静 `wujing`, and IT support
  周宇 `zhouyu` — and the leaver 陈杰 `chenjie`, who is IT support too and
  leaves on the day of the import (marked left last, the way 标记离职 does,
  so his handover snapshot is whole and his sign-in is disabled); each
  password is the username and 123. The other demo people are employees and
  have none. They are listed in `nocosolution/NocoITAM/SPEC.md ## 演示数据`
  and go through `DemoAccounts` (`demoAccounts()` in
  `server/providers/itam/index.ts`) rather than the `user` table, are tracked
  in `demoRecords` under `accounts`, and each is written to its person's
  `userId` — the staff have a person record in IT, named as their account
  is in the deployment's language — because the records they answer for
  name the account. 孙强 and 周宇 have a laptop each, 吴静 a laptop, a
  monitor and a phone. The account that generated the demo is the system
  administrator and no employee: it gets no person record, holds nothing
  and answers for no record — the demo is written as 吴静 (`writerId`), who
  raises the requests 孙强 decides; repairs and audits are 周宇's. `demoAccountUsernames()`
  keeps the retired `manager` / `support` so a reset still removes them.
  The requests are addressed to 孙强, not to whatever `otherUser` finds.
  Two traps: the users
  plugin's `remove` refuses without deletion hooks (so the authentication
  plugin's is used, after revoking the assignment), and that one is a soft
  delete which keeps the username and e-mail — the rows are purged
  afterwards, or regenerating collides. `pnpm data:reset --demo` builds a
  container without those plugins, so it **deletes** the demo accounts by
  name and creates none; generate from the running application for sign-ins.
  An account that talked to Ava owns AI conversations and usage events that
  reference the user row, so those are deleted first, with the account.
  It also deletes the three seeded Permission Sets so the seeds rewrite them
  — a seed writes a set only when it is absent, so editing a grant in one
  otherwise has no effect on a database that already ran it.
- Files under `public/` are served at the application base path; reference
  them with `resolveAppUrl('/samples/…')`, never a literal `/main/…`.
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
- Template beta.43 brought page authorization: an App page with no rule of
  its own checks a page grant named after its route. Since 2026-09-27
  `client/routes.ts` maps the app tree through `withPageGrants()`, which
  gives **every page with a `navigation` entry** the rule
  `page:<route name>/access` and skips everything else — a detail page and
  its tabs are reached through the list that already checked, and the
  sign-in pages are public. Which pages a role reaches is part of what the
  role is: IT support holds no 报表, so it has no entry for it rather than a
  page of refusals. The seeds have carried these grants since they were
  written (`IT_PAGES`); nothing read them until then, so a
  database seeded earlier is missing whichever pages arrived later —
  `ADDED_PAGES` in `reconcile-grants.ts` tops the seeded sets up at
  start-up, because a seed creates a set once and never touches it again.
  `WITHDRAWN_PAGES` is the other direction, for a page a role should no
  longer reach. A page's route name is the identifier stored
  grants reference, so renaming one migrates data;
  `tests/logic/client-routes.test.ts` pins the list. A page grant decides
  what is offered, never what is allowed — every endpoint still enforces its
  own authorization.
- Datetime columns are text since the sqlite driver became
  `@nocobase/db-sqlite`: a `Date` bound into a comparison matches nothing and
  raises no error. Compare through `dbDateTime()` in
  `server/providers/itam/dates.ts`; `tests/support/test-database.ts` registers
  the driver explicitly because it builds a manager without the application.
- Authorization conditions carry `scope` (`true` or a `FilterAst`) and
  `fieldAccess` rather than `filter` and `fields.input/output`;
  `authz-filter.ts` compiles the scope and `unrestricted()` builds the new
  shape.
- A Collection owns `read`, `create`, `update` and `delete` and nothing else.
  This application's own operations (`assign`, `issue`, `approve`, `export`…)
  are composite resources declared in
  `server/providers/itam/authz-resources.ts` (`defineCompositeResource`,
  stored as `{ type: 'composite', id }` with the policy
  `{ type: 'composite', scopes: { <collection>: <record access> } }`): one
  `itam.<collection>` per Collection that has them, each operation granting
  that Collection. The provider registers them with
  `authz.compositeResources.define` and lists them in the permission
  workspace's ITAM subsection of 业务权限 (`authz.ui.place`); they were
  "business resources" (`type: 'resource'`) until authorization
  0.2.0-beta.21 (template beta.49), and `202609280007_composite_grants`
  rewrote the stored grants. Asking
  the Collection for `assign` is answered with
  `UNKNOWN_DATABASE_RESOURCE_OR_ACTION` — a deny, with no error to notice.
  Every decision therefore goes through `decideWith` (routes reach it as
  `decideFor` in `server/routes/itam/http.ts`, the AI tools through
  `ai-bridge.ts`): it asks the resource whether the caller holds the
  operation, then asks the Collection for that operation's conditions with
  `params.operation`, and narrows the response fields to the caller's `read`
  grant. A stored grant names `itam.devices/assign`, which
  `202609240001_move_operations_to_resources` rewrote from the old
  `main.devices/assign`; the seeds write the composite shape through their
  `splitOperations` helper. `tests/support/test-app.ts` mirrors the
  catalogue, so a route that asks the wrong resource fails in tests. A route
  that decides by calling `authz.authorize` itself skips all of this: it is
  how the master-data writes returned an empty record until 2026-09-26.
- An `itam.<collection>` operation grants **no readable field of its own**
  (`resourceOf` in `authz-resources.ts` declares `.read([])`). It used to
  grant the Collection's whole field list, reasoning that a response is
  narrowed again by the caller's `read` grant — but `withReadableOutput`
  performs that narrowing by asking the Collection for the caller's plain
  `read` decision, and the operation's own expansion is one of the branches
  that decision is composed from. Granting every field there widened the
  very answer it was meant to be narrowed by, so field-level access was void
  for any role holding an operation on that Collection: IT support read
  `purchasePrice`, `bookValue` and `depreciatedAmount` on every device, and
  the product key and unit price on every entitlement, because they also
  hold `assign` and `export` (found and fixed 2026-09-27). What an operation
  may **write** is still its own grant. The route tests' authorization
  double grants by role and never evaluates a real policy, so this is not
  covered by a test — check it against a running application, by reading a
  list as a role whose `read` excludes a cost field.
- A stored grant states **one field list per action** — `fields: '*'` or a
  list of names, what a read returns and what a write accepts — not the
  pre-beta.43 `{ input, output }` pair. The plugin validates the shape and
  drops a policy it does not recognise, silently: a set written the old way
  grants nothing, and a Collection with no `itam.*` operation to grant it
  through (every master-data table) denies every read with
  `NO_OBJECT_PERMISSION`. `reconcileGrants` rewrites the old shape at start-up
  so an administrator's edits survive, and the seeds write the new one.
  Because a write grant therefore says nothing about what may be read back,
  `decideWith` asks the Collection for the caller's `read` grant and puts its
  fields in `fieldAccess.output` — which is what `outputFields` narrows a
  create or update response with. The test double mirrors the empty output of
  a write decision, so a route that decides without `decideWith` returns an
  empty record in tests.
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
  none is theirs), `MyWorkRecord.mine` where the record *is* the one thing
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
  (`POSITION_IN_USE`), while removing one takes its kit with it. The old
  `onboarding-kits` page grant is stripped (`STALE_PAGES`). Each kit row is
  chosen by asset type (设备 … 授权) and then a model of that type or, for 授权,
  a software product, and shows its asset-type tag first (`KitItems`). One per department and position is
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
  left is the shortfall. 全部执行 carries on past a refused item and
  names each refusal, and its toast counts what went through.
  `GET /itam/master/people/:id/onboarding` returns it; it writes nothing.
  The 归属 tab of an active person whose 入职日期 is ahead or within the
  last 30 days opens on 入职配备 (`OnboardingPlanCard`): the kit, 已配备
  N / M, and one button per proposal through the operation that already
  exists — 预留 until the joining day while they have not started, 分配
  once they have, 领用, 分配席位 — with 全部执行 running them in order.
  The workbench's 入职准备 (`pendingOnboarding`, right after 离职交接) lists
  **joiners** — people entered in the register no more than 30 days before
  their first day (`isJoiner`; staff entered long after they started, such
  as a whole register imported at go-live, are not measured against a kit)
  — who start within 14 days or have started, for as long as their kit is
  not all in hand (`isPrepared`: each item held, reserved or marked 不需要;
  with no kit, while no device is held or reserved), granted by `reserve`
  (2026-10-06; it was the 7 days after the first day before). An item the
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
  is the `onboarding` skill (`ai/skills/onboarding/SKILL.md`): Noco reads
  the plan through `itam_onboarding_plan` (ALLOW, under the user's people
  grant), explains it, proposes exactly its proposals through the write
  tools — `itam_reserve_device` (ASK, granted by `reserve`, until the
  joining day) before they start, `itam_assign_device` after,
  `itam_issue_stock`, `itam_assign_seat` — and drafts one 新员工配备
  purchase order for the shortfall, asking for the vendor, which is why
  that step is Noco's and not a button (`itemType` on each plan line says
  what the line would be bought as). The 入职配备 card's green shortcut
  (让 Noco 准备) sends the plan as page context. A seat proposed to a
  person always names them as holder: the seat card shows 持有人 even when
  empty (`always` on the card's row), since an account-only subscription
  seat looked complete on the card while it belonged to nobody (found
  testing 2026-10-05). The kits are no longer
  listed in the seeded AI business notes, which point to 入职配置.
- **Noco chooses a joiner's equipment in the background** (2026-10-06,
  `server/providers/itam/onboarding-advisor.ts`, migration
  `202610060002_onboarding_runs`), reversing "nothing AI runs outside a
  conversation" for this one job. The rule picks among identical laptops by
  place and warranty; Noco also weighs repairs, the replacement date, notes
  and the business notes, and says why. A run is the AI employee driven from
  the server (`createNocoAgentRunner`): a conversation owned by the joiner's
  **入职负责人**, a fixed agent (`createAgent`, not `createAIEmployee`) run
  as that person with this job's instructions (`PROMPTS`) as its whole
  system prompt, no tool and no skill, and one `invoke` with a Zod
  `responseFormat`; the message is the joiner, the kit, the business notes
  and each item's candidates as JSON. Found running it against the real
  model (2026-10-06): as the employee, Noco's own prompt sent it to the
  business context — which also lists the user's open work — and to skills,
  so it summarised the workbench, answered about the other joiners and
  models nobody had in stock, or spent the run guessing skill names with
  `getSkill`, which no allowlist removes; and the user message must be
  `{ type: 'text', content }`, the chat's shape — a bare string is stored
  and reaches the model as nothing. An answer that keeps no valid pick is
  recorded as `failed`, not as chosen. It
  writes only its `onboardingRuns` row: per kit item (`OnboardingPlanLine.key`,
  `<target type>:<target id>`) the picks and a reason each, held by
  `validAdvice` to that item's own candidates and to as many as it needs.
  `plan()` puts a pick first **while it is still free** (marked
  `source: 'noco'` with its `reason`) and otherwise falls back to the rule,
  so a pick taken since needs no clean-up; `plan(id, { candidates: true })`
  is what the run is shown. A device Noco picked for one joiner (their
  latest finished run) is **held back** from every other joiner's
  candidates and proposals (`heldForOthers`), or two joiners of one
  department were both offered the laptop it had just chosen for the first. Runs are queued one at a time and start when a
  joiner 入职准备 lists has an owner, Noco has a choice (some item
  with more candidates than it needs) and the last run was not asked the
  same question (`inputs`: joining day, department, position, owner, kit):
  after a person is saved (`personSaved` on the master-data service), by
  the nightly `itam.onboarding-advice` task (02:30, after the daily run
  frees lapsed reservations; it also retries a failed run) and by 重新建议
  on the card, which only the 入职负责人 may press because the run is made
  as them (`POST /itam/master/people/:id/onboarding/advise`, `NOT_OWNER`).
  The owner is notified when a run they did not ask for found something.
  The card shows the run under its heading — choosing, chosen with
  Noco's summary and 查看过程 (the conversation, the owner's), or failed —
  and each pick's reason under its item; the buttons stay the person's.
  `ai.onboardingAdvice` in ITAM's settings (入职建议, on by default) switches
  it off; no usable model or Noco disabled starts nothing.
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
- `maybeDecide()` in `server/routes/itam/http.ts` answers `undefined` instead
  of refusing, for a route that reads several collections and must leave out
  the ones this caller cannot read rather than refuse the whole answer (the
  recovery endpoint does this per owned collection).
- There is no 收件箱 / 待办 page any more (2026-10-05): the to-dos are the
  workbench's board, and 通知 opens from a bell in the header
  (`client/components/itam/notification-bell.tsx`, a dot while anything is
  unread, shown by `HeaderActions` only in the app layout). The `/notifications`
  route stays, without a menu entry, so it checks no page grant;
  `reconcile-grants.ts` strips the stored `inbox` and `notifications` page
  grants (`STALE_PAGES`).
- An asset-type tag is outlined, not filled: the contract
  `[data-slot='badge'][data-tag='kind']` in `client/styles.css` gives it a
  border and no background, which is what tells it apart from a status tag
  beside it. Two traps found writing it: a single utility class loses to the
  two-attribute selector already there, and this theme is **monochrome** —
  `--primary` / `--secondary` / `--muted` / `--accent` all carry zero chroma,
  so `bg-primary/10` is grey. Only `--info` / `--success` / `--warning` /
  `--destructive` have colour.
- A value with no spaces in it — an e-mail address, a serial — needs
  `wrap-anywhere` **and** a `min-w-0` on every flex ancestor: `break-words`
  does not break it and a flex child refuses to shrink below its content
  without the one, so it spills past the card.
  `client/components/itam/collapsible-text.tsx` carries the first and
  `domain-detail.tsx` the second (`inline-flex min-w-0 … *:min-w-0`).
- `OWNED_BY_USER` and the recovery handlings live in
  `server/providers/itam/recovery.ts`, which is the shared home for
  offboarding knowledge: the 归属 tab lists from it, master data snapshots
  from it, the nightly job notifies from it and the workbench decides
  membership from it, and none of those owns the others. Every record in it
  names its person through `ownerId`; handing a purchase order, a disposal
  or a stocktake over hands its card over with it.
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
  共用密钥, 可重新分配 for a perpetual; 计费方式, 计费周期, 单价, 到期日期,
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
- Receiving **by delivery document** is the first work the assistant
  carries rather than answers (2026-10-05, the NocoITAM plan's first
  vertical; offboarding stays rules and people). 按送货单入库 on the order's
  lines card picks the file and opens 到货入库 already reading it:
  the file is kept as the order's attachment, a run is started
  (`receiptRuns`, `202610050003_receipt_runs`, `receipt-runs.ts`), and the
  assistant reads it in the `receipt` unseen chat under the `receiving`
  skill (`ai/skills/receiving/SKILL.md`) with `skillSettings.tools` limited
  to a read tool — the plugin enforces that list on the server — handing its
  reading back through its one page tool, `prefillReceipt`. The server's
  rules turn that into the plan the form opens on (`planReceipt`): a row
  whose part code is a line's model `code` goes there whatever the
  assistant guessed (`matchConflict` says when they differ), entitlements
  and unmatched rows are listed, never forced onto a line. Every value it
  filled carries a sparkle naming where in the document it came from, and
  loses it once the receiver types over it. Nothing is received until the
  receiver presses 入库; that batch closes the run (`saved`, with `final`
  and per-field `stats`: kept / changed / removed / added), its `received`
  events read `origin: 'agent'` under the receiver's name and name the
  document. A run belongs to whoever started it (`NOT_RUN_ACTOR`); closing
  the form discards it, a turn that handed nothing over fails it, and its
  conversation is deleted either way — the run is the record. 设置 shows
  the boundary, the acceptance counts and the latest runs (`GET
  /itam/ai/receipt-runs`, the settings grant). The server reads the
  document as text when the run starts (`document-text.ts`, kept in
  `receiptRuns.documentText`) and the page puts it in the message itself:
  the plugin parses an attached file into its own request only, and the turn
  resumes as soon as the page tool is approved, after which the model said it
  could not open the file. CSV and plain text are decoded as they are — the
  plugin's CSV loader takes the first line for the column names, so a
  delivery note's header block above its table lost every column past the
  second — and Excel, Word and PDF go through the plugin's own loader
  (`loadByWorker`), so any model reads them. Only a picture is attached,
  for a model that reads images; that is configuration, not code. Do not add
  an OCR library for them. 解析单据 on a draft's lines reads its document the
  same way (2026-10-05): the shortcut picks the file, keeps it on the order,
  asks `POST /itam/purchase-orders/:id/document-text` (only a file linked to
  that order, under `update`) and opens the chat with the text in the
  message, because the panel's own attachment was gone once `addDraftLines`
  was approved. Lines it adds take the place of the blank row an empty order
  opens on, which otherwise kept 保存 from being offered.
- 新建采购单 opens on **AI 整理** whenever the assistant is available
  (2026-10-06, after NocoCRM's lead and opportunity capture), with 表单录入
  beside it; without the assistant there are no tabs. The requester pastes
  what they have or uploads a document, and the assistant fills the dialog
  — in the `capture` unseen chat, limited to `itam_match_model`, handing its
  reading back through the page tool `fillPurchaseOrder`
  (`client/lib/itam/use-purchase-capture.ts`). It is still a conversation,
  deleted when the turn ends, so the 2026-09-27 rule — no model calls
  outside a conversation — holds; do not replace it with a direct
  structured model call. The server checks the reading before the dialog
  takes it (`POST /itam/purchase-orders/capture/match`,
  `server/providers/itam/purchase-capture.ts`, under `create`): a printed
  part code decides by the model's `code`, an id the assistant gives must
  exist, and anything else matches only by an identical name (a model with
  or without its maker in front; a vendor or department identical or the
  only one containing it). What matches nothing is listed above the form and
  never put on a line — an M4 must not become the M3 the books hold. A field
  or line the assistant was unsure of carries 请核对 (`ReviewMark`) until it
  is changed. Adjusting happens in the dialog, not the side panel, which a
  modal dialog leaves out of reach: each instruction is a new unseen turn
  with the material, the form as it stands (page context) and the request.
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
  out of a word-by-word search) — a different spelling of a model on the
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
  types the maker and the model, and the assistant **searches the web** for
  the rest — the one capture that does. It runs in the `master` unseen chat
  with no tool of the register's (`skillSettings.tools: []`), the task's
  `webSearch` on and its `model` set to the first configured model that can
  search (`supportWebSearch`); with none, it reads from what the model knows
  and the dialog says so. It hands its reading back through `fillModel` /
  `fillSoftwareProduct` (`client/lib/itam/use-master-capture.ts`), which the
  server checks first (`POST /itam/master/:collection/capture/match`,
  `server/providers/itam/master-capture.ts`, under `create`): the category
  must exist and be of the record's kind, the maker is matched by name like
  a vendor and **never created** — the dialog offers 新建制造商 with the name
  — values a field would refuse are dropped (a date that does not exist, a
  non-http website), and records of the same part code or name are listed
  beside the form. Only dates a page states are filled; the prompt forbids
  estimating them. The pages it cites are listed (links only). The form is
  `RecordFormDialog`, which takes its values from outside for this
  (`values` / `onValuesChange`, `initialFormValues`), plus `marks`
  (请核对), `titleAside`, `replacement` and `aside`. A dialog opened from
  the aside renders as a sibling of the form, never inside it: a submit in
  a portal still bubbles to the form around it in React's tree.
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
- A calendar date is local. `isoDate()` / `today()` in
  `server/providers/itam/dates.ts` format one in the server's zone; the client
  has `todayIso()` in `client/lib/itam/format.ts`. `toISOString().slice(0, 10)`
  is UTC, so east of UTC it writes yesterday until mid-morning — a receipt
  entered at 00:30 in Shanghai was recorded on the previous day, in
  `receivedAt`, `orderedAt`, a leaver's date, every reminder horizon and the
  report ranges (fixed 2026-09-27; `tests/logic/dates.test.ts` pins it).
  `addDays` / `addMonths` stay pure arithmetic on the string.
- A purchase order's summary strip names its approver from the moment it is
  submitted, right after the status: whoever the latest request was addressed
  to while it waits, and whoever decided it afterwards
  (`PurchaseOrderApprover` reads `/approvals`, newest first, because
  resubmitting may ask someone else). A draft has been asked of nobody, and
  withdrawing puts it back to draft, so it shows none.
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
  kinds the reader may act on. The global search is the sidebar's 搜索 and
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
- `useItamMutations` invalidates the whole of `['itam']`, not its own path:
  a record is read in more places than its own list — the workbench's cards,
  the reminder counts, the reports, a reference name elsewhere — and a record
  edited in the record drawer leaves the page behind it on screen, where a
  stale number is plainly wrong. The operation dialogs always did this; only
  the plain field edits did not. Only active queries refetch.
- 待我审批 is **one card covering two to-dos**: the service keeps
  `pendingPurchaseApprovals` and `pendingDisposalApprovals` separate,
  because each has its own count and its own list and a number can only
  point at one list; the card merges them for display, tagging each record
  采购 / 报废 and, past the preview, linking each kind separately. An
  approval names its subject in the singular (`ApprovalSubject`:
  `purchaseOrder` / `disposal`), which is not the collection a grant is
  asked for — filtering by the collection name matches nothing, silently.
- An approval waits on whoever it names, including the requester: naming
  yourself is allowed (a deployment with one Asset Manager has nobody else),
  so `approvals.pendingFor` excludes the requester only from an approval
  that names **no** approver. Excluding them from their own addressed
  approval left it decidable from the record page alone, while 待我审批 and
  the list's 待我审批 view both reported nothing waiting.
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
- Who may hold an operation is read from the permission sets, never from a
  role name: `holdersOf()` in `server/routes/itam/users.ts` backs both
  `/itam/users/approvers` and `/itam/users/repair-owners`, and the same
  reading of the sets (`assignedTo()`) decides who `/itam/users` offers at
  all. Asked with `ids`, such an endpoint is a
  **name lookup** instead and answers regardless — the owner a record already
  holds must read back even when they are not a candidate now (`root`
  belongs to no permission set of this application's).
  Every person a picker offers reads with the permission sets they hold
  (2026-10-06): the three endpoints return `roles` — the key and title of
  each set granting an `itam.*` operation — and `ReferenceSelect` shows
  them beside the name (`userRolesLabel` in `client/lib/itam/user-roles.ts`,
  which translates this application's two sets through `users.roles.*` and
  reads any other by its stored title), since picking a 负责人 or an
  approver is picking a role as much as a person.
- 待我审批 is one component, `createMyApprovalView` in
  `client/components/itam/my-approval-view.tsx`, given a collection, a list
  path and a label; purchase orders and disposals both mount it as their
  domain's `Views`. Which records are waiting on _this_ reader lives in the
  approval rather than the record, so the list route answers
  `filter[view]=myApproval` by resolving the reader's pending approvals to
  ids (`approvals.pendingFor`) and listing those. A reader who cannot
  approve that kind of request sees no toggle.
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
- An optional select empties through the clear (×) beside it, the way a
  reference field does; it never offers a "none" entry among the answers.
  A required one has no clear and no empty entry.
- Each audit result has exactly one way of being settled — 有差异 →
  `updateToActual`, 未找到 → `markLost`, 账外 → `register` — so the resolve
  dialog offers that one as its confirm and 标记不处理 (`markVerified`)
  beside it, with no list to pick from. `updateToActual` writes every value
  the count recorded, and passes the counted location into the assignment:
  assigning a device moves it to its holder's place unless told otherwise,
  which would undo the location the same count recorded.
- Nothing this application writes into a record is English prose. An
  operation that happens because of another record carries `sourceLabel`
  beside `sourceType` / `sourceId` (`HistorySource`), so a device's status
  change names the audit that corrected it and links there
  (`statusChangeByAudit`, the way a disposal's does).
- IT support is the Asset Manager **minus approving and deleting**
  (2026-10-05): every grant seed derives `itSupportGrants()` from the
  manager's through `minusApprovalAndDeletion`, so the difference between
  the roles is the code rather than two lists kept in step. Support does the
  work — reads the costs, sees the product keys, keeps the master data and
  the people (marking a leaver included), reaches 报表 and 定时任务 and the
  application settings — and the manager decides the requests and clears
  records away. Until then the roles differed in a dozen places (cost
  fields, keys, master-data writes, people, settings, reports, and a
  `recordsICreated` scope on each delete), and every new field or page had
  to be added twice; that is how a role ends up with a grant nobody meant to
  give it. Deleting a device stays with root. The service rules that bind
  **everyone** are not role differences and are unaffected: only a repair's
  or a request's 负责人 completes or reassigns it (`requireOwner`), and only
  the named approver decides. The `itam.myAudits` Record Access policy that
  narrowed IT support to the stocktakes naming them is gone with it;
  `RETIRED_RECORD_ACCESS` in `reconcile-grants.ts` rewrites a stored grant
  that still names it to `allRecords`, in both shapes a scope is stored in
  (a Collection action's `recordAccess`, a composite operation's `scopes`),
  because a scope nobody registers resolves to nothing. The 进行中的盘点
  to-do never depended on it, being scoped by the task's 负责人 and
  `executorIds` in the workbench itself. A policy this application retires goes into that set.
  The test double mirrors the derivation (`support` in
  `tests/support/test-app.ts` is every action but `approve` and `delete`);
  it used to grant only `read`, which never matched the seeded role.
- This application issues no grants to the platform's administrator set.
  `root` is unrestricted — the authorization core permits every request from
  whoever holds it without resolving a grant — so a second "may do
  everything" would only be another copy to keep in step. The seeds create
  `itam-it-support` / `itam-asset-manager` and nothing else (the
  `itam-employee` set went on 2026-10-05), and this application's own
  settings belong to both IT roles (the settings item
  `settings:itam.settings`, read + update — a resource type of its own,
  `itam.settings` / `general`, before template beta.49); they were the Asset
  Manager's alone until IT support became the manager minus approving and
  deleting. Routes refuse it with
  `requireGrant` (`server/routes/itam/http.ts`), which calls the context's
  `require`: the plugin's `guard` middleware is gone. Deleting a device likewise stays with root.
- Notifications take one message per channel: ITAM sends
  `messages: { 'in-app': { to, title, body, target } }`, and `config.yml`
  names that channel under `notification.channels` as a map entry.
- A secret in `config.yml` is written there as a value, never as `${NAME}`:
  nothing expands that, so the placeholder is stored and sent as the key
  itself, and a provider answers 401 with a value ending in `}`. The AI
  plugin's own warning names the two ways —
  `pnpm nocobase config set --from-env ai.llmServices.<service>.options.apiKey=<VARIABLE>`,
  which reads the variable and writes the value into the gitignored
  `config.yml`, or a mapping in `env` of `server/config/ai.ts`
  (`OPENAI_API_KEY: envString('llmServices.openai.options.apiKey')`, the way
  NocoCRM does it). The mapping is for a runtime-injected secret and has one
  trap: it **creates** what it maps onto, so mapping a service the
  configuration does not declare leaves a half-service with an `apiKey` and no
  `provider`, which every test application then fails validation on — map only
  declared services. `config.example.yml` still shows `${RESEND_API_KEY}`
  under `notification`, which is as unexpanded as any other.
  `pnpm nocobase config check` reports a service whose key is missing, so it
  is the check after either route.
- An LLM service is stored in `llmServices`, synchronized from the
  configuration at every start, and a start whose configuration was wrong
  stores the wrong value. The next start overwrites it, so fixing the
  configuration is enough — but only because this synchronization updates; a
  key corrected in the database alone is overwritten back. On a Hub the
  mapping in `server/config/ai.ts` is code, so changing it needs a deployment
  rather than a configuration edit.
- A file Repository is bound to a Policy; the attachment routes pass a
  permissive one because they authorize every call against the owner record
  first (`server/routes/itam/attachments.ts`).
- A child collection's fields are governed by that collection's own decision,
  not the parent's: `PUT /itam/purchase-orders/:id/lines` authorizes `update`
  on `purchaseOrders` and separately decides `read` on `purchaseOrderLines`,
  which `setLines` uses as the line fields' limit. A field the caller cannot
  read is refused when they state a value and left untouched when they send
  the null their client puts in place of the value it never received —
  otherwise a role without cost access zeroes every unit price each time it
  edits the lines. Reading them is the same decision: `GET` and `PUT` on
  `/lines` both answer with each line narrowed to it (keeping `id`), so the
  pages treat a missing `unitPrice` as "no prices here", not as 0.
- A list page's create dialog sends prefilled values that are **not** form
  fields straight to the endpoint (`?new=1&init.deviceId=…`, and the owner it
  seeds from the signed-in user). The endpoints are strict, so seeding a
  value a collection does not have is a 400: `domain-list.tsx` therefore
  seeds `ownerId` only when the domain declares that field — a purchase order
  lost its owner on 2026-09-25. The dialog shows a rejection it cannot pin to
  a field it renders as the general message, rather than attaching it to an
  unknown path where nobody sees it.
- One act writes one event. A status move that an operation already
  described — `approvals.request` / `withdraw` / `decide` write
  `approvalRequested`, `approvalWithdrawn`, `approvalApproved` with its
  comment — passes `summary: null` to `setStatus`
  (`domain-record.ts`, and procurement's own copy), which then logs only the
  field change. A second `statusChange` event says the same thing again as
  its own timeline line, and the reader looking at the top one concludes the
  comment was never recorded. `summary: null` is only for a writer that has
  already recorded the act; a transition nobody else described keeps its
  summary.
- A field that edits two halves at once — a money amount with its currency
  (`currencyField`), a reference that may be free text instead
  (`alternateField`), an answer with the choice it calls for (`dependent`) —
  passes and takes a pair, which the record page, the create dialog and the
  operation dialogs split back into their two keys. In the information card
  such a field is finished by hand: it shows 保存 / 取消 like a multiselect,
  because a control built from several parts is only an answer once every
  part is given, and saving on the first choice would write half of one.
- `ConfirmDialog` caps itself at `max-h-[90svh] overflow-y-auto`, the height
  `record-form-dialog.tsx` uses: a dialog that asks for more than a sentence
  (the disposal's create form) otherwise runs off a short window and hides
  its own buttons.
- Anything a person typed folds: `CollapsibleText` (200 characters or 6
  lines, tighter through `chars` / `lines`) wraps every free-text value —
  the cell renderer's `textarea` **and** default branches, a timeline
  summary, a change value, and the cancellation reason on the summary strip,
  where it also drops to the normal weight. A page that renders such a value
  itself must fold it too.
- 负责人 (`ownerId`) is the **first row of 基本信息** on every detail page
  of a record that has one (2026-10-05): `domain-detail.tsx` places it
  there whatever group its field names (`OWNER_FIRST`), and the device page
  does the same. It used to sit at the foot of 系统 with the stamps nobody
  edits, and went unseen; for a day it was in the summary strip, which was
  given back to where the record stands. It is edited in place like any
  row, so the handover rule and the read-only cases are unchanged. Neither the purchase order nor the disposal has a
  申请信息 group any more: 部门 and 需求日期, and 申请日期, sit under
  基本信息.
- A record has one timeline, not a history tab beside a change-log tab: the
  events and the field changes of the same operation are one line, folded
  together by the `operationId` both writers stamp
  (`operationContextOf` in `server/routes/itam/http.ts`, merged by
  `historyService.timeline()`). A service that writes history without an
  operation context still works — its rows stand alone. A key is stored as an
  event because a masked value cannot be compared, but it reads with the
  field changes: `FIELD_LIKE_EVENTS` in `history.ts` is what the filter goes
  by, so the split the reader sees follows what a line means, not which table
  it came from. A subject type may also _derive_ timeline lines from its own
  records — stock does, from its movements (`stockMovementEvents`, registered
  where the history service is built) — so the story is whole without a
  second copy of the facts that could drift from the first.
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
- **A model fills its category's extended fields too, as the defaults its
  new devices start with** (2026-10-06, migration
  `202610060004_model_attributes`, `models.attributes`). Every template field
  shows on the model page and in the create dialog (right after the
  specification once a category is chosen), and AI 整理 fills them, each held
  to its type by `/capture/match` (a select only to one of its options).
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
- A master-data tree node opens in the record drawer rather than navigating
  (`MasterDataTree`, 2026-09-28): the tree is the map, and reading one node
  should not lose the reader's place in it. A flat list row still navigates.
  The **categories** page goes further (2026-10-06): two panes, each
  scrolling on its own (`treeFills` on the domain makes the page fill the
  window, as a board does). The tree is a narrow column of names only —
  `MasterDataTree`'s `compact` drops the kind tag and the count — and a
  row's one action is a delete icon (`DomainTreeProps.onDelete`, through the
  list's own confirmation), since editing is the pane's. The clicked
  category's own detail page sits beside it through `RecordPane`, named in
  the address as `?selected=` (a list parameter, not a filter: `RESERVED`
  in `domain-list.tsx`), followed when the pane moves to its parent and
  cleared when it is deleted or left; with nothing chosen the pane says to
  pick one. The pane leaves out the breadcrumb (`HideBreadcrumbContext`),
  which the tree beside it already states; the drawer keeps it. No tree
  draws a drag handle any more: the whole row drags, and a leaf keeps no
  room for an arrow it does not have.
- Base UI drops a **nested** dialog's backdrop, reasoning that the dialog it
  is nested in already dims the page. The record drawer is such a parent and
  its backdrop sits *behind* the drawer panel, so a dialog opened inside the
  drawer had nothing between it and what it covers. `DialogOverlay` passes
  `forceRender` to keep it.
- A link to a related record — on a list or a detail page — opens in the
  record drawer (`client/components/itam/record-drawer.tsx`, mounted once
  by `client/layouts/app-layout.tsx` around the outlet): render it with
  `RecordLink` and open related rows with `useOpenRecord()` from
  `client/lib/itam/record-drawer.ts` rather than `Link` / `navigate`. A
  list row's click still navigates to its own record; `RecordLink` stops
  the click so the row does not follow. Modified clicks and links with
  `drawer={false}` (breadcrumbs) navigate normally. The drawer shows the
  record's own detail page — header, actions, information card and tabs —
  at most 680px wide, with the drawer's own 返回 / 打开完整页面 / close
  buttons in a short row above the page so they never cover its actions: `client/lib/itam/record-pages.ts` finds the detail
  route and its tabs in `appRouteDefinitions` (`client/routes.ts`), and the
  drawer mounts them in a memory router of its own (the outer router's
  contexts are cleared for that subtree), so switching tabs there leaves
  the page behind alone and any path outside the record closes the drawer
  and moves the page. `DetailPage` lays out by its own width (container
  queries: `@container`, `@2xl:` / `@4xl:`), not the window's, so the same
  page reads as a narrow screen in the drawer; keep new detail-page
  breakpoints on the container. `client/lib/itam/record-view.ts` only says which
  links are records, so a new collection with a detail page needs an entry
  there and nothing else.
- The master-data collections have no pages of their own (2026-09-28): they
  render through `DomainListPage` / `DomainDetailPage` like every other
  collection, with `masterDomain(name)`
  (`client/pages/itam/master/master-domain.tsx`) building each one's
  `DomainConfig` from `client/lib/itam/master-data.ts`. What only reference
  data does is in `master-domain-parts.tsx` and reaches the pages through
  optional slots — `Tree`, `listColumns` (cell components, so every row
  shares one query), `titlePrefixField` / `nameSort`, `image`, `plainCells`,
  `exportColumns: 'readable'`, `ownerFromCreator`, `extendedFields`,
  `relatedRecord` (a model's tabs follow its category), `tabCounts` with
  `DomainTab.countOf` (one `/stats` request counts every tab) and
  `BreadcrumbTrail`. A default tab with a `visible` condition makes the
  detail page wait for the record before landing. The master detail tabs
  are still the route children `master()` declares in `client/routes.ts`,
  and their history tab is `client/pages/itam/record-history-tab.tsx`,
  which reads the collection from the route's first segment.
- One search over every list (2026-10-05, after InvGate's), opened from
  搜索 in the sidebar, right under 工作台: `SearchNavButton` in
  `client/components/itam/global-search.tsx`, drawn by
  `client/layouts/app-layout.tsx` beside the route tree because it opens a
  dialog rather than a page (an "Application change (ITAM)" there). Its
  state lives in
  `GlobalSearchProvider` around the whole shell, not in the dialog
  (`GlobalSearchDialog`, mounted inside the record drawer's provider so a
  result opens in the drawer): closing the dialog while Noco works loses
  nothing, and Noco's page tool is registered there for as long as the
  shell is up. As it is typed it asks `GET /itam/workbench/search`, which
  reads each group in `SEARCH_GROUPS` (`server/routes/itam/workbench.ts`;
  the client's `SEARCH_PAGES` in `client/lib/itam/search.ts` keys the same
  groups to their pages) under the caller's own `read` through
  `maybeDecide`, skipping what they may not read, and answers the first
  five of each with the total; no model takes part. A group's last row
  opens its list searched for the same words. The 问 AI side of the box's
  segmented 搜索 | 问 AI switch (the pages' own tabs; the box itself does not
  change colour) asks a question, and the answer comes **in the dialog, not
  in the side panel** — the way Slack, Glean and Rovo put an AI answer at
  the top of the results. It runs in the search's own chat: `HiddenChat` in
  `client/layouts/ai-panel.tsx` mounts a windowless `AIChatProvider` per
  unseen chat (`search`, `receipt` for receiving by delivery document,
  `capture` and `master` for AI 整理)
  with the same employee (sending, tool calls and their
  automatic approval all live in the provider), so asking neither opens the
  panel nor replaces the conversation in it; `ChatStateBridge` publishes its
  messages and status to `useHiddenChat(name)`, and `readSearchTurn`
  (`client/lib/itam/search-turn.ts`, unit tested) reads the step under way,
  the words after the last tool call, a write waiting for confirmation or a
  failure — treating the quiet moments between steps (a page tool approving
  itself, a result not yet answered) as still working. The records come
  through the search's one frontend tool, `presentRecords`, and
  `SearchAnswer` (`client/components/itam/ai/search-answer.tsx`) only draws
  what the provider keeps. A search answer is not a chat the reader meant to
  keep: once complete it is kept in the provider and its conversation is
  deleted at once; 继续追问 opens a **new** conversation in the panel with the
  question drafted (`search.followUpDraft`) and the search as page context,
  whose `lastAnswer` carries the question, the answer and the records — as
  in Rovo, an answer becomes a chat only when followed up. A turn that ended
  on a change to confirm, or failed, keeps its conversation, and 在对话中查看
  opens it in the panel (`openConversation`, selected by
  `PendingConversation` once the panel's chat mounts). One interrupted by
  closing the page stays in the history. Keyword search also matches
  through references (`searchByReference` in `collections.ts`: a device or
  stock item by its model's name, an entitlement by its product's), because
  a device is named by its asset tag while people type "MacBook" — which
  also fixed the lists' own search boxes. Every list search goes **word by
  word** (2026-10-06, `searchWords` in `collection-query.ts`): the search is
  split on spaces and the punctuation inside names, and each word must
  appear in one of the search fields or a referenced name, in any order, so
  "MacBook Pro 14" finds "MacBook Pro 14 (M3)" and "M3 MacBook" does too;
  "MacBook Pro 14 M4" still finds nothing when only the M3 is on the books.
  One string matched whole failed on any bracket or change of order. It is still a conversation — the
  decision that nothing AI runs outside one stands. A list reads the found
  ids from `?ids=` with `?found=` naming them: it shows them as a table,
  under `FoundRecords`, whose 显示全部 clears both, and exports them alone.
  A new list page reads `foundIds()` the same way.
- The application's sidebar does not fold (2026-10-04): a group without a
  page of its own reads as a small heading with its pages always listed
  under it — `groupsAsHeadings` on `NavigationTree`, which only
  `client/layouts/app-layout.tsx` turns on, so the settings and dev menus
  keep folding. In the icon-only sidebar the heading gives way to a thin
  rule. Since nothing marks where an unfolded group ends, every page sits
  either above the groups (工作台) or
  inside one (资产, 业务, 主数据); an ungrouped entry placed after
  a group reads as part of it. 业务 holds 采购, 维修, 报废, 盘点 and 报表 (盘点 below 报废 since
  2026-10-06).
  Route names are what stored page grants reference, so regrouping changes
  no grant — `tests/logic/client-routes.test.ts` pins only their order.

## Load the development skills

`.agents/skills/nocobase-app-development/` holds the detailed guidance behind this file (synchronized by `pnpm nocobase skills sync`; `skills/itam-conventions.md` keeps what this application added to it). Read its `SKILL.md` first — it routes to the reference that matches your task instead of making you read everything:

| Task                                                         | Reference                            |
| ------------------------------------------------------------ | ------------------------------------ |
| Any frontend change: pages, routes, components, styles, copy | `references/frontend/ui-workflow.md` |
| Add an HTTP endpoint                                         | `references/server-routes.md`        |
| Read or write data                                           | `references/database-and-data.md`    |
| Change the schema                                            | `references/migrations.md`           |
| Switch or add a database connection                          | `references/database-connections.md` |
| Translate server-produced text or add a language             | `references/i18n.md`                 |
| Add a service, background job, or scheduled task             | `references/services-and-jobs.md`    |
| Write tests and verify                                       | `references/testing.md`              |
| Run or add a command                                         | `references/cli.md`, `references/commands.md` |

Read the one page your task needs, not the whole directory.

`.agents/skills/nocobase-app-upgrade/` is a separate Skill for a separate job: merging a newer release of the template this application was generated from. Read it when the task is upgrading the template rather than building a feature, and read it before touching anything — an upgrade done by copying the newest template over this application destroys the work that made it this application.

## Where things go

Business code goes in these places. This is where you work, and where you should stay unless the task genuinely requires otherwise:

```text
client/routes.ts          Declare a page route
client/pages/             The page component
client/components/        Your components
client/components/ui/     shadcn/ui primitives; add with the CLI, never hand-write or edit (the few
                          deliberate edits are listed under "Menus and destructive actions")
client/hooks/             Hooks shared across features
client/locales/           Every user-visible string
client/service-provider.ts Client startup: services that boot with the application
server/routes/            HTTP endpoints
server/providers/         Services and their lifecycle
database/main/migrations/      Schema changes
database/main/seeds/           Required initial data
database/main/collections/     Generated Collection artifacts; regenerate, never edit
cli/commands/             Commands this application owns
tests/                    Tests; never beside the source
```

A feature with a page and an API touches five places: a migration for the table, a route in `server/routes/`, a page in `client/pages/` declared in `client/routes.ts`, navigation on the page route, and strings in `client/locales/`.

### The rest is framework structure

`client/routing/`, `client/layouts/`, `client/theme/`, `client/config/`, `server/config/`, the server entry points, the build scripts, and the tsconfigs are the scaffolding the template provides. It is still this application's own source — it shipped to the user and they may change it — but it is the part the template evolves, so an edit there is what a future upgrade has to reconcile.

Prefer the mechanism the system already provides. Declare a page in `client/routes.ts` and add `navigation` when it needs a menu entry. Refine resources add no menu entries and, with no data provider registered, load nothing; pages load data through `useApiClient` (ITAM's own pages use the hooks in `client/lib/itam/api.ts`). A settings page uses `access` to restrict access; a plugin page is customized through an option or an override. Before editing the shell to add a menu, check the route and its `navigation` declaration.

When the built-in mechanism genuinely cannot express what is being asked, changing this structure is a legitimate answer — not a last resort to apologize for. Do it deliberately, and leave the next agent enough to work with:

- Comment what you changed and why the built-in path did not fit. On upgrade, an agent reconciling the template's version needs to know whether your change is still needed.
- Update this file and `skills/itam-conventions.md` in the same change, so the guidance describes the application as it actually is. Documentation describing a layout the application no longer has is worse than none.

## Building a feature

### Pages and routes

Declare the route in `client/routes.ts` and keep the page component behind a lazy `componentLoader`. The loaded module must default-export the component.

```ts
const appRoutes: AppClientRouteContribution = defineAppRoutes([
  {
    name: 'orders',
    path: '/orders',
    auth: 'required',
    authz: { resource: { type: 'page', id: 'orders' }, action: 'access' },
    componentLoader: () => import('./pages/orders.js'),
  },
]);
```

Route paths are application-internal. Never write the deployment base path such as `/main` into one — the runtime restores it.

`auth` controls browser navigation only: `required` for signed-in pages, `guest` for sign-in and registration, `optional` for pages that work either way. It is not server security. An endpoint the page calls enforces its own authentication independently.

Use `defineSettingsRoutes()` for administrative pages, which mount under `/settings`, and `defineDevRoutes()` for development-only pages, which mount under `/dev` and are absent from a production build. Do not repeat `/settings` or `/dev` in the path. `defineDevRoutes()` is a build boundary, not a permission boundary: a page that must be restricted in production is a settings route with `access`, enforced by the server.

**Declare navigation on the route.** App, Settings and Dev menus read `navigation: { title: 'navigation.orders' }`; titles resolve in the owning locale namespace. Add the translation in `client/locales/`. Refine resources do not add menu entries.

Use recursive groups to organize menus; their path is optional. Pages may also have children, but must manually render `Outlet`. For URL-addressable dialogs and drawers, declare the child in `defineAppRoutes()` in `client/routes.ts`, place the owning page's `Outlet`, then render `RouteDialog` or `RouteDrawer`. A child page of its own — a record's page, a form too long for a dialog — returns `RouteChildPage` around its `PageContainer`; only tab content renders inline, and a child route that returns a bare `PageContainer` renders below the parent's content instead of covering it. Call `useRouteOverlay()` only from a descendant rendered inside the overlay, including its footer, never from the page returning the wrapper. A record opens over the page the user is on: a dashboard or a board that shows records declares their drawer under its own route instead of linking to the list's, and a row menu's Edit opens its own dialog rather than the one stacked on the drawer. On a page with tabs the user is on the tab being shown: an overlay the page's header opens is declared under every tab and linked through the current tab (`` `${tab}/edit` ``, never a bare `edit`, which resolves beside the tabs), so it stacks on that tab and closing returns to it. Read `.agents/skills/nocobase-app-development/references/frontend/references/overlay.md` before implementing overlays or close guards.

### Components and styling

Use shadcn/ui for UI. The template ships only the primitives its shell and compositions use: `button`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `spinner`, `toast` and `tooltip`. Check `client/components/ui/` first; if the primitive is not there, add it from the shadcn registry rather than writing your own. `yes n |` answers "no" when the CLI offers to overwrite a primitive that is already installed; without an answer, a non-interactive run stops at that question. Format the files it created and translate the English a few primitives carry, as `.agents/skills/nocobase-app-development/references/frontend/references/shadcn.md` lists; otherwise keep them as the CLI writes them:

```bash
yes n | pnpm exec shadcn add card
pnpm exec prettier --write client/components/ui/card.tsx
```

Build your own components by composing these primitives, and put them in `client/components/`. A page below another one — a covering child page, a record's own page — leaves by `BackButton` (`client/components/back-button.tsx`) above its heading; `Breadcrumbs` replaces it only when the user asks for breadcrumbs.

`PageContainer`, `PageHeader`, `RouteDialog`, `RouteDrawer`, `RouteChildPage`, `useRouteOverlay` and `BackButton` in `client/components/` come from the NocoBase UI Library, as do the authentication layout and forms in `client/extensions/nocobase-auth-ui/`; like the rest of the source, they belong to the application. `yes n | pnpm exec shadcn add @nocobase/<item>` adds another item from the library: a single component lands in `client/components/`, a complete feature in `client/extensions/nocobase-<item>/`. A table and a date field come from it too, added before the first page that needs one rather than written from scratch: `@nocobase/data-table` adds `DataTable` with `DataTableColumnHeader`, `DataTablePagination` and `DataTableViewOptions` in `client/components/data-table/`, and `@nocobase/date-picker` adds `DatePicker` and `DateRangePicker` in `client/components/date-picker.tsx`, or `@nocobase/date-time-picker` for a time as well. The CLI adds the packages an item needs to `dependencies`: move the new ones, such as `@tanstack/react-table`, to `devDependencies`, as "Adding a dependency" below explains for everything client code imports, but leave `@nocobase/i18n` in `dependencies`, where the server needs it, and put back the `^` of its range, which the CLI pins.

**Look components up in the shadcn skill.** The development Skill carries the shadcn/ui skill, unchanged from shadcn 4.21.0, in `.agents/skills/nocobase-app-development/references/frontend/shadcn/`. Read `references/frontend/references/shadcn.md` first: it routes to the skill's rules and states where this application departs from them, among others `pnpm exec shadcn` instead of `npx shadcn@latest`, no `shadcn apply` or `--preset`, and create, edit and detail as `RouteDialog` or `RouteDrawer` child routes rather than a `Sheet`. `pnpm exec shadcn docs <name>` gives one primitive's documentation and examples for the Base UI version. For a whole page, start from the worked example that `references/frontend/references/example.md` indexes.

Style with the semantic Tailwind tokens — `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary` — so pages follow the light and dark themes. Do not hard-code colors like `bg-white` or `text-gray-900`; they break the moment someone switches theme.

**Visual consistency is a whole-application property.** Match the surrounding code's spacing, typography, and component choices. If a change genuinely calls for a different look, change the application's design tokens in `client/theme/themes/*.css` so every page moves together. Never restyle only the part you are working on — a page that looks different from the rest is a defect, not a customization.

### Server routes

`defineApiRoutes()` mounts under `/api`, and `defineRootRoutes()` mounts at the root for callbacks and webhooks. Do not repeat `/api` in the path. Each route factory creates and returns its own Hono router.

```ts
export const apiRoutes: AppApiRouteContribution<Application> = defineApiRoutes(
  (app) => {
    const router = new Hono();
    const auth = app.container.resolve(authenticationToken);

    router.use('/orders', auth.required());
    router.get('/orders', async (context) =>
      context.json({ data: await listOrders() }),
    );

    return router;
  },
);
```

**Every route owns its own security.** Mounting under `/api` does not authenticate anything. Install `auth.required()` on the paths the route owns, and add `authorization.middleware()` with an explicit `resource`/`action` check when the operation needs permission rather than just identity. Never rely on middleware from another route or on the order routes happen to be registered in.

Scope middleware to the exact paths you own, or to an isolated sub-router mounted at your prefix. A `router.use('*', ...)` leaks into contributions mounted later.

A webhook that a third party calls cannot use a login session, so it is deliberately public — but public still means verifying a signature, timestamp, or one-time state, and testing that anonymous requests without a valid signature are rejected.

Keep HTTP concerns in the route and domain logic in a service under `server/providers/`.

### Database

Schema changes are migrations under `database/main/migrations/`. Data the application requires to run is a seed under `database/main/seeds/`. Seeds never create structure.

```ts
const migration: MigrationDefinition = defineMigration({
  name: '202609020001_create_orders',
  async up({ builder }) {
    await builder.createCollection('orders', (collection) => {
      collection.increments('id');
      collection.string('reference', { length: 64, nullable: false });
      collection.datetime('createdAt', { nullable: false });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('orders');
  },
});
```

**A migration is immutable history and must be self-contained.** Spell out every field, index, and constraint in the migration itself. Never import a collection definition, model, or registry that keeps evolving — doing so silently changes what an already-applied migration means. Write `down` as the explicit reverse in a safe dependency order.

Edit an existing migration only while the branch that introduced it is unmerged. Once merged, every correction is a new migration.

The exported `name` must match the filename. Apply with `pnpm nocobase db apply` and verify against a real database. `db reset`, `db rollback`, `db redo`, `db repair` and `db unlock` are the rest of that family (there is no `db doctor` since template beta.49; `db apply --dry-run` reports what is pending, and a start-up warning names every executed task whose source changed); never edit the history table by hand.

At runtime, resolve `databaseManagerToken` from the container and use `database.query()` to read and write the default connection. Use `database.query('analytics')` for another connection. Application tasks use `database/<connectionName>/{migrations,seeds}` and bind to that connection explicitly; plugin tasks and default runtime access stay on `database.default`. Only managed connections run migrations or seeds. See the migrations reference for execution and upgrade rules.

### User-facing text

Every string a user reads goes through a translation key. `client/locales/en-US.ts` states the wording and derives the shape that other locales are checked against, so a missing key in `zh-CN.ts` is a compile error. Both spread the sign-in pages' copy from `client/extensions/nocobase-auth-ui/locales/` ahead of the application's own keys in `messages`, so a new language needs a translation of that file too; `.agents/skills/nocobase-app-development/references/frontend/references/i18n.md` shows how.

```tsx
const { t } = useTranslation();
t('orders.title');
```

To reword a plugin's string, add an `overrides` block keyed by that plugin's package name in your locale file. Do not edit the plugin.

The languages the application offers are its own locale files, not a configured list, and the two sides are read separately: `client/locales/` decides what the picker shows, `server/locales/` what the server will answer in. Adding a language means adding its file to both. `pnpm nocobase locales check` reports one declared on a single side.

The account menu language control in `client/layouts/components/language-switcher.tsx` uses a shadcn submenu with radio items. Render it inside `DropdownMenuContent` to preserve menu keyboard navigation and selection semantics.

## The command line

`pnpm nocobase <topic> <command>` runs this application's CLI, the `nocobase` bin of `@nocobase/app-cli`. Only `pnpm dev`, `pnpm build`, `pnpm start`, the quality scripts and this application's own `pnpm data:reset` are scripts; every other command goes through `pnpm nocobase`, with no script alias (template beta.49 removed `pnpm db:apply`, `pnpm skills:sync`, `pnpm plugin:register` and the rest). `pnpm nocobase --help` lists the tree and `--help` on a command gives its flags. Read `.agents/skills/nocobase-app-development/references/cli.md` before running one: `db reset`, `db rollback`, `db redo` and `db repair` refuse to run without `--force` outside a terminal, and that refusal is not something to work around.

```bash
pnpm nocobase --help          # every topic and command
pnpm nocobase db apply        # migrations and seeds
pnpm nocobase locales check   # languages declared on only one side
```

A command this application owns is a file under `cli/commands/` whose path is its name below the `app` topic, extending `AppCommand` from `@nocobase/app-cli` (`references/commands.md`). There is none today. Every application command is compiled into `dist/cli` and runs in a deployment, so there is no development-only application command any more: `data:reset`, which wipes the database, is the script `scripts/data-reset.ts` instead (`pnpm --silent data:reset --demo`).

`pnpm build` is `nocobase build`, extended only through build hooks a CLI plugin declares. This application's one build step — copying the seeds' data files (`database/main/seeds/assets/`) next to the compiled seeds, which tsc does not — is the `afterServerBuild` hook in `cli/itam.ts`, registered in `cli/plugins.ts` like a plugin's; it runs `scripts/copy-seed-assets.mjs`. A deployment runs the CLI as `node dist/cli/index.js <topic> <command>`.

## Plugins

Plugins are registered in `client/plugins.ts`, `server/plugins.ts`, and `cli/plugins.ts`. Presence in the array enables a plugin and array order is contribution order. A plugin appears in the roots matching what it ships, so a plugin with only commands is listed in `cli/plugins.ts` alone. Bulk Skills synchronization and plugin updates discover plugins from these composition roots.

Let `pnpm nocobase plugin register` and `pnpm nocobase plugin unregister` add and remove entries. Edit these files by hand only to reorder entries or to pass a plugin its options.

To customize a plugin's page, pass an option on its registration, add a source extension under `client/extensions/*/extension.ts`, or add an entry to `client/route-overrides.ts`. Do not redeclare the plugin's route — a duplicate `/login` is a conflict, not a customization. An override replaces only `componentLoader`; route identity, path, and auth mode stay with the plugin. One route takes one override across all three mechanisms.

### Read a plugin's Skill before building what it already does

**You are not starting from scratch.** This application ships with plugins that already solve whole categories of requirement, and each one publishes a Skill explaining how to use it. Registration copies those Skills into `.agents/skills/`. Before implementing a feature, check whether a plugin already covers it:

| The requirement sounds like                                                                       | Read the Skill for                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Approvals, multi-step processes, "when X happens then Y", business rules that outlive one request | `@nocobase/app-plugin-workflow`       |
| Email, IM, or in-app messages; notifying someone that something happened                          | `@nocobase/app-plugin-notification`   |
| Roles, permissions, "user A may only see their own records", field-level or row-level access      | `@nocobase/app-plugin-authorization`  |
| Sign-in, registration, sessions, password reset                                                   | `@nocobase/app-plugin-authentication` |
| User listing, account state, password reset, and application-owned role assignment                | `@nocobase/app-plugin-users`          |
| File upload and metadata through Repository                                                       | `@nocobase/app-plugin-file`           |
| Translated text and language switching                                                            | `@nocobase/app-plugin-i18n`           |

Run `pnpm nocobase skills sync` if `.agents/skills/` is missing or looks out of date, then read the Skill for the plugin you need. It documents that plugin's public entries, the ownership boundary, and how to verify the result — which is faster and more correct than inferring an API from its source.

Building a permission system, a notification sender, or a job scheduler by hand when a registered plugin already provides one is the most expensive mistake available here. Prefer the plugin; write your own only when you have read its Skill and confirmed it genuinely does not fit.

`.agents/skills/` itself is generated output: gitignored, and every synchronized directory is replaced wholesale on the next sync, so never edit a file there. This application's own `skills/` directory is the opposite — committed source you should keep current.

## Adding a dependency

Put a package your **server** code imports in `dependencies`. Put everything your **client** code imports — along with build tooling, tests, and type-only imports — in `devDependencies`.

That split looks backwards until you see how the two halves are deployed. `pnpm build` bundles the client: Vite resolves every client import and inlines it into `dist/client`, so nothing has to resolve it again later. The server is not bundled. `dist/server` keeps its bare imports, and `pnpm build` generates `dist/package.json` from your `dependencies` and installs a `node_modules` next to it — that tree is what the deployed server resolves against, and `devDependencies` are not in it.

So the two mistakes fail in opposite ways. A server import left in `devDependencies` works all through development and fails only on the server, with a bare `Cannot find package` naming nothing that points back here. A client package put in `dependencies` never breaks anything — it is just installed into every deployment, where the server never requires it. That one is invisible, so it accumulates: `lucide-react` and `@xyflow/react` were 44 MB of it before this rule was written down.

What decides it is where the importing file lives and what the import is, not what the package is for. `import ts from 'typescript'` in `server/` is a runtime dependency even though TypeScript sounds like tooling. `import type { Config } from 'x'` is erased before anything runs, so it stays a devDependency wherever it appears. A dynamic `import()` counts — deferring the load changes when a package is needed, not whether.

### Adding a dependency

Which half of the application imports it decides where it goes.

| The import is reached from              | Declare it in     |
| --------------------------------------- | ----------------- |
| `server/`, `database/`, or `cli/`       | `dependencies`    |
| `client/`, build tooling, tests         | `devDependencies` |
| `import type` only, wherever it appears | `devDependencies` |

`dist/package.json` is generated from `dependencies` and is what a deployment installs from, so a server import declared as a devDependency resolves in every development checkout and is absent exactly once — on the deployed server. A client import needs nothing at runtime: Vite resolves and inlines it into `dist/client` at build time.

A plugin's browser packages arrive by a third route and need nothing from you. Plugins declare those as peer dependencies, so installing a plugin brings one shared copy into this application, while `dist/` sets `autoInstallPeers: false` and installs none of them.

`pnpm build` checks the server half: it reads every value import in `server/`, `database/`, and `cli/` and fails the build if any of those packages is missing from `dist/package.json`. It cannot see an import whose specifier is built at run time:

```ts
await import(`${name}/index.js`); // invisible to the check
```

Declare such a package in `dependencies` when you write the code; nothing will remind you later.

### Packing the build for a deployment

`pnpm build --tar` writes `storage/dist.tar.gz` after the build. The archive holds `dist/` as a directory next to `config.example.yml`, so extracting it produces exactly those two paths rather than scattering `server/` and `node_modules/` into whatever directory you unpacked in.

`config.example.yml` travels with it because a deployment has to write a `config.yml` before it can start, and the example is the only statement of what may go in it. Directories of executable shims are left out: a `.bin` entry points at a path on the machine that installed it, and a dangling one makes `pnpm install` in the extracted tree report a corrupt store rather than repair it.

Without `--tar` no archive is produced, which is what you want when the build is only going to be run locally.

### Building a Docker image

`Dockerfile` and `Dockerfile.dockerignore` build this application from its sources: a build stage runs `pnpm install --frozen-lockfile` and `pnpm build`, and a `node:24-bookworm-slim` runtime stage receives `dist/` and `config.example.yml` only. The runtime has no pnpm, so it runs the two `dist/package.json` scripts directly: `start` is `node ./server/standalone.js`, which the image starts as `node dist/server/standalone.js`, and `nocobase` is `node ./cli/index.js`, run as `node dist/cli/index.js <topic> <command>`. The deployment root is `/app`, so configuration is `/app/config.yml` and storage is `/app/storage`, both mounted at runtime.

The client is not tied to a mount path, so `APP_BASE_PATH` is a runtime variable, `/main` in the image unless the container is started with `-e APP_BASE_PATH=<path>`; the health check probes the same path. The build stage runs on `$BUILDPLATFORM` and passes `--target linux-$TARGETARCH`, so a multi-platform build does not compile under emulation; do not move the build stage to the target platform or switch the runtime to Alpine, which would need the musl target. Keep `Dockerfile.dockerignore` beside the Dockerfile: BuildKit reads it only there, and without it `config.yml`, `.env`, and `storage/` enter the build context.

`--build-arg DIST=prebuilt` skips the build stage and packages the `dist/` in the context instead, selected through `FROM dist-${DIST}` so BuildKit never runs the stage it does not use. That stage refuses a `dist/` whose `nocobase.buildTarget` is not linux, glibc, the target architecture and the image's Node major, and one from an `@nocobase/app-cli` that does not record `nocobase.relocatable`, whose client is tied to the path it was built for. The ignore file re-includes `dist/` last and whole, so dependency directories inside it named like excluded paths (`langchain/storage`) survive, and then excludes `dist/.env`, which can carry `DB_PASSWORD` from local `.env` files. Keep those rules in that order.

### Building for another platform

`pnpm build` targets the machine it runs on, so `pnpm build && pnpm start` works. A deployment build says where it is going: `--target linux-x64`, `--target linux-arm64`, `--target linux-x64-musl`, plus `--node-version` when the server's Node major differs. Every build prints the platform it produced and records it in `dist/package.json` under `nocobase.buildTarget`.

A `.node` binary is compiled for one platform, architecture, C library, and Node ABI at once. `pg`, `mysql2`, and `tedious` are plain JavaScript, so an application using only those is portable as built.

### When a build or a deployment fails

| Symptom                                                                                 | Cause                                                                        | Fix                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Cannot find module 'x'` on the server, works locally                                   | `x` is in `devDependencies`, which `dist/package.json` is not generated from | Move it to `dependencies`                                                                                                                                                            |
| A browser package will not resolve while building the application                       | A plugin declares it as a peer and nothing provides it                       | Add it to the application's `devDependencies`                                                                                                                                        |
| `Error loading shared library`, `invalid ELF header`, or a bare `.node` path at startup | The binary does not match the server                                         | Compare `require('./dist/package.json').nocobase.buildTarget` with the server's `process.platform`, `process.arch`, and `process.versions.modules`, then rebuild with matching flags |
| `no prebuilt binary for <target>` during the build                                      | The package publishes no build for that combination                          | Check the package supports the target; musl coverage is thinner than glibc                                                                                                           |

Node ABI to major version: 115 is Node 20, 127 is 22, 137 is 24, 147 is 26.

## Before you finish

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Add tests for what you changed: a route's authenticated, unauthenticated, and unauthorized responses; a migration's `up` and `down` against a real database; a page's actual behavior. Tests belong in `tests/`, or in `e2e/` when they need a real server. Never place a test beside the source it covers.

`pnpm nocobase --help` lists every command.

For any UI work, start with `.agents/skills/nocobase-app-development/references/frontend/ui-workflow.md` (from the application root), which decides the workflow and routes to the rest: styling rules in `references/styling.md` beside it, the full token contract and theme presets in `references/theme.md`, and this application's additions in `skills/itam-conventions.md`. Since template beta.49 there are two presets, `compact` (the default, the density this application was built at) and `default` (roomier); the header's 外观 menu switches mode and preset, and there is no theme settings page. ITAM's darker page background (`--background: oklch(0.97 0 0)`) is set in both preset files. Prefer its Tailwind utilities so components respond to theme changes; keep deliberate fixed-size exceptions explicit.

Application startup defaults belong in `config.yml`: `i18n.defaultLocale` for the language, and `client.app.defaultColorScheme` and `client.app.defaultTheme` for appearance. Valid browser-local choices take precedence. Which languages the application offers is not configured — its own `client/locales/` and `server/locales/` are that list. See the i18n and themes references.

### Page width, not window width

`Page` (`client/components/itam/page-header.tsx`) is a size container and
`PageHeader` wraps by its own room: the assistant panel narrows the page
while the window stays wide, so a page's own splits use container
breakpoints (`@3xl:grid-cols-2`), not viewport ones (`lg:`). The workbench
and reports do; `DetailPage` already had its own container.

### Boards and exports

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
holds risks rather than to-dos), 离职交接, 待审批, 待下单, 待到货入库,
待执行报废, 维修中, 借出逾期, 进行中的盘点. 待下单 (`pendingOrders`,
2026-10-05) is the approved purchase orders nobody has placed yet, granted
by `order` and scoped like 待到货入库: without it an approved order sat in
已批准 with nothing on the board asking for it. In the team view (全部) a
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

### Menus and destructive actions

`DropdownMenuContent` sizes to its content and never goes below the trigger
width or 8rem; the registry default bound it to `--anchor-width`, which made
every menu anchored to an icon button one button wide and wrapped each label.
Items stay on one line. Keep that when the primitive is upgraded from the
registry.

`RadioGroupItem` dims itself through `data-disabled:` as well as `disabled:`.
The registry default styles only the CSS `:disabled` pseudo-class, which a
`<span role="radio">` never matches, so a disabled radio refused clicks while
looking perfectly available. Keep both variants on a registry upgrade.

A detail page's own actions sit in the header; a destructive one goes in the
"more" menu beside them — the device page does this directly, and a domain
page asks for it with `deleteInMenu` on its `domain.ts` entry (stock does).
A page whose only action is deletion keeps the plain button: hiding a lone
action behind a menu costs a click and finds nothing else.

### Shared tag appearance

All application tags use `Badge` from `client/components/ui/badge.tsx`;
status and urgency components compose it rather than styling separate spans.
`client/styles.css` defines the shared `[data-slot='badge']` contract: medium
radius, xs text, medium weight, px-2 / py-0.5 padding and no border. Neutral
outline variants use a muted fill. Background/text colors still convey status.
The slot rule also covers plugin-owned Badge copies without editing Registry
sources. Do not override tag typography, radius or padding in individual pages.
Step numbers, timeline dots and avatars are not tags.
