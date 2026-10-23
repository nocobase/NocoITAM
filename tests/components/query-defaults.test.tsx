import { ApiClientError } from '@nocobase/app-client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { expect, it } from 'vitest';

import {
  retryQuery,
  useItamQueryDefaults,
} from '../../client/lib/itam/query-defaults.js';

const failed = (status: number) =>
  new ApiClientError('failed', { status, method: 'GET', url: '/api/x' });

// A missing record says so at once (2026-10-23): nothing the server refused
// as wrong is asked again; anything else once.
it('asks again once, never after a 4xx', () => {
  expect(retryQuery(0, failed(404))).toBe(false);
  expect(retryQuery(0, failed(403))).toBe(false);
  expect(retryQuery(0, failed(500))).toBe(true);
  expect(retryQuery(1, failed(500))).toBe(false);
  expect(retryQuery(0, new TypeError('Failed to fetch'))).toBe(true);
});

it('puts the rule on the cache the pages read', () => {
  const client = new QueryClient();
  function Layout(): ReactElement | null {
    useItamQueryDefaults();
    return null;
  }
  render(
    <QueryClientProvider client={client}>
      <Layout />
    </QueryClientProvider>,
  );
  expect(client.getDefaultOptions().queries?.retry).toBe(retryQuery);
});
