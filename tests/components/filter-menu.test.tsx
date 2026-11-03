import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactElement } from 'react';
import { expect, it, vi } from 'vitest';

import {
  type FilterDimension,
  FilterMenu,
} from '../../client/components/filter-menu.js';

// A list's filters are a menu in its header with the applied ones as chips
// (2026-11-03, after NocoSupport's lists).

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options
        ? `${key}:${String(options.count)}`
        : options && 'name' in options
          ? `${key}:${String(options.name)}`
          : key,
  }),
}));

function Harness({ onClear }: { readonly onClear?: () => void }): ReactElement {
  const [values, setValues] = useState<Record<string, string | null>>({});
  const dimension = (
    key: string,
    label: string,
    options: [string, string][],
  ): FilterDimension => ({
    key,
    label,
    options: options.map(([value, text]) => ({ value, label: text })),
    value: values[key] ?? null,
    onChange: (next) => setValues((current) => ({ ...current, [key]: next })),
  });
  return (
    <FilterMenu
      dimensions={[
        dimension('status', 'Status', [
          ['inStock', 'In stock'],
          ['assigned', 'Assigned'],
        ]),
        dimension('method', 'Method', [['scrap', 'Scrap']]),
      ]}
      onClear={() => {
        onClear?.();
        setValues({});
      }}
    />
  );
}

async function choose(dimension: string, value: string): Promise<void> {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: /^listFilters\.filters/ }),
  );
  await user.click(await screen.findByRole('menuitem', { name: dimension }));
  // jsdom has no submenu geometry for the pointer safe corridor.
  fireEvent.click(await screen.findByRole('menuitemradio', { name: value }));
  // A value chosen leaves the menu open, as NocoSupport's does.
  await closeMenu();
}

async function closeMenu(): Promise<void> {
  await userEvent.keyboard('{Escape}{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('menu')).not.toBeInTheDocument(),
  );
}

it('applies a value as a chip that removes it', async () => {
  render(<Harness />);
  expect(
    screen.getByRole('button', { name: 'listFilters.filters' }),
  ).toBeInTheDocument();

  await choose('Status', 'Assigned');

  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'listFilters.filtersApplied:1' }),
    ).toBeInTheDocument(),
  );
  expect(screen.getByText('Assigned')).toBeInTheDocument();

  fireEvent.click(
    screen.getByRole('button', { name: 'listFilters.removeFilter:Status' }),
  );
  expect(screen.queryByText('Assigned')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'listFilters.filters' }),
  ).toBeInTheDocument();
});

it('offers Clear filters only while a filter is applied', async () => {
  const onClear = vi.fn();
  render(<Harness onClear={onClear} />);
  fireEvent.click(screen.getByRole('button', { name: 'listFilters.filters' }));
  await screen.findByRole('menuitem', { name: 'Status' });
  expect(
    screen.queryByRole('menuitem', { name: 'listFilters.clear' }),
  ).not.toBeInTheDocument();
  await closeMenu();

  await choose('Status', 'In stock');
  await choose('Method', 'Scrap');
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'listFilters.filtersApplied:2' }),
    ).toBeInTheDocument(),
  );

  fireEvent.click(
    screen.getByRole('button', { name: 'listFilters.filtersApplied:2' }),
  );
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'listFilters.clear' }),
  );
  expect(onClear).toHaveBeenCalledOnce();
  expect(screen.queryByText('In stock')).not.toBeInTheDocument();
  expect(screen.queryByText('Scrap')).not.toBeInTheDocument();
});

it('draws nothing for a list with nothing to filter by', () => {
  const { container } = render(
    <FilterMenu dimensions={[]} onClear={() => undefined} />,
  );
  expect(container).toBeEmptyDOMElement();
});
