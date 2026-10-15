import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { expect, it, vi } from 'vitest';

import { HistoryBackButton } from '../../client/components/itam/history-back-button.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

function Origin() {
  const navigate = useNavigate();
  return (
    <button type='button' onClick={() => void navigate('/review')}>
      open
    </button>
  );
}

it('steps back to the page the reader came from', () => {
  render(
    <MemoryRouter initialEntries={['/devices']}>
      <Routes>
        <Route path='/devices' element={<Origin />} />
        <Route path='/review' element={<HistoryBackButton fallback='/' />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('open'));
  fireEvent.click(screen.getByText('navigation.back'));
  // Back on the list it was opened from, not the fallback.
  expect(screen.getByText('open')).toBeInTheDocument();
});

it('leads to the fallback when the page was opened directly', () => {
  render(
    <MemoryRouter initialEntries={['/review']}>
      <HistoryBackButton fallback='/' />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('link', { name: /navigation\.back/ }),
  ).toHaveAttribute('href', '/');
});
