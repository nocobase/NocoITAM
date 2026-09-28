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
import { useItamRecord, type ItamRecord } from '@/lib/itam/api';
import {
  RecordDrawerContext,
  type RecordDrawerApi,
} from '@/lib/itam/record-drawer';
import { recordPage } from '@/lib/itam/record-pages';
import { recordTarget, type RecordTarget } from '@/lib/itam/record-view';
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
          className='gap-0 overflow-y-auto bg-background data-[side=right]:w-[min(680px,88vw)] data-[side=right]:sm:max-w-none'
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
  const target = recordTarget(to) as RecordTarget;
  // The page inside carries the visible title; the drawer's own name is
  // for assistive technology only.
  const record = useItamRecord<ItamRecord>(target.path, target.id);
  const page = recordPage(target.route);
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
    <>
      {page ? (
        <IsolatedRouter initialPath={to}>
          <DrawerToolbar
            title={title}
            canGoBack={canGoBack}
            onBack={onBack}
            onLeave={onLeave}
          />
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
            {/* Anywhere else belongs to the page, not the drawer. */}
            <Route path='*' element={<LeaveDrawer onLeave={onLeave} />} />
          </Routes>
        </IsolatedRouter>
      ) : (
        <>
          {title}
          <div className='p-4'>
            <EmptyState title={t('common.notFound')} />
          </div>
        </>
      )}
    </>
  );
}

/**
 * 返回 when records are stacked and 打开完整页面 for the drawer's current
 * view, in a row of their own beside the close button. The page's own
 * action buttons sit at the top right of its header, so these must not
 * float over it: the row takes its height, and the page starts below.
 */
function DrawerToolbar({
  title,
  canGoBack,
  onBack,
  onLeave,
}: {
  readonly title: ReactNode;
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  readonly onLeave: (path: string) => void;
}): ReactElement {
  const { t } = useTranslation();
  // The drawer's own location: the full page opens on the same tab.
  const location = useLocation();
  return (
    <div className='-mb-3 flex h-12 shrink-0 items-center justify-end gap-1 px-3 pr-12'>
      {title}
      {canGoBack ? (
        <Button variant='ghost' size='sm' onClick={onBack}>
          <ArrowLeft data-icon='inline-start' />
          {t('common.back')}
        </Button>
      ) : null}
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
