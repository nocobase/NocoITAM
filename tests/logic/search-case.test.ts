// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';

import { masterDataRoutes } from '../../server/routes/itam/master-data.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

let app: TestApp;
const manager = { user: 'mia', role: 'manager' as const };

beforeEach(async () => {
  app = await createTestApp({ seeds: true });
  await app.mount(masterDataRoutes);
});

afterEach(async () => {
  await app.destroy();
});

const names = async (q: string) =>
  (
    (await (
      await app.request(
        `/api/itam/master/models?q=${encodeURIComponent(q)}`,
        manager,
      )
    ).json()) as { data: { name: string }[] }
  ).data
    .map((row) => row.name)
    .sort();

// A search ignores case on every database (2026-10-25): LIKE does on SQLite
// and MySQL, and PostgreSQL finds the matches first (`caselessMatches`).
it('finds records whatever the case of the words searched for', async () => {
  const exact = await names('MacBook Air');
  expect(exact).toContain('MacBook Air 13 M3');
  expect(await names('macbook air')).toEqual(exact);
  expect(await names('MACBOOK AIR')).toEqual(exact);
  // Words with no case, and words that match nothing, as before.
  expect(await names('13')).toContain('MacBook Air 13 M3');
  expect(await names('nothing-like-this')).toEqual([]);
});
