import { useDemoMode } from '@/lib/itam/demo-mode';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import {
  CalendarClock,
  Database,
  FileText,
  KeyRound,
  MonitorSmartphone,
  Workflow,
  Settings2,
  ShieldUser,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

import { LinkTabs } from '#components/link-tabs';
import { Loading } from '#components/loading';
import { PageFrameContext } from '#components/page-frame';
import { cn } from '@/lib/utils';

/**
 * 设置, the menu's one entry for it (2026-10-16, after NocoCRM's): the pages
 * that configure ITAM and its people, a tab each, at addresses of their own
 * (/settings/itam, /settings/users …). Each tab's route still checks its own
 * grant; a tab shows only to whoever that grant lets open it, and /settings
 * opens on the first of those. This page draws the title and the tabs,
 * which stick to the top as it scrolls; the tabs' pages keep their
 * description and actions, which PageHeader draws under the tabs
 * (components/page-frame.ts).
 */
interface Tab {
  readonly path: string;
  readonly label: string;
  readonly icon: LucideIcon;
}
const TABS: readonly Tab[] = [
  { path: 'itam', label: 'navigation.settingsGeneral', icon: Settings2 },
  { path: 'mdm', label: 'settings.deviceSync.title', icon: MonitorSmartphone },
  // The record lifecycles and their approvers (2026-10-19; 报废流程 from
  // 2026-10-18).
  {
    path: 'flows',
    label: 'settings.flows.title',
    icon: Workflow,
  },
  {
    path: 'receipt-agent',
    label: 'settings.receiptAgent.title',
    icon: FileText,
  },
  { path: 'users', label: 'navigation.users', icon: UsersRound },
  // NocoBase 3's prepared Roles page (2026-10-24); /settings/permission-sets
  // redirects to it.
  { path: 'roles', label: 'navigation.roles', icon: ShieldUser },
  { path: 'api-keys', label: 'navigation.apiKeys', icon: KeyRound },
  {
    path: 'scheduled-tasks',
    label: 'navigation.scheduledTasks',
    icon: CalendarClock,
  },
  // Last: a trial's, rarely opened once ITAM is in use.
  { path: 'demo', label: 'settings.demo.title', icon: Database },
];

export default function SettingsPage(): ReactElement {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const mode = useDemoMode();
  const demoAccess = useCan(
    mode.data
      ? {
          resource: { type: 'settings', id: 'demoMode.data' },
          action: 'read',
        }
      : {
          resource: { type: 'page', id: 'itam-settings' },
          action: 'access',
        },
  );
  // The same checks as the tabs' routes in client/routes.ts; API keys are
  // everyone's own.
  const itam = useCan({
    resource: { type: 'page', id: 'itam-settings' },
    action: 'access',
  });
  const access: Readonly<Record<string, ReturnType<typeof useCan>>> = {
    itam,
    mdm: itam,
    flows: itam,
    'receipt-agent': itam,
    demo: demoAccess,
    users: useCan({ resource: { type: 'user', id: '*' }, action: 'read' }),
    roles: useCan({
      resource: { type: 'settings', id: 'authorization.permission-sets' },
      action: 'read',
    }),
    'scheduled-tasks': useCan({
      resource: { type: 'page', id: 'scheduler.schedules' },
      action: 'access',
    }),
  };
  // Whether the page has scrolled, so the tabs are stuck over its content:
  // the empty line above them has left the scrolling column.
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) =>
      setStuck(entry ? !entry.isIntersecting : false),
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });
  const pending = Object.values(access).some((check) => check.isPending);
  const tabs = TABS.filter((tab) => access[tab.path]?.can ?? true);
  const current = /\/settings\/([^/]+)/.exec(pathname)?.[1];
  if (!current) {
    if (pending) return <Loading />;
    return <Navigate to={`/settings/${tabs[0]?.path ?? 'api-keys'}`} replace />;
  }
  return (
    <>
      <div className='px-6 pt-6 md:px-8 md:pt-8'>
        <h1 className='font-heading text-2xl font-semibold tracking-tight'>
          {t('navigation.settingsGroup')}
        </h1>
      </div>
      {/* The tabs stick to the top of the layout's scrolling column as the
          page scrolls, below the covering pages (z-10) a tab opens over
          itself. Their band takes a ground only once stuck, for the content
          to scroll beneath: unstuck it would cover the page's watermark with
          a grey strip (2026-10-16). */}
      <div ref={sentinelRef} aria-hidden className='h-0' />
      <div
        className={cn(
          'sticky top-0 z-[9] px-6 pt-2 pb-3 md:px-8',
          stuck && 'bg-background/85 backdrop-blur-xl',
        )}
      >
        <LinkTabs
          label={t('navigation.settingsGroup')}
          tabs={tabs.map((tab) => ({
            to: `/settings/${tab.path}`,
            label: t(tab.label),
            icon: tab.icon,
            selected: tab.path === current,
          }))}
        />
      </div>
      <PageFrameContext.Provider value>
        <Outlet />
      </PageFrameContext.Provider>
    </>
  );
}
