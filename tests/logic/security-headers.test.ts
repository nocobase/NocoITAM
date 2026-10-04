// @vitest-environment node

import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { securityHeadersHttpMiddleware } from '../../server/security-headers.js';

/**
 * The header is the half of the Markdown exfiltration defence that does not
 * live in `client/extensions/nocobase-ai`, the Registry copy a future
 * three-way merge could take from upstream. It is asserted here so that half
 * cannot go quietly.
 */
describe('security headers', () => {
  const respond = async (path = '/anything') => {
    const router = new Hono();
    securityHeadersHttpMiddleware.register(router, undefined as never);
    router.get('*', (context) => context.text('ok'));
    return router.request(path);
  };

  it('tells the browser to load images only from the application itself', async () => {
    const response = await respond();
    expect(response.headers.get('content-security-policy')).toBe(
      "img-src 'self' data: blob:",
    );
  });

  it('applies to every path, the API included', async () => {
    for (const path of ['/', '/api/itam/devices', '/main/login']) {
      const response = await respond(path);
      expect(response.headers.get('content-security-policy')).toContain(
        "img-src 'self'",
      );
    }
  });
});
