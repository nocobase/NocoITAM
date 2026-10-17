import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { apiErrorBody } from '@/lib/itam/api';
import {
  newRequestId,
  useDisposalApproverRange,
  useLifecycleDescription,
  useSaveDisposalApproverRange,
  type ApproverRange,
} from '@/lib/itam/lifecycle';
import { DISPOSALS_PATH } from '@/lib/itam/operations';
import { roleTitle } from '@/lib/itam/user-roles';

import { SettingsCard } from './settings-parts';

/**
 * 设置 → 报废流程 (2026-10-18, docs/adr/0001-record-lifecycles.md): the
 * disposal's lifecycle as declared in source, which nobody edits here, and
 * the one thing an administrator sets on it — whom a submitter may ask to
 * approve. The range narrows the people who hold disposal approval and
 * never widens them; it applies to the next submission, and a request
 * already waiting keeps the approver it asked.
 */
export default function DisposalFlowSettingsPage(): ReactElement {
  const { t } = useTranslation();
  const description = useLifecycleDescription(DISPOSALS_PATH);
  const range = useDisposalApproverRange(DISPOSALS_PATH);
  return (
    <PageContainer>
      <PageHeader
        title={t('settings.disposalFlow.title')}
        description={t('settings.disposalFlow.description')}
      />
      <div className='max-w-4xl space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.disposalFlow.diagram')}</CardTitle>
            <p className='text-sm text-muted-foreground'>
              {t('settings.disposalFlow.diagramHint')}
            </p>
          </CardHeader>
          <CardContent>
            {description.data ? (
              <LifecycleDiagram
                ariaLabel={t('lifecycle.diagram')}
                description={description.data}
                stateLabel={(state) => t(`enums.disposalStatus.${state.name}`)}
                transitionLabel={(transition) =>
                  t(`disposals.transitions.${transition.name}`)
                }
                endLabel={t('lifecycle.end')}
                direction='DOWN'
                autoHeight
              />
            ) : (
              <Skeleton className='h-96 w-full rounded-lg' />
            )}
          </CardContent>
        </Card>
        {range.data ? (
          <ApproverRangeCard range={range.data} />
        ) : (
          <Skeleton className='h-48 w-full rounded-lg' />
        )}
      </div>
    </PageContainer>
  );
}

function ApproverRangeCard({
  range,
}: {
  readonly range: ApproverRange;
}): ReactElement {
  const { t } = useTranslation();
  const save = useSaveDisposalApproverRange(DISPOSALS_PATH);
  const [roles, setRoles] = useState<ReadonlySet<string>>(
    () => new Set(range.roles),
  );
  const [users, setUsers] = useState<ReadonlySet<string>>(
    () => new Set(range.users),
  );
  // One key per save of these values, kept for its retries.
  const [requestId, setRequestId] = useState(newRequestId);
  const changed = () => setRequestId(newRequestId());
  const toggle =
    (set: (update: (current: ReadonlySet<string>) => Set<string>) => void) =>
    (key: string, checked: boolean) => {
      set((current) => {
        const next = new Set(current);
        if (checked) next.add(key);
        else next.delete(key);
        return next;
      });
      changed();
    };
  const conflict = apiErrorBody(save.error)?.rule === 'CONFLICT';
  return (
    <SettingsCard
      title={t('settings.disposalFlow.approvers')}
      description={t('settings.disposalFlow.approversHint')}
      // Against the version shown now: after a conflict the page has
      // loaded the newer one and keeps what was being written, so saving
      // again is a deliberate choice to replace it. A failed save takes a
      // new key, since the same key with other input is refused.
      // Nothing ticked is everyone who may approve (2026-10-18: a separate
      // choice for it was one step more saying the same thing).
      onSave={() =>
        save.mutate(
          {
            anyone: roles.size === 0 && users.size === 0,
            roles: [...roles],
            users: [...users],
            revision: range.revision,
            requestId,
          },
          { onError: changed },
        )
      }
      saving={save.isPending}
      error={conflict ? null : save.error}
      saved={save.isSuccess}
    >
      <div className='grid gap-6 sm:grid-cols-2'>
        <ChoiceList
          title={t('settings.disposalFlow.byRole')}
          options={range.roleOptions.map((role) => ({
            key: role.key,
            label: roleTitle(role, t),
          }))}
          chosen={roles}
          onToggle={toggle(setRoles)}
        />
        <ChoiceList
          title={t('settings.disposalFlow.byPerson')}
          options={range.userOptions.map((person) => ({
            key: person.id,
            label: person.name,
          }))}
          chosen={users}
          onToggle={toggle(setUsers)}
        />
      </div>
      <p className='text-sm text-muted-foreground'>
        {conflict
          ? t('settings.disposalFlow.conflict')
          : t('settings.disposalFlow.current', {
              names:
                range.approvers.map((person) => person.name).join('、') ||
                t('settings.disposalFlow.nobody'),
            })}
      </p>
    </SettingsCard>
  );
}

function ChoiceList({
  title,
  options,
  chosen,
  onToggle,
}: {
  readonly title: string;
  readonly options: readonly { readonly key: string; readonly label: string }[];
  readonly chosen: ReadonlySet<string>;
  readonly onToggle: (key: string, checked: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <fieldset className='space-y-2'>
      <legend className='mb-2 text-sm font-medium'>{title}</legend>
      {options.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{t('common.empty')}</p>
      ) : (
        options.map((option) => (
          <Label
            key={option.key}
            className='flex items-center gap-2 font-normal'
          >
            <Checkbox
              checked={chosen.has(option.key)}
              onCheckedChange={(checked) => onToggle(option.key, checked)}
            />
            {option.label}
          </Label>
        ))
      )}
    </fieldset>
  );
}
