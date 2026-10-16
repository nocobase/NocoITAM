# ITAM conventions

The framework guidance now arrives as a package-owned Skill: read
`.agents/skills/nocobase-app-development/` (run `pnpm nocobase skills sync` if that
directory is missing). This file keeps what belongs to this application —
the additions that used to live in the committed `skills/` copy the template
stopped shipping in beta.43.

## From `SKILL.md`

ITAM tags compose the shared `Badge`. The application-wide slot rules in
`client/styles.css` also style plugin-owned Badge copies, keeping their geometry
consistent without editing Registry sources. See the components reference.
Detail headers combine breadcrumbs and auxiliary record information into one
wrapping line above the title; do not add a second subtitle below it.

## This application: ITAM

The ITAM feature code and the rules learned while building it are described in
the other `itam-*.md` files beside this one, indexed in `AGENTS.md`, and
`docs/IMPLEMENTATION_PLAN.md`. New
ITAM domains follow the P0 pattern: a service under `server/providers/itam/`
registered in `server/providers/itam/index.ts`, a route under
`server/routes/itam/` using `http.ts`, field metadata under `client/lib/itam/`,
and pages composed from `client/components/itam/`.

### The shell and the assistant (template 1.0.0-beta.64)

The layout is the template's shadcn sidebar (`AppSidebar`, `NavigationMenu`)
with two application changes: a menu group reads as a heading with its pages
always listed (`sections` on `NavigationMenu`), and the search button sits
beside the logo (`AppSidebar`'s `action`), falling back to an entry under
待办 (`after`) when the sidebar is collapsed. 设置 is one menu entry opening one page of tabs (2026-10-16, after
NocoCRM's; `client/pages/settings/index.tsx`): ITAM's own settings (通用,
MDM, 按送货单入库 and, last, 演示数据, in `client/pages/itam/settings/`) and
the administration pages in `client/pages/settings/` (users, permission
sets, API keys, scheduled tasks), each tab its own child route at
`/settings/<tab>` checking its own grant and shown only to whoever it lets in,
built on the plugins' client APIs and worded through `admin.*`
(`client/locales/admin.ts`). AI is a section too, holding the Agents
plugin's own pages; its model services page is at `/ai-models`, since
`/models` is the asset models page.

The assistant is the Agents plugin's chat (`client/layouts/agent-chat.tsx`,
the UI Library's `agent-chat` block in `client/extensions/nocobase-agent-chat/`).
A page that shows a record pins it with `useAiPageContext` and asks through
`useItamAi` (`client/lib/itam/ai-chat.tsx`); a form filled from material asks
`useAiReading` (`POST /itam/ai/read`). The assistant reads through the `itam`
commands and changes things only as a plan the person confirms on its card
(`client/components/itam/ai/plan-card.tsx`); see [the assistant](itam-assistant.md). Pages register
no frontend tools: the chat has none.

## From `references/frontend/references/styling.md` (was `components-and-styling.md`)

### Shared tag appearance

All application tags use `Badge` from `client/components/ui/badge.tsx`;
status and urgency components compose it rather than styling separate spans.
`client/styles.css` defines the shared `[data-slot='badge']` contract: medium
radius, xs text, medium weight, px-2 / py-0.5 padding and no border. Neutral
outline variants use a muted fill. Background/text colors still convey status.
The slot rule also covers plugin-owned Badge copies without editing Registry
sources. Do not override tag typography, radius or padding in individual pages.
Step numbers, timeline dots and avatars are not tags.

### Detail information columns

All ITAM detail pages use the narrow layout and one `InfoCard` containing
`InfoSection` groups. Group headings share a bottom divider; label/value rows
use `InfoRow`. Use the same components for master data and business records;
do not give each group a separate card.

### One pair of list / detail pages

Every collection with a list and a detail page renders through
`DomainListPage` / `DomainDetailPage` (`client/pages/itam/domain-*.tsx`),
driven by a `DomainConfig` (`client/lib/itam/domain.ts`). Master data is no
exception since 2026-09-28: `masterDomain(name)` in
`client/pages/itam/master/master-domain.tsx` builds the config from
`client/lib/itam/master-data.ts`, and its reference-data pieces (tree, count
columns, a model's category kind, person actions, child creation, field
template, ancestor breadcrumb) live in `master-domain-parts.tsx`. A new need
is an optional `DomainConfig` slot that other collections leave unset, not a
page of its own.

## From `references/frontend/references/theme.md` (was `theme-tokens.md`)

| Tokens                                              | Meaning / consumers                                                  |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `--background`, `--foreground`                      | Page surface and default text                                        |
| `--card`, `--card-foreground`                       | Cards and panels                                                     |
| `--popover`, `--popover-foreground`                 | Floating menus and popovers                                          |
| `--primary`, `--primary-foreground`                 | Primary actions                                                      |
| `--secondary`, `--secondary-foreground`             | Secondary actions                                                    |
| `--muted`, `--muted-foreground`                     | Subtle surfaces and supporting text                                  |
| `--accent`, `--accent-foreground`                   | Interactive highlighted surfaces                                     |
| `--destructive`                                     | Destructive actions and errors                                       |
| `--destructive-foreground`                          | Text on a solid destructive background (the lost badge)              |
| `--link`                                            | Inline text links (`text-link`): record names, tree paths, 展开/收起 |
| `--warning` / `--warning-foreground`                | A caution notice or badge (`bg-warning text-warning-foreground`)     |
| `--info` / `--info-foreground`                      | A calm classifying badge (`bg-info text-info-foreground`), e.g. 永久 |
| `--border`, `--input`, `--ring`                     | General borders, input borders/surfaces, focus indicators            |
| `--chart-1` through `--chart-5`                     | Five chart series colors                                             |
| `--sidebar`, `--sidebar-foreground`                 | Navigation surface and text                                          |
| `--sidebar-primary`, `--sidebar-primary-foreground` | Selected navigation surface and text                                 |
| `--sidebar-accent`, `--sidebar-accent-foreground`   | Navigation hover surfaces and text                                   |
| `--sidebar-border`, `--sidebar-ring`                | Navigation dividers and focus indicators                             |
