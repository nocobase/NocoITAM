import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ExtendedFields } from '../../client/components/itam/extended-fields.js';

const state = vi.hoisted(() => ({
  records: {} as Record<string, unknown>,
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { value?: string; count?: number }) =>
      options?.value !== undefined ? `${key}:${options.value}` : key,
  }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  masterDataPath: (collection: string) => `itam/master/${collection}`,
  useItamRecord: (path: string, id?: string) => ({
    data: id ? state.records[`${path}/${id}`] : undefined,
  }),
}));
vi.mock('../../client/components/itam/detail-page.js', () => ({
  InfoSection: ({ children }: { children: unknown }) => (
    <section>{children as never}</section>
  ),
  InfoRow: ({ label, children }: { label: unknown; children: unknown }) => (
    <div data-testid={`row-${String(label)}`}>{children as never}</div>
  ),
}));
vi.mock('../../client/components/itam/inline-field.js', () => ({
  // The display, and a box that saves what is typed: enough to see what a
  // row shows and what it writes.
  InlineField: ({
    field,
    display,
    onSave,
  }: {
    field: { key: string };
    display: unknown;
    onSave: (value: unknown) => Promise<void>;
  }) => (
    <>
      {display as never}
      <input
        aria-label={`edit-${field.key}`}
        onBlur={(event) => void onSave(event.target.value)}
      />
    </>
  ),
}));

beforeEach(() => {
  state.records = {
    'itam/master/categories/cat-monitor': {
      id: 'cat-monitor',
      fieldTemplate: [
        {
          key: 'screenSize',
          label: 'Screen size',
          type: 'text',
          scope: 'model',
        },
        {
          key: 'resolution',
          label: 'Resolution',
          type: 'text',
          scope: 'model',
        },
        { key: 'assetLabel', label: 'Label', type: 'text' },
      ],
    },
    'itam/master/models/m1': {
      id: 'm1',
      attributes: { screenSize: '27', resolution: '3840×2160' },
    },
  };
});

const device = {
  id: 'd1',
  categoryId: 'cat-monitor',
  modelId: 'm1',
  // A copy of the model's size, written before the field moved to the model.
  attributes: { screenSize: '27', resolution: '2560×1440', assetLabel: 'X-1' },
};

it('shows what the device reads from its model and what it states itself', async () => {
  const onSave = vi.fn(() => Promise.resolve());
  render(<ExtendedFields record={device} editable onSave={onSave} />);
  // The model's value, said to be the model's.
  const size = screen.getByTestId('row-Screen size');
  expect(size).toHaveTextContent('27');
  expect(size).toHaveTextContent('extendedFields.fromModel');
  // This one's own, beside what the model says, and a way back.
  const resolution = screen.getByTestId('row-Resolution');
  expect(resolution).toHaveTextContent('2560×1440');
  expect(resolution).toHaveTextContent('extendedFields.modelSays:3840×2160');
  // A field of each device's own says nothing about a model.
  expect(screen.getByTestId('row-Label')).toHaveTextContent('X-1');
  expect(screen.getByTestId('row-Label')).not.toHaveTextContent(
    'extendedFields',
  );

  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'extendedFields.useModel' }),
    );
  });
  expect(onSave).toHaveBeenLastCalledWith({
    screenSize: '27',
    assetLabel: 'X-1',
  });

  // Typing the model's own value is no value of the device's either, and
  // drops the copy it held.
  await act(async () => {
    fireEvent.blur(screen.getByLabelText('edit-screenSize'), {
      target: { value: '27' },
    });
  });
  expect(onSave).toHaveBeenLastCalledWith({
    resolution: '2560×1440',
    assetLabel: 'X-1',
  });
  // Another value is.
  await act(async () => {
    fireEvent.blur(screen.getByLabelText('edit-screenSize'), {
      target: { value: '32' },
    });
  });
  expect(onSave).toHaveBeenLastCalledWith({
    ...device.attributes,
    screenSize: '32',
  });
});

it('shows a model only the fields its devices share', () => {
  render(
    <ExtendedFields
      record={{
        id: 'm1',
        categoryId: 'cat-monitor',
        attributes: { screenSize: '27' },
      }}
      of='model'
      editable
      onSave={vi.fn()}
    />,
  );
  expect(screen.getByTestId('row-Screen size')).toHaveTextContent('27');
  expect(screen.getByTestId('row-Screen size')).not.toHaveTextContent(
    'extendedFields.fromModel',
  );
  expect(screen.queryByTestId('row-Label')).toBeNull();
});
