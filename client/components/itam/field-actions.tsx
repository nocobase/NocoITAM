import { useTranslation } from '@nocobase/i18n/client';
import { Check, Copy, Pencil } from 'lucide-react';
import { useRef, useState, type ReactElement, type ReactNode } from 'react';

/**
 * A field's value with, on hover, 编辑 (for one that may be edited) and 复制
 * at its end (2026-10-16): double-click still edits, the icons say so. 复制
 * copies what the field shows — a name, not the id behind it.
 */
export function FieldActions({
  onEdit,
  copyText,
  children,
}: {
  readonly onEdit?: () => void;
  /** What 复制 copies, where the field shows only part of it. */
  readonly copyText?: string;
  readonly children: ReactNode;
}): ReactElement {
  const { t } = useTranslation();
  const valueRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const shown = (copyText ?? valueRef.current?.innerText ?? '').trim();
    if (!shown || shown === '—') return;
    void navigator.clipboard.writeText(shown).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  const icon =
    'inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';
  return (
    // The icons float at the value's top right on hover rather than taking
    // width from it (2026-10-16), on the card's ground so they read over
    // the text.
    <div className='group/field relative'>
      <div ref={valueRef} className='min-w-0'>
        {children}
      </div>
      <div className='pointer-events-none absolute -top-0.5 right-0 flex items-center rounded-md bg-card/95 opacity-0 shadow-xs ring-1 ring-border/60 transition-opacity group-focus-within/field:pointer-events-auto group-focus-within/field:opacity-100 group-hover/field:pointer-events-auto group-hover/field:opacity-100'>
        {onEdit ? (
          <button
            type='button'
            className={icon}
            aria-label={t('actions.edit')}
            title={t('actions.edit')}
            onClick={onEdit}
          >
            <Pencil className='size-3.5' aria-hidden />
          </button>
        ) : null}
        <button
          type='button'
          className={icon}
          aria-label={t('actions.copy')}
          title={t(copied ? 'actions.copied' : 'actions.copy')}
          onClick={copy}
        >
          {copied ? (
            <Check className='size-3.5' aria-hidden />
          ) : (
            <Copy className='size-3.5' aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
