import { ChevronDownIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '#components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Switch } from '#components/ui/switch';

export interface PermissionEditorLevel {
  readonly value: string;
  readonly label: string;
}

export interface PermissionEditorRow {
  /** Unique across the editor; also the switch's DOM id. */
  readonly id: string;
  readonly label: string;
  readonly hint?: string | undefined;
  readonly enabled: boolean;
  /** The levels a switched-on row can reach. None leaves the right column empty. */
  readonly levels?: readonly PermissionEditorLevel[] | undefined;
  /** The current level, one of `levels`' values. */
  readonly level?: string | undefined;
}

export interface PermissionEditorGroup {
  readonly id: string;
  /** Rendered as a subheading above the rows; rows without one follow the previous group directly. */
  readonly title?: string | undefined;
  readonly rows: readonly PermissionEditorRow[];
}

export interface PermissionEditorSection {
  readonly id: string;
  /**
   * The collapsible heading. Application change: left out, the rows sit in a plain bordered panel, for a section
   * whose heading would only repeat what surrounds the editor (a permission set's area tab, which holds one section).
   */
  readonly title?: string | undefined;
  readonly groups: readonly PermissionEditorGroup[];
  /** A note under the section's rows. */
  readonly footer?: ReactNode;
}

export interface PermissionEditorLabels {
  /** The accessible name of a row's level select. */
  readonly levelFor: (rowLabel: string) => string;
}

export interface PermissionEditorProps {
  readonly sections: readonly PermissionEditorSection[];
  readonly readOnly?: boolean | undefined;
  readonly onEnabledChange: (rowId: string, enabled: boolean) => void;
  readonly onLevelChange: (rowId: string, level: string) => void;
  readonly labels?: Partial<PermissionEditorLabels> | undefined;
}

const DEFAULT_LABELS: PermissionEditorLabels = {
  levelFor: (rowLabel) => `How far ${rowLabel} reaches`,
};

function LevelControl({
  label,
  levels,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly levels: readonly PermissionEditorLevel[];
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}): ReactElement | null {
  if (levels.length === 0) return null;
  if (levels.length === 1)
    return (
      <span className='block truncate px-2.5 text-sm text-muted-foreground'>
        {levels[0]?.label}
      </span>
    );
  return (
    <Select
      items={levels}
      value={value}
      disabled={disabled}
      onValueChange={(next: string | null) => {
        if (next !== null) onChange(next);
      }}
    >
      <SelectTrigger size='sm' className='w-full' aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      {/* As wide as its options, up to max-w-sm, wrapping a long one (I12). */}
      <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
        {levels.map((level) => (
          <SelectItem key={level.value} value={level.value}>
            {level.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PermissionRow({
  row,
  readOnly,
  labels,
  onEnabledChange,
  onLevelChange,
}: {
  readonly row: PermissionEditorRow;
  readonly readOnly: boolean;
  readonly labels: PermissionEditorLabels;
  readonly onEnabledChange: (rowId: string, enabled: boolean) => void;
  readonly onLevelChange: (rowId: string, level: string) => void;
}): ReactElement {
  return (
    <div
      data-slot='permission-row'
      className='grid min-h-11 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 py-1.5 @lg:grid-cols-[auto_minmax(0,1fr)_14rem]'
    >
      <Switch
        id={row.id}
        checked={row.enabled}
        disabled={readOnly}
        onCheckedChange={(on) => onEnabledChange(row.id, on)}
      />
      {/* Application change: a row with no levels at all takes the levels'
          column too, so its label does not wrap beside an empty column. */}
      <label
        htmlFor={row.id}
        className={`min-w-0 text-sm ${row.levels ? '' : '@lg:col-span-2'}`}
      >
        <span className='block'>{row.label}</span>
        {row.hint ? (
          <span className='block text-xs text-muted-foreground'>
            {row.hint}
          </span>
        ) : null}
      </label>
      {/* Below the label in a narrow editor, in its own column once there is room. */}
      {row.levels ? (
        <div className='col-start-2 max-w-56 min-w-0 empty:hidden @lg:col-start-auto @lg:max-w-none @lg:text-right'>
          {row.enabled ? (
            <LevelControl
              label={labels.levelFor(row.label)}
              levels={row.levels}
              value={row.level ?? ''}
              disabled={readOnly}
              onChange={(level) => onLevelChange(row.id, level)}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Sections of switch rows, each open at first, with an optional level per row. */
export function PermissionEditor({
  sections,
  readOnly = false,
  onEnabledChange,
  onLevelChange,
  labels,
}: PermissionEditorProps): ReactElement {
  const words = { ...DEFAULT_LABELS, ...labels };
  return (
    <div className='@container space-y-4'>
      {sections.map((section) => {
        const rows = (
          <>
            {section.groups.map((group) => (
              <div key={group.id}>
                {group.title ? (
                  <h3 className='pt-4 pb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase'>
                    {group.title}
                  </h3>
                ) : null}
                {/* Application change: a group of bare switches (no levels, no
                    hints, such as View, Create, Edit, Delete) sits side by
                    side, wrapping, instead of a row each. */}
                {group.rows.every((row) => !row.levels && !row.hint) ? (
                  <div className='flex flex-wrap gap-x-6 py-1.5'>
                    {group.rows.map((row) => (
                      <div
                        key={row.id}
                        data-slot='permission-row'
                        className='flex min-h-9 items-center gap-3'
                      >
                        <Switch
                          id={row.id}
                          checked={row.enabled}
                          disabled={readOnly}
                          onCheckedChange={(on) => onEnabledChange(row.id, on)}
                        />
                        <label htmlFor={row.id} className='text-sm'>
                          {row.label}
                        </label>
                      </div>
                    ))}
                  </div>
                ) : (
                  group.rows.map((row) => (
                    <PermissionRow
                      key={row.id}
                      row={row}
                      readOnly={readOnly}
                      labels={words}
                      onEnabledChange={onEnabledChange}
                      onLevelChange={onLevelChange}
                    />
                  ))
                )}
              </div>
            ))}
            {section.footer ? (
              <p className='pt-3 text-xs text-muted-foreground'>
                {section.footer}
              </p>
            ) : null}
          </>
        );
        if (!section.title)
          return (
            <div key={section.id} className='rounded-lg border px-4 pt-1 pb-3'>
              {rows}
            </div>
          );
        return (
          <Collapsible
            key={section.id}
            defaultOpen
            className='rounded-lg border'
          >
            <h2>
              <CollapsibleTrigger className='group flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold'>
                <ChevronDownIcon className='size-4 -rotate-90 text-muted-foreground transition-transform group-data-[panel-open]:rotate-0' />
                {section.title}
              </CollapsibleTrigger>
            </h2>
            <CollapsibleContent className='border-t px-4 pt-1 pb-3'>
              {rows}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
