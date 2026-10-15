import { useTranslation } from '@nocobase/i18n/client';
import { RefreshCw } from 'lucide-react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
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
import { cn } from '@/lib/utils';

import {
  DeviceConnectionActions,
  DeviceConnectionNotes,
} from './device-connection';

const RUN_TONE: Readonly<
  Record<SyncRun['status'], 'default' | 'secondary' | 'destructive' | 'outline'>
> = {
  running: 'outline',
  succeeded: 'secondary',
  partial: 'destructive',
  failed: 'destructive',
};

/**
 * 设置 → MDM (2026-10-14): each device management platform, its
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
      {/* 立即同步 follows the title, as each platform's buttons follow its
          name and status below; the description runs the full width. */}
      <CardHeader>
        <div className='flex flex-wrap items-center gap-2'>
          <CardTitle>{t('settings.deviceSync.cardTitle')}</CardTitle>
          <Button
            variant='outline'
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
        </div>
        <CardDescription>
          {t('settings.deviceSync.description')}
        </CardDescription>
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
  const navigate = useNavigate();
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
        <DeviceConnectionActions
          source={source.key}
          connection={connection}
          secretsReady={secretsReady}
        />
      </div>
      {source.configured ? null : (
        <p className='text-sm text-muted-foreground'>
          {t(`settings.deviceSync.howTo.${source.key}`)}
        </p>
      )}
      <DeviceConnectionNotes
        connection={connection}
        secretsReady={secretsReady}
      />
      {/* Not connected (2026-10-15): no run to report, since nothing can
          sync, and no tiles; only that records from before are kept, which
          MDM 核对 still uses. */}
      {!source.configured ? (
        hasData ? (
          <p className='text-sm text-muted-foreground'>
            {source.lastSuccessAt
              ? t('settings.deviceSync.retained', {
                  count: counts.devices + counts.gone,
                  date: formatDate(source.lastSuccessAt, true),
                })
              : t('settings.deviceSync.retainedUndated', {
                  count: counts.devices + counts.gone,
                })}
          </p>
        ) : null
      ) : run ? (
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
      {source.configured && hasData ? (
        // Compact tiles, six across when there is room: the page-level
        // StatCards are too large inside a platform's block. What waits on
        // a person is tinted and opens MDM 核对, where it is settled.
        <div className='grid grid-cols-3 gap-2 lg:grid-cols-6'>
          {(
            [
              'devices',
              'linked',
              'unlinked',
              'ambiguous',
              'personal',
              'gone',
            ] as const
          ).map((key) => {
            const waiting =
              (key === 'unlinked' || key === 'ambiguous') && counts[key] > 0;
            const tile = (
              <>
                <span className='text-xs text-muted-foreground'>
                  {t(`settings.deviceSync.counts.${key}`)}
                </span>
                <span
                  className={cn(
                    'font-heading text-base leading-tight font-semibold tabular-nums',
                    waiting && 'text-warning-foreground',
                  )}
                >
                  {counts[key]}
                </span>
              </>
            );
            const style =
              'flex flex-col gap-0.5 rounded-lg bg-muted/50 px-3 py-1.5 text-left';
            return waiting ? (
              <button
                key={key}
                type='button'
                className={cn(
                  style,
                  'bg-warning/40 transition-colors hover:bg-warning/60',
                )}
                onClick={() => void navigate('/device-sync?view=unregistered')}
              >
                {tile}
              </button>
            ) : (
              <div key={key} className={style}>
                {tile}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
