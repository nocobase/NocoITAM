import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { MasterCreateDialog } from '../../client/components/itam/master-create-dialog.js';

const state = vi.hoisted(() => ({
  available: true,
  asked: [] as {
    task: string;
    material: string;
    context: Record<string, unknown>;
    instruction?: string;
  }[],
  answer: {
    reading: { name: 'OptiPlex 7010 SFF' } as Record<string, unknown> | null,
    said: 'No EOL date published; check the code.',
  },
  requests: [] as { path: string; json?: unknown }[],
  created: [] as unknown[],
  updated: [] as unknown[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name !== undefined ? `${key}:${options.name}` : key,
  }),
}));
vi.mock('@nocobase/app-client', () => ({
  resolveAppUrl: (path: string) => `/main${path}`,
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  apiErrorBody: () => undefined,
  masterDataPath: (collection: string) => `itam/master/${collection}`,
  useApi: () => ({
    request: (input: { path: string; json?: unknown }) => {
      state.requests.push(input);
      return Promise.resolve({
        data: {
          values: {
            name: 'OptiPlex 7010 SFF',
            code: 'OPT7010SFF',
            categoryId: 'cat-desktop',
            warrantyMonths: 36,
          },
          manufacturerName: 'Dell Technologies',
          duplicates: [{ id: 'm9', name: 'OptiPlex 7010' }],
          similar: [{ id: 'm8', name: 'OptiPlex 7010 Tower' }],
          uncertain: ['code'],
          sources: [
            { title: 'Dell spec sheet', url: 'https://dell.example/7010' },
          ],
        },
      });
    },
  }),
  useItamList: () => ({
    data: {
      data: [
        { id: 'cat-desktop', name: 'Desktop', appliesTo: 'device' },
        { id: 'cat-saas', name: 'SaaS', appliesTo: 'entitlement' },
      ],
    },
    isSuccess: true,
  }),
  useItamRecord: () => ({ data: undefined }),
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
        return Promise.resolve({ id: 'm9' });
      },
      reset: vi.fn(),
      isPending: false,
      error: undefined,
    },
  }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  referencePath: (collection: string) => `itam/master/${collection}`,
  useReferenceNames: () => ({
    manufacturers: new Map([['mfr-dell', 'Dell']]),
  }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({ create: true, update: true }),
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({ available: state.available }),
  // The model on the server, one call per reading (`POST /itam/ai/read`).
  useAiReading:
    () =>
    (input: (typeof state.asked)[number]): Promise<typeof state.answer> => {
      state.asked.push(input);
      return Promise.resolve(state.answer);
    },
}));
// Whether the web can be searched (a DeepSeek model service): not here.
vi.mock('../../client/lib/itam/ai.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../client/lib/itam/ai.js')>()),
  useAiStatus: () => ({
    data: { available: state.available, model: null, webSearch: false },
  }),
}));
vi.mock('../../client/components/itam/field-input.js', () => ({
  // A plain input per field, so the filled values can be read.
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
  state.available = true;
  state.asked = [];
  state.answer = {
    reading: { name: 'OptiPlex 7010 SFF' },
    said: 'No EOL date published; check the code.',
  };
  state.requests = [];
  state.created = [];
  state.updated = [];
});

const dialog = (initial?: Record<string, unknown>) => (
  <MasterCreateDialog
    collection='models'
    open
    initial={initial}
    onOpenChange={vi.fn()}
    onCreated={vi.fn()}
  />
);

it('reads a model and fills the form for checking', async () => {
  // From a purchase line, the material starts at its name and part code.
  render(dialog({ name: 'Dell OptiPlex 7010', code: 'OPT7010SFF' }));
  expect(
    screen.getByRole('tab', { name: 'procurement.capture.aiTab' }),
  ).toHaveAttribute('aria-selected', 'true');
  // Nothing to save before the form is filled, and no footer at all: the
  // corner's close button closes it.
  expect(screen.queryByRole('button', { name: 'actions.create' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'actions.cancel' })).toBeNull();
  expect(
    screen.getByRole('textbox', { name: 'masterCapture.material' }),
  ).toHaveValue('Dell OptiPlex 7010 OPT7010SFF');
  // The gateway does not search the web, and the dialog says so.
  expect(screen.getByText('masterCapture.cannotSearch')).toBeVisible();
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'procurement.capture.organise' }),
    );
  });
  // One reading on the server, given the categories a model may take.
  expect(state.asked).toHaveLength(1);
  expect(state.asked[0]).toMatchObject({
    task: 'model',
    material: 'Dell OptiPlex 7010 OPT7010SFF',
  });
  expect(state.asked[0]!.context.categories).toEqual([
    expect.objectContaining({ id: 'cat-desktop' }),
  ]);
  // The reading goes through the server's check before the form takes it.
  expect(state.requests[0]).toMatchObject({
    path: 'itam/master/models/capture/match',
    json: { name: 'OptiPlex 7010 SFF' },
  });
  expect(
    screen.getByText('No EOL date published; check the code.'),
  ).toBeVisible();

  expect(
    screen.getByRole('tab', { name: 'procurement.capture.formTab' }),
  ).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('form-name')).toHaveValue('OptiPlex 7010 SFF');
  expect(screen.getByLabelText('form-warrantyMonths')).toHaveValue('36');
  // What it was not sure of, a maker the books lack and a model they
  // already hold. Beside the field; what it means is the mark's tooltip.
  expect(screen.getAllByText('procurement.capture.check')).toHaveLength(1);
  expect(screen.queryByText('procurement.capture.reviewHint')).toBeNull();
  expect(
    screen.getByText('masterCapture.manufacturerNotFound:Dell Technologies'),
  ).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'manufacturers.new' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'OptiPlex 7010' })).toHaveAttribute(
    'href',
    '/main/models/m9',
  );
  // Another wording of the same maker's model, said apart from an exact one.
  expect(screen.getByText('masterCapture.similar.models')).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'OptiPlex 7010 Tower' }),
  ).toHaveAttribute('href', '/main/models/m8');

  // Changing the uncertain value is the check.
  fireEvent.change(screen.getByLabelText('form-code'), {
    target: { value: 'OPT7010-SFF' },
  });
  expect(screen.queryByText('procurement.capture.check')).toBeNull();

  // An adjustment is a new reading, with the same material.
  fireEvent.change(
    screen.getByRole('textbox', { name: 'procurement.capture.adjust' }),
    { target: { value: 'It is the tower version' } },
  );
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'procurement.capture.adjust' }),
    );
  });
  expect(state.asked).toHaveLength(2);
  expect(state.asked[1]).toMatchObject({
    material: 'Dell OptiPlex 7010 OPT7010SFF',
    instruction: 'It is the tower version',
  });
});

it('is the plain form without the assistant', () => {
  state.available = false;
  render(dialog());
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.getByLabelText('form-name')).toBeVisible();
  expect(screen.getByRole('button', { name: 'actions.create' })).toBeVisible();
});

it('says what the reading said when it filled nothing', async () => {
  state.answer = { reading: null, said: 'Which maker is it?' };
  render(dialog({ name: 'Testbook' }));
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', { name: 'procurement.capture.organise' }),
    );
  });
  expect(state.requests).toHaveLength(0);
  expect(screen.getByText('Which maker is it?')).toBeVisible();
});

// 完善 (2026-10-21): the record's own form, read as it opens, marked 修改
// where the reading differs, and saved over the record with the AI tag.
it('refines a model on the books in its own form', async () => {
  await act(async () => {
    render(
      <MasterCreateDialog
        collection='models'
        open
        record={{
          id: 'm9',
          name: 'OptiPlex 7010',
          manufacturerId: 'mfr-dell',
          code: 'OLD',
          warrantyMonths: 12,
        }}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
  });
  // Asked once, as it opened: the record checked, not a blank form filled.
  expect(state.asked).toHaveLength(1);
  expect(state.asked[0]).toMatchObject({
    task: 'model',
    material: 'Dell OptiPlex 7010 OLD',
    context: { refine: true, form: expect.objectContaining({ code: 'OLD' }) },
  });
  expect(
    screen.getByText('masterEnrich.title:Dell OptiPlex 7010'),
  ).toBeVisible();
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.getByLabelText('form-code')).toHaveValue('OPT7010SFF');
  // Name, code, category (empty before) and warranty differ from the
  // record; each is marked.
  expect(screen.getAllByText('fieldTemplate.changedTag')).toHaveLength(4);
  // Itself is no duplicate; the other record of that name still shows.
  expect(screen.queryByRole('link', { name: 'OptiPlex 7010' })).toBeNull();
  expect(
    screen.getByRole('link', { name: 'OptiPlex 7010 Tower' }),
  ).toBeVisible();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  });
  expect(state.created).toHaveLength(0);
  expect(state.updated).toEqual([
    {
      id: 'm9',
      input: expect.objectContaining({
        code: 'OPT7010SFF',
        warrantyMonths: 36,
        $origin: 'ai',
      }),
    },
  ]);
});

// A software product has no category fields to wait for: 完善 asks at once
// (it waited for them forever until 2026-10-21). A name that starts with
// its maker is not said twice.
it('refines a software product as it opens', async () => {
  await act(async () => {
    render(
      <MasterCreateDialog
        collection='softwareProducts'
        open
        record={{
          id: 'sp1',
          name: 'Dell Command Update',
          manufacturerId: 'mfr-dell',
          categoryId: 'cat-saas',
        }}
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
  });
  expect(state.asked).toHaveLength(1);
  expect(state.asked[0]).toMatchObject({
    task: 'softwareProduct',
    material: 'Dell Command Update',
    context: { refine: true },
  });
});
