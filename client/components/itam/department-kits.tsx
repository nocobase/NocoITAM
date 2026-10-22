import { useTranslation } from '@nocobase/i18n/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CornerLeftUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { apiErrorBody, masterDataPath, useApi } from '@/lib/itam/api';
import { errorMessage } from '@/lib/itam/format';
import { useCollectionPermissions } from '@/lib/itam/permissions';
import { samePosition } from '@/lib/itam/positions';

import { ConfirmDialog } from './confirm-dialog.js';
import { KitItems } from './kit-items.js';
import { RecordLink } from './record-link.js';

/** Mirrors `DepartmentKits` in `server/providers/itam/onboarding.ts`. */
interface KitSummary {
  readonly id: string;
  readonly name: string;
  readonly departmentId: string;
  readonly position: string | null;
  readonly items: unknown;
}
interface DepartmentKitsData {
  readonly department: { readonly id: string; readonly name: string };
  readonly defaultKit: KitSummary | null;
  readonly inherited: {
    readonly department: { readonly id: string; readonly name: string };
    readonly kit: KitSummary;
  } | null;
  readonly inheritable: boolean;
  readonly positions: readonly {
    readonly name: string;
    readonly kit: KitSummary | null;
    readonly holders: number;
  }[];
}

/**
 * A department's 入职配置 (2026-10-06): its default kit, and its positions,
 * each taking the default or a kit of its own. The kits stay what they were —
 * one per department and position, the position's name matching a person's
 * — and only their home moved here from a page of their own. With no
 * default of its own a department takes its parent's, which is shown and
 * may be copied to start one.
 */
export function DepartmentKits({
  departmentId,
}: {
  readonly departmentId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const kitsPath = masterDataPath('onboardingKits');
  const departmentsPath = masterDataPath('departments');
  const query = useQuery({
    queryKey: ['itam', departmentsPath, departmentId, 'onboarding-kits'],
    queryFn: async () =>
      (
        await api.request<{ data: DepartmentKitsData | null }>({
          path: `${departmentsPath}/${departmentId}/onboarding-kits`,
        })
      ).data,
  });
  const [confirmingInherit, setConfirmingInherit] = useState(false);
  // The position asked to be removed, until the reader confirms.
  const [removing, setRemoving] = useState<{
    readonly name: string;
    readonly hasKit: boolean;
  }>();
  const kits = useCollectionPermissions('onboardingKits', [
    'create',
    'update',
    'delete',
  ]);
  const departments = useCollectionPermissions('departments', ['update']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState('');
  // The position being renamed, and the name typed so far.
  const [renaming, setRenaming] = useState<{
    readonly from: string;
    readonly value: string;
  }>();
  const data = query.data;
  if (!data) return null;

  const run = async (act: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await act();
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
    } catch (caught) {
      setError(apiErrorBody(caught)?.message ?? errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };
  // A new position's kit starts as a copy of what it would get anyway.
  const baseItems = data.defaultKit?.items ?? data.inherited?.kit.items ?? [];
  const createKit = (position: string | null, items: unknown) =>
    api.request({
      path: kitsPath,
      method: 'POST',
      json: {
        name: position
          ? t('departmentKits.positionKitName', {
              department: data.department.name,
              position,
            })
          : t('departmentKits.defaultKitName', {
              department: data.department.name,
            }),
        departmentId,
        ...(position ? { position } : {}),
        items,
      },
    });
  const deleteKit = (id: string) =>
    api.request({ path: `${kitsPath}/${id}`, method: 'DELETE' });
  const saveItems = async (id: string, items: Record<string, unknown>[]) => {
    try {
      await api.request({
        path: `${kitsPath}/${id}`,
        method: 'PATCH',
        json: { items },
      });
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
    } catch (caught) {
      throw new Error(apiErrorBody(caught)?.message ?? errorMessage(caught), {
        cause: caught,
      });
    }
  };
  const setPositions = (positions: readonly string[]) =>
    api.request({
      path: `${departmentsPath}/${departmentId}`,
      method: 'PATCH',
      json: { positions },
    });
  const names = data.positions.map((position) => position.name);
  // The department already has a position by that name.
  const taken =
    draft.trim() !== '' && names.some((known) => samePosition(known, draft));
  // Another position has the name typed; the same one recased does not.
  const renameTaken = Boolean(
    renaming?.value.trim() &&
    names.some(
      (known) =>
        !samePosition(known, renaming.from) &&
        samePosition(known, renaming.value),
    ),
  );
  /** Saves a rename (2026-10-22); its holders and its kit follow it. */
  const finishRename = () => {
    if (!renaming) return;
    const to = renaming.value.trim();
    const { from } = renaming;
    if (!to || to === from || renameTaken) {
      if (!renameTaken) setRenaming(undefined);
      return;
    }
    setRenaming(undefined);
    void run(() =>
      api.request({
        path: `${departmentsPath}/${departmentId}/positions/rename`,
        method: 'POST',
        json: { from, to },
      }),
    );
  };
  const addPosition = () => {
    const name = draft.trim();
    if (!name || names.some((known) => samePosition(known, name))) return;
    void run(async () => {
      await setPositions([...names, name]);
      setDraft('');
    });
  };

  return (
    <div className='space-y-4'>
      {/* Removing a position is asked first: its own kit goes with it. */}
      <ConfirmDialog
        open={removing !== undefined}
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        title={t('departmentKits.removePositionTitle', {
          position: removing?.name ?? '',
        })}
        description={
          removing?.hasKit
            ? t('departmentKits.removePositionWithKit')
            : undefined
        }
        destructive
        confirmLabel={t('departmentKits.removePosition')}
        busy={busy}
        onConfirm={() => {
          const name = removing?.name;
          setRemoving(undefined);
          if (name)
            void run(() =>
              setPositions(names.filter((known) => !samePosition(known, name))),
            );
        }}
      />
      {/* Falling back deletes this department's own kit: asked first. */}
      <ConfirmDialog
        open={confirmingInherit}
        onOpenChange={setConfirmingInherit}
        title={t('departmentKits.inheritConfirmTitle')}
        description={t('departmentKits.removeDefaultHint')}
        confirmLabel={t('departmentKits.removeDefault')}
        busy={busy}
        onConfirm={() => {
          const id = String(data.defaultKit?.id);
          setConfirmingInherit(false);
          void run(() => deleteKit(id));
        }}
      />
      {/* 部门默认配置: the department's own, or the one it takes from above. */}
      {data.defaultKit ? (
        <KitItems
          key={`default:${JSON.stringify(data.defaultKit.items)}`}
          title={t('departmentKits.default')}
          value={data.defaultKit.items}
          editable={Boolean(kits.update)}
          onSave={(items) => saveItems(String(data.defaultKit?.id), items)}
          actions={
            // Only with a kit above to take (2026-10-21): a top-level
            // department, or one whose parents have none, keeps its own.
            kits.delete && data.inheritable ? (
              <Button
                variant='ghost'
                // Its padding taken back on the side by 编辑 (2026-10-22).
                className='-mr-2.5 text-muted-foreground'
                disabled={busy}
                title={t('departmentKits.removeDefaultHint')}
                onClick={() => setConfirmingInherit(true)}
              >
                <CornerLeftUp data-icon='inline-start' />
                {t('departmentKits.removeDefault')}
              </Button>
            ) : null
          }
        />
      ) : (
        <Card className='py-0'>
          <CardContent className='space-y-3 p-4'>
            <div className='flex min-h-9 items-center gap-3 border-b border-border/60 pb-2'>
              <h2 className='font-heading text-sm font-semibold'>
                {t('departmentKits.default')}
              </h2>
              <span className='flex-1' />
              {kits.create ? (
                <Button
                  variant='outline'
                  disabled={busy}
                  onClick={() => void run(() => createKit(null, baseItems))}
                >
                  <Plus data-icon='inline-start' />
                  {t('departmentKits.setDefault')}
                </Button>
              ) : null}
            </div>
            {data.inherited ? (
              <>
                <p className='text-sm text-muted-foreground'>
                  {t('departmentKits.inherits')}{' '}
                  <RecordLink
                    to={`/departments/${data.inherited.department.id}/onboarding`}
                    className='text-link underline-offset-4 hover:underline'
                  >
                    {data.inherited.department.name}
                  </RecordLink>
                </p>
                <KitItems
                  key={`inherited:${data.inherited.kit.id}`}
                  title={t('departmentKits.inherited', {
                    department: data.inherited.department.name,
                  })}
                  value={data.inherited.kit.items}
                  editable={false}
                  onSave={async () => {}}
                />
              </>
            ) : (
              <p className='text-sm text-muted-foreground'>
                {t('departmentKits.noDefault')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 职位: each takes the default or a kit of its own. */}
      <Card className='py-0'>
        <CardContent className='space-y-3 p-4'>
          <div className='flex min-h-9 items-center border-b border-border/60 pb-2'>
            <h2 className='font-heading text-sm font-semibold'>
              {t('departmentKits.positions')}
            </h2>
          </div>
          {data.positions.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('departmentKits.noPositions')}
            </p>
          ) : (
            <ul className='space-y-3'>
              {data.positions.map((position) => {
                const custom = Boolean(position.kit);
                // Switching to the default deletes the position's own kit,
                // and switching to its own creates one.
                const canSwitch = custom ? kits.delete : kits.create;
                return (
                  <li key={position.name} className='space-y-2'>
                    <div className='group/position flex flex-wrap items-center gap-2 text-sm'>
                      {renaming?.from === position.name ? (
                        // Renamed in place: Enter or leaving the field
                        // saves, Escape keeps the old name.
                        <Input
                          autoFocus
                          className='h-8 min-w-0 flex-1'
                          value={renaming.value}
                          aria-label={t('departmentKits.renamePosition')}
                          aria-invalid={renameTaken || undefined}
                          onChange={(event) =>
                            setRenaming({
                              from: position.name,
                              value: event.target.value,
                            })
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              finishRename();
                            }
                            if (event.key === 'Escape') {
                              event.preventDefault();
                              setRenaming(undefined);
                            }
                          }}
                          onBlur={finishRename}
                        />
                      ) : (
                        <span className='flex min-w-0 flex-1 items-center gap-1'>
                          <span className='truncate font-medium'>
                            {position.name}
                          </span>
                          <span className='ml-1 shrink-0 text-xs text-muted-foreground tabular-nums'>
                            {t('departmentKits.holders', {
                              count: position.holders,
                            })}
                          </span>
                          {departments.update ? (
                            // On hover, as a row's other quiet actions
                            // (2026-10-22): held or not, a position may be
                            // renamed.
                            <Button
                              size='icon-sm'
                              variant='ghost'
                              className='text-muted-foreground opacity-0 group-hover/position:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'
                              aria-label={t('departmentKits.renamePosition')}
                              title={t('departmentKits.renamePosition')}
                              disabled={busy}
                              onClick={() =>
                                setRenaming({
                                  from: position.name,
                                  value: position.name,
                                })
                              }
                            >
                              <Pencil />
                            </Button>
                          ) : null}
                        </span>
                      )}
                      {/* Off: the position takes the department's kit.
                          On: it has its own, starting as a copy of that one;
                          switching off again deletes it. */}
                      <label className='flex shrink-0 items-center gap-2 text-xs text-muted-foreground'>
                        <Switch
                          checked={custom}
                          disabled={busy || !canSwitch}
                          onCheckedChange={(next) => {
                            if (next && !custom)
                              void run(() =>
                                createKit(position.name, baseItems),
                              );
                            if (!next && position.kit)
                              void run(() =>
                                deleteKit(String(position.kit?.id)),
                              );
                          }}
                        />
                        {t('departmentKits.useCustom')}
                      </label>
                      {departments.update ? (
                        // The reason in a tooltip on a wrapper (2026-10-22): a
                        // disabled button takes no pointer, and the browser's
                        // own title did not show in every browser.
                        <Tooltip>
                          <TooltipTrigger
                            render={<span className='inline-flex' />}
                          >
                            <Button
                              size='icon'
                              variant='ghost'
                              aria-label={t('departmentKits.removePosition')}
                              disabled={busy || position.holders > 0}
                              onClick={() =>
                                setRemoving({
                                  name: position.name,
                                  hasKit: Boolean(position.kit),
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {position.holders > 0
                              ? t('departmentKits.positionInUse', {
                                  count: position.holders,
                                })
                              : t('departmentKits.removePosition')}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </div>
                    {renaming?.from === position.name && renameTaken ? (
                      <p className='text-sm text-destructive'>
                        {t('departmentKits.positionTaken')}
                      </p>
                    ) : null}
                    {position.kit ? (
                      <KitItems
                        key={`${position.kit.id}:${JSON.stringify(position.kit.items)}`}
                        title={t('departmentKits.positionKit', {
                          position: position.name,
                        })}
                        value={position.kit.items}
                        // Set apart from the positions list it sits in
                        // (2026-10-22).
                        className='bg-muted/60'
                        editable={Boolean(kits.update)}
                        onSave={(items) =>
                          saveItems(String(position.kit?.id), items)
                        }
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {departments.update ? (
            <div className='grid gap-1.5 border-t border-border/60 pt-3'>
              <div className='flex gap-2'>
                <Input
                  value={draft}
                  placeholder={t('positions.newPlaceholder')}
                  aria-label={t('positions.newPlaceholder')}
                  aria-invalid={taken || undefined}
                  aria-describedby={taken ? 'position-taken' : undefined}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addPosition();
                    }
                  }}
                />
                <Button
                  variant='outline'
                  disabled={busy || !draft.trim() || taken}
                  onClick={addPosition}
                >
                  <Plus data-icon='inline-start' />
                  {t('departmentKits.addPosition')}
                </Button>
              </div>
              {/* Why 添加职位 is off (2026-10-22): a name the department has. */}
              {taken ? (
                <p id='position-taken' className='text-sm text-destructive'>
                  {t('departmentKits.positionTaken')}
                </p>
              ) : null}
            </div>
          ) : null}
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
