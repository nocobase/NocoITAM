import { useTranslation } from '@nocobase/i18n/client';
import { ListFilter, X } from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface SearchBarProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Extra filter controls, revealed together with the search box. */
  readonly filters?: ReactNode;
  readonly placeholder?: string;
  /** Keeps the bar expanded, e.g. while a filter is active. */
  readonly forceOpen?: boolean;
  /** Called when the bar is dismissed, so the page can drop its filters too. */
  readonly onClear?: () => void;
  /**
   * Controlled mode: the page owns the open state and renders the toggle
   * itself (`SearchToggle`), so the bar can sit on its own row.
   */
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}

/**
 * The button that opens and closes a controlled `SearchBar`: filtering this
 * list, not the global search (⌘K) — a filter, not a magnifier, as on
 * NocoCRM's lists (2026-10-16). `/` opens it too, outside a text field.
 */
export function SearchToggle({
  active = false,
  onClick,
}: {
  readonly active?: boolean;
  readonly onClick: () => void;
}): ReactElement {
  const { t } = useTranslation();
  useEffect(() => {
    if (active) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
        )
      )
        return;
      event.preventDefault();
      onClick();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, onClick]);
  return (
    <Button
      variant={active ? 'secondary' : 'outline'}
      size='icon'
      aria-label={t('common.filterList')}
      title={`${t('common.filterList')} · /`}
      aria-pressed={active}
      onClick={onClick}
    >
      <ListFilter />
    </Button>
  );
}

/** Collapsed by default; the magnifier expands the search box and filters. */
export function SearchBar({
  value,
  onChange,
  filters,
  placeholder,
  forceOpen = false,
  onClear,
  open: controlledOpen,
  onOpenChange,
}: SearchBarProps): ReactElement | null {
  const { t } = useTranslation();
  const [ownOpen, setOwnOpen] = useState(Boolean(value) || forceOpen);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : ownOpen;
  const setOpen = (next: boolean) => {
    if (controlled) onOpenChange?.(next);
    else setOwnOpen(next);
  };
  const [draft, setDraft] = useState(value);
  // Debounce typing into the URL-backed value the parent owns.
  useEffect(() => {
    if (draft === value) return;
    const handle = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(handle);
  }, [draft, value, onChange]);

  if (!open && !forceOpen) {
    if (controlled) return null;
    return (
      <Button
        variant='outline'
        size='icon'
        aria-label={t('common.filterList')}
        onClick={() => setOpen(true)}
      >
        <ListFilter />
      </Button>
    );
  }
  return (
    <div
      className={
        controlled
          ? // On its own row the bar reads as a panel.
            'flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2'
          : 'flex flex-wrap items-center gap-2'
      }
    >
      <div className='relative'>
        <ListFilter className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          autoFocus
          aria-label={placeholder ?? t('common.filterList')}
          className='w-64 pl-8'
          placeholder={placeholder ?? t('common.filterPlaceholder')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
      {filters}
      <Button
        variant='ghost'
        size='icon'
        aria-label={t('common.clearFilter')}
        onClick={() => {
          setDraft('');
          onChange('');
          onClear?.();
          setOpen(false);
        }}
      >
        <X />
      </Button>
    </div>
  );
}
