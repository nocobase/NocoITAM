import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  setWorkScope,
  useWorkScope,
  type WorkScope,
} from '@/lib/itam/work-scope';

const SCOPES: readonly WorkScope[] = ['all', 'mine'];

/** 全部 · 我负责的: the team's to-dos, or the reader's part of them. */
export function WorkScopeToggle(): ReactElement {
  const { t } = useTranslation();
  const scope = useWorkScope();
  return (
    <div
      role='radiogroup'
      aria-label={t('workbench.scope.label')}
      className='inline-flex rounded-lg border border-border p-0.5'
    >
      {SCOPES.map((value) => (
        <Button
          key={value}
          role='radio'
          aria-checked={scope === value}
          // The chosen one filled: a light tint was too faint to tell which
          // of the two was on.
          variant={scope === value ? 'default' : 'ghost'}
          className='h-7 px-2.5'
          onClick={() => setWorkScope(value)}
        >
          {t(`workbench.scope.${value}`)}
        </Button>
      ))}
    </div>
  );
}
