# ITAM: device sync

Read this before changing device sync: the platform connectors, the `managedDevices` and `deviceSyncRuns` tables, matching by serial, the device page's 管理平台 group, 设置 → 设备同步 or the nightly pull.

The design is the NocoSolution document `NocoITAM/NocoITAM 设备同步方案.md` (in the optional clone); step 1 of its four is built.

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
