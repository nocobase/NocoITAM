import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TabSection } from '../../client/components/itam/tab-section.js';

// An empty section says so in a line under its heading (2026-10-17); while
// its count loads it shows nothing.
describe('TabSection', () => {
  it('shows its empty line only when the count is zero', () => {
    const { rerender } = render(
      <TabSection title='Disposals' count={0} empty='No disposals'>
        <span>list</span>
      </TabSection>,
    );
    expect(screen.getByText('No disposals')).toBeVisible();
    expect(screen.queryByText('list')).toBeNull();

    rerender(
      <TabSection title='Disposals' count={2} empty='No disposals'>
        <span>list</span>
      </TabSection>,
    );
    expect(screen.getByText('list')).toBeVisible();
    expect(screen.queryByText('No disposals')).toBeNull();

    rerender(
      <TabSection title='Disposals' count={undefined} empty='No disposals'>
        <span>list</span>
      </TabSection>,
    );
    expect(screen.queryByText('No disposals')).toBeNull();
    expect(screen.queryByText('list')).toBeNull();
  });
});
