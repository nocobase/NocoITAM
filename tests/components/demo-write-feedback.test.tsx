import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { answerApi, renderWithApp } from '@nocobase/app-testing/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { expect, it, vi } from 'vitest';

import { ConfirmDialog } from '../../client/components/itam/confirm-dialog.js';
import { EditableTitle } from '../../client/components/itam/editable-title.js';
import { InlineField } from '../../client/components/itam/inline-field.js';
import { RecordFormDialog } from '../../client/components/itam/record-form-dialog.js';
import { isDemoReadOnlyError } from '../../client/lib/itam/demo-errors.js';
import type { FieldDefinition } from '../../client/lib/itam/fields.js';
import { auditDomain } from '../../client/pages/itam/audits/audit-domain.js';
import { SettingsCard } from '../../client/pages/itam/settings/settings-parts.js';
import { SettingsError } from '../../client/pages/settings/shared.js';
import enUS from '../../client/locales/en-US.js';

const refusal = 'This is a demo. Changes cannot be saved.';
const failure = 'The value is invalid.';
const field: FieldDefinition = {
  key: 'name',
  label: 'fields.name',
  type: 'text',
};

type Kind =
  | 'text'
  | 'title'
  | 'textarea'
  | 'date'
  | 'composite'
  | 'secret'
  | 'form'
  | 'confirm';

/** Real API client and errors, including the translated wrapper used by detail pages. */
function WriteFixture({ kind }: { readonly kind: Kind }): ReactElement {
  const api = useApiClient();
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const original = kind === 'date' ? '2026-10-14' : 'Original';
  const save = async (value: unknown) => {
    try {
      await api.request({
        path: 'testRecord',
        method: 'PATCH',
        json: { value },
      });
      setSaved(true);
    } catch (cause) {
      throw new Error(cause instanceof Error ? cause.message : String(cause), {
        cause,
      });
    }
  };
  const submit = async (value: unknown) => {
    setError(undefined);
    try {
      await api.request({
        path: 'testRecord',
        method: 'PATCH',
        json: { value },
      });
      setSaved(true);
    } catch (caught) {
      setError(caught);
    }
  };
  return (
    <>
      {saved ? <p>Saved successfully</p> : null}
      {error ? <span data-testid='submission-failed' /> : null}
      {kind === 'form' ? (
        <RecordFormDialog
          open
          onOpenChange={() => undefined}
          title='Edit record'
          fields={[field]}
          initial={{ name: original }}
          recordId='record-1'
          error={error}
          onSubmit={submit}
        />
      ) : kind === 'confirm' ? (
        <ConfirmDialog
          open
          onOpenChange={() => undefined}
          title='Confirm operation'
          error={error}
          onConfirm={() => void submit('confirmed')}
        />
      ) : kind === 'title' ? (
        <EditableTitle value={original} onSave={save} />
      ) : (
        <InlineField
          field={{
            ...field,
            type: kind === 'textarea' || kind === 'date' ? kind : 'text',
            writeOnly: kind === 'secret',
          }}
          value={original}
          display={kind === 'secret' ? '••••' : original}
          onSave={save}
          renderInput={
            kind === 'composite'
              ? (draft, onChange) => (
                  <input
                    aria-label='Composite value'
                    value={String(draft)}
                    onChange={(event) => onChange(event.target.value)}
                  />
                )
              : undefined
          }
        />
      )}
    </>
  );
}

async function renderWrite(kind: Kind, demo = true) {
  const request = vi.fn(() =>
    Response.json(
      {
        error: {
          reason: demo ? 'DEMO_READ_ONLY' : 'VALIDATION_ERROR',
          message: demo ? refusal : failure,
        },
      },
      { status: 400 },
    ),
  );
  await renderWithApp(<WriteFixture kind={kind} />, {
    namespace: 'itam',
    namespaces: { itam: enUS },
    fetch: answerApi(request),
  });
  return request;
}

it.each(['blur', 'enter'] as const)(
  'restores an inline text after a demo refusal on %s',
  async (trigger) => {
    const request = await renderWrite('text');
    fireEvent.doubleClick(screen.getByText('Original'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Changed' } });
    if (trigger === 'blur') fireEvent.blur(input);
    else fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Original')).toBeVisible();
    expect(screen.queryByText(refusal)).toBeNull();
    expect(screen.queryByText('Saved successfully')).toBeNull();
    fireEvent.doubleClick(screen.getByText('Original'));
    expect(screen.getByRole('textbox')).toHaveValue('Original');
  },
);

it('restores a title and leaves editing after a demo refusal', async () => {
  await renderWrite('title');
  fireEvent.click(screen.getByText('Original'));
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'Changed' } });
  fireEvent.blur(input);
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  expect(screen.getByRole('heading')).toHaveTextContent('Original');
  expect(screen.queryByText(refusal)).toBeNull();
});

it('closes a refused date selection and restores the original date', async () => {
  const request = await renderWrite('date');
  fireEvent.doubleClick(screen.getByText('2026-10-14'));
  fireEvent.click(await screen.findByRole('button', { name: /October 20th/ }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /October 20th/ })).toBeNull(),
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByText('2026-10-14')).toBeVisible();
  expect(screen.queryByText(refusal)).toBeNull();
});

it('restores a composite inline field when its Save is refused', async () => {
  await renderWrite('composite');
  fireEvent.doubleClick(screen.getByText('Original'));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Changed' },
  });
  fireEvent.click(screen.getByRole('button', { name: enUS.actions.save }));
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  expect(screen.getByText('Original')).toBeVisible();
  expect(screen.queryByText(refusal)).toBeNull();
});

it('keeps a refused secret clear masked and reopens with an empty draft', async () => {
  const request = await renderWrite('secret');
  fireEvent.doubleClick(screen.getByText('••••'));
  fireEvent.click(screen.getByRole('button', { name: enUS.actions.clear }));
  await waitFor(() => expect(screen.getByText('••••')).toBeVisible());
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.doubleClick(screen.getByText('••••'));
  expect(screen.getByRole('textbox')).toHaveValue('');
});

it.each([true, false])(
  'handles long-text rejection without losing the saved value (demo=%s)',
  async (demo) => {
    await renderWrite('textarea', demo);
    fireEvent.click(screen.getByRole('button', { name: enUS.fields.name }));
    fireEvent.doubleClick(
      await screen.findByText('Original', {
        selector: '[data-slot=popover-content] div',
      }),
    );
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    if (demo) {
      await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
      expect(screen.queryByText(refusal)).toBeNull();
      expect(
        screen.getByRole('button', { name: enUS.fields.name }),
      ).toHaveTextContent('Original');
    } else {
      expect(await screen.findByText(failure)).toBeVisible();
      expect(screen.getByRole('textbox')).toHaveValue('Changed');
    }
  },
);

it.each(['text', 'title'] as const)(
  'keeps a normal failure and draft visible in a %s editor',
  async (kind) => {
    await renderWrite(kind, false);
    if (kind === 'title') fireEvent.click(screen.getByText('Original'));
    else fireEvent.doubleClick(screen.getByText('Original'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.blur(input);
    expect(await screen.findByText(failure)).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveValue('Changed');
  },
);

it.each([true, false])(
  'keeps a submitted form open with its draft (demo=%s)',
  async (demo) => {
    const request = await renderWrite('form', demo);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Changed' },
    });
    fireEvent.click(screen.getByRole('button', { name: enUS.actions.save }));
    await screen.findByTestId('submission-failed');
    expect(request).toHaveBeenCalledTimes(1);
    if (demo) expect(screen.queryByText(refusal)).toBeNull();
    else expect(await screen.findByText(failure)).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.getByRole('textbox')).toHaveValue('Changed');
    expect(screen.queryByText('Saved successfully')).toBeNull();
  },
);

it('keeps a confirmation open without repeating the demo refusal', async () => {
  const request = await renderWrite('confirm');
  fireEvent.click(screen.getByRole('button', { name: enUS.actions.confirm }));
  await screen.findByTestId('submission-failed');
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.queryByText(refusal)).toBeNull();
  expect(screen.queryByText('Saved successfully')).toBeNull();
});

it.each([true, false])(
  'shows only ordinary failures beside the Start audit button (demo=%s)',
  async (demo) => {
    const Actions = auditDomain.Actions!;
    const start = vi.fn(() =>
      Response.json(
        {
          error: {
            reason: demo ? 'DEMO_READ_ONLY' : 'VALIDATION_ERROR',
            message: demo ? refusal : failure,
          },
        },
        { status: 400 },
      ),
    );
    await renderWithApp(
      <QueryClientProvider client={new QueryClient()}>
        <Actions record={{ id: 'audit-1', status: 'notStarted' }} />
      </QueryClientProvider>,
      {
        namespace: 'itam',
        namespaces: { itam: enUS },
        fetch: answerApi(({ method, path }) => {
          if (path === 'itam/settings/permissions')
            return { data: { start: true } };
          if (method === 'POST' && path === 'itam/audits/audit-1/start')
            return start();
          return new Response(null, { status: 404 });
        }),
      },
    );
    fireEvent.click(
      await screen.findByRole('button', { name: enUS.audits.start }),
    );
    const dialog = screen.getByRole('dialog');
    const confirm = within(dialog).getByRole('button', {
      name: enUS.audits.start,
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(confirm).toBeEnabled());
    if (demo) expect(screen.queryByText(refusal)).toBeNull();
    fireEvent.click(
      within(dialog).getByRole('button', { name: enUS.actions.cancel }),
    );
    if (demo) expect(screen.queryByText(refusal)).toBeNull();
    else expect(screen.getByText(failure)).toBeVisible();
    expect(
      screen.getByRole('button', { name: enUS.audits.start }),
    ).toBeEnabled();
  },
);

it('handles a rejected submission at the form event boundary', async () => {
  const onSubmit = vi.fn(async () => {
    throw new ApiClientError(refusal, {
      status: 400,
      payload: { error: { reason: 'DEMO_READ_ONLY' } },
    });
  });
  await renderWithApp(
    <RecordFormDialog
      open
      onOpenChange={() => undefined}
      title='New record'
      fields={[field]}
      initial={{ name: 'Draft' }}
      onSubmit={onSubmit}
    />,
    { namespace: 'itam', namespaces: { itam: enUS } },
  );
  fireEvent.click(screen.getByRole('button', { name: enUS.actions.create }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(screen.getByRole('textbox')).toHaveValue('Draft');
  expect(screen.queryByText(refusal)).toBeNull();
});

it('suppresses demo refusals in settings without showing a stale saved message', async () => {
  const error = new ApiClientError(refusal, {
    status: 400,
    payload: { error: { reason: 'DEMO_READ_ONLY' } },
  });
  await renderWithApp(
    <>
      <SettingsCard
        title='Settings'
        onSave={() => undefined}
        saving={false}
        error={error}
        saved
      >
        <input defaultValue='Draft' />
      </SettingsCard>
      <SettingsError error={error} />
    </>,
    { namespace: 'itam', namespaces: { itam: enUS } },
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.queryByText(refusal)).toBeNull();
  expect(screen.queryByText(enUS.settings.saved)).toBeNull();
  expect(screen.getByRole('textbox')).toHaveValue('Draft');
});

it('identifies only a structured demo refusal, including wrapped and legacy errors', () => {
  const original = new ApiClientError(refusal, {
    status: 400,
    payload: { reason: 'DEMO_READ_ONLY' },
  });
  expect(
    isDemoReadOnlyError(new Error('Translated', { cause: original })),
  ).toBe(true);
  expect(isDemoReadOnlyError(new Error(refusal))).toBe(false);
  expect(
    isDemoReadOnlyError(new ApiClientError(refusal, { status: 400 })),
  ).toBe(false);
  const cyclic = new Error('Failure');
  cyclic.cause = cyclic;
  expect(isDemoReadOnlyError(cyclic)).toBe(false);
});
