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
  copy: copyable = true,
  leading,
  children,
}: {
  readonly onEdit?: () => void;
  /**
   * `false` for a value with its own copy, such as a product key, whose
   * shown mask is not what a copy should give.
   */
  readonly copy?: boolean;
  /**
   * The value's line height where it is not the row's (2026-10-23): a
   * long text reads relaxed, and the icons centre on its first line.
   */
  readonly leading?: 'relaxed';
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
    'inline-flex size-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none';
  return (
    // The icons float at the value's top right on hover rather than taking
    // width from it (2026-10-16), inside the field's hover ground.
    <div className='group/field relative'>
      <div ref={valueRef} className='min-w-0'>
        {children}
      </div>
      <div
        className={`pointer-events-none absolute top-0 right-0 flex h-[calc(1lh+var(--spacing))] items-center ${leading === 'relaxed' ? 'leading-relaxed' : ''} rounded-md bg-[color-mix(in_oklab,var(--muted)_70%,var(--card))] opacity-0 transition-opacity group-focus-within/field:pointer-events-auto group-focus-within/field:opacity-100 group-hover/field:pointer-events-auto group-hover/field:opacity-100`}
      >
        {onEdit ? (
          <button
            type='button'
            className={icon}
            aria-label={t('actions.edit')}
            title={t('actions.edit')}
            onClick={onEdit}
          >
            <Pencil className='size-3' aria-hidden />
          </button>
        ) : null}
        {copyable ? (
          <button
            type='button'
            className={icon}
            aria-label={t('actions.copy')}
            title={t(copied ? 'actions.copied' : 'actions.copy')}
            onClick={copy}
          >
            {copied ? (
              <Check className='size-3' aria-hidden />
            ) : (
              <Copy className='size-3' aria-hidden />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}
