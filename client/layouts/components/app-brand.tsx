import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';
import { Link } from 'react-router';

import { NocoItamLogo } from '#components/brand-logo';
import {
  BRAND_MARK_PATH,
  BRAND_MARK_TRANSLATE,
  BRAND_MARK_VIEW_BOX,
} from '#components/brand-mark-geometry';

export interface AppBrandProps {
  readonly compact?: boolean;
}

// Application change to the template's brand (2026-10-19, as NocoCRM's): the
// official NocoBase lockup with the application's name, "Noco" heavy and
// "ITAM" light (components/brand-logo.tsx, the logo tool's small-size
// version), in place of the template's logo image beside its name
// in the heading font; collapsed, the mark alone. Both fill with the text
// colour, so one drawing serves light and dark.
export function AppBrand(inputProps: AppBrandProps): ReactElement {
  const { t } = useTranslation();
  const { compact = false } = inputProps;

  return (
    <Link
      aria-label={t('navigation.brandHome', { defaultValue: 'NocoITAM home' })}
      className='flex min-w-0 items-center text-foreground'
      to='/'
    >
      {compact ? (
        <svg
          aria-hidden='true'
          className='h-6 w-auto shrink-0'
          fill='currentColor'
          viewBox={BRAND_MARK_VIEW_BOX}
        >
          <path transform={BRAND_MARK_TRANSLATE} d={BRAND_MARK_PATH} />
        </svg>
      ) : (
        <NocoItamLogo aria-hidden='true' className='h-5 w-auto shrink-0' />
      )}
    </Link>
  );
}
