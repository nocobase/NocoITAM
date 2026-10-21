import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { RepairCreateDialog } from '../../client/components/itam/repair-create-dialog.js';

const state = vi.hoisted(() => ({
  available: true,
  device: {
    id: 'd1',
    vendorId: 'v1',
    purchaseDate: '2018-05-20',
    warrantyEndDate: '2099-01-01',
    bookValue: 1200,
    currency: 'CNY',
  } as Record<string, unknown>,
  asked: [] as { task: string; material: string; context: unknown }[],
  answer: {
    reading: {
      faultCategory: 'screen',
      recommendation: 'replace',
      method: 'sendOut',
      reasons: ['Eight years old'],
    } as Record<string, unknown> | null,
    said: 'Ask whether it was dropped.',
  },
  created: [] as Record<string, unknown>[],
}));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'count' in options ? `${key}:${String(options.count)}` : key,
  }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  apiErrorBody: () => undefined,
  useItamRecord: (_path: string, id?: string) => ({
    data: id ? state.device : undefined,
  }),
  useItamList: () => ({ data: { data: [], total: 2 } }),
  useItamMutations: () => ({
    create: {
      mutateAsync: (values: Record<string, unknown>) => {
        state.created.push(values);
        return Promise.resolve({ id: 'r1' });
      },
      reset: vi.fn(),
      isPending: false,
      error: undefined,
    },
  }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCurrentUserId: () => 'mia',
}));
vi.mock('../../client/lib/itam/ai-chat.js', () => ({
  useItamAi: () => ({ available: state.available }),
  useAiReading:
    () =>
    (input: (typeof state.asked)[number]): Promise<typeof state.answer> => {
      state.asked.push(input);
      return Promise.resolve(state.answer);
    },
}));
vi.mock('../../client/components/itam/field-input.js', () => ({
  // A plain input per field, so the values can be read and set.
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
  state.device = { ...state.device, warrantyEndDate: '2099-01-01' };
  state.asked = [];
  state.created = [];
});

const field = (key: string) =>
  document.getElementById(
    [...document.querySelectorAll('input')]
      .map((input) => input.id)
      .find((id) => id.endsWith(key)) ?? '',
  ) as HTMLInputElement | null;

it('says what the register knows, and starts a warranty repair under warranty', () => {
  render(<RepairCreateDialog deviceId='d1' open onOpenChange={vi.fn()} />);
  expect(
    screen.getByText(
      (content) =>
        content.includes('repairs.facts.warranty') &&
        content.includes('repairs.facts.repairs:2'),
    ),
  ).toBeInTheDocument();
  expect(field('method')?.value).toBe('vendorWarranty');
  expect(field('vendorId')?.value).toBe('v1');
});

it('leaves the method to the person once the warranty has ended', () => {
  state.device = { ...state.device, warrantyEndDate: '2021-05-20' };
  render(<RepairCreateDialog deviceId='d1' open onOpenChange={vi.fn()} />);
  expect(field('method')?.value).toBe('');
});

it('asks Asset Steward about the fault, fills its kind and shows the recommendation', async () => {
  render(<RepairCreateDialog deviceId='d1' open onOpenChange={vi.fn()} />);
  const ask = screen.getByRole('button', { name: 'repairs.triage.ask' });
  expect(ask).toBeDisabled();
  // It asks to be run first until it has answered.
  expect(screen.getByText('repairs.triage.hint')).toBeInTheDocument();
  fireEvent.change(field('faultDescription')!, {
    target: { value: 'Screen flickers' },
  });
  expect(screen.getByText('repairs.triage.hint')).toBeInTheDocument();
  await act(async () => {
    fireEvent.click(ask);
  });
  expect(screen.queryByText('repairs.triage.hint')).toBeNull();
  expect(state.asked).toEqual([
    {
      task: 'repairTriage',
      material: 'Screen flickers',
      context: { deviceId: 'd1' },
    },
  ]);
  expect(field('faultCategory')?.value).toBe('screen');
  expect(
    screen.getByText('repairs.triage.recommendation.replace'),
  ).toBeInTheDocument();
  expect(screen.getByText('Eight years old')).toBeInTheDocument();
});

it('offers nothing to ask when the assistant is not available', () => {
  state.available = false;
  render(<RepairCreateDialog deviceId='d1' open onOpenChange={vi.fn()} />);
  expect(
    screen.queryByRole('button', { name: 'repairs.triage.ask' }),
  ).not.toBeInTheDocument();
});

it('starts with the device and its fault, and turns into a disposal when told to replace', async () => {
  const onReplace = vi.fn();
  render(
    <RepairCreateDialog
      deviceId='d1'
      open
      onOpenChange={vi.fn()}
      onReplace={onReplace}
    />,
  );
  // The device leads, given; the fault comes next.
  const inputs = [...document.querySelectorAll('input')];
  expect(inputs[0]?.id).toMatch(/deviceId$/);
  expect(inputs[0]?.value).toBe('d1');
  expect(inputs[1]?.id).toMatch(/faultDescription$/);
  fireEvent.change(field('faultDescription')!, {
    target: { value: 'Screen flickers' },
  });
  // Nothing to switch to before Asset Steward has said replace.
  expect(
    screen.queryByRole('button', { name: 'repairs.triage.toDisposal' }),
  ).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'repairs.triage.ask' }));
  });
  // Once answered, it asks again.
  expect(
    screen.getByRole('button', { name: 'repairs.triage.again' }),
  ).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'repairs.triage.toDisposal' }),
  );
  expect(onReplace).toHaveBeenCalledWith({
    deviceId: 'd1',
    description: 'Screen flickers',
  });
});

it('fills the method from the diagnosis only while none is chosen', async () => {
  // Out of warranty the method starts empty: the diagnosis fills it, and
  // the vendor follows it as it does by hand.
  state.device = { ...state.device, warrantyEndDate: '2021-05-20' };
  const { unmount } = render(
    <RepairCreateDialog deviceId='d1' open onOpenChange={vi.fn()} />,
  );
  fireEvent.change(field('faultDescription')!, {
    target: { value: 'Screen flickers' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'repairs.triage.ask' }));
  });
  expect(field('method')?.value).toBe('sendOut');
  expect(field('vendorId')?.value).toBe('v1');
  unmount();
  // Under warranty the rule chose it already; the diagnosis leaves it.
  state.device = { ...state.device, warrantyEndDate: '2099-01-01' };
  render(<RepairCreateDialog deviceId='d1' open onOpenChange={vi.fn()} />);
  fireEvent.change(field('faultDescription')!, {
    target: { value: 'Screen flickers' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'repairs.triage.ask' }));
  });
  expect(field('method')?.value).toBe('vendorWarranty');
});
