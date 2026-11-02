import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { SearchBar } from '../../client/components/itam/search-bar.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('follows a search cleared from outside instead of sending it back', () => {
  // 清空筛选 under a list that found nothing clears the address
  // (2026-10-30); the box must not put its old text back.
  const onChange = vi.fn();
  const { rerender } = render(
    <SearchBar value='nothing-like-this' onChange={onChange} forceOpen />,
  );
  rerender(<SearchBar value='' onChange={onChange} forceOpen />);
  act(() => vi.advanceTimersByTime(500));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(onChange).not.toHaveBeenCalled();
});

it('keeps what is being typed when its own earlier text comes back', () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <SearchBar value='' onChange={onChange} forceOpen />,
  );
  const box = screen.getByRole('textbox');
  fireEvent.change(box, { target: { value: 'SH-L' } });
  act(() => vi.advanceTimersByTime(300));
  expect(onChange).toHaveBeenLastCalledWith('SH-L');
  // Typing on before the address answers with the earlier text.
  fireEvent.change(box, { target: { value: 'SH-LT' } });
  rerender(<SearchBar value='SH-L' onChange={onChange} forceOpen />);
  expect(box).toHaveValue('SH-LT');
  act(() => vi.advanceTimersByTime(300));
  expect(onChange).toHaveBeenLastCalledWith('SH-LT');
});
