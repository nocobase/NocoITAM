import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/button';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly icon?: LucideIcon;
}

/**
 * One choice of a few, side by side in a bordered frame, the chosen one
 * filled (2026-10-22): the workbench's 看板 · 列表 and 全部 · 我的, and the
 * lists' same switches, which were an icon-only button group and tabs until
 * then. Every option says its name, its icon before it.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly SegmentedOption<T>[];
  /** What is being chosen, for assistive technology. */
  readonly label: string;
}): ReactElement {
  return (
    <div
      role='radiogroup'
      aria-label={label}
      className='inline-flex shrink-0 rounded-lg border border-border p-0.5'
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <Button
            key={option.value}
            role='radio'
            aria-checked={value === option.value}
            // The chosen one filled: a light tint was too faint to tell
            // which was on.
            variant={value === option.value ? 'default' : 'ghost'}
            className='h-7 px-2.5'
            onClick={() => onChange(option.value)}
          >
            {Icon ? <Icon data-icon='inline-start' /> : null}
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
