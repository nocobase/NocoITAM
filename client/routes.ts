import {
  defineAppRoutes,
  defineSettingsRoutes,
  type AppClientRouteComponentLoader,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
  type AppClientSettingIcon,
} from '@nocobase/app-client/plugins';
import {
  AppWindow,
  BarChart3,
  Briefcase,
  Building2,
  ClipboardCheck,
  Cpu,
  Database,
  FolderTree,
  Factory,
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
  ShoppingCart,
  Store,
  Users,
  Wrench,
} from 'lucide-react';

/**
 * ITAM navigation, following the specification's 导航 section. Detail pages
 * are children of their list page so they inherit its access check; their
 * tabs are child routes of the detail page.
 */
const comingSoon = () => import('./pages/itam/coming-soon-page.js');

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
  readonly icon: AppClientSettingIcon;
  readonly list: AppClientRouteComponentLoader;
  readonly detail: AppClientRouteComponentLoader;
  /** Extra detail tabs (child routes) before History. */
  readonly tabs?: readonly {
    readonly path: string;
    readonly loader: AppClientRouteComponentLoader;
  }[];
}

// Explicit loaders keep every page its own lazy chunk; a templated import
// would bundle the whole directory together.
const master = ({
  file,
  title,
  icon,
  list,
  detail,
  tabs = [],
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
        ...tabs.map((tab) => ({
          name: `${file}-${tab.path}`,
          path: tab.path,
          componentLoader: tab.loader,
        })),
        {
          name: `${file}-history`,
          path: 'history',
          componentLoader: () => import('./pages/itam/record-history-tab.js'),
        },
      ],
    },
  ],
});

interface DomainRouteLoaders {
  readonly list: AppClientRouteComponentLoader;
  readonly detail: AppClientRouteComponentLoader;
  readonly tabs: Readonly<Record<string, AppClientRouteComponentLoader>>;
}

/** A business collection: list page, detail page as child, tabs as grandchildren. */
const domainRoute = (
  name: string,
  title: string,
  icon: AppClientSettingIcon,
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
      children: Object.entries(loaders.tabs).map(([tab, loader]) => ({
        name: `${name}-${tab}`,
        path: tab,
        componentLoader: loader,
      })),
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
      name: 'workbench',
      path: '/',
      auth: 'required',
      navigation: { title: 'navigation.workbench', icon: LayoutDashboard },
      componentLoader: () => import('./pages/itam/workbench.js'),
    },
    // 通知 has no menu entry: it opens from the bell in the header
    // (2026-10-05), and 待办 is the workbench's board rather than a page of
    // its own. Without `navigation` the page checks no page grant
    // (`withPageGrants`), like a detail page.
    // 入职供需 (2026-10-06): opened from the workbench's 入职准备 column, so
    // no menu entry and no page grant; its endpoint answers only a reader
    // that column is for.
    {
      name: 'onboarding-supply',
      path: '/onboarding-supply',
      auth: 'required',
      componentLoader: () => import('./pages/itam/onboarding-supply.js'),
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
              children: ['history', 'related', 'attachments', 'documents'].map(
                (tab) => ({
                  name: `devices-${tab}`,
                  path: tab,
                  componentLoader: deviceTab(tab),
                }),
              ),
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
              path: 'stock',
              loader: () => import('./pages/itam/master/models-stock-tab.js'),
            },
            {
              path: 'devices',
              loader: () =>
                import('./pages/itam/locations/model-devices-tab.js'),
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
  ]);

const appRoutes: AppClientRouteContribution =
  defineAppRoutes(appRouteDefinitions);

const settingsRoutes: AppClientRouteContribution = defineSettingsRoutes([
  {
    name: 'itam-settings',
    path: '/itam',
    navigation: { title: 'navigation.itamSettings', icon: Wrench },
    authz: {
      resource: { type: 'page', id: 'itam-settings' },
      action: 'access',
    },
    componentLoader: () => import('./pages/itam/settings/itam-settings.js'),
  },
]);

const routes: readonly AppClientRouteContribution[] = [
  appRoutes,
  settingsRoutes,
];

export default routes;
