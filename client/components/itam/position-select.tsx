import { useTranslation } from '@nocobase/i18n/client';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState, type PointerEvent, type ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  apiErrorBody,
  masterDataPath,
  useApi,
  useItamRecord,
} from '@/lib/itam/api';
import { errorMessage, text } from '@/lib/itam/format';
import { positionsOf, samePosition } from '@/lib/itam/positions';
import { useCollectionPermissions } from '@/lib/itam/permissions';

/** The choice that opens the field for a position the list lacks. */
const NEW = '\u0000new';

/**
 * A person's 职位, chosen from their department's positions (2026-10-06), so
 * it is always spelled the way a position's 入职配置 is attached to it. A
 * position the department does not have yet is added from here by whoever
 * may edit the department; one already on the record and missing from the
 * list (written before the list existed) stays readable as a choice.
 */
export function PositionSelect({
  departmentId,
  value,
  onChange,
  disabled,
  autoFocus,
  id,
  onBlur,
  onDismiss,
}: {
  readonly departmentId: string | null | undefined;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly id?: string;
  readonly onBlur?: () => void;
  readonly onDismiss?: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const path = masterDataPath('departments');
  const department = useItamRecord(path, departmentId ?? undefined);
  const permissions = useCollectionPermissions('departments', ['update']);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const positions = positionsOf(department.data?.positions);
  const current = text(value);
  const names =
    current && !positions.some((name) => samePosition(name, current))
      ? [...positions, current]
      : positions;

  if (!departmentId)
    return (
      <Select items={[]} value={null} disabled>
        <SelectTrigger id={id} className='w-full'>
          <SelectValue placeholder={t('positions.pickDepartment')} />
        </SelectTrigger>
        <SelectContent />
      </Select>
    );

  const add = async () => {
    const name = draft.trim();
    if (!name) return;
    setSaving(true);
    setError(undefined);
    try {
      if (!positions.some((known) => samePosition(known, name)))
        await api.request({
          path: `${path}/${departmentId}`,
          method: 'PATCH',
          json: { positions: [...positions, name] },
        });
      await queryClient.invalidateQueries({ queryKey: ['itam', path] });
      onChange(positions.find((known) => samePosition(known, name)) ?? name);
      setAdding(false);
      setDraft('');
    } catch (caught) {
      setError(apiErrorBody(caught)?.message ?? errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  if (adding)
    return (
      <div className='grid gap-1'>
        <div className='flex gap-2'>
          <Input
            id={id}
            autoFocus
            value={draft}
            placeholder={t('positions.newPlaceholder')}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void add();
              }
            }}
          />
          <Button
            size='sm'
            disabled={saving || !draft.trim()}
            onClick={() => void add()}
          >
            {t('positions.add')}
          </Button>
          <Button
            size='sm'
            variant='ghost'
            disabled={saving}
            onClick={() => {
              setAdding(false);
              setError(undefined);
            }}
          >
            {t('actions.cancel')}
          </Button>
        </div>
        {error ? <p className='text-xs text-destructive'>{error}</p> : null}
      </div>
    );

  const items = [
    ...names.map((name) => ({ value: name, label: name })),
    ...(permissions.update
      ? [{ value: NEW, label: t('positions.addToDepartment') }]
      : []),
  ];
  const clearable = Boolean(current) && !disabled;
  return (
    <Select
      items={items}
      value={current || null}
      onValueChange={(next) => {
        if (next === NEW) setAdding(true);
        else onChange(next === null ? null : next);
      }}
      disabled={disabled}
      defaultOpen={autoFocus}
      onOpenChange={(open) => {
        if (!open) onDismiss?.();
      }}
    >
      <SelectTrigger id={id} className='w-full' onBlur={onBlur}>
        <SelectValue
          placeholder={
            names.length > 0 ? t('common.select') : t('positions.none')
          }
        />
        {clearable ? (
          <X
            className='size-3.5 opacity-60 hover:opacity-100'
            aria-label={t('common.clear')}
            onPointerDown={(event: PointerEvent<SVGSVGElement>) => {
              event.preventDefault();
              event.stopPropagation();
              onChange(null);
            }}
          />
        ) : null}
      </SelectTrigger>
      <SelectContent>
        {names.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
        {permissions.update ? (
          <>
            {names.length > 0 ? <SelectSeparator /> : null}
            <SelectItem value={NEW}>
              {/* Centred together: the item's text box lays its children
                  out in a row without centring them. */}
              <span className='flex items-center gap-1.5'>
                <Plus className='size-3.5' aria-hidden='true' />
                {t('positions.addToDepartment')}
              </span>
            </SelectItem>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}
