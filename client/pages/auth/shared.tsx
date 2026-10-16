import { resolveAssetUrl } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement, ReactNode } from 'react';

import { AuthSplitLayout } from '#extensions/nocobase-auth-split-layout/auth-split-layout';

import { ActivityPanel } from './activity-panel.js';
import './auth-page.css';

export interface AuthPageProps {
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly children: ReactNode;
}

/**
 * The frame every sign-in, sign-up and password page shares: the form on the left, and on wide screens ITAM at work
 * on the right (`ActivityPanel`, 2026-10-16: a joiner's laptop from request to in use, as NocoCRM's sign-in page shows
 * a deal), in place of the template's NocoBase brand panel.
 */
export function AuthPage({
  children,
  description,
  title,
}: AuthPageProps): ReactElement {
  const { t } = useTranslation();
  return (
    <AuthSplitLayout
      aside={<ActivityPanel />}
      asideLabel={t('auth.about')}
      className='auth-page'
      description={description}
      logo={
        <>
          <img
            alt=''
            className='dark:hidden'
            src={resolveAssetUrl('/assets/logo-mark.png')}
          />
          <img
            alt=''
            className='hidden dark:block'
            src={resolveAssetUrl('/assets/logo-mark-dark.png')}
          />
        </>
      }
      name={t('app.title')}
      title={title}
    >
      {children}
    </AuthSplitLayout>
  );
}
