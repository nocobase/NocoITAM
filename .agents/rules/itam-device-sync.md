# ITAM: device sync

Read this before changing device sync: the platform connectors, the `managedDevices` and `deviceSyncRuns` tables, matching by serial, the device page's MDM group, 设置 → MDM or the nightly pull.

The design is the NocoSolution document `NocoITAM/NocoITAM 设备同步方案.md` (in the optional clone); all four steps are built.

**MDM 差异跟进** (2026-10-21): the follow-up Asset Steward writes after a
pull is called MDM 差异跟进 (MDM difference follow-up) wherever a person
reads it; these notes and the code still say MDM 跟进 / `deviceSync`.

**Naming** (2026-10-15): the interface calls a device management platform
**MDM** — the device page's MDM group, MDM 核对, 已关联 MDM — and spells it
out once where it is first met, as 设备管理平台（MDM）. The skill's library
title is MDM 核对; prompts name it with its slug (`device-sync`) as well,
since a library provisioned earlier keeps the title it was given.

**Validation against real tenants.** Record each check here with its date
and platform versions. Do not describe a platform as verified, in the
product or in release notes, until it is listed here.

- **Microsoft Intune: validated** on 2026-10-15 against a Microsoft 365
  trial tenant (Business Standard with Intune Plan 1), one Windows 11 PC
  (10.0.26200) enrolled with "Enroll only in device management". Checked:
  the connection entered on 设置 → MDM (secret sealed, 测试连接), the token
  and the Graph list, every field ITAM reads (serial, name, maker, model,
  OS and version, primary user, ownership `personal`, compliance,
  encryption, enrolment and last sync), the run's counts, the record under
  只在 MDM and, with 忽略个人设备 on, under 已忽略, and the console link
  opening the device in the Intune admin center. Not yet checked against
  the tenant: linking by serial after 补登记, the primary user matched to a
  person by email, a record the platform stops reporting, paging past one
  page, and the nightly run; the tests cover those.
- **Jamf Pro: not validated.** Checked only against the published shapes
  (`tests/logic/device-sources-official.test.ts`).

- **Read only, and never into the register** (2026-10-14). A pull writes
  `managedDevices` (one row per platform record, keyed by `source` and the
  platform's `externalId`) and `deviceSyncRuns` (one row per pull), and
  nothing on `devices`: the device page reads the platform's values through
  `managedDevices.deviceId`. The only trace on a device is the
  `managedLinked` timeline event, origin `sync`. No code writes to a
  platform; Intune asks only for `DeviceManagementManagedDevices.Read.All`.
- **The demo stands in for a platform** (2026-10-15,
  `device-demo-source.ts`): with no connection, a platform whose records
  include the demo's (ids starting `demo-`) reads as connected, origin
  `demo` on 设置 → MDM with a note that it is simulated, and its pulls —
  立即同步 and the nightly one — replay those records instead of the
  network. A real connection replaces it. Demo records have no console
  link.
- **Credentials: `config.yml`, or the settings page** (2026-10-15). A
  platform under `deviceSync.intune` / `deviceSync.jamf` in `config.yml`
  (`server/config/device-sync.ts`, with `INTUNE_*` / `JAMF_*` environment
  variables) wins, and 设置 → MDM shows it read-only. Otherwise it can be
  connected on that page (`device-connections.ts`, table
  `deviceSyncConnections`, one row per platform): the client secret is
  sealed with the framework's secrets service (`secretsServiceToken`,
  purpose `itam/device-sync-client-secret`, bound to the platform key) and
  registered as a secrets store, so `nocobase secrets status` counts it and
  `secrets rotate` reseals it. The secret is written, never answered: a
  save without one keeps the stored one. Without `secrets.keys` the page
  refuses to store (`deviceSync.secretsNotConfigured`) rather than store it
  in plain text. Saving and disconnecting take the settings grant and leave
  a history event on `deviceSyncConnections` / the platform key, without
  the secret. 测试连接 signs in and reads one page, one attempt, storing
  nothing; a refused sign-in is a 200 with `ok: false` and the failure
  code. Every pull reads the connections afresh (`effective()`), so a save
  takes effect without a restart. `configuredSources` in
  `server/providers/itam/device-sources.ts` connects a source only when all
  of its values are there, and the config's validator refuses a half-filled
  one or a `${NAME}` placeholder.
- **Matching** (`device-sync.ts`): the serial, trimmed and upper-cased
  (`normalizeSerial`), against every register device's; placeholders such as
  "To be filled by O.E.M." or all zeros never match. One device: linked
  (`matchedBy: serial`). Several: `ambiguous`, for a person. A link then
  follows the platform id, so a later serial change keeps it; it is redone
  only when its device was deleted. An `ignored` record stays ignored (step
  2 adds the decision). No matching by name or MAC. The primary user's
  email or UPN links `personId` when exactly one person has that email.
- **Gone only after a complete pull.** A pull that fails part way ends
  `partial` and marks nothing gone; otherwise one network error would turn
  every device into a lost one. Transient failures (network, 429, 5xx) are
  retried three times inside `requestWithRetry`, honouring `Retry-After`;
  401 / 403 end the run `failed` with `AUTH_FAILED` / `PERMISSION_MISSING`.
  A run left `running` by a restart is closed as `INTERRUPTED` when the next
  pull of that source opens.
- **One pull per source at a time** in this process (`begin`): a second
  `POST /itam/device-sync/run` joins the running one. The route answers 202
  with the open runs and the pull carries on; the settings card polls
  `GET /itam/device-sync` every 2 s while a source is running.
- **Schedule**: `itam.device-sync` at 01:30 on its own scheduler target
  (`app.itam.device-sync` in `itam-schedules.ts`), before 人员在职状态更新 at
  01:50. A platform that could not be read fails the execution, so the task
  page shows it.
- **Grants**: the status and "sync now" take the settings grant
  (`itam.settings` / `update`), which IT 支持 holds as well as the IT 资产经理
  in the seeded roles; a device's platform records
  (`GET /itam/devices/:id/managed`) take the device's `read`. Its
  `connected` flag hides the MDM group while no platform is configured
  and none ever reported.
- **Demo**: the generator reads its own Intune through `ingest` like a real
  pull (trigger `demo`): the laptops and desktops in use under their holders,
  one silent for seven weeks, one under another person, one in stock yet
  online, and three not on the books (a laptop, a personal iPhone, a VM with
  a placeholder serial), and since 2026-10-21 a company ThinkPad under a
  company account that is no person on the register (冯浩, LAPTOP-FHDEMO05),
  which the demo's follow-up leaves to verify rather than register. And SH-DT-202
  reporting a new board's serial (`demo-board-swap`): only in MDM and only
  on the register at once, which the follow-up links by its name. Both tables are in `ORDER` and in
  `scripts/data-reset.ts`. The devices behind 信息不一致 answer to IT
  support, the importing account and 吴静 (2026-10-17), so the 负责人
  column and each person's MDM 跟进 differ; never the leaver. SH-DT-201, a Mac mini under 只在台账, is the
  importing account's too (2026-10-21), so its MDM 跟进 has one there.
- **Differences** (step 2, 2026-10-15, `device-review.ts`) are computed when
  asked, like 需要关注, from the linked platform records and the register;
  nothing stores them. Per device, from its latest platform record:
  **失联** (`stale`) — in use and not synced for `deviceSync.staleDays`, or
  every record gone; **使用人不一致** (`userMismatch`) — assigned to one
  person, the platform's primary user is another; **状态不符**
  (`statusMismatch`) — in stock, retired, pending disposal, disposed or
  lost, yet synced within `recentDays` (lost and disposed are `critical`).
  Personal records count only when `ignorePersonal` is off. The
  whole-register ones are `unregistered()` (unlinked or ambiguous company
  records synced within `staleDays`) and `unmanaged()` (in use, in a
  `managedCategoryIds` category or under one, on no platform — but not
  one a platform stopped reporting, which is 失联 until a person keeps the
  register, 2026-10-16: one device was listed in two tabs and counted twice
  on 待办). They were
  two 需要关注 rules for a day; since 2026-10-15 they are counts on 待办's
  MDM 核对 column (`MyWorkItem.summary`), so MDM is one place on the board.
  Without a platform (`review.active()`) the column is absent and no
  leaver is tagged.
- **忽略** (以台账为准 until 2026-10-16; the code still says `dismiss`)
  writes `deviceSyncDismissals` (device, kind, the value that was seen:
  the last sync, the other person, the register status) and a
  `managedDismissed` event, at one click (no confirmation since 2026-10-16:
  恢复 takes it back); the same difference with
  another value is raised again (guideline 3.4). An ignored difference
  that still holds is listed, not lost: `checks({ dismissed: true })`
  (view `dismissed`) is 信息不一致's 已忽略 section, with who and when and
  恢复 (`POST …/checks/:deviceId/undismiss`, the device's `update`, a
  `managedUndismissed` event), as 只在 MDM and 只在台账 list theirs. **不纳入台账** sets the record `ignored`
  with a reason; 恢复 matches it again at once. A person's **link** and
  **unlink** set `matchedBy: manual`, which the next pull keeps — an unlink
  is not undone by a matching serial. Each writes `managedLinked` /
  `managedUnlinked` on the device.
- **不需要纳管** (2026-10-15) is 只在台账's counterpart of 不纳入台账: a
  device in use of a managed category that rightly is on no platform (a
  Linux workstation, a lab machine). It writes `deviceSyncExemptions`
  (one row per device, a required reason, who, when; migration
  `202610150003`) and a `managedExempted` event, taking it out of
  `unmanaged()` — so out of the tab, 待办's count and the device list's
  同步状态 filter — and into `exempted()`, listed under 只在台账's list as
  its own section (`?view=exempted` scrolls to it) with 恢复
  (`managedUnexempted`). The device page's MDM group says the reason in
  place of 未在已连接的 MDM 中找到, with 恢复. Both acts take the device's
  `update` (`POST /itam/device-sync/unmanaged/:deviceId/exempt` and
  `/unexempt`); only a device `unmanaged()` lists can be marked. The mark
  **lapses** once a platform reports the device (`expireExemptions` in
  `device-sync.ts`, after every pull, a match by serial and a person's
  link): its reason no longer holds, and a mark left behind would hide the
  device again should it drop off the platform. Categories stay the coarse
  rule; this is the per-device exception. Asset Steward reads it as
  `--view exempted` and in a device's `exemption`.
- **One tag for a difference (2026-10-16)**: `DifferenceTag`
  (`client/components/itam/difference-tag.tsx`) — the 注意 tone, or the
  destructive tag when critical — marks a difference everywhere: on the
  device page's MDM records (no notices there any more: 失联 on the last
  sync's age, 已不在平台中 by the platform's name, another user beside the
  primary user with 调拨, an off-duty status beside the last sync with 分配
  or 恢复为库存中), in MDM 核对's 信息不一致 and on 待办's MDM 核对 cards.
  忽略 and asking Asset Steward are MDM 核对's, not the device page's.
- **Loose ends closed (2026-10-16)**: a record kept off the register
  (不纳入台账) is linked once the register has one device of its serial —
  by `matchDevice` at once, or by the next pull — and its ignore cleared;
  a person's unlink still stands. 补登记 links its record to the new device
  itself, since matching by serial leaves a record a person unlinked alone.
  A record whose serial a register device has carries that device as a
  candidate (`sharedSerials`, not only for `ambiguous`), and 只在 MDM then
  offers 关联 but not 补登记, which the duplicate serial would refuse.
  Records on no device that have not synced for `staleDays` are
  `silent()` (view `silent`), listed as 长期未同步 under 只在 MDM rather
  than nowhere. The link dialog warns when the device already has another
  live record of the same platform.
- **Acts on the register stay the register's**: the MDM group offers
  调拨给 / 分配给 the platform user and 恢复为库存中 by opening the device
  page's own dialogs, prefilled (`ManagedPlatforms`' `actions`). 补登记
  opens `DeviceCreateDialog` in place (since 2026-10-15), with the model
  matched by name or part code and its category and maker, the serial
  locked (it is what links the record), and — when the primary user is a
  person on the register — 使用中 for that person (2026-10-16), so the new
  device does not come straight back as 状态不符. `POST /itam/devices`
  then calls `matchDevice`, so the new device is linked at once rather
  than at the next pull.
- **Where it shows**: 待办's MDM 核对 column (`deviceChecks`, devices
  `read` and `update` to see it): the differences as device cards, a
  device's 负责人 for 我负责的, then one card each for 只在 MDM (devices
  `create`, whole under 我负责的 — such a record has no 负责人) and 只在台账
  (the device's 负责人 for 我负责的) with its count, opening its tab;
  the column's count is all three (2026-10-15); 离职交接
  cards tagged N 台设备离职后仍在线 (`onlineAfterLeaving`, a sync after the
  leave date); `/device-sync` (MDM 核对, no menu entry or page grant,
  views checks / unregistered / unmanaged / ignored, devices `read`; since 2026-10-15 the tabs read 信息不一致 / 只在 MDM / 只在台账 with their counts, and 已忽略 is no tab but a section beneath 只在 MDM's list (`?view=ignored` opens that tab and scrolls to it); 只在台账 says its three conditions in one sentence; the ignored view also lists, after the records a person kept off, the personal devices 忽略个人设备 leaves out (`ignoredByRule`, no 恢复: the rule brings them back), since 2026-10-15; reached
  from the device list header while a platform is connected and from the
  MDM 核对 column header (查看全部), empty or not, since 2026-10-14); the
  settings tab's 核对规则 card (`deviceSync` settings key).
- **MDM 核对's layout** (2026-10-21): each row ends in one button and a
  "···" menu (`RowActions`), so the last column stays in view at 1280 px.
  A 信息不一致 row's button settles it through the device page's own dialog,
  opened by `?do=` (`markLost`, `transfer`, `assign`, `restore`) and
  `&to=` the platform's person, which the device page reads once and drops;
  without the grant, or for a difference no dialog settles, it is 查看.
  忽略 is in the menu. 只在 MDM leads with 补登记 (or 关联 when a register
  device has the serial). Who marked a row and when share one column, the
  date first. 等你决定 heads each MDM 跟进 with one line — its subject, the
  steps waiting, and the plan's 拒绝 / 确认执行 (`PlanDecision`); declining
  the plan sets the follow-up aside, so 忽略 shows only without a plan. The
  steps beneath are open while it waits, folded once decided. The
  header's MDM 跟进 reads 重新运行 MDM 跟进 while one works or waits; a new one
  replaces it.
- **Suggestions on the rows** (2026-10-21): a follow-up's result carries
  `advice` — per item the action, reason, target and whether the plan does
  it. MDM 核对 reads the reader's waiting follow-ups (`useAdvice`) and marks
  each row they cover with a sparkle whose tooltip says the action and why;
  the suggested action becomes the row's button (忽略 for keep, 关联 with the
  suggested device, 不纳入台账 / 不需要纳管 with the reason filled in,
  transfer / assign / correct status through the device page's `?do=`).
  The tabs' own AI shortcuts went: the header's MDM 跟进 is the one way in. Each advice entry also names its plan steps
  (`steps`, positions from 1): once its row is gone from the lists, the
  follow-up's card unticks them, marks them 已处理 and leaves them out
  of 确认执行; with every step settled so, it closes by itself as handled (accepted,
  decision `settled`, through `dismiss` with `settled: true`), shown 已全部处理. Only by lists read after the run
  was written (2026-10-22): lists cached from before a new import closed its
  follow-up the moment it came. The server refuses `settled` while anything
  its plan was to do is still listed (`SUGGESTION_NOT_SETTLED`).
  已处理 is a tag at the end of the step's line.
- **Registering is one step** (2026-10-21): `create_record` of a device
  takes `assignTo { targetType, targetId }`, as the create dialog's 使用中
  does, and checks the `assign` grant as well as `create`. MDM 跟进 and the
  device-sync skill register a platform record and hand it to its user in
  that one step (登记新设备并分配给…), no longer a second `assign_device`. The
  follow-up's header no longer counts the steps waiting: 确认执行 N 步 says it.
- **Each follow-up its own** (2026-10-22): a person's own devices' MDM
  跟进 and the shared one are separate cards on MDM 核对, each with its own
  拒绝 / 确认执行, separate entries in 收件箱 and counted apart; they were
  one card for a day (2026-10-21) and read worse. While one is worked out
  again, the others' follow-ups are hidden. Each card has its own 重新运行
  (`ask(by, part)`, `part` `own` or `shared`); the page header's does both.
- **已处理 and the record drawer** (2026-10-22): 只在 MDM's linked section
  (`linkedByHand`, view `linked`) is 已处理: records linked by hand and,
  for 30 days, those registered — linked by serial to a device made after
  the platform first reported them — each tagged 补登记 or 关联. A platform
  record's name on MDM 核对 opens a sheet of what the platform reports
  (`ManagedRecordSheet`), with the console link; it has no register device.
- **Only what was done is handled** (2026-10-22): of a follow-up carried
  out (accepted), an item counts among `handled()` only when one of its plan
  steps ran (`done`). Unticked steps, notes to look at and items with no
  suggestion are raised again by the next follow-up. One set aside (拒绝, 忽略) settles
  nothing: declining a suggestion leaves the difference, so every follow-up,
  a pull's or one asked for, works it out again; runs from before `advice`
  count whole. A step
  left out shows as 未执行.
- **Asking again refreshes the shared part for all** (2026-10-22): `ask`
  starts the reader's own devices' follow-up, and — when the reader holds
  the asset manager set — the shared one for every asset manager, as a pull
  does: deciding one closes the others' copies, so asking for oneself alone
  left the other asset managers with none.
- **Where a registered device is kept** (2026-10-22): MDM 跟进's register
  step keeps it where its primary user sits (`people.locationId`) and says
  so in its line (…，存放在<位置>：…). With no person or no location there is
  no step but a note to 补登记 on MDM 核对 and choose the place; it no
  longer guesses the place most devices are kept. 补登记's form starts with
  the same place (`suggestedLocationId`).
- **Same-name devices** (2026-10-22): an 只在 MDM record carries
  `sameNameDevices`, the register devices of its name under another serial
  (a board replaced, a serial mistyped). Matching still never goes by name;
  the follow-up's prompt and the device-sync skill say to link to one rather
  than register a duplicate. A skill library provisioned earlier keeps its
  old text; the prompt carries the rule regardless.
- **Asset managers' copies stay theirs** (2026-10-22): deciding one shared
  copy no longer closes the others (`settleShared`). A step carried out
  shows as 已处理 on the others' cards; declining is the decider's own. A
  copy whose every planned item is off the lists closes as settled on the
  server, so it does not wait in its manager's 收件箱.
- **The device list** (2026-10-15): while a platform is connected the list
  response says `syncConnected` and each row carries `lastSyncAt` (the
  latest of its linked records), which the 最后同步 column shows; the
  同步状态 filter (`filter[syncState]`: `linked`, `unmanaged`, `stale`) is
  no column — `narrowBySyncState` turns it into the ids the list and its CSV
  export may show. Both are absent while no platform is connected.
- **A leaver's 归属 tab** lists the devices a platform still heard from
  after the leave date with them as primary user
  (`GET /itam/device-sync/people/:id/online`, people and devices `read`;
  `LeaverOnlineDevices`), above everything else and even when they hold
  nothing on the register — a device returned on paper but still signing in
  as them is the case it is for.
- **Grants**: the review lists take devices `read`; link, unlink and
  以台账为准 the device's `update`; 不纳入台账 and 恢复 devices `create`, the
  act they stand in for.
- **Jamf Pro** (step 3, 2026-10-15, `createJamfSource`): an API client's
  token from `POST /api/oauth/token`, then the computer inventory and
  `/api/v2/mobile-devices/detail` a page at a time (`page`, `page-size`,
  stopping on a short page or `totalCount`). The computers are read from
  `/api/v4/computers-inventory`, falling back to v3 and then v1 while the
  first page answers 404: Jamf deprecated v1 on 2025-06-30 and v3 on
  2026-07-14 (Jamf Pro 11.30); v4 renamed `general.lastContactTime` to
  `general.lastContact`, and both are read. Computers sort by `id:asc`;
  the mobile inventory has no `id` and sorts by `mobileDeviceId:asc`.
  Its two kinds of record are numbered apart, so their ids are
  `computer:<id>` and `mobile:<id>`, which `consoleUrl` turns into
  `computers.html` / `mobileDevices.html` on the configured server. A
  computer's last word is `general.lastContactTime`, a mobile device's
  `general.lastInventoryUpdateDate`; a computer has no owner type and counts
  as the company's, a mobile device's `deviceOwnershipType` decides. The
  field names follow the Jamf Pro SDKs' models (`macadmins/jamf-pro-sdk-python`,
  `deploymenttheory/go-sdk-jamfpro-v2`): a mobile device's user is
  `userAndLocation.realName` and its encryption `security.dataProtected`.
  The API reference's `fullName` and `dataProtection` are sort and filter
  names only; reading them was a bug until 2026-10-15.
- **One device, several platforms**: a co-managed Mac has a record per
  platform, each linked to the same device; the device page shows both and
  the differences read the latest sync. MDM 核对 folds unregistered and
  kept-off records of one serial into one row (`sources` lists the
  platforms), and 不纳入台账 / 恢复 decide them together.
- **Asset Steward** (step 4, 2026-10-15): the method skill `device-sync`
  (`ai/skills/device-sync/SKILL.md`, MDM 核对) — explain a difference,
  find the right device for a shared serial, sort the records the register
  lacks into one plan; never mark lost or keep the register for the person,
  never act on a platform. It reads `itam device-sync review` (`--view`, or
  `--device-id` for one device's records and differences;
  `deviceSyncReview` in `itam-agents/reads.ts`, under the person's devices
  `read`), and proposes three plan steps besides the register's own:
  `link_managed_device`, `unlink_managed_device` (devices `update`) and
  `ignore_managed_device` (devices `create`), whose history reads origin
  `agent`. A device a plan creates through `create_record` is matched by
  serial at once, as on its page. Entry points: 看看 on a
  difference's notice, and 解释这些差异 / 整理这批设备 on MDM 核对
  (the AI shortcuts dropped 让 Noco from their labels, 2026-10-17).
- **MDM 跟进** (2026-10-17, `server/providers/itam/device-sync-followup.ts`,
  work agent `deviceSync`, trigger `synced`): after a pull that read every
  page (`DeviceSyncService.onSynced`, set by the agents' provider, which
  waits 15 s for the other platforms' pulls; not the demo's ingest), every
  item MDM 核对 lists — 失联, 使用人不一致, 状态不符, 只在台账, 只在 MDM — is
  worked out by Asset Steward with the `device-sync` skill (one call; each
  item under a short ref, material from `deviceSyncReview` read as the
  person; a decision per item with its reason) and left as a plan in 收件箱:
  a run per device 负责人 for its devices (`owner:<id>`), and one per holder
  of the asset manager set for the platform records and the devices nobody
  owns (`shared:<id>`, the others superseded once one is decided). Steps:
  `create_record` (+ `assign_device` to the platform user; the place is the
  user's, else where most devices are kept), `link_managed_device`,
  `ignore_managed_device`, `transfer_device` / `assign_device`,
  `correct_device_status` (never to lost), `dismiss_device_difference`
  (忽略 a difference) and `exempt_device` (不需要纳管) — the last two added
  for it, under the device's `update` like their buttons. Verify and
  escalate (and enrolling a device on a platform) are notes, as is a step
  the plan screen refuses, with whatever followed from it. An item is new
  until a run holding it was carried out or set aside (90 days); a waiting
  run is replaced by the next pull's, since a plan lasts a day. Carrying
  out or withdrawing the plan settles the run (`PlanService.onDecided`,
  composed with the conversation news); 忽略 withdraws the plan.
  **MDM 跟进** on MDM 核对 (2026-10-17, `POST /api/itam/device-sync/followUp`,
  devices `read`; `ask()`, trigger `asked`) runs it for the reader alone
  without waiting for a pull: their `owner:` run, and their `shared:` one
  when they hold the asset manager set. It replaces only their own waiting
  run, ignores the agent's switch (asked by hand), and answers the runs it
  started — none when nothing is new for them, which the page says in an
  alert. The page's 等你决定 (`DeviceSyncFollowUpBlock`, from the 收件箱's
  runs) shows the reader's open follow-ups as their cards, a run just asked
  for at once, working; one carried out or set aside there stays folded,
  one a newer run replaced goes. 收件箱 shows MDM 核对 itself beside an MDM
  跟进 (`PagePane`), as it shows a request beside its review, with that run
  alone in 等你决定 (`FollowUpFocusContext`). Its title says whose it is —
  你负责的设备 (`owner:`) or 资产管理员 (`shared:`), `followUpTitle` — and a
  run a newer one for the same person replaced is left out of the list.
  A holder of the asset manager set also reads the other people's open
  follow-ups there, folded under 其他负责人的跟进 (`GET
/api/itam/device-sync/followUps`, `others()`): the summary, what the plan
  would do (its steps' titles, read from `itamPlanSteps` since only its
  proposer may load the plan) and the notes — nothing to act on, which
  stays their owner's. 只在台账 lists each device's 负责人, whose follow-up
  has it.
- **Eval set** (step 4): `server/providers/itam/evals/device-sync.ts` holds
  the cases — what the commands show, the question, and the decision a
  person who knows the method would make per item (transfer, assign,
  register, link, ignore, restore, keep, verify, escalate) — and
  `skill-evals.ts` scores them. `POST /api/itam/ai/evals/device-sync`
  (settings grant) runs every case against the default chat model with the skill as
  the library holds it and answers a report (passed / total, each case's
  misses). Run it before changing the skill, the instructions or the model,
  and attach the report to the change. A case from real use — a difference a
  person settled otherwise than Asset Steward proposed — is the best kind to add.
