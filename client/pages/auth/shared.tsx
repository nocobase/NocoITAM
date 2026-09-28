import { resolveAppUrl } from '@nocobase/app-client';
import type { ReactElement } from 'react';

import { AuthBrand } from '../../extensions/nocobase-auth-ui/components/auth-brand.js';
import { AuthMarketingPanel } from '../../extensions/nocobase-auth-ui/components/auth-marketing-panel.js';

// The sign-in pages carry the same brand as the application shell
// (client/layouts/components/app-brand.tsx): the template's logo mark beside
// this application's wordmark.
const brand = (variant: 'light' | 'dark'): ReactElement => (
  <span className='flex items-center gap-2 text-foreground'>
    <img
      alt=''
      aria-hidden='true'
      className='h-10 w-auto object-contain'
      src={resolveAppUrl(
        variant === 'dark'
          ? '/assets/logo-mark-dark.png'
          : '/assets/logo-mark.png',
      )}
    />
    <span className='font-heading text-2xl tracking-wide'>
      <span className='font-black'>Noco</span>
      <span className='font-normal'>ITAM</span>
    </span>
  </span>
);

export const authLogo = (
  <AuthBrand dark={brand('dark')} light={brand('light')} name='NocoITAM' />
);

export const authMarketing = <AuthMarketingPanel />;
