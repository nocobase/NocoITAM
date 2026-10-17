import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { DisposalApproverHint } from '../../client/pages/itam/disposals/approver-hint.js';

const state = vi.hoisted(() => ({ total: 0 }));

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useItamList: () => ({ data: { data: [], total: state.total } }),
}));

// Under a disposal's approver picker (2026-10-18): what picking one means,
// or, with nobody to pick, that an administrator has to change something.
it('says so when nobody can be picked as the approver', () => {
  state.total = 0;
  render(<DisposalApproverHint hint='pick one' />);
  expect(screen.getByRole('alert').textContent).toBe('disposals.noApprovers');
  expect(screen.queryByText('pick one')).toBeNull();
});

it('reads as the usual hint while somebody can be picked', () => {
  state.total = 2;
  render(<DisposalApproverHint hint='pick one' />);
  expect(screen.getByText('pick one')).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
});
