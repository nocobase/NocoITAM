import { useTranslation } from '@nocobase/i18n/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CornerLeftUp, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  apiErrorBody,
  masterDataPath,
  useApi,
  useItamRecord,
  type ItamRecord,
} from '@/lib/itam/api';
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
  // Only a department under another can fall back to its parent's kit.
  const department = useItamRecord<ItamRecord>(departmentsPath, departmentId);
  const hasParent = Boolean(department.data?.parentId);
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
            // A top-level department has nothing above it to take a kit
            // from, so it keeps its own.
            kits.delete && hasParent ? (
              <Button
                variant='ghost'
                className='text-muted-foreground'
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
                    <div className='flex flex-wrap items-center gap-2 text-sm'>
                      <span className='min-w-0 flex-1 truncate font-medium'>
                        {position.name}
                        <span className='ml-2 text-xs font-normal text-muted-foreground tabular-nums'>
                          {t('departmentKits.holders', {
                            count: position.holders,
                          })}
                        </span>
                      </span>
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
                        <Button
                          size='icon'
                          variant='ghost'
                          aria-label={t('departmentKits.removePosition')}
                          title={
                            position.holders > 0
                              ? t('departmentKits.positionInUse', {
                                  count: position.holders,
                                })
                              : t('departmentKits.removePosition')
                          }
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
                      ) : null}
                    </div>
                    {position.kit ? (
                      <KitItems
                        key={`${position.kit.id}:${JSON.stringify(position.kit.items)}`}
                        title={t('departmentKits.positionKit', {
                          position: position.name,
                        })}
                        value={position.kit.items}
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
            <div className='flex gap-2 border-t border-border/60 pt-3'>
              <Input
                value={draft}
                placeholder={t('positions.newPlaceholder')}
                aria-label={t('positions.newPlaceholder')}
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
                disabled={
                  busy ||
                  !draft.trim() ||
                  names.some((known) => samePosition(known, draft))
                }
                onClick={addPosition}
              >
                <Plus data-icon='inline-start' />
                {t('departmentKits.addPosition')}
              </Button>
            </div>
          ) : null}
          {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
