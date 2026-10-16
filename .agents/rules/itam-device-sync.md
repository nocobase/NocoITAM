# ITAM: device sync

Read this before changing device sync: the platform connectors, the `managedDevices` and `deviceSyncRuns` tables, matching by serial, the device page's MDM group, 设置 → MDM or the nightly pull.

The design is the NocoSolution document `NocoITAM/NocoITAM 设备同步方案.md` (in the optional clone); all four steps are built.

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
  a placeholder serial). Both tables are in `ORDER` and in
  `scripts/data-reset.ts`.
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
  rule; this is the per-device exception. Noco reads it as
  `--view exempted` and in a device's `exemption`.
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
- **Noco** (step 4, 2026-10-15): the method skill `device-sync`
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
  serial at once, as on its page. Entry points: 让 Noco 看看 on a
  difference's notice, and 让 Noco 解释这些差异 / 整理这批设备 on MDM 核对.
- **Eval set** (step 4): `server/providers/itam/evals/device-sync.ts` holds
  the cases — what the commands show, the question, and the decision a
  person who knows the method would make per item (transfer, assign,
  register, link, ignore, restore, keep, verify, escalate) — and
  `skill-evals.ts` scores them. `POST /api/itam/ai/evals/device-sync`
  (settings grant) runs every case against Noco's model with the skill as
  the library holds it and answers a report (passed / total, each case's
  misses). Run it before changing the skill, the instructions or the model,
  and attach the report to the change. A case from real use — a difference a
  person settled otherwise than Noco proposed — is the best kind to add.
