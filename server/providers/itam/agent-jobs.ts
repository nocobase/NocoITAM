import { Job, type JobClass, type JobExecutionContext } from '@nocobase/jobs';

/**
 * The work agents' runs as tasks of the application's jobs service
 * (2026-10-16, after NocoCRM's follow-up jobs): a run asked for is written
 * running (`itamAgentRuns`) and its task queued, so a restart picks it up
 * again (the memory adapter writes pending tasks to storage on shutdown;
 * Redis keeps them outright) and as many run at a time as the
 * `itamAgentRuns` jobs configuration allows (server/config/jobs.ts). A task
 * carries only the run it fills, and does nothing once the run is no longer
 * running, so a task replayed after recovery cannot run twice.
 */
export const AGENT_JOBS = 'itamAgentRuns';

export interface AgentJobPayload {
  [key: string]: string;
  readonly runId: string;
}

/** The task class, around the function that runs one: a job gets nothing but its payload. */
export function createAgentJob(
  run: (runId: string, signal: AbortSignal) => Promise<void>,
): JobClass<AgentJobPayload, Job<AgentJobPayload>> {
  return class AgentRunJob extends Job<AgentJobPayload> {
    public static readonly jobName: string = 'itam.agent-run';
    public async execute({ signal }: JobExecutionContext): Promise<void> {
      await run(this.payload.runId, signal);
    }
  };
}

/**
 * One run of a run at a time in this process: one queued again at start may
 * meet the task the queue kept for it; whichever comes second does nothing
 * while the first works.
 */
export function oncePerRun(
  run: (runId: string, signal: AbortSignal) => Promise<void>,
): (runId: string, signal: AbortSignal) => Promise<void> {
  const claimed = new Set<string>();
  return async (runId, signal) => {
    if (claimed.has(runId)) return;
    claimed.add(runId);
    try {
      await run(runId, signal);
    } finally {
      claimed.delete(runId);
    }
  };
}
