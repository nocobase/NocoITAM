import { ApiClientError } from '@nocobase/app-client';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';

import { DataTable } from '../../client/components/itam/data-table.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const columns = [
  { key: 'name', header: 'Name', render: (row: { name: string }) => row.name },
];
const show = (props: Partial<Parameters<typeof DataTable>[0]>) =>
  render(
    <MemoryRouter>
      <DataTable<{ id: string; name: string }>
        columns={columns}
        rows={undefined}
        {...props}
      />
    </MemoryRouter>,
  );

// The template's list feedback on ITAM's own lists (2026-10-30, template
// 1.0.0-beta.86).
it('keeps a list empty without filters as its own empty hint', () => {
  show({ rows: [], empty: <p>No devices yet</p> });
  expect(screen.getByText('No devices yet')).toBeVisible();
});

it('says a narrowed list found nothing, and offers to clear the filters', () => {
  const clear = vi.fn();
  show({ rows: [], filtered: true, onClearFilters: clear });
  expect(screen.getByRole('status')).toHaveTextContent(
    'listFeedback.noResults',
  );
  fireEvent.click(screen.getByRole('button', { name: 'listFeedback.clear' }));
  expect(clear).toHaveBeenCalledOnce();
});

it('says a list could not be read, and offers to retry', () => {
  const retry = vi.fn();
  show({ error: new Error('boom'), onRetry: retry });
  expect(screen.getByRole('alert')).toHaveTextContent('listFeedback.failed');
  fireEvent.click(screen.getByRole('button', { name: 'listFeedback.retry' }));
  expect(retry).toHaveBeenCalledOnce();
});

it('tells a denied list from a failed one', () => {
  show({
    error: new ApiClientError('Forbidden', { status: 403 }),
  });
  expect(screen.getByRole('alert')).toHaveTextContent('listFeedback.forbidden');
});

it('keeps the rows a failed refresh had, and says they are the previous ones', () => {
  show({ rows: [{ id: '1', name: 'SH-LT-001' }], error: new Error('boom') });
  expect(screen.getByText('SH-LT-001')).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'listFeedback.refreshFailed',
  );
});
