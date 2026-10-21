import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { ManufacturerCaptureDialog } from '../../client/components/itam/manufacturer-capture-dialog.js';

const state = vi.hoisted(() => ({
  asked: [] as {
    task: string;
    material: string;
    context: Record<string, unknown>;
  }[],
  created: [] as unknown[],
  updated: [] as unknown[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name !== undefined ? `${key}:${options.name}` : key,
  }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  apiErrorBody: () => undefined,
  masterDataPath: (collection: string) => `itam/master/${collection}`,
  useItamMutations: () => ({
    create: {
      mutateAsync: (values: unknown) => {
        state.created.push(values);
        return Promise.resolve({ id: 'new' });
      },
      reset: vi.fn(),
      isPending: false,
      error: undefined,
    },
    update: {
      mutateAsync: (input: unknown) => {
        state.updated.push(input);
        return Promise.resolve({ id: 'mfr-dell' });
      },
      reset: vi.fn(),
      isPending: false,
      error: undefined,
    },
  }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  referencePath: (collection: string) => `itam/master/${collection}`,
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({ available: true }),
  useAiReading: () => (input: (typeof state.asked)[number]) => {
    state.asked.push(input);
    return Promise.resolve({
      reading: {
        name: 'Dell',
        website: 'https://www.dell.com',
        supportUrl: 'https://www.dell.com/support',
        sources: [
          { title: 'Dell Support', url: 'https://www.dell.com/support' },
        ],
      },
      said: 'No business support phone is published.',
    });
  },
}));
vi.mock('../../client/lib/itam/ai.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/lib/itam/ai.js')>()),
  useAiStatus: () => ({ data: { available: true, webSearch: true } }),
}));
vi.mock('../../client/components/itam/field-input.js', () => ({
  FieldInput: ({
    id,
    value,
    onChange,
  }: {
    id: string;
    value: unknown;
    onChange: (value: unknown) => void;
  }) => (
    <input
      id={id}
      aria-label={id}
      value={value === null || value === undefined ? '' : String(value)}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

beforeEach(() => {
  state.asked = [];
  state.created = [];
  state.updated = [];
});

// 创建制造商 on the list (2026-10-21): AI 整理 / 表单录入, as a model's.
it('creates a maker from its name, looked up on the web', async () => {
  render(
    <ManufacturerCaptureDialog
      open
      onOpenChange={vi.fn()}
      onCreated={vi.fn()}
    />,
  );
  fireEvent.change(
    screen.getByRole('textbox', { name: 'masterCapture.material' }),
    { target: { value: 'Dell' } },
  );
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'procurement.capture.organise' }),
    );
  });
  expect(state.asked[0]).toMatchObject({
    task: 'manufacturer',
    material: 'Dell',
  });
  expect(screen.getByLabelText('form-supportUrl')).toHaveValue(
    'https://www.dell.com/support',
  );
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'actions.create' }));
  });
  expect(state.created).toEqual([
    expect.objectContaining({ name: 'Dell', $origin: 'ai' }),
  ]);
});

// 完善 on a maker's page: checked as it opens, 修改 where it differs, saved
// over the record.
it('refines a maker on the books', async () => {
  await act(async () => {
    render(
      <ManufacturerCaptureDialog
        open
        onOpenChange={vi.fn()}
        record={{
          id: 'mfr-dell',
          name: 'Dell',
          website: 'https://www.dell.com',
        }}
        onCreated={vi.fn()}
      />,
    );
  });
  expect(state.asked[0]).toMatchObject({
    task: 'manufacturer',
    material: 'Dell',
    context: { refine: true, form: expect.objectContaining({ name: 'Dell' }) },
  });
  // Only the support site is new.
  expect(screen.getAllByText('fieldTemplate.changedTag')).toHaveLength(1);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  });
  expect(state.updated).toEqual([
    {
      id: 'mfr-dell',
      input: expect.objectContaining({
        supportUrl: 'https://www.dell.com/support',
        $origin: 'ai',
      }),
    },
  ]);
});
