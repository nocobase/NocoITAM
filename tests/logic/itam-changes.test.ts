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

  it('hands the burst its last named writer', () => {
    const publish = vi.fn();
    const changes = createItamChanges(publish, { wait: 400, maxWait: 3000 });
    changes.touched('ann');
    changes.touched();
    changes.touched('mia');
    vi.advanceTimersByTime(400);
    expect(publish).toHaveBeenCalledWith({ actorId: 'mia' });
    // The next burst starts unnamed.
    changes.touched();
    vi.advanceTimersByTime(400);
    expect(publish).toHaveBeenLastCalledWith({});
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
