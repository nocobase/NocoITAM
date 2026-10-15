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
  have none. Those are the Chinese demo's; the English demo has people of
  its own (2026-10-06, `DEMO_STAFF` and `PERSON_NAMES` by language) —
  Daniel Brooks `daniel` and Emily Carter `emily` (asset managers), Ryan
  Mitchell `ryan` (IT support) and the leaver Mark Taylor `mark` — rather
  than the Chinese names romanised, and its employees, joiners and vendor
  contacts are English names too. Inside the generator the staff are known
  by what they do (`approver`, `writer`, `support`), not by a username. They are listed in `nocosolution/NocoITAM/SPEC.md ## 演示数据`
  and go through `DemoAccounts` (`demoAccounts()` in
  `server/providers/itam/index.ts`) rather than the `user` table, are tracked
  in `demoRecords` under `accounts`, and each is written to its person's
  `userId` — the staff have a person record in IT, named as their account
  is in the deployment's language — because the records they answer for
  name the account. 孙强 and 周宇 (Daniel and Ryan) have a laptop each, 吴静 (Emily) a laptop, a
  monitor and a phone. The account that generated the demo is the system
  administrator and no employee: it gets no person record, holds nothing
  and answers for no record — the demo is written as 吴静 (`writerId`), who
  raises the requests 孙强 decides; repairs and audits are 周宇's. `demoAccountUsernames()`
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
  An account that talked to Noco on the AI employee plugin owns
  conversations and usage events that reference the user row — a database
  upgraded from before template 1.0.0-beta.64 still holds them — so those
  are deleted first, with the account; the Agents plugin's rows reference
  none.
  It also deletes the three seeded Permission Sets so the seeds rewrite them
  — a seed writes a set only when it is absent, so editing a grant in one
  otherwise has no effect on a database that already ran it.
- **Device sync in the demo** (2026-10-15, `demo.ts`): the demo's Intune and
  Jamf records hold every situation MDM 核对 shows once — silent, another
  user, on the shelf yet online, disposed yet online (critical), no longer
  reported (a second Intune pull leaves it out), non-compliant and
  unencrypted; a new laptop of a known model, a contractor's of an unknown
  one, a serial two register devices share (the second entered in lower
  case: the register refuses an equal serial, matching ignores case), a
  virtual machine; a personal phone and a meeting room computer kept off by
  a person; and, on the register's side, laptops in use on no platform
  (只在台账) and a test phone marked 不需要纳管 with its reason
  (`deviceSyncExemptions`, cleared through `DEPENDENTS`). Their platform ids start `demo-` (or `computer:demo-` /
  `mobile:demo-`), which is how `device-demo-source.ts` knows them: with no
  connection, a platform holding demo records reads as connected (`demo`)
  and its pulls replay them, last syncs moved on by the time since the
  previous pull. Keep that prefix on any record the demo adds. The data and
  demo test asserts each situation.
