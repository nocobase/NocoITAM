import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PermissionEditor } from '../../client/components/permission-editor.js';

// The permission editor's layouts: bare switches side by side, a row with
// levels on its own line, and a section whose heading is left out.

it('lays bare switches side by side and keeps a row with levels on its own', () => {
  const onEnabledChange = vi.fn();
  render(
    <PermissionEditor
      onEnabledChange={onEnabledChange}
      onLevelChange={vi.fn()}
      sections={[
        {
          id: 'admin',
          title: 'Authorization',
          groups: [
            {
              id: 'sets',
              title: 'Permission sets',
              rows: ['Read', 'Create', 'Update', 'Delete'].map((label) => ({
                id: `sets-${label}`,
                label,
                enabled: false,
              })),
            },
            {
              id: 'leads',
              title: 'Leads',
              rows: [
                {
                  id: 'leads-view',
                  label: 'View',
                  enabled: true,
                  levels: [{ value: 'all', label: 'All records' }],
                  level: 'all',
                },
                { id: 'leads-create', label: 'Create', enabled: false },
              ],
            },
          ],
        },
      ]}
    />,
  );
  const read = screen.getByRole('switch', { name: 'Read' });
  const bare = read.closest('[data-slot=permission-row]')?.parentElement;
  expect(bare?.className).toContain('flex-wrap');
  expect(bare?.querySelectorAll('[role=switch]')).toHaveLength(4);
  // A group with levels keeps a row each; its row without levels spans the
  // levels' column.
  const create = screen.getAllByRole('switch', { name: 'Create' })[1];
  const row = create.closest('[data-slot=permission-row]');
  expect(row?.className).toContain('grid');
  expect(row?.querySelector('label')?.className).toContain('@lg:col-span-2');
  fireEvent.click(read);
  expect(onEnabledChange).toHaveBeenCalledWith('sets-Read', true);
  expect(screen.getByRole('button', { name: 'Authorization' })).toBeTruthy();
});

it('leaves out the heading of a section without a title', () => {
  render(
    <PermissionEditor
      onEnabledChange={vi.fn()}
      onLevelChange={vi.fn()}
      sections={[
        {
          id: 'pages',
          groups: [
            {
              id: 'top',
              rows: [{ id: 'home', label: 'Overview', enabled: true }],
            },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByRole('switch', { name: 'Overview' })).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
