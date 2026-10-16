// @vitest-environment node
import type { Application } from '@nocobase/app-server/application';
import { ServiceContainer } from '@nocobase/service-provider';
import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { itamChangesHttpMiddleware } from '../../server/itam-changes.js';
import {
  createItamChanges,
  itamChangesToken,
} from '../../server/providers/itam/changes.js';

describe('ITAM change signal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends one signal for a burst of writes, once it stops', () => {
    const publish = vi.fn();
    const changes = createItamChanges(publish, { wait: 400, maxWait: 3000 });
    changes.touched();
    vi.advanceTimersByTime(300);
    changes.touched();
    vi.advanceTimersByTime(300);
    expect(publish).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('still signals during a long burst, by its deadline', () => {
    const publish = vi.fn();
    const changes = createItamChanges(publish, { wait: 400, maxWait: 1000 });
    for (let elapsed = 0; elapsed < 1200; elapsed += 200) {
      changes.touched();
      vi.advanceTimersByTime(200);
    }
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('is signalled by a successful ITAM write only', async () => {
    const touched = vi.fn();
    const container = new ServiceContainer();
    container.instance(itamChangesToken, { touched });
    const app = { container } as unknown as Application;
    const router = new Hono();
    await itamChangesHttpMiddleware.register(router, app);
    router.get('/main/api/itam/devices', (c) => c.json({ data: [] }));
    router.post('/main/api/itam/devices', (c) => c.json({ data: {} }));
    router.post('/main/api/itam/refused', (c) => c.json({}, 422));
    router.post('/main/api/ai/chat', (c) => c.json({}));

    await router.request('/main/api/itam/devices');
    await router.request('/main/api/itam/refused', { method: 'POST' });
    await router.request('/main/api/ai/chat', { method: 'POST' });
    expect(touched).not.toHaveBeenCalled();
    await router.request('/main/api/itam/devices', { method: 'POST' });
    expect(touched).toHaveBeenCalledTimes(1);
  });
});

// 收件箱 follows the agents' runs, which are worked in the background and
// so outside the routes' own signal (2026-10-17).
describe('agent runs and the change signal', () => {
  it('signals when a run starts, settles and is decided', async () => {
    const { createTestApp } = await import('../support/test-app.js');
    const { databaseManagerToken } = await import('@nocobase/db');
    const { createAgentRunService } =
      await import('../../server/providers/itam/agent-runs.js');
    const app = await createTestApp({ seeds: false });
    try {
      const touched = vi.fn();
      const runs = createAgentRunService(
        app.container.resolve(databaseManagerToken),
        touched,
      );
      const run = await runs.start({
        agent: 'approvalReview',
        trigger: 'asked',
        startedById: 'mia',
        subjectType: 'purchaseOrders',
        subjectId: 'po-1',
        deciderId: 'mia',
      });
      const started = touched.mock.calls.length;
      expect(started).toBeGreaterThan(0);
      await runs.finish(run.id, { status: 'pending', result: { a: 1 } });
      expect(touched.mock.calls.length).toBeGreaterThan(started);
      const settled = touched.mock.calls.length;
      await runs.decide(run.id, { status: 'dismissed', decidedById: 'mia' });
      expect(touched.mock.calls.length).toBeGreaterThan(settled);
      // Nothing changes, nothing is signalled.
      const decided = touched.mock.calls.length;
      await runs.decide(run.id, { status: 'dismissed', decidedById: 'mia' });
      expect(touched.mock.calls.length).toBe(decided);
    } finally {
      await app.destroy();
    }
  });
});
