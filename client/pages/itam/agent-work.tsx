import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useTranslation } from '@nocobase/i18n/client';
import { Bot } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router';

import { Page, PageHeader } from '@/components/itam/page-header';
import { RecordLink } from '@/components/itam/record-link';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAgentRuns,
  useAgentsOverview,
  useSaveAgentSwitch,
  type AgentOverview,
  type AgentRun,
  type RunCounts,
  type RunStatus,
} from '@/lib/itam/agents';
import { relativeTime } from '@/lib/itam/format';

/**
 * 智能体工作 (2026-10-16, after NocoCRM's Agent
 * work page): what the work agents do on their own. A tab per agent — so
 * far 审批审阅 — with what it does and that it only suggests, its model and
 * skill and where to change them (AI → 智能体, AI → 技能), whether it runs
 * on its own and on which triggers, how it did over 7 or 30 days, and its
 * runs of the last 90 days on records the reader may read, by status.
 * Switching needs the settings grant; a person asking by hand is never
 * switched off.
 */
export default function AgentWorkPage(): ReactElement {
  const { t } = useTranslation();
  const overview = useAgentsOverview();
  const [params, setParams] = useSearchParams();
  const agents = overview.data ?? [];
  const current =
    agents.find((agent) => agent.agent === params.get('agent')) ?? agents[0];
  return (
    <Page>
      <PageHeader
        title={t('agentWork.title')}
        description={t('agentWork.description')}
      />
      {overview.isLoading ? (
        <Skeleton className='h-64 w-full rounded-lg' />
      ) : overview.error ? (
        <p className='text-sm text-destructive'>{overview.error.message}</p>
      ) : current ? (
        <>
          <Tabs
            value={current.agent}
            onValueChange={(next) =>
              setParams({ agent: String(next) }, { replace: true })
            }
          >
            <TabsList variant='line'>
              {agents.map((agent) => (
                <TabsTrigger key={agent.agent} value={agent.agent}>
                  {t(`agentWork.${agent.agent}.name`)}
                  {agent.working ? <Spinner className='size-3' /> : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <AgentPanel key={current.agent} agent={current} />
        </>
      ) : null}
    </Page>
  );
}

function AgentPanel({
  agent,
}: {
  readonly agent: AgentOverview;
}): ReactElement {
  const { t } = useTranslation();
  const save = useSaveAgentSwitch(agent.agent);
  const [days, setDays] = useState<7 | 30>(7);
  const counts = days === 7 ? agent.last7 : agent.last30;
  // The Agents plugin's pages, where its model and instructions are set and
  // its skill is read: offered only to whoever may open them.
  const agentsPage = useCan({
    resource: { type: 'page', id: 'agents' },
    action: 'access',
  }).can;
  const skillsPage = useCan({
    resource: { type: 'page', id: 'skills' },
    action: 'access',
  }).can;
  const name = t(`agentWork.${agent.agent}.name`);
  return (
    <div className='space-y-6'>
      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardContent className='space-y-3 p-5 text-sm'>
            <div className='flex items-center gap-2'>
              <Bot className='size-4 text-primary' aria-hidden />
              <span className='font-semibold'>{name}</span>
              <StatusBadge
                tone={agent.switches.enabled ? 'success' : 'neutral'}
                size='sm'
              >
                {t(agent.switches.enabled ? 'agentWork.on' : 'agentWork.off')}
              </StatusBadge>
            </div>
            <p>{t(`agentWork.${agent.agent}.description`)}</p>
            <p className='text-muted-foreground'>
              {t('agentWork.onlySuggests', { name })}
            </p>
            <dl className='grid grid-cols-[auto_1fr] gap-x-4 gap-y-1'>
              <dt className='text-muted-foreground'>{t('agentWork.model')}</dt>
              <dd className='font-mono text-xs leading-5'>
                {agent.model
                  ? `${agent.model.modelService} · ${agent.model.model}`
                  : t('agentWork.noModel')}
              </dd>
              <dt className='text-muted-foreground'>{t('agentWork.skill')}</dt>
              <dd>
                {agent.skillId && skillsPage ? (
                  <Link
                    className='text-primary underline-offset-4 hover:underline'
                    to={`/skills/${encodeURIComponent(agent.skillId)}`}
                  >
                    {agent.skill}
                  </Link>
                ) : (
                  agent.skill
                )}
              </dd>
            </dl>
            {agent.agentId && agentsPage ? (
              <Button
                variant='outline'
                render={
                  <Link to={`/agents/${encodeURIComponent(agent.agentId)}`} />
                }
                nativeButton={false}
              >
                {t('agentWork.configure')}
              </Button>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardContent className='space-y-3 p-5 text-sm'>
            <div className='flex items-center justify-between gap-3'>
              <span className='font-semibold'>{t('agentWork.whenItRuns')}</span>
              <label className='flex items-center gap-2'>
                <span className='text-muted-foreground'>
                  {t('agentWork.runsOnItsOwn')}
                </span>
                <Switch
                  checked={agent.switches.enabled}
                  disabled={save.isPending}
                  onCheckedChange={(enabled) => save.mutate({ enabled })}
                />
              </label>
            </div>
            <ul className='divide-y'>
              {agent.triggers.map((trigger) => (
                <li
                  key={trigger}
                  className='flex items-start justify-between gap-4 py-2'
                >
                  <span className='space-y-0.5'>
                    <span className='block font-medium'>
                      {t(`agentWork.${agent.agent}.triggers.${trigger}.title`)}
                    </span>
                    <span className='block text-muted-foreground'>
                      {t(`agentWork.${agent.agent}.triggers.${trigger}.hint`)}
                    </span>
                  </span>
                  <Switch
                    checked={agent.switches.triggers[trigger] !== false}
                    disabled={save.isPending || !agent.switches.enabled}
                    onCheckedChange={(on) =>
                      save.mutate({ triggers: { [trigger]: on } })
                    }
                  />
                </li>
              ))}
            </ul>
            <p className='text-xs text-muted-foreground'>
              {t(`agentWork.${agent.agent}.byHand`, {
                defaultValue: t('agentWork.byHand', { name }),
              })}
            </p>
            {save.error ? (
              <p className='text-destructive'>{save.error.message}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>
      <section className='space-y-3'>
        <div className='flex items-center justify-between gap-3'>
          <h2 className='text-sm font-semibold'>{t('agentWork.howItDid')}</h2>
          <Tabs
            value={String(days)}
            onValueChange={(next) => setDays(next === '30' ? 30 : 7)}
          >
            <TabsList>
              <TabsTrigger value='7'>{t('agentWork.last7')}</TabsTrigger>
              <TabsTrigger value='30'>{t('agentWork.last30')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Counts counts={counts} />
      </section>
      <Runs agent={agent} />
    </div>
  );
}

function Counts({ counts }: { readonly counts: RunCounts }): ReactElement {
  const { t } = useTranslation();
  const decided = counts.accepted + counts.dismissed;
  const items = [
    ['runs', counts.runs],
    ['accepted', counts.accepted],
    ['dismissed', counts.dismissed],
    ['waiting', counts.waiting],
    ['failed', counts.failed],
    [
      'acceptance',
      decided ? `${Math.round((counts.accepted / decided) * 100)}%` : '—',
    ],
  ] as const;
  return (
    <div className='grid gap-4 sm:grid-cols-3 xl:grid-cols-6'>
      {items.map(([key, value]) => (
        <Card key={key} className='py-0'>
          <CardContent className='space-y-1 p-4'>
            <p className='text-xs text-muted-foreground'>
              {t(`agentWork.counts.${key}`)}
            </p>
            <p className='text-2xl font-semibold tabular-nums'>{value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

const FILTERS: readonly (RunStatus | 'all')[] = [
  'all',
  'pending',
  'accepted',
  'dismissed',
  'running',
  'failed',
];

function Runs({ agent }: { readonly agent: AgentOverview }): ReactElement {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<RunStatus | 'all'>('all');
  const runs = useAgentRuns(agent.agent, status === 'all' ? null : status);
  return (
    <section className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <h2 className='text-sm font-semibold'>
          {t('agentWork.runs')}
          <span className='ml-2 text-xs font-normal text-muted-foreground'>
            {t('agentWork.runsHint')}
          </span>
        </h2>
        <Tabs
          value={status}
          onValueChange={(next) => setStatus(next as RunStatus | 'all')}
        >
          <TabsList>
            {FILTERS.map((filter) => (
              <TabsTrigger key={filter} value={filter}>
                {t(`agentWork.filters.${filter}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>
      {runs.isLoading ? (
        <Skeleton className='h-24 w-full rounded-lg' />
      ) : !runs.data?.length ? (
        <p className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
          {t('agentWork.noRuns')}
        </p>
      ) : (
        <ul className='divide-y rounded-lg border bg-card'>
          {runs.data.map((run) => (
            <RunRow
              key={run.id}
              run={run}
              language={i18n.language}
              // Replaced by a review the approver redid in their words.
              redone={runs.data.some((other) => other.revisesId === run.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function RunRow({
  run,
  language,
  redone,
}: {
  readonly run: AgentRun;
  readonly language: string;
  readonly redone: boolean;
}): ReactElement {
  const { t } = useTranslation();
  // MDM 跟进's runs are about a sync, settled on MDM 核对 (2026-10-17).
  const sync = run.agent === 'deviceSync';
  const to = sync
    ? '/device-sync'
    : `${run.subjectType === 'purchaseOrders' ? '/purchases' : '/disposals'}/${encodeURIComponent(run.subjectId)}`;
  return (
    <li className='flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm'>
      <div className='min-w-0 flex-1 space-y-0.5'>
        <RecordLink to={to} className='font-medium'>
          {sync ? t('deviceSyncRun.afterSync') : (run.title ?? run.subjectId)}
        </RecordLink>
        <p className='truncate text-muted-foreground'>
          {run.result
            ? run.agent === 'deviceSync'
              ? run.result.summary
              : `${t(`review.recommendation.${run.result.recommendation}`)} · ${run.result.summary}`
            : run.status === 'failed'
              ? t(`review.failed.${run.failure ?? 'failed'}`, {
                  defaultValue: t('review.failed.failed'),
                })
              : null}
        </p>
      </div>
      <span className='text-muted-foreground'>
        {t(`agentWork.startedBy.${run.trigger}`, { defaultValue: run.trigger })}
      </span>
      <StatusBadge
        size='sm'
        tone={
          run.status === 'pending' || run.status === 'failed'
            ? 'warning'
            : run.status === 'accepted'
              ? 'success'
              : run.status === 'running'
                ? 'info'
                : 'neutral'
        }
      >
        {redone ? t('review.redone') : t(`agentWork.status.${run.status}`)}
      </StatusBadge>
      <span className='w-20 text-right text-muted-foreground tabular-nums'>
        {relativeTime(run.createdAt, language, t('comments.justNow'))}
      </span>
    </li>
  );
}
