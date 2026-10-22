import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly icon?: LucideIcon;
}

/**
 * One choice of a few, side by side in a bordered frame, the chosen one
 * filled (2026-10-22): the workbench's 看板 · 列表 and 全部 · 我的, and the
 * lists' same switches, which were an icon-only button group and tabs until
 * then. Every option says its name, its icon before it — or, `iconOnly`,
 * its icon alone, the name in a tooltip and for assistive technology: a
 * view's switch (看板 · 列表), whose icons say it (2026-10-22).
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  iconOnly = false,
}: {
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly SegmentedOption<T>[];
  /** What is being chosen, for assistive technology. */
  readonly label: string;
  readonly iconOnly?: boolean;
}): ReactElement {
  return (
    <div
      role='radiogroup'
      aria-label={label}
      className='inline-flex shrink-0 rounded-lg border border-border p-0.5'
    >
      {options.map((option) => {
        const Icon = option.icon;
        const button = (
          <Button
            key={option.value}
            role='radio'
            aria-checked={value === option.value}
            aria-label={
              iconOnly && typeof option.label === 'string'
                ? option.label
                : undefined
            }
            // The chosen one filled: a light tint was too faint to tell
            // which was on.
            variant={value === option.value ? 'default' : 'ghost'}
            className={iconOnly && Icon ? 'size-7 px-0' : 'h-7 px-2.5'}
            onClick={() => onChange(option.value)}
          >
            {Icon ? (
              <Icon data-icon={iconOnly ? undefined : 'inline-start'} />
            ) : null}
            {iconOnly && Icon ? null : option.label}
          </Button>
        );
        return iconOnly && Icon ? (
          <Tooltip key={option.value}>
            <TooltipTrigger render={button} />
            <TooltipContent>{option.label}</TooltipContent>
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
