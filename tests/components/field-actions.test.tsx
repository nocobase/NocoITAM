import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { InlineField } from '../../client/components/itam/inline-field.js';
import type { FieldDefinition } from '../../client/lib/itam/fields.js';

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) => key,
  }),
}));

const onSave = () => Promise.resolve();

it('offers edit and copy beside an ordinary value', () => {
  const field: FieldDefinition = {
    key: 'name',
    label: 'fields.name',
    type: 'text',
  };
  render(
    <InlineField
      field={field}
      value='Office'
      display='Office'
      onSave={onSave}
    />,
  );
  expect(screen.getByRole('button', { name: 'actions.edit' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'actions.copy' })).toBeTruthy();
});

// A product key brings its own audited copy; the row's would copy the mask.
it('leaves copy to a write-only value', () => {
  const field: FieldDefinition = {
    key: 'productKey',
    label: 'fields.productKey',
    type: 'text',
    writeOnly: true,
  };
  render(
    <InlineField
      field={field}
      value='••••••••'
      display='••••••••'
      onSave={onSave}
    />,
  );
  expect(screen.getByRole('button', { name: 'actions.edit' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'actions.copy' })).toBeNull();
});
