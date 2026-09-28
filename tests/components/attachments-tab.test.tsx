import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import { AttachmentsTab } from '../../client/components/itam/attachments-tab.js';

const state = vi.hoisted(() => ({
  allowed: true,
  mutate: vi.fn(),
  mutateAsync: vi.fn(() => Promise.resolve()),
  empty: false,
}));
vi.mock('@nocobase/app-client', () => ({
  useService: () => ({ repository: () => ({}) }),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useApi: () => ({ request: vi.fn() }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({ update: state.allowed }),
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({ users: new Map([['user-id', 'Alex']]) }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useMutation: () => ({
    mutate: state.mutate,
    mutateAsync: state.mutateAsync,
  }),
  useQuery: () => ({
    data: [
      {
        ownerType: 'devices',
        ownerId: 'ticket',
        files: state.empty
          ? []
          : [
              {
                id: 'file',
                linkId: 'link',
                filename: 'Warranty report.pdf',
                mimeType: 'application/pdf',
                size: 2048,
                uploadedById: 'user-id',
                linkedAt: '2026-09-17',
                contentUrl: '/main/uploads/file.pdf',
              },
            ],
      },
    ],
  }),
}));
vi.mock('../../client/extensions/nocobase-file-component-ui', () => ({
  FileUploadField: () => <button>Upload</button>,
  FilePreviewDialog: ({
    files,
    initialIndex,
  }: {
    files: { filename: string }[];
    initialIndex: number;
  }) => <div role='dialog'>{files[initialIndex].filename}</div>,
}));
beforeEach(() => {
  state.allowed = true;
  state.empty = false;
  state.mutate.mockClear();
  state.mutateAsync.mockClear();
});

it('shows readable file metadata, previews the file and unlinks the selected attachment after confirming', () => {
  render(<AttachmentsTab ownerType='devices' ownerId='ticket' />);
  expect(screen.getByText('Alex')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'attachments.own' })).toBeNull();
  expect(screen.getByText('2.0 KB')).toBeVisible();
  expect(
    screen.getByRole('link', {
      name: 'attachments.download: Warranty report.pdf',
    }),
  ).toHaveAttribute('href', '/main/uploads/file.pdf');
  fireEvent.click(screen.getByRole('button', { name: 'Warranty report.pdf' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Warranty report.pdf');
  fireEvent.click(
    screen.getByRole('button', { name: 'actions.delete: Warranty report.pdf' }),
  );
  // Deleting asks first; nothing is unlinked until the user confirms.
  expect(screen.getByText('confirmations.removeAttachment')).toBeVisible();
  expect(state.mutateAsync).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
  expect(state.mutateAsync).toHaveBeenCalledWith('link');
});

it('keeps uploads and deletion hidden for read-only viewers and shows the empty state', () => {
  state.allowed = false;
  const view = render(<AttachmentsTab ownerType='devices' ownerId='ticket' />);
  expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
  expect(screen.queryByRole('button', { name: /actions.delete/ })).toBeNull();
  state.empty = true;
  view.rerender(<AttachmentsTab ownerType='devices' ownerId='ticket' />);
  expect(screen.getByText('attachments.empty')).toBeVisible();
});
