# ITAM: device sync

Read this before changing device sync: the platform connectors, the `managedDevices` and `deviceSyncRuns` tables, matching by serial, the device page's 管理平台 group, 设置 → 设备同步 or the nightly pull.

The design is the NocoSolution document `NocoITAM/NocoITAM 设备同步方案.md` (in the optional clone); all four steps are built.

- **Read only, and never into the register** (2026-10-14). A pull writes
  `managedDevices` (one row per platform record, keyed by `source` and the
  platform's `externalId`) and `deviceSyncRuns` (one row per pull), and
  nothing on `devices`: the device page reads the platform's values through
  `managedDevices.deviceId`. The only trace on a device is the
  `managedLinked` timeline event, origin `sync`. No code writes to a
  platform; Intune asks only for `DeviceManagementManagedDevices.Read.All`.
- **Credentials: `config.yml`, or the settings page** (2026-10-15). A
  platform under `deviceSync.intune` / `deviceSync.jamf` in `config.yml`
  (`server/config/device-sync.ts`, with `INTUNE_*` / `JAMF_*` environment
  variables) wins, and 设置 → 设备同步 shows it read-only. Otherwise it can be
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
  `connected` flag hides the 管理平台 group while no platform is configured
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
  Personal records count only when `ignorePersonal` is off. Whole-register
  ones are two 需要关注 rules, `managedUnregistered` (unlinked or ambiguous
  company records synced within `staleDays`) and `deviceUnmanaged` (in use,
  in a `managedCategoryIds` category or under one, on no platform). Without
  a platform (`review.active()`) the rules are left out of the list, the
  设备核对 column is absent and no leaver is tagged.
- **以台账为准** writes `deviceSyncDismissals` (device, kind, the value that
  was seen: the last sync, the other person, the register status) and a
  `managedDismissed` event; the same difference with another value is
  raised again (guideline 3.4). **不纳入台账** sets the record `ignored`
  with a reason; 恢复 matches it again at once. A person's **link** and
  **unlink** set `matchedBy: manual`, which the next pull keeps — an unlink
  is not undone by a matching serial. Each writes `managedLinked` /
  `managedUnlinked` on the device.
- **Acts on the register stay the register's**: the 管理平台 group offers
  调拨给 / 分配给 the platform user and 恢复为库存中 by opening the device
  page's own dialogs, prefilled (`ManagedPlatforms`' `actions`). 补登记
  opens the device list's create form through `?new=1&init.…` (the list
  learned the prefill the generic lists had), with the model matched by
  name or part code and its category and maker; `POST /itam/devices` then
  calls `matchDevice`, so the new device is linked at once rather than at
  the next pull.
- **Where it shows**: 待办's 设备核对 column (`deviceChecks`, a device's
  负责人 for 我负责的, devices `read` and `update` to see it); 离职交接
  cards tagged N 台设备离职后仍在线 (`onlineAfterLeaving`, a sync after the
  leave date); `/device-sync` (管理平台核对, no menu entry or page grant,
  views checks / unregistered / unmanaged / ignored, devices `read`; reached
  from the device list header while a platform is connected and from the
  设备核对 column header, empty or not, since 2026-10-14); the
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
  token from `POST /api/oauth/token`, then `/api/v1/computers-inventory`
  and `/api/v2/mobile-devices/detail` a page at a time (`page`,
  `page-size`, `sort=id:asc`, stopping on a short page or `totalCount`).
  Its two kinds of record are numbered apart, so their ids are
  `computer:<id>` and `mobile:<id>`, which `consoleUrl` turns into
  `computers.html` / `mobileDevices.html` on the configured server. A
  computer's last word is `general.lastContactTime`, a mobile device's
  `general.lastInventoryUpdateDate`; a computer has no owner type and counts
  as the company's, a mobile device's `deviceOwnershipType` decides. The
  field names come from the Jamf Pro API reference as the
  `deploymenttheory/go-api-sdk-jamfpro` structs mirror it; no tenant has
  been read yet.
- **One device, several platforms**: a co-managed Mac has a record per
  platform, each linked to the same device; the device page shows both and
  the differences read the latest sync. 管理平台核对 folds unregistered and
  kept-off records of one serial into one row (`sources` lists the
  platforms), and 不纳入台账 / 恢复 decide them together.
- **Noco** (step 4, 2026-10-15): the method skill `device-sync`
  (`ai/skills/device-sync/SKILL.md`, 管理平台核对) — explain a difference,
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
  difference's notice, and 让 Noco 解释这些差异 / 整理这批设备 on 管理平台核对.
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
