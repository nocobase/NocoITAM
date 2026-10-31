# ITAM: seeds and demo data

Read this before changing a seed, the demo generator or the demo's accounts.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

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
  Its demo runs in a bare container with allow-all doubles and no accounts
  plugins, so its approver directory lets anyone be asked (2026-10-20,
  `DemoContainer`): the stored approver range names the IT Asset Manager
  set, which nobody holds there, and refused the demo's stand-in approver.
- Seeds carry data, not UI text: the category seed writes names and field
  labels in the deployment's default locale (`APP_DEFAULT_LOCALE`, else
  `i18n.defaultLocale` in `config.yml`) because a seed's context holds only
  the database. Tests pin `APP_DEFAULT_LOCALE=en-US` before seeding.
- Demo data uses the seeded categories (`cat-laptop`, …), manufacturers
  (`mfr-apple`, …), models (`model-macbook-pro-14-m3`, …), software
  products (`sp-figma`, …), locations (`loc-hq`, …) and departments
  (`dept-rd`, …); a first employee is seeded too (`person-li-xiao`;
  starter vendors were until 2026-10-21, when
  `202610210003_remove_starter_vendors` took the unused ones off) but the
  demo creates its own, demo-marked vendors and people because it mutates
  them (a leaver, seat holders); it creates the rest of its master data
  itself;
  it refuses to run when a seed record is missing. The seeds reuse an
  existing manufacturer or product of the same name (names are unique), so
  a test that seeds must not create "Apple" or "Figma". Model seeds must be
  common models with their manufacturer part codes.
- Seeds may ship data files under `database/main/seeds/assets/`; the build
  copies that directory next to the compiled seeds. The model seed stores
  pictures the way an upload does (bytes under `<storage>/objects/`, a row
  in `itamFiles`), so tests point `APP_STORAGE_DIR` at a temporary
  directory (`tests/support/setup.ts`).
  In an application, picture writes use its shared Drive service, or the
  resolved Drive configuration when seeds run before that service is registered
  (2026-10-25); never infer a hosted app's volume from `process.env` or the
  process working directory. Bare seed runners retain the temporary-storage
  fallback. Startup repairs missing objects for unchanged built-in picture
  records through the same disk, without replaying seeds, recreating deleted
  records, or replacing existing files. This also repairs earlier hosted
  installations whose seed history already says the pictures were installed.
  It stores every picture in `assets/models/`, those no seeded model uses
  too (2026-10-20): they are the picture library the demo's own models
  point at by the same file ids (`DEMO_PICTURES` in `demo.ts`, a photo's
  credit in `DEMO_PICTURE_CREDITS`), never writing a file, so clearing the
  demo leaves them. A photo is of that exact model, from Wikimedia Commons
  under an open license, credited in `CREDITS.md` and `imageCredit`; a
  model with no such photo takes a neighbouring generation's whose
  exterior is the same (2026-10-21, saying so in `CREDITS.md`), else has
  no picture: the line drawings were dropped the same day
  (`202610210001_clear_drawn_model_pictures` takes them off a database
  that has them), the list shows a placeholder in the thumbnail's frame and the page shows
  only 上传图片 to whoever may edit. Every demo model has its manufacturer
  part code; only `vSphere VM` has none.
- Every model and every category without children has assets behind it in
  the demo (2026-10-21): devices, or a stock item for an accessory,
  consumable or component model, so no catalogue entry stands empty. The
  catalogue's own models get theirs from `CATALOGUE_ASSETS` in `demo.ts`
  (spares in the warehouse, shared machines placed at a location, stock
  issued and returned over the weeks after), and the demo test checks no
  model is left without.
- Nobody holds two accessories of a kind (2026-10-22): the demo's `issue`
  skips a person who already holds one of the same category (and the
  matching `takeBack`), and a catalogue accessory goes to the first two
  people without one; the demo test checks it. 张伟 held two docks, two
  keyboards and two mice before.
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
  cards. One placed order — PO-000020 on a fresh import until 2026-10-16,
  numbered later since the historical orders grew — carries a line of
  every kind (desktops, keyboards, toner, memory, a perpetual licence and a
  subscription), so receiving it, by hand or from a delivery note, shows
  every way goods arrive. The extra orders are never received — receiving makes devices and
  stock — and the extra audits keep off the laptops, whose 400-day-old last
  count a matched count would stamp today.
  The two joiners are entered **last** (2026-10-06), because saving one sets
  Asset Steward choosing their equipment, and four spare MacBook Pro 14s and two
  spare monitors give it something to weigh: the rule's pick (own floor,
  longest warranty) is SH-LT-050, whose keyboard was repaired twice, and
  SH-MON-006, with a dead pixel; SH-LT-053 is due for replacement within
  months.
  The demo comes with the work agents' suggestions written, never asked
  of a model (2026-10-16, `demo-suggestions.ts`; see `itam-assistant.md`):
  the approval assistant's review of each request still waiting (two
  approve-on-conditions, one ask-for-more, one reject), the MDM follow-up
  on every item MDM 核对 lists, its plans set to wait 30 days rather
  than one, and Asset Steward's picks for the two joiners, which pass
  over SH-LT-050, SH-LT-053 and SH-MON-006. The runs and plans are
  tracked (`itamAgentRuns`, `itamPlans`, first in `ORDER`), and runs on
  the demo's requests go with them (`DEPENDENTS`). Clearing also sweeps
  any run whose records are gone — a review of a request, an MDM
  follow-up none of whose devices is left, a failed follow-up — with its
  plan, which an import before this tracking left behind. It also deletes
  every history event the demo wrote (`sourceType` `demo`, 2026-10-21),
  those on records it did not make included — toner issued to a seeded
  floor stayed on the floor under the replaced demo account, one more
  已删除的用户 line per import. Each part is extra:
  one that fails leaves the demo without it rather than failing the
  import.
  Every department has a default 入职配置 once the demo is in (2026-10-06):
  one without — 技术部, which the seeds skip, or one whose default was
  deleted — gets engineering's kit, its nearest parent's or an office kit,
  tracked so clearing the demo removes it.
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
  links to `/settings/demo` and, dismissed, stays away in that
  browser. While an import runs, the tab and the banner — dismissed or not —
  show how far it has got (2026-10-16, after NocoCRM's): `status()` returns
  `importing: { percent }` from a per-process counter `generate()` moves at
  each step, and the page asks every second. Each step also yields the event
  loop (`reached` in `demo.ts`): the SQLite driver is synchronous, so without
  it the status requests waited for the whole import. A second import is
  refused while one runs (`DEMO_IMPORTING`). Clearing it takes its numbers too: `numbering.rewind()` moves
  each sequence back to just past the highest number still in use (never
  forward, only under the current prefix), so on a database that held only
  the demo the next import starts at PO-000001 again rather than climbing
  with every import. Real numbers are otherwise never reused.
- The demo creates its own sign-ins (2026-10-05, replacing the role
  accounts `manager` and `support`): the IT staff as people with names —
  two asset managers, 孙强 `sunqiang` and 吴静 `wujing`, and IT support
  周宇 `zhouyu` — and the leaver 陈杰 `chenjie`, who is IT support too and
  left two days before the import (entered last with that leave date, which
  marks them left the way 标记离职 does, so the handover snapshot is whole
  and the sign-in disabled; it was the day itself until 2026-10-22, when the
  laptop that answers to the importer, SH-LT-011, began syncing since, the
  one 离职后仍在线 on their card); each
  password is the username and 123. The other demo people are employees and
  have none. Those are the Chinese demo's; the English demo has people of
  its own (2026-10-06, `DEMO_STAFF` and `PERSON_NAMES` by language) —
  Daniel Brooks `daniel` and Emily Carter `emily` (asset managers), Ryan
  Mitchell `ryanm` (IT support) and the leaver Mark Taylor `markt` (not
  `ryan` / `mark` since 2026-10-23: a password is at least eight
  characters, and the users plugin refused theirs) — rather
  than the Chinese names romanised, and its employees, joiners and vendor
  contacts are English names too. Inside the generator the staff are known
  by what they do (`approver`, `writer`, `support`), not by a username. They go through `DemoAccounts` (`demoAccounts()` in
  `server/providers/itam/index.ts`) rather than the `user` table, are tracked
  in `demoRecords` under `accounts`, and each is written to its person's
  `userId` — the staff have a person record in IT, named as their account
  is in the deployment's language — because the records they answer for
  name the account. 孙强 and 周宇 (Daniel and Ryan) have a laptop each, 吴静 (Emily) a laptop, a
  monitor and a phone. The account that generated the demo is the system
  administrator and no employee: it gets no person record, but holds the
  资产管理员 set while the demo is there (2026-10-16,
  as NocoCRM's importer is its sales manager), so it may be named an
  approver or a 负责人 and work the register like the demo's managers; the
  assignment is tracked in `demoRecords` as `importerGrants` and revoked on
  clearing, and an importer that held the set already keeps it — the
  initial administrator always does since 2026-10-23 (seed
  `202610230001_assign_initial_admin_asset_manager`, so pickers can offer
  the one account a fresh deployment has). With the set
  it answers for a share of the to-dos (`importerId`, 2026-10-16), so its
  我负责的 is not empty: it decides one order and one disposal, owns two
  orders awaiting receipt and the two drafts (so it can try 解析单据,
  offered only to a draft's 负责人 or writer), an in-house repair, the
  disposal to carry out and the draft disposal of a monitor (2026-10-23),
  and counts in the open stocktake. Since
  2026-10-22 every column of 待办 → 我的 has a row: the leaver 陈杰's
  SH-LT-011 is the importer's; the importer is the first joiner's 入职负责人
  (their laptop SH-LT-051 already reserved, Asset Steward's picks for the rest); and
  SH-LT-031 is a loaner two days overdue that it answers for. The data test
  checks no column of its 我的 is empty — the demo is written as 吴静 (`writerId`), who
  raises the requests 孙强 decides; repairs and audits are 周宇's. Since
  2026-10-30 the work is spread rather than all hers: the historical device
  orders alternate between 吴静 and 孙强 as 负责人, and 周宇 hands things
  out (`desk`: devices assigned, lent and returned, stock issued, taken back
  and reordered, seats given and reclaimed), so 动态 and the lists read as a
  team's. Orders carry several lines (2026-10-30): the historical device
  orders gather what one vendor delivered within a quarter, and the open
  orders not tied to an AI review carry what goes with the item (a dock and
  cable with the laptops, toner with the printer). The orders the demo's
  AI reviews read (`demo-suggestions.ts`: the monitors, the R&D MacBook
  Air, the core switch, the interns' laptops) stay one line, since the
  review reads the first line as the order; the first stock of each item
  is still an order of its own, on the day the item came in. `demoAccountUsernames()`
  keeps the retired `manager` / `support`, and the pinyin usernames an English
  demo had before 2026-10-06, so a reset still removes them.
  The requests are addressed to 孙强, not to whatever `otherUser` finds.
  Two traps: the users
  plugin's `remove` refuses without deletion hooks (so the authentication
  plugin's is used, after revoking the assignment), and that one is a soft
  delete which keeps the username and e-mail — the rows are purged
  afterwards, or regenerating collides. `pnpm data:reset --demo` builds a
  container without those plugins, so it **deletes** the demo accounts by
  name and creates none; generate from the running application for sign-ins.
  An account that talked to Asset Steward on the AI employee plugin owns
  conversations and usage events that reference the user row — a database
  upgraded from before template 1.0.0-beta.64 still holds them — so those
  are deleted first, with the account; the Agents plugin's rows reference
  none.
  It also deletes the three seeded Permission Sets so the seeds rewrite them
  — a seed writes a set only when it is absent, so editing a grant in one
  otherwise has no effect on a database that already ran it.
- **The demo's devices came in on orders** (2026-10-16): those written
  straight onto the register — the ones on the books before ITAM — are
  grouped by vendor and purchase date into completed historical orders
  (`texts.historicalOrder`), one line per model and one receipt per device,
  and each device names its order; numbered before the demo's own orders
  so the numbers run with the dates. Look an order up by what it holds,
  not by its number, which moves when devices are added.
- **Device sync in the demo** (2026-10-15, `demo.ts`): the demo's Intune and
  Jamf records hold every situation MDM 核对 shows once — silent, another
  user, on the shelf yet online, disposed yet online (critical), no longer
  reported (a second Intune pull leaves it out), non-compliant and
  unencrypted; a new laptop of a known model, a contractor's of an unknown
  one, a virtual machine (a serial two register devices share
  went on 2026-10-16, when the register stopped taking a serial twice); a personal phone and a meeting room computer kept off by
  a person; and, on the register's side, laptops in use on no platform
  (只在台账) and a test phone marked 不需要纳管 with its reason
  (`deviceSyncExemptions`, cleared through `DEPENDENTS`). The computers on
  the shelf or at the repairer are on Intune as well (2026-10-16), with no
  user and a sync three weeks back or more, as a returned laptop stays
  enrolled — linked, yet no 状态不符 — but the last two on the shelf, new
  and not set up yet. 状态不符 holds each of its row actions (2026-10-22): a
  stock laptop online with no user (查看), one online under a person
  (分配给), one marked lost at a stocktake and online again under a person
  (恢复为库存中, then 分配给 them —
  the stock laptop last touched, so the idle one 保养提醒 shows stays idle;
  not one in use, whose holder would fall back into 入职准备), and the
  disposed one. Every 需要关注 rule has a case too (2026-10-22): a Latitude battery
  and the 1 TB SSD issued below their minimum, beside the mouse, and the
  QA engineer's ThinkPad still filed under IT. Each accessory came in
  through an order too (2026-10-22: only the keyboards did) — the mice,
  docks, headsets, hubs and webcams a restock received into their record,
  each starting that much lower so it ends where it did; the catalogue's
  stock (`CATALOGUE_ASSETS`, each with its `price`) is bought by an order
  received into a record of its own; so is the first stock of the
  keyboards, docks, headsets, hubs and webcams (`boughtStock`), before
  their restocks, and of a few consumables and components (the cables,
  paper, Latitude batteries, 1 TB SSD and 32 GB memory). Every device
  status has a device (2026-10-22): a spare iPhone is retired
  (SH-PH-004), and the laptop sold off (SH-LT-008), entered after the pass
  that gives devices their pre-register order, gets one through
  `enterHistoricalOrders` and three repairs before it was handed back. Their platform ids start `demo-` (or `computer:demo-` /
  `mobile:demo-`), which is how `device-demo-source.ts` knows them: with no
  connection, a platform holding demo records reads as connected (`demo`)
  and its pulls replay them, last syncs moved on by the time since the
  previous pull. Keep that prefix on any record the demo adds. The data and
  demo test asserts each situation.
- **The demo has a history** (2026-10-16, `on()` / `off()` in `demo.ts`):
  the services stamp every history line, change, movement, assignment
  period, seat and approval with the moment they run, so an import read as
  one afternoon. `on(day)` dates what the operations after it write — until
  the next `on()` or `off()` — on that day at office hours, keeping their
  order (`DATED` lists the columns it moves); `device()` enters each device
  on its purchase date, and every other step names its day. Laptops of the
  2023 batch read as three years of use: bought, issued (one changed hands,
  the spare was lent and came back), repaired, counted; the people's hire
  dates fit their equipment. A receipt whose date is only decided by the
  arrival corrections moves with everything it wrote (`arrivedOn`). What
  happens on the day — the leaver, the kits, the joiners, MDM — comes after
  `off()` and stays today. A loan dated back is made due in three days and
  corrected on the device, its period and its history line (`dueOn`). The
  stock and licences grew with it: six accessories (a USB-C hub and a webcam
  in a `摄像头` / `Webcam` category the demo adds), five consumables (A4
  paper, AA batteries), four components (2 TB SSD, 16 GB memory), each
  stocked one to three years back and issued, returned, consumed and topped
  up since — keyboards and toner are hand-stocked and topped up by their
  orders (`purchasedStock({ into })`); three perpetual licences (Windows 11
  Pro per device) and seven subscriptions (Microsoft 365, renewed by hand
  each year and grown by four seats; Adobe Creative Cloud and ChatGPT Team,
  each with a seat taken back and given to someone else). Models and
  master data a stock item needs beyond the seeds go through `named()`,
  which reuses a record of that name rather than tracking it. The data test
  counts the holdings of the employee with EMP-101 (two devices, three
  accessories, four seats since 2026-10-16). Dating moves any row
  written while the import runs, so an import is best not run while others
  edit the register.
- **Everybody in the demo holds what their 入职配置 asks** (2026-10-16):
  every person is entered a few days before their first day, so each is a
  joiner (`isJoiner`) and 入职准备 measured all of them against their kit —
  it listed long-standing employees while the people page said two were
  joining. The demo now equips everybody still there to their kit on the
  days they started: the devices are bought ahead of the first day (or in
  the refresh that brought the model, for those who started before it was
  sold) and come in on the historical orders, the accessories are issued
  from stock sized so what is left at the end is what it always was (MX
  Master still below its minimum), and the seats come from Microsoft 365,
  the yearly Zoom plan, IntelliJ, Figma and Adobe, each sized to keep the
  same free seats as before. Two positions have a kit of their own, added
  and tracked by the demo: IT's asset managers and the sales manager work
  on a MacBook Pro (no ThinkPad or Air), so `positionKit` says so rather
  than marking an item 不需要 for each. Only the two joiners entered last
  (孙浩 / 林雪, Noah Harris / Grace Lee) are not equipped; 入职准备 lists
  exactly them, which the data test asserts, and the rule still picks
  SH-LT-050 and SH-MON-006 for them. A change to a kit's seed, or to who
  the demo's people are, needs the matching change in `CREW_KITS` /
  `crewWants` and the gap fills of the six original employees and the
  staff, or 入职准备 fills up again.
- **The rest of the company** (2026-10-16, `CREW` in `demo.ts`): 29 more
  people across the seeded departments, names per language (Chinese names
  in the Chinese demo, English ones in the English demo, two Japanese
  names at the Japan branch in both), positions from each department's
  seeded list, employee numbers EMP-107 on in the order they started (over
  six years), so the register holds 41 with the seeded one. Two of them
  left long ago (a leave date in the past, entered once everything was
  back) and their laptop and monitor or phone went to the person who took
  their place; neither opens a 离职交接 to-do. Their devices' serials sort
  after every other computer's and phone's, because MDM picks its
  situations by position in the serial order; keep a new device's serial
  sorting last too. Equipment bought before last year's desk count is
  stamped counted then, so 盘点逾期 keeps to the devices meant to be
  overdue.
- **The demo's own master data has a history** (2026-10-16): the vendors
  change over the years (the reseller's switchboard, then its account
  manager, the repair shop's pick-up days, the recycler's certificates),
  as do the models and maker `named()` created (the webcam's description,
  the 2 TB drive's warranty, the hub's end of sale, Duracell's website),
  each dated with `on()`, and the reseller, the recycler and two models
  carry comments. Only records the demo created are changed (`revise`,
  `demoMade`): a seeded or pre-existing record of the same name is left
  alone, since clearing the demo removes only the history of what it
  tracks. Each model the stock needs is entered just before that stock.

- Seeded master data has a creation line (2026-10-16): the seeds write
  their records straight into the tables, so
  `202610160001_seed_itam_master_install_history` adds a `create` change log,
  with no actor and origin `install` (随系统安装), for every master record
  that has none. A later seed that adds master data needs the same, or a
  seed of its own like this one. The demo comments on three seeded categories
  without mentions or replies, tracking each comment as `historyEvents` so
  clearing removes it, and changes only the webcam category it made.

- **Devices registered from the demo's platform records** (2026-10-21) are
  cleared with the demo: `clear` adds every device whose serial is one of
  its tracked `managedDevices` records' and that it did not make itself.
  Left behind, a device someone registered while trying the demo out (by
  补登记 or a follow-up's plan) took the next import's record by serial, and
  只在 MDM never listed LAPTOP-PF5DEMO01 again.
- Clearing the demo also deletes the 新员工配备 orders raised for its
  joiners (2026-10-22): 创建采购单 filed an order the demo did not make,
  which would otherwise outlive the clear and, matching the next import's
  joiner by department and joining day, cover their shortfall unasked. An
  order goes when its department, needed-by date and the name in its
  description are a demo joiner's, and it is not yet placed; a real joiner
  starting the same day keeps theirs.
- **The demo's prices follow the register's currency** (2026-10-23). They
  are written in yuan; `withPrices` in `demo.ts` converts every money field
  (`purchasePrice`, `unitPrice`, `cost`, `proceeds`, `expenses`) passed to
  the services at a round rate (`PRICE_RATES`: USD 1/7, EUR 1/7.8, …) taken
  from 设置 → 通用's currency when the import starts, and `price()` does it
  for an amount the demo writes itself (a quote, a sentence naming one). A
  new deployment's currency follows its default locale (the settings seed:
  CNY for Chinese, USD otherwise), so the English demo reads in dollars.

- **Dedicated Demo Mode (2026-10-25)** reuses the existing ITAM generator
  through `ItamDemoModeProvider`. Enable it only on a separate demo database
  and storage. The dataset creates business staff accounts; management uses
  the installation's existing Super Admin.
- Demo cleanup retains the installation catalogue and seeded onboarding kits,
  and removes all other business records, including visitor additions. Extend
  its cleanup order when adding collections; never change migration or seed
  history during reset. Verify clear/reset against isolated databases.
- Keep ITAM's write exceptions empty. External effects, background maintenance,
  sync, lifecycle effect workers and automatic work agents stay idle; read-side
  caches must not write. Do not provision real model credentials in Demo Mode.
- **Plugin integration, 0.2.0-beta.5 (2026-10-28), now 0.2.0-beta.6
  (2026-10-30).** Import `isDemoMode` from the plugin's server entry and the boolean `useDemoMode` from its client
  entry. The client uses published startup configuration, with no status query
  or loading state. `server/app.ts` registers the plugin's `demoEffectsGuard`
  after i18n with ITAM's protected paths, `/api/auth/request-password-reset`
  among them since 2026-10-31: it sends mail and writes only `verification`,
  which the SQL guard allows. Keep background/service checks and
  the form-specific `isDemoReadOnlyError` handling: the plugin owns the refusal
  and toast, while ITAM restores inline values and retains form drafts.
  Visitor preference cookies, account role translations, the reset schedule
  and, since beta.6, its retries and recovery belong to the plugin; do not
  duplicate them in the application. A daily reset that fails is tried again
  up to three times a day (`demoModeDailyResets`); one left interrupted waits
  for a manual reset until it has not moved for an hour, when the next due run
  takes it over.
- `/settings/demo` uses plugin management in Demo Mode and the original sample
  importer otherwise. Keep the ordinary sample-data banner. Use the plugin's
  route helper and deployment reset settings; do not duplicate its entry,
  account-switching or scheduling logic. The route's `authz` decides who
  reaches the page, and `DemoModeSettings` shows its own loading and denied
  states (2026-10-30); ITAM supplies only the frame, the count names and what
  to refresh afterwards.

- **The demo comes with Asset Steward conversations** (2026-10-25,
  `demo-conversations.ts`), so the chat has something to read where no model
  is set up (cn and global). They are real conversations held on a fresh
  import, kept as fixtures (`demo-conversations/<language>.ts`): questions,
  the tools each answer called and the answer, without tool results or
  reasoning. Dates, record numbers and ids are placeholders filled at import
  (days from the import day; the n-th demo record of a kind by number; a
  record found by e-mail or name). The importer gets all six with the two
  plans (expiry pushed out a year); the demo's staff get the ones their role
  would ask, without plans. They are written only with the Agents plugin, as
  `assistantBinding` resolves a new conversation's config, and only when the
  register's currency is the one the answers quote (CNY for Chinese, USD for
  English). To change one, capture again and regenerate both files rather
  than editing an answer by hand.
- **A Demo Mode deployment's demo data page has no actions** (2026-10-25).
  Every visitor may enter as its administrator, so 设置 → 演示数据's
  Generate, Clear and Reset let anyone wipe the demo under everyone else.
  The plugin's settings page is read-only from 0.2.0-beta.0, showing the
  data, the accounts and the daily reset without application overrides for
  its actions. ITAM only omits its header because the settings layout owns
  the heading. The demo resets daily (`NOCOBASE_DEMO_RESET_*`). To reset it
  by hand, call the
  plugin's API as the administrator:
  `POST <app>/api/demoMode/data/reset` with `{"language":"zh-CN"}` (or
  `en-US`), signed in or with an `x-api-key`, then follow
  `GET <app>/api/demoMode/data` until `state` is `ready`; on a server with
  the CLI, `pnpm nocobase demo-mode data reset --force`. The API still
  answers any administrator: hiding the buttons stops the casual reset, not
  a determined one.
