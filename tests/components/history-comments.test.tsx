import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import { HistoryTimeline } from '../../client/components/itam/history-timeline.js';

const state = vi.hoisted(() => ({
  request: vi.fn((_input: unknown) => Promise.resolve({ data: {} })),
  items: [] as unknown[],
}));
// The signed-in account, which the writer's avatar falls back to when
// they are not among the colleagues.
vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({ session: null }),
}));
vi.mock('@nocobase/app-client', () => ({
  useService: () => ({ repository: () => ({}) }),
  resolveAppUrl: (path: string) => `/main${path}`,
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key: string) => key,
  }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  useApi: () => ({ request: state.request }),
  useItamList: () => ({
    data: {
      data: [
        { id: 'me', name: 'Mia' },
        { id: 'sam', name: 'Sam Lee' },
      ],
    },
  }),
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCurrentUserId: () => 'me',
}));
vi.mock('../../client/lib/itam/references.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReferenceNames: () => ({
    users: new Map([
      ['me', 'Mia'],
      ['sam', 'Sam Lee'],
    ]),
  }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(() => Promise.resolve()) }),
  useQuery: () => ({
    isLoading: false,
    data: { data: state.items, total: state.items.length },
  }),
}));

const comment = {
  id: 'event:c1',
  createdAt: new Date().toISOString(),
  actorId: 'sam',
  origin: 'human',
  changes: [],
  event: {
    id: 'c1',
    type: 'comment',
    summary: 'Is the quote in?',
    actorId: 'sam',
    createdAt: new Date().toISOString(),
    payload: { body: 'Is the quote in? @Mia', mentions: ['me'], files: [] },
  },
  replies: [
    {
      id: 'r1',
      type: 'comment',
      summary: 'Filed',
      actorId: 'me',
      createdAt: new Date().toISOString(),
      payload: {
        body: 'Filed yesterday',
        mentions: [],
        files: [
          { id: 'f1', filename: 'quote.pdf', ext: 'pdf', size: 2048 },
          { id: 'f2', filename: 'sheet.xlsx', ext: 'xlsx', size: 1024 },
        ],
        replyToId: 'c1',
      },
    },
  ],
};

const assigned = {
  id: 'event:e1',
  createdAt: '2026-01-02T03:04:05.000',
  actorId: 'sam',
  origin: 'human',
  changes: [],
  event: {
    id: 'e1',
    type: 'statusChange',
    summary: 'In stock',
    actorId: 'sam',
    createdAt: '2026-01-02T03:04:05.000',
    payload: null,
  },
};

beforeEach(() => {
  state.request.mockClear();
  state.items = [comment, assigned];
});

const renderTimeline = () =>
  render(
    <MemoryRouter>
      <HistoryTimeline path='itam/master/vendors' id='v1' />
    </MemoryRouter>,
  );

// A record's history reads as NocoCRM's 动态: a comment box atop, comments
// as cards with their replies, and every other line a sentence — who, what
// they did — with how long ago beside it.
it('shows comments with their replies among the lines of the history', () => {
  renderTimeline();
  expect(screen.getByText('Filed yesterday')).toBeVisible();
  // The mention is picked out.
  expect(screen.getByText('@Mia')).toHaveClass('text-primary');
  // A line leads with who did it, and says when on hover.
  const time = screen.getAllByRole('time').at(-1);
  expect(time?.getAttribute('title')).toBe('2026-01-02 03:04');
  expect(screen.getAllByText('Sam Lee').length).toBeGreaterThan(0);
});

it('sends a comment with the colleagues it mentions on Enter', async () => {
  renderTimeline();
  const box = screen.getByRole('textbox', { name: 'comments.label' });
  fireEvent.change(box, { target: { value: 'Please check @Sam Lee ' } });
  // The mention is picked from the list, which remembers who it is.
  fireEvent.change(box, {
    target: { value: 'Please check @Sa', selectionStart: 16 },
  });
  fireEvent.mouseDown(await screen.findByRole('option', { name: 'Sam Lee' }));
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith({
      path: 'itam/comments',
      method: 'POST',
      json: {
        subjectType: 'vendors',
        subjectId: 'v1',
        body: 'Please check @Sam Lee ',
        mentions: ['sam'],
      },
    }),
  );
});

it('replies in the thread', async () => {
  renderTimeline();
  fireEvent.click(screen.getAllByRole('button', { name: 'comments.reply' })[0]);
  const box = await screen.findByRole('textbox', { name: 'comments.reply' });
  fireEvent.change(box, { target: { value: 'Thanks' } });
  fireEvent.keyDown(box, { key: 'Enter' });
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({ body: 'Thanks', replyToId: 'c1' }),
      }),
    ),
  );
});

it('keeps a comment’s files in view while it is edited, and saves those kept', async () => {
  renderTimeline();
  fireEvent.click(screen.getByRole('button', { name: 'common.more' }));
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'actions.edit' }),
  );
  // Both files show as chips under the box, each to be taken off.
  expect(screen.getByText('quote.pdf')).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'comments.removeFile: sheet.xlsx' }),
  );
  // Asked first.
  expect(screen.getByText('sheet.xlsx')).toBeVisible();
  fireEvent.click(
    await screen.findByRole('button', { name: 'actions.delete' }),
  );
  await waitFor(() => expect(screen.queryByText('sheet.xlsx')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'actions.save' }));
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith({
      path: 'itam/comments/r1',
      method: 'PATCH',
      json: { body: 'Filed yesterday', mentions: [], keepFileIds: ['f1'] },
    }),
  );
});

it('deletes a comment whose one file is all it holds, saying so first', async () => {
  state.items = [
    {
      ...comment,
      actorId: 'me',
      event: {
        ...comment.event,
        actorId: 'me',
        payload: {
          body: '',
          mentions: [],
          files: [{ id: 'f9', filename: 'photo.jpg', ext: 'jpg', size: 900 }],
        },
      },
      replies: [],
    },
  ];
  renderTimeline();
  fireEvent.click(
    screen.getByRole('button', { name: 'actions.delete: photo.jpg' }),
  );
  expect(
    await screen.findByText('comments.removeLastFileDescription'),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'actions.delete' }));
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith({
      path: 'itam/comments/c1',
      method: 'DELETE',
    }),
  );
});

it('keeps no comment box where a history keeps no comments', () => {
  render(
    <MemoryRouter>
      <HistoryTimeline path='itam/master/onboardingKits' id='k1' />
    </MemoryRouter>,
  );
  expect(screen.queryByRole('textbox', { name: 'comments.label' })).toBeNull();
});

// One field set to a plain value reads as one line (2026-10-21): 更新
// 规格说明 → the new value, cut to the line; the old one waits for hover.
it('shows a one-field update as the field and its new value', () => {
  const at = '2026-01-03T03:04:05.000';
  state.items = [
    {
      id: 'change:s1',
      createdAt: at,
      actorId: 'sam',
      origin: 'ai',
      changes: [
        {
          id: 's1',
          action: 'update',
          field: 'specification',
          oldValue: '2U, dual Xeon Silver 4410Y, 256 GB memory',
          newValue: '2U rack server, dual Xeon Scalable platform',
          actorId: 'sam',
          createdAt: at,
        },
      ],
    },
  ];
  renderTimeline();
  expect(screen.getByText('history.updatedField')).toBeVisible();
  const value = screen.getByText('2U rack server, dual Xeon Scalable platform');
  expect(value.closest('.truncate')).not.toBeNull();
  expect(
    screen.queryByText('2U, dual Xeon Silver 4410Y, 256 GB memory'),
  ).toBeNull();
});
