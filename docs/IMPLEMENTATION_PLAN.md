# ITAM implementation plan

Derived from `SPEC.md`. This is the working plan for building the IT Asset
Management application on the NocoBase 3 application template. Update it when a
decision changes; do not let it drift from what the code does.

## 0. Ground rules

- Everything is application code in `client/`, `server/`, `database/main/`,
  `ai/`. No plugins are created for this application's own features.
- The spec is Chinese; `client/locales/en-US.ts` remains the locale shape
  source, so every string is added to both `en-US.ts` and `zh-CN.ts`.
- Plugins do what they already do: `authorization` → roles, permission sets,
  field and record scoping; `workflow` → purchase and disposal approvals;
  `notification-in-app` → the notification list; `file` → attachments;
  `ai-employee` → chat runtime, tools, tool-card rendering (the `nocobase-ai`
  shadcn registry item provides the chat UI).
- State changes only through services. Every lifecycle operation (assign,
  return, transfer, loan, receive, repair result, disposal…) is one service
  method inside `database.transaction`, and that method also writes the unified
  `history_events` row. Routes are thin. UI buttons and AI action execution call
  the same services, so "AI cannot exceed the user's permissions" holds by
  construction.
- Every list and aggregate is server-side and paged. Stat cards return
  `{ count, filter }` so the list endpoint re-runs the same filter; the client
  never counts by pulling records.

## 1. Data model (`database/main/migrations/`)

| Group          | Tables                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Master data    | `categories` (tree, `appliesTo`, `requiresSerial`, `assignableToPerson`, depreciation / warranty / audit defaults, `fieldTemplate` JSON), `models`, `manufacturers`, `vendors` (`types` JSON), `software_products`, `locations` (tree + `path`), `departments` (tree), `people` (`userId` nullable)                                                      |
| Assets         | `devices` (all spec fields; polymorphic `assigneeType` / `assigneeId`; `reservedForType` / `reservedForId`; `bookValue` / `depreciatedAmount` stored and recalculated monthly; `attributes` JSON for category extended fields), `device_components`, `tags`, `device_tags`                                                                               |
| Quantity items | `stock_items` (single table, `kind = accessory \| consumable \| component`; total / used / available), `stock_holdings` (current holder: person / location / device + qty), `stock_movements` (in / issue / return / install / uninstall)                                                                                                                |
| Software       | `entitlements` (one table, `kind = perpetual \| subscription`; compliance status computed for both, annualised cost and renewal decision for subscriptions), `entitlement_seats` (person or device holder, account for subscriptions; no usage tracking since 2026-09-25); no bills table since 2026-09-25 (software install records dropped 2026-09-20) |
| Flow           | `allocations` (shared assignment event), `purchase_orders`, `purchase_order_lines`, `purchase_receipts`, `repairs`, `audit_tasks`, `audit_items`, `disposals`, `disposal_devices`, `approvals` (links to the workflow run)                                                                                                                               |
| System         | `history_events` (unified timeline), `change_logs` (field-level diffs + sensitive-view audit), `settings` (key → JSON), `number_sequences`, `standard_kits`, `reminders` (rule-layer results), `ai_findings`, `ai_actions`, `ai_action_rows`, `discovery_imports`, `discovery_records`, `attachment_links`                                               |

Decisions taken:

- One `stock_items` table with a `kind` column rather than three tables. The
  spec says the three share the quantity-item design and identical page
  structure; only the allowed actions differ.
- Attachments live in the file plugin; `attachment_links` (owner type / id)
  makes the "attachments from related records" tab a join, not a copy.
- Assets are never physically deleted except by a system administrator on a
  record with no history; the guard lives in the service.

## 2. Server (`server/providers/`, `server/routes/`, `server/workflows/`)

One provider and service per domain, tokens exported from
`server/providers/index.ts`:

- Cross-cutting: `numbering` (prefix / width / sequence per object, optional per
  category), `settings`, `history` (timeline + change log), `authz-registration`
  (registers every collection with `authz.database.collections.add`, marks cost
  fields and `productKey` as field-permissioned).
- Domains: `devices`, `stock`, `licenses`, `subscriptions`, `contracts`,
  `procurement`, `tickets`, `repairs`, `audits`, `disposals`, `people`,
  `reports`, `import-export`, `discovery`.
- Workflows: `server/workflows/purchase-approval`, `disposal-approval`.
  Draft → in approval → approved / rejected / withdrawn, amount-tiered approvers
  from settings, applicant cannot approve their own request. Business code calls
  `workflowService.trigger()`; `run` nodes call the services above.
- Scheduler: one `SchedulerProvider` on `@nocobase/cron`; each tick calls one
  service method. Daily expiry maintenance, daily reservation release, daily
  rule-layer inspection → `reminders`, monthly straight-line depreciation, daily
  AI inspection (configurable time), ticket auto-close.
- Routes: `defineApiRoutes` per domain under `/api/itam/*`, each with
  `auth.required()` and an authorization check. List endpoints apply the
  decision's conditions and field limits so IT Support never receives cost
  fields, including in stats and exports.
- Notifications through the notification plugin at the points listed in the
  spec, merged ("12 assets expire within 30 days" is one message).

## 3. Client (`client/routes.ts`, `client/pages/`, `client/components/`)

Shared kit, built once in P0 and reused by every object:

`PageHeader`, `StatCards`, `DataList` (server paging, collapsible filter,
natural-language filter slot, bulk-action bar with per-row results and retry),
`Kanban` (per-column paging, drag with modal on required fields; disabled for
assets), `TreeView`, `DetailPage` (summary strip, left info groups, right tabs as
child routes), `InlineField` (hover hint, double-click edit, save on blur),
`HistoryTimeline`, `RelatedList`, `AttachmentsTab`, `ChangeLogTab`,
`ApprovalTimeline`, `RecordLink`, `MoneyCell`, `QtyCell` (total / used /
available), `DeleteDialog` (blocked / warned / plain), `BarcodeLabel` and scan
input, CSV import wizard.

Pages follow the spec's page list. Navigation follows the spec's 导航 section:
primary Workbench, Assets group, Software group, Procurement, Tickets, Audits,
Disposals, Reports; secondary Master Data group, Contracts, AI Action Center;
settings routes with `access`; employee-side routes.

Data access uses TanStack Query hooks in `client/lib/itam/api.ts` (mounted by
`client/react-providers.ts`) against `/api/itam/*`; Refine data hooks are not
used.

## 4. AI (`ai/`, chat panel, action center)

- Chat side panel: install the `nocobase-ai` registry item; add a right-side
  panel in the shell that pushes content left and survives navigation, with a
  header toggle. This edits `client/shell/` (framework structure); comment it and
  document it in `AGENTS.md`.
- `ai/employees/itam.ts` and `ai/tools/`: `search_records`, `get_record`,
  `aggregate`, `check_availability`, `match_model`, `parse_document`,
  `propose_action`, `propose_batch_action` (write a pending row to `ai_actions`;
  the frontend renders the tool result as an action card).
- Action center: `/api/itam/ai-actions` — confirm re-validates permissions and
  preconditions, executes via services with row-level results and dependency
  ordering; ignore with reason; snooze; todo completion.
- Quick entries are `(pageType, current) → prompt` entries. Embedded
  capabilities are buttons calling dedicated endpoints that run the same tools
  without a conversation and degrade to plain forms when no LLM is configured.
- Inspection: the rule layer is the cron service; the AI layer summarizes
  `reminders` into `ai_findings`; the detail-page instant check is one
  lightweight endpoint. Adoption statistics feed the "AI adoption" report.

## 5. Phases

Each phase ends green on `pnpm typecheck && pnpm test && pnpm lint && pnpm build`
plus a browser check.

| Phase                                     | Delivers                                                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 Foundation**                         | Migrations for master data, assets and system tables; seeds (settings, permission sets, default categories); numbering / settings / history / authz services; navigation skeleton; shared UI kit; locales |
| **P1 Assets core**                        | Master-data CRUD pages, asset list / detail / lifecycle actions, people and location detail, history and change logs, basic workbench                                                                     |
| **P2 Stock & software**                   | Accessories / consumables / components, software products, licenses and seats, subscriptions with bills and usage import, compliance                                                                      |
| **P3 Procurement & contracts**            | Vendors, contracts and coverage, purchase orders / lines / receiving / stock-in, approval workflow, generated-records tab                                                                                 |
| **P4 Tickets, repairs, audits, disposal** | Tickets (kanban, quick actions), repairs, audit tasks / items / differences, disposal with approval, in-app notifications                                                                                 |
| **P5 Automation & reports**               | Cron jobs, full workbench, ten reports, settings pages                                                                                                                                                    |
| **P6 AI**                                 | Chat panel, employee and tools, action center, quick entries, embedded capabilities, daily AI inspection, employee self-service guidance                                                                  |
| **P7 Import/export & demo**               | CSV import wizard, discovery reconciliation, barcode labels and scanning, demo data command with deliberate "problem" records, sample PDF / CSV, e2e over the main chain                                  |

Tests per phase: migration up / down against the real database; each service's
state transitions including rejected transitions and rollback; every route's
401 / 403 / 200 with cost-field trimming; component tests for the shared kit;
e2e for procurement → receive → assign → repair → audit → dispose.

## 6. Decisions confirmed

1. ~~Approvals use the workflow plugin.~~ Revised in P3: the workflow plugin
   ships only `condition` / `run` / `terminate` and its own guidance forbids
   emulating a human wait inside `run`, so approvals are an application
   `approvals` table and service (pending → approved / rejected / withdrawn,
   amount-tiered approvers from settings, no self-approval). The workflow
   plugin stays available for future durable multi-step processes.
2. One `stock_items` table with `kind`.
3. Client libraries for kanban drag-and-drop, calendar view and barcode / QR are
   added as devDependencies when their phase starts.
4. P0–P5 are built before AI (P6).

## 7. Status

- **P0 Foundation — done (2026-09-13).** Migrations `202609120001–0003`
  (master data, assets, system tables), seeds (settings, categories,
  permission sets), services (settings, numbering, history, master data),
  authorization registration incl. the `itam.assetsIHold` / `itam.myPerson`
  record-access policies, `/api/itam/settings` and `/api/itam/master/*`,
  the shared UI kit, config-driven master-data list and detail pages with
  inline editing and history / change-log tabs, full navigation skeleton with
  placeholders, en-US and zh-CN locales, 15 tests. Verified in the browser
  (create, detail, inline edit, change log, reference search, both languages,
  both themes).
- Deferred from P0 to P1: tree views for locations / departments / categories;
  Refine resource registration was dropped in favour of the TanStack Query
  hooks in `client/lib/itam/api.ts`.
- **P1 Assets core — done (2026-09-13).** `devices` service with the state
  machine (`device-status.ts`), create with model / category defaults and
  numbering, batch create, assign / loan / return / transfer / reserve /
  unreserve / sign / mark lost / restore / retire / reactivate / correct
  status, named views shared by stats and list, grouped counts; routes under
  `/api/itam/devices`; asset list with stat cards, filters, bulk actions with
  per-row results and retry; asset detail with status-driven actions, inline
  editing, category extended fields and localized history; people holdings tab
  and "mark as left"; asset tabs on models / locations / departments; tree
  view for tree collections; workbench core stats and attention counts;
  `GET /api/itam/settings/permissions` for UI permission probing (database
  grants are absent from the client permission snapshot); locale-key coverage
  test. 27 tests.
- Follow-ups noted: user ids appear raw in history (actor) and the owner
  field until a user-name lookup exists (done in P4: `/api/itam/users`); asset
  attachments tab waits for the file plugin integration (P3).
- **P2 Stock & software — done (2026-09-13).** Migration `202609130001`
  (stock items / holdings / movements, licenses / seats, subscriptions /
  seats / bills, software installs); `stock`, `licenses`, `subscriptions`
  services (issue / return / install / uninstall / stock-in with holdings and
  movements; seat assign / reclaim with compliance recompute and audited key
  reveal; subscription seats, bills, usage import, annualised cost, renewal
  review); shared `createCrudRoutes` factory; P2 grant seed
  (`202609130001_seed_itam_p2_grants`, adds grants to existing sets); generic
  `DomainListPage` / `DomainDetailPage` driven by `DomainConfig`; pages for
  accessories / consumables / components, licenses (seats tab, unlicensed
  installs), subscriptions (seats with idle highlight, bills); asset
  Components and Seats tabs; person holdings grouped across assets, stock and
  seats. 32 tests.
- Follow-up: the master-data pages predate `DomainConfig`; migrating them to
  the generic domain pages would remove duplication (candidate for /simplify).
  Done 2026-09-28 (see「主数据页面并入通用领域页面」below).
- **P3 Procurement & contracts — done (2026-09-13).** Migration
  `202609130002` (`itamFiles` for the file plugin, contracts + coverage,
  purchase orders + lines + receipts, approvals); `approvals`, `contracts`,
  `procurement`, `attachments` services; `createWithin` /
  `stockInWithin` helpers so receiving generates assets (pending receipt),
  stock, licenses and subscriptions inside the order's transaction; routes
  for contracts, purchase orders, approvals and attachments (file plugin
  routes wrapped behind authentication on their exact paths); P3 grant
  seed; contracts and procurement pages on the generic domain pages with
  coverage / lines editor / receiving dialog / approval timeline / generated
  records tabs; attachments tab (file component UI materialized into
  `client/extensions/nocobase-file-component-ui`) on assets, licenses,
  subscriptions, contracts and purchase orders; workbench "my work" with
  pending approvals and orders awaiting receipt. 36 tests.
- Deferred: the procurement kanban view (needs a drag-and-drop library; the
  list with status filter stands in), the contract expiry calendar view.
- Rule reinforced: format a migration with prettier before the dev server
  applies it, or the dev database records a checksum that formatting later
  changes.
- **P4 Tickets, repairs, audits, disposal — done (2026-09-13).** Migration
  `202609130003` (tickets, repairs, auditTasks / auditItems, disposals /
  disposalAssets); `tickets` service (open → inProgress →
  pendingConfirmation → completed | closed, cancel, notes as history events,
  quick actions that run the matching domain operation under the caller's
  `quickAction` grant), `repairs` (creation sends the asset to repair,
  completion drives it by result, loaner assignment), `audits` (scope with
  subtree resolution and preview, snapshot on start, count / scan /
  unregistered, finish marks the rest not found, per-item resolution that
  corrects the asset, completion stamps `lastAuditedAt`), `disposals`
  (draft → pendingApproval → approved → executed via the shared `approvals`
  service; approval reclaims license seats and components and moves assets
  to pending disposal inside one transaction; execution disposes them);
  `LifecycleTransition` on the asset service (`repairDone`,
  `markPendingDisposal`, `dispose`) and `*Within` / optional-connection
  variants on assign / return / transfer / markLost / correctStatus, stock
  `takeBackWithin`, license `reclaimSeatsWithin` so nested steps share the
  caller's transaction; `unrestricted()` conditions for those nested steps;
  `ItamNotifier` over `notificationServiceToken` (in-app channel, actor
  excluded, failures logged not raised) with sends for ticket accept /
  complete / close / cancel, repair completion, audit start, disposal
  submit / decision; `/api/itam/users` name directory (id + name only);
  P4 grant seed (employees own their tickets through `recordsIOwn` on
  `requesterUserId`); `createCrudRoutes` gained a `list` override.
  Client: `DomainConfig` gained `Board`, `Create`, `deletable` and a `t` in
  `subtitle`; ticket list with stats and a status kanban (cards, no drag),
  ticket detail with actions, handling timeline, notes, quick-action dialogs
  and the asset card; repairs list shared by ticket and asset tabs; audit
  pages with the scope create dialog, count / scan / difference resolution;
  disposal pages with the asset list editor, approval timeline and the
  execution dialog; employee pages (my assets, my tickets, request asset,
  report fault); history timeline resolves actor names and per-domain
  status enums; `config.yml` enables the in-app channel. 40 tests.
  Verified in the browser: fault report → accept → repair with loaner →
  complete → close; disposal draft → assets → submit → execute; audit create
  → start → scan → finish; both languages and themes; an in-app inbox item
  delivered to a second user id.
- Deferred: kanban drag-and-drop (cards move through the detail actions), the
  vendor detail repairs tab, the ticket AI quick entries (P6), the sign-off
  reminder for loaners, and the "自动关闭" scheduler run of
  `ticketService.autoClose` (P5 cron). The users plugin's account insert
  fails on SQLite (`account.issuer` NOT NULL), so a second user could not be
  created in the dev database; approvals were exercised through the tests
  and, in the browser, with disposal approval temporarily disabled.
- **P5 Automation & reports — done (2026-09-13).** Migration `202609130004`
  (`jobRuns`); `maintenance` service (daily pass: contract / subscription
  reviews, reservation release, ticket auto-close after
  `thresholds.confirmTimeoutDays`, then the reminder rule layer; monthly
  depreciation; every run recorded, an in-flight run is not started twice)
  with the ten reminder kinds upserted into `reminders`, overdue loans and
  unsigned assignments also notified; `ItamSchedulerProvider`
  (`@nocobase/cron`, 02:00 daily and 03:00 on the 1st, in the configured
  time zone); `workbench` service ("my work" by grant); `reports` service
  with the eleven presets over shared filters (period, location / department
  subtree, category), cost columns dropped without the cost grant, CSV export;
  routes `/api/itam/workbench/*` (my-work, reminders, snooze, jobs) and
  `/api/itam/reports/:name`; P5 grant seed (settings page for Asset
  Managers). Client: role-aware workbench (my work, attention cards from
  reminders, core statistics with filters, management view), reports page
  with tabs / filters / section tables / CSV download, ITAM settings page
  (general, thresholds, numbering, approvals with tiers and user pickers,
  assignment, AI switches, maintenance jobs with manual runs). 42 tests.
  Verified in the browser: settings save and a manual daily run, workbench
  counts and management tables, the tickets-and-repairs report.
- Deferred: charts in reports (tables only), report "AI 报表解读" (P6), the
  employee "待我签收" list on the workbench (sign action exists on the asset
  page), reminder snooze UI (API only), standard configuration packs and
  business-option editing (asset statuses stay fixed by the state machine;
  categories carry the field templates).
- **P6 AI — done (2026-09-14).** Migration `202609130005` (`aiActions`,
  `aiFindings`); `ai/employees/itam.ts` (the "Ava" employee, system prompt
  with the propose-then-confirm contract) and `ai/tools/itam/*`
  (`itam_business_context`, `itam_search_records`, `itam_get_record`,
  `itam_aggregate`, `itam_check_availability`, `itam_match_model`,
  `itam_propose_action`, `itam_propose_batch_action`); tools reach the ITAM
  services through `server/providers/itam/ai-bridge.ts` (the container is
  registered at boot, `scopeFor(userId)` builds an authorization scope the
  way the middleware does) and return errors as tool results; `ai-actions`
  service (typed action schemas, confirm re-checks the grant per action,
  batches run row by row with per-row results and a failure notification,
  ignore / snooze, adoption stats); `ai-inspection` service (rule findings
  grouped from the reminders with book value at stake, optional model
  summary, instant check per record); `ai-embedded` (natural-language
  filter, ticket intake, document parsing, report insight, audit difference
  grouping — 503 without a model or when switched off); `ai-completion`
  (plain completion through the AI plugin's configured model);
  `/api/itam/ai/*` routes. The AI plugin's Registry item is materialized
  verbatim into `client/extensions/nocobase-ai` (lint-ignored, upgrade by
  three-way merge). Client: the assistant side panel in the shell
  (`client/shell/ai-panel.tsx`, pushes content left, header toggle, survives
  navigation, action-card renderer for the propose tools), `ItamAiProvider`
  / `useItamAi` for pages, quick entries on the workbench, asset and ticket
  pages, the action center page (`/ai-actions`) with findings and the
  action tabs, AI findings block and instant check, embedded capability
  buttons beside their plain forms (assets list, fault form, PO lines,
  reports, audit differences). `@nocobase/ai-employee` moved to
  `dependencies` and `ai/**` compiles with the server. 44 tests.
  Verified in the browser: findings and inspection, a proposed action
  confirmed from the action center (asset returned), the instant check on
  the asset page; with a placeholder LLM service the panel, the header
  toggle and the quick entries appear and a prompt reaches the employee.
- Deferred: `parse_document` as a tool (the embedded capability covers the
  document flow), inspection scope configuration, the AI adoption report
  stays a placeholder until findings and actions accumulate (the stats
  endpoint exists), employee self-service guidance runs through the same
  employee (no separate guided flow), and the daily AI inspection schedule
  (the rule layer runs daily; run the AI layer from the workbench).
- **P7 Import / export & demo — done (2026-09-14).** Migration
  `202609140001` (`discoveryImports`, `discoveryCandidates`, `demoRecords`);
  `csv.ts` (RFC-4180 parse / serialize with BOM), `imports` service
  (per-collection specs with header aliases, references resolved by name,
  preview → validate → commit with per-row results and an error-rows CSV),
  `domains.ts` export over any listable collection with the caller's field
  conditions, `discovery` service (serial → MAC → hostname match order,
  software installs refreshed and license compliance recomputed, in-use
  assets not seen accumulate misses and the `notDiscovered` reminder flags
  them past the threshold, unmatched rows become one candidate per device
  that can be registered as an in-stock asset or marked not managed),
  `demo` service (a small company generated through the services with the
  deliberate problems: overdue loan, over-allocated license, audit
  difference, a leaver still holding a laptop, expiring warranty / contract /
  subscription, idle stock; every id tracked in `demoRecords` so clear
  removes exactly what was generated; reminders recomputed on generate and
  clear); routes `/api/itam/imports/:collection/*`,
  `/api/itam/exports/:collection`, `/api/itam/discovery/*`, `/api/itam/demo*`
  (demo and discovery need the settings grant). Client: import wizard and
  export button on every list page (`client/components/itam/import-export.tsx`),
  the Discovery page (`/discovery`: upload, matched / not seen / new counts,
  candidates with register-or-dismiss, import history), discovery and demo
  cards on the settings page. (The QR label sheet that shipped here was
  removed later; see the repairs/disposals entry.) Sample
  files under `public/samples/` (assets CSV, discovery export, delivery note
  PDF + text). Tests: `data-and-demo` (import round trip, export field
  trimming, discovery incl. thresholds and candidates, demo generate / clear
  leaves no trace) and `main-chain` (PO → receipt → assign → fault ticket →
  repair with loaner → return → audit → disposal, end to end through the
  routes). 49 tests. Verified in the browser: import wizard with
  reference-name errors, export, labels sheet, discovery reconcile / register
  / not managed, demo generate (workbench reminders fill) and clear.
- Correction to the P5 entry: its build had failed on `@nocobase/cron`
  sitting in `devDependencies`; it was moved to `dependencies` during P6 and
  every phase since builds clean.
- Deferred: barcode _scanning_ with a camera (labels encode the asset URL,
  so any phone camera opens the asset; the audit page keeps its serial /
  asset-number scan box), exports write reference ids rather than names
  (imports accept either), a Code128 barcode variant of the label, and
  discovery through a live MDM / Intune API rather than an export file.
- **Post-P7 polish (2026-09-15).** Master-data detail pages redesigned:
  `/api/itam/master/:collection/:id/stats` (counts per collection, assets by
  status, tree ancestors) feeds clickable stat cards; a single information
  card with section headings and a created / updated footnote; ancestors of
  a tree node join the breadcrumb as links; "New sub-…" on tree collections
  presets the parent and inherits its rules; delete moved into a "More"
  menu; tabs for a category's models and sub-categories, a manufacturer's
  models, and a location's / department's sub-items (`RelatedListTab` with
  asset counts); the category **field template editor**
  (`client/components/itam/field-template-editor.tsx`: label / key / type /
  required / options, reorder, compact read mode). Detail titles edit in
  place (`EditableTitle`); the name row left the information column. Fixed:
  categories accepted a parent cycle (no `path` column) — `assertParent`
  now walks ancestors; `RecordFormDialog` dropped preset values on create;
  in-place selection editors stayed open when dismissed without a change.
  The category seed writes names and field labels in the deployment locale;
  demo data uses the seeded categories. 51 tests.
  Follow-ups the same day: server error messages are translated on the
  client (`client/lib/itam/server-errors.ts`: exact-message table, patterns
  for messages with values, field labels; registered from the query
  provider); a category's "applies to" is fixed while records use it
  (`CATEGORY_IN_USE`) and its footprint (assets by status / stock items /
  software products, with a view link) sits under that row; category trees
  reorder and re-parent by drag and drop (`POST
/itam/master/:collection/:id/move`, siblings renumbered 10/20/30 and
  logged); the category `sort` field left the form; "requires serial" and
  "assignable to person" edit as yes / no selects, required, default yes.
- **Master-data pass (2026-09-15, later).** Every master-data type now
  follows the category page: no stat cards; tabs (with counts) framed on a
  card — models: assets / stock; manufacturers: models / software products;
  vendors: purchase orders / contracts / repairs; software products:
  licenses / subscriptions; locations: assets / stock / people / sub-items;
  departments: assets / people / sub-items; `RelatedListTab` lists any target (`client/lib/itam/
related-targets.ts`). Trees are tree-only: rows carry kind, updated time,
  a count by what the category applies to, and an edit / delete menu;
  expand / collapse all; search and enum / reference filters (also on
  plain lists) keep matching nodes with their ancestors. Change logs render
  as a table with labelled fields and typed values. Deleting no longer waits
  on the deleted record's refetch. SPEC 主数据 section rewritten to match.
  Models are titled "Manufacturer / Name" (`titlePrefixField`) on the
  detail page and in the list's name column, whose columns are name, code,
  category, updated; row menus say plain 删除. Manufacturers and common
  models are seed data (`202609150001_seed_itam_manufacturers_models`:
  Apple, Dell, Lenovo, HP, Cisco, Logitech, VMware; 14 models with part
  codes and localized specifications); the demo borrows them for its assets
  and stock and no longer creates or deletes models or manufacturers at
  all. Common software products and their publishers are seeded too
  (`202609150002_seed_itam_software_products`: Figma Inc., Microsoft,
  Adobe, JetBrains, Zoom, OpenAI; 8 products) and the demo's license and
  subscription use them. Discovery matches an install to the product with
  the exact name first, then the longest contained name. Models carry a picture as a file in the
  ITAM file repository (`imageFileId`) plus `imageCredit` (migration
  `202609150001_add_model_image_credit`), shown under the picture. The
  seed stores one picture per model the way an upload does: bytes to the
  local disk (`APP_STORAGE_DIR`, else `storage/`) and a row in `itamFiles`
  with fixed ids; six common models get Creative Commons photos from
  Wikimedia Commons, the rest generic drawings, all under
  `database/main/seeds/assets/models/` (credits in `CREDITS.md`, copied to
  `dist` by the build). `RecordImage` / `RecordThumbnail`
  (`client/components/itam/record-image.tsx`) render and edit it; the list
  name column leads with a thumbnail that opens the full-size picture. A
  model shows one tab that follows its category (`extraTabs[].appliesTo`
  on the collection: 设备 for device categories, 库存 otherwise) and lands
  there; location, department and tag tabs listing devices are labelled
  设备 too, since 资产 now means devices plus stock; children tabs show
  设备 / 库存 / 人员 (locations), 设备 / 人员 (departments) and 型号
  (categories) instead of 合计; table cells wrap inside a bounded width;
  a category's first tab is 型号 or, for software categories, 软件产品
  (`extraTabs[].appliesTo` now lists kinds and a category is its own kind);
  the 合计 chip beside 资产类型 is gone; only a top-level category
  chooses 资产类型 (`readonlyWhen` on the field; the server copies the
  parent's value on create and refuses `CATEGORY_TYPE_MISMATCH` on edit or
  move), and the seeded roots are functional groups (终端设备 / 外设 /
  基础设施 / 外设配件 / 打印耗材 / 通用耗材 / 计算机组件 / 应用软件 /
  系统软件) rather than the asset types; the Chinese wording for
  categories is now 分类 / 上级分类 (English: Categories),
  to keep it apart from 资产类型 (the field itself is now labelled 资产类型);
  the category tree has an asset-type tab bar above it (全部 / 设备 / …)
  and the search popover no longer offers that dropdown. Category dropdowns show the tree indented with each
  option's asset type and grey out the edited node's subtree; models and
  software products show the category path (终端设备 › 笔记本电脑) and a
  read-only 资产类型 in lists and on detail pages; models sort by
  manufacturer name then model name through a `sortByReference` join (list
  filters qualify their columns for it); only non-software categories are
  offered for models (`appliesTo:ne` filter, `MODEL_CATEGORY_KIND` guard);
  retyping a top-level category cascades to its subtree or is refused while
  anything in it is in use. Names are unique within a scope
  (`UNIQUE_SCOPES`: a model per manufacturer, a tree node among its
  siblings). Master-data list search opens on its own row under the header
  (controlled `SearchBar` + `SearchToggle`), and the models search offers a
  资产类型 dropdown. Departments are seeded too
  (`202609150004_seed_itam_departments`: an eleven-node organisation with
  codes, localized names) and the demo files its people under them. Demo
  vendor and person names follow the deployment locale (`locale` hook on
  the demo service; zh-CN gets 演示 IT 经销商有限公司, 演示·李娜, …); the
  person detail has no subtitle, uses the narrow master-data layout like
  the other collections, and its 持有 tab (count from `stats` for people:
  `devices` / `accessories` / `entitlements` / `holdings`) has three tables
  headed 设备 / 配件 / 授权 with their counts, the last uniting license
  seats and subscription accounts; empty tables render only their hint.
  The people list shows 设备 / 配件 / 授权 counts (`LIST_COUNTS.people`,
  whose `where` conditions now take a list and IS NULL). Any reference into
  a tree collection (category, department, location, a node's own parent)
  reads with its ancestors wherever it appears — `FieldValue` renders
  `TreePath` (`client/components/itam/tree-path.tsx`, helpers in
  `client/lib/itam/tree.ts`) and the reference picker's trigger shows the
  chosen node's path (技术部 › 研发) while its dropdown stays indented.
  The mark-as-left dialog summarises and lists all three holding kinds
  (the workbench reminder always counted them; the dialog only listed
  devices). Tags are withdrawn from the UI and the API (no page, route,
  collection registration, schema or `filter[tagId]`): nothing could tag
  an asset, and mainstream hardware ITAM leans on groups or custom fields
  instead. The `tags` / `device_tags` tables stay (migration history and
  the permission-set seed still name them); dropping them is a later
  migration if tags never return. The fifth asset type is now labelled
  授权 / Entitlements and stored as `entitlement`
  (`202609160001_rename_software_applies_to` rewrites existing rows; the
  categories seed writes the new value, so a development database needs
  its seed checksum re-baselined). The 主数据 group opens on an overview
  page (`client/pages/itam/master/overview.tsx`, `/master-data`): a
  full-width matrix with one column per asset type read upwards from the
  records (records → categories of that type → models / software products
  → manufacturers), then two lanes for 位置 / 部门 / 人员 / 持有 and 供应商
  / 采购单 / 合同 / 维修记录, every card a link with a live count, plus the
  set-up order. Delete blocking (`REFERENCES` in `master-data.ts`) now covers every
  column that names a master record — vendors by purchase orders /
  contracts / repairs, models and software products by order lines and
  tickets, departments by orders and tickets, people by tickets and
  allocation history — with per-reference `where` conditions replacing the
  people-only special cases; the blocked list labels come from
  `references.*` first. The device register is named as such end to end
  (`202609160002_rename_assets_to_devices`): the `assets` table and every
  column, index, discriminator value, route, service, i18n key, file and
  test that said asset now says device; the migration renames through the
  connection's knex client because the builder cannot rename a field,
  patches the collection metadata documents, and rewrites the JSON that
  named the old identifiers (numbering settings, permission grants on
  `main.assets`, audit scopes, pending AI proposals). `assetsGroup`,
  `myAssets`, `requestAsset` and the `assetRequest` ticket type keep the
  umbrella word. Existing development databases need the changed seeds'
  checksums re-baselined; the device number field is labelled 编号. Seed
  `202609150005_seed_itam_vendors_people` adds four role-named vendors and
  a first employee (黎晓, EMP-001); the demo keeps its own vendors and
  people since it marks one as a leaver. Software
  entitlements: a unified 授权 page under the 资产 menu (the 软件 group is gone; `/entitlements`, `GET
/itam/entitlements` unions licenses as `perpetual` and subscriptions as
  `subscription`, filtered per caller's read grants, sorted and paged in
  memory) with a kind-first create flow; the licenses and subscriptions
  list routes redirect there and lose their menu entries, detail pages stay;
  software products show one 授权 tab and count; the license field
  `licenseType` is labelled 有效期 (永久 / 有期限 / 试用). Storage is still
  two tables — merging them is a later step if the workflows converge; the models
  list has a 合计 column (`countField`: assets plus stock quantity by
  `modelId`). The software products list has license and subscription
  count columns (`countColumns`, served by `GET
/itam/master/:collection/counts` from `masterData.listCounts`). Website
  fields are `type: 'url'`: wrapping text (still double-click editable) followed by an
  external-link icon that opens the address in a new tab. Manufacturers
  gained `supportEmail` (validated) and `supportUrl` (migration
  `202609150002_add_manufacturer_support_contacts`), importable by CSV.
  Manufacturer and vendor lists show related counts (models / software
  products; purchase orders / contracts / repairs) through the same
  `countColumns` mechanism, and a manufacturer's software products tab
  shows license / subscription counts. In-place multiselect edits save when
  focus leaves the group or via 保存 / 取消 buttons. Locations are seeded
  (`202609150003_seed_itam_locations`: Singapore HQ with level 3, warehouse,
  server room; Japan branch; localized names) and the demo places its
  records there; the location page shows its 负责人 (`ownerId`, a user).
- **Device detail pass (2026-09-16/17).** The device page opens with a
  breadcrumb line (设备 › category path · model · serial), a title
  `编号 / 名称`, and a one-line summary: the status badge and one relation
  item whose label follows the relation (分配给 / 借出给 / 预留给, with an
  icon, the counterpart as a link and the date suffix); 未分配 opens the
  assign dialog. Ownership, currency (edited together with the purchase
  price) and the purchase order are inline fields; the warranty state is a
  badge after 保修截止日期; extended fields follow 基本信息. Actions:
  assign prefilled from a reservation, the location proposed from the
  target (a person's office, a location itself, a device's location) and
  confirmable in the dialog; reservations target 人员 / 位置 / 设备 (no
  business restriction, `RESERVATION_TYPES = ASSIGNEE_TYPES`); assignment
  date is the operation time and is not editable; assign / return / retire
  carry no note (return keeps 检查结论, 标记丢失 requires a note); dates
  are limited to today onwards with a four-digit year cap; 取消预留 / 停用
  / 重新启用 / 恢复 confirm; the ··· menu offers 报修 and 申请处置 as
  in-place dialogs (the fault report's requester defaults to the holder),
  打印标签, 标记丢失, 停用, 修正状态 and 删除. A transfer is one history
  event; status-change events are recorded only where no business event
  exists; the history tab is a vertical timeline with named counterparts
  and labels for extended-field changes. Delete is blocked by any reference
  (assignment, reservation, tickets, repairs, audits, disposals, installs,
  seats, holdings, coverages) — kept as is at the user's choice. Every
  list in the application pages (`client/lib/itam/paging.ts`:
  `useServerPage` for server-paged lists, `usePagedRows` for client-side
  ones, 20 per page), including detail-page tabs, the employee pages, AI
  actions and discovery candidates; the ticket list lost its stat cards
  (SPEC 工单主页 updated). Demo data drops the 演示 / Demo prefix
  (Northbridge / 北桥 vendors, realistic names, serials and hostnames such
  as `SG-LT-001`), writes ticket / repair / audit / disposal free text in
  the deployment locale (`TEXTS` in `demo.ts`), and `demo.clear` first
  releases user-made assignments to demo records so nothing dangles.

### 2026-09-17 工单申请调整

- 按产品讨论统一为“资产申请”，旧软件申请迁移为资产申请（软件授权）。SPEC 仅作参考。
- `requestAssetType` 覆盖设备、配件、耗材、组件、软件授权；`quantity` 为正整数，默认 1。历史设备申请回填设备 / 1。
- 设备及库存物品按类型筛选分类、型号；软件授权选择软件产品。申请无需绑定已有设备，组件安装时再选择目标设备。
- 报修、归还、调拨、报废申请必须绑定设备。设备详情的报修入口固定类型与设备。
- 资产申请快捷操作按类型提供设备分配、库存发放 / 安装、授权分配或采购；采购前补齐型号 / 软件产品，并沿用申请数量。
- 新申请字段通过授权插件的公开 Permission Sets API 在首次启动升级已有字段权限，保留原操作与记录范围。
- 工单状态标签沿用设备状态的圆角、间距和语义色。

### 2026-09-17 工单关联资产与展示

故障申报、归还/调拨/报废申请开放全部五类关联资产。设备保留 deviceId，数量物品使用 stockItemId，永久/订阅授权使用 entitlementId + entitlementKind。关联对象提交后只读；非设备工单当前通过人工处理结果完成，设备专用快捷动作在前后端均限制。旧设备工单回填关联类型，不改变历史生命周期。所有详情系统信息补创建人；类型字段统一使用带菜单图标的 AssetTypeBadge。

### 2026-09-17 工单保修与详情卡片

工单保修截止日期按设备读取当前值，沿用设备详情日期和保修状态标签；无日期或无设备读取权限时显示空值，不把授权有效期当保修期。迁移 202609170004 移除 tickets.underWarranty；回滚只能恢复空字段，不能恢复旧快照。工单、设备和分类详情共用单张窄版信息卡片及分节标题。

### 详情页字段整理（2026-09-17）

采购、合同、盘点、处置、工单统一沿用主数据/资产的单卡片分组布局；摘要保留状态和关键统计，系统时间只显示在系统信息。补齐采购关联合同与人员、合同负责人、盘点执行人/范围、处置负责人；人员显示关联名称。取消、终止、执行结果按条件显示，空分组隐藏。行内编辑遵循已有服务的状态限制。对应展示顺序和实际页签已同步到 SPEC。

- **Ticket detail cards (2026-09-18).** The ticket page's right column
  opens with an asset card (`client/pages/itam/tickets/asset-card.tsx`,
  the `Aside` slot) above the tabs; the fields stay on the left, the
  description alone across its row (`fullWidth`). For a linked ticket the
  card reads the device live — number / name with status, category path,
  serial, model, holder relation (shared `DeviceRelation`, also used by the
  device page), warranty — with the device quick actions on its title row;
  an asset request shows what it asks for with the fulfilling actions. Quick
  actions moved out of the process tab into
  `client/pages/itam/tickets/quick-actions.tsx`; each is tagged with the
  device operation it runs so the client mirror of the state machine
  (`OPERATION_FROM` in `client/lib/itam/devices.ts`) hides what the device's
  status forbids, and the return dialog matches the device page's. Their
  events carry the names involved (device, target, vendor, status,
  location path, condition, order numbers) so the timeline reads them
  back; repair events are localized too. The impact statement is gone
  (`202609180001_drop_ticket_impact`): no high-urgency rule, no prompt when
  raising urgency, no employee-form hint. The ticket list is a per-column
  paged board; every remaining `<ul>` list pages through `Paged`, and the
  process tab keeps line breaks in notes. Device basic info reads 分类、
  序列号、型号、制造商 (`detailOrder`).
- **Ticket end state (2026-09-18).** `completed` is gone: a ticket ends in
  `closed` and `closeMethod` says how (`requesterConfirmed` /
  `handlerClosed` / `autoClosed`), shown in the 处理 group and carried in
  the status-change event. Migration
  `202609180003_merge_ticket_completed_into_closed` adds the column, moves
  `completed` rows to `closed` + `requesterConfirmed`, infers the method for
  rows already closed from the auto-close event, and rewrites the status
  in ticket events and change logs (down reverses it). The board has five
  columns. Purchase orders keep the ticket they were created from
  (`202609180002_add_purchase_order_ticket`); the ticket's request section
  lists them with status, the create dialog carries the order's own fields
  (quantity, unit price with a currency dropdown, reason, vendor, date,
  description) and offers 保存草稿 or 提交审批, and warns when orders
  already exist. Quick actions also take stock back and reclaim seats;
  their timeline entries read 执行快捷动作：<action> <link>（详情）.

- **Repairs and loans untangled; repairs become documents.** A repair no
  longer links a loaner (`202609190001_drop_repair_loaner`): a device lent
  during a repair is an ordinary loan made from the ticket (allocation
  source = ticket), listed on the ticket's asset card as 借出中 with 收回
  (`takeBackLent`). Completing a repair separates the result (已修复 /
  无法修复 / 已更换整机) from where the device goes (`disposition`:
  back to where it was — the option names the holder or reservation — or
  pending disposal, with a hint of what that ends); the ticket timeline
  records both. Finished repairs may correct result, return date, cost and
  notes; any repair may be deleted (in progress restores the device).
  Repairs are numbered (`202609190002_add_repair_no`, kind `repair`,
  `RP-`; existing rows numbered by creation order), have a list page and
  detail page of their own (`/repairs`, navigation 维修) and are called
  维修单; device / ticket / vendor tabs link each card to its document.
  Device statuses read 借出中 / 已停用 / 已丢失; 处置 is 报废 throughout the
  Chinese UI, with the `scrap` method renamed 销毁 to avoid 报废方式：报废.

### 2026-09-19 移除工单（路线 A）

决定把系统收缩为纯 ITAM：工单是 ITSM 的职责，公司已有或将有独立的服务台，
本系统只做资产台账。

- 删除 `tickets` 服务、路由、页面（列表、看板、详情、快捷操作、资产卡片）、
  员工端的我的工单 / 申请资产 / 报修三页，以及设备详情的工单页签和
  「提交故障工单」入口。维修单、报废单、采购单直接从设备页、列表页或
  自己的页面创建。
- 迁移 `202609190004_drop_tickets`：删除 `tickets` 表，去掉 `repairs`、
  `disposals`、`purchaseOrders` 的 `ticketId`，清理指向工单的历史事件、
  变更记录、提醒、附件关联和演示记录；`down` 按最终形态重建表结构。
  历史上的工单迁移保留不动。
- 设置去掉工单编号规则、受理超时、完成后自动关闭和 AI 的工单智能受理；
  每日维护不再自动关闭工单；工作台不再有待受理 / 我处理中 / 我的工单
  卡片；报表「工单与维修」改为「维修」，只保留按型号故障率与供应商表现。
- 权限：P4 种子不再给员工任何授权，也不再给 IT 支持 / 资产管理员
  `tickets` 集合；启动时 `removeTicketGrants` 把已有权限集里的
  `main.tickets` 授权删掉（一次性，键 `upgrade.removeTicketGrants.v1`）。
- AI：`ticketCreate` / `ticketAccept` 动作、`ticketIntake` 嵌入能力和
  `itam_get_record` 的工单关联全部移除；员工提示词改为指向维修与报废。
- 演示数据不再生成工单；维修单直接挂在过保笔记本上。
- 若将来需要接外部 ITSM，按路线 B 的思路加一个「资产请求」对象和回写
  接口，而不是恢复工单。

### 2026-09-20 合并授权表

许可证与订阅合并为一个 `entitlements` 对象（表 `entitlements` / `entitlement_seats` /
`entitlement_bills`，`kind = perpetual | subscription`）。用户只面对「授权」，类型决定字段、
页签与操作；两类工作流（席位合规 vs 计费与续订）成为同一条记录上的列。

- 迁移 `202609200002_merge_entitlements`：建三张新表并按类型拷贝旧数据（`effectiveDate` →
  `startDate`，`providerVendorId` → `vendorId`，`itOwnerId` → `ownerId`；`licenseType` 删除，
  固定期限 / 试用的许可证成为带到期日的永久授权）；改写历史事件、变更记录、提醒（`entitlementExpiring` /
  `entitlementOverAllocated`）、附件关联、合同覆盖（`targetType = entitlement`）、到货记录
  （`generatedType = entitlement`）、采购明细（`itemType: license → perpetual`）、待确认 AI 动作
  （`licenseId → entitlementId`）和演示记录；然后删旧表。`down` 按类型拆回。
- 服务 `entitlements.ts` 与路由 `/itam/entitlements`：统一 `assignSeats(seats: [{holderType?,
holderId?, account?}])`（永久授权按授权方式决定持有人类型；订阅授权要账号，人员可空）、
  `seats-of/:holderType/:holderId` 返回两类席位、账单 / 使用情况导入 / 密钥查看按类型校验；
  合规状态对两类都计算；统计合并（超量 / 闲置 / 即将到期 / 待评估续订 / 订阅年化支出）。
- 权限集只有 `main.entitlements`（P2 种子改写；`reconcileGrants` 启动时删掉旧的
  `licenses` / `subscriptions` 集合与页面授权，和工单一起）。
- 客户端一个域：`/entitlements` 列表（授权类型 / 软件产品 / 合规状态 / 供应商筛选）、
  详情（字段按类型 `visibleWhen`，账单页签仅订阅），`/licenses`、`/subscriptions`
  路由与页面删除；人员 / 设备的席位列表、合同覆盖、采购单生成记录、工作台链接、记录抽屉
  注册表全部指向 `entitlements`。
- 报表以 `entitlementKind` 列区分两类；导入是一个含 `kind` 列的 CSV。
- 后续（同日）：永久授权不再有到期日期（有期限 / 试用的旧许可证迁成固定费用
  的年度订阅），只有维保到期；席位在站点许可 / 免费 / 非按席位订阅之外必填。
  采购单、采购价格、合同三个字段从授权上删除（迁移
  `202609200003_drop_entitlement_purchase_fields`）：到货可以「加到已有授权」
  （席位累加、订阅续费改到期日），到货记录即采购记录（详情页「采购记录」页签，
  报表按到货数量 × 单价折算授权成本），合同只走覆盖范围。演示数据里的两份永久
  授权改为通过采购单到货生成。
- 再后续（同日）：授权删掉供应商、数据存放地区、处理敏感数据（迁移
  `202609200004`、`202609200005`），币种只属于订阅；授权加分类、制造商两列
  随软件产品（迁移 `202609200006`，随产品带出、只读、可筛选，分类计数直接按
  列统计）；授权主页去掉统计卡片；demo 授权名称不再带席数。
- 负责人字段五类资产、采购单、合同统一：创建时默认选中创建人（必填），详情页
  在「系统」组里可改，列表不加列不加筛选。`tags` / `device_tags` 从未被任何
  代码使用，迁移 `202609200007_drop_tags` 删除。
- 设备规则（同日）：租赁 / 借用 / 员工自带不折旧（创建强制、编辑拒绝开启）；
  租赁 / 借用的出借方和归还日期表单必填；预留中的设备分配弹窗只显示预留并可
  就地取消预留；预留截止默认 14 天；归还时清空所属部门；改采购日期或型号时
  未手工改过的保修截止日期重算；预计更换日期只读 = 采购日期 + 分类更换周期，
  采购日期、型号或分类更换周期变化时重算；创建弹窗按型号 + 采购日期预填保修
  截止日期。
- 软件安装记录（同日）：整体删除。它只由发现导入里的「已安装软件」列填充，
  而系统本身不扫描设备、现有数据源也不提供这一列，所以按设备授权的安装数
  比较、授权页的「未授权安装」和软件合规报表的「已安装」列一直是空的。迁移
  `202609200008_drop_software_installs` 删表；发现导入不再解析软件列，
  合规只比较席位与已分配；`reconcile-grants` 清理旧的集合授权。
- 设备列表（同日）：去掉批量创建（批量用 CSV 导入）和多选批量操作（分配 /
  归还 / 改位置 / 改部门），与其他列表一致；`DataTable` 不再有选择列，
  `useBulkRun` / `bulkEligibility` / 批量动作栏删除。右上角操作统一为
  搜索、导出、导入，再是页面自己的按钮。只读规则字段（随型号 / 随软件产品 /
  预计更换日期）的说明改为标签旁的 info 图标 + tooltip（`FieldLabel`）。

### 2026-09-24 配件 / 耗材 / 组件不进维修、报废与盘点

确认维持现状：库存类物品（配件、耗材、组件）只关联采购单，不进维修单、
报废单和盘点任务。

- 维修单只指向一台设备（`repairs.device_id` 非空）；配件坏了按整件更换或
  走保修退换处理，不为它开单。
- 报废单的清单是 `disposal_devices`，只收设备。设备报废批准时仍会把它身上
  的组件收回库存，那条流水的来源是报废单（`sourceType = 'disposal'`），
  这是组件与报废单唯一的联系。库存自身的报废暂不提供出口。
- 盘点任务的范围（`AuditScope`）只认位置 / 部门 / 分类 / 设备，按件盘点。
  库存按数量盘，模型不同，暂不纳入。
- 已知缺口，一并暂缓：库存流水定义了 `调整` 类型（locale 有文案），但服务、
  路由和页面都没有实现，所以入库后的数量只能通过发放 / 安装 / 消耗减少，
  报损、丢失和盘亏无法登记。要补时按「详情页加调整数量动作 + 一条 `adjust`
  流水」做，不需要新表也不需要新单据。
- 若将来要把库存纳入报废或盘点，`disposal_devices` 需要改成多态清单、盘点
  需要支持按数量盘，两者都是新的模型决策，先回到这里记录。

### 2026-09-24 库存流水由时间线派生，不再双写

库存物品原来每次出入库既写 `stock_movements` 又写一条同内容的历史事件，合并
时间线后同一件事在两个页签各讲一遍（迁移 `202609240005` 删掉了镜像事件）。

最终形态是**单一数据源 + 完整时间线**：

- 写入只有一处：`stock_movements`。
- 历史服务支持"派生来源"（`DerivedEvents`）：subject 是 `stockItems` 时，
  `stockMovementEvents` 读流水表映射成时间线行（持有人名字按类型批量查一次），
  和存储的事件一起排序。不存第二份，因此不会对不上。
- 库存流水页签照旧：它有时间线表达不了的东西——正负号、余额、行内归还。
- 持有方的事件（人员的「领用 X ×1」、设备的「安装组件」）仍然是真实存储的
  事件，那一端关心这件事。

判断标准：**只有当存在比时间线说得更多的专用表示时才另开页签**（库存流水的
余额），而且那份表示应当是唯一的写入口，时间线从它派生。

### 2026-09-24 历史与变更记录合并成一条时间线

详情页不再有「历史」+「变更记录」两个页签，只有一个**历史**：业务事件和字段
变更按时间排在一起，顶部 `全部 / 业务事件 / 字段变更` 筛选。

- **关联键**：迁移 `202609240004_add_operation_id` 给 `history_events` 和
  `change_logs` 各加一列 `operation_id`；`operationContextOf`（`http.ts`）
  每次操作生成一个，服务写历史时带着它。一次分配现在是**一行**：事件
  「分配给李娜」，点开是它改的三个字段，而不是两个页签各记一遍。
- **读取**：`historyService.timeline()` 把两张表按操作分组后合并排序；
  `/history?kind=all|events|changes`，`all` 是默认。分组必须在切页之前完成，
  所以按记录整取（上限 2000 行/表）后在内存里合并，而不是在 SQL 里分页。
- **没有 operationId 的行**（升级前写的、以及没有操作上下文的写入）单独成行，
  不会被错误地凑成一组。
- 库存不再 `historyTab: false`：它的 22 条历史事件以前在界面上**根本看不到**，
  现在归入时间线；库存流水页签照旧，它是数量账本，不是审计。
- `domain.historyTab` 和各域的 `tab-changes.tsx` 一并删除。

### 2026-09-24 席位页签是状态表，不是流水

授权详情保持「当前席位表 + 历史页签」两块，不改成库存那样的流水。

- 席位表列当前被持有的席位（`releasedAt is null`）：持有人 · 密钥（永久）/
  账号 + 最近使用（订阅）· 分配日期，行操作是设置密钥与回收。**不加类型列**
  （每行都是"分配中"）、**不加数量列**（一人一席，`DUPLICATE_SEAT` 规则保证
  恒为 1）、持有人**不改叫去向**（它描述状态而非方向）。
- 席位的经过由历史页签承载：`seatAssign` / `seatReclaim` / `seatsAdded` 都在
  那里，带持有人和操作人。
- 库存能用流水取代历史（`historyTab: false`），是因为库存物品的一生就是进出；
  授权的历史还有密钥设置、账单、续订决策、用量导入、合同覆盖和软件产品变更，
  流水覆盖不了，换掉就丢了审计线索。主流产品（Snipe-IT 的 Seats + History、
  ServiceNow SAM、Torii、Flexera）也都是"当前分配表 + 独立审计日志"两块。

### 2026-09-25 修复 account 表的遗留 issuer 列

创建用户一直是 500：`NOT NULL constraint failed: account.issuer`。

- 原因是认证插件升级后的**库结构漂移**：旧版本用 `issuer + accountId` 标识账号
  并把该列设为 NOT NULL，现在的插件改用 `providerId + accountId` 且不再写
  issuer；而建表迁移在两个版本里同名，所以从没重跑，这个库就留着一列没人填的
  必填字段。
- 迁移 `202609250010_repair_account_issuer` 修掉三处遗留：删列、补上现版本要的
  唯一索引 `uq_account_provider_account`、并把集合元数据里的 `issuer` 字段去掉
  ——beta.43 之后元数据里有一个没有物理列的字段，会让该集合的每次解析直接抛错
  （`Collection resolution failed`），这正是删列之后 500 仍在的原因。
- 列和元数据分别判断：一个库可能只剩其中一个。`down` 留空，恢复一个没人填的
  必填列就是缺陷本身。

### 2026-09-25 审批页签并入历史；审批时看得到买的是什么

- **采购单去掉「审批」页签**：提交、撤回、批准、拒绝本来就是历史事件，缺的只是
  中文和意见。补上 `history.summaries` 的
  `approvalRequested` / `approvalWithdrawn` / `approvalApproved(WithComment)` /
  `approvalRejected(WithComment)` / `linesChanged(WithReason)`，历史里现在读作
  「提交审批 等待审批」「撤回审批 已撤回，回到草稿」「明细变更 2 条明细」，
  审批意见跟在决定后面。页签只剩生成的记录 / 附件 / 历史，默认页签改为生成的
  记录，`tab-approvals.tsx` 和它的路由删除。
- **审批对话框列出明细**：此前审批人只看到一个意见输入框——批的是什么看不见。
  现在对话框上方列出每条明细（型号 / 软件产品 / 服务名称 · 数量 · 小计）和
  预计总金额。
- 报废的审批页签暂时保留（它的历史事件还没做同样的补全），要一起收的话另说。

### 2026-09-25 审批人下拉不列申请人自己

提交审批时选不了自己（服务端 `SELF_APPROVAL` 会拒），所以下拉里干脆不出现：
`GET /itam/users/approvers` 接受 `filter[exclude]=<用户 id>` 并剔除那个人，
采购传申请人、报废传创建人（代人提交时排除的是那张单的申请人，而不是当前
操作人）。

**2026-09-27 作废**：自批限制取消，`filter[exclude]` 和四个下拉的剔除都删了，
见下面「允许申请人审批自己的请求」。

### 2026-09-25 `useGetIdentity` 一直返回 undefined，"是不是我"全都答否

`useCurrentUserId()` 读的是 Refine 的 `useGetIdentity`，而**这个应用没有任何
插件实现 `getIdentity`**，所以它一直返回 undefined：设备创建表单的"负责人默认
为自己"从来没生效过，而刚加的按角色分按钮更糟——申请人的「撤回」和审批人的
「审批」同时消失，因为两边的判断都是和 undefined 比。

改为从认证会话读（`useAuthentication().session.user.id`，用户菜单本来就是这么
拿名字的）。

同时补上列表上的**「待我审批」切换**（`Views` 插槽，采购列表实现它）：按钮带
数量徽标，按下即 `?view=myApproval`，再按取消。此前这个视图只能从工作台卡片
进入。

### 2026-09-25 申请人和审批人看到的不是同一个页面；报废同样改为指定审批人

同一张单据，两种身份该看到两套动作：

- **申请人**：撤回（只有申请人看得到，审批人撤别人的单没有道理）。
- **审批人**：审批（不是申请人，且被指定或无人指定时才显示）。
- 采购单和报废单用同一套判断。报废的"申请人"是创建人（`createdById`，报废单
  没有申请人字段）。

**报废审批同样简化**：提交审批的对话框加上审批人选择，选项来自
`GET /itam/users/approvers?filter[subject]=disposal`（授予
`itam.disposals/approve` 的权限集的成员）；服务端 `disposals.submit` 早已接收
`approverId`，这次补上界面。留空仍表示任何有报废审批权限的人都能处理。

### 2026-09-25 审批流程收尾：按钮、摘要、待我审批、通知

围绕"谁该看到什么"把采购审批这条链补齐。

- **审批中只留撤回**：草稿删除、审批中撤回、已决定的才谈取消，所以
  `pendingApproval` 不再显示「取消」；删除按服务端规则（`draft` / `cancelled`
  才可删）用 `deletable` 隐藏，不再点了才报错。
- **审批按钮只给被指定的人**：此前只看 `permissions.approve`，于是提交人自己
  也看得到一个点了必被 422 挡回的按钮。现在按服务端的同一套规则判断——不是
  申请人，且（审批无指定人 或 自己在指定人里）。
- **摘要里显示审批人**：审批人不在采购单的字段里（见下），所以摘要那一项由
  组件 `PurchaseOrderApprover` 自己去读待审批记录并解析姓名；通用详情页在
  加载完成后才调 `summary`，所以 `items` 必须是纯函数，钩子只能待在组件里
  （否则 React 报 "Rendered more hooks than during the previous render"）。
- **待我审批的列表**：新增列表视图 `view=myApproval`，由路由把
  `approvals.pendingFor(我)` 的主体 id 翻成一次 `id in (...)` 查询；工作台的
  「待我审批」卡片改指向它（原先指向 `view=pendingApproval`，那是所有人的
  待审批，点进去看到的多半不是自己的事）。
- **补上通知**：采购审批此前**一条通知都不发**（报废是发的）。提交后通知被
  指定的审批人，审批 / 拒绝后通知申请人，都走 `itamNotifierToken`，事务提交
  之后发送、不通知操作人自己。

### 2026-09-25 审批人由提交人指定，取消金额分级

审批路由从「按金额分级自动匹配审批人」改成「提交时选一个人」。

- 提交审批的对话框多一个**审批人**选择框，选项来自
  `GET /api/itam/users/approvers?filter[subject]=purchaseOrder|disposal`：
  该路由读权限集，挑出授予了 `itam.<collection>/approve` 的集合，再取这些集合
  的用户成员（停用账号不列）。选谁就只有谁看得到这条待办、只有谁能批。
- **留空 = 不指定**，任何有审批权限的人都能处理（`approverIds` 为空时的原有
  行为），申请人不能审批自己的单这条不变。
- 设置里的**金额分级删除**：类型、默认值、设置页的分级编辑器，以及迁移
  `202609250009_drop_approval_tiers` 清掉已存设置里的 `tiers`。审批配置卡片
  只剩每类请求的开关加一行说明。
- 报废走同一条路（`disposals.submit` 同样接收 `approverId`）。
- 为什么简化：分级路由要维护一张"金额 → 人"的表，而这个系统里审批人本来就
  是提交人知道的那一位；真要按金额分权，权限集本身就能表达。

### 2026-09-25 预计到货日期只在下单时填

创建采购单的表单去掉**预计到货日期**（字段本身保留）。

- 申请时没人知道供应商什么时候能到；申请人说得清的是**需求日期**。预计到货
  日期是下单后供应商给的答复，由「标记已下单」对话框填写，那里本来就有。
- 字段仍在详情页和 CSV 导入里（迁历史单据时可能知道当时的预计到货日）。
- 它现在的唯一读取方是列表的 `view=overdue` 筛选；统计条删除后没有入口链接
  到它，要么以后补一条"到货逾期"提醒和工作台卡片，要么连筛选一起删——留待
  决定。

### 2026-09-25 采购单去掉负责人

采购单删掉 `owner_id`（迁移 `202609250008_drop_purchase_order_owner`）。

- 单据已经有**申请人**：审批规则读它（申请人不能审批自己的单），页面在
  「申请信息」里显示它，而负责人只是创建时默认成同一个人。负责人这个共用字段
  属于长期持有的记录（设备的保管人、授权的管理人），不属于一张写完、批完、
  关掉的单据。
- `ITAM_COLLECTIONS` 里采购单的 `attributes.owner` 改指 `requesterId`，所以
  「我负责的记录」这类数据范围在采购单上仍然成立，含义变成"我申请的"。
- 创建表单、详情字段、路由 schema、种子的可授权字段列表同步去掉。

### 2026-09-25 明细去掉用途与目标字段，草稿改为删除而非取消

- `purchase_order_lines` 删掉 `purpose`、`target_person_id`、
  `target_department_id` 三列（迁移 `202609250007_drop_line_targets`）。三个
  字段写进了表结构却从来没有入口：没有表单填、没有导入映射、只有演示数据设过
  一次。一条明细说的是买什么、买多少；给谁是采购单的部门和申请人，为什么是
  采购单的事由。
- 收货时新建设备的部门改从**采购单**的 `departmentId` 取（原先取明细的
  `targetDepartmentId`）——演示数据里两者本来就一致。
- AI 动作的采购单 schema 和工具说明同步去掉 `targetPersonId`。
- 草稿状态的采购单**不再提供「取消」**：草稿直接删除即可，取消留给已提交、
  已有审批历史因而不该删除的单据。
- 「删除采购单」移入更多菜单（`deleteInMenu`），页头只留当前该做的事。

### 2026-09-25 采购单明细页签重做

明细是采购单本身，之前却读得像个附属表格：整表进出编辑模式（加一条要把每一行
变成表单）、没有合计、说明单独占一列把行挤窄、"保存"在没填原因时静静变灰。

- **明细从页签升为卡片**，放在页签上方（`Aside`），卡片头带标题和编辑按钮，
  照分类的「扩展字段」卡片的样子做。明细是采购单本身，不该和附件、历史并列
  藏在页签里。页签只剩审批 / 生成的记录 / 附件 / 历史，默认页签改为审批，
  `/procurement/:id/lines` 路由和 `tab-lines.tsx` 删除。
- **整表编辑**：卡片头一个「编辑」按钮，点开后所有明细一起变成可编辑，最后
  统一取消 / 保存——采购单的明细本来就是一起录的。保存是整组 PUT，和 API
  一致，按钮也照扩展字段卡片的样子：改了才可保存。
- **加行在行尾**：每行末尾一个「在下方添加明细」，空表时表格中央给一个「添加
  明细」，卡片头不再放添加按钮。
- **明细可拖动排序**：行首一个抓手，拖动改顺序，保存时 `sort` 按数组顺序写入。
- 合计行只留数字，不再写「合计 N 条明细」。
- **合计行**：明细条数、数量合计、金额合计、到货合计，跟着表走。
- **列精简为 物品 / 数量 / 单价 / 小计 / 已到货**：类型徽标、型号（或软件
  产品）和说明叠在「物品」一格里；没有任何单价可读时（无成本权限）单价和小计
  两列整体消失，而不是显示一排「—」。
- **修改原因改成对话框**：草稿直接保存；提交之后保存时弹窗要求填原因，并说明
  为什么要填，而不是让保存按钮无声地禁用。
- **客户端先校验**：硬件缺型号、授权缺软件产品时保存禁用，不必等服务端 422。
- **资产类型下拉只列五种资产类型**（设备 / 配件 / 耗材 / 组件 / 授权）加一个
  「服务」；选了授权再出现第二个下拉选永久 / 订阅。存储仍是
  `itemType = perpetual | subscription`（收货要据此创建对应的授权记录），只是
  不再把"永久""订阅"摆在资产类型的位置上。`enums.lineItemType` 的两个标签
  相应改为「永久授权」「订阅授权」。
- **类型和型号同一行**：类型下拉按内容宽（一个词），型号 / 软件产品占剩下的
  宽度；数量和单价的输入框填满各自的列，和列名对齐。明细不再有独立的「说明」输入：资产由型号或软件产品命名，只有**服务**
  行需要手写名称，那个输入就放在类型旁边，一行就是一条服务。已有数据的说明
  仍会显示在物品名下方。
- 顺带修好 `AssetTypeBadge`：它的图标映射还停在合并前的 `license`，所以永久
  授权没有图标而订阅有。

### 2026-09-25 明细的写入以「读得到」为界

`setLines` 此前不做字段授权：IT 支持读不到明细的 `unitPrice`（权限集里没给
这一列，`costFields` 把它归为成本字段），客户端因此每次都发 `unitPrice: null`
——服务端照写，**一次明细编辑就把所有单价清零**。比"能写自己看不见的字段"更糟。

规则改为：**读不到的字段既不能写，也不会被清空**。

- 路由在 `update` 之外再对 `purchaseOrderLines` 取一次 `read` 决策，传给
  `setLines`（`lineConditions`）；明细是独立集合，它的 `fieldAccess.output`
  才是明细字段的尺子。
- 给出非空值 → `UnauthorizedFieldsError`（写自己看不见的东西）；给出 null →
  该字段整个从写入里剔除，保留库里的值（客户端替代缺失值发来的 null）。
- AI 动作中心同样传确认人的明细读权限；导入和演示数据走内部路径，不受限。
- 采购单详情页副标题去掉供应商（标题已有单号，供应商在信息卡里）。

### 2026-09-25 采购主页去掉统计条，`/purchase-orders/stats` 一并删除

采购列表顶部的四张统计卡（待审批 / 待验收 / 本月批准 / 本月支出）删除：它们
说的是列表本身读一眼就知道的事，能点的两张又和状态筛选重复。

- 客户端组件、`procurement.stats.*` 文案一并删除。
- 没有任何调用方之后，服务端也删掉：路由 `GET /api/itam/purchase-orders/stats`、
  服务方法 `stats()`、两侧的 `ProcurementStats` 类型。留一个没人调的端点只会
  让下一个人以为它还在被用。
- `filter[view]=pendingApproval|awaitingReceipt` 仍在 `list()` 里，工作台的
  「待验收到货」卡片链接 `/procurement?view=awaitingReceipt` 照常工作。
- 其他域（合同、盘点、报废、设备）的统计条和 `/stats` 端点不动。

### 2026-09-25 采购单支持 CSV 导入（多行合并为一张单）

采购单此前不能导入不是一个决定，是 SPEC 自相矛盾后实现只落了一半：导入章节
（`SPEC.md` 数据导入与导出，原名「数据导入与外部数据对账」）列举的可导入对象里没有采购单，而采购单
列表页的动作行写着「导入/导出」。现在按后者补齐。

- 导入机制新增**分组**概念（`ImportSpec.group`）：`by` 指定分组列，`lines`
  把行字段映射到子记录输入的键，其余字段属于单头，取每组第一行；后面的行可以
  重复单头列，但不能和第一行冲突（冲突即该行报错）。
- 采购单一行一条明细：单头 `reason`（必填）、说明、供应商、部门、合同、需求
  日期、预计到货、币种；明细 `itemType`（必填）、说明、型号 / 软件产品、
  数量（必填）、单价。明细字段只收页面能编辑的那些——导入页面看不见的字段
  等于制造无人能改的数据。
- **只新增，不更新**：文件里的单号只用于分组，采购单号仍由编号服务生成，所以
  没有可用于匹配既有单据的键。重复导入同一个文件会得到重复的草稿，由使用者
  负责。想保留旧系统单号的，把它映射到「说明」列。
- **一组要么全进要么全不进**：组内任何一行报错，整组不写入，其余行标记
  `"<单号>" not imported: line N failed`。缺了一条明细的采购单没人看得出来。
- 导入走服务而非直接写库，所以领域规则照常生效（硬件明细必须有型号、数量
  必须为正整数……），单据落在 `draft`，审批和收货仍走系统。
- 授权沿用集合的 `create`；`setLines` 用 `unrestricted('purchaseOrders',
'update')`，因为要填的就是同一次调用刚创建的草稿。
- 向导在分组导入时多一行说明（`data.groupedRows`），由 `preview` 返回的
  `groupBy` 触发。

### 2026-09-24 席位数改为只读，由「调整席位」变更

授权的席位数（`seatCount`）创建时填写，之后不再是可编辑字段——改成和库存数量
一样，只能由操作变更，每次变更说明多少和为什么。

- 变更入口两个：**收货**（采购单行收货时 `receiveWithin` 加席位，写
  `seatsAdded`）和**调整席位**（`POST /itam/entitlements/:id/adjust-seats`，
  服务 `adjustSeats`），后者对应库存的**手动入库**——没有单据的那条路。
- 调整带方向（增加 / 减少）、数量和备注，写 `seatsAdded` / `seatsRemoved`
  事件，备注进时间线那一行（`seatsAddedWithReason` / `seatsRemovedWithReason`）。
- 规则：数量为非零整数；已分配的席位是下限（先回收再减）；席位不计数的授权
  （site / free / 非按席位计费的订阅）拒绝调整。
- 授权用 `update` 而不是新操作：这正是此前能编辑该字段的那个授权，改成操作
  不应该改变谁能做，也就不需要迁移存量 grant。
- 详情页字段用 `readonlyWhen: (values) => values.id !== undefined` +
  `readonlyHint`，创建表单里照旧填写。
- 为什么不是只做「增加席位」：席位数只读之后，续订缩容和录错更正就没有任何
  出口了。库存的 `adjust` 类型至今没实现是已知缺口，这里不重复它。

### 2026-09-24 授权方式去掉并发与按核数

永久授权的授权方式只保留 `perUser` / `perDevice` / `site` / `free`。

- 并发授权的合规看的是**峰值并发数**，按核数的计量单位是**服务器核数**，
  两者都不是"席位分配"；而这个系统明确不做设备扫描
  （`202609200008_drop_software_installs`），这两种的真实合规永远算不出来，
  留着只会给出误导性的绿灯。
- 数据里没有任何记录用过这两种，所以没有配套的数据迁移。
- 同时补上一处校验缺口：永久授权的授权方式创建时必填，**更新时也不能清空**
  （此前可以，清空后席位规则和持有人类型都失去依据）。详情页的内联编辑
  现在按记录解析 `requiredWhen`，必填字段不再提供"无"这个选项。

### 2026-09-24 席位自带密钥

授权上的 `productKey` 更名为**共用密钥**（批量/MAK 那种一钥激活多席位），
另给每个永久授权席位加了可选的自有密钥（零售、盒装那种一席一钥），迁移
`202609240002_add_entitlement_seat_key`。

- 席位密钥只对永久授权有效；订阅席位用的是账号，服务端直接拒绝写入。
- 读出来都是掩码，`hasProductKey` 说明有没有；查看走 `viewKey` 操作并记审计，
  `reveal-key` 带上 `seatId` 就查看该席位的密钥。
- 设置/更换席位密钥是 `seat-key` 操作（归在 `assignSeat` 权限下），留空即清空
  回落到共用密钥；密钥本身不进历史，只记录"已设置/已清空"。
- 查看的眼睛图标放在密钥值后面（`client/pages/itam/entitlements/product-key.tsx`），
  页面操作区不再有单独的查看按钮；没有 `viewKey` 授权就不渲染眼睛，
  请求也会被拒。

### 2026-09-24 业务操作改为独立授权资源

升级到 beta.43 后，数据库集合只保留 `read` / `create` / `update` / `delete`，
本应用自己的 28 个操作（分配、发放、审批、导出…）全部被
`UNKNOWN_DATABASE_RESOURCE_OR_ACTION` 拒绝：接口 403，按钮因此消失。升级
当时的处理（给自定义动作借用数据库资源的 authorize）正是命中那道闸的函数，
测试没拦住是因为 authz 替身不校验动作目录。

按插件模型改造：

- `server/providers/itam/authz-resources.ts`：每个有操作的集合声明一个
  `itam.<collection>` 业务资源，操作再 `.grant()` 到底层集合；只读操作
  （`export`、`viewKey`）要的是 `read`，其余要 `update`。
- 判定统一到 `decideWith`：先问资源是否持有该操作，再带 `params.operation`
  问集合要这次操作的条件（这样一个操作的数据范围不会被另一个放大），最后
  把响应字段收窄到调用者的 `read` 授权——IT 支持不会因为执行了某个操作就
  看到成本字段。路由经 `decideFor`（`http.ts`）使用它，AI 工具经
  `ai-bridge.ts`。
- 存量权限集由 `202609240001_move_operations_to_resources` 迁移，把
  `main.X/assign` 改写成 `itam.X/assign` 并保留原来的数据范围；种子用
  `splitOperations` 产出同样的形状。操作可写的字段现在来自代码声明，不再
  存在授权里（插件模型：后台配置不能改变一个操作能写什么）。
- `tests/support/test-app.ts` 现在校验动作目录：问错资源的路由测试就会红，
  这类问题不会再只在浏览器里出现。
- 副产品：权限集页面出现「ITAM」业务分组，28 个操作可以逐个授权并单独配
  数据范围；以前它们混在集合权限里。资源与操作的标题目前是英文（取自
  `collections.ts` 的 `title` 和动作名），要本地化就给它们配 `{key, ns}`。

### 2026-09-25 不跟踪席位使用情况

订阅席位的「最近使用」只来自手工粘贴的「账号, 最近登录日期」导入：应用不读
取任何 SaaS 控制台，所以这一列记的是有人最后一次想起来粘贴的数据，并据此
高亮「未使用」的席位、算「低利用率」视图。决定两样都不做——不自动检测，也
不手工导入：

- 去掉 `importUsage` 操作（服务、`POST /itam/entitlements/:id/import-usage`、
  授权资源与种子授权）、席位页签的「最近使用」列、人员持有物里的「最近使用」
  状态（改为授权日期）、`lowUtilisation` 统计视图和 `thresholds.seatIdleDays`。
- `202609250001_drop_seat_usage` 删 `entitlement_seats.last_used_at`，并从已
  保存的阈值里去掉 `seatIdleDays`；`reconcileGrants` 启动时从存量权限集里剥
  掉 `itam.entitlements/importUsage`（`STALE_OPERATIONS`）。
- 保留 `idleSeatRatio`：合规状态「闲置」按**未分配**席位占比计算，与使用情况
  无关。席位优化只依据能确定的事实：持有人离职、设备退役、空余席位。
- 以后要做，走 SSO 登录日志或各厂商管理 API 的定时同步，而不是恢复手工导入。

### 2026-09-25 去掉订阅账单和业务负责人；管理控制台地址两类都有

- **账单**：逐期手工录入，没有任何地方读它——报表、工作台和年化费用都按单价或
  周期费用估算。主流 ITAM 也不在资产台账里逐期记账：刷卡的按月订阅由财务对
  账，签约金额看合同。去掉「记录账单」按钮、账单页签、`recordBill` 操作、
  `GET/POST /itam/entitlements/:id/bills` 和 `entitlement_bills` 表
  （`202609250002_drop_entitlement_bills`）。
- **业务负责人**：和记录本身的「负责人」重复，没有规则、提醒或权限读它。去掉字
  段、采购到货时的选择框和 `entitlements.business_owner_id` 列
  （`202609250003_drop_entitlement_business_owner`）。
- **管理控制台地址**：永久授权也有厂商门户（密钥、下载、维保），两类都显示。
- 订阅的其他复杂情况（按年承诺席位、按月逐席位扣费）这次不改模型：先按现有字
  段登记，以后需要再加「期限：固定 / 滚动」。
- `reconcileGrants` 改为按 `collections.ts` 声明的操作清理存量 `itam.*` 授权：
  一条未声明的操作（`recordBill`、`importUsage`，或 P4 种子由工单授权拆出的
  `itam.tickets`）会让授权插件整套拒绝（"Invalid business resource grant"）。

### 2026-09-25 订阅计费参照 ServiceNow：一个价格、续订操作、关联单据

参照 ServiceNow SAM 的「授权只记买了什么、单位成本 × 数量，钱和条款在合同上」：

1. **一个价格**：去掉 `cycleCost`（`202609250004_single_subscription_price`）。
   它填了就覆盖「单价 × 席位」，按席位的订阅调席位后年化费用不跟着变。
   `unitPrice` 的含义随计费方式：`perSeat` 为每席每期，`flat` 为整份每期（页面
   标签用 `labelWhen` 显示「每期费用」）。迁移把填过周期费用的订阅改为 `flat`、
   周期费用搬进单价，并重算年化费用。
2. **计费方式收成两种**：去掉 `usage`（没有用量数据，只能填估算的每期金额，就是
   `flat`），存量迁成 `flat`。
3. **任何计费方式都能填总席位**：`seatsRequired()`（永久非站点/免费、按席位订
   阅）决定必填，`seatsUnlimited()` 只在确实没填时为真；`flat` 填了就是上限，
   分配、调整、超量与闲置都照常计算。
4. **续订操作**（`POST /itam/entitlements/:id/renew`，授权为 `update`，同调整
   席位）：新到期日必须晚于当前，可同时改单价和总席位（不低于已分配），续订
   决策写 `renewed`，历史 `renewed` 事件带上一期的到期日、价格、席位。
   ServiceNow 每期新建一条授权；这里席位挂在授权上，搬席位太重，改为用一条
   历史保留上一期。采购单到货续费同样写 `renewed`。`reviewDueRenewals` 也会
   把 `renewed` 在下一期的窗口里切回 `underReview`（以前只看 `notDue`，续订过
   的订阅再也不会进评估）。
5. **关联单据页签**：授权的「采购单」页签换成「关联单据」，分采购单和合同两组
   （`TabSection` 移到 `components/itam/tab-section.tsx`，合同列表与请求按
   `CoverageTarget` 通用化）；`countBy` 可返回多个请求，页签数字为其和。

### 2026-09-25 订阅只有「下次续订日」和「自动续订」

同一天前面加的「续订」操作和「本期开始 / 本期结束」被这条取代：

- 订阅的日期只有一个 `expiryDate`，页面上叫**下次续订日**（`autoRenew` 为否时
  叫**到期日**，`labelWhen`）。`startDate` 只对永久授权显示（购买或生效日期）。
- **续订决策去掉**（`202609250005_subscription_auto_renew` 删列和索引）：六个值
  没有页面读，唯一的自动逻辑「未到期 → 待评估」和到期提醒重复；有用的只有
  「不续订」，它现在就是 `autoRenew = false`。迁移按「决策不是 cancel 就自动
  续订」写 `autoRenew`（旧的 `autoRenew` 没有任何作用，不代表意图）。
- **`autoRenew` 有了作用**，新建订阅默认开：
  - 开：`advanceRenewals()`（每日任务，取代 `reviewDueRenewals`）把过了的日期按
    整个计费周期顺延（`nextRenewalDate()`，按原日期逐月计算、月末截断），写
    `renewalAdvanced` 历史事件。
  - 关：日期就是结束日；过了以后详情页 `Notice` 提示，工作台新增
    `entitlementEnded` 提醒（仍占席位时），列表视图 `view=ended`。
- 到期提醒（`expiringWhere`）不再包含按月自动续订的订阅：每月都会续，没有要
  决定的事。
- 去掉续订操作（`POST /:id/renew`）、`renewed` 事件和「待评估」统计与视图；采购
  单到货续费只改日期。续订时价格、日期变了直接改字段（变更记录有前后值），
  席位走「调整席位」。

### 2026-09-25 去掉合同，保留采购单

主流 ITAM 里合同的作用是到期和续约提醒，而这里需要提醒的到期已经在各自的记录
上：设备的保修到期、订阅的下次续订日、永久授权的维保到期。合同条款和扫描件由
法务或合同系统管理，在资产台账里再维护一份只会对不上。采购单保留：它是资产的
来源，到货生成设备、库存和授权，库存与永久授权的成本也只来自到货记录。

- `202609250006_drop_contracts` 删 `contracts`、`contract_coverages` 和
  `purchase_orders.contract_id`，以及指向合同的历史、变更记录、提醒、AI 发现、
  附件关联、演示记录、合同编号规则和序号。回滚只恢复表结构。
- 服务、路由、页面、供应商的「合同」页签、设备和授权的合同分组、主数据概览的
  合同节点、工作台「合同即将到期」提醒、报表里的合同列、导入导出、AI 工具和
  文案里的合同都去掉。授权的「关联单据」页签只剩采购单，改回「采购单」页签。
- 种子（P3 / P4 授权、权限集页面）不再授予合同和工单：以前数据重置会重新写入
  `itam.tickets`，授权插件因此整套拒绝，直到下次启动由 `reconcileGrants` 清掉。
  `reconcileGrants` 仍会从之前保存的权限集里去掉 `main.contracts`、
  `main.contractCoverages` 和 `contracts` 页面授权。
- 设置里「合同 / 订阅到期提前天数」改称「订阅与维保到期提前天数」。

### 2026-09-26 权限集里的字段清单改成每个动作一份

审批账号看不到采购明细里的物品名称和供应商，原因不在页面：`/itam/master/*`
整类接口对他一律 403。授权插件从 beta.43 起，数据库授权的 `fields` 是**一个
动作一份清单**（`'*'` 或字段名数组），不再是 `{ input, output }`；形状不对的
策略会被整条丢掉，而且不报错。于是权限集里所有 Collection 授权都是空的，只有
声明了 `itam.*` 业务操作的集合还能靠操作展开出来的授权读到 —— 型号、厂商、
供应商、分类、位置、部门、软件产品这七张主数据表一个操作也没有，因此谁都读
不到。

- 四个种子（权限集、P2 / P3 / P4 授权）改写成新形状：`read` 带可读字段，
  `create` / `update` 带可写字段，`delete` 不带字段。`write()` 不再接收输出
  清单。
- `reconcileGrants` 启动时把老形状就地改写（`normalizeGrantFields`），已经
  保存的权限集和管理员的改动都留着，不需要数据重置。
- 写操作的授权因此不再说明「能读回什么」，`decideWith` 改为同时问一次
  Collection 的 `read`，把结果放进 `fieldAccess.output`；创建和更新的返回值
  由它裁剪。`/itam/master/*` 的创建、更新、删除、移动和删除影响原先自己调
  `authz.authorize`，绕开了 `decideWith`，一并改走 `decideFor` /
  `decideCollection`。
- `tests/support/test-app.ts` 的授权替身也照做：写操作的 `fieldAccess.output`
  为空，绕开 `decideWith` 的路由在测试里就会返回空记录。

### 2026-09-26 生成的记录按库存种类跳转；明细拆成两列

- **生成的记录点进去跳错页**：`referenceRoute('stockItems')` 是一张静态表，
  永远指向 `accessories`，所以一条耗材（HP 58A toner）点开落在配件页上。
  `generated()` 现在把库存的 `kind` 一起返回，链接按 `STOCK_ROUTES` 走，耗材
  去 `/consumables/:id`、组件去 `/components/:id`。
- **采购明细的「物品」列拆成两列**：**资产类型**（徽标，授权再跟一个永久/订阅
  的种类标签）和**型号 / 软件产品**（名称）。编辑态同样拆成两格，类型下拉留在
  第一列、按内容宽度，名称下拉吃剩下的空间。
- 新建库存记录时，如果所选位置已有同型号的库存记录，位置下方提示一行（只提示
  不拦，同一批货分两箱单独管也可能是有意的）。

### 2026-09-26 库存的型号必填；到货入库明确区分加入与新建

- **配件 / 耗材 / 组件的型号改为必填**：规则写在服务里（`insertItem`），所以
  手工新建、CSV 导入和演示数据都受同一条约束；路由 schema 和客户端字段同步。
  型号是"这批库存到底是什么"的唯一答案，分类和制造商也是从它来的。
  演示里三条没有型号的库存（Zone Vibe 100 耳机、USB-C 线缆、Latitude 5440
  电池）补了三个种子型号和三张同风格的示意图。
- **到货入库时二选一**：原来"选了库存记录=加入、没选=新建"全靠猜，现在顶部
  一组单选——**加入已有库存记录 / 创建新库存记录**。默认落在"加入"并选中同型号
  的那条（没有同型号记录时默认"新建"）；加入时位置只读地显示该记录的位置，
  新建时位置可编辑且必填。入库数量默认未到货数量，只能减不能超。
- 创建采购单加了**申请人**（在说明下方），选定后带出该申请人的部门，仍可改可
  清；`/itam/users` 因此附带每个用户关联人员的 `departmentId`。部门本身改回
  选填。
- 型号 / 软件产品下拉在名字后显示**分类 · 制造商**（`ReferenceSelect` 内按集合
  判断），明细的型号下拉还按资产类型预过滤。

### 2026-09-26 采购明细去掉自由文本说明；授权明细读作「授权 + 种类」

- **删掉明细的 `description`**（迁移 `202609260004_drop_line_description`）：它
  原来兼两件事——服务明细的名称，和物品名下方的一行备注。服务类型同日删除后，
  界面上没有任何地方能写它，只剩 CSV 导入、AI 解析文档和演示数据三个写入方，
  读的人既加不了也改不了。一条明细就是它买的东西：型号或软件产品。到货生成的
  设备 / 库存 / 授权名称改为只从型号、软件产品或验收时填的名称来。
  CSV 的 `itemDescription` 列、`purchaseOrderLines` 的 `searchFields` 一并去掉。
- **授权明细的标签**：先一个 `授权`（`enums.appliesTo.entitlement`），后面跟
  授权详情页同款的 `EntitlementKindBadge`（永久 / 订阅），两处说的是同一件事、
  长得也一样，不再用「永久授权 / 订阅授权」两个独立文案。

### 2026-09-26 采购单只有一个金额；状态用颜色区分

- **去掉实际总金额**（迁移 `202609260003_drop_actual_total`）：一张单挂两个
  金额，读的人得先判断哪个才是"这张单的金额"，而第二个并没有回答第一个没
  回答的事——明细写着价格，真正付了多少是财务系统的记录。剩下的那个就叫
  **总金额**（`fields.estimatedTotal` 的文案，键名不动）。到货不再回写金额。
- **状态标签按状态上色**（`PO_STATUS_TONE` + `PurchaseOrderStatusBadge`，照设备
  状态的做法）：等人处理的是琥珀色（审批中），在推进的是主色（已批准、已下单、
  部分到货用信息蓝），拒绝和取消是警示色，草稿和已取消是灰。列表列、详情摘要
  都走同一个组件——`cells.tsx` 通过 `isPurchaseOrderStatusField` 识别。
- **明细的型号下拉按资产类型预过滤**（`filter: { appliesTo }`，服务端本来就
  支持），并给两个下拉加了各自的占位文案：请选择型号… / 请选择软件产品…。

### 2026-09-26 采购明细去掉「服务」类型

`service` 是六种明细类型里唯一到货后什么都不生成的：设备生成设备，配件 /
耗材 / 组件进库存，永久授权 / 订阅生成授权，服务只把已到货推一格。采购单被
留在这个系统里的理由正是"它是资产的来源"，一条不产出资产的明细不属于这儿；
金额对账是财务系统的事。演示数据也从未造过服务明细。

- 客户端和服务端的 `LINE_ITEM_TYPES`、明细编辑器里的"服务名称"输入、到货入库
  的 service 分支、CSV 导入的 `itemType` 取值、`enums.lineItemType.service`
  和 `procurement.serviceName` 文案全部删除。
- 迁移 `202609260002_drop_service_lines` 删掉库里残留的服务明细，并按剩下的
  明细重算采购单的预计总金额；`down` 为空。
- 明细的 `description` 列保留（AI 解析文档、CSV 导入和演示数据都写它，读视图
  把它显示在物品名下方），但界面上已经没有输入它的地方。

### 2026-09-26 采购明细不存接收状态

`SPEC.md` 里写过一个只读的**接收状态**（未到货 / 部分到货 / 已到货），实现从
未落地：明细只有 `receivedQuantity`，页面把它和数量一起显示成 `1 / 2`，颜色
区分三种情况。派生出来的状态再存一份，只会和数量对不上，所以规格里删掉这个
字段，保留「已到货数量」。

同日修掉这一列的颜色：部分到货用的是 `text-warning`，而 `--warning` 是警告
底色不是文字色（浅色主题里几乎看不见，深色主题里是深褐），改成
`text-warning-foreground`；已到齐原来用 `text-success`，但主题根本没有
`--success` 这个变量，等于没上色，改成应用里表示正向的 `text-primary`。

### 2026-09-27 报废单按状态收口

按给定的规格核对了报废单的按钮、信息卡和执行弹窗，差异逐条改掉：

- **撤回回到草稿**。原来撤回会进入 `withdrawn` 这个单独状态，而采购单撤回是
  回到草稿。同一件事两种说法，状态列表里就多出一个没人能再往下走的格子，
  所以 `withdrawn` 去掉了（迁移 `202609270001_drop_disposal_withdrawn` 把
  库里剩下的改回草稿），撤回过的事实由时间线记着。
- **执行报废只有经手人能点**：申请人 / 创建人 / 被指定或做过决定的审批人，
  和采购单的"取消"同一条规则（`NOT_INVOLVED`），页面和服务端都拦。
- **执行弹窗按规格问**：执行人（默认当前用户）、报废日期、报废收入（仅出售）、
  报废费用（带币种）、数据清除、清除方式（仅已清除）；接收方留着，因为批准
  之后记录不能再编辑，执行是最后一次能更正它的机会。
- **审批按钮**的"不能批自己的"改成按审批单上的 `requestedById` 判断，原来看
  的是创建人——替别人代填的草稿由本人提交时，创建人其实是可以批的。
- **信息卡**：基本信息去掉币种（金额本来就带币种显示），执行分组按
  执行人 → 接收方 → 报废日期 → 报废收入 → 报废费用 → 数据清除 → 清除方式
  排列，只有执行才知道的几项（执行人、日期、收入、费用）在已执行后才显示，
  报废收入还要求是出售。
- **摘要条**在状态后面显示审批人，和采购单一致（组件抽成
  `client/components/itam/record-approver.tsx`，两边共用）。
- **已批准不是整单冻结**：审批决定的是"哪些设备、为什么、怎么处置"，接收方
  和数据清除 / 清除方式不在其中，往往也是事后才定的，所以这几项在执行之前
  仍可编辑（`EDITABLE_STATUSES` / `SETTLED_EDITABLE`，页面上用
  `approvedDisposal` 把决定过的字段设为只读）。
- **已清除必须选清除方式**：两者做成一个级联控件——选了已清除，清除方式在
  同一个编辑器里出现，一起保存（字段上的 `dependent`）。所以数据库里不可能
  出现"已清除但没有方式"，`update` 和 `execute` 都会拒绝这种组合。
- **接收方在左侧也是一行**：标签就叫接收方，编辑时先选供应商还是其他
  （字段上的 `alternateField`），`recipientName` 只是它的另一半，不再单独
  成行。两种复合字段（还有金额＋币种）在信息卡里都用「保存 / 取消」结束，
  因为由多个部分组成的答案在填完之前不该写进去——选第一项就保存会写进半个
  答案。
- **报废收入不限报废方式**：销毁的废料也可能卖钱。

### 2026-09-27 盘点明细读起来像盘点

- **账面使用人**改叫**账面去向**：设备可能在人、在地点、也可能装在另一台
  设备上，原来只在"人"的时候显示，其余一片空白。现在用和库存、席位同一个
  `HolderCell`，带图标（人 / 地点 / 设备），盘点的人一眼知道该找什么。
- **盘点结果由右侧三个按钮表达**：一致 / 未找到 / 有差异，点过的那个填色，
  一致是绿色（为此在 `client/styles.css` 补了 `--success` 语义色，所有主题
  都有）。左边设备状态后面不再挂结果标签——只有在不能盘点的场合（任务已完成、
  没有权限、账外记录）才显示它。
- **三种"不符"合并成一种**：一台设备可能同时位置不对、去向不对、状态不对，
  原来只能挑一个当结果，处理时也只纠正那一项，剩下的就留在账上了。现在结果
  只有「有差异」（迁移 `202609270004_merge_audit_differences` 把旧值归并），
  差在哪由明细自己的实际位置 / 实际去向 / 实际状态说明；处理方式相应并成
  「按盘点结果更新」，一次把盘到的值全部写回设备。
- **实际去向也分类型**：人 / 地点 / 设备，和账面一侧一样（迁移补了
  `actual_assignee_type` 列）。
- **记录差异弹窗**：不再问盘点结果（那是按钮的事），三项实际值左边并排显示
  账面记录；**填了的每一项都必须和账面不同**——和账面一样的那一行会直接标红
  说明，服务端也逐项拒绝；三项全空则不是差异，弹窗说明该改点「一致」或
  「未找到」。已经记过的再点开会预填上次记录的内容。差异记录在明细卡片上
  另起一行显示。
- **登记账外设备挪到页面头部**，和完成盘点 / 取消盘点并列（只在进行中且有
  盘点权限时出现）：它是对任务的操作，按本应用的惯例就该在头部，明细页下面
  也就不用为它单开一行。
- **明细上方一行**：进度（全部 / 已盘 / 未盘，点数字即筛选）、结果
  （一致 / 未找到 / 有差异，点文字即筛选）、设备搜索（编号、名称或序列号，
  边打边筛）。筛选和分页都在客户端做，所以计数始终是整张任务的真实数字。
  原来的「扫码」按钮删掉了：一个既能搜又会按回车直接盘点的框太容易误操作，
  扫码枪扫出来的编号现在把列表筛到那一台，点「一致」即可；「登记账外设备」
  成了行尾一个独立按钮（原来只能靠扫一个查不到的编号才能进入）。
- **可选下拉不再用「无」当取消**：空值显示占位文字，清空是控件右侧的 ×，
  和引用选择器一致（`field-input.tsx` 的 select / currency 分支）。
- **状态「待处理差异」改叫「待处理」**（差异数量那一列同样叫「待处理」）：
  这个状态盖着三件事——有差异、未找到、账外设备——而「差异」同时又是其中
  一件的名字，一个词两个意思。枚举值 `pendingDifferences` 不变，改的是文案。
  盘点结果筛选也补上了账外，标签从「账外设备」缩成「账外」，和旁边的
  一致 / 未找到 / 有差异 一样短；按钮和说明里仍写全称「登记账外设备」。
- **补登记按创建设备的问法问**：名称（预填盘点时写的那个名字，可改）、型号*、
  序列号、存放位置*、所属部门、所有权、供应商、采购价格 / 日期、保修截止日期、
  备注、负责人；分类和制造商跟着型号走，选完型号就显示在它下面，不单独问
  （服务端本来也是从型号取的）。「登记账外设备」弹窗里的"标记"改叫"名称"。
- **处理弹窗不再让人选处理方式**：三种结果各自只有一种处理——有差异 →
  按盘点结果更新、未找到 → 标记丢失、账外 → 补登记——所以确认按钮直接就是
  那一项，旁边加一个**标记不处理**（`markVerified`，只记录看过，不动账）。
  「按盘点结果更新」的弹窗不再问备注，改成列出**账面 → 盘到**的对照。
- **标记丢失的备注改成选填**（设备详情页和盘点里一样）：设备丢没丢和有没有
  人能说清为什么，是两件事。服务端同步放开，`markLost` 不再强制要求备注。
- **不再往记录里写英文**：盘点纠正设备状态时原来会写 `Not found in audit X`
  / `Audit X` 这样的英文摘要，现在只带盘点任务的名字；设备历史里那条状态
  变更也认得出是哪次盘点——`HistorySource` 多了一个 `sourceLabel`，事件
  payload 带上 `auditTaskId` 和名字，时间线按 `statusChangeByAudit` 渲染并
  链接到盘点任务，和报废单的写法一致。
- **按盘点结果更新会连位置一起写对**：原来先写位置再改去向，而分配操作会把
  设备挪到新持有人所在的位置，把刚写的位置覆盖掉。现在位置跟着分配一起传，
  没有分配时才单独写。
- **完成盘点的弹窗**按类别报数：「已盘 8 条；待处理 5 条（有差异 3 · 未找到 1
  · 账外设备 1），完成后进入差异处理；盘到的设备将记录本次盘点时间」。原来
  只说"N 条有差异"，而「差异」在这里同时是三件事的统称和其中一件的名字，读
  起来会误以为只有一种要处理。
- **完成盘点**在还有未盘明细时不显示——它会把没盘到的一律标记为未找到，那是
  盘完之后才该做的决定；**取消任务**改叫**取消盘点**。

### 2026-09-27 管理员就用平台 root

本系统不再维护自己的管理员角色。`root` 是不受限的权限集——授权内核发现主体
持有它就直接放行，不解析任何授权——所以原来把 29 个集合、9 个资源的授权复制
一份进 `system-administrator`，只是多了一处每次加集合、加操作都要记得同步的
副本，并不多给一分权限。种子只创建 `itam-employee` / `itam-it-support` /
`itam-asset-manager`（四个授权种子里给 system-administrator 的那几行都删了）。

随之而来的两处归属变化：

- **本系统的设置归资产经理**（`itam.settings` 读 + 写）。原来经理只能读、只有
  管理员能改；现在管理员这一格没有了，再不给经理写权限就只剩 root 能改编号
  规则和提醒阈值了。
- **删除设备只剩 root**。设备是带历史的记录，删除是订正误建，本就不是业务
  动作。

种子只增不减，所以已有部署的 `system-administrator` 保留着此前拿到的 ITAM
授权（那是管理员自己的数据，启动时的 `reconcileGrants` 只清理指向已删除对象
的授权，不碰这些）；新装的部署则干净了。

### 2026-09-27 日期按本地日历算

采购单的「实际到货日期」被记成了前一天：服务端所有"今天"都写成
`new Date().toISOString().slice(0, 10)`，那是 UTC 日期，东八区从 0 点到 8 点
之间记下的一切都落在昨天。日历日期是本地事实，不是时刻，所以
`server/providers/itam/dates.ts` 的 `isoDate()` 改成按服务器时区格式化，并
导出 `today()`；`devices` / `disposals` / `repairs` / `reports` /
`maintenance` / `audits` / `master-data` / `workbench` / `entitlements` /
`procurement` / `demo` 各自的副本全部删掉改成引用它，客户端只剩
`entitlement-domain.tsx` 一处改用 `todayIso()`。`addDays` / `addMonths` 仍是
纯字符串算术（内部用 `Date.UTC` 构造，不受时区影响）。
`tests/logic/dates.test.ts` 在东八区、UTC、西八区和 UTC+14 下都跑过。

### 2026-09-27 演示数据复核

按采购模块从头走了一遍，顺手把演示数据里对不上的地方改了：

- **审批人是真人。** 原来所有审批都寄给 `demo-approver` 这个不存在的账号，
  于是那张停在"审批中"的单子谁都批不了，历史里的审批人也显示成一串 id。
  服务提供者新增 `otherUser`：从 `user` 表里挑一个不是生成者本人的账号，
  优先挑持有 `itam.purchaseOrders/approve` 的；只有一个账号时仍退回占位 id。
- **到货日期。** `receivedAt` 是操作自己盖的章，演示生成时全是"今天"，于是
  2025 年下的单子显示今天到货。生成完按「预计到货日期 + 1 天」回填，采购
  收货记录的时间戳一起改。
- **每种状态都有。** 补了已批准、部分到货、已拒绝、已取消四张单子，加上原有
  的草稿 / 审批中 / 已下单 / 已完成，列表能看到全部八种状态。
- **需求日期**每张单子都填了；原来整列是空的。
- **设备逐台入库。** 演示原来一次收两台（`quantity: 2` + 两个序列号），页面
  只支持一台一台收，现在演示也一样，顺带写上名称、保修和负责人。
- **命名与位置。** 显示器和手机原来叫 "Dell U2723QE" / "iPhone 15"，改成
  `SG-MON-00x` / `SG-PH-001`，跟其他设备一致；采购收货生成的两台叫
  `SG-LT-030/031`。在库的备件挪到仓库，不再挂在 3 楼。
- **人和供应商填全。** 员工有职位和电话，供应商有联系人、电话和邮箱。
- 永久授权补了维保截止日期，续订视图不再空着。

### 2026-09-27 审批人写在摘要里，报废单先说清怎么处置

采购单摘要条上原来只有停在"审批中"时才显示审批人，批完就没了。审批人现在跟
在状态后面，从提交那一刻起一直在：等着的时候是被指定的那个人，批完 / 拒绝
之后是做决定的人。重新提交如果换了人，读最新那条审批
（`/approvals` 按 `requestedAt` 倒序）。草稿没提交过，不显示；撤回会退回
草稿，也就跟着不显示了。

创建报废单的表单按实际填写顺序重排，并补齐了原来只有执行时才问的几项：

- **报废设备**挪到**报废原因**后面——报废什么和为什么报废读在一起。
- **申请人**必填，默认填单的人（可改成别人，清空则表单不允许提交）。
- 加上**接收方（供应商）/ 接收方**、**数据清除**、**清除方式**（只在选了
  "已清除"时出现），都在审批人上面。执行人不在其中：它是执行报废的人，由
  执行那一步自己填。

这几项不再是"只有执行才能写"的生命周期字段：申请本来就该说清设备去哪、数据
怎么处理，执行只是确认或更正。`update` 本来就只在
`draft` / `withdrawn` / `rejected` 放行，所以它们只能在单子还开着时改；
`execute` 保留它没提到的值。处置日期 / 收入 / 支出 / 执行人仍然只有执行时
才有。

权限集里存的是字段白名单，早于这几个字段写下的集合会让表单收到一句
"Not allowed"，种子只会补资源不会补字段，所以 `reconcile-grants.ts` 在启动时
把它们加进 `main.disposals` 的写授权（`ADDED_WRITE_FIELDS`）。

**接收方只填一个**：选供应商或手写名字，填了一个另一个就不显示（创建表单、
记录表单和执行弹窗都一样），服务端拒绝同时写两个，执行时换一种写法就把另一
个清掉——一条记录说两个接收方，谁都说不清设备到底给了谁。

**执行人**指执行报废的人，不是清除数据的人；数据怎么处理只由数据清除 /
清除方式说明，不记录经手人。它不进创建表单——谁执行的由执行那一步记下。

**接收方**改成一个问题：先选**供应商**还是**其他**，再填对应的内容
（`client/components/itam/recipient-input.tsx`，创建和执行两个弹窗共用）。
换一种写法会把另一种的值清掉，所以一条记录永远只有一个接收方。记录详情页
仍是两行字段，哪个有值显示哪个。

**数据清除**必填，选项是 已清除 / 未清除 / 无需清除（必填的下拉不再多一个
"无"）；清除方式仍然只在选了"已清除"时出现。

表单变长之后 `ConfirmDialog` 会顶出窗口（按钮被挡住），补上
`max-h-[90svh] overflow-y-auto`，和 `record-form-dialog.tsx` 一样。

报废列表也有了**待我审批**：原来只有采购单有，抽成
`client/components/itam/my-approval-view.tsx` 的 `createMyApprovalView`，
两边各传自己的 collection / 路径 / 文案；服务端 `/itam/disposals` 照采购单
的做法解析 `filter[view]=myApproval`。演示数据补了一张等待审批的报废单
（过保的打印机），否则这个筛选永远是 0。

### 2026-09-27 盘点明细去掉照片，显示盘点人和处理时间

`auditItems.photoFileId` 去掉（迁移 `202609270003_drop_audit_item_photo`）：
盘点接口收这个字段，但没有页面能上传或显示照片，这一列一直是空的。以后现场
要留证据，放盘点任务的附件，或者重新决定给明细做真正的上传。

`countedById` / `resolvedAt` 原来记了却看不到。明细行现在在盘点时间前显示
**盘点人**；已处理的差异另显示**处理时间**——一致的明细盘到那一刻就算处理
完，处理时间等于盘点时间，不重复显示。结束盘点时自动记为未找到的明细只有
时间、没有盘点人。

同一天：**未开始的盘点任务不能取消**，只能删除（删除在「更多」菜单里）。取消
是给已经开始、生成了明细的任务留下记录用的；还没开始的任务什么都没发生，
留一条「已取消」只是多一条要翻过去的记录。服务端 `cancel` 只接受
`inProgress` / `pendingDifferences`。详情页 Tab 改叫**盘点明细**，任务还没有
明细时不显示盘点结果筛选。

同一天：**盘点任务的字段在详情页都能改**。名称、计划日期、备注原来就能行内
编辑；盘点范围和执行人是创建弹窗自己画的（`form: false`），详情页没有编辑器。
`DomainConfig.fieldEditor` 给这类字段一个页面自己的编辑器（盘点范围复用创建
弹窗的 `ScopeInputs`，执行人用 `MultiReferenceInput`），`InlineField` 按组合
控件处理（保存 / 取消）。范围只在`未开始`时可改（`readonlyWhen` + 悬停提示，
服务端本来就拒绝），其他字段在`已完成` / `已取消`之前都可改。历史里这两项
不再显示 JSON：`HistoryTimeline` 的 `displayValue` 复用 domain 的
`fieldDisplay` 渲染新旧值。

**未开始的任务也能看盘点明细**：`GET /itam/audits/:id/items` 对`未开始`的
任务按当前范围实时算出将要盘点的设备（`preview: true`，账面值取设备当前值，
结果为未盘），改了范围立即反映；开始时照旧生成快照写入 `auditItems`。

### 2026-09-27 去掉设备发现

「设备发现」整块删除（迁移 `202609270004_drop_discovery`）。它只接收有人从
MDM / 扫描工具手工导出的 CSV：设备的「最近发现时间」记的是上次有人记得导出
的时间，不是设备最后一次在线的时间；「在用但未被发现」提醒也就只对没被导出
的设备响，而不是对真正失联的设备响。

一并删除：`/discovery` 页面和导航、`/api/itam/discovery/*`、
`discoveryImports` / `discoveryCandidates` 两张表、设备的
`lastDiscoveredAt` 字段（设备详情「系统」分组不再显示最近发现时间）、
`notDiscovered` 提醒和它的 AI 发现、设置页的「设备发现」卡片（匹配顺序、未见
阈值、候选处理）、AI 嵌入式能力「发现数据归一化」、时间线上的「被发现数据匹配」
行、示例文件 `public/samples/discovery-export.csv`。设备 `attributes.hardware`
里匹配时写入的硬件信息保留，它们是设备本身的事实；`attributes.discoveryMisses`
清掉。

以后若要知道设备是否在线，应当是直连 MDM / Intune 的接口，另作决定；不要
恢复 CSV 对账页。

### 2026-09-27 AI 改用 AI 员工插件（第一步：动作中心换成写工具）

目标是能用 AI 员工插件做的都交给插件，只在插件不支持时自建，做法参照本地 CRM
项目。第一步把自建的「AI 动作中心」换成插件自己的确认流程：

- 9 个写工具（分配 / 借出 / 调拨 / 更正状态、归还设备、分配席位、收回席位、
  创建采购单草稿、创建报废单草稿），`defaultPermission: 'ASK'`。插件在用户确认
  卡片前不执行；确认后以该用户身份、经页面同一个服务执行
  （`server/providers/itam/ai-writes.ts`）。失败一律抛出，卡片显示原因。
- 确认卡片 `client/components/itam/ai/write-card.tsx`：记录显示名称、代码显示
  文字，确认前调 `POST /itam/ai/screen` 预检参数和权限；执行后刷新页面数据。
  暂不支持在卡片上改值：拒绝后在对话里说明，由 AI 重新提出。
- 删除：`aiActions` 表（迁移 `202609270005_drop_ai_actions`）、动作服务和
  `/api/itam/ai/actions*`、`/ai-actions` 页面和导航、两个 propose 工具、设置里
  的「批量动作单卡上限」、空壳报表「AI 采纳情况」。发现（findings）暂留，第三步
  再定。
- 顺带发现：这个版本的插件不扫描 `ai/`，只注册 registrar 交给它的资源，而 ITAM
  没有 registrar。新增 `ai/index.ts`（`ItamAiResources`），由 ITAM provider 在
  `boot()` 里注册；测试用插件的 `createAIManager()` 验证员工引用的工具都已注册。

后续两步：嵌入式能力改成快捷任务 / 前端工具；删掉 AI 发现、即时检查和对应设置。

### 2026-09-27 AI 改用 AI 员工插件（第二步：嵌入式能力改成页面快捷任务）

四个嵌入式能力原来各是一个提示词、一个 `/itam/ai/embedded/:capability`
接口和一个设置开关。现在都交给 Ava，用插件自带的页面上下文和前端工具：

- `client/lib/itam/ai-context.ts` 的 `useAiPageContext`：把页面的一部分注册成
  页面上下文（`useAIPageElementHandle`），`ask()` 打开对话并把它作为
  `workContext` 发出，它的前端工具随之可用。
- **自然语言筛选**（设备列表）：列表带着可筛选字段和当前筛选注册，前端工具
  `applyFilter`（ALLOW，只改筛选条件）。
- **解析单据**（采购明细编辑中）：按钮在对话里起草请求（`autoSend: false`），
  用户附上单据再发；前端工具 `addDraftLines`（ALLOW，只改未保存的草稿）。
  原来只按数量和单价加空行，现在助手用 `itam_match_model` 匹配型号。
- **报表解读**、**分析盘点差异**：带着报表 / 未处理差异问 Ava，结果在对话里。
- 删除：`ai-embedded.ts`、`/embedded` 接口、`useEmbeddedCapability`、
  `TextCapabilityButton`、设置里的嵌入式能力开关（含从未实现的「导入辅助」），
  迁移 `202609270006_drop_ai_embedded` 清掉存着的开关。

注意 React Compiler 的 lint：写 ref 要放在 effect 里，前端工具写成类型化的对象
字面量而不是 `defineAIFrontendTool(...)`（编译器看不出那个函数不会在渲染时执行
`execute`），`useAiPageContext` 的返回值要解构后再用。

同一天：AI 设置里的「员工自助引导」开关删掉（迁移
`202609270007_drop_employee_guidance`）。它对应的员工申请 / 报修页面已随工单在
2026-09-19 移除，之后这个开关没有控制任何东西。

### 2026-09-27 允许申请人审批自己的请求

只有一名 IT 资产经理的部署里，「不能审批自己的」等于他自己提的采购单和报废单
永远批不了——没有第二个人持有 `approve`，root 又是平台管理员而不是业务角色。
所以这条限制去掉了：`approvals.request` 和 `approvals.decide` 不再抛
`SELF_APPROVAL`，`GET /itam/users/approvers` 不再接受 `filter[exclude]`，四个
审批人下拉（采购创建 / 采购详情 / 报废创建 / 报废详情）也不再剔除申请人。

其余的约束都还在：审批人必须指名（`approverId` 为空时拒绝），只有被指名的人
能决定（`NOT_APPROVER`），一张单同时只能有一个待决审批（`APPROVAL_PENDING`）。
规格里 `## 用户角色与权限` 的「采购/报废 - 作为审批人」也一并去掉了「但不能
审批自己的」。

### 2026-09-27 演示数据自带各角色账号

原来只有 `nocobase` 一个账号，试另一个角色要先手工建用户、分权限集、再把人员
记录和账号关联起来，所以演示数据现在把账号也一起建了：`manager` /
`manager123`（IT 资产经理）、`support` / `support123`（IT 支持），以及五个员工
账号（用户名是人员的拼音邮箱前缀，密码统一 `employee123`），每个都分好权限集，
员工账号写进对应人员记录的 `userId`，登录后「我的资产」直接有内容。被标记离职
的那位没有账号。审批人不再靠 `otherUser` 猜，直接指给 `manager`。

账号属于认证和用户插件，不属于本应用，所以 demo 通过 `DemoAccounts`
（`server/providers/itam/index.ts` 的 `demoAccounts()`）操作而不是直接写 `user`
表，并像其他演示记录一样登记在 `demoRecords` 的 `accounts` 里，清除时删除。
两个坑：

- 用户插件的 `remove` 要求应用配置了删除钩子，本应用没有，所以走认证插件的
  `UserAdministrationService.remove`，并自己先撤销权限集分配。
- 那个 remove 是软删除，行还在、用户名和邮箱还占着，再生成就撞 `USER_EMAIL_CONFLICT`，
  所以删完再把 `user` / `session` / `account` 的行清掉。同名账号若仍存在则直接接管
  （重置密码、补分配），生成两次得到同一组账号。

`pnpm data:reset --demo` **不创建账号**：它拿的是一个不含认证和用户插件的裸容器。
它会按用户名把演示账号删掉（`demoRecords` 被它一起清空，按名字删是唯一办法），
并在最后打印一行说明。要带账号的演示数据，从运行中的应用里生成。

### 2026-09-27 员工只看得到「我的资产」

在这之前，员工登录看到的是**整个应用**：资产五页、采购、维修、盘点、报废、
报表、主数据全在菜单里。点进去大多是空列表，但配件页把全部库存连数量和位置
一起列了出来，人员页列出她自己之外还带着全局的「离职仍持有 1」统计。原因是
两处：

- 页面授权从来没生效。`client/routes.ts` 把整棵应用路由树过
  `withoutPageGrants()`，给每个没有自己规则的页面设 `authz: 'skip'`，所以种子
  里写了很久的 `IT_PAGES` / `EMPLOYEE_PAGES` 一条都没被读过。
- 员工的权限集读得到**全部**库存物品和授权（`allRecords`），而「我的资产」
  只列设备，根本用不上。

改法：`withoutPageGrants()` 换成 `withPageGrants()`，凡是带 `navigation` 的页面
都拿到 `page:<路由名>/access` 规则，其余（详情页、页签、登录页）继续 skip。员工
的权限集去掉 `stockItems` / `stockHoldings` / `entitlements` / `entitlementSeats`
/ `softwareProducts`，只留设备（`itam.assetsIHold`）、本人（`itam.myPerson`）、
附件，以及型号/分类/制造商/位置/部门——「我的资产」和设备详情页把 id 显示成名字
要用到，不是能打开的列表。

种子只在权限集不存在时写入，所以已有的库要靠 `reconcile-grants.ts`：
`ADDED_PAGES` 把三个种子权限集的页面补齐（开发库里 IT 两个角色缺 `授权`、
`维修`、`主数据概览`——`授权` 是 2026-09-20 合并时加进种子的，那时权限集早就
建好了），`WITHDRAWN_COLLECTIONS` 撤掉员工那五个集合。两者都只针对种子建的
三个 key，且只增不减页面，管理员自己加的页面不会被抹掉。

验证：李娜登录后菜单只剩 工作台 + 我的资产，直接输 `/accessories` 得到「无权
访问」，卡片点开仍然能在抽屉里看自己的设备（型号、分类、制造商、位置都正常
显示，没有成本字段）；support 登录看到完整 IT 菜单。

补充（同日）：「我的资产」三个角色都有——领设备的不止员工。这一来页面不能再
靠员工的 `itam.assetsIHold` 过滤了（IT 两个角色读全部设备，那样会列出所有 23
台），所以列表改成显式要 `filter[view]=mine`，路由用 `people.userId` 找出读者
是谁再按 `assigneeType` / `assigneeId` 过滤；账号没关联人员记录就返回空。

遗留：拒绝页写的是路由名（「你没有访问 accessories 的权限」）而不是页面标题；
演示数据没给 `manager` / `support` 建人员记录，所以他们的「我的资产」是空的。

### 2026-09-27 AI 能创建记录，也能入库、发放和到货入库

所有页面上能新建的记录都交给 Ava 一个通用写工具 `itam_create_record`
（`server/routes/itam/ai-records.ts`）：设备、库存记录、授权、维修单、盘点任务和
全部主数据。它用各路由自己的新建 schema 校验（为此导出），调用同一个服务、要同一个
`create` 权限，字段说明由 schema 生成。采购单、报废单保留各自的工具（要带明细和设备
清单）。另有 `itam_stock_in`、`itam_issue_stock`、`itam_take_back_stock`、
`itam_receive_purchase_line`。全部 ASK，确认卡片列出中文字段名和记录名称，创建后
附新记录链接。提交审批、审批决定、执行报废、标记已下单仍在页面上做。
同时修正 Ava 的提示词：只提供工具真能做的事（她曾声称能「预填表单」），每条回复
都用用户的语言。

### 2026-09-27 AI 改用 AI 员工插件（第三步：删掉自建的巡检）

删掉插件不支持、只能自建的部分（迁移 `202609270008_drop_ai_findings`）：

- 「AI 发现」：规则提醒归组成的发现、可选的模型汇总、处理 / 忽略 / 延后；
  `ai-inspection.ts`、`aiFindings` 表、`/itam/ai/findings*`、`/itam/ai/inspection/run`。
  它从来没有定时任务，只在点「立即巡检」时生成；工作台改版后也已不显示。
- 设备详情页的即时检查提示条（`/itam/ai/inspect/:collection/:id`）：插件不支持
  对话之外的被动展示，同样的事用「检查这台设备」快捷入口问 Ava。
- 直接调模型的 `ai-completion.ts`：只剩上面两项在用。
- ITAM 设置里的「启用 AI 助手」「每日主动巡检」「巡检时间」。是否可用改由插件判断：
  有可用模型、且 Ava 在「设置 → AI」里启用（CRM 同样如此）。

保留：规则层提醒（工作台「需要关注」）、业务说明、联网搜索开关（开关还没有接到
「查询生命周期信息」入口上，SPEC 标了未实现）。

### 2026-09-27 工作台与报表改版

工作台只回答「今天做什么、要注意什么」：问候与待办数、四个本月关键数字（在管设备、
账面价值、本月采购、授权合规）、我的待办与需要关注（一行一项）、设备状态比例条、
未来 90 天到期。去掉了筛选栏、核心统计和管理者统计表——它们都在「报表 → 概览」里。

报表：左侧分组导航（资产 / 成本 / 软件与到期 / 运维）代替一排标签；筛选栏加周期
预设（本月 / 本季 / 本年 / 自定义，`periodRange`）；分区按 `reportChartOf`
（`client/lib/itam/report-charts.ts`）画成条形图或柱状图，表格在「查看明细表」
里，记录清单类分区仍是表格。图表用已有的 shadcn chart + recharts，金额在轴上用
紧凑写法。`StatCards` 改为 `auto-fit`，卡片铺满整行。

### 2026-09-27 IT 支持的权限收到自己经手的范围

规格表定完以后按它改了权限集：

- **删除**：采购单、维修单、报废单、盘点任务都只能删自己创建的，用授权插件
  自带的 `recordsICreated`（按 `createdById` 匹配），不需要写代码。维修的
  「完成维修」也是同一条。实测 support 删别人的采购单是 404（记录级过滤把它
  滤掉了，不是 403），删自己的 200。
- **盘点**：任务是「谁执行谁看」，所以写了 `itam.myAudits`
  （`server/providers/itam/record-access.ts`）：查出 `executorIds` 里有读者的
  任务 id，再展开成 `id $eq` 的 or。不能直接在作用域里比 JSON——
  `assertDatabaseScope` 不允许 JSON 运算符，`FilterOperator` 也没有 `$in`。
  一个人没被指派任何任务时**不能返回 `false`**：那是拒绝整个操作，盘点页面会
  显示「无权访问」而不是空列表，所以返回一个匹配不到任何行的条件。创建和编辑
  仍然是全部——经理建任务时要能指派人，IT 支持建了也要能编辑。
- **报表**：只有资产经理有。页面授权开始生效之后这条才有意义，之前 IT 支持一直
  存着这个 page grant 但没人读。种子的 `IT_PAGES` 和 `MANAGER_PAGES` 拆开了，
  `reconcile-grants.ts` 加了 `WITHDRAWN_PAGES` 把已有库里 IT 支持的 `reports`
  撤掉。
- **资产删除**：谁都没有，只有 root——代码本来就是这样，这次是规格向代码看齐。

`pnpm data:reset` 现在连三个 ITAM 权限集一起删掉再让种子重写。种子只在权限集
不存在时写入，所以改了 grant 种子对已经跑过的库毫无效果，而这正是这个命令要解决
的问题。`reconcile-grants.ts` 仍然是升级路径——那里要保住管理员自己的改动。

路由测试的授权替身按角色发权限，根本不评估记录级策略，所以 `itam.myAudits` 用
单元测试覆盖（`tests/logic/record-access.test.ts`），包括「JSON 字段存成字符串的
老行」和「没被指派时不拒绝」两种情况。

同日的演示数据：`manager` / `support` 各有一条 IT 部门的人员记录和一台笔记本
（工号 EMP-201 / EMP-202——EMP-001 是种子里的人，EMP-1xx 是演示员工），所以用
这两个账号登录时「我的资产」不是空页。生成演示数据的那个账号也一样，分到笔记本、
显示器和手机各一（工号 EMP-200，姓名取账号自己的 name，通过新增的
`DemoAccounts.describe()` 读出来）
——通常是应用的第一个账号，它不属于本应用的任何权限集，也不是任何人的员工。
那条人员记录像其他演示记录一样被跟踪、清除时删掉；账号本身不是演示数据，留着。
生成者如果本来就是 `manager` / `support`，或者已经有人员记录，就跳过。

### 2026-09-27 报废单的免审批规则（当天撤销）

**2026-09-27 作废**：整个豁免功能已移除，代码和工作流两边都不保留。下面记录的是它
存在过的样子和当时的理由，以免有人照着重做一遍。撤销时保留了三处与豁免无关的独立
修复：自动通过的英文摘要改成本地化键、设置种子里残留的 `tiers`、以及自批限制的移除。

不是 2026-09-25 删掉的 `tiers`——那是「按金额决定**谁**审批」（路由），这条是
「按条件决定**要不要**审批」（豁免）。

规则两个轴，缺一不可：账面净值合计低于 `exemptBelowBookValue`，**并且**处置方式
在 `exemptMethods` 里（默认只有 `scrap`）。只看金额会把净值为 0 的设备被**出售**、
**捐赠**、**丢失核销**一起放过去——资产出了门或者记了损失，无论金额都该有人点头。
默认 `exemptBelowBookValue: null`，升级后行为不变。

落点很小，因为路早就铺好了：`submit` 里本来就有「审批总开关关掉时直接 approved
并执行 applyApproval」这一支，`bookValueTotal` 也已经作为审批金额算好传出去，改的
只是把那个全局布尔换成按单判断。

三件顺带修的：

- **写进历史的英文散文**。原来自动通过时摘要是 `Approved (approval disabled)`，
  中文界面直接显示原文（采购单那边也有一份，`procurement.ts:759`，这次没动）。
  改成状态变更带 `approvalSkipped: 'exempt' | 'disabled'` 负载，客户端按
  `statusChangeApprovalExempt` / `…Disabled` 出文案，存的字符串只是键缺失时的兜底。
  现在时间线读作「草稿 → 已批准：净值 CNY 1,644.34 低于免审批额度 CNY 2,000.00，
  无需审批」。
- **设置的浅合并**。`merge` 对 `approvals` 是一层展开，存着的
  `{ disposal: { enabled } }` 会把之后新增的键整个盖掉——读出来就是「没配规则」
  而不是默认值。改成按 kind 各自和默认值合并。
- **种子还在写 `tiers: []`**。迁移 `202609250009` 把已有行里的 tiers 删了，种子却
  每次 `data:reset` 又写回来。一起去掉了。

页面镜像服务端规则（`disposalApprovalSkip()` in `client/lib/itam/procurement.ts`）：
免审批的报废单不再要求选审批人，弹窗和按钮都从「提交审批」改成「提交」，摘要栏的
审批人从「—」改成「无需审批」。

同日还清掉了自批限制留下的客户端残留：`mayDecide` 在报废和采购两个页面都还在用
`requesterId !== currentUserId` 把审批按钮藏起来，而服务端已经不拦了——页面声明了
一条服务不执行的规则，正好是反过来的那种错。

### 2026-09-27 AI 助手复核

逐项检查 Ava 的各种用法（对话创建、快捷入口、页面工具、读写工具）后改正：

- **创建要满足页面对话框的必填项**：`itam_create_record` 在卡片确认前（`/ai/screen`）和执行时都按对话框检查必填和条件必填（设备：所有权、存放位置，租赁 / 借用时的出借方和归还日期，分类要求时的序列号；授权按永久 / 订阅；维修单：预计返回日期，非内部维修时的供应商），先查权限再查字段；工具说明列出这些要求，Ava 缺什么一次问齐再提卡片。
- **卡片**：绿色底；字段标签、选项文字取自各对象页面的字段定义；到货入库卡片写出是哪条明细（型号 × 数量）和每个回答；回收席位卡片写出每个席位的持有人（执行后从结果里读）；执行成功的卡片带新记录链接（插件把工具的 `content` 本身作为结果交给渲染器，之前读错了一层）。
- **读工具**：关联记录各按自己的读权限返回（持有设备不等于能看它的维修单和席位），维修单成本、明细单价按字段权限收窄；人员的库存持有带 `stockItemId` / `quantity`、席位带 `entitlementId`，授权返回当前席位，库存记录返回持有，采购单返回明细（`lineId` 即到货入库要的 id）；引用 id 旁带名称（`modelName` 等，只读用户能读的集合）；维修单可查询；无席位上限的授权显示为不限；业务上下文带当前用户（`me`：userId 与关联人员）。
- **写工具**：归还只能去页面允许的状态（库存中、维修中、待报废、退役），可带存放位置；借出只借给人；分配对象是人、位置或设备（不是部门）；采购单明细写入失败时删掉刚建的草稿，不留空单。
- **服务层顺带修正**（页面同样受益）：到货入库的 `extra` 只接受对话框问的字段（之前可覆盖状态、价格、供应商、席位数）；采购明细的类型必须与型号分类一致（之前能以「设备」下单一个配件型号，审批后到货才报错）；AI 新建的库存记录第一条流水记为「创建」。
- **对话界面**：插件对话框跟随应用语言（i18next 的 `resolvedLanguage` 在资源加载前就定了，一直是英文）；工具步骤标题取应用的 `ai.tools.*`；页面标题栏按自身宽度换行，助手面板打开时不再把标题挤没。
- **提示词**：一律按用户的语言、用页面上的叫法（不写字段键和代码）；工具返回结果即已执行，不再请用户确认；不用插件附带的 formFiller / chartGenerator / suggestions（本应用不显示它们）；「查询生命周期信息」改为「生命周期与更换」，只用系统里的数据，不编造厂商日期。
- **去掉「允许联网搜索」设置**（迁移 `202609270009_drop_ai_web_search`）：没有任何代码读它；联网搜索是 AI 员工插件按对话提供的能力。
- **页面工具原来从未生效**：插件服务端只从请求的 `frontendTools` 读页面工具，而 Registry 客户端只把它们放在工作上下文里，所以自然语言筛选、解析单据一直拿不到 `applyFilter` / `addDraftLines`；服务端又总把 `executeFrontendTool` 标成需审批。两处在 Registry 副本里修正（见 AGENTS.md），现在筛选直接生效、解析单据直接填进草稿。
- **卡片确认前检查设备状态**：分配、借出、调拨、归还按 `OPERATION_FROM` 预检，设备状态不允许时卡片不能确认（批量只在全部不行时拦下）。
- **页面按自身宽度布局**：`Page` 是尺寸容器，标题栏、工作台和报表的分栏按页面宽度，而不是窗口宽度，助手面板打开时不再挤坏。

### 2026-09-27 报废审批决策改成工作流（当天撤销）

**2026-09-27 作废**：`server/workflows/disposal-approval/` 已删除，应用重新回到不使用
工作流引擎的状态。撤销的理由就是下面自己写的那份代价清单——异步、要每库启用一次、
以及两条代码路径做同一件事——换来的只是这一条链路的可见性，不值。下面的内容保留为
记录：它确实跑通过，如果以后要再上工作流，这里有完整的做法和坑。

`server/workflows/disposal-approval/` —— 之前判断写在 `submit` 的一个 `if` 里，
现在流程归工作流：`readRule`（run，读规则）→ `needsDecision`（condition）→
`approveWithoutReview` / `requestApproval`（两个 run 分支，各调一次服务）。规则本身
**留在 ITAM 设置里**，不搬进工作流的 `parameters`：设置页已经能改它，提交弹窗也要
镜像它才能决定问不问审批人。工作流拥有的是路径，这才是「这张单子走了哪条路、哪一步
失败了、能不能重跑」能被看见的原因。

为什么之前说「没有值得搬的」而这次搬了：那个判断本身确实是原子的，搬进去并不会让它
更正确。搬的理由是**运维可见性**——现在每一次提交都有一条 run 记录，节点级的状态和
结果都在 `设置 → 自动化 → 工作流` 里查得到。这是用户明确要的取舍，记在这里以免以后
有人按「原子逻辑不该上工作流」的原则把它搬回去。

三个必须记住的后果：

- **`trigger()` 是异步的**，插件没有同步触发。所以 `submit` 即使对免审批的单子也只能
  返回 `pendingApproval`，页面下一次读才看到 `approved`。实测本地 run 在 50ms 左右
  跑完。
- **工作流不是依赖**。没启用（或测试替身里没插件）时 `trigger` 返回 `skipped`，
  `submit` 就地同步调那两个服务方法。一张停在 `pendingApproval` 却没人被问的单子是
  那种没人会发现的故障，所以这条兜底不能省。504 个测试全绿走的就是这条路。
- **两个分支方法都可重入**，因为失败节点会被重跑：状态已经不是 `pendingApproval`、
  或者已经有待决审批时，直接返回不动。

事件键是 `disposal-submitted:<id>:<updatedAt>`——是这次提交，不是这张单子。撤回后
重新提交是新的业务事件，只写 id 的键会被去重成第一次的 run。

启用方式：每个库执行一次 `POST /api/workflows/<hash>/enable`，或者在
`设置 → 自动化 → 工作流` 里打开开关。那个页面要 `settings:workflow/manage`，三个 ITAM
权限集都没有，所以只有 root 能开。

验证：免审批的销毁单 → run 1 走 `readRule → needsDecision → approveWithoutReview`，
单子变 `approved`；出售单 → run 2 走 `readRule → needsDecision → requestApproval`，
单子停在 `pendingApproval` 且生成了指给 manager 的待决审批。`pnpm nocobase workflow
check` 通过（4 节点），`pnpm build` 产出 artifact（三个 run 模块的 `.js` 都在包里）。

### 2026-09-27 去掉「IT 支持可查看成本字段」设置

没有任何代码读它。谁能看成本字段由权限集的字段列表决定：种子里的 IT 支持权限集本来就不含成本字段，接口和 AI 工具都按它裁剪，设置里再放一个开关只会和权限集说法不一。去掉设置项、种子里的默认值和设置页开关，迁移 `202609270010_drop_cost_fields_setting` 清掉已存的值；要让 IT 支持看成本，改该权限集的字段列表。同时把「ITAM 设置」改名为「系统设置」。

### 2026-09-27 系统设置精简

- **到期提前天数拆成两个**：永久授权维保到期提前天数（`maintenanceExpiryDays`，默认 30）、订阅授权到期提前天数（`subscriptionExpiryDays`，默认 7），工作台提醒和授权列表「即将到期」视图各按各的算（列表视图原来用 UTC 日期，同时改成本地日期）。迁移 `202609270011_split_expiry_thresholds` 把已存的 `expiryDays` 转成维保天数。库存水位默认值从 0 改为 5（同一迁移把仍是旧默认 0 的已存值改为 5）。
- **设备编号不再按分类区分**：按分类各用一个序列、却共用同一前缀，两个分类会各自发出 DE-000001。迁移 `202609270012_drop_per_category_numbering` 去掉设置项，把按分类的序列并入设备序列（从其中最大值往后编）。
- **审批配置删除**：采购单和报废单一律需要审批，提交时指定审批人，没有跳过审批的开关（迁移 `202609270013_drop_approval_settings`）。以前关闭审批时直接通过的记录，摘要仍显示「无需审批」，历史仍能读。
- **分配签收先全部拿掉**：员工侧早已没有签收入口，开关只会产生没人能消掉的「签收超时」提醒。去掉分配 / 借出对话框的「要求使用人签收」、`allocations.requiresSignature` / `signedAt` 两列、设备的 `sign` 操作和路由、`signPending` 提醒、工作台「待签收超时的分配记录」、人员页「待签收」统计、设备列表失效的 `signPending` 视图、「签收配置」和「签收超时天数」设置（迁移 `202609270014_drop_signing`）。历史里已有的「使用人已签收」事件保留。以后要恢复签收，需要连同员工侧的签收入口一起重新设计。

### 2026-09-27 种子自带 AI 业务说明

业务说明原来为空，Ava 的入职配备、维修还是更换等任务没有依据。设置种子按部署语言写入一份示例（中文 / 英文），引用种子里的部门、型号和软件产品：各部门入职标准配置、更换还是维修的规则、采购与审批、离职、命名习惯。AI 设置行可能先被注册器写入（记录已停用内置员工），所以种子在该行没有 `businessNotes` 时补上，已有（哪怕为空）则不动。

### 2026-09-27 全局检查：死代码清理与一处字段级授权漏洞

**字段级权限对持有操作的角色是失效的。** IT 支持的 `read` 授权里没有
`purchasePrice` / `bookValue` / `depreciatedAmount`，但设备列表、单条读取和
CSV 导出都把这三个字段返回了；授权那边同理漏了 `productKey` 和 `unitPrice`。
员工（lina）不受影响——她是唯一不持有任何 `itam.*` 操作的角色，这正是线索。

根因在 `authz-resources.ts` 的 `resourceOf`：每个操作都展开成一条
`.read([...collection.fields])` 的数据库授权。而 `withReadableOutput` 的收窄
是「再问一次调用者的普通 `read` 决策」——那个决策正是由包含这条展开在内的
若干分支合成的。于是「授予全部字段」把它本该被收窄的那个答案给放宽了，注释
写的意图和代码做的事正好相反。改成 `.read([])`：操作不再提供任何可读字段，
响应的字段完全由调用者自己的 `read` 授权决定；操作能**写**什么仍是它自己的
授权，未动。

实测（同一个运行中的应用，support / manager 两个角色）：修复后 support 的设备
从 39 个字段回到 36 个、成本字段消失，授权不再带密钥和单价，CSV 导出的表头也
不再有成本列；manager 仍是 39 个字段、导出仍有成本列；`assign`（写操作）和
`reveal-key`、`exports/devices`（读操作）都仍然 200。

这个缺陷**测试覆盖不到**：路由测试的授权替身按角色发权限，根本不评估真实策略。
所以它是靠拿真实角色读接口发现的，也只能那样验证。

同批清理（开发阶段，直接删不留备份）：

- `storage/` 下 4 个过期的 sqlite 备份和一个 0 字节的 `db.sqlite`（`itam.sqlite`
  里 60MB 有 56MB 是 AI 插件的 `lc_checkpoint_blobs`，属于插件数据，没动）
- 死代码：`device-extended-fields.tsx`（整个文件——设备详情页早就改成内联渲染
  扩展字段了）、`InfoGroup`、`ComplianceBadge`、`DomainStatCard`、
  `DeviceOwnership`、`loanReturnDate`（维修借出改成普通借出后的遗留）、
  `requireDatabaseConditions`、`APPROVALS_PATH`、`useBatchCreateDevices`、
  `useDeviceStats`（连同只被它引用的客户端 `DeviceStats` 类型）、
  `PurchaseOrderApprovalsTab`（审批页签是有意去掉的，组件留下了）
- 6 个无人引用的页签文案键；依赖项扫描干净，无多余依赖

顺带修的两个界面问题：

- **引用解析不出时永远显示 `…`**，和加载中分不开。`useReferenceNames` 的契约是
  「map 出现了但 key 不在 = 记录已删除」，`audit-domain.tsx` 早就写对了，而
  `record-approver`、`approvals-timeline`、`multi-reference` 三处写成了 `…`。
  统一改用既有的 `common.missingRecord`。这个 bug 是在演示数据被别的会话用
  `data:reset --demo` 重建（没有账号、审批人是 `demo-approver` 占位 id）之后
  暴露出来的，摘要栏的「审批人」一直转圈。
- 设置页演示数据卡片里 `accounts 7` 没翻译（我加账号时漏了 `references.accounts`）。

### 2026-09-28 定时任务改由定时任务插件调度

原来是应用自己用 cron 定时、自己记运行记录（`jobRuns`），再在系统设置里放一张「自动化任务」卡片——等于重做了一份定时任务插件。现在 `server/providers/itam-schedules.ts` 注册目标 `app.itam.maintenance`，声明 `itam.daily-maintenance`（每天 02:00）和 `itam.monthly-depreciation`（每月 1 日 03:00），时区取系统设置；执行逻辑仍是 `maintenanceService.runJob()`，目标在 `start()` 里直接跑完，返回成功（带处理数量）或失败（带原因）。管理员在「设置 → 自动化 → 定时任务」查看每次执行、启停任务，页面权限 `scheduler.schedules` 授给 IT 资产经理（种子和 `reconcile-grants.ts` 的 `ADDED_PAGES`）。

去掉：自建的 cron 调度（`itam-scheduler.ts`，连同 `@nocobase/cron` 依赖）、`jobRuns` 表（迁移 `202609280001_drop_job_runs`）、`/itam/workbench/jobs` 接口和设置页卡片。插件不支持手动立即运行，所以「立即运行」也没了：原来手动「重新计算提醒」是为了改完阈值马上看到效果，现在保存提醒阈值时自动重算提醒。

### 2026-09-28 离职日期到了自动标记离职

离职日期可以提前填，但原来只有手动「标记离职」会改在职状态，日期到了人仍是`在职`，「离职仍持有」提醒也就抓不到他。新增定时任务「人员离职状态更新」（`itam.mark-leavers`，每天 01:50，`runJob('leavers')` → `masterData.markDueLeavers(day)`，可在定时任务页单独查看和停用）：`在职`且离职日期不晚于当天的人员改为`已离职`，保留填的日期，写字段变更和一条 `left` 事件（`payload.automatic`，时间线显示「离职日期 X 已到，自动标记为离职」，来源 `scheduler`）。排在 02:00 的每日维护之前，当天重算的提醒就能列出其名下仍持有的资产。执行结果里的 `leavers` 是标记人数。

### 2026-09-28 动作卡片可以编辑；发新消息先拒绝等待中的卡片（参照 CRM）

- **编辑**：卡片等待确认时，每个单值字段都能双击就地修改（与详情页同一个 `InlineField`，字段定义取自各页面，选项、引用都一样）；创建记录和采购单另有「编辑」按钮，打开与页面相同的创建表单（设备和授权不问分类、制造商——跟随型号 / 软件产品；负责人默认当前用户）。改过的内容留在卡片里，确认时经插件的 `onEdit` 交给工具执行，确认前的服务端预检按改过的值重算。工具结果带 `values`（实际执行的参数）：执行过的卡片显示它，Ava 也据此汇报，提示词说明这是用户的决定而不是出入。批量行（归还、回收席位、采购明细）不在卡片上改。
- **发新消息时拒绝等待中的卡片**：照搬 CRM 对 Registry 的应用改动（`chat-provider.tsx` 的 `declinePendingApprovals`）。插件自己处理「待确认时又来新消息」会让 DeepSeek 对话无法继续（No tool output found）；先以拒绝恢复这次运行，再发送新消息。

### 2026-09-28 扩展字段扩到全部资产类型

分类的 `fieldTemplate` 一直不分资产类型，分类详情页的编辑器也对所有分类显示——
但只有 `devices` 有 `attributes` 列。结果是：给「鼠标」分类定义了扩展字段，配件
记录上却没有地方填。这是个沉默的陷阱，界面不会告诉你。

补齐要动五处，缺一不可：

1. 迁移 `202609280002_stock_entitlement_attributes` 给 `stockItems` 和
   `entitlements` 加 `attributes`（JSON）
2. `collections.ts` 两个集合的 `fields` 加上它——否则授权和查询都不认
3. 两条路由的 zod schema 加上它——端点是严格的，不声明就是 400
4. **授权**：种子的 `STOCK_FIELDS` / `ENTITLEMENT_FIELDS` 加上它（新库），
   `reconcile-grants.ts` 的 `ADDED_FIELDS` 加上它（已有库）。顺带把那个机制从
   只补写操作扩成也补 `read`——只能写不能读的字段等于没给
5. `ExtendedFields`（`client/components/itam/extended-fields.tsx`）在
   `domain-detail.tsx` 的第一组之后渲染，和设备页一致；分类没有模板时**整组
   不渲染**

第 4 步是最容易漏的：加了列、加了声明、界面也写了，但存着的授权是一份显式字段
清单，不补就是读不到也写不了，而且不报错。

实测：给「键盘」分类定义两个字段后，配件详情页在基本信息下出现「扩展字段」，
双击可编辑并保存；「硒鼓」分类没有模板，整组不出现。

### 2026-09-28 三处界面修正

- **主数据树的节点改为在记录抽屉里打开**（`MasterDataTree`）。树是地图，读一个
  节点不该让人丢掉在地图上的位置。平铺列表的行仍然是跳转。
- **分类的扩展字段卡片为空时直接进入编辑态**，右上角在还没有任何字段时不显示
  「取消 / 保存」（没写过东西就没有可保留或可丢弃的），「添加字段」用实心主按钮
  ——空卡片上它是唯一能做的事。
- **抽屉里打开的弹窗没有毛玻璃遮罩**。不是层级问题：Base UI 对**嵌套**对话框
  故意不渲染 backdrop，理由是外层对话框已经压暗了页面。而记录抽屉正是这样的
  外层，它的 backdrop 在抽屉面板**后面**，所以抽屉里的弹窗和它覆盖的内容之间
  什么都没有。`DialogOverlay` 加 `forceRender` 保留它。

### 2026-09-28 跨记录的两条规律：供应商交期恶化、同批次缺陷

原来的八条提醒都是「某一条记录越了某个线」——保修快到期、库存低于水位、借出
逾期。它们回答得了「这台设备怎么了」，回答不了「这家供应商最近是不是不行了」，
而后者恰恰是只有把记录合起来看才能看见、人一条条翻不出来的东西。补两条：

- **供应商连续延迟交货**（`vendorLateDeliveries`，主体是供应商）：这家供应商
  最近 `lateDeliveryOrders` 张（默认 3）已到货的采购单，**每一张**都比预计到货
  日期晚了 `lateDeliveryDays` 天（默认 7）。只看最近几张，两年前晚过、之后一直
  准时的不算；下一张按时到货，判据就不再成立，提醒自己消掉。
- **同批次设备集中报修**（`batchDefect`，主体是型号）：最近 `batchDefectDays`
  天（默认 90）内，同一型号、同一采购月份的设备有 `batchDefectDevices` 台
  （默认 3）以上报修。同型号同月买进即视为一批——采购单不一定还在，采购日期
  在设备上。窗口滚过去，提醒也就没了。

两条和别的提醒同一张表、同一套自动消解，只是**工作台单独一张卡片**「发现的
模式」，不和「需要关注」混在一起：「这台设备保修要到期了」和「这家供应商最近
三单都晚了」不是同一种东西，一份清单里两种都有就读成了杂项。
`PATTERN_KINDS`（`maintenance.ts` 和 `client/lib/itam/workbench.ts` 各一份）
是这个区分本身，`Attention` 组件按它分流，模式一条都没有时整张卡片不显示——
没发现规律是常态，空卡片会让人以为坏了。

四个阈值进设置页的提醒阈值卡片。规律类提醒指向的是供应商和型号的列表页
（`REMINDER_ROUTES`），不是某一条记录。

这不是 AI：判据是确定的，AI 猜不出「晚了几天算晚」。真要用模型，是在这之上做
归因和建议，而不是替代这一层。

演示数据要能显示这两张卡片，而一条记录做不到，所以生成器改了两处：**最近三张
已到货的采购单**在补日期时不再统一「比预计晚一天」，而是各自往前挪（下单和预计
都挪，晚了要装得下今天之前）并分别晚 9 / 13 / 16 天；**2023-11 那批 MacBook Pro
里再加两台同样电池鼓包的保内维修**，加上本来就在外维修的 SG-LT-004，一批里三台
进过维修。

设置页提醒阈值卡片补上这四个阈值的中英文标签（加字段时漏了，界面上直接显示
`settings.thresholds.lateDeliveryDays` 这样的键名）。


### 2026-09-28 我的待办：一行一类，就地展开到具体记录

- **改名**：工作台第一张卡片叫「我的待办」（`workbench.myWork`，英文 `My to-dos`）
  ——SPEC 一直这么写，是代码里的文案漂了。键名和 `/workbench/my-work` 接口没动。
- **待我审批拆成两行**：待我审批的采购单 / 待我审批的报废单。原来是一行，数的是
  两类之和，链接却固定去 `/procurement?view=myApproval`——有两张报废单等着审的人
  点进去看到的是一张空的采购单列表。每行只对能审那一类的人显示（和列表页显示
  「待我审批」开关的条件一致）。注意 `approvals.subjectType` 存的是单数的
  `purchaseOrder` / `disposal`，不是集合名，按集合名过滤会一条都不匹配。
- **一行能展开看具体是哪条**：`GET /itam/workbench/my-work/:key` 返回前 5 条
  记录（编号或名称，加上让它成为待办的那个日期），每条在记录抽屉里打开，所以
  处理完一条不用离开工作台；超过 5 条时末尾是「全部 N 项」，去原来的筛选列表。
  数量为 0 的一行不展开。展开才请求，工作台自己仍是一次计数。
  每一类的记录用和计数完全相同的授权判断取。
- **顺带修**：`approvals.pendingFor` 一直把 `requestedById === userId` 的审批
  过滤掉。自己审自己的请求在 2026-09-27 已经允许（一个资产经理的部署里没有别人
  可以审），但这条过滤让这种审批既不出现在「待我审批」也不出现在列表的
  「待我审批」视图里，只能从记录页上决定,而工作台还报告「没有待我审批的」。
  现在：指名了审批人的，就等着被指名的那个人，哪怕是申请人自己；没指名的
  （历史数据）才仍然排除申请人。

### 2026-09-28 工作台顶部换成待办卡片，关键数字交给报表

原来顶部是四个统计（在管设备、账面价值、本月采购、授权合规），我的待办是下面
两栏网格里的一张普通卡片。这四个数字本来就读的是**概览报表**
（`useReport('overview', {})`，不带筛选 = 本月至今），报表页上一个不少还更全
（本期新增、本期报废、报废收入、按状态 / 部门 / 位置 / 龄期的分布），而且那里
能选周期、能筛选、能导出、能让 Ava 解读。工作台重复一份没有周期的版本，是把
「现在怎么样」和「我要做什么」挤在同一屏，两件事都没说清楚。

所以：**顶部那一排换成待办卡片**，一类一张，每张直接列出前 5 条具体记录（不是
展开，卡片本来就摊开），点一条在记录抽屉里打开。工作台从此只回答「要做什么」，
「怎么样」全在报表。概览报表仍然请求一次，但只为下面的「设备状态」卡片。

- **待我审批合成一张卡**，每条带 `采购` / `报废` 标识。服务端仍是两条待办
  （`pendingPurchaseApprovals` / `pendingDisposalApprovals`），各自的数量、
  各自的列表——一个数字只能指向一个列表，这是几小时前刚修掉的毛病。合并只发生
  在展示层：卡片把两边的记录按日期归并取前 5，超过 5 条时按类给两个链接。
- **记录随数量一起返回**（`MyWorkItem.records`），不再有
  `GET /my-work/:key` 和 `useMyWorkRecords`：卡片永远是摊开的，懒加载没有意义，
  而且五张卡各请求一次就成了 1+N。每类记录用和计数完全相同的授权判断取，盘点
  那一类连查询都共用同一批行。
- **记录名字用应用的绿色**（`--success-foreground`，AI 快捷入口同一个），不是
  状态色——它读作「点进去」。
- 一个读者只看得到自己能审 / 能收 / 能盘的那几张卡。员工一张都没有，
  `MyWork` 整个返回 `null`，不显示一排空盒子。

### 2026-09-28 计划收尾：库存调整、到货逾期、看板、导出名称；去掉提醒延后

- **库存调整数量**（补上 2026-09-24 记下的缺口）：库存详情页「调整数量」，增加或减少、必填原因；`stock.adjust` 写一条 `adjust` 流水，时间线显示「数量增加 / 减少 N：原因」；按 `update` 授权（同调整席位），不加新授权；减少不超过在库数量。
- **到货逾期提醒**（收掉 2026-09-25 留待决定的 `view=overdue`）：规则层新增 `purchaseOverdue`——已下单 / 部分到货且过了预计到货日期的采购单，出现在工作台「需要关注」，点开进入 `/procurement?view=overdue`。
- **去掉提醒延后**：从没有界面调用过；删掉 `POST /itam/workbench/reminders/:id/snooze`、服务方法、`reminders.snoozedUntil`（迁移 `202609280003_drop_reminder_snooze`），以及早已无人读的 AI 采纳率报表列文案。
- **导出写名称**：CSV 导出里的引用（型号、位置、部门、人员、供应商、用户……）写名称而不是 ID，与导入一致；名称查找抽成 `reference-names.ts`，AI 工具的名称补全改用它（顺带改正 `requesterId` 指向用户而不是人员）。
- **看板**：采购、盘点、报废默认看板视图（按状态分列、每列独立分页、列头服务端总数），列表一键切换；命名视图显示为列表；不拖动卡片（每一步都要问东西，由详情页操作完成）。

### 2026-09-28 调整数量的原因改为下拉；看板卡片改版

- **原因下拉**：增加时盘盈 / 找回 / 其他，减少时丢失 / 损坏 / 报损 / 盘亏 / 其他；另有备注，选「其他」时必填。原因代码存在流水的新列 `stock_movements.reason`（迁移 `202609280004_add_stock_movement_reason`），服务端校验原因与增减方向一致；时间线显示「数量减少 2：损坏，运输中压坏」。
- **看板样式**：原来卡片是一张「标签：值」表，列背景撑满整页。改成卡片不带标签——标题行是编号和右对齐的金额 / 进度，下面一两行是主要内容，底部小字是申请人和日期；列只有卡片那么高，空列显示虚线占位，列宽 17rem。卡片配置从 `cardFields` 改为 `card: { meta, lines, footer }`。

### 2026-09-28 待办卡片补进行中的维修；借出逾期只在一处显示

- **加「进行中的维修」一张卡**（`result = 'inProgress'`，没有单独的状态列）。
  取数按 **`complete` 的授权**而不是 `read`：IT 支持读得到所有维修单，却只能
  完成自己创建的（`recordsICreated`），列出一条他按不了的不是待办。资产经理
  的 `complete` 不受限，所以他看到全部。
- **「今日到期归还的借出设备」改成「设备借出逾期未还」**（当时先叫「逾期未还的借出设备」），判据从
  `expectedReturnDate = today` 改成 `< today`。原来的名字和判据都窄：当天到期
  的还不算逾期，而已经过期一周的才是真要追的。
- **同一批设备不在一屏上出现两次**。这张卡和「需要关注」里的 `loanOverdue` 是
  同一个查询，所以 `SUPERSEDED_KINDS`（`client/lib/itam/workbench.ts`）把它从
  「需要关注」里滤掉。**提醒本身保留**，因为每日维护任务正是据它给借用人和
  负责人发站内通知（`notifier.notify`，键是
  `loanOverdue:<deviceId>:<date>`），Ava 的业务上下文也读各类提醒数量。少的
  只是那一行显示。
- **「进行中的盘点任务」改名「进行中的盘点」**。
- **只有编号做名字的记录带类别标识**：采购单、报废单、维修单带 `采购` /
  `报废` / `维修`；设备（编号 / 名称）和盘点任务（任务名）自己说明了是什么。
- **「我的待办」标题后不带总数**：每张卡有自己的数字，几个互不相干的队列相加
  不是任何人会据以行动的数。
- 卡片最小宽度 14rem，1512 宽的屏幕上五张一排（实测每张 241px，无截断）。

### 2026-09-28 抽屉里改完记录，背后的页面不刷新

`useItamMutations` 的 create / update / delete 只作废 `['itam', <自己的
path>]`。各个操作对话框（完成维修、入库、审批…）一直是作废整个 `['itam']`，
只有普通字段编辑不是。于是在记录抽屉里改一个字段——抽屉背后的页面还在屏幕
上——工作台的待办卡片、提醒数量、报表都还是改之前的样子。改成同样作废整个
`['itam']`：一条记录被读到的地方远不止它自己的列表，而且只有活跃的查询会立即
重新请求。删除那一路保留原来的两步（先 `removeQueries` 掉被删记录自己的查询，
免得重新请求 404 重试卡住调用方），只是把第二步的范围放大。

### 2026-09-28 主数据页面并入通用领域页面

P2 记下的后续项了结：八个主数据集合（制造商、供应商、分类、型号、软件产品、位置、
部门、人员）不再有自己的 `master-data-list.tsx` / `master-data-detail.tsx`，
和其余业务集合一样走 `DomainListPage` / `DomainDetailPage`。
`client/pages/itam/master/master-domain.tsx` 的 `masterDomain(name)` 从
`client/lib/itam/master-data.ts` 的条目生成 `DomainConfig`（每个集合只生成一次），
只有主数据才有的部分放在 `master-domain-parts.tsx`（树、计数列、型号跟随分类的
资产类型、标记离职、创建子级、字段模板、祖先面包屑），`/stats` 的请求与读数在
`master-stats.ts`。为此 `DomainConfig` 加了几个可选项，别的集合不设就和以前一样：
`Tree`（表头的展开 / 收起全部）、`listColumns`（不是字段的列，组件自己查询，
同一个查询键全表只请求一次）、`titlePrefixField` / `nameSort`（「制造商 / 名称」）、
`image`（列表缩略图、详情大图）、`plainCells`（列表单元格按详情页的读法：枚举是
文字，树引用带祖先路径）、`exportColumns: 'readable'`（导出全部可读字段，以便再
导入）、`ownerFromCreator: false`、`extendedFields: false`、`relatedRecord`
（型号的页签跟随分类）、`tabCounts` + `DomainTab.countOf`（一个 `/stats` 请求
给所有页签计数）、`BreadcrumbTrail`；`filterFields` 可以直接给一个字段定义
（型号的「资产类型」筛选不是型号自己的字段）。默认页签带 `visible` 条件时，详情页
等记录（和它依赖的记录）加载完再决定落在哪个页签。

逐页在浏览器里对照过迁移前后：列表的列、筛选、树的展开 / 收起与筛选、人员统计卡、
型号缩略图与大图、各详情页的信息卡、页签与计数、默认页签（库存型号落在「库存」，
软件分类落在「软件产品」）、历史页签、记录抽屉，均与迁移前一致。有意随通用页面
统一的三处：列表里的「新建」与行操作按权限显示（以前主数据列表总是显示，提交时
再被服务端拒绝）；行菜单的删除写作「删除位置」这类带对象的说法；导出带上当前
筛选（以前只带搜索词，和导出组件「导出列表当前筛选」的约定不符）。树形集合以前的
「按层级排序的表格」在树视图之下从未显示过，随旧页面一起删掉。

### 2026-09-28 维修单有了负责人，完成和删除归他

维修单是唯一一个没人负责的流程记录：采购单有申请人和审批人，报废单有申请人和
执行人，盘点任务有执行人，维修单只有**创建人**。而创建人一次写定不再改变，
IT 支持的 `complete` 授权又是 `recordsICreated`，结果是**维修单没法交接**——
报修的人请假，同级同事谁都结不掉，只有资产经理或 root 能收尾。

- **`ownerId`**（迁移 `202609280005_repair_owner`，已有行回填 `createdById`，
  那正是此前能结单的人）。创建时默认为填单人，之后可改。
- **完成和删除都要求是负责人**（`requireOwner` → `NOT_OWNER`）。删除也算，因为
  删除会把设备从`维修中`退回来，是一次撤销，不是同事该替他做的。和采购单的
  `requireRequester`、报废单的 `NOT_INVOLVED` 同一个套路：规则在服务里，对所有
  人一视同仁，root 也不例外；要接手就先改负责人（只需编辑权限）。
- **授权随之放开**：IT 支持的 `complete` 和 `delete` 不再是 `recordsICreated`
  ——记录级的范围没法表达「可以转交」。种子改写了，`reconcile-grants.ts` 新增
  `UNSCOPED_OPERATIONS` / `UNSCOPED_ACTIONS`，把管理员已保存的权限集里那条过时
  的范围去掉；不去掉的话转交过来的单子仍会被拒。只丢掉**收窄**的范围，
  `allRecords`（种子自己写的那个）保留，否则新建的数据库一启动就被改写一遍，
  `tests/logic/seeds.test.ts` 正是这么发现的。
- **候选人来自权限集，不是角色名单**：`GET /itam/users/repair-owners` 读「哪些
  权限集授予 `itam.repairs/complete`」及其用户。「除了员工以外」于是不用硬编码
  ——员工没有任何维修授权。approvers 那段同样的逻辑抽成了 `holdersOf()`。带
  `ids` 时它是**名称解析**而不是候选列表：记录上已有的负责人必须读得出名字，
  哪怕他现在不是候选人（`root` 不属于本应用的任何权限集）。
- **界面**：负责人在详情页的「系统」分组里、创建人上面，和其他记录的负责人一样；
  创建弹窗预填当前用户；`完成维修` 和 `删除维修单` 只对负责人显示
  （`DomainConfig.deletable` 因此和 `editable` 一样多收一个读者 id 参数）。
- **工作台**「进行中的维修」改成按 `ownerId = 我` 取。原来按 `complete` 的授权
  范围取，授权放开之后那样会列出所有人的在修单。
- **演示数据**把一张在修单给了 `support`，另一张留给生成账号，两边各看得到自己
  的一条。

### 2026-09-28 采购单和报废单的申请人可以改（不加负责人）

问的是这两张单要不要也加负责人。**不加**——两者都曾经有，也都是刻意删掉的
（`202609250008_drop_purchase_order_owner`、`202609190003_drop_disposal_owner`），
理由一样：那一列里存的永远是申请人的副本，没有任何规则、提醒或权限读它。维修加
负责人不是因为「流程记录都该有负责人」，而是因为那里有个死结：唯一的人员字段
`createdById` 一次写定不可改，`complete` 又按它授权。这两张单没有这个死结——
下单 / 到货 / 取消按权限判，报废的执行是 `NOT_INVOLVED`（申请人**或**审批人），
都卡不住。

真正没人记的是「谁在跟这张单」。**决定：不加字段，用申请人当负责人**
（2026-09-28）——`raisedTheOrder`（申请人或替他填单的人）**已经是**这个应用里
「这张单是谁的」的定义，编辑、改明细、提交、撤回全按它判。工作台的
`待验收到货` 改成按同一条筛，卡片和服务端于是说的是同一件事，而不是两套所有权；
申请人现在可改，**转交请求的同时这张卡就转过去了**，一个概念。报废那边本来就是
这个形状（申请人 + 审批人 = `NOT_INVOLVED`），不用动。

已知边界：申请人在`已批准`之后冻结，所以下单之后这张卡换不了人。收货本身不受
影响（按权限，谁都能收），卡住的只是卡片。真要在采购阶段单独转交，那才是一个
**经办人**字段，届时是新决定。

查这个问题时发现的**一处真不一致**，顺手改了：

- 报废单的申请人创建时可填（「IT 替张伟报的」），采购单的**完全不能填也不能改**
  （`form: false`，服务端只在 API 层认 `requesterId`）。而采购单的编辑、改明细、
  提交、撤回四件事全按申请人判，于是报单的人休假，草稿没人能改、待审批的没人能
  撤回，只能整单取消重来——维修那个死结的缩小版。
- 两张单现在都是：**创建时可填（默认填单人），之后在当前状态允许编辑时可改**。
  采购单到`已批准`随请求字段一起冻结（`readonlyWhen: settled`），报废单到
  `已批准`同样（`approvedDisposal`）；服务端的 `EDITABLE_STATUSES` /
  `SETTLED_EDITABLE` 本来就是这个形状，只需要把两个 `updateSchema` 里的
  `.omit({ requesterId: true })` 去掉。授权不用动：`requesterId` 一直在两张单的
  写字段列表里。
- 转交只有当前申请人（或创建人）能做，因为 `update` 本身就按 `requireRequester`
  判。创建人转交之后仍保留权利（`raisedTheOrder` 认两者），这是既有行为：替人
  报的单，代报的人还能帮着收拾。

### 2026-09-28 待办补齐「待执行的报废」，六张卡三张一排

已批准待执行的报废单是实打实的待办，工作台上却谁也看不到。补一张卡，**不加
字段**：按申请人（或替他填单的人）筛，和 `待验收到货` 同一条规则。审批人也有权
执行（`NOT_INVOLVED`），但那是权限不是他的活——**一张卡可以比操作的规则窄，
不能比它宽**。

演示数据原来没有`已批准`的报废单（只有草稿、审批中、已执行），这张卡永远是空
的。补了一台报废显示器和它的整条链路，报废单从 3 条变 4 条——采购单一直是
「列表能显示的状态都要有」，报废也该如此。

排版从 `auto-fit` 改成按页面自身宽度的三列（`@2xl:grid-cols-2
@4xl:grid-cols-3`）：六张卡两行三列，比 5+1 读着整齐。

## Template upgrade: beta.22 → beta.43 (2026-09-23)

Merged 21 template releases. The framework layer moved: `client/shell/` became
`client/layouts/` (ITAM's record drawer, assistant panel and card-tinted
header were ported onto it, and `ai-panel.tsx` moved with them), the sign-in
pages are now the template's own routes instead of the `nocobase-auth-ui`
route overrides, configuration became `client/config/` + `server/config/`
namespaces read by key, and `scripts/` and `cli/` are thin wrappers over
`@nocobase/app-tools` and `@nocobase/app-cli` (`pnpm db:apply` and friends
replace `pnpm migrate` / `pnpm seed`; the client and server inspection
commands are gone; `data:reset` stays as this application's dev command).

What the upgrade changed inside ITAM:

- **Page authorization.** `client/routes.ts` maps its tree through
  `withoutPageGrants()`; without it every page would demand a page grant the
  permission sets do not carry. The ITAM settings route keeps an explicit rule.
- **Authorization model.** Decisions carry `scope` + `fieldAccess`;
  `authz-filter.ts` compiles the new `FilterAst`, `unrestricted()` builds the
  new shape, record-access policies return scopes (`false` denies), and each
  collection's custom actions register with the database resource's authorizer.
- **Datetimes.** The sqlite driver stores them as text, so comparisons bind
  `dbDateTime()`. Before this, reminders and the idle-device rule silently
  matched nothing.
- **Notifications.** One message per channel; `config.yml` names the channel.
- **Permission set titles** are stored encoded — migration
  `202609230001_encode_permission_set_titles` converts rows written earlier.
- **zod 4**: `z.record()` takes a key schema.
- `@nocobase/db-sqlite` is now a direct dependency (sqlite left `@nocobase/db`).
- The template's chrome tests were removed; see `tests/components/README.md`.

Manual steps for an existing database, before `pnpm db:apply`: three
authorization migrations moved into the new `authz-*` plugin packages and two
were retired, so their history rows must be re-homed and removed — see
`docs/UPGRADE-beta43.md`.
