import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import {
  TestI18nProvider,
  createTestI18nRuntime,
} from '@nocobase/i18n/testing';
import { render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NavigationTree } from '../../client/layouts/components/navigation-tree.js';
import {
  routeKey,
  type RouteNavigationItem,
} from '../../client/routing/route-navigation.js';

// The application's sidebar shows a group without a page of its own as a
// heading over its pages (`groupsAsHeadings`), where the template's tree folds
// it. Titles are route data, so the runtime is not strict.
const runtime = await createTestI18nRuntime({ strict: false });

function I18n({ children }: { readonly children: ReactNode }) {
  return <TestI18nProvider runtime={runtime}>{children}</TestI18nProvider>;
}

function page(name: string): AppClientRegisteredRoute {
  return {
    name,
    id: name,
    path: `/${name}`,
    auth: 'required',
    packageName: 'test',
    source: 'application',
    navigation: { title: name },
    componentLoader: async () => ({ default: () => null }),
  };
}

const devices = page('Devices');
const accessories = page('Accessories');

function group(withPage = false): RouteNavigationItem {
  return {
    route: {
      ...page('Assets'),
      componentLoader: withPage ? page('Assets').componentLoader : undefined,
    },
    children: [
      { route: devices, children: [] },
      { route: accessories, children: [] },
    ],
  };
}

function show(item: RouteNavigationItem, collapsed = false) {
  render(
    <MemoryRouter>
      <NavigationTree
        item={item}
        collapsed={collapsed}
        groupsAsHeadings
        selectedKey={routeKey(accessories)}
        onNavigate={() => {}}
      />
    </MemoryRouter>,
    { wrapper: I18n },
  );
}

describe('navigation groups as headings', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('names the group and lists its pages without anything to open', () => {
    show(group());
    const heading = screen.getByRole('group', { name: 'Assets' });
    expect(within(heading).getByText('Assets')).toBeInTheDocument();
    expect(
      within(heading).getByRole('link', { name: 'Devices' }),
    ).toHaveAttribute('href', '/Devices');
    expect(
      within(heading).getByRole('link', { name: 'Accessories' }),
    ).toHaveAttribute('aria-current', 'page');
    // Nothing folds: no disclosure element and no expand control.
    expect(document.querySelector('details')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps the pages as icon links in the collapsed sidebar instead of a popup', () => {
    show(group(), true);
    const heading = screen.getByRole('group', { name: 'Assets' });
    expect(within(heading).getAllByRole('link')).toHaveLength(2);
    // The label gives way to a rule on a desktop-width collapsed sidebar.
    expect(within(heading).getByText('Assets')).toHaveClass('md:hidden');
    expect(screen.queryByRole('button', { name: 'Assets' })).toBeNull();
  });

  it('still folds a group that is a page of its own', () => {
    show(group(true));
    expect(screen.queryByRole('group', { name: 'Assets' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Assets' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
