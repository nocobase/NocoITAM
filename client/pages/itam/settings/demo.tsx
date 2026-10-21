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
import { Progress } from '@/components/ui/progress';
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
import { apiErrorBody, useApi } from '@/lib/itam/api';
import { errorMessage, formatDate } from '@/lib/itam/format';

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
  /** An import under way: how far it has got, 0 to 100. */
  readonly importing: { readonly percent: number } | null;
  /** Why the last import stopped, if it did. */
  readonly failure?: {
    readonly code?: string;
    readonly message: string;
  } | null;
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
    queryFn: async () => {
      const before = queryClient.getQueryData<DemoSummary>(['itam', 'demo']);
      const next = (
        await api.request<{ data: DemoSummary }>({ path: 'itam/demo' })
      ).data;
      // The import ended: everything it wrote is new to the other pages.
      if (before?.importing && !next.importing)
        void queryClient.invalidateQueries({
          queryKey: ['itam'],
          predicate: (query) => query.queryKey[1] !== 'demo',
        });
      return next;
    },
    // How far an import has got, asked every second while one runs.
    refetchInterval: (query) => (query.state.data?.importing ? 1000 : false),
  });
  const act = useMutation({
    mutationFn: (action: 'generate' | 'clear') =>
      api.request<{ data: DemoSummary }>({
        path: `itam/demo/${action}`,
        method: 'POST',
        json: action === 'generate' ? { language } : {},
      }),
    // An import closes its dialog and shows its progress on the card and in
    // the banner at once (2026-10-16, after NocoCRM's), rather than holding
    // a spinner in the dialog for the minute it takes.
    onMutate: (action) => {
      if (action !== 'generate') return;
      setConfirming(undefined);
      queryClient.setQueryData<DemoSummary>(['itam', 'demo'], (current) =>
        current ? { ...current, importing: { percent: 0 } } : current,
      );
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ['itam', 'demo'] });
    },
    onSuccess: async (result, action) => {
      setConfirming(undefined);
      // An import only starts here (2026-10-16): the server runs it in the
      // background and the status, polled while it runs, says when it ends.
      if (action === 'generate') {
        queryClient.setQueryData(['itam', 'demo'], result.data);
        return;
      }
      setNotice(t('settings.demo.cleared'));
      // The notifications it sent go with it, taken off their tables rather
      // than read or deleted, so no realtime message refreshes the counts:
      // the sidebar's and the bell's, and the inbox's own list (2026-10-21).
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['itam'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        queryClient.invalidateQueries({ queryKey: ['notificationInApp'] }),
      ]);
    },
  });
  const demo = status.data;
  const importing = demo?.importing ?? null;
  // The import this page watched ended: say so, adjusting state while
  // rendering rather than in an effect.
  const [watching, setWatching] = useState(false);
  if (importing && !watching) setWatching(true);
  if (!importing && watching && demo) {
    setWatching(false);
    if (demo.generated && !demo.failure)
      setNotice(t('settings.demo.generated'));
  }
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
        {importing ? (
          <div className='space-y-1.5'>
            <div className='flex items-center justify-between gap-3 text-sm'>
              <span>{t('settings.demo.importing')}</span>
              <span className='text-muted-foreground tabular-nums'>
                {importing.percent}%
              </span>
            </div>
            <Progress
              value={importing.percent}
              aria-label={t('settings.demo.importing')}
            />
          </div>
        ) : null}
        {act.error && act.variables === 'generate' && !confirming ? (
          <p className='text-sm text-destructive'>
            {apiErrorBody(act.error)?.message ?? errorMessage(act.error)}
          </p>
        ) : !importing && demo?.failure ? (
          <p className='text-sm text-destructive'>
            {t('settings.demo.failed', { message: demo.failure.message })}
          </p>
        ) : null}
        <p className='text-sm'>
          {importing
            ? null
            : demo?.generated
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
          {demo && !demo.generated && !importing ? (
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
          {demo?.generated && !importing ? (
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
