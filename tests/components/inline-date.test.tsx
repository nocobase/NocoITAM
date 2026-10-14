import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { InlineField } from '../../client/components/itam/inline-field.js';
import type { FieldDefinition } from '../../client/lib/itam/fields.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) => key,
  }),
}));

const field: FieldDefinition = {
  key: 'warrantyEnd',
  label: 'fields.warrantyEnd',
  type: 'date',
};

// A record's date is edited the way NocoCRM edits one: double-clicking opens
// a calendar, and picking a day saves it.
it('opens a calendar on a date and saves the day picked', async () => {
  const onSave = vi.fn(() => Promise.resolve());
  render(
    <InlineField
      field={field}
      value='2026-10-14'
      display='2026-10-14'
      onSave={onSave}
    />,
  );
  fireEvent.doubleClick(screen.getByTitle('common.doubleClickToEdit'));
  const day = await screen.findByRole('button', { name: /October 20th/ });
  fireEvent.click(day);
  await waitFor(() => expect(onSave).toHaveBeenCalledWith('2026-10-20'));
  expect(document.querySelector('input[type=date]')).toBeNull();
});

it('clears an optional date under the calendar', async () => {
  const onSave = vi.fn(() => Promise.resolve());
  render(
    <InlineField
      field={field}
      value='2026-10-14'
      display='2026-10-14'
      onSave={onSave}
    />,
  );
  fireEvent.doubleClick(screen.getByTitle('common.doubleClickToEdit'));
  fireEvent.click(
    await screen.findByRole('button', { name: 'common.clearDate' }),
  );
  await waitFor(() => expect(onSave).toHaveBeenCalledWith(null));
});

it('offers no clearing on a required date', async () => {
  render(
    <InlineField
      field={{ ...field, required: true }}
      value='2026-10-14'
      display='2026-10-14'
      onSave={() => Promise.resolve()}
    />,
  );
  fireEvent.doubleClick(screen.getByTitle('common.doubleClickToEdit'));
  await screen.findByRole('button', { name: /October 20th/ });
  expect(screen.queryByRole('button', { name: 'common.clearDate' })).toBeNull();
});
