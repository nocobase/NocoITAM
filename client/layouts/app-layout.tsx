import { useSyncServerLocale } from '@nocobase/app-plugin-i18n/client';
import type { ReactElement } from 'react';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { Outlet, useLocation } from 'react-router';

import { BrandWatermark } from '#components/brand-watermark';
import { Breadcrumbs } from '#components/breadcrumbs';

import {
  GlobalSearchDialog,
  GlobalSearchProvider,
  SearchHeaderButton,
  SearchNavButton,
} from '@/components/itam/global-search';
import { DemoBanner } from '@/components/itam/demo-banner';
import { RecordDrawerProvider } from '@/components/itam/record-drawer';
import { useNavigationCounts } from '@/lib/itam/navigation-counts';
import { useLiveWork } from '@/lib/itam/live-work';
import { useItamQueryDefaults } from '@/lib/itam/query-defaults';
import { titleBadgeText, useDocumentTitleBadge } from '@/lib/itam/title-badge';

import { RouteTreeProvider } from '../routing/route-context.js';

import { PageBreadcrumbProvider } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';

import { AssistantDock } from '@/components/itam/ai/assistant-dock';
import { AgentChatShell } from './agent-chat.js';
import { LayoutHeader } from './components/layout-header.js';
import {
  AppSidebar,
  AppSidebarProvider,
  AppSidebarToggle,
} from './components/app-sidebar.js';
import { NavigationMenu } from './components/navigation-menu.js';
import { AppBrand } from './components/app-brand.js';
import { HeaderActions } from './components/header-actions.js';
import { AppSidebarFooter } from './components/sidebar-footer.js';
import {
  useRouteNavigation,
  selectedNavigationId,
} from '../routing/route-navigation.js';

export interface AppLayoutProps {
  readonly routes: readonly AppClientRegisteredRoute[];
}

export function AppLayout({ routes }: AppLayoutProps): ReactElement {
  // The browser decides what it renders; this tells the server the same language so its messages match.
  useSyncServerLocale();
  // Application change (ITAM, 2026-10-23): a request the server refused as
  // wrong (a missing record) is not asked again three times; see
  // `client/lib/itam/query-defaults.ts`.
  useItamQueryDefaults();
  // Application change (ITAM): to-dos stay current while a page is open.
  useLiveWork();
  // Application change (ITAM): the numbers beside 待办 and 收件箱.
  const counts = useNavigationCounts();
  // Application change (ITAM, 2026-10-25): 收件箱's number also leads the
  // browser tab's title, as NocoCRM's does.
  useDocumentTitleBadge(titleBadgeText(counts.inbox));

  const { t } = useTranslation();
  const { items: menuItems, denied } = useRouteNavigation(routes);
  const { pathname } = useLocation();
  const selectedKey = selectedNavigationId(routes, pathname, denied);
  // Application change (ITAM, 2026-10-16): the brand tint and watermark on
  // the workbench alone, as NocoCRM has them on its overview.
  const brandSurface = pathname === '/';
  const navigationLabel = t('navigation.label', {
    defaultValue: 'Application navigation',
  });

  return (
    // The shell owns the business route tree used by its pages and navigation.
    <RouteTreeProvider routes={routes}>
      <PageBreadcrumbProvider>
        {/* Application change (ITAM): the Agents plugin's chat around the
            shell, so its panel survives navigation and a page can ask it
            about itself (agent-chat.tsx). */}
        <AgentChatShell>
          {/* Application change (ITAM): the search the sidebar opens keeps
              its state above the shell, so closing the dialog loses nothing
              (global-search.tsx). */}
          <GlobalSearchProvider>
            <AppSidebarProvider>
              <AppSidebar
                action={<SearchHeaderButton />}
                label={navigationLabel}
                footer={<AppSidebarFooter />}
              >
                {/* Application change (ITAM): the groups read as headings
                    with their pages always listed (`sections`), and 搜索
                    sits under 待办. */}
                <NavigationMenu
                  items={menuItems}
                  label={navigationLabel}
                  selectedKey={selectedKey}
                  // Application change (ITAM, 2026-10-17): 待办 counts the
                  // board's to-dos, 收件箱 the decisions and unread notices
                  // waiting on the reader (navigation-counts.ts).
                  badges={{ workbench: counts.workbench, inbox: counts.inbox }}
                  sections
                  after={{ inbox: <SearchNavButton /> }}
                />
              </AppSidebar>
              {/* Application change (ITAM): `itam-page-main` makes room for
                  the assistant's panel, header and page together
                  (styles.css). */}
              <div className='itam-page-main flex min-w-0 flex-1 flex-col'>
                <LayoutHeader className='sticky top-0 z-40 justify-between'>
                  <div className='flex min-w-0 items-center gap-3'>
                    <AppSidebarToggle />
                    {/* Application change (ITAM, 2026-10-22): the mark alone
                        on a phone-width pane, where the full logo ran under
                        the header's buttons; the logo from `sm` until the
                        sidebar shows it. */}
                    <div className='shrink-0 sm:hidden'>
                      <AppBrand compact />
                    </div>
                    <div className='hidden sm:block md:hidden'>
                      <AppBrand />
                    </div>
                    <div className='h-5 w-px shrink-0 bg-border' />
                    {/* The current page's trail: the route tree's, or the one the page declares (`usePageBreadcrumb`). */}
                    <Breadcrumbs denied={denied} />
                  </div>
                  <HeaderActions />
                </LayoutHeader>
                {/* Application change (ITAM): the demo-data banner, under the
                    header and above the page, offered to whoever may import
                    it while none is (after NocoCRM's). */}
                <DemoBanner />
                <div className='relative flex min-h-0 flex-1'>
                  {/* Application change (ITAM, 2026-10-16, as NocoCRM
                      does): the brand tint and watermark on the workbench
                      alone; every other page has the plain light grey. */}
                  <main
                    className={
                      brandSurface
                        ? 'app-brand-surface relative isolate min-w-0 flex-1 overflow-hidden'
                        : 'relative min-w-0 flex-1 overflow-hidden'
                    }
                  >
                    {brandSurface ? <BrandWatermark className='-z-10' /> : null}
                    {/* main only positions; the page scrolls in here, so a child page layer laid over main is neither
                      moved by the page's scrolling nor stretched by its height. */}
                    <div className='h-full overflow-y-auto'>
                      {/* Application change (ITAM): related-record links open
                        in the drawer this mounts. */}
                      <RecordDrawerProvider>
                        <Outlet />
                        {/* Inside the drawer's provider: a result opens in the
                          drawer over the page the reader is on. */}
                        <GlobalSearchDialog />
                      </RecordDrawerProvider>
                    </div>
                    {/* Application change (ITAM): the ask box floating at
                        the bottom of the main column (after NocoCRM's). */}
                    <AssistantDock />
                  </main>
                </div>
              </div>
            </AppSidebarProvider>
          </GlobalSearchProvider>
        </AgentChatShell>
      </PageBreadcrumbProvider>
    </RouteTreeProvider>
  );
}
