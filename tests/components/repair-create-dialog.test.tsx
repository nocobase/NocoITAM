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
  fireEvent.change(field('faultDescription')!, {
    target: { value: 'Screen flickers' },
  });
  await act(async () => {
    fireEvent.click(ask);
  });
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
