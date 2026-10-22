// @vitest-environment node
import { expect, it } from 'vitest';

import { masterDataByName } from '../../client/lib/itam/master-data.js';

// A new person entered as having started over 30 days ago is not a joiner
// (`isJoiner`): the create form says so under 入职日期 (2026-10-22).
it('notes a start date over 30 days back on a new person only', () => {
  const field = masterDataByName('people')!.fields.find(
    (entry) => entry.key === 'hireDate',
  )!;
  const daysAgo = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  expect(field.noteWhen?.({ hireDate: '2023-03-01' })).toBe(
    'people.hireDateLongAgo',
  );
  expect(field.noteWhen?.({ hireDate: daysAgo(40) })).toBe(
    'people.hireDateLongAgo',
  );
  expect(field.noteWhen?.({ hireDate: daysAgo(10) })).toBeUndefined();
  expect(field.noteWhen?.({ hireDate: daysAgo(-14) })).toBeUndefined();
  expect(field.noteWhen?.({})).toBeUndefined();
  // Editing somebody already entered says nothing.
  expect(
    field.noteWhen?.({ id: 'p1', hireDate: '2023-03-01' }),
  ).toBeUndefined();
});
