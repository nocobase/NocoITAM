import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expect, it } from 'vitest';

import { DetailPage } from '../../client/components/itam/detail-page.js';

// The tabs follow NocoCRM's record pages: each led by its icon, the open one
// marked by a line in the foreground, a count in plain figures.
it('leads each tab with its icon and shows counts as plain figures', () => {
  render(
    <MemoryRouter initialEntries={['/records/1/history']}>
      <Routes>
        <Route
          path='/records/:id'
          element={
            <DetailPage
              title='Record'
              info={null}
              tabs={[
                { key: 'devices', label: 'Devices', to: 'devices', count: 3 },
                { key: 'unknown', label: 'Other', to: 'other' },
                { key: 'history', label: 'History', to: 'history' },
              ]}
            >
              <p>content</p>
            </DetailPage>
          }
        >
          <Route path='history' element={null} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  const tabs = within(screen.getByRole('navigation', { name: 'tabs' }));
  const devices = tabs.getByRole('link', { name: /Devices/ });
  expect(devices.querySelector('svg')).not.toBeNull();
  expect(devices.textContent).toBe('Devices3');
  expect(devices.querySelector('[data-slot=badge]')).toBeNull();
  // A key without an icon still draws its tab.
  expect(
    tabs.getByRole('link', { name: 'Other' }).querySelector('svg'),
  ).toBeNull();
  expect(tabs.getByRole('link', { name: 'History' }).className).toContain(
    'border-foreground',
  );
  expect(devices.className).toContain('border-transparent');
});

// The way back sits beside the title, apart from the record's kind above it,
// which reads as a label rather than a link to its list (2026-10-16).
it('puts the way back beside the title, apart from the kind', () => {
  render(
    <MemoryRouter initialEntries={['/list', '/records/1']} initialIndex={1}>
      <Routes>
        <Route
          path='/records/:id'
          element={
            <DetailPage
              title='PO-000046'
              subtitle='Procurement'
              info={null}
              tabs={[]}
            >
              <p>content</p>
            </DetailPage>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  const back = screen.getByRole('button', { name: 'common.backPrevious' });
  expect(back.parentElement).toBe(
    screen.getByRole('heading', { name: 'PO-000046' }).parentElement,
  );
  expect(screen.getByText('Procurement').closest('button')).toBeNull();
});
