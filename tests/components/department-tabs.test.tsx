import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';

import DepartmentDevicesTab from '../../client/pages/itam/locations/department-devices-tab.js';
import DepartmentPeopleTab from '../../client/pages/itam/master/departments-people-tab.js';
import { subtreeOf } from '../../client/lib/itam/tree.js';

// A department's 人员 and 设备 tabs list its sub-departments' too, each row
// with its own department; people on the books by status then employee
// number, and those who left in a section below (2026-10-21).

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
  useItamList: (path: string, query: Record<string, unknown>) => {
    if (path.includes('departments'))
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
  expect(headers().slice(0, 5)).toEqual([
    'fields.personName',
    'fields.employeeNo',
    'fields.department',
    'fields.position',
    'fields.employmentStatus',
  ]);
  expect(screen.getByText('enums.employmentStatus.left')).toBeTruthy();
});

it("leaves a leaf department's column and its empty leavers' section out", () => {
  show(<DepartmentPeopleTab />, 'sales');
  expect(state.lists).toHaveLength(1);
  expect(headers()).not.toContain('fields.department');
  expect(screen.queryByText('enums.employmentStatus.left')).toBeNull();
});

it("lists a parent department's devices with each one's department", () => {
  show(<DepartmentDevicesTab />, 'tech');
  expect(state.lists[0]?.query).toMatchObject({
    filter: { departmentId: ['tech', 'rd', 'web'] },
  });
  expect(headers()).toContain('fields.department');
});
