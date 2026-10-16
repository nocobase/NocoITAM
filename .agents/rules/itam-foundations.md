# ITAM: server and data foundations

Read this before writing a service, a route, a transaction, a query on dates or JSON, a notification, an import or export, a record lifecycle, or anything that reads `config.yml`.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

- **A record lifecycle** (2026-10-18, [ADR 0001](../../docs/adr/0001-record-lifecycles.md)):
  disposals move only through `@nocobase/lifecycle` — the definition in
  `server/lifecycles/disposals.ts`, the one runtime in
  `server/providers/itam/lifecycles.ts`. A service fires the transition
  inside its own transaction (`transaction: connection`) and writes what the
  move carries along beside it; nothing else writes `status`,
  `statusChangedAt` or `lifecycleVersion`. A guard reads other tables through
  the services factory's handle, never `database.query()`. An effect reads
  what it needs from the transition's input, and notifies through
  `notifier.deliver()`, which throws so the run is retried. Refusals reach the
  routes through `lifecycleRefusal()` as the `BUSINESS_RULE` codes they always
  had. Deleting such a record deletes its rows in `lifecycleTransitions` and
  `lifecycleEffectRuns`; the demo lists both as dependents. Read the
  development guide's `references/lifecycle.md` before adding the next one.
- `202610180001_disposal_lifecycle` was corrected after it was merged
  (2026-10-16), the one exception to "a merged migration is history": its
  backfill wrote `updatedAt` as it reads back (local text) into the zoned
  `statusChangedAt` and failed on every database that had a disposal, so no
  such database had run it, and a later migration could not have helped. The
  schema it makes is unchanged; a database that ran it while it had no
  disposals reports checksum drift, which `pnpm nocobase db repair` clears.
  A backfill into a `datetimeTz` field passes a `Date`.
- Inside `database.transaction(async (connection) => …)` every read and write,
  including calls into other services, must go through `connection.query`. The
  SQLite pool holds one connection, so a read through `database.query()` while
  a transaction is open waits forever. Services that may run inside a
  transaction accept an optional `connection`.
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
- A service that performs another domain's step inside its own transaction
  calls that service's `*Within(connection, …)` variant (or passes the
  optional trailing `connection`) with `unrestricted(collection, action)`
  conditions: the route already authorized the outer operation, and a nested
  `database.transaction` would deadlock on the single SQLite connection.
- Notifications go through `itamNotifierToken` after the transaction
  committed; it never notifies the actor, never throws, and needs the
  `notification.channels` in-app entry in `config.yml` to deliver.
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
- Files under `public/` are served at the application base path; reference
  them with `resolveAppUrl('/samples/…')`, never a literal `/main/…`.
- Datetime columns are text since the sqlite driver became
  `@nocobase/db-sqlite`: a `Date` bound into a comparison matches nothing and
  raises no error. Compare through `dbDateTime()` in
  `server/providers/itam/dates.ts`; `tests/support/test-database.ts` registers
  the driver explicitly because it builds a manager without the application.
- `maybeDecide()` in `server/routes/itam/http.ts` answers `undefined` instead
  of refusing, for a route that reads several collections and must leave out
  the ones this caller cannot read rather than refuse the whole answer (the
  recovery endpoint does this per owned collection).
- A calendar date is local. `isoDate()` / `today()` in
  `server/providers/itam/dates.ts` format one in the server's zone; the client
  has `todayIso()` in `client/lib/itam/format.ts`. `toISOString().slice(0, 10)`
  is UTC, so east of UTC it writes yesterday until mid-morning — a receipt
  entered at 00:30 in Shanghai was recorded on the previous day, in
  `receivedAt`, `orderedAt`, a leaver's date, every reminder horizon and the
  report ranges (fixed 2026-09-27; `tests/logic/dates.test.ts` pins it).
  `addDays` / `addMonths` stay pure arithmetic on the string.
- Nothing this application writes into a record is English prose. An
  operation that happens because of another record carries `sourceLabel`
  beside `sourceType` / `sourceId` (`HistorySource`), so a device's status
  change names the audit that corrected it and links there
  (`statusChangeByAudit`, the way a disposal's does).
- Notifications take one message per channel: ITAM sends
  `messages: { 'in-app': { to, title, body, target } }`, and `config.yml`
  names that channel under `notification.channels` as a map entry.
- A secret in `config.yml` is written there as a value, never as `${NAME}`:
  nothing expands that, so the placeholder is stored and sent as the key
  itself, and a provider answers 401 with a value ending in `}`. To take a
  key from the environment, run
  `pnpm nocobase config set --from-env ai.llmServices.<service>.options.apiKey=<VARIABLE>`,
  which reads the variable and writes the value into the gitignored
  `config.yml`. `config.example.yml` still shows `${RESEND_API_KEY}` under
  `notification`, which is as unexpanded as any other.
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
