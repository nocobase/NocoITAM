import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppJobsConfig } from '@nocobase/app-server/jobs';

/** Single-process persistence. Distributed jobs require an explicitly registered backend plugin. */
const jobs: AppConfigFactory<AppJobsConfig> = defineAppConfig(({ paths }) => ({
  memory: {
    adapter: 'memory',
    persistence: { path: paths.storage('jobs') },
  },
  // ITAM's work agents' runs (an application addition,
  // server/providers/itam/agent-jobs.ts): two at a time, each a model call
  // of up to minutes. A deployment raises `concurrency` in config.yml, or
  // moves them to Redis (`adapter: redis` and a connection, with the
  // commercial @nocobase/app-plugin-jobs-redis Server plugin registered) to
  // run them across instances; a failure is the run's own, so one attempt.
  itamAgentRuns: {
    adapter: 'memory',
    concurrency: 2,
    attempts: 1,
    persistence: { path: paths.storage('jobs') },
  },
}));

export default jobs;
