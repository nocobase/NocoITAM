// The API key dialog's limited access (client/pages/settings/api-keys/new.tsx)
// drawn by the UI Library's permission editor it shares with Settings → Roles:
// one row a scope group, ticked on with the level the key gets.
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PermissionEditor } from '../../client/components/permission-editor.js';

it('lists the scope groups with their levels and ticks one on', () => {
  const onEnabledChange = vi.fn();
  const onLevelChange = vi.fn();
  render(
    <PermissionEditor
      sections={[
        {
          id: 'business',
          title: 'Business operations',
          groups: [
            {
              id: 'business-rows',
              rows: [
                {
                  id: 'itam.devices',
                  label: 'Devices',
                  enabled: false,
                  levels: [
                    { value: 'read', label: 'Read' },
                    { value: 'write', label: 'Read and write' },
                  ],
                },
                {
                  id: 'itam.stockItems',
                  label: 'Stock',
                  enabled: true,
                  level: 'read',
                  levels: [{ value: 'read', label: 'Read' }],
                },
              ],
            },
          ],
        },
      ]}
      labels={{ levelFor: (label) => `Scope for ${label}` }}
      onEnabledChange={onEnabledChange}
      onLevelChange={onLevelChange}
    />,
  );
  expect(screen.getByText('Devices')).toBeTruthy();
  expect(screen.getByText('Stock')).toBeTruthy();
  const devices = screen.getByRole('checkbox', { name: 'Devices' });
  fireEvent.click(devices);
  expect(onEnabledChange).toHaveBeenCalledWith('itam.devices', true);
});
