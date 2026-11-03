import { useTranslation } from '@nocobase/i18n/client';
import { FunnelIcon, XIcon } from 'lucide-react';
import {
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from 'react';

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
  /**
   * A search box at the top of the values, for a long list. With `onChange`
   * the caller narrows the values as it is typed (on the server: models,
   * vendors); without, the menu narrows the loaded ones by their labels (a
   * tree of locations).
   */
  readonly search?: {
    readonly placeholder: string;
    readonly value?: string;
    readonly onChange?: (value: string) => void;
  };
}

/** The list's own keyword, typed in a box at the top of the menu and shown as a chip once applied. */
export interface FilterKeyword {
  /** The term in effect (the address's `q`). */
  readonly value: string;
  /** Called once typing pauses, or at once on Enter. */
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
}

// Typed letters stay in a box inside the menu rather than moving the menu's
// highlight; Escape and the arrows still reach the menu.
function keepTyping(event: KeyboardEvent<HTMLInputElement>): void {
  // The down arrow goes on to the first entry under the box.
  if (event.key === 'ArrowDown') {
    const item = event.currentTarget
      .closest('[role="menu"]')
      ?.querySelector<HTMLElement>('[role^="menuitem"]');
    if (item) {
      event.preventDefault();
      event.stopPropagation();
      item.focus();
    }
    return;
  }
  if (!['Escape', 'ArrowUp', 'Tab'].includes(event.key))
    event.stopPropagation();
}

/**
 * A list's filters as a menu, like Linear's (2026-11-03, after NocoSupport's
 * and NocoCRM's lists): the funnel opens the things the list filters by, each
 * opening its values beside it, under the list's keyword box when it has one.
 * The applied filters follow the button as chips, each with a button that
 * removes it; the menu ends with Clear filters while any is applied. `/`
 * opens it with the caret in the keyword box (⌘K staying the global search).
 */
export function FilterMenu({
  dimensions,
  keyword,
  onClear,
  onOpenChange,
}: {
  readonly dimensions: readonly FilterDimension[];
  readonly keyword?: FilterKeyword;
  /** Drops every filter, the keyword included. */
  readonly onClear: () => void;
  /** The menu opened or closed, so a caller loads long value lists only once it is wanted. */
  readonly onOpenChange?: (open: boolean) => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const changeOpen = (next: boolean) => {
    setOpen(next);
    onOpenChange?.(next);
  };
  const keywordRef = useRef<HTMLInputElement>(null);
  const hasKeyword = Boolean(keyword);
  const applied = dimensions.filter((dimension) => dimension.value);
  const count = applied.length + (keyword?.value ? 1 : 0);
  const label = count
    ? t('listFilters.filtersApplied', { count })
    : t('listFilters.filters');

  // What is typed runs ahead of the address and reaches it once typing
  // pauses. A keyword changed from outside (清除筛选 under an empty list)
  // replaces the draft; the box's own value coming back does not, so typing
  // on is not undone.
  const applyKeyword = keyword?.onChange;
  const keywordValue = keyword?.value ?? '';
  const [draft, setDraft] = useState(keywordValue);
  const [sent, setSent] = useState(keywordValue);
  const [seen, setSeen] = useState(keywordValue);
  if (keywordValue !== seen) {
    setSeen(keywordValue);
    if (keywordValue !== sent) setDraft(keywordValue);
  }
  const send = (next: string) => {
    setSent(next);
    applyKeyword?.(next);
  };
  useEffect(() => {
    if (!applyKeyword || draft === keywordValue) return;
    const handle = setTimeout(() => {
      setSent(draft);
      applyKeyword(draft);
    }, 300);
    return () => clearTimeout(handle);
  }, [draft, keywordValue, applyKeyword]);

  // `/` brings the keyword box up, as in Linear and GitHub, unless the
  // reader is typing or a dialog is open.
  useEffect(() => {
    if (!hasKeyword) return;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
        ) ||
        document.querySelector('[role="dialog"]')
      )
        return;
      event.preventDefault();
      setOpen(true);
      onOpenChange?.(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hasKeyword, onOpenChange]);

  // The menu opens with the caret in the keyword box, once the menu has
  // placed its own focus.
  useEffect(() => {
    if (!open || !hasKeyword) return;
    const frame = requestAnimationFrame(() => keywordRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, hasKeyword]);

  if (dimensions.length === 0 && !keyword) return null;
  return (
    <div className='flex min-w-0 flex-wrap items-center gap-1.5'>
      <DropdownMenu open={open} onOpenChange={changeOpen}>
        <DropdownMenuTrigger
          render={
            // The funnel alone, framed as the header's other icon buttons
            // (import, export) are, named for screen readers and on hover.
            <Button
              variant='outline'
              size='icon'
              className='aria-expanded:bg-muted'
              aria-label={label}
              title={keyword ? `${label} · /` : label}
            />
          }
        >
          <FunnelIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' className='w-56'>
          {keyword ? (
            <div className='-mx-1 -mt-1 mb-1 border-b p-1.5'>
              <Input
                ref={keywordRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter takes the term at once and closes the menu, the
                  // list showing what it leaves.
                  if (event.key === 'Enter') {
                    send(draft);
                    changeOpen(false);
                  } else keepTyping(event);
                }}
                placeholder={keyword.placeholder}
                aria-label={keyword.placeholder}
                className='h-7'
              />
            </div>
          ) : null}
          {dimensions.length > 0 ? (
            <DropdownMenuGroup>
              {dimensions.map((dimension) => (
                <FilterSubmenu key={dimension.key} dimension={dimension} />
              ))}
            </DropdownMenuGroup>
          ) : null}
          {count ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onClear}>
                {t('listFilters.clear')}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {keyword?.value ? (
        <FilterChip
          label={t('listFilters.keyword')}
          value={keyword.value}
          onRemove={() => {
            setDraft('');
            send('');
          }}
        />
      ) : null}
      {applied.map((dimension) => (
        <FilterChip
          key={dimension.key}
          label={dimension.label}
          value={
            dimension.options.find((option) => option.value === dimension.value)
              ?.label ??
            dimension.valueLabel ??
            ''
          }
          onRemove={() => dimension.onChange(null)}
        />
      ))}
    </div>
  );
}

function FilterSubmenu({
  dimension,
}: {
  readonly dimension: FilterDimension;
}): ReactElement {
  const { t } = useTranslation();
  const [localQuery, setLocalQuery] = useState('');
  const search = dimension.search;
  const remote = Boolean(search?.onChange);
  const query = remote ? (search?.value ?? '') : localQuery;
  const needle = query.trim().toLocaleLowerCase();
  // Narrowed here, a tree's matches stand flat: their parents may be gone.
  const options =
    search && !remote && needle
      ? dimension.options
          .filter((option) => option.label.toLocaleLowerCase().includes(needle))
          .map((option) => ({ ...option, depth: 0 }))
      : dimension.options;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{dimension.label}</DropdownMenuSubTrigger>
      {/* As wide as its longest value, up to a limit past which a value wraps. */}
      <DropdownMenuSubContent className='max-h-72 w-max max-w-80 min-w-44 overflow-y-auto'>
        {search ? (
          <div className='sticky -top-1 z-10 -mx-1 -mt-1 mb-1 border-b bg-popover p-1.5'>
            <Input
              value={query}
              onChange={(event) =>
                remote
                  ? search.onChange?.(event.target.value)
                  : setLocalQuery(event.target.value)
              }
              onKeyDown={keepTyping}
              placeholder={search.placeholder}
              aria-label={search.placeholder}
              className='h-7'
            />
          </div>
        ) : null}
        {search && options.length === 0 ? (
          <p className='px-2 py-1.5 text-sm text-muted-foreground'>
            {t('listFilters.noValues')}
          </p>
        ) : null}
        <DropdownMenuRadioGroup
          value={dimension.value ?? ''}
          onValueChange={(value: string) => dimension.onChange(value || null)}
        >
          {options.map((option) => (
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
  );
}

function FilterChip({
  label,
  value,
  onRemove,
}: {
  readonly label: string;
  readonly value: string;
  readonly onRemove: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <span className='flex h-6 max-w-48 min-w-0 items-center gap-1 rounded-md bg-muted pr-0.5 pl-2 text-xs'>
      <span className='shrink-0 text-muted-foreground'>{label}</span>
      <span className='truncate font-medium' title={value}>
        {value}
      </span>
      <Button
        variant='ghost'
        size='icon-xs'
        className='size-5 text-muted-foreground'
        aria-label={t('listFilters.removeFilter', { name: label })}
        onClick={onRemove}
      >
        <XIcon className='size-3' />
      </Button>
    </span>
  );
}
