# ITAM: device sync

Read this before changing device sync: the platform connectors, the `managedDevices` and `deviceSyncRuns` tables, matching by serial, the device page's 管理平台 group, 设置 → 设备同步 or the nightly pull.

The design is the NocoSolution document `NocoITAM/NocoITAM 设备同步方案.md` (in the optional clone); steps 1 to 3 of its four are built.

- **Read only, and never into the register** (2026-10-14). A pull writes
  `managedDevices` (one row per platform record, keyed by `source` and the
  platform's `externalId`) and `deviceSyncRuns` (one row per pull), and
  nothing on `devices`: the device page reads the platform's values through
  `managedDevices.deviceId`. The only trace on a device is the
  `managedLinked` timeline event, origin `sync`. No code writes to a
  platform; Intune asks only for `DeviceManagementManagedDevices.Read.All`.
- **Credentials live in `config.yml`** under `deviceSync.intune`
  (`server/config/device-sync.ts`, with `INTUNE_*` environment variables),
  never in the database or on a page; the settings page only says whether a
  source is configured. `configuredSources` in
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
  views checks / unregistered / unmanaged / ignored, devices `read`); the
  settings tab's 核对规则 card (`deviceSync` settings key).
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
