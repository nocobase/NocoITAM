# Application component tests

`tests/` carries this application's own tests plus the scaffold tests the
template ships. Since template beta.83 the template's tests live in
`tests/client`, `tests/server`, `tests/database` and `tests/project`; this
application's own stay in `tests/logic` and `tests/components`, run by the
`itam` project in `vitest.config.ts`.

These template tests are not carried here:

- `tests/client/client-shell.test.tsx`, `layout-i18n.test.tsx` and
  `app-layout-routes.test.tsx`, removed when merging template beta.43.
  They render the template's chrome against the template's own route
  fixtures (an "Orders" page, English navigation labels, a bare
  authorization context) and assert on that DOM. This application replaces
  those routes, ships its own chrome in `client/layouts/` — the record
  drawer, the assistant panel, the ITAM navigation — and wires the
  authorization plugins, so the fixtures no longer describe anything it
  renders. The behaviour they covered is exercised here against this
  application's own components instead.
- The tests of pages this application removed: the template's homepage and
  inbox, the Default access page, and the permission-management tabs and
  routes (`home`, `inbox`, `default-access*`, `permission-management-*`,
  `settings-permissions`, `setup-readiness`).

Restore them from the template package if a future upgrade makes them
meaningful again.
