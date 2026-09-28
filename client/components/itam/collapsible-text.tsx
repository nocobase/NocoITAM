import { useTranslation } from '@nocobase/i18n/client';
import { useState, type ReactElement } from 'react';

/** Text longer than this many characters or lines is collapsed. */
export const COLLAPSE_CHARS = 200;
export const COLLAPSE_LINES = 6;

/** Free text with its line breaks, folded past the limit until expanded. */
export function CollapsibleText({
  text,
  className,
  chars = COLLAPSE_CHARS,
  lines: maxLines = COLLAPSE_LINES,
}: {
  readonly text: string;
  readonly className?: string;
  /** Tighter limits where the text shares a line, such as a summary strip. */
  readonly chars?: number;
  readonly lines?: number;
}): ReactElement {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const lines = text.split('\n');
  const long = text.length > chars || lines.length > maxLines;
  const shown = long && !open ? preview(lines, chars, maxLines) : text;
  return (
    <span className={className}>
      <span className='whitespace-pre-wrap break-words'>{shown}</span>
      {long ? (
        <button
          type='button'
          className='ml-1 text-link underline-offset-4 hover:underline'
          onClick={(event) => {
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          {open ? t('common.showLess') : t('common.showMore')}
        </button>
      ) : null}
    </span>
  );
}

function preview(
  lines: readonly string[],
  chars: number,
  maxLines: number,
): string {
  const byLines = lines.slice(0, maxLines).join('\n');
  const cut = byLines.length > chars ? byLines.slice(0, chars) : byLines;
  return `${cut.trimEnd()}…`;
}
