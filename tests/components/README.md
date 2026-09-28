# Application component tests

`tests/` carries this application's own tests plus the scaffold tests the
template ships. Three of the template's files were removed when merging
template beta.43:

- `tests/logic/client-shell.test.tsx`
- `tests/components/layout-i18n.test.tsx`
- `tests/components/app-layout-routes.test.tsx`

They render the template's chrome against the template's own route fixtures
(an "Orders" page, English navigation labels, a bare authorization context)
and assert on that DOM. This application replaces those routes, ships its own
chrome in `client/layouts/` — the record drawer, the assistant panel, the
ITAM navigation — and wires the authorization plugins, so the fixtures no
longer describe anything it renders. The behaviour they covered is exercised
here against this application's own components instead.

Restore them from the template package if a future upgrade makes them
meaningful again.
