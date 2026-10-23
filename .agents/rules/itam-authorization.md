# ITAM: authorization and roles

Read this before changing a grant, a composite resource, a page grant, a permission set or what a role may do.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

- Template beta.43 brought page authorization: an App page with no rule of
  its own checks a page grant named after its route. Since 2026-09-27
  `client/routes.ts` maps the app tree through `withPageGrants()`, which
  gives **every page with a `navigation` entry** the rule
  `page:<route name>/access` and skips everything else — a detail page and
  its tabs are reached through the list that already checked, and the
  sign-in pages are public. Which pages a role reaches is part of what the
  role is: IT support holds no 报表, so it has no entry for it rather than a
  page of refusals. The seeds have carried these grants since they were
  written (`IT_PAGES`); nothing read them until then, so a
  database seeded earlier is missing whichever pages arrived later —
  `ADDED_PAGES` in `reconcile-grants.ts` tops the seeded sets up at
  start-up, because a seed creates a set once and never touches it again.
  `WITHDRAWN_PAGES` is the other direction, for a page a role should no
  longer reach. A page's route name is the identifier stored
  grants reference, so renaming one migrates data;
  `tests/logic/client-routes.test.ts` pins the list. A page grant decides
  what is offered, never what is allowed — every endpoint still enforces its
  own authorization.
- Authorization conditions carry `scope` (`true` or a `FilterAst`) and
  `fieldAccess` rather than `filter` and `fields.input/output`;
  `authz-filter.ts` compiles the scope and `unrestricted()` builds the new
  shape.
- A Collection owns `read`, `create`, `update` and `delete` and nothing else.
  This application's own operations (`assign`, `issue`, `approve`, `export`…)
  are composite resources declared in
  `server/providers/itam/authz-resources.ts` (`defineCompositeResource`,
  stored as `{ type: 'composite', id }` with the policy
  `{ type: 'composite', scopes: { <collection>: <record access> } }`): one
  `itam.<collection>` per Collection that has them, each operation granting
  that Collection. The provider registers them with
  `authz.compositeResources.define` and lists them in the permission
  workspace's ITAM subsection of 业务权限 (`authz.ui.place`); they were
  "business resources" (`type: 'resource'`) until authorization
  0.2.0-beta.21 (template beta.49), and `202609280007_composite_grants`
  rewrote the stored grants. Asking
  the Collection for `assign` is answered with
  `UNKNOWN_DATABASE_RESOURCE_OR_ACTION` — a deny, with no error to notice.
  Every decision therefore goes through `decideWith` (routes reach it as
  `decideFor` in `server/routes/itam/http.ts`, the AI tools through
  `ai-bridge.ts`): it asks the resource whether the caller holds the
  operation, then asks the Collection for that operation's conditions with
  `params.operation`, and narrows the response fields to the caller's `read`
  grant. A stored grant names `itam.devices/assign`, which
  `202609240001_move_operations_to_resources` rewrote from the old
  `main.devices/assign`; the seeds write the composite shape through their
  `splitOperations` helper. `tests/support/test-app.ts` mirrors the
  catalogue, so a route that asks the wrong resource fails in tests. A route
  that decides by calling `authz.authorize` itself skips all of this: it is
  how the master-data writes returned an empty record until 2026-09-26.
- Every title this application registers with authorization — an
  `itam.<collection>` resource and each of its operations and data scopes,
  each database Collection, the ITAM settings item and its actions — is a
  `{ key, ns: APP_NS }` key under `admin.authz.*` in `client/locales/admin/index.ts`
  (`collectionTitleOf`, `operationTitleOf` in `authz-resources.ts`), worded as
  the pages word the action (分配, 归还, 标记离职, 导出), the way the Agents
  plugin titles its own. Until 2026-10-16 the operations carried no title and
  the resources a plain English string, so a permission set's 业务操作 tab
  listed `markLeft` and `correctStatus` under PEOPLE and DEVICES in Chinese
  too. A new operation or Collection needs its key in both languages;
  `tests/logic/authz-titles.test.ts` fails without it.
- An `itam.<collection>` operation grants **no readable field of its own**
  (`resourceOf` in `authz-resources.ts` declares `.read([])`). It used to
  grant the Collection's whole field list, reasoning that a response is
  narrowed again by the caller's `read` grant — but `withReadableOutput`
  performs that narrowing by asking the Collection for the caller's plain
  `read` decision, and the operation's own expansion is one of the branches
  that decision is composed from. Granting every field there widened the
  very answer it was meant to be narrowed by, so field-level access was void
  for any role holding an operation on that Collection: IT support read
  `purchasePrice`, `bookValue` and `depreciatedAmount` on every device, and
  the product key and unit price on every entitlement, because they also
  hold `assign` and `export` (found and fixed 2026-09-27). What an operation
  may **write** is still its own grant. The route tests' authorization
  double grants by role and never evaluates a real policy, so this is not
  covered by a test — check it against a running application, by reading a
  list as a role whose `read` excludes a cost field.
- A stored grant states **one field list per action** — `fields: '*'` or a
  list of names, what a read returns and what a write accepts — not the
  pre-beta.43 `{ input, output }` pair. The plugin validates the shape and
  drops a policy it does not recognise, silently: a set written the old way
  grants nothing, and a Collection with no `itam.*` operation to grant it
  through (every master-data table) denies every read with
  `NO_OBJECT_PERMISSION`. `reconcileGrants` rewrites the old shape at start-up
  so an administrator's edits survive, and the seeds write the new one.
  Because a write grant therefore says nothing about what may be read back,
  `decideWith` asks the Collection for the caller's `read` grant and puts its
  fields in `fieldAccess.output` — which is what `outputFields` narrows a
  create or update response with. The test double mirrors the empty output of
  a write decision, so a route that decides without `decideWith` returns an
  empty record in tests.
- Who may hold an operation is read from the permission sets, never from a
  role name: `holdersOf()` in `server/routes/itam/users.ts` backs both
  `/itam/users/approvers` and `/itam/users/repair-owners`, and the same
  reading of the sets (`assignedTo()`) decides who `/itam/users` offers at
  all. Asked with `ids`, such an endpoint is a
  **name lookup** instead and answers regardless — the owner a record already
  holds must read back even when they are not a candidate now (`root`
  belongs to no permission set of this application's).
  Every person a picker offers reads with the permission sets they hold
  (2026-10-06): the three endpoints return `roles` — the key and title of
  each set granting an `itam.*` operation — and `ReferenceSelect` shows
  them beside the name (`userRolesLabel` in `client/lib/itam/user-roles.ts`,
  which translates this application's two sets through `users.roles.*` and
  reads any other by its stored title), since picking a 负责人 or an
  approver is picking a role as much as a person.
- The two sets' **names follow the reader's language** (2026-10-16): the
  seed stores each title as a translation key, `{ key: 'users.roles.<set
key>', ns: 'itam' }`, the way the plugin's own 成员 and 系统管理员 are
  stored, and `reconcileGrants` gives the key to a set still named what the
  seeds wrote before (`SEEDED_TITLES`: "IT Support", "IT Asset Manager").
  A set an administrator renamed keeps the name typed, in that one
  language — the plugin stores a rename as plain text.
- IT support is the Asset Manager **minus approving and deleting**
  (2026-10-05): every grant seed derives `itSupportGrants()` from the
  manager's through `minusApprovalAndDeletion`, so the difference between
  the roles is the code rather than two lists kept in step. Support does the
  work — reads the costs, sees the product keys, keeps the master data and
  the people (marking a leaver included), reaches 报表 and 定时任务 and the
  application settings — and the manager decides the requests and clears
  records away. Until then the roles differed in a dozen places (cost
  fields, keys, master-data writes, people, settings, reports, and a
  `recordsICreated` scope on each delete), and every new field or page had
  to be added twice; that is how a role ends up with a grant nobody meant to
  give it. Deleting a device stays with root. The service rules that bind
  **everyone** are not role differences and are unaffected: only a repair's
  or a request's 负责人 completes or reassigns it (`requireOwner`), and only
  the named approver decides. The `itam.myAudits` Record Access policy that
  narrowed IT support to the stocktakes naming them is gone with it;
  `RETIRED_RECORD_ACCESS` in `reconcile-grants.ts` rewrites a stored grant
  that still names it to `allRecords`, in both shapes a scope is stored in
  (a Collection action's `recordAccess`, a composite operation's `scopes`),
  because a scope nobody registers resolves to nothing. The 进行中的盘点
  to-do never depended on it, being scoped by the task's 负责人 and
  `executorIds` in the workbench itself. A policy this application retires goes into that set.
  The test double mirrors the derivation (`support` in
  `tests/support/test-app.ts` is every action but `approve` and `delete`);
  it used to grant only `read`, which never matched the seeded role.
- This application issues no grants to the platform's administrator set.
  `root` is unrestricted — the authorization core permits every request from
  whoever holds it without resolving a grant — so a second "may do
  everything" would only be another copy to keep in step. The seeds create
  `itam-it-support` / `itam-asset-manager` and nothing else (the
  `itam-employee` set went on 2026-10-05), and this application's own
  settings belong to both IT roles (the settings item
  `settings:itam.settings`, read + update — a resource type of its own,
  `itam.settings` / `general`, before template beta.49); they were the Asset
  Manager's alone until IT support became the manager minus approving and
  deleting. Routes refuse it with
  `requireGrant` (`server/routes/itam/http.ts`), which calls the context's
  `require`: the plugin's `guard` middleware is gone. Deleting a device likewise stays with root.
- The initial administrator (`users.initialAdmin.username`) is also
  assigned `itam-asset-manager`, beside `root` (2026-10-23, seed
  `202610230001_assign_initial_admin_asset_manager`). That is not a second
  "may do everything": it is an explicit per-user assignment, there because
  approver and 负责人 pickers list only accounts holding an `itam.*`
  operation, which `root` holds none of, so a fresh deployment's one account
  could not be asked to approve anything. It is a seed, run once: an
  administrator who removes it keeps it removed.
