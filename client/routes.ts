import {
  defineAppRoutes,
  type AppClientRouteComponentLoader,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
  type AppClientRouteIcon,
} from '@nocobase/app-client/plugins';
import {
  agentsRoute,
  modelsRoute,
  skillsRoute,
  usageRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import {
  AppWindow,
  BookOpen,
  Bot,
  Gauge,
  Settings2,
  BarChart3,
  Briefcase,
  Building2,
  ClipboardCheck,
  Cpu,
  Database,
  FolderTree,
  Factory,
  Inbox,
  KeyRound,
  LayoutDashboard,
  Laptop,
  Map,
  MapPin,
  MonitorSmartphone,
  Mouse,
  Package,
  Printer,
  Recycle,
  ScrollText,
  ShoppingCart,
  Store,
  Users,
  Workflow,
  Wrench,
} from 'lucide-react';

import { LANDING_PATH } from './routing/landing.js';

/**
 * ITAM navigation, following the specification's 导航 section. Detail pages
 * are children of their list page so they inherit its access check; their
 * tabs are child routes of the detail page.
 */
const comingSoon = () => import('./pages/itam/coming-soon-page.js');

/**
 * One of the Agents plugin's pages drawn in ITAM's look
 * (components/itam/plugin-page.tsx, 2026-10-16, after NocoCRM's): its
 * component loaded as the plugin declares it and wrapped, the route
 * otherwise the plugin's own.
 */
const itamStyled = <
  Route extends { componentLoader: AppClientRouteComponentLoader },
>(
  route: Route,
): Route => ({
  ...route,
  componentLoader: async () => {
    const [{ default: Page }, { withItamStyle }] = await Promise.all([
      route.componentLoader(),
      import('./components/itam/plugin-page.js'),
    ]);
    return { default: withItamStyle(Page) };
  },
});

const deviceTabLoaders: Readonly<
  Record<string, AppClientRouteComponentLoader>
> = {
  history: () => import('./pages/itam/devices/tab-history.js'),
  related: () => import('./pages/itam/devices/tab-related.js'),
  documents: () => import('./pages/itam/devices/tab-documents.js'),
  attachments: () => import('./pages/itam/devices/tab-attachments.js'),
};
const deviceTab = (tab: string): AppClientRouteComponentLoader =>
  deviceTabLoaders[tab] ?? comingSoon;

interface MasterRoute {
  readonly file: string;
  readonly title: string;
  readonly icon: AppClientRouteIcon;
  readonly list: AppClientRouteComponentLoader;
  readonly detail: AppClientRouteComponentLoader;
  /** Extra detail tabs (child routes) before History. */
  readonly tabs?: readonly {
    readonly path: string;
    readonly loader: AppClientRouteComponentLoader;
  }[];
  /** The tab the record opens on, when not History (its `defaultTab`). */
  readonly landing?: string;
}

const historyTab: AppClientRouteComponentLoader = () =>
  import('./pages/itam/record-history-tab.js');

/**
 * The tab a record opens on, at the record's own address (2026-10-23), so
 * opening a record no longer redirects to `…/history`; the tab keeps its own
 * path too, for links that name it. The route registry takes no index
 * routes and refuses a child at its parent's path, so this one is
 * registered under `LANDING_PATH` and `renderRouteTree` renders it as the
 * index route.
 */
const landingRoute = (
  name: string,
  loader: AppClientRouteComponentLoader | undefined,
): readonly AppClientRouteDefinition[] =>
  loader
    ? [{ name: `${name}-landing`, path: LANDING_PATH, componentLoader: loader }]
    : [];

// Explicit loaders keep every page its own lazy chunk; a templated import
// would bundle the whole directory together.
const master = ({
  file,
  title,
  icon,
  list,
  detail,
  tabs = [],
  landing,
}: MasterRoute): AppClientRouteDefinition => ({
  name: file,
  path: `/${file}`,
  auth: 'required',
  navigation: { title, icon },
  componentLoader: list,
  children: [
    {
      name: `${file}-detail`,
      path: ':id',
      componentLoader: detail,
      children: [
        ...landingRoute(
          file,
          landing
            ? tabs.find((tab) => tab.path === landing)?.loader
            : historyTab,
        ),
        ...tabs.map((tab) => ({
          name: `${file}-${tab.path}`,
          path: tab.path,
          componentLoader: tab.loader,
        })),
        {
          name: `${file}-history`,
          path: 'history',
          componentLoader: historyTab,
        },
      ],
    },
  ],
});

interface DomainRouteLoaders {
  readonly list: AppClientRouteComponentLoader;
  readonly detail: AppClientRouteComponentLoader;
  readonly tabs: Readonly<Record<string, AppClientRouteComponentLoader>>;
  /** The tab the record opens on, when not History. */
  readonly landing?: string;
}

/** A business collection: list page, detail page as child, tabs as grandchildren. */
const domainRoute = (
  name: string,
  title: string,
  icon: AppClientRouteIcon,
  loaders: DomainRouteLoaders,
): AppClientRouteDefinition => ({
  name,
  path: `/${name}`,
  auth: 'required',
  navigation: { title, icon },
  componentLoader: loaders.list,
  children: [
    {
      name: `${name}-detail`,
      path: ':id',
      componentLoader: loaders.detail,
      children: [
        ...landingRoute(name, loaders.tabs[loaders.landing ?? 'history']),
        ...Object.entries(loaders.tabs).map(([tab, loader]) => ({
          name: `${name}-${tab}`,
          path: tab,
          componentLoader: loader,
        })),
      ],
    },
  ],
});

/**
 * Page authorization arrived with template beta.43: an App page with no rule
 * of its own checks a page grant named after its route. Every page this
 * application puts in a menu takes that rule, because which pages a role
 * reaches is part of what the role *is*: IT support has no 报表, so signing
 * in as IT support shows no entry for it rather than a page of refusals
 * (2026-09-27; the permission sets have carried these grants since they
 * were written, and until then nothing checked them).
 *
 * What is not a menu entry is skipped: a detail page and its tabs are
 * reached through the list that already checked, the sign-in pages are
 * public, and the record drawer mounts a detail page of its own. Endpoints
 * keep enforcing their own authorization either way — a page grant decides
 * what is offered, never what is allowed. A page with a rule of its own
 * keeps it, as the ITAM settings page does.
 */
const withPageGrants = (
  routes: readonly AppClientRouteDefinition[],
): AppClientRouteDefinition[] =>
  routes.map((route) => ({
    ...route,
    ...(route.componentLoader && route.authz === undefined
      ? {
          authz: route.navigation
            ? ({
                resource: { type: 'page', id: route.name },
                action: 'access',
              } as const)
            : ('skip' as const),
        }
      : {}),
    ...(route.children ? { children: withPageGrants(route.children) } : {}),
  }));

/**
 * The application's page routes, also read by the record drawer, which
 * mounts a record's own detail page (and its tabs) inside the drawer.
 */
export const appRouteDefinitions: readonly AppClientRouteDefinition[] =
  withPageGrants([
    {
      auth: 'guest',
      componentLoader: () => import('./pages/auth/login.js'),
      name: 'login',
      path: '/login',
    },
    {
      auth: 'guest',
      componentLoader: () => import('./pages/auth/register.js'),
      name: 'register',
      path: '/register',
    },
    {
      auth: 'guest',
      componentLoader: () => import('./pages/auth/forgot-password.js'),
      name: 'forgot-password',
      path: '/forgot-password',
    },
    {
      auth: 'guest',
      componentLoader: () => import('./pages/auth/reset-password.js'),
      name: 'reset-password',
      path: '/reset-password',
    },
    {
      // Where a command line's sign-in sends the person to approve it
      // (`pages/auth/device.tsx`). Optional rather than required so it
      // renders outside the shell, like the sign-in pages; the page sends a
      // guest to sign in and back.
      auth: 'optional',
      authz: 'skip',
      componentLoader: () => import('./pages/auth/device.js'),
      name: 'device',
      path: '/device',
    },
    {
      name: 'workbench',
      path: '/',
      auth: 'required',
      navigation: { title: 'navigation.workbench', icon: LayoutDashboard },
      componentLoader: () => import('./pages/itam/workbench.js'),
    },
    // 收件箱 (2026-10-16, plan "Work agents"):
    // under 待办 in the menu (2026-10-17; it was first), its count the runs
    // waiting on the reader. Everyone
    // has one and it shows only the reader's own, so it checks no page
    // grant; `/notifications`, where the bell led, opens its 通知 tab.
    {
      name: 'inbox',
      path: '/inbox',
      auth: 'required',
      authz: 'skip',
      navigation: { title: 'navigation.inbox', icon: Inbox },
      componentLoader: () => import('./pages/itam/inbox.js'),
    },
    // 通知 has no menu entry: it opens from the bell in the header
    // (2026-10-05), and 待办 is the workbench's board rather than a page of
    // its own. Without `navigation` the page checks no page grant
    // (`withPageGrants`), like a detail page.
    // MDM 核对 (device sync, 2026-10-15): opened from 待办's 设备核对 and
    // 需要关注 and from 设置 → 设备同步, so no menu entry and no page grant;
    // its endpoint answers whoever may read devices.
    {
      name: 'device-sync',
      path: '/device-sync',
      auth: 'required',
      componentLoader: () => import('./pages/itam/device-sync.js'),
    },
    // A conversation with the assistant as a page (the chat panel's "open
    // as a page"); no menu entry, so no page grant: the Agents plugin
    // answers each person for their own conversations only.
    // The conversations page (2026-10-16, after NocoCRM's): the list alone,
    // and one conversation beside it (`new` starts one). No menu entry: the
    // panel's history and each conversation's own page button lead here.
    {
      name: 'agent-chat-list',
      path: '/agent-chat',
      auth: 'required',
      // No menu entry, so the header's trail names it here, as NocoCRM's.
      breadcrumb: { title: 'ai.conversations.title' },
      componentLoader: () => import('./pages/itam/agent-chat.js'),
      // One page for the list and the conversation open beside it, as
      // NocoCRM's (2026-10-16): the conversation's address is a child that
      // renders nothing, so moving between conversations keeps the page,
      // its list's scroll and where 收起 returns to.
      children: [
        {
          name: 'agent-chat',
          path: ':conversationId',
          componentLoader: () => import('./pages/itam/route-address.js'),
        },
      ],
    },
    {
      name: 'notifications',
      path: '/notifications',
      auth: 'required',
      componentLoader: () => import('./pages/itam/notifications.js'),
    },
    {
      name: 'devices-group',
      navigation: { title: 'navigation.assetsGroup', icon: Laptop },
      children: [
        {
          name: 'devices',
          path: '/devices',
          auth: 'required',
          navigation: { title: 'navigation.devices', icon: MonitorSmartphone },
          componentLoader: () => import('./pages/itam/devices/devices-list.js'),
          children: [
            {
              name: 'devices-detail',
              path: ':id',
              componentLoader: () =>
                import('./pages/itam/devices/device-detail.js'),
              children: [
                ...landingRoute('devices', deviceTab('history')),
                ...['history', 'related', 'attachments', 'documents'].map(
                  (tab) => ({
                    name: `devices-${tab}`,
                    path: tab,
                    componentLoader: deviceTab(tab),
                  }),
                ),
              ],
            },
          ],
        },
        domainRoute('accessories', 'navigation.accessories', Mouse, {
          list: () => import('./pages/itam/stock/accessories.js'),
          detail: () => import('./pages/itam/stock/accessories-detail.js'),
          tabs: {
            holders: () => import('./pages/itam/stock/accessories-holders.js'),
            purchases: () => import('./pages/itam/stock/tab-purchases.js'),
            attachments: () => import('./pages/itam/stock/tab-attachments.js'),
            history: () => import('./pages/itam/stock/tab-history.js'),
          },
        }),
        domainRoute('consumables', 'navigation.consumables', Printer, {
          list: () => import('./pages/itam/stock/consumables.js'),
          detail: () => import('./pages/itam/stock/consumables-detail.js'),
          tabs: {
            holders: () => import('./pages/itam/stock/consumables-holders.js'),
            purchases: () => import('./pages/itam/stock/tab-purchases.js'),
            attachments: () => import('./pages/itam/stock/tab-attachments.js'),
            history: () => import('./pages/itam/stock/tab-history.js'),
          },
        }),
        domainRoute('components', 'navigation.components', Cpu, {
          list: () => import('./pages/itam/stock/components.js'),
          detail: () => import('./pages/itam/stock/components-detail.js'),
          tabs: {
            holders: () => import('./pages/itam/stock/components-holders.js'),
            purchases: () => import('./pages/itam/stock/tab-purchases.js'),
            attachments: () => import('./pages/itam/stock/tab-attachments.js'),
            history: () => import('./pages/itam/stock/tab-history.js'),
          },
        }),
        // Software is the fifth device type; its entitlements (both kinds in
        // one table) sit with the other device kinds.
        domainRoute('entitlements', 'navigation.entitlements', KeyRound, {
          list: () => import('./pages/itam/entitlements/entitlements.js'),
          detail: () =>
            import('./pages/itam/entitlements/entitlements-detail.js'),
          tabs: {
            seats: () => import('./pages/itam/entitlements/tab-seats.js'),
            purchases: () =>
              import('./pages/itam/entitlements/tab-purchases.js'),
            attachments: () =>
              import('./pages/itam/entitlements/tab-attachments.js'),
            history: () => import('./pages/itam/entitlements/tab-history.js'),
          },
        }),
      ],
    },
    // The work that moves a record through its steps, and the reports read
    // over it: a heading of its own, so these pages do not read as part of
    // the asset group above them now that groups no longer fold.
    {
      name: 'operations-group',
      navigation: { title: 'navigation.operationsGroup', icon: Briefcase },
      children: [
        domainRoute('procurement', 'navigation.procurement', ShoppingCart, {
          list: () => import('./pages/itam/procurement/procurement.js'),
          detail: () =>
            import('./pages/itam/procurement/procurement-detail.js'),
          tabs: {
            generated: () =>
              import('./pages/itam/procurement/tab-generated.js'),
            attachments: () =>
              import('./pages/itam/procurement/tab-attachments.js'),
            history: () => import('./pages/itam/procurement/tab-history.js'),
          },
        }),
        domainRoute('repairs', 'navigation.repairs', Wrench, {
          list: () => import('./pages/itam/repairs/repairs.js'),
          detail: () => import('./pages/itam/repairs/repairs-detail.js'),
          tabs: {
            attachments: () =>
              import('./pages/itam/repairs/tab-attachments.js'),
            history: () => import('./pages/itam/repairs/tab-history.js'),
          },
        }),
        domainRoute('disposals', 'navigation.disposals', Recycle, {
          list: () => import('./pages/itam/disposals/disposals.js'),
          detail: () => import('./pages/itam/disposals/disposals-detail.js'),
          tabs: {
            attachments: () =>
              import('./pages/itam/disposals/tab-attachments.js'),
            history: () => import('./pages/itam/disposals/tab-history.js'),
          },
        }),
        domainRoute('audits', 'navigation.audits', ClipboardCheck, {
          list: () => import('./pages/itam/audits/audits.js'),
          detail: () => import('./pages/itam/audits/audits-detail.js'),
          tabs: {
            items: () => import('./pages/itam/audits/tab-items.js'),
            attachments: () => import('./pages/itam/audits/tab-attachments.js'),
            history: () => import('./pages/itam/audits/tab-history.js'),
          },
          // A stocktake opens on its items (`defaultTab` in audit-domain).
          landing: 'items',
        }),
        {
          name: 'reports',
          path: '/reports',
          auth: 'required',
          navigation: { title: 'navigation.reports', icon: BarChart3 },
          componentLoader: () => import('./pages/itam/reports/reports.js'),
        },
      ],
    },
    {
      name: 'master-data',
      navigation: { title: 'navigation.masterData', icon: Database },
      children: [
        {
          name: 'master-data-overview',
          path: '/master-data',
          auth: 'required',
          navigation: { title: 'navigation.masterDataOverview', icon: Map },
          componentLoader: () => import('./pages/itam/master/overview.js'),
        },
        master({
          file: 'categories',
          title: 'navigation.categories',
          icon: FolderTree,
          list: () => import('./pages/itam/master/categories.js'),
          detail: () => import('./pages/itam/master/categories-detail.js'),
          tabs: [
            {
              path: 'models',
              loader: () =>
                import('./pages/itam/master/categories-models-tab.js'),
            },
            {
              path: 'softwareProducts',
              loader: () =>
                import('./pages/itam/master/categories-software-products-tab.js'),
            },
            {
              path: 'children',
              loader: () =>
                import('./pages/itam/master/categories-children-tab.js'),
            },
          ],
        }),
        master({
          file: 'models',
          title: 'navigation.models',
          icon: Package,
          list: () => import('./pages/itam/master/models.js'),
          detail: () => import('./pages/itam/master/models-detail.js'),
          tabs: [
            {
              path: 'devices',
              loader: () => import('./pages/itam/master/models-assets-tab.js'),
            },
            {
              path: 'stock',
              loader: () => import('./pages/itam/master/models-assets-tab.js'),
            },
          ],
        }),
        master({
          file: 'software-products',
          title: 'navigation.softwareProducts',
          icon: AppWindow,
          list: () => import('./pages/itam/master/software-products.js'),
          detail: () =>
            import('./pages/itam/master/software-products-detail.js'),
          tabs: [
            {
              path: 'entitlements',
              loader: () =>
                import('./pages/itam/master/software-products-entitlements-tab.js'),
            },
          ],
        }),
        master({
          file: 'manufacturers',
          title: 'navigation.manufacturers',
          icon: Factory,
          list: () => import('./pages/itam/master/manufacturers.js'),
          detail: () => import('./pages/itam/master/manufacturers-detail.js'),
          tabs: [
            {
              path: 'softwareProducts',
              loader: () =>
                import('./pages/itam/master/manufacturers-software-tab.js'),
            },
            {
              path: 'models',
              loader: () =>
                import('./pages/itam/master/manufacturers-models-tab.js'),
            },
          ],
        }),
        master({
          file: 'vendors',
          title: 'navigation.vendors',
          icon: Store,
          list: () => import('./pages/itam/master/vendors.js'),
          detail: () => import('./pages/itam/master/vendors-detail.js'),
          tabs: [
            {
              path: 'purchaseOrders',
              loader: () =>
                import('./pages/itam/master/vendors-purchase-orders-tab.js'),
            },
            {
              path: 'repairs',
              loader: () =>
                import('./pages/itam/master/vendors-repairs-tab.js'),
            },
            {
              path: 'disposals',
              loader: () =>
                import('./pages/itam/master/vendors-disposals-tab.js'),
            },
          ],
        }),
        master({
          file: 'locations',
          title: 'navigation.locations',
          icon: MapPin,
          list: () => import('./pages/itam/master/locations.js'),
          detail: () => import('./pages/itam/master/locations-detail.js'),
          tabs: [
            {
              path: 'stock',
              loader: () =>
                import('./pages/itam/master/locations-stock-tab.js'),
            },
            {
              path: 'people',
              loader: () =>
                import('./pages/itam/master/locations-people-tab.js'),
            },
            {
              path: 'devices',
              loader: () => import('./pages/itam/locations/devices-tab.js'),
            },
            {
              path: 'children',
              loader: () =>
                import('./pages/itam/master/locations-children-tab.js'),
            },
          ],
        }),
        master({
          file: 'departments',
          title: 'navigation.departments',
          icon: Building2,
          list: () => import('./pages/itam/master/departments.js'),
          detail: () => import('./pages/itam/master/departments-detail.js'),
          tabs: [
            {
              path: 'people',
              loader: () =>
                import('./pages/itam/master/departments-people-tab.js'),
            },
            {
              path: 'devices',
              loader: () =>
                import('./pages/itam/locations/department-devices-tab.js'),
            },
            {
              path: 'children',
              loader: () =>
                import('./pages/itam/master/departments-children-tab.js'),
            },
            // 入职配置 (2026-10-06): the department's default kit and its
            // positions; it had a page of its own under 主数据 before.
            {
              path: 'onboarding',
              loader: () =>
                import('./pages/itam/master/departments-onboarding-tab.js'),
            },
          ],
        }),
        master({
          file: 'people',
          title: 'navigation.people',
          icon: Users,
          // A person opens on what they hold (`defaultTab`).
          landing: 'holdings',
          list: () => import('./pages/itam/master/people.js'),
          detail: () => import('./pages/itam/master/people-detail.js'),
          tabs: [
            {
              path: 'holdings',
              loader: () => import('./pages/itam/people/holdings-tab.js'),
            },
          ],
        }),
      ],
    },
    // AI (template 1.0.0-beta.64): the Agents plugin's pages, which it
    // leaves to the application to route — the skill library, the model
    // services and what runs used. Each keeps the page grant or settings
    // item its definition declares, so it shows only to whoever may open it;
    // the runtimes page is left out and the runners' agents off the menu,
    // ITAM connecting no runner.
    {
      name: 'ai-group',
      navigation: { title: 'navigation.aiGroup', icon: Bot },
      children: [
        // What the work agents do on their own (2026-10-16, plan "Work
        // agents"); the page grant `agent-work` both IT roles hold.
        {
          name: 'agent-work',
          path: '/agent-work',
          auth: 'required',
          navigation: { title: 'navigation.agentWork', icon: Workflow },
          componentLoader: () => import('./pages/itam/agent-work.js'),
        },
        // 业务说明 (2026-10-16, after NocoCRM's Business guidance): what
        // every conversation and every background run works from, moved out
        // of 设置 → AI; it is a setting, so it checks the settings page's
        // grant.
        {
          name: 'ai-guidance',
          path: '/ai-guidance',
          auth: 'required',
          authz: {
            resource: { type: 'page', id: 'itam-settings' },
            action: 'access',
          },
          navigation: { title: 'navigation.guidance', icon: ScrollText },
          componentLoader: () => import('./pages/itam/guidance.js'),
        },
        // Off the menu since the Agents plugin 1.0 (2026-10-20): the page
        // lists only the agents runners report, and ITAM connects no runner
        // (Asset Steward and the work agents are not there). Still routed,
        // for when one is connected: add the navigation back then, with the
        // runtimes page.
        itamStyled(agentsRoute),
        {
          ...itamStyled(skillsRoute),
          navigation: { title: 'navigation.skills', icon: BookOpen },
        },
        // The plugin's `/models` is this application's asset models page
        // (a stored page grant names it), so the model services move aside.
        // The plugin's own "set up models" link still says `/models`.
        {
          ...itamStyled(modelsRoute),
          name: 'ai-models',
          path: '/ai-models',
          navigation: { title: 'navigation.aiModels', icon: Cpu },
        },
        {
          ...itamStyled(usageRoute),
          navigation: { title: 'navigation.usage', icon: Gauge },
        },
      ],
    },
    // 设置 (2026-10-16, after NocoCRM's): one menu entry, a page with a tab
    // each (pages/settings/index.tsx). The template has no settings area and
    // the plugins ship no pages, so the application routes its own — ITAM's
    // settings, then the administration pages built on the plugins' APIs
    // (client/pages/settings/, ported from NocoCRM's) — as this page's
    // children at the /settings/... addresses they had as entries of their
    // own, each route checking what its API checks; a tab shows only to
    // whoever may open it. ITAM's settings tabs all check the page grant
    // `itam-settings` the settings page held, so no stored grant changes.
    {
      // 系统设置 (2026-10-22): the settings page sits in a group of its own,
      // named `settings` so that Foundation's 应用底座 joins it
      // (`groupFoundationNavigation` merges into a group by that name) rather
      // than standing in a second 系统设置 group below it.
      name: 'settings',
      navigation: { title: 'navigation.systemSettings', icon: Settings2 },
      children: [
        {
          name: 'settings-home',
          path: '/settings',
          auth: 'required',
          // Opens on the first tab its reader may open; API keys are everyone's.
          authz: 'skip',
          navigation: { title: 'navigation.settingsGroup', icon: Settings2 },
          componentLoader: () => import('./pages/settings/index.js'),
          children: [
            {
              name: 'itam-settings',
              path: 'itam',
              authz: {
                resource: { type: 'page', id: 'itam-settings' },
                action: 'access',
              },
              componentLoader: () =>
                import('./pages/itam/settings/itam-settings.js'),
            },
            {
              name: 'itam-settings-mdm',
              path: 'mdm',
              authz: {
                resource: { type: 'page', id: 'itam-settings' },
                action: 'access',
              },
              componentLoader: () => import('./pages/itam/settings/mdm.js'),
            },
            {
              name: 'itam-settings-flows',
              path: 'flows',
              authz: {
                resource: { type: 'page', id: 'itam-settings' },
                action: 'access',
              },
              componentLoader: () => import('./pages/itam/settings/flows.js'),
            },
            {
              name: 'itam-settings-receipt-agent',
              path: 'receipt-agent',
              authz: {
                resource: { type: 'page', id: 'itam-settings' },
                action: 'access',
              },
              componentLoader: () =>
                import('./pages/itam/settings/receipt-agent.js'),
            },
            {
              // The users plugin's `user` record type, which it does not place
              // in the permission catalog: only the unrestricted root set opens
              // it.
              name: 'settings-users',
              path: 'users',
              authz: { resource: { type: 'user', id: '*' }, action: 'read' },
              componentLoader: () => import('./pages/settings/users/index.js'),
              children: [
                {
                  name: 'settings-users-new',
                  path: 'new',
                  componentLoader: () =>
                    import('./pages/settings/users/new.js'),
                },
                {
                  name: 'settings-users-invite',
                  path: 'invite',
                  componentLoader: () =>
                    import('./pages/settings/users/invite.js'),
                },
                {
                  name: 'settings-users-edit',
                  path: ':userId/edit',
                  componentLoader: () =>
                    import('./pages/settings/users/edit.js'),
                },
                {
                  name: 'settings-users-roles',
                  path: ':userId/roles',
                  componentLoader: () =>
                    import('./pages/settings/users/roles.js'),
                },
                {
                  name: 'settings-users-password',
                  path: ':userId/password',
                  componentLoader: () =>
                    import('./pages/settings/users/password.js'),
                },
              ],
            },
            {
              name: 'settings-permission-sets',
              path: 'permission-sets',
              authz: {
                resource: {
                  type: 'settings',
                  id: 'authorization.permission-sets',
                },
                action: 'read',
              },
              componentLoader: () =>
                import('./pages/settings/permission-sets/index.js'),
              children: [
                {
                  name: 'settings-permission-sets-new',
                  path: 'new',
                  componentLoader: () =>
                    import('./pages/settings/permission-sets/new.js'),
                },
                {
                  name: 'settings-permission-sets-rename',
                  path: 'edit/:setKey',
                  componentLoader: () =>
                    import('./pages/settings/permission-sets/rename.js'),
                },
                {
                  // A set's address: its permissions and its members are drawers
                  // over the list (pages/settings/permission-sets/detail/, after
                  // NocoCRM's, 2026-10-16); the address alone opens the
                  // permissions.
                  name: 'settings-permission-set',
                  path: ':setKey',
                  componentLoader: () =>
                    import('./pages/settings/permission-sets/detail/index.js'),
                  children: [
                    {
                      // One draft for the three areas: the drawer stays mounted
                      // while :section changes.
                      name: 'settings-permission-set-permissions',
                      path: 'permissions',
                      componentLoader: () =>
                        import('./pages/settings/permission-sets/detail/permissions.js'),
                      children: [
                        {
                          name: 'settings-permission-set-area',
                          path: ':section',
                          componentLoader: () =>
                            import('./pages/settings/permission-sets/detail/area.js'),
                        },
                      ],
                    },
                    {
                      name: 'settings-permission-set-members',
                      path: 'members',
                      componentLoader: () =>
                        import('./pages/settings/permission-sets/detail/members.js'),
                      children: [
                        {
                          name: 'settings-permission-set-members-add',
                          path: 'add',
                          componentLoader: () =>
                            import('./pages/settings/permission-sets/detail/add-members.js'),
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              // Every signed-in person manages their own keys only; the API
              // answers for the caller alone.
              name: 'settings-api-keys',
              path: 'api-keys',
              authz: 'skip',
              componentLoader: () =>
                import('./pages/settings/api-keys/index.js'),
              children: [
                {
                  name: 'settings-api-keys-new',
                  path: 'new',
                  componentLoader: () =>
                    import('./pages/settings/api-keys/new.js'),
                },
              ],
            },
            {
              // The page grant the scheduler's API checks.
              name: 'settings-scheduled-tasks',
              path: 'scheduled-tasks',
              authz: {
                resource: { type: 'page', id: 'scheduler.schedules' },
                action: 'access',
              },
              componentLoader: () =>
                import('./pages/settings/scheduled-tasks/index.js'),
              children: [
                {
                  name: 'settings-scheduled-task',
                  path: ':scheduleId',
                  componentLoader: () =>
                    import('./pages/settings/scheduled-tasks/detail.js'),
                },
              ],
            },
            {
              // Last: a trial's, rarely opened once ITAM is in use.
              name: 'itam-settings-demo',
              path: 'demo',
              authz: {
                resource: { type: 'page', id: 'itam-settings' },
                action: 'access',
              },
              componentLoader: () => import('./pages/itam/settings/demo.js'),
            },
          ],
        },
      ],
    },
  ]);

const appRoutes: AppClientRouteContribution =
  defineAppRoutes(appRouteDefinitions);

const routes: readonly AppClientRouteContribution[] = [appRoutes];

export default routes;
