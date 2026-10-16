// A permission set's Permissions drawer, over the list
// (…/:setKey/permissions/:section): everything the catalog offers, as switch
// rows, in three tabs by area (Pages, Business operations, Administration),
// a data-scoped business action with how far it reaches. Switching edits one
// draft for all three areas, kept while the tabs change, since this
// component stays mounted under them (area.tsx only checks the address). The
// footer saves the whole set, after checking nobody changed it since it was
// loaded (guideline R1), and the drawer stays open, as the user asked, to go
// on with another area. Closing with unsaved changes asks in the drawer;
// leaving any other way asks through the application's synchronous
// navigation guard (the browser's confirm) and `beforeunload`.
import { useNavigationGuard, useToaster } from '@nocobase/app-client';
import {
  useAuthorizationClient,
  type PermissionGrant,
} from '@nocobase/app-plugin-authorization/client';
import { AlertCircleIcon, InfoIcon, ShieldCheckIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  Navigate,
  Outlet,
  useLocation,
  useOutletContext,
  useParams,
  useResolvedPath,
} from 'react-router';

import {
  PermissionEditor,
  type PermissionEditorGroup,
  type PermissionEditorSection,
} from '#components/permission-editor';
import { RouteDrawer } from '#components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#components/ui/alert-dialog';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import { LoadFailure, RouteTabs } from '../../shared.js';
import { errorStatus, useAdminText, useLocalized } from '../../hooks.js';
import {
  grantsSignature,
  setFailure,
  useGrantablePages,
  useOptions,
  usePermissionSet,
  useSetActions,
  useSetTitle,
  type Options,
  type PermissionSetsOutletContext,
} from '../data.js';
import { AREAS, isArea, type Area } from './areas.js';
import { isOn, levelOf, setLevel, toggle, type DataScope } from './grants.js';

/** What a row of the editor stands for. */
interface RowTarget {
  readonly type: string;
  readonly id: string;
  readonly action: string;
  readonly scope?: DataScope;
}

interface Heading {
  readonly name: string;
  readonly sections: PermissionEditorSection[];
}

/** The editor's rows by area, and what each row stands for; row ids are DOM ids, so they are counters. */
function useRows(options: Options | undefined): {
  readonly headings: readonly Heading[];
  readonly targets: ReadonlyMap<string, RowTarget>;
} {
  const localized = useLocalized();
  const { text } = useAdminText();
  const pages = useGrantablePages();
  return useMemo(() => {
    const targets = new Map<string, RowTarget>();
    if (!options) return { headings: [], targets };
    const rowId = (target: RowTarget): string => {
      const id = `permission-row-${targets.size + 1}`;
      targets.set(id, target);
      return id;
    };
    const headings = options.sections.map((section) => {
      const editorSections: PermissionEditorSection[] = [];
      for (const subsection of section.subsections) {
        const groups: PermissionEditorGroup[] = [];
        if (subsection.recordType?.type === 'page') {
          // Pages, grouped by the menu group they sit in.
          const order: string[] = [];
          const byGroup = new Map<
            string,
            { title?: string; rows: PermissionEditorGroup['rows'][number][] }
          >();
          for (const page of pages) {
            const key = page.group?.id ?? '';
            if (!byGroup.has(key)) {
              byGroup.set(key, { title: page.group?.label, rows: [] });
              order.push(key);
            }
            byGroup.get(key)!.rows.push({
              id: rowId({ type: 'page', id: page.id, action: 'access' }),
              label: page.label,
              enabled: false,
            });
          }
          for (const key of order) {
            const group = byGroup.get(key)!;
            groups.push({
              id: `${subsection.name}-${key || 'top'}`,
              // The pages at the top of the menu sit under no heading there;
              // here every group has one.
              title: key ? group.title : text('sets.topPages'),
              rows: group.rows,
            });
          }
        } else {
          for (const resource of subsection.resources) {
            groups.push({
              id: `${subsection.name}-${resource.type}-${resource.id}`,
              title: localized(resource.title, resource.id),
              rows: resource.actions.map((action, index) => {
                const scope = resource.dataScopes?.[action.name]?.[0];
                return {
                  id: rowId({
                    type: resource.type,
                    id: resource.id,
                    action: action.name,
                    ...(scope ? { scope } : {}),
                  }),
                  label: localized(action.title, action.name),
                  // The resource's description once, under its first action.
                  hint:
                    index === 0 && resource.description
                      ? localized(resource.description)
                      : undefined,
                  enabled: false,
                };
              }),
            });
          }
        }
        if (groups.some((group) => group.rows.length > 0))
          editorSections.push({
            id: subsection.name,
            title: localized(subsection.title, subsection.name),
            groups,
          });
      }
      return { name: section.name, sections: editorSections };
    });
    return { headings, targets };
  }, [options, pages, localized, text]);
}

/** How a row reads in a list of grants: off, on, or on at a scope. */
function stateOf(
  grants: readonly PermissionGrant[],
  target: RowTarget,
): string {
  if (!isOn(grants, target.type, target.id, target.action)) return 'off';
  return target.scope
    ? `on:${levelOf(grants, target.type, target.id, target.action, target.scope)}`
    : 'on';
}

export default function PermissionsDrawer(): ReactElement {
  const { setKey = '' } = useParams();
  const { reload: reloadList } =
    useOutletContext<PermissionSetsOutletContext>();
  const { text } = useAdminText();
  const location = useLocation();
  const own = useResolvedPath('.');
  // The list this drawer opened over, with its search: where closing goes,
  // not the set's own address, which would open the drawer again.
  const listPath = own.pathname.replace(/\/[^/]+\/permissions$/u, '');
  const closeTo = { pathname: listPath, search: location.search };
  const segment = location.pathname
    .slice(own.pathname.length)
    .split('/')
    .find(Boolean);
  const area: Area = isArea(segment) ? segment : 'pages';

  const set = usePermissionSet(setKey);
  const options = useOptions();
  const can = useSetActions();
  const title = useSetTitle();
  const authz = useAuthorizationClient();
  const toaster = useToaster();
  const { headings, targets } = useRows(options.data);
  const localized = useLocalized();

  // What the draft started from, and the draft; set once the set loads.
  const [baseline, setBaseline] = useState<readonly PermissionGrant[]>();
  const [draft, setDraft] = useState<readonly PermissionGrant[]>();
  const dirty =
    baseline !== undefined &&
    draft !== undefined &&
    grantsSignature(draft) !== grantsSignature(baseline);
  // The set was fetched again (after a save, or Reload): start over from it while nothing is being changed.
  const [seen, setSeen] = useState<string>();
  const loaded = set.data?.grants;
  if (loaded) {
    const incoming = grantsSignature(loaded);
    if (incoming !== seen) {
      setSeen(incoming);
      if (!dirty) {
        setBaseline(loaded);
        setDraft(loaded);
      }
    }
  }

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [failureText, setFailureText] = useState<string>();
  const [stale, setStale] = useState(false);

  // The drawer's own moves (its tabs, closing after Discard) pass the
  // navigation guard once; anything else with unsaved changes asks.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  const allowedRef = useRef(false);
  const allowNavigation = useCallback(() => {
    allowedRef.current = true;
  }, []);
  useNavigationGuard(() => {
    // Spent on the next navigation, whether or not anything was unsaved.
    const allowed = allowedRef.current;
    allowedRef.current = false;
    if (!dirtyRef.current || allowed) return true;
    return window.confirm(text('sets.leaveConfirm'));
  });
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // While asking "Discard changes?", answers the drawer's beforeClose.
  const [discardPrompt, setDiscardPrompt] = useState<{
    readonly answer: (discard: boolean) => void;
  }>();
  function answerDiscard(discard: boolean): void {
    if (discard) allowNavigation();
    discardPrompt?.answer(discard);
    setDiscardPrompt(undefined);
  }

  // A set someone deleted: the list behind loses its row too.
  // Found missing on loading, or by a save: someone deleted it.
  const [gone, setGone] = useState(false);
  const missing =
    gone || (set.error !== null && errorStatus(set.error) === 404);
  useEffect(() => {
    if (missing) reloadList();
  }, [missing, reloadList]);

  const recordAccessTitle = useMemo(
    () =>
      new Map(
        (options.data?.recordAccess ?? []).map((item) => [
          item.key,
          localized(item.title, item.key),
        ]),
      ),
    [options.data, localized],
  );

  // Which areas hold unsaved changes, for the tabs' dots.
  const changedAreas = useMemo(() => {
    const changed = new Set<string>();
    if (!dirty || !draft || !baseline) return changed;
    for (const heading of headings)
      for (const section of heading.sections)
        for (const group of section.groups)
          for (const row of group.rows) {
            const target = targets.get(row.id);
            if (target && stateOf(draft, target) !== stateOf(baseline, target))
              changed.add(heading.name);
          }
    return changed;
  }, [dirty, draft, baseline, headings, targets]);

  // Where focus goes when the control that had it goes away (Discard,
  // Reload) or is disabled (Save): the area being shown (guideline A6).
  const tabsRef = useRef<HTMLDivElement>(null);
  const focusArea = (): void => {
    window.setTimeout(() =>
      tabsRef.current
        ?.querySelector<HTMLElement>('[aria-current="page"]')
        ?.focus(),
    );
  };

  if (!segment)
    return (
      <Navigate to={{ pathname: 'pages', search: location.search }} replace />
    );

  const name = set.data && !gone ? title(set.data) : undefined;
  const readOnly = set.data ? !can('update', set.data) : true;
  // Why a set is read only: the viewer may change no set, or this one is
  // the application's.
  const readOnlyNotice = can('update') ? 'sets.readOnly' : 'sets.noUpdate';

  const editable =
    !missing &&
    set.data !== undefined &&
    !set.data.unrestricted &&
    !readOnly &&
    options.data !== undefined &&
    draft !== undefined;
  const locked = readOnly || saving;

  async function save(): Promise<void> {
    if (!set.data || !draft || !baseline) return;
    savingRef.current = true;
    setSaving(true);
    setFailureText(undefined);
    try {
      // Written from the latest version only (guideline R1).
      const fresh = await authz.getPermissionSet(set.data.key);
      if (grantsSignature(fresh.grants) !== grantsSignature(baseline)) {
        setStale(true);
        return;
      }
      const saved = await authz.updatePermissionSet(set.data.key, {
        key: set.data.key,
        ...(fresh.title === undefined ? {} : { title: fresh.title }),
        grants: draft,
      });
      authz.invalidate();
      setBaseline(saved.grants);
      setDraft(saved.grants);
      setSeen(grantsSignature(saved.grants));
      toaster.show({
        type: 'success',
        title: text('sets.toasts.saved', { name: title(saved) }),
      });
      reloadList();
      focusArea();
    } catch (caught: unknown) {
      if (errorStatus(caught) === 404) {
        // Deleted meanwhile: the drawer says so, with the way back (R3).
        setGone(true);
        setDraft(baseline);
        reloadList();
        return;
      }
      setFailureText(setFailure(caught, text));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  let body: ReactElement;
  if (missing || (set.error && !set.data)) {
    body = (
      <LoadFailure
        notFound={missing}
        error={set.error}
        what={text('sets.whatOne')}
        onRetry={() => void set.refetch()}
        back={{
          to: listPath + location.search,
          label: text('common.backToList'),
        }}
      />
    );
  } else if (set.data?.unrestricted) {
    body = (
      <Alert>
        <InfoIcon />
        <AlertDescription>{text('sets.unrestricted')}</AlertDescription>
      </Alert>
    );
  } else if (options.error && !options.data) {
    body = (
      <LoadFailure
        error={options.error}
        what={text('sets.whatOne')}
        onRetry={() => void options.refetch()}
      />
    );
  } else if (!set.data || !options.data || !draft) {
    body = (
      <div
        role='status'
        aria-label={text('common.loading')}
        className='flex flex-col gap-4'
      >
        <div className='flex gap-5'>
          <Skeleton className='h-6 w-16' />
          <Skeleton className='h-6 w-28' />
          <Skeleton className='h-6 w-24' />
        </div>
        <Skeleton className='h-40 w-full' />
        <Skeleton className='h-40 w-full' />
      </div>
    );
  } else {
    const current = draft;
    const heading = headings.find((candidate) => candidate.name === area);
    const areaSections = heading?.sections ?? [];
    const sections = areaSections.map((section) => ({
      ...section,
      // An area of one section: its heading would only repeat the tab.
      title: areaSections.length === 1 ? undefined : section.title,
      groups: section.groups.map((group) => ({
        ...group,
        rows: group.rows.map((row) => {
          const target = targets.get(row.id)!;
          const enabled = isOn(current, target.type, target.id, target.action);
          if (!target.scope) return { ...row, enabled };
          const level = levelOf(
            current,
            target.type,
            target.id,
            target.action,
            target.scope,
          );
          const levels = target.scope.recordAccess
            .filter((key) => key !== 'customFilter' || key === level)
            .map((key) => ({
              value: key,
              label:
                key === 'customFilter'
                  ? text('sets.customFilter')
                  : (recordAccessTitle.get(key) ?? key),
            }));
          if (!levels.some((item) => item.value === level))
            levels.push({ value: level, label: text('sets.customFilter') });
          return { ...row, enabled, levels, level };
        }),
      })),
    }));
    body = (
      <div className='flex flex-col gap-4'>
        {/* The areas stay in view as the body scrolls: the drawer's header
            holds only a title and a description. */}
        <div
          ref={tabsRef}
          className='sticky -top-4 z-10 -mx-4 -mt-4 bg-popover px-4 pt-2'
        >
          <RouteTabs
            label={text('sets.permissionsOf', { name })}
            replace
            onNavigate={allowNavigation}
            tabs={AREAS.map((candidate) => ({
              to: { pathname: candidate, search: location.search },
              label: text(`sets.headings.${candidate}`),
              active: candidate === area,
              ...(changedAreas.has(candidate)
                ? { marked: text('sets.unsaved') }
                : {}),
            }))}
          />
        </div>
        {failureText ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{failureText}</AlertDescription>
          </Alert>
        ) : null}
        {stale ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{text('sets.stale')}</AlertDescription>
            <AlertAction>
              <Button
                variant='outline'
                size='sm'
                onClick={() => {
                  setStale(false);
                  focusArea();
                  setBaseline(set.data?.grants);
                  setDraft(set.data?.grants);
                  void set.refetch();
                }}
              >
                {text('sets.reload')}
              </Button>
            </AlertAction>
          </Alert>
        ) : null}
        {readOnly ? (
          <Alert>
            <InfoIcon />
            <AlertDescription>{text(readOnlyNotice)}</AlertDescription>
          </Alert>
        ) : null}
        {sections.length === 0 ? (
          <Empty className='min-h-40 border border-dashed p-6 md:p-6'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <ShieldCheckIcon />
              </EmptyMedia>
              <EmptyTitle>{text('sets.areaEmptyTitle')}</EmptyTitle>
              <EmptyDescription>{text('sets.areaEmptyBody')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <PermissionEditor
            sections={sections}
            readOnly={locked}
            labels={{
              levelFor: (label) => text('sets.levelFor', { name: label }),
            }}
            onEnabledChange={(id, on) => {
              const target = targets.get(id);
              if (!target) return;
              setDraft((grants) =>
                toggle(
                  grants ?? [],
                  target.type,
                  target.id,
                  target.action,
                  on,
                  target.scope,
                ),
              );
            }}
            onLevelChange={(id, level) => {
              const target = targets.get(id);
              if (!target?.scope) return;
              const scope = target.scope;
              setDraft((grants) =>
                setLevel(
                  grants ?? [],
                  target.type,
                  target.id,
                  target.action,
                  scope,
                  level,
                ),
              );
            }}
          />
        )}
      </div>
    );
  }

  return (
    <RouteDrawer
      className='sm:max-w-2xl'
      closeTo={closeTo}
      title={name ?? (missing || set.error ? setKey : text('common.loading'))}
      description={
        set.data ? (
          <>
            <code className='font-mono text-xs'>{set.data.key}</code>
            {' · '}
            {text('sets.permissionsDescription')}
          </>
        ) : undefined
      }
      beforeClose={() => {
        if (savingRef.current) return false;
        if (!dirtyRef.current) return true;
        return new Promise<boolean>((resolve) => {
          setDiscardPrompt({ answer: resolve });
        });
      }}
      footer={
        editable ? (
          <>
            {dirty ? (
              <span className='mr-auto self-center text-sm text-muted-foreground'>
                {text('sets.unsaved')}
              </span>
            ) : null}
            {dirty ? (
              <Button
                variant='outline'
                disabled={saving}
                onClick={() => {
                  setDraft(baseline);
                  setFailureText(undefined);
                  focusArea();
                }}
              >
                {text('sets.discard')}
              </Button>
            ) : null}
            <Button
              disabled={!dirty || saving || stale}
              onClick={() => void save()}
            >
              {saving ? <Spinner data-icon='inline-start' /> : null}
              {text('common.save')}
            </Button>
          </>
        ) : undefined
      }
    >
      {body}
      {/* The area's route: it only checks the address. */}
      <Outlet />
      {/* Inside the drawer, so Esc closes only the question. */}
      <AlertDialog
        open={discardPrompt !== undefined}
        onOpenChange={(open) => {
          if (!open) answerDiscard(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {text('sets.discardTitle', { name: name ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {text('sets.discardBody')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{text('sets.keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => answerDiscard(true)}
            >
              {text('sets.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RouteDrawer>
  );
}
