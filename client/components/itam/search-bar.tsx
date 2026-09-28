import { useTranslation } from '@nocobase/i18n/client';
import { Search, X } from 'lucide-react';
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

/** The magnifier that opens and closes a controlled `SearchBar`. */
export function SearchToggle({
  active = false,
  onClick,
}: {
  readonly active?: boolean;
  readonly onClick: () => void;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <Button
      variant={active ? 'secondary' : 'outline'}
      size='icon'
      aria-label={t('common.search')}
      aria-pressed={active}
      onClick={onClick}
    >
      <Search />
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
        aria-label={t('common.search')}
        onClick={() => setOpen(true)}
      >
        <Search />
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
        <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
        <Input
          autoFocus
          aria-label={t('common.search')}
          className='w-64 pl-8'
          placeholder={placeholder ?? t('common.searchPlaceholder')}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
      {filters}
      <Button
        variant='ghost'
        size='icon'
        aria-label={t('common.clearSearch')}
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
