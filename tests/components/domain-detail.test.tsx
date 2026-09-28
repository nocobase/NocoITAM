import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import type { ItamRecord } from '../../client/lib/itam/api.js';
import type { DomainConfig } from '../../client/lib/itam/domain.js';
import { DomainDetailPage } from '../../client/pages/itam/domain-detail.js';
import { purchaseOrderDomain } from '../../client/pages/itam/procurement/po-domain.js';
import { disposalDomain } from '../../client/pages/itam/disposals/disposal-domain.js';
import { auditDomain } from '../../client/pages/itam/audits/audit-domain.js';
import { DISPOSAL_FIELDS } from '../../client/lib/itam/operations.js';

const state = vi.hoisted(() => ({
  record: { id: 'record' } as ItamRecord,
  allowed: true,
  save: vi.fn(),
}));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', () => ({
  // The purchase order's strip asks who was asked to approve.
  useApi: () => ({ request: vi.fn(() => Promise.resolve({ data: [] })) }),
  useItamRecord: () => ({ data: state.record }),
  // The extended-fields section reads the record's category template; these
  // records name no category, so it renders nothing.
  masterDataPath: (collection: string) => `itam/master/${collection}`,
  useItamMutations: () => ({ update: { mutateAsync: state.save }, remove: {} }),
  useDeleteImpact: () => ({}),
  useRelatedCounts: () => [],
  useRowCounts: () => [],
}));
vi.mock('../../client/lib/itam/permissions.js', () => ({
  useCollectionPermissions: () => ({ update: state.allowed, delete: false }),
  // A purchase order is edited by the side that raised it, so the page has
  // to know who is reading; these records name 'u1' as their requester.
  useCurrentUserId: () => 'u1',
}));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined }),
}));
vi.mock('../../client/lib/itam/attachments.js', () => ({
  useAttachmentGroups: () => ({}),
  attachmentCount: () => 0,
}));
vi.mock('../../client/lib/itam/references.js', () => ({
  useReferenceNames: () => ({
    users: new Map([
      ['u1', 'Alex'],
      ['u2', 'Morgan'],
    ]),
    vendors: new Map([['v1', 'Acme Supply']]),
    locations: new Map([['l1', 'Headquarters']]),
    devices: new Map([['d1', 'Laptop 001']]),
  }),
  referenceRoute: (collection: string) => collection,
}));
vi.mock('../../client/components/itam/field-input.js', () => ({
  FieldInput: () => <input aria-label='editor' />,
}));
function show(domain: DomainConfig) {
  return render(
    <MemoryRouter initialEntries={['/records/record/content']}>
      <Routes>
        <Route
          path='/records/:id'
          element={
            <DomainDetailPage
              domain={{
                ...domain,
                Actions: undefined,
                Notice: undefined,
                // The page's own slots have their own tests; this one is
                // about the information card.
                Aside: undefined,
              }}
            />
          }
        >
          <Route path='content' element={<div>Tab content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}
function section(label: string) {
  return screen.getByRole('heading', { name: label }).closest('section')!;
}
beforeEach(() => {
  state.allowed = true;
  state.save.mockReset();
});

it('groups named procurement references and dates, without repeating summary or system fields', () => {
  state.record = {
    id: 'record',
    orderNo: 'PO-001',
    status: 'draft',
    requesterId: 'u1',
    vendorId: 'v1',
    reason: 'other',
    description: 'New desks',
    estimatedTotal: 200,
    currency: 'USD',
  };
  show(purchaseOrderDomain);
  const request = within(section('groups.request'));
  expect(request.getByText('Alex')).toBeVisible();
  expect(request.getAllByRole('term').map((node) => node.textContent)).toEqual([
    'fields.requester',
    'fields.department',
    'fields.neededBy',
  ]);
  const purchase = within(section('groups.purchase'));
  expect(purchase.getByRole('link', { name: 'Acme Supply' })).toHaveAttribute(
    'href',
    '/vendors/v1',
  );
  expect(screen.getAllByText('fields.status')).toHaveLength(1);
  expect(screen.getAllByText('fields.estimatedTotal')).toHaveLength(1);
  expect(screen.getAllByText('fields.createdAt')).toHaveLength(1);
  expect(screen.queryByText('fields.cancelReason')).toBeNull();
  expect(
    within(section('groups.system'))
      .getAllByRole('term')
      .map((node) => node.textContent),
  ).toEqual(['fields.createdBy', 'fields.createdAt', 'fields.updatedAt']);
  // An order belongs to its requester; it carries no owner of its own.
  expect(screen.queryByText('fields.owner')).toBeNull();
});

it('states the disposal plan while it is open and keeps its results read-only once executed', () => {
  state.record = {
    id: 'record',
    disposalNo: 'D-001',
    status: 'draft',
    method: 'scrap',
    reason: 'damaged',
    dataWipe: 'notRequired',
  };
  const view = show(disposalDomain);
  // How it will be carried out is part of the request, so the section reads
  // on a draft — but what only the execution can know does not.
  const plan = within(section('groups.execution'));
  expect(plan.getByText('fields.recipient')).toBeVisible();
  expect(plan.getByText('fields.dataWipe')).toBeVisible();
  // What only the execution can know waits for it, the executor included.
  expect(screen.queryByText('fields.disposedAt')).toBeNull();
  expect(screen.queryByText('fields.executedBy')).toBeNull();
  // Nothing is being wiped, so no method is asked for.
  expect(screen.queryByText('fields.wipeMethod')).toBeNull();
  fireEvent.doubleClick(screen.getByText('enums.disposalMethod.scrap'));
  expect(screen.getByLabelText('editor')).toBeVisible();
  view.unmount();
  state.record = {
    ...state.record,
    status: 'executed',
    disposedAt: '2026-09-17',
    executedById: 'u1',
  };
  show(disposalDomain);
  expect(within(section('groups.execution')).getByText('Alex')).toBeVisible();
  expect(screen.queryByText('fields.wipeMethod')).toBeNull();
  expect(screen.queryByTitle('common.doubleClickToEdit')).toBeNull();
});

it('asks the disposal recipient and the wipe answer as one row each', () => {
  const field = (key: string) =>
    DISPOSAL_FIELDS.find((entry) => entry.key === key)!;
  // One recipient row, answered with a vendor or with free text; the text
  // half is never a row or an editor of its own.
  expect(field('recipientVendorId').alternateField).toBe('recipientName');
  expect(field('recipientName').detail).toBe(false);
  expect(field('recipientName').form).toBe(false);
  // Wiped says how: the method is edited with the answer that calls for it,
  // so it can never be saved half given.
  const dependent = field('dataWipe').dependent;
  expect(dependent?.key).toBe('wipeMethod');
  expect(dependent?.required).toBe(true);
  expect(dependent?.when('wiped')).toBe(true);
  expect(dependent?.when('notRequired')).toBe(false);
  expect(field('wipeMethod').form).toBe(false);
});

it('shows a cancelled order reason without edit controls', () => {
  state.record = {
    id: 'record',
    orderNo: 'PO-002',
    status: 'cancelled',
    requesterId: 'u1',
    cancelReason: 'Budget cut',
  };
  show(purchaseOrderDomain);
  expect(within(section('groups.request')).getByText('Alex')).toBeVisible();
  // Why it was cancelled reads in the summary strip, beside the status.
  expect(screen.getByText('Budget cut')).toBeVisible();
  expect(
    within(section('groups.purchase')).queryByText('Budget cut'),
  ).toBeNull();
  expect(screen.queryByTitle('common.doubleClickToEdit')).toBeNull();
  expect(screen.queryByTitle('common.clickToEdit')).toBeNull();
});

it('resolves the audit scope and multiple executors to readable names', () => {
  state.record = {
    id: 'record',
    name: 'Quarterly check',
    status: 'completed',
    ownerId: 'u1',
    executorIds: ['u1', 'u2'],
    scope: { locationIds: ['l1'], deviceIds: ['d1'] },
  };
  show(auditDomain);
  expect(screen.getByText('Alex, Morgan')).toBeVisible();
  expect(screen.getByText('Headquarters')).toBeVisible();
  expect(screen.getByText('Laptop 001')).toBeVisible();
  expect(screen.queryByTitle('common.doubleClickToEdit')).toBeNull();
});

it('keeps a draft read-only without update permission', () => {
  state.allowed = false;
  state.record = {
    id: 'record',
    orderNo: 'PO-002',
    status: 'draft',
    description: 'No editing',
  };
  show(purchaseOrderDomain);
  expect(screen.queryByTitle('common.doubleClickToEdit')).toBeNull();
});

it('keeps an order someone else raised read-only', () => {
  // The grant is not the whole rule: editing a purchase order belongs to the
  // person it names, the way submitting and withdrawing do.
  state.allowed = true;
  state.record = {
    id: 'record',
    orderNo: 'PO-003',
    status: 'draft',
    requesterId: 'u2',
    createdById: 'u2',
    description: 'Someone else asked for this',
  };
  show(purchaseOrderDomain);
  expect(screen.queryByTitle('common.doubleClickToEdit')).toBeNull();
});
