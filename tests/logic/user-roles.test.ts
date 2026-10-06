import { describe, expect, it } from 'vitest';

import { userRolesLabel } from '../../client/lib/itam/user-roles.js';

const t = (key: string, options?: { defaultValue?: string }) =>
  key === 'users.roles.itam-asset-manager'
    ? 'IT 资产经理'
    : (options?.defaultValue ?? key);

describe('user roles label', () => {
  const row = {
    id: 'mia',
    name: 'Mia',
    roles: [
      { key: 'itam-asset-manager', title: 'IT Asset Manager' },
      { key: 'night-shift', title: '夜班' },
    ],
  };

  it('names this application’s sets in the reader’s language, others by title', () => {
    expect(userRolesLabel('users', row, t)).toBe('IT 资产经理 · 夜班');
    expect(userRolesLabel('approvers', row, t)).toBe('IT 资产经理 · 夜班');
  });

  it('says nothing for a row that is not a person', () => {
    expect(userRolesLabel('vendors', row, t)).toBe('');
    expect(userRolesLabel('users', { id: 'x', name: 'X' }, t)).toBe('');
  });
});
