import { useTranslation } from '@nocobase/i18n/client';
import { useQuery } from '@tanstack/react-query';
import type { ReactElement } from 'react';

import { CellText } from '@/components/itam/cell-text';
import { RecordLink } from '@/components/itam/record-link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  keptShare,
  type FieldStats,
  type ReceiptRunReport,
  type ReceiptRunStatus,
} from '@/lib/itam/receipt';
import { useReferenceNames } from '@/lib/itam/references';

/**
 * Who does what when receiving by delivery document. Fixed for now and
 * enforced by the system rather than asked of the model: the run reads with
 * read-only tools, the form never saves itself, and the batch is refused by
 * the rules, not by the assistant's judgement.
 */
const BOUNDARY = [
  { action: 'read', policy: 'auto' },
  { action: 'receive', policy: 'human' },
  { action: 'differences', policy: 'human' },
] as const;

const STATUS_TONE: Readonly<
  Record<ReceiptRunStatus, 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  reading: 'outline',
  drafted: 'outline',
  saved: 'default',
  discarded: 'secondary',
  failed: 'destructive',
};

/**
 * The assistant's first piece of carried work (2026-10-05): what it may do
 * on its own and what stays with a person, how often its reading was kept
 * as it was — the only ground for ever letting it do more (guideline 3.5) —
 * and its latest runs, each naming who started it.
 */
export function ReceiptAgentCard(): ReactElement {
  const { t } = useTranslation();
  const api = useApi();
  const report = useQuery({
    queryKey: ['itam', 'ai', 'receipt-runs'],
    queryFn: async () =>
      (
        await api.request<{ data: ReceiptRunReport }>({
          path: 'itam/ai/receipt-runs',
        })
      ).data,
  });
  const data = report.data;
  const people = useReferenceNames([
    {
      collection: 'users',
      ids: (data?.recent ?? []).map((run) => run.actorId),
    },
  ]);
  const runs = data?.summary.runs;
  const total = runs
    ? Object.values(runs).reduce((sum, count) => sum + count, 0)
    : 0;
  return (
    <Card className='lg:col-span-2'>
      <CardHeader>
        <CardTitle>{t('settings.receiptAgent.title')}</CardTitle>
        <p className='text-sm text-muted-foreground'>
          {t('settings.receiptAgent.description')}
        </p>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='space-y-2'>
          <p className='text-sm font-medium'>
            {t('settings.receiptAgent.boundary')}
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('settings.receiptAgent.action')}</TableHead>
                <TableHead>{t('settings.receiptAgent.policy')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BOUNDARY.map((row) => (
                <TableRow key={row.action}>
                  <TableCell>
                    {t(`settings.receiptAgent.actions.${row.action}`)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={row.policy === 'auto' ? 'secondary' : 'outline'}
                    >
                      {t(`settings.receiptAgent.policies.${row.policy}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className='text-xs text-muted-foreground'>
            {t('settings.receiptAgent.boundaryNote')}
          </p>
        </div>
        <div className='space-y-2'>
          <p className='text-sm font-medium'>
            {t('settings.receiptAgent.performance')}
          </p>
          {runs && total > 0 ? (
            <div className='grid gap-1 text-sm'>
              <p>
                {t('settings.receiptAgent.runs', {
                  count: total,
                  saved: runs.saved,
                  discarded: runs.discarded,
                  failed: runs.failed,
                })}
              </p>
              <KeptLine
                label={t('fields.serialNo')}
                stats={data.summary.fields.serialNo}
              />
              <KeptLine
                label={t('fields.quantity')}
                stats={data.summary.fields.quantity}
              />
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {t('settings.receiptAgent.none')}
            </p>
          )}
        </div>
        {data && data.recent.length > 0 ? (
          <div className='space-y-2'>
            <p className='text-sm font-medium'>
              {t('settings.receiptAgent.recent')}
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('fields.createdAt')}</TableHead>
                  <TableHead>{t('settings.receiptAgent.order')}</TableHead>
                  <TableHead>{t('settings.receiptAgent.document')}</TableHead>
                  <TableHead>{t('settings.receiptAgent.startedBy')}</TableHead>
                  <TableHead>{t('settings.receiptAgent.result')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className='whitespace-nowrap tabular-nums'>
                      {formatDate(run.createdAt, true)}
                    </TableCell>
                    <TableCell>
                      <RecordLink
                        to={`/procurement/${run.purchaseOrderId}`}
                        className='font-medium text-link underline-offset-4 hover:underline'
                      >
                        {run.orderNo ?? '—'}
                      </RecordLink>
                    </TableCell>
                    <TableCell>
                      <CellText className='max-w-56'>
                        {run.documentName}
                      </CellText>
                    </TableCell>
                    <TableCell>
                      {people.users?.get(run.actorId) ?? '…'}
                    </TableCell>
                    <TableCell>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Badge variant={STATUS_TONE[run.status]}>
                          {t(`settings.receiptAgent.statuses.${run.status}`)}
                        </Badge>
                        {run.stats ? (
                          <span className='text-xs text-muted-foreground'>
                            {t('settings.receiptAgent.serialsKept', {
                              kept: run.stats.serialNo.accepted,
                              total:
                                run.stats.serialNo.accepted +
                                run.stats.serialNo.changed +
                                run.stats.serialNo.removed,
                            })}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** One field's record: the share kept as proposed, then the counts. */
function KeptLine({
  label,
  stats,
}: {
  readonly label: string;
  readonly stats: FieldStats;
}): ReactElement {
  const { t } = useTranslation();
  const share = keptShare(stats);
  return (
    <p>
      <span className='font-medium'>{label}</span>
      {' · '}
      {share === undefined
        ? t('settings.receiptAgent.noProposals')
        : t('settings.receiptAgent.kept', {
            share: Math.round(share * 100),
            ...stats,
          })}
    </p>
  );
}
