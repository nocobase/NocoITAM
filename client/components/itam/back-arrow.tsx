import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement } from 'react';
import { useLocation, useNavigate } from 'react-router';

/**
 * The way back to the page before, as an arrow beside the title (2026-10-16,
 * the detail pages'; MDM 核对 since 2026-10-17): the browser's previous
 * entry, so it leads wherever the reader came from. Nothing on a page
 * opened directly — React Router names a session's first entry `default`,
 * and nothing of this application lies behind it — unless it names where
 * to go instead (`fallback`, a detail page's list, 2026-10-23); nothing
 * when `hidden`.
 */
export function BackArrow({
  hidden = false,
  fallback,
}: {
  readonly hidden?: boolean;
  /** Where a page opened directly goes back to. */
  readonly fallback?: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const first = location.key === 'default';
  if (hidden || (first && !fallback)) return null;
  return (
    <button
      type='button'
      aria-label={t('common.backPrevious')}
      title={t('common.backPrevious')}
      className='-ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50'
      onClick={() =>
        void (first && fallback ? navigate(fallback) : navigate(-1))
      }
    >
      <ArrowLeft aria-hidden='true' className='size-5' />
    </button>
  );
}
