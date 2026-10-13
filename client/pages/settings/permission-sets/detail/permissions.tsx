// A permission set's Permissions tab: everything the catalog offers, as
// switch rows under their sections (Pages, Business operations,
// Administration), a data-scoped business action with how far it reaches.
// Switching edits a draft; the sticky bar saves the whole set, after
// checking nobody changed it since it was loaded (guideline R1). Leaving
// with unsaved changes asks first (the application's synchronous
// navigation guard, so the browser's confirm; and `beforeunload`).
import { useNavigationGuard, useToaster } from '@nocobase/app-client';
import {
  useAuthorizationClient,
  type PermissionGrant,
} from '@nocobase/app-plugin-authorization/client';
import { AlertCircleIcon, InfoIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { Outlet, useOutletContext } from 'react-router';

import {
  PermissionEditor,
  type PermissionEditorGroup,
  type PermissionEditorSection,
} from '#components/permission-editor';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import { LoadFailure } from '../../shared.js';
import { errorStatus, useAdminText, useLocalized } from '../../hooks.js';
import {
  grantsSignature,
  setFailure,
  useGrantablePages,
  useOptions,
  useSetActions,
  useSetTitle,
  type Options,
  type PermissionSetPageContext,
} from '../data.js';
import { isOn, levelOf, setLevel, toggle, type DataScope } from './grants.js';

/** What a row of the editor stands for. */
interface RowTarget {
  readonly type: string;
  readonly id: string;
  readonly action: string;
  readonly scope?: DataScope;
}

export default function PermissionsTab(): ReactElement {
  const context = useOutletContext<PermissionSetPageContext>();
  const { text } = useAdminText();
  const options = useOptions();
  const can = useSetActions();
  const { set } = context;

  let body: ReactElement;
  if (set.unrestricted) {
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
  } else if (!options.data) {
    body = (
      <div
        role='status'
        aria-label={text('common.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-6 w-32' />
        <Skeleton className='h-40 w-full' />
        <Skeleton className='h-40 w-full' />
      </div>
    );
  } else {
    body = (
      <GrantsEditor
        // A set saved elsewhere starts the editor over (see below).
        key={set.key}
        context={context}
        options={options.data}
        readOnly={!can('update', set)}
      />
    );
  }

  return (
    <div className='flex max-w-4xl flex-col gap-6'>
      {body}
      {/* The header's Rename renders here, over this tab. */}
      <Outlet context={context} />
    </div>
  );
}

function GrantsEditor({
  context,
  options,
  readOnly,
}: {
  readonly context: PermissionSetPageContext;
  readonly options: Options;
  readonly readOnly: boolean;
}): ReactElement {
  const { set, reload } = context;
  const { text } = useAdminText();
  const localized = useLocalized();
  const title = useSetTitle();
  const authz = useAuthorizationClient();
  const toaster = useToaster();
  const pages = useGrantablePages();

  // What the draft started from, and the draft.
  const [baseline, setBaseline] = useState<readonly PermissionGrant[]>(
    set.grants,
  );
  const [draft, setDraft] = useState<readonly PermissionGrant[]>(set.grants);
  const dirty = grantsSignature(draft) !== grantsSignature(baseline);
  // The page refetched the set (after a rename, or a save): start over from it while nothing is being changed.
  const [seen, setSeen] = useState(() => grantsSignature(set.grants));
  const incoming = grantsSignature(set.grants);
  if (incoming !== seen) {
    setSeen(incoming);
    if (!dirty) {
      setBaseline(set.grants);
      setDraft(set.grants);
    }
  }

  const [saving, setSaving] = useState(false);
  const [failureText, setFailureText] = useState<string>();
  const [stale, setStale] = useState(false);

  // Leaving with unsaved changes asks; a reload warns.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  // Only leaving asks: the page's own moves (opening Rename over this tab, the way back after a delete) are let
  // through, as is closing that overlay, which returns to this tab with the draft still here.
  useNavigationGuard(
    () =>
      !dirtyRef.current ||
      context.consumeAllowedNavigation() ||
      window.location.pathname.endsWith('/permissions/edit') ||
      window.confirm(text('sets.leaveConfirm')),
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const recordAccessTitle = useMemo(
    () =>
      new Map(
        options.recordAccess.map((item) => [
          item.key,
          localized(item.title, item.key),
        ]),
      ),
    [options.recordAccess, localized],
  );

  // The editor's rows, and what each stands for; row ids are DOM ids, so they are counters.
  const { headings, targets } = useMemo(() => {
    const targets = new Map<string, RowTarget>();
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
              title: group.title,
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
      return {
        name: section.name,
        title:
          section.name === 'pages' ||
          section.name === 'business' ||
          section.name === 'administration'
            ? text(`sets.headings.${section.name}`)
            : localized(section.title, section.name),
        sections: editorSections,
      };
    });
    return { headings, targets };
  }, [options.sections, pages, localized, text]);

  // The rows as the draft has them now.
  const live = headings.map((heading) => ({
    ...heading,
    sections: heading.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        rows: group.rows.map((row) => {
          const target = targets.get(row.id)!;
          const enabled = isOn(draft, target.type, target.id, target.action);
          if (!target.scope) return { ...row, enabled };
          const level = levelOf(
            draft,
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
    })),
  }));

  async function save(): Promise<void> {
    setSaving(true);
    setFailureText(undefined);
    try {
      // Written from the latest version only (guideline R1).
      const fresh = await authz.getPermissionSet(set.key);
      if (grantsSignature(fresh.grants) !== grantsSignature(baseline)) {
        setStale(true);
        return;
      }
      const saved = await authz.updatePermissionSet(set.key, {
        key: set.key,
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
      reload();
    } catch (caught: unknown) {
      if (errorStatus(caught) === 404) reload();
      setFailureText(setFailure(caught, text));
    } finally {
      setSaving(false);
    }
  }

  const locked = readOnly || saving;
  return (
    <>
      {readOnly && set.protection ? (
        <Alert>
          <InfoIcon />
          <AlertDescription>{text('sets.readOnly')}</AlertDescription>
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
                setBaseline(set.grants);
                setDraft(set.grants);
                reload();
              }}
            >
              {text('sets.reload')}
            </Button>
          </AlertAction>
        </Alert>
      ) : null}
      {live.map((heading) =>
        heading.sections.length === 0 ? null : (
          <section key={heading.name} className='flex flex-col gap-3'>
            <h2 className='text-base font-medium'>{heading.title}</h2>
            <PermissionEditor
              sections={heading.sections}
              readOnly={locked}
              labels={{
                levelFor: (label) => text('sets.levelFor', { name: label }),
              }}
              onEnabledChange={(id, on) => {
                const target = targets.get(id);
                if (!target) return;
                setDraft((current) =>
                  toggle(
                    current,
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
                setDraft((current) =>
                  setLevel(
                    current,
                    target.type,
                    target.id,
                    target.action,
                    scope,
                    level,
                  ),
                );
              }}
            />
          </section>
        ),
      )}
      {dirty && !readOnly ? (
        <div className='sticky bottom-0 z-10 -mx-1 flex flex-col gap-2 border-t border-border bg-background/95 px-1 py-3 backdrop-blur'>
          {failureText ? (
            <Alert variant='destructive'>
              <AlertCircleIcon />
              <AlertDescription>{failureText}</AlertDescription>
            </Alert>
          ) : null}
          <div className='flex flex-wrap items-center justify-end gap-2'>
            <span className='mr-auto text-sm text-muted-foreground'>
              {text('sets.unsaved')}
            </span>
            <Button
              variant='outline'
              disabled={saving}
              onClick={() => {
                setDraft(baseline);
                setFailureText(undefined);
              }}
            >
              {text('sets.discard')}
            </Button>
            <Button disabled={saving || stale} onClick={() => void save()}>
              {saving ? <Spinner data-icon='inline-start' /> : null}
              {text('common.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
