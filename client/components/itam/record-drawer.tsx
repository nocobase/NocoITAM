import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import {
  Suspense,
  createElement,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  UNSAFE_DataRouterContext,
  UNSAFE_DataRouterStateContext,
  UNSAFE_LocationContext,
  UNSAFE_RouteContext,
  useLocation,
  useNavigate,
} from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useItamRecord, type ItamRecord } from '@/lib/itam/api';
import {
  RecordDrawerContext,
  type RecordDrawerApi,
} from '@/lib/itam/record-drawer';
import {
  DrawerHeaderSlotContext,
  EmbeddedRecordContext,
} from '@/lib/itam/detail-chrome';
import { recordPage } from '@/lib/itam/record-pages';
import { recordOrTabTarget, type RecordTarget } from '@/lib/itam/record-view';
import { referenceLabel } from '@/lib/itam/references';

import { EmptyState } from './empty-state.js';

/**
 * The drawer related records open in; the application shell mounts it
 * once for every page. It shows the record's own detail page — the same
 * header, information card and tabs as the full view — in a panel a little
 * smaller than the page. Records stack: a reference inside the drawer opens
 * on top, and 返回 goes back one. Leaving the record — the full-page button,
 * a breadcrumb, a deleted record — closes it and moves the page there.
 */
export function RecordDrawerProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const [stack, setStack] = useState<readonly string[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  // Reset while rendering rather than in an effect, so the closed drawer
  // never paints once with the previous page's record.
  const [pathname, setPathname] = useState(location.pathname);
  if (pathname !== location.pathname) {
    setPathname(location.pathname);
    setStack([]);
  }
  const api = useMemo<RecordDrawerApi>(
    () => ({
      open: (to) =>
        setStack((current) =>
          current.at(-1) === to ? current : [...current, to],
        ),
    }),
    [],
  );
  const current = stack.at(-1);
  return (
    <RecordDrawerContext.Provider value={api}>
      {children}
      <Sheet
        open={current !== undefined}
        onOpenChange={(open) => {
          if (!open) setStack([]);
        }}
      >
        <SheetContent
          // A little smaller than the page: the sheet's own right-side
          // width classes carry a data-side variant, so these do too to
          // replace rather than lose to them.
          // `itam-record-drawer`: it moves left of the assistant's panel (styles.css).
          className='itam-record-drawer gap-0 overflow-y-auto bg-background data-[side=right]:w-[min(680px,88vw)] data-[side=right]:sm:max-w-none'
        >
          {current ? (
            <RecordDrawerBody
              key={current}
              to={current}
              canGoBack={stack.length > 1}
              onBack={() => setStack((entries) => entries.slice(0, -1))}
              onLeave={(path) => {
                setStack([]);
                void navigate(path);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>
    </RecordDrawerContext.Provider>
  );
}

function RecordDrawerBody({
  to,
  canGoBack,
  onBack,
  onLeave,
}: {
  readonly to: string;
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  /** Closes the drawer and moves the page to an application path. */
  readonly onLeave: (path: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  // `open` only accepts record links, so the target always resolves.
  const target = recordOrTabTarget(to) as RecordTarget;
  // The page inside carries the visible title; the drawer's own name is
  // for assistive technology only.
  const record = useItamRecord<ItamRecord>(target.path, target.id);
  // The toolbar's place for the page's line above its title.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const title = (
    <>
      <SheetTitle className='sr-only'>
        {record.data ? referenceLabel(target.collection, record.data) : '…'}
      </SheetTitle>
      <SheetDescription className='sr-only'>
        {t(`${target.i18n}.object`)}
      </SheetDescription>
    </>
  );
  return (
    <DrawerHeaderSlotContext.Provider value={slot}>
      <RecordPane
        to={to}
        onLeave={onLeave}
        toolbar={
          <DrawerToolbar
            title={title}
            slotRef={setSlot}
            canGoBack={canGoBack}
            onBack={onBack}
            onLeave={onLeave}
          />
        }
        fallback={
          <>
            {title}
            <div className='p-4'>
              <EmptyState title={t('common.notFound')} />
            </div>
          </>
        }
      />
    </DrawerHeaderSlotContext.Provider>
  );
}

/**
 * A record's own detail page — header, actions, information card and tabs —
 * mounted in a router of its own, so switching tabs inside leaves the page
 * around it alone and any path outside the record is handed back through
 * `onLeave`.
 *
 * The drawer is one place this is shown; 我的待办 is the other, where the
 * item picked from the queue is worked on beside the list. Both want the
 * record's own page rather than a second rendering of it, so neither builds
 * one.
 */
export function RecordPane({
  to,
  onLeave,
  toolbar,
  fallback = null,
}: {
  readonly to: string;
  /** A path outside the record: whoever mounts the pane moves there. */
  readonly onLeave: (path: string) => void;
  /** Rendered inside the pane's own router, so it can read its location. */
  readonly toolbar?: ReactNode;
  /** Shown when the link names no detail page. */
  readonly fallback?: ReactNode;
}): ReactElement | null {
  // A link may name the record's tab (`/audits/1/history?focus=…`, as a
  // notification does): the page is the record's, opened on that tab.
  const target = recordOrTabTarget(to);
  const page = target ? recordPage(target.route) : undefined;
  if (!target || !page) return <>{fallback}</>;
  return (
    <IsolatedRouter initialPath={to}>
      <EmbeddedRecordContext.Provider value>
        {toolbar}
        <Routes>
          <Route
            path={`/${target.route}/:id`}
            // The page brings its own padding and lays out by its own
            // width, so it reads like a narrow screen here.
            element={<RoutePage page={page.Detail} />}
          >
            {page.tabs.map((tab) => (
              <Route
                key={tab.path}
                path={tab.path}
                element={<RoutePage page={tab.Component} />}
              />
            ))}
          </Route>
          {/* Anywhere else belongs to the page around the pane. */}
          <Route path='*' element={<LeaveDrawer onLeave={onLeave} />} />
        </Routes>
      </EmbeddedRecordContext.Provider>
    </IsolatedRouter>
  );
}

/**
 * A page that is not a record, shown in place as `RecordPane` shows one
 * (2026-10-17: MDM 核对 beside an MDM 跟进 in 收件箱): its own router at
 * `to`, and any link away from it handed to `onLeave`.
 */
export function PagePane({
  to,
  page,
  onLeave,
}: {
  readonly to: string;
  readonly page: ComponentType;
  readonly onLeave: (path: string) => void;
}): ReactElement {
  const path = to.split(/[?#]/)[0] ?? to;
  return (
    <IsolatedRouter initialPath={to}>
      <EmbeddedRecordContext.Provider value>
        <Routes>
          <Route path={path} element={<RoutePage page={page} />} />
          <Route path='*' element={<LeaveDrawer onLeave={onLeave} />} />
        </Routes>
      </EmbeddedRecordContext.Provider>
    </IsolatedRouter>
  );
}

/**
 * 返回 when records are stacked and 打开完整页面 for the drawer's current
 * view, in a row of their own beside the close button. The page's own
 * action buttons sit at the top right of its header, so these must not
 * float over it: the row takes its height, and the page starts below.
 * The page's line above its title (人员, 分类 › 外设) sits at the row's
 * left (2026-10-22), so the title starts nearer the top.
 */
function DrawerToolbar({
  title,
  slotRef,
  canGoBack,
  onBack,
  onLeave,
}: {
  readonly title: ReactNode;
  readonly slotRef: (element: HTMLElement | null) => void;
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  readonly onLeave: (path: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  // The drawer's own location: the full page opens on the same tab.
  const location = useLocation();
  return (
    // -mb-6 takes back the page's top padding: with the line above the
    // title up here, the title follows the row closely (2026-10-22). Above
    // the page, whose padding it now overlaps, so its buttons stay clickable;
    // the row itself lets clicks through to the drawer's close button.
    <div className='pointer-events-none relative z-10 -mb-6 flex h-12 shrink-0 items-center gap-1 px-3 pr-12 *:pointer-events-auto'>
      {/* 返回 at the far left, where a way back is looked for; the drawer's
          own controls stay at the right beside its close button. */}
      {canGoBack ? (
        <Button variant='ghost' className='-ml-1' onClick={onBack}>
          <ArrowLeft data-icon='inline-start' />
          {t('common.back')}
        </Button>
      ) : null}
      {/* Lined up with the page's own left edge (p-6) unless 返回 is there. */}
      <div
        ref={slotRef}
        className={cn('min-w-0 flex-1 truncate', canGoBack ? 'pl-2' : 'pl-3')}
      />
      {title}
      <Button
        variant='ghost'
        size='icon-sm'
        aria-label={t('common.openFullPage')}
        title={t('common.openFullPage')}
        onClick={() => onLeave(`${location.pathname}${location.search}`)}
      >
        <ExternalLink />
      </Button>
    </div>
  );
}

/**
 * A router of the drawer's own, so the page inside switches tabs without
 * moving the page behind it. React Router refuses a router inside another
 * and routes navigation through the outer data router when one is present,
 * so the outer router's contexts are cleared for this subtree first; the
 * drawer's record context (stacking) is not a router context and stays.
 */
function IsolatedRouter({
  initialPath,
  children,
}: {
  readonly initialPath: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <UNSAFE_DataRouterContext.Provider value={null}>
      <UNSAFE_DataRouterStateContext.Provider value={null}>
        <UNSAFE_RouteContext.Provider
          value={{ outlet: null, matches: [], isDataRoute: false }}
        >
          <UNSAFE_LocationContext.Provider value={null as never}>
            <MemoryRouter initialEntries={[initialPath]}>
              {children}
            </MemoryRouter>
          </UNSAFE_LocationContext.Provider>
        </UNSAFE_RouteContext.Provider>
      </UNSAFE_DataRouterStateContext.Provider>
    </UNSAFE_DataRouterContext.Provider>
  );
}

/** A lazily loaded page with a placeholder while its chunk arrives. */
function RoutePage({ page }: { readonly page: ComponentType }): ReactElement {
  return (
    <Suspense
      fallback={
        <div className='space-y-3'>
          <Skeleton className='h-6 w-1/3' />
          <Skeleton className='h-32 w-full' />
        </div>
      }
    >
      {createElement(page)}
    </Suspense>
  );
}

/** Hands a path outside the record to the page and closes the drawer. */
function LeaveDrawer({
  onLeave,
}: {
  readonly onLeave: (path: string) => void;
}): null {
  const location = useLocation();
  const path = `${location.pathname}${location.search}`;
  useEffect(() => {
    onLeave(path);
  }, [onLeave, path]);
  return null;
}
