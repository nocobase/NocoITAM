import { useTranslation } from '@nocobase/i18n/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Trash2 } from 'lucide-react';
import { useState, type ReactElement } from 'react';

import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { ConfirmDialog } from '@/components/itam/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useApi } from '@/lib/itam/api';
import { formatDate } from '@/lib/itam/format';

/** 设置 → 演示数据, the last tab: a trial's, rarely opened once ITAM is in use. */
export default function DemoSettingsPage(): ReactElement {
  const { t } = useTranslation();
  return (
    <PageContainer>
      <PageHeader title={t('settings.demo.title')} />
      <div className='max-w-4xl'>
        <DemoCard />
      </div>
    </PageContainer>
  );
}

type DemoLanguage = 'zh-CN' | 'en-US';
const DEMO_LANGUAGES: readonly DemoLanguage[] = ['zh-CN', 'en-US'];

interface DemoAccount {
  readonly username: string;
  readonly name: string;
  readonly role: string;
  readonly password: string;
}

interface DemoSummary {
  readonly generated: boolean;
  readonly records: number;
  readonly createdAt: string | null;
  readonly language: DemoLanguage | null;
  readonly accounts: readonly DemoAccount[];
  readonly accountsByLanguage: Readonly<
    Record<DemoLanguage, readonly DemoAccount[]>
  >;
}

/**
 * The demo dataset, imported and cleared here (after NocoCRM's settings
 * tab): what it is, the sign-ins it creates — those of the language picked
 * before an import, those of the import present after — when it was
 * imported and how big it is. The banner above every page links here
 * (`/settings/demo`) while nothing is imported.
 */
function DemoCard(): ReactElement {
  const { t, i18n } = useTranslation();
  const api = useApi();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<'generate' | 'clear'>();
  const [notice, setNotice] = useState<string>();
  // The reader's own language is the first choice.
  const [language, setLanguage] = useState<DemoLanguage>(
    i18n.language.startsWith('zh') ? 'zh-CN' : 'en-US',
  );
  const status = useQuery({
    queryKey: ['itam', 'demo'],
    queryFn: async () =>
      (await api.request<{ data: DemoSummary }>({ path: 'itam/demo' })).data,
  });
  const act = useMutation({
    mutationFn: (action: 'generate' | 'clear') =>
      api.request<{ data: DemoSummary }>({
        path: `itam/demo/${action}`,
        method: 'POST',
        json: action === 'generate' ? { language } : {},
      }),
    onSuccess: async (_result, action) => {
      setConfirming(undefined);
      setNotice(
        t(
          action === 'generate'
            ? 'settings.demo.generated'
            : 'settings.demo.cleared',
        ),
      );
      await queryClient.invalidateQueries({ queryKey: ['itam'] });
    },
  });
  const demo = status.data;
  const accounts = demo
    ? demo.generated
      ? demo.accounts
      : demo.accountsByLanguage[language]
    : [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.demo.title')}</CardTitle>
        <p className='text-sm text-muted-foreground'>
          {t('settings.demo.description')}
        </p>
      </CardHeader>
      <CardContent className='space-y-4'>
        {accounts.length > 0 ? (
          <div className='space-y-2'>
            <p className='text-sm'>
              {t('settings.demo.accounts')}
              <span className='ml-2 text-muted-foreground'>
                {t('settings.demo.accountsHint')}
              </span>
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settings.demo.username')}</TableHead>
                  <TableHead>{t('settings.demo.name')}</TableHead>
                  <TableHead>{t('settings.demo.role')}</TableHead>
                  <TableHead>{t('settings.demo.password')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.username}>
                    <TableCell>
                      <code className='text-xs'>{account.username}</code>
                    </TableCell>
                    <TableCell>{account.name}</TableCell>
                    <TableCell>
                      {t(`settings.demo.roles.${account.role}`, {
                        defaultValue: account.role,
                      })}
                    </TableCell>
                    <TableCell>
                      <code className='text-xs'>{account.password}</code>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        <p className='text-sm'>
          {demo?.generated
            ? t('settings.demo.present', {
                date: formatDate(demo.createdAt, true),
                count: demo.records,
              })
            : t('settings.demo.none')}
        </p>
        {notice ? (
          <p role='status' className='rounded-md bg-primary/10 p-3 text-sm'>
            {notice}
          </p>
        ) : null}
        <div className='flex flex-wrap items-center gap-2'>
          {demo && !demo.generated ? (
            <>
              <Label htmlFor='demo-language'>
                {t('settings.demo.language')}
              </Label>
              <Select
                items={DEMO_LANGUAGES.map((value) => ({
                  value,
                  label: t(`settings.demo.languages.${value}`),
                }))}
                value={language}
                onValueChange={(next) => next && setLanguage(next)}
              >
                <SelectTrigger id='demo-language' className='w-32'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEMO_LANGUAGES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`settings.demo.languages.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={act.isPending}
                onClick={() => {
                  act.reset();
                  setConfirming('generate');
                }}
              >
                <Database data-icon='inline-start' />
                {act.isPending
                  ? t('settings.demo.generating')
                  : t('settings.demo.generate')}
              </Button>
            </>
          ) : null}
          {demo?.generated ? (
            <Button
              variant='outline'
              disabled={act.isPending}
              onClick={() => {
                act.reset();
                setConfirming('clear');
              }}
            >
              <Trash2 data-icon='inline-start' />
              {t('settings.demo.clear')}
            </Button>
          ) : null}
        </div>
        <ConfirmDialog
          open={confirming !== undefined}
          onOpenChange={(open) => {
            if (!open) setConfirming(undefined);
          }}
          title={t(
            confirming === 'clear'
              ? 'settings.demo.clearTitle'
              : 'settings.demo.generateTitle',
          )}
          description={t(
            confirming === 'clear'
              ? 'settings.demo.clearDescription'
              : 'settings.demo.generateDescription',
          )}
          busy={act.isPending}
          error={act.error}
          destructive={confirming === 'clear'}
          confirmLabel={t(
            confirming === 'clear'
              ? 'settings.demo.clear'
              : 'settings.demo.generate',
          )}
          onConfirm={() => {
            if (confirming) {
              setNotice(undefined);
              act.mutate(confirming);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}
