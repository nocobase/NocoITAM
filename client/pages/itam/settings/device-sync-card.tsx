import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { apiErrorBody } from '@/lib/itam/api';
import {
  useDeviceConnections,
  useDeviceSyncStatus,
  useStartDeviceSync,
  type DeviceConnection,
  type SourceStatus,
  type SyncRun,
} from '@/lib/itam/device-sync';
import { errorMessage, formatDate } from '@/lib/itam/format';
import { useReferenceNames } from '@/lib/itam/references';

import { DeviceConnectionControls } from './device-connection';

const RUN_TONE: Readonly<
  Record<SyncRun['status'], 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  running: 'outline',
  succeeded: 'secondary',
  partial: 'destructive',
  failed: 'destructive',
};

/**
 * 设置 → 设备同步 (2026-10-14): each device management platform, its
 * connection — from `config.yml`, or entered here since 2026-10-15 with the
 * secret sealed on the server and never shown again — how its latest pull
 * went and what it holds. A pull started here runs in the background and
 * the card follows it.
 */
export function DeviceSyncCard(): ReactElement {
  const { t } = useTranslation();
  const status = useDeviceSyncStatus();
  const connections = useDeviceConnections();
  const start = useStartDeviceSync();
  const sources = status.data ?? [];
  const configured = sources.some((source) => source.configured);
  const running = sources.some((source) => source.running);
  const error = start.error
    ? (apiErrorBody(start.error)?.message ?? errorMessage(start.error))
    : null;
  return (
    <Card>
      {/* The card's own action slot keeps 立即同步 at the right of the
          title, however long the description runs. */}
      <CardHeader>
        <CardTitle>{t('settings.deviceSync.title')}</CardTitle>
        <CardDescription>
          {t('settings.deviceSync.description')}
        </CardDescription>
        <CardAction>
          <Button
            variant='outline'
            size='sm'
            disabled={!configured || running || start.isPending}
            onClick={() => start.mutate()}
          >
            {running || start.isPending ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <RefreshCw data-icon='inline-start' />
            )}
            {t(
              running
                ? 'settings.deviceSync.running'
                : 'settings.deviceSync.syncNow',
            )}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className='space-y-5'>
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        {sources.map((source) => (
          <SourceBlock
            key={source.key}
            source={source}
            connection={connections.data?.connections.find(
              (connection) => connection.source === source.key,
            )}
            secretsReady={connections.data?.secretsReady ?? false}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SourceBlock({
  source,
  connection,
  secretsReady,
}: {
  readonly source: SourceStatus;
  readonly connection: DeviceConnection | undefined;
  readonly secretsReady: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const run = source.lastRun;
  const people = useReferenceNames([
    { collection: 'users', ids: run?.actorId ? [run.actorId] : [] },
  ]);
  const counts = source.counts;
  const hasData = counts.devices + counts.gone > 0;
  return (
    <section className='space-y-3 rounded-xl border border-border/60 p-4'>
      <div className='flex flex-wrap items-center gap-2'>
        <h3 className='font-medium'>
          {t(`deviceSync.sourceNames.${source.key}`)}
        </h3>
        <Badge variant={source.configured ? 'secondary' : 'outline'}>
          {t(
            source.configured
              ? 'settings.deviceSync.configured'
              : 'settings.deviceSync.notConfigured',
          )}
        </Badge>
      </div>
      {source.configured ? null : (
        <p className='text-sm text-muted-foreground'>
          {t(`settings.deviceSync.howTo.${source.key}`)}
        </p>
      )}
      <DeviceConnectionControls
        source={source.key}
        connection={connection}
        secretsReady={secretsReady}
      />
      {run ? (
        <div className='space-y-1 text-sm'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='text-muted-foreground'>
              {t('settings.deviceSync.lastRun')}
            </span>
            <span className='tabular-nums'>
              {formatDate(run.startedAt, true)}
            </span>
            <Badge variant={RUN_TONE[run.status]}>
              {t(`settings.deviceSync.statuses.${run.status}`)}
            </Badge>
            <span className='text-muted-foreground'>
              {run.trigger === 'manual'
                ? t('settings.deviceSync.triggers.manual', {
                    name: people.users?.get(run.actorId ?? '') ?? '…',
                  })
                : t(`settings.deviceSync.triggers.${run.trigger}`)}
            </span>
          </div>
          {run.status === 'running' ? null : (
            <p className='text-muted-foreground'>
              {t('settings.deviceSync.runCounts', {
                seen: run.seen,
                added: run.added,
                linked: run.linked,
                gone: run.gone,
              })}
            </p>
          )}
          {run.failureCode ? (
            <p className='text-destructive'>
              {t(`settings.deviceSync.failures.${run.failureCode}`, {
                defaultValue: run.failureCode,
              })}
              {run.failure ? (
                <span className='text-muted-foreground'> ({run.failure})</span>
              ) : null}
            </p>
          ) : null}
          {run.status !== 'succeeded' && source.lastSuccessAt ? (
            <p className='text-muted-foreground'>
              {t('settings.deviceSync.lastSuccess', {
                date: formatDate(source.lastSuccessAt, true),
              })}
            </p>
          ) : null}
        </div>
      ) : source.configured ? (
        <p className='text-sm text-muted-foreground'>
          {t('settings.deviceSync.neverRun')}
        </p>
      ) : null}
      {hasData ? (
        <dl className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3'>
          {(
            [
              'devices',
              'linked',
              'unlinked',
              'ambiguous',
              'personal',
              'gone',
            ] as const
          ).map((key) => (
            <div
              key={key}
              className='flex items-baseline justify-between gap-2'
            >
              <dt className='text-muted-foreground'>
                {t(`settings.deviceSync.counts.${key}`)}
              </dt>
              <dd className='font-medium tabular-nums'>{counts[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
