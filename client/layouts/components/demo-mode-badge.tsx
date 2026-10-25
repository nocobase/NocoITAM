import { useToaster } from '@nocobase/app-client';
import { useDemoAccounts } from '@nocobase/app-plugin-demo-mode/client/accounts';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronDown } from 'lucide-react';
import type { ReactElement } from 'react';
import { useLocation } from 'react-router';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';

/**
 * Application change (ITAM, 2026-10-25): on a Demo Mode deployment the
 * header says so, first of its actions, and its menu offers the demo's
 * accounts to switch to at once, with what switching is for. The plugin's
 * own switcher is a submenu of the account menu, which a visitor has to know
 * to look for. Nothing outside a demo, or while it offers no account.
 */
export function DemoModeBadge(): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const location = useLocation();
  const { accounts, signIn } = useDemoAccounts();
  if (!accounts?.length) return null;
  const current = accounts.find((account) => account.current);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        openOnHover
        delay={0}
        className='flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-xs font-medium text-primary outline-none transition-colors hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50'
      >
        <span className='size-1.5 rounded-full bg-primary' aria-hidden='true' />
        {t('demoMode.badge')}
        {/* What it is for, rather than who: the avatar beside it says that. */}
        <span className='hidden font-normal text-primary/80 sm:inline'>
          · {t('demoMode.accounts')}
        </span>
        <ChevronDown className='size-3.5 opacity-70' aria-hidden='true' />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-72'>
        <div className='px-2 py-1.5'>
          <p className='text-sm font-medium'>{t('demoMode.title')}</p>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            {t('demoMode.hint')}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('demoMode.accounts')}</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={current?.username ?? ''}
            onValueChange={(username: string) => {
              if (username === current?.username) return;
              signIn(username, `${location.pathname}${location.search}`).catch(
                () =>
                  toaster.show({
                    type: 'error',
                    title: t('demoMode.switchFailed'),
                  }),
              );
            }}
          >
            {accounts.map((account) => (
              <DropdownMenuRadioItem
                key={account.username}
                value={account.username}
              >
                <span className='min-w-0'>
                  <span className='block truncate'>{account.name}</span>
                  <span className='block truncate text-xs text-muted-foreground'>
                    {account.role}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
