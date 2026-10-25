# ITAM: pages and interface conventions

Read this before changing a list, a detail page, a form, a dialog, the record drawer, master-data pages, the global search, menus or tags.

Moved from `AGENTS.md` with template 1.0.0-beta.67, which keeps that file small; each rule is as it was written, with the date it was decided.

ITAM's own pages load data with the hooks in `client/lib/itam/api.ts` rather than Refine data hooks, and a few shadcn primitives carry deliberate edits, listed under "Menus and destructive actions" below.

- A list page whose detail page is a child route renders `useOutlet()` first
  and shows the list only when no child matched; pages own their outlet.
- `client/react-providers.ts` mounts a TanStack QueryClient and the tooltip
  provider (`client/lib/itam/query-provider.tsx`); pages use the hooks in
  `client/lib/itam/api.ts` rather than Refine data hooks.
- 设置 is **one page of tabs** (2026-10-16, after NocoCRM's; it was a menu
  section of five entries, the first of them ITAM's settings with tabs of
  its own): 通用 (`/settings/itam`: 基本设置, 提醒阈值, 编号规则 and AI 助手,
  one card under another, each saved by its own button), MDM, 按送货单入库,
  用户, 角色, API 密钥, 定时任务 and 演示数据, each tab a route of its own.
  ITAM's tabs all check the page grant `itam-settings`, so no stored
  grant changed. A link written for the old `?tab=` still lands (`MOVED` in
  `itam-settings.tsx`).
- 用户 and 角色 are **NocoBase 3's prepared pages** (2026-10-24, after
  NocoCRM's; ITAM's own Users and 权限集 pages until then): `users.tsx`,
  `user-detail.tsx`, `user-form.tsx`, `roles.tsx`, `role-form.tsx`,
  `permission-management-page.tsx` and their helpers in
  `client/pages/settings/`, with `#components/permission-editor`,
  `permission-filter`, `role-list`, `long-text`, `record-link`,
  `data-table` and `ui/combobox`, as the template ships them, worded by the
  template's copy (`client/locales/system/settings-*.ts`). There is no
  Default access page. A role is a permission set: the stored keys
  (`itam-it-support`, `itam-asset-manager`) and grants are unchanged, and
  `/settings/permission-sets` redirects to `/settings/roles`. Their
  application changes, each marked `Application change (ITAM, 2026-10-24)`:
  the Users page carries ITAM's additions (below); a role opens in a drawer
  over the list, as a user does, rather than on a page covering 设置's tabs
  (`role-form.tsx`); `permission-management-page.tsx` draws no strip of its
  one Roles tab nor a link to Default access; `permission-workspace.ts`
  lists ITAM's composites and settings items (see
  [authorization](itam-authorization.md)); `page-permission-titles.ts` names
  the page grants no menu entry titles. Take a later template change to
  these files as the template has it and keep the marked changes.
- What the prepared Users page leaves out ITAM keeps, in
  `client/pages/settings/accounts/` (its own Users page's files): inviting by
  email and the pending invitations under the table (`user-extras.tsx`,
  `invite.tsx`, `invitations.tsx`, `role-checks.tsx`), and a row's Reset
  password and Delete (`user-row-extras.tsx`, `password.tsx`), each offered
  only to whoever holds the users plugin's action; a refused deletion says
  why (oneself, records still naming the person, the last administrator).
  The row's buttons are `size='xs'`, as the prepared page's own Disable and
  Revoke sessions beside them. API keys and scheduled tasks are still
  ITAM's own pages, after NocoCRM's, with their shared helpers in
  `client/pages/settings/common/` (`hooks.ts`, `shared.tsx`), worded through
  `admin.*` (`client/locales/admin/index.ts`), tagged with `ToneBadge`, using
  the settings' own `sortable-table` and `auto-load`, and with the bordered
  card `common/shared.tsx` draws on `bg-card`. Port a later CRM change the
  same way.
  Every route overlay's footer is `py-3` rather than the UI Library's `p-6`
  (an application change in `client/components/route-overlay.tsx`,
  2026-10-16): the drawers' 保存 row stood too tall.
- An asset-type tag is outlined, not filled: the contract
  `[data-slot='badge'][data-tag='kind']` in `client/styles.css` gives it a
  border and no background, which is what tells it apart from a status tag
  beside it. Two traps found writing it: a single utility class loses to the
  two-attribute selector already there, and this theme is **monochrome** —
  `--primary` / `--secondary` / `--muted` / `--accent` all carry zero chroma,
  so `bg-primary/10` is grey. Only `--info` / `--success` / `--warning` /
  `--destructive` have colour, and `--loan` (violet, 2026-10-20), a device's
  借出中, which in a lighter blue read as 库存中. A work document's kind tag (`DocumentTypeBadge`) is
  outlined in a hue of its own per kind (`data-kind`, 2026-10-17): 采购 info,
  维修 warning, 盘点 success, 报废 destructive — still outlined, so it never
  reads as a filled status tag. On the workbench, 人员变动's 离职 / 入职 tags
  are filled destructive / success.
- A value with no spaces in it — an e-mail address, a serial — needs
  `wrap-anywhere` **and** a `min-w-0` on every flex ancestor: `break-words`
  does not break it and a flex child refuses to shrink below its content
  without the one, so it spills past the card.
  `client/components/itam/collapsible-text.tsx` carries the first and
  `domain-detail.tsx` the second (`inline-flex min-w-0 … *:min-w-0`).
- `useItamMutations` invalidates the whole of `['itam']`, not its own path:
  a record is read in more places than its own list — the workbench's cards,
  the reminder counts, the reports, a reference name elsewhere — and a record
  edited in the record drawer leaves the page behind it on screen, where a
  stale number is plainly wrong. The operation dialogs always did this; only
  the plain field edits did not. Only active queries refetch.
- An optional select empties through the clear (×) beside it, the way a
  reference field does; it never offers a "none" entry among the answers.
  A required one has no clear and no empty entry.
- A list page's create dialog sends prefilled values that are **not** form
  fields straight to the endpoint (`?new=1&init.deviceId=…`, and the owner it
  seeds from the signed-in user). The endpoints are strict, so seeding a
  value a collection does not have is a 400: `domain-list.tsx` therefore
  seeds `ownerId` only when the domain declares that field — a purchase order
  lost its owner on 2026-09-25. The dialog shows a rejection it cannot pin to
  a field it renders as the general message, rather than attaching it to an
  unknown path where nobody sees it.
- A field that edits two halves at once — a money amount with its currency
  (`currencyField`), a reference that may be free text instead
  (`alternateField`), an answer with the choice it calls for (`dependent`) —
  passes and takes a pair, which the record page, the create dialog and the
  operation dialogs split back into their two keys. In the information card
  such a field is finished by hand: it shows 保存 / 取消 like a multiselect,
  because a control built from several parts is only an answer once every
  part is given, and saving on the first choice would write half of one.
- `ConfirmDialog` caps itself at `max-h-[90svh] overflow-y-auto`, the height
  `record-form-dialog.tsx` uses: a dialog that asks for more than a sentence
  (the disposal's create form) otherwise runs off a short window and hides
  its own buttons.
- Anything a person typed folds: `CollapsibleText` (200 characters or 6
  lines, tighter through `chars` / `lines`) wraps every free-text value —
  the cell renderer's `textarea` **and** default branches, a timeline
  summary, a change value, and the cancellation reason on the summary strip,
  where it also drops to the normal weight. A page that renders such a value
  itself must fold it too.
  The one exception is a long text in a record's information column
  (2026-10-14, after NocoCRM): `InlineField` renders every `textarea` field
  through `LongTextField` (`client/components/itam/long-text-field.tsx`) —
  three lines that fade out while there is more, a click opening the whole
  in a pop-up beside the column, a double-click there editing it. Closing
  the pop-up saves, Escape leaves it as it was, Cmd/Ctrl+Enter saves at
  once, and an empty one opens straight into the editor. The column never
  unfolds, and editing has room.
- 负责人 (`ownerId`) is the **first row of 基本信息** on every detail page
  of a record that has one (2026-10-05): `domain-detail.tsx` places it
  there whatever group its field names (`OWNER_FIRST`), and the device page
  does the same — below its 状态, its disposal and who holds it (分配给 /
  借给 / 预留给), which lead 基本信息 there: the device page has no
  summary strip (2026-10-16). A stock item does the same through the
  domain's `BasicLead` slot (`StockLead` in `stock-domain.tsx`): 在库, 在外
  (累计消耗 for a consumable) and, for what comes back, 持有人 with how many
  each, above 负责人; the 数量 group keeps 累计入库 and the minimum. An
  entitlement too (`EntitlementLead` in `entitlement-domain.tsx`): 合规状态,
  总席位, 已分配, 可分配 and 持有人 — the first five, then 等 N 个 — so it
  has no 席位 group. It used to sit at the foot of 系统 with the stamps nobody
  edits, and went unseen; for a day it was in the summary strip, which was
  given back to where the record stands. It is edited in place like any
  row, so the handover rule and the read-only cases are unchanged. Neither the purchase order nor the disposal has a
  申请信息 group any more: 部门 and 需求日期, and 申请日期, sit under
  基本信息.
- A record opens on its first tab **at its own address** (2026-10-23), not
  by redirecting to `…/history`: `landingRoute()` in `client/routes.ts`
  registers that tab (History, or the domain's `defaultTab`: a person's
  holdings, a stocktake's items) under `LANDING_PATH`, which
  `renderRouteTree` and the record drawer render as the detail route's index
  (`client/routing/landing.ts`; the registry has no index routes and refuses
  a child at its parent's path). `DetailPage`'s `landing` tab links to the
  record itself and stays marked under an old link naming it. A new
  `defaultTab` needs its `landing` in `routes.ts` too.
- A record has one timeline, not a history tab beside a change-log tab: the
  events and the field changes of the same operation are one line, folded
  together by the `operationId` both writers stamp
  (`operationContextOf` in `server/routes/itam/http.ts`, merged by
  `historyService.timeline()`). A service that writes history without an
  operation context still works — its rows stand alone. A key is stored as an
  event because a masked value cannot be compared, but it reads with the
  field changes: `FIELD_LIKE_EVENTS` in `history.ts` is what the filter goes
  by, so the split the reader sees follows what a line means, not which table
  it came from. A subject type may also _derive_ timeline lines from its own
  records — stock does, from its movements (`stockMovementEvents`, registered
  where the history service is built) — so the story is whole without a
  second copy of the facts that could drift from the first.
- A master-data tree node opens in the record drawer rather than navigating
  (`MasterDataTree`, 2026-09-28): the tree is the map, and reading one node
  should not lose the reader's place in it. A flat list row still navigates.
  The **categories, locations and departments** pages go further
  (2026-10-06, every master-data tree): two panes, each
  scrolling on its own (`treeFills` on the domain makes the page fill the
  window, as a board does). The tree is a narrow column of names only —
  `MasterDataTree`'s `compact` drops the kind tag and the count, except a
  department's people as a muted figure, its sub-departments' included
  (2026-10-21) — and a row's one action is a delete icon
  (`DomainTreeProps.onDelete`, through the list's own confirmation), since
  editing is the pane's; it shows on hover, on the open row and on a touch
  screen (2026-10-21). The clicked
  node's own detail page — its tabs included — sits beside it through
  `RecordPane` (`TreePanes` in `master-domain-parts.tsx`), named in
  the address as `?selected=` (a list parameter, not a filter: `RESERVED`
  in `domain-list.tsx`), followed when the pane moves to its parent and
  cleared when it is deleted or left; with nothing chosen the first root
  node opens (2026-10-21). The pane leaves out the breadcrumb (`HideBreadcrumbContext`),
  which the tree beside it already states; the drawer keeps it. On the
  categories page the left column is grouped by asset type (设备, 配件, 耗材, 组件, 授权, each under
  its tag, an empty one saying so): a top-level category chooses its type
  and its subtree inherits it, so each tree falls in one group, and a drag
  stays inside its group. The service orders all top-level categories
  together, so a group's drop position is translated to the whole order
  (`groupedMove` in `client/lib/itam/tree-move.ts`). No tree draws a drag
  handle any more — the whole row drags — and every level indents along a
  guide line that drops from its parent's arrow, every row keeping the
  arrow's room so siblings line up (2026-10-06).
- **A tree node takes in its descendants** (2026-10-21, one rule for
  categories, locations and departments): every tab that lists records
  under it — a category's 型号 and 软件产品, a location's 设备, 库存 and 人员,
  a department's 设备 and 人员 — and the counts on those tabs include its
  sub-nodes' (`useSubtree` on the client, `subtreeIds` in `stats`), each
  row naming its own node (the leaf, not the path), on a leaf node too.
  Only 子级 stays the direct children. Reports and stocktakes already scoped
  a node this way. People list those on the books by status, then employee
  number (a list's `sort` takes several comma-separated fields), and those
  who left in a section below (`PeopleUnderTab`). List-page filters on a
  tree field (the device list's 位置) still match the node alone.
- Base UI drops a **nested** dialog's backdrop, reasoning that the dialog it
  is nested in already dims the page. The record drawer is such a parent and
  its backdrop sits _behind_ the drawer panel, so a dialog opened inside the
  drawer had nothing between it and what it covers. `DialogOverlay` passes
  `forceRender` to keep it.
- A link to a related record — on a list or a detail page — opens in the
  record drawer (`client/components/itam/record-drawer.tsx`, mounted once
  by `client/layouts/app-layout.tsx` around the outlet): render it with
  `RecordLink` and open related rows with `useOpenRecord()` from
  `client/lib/itam/record-drawer.ts` rather than `Link` / `navigate`. A
  list row's click still navigates to its own record; `RecordLink` stops
  the click so the row does not follow. Modified clicks and links with
  `drawer={false}` (breadcrumbs) navigate normally. The drawer shows the
  record's own detail page — header, actions, information card and tabs —
  at most 680px wide, with the drawer's own 返回 / 打开完整页面 / close
  buttons in a short row above the page so they never cover its actions —
  the page's line above its title (人员, 分类 › 外设) at that row's left
  since 2026-10-22, portalled there through `DrawerHeaderSlotContext`
  (the page's own ← before its breadcrumb, which steps back through the
  browser history, shows only on a full page — `EmbeddedRecordContext`
  keeps it out of the drawer and the tree panes, and record tabs `replace`
  so it leaves the record rather than the tab, 2026-10-16): `client/lib/itam/record-pages.ts` finds the detail
  route and its tabs in `appRouteDefinitions` (`client/routes.ts`), and the
  drawer mounts them in a memory router of its own (the outer router's
  contexts are cleared for that subtree), so switching tabs there leaves
  the page behind alone and any path outside the record closes the drawer
  and moves the page. `DetailPage` lays out by its own width (container
  queries: `@container`, `@2xl:` / `@4xl:`), not the window's, so the same
  page reads as a narrow screen in the drawer; keep new detail-page
  breakpoints on the container. `client/lib/itam/record-view.ts` only says which
  links are records, so a new collection with a detail page needs an entry
  there and nothing else.
- The master-data collections have no pages of their own (2026-09-28): they
  render through `DomainListPage` / `DomainDetailPage` like every other
  collection, with `masterDomain(name)`
  (`client/pages/itam/master/master-domain.tsx`) building each one's
  `DomainConfig` from `client/lib/itam/master-data.ts`. What only reference
  data does is in `master-domain-parts.tsx` and reaches the pages through
  optional slots — `Tree`, `listColumns` (cell components, so every row
  shares one query), `titlePrefixField` / `nameSort`, `image`, `plainCells`,
  `exportColumns: 'readable'`, `ownerFromCreator`, `extendedFields`,
  `relatedRecord` (a model's tabs follow its category), `tabCounts` with
  `DomainTab.countOf` (one `/stats` request counts every tab) and
  `BreadcrumbTrail`. A default tab with a `visible` condition makes the
  detail page wait for the record before landing. The master detail tabs
  are still the route children `master()` declares in `client/routes.ts`,
  and their history tab is `client/pages/itam/record-history-tab.tsx`,
  which reads the collection from the route's first segment.
- One search over every list (2026-10-05, after InvGate's), opened from
  the search button beside the logo in the sidebar's header, as NocoCRM has
  it (2026-10-14; it was a 搜索 entry under 待办): `SearchHeaderButton` in
  `client/components/itam/global-search.tsx`, passed by
  `client/layouts/app-layout.tsx` as `AppSidebar`'s `action` because it
  opens a dialog rather than a page. The collapsed sidebar has no room
  beside its mark, so there `SearchNavButton` stands in as a menu entry
  under 待办 (`NavigationMenu`'s `after`); it renders nothing otherwise. Its
  state lives in
  `GlobalSearchProvider` around the whole shell, not in the dialog
  (`GlobalSearchDialog`, mounted inside the record drawer's provider so a
  result opens in the drawer), so it keeps what was typed while closed. As it is typed it asks `GET /itam/workbench/search`, which
  reads each group in `SEARCH_GROUPS` (`server/routes/itam/workbench.ts`;
  the client's `SEARCH_PAGES` in `client/lib/itam/search.ts` keys the same
  groups to their pages) under the caller's own `read` through
  `maybeDecide`, skipping what they may not read, and answers the first
  five of each with the total; no model takes part. A group's last row
  opens its list searched for the same words. The 问 AI side of the box's
  segmented 搜索 | 问 AI switch (the pages' own tabs) answers in the dialog
  again (2026-10-16, as NocoCRM does; `SearchAnswer` in
  `client/components/itam/ai/search-answer.tsx`): the question goes to Asset Steward
  on a conversation of the source `itam-search`, which the conversation
  lists leave out (`history-list.tsx`), and the reply replaces the results.
  返回搜索 and closing the dialog delete it (stopping a reply still being
  written); 继续追问 keeps it as one of ITAM's conversations, titled by the
  question, and opens it in the panel. One left behind is swept by the daily
  job after an hour (`server/providers/itam-agents/search-answers.ts`,
  which writes the plugin's rows itself: it can neither delete a
  conversation nor change its source). From template 1.0.0-beta.64 until
  then, 问 AI handed the question to the panel and closed the dialog. Keyword search also matches
  through references (`searchByReference` in `collections.ts`: a device or
  stock item by its model's name, an entitlement by its product's), because
  a device is named by its asset tag while people type "MacBook" — which
  also fixed the lists' own search boxes. Every list search goes **word by
  word** (2026-10-06, `searchWords` in `collection-query.ts`): the search is
  split on spaces and the punctuation inside names, and each word must
  appear in one of the search fields or a referenced name, in any order, so
  "MacBook Pro 14" finds "MacBook Pro 14 (M3)" and "M3 MacBook" does too;
  "MacBook Pro 14 M4" still finds nothing when only the M3 is on the books.
  One string matched whole failed on any bracket or change of order. A list reads the found
  ids from `?ids=` with `?found=` naming them: it shows them as a table,
  under `FoundRecords`, whose 显示全部 clears both, and exports them alone.
  A new list page reads `foundIds()` the same way.
- The application's sidebar does not fold (2026-10-04): a group without a
  page of its own reads as a small heading with its pages always listed
  under it — `groupsAsHeadings` on `NavigationTree`, which only
  `client/layouts/app-layout.tsx` turns on, so the settings and dev menus
  keep folding. In the icon-only sidebar the heading gives way to a thin
  rule. Since nothing marks where an unfolded group ends, every page sits
  either above the groups (待办) or
  inside one (资产, 业务, 主数据); an ungrouped entry placed after
  a group reads as part of it. 业务 holds 采购, 维修, 报废, 盘点 and 报表 (盘点 below 报废 since
  2026-10-06).
  Route names are what stored page grants reference, so regrouping changes
  no grant — `tests/logic/client-routes.test.ts` pins only their order.

## Page width, not window width

`Page` (`client/components/itam/page-header.tsx`) is a size container and
`PageHeader` wraps by its own room: the assistant panel narrows the page
while the window stays wide, so a page's own splits use container
breakpoints (`@3xl:grid-cols-2`), not viewport ones (`lg:`). The workbench
and reports do; `DetailPage` already had its own container.

## Table cells stay on one line

A shadcn `TableCell` never wraps (`whitespace-nowrap`), so one long value —
a reason, a name, a document's file name — widens its whole table and
pushes the last columns, usually the buttons, out of view (2026-10-15).
Every cell that holds free text goes in `CellText`
(`client/components/itam/cell-text.tsx`): one line, cut short with an
ellipsis past 20rem or the `max-w-*` it is given, shown whole on hover
only when cut, and nothing inside it wraps either. `DataTable` and
`ReportTable` wrap every cell; a table of its own (MDM 核对, a purchase
order's lines and devices, 单据识别 runs, field templates) wraps its text
cells. Give a short column a smaller bound (`max-w-48` for a person,
`max-w-56` for a model or a place) and leave dates, numbers, tags and
buttons alone; a row's buttons sit on one line (`flex`, not `flex-wrap`).
An import's error messages are the exception — they wrap, since they must
be read whole. ITAM's own settings pages (API keys, scheduled tasks,
invitations) have their own `TruncatedText` with the bound on the cell; the
prepared Users and Roles pages bound their text with the template's
`LongText` and `DataTable`.

## A label's qualifier

A Chinese label that carries a unit or a qualifier writes it after a space in
half-width brackets — 更换周期 (月), 授权 (订阅), 附件 (可选), 全部执行 (3) —
not in full-width ones (2026-10-16). A sentence keeps full-width brackets
around an aside, as Chinese prose does.

## Menus and destructive actions

`DropdownMenuContent` sizes to its content and never goes below the trigger
width or 120px (7.5rem since 2026-10-17; it was 8rem); the registry default bound it to `--anchor-width`, which made
every menu anchored to an icon button one button wide and wrapped each label.
Items stay on one line. Keep that when the primitive is upgraded from the
registry.

A picked tab reads in the brand colour, text and line (2026-10-22): the
`line` variant of `TabsTrigger` carries it (an application change to the
primitive — keep it on a registry upgrade), and so do the hand-drawn tab
bars (`detail-page.tsx`, `link-tabs.tsx`, settings' `shared.tsx`, the
inbox's `inbox-list.tsx`) with `border-primary text-primary`. The
others read in the text's colour, brand-coloured on hover.

`RadioGroupItem` dims itself through `data-disabled:` as well as `disabled:`.
The registry default styles only the CSS `:disabled` pseudo-class, which a
`<span role="radio">` never matches, so a disabled radio refused clicks while
looking perfectly available. Keep both variants on a registry upgrade.

A detail page's own actions sit in the header; a destructive one goes in the
"more" menu beside them — the device page does this directly, and a domain
page asks for it with `deleteInMenu` on its `domain.ts` entry (stock does).
A page whose only action is deletion keeps the plain button: hiding a lone
action behind a menu costs a click and finds nothing else. A list row's
"···" menu holds 删除 alone (2026-10-06): the row's 编辑 dialog went, since
opening the row lands on its page where every field edits in place. The
master-data trees end their rows in a delete icon instead.

## Shared tag appearance

All application tags use `Badge` from `client/components/ui/badge.tsx`;
status and urgency components compose it rather than styling separate spans.
`client/styles.css` defines the shared `[data-slot='badge']` contract: medium
radius, xs text, medium weight, px-2 / py-0.5 padding and no border. Neutral
outline variants use a muted fill. Background/text colors still convey status.
The slot rule also covers plugin-owned Badge copies without editing Registry
sources. Do not override tag typography, radius or padding in individual pages.
Step numbers, timeline dots and avatars are not tags.

## The theme's colour

ITAM follows NocoBase's blue (2026-10-14): links (`--link`, which is
`var(--primary)`) and every AI entry — the shortcuts, AI 整理's tabs,
buttons and markers, the plan cards — are in `primary` on the `accent`
ground; the header's ✨ button is the theme button's frame with the sparkle
in `primary` (2026-10-16, after NocoCRM's). They were green until then. Green stays only
where it means a state is fine, as the `success` tokens: a counted item that
matches the books (一致), an active account, and the template's own status
dots.

The brand is emerald since 2026-10-21 (`--primary` #047857, #6ee7b7 dark),
and `--accent` — a highlighted option in a select or menu, a chosen row — is
neutral grey (`var(--muted)`), the same as the reference pickers' highlight:
tinted in the brand it read as selected, and a green asset-type tag vanished
into it.

## Detail tabs and dates, after NocoCRM

A detail page's tabs are drawn as NocoCRM's record pages draw theirs
(2026-10-14, `DetailPage` in `client/components/itam/detail-page.tsx`):
underlined on a thin rule, the open tab in the foreground over a 2px line of
it, the others muted until hovered, each led by its icon and followed by its
count in plain muted figures rather than a tag. The icon comes from
`TAB_ICONS` (`client/lib/itam/tab-icons.ts`) by the tab's key, which every
page shares (`history`, `attachments`, `devices` …), so a domain names none;
a tab listing another collection wears that collection's menu icon. A new tab
key needs its entry there, or the tab draws without one; `DetailTab.icon`
overrides it for a single page.

A date is picked from a calendar, never a native date input (2026-10-14, as
NocoCRM edits one): `FieldInput`'s `date` case is `DatePicker`
(`client/components/date-picker.tsx`, the shadcn `calendar` in a `Popover`),
so forms and in-place editing share it. In place it opens with the calendar
showing and saves on the pick, as a select saves on its choice; closing
without one puts the value back. An optional date offers 清除日期 under the
calendar, a required one does not. The value stays `yyyy-mm-dd`, made from
the local day, never through `toISOString()`.

## History first, with comments, after NocoCRM's 动态

Every record's **历史** is its first tab and the one it opens on
(2026-10-14), as NocoCRM's 动态 is — except a stocktake, which opens on its
items, and a person, who opens on 归属: those are where they are worked on.
`domain-detail.tsx` puts history first; a domain's `defaultTab` names only
those exceptions.

The tab reads as 动态 does (`HistoryTimeline`): a comment box atop, then one
list, newest first, each line on a rail of icons (`HistoryIcon`,
`client/lib/itam/history-icons.ts`, by event type; the pencil for field
changes alone) and read as a sentence — who in bold, what they did, what
changed — with how long ago on the right (`relativeTime` in `format.ts`) and
the full time on hover. A new event type wants its icon there.

**Comments** are what people write on a record (`server/providers/itam/
comments.ts`, `POST / PATCH / DELETE /api/itam/comments`). A comment is a
history event of type `comment` on the record, so the timeline reads it in
place; a reply is one whose payload names its comment (`replyToId`, always
the thread's first), which `historyService.timeline()` hangs under it
(`TimelineItem.replies`) rather than listing. It is the one event that
changes after it is written: its author alone edits it (`editedAt`) or
deletes it, which keeps the line so a thread keeps its start and drops the
text and files. Whoever may read the record may comment and reply — the
route checks `read` on the record itself, under its scope — on the records
`COMMENT_SUBJECTS` lists, which are the ones with a history tab of their
own. `@` and a name mentions an IT account (`/itam/users`, through
`MentionTextarea`, ported from NocoCRM); the mentioned, and on a reply
whoever already wrote in the thread, are told in-app, with a link that
opens the history at the comment (`?focus=`). Files are uploaded to
`itamAttachments` first and attached by id only within the hour and while
linked to nothing — an id alone does not hand somebody else's file over —
and the comment keeps their names; they are not the record's attachments.

- Files read one way everywhere (2026-10-16, after NocoCRM's
  comment-files.tsx): `FileRows` in `client/components/itam/file-cards.tsx`
  — a row per file with its kind's tinted tile, name, size, who and when,
  download and remove — on a record's 附件 tab and under a comment, and
  `FileChips` for files a comment is about to be posted with. Files are
  added through `FileDropZone` (one dashed line, lit while files are over
  it), which uploads each on its own and refuses one over
  `MAX_UPLOAD_BYTES` (20 MB, the `itamAttachments` exposure's limit) before
  sending it, in words (`uploadFailure`). The 附件 tab lists the files the
  record's comments carry as a group of their own (`source: 'comments'`
  from the attachment service), which it does not remove; a comment's
  author takes one off on the comment itself (`keepFileIds` on its edit).
- A text button (`variant='ghost'` with words) in a row beside a link, an
  outlined or filled button, or another text button takes back its padding
  with a negative margin (`-mx-2.5` at the default size; one side only
  where only one neighbour matters), so every word on the row sits the
  same flex gap from the next (2026-10-22, the onboarding card's
  预留 · 更换 · 不需要, the plans' 暂不处理, 沿用上级部门的配置). Without it
  the gap beside a text button reads a padding wider than the others.
- A text link underlines on hover, across the application (2026-10-23): no
  ground, no other colour. `RecordLink` does it by default; the green
  `text-link` links get it from `client/styles.css`; any other text link says
  `underline-offset-4 hover:underline`. So do the buttons that read as
  words: the AI shortcuts (`AiShortcut`), 创建采购单, and the text buttons
  among others — 预留, 更换, 不需要, 暂不处理 — which add `TEXT_BUTTON`
  (`client/lib/itam/text-button.ts`) to the ghost button. Buttons with a
  frame or a fill, cards, tabs and menu items keep their own hover.
- Every list page filters beside its search box (2026-10-23): a domain's
  `filterFields`, in column order — the device list adds 型号 as the stock
  lists have it, and 采购, 维修, 报废 and 盘点 filter by their selects,
  status first among them (a status chosen on a board narrows it to that
  column; repairs have no board, so this is how to see the ones still out).
  A master-data list derives its filters from its fields
  (`filterableFields`); `filterable: false` keeps one out — a person's
  linked account (only IT signs in) and a category's asset type (the tree
  is grouped by it). A reference filter lists only the records that list
  holds: device models and categories on devices, the kind's on stock.
- A detail page's information groups may open on rows of their own
  (`DomainConfig.groupLeads`, keyed by group heading, beside `BasicLead`
  for 基本信息, 2026-10-23). A stocktake's 盘点进度 and 待处理 open 进度,
  above when the count started and finished, through `SummaryLead`'s
  `only`.

- **Demo write feedback (2026-10-25)** uses only the plugin's global Toast.
  Identify `DEMO_READ_ONLY` with `isDemoReadOnlyError`, including errors wrapped
  in `cause`; never match displayed text or suppress every error in Demo Mode.
  Automatic edits restore the saved value; submitted forms retain their drafts.
  Keep ordinary validation/failure messages and never treat refusal as success.
  `apiErrorBody` accepts the standard `{ error }` envelope and legacy flat bodies;
  prefer the server's localized message for ordinary inline errors.
