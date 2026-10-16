import {
  defineAppConfig,
  type AppConfigFactory,
} from '@nocobase/app-server/config';
import type { AppJobsConfig } from '@nocobase/app-server/jobs';

/**
 * Configurations the jobs service can run on. None is the default: until `jobs.default` names one, executors
 * run on the built-in memory adapter, which serves one process and writes its state under storage/jobs when the
 * application stops, and which is reported at startup outside development. Name `memory` to keep that choice without
 * the report, or `redis` to run any number of instances with each firing executed once.
 */
const jobs: AppConfigFactory<AppJobsConfig> = defineAppConfig(({ paths }) => ({
  memory: {
    adapter: 'memory',
    persistence: { path: paths.storage('jobs') },
  },
  redis: {
    adapter: 'redis',
    connection: { host: '127.0.0.1', port: 6379, db: 0 },
    // Every firing leaves a finished job behind; keep the history bounded.
    removeOnComplete: { count: 1000 },
    removeOnFail: { age: 604_800 },
  },
  // ITAM's work agents' runs (an application addition,
  // server/providers/itam/agent-jobs.ts): two at a time, each a model call
  // of up to minutes. A deployment raises `concurrency` in config.yml, or
  // moves them to Redis (`adapter: redis` and a connection) to run them
  // across instances; a failure is the run's own, so one attempt.
  itamAgentRuns: {
    adapter: 'memory',
    concurrency: 2,
    attempts: 1,
    persistence: { path: paths.storage('jobs') },
  },
}));

export default jobs;
