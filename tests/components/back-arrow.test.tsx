import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router';
import { expect, it, vi } from 'vitest';

import { BackArrow } from '../../client/components/itam/back-arrow.js';

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
        <Route path='/review' element={<BackArrow />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('open'));
  fireEvent.click(screen.getByRole('button', { name: 'common.backPrevious' }));
  expect(screen.getByText('open')).toBeInTheDocument();
});

it('shows nothing on a page opened directly, or when hidden', () => {
  const { unmount } = render(
    <MemoryRouter initialEntries={['/review']}>
      <BackArrow />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  unmount();
  render(
    <MemoryRouter initialEntries={['/devices']}>
      <Routes>
        <Route path='/devices' element={<Origin />} />
        <Route path='/review' element={<BackArrow hidden />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText('open'));
  expect(
    screen.queryByRole('button', { name: 'common.backPrevious' }),
  ).not.toBeInTheDocument();
});
