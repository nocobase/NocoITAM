# 0001 — Record lifecycles on `@nocobase/lifecycle`

- **Status:** accepted for the pilot (disposals), 2026-10-18; later record
  kinds wait on the pilot's outcome.
- **Deciders:** the NocoITAM owner.

## Context

ITAM's work documents move through states — a purchase order from draft to
completed, a disposal from draft to executed — and every move is a service
method that reads the record, checks its status in memory and writes the new
one (`requireStatus` / `setStatus` in `server/providers/itam/domain-record.ts`,
with copies in `procurement.ts` and `devices.ts`). Three gaps follow:

1. **Concurrency rests on SQLite.** The write has no `where status = …` and
   there is no version, so two decisions on one record are kept apart only by
   SQLite's single connection serialising transactions. The Solution guideline
   (§2.4) requires PostgreSQL in production, where both would commit.
2. **A notification can be lost.** It is sent after the transaction, and a
   failure is logged and dropped; guideline §3.6 asks that every automatic
   action fail visibly and never be lost.
3. **The rules are scattered.** Status lists are mirrored on the client,
   allowed moves live in each service, and timers are separate jobs.

`@nocobase/lifecycle` (0.1.0-beta.2, shipped with template 1.0.0-beta.64)
keeps the state on the record, declares every move in source, writes the
state, a version and a log entry in one conditional update, and owes the work
outside the database as effects run after commit, retried and recorded. The
application's development guide recommends it for exactly these records.
NocoCRM piloted it on approvals without effects, triggers or versions passed
in; a second Solution using it is what makes the practice verified
(guideline §4.2).

## Decision

Adopt it record kind by record kind, starting with **disposals**:

- One `LifecycleRuntime` for the application (`server/providers/itam/lifecycles.ts`),
  its effects on the application's jobs in their own scope
  (`itam-lifecycles`), swept every minute, finished runs pruned after a week.
  A container without jobs — a test's — runs effects in process.
- The definition is in `server/lifecycles/<kind>.ts`. Guards say who may move
  the record (owner, named approver, people the request went through) and
  read other tables through the transaction they are decided in. Effects
  carry what they need in the transition's input, which the log keeps, rather
  than re-reading tables a retry may find changed.
- **The service keeps its transaction and its API.** Each operation fires its
  transition inside its own transaction (`transaction: connection`), then
  writes what the move carries along — the approval row, the devices, the
  timeline — in the same transaction. Routes, response shapes and the
  `BUSINESS_RULE` refusals stay as they were; `lifecycleRefusal()` maps the
  runtime's refusals onto them.
- **Approvals stay data** (option A of the evaluation): the disposal's own
  states carry pending / approved / rejected; the `approvals` row is written
  beside the move, not given a lifecycle of its own.
- **History stays the timeline.** `historyEvents` / `changeLogs` are still
  written; the runtime's `lifecycleTransitions` is the audit log behind the
  flowchart. Deleting a record, or clearing the demo, removes both.
- **The flowcharts are drawn once, on 设置 → 流程,** a tab per lifecycle
  (purchase orders, repairs, disposals; 2026-10-19, after 设置 → 报废流程 of
  2026-10-18), with the UI Library's `@nocobase/lifecycle-diagram`. A
  disposal's own 流程 tab, drawing where it stood, came with the pilot and
  went on 2026-10-19: five states in nearly a line said nothing its status
  tag and 历史 did not.

## The approver range (2026-10-18)

The first parameter an administrator sets on a lifecycle: whom a submitter
may ask to approve — a disposal from 2026-10-18, a purchase order too from
2026-10-19, each on its tab of 设置 → 流程 and under a group key of its own
(`disposalApprovers`, `purchaseOrderApprovers`; `server/lifecycles/approver-range.ts`).
It is a `reviewers` field of the lifecycle's `parameterConfiguration`, read live, stored by
`StoredLifecycleParameters` in the six `lifecycleParameter*` tables
(202610180002_lifecycle_parameters), and saved with the revision the page
showed and a request id, so a stale page conflicts and a resent save saves
once. It may name `anyone` (the default: everyone holding that approval),
permission sets or people, and it only ever narrows the holders of the
approval. The submitter's picker lists the range, and submitting with
someone outside it is refused (`APPROVER_NOT_IN_RANGE`). It is not the
amount tiers removed on 2026-09-25: it decides who may be asked, never who
must be.

A deployment starts with the IT Asset Manager set ticked on both: when the
application starts and a range has not been saved, `startApproverRange`
(`server/providers/itam/approvers.ts`) saves that set as the first version.
It is done at start rather than in a seed, because a seed may not use the
parameter store's database manager. An administrator's later choice,
everyone included, is never overwritten; the lifecycle's own default stays
`anyone`, which is what a database without the authorization tables (a
test's) keeps.

## Scope after the pilot

| Record          | Plan                                                                 |
| --------------- | -------------------------------------------------------------------- |
| Purchase orders | Done 2026-10-19: receiving fires `receivePartly` or `complete`       |
| Repairs         | Done 2026-10-19: `result` is the state (`stateField`), no new column |
| Stocktakes      | Next                                                                 |
| Devices         | Decide after the pilot: eight states driven by four other domains    |
| Not adopted     | People (state derived from dates), entitlements and sync differences |
|                 | (computed views), agent runs and plans (already conditional updates) |

## Consequences

- Two disposals decided at once: one commits, the other is refused with
  `CONFLICT`, on any database.
- A failed notification is retried with backoff; its run, failed after the
  last try, is in `lifecycleEffectRuns` and `GET /itam/disposals/:id/lifecycle`.
  Telling the owner in their inbox (guideline §3.6) is a follow-up.
- Only the runtime writes `status`, `statusChangedAt` and `lifecycleVersion`.
  The demo goes through the services; an import that writes a state directly
  is a one-off data load, like a migration's backfill, and starts at version
  0 with no creation entry.
- Names are stored with every log entry and effect run: a lifecycle is never
  renamed, and renaming a state or effect takes the multi-release procedure
  in the development guide.
- The library is a beta, and ITAM is the first Solution to run its effects on
  jobs. The pilot is where its gaps are found; they are reported upstream
  rather than worked around here.
