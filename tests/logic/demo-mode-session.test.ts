// @vitest-environment node
import { expect } from 'vitest';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { createAppTest } from '@nocobase/app-testing/server';

import { createStandaloneServer } from '../../server/standalone.js';

const origin = 'https://demo.example.test';
const test = createAppTest({
  createServer: createStandaloneServer,
  connections: ['main'],
  config: {
    app: { publicOrigin: origin },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
    secrets: { keys: [{ version: 1, key: 'a'.repeat(64) }] },
    notification: { channels: { 'in-app': { provider: 'in-app' } } },
    demoMode: { enabled: true },
  },
});

test('HTTPS demo entry issues partitioned cookies and recognizes the session with ITAM authentication', async ({
  request,
}) => {
  const entry = await request('/demoMode/accounts/signInDefault', {
    method: 'POST',
    headers: { Origin: origin },
  });
  expect(entry.status).toBe(200);
  expect(await entry.json()).toMatchObject({ data: { signedIn: true } });

  // Quick entry also expires legacy cookies; only send the newly issued ones.
  const cookies = entry.headers
    .getSetCookie()
    .filter((cookie) => !/max-age=0(?:;|$)/i.test(cookie));
  expect(cookies.length).toBeGreaterThan(0);
  for (const cookie of cookies) {
    expect(cookie).toMatch(/;\s*SameSite=None(?:;|$)/i);
    expect(cookie).toMatch(/;\s*Secure(?:;|$)/i);
    expect(cookie).toMatch(/;\s*Partitioned(?:;|$)/i);
  }

  const session = await request('/auth/get-session', {
    headers: {
      Origin: origin,
      Cookie: cookies.map((cookie) => cookie.split(';')[0]).join('; '),
    },
  });
  expect(session.status).toBe(200);
  expect(await session.json()).toMatchObject({
    user: { username: DEFAULT_ADMIN_CREDENTIALS.username },
  });
});
