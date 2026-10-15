import { useTranslation } from '@nocobase/i18n/client';
import { ArrowLeftIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useLocation, useNavigate, type To } from 'react-router';

import { BackButton } from '@/components/back-button';

/**
 * Back to the page the reader actually came from, for a page reached from
 * several places — MDM 核对 opens from 待办, the device list and the
 * settings (2026-10-15). The template's `BackButton` always leads to one
 * fixed place; this one steps back through the history while it holds an
 * in-app page, and only otherwise, as when the page was opened directly,
 * leads to `fallback` the template's way. It looks the same.
 */
export function HistoryBackButton({
  fallback,
}: {
  readonly fallback: To;
}): ReactElement {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  // React Router names the first entry of a session `default`: nothing of
  // this application lies behind it.
  if (location.key === 'default') return <BackButton to={fallback} />;
  return (
    <button
      type='button'
      className='inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground'
      onClick={() => void navigate(-1)}
    >
      <ArrowLeftIcon className='size-4' />
      {t('navigation.back', { defaultValue: 'Back' })}
    </button>
  );
}
