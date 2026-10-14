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
  key: 'notes',
  label: 'fields.notes',
  type: 'textarea',
};
const NOTES = 'First line\nSecond line\nThird line\nFourth line';

// A long text reads and edits as NocoCRM's record pages do: a click opens it
// whole in a pop-up, a double-click there edits it, and closing saves.
it('opens a long text in a pop-up, edits it there and saves on close', async () => {
  const onSave = vi.fn(() => Promise.resolve());
  render(
    <InlineField field={field} value={NOTES} display={NOTES} onSave={onSave} />,
  );
  // No editor in the column itself.
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'fields.notes' }));
  const whole = await screen.findByText(/Fourth line/, {
    selector: '[data-slot=popover-content] div',
  });
  fireEvent.doubleClick(whole);
  const editor = await screen.findByRole('textbox', { name: 'fields.notes' });
  fireEvent.change(editor, { target: { value: 'Rewritten' } });
  fireEvent.keyDown(editor, { key: 'Enter', metaKey: true });
  await waitFor(() => expect(onSave).toHaveBeenCalledWith('Rewritten'));
});

it('leaves the text as it was on Escape', async () => {
  const onSave = vi.fn(() => Promise.resolve());
  render(
    <InlineField field={field} value={NOTES} display={NOTES} onSave={onSave} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'fields.notes' }));
  fireEvent.doubleClick(
    await screen.findByText(/Fourth line/, {
      selector: '[data-slot=popover-content] div',
    }),
  );
  const editor = await screen.findByRole('textbox', { name: 'fields.notes' });
  fireEvent.change(editor, { target: { value: 'Rewritten' } });
  fireEvent.keyDown(editor, { key: 'Escape' });
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'fields.notes' })).toBeNull(),
  );
  expect(onSave).not.toHaveBeenCalled();
});

it('opens an empty one straight into the editor', async () => {
  render(
    <InlineField
      field={field}
      value={null}
      display='—'
      onSave={() => Promise.resolve()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'fields.notes' }));
  expect(
    await screen.findByRole('textbox', { name: 'fields.notes' }),
  ).toBeDefined();
});

it('reads but does not edit when the reader may not', async () => {
  render(
    <InlineField
      field={field}
      value={NOTES}
      display={NOTES}
      editable={false}
      onSave={() => Promise.resolve()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'fields.notes' }));
  fireEvent.doubleClick(
    await screen.findByText(/Fourth line/, {
      selector: '[data-slot=popover-content] div',
    }),
  );
  expect(screen.queryByRole('textbox')).toBeNull();
});
