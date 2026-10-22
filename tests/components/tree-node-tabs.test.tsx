import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import DepartmentDevicesTab from '../../client/pages/itam/locations/department-devices-tab.js';
import LocationDevicesTab from '../../client/pages/itam/locations/devices-tab.js';
import CategoryModelsTab from '../../client/pages/itam/master/categories-models-tab.js';
import DepartmentPeopleTab from '../../client/pages/itam/master/departments-people-tab.js';
import LocationPeopleTab from '../../client/pages/itam/master/locations-people-tab.js';
import LocationStockTab from '../../client/pages/itam/master/locations-stock-tab.js';
import { subtreeOf } from '../../client/lib/itam/tree.js';

// A tree node's tabs (a department's, a location's, a category's) list its
// sub-nodes' records too, each row with its own node; people on the books
// by status then employee number, and those who left in a section below
// (2026-10-21). The same three-level tree stands for each.

const state = vi.hoisted(() => ({
  lists: [] as { path: string; query: Record<string, unknown> }[],
  left: 0,
}));

const DEPARTMENTS = [
  { id: 'tech', name: 'Tech', parentId: null },
  { id: 'rd', name: 'R&D', parentId: 'tech' },
  { id: 'web', name: 'Web', parentId: 'rd' },
  { id: 'sales', name: 'Sales', parentId: null },
];

vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('../../client/lib/itam/api.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useApi: () => ({ request: vi.fn(() => new Promise(() => {})) }),
  useRelatedCounts: () => [state.left],
  useItamRecord: () => ({ data: { id: 'tech', appliesTo: 'device' } }),
  useItamList: (path: string, query: Record<string, unknown>) => {
    if (/(departments|locations|categories)$/.test(path))
      return { data: { data: DEPARTMENTS, total: DEPARTMENTS.length } };
    state.lists.push({ path, query });
    return {
      data: {
        data: [
          {
            id: 'p1',
            name: 'Ada',
            employeeNo: 'E1',
            departmentId: 'rd',
            employmentStatus: 'active',
          },
        ],
        total: 1,
      },
      isLoading: false,
    };
  },
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQuery: () => ({ data: undefined }),
}));
vi.mock('../../client/lib/itam/references.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useReferenceNames: () => ({}),
}));
vi.mock('../../client/lib/itam/record-drawer.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useOpenRecord: () => vi.fn(),
}));

beforeEach(() => {
  state.lists = [];
  state.left = 0;
});

function show(tab: ReactElement, id: string) {
  render(
    <MemoryRouter initialEntries={[`/${id}`]}>
      <Routes>
        <Route path='/:id' element={tab} />
      </Routes>
    </MemoryRouter>,
  );
}

const headers = () =>
  screen.getAllByRole('columnheader').map((header) => header.textContent);

it('finds a node and everything under it', () => {
  expect(subtreeOf(DEPARTMENTS, 'tech')).toEqual(['tech', 'rd', 'web']);
  expect(subtreeOf(DEPARTMENTS, 'sales')).toEqual(['sales']);
});

it("lists a parent department's people with their department, those who left apart", () => {
  state.left = 2;
  show(<DepartmentPeopleTab />, 'tech');
  expect(state.lists[0]?.query).toMatchObject({
    sort: 'employmentStatus,employeeNo',
    filter: {
      departmentId: ['tech', 'rd', 'web'],
      employmentStatus: ['active', 'pending'],
    },
  });
  expect(state.lists[1]?.query).toMatchObject({
    filter: { employmentStatus: ['left'] },
  });
  expect(headers().slice(0, 6)).toEqual([
    'fields.personName',
    'fields.employeeNo',
    'fields.department',
    'fields.position',
    'fields.officeLocation',
    'fields.employmentStatus',
  ]);
  expect(screen.getByText('enums.employmentStatus.left')).toBeTruthy();
});

it("keeps a leaf department's column and leaves its empty leavers' section out", () => {
  show(<DepartmentPeopleTab />, 'sales');
  expect(state.lists).toHaveLength(1);
  expect(headers()).toContain('fields.department');
  expect(screen.queryByText('enums.employmentStatus.left')).toBeNull();
});

it("lists a parent department's devices with each one's department", () => {
  show(<DepartmentDevicesTab />, 'tech');
  expect(state.lists[0]?.query).toMatchObject({
    filter: { departmentId: ['tech', 'rd', 'web'] },
  });
  expect(headers()).toContain('fields.department');
});

it("lists a parent location's devices with each one's location", () => {
  show(<LocationDevicesTab />, 'tech');
  expect(state.lists[0]?.query).toMatchObject({
    filter: { locationId: ['tech', 'rd', 'web'] },
  });
  expect(headers()).toContain('fields.location');
});

it("lists a parent location's stock with each item's location", () => {
  show(<LocationStockTab />, 'tech');
  expect(state.lists[0]?.query).toMatchObject({
    filter: { locationId: ['tech', 'rd', 'web'] },
  });
  expect(headers()).toContain('fields.location');
});

it("lists a parent location's people by status, with their location", () => {
  show(<LocationPeopleTab />, 'tech');
  expect(state.lists[0]?.query).toMatchObject({
    sort: 'employmentStatus,employeeNo',
    filter: { locationId: ['tech', 'rd', 'web'] },
  });
  expect(headers()).toContain('fields.officeLocation');
});

it("lists a parent category's models with each one's category", () => {
  show(<CategoryModelsTab />, 'tech');
  expect(state.lists[0]?.query).toMatchObject({
    filter: { categoryId: ['tech', 'rd', 'web'] },
  });
  expect(headers()).toContain('fields.category');
});
