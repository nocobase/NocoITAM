import { useTranslation } from '@nocobase/i18n/client';
import { FunnelIcon, XIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Input } from '#components/ui/input';

// A tree's levels, each a step further in; the deepest levels share the last.
const DEPTH_INDENT = ['', 'pl-5', 'pl-8', 'pl-11', 'pl-14'] as const;

/** One thing a list filters by, such as a device's status. */
export interface FilterDimension {
  readonly key: string;
  readonly label: string;
  readonly options: readonly {
    readonly value: string;
    readonly label: string;
    /** How deep the value sits in a tree (a location under its site), indenting it. */
    readonly depth?: number;
  }[];
  /** The value applied, or null. */
  readonly value: string | null;
  /** The applied value's label when it is not among `options` (a model beyond the first page). */
  readonly valueLabel?: string;
  readonly onChange: (value: string | null) => void;
  /** A search box at the top of the values, for a long list (models, vendors) the caller narrows as it is typed. */
  readonly search?: {
    readonly value: string;
    readonly onChange: (value: string) => void;
    readonly placeholder: string;
  };
}

/**
 * A list's filters as a menu, like Linear's (2026-11-03, after NocoSupport's
 * lists): a Filters button opens the things the list filters by, each opening
 * its values beside it. The applied filters follow the button as chips, each
 * with a button that removes it; the menu ends with Clear filters while any
 * is applied.
 */
export function FilterMenu({
  dimensions,
  onClear,
  onOpenChange,
}: {
  readonly dimensions: readonly FilterDimension[];
  readonly onClear: () => void;
  /** The menu opened or closed, so a caller loads long value lists only once it is wanted. */
  readonly onOpenChange?: (open: boolean) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (dimensions.length === 0) return null;
  const applied = dimensions.filter((dimension) => dimension.value);
  const label = applied.length
    ? t('listFilters.filtersApplied', { count: applied.length })
    : t('listFilters.filters');
  return (
    <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
      <DropdownMenu onOpenChange={(open) => onOpenChange?.(open)}>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              className='aria-expanded:bg-accent'
              aria-label={label}
            />
          }
        >
          <FunnelIcon data-icon='inline-start' />
          {t('listFilters.filters')}
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-44'>
          <DropdownMenuGroup>
            {dimensions.map((dimension) => (
              <DropdownMenuSub key={dimension.key}>
                <DropdownMenuSubTrigger>
                  {dimension.label}
                </DropdownMenuSubTrigger>
                {/* As wide as its longest value, up to a limit past which a value wraps. */}
                <DropdownMenuSubContent className='max-h-72 w-max max-w-80 min-w-44 overflow-y-auto'>
                  {dimension.search ? (
                    <div className='sticky -top-1 z-10 -mx-1 -mt-1 mb-1 border-b bg-popover p-1.5'>
                      <Input
                        value={dimension.search.value}
                        onChange={(event) =>
                          dimension.search?.onChange(event.target.value)
                        }
                        // Typed letters stay in the box rather than moving the
                        // menu's highlight; Escape and the arrows still reach the menu.
                        onKeyDown={(event) => {
                          if (
                            !['Escape', 'ArrowDown', 'ArrowUp', 'Tab'].includes(
                              event.key,
                            )
                          )
                            event.stopPropagation();
                        }}
                        placeholder={dimension.search.placeholder}
                        aria-label={dimension.search.placeholder}
                        className='h-7'
                      />
                    </div>
                  ) : null}
                  {dimension.search && dimension.options.length === 0 ? (
                    <p className='px-2 py-1.5 text-sm text-muted-foreground'>
                      {t('listFilters.noValues')}
                    </p>
                  ) : null}
                  <DropdownMenuRadioGroup
                    value={dimension.value ?? ''}
                    onValueChange={(value: string) =>
                      dimension.onChange(value || null)
                    }
                  >
                    {dimension.options.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        className={
                          DEPTH_INDENT[
                            Math.min(option.depth ?? 0, DEPTH_INDENT.length - 1)
                          ]
                        }
                      >
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuGroup>
          {applied.length ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClear}>
                {t('listFilters.clear')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {applied.map((dimension) => {
        const value =
          dimension.options.find((option) => option.value === dimension.value)
            ?.label ??
          dimension.valueLabel ??
          '';
        return (
          <span
            key={dimension.key}
            className='flex h-6 max-w-48 min-w-0 items-center gap-1 rounded-md bg-muted pr-0.5 pl-2 text-xs'
          >
            <span className='shrink-0 text-muted-foreground'>
              {dimension.label}
            </span>
            <span className='truncate font-medium'>{value}</span>
            <Button
              variant='ghost'
              size='icon-xs'
              className='size-5 text-muted-foreground'
              aria-label={t('listFilters.removeFilter', {
                name: dimension.label,
              })}
              onClick={() => dimension.onChange(null)}
            >
              <XIcon className='size-3' />
            </Button>
          </span>
        );
      })}
    </div>
  );
}
