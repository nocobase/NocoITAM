import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import {
  DocumentCard,
  DocumentList,
} from '../../client/components/itam/document-card.js';

// A related document reads as its number and its own words, its type and
// details underneath, and its status over its amount at the right
// (2026-10-17).
describe('DocumentCard', () => {
  it('shows the description, the type, the details and the amount', () => {
    render(
      <MemoryRouter>
        <DocumentList>
          <DocumentCard
            to='/procurement/po-1'
            number='PO-000005'
            title='Laptops for the new starters'
            kind='New hire'
            status={<span>Completed</span>}
            amount='CNY 79,995.00'
            details={['2023-11-21', '', null, 'Northbridge IT']}
          />
        </DocumentList>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'PO-000005' })).toHaveAttribute(
      'href',
      '/procurement/po-1',
    );
    expect(screen.getByText('Laptops for the new starters')).toBeVisible();
    expect(screen.getByText('New hire')).toBeVisible();
    expect(screen.getByText('2023-11-21')).toBeVisible();
    expect(screen.getByText('Northbridge IT')).toBeVisible();
    expect(screen.getByText('CNY 79,995.00')).toBeVisible();
    expect(screen.getByText('Completed')).toBeVisible();
    // Empty details leave no gap behind.
    expect(screen.getAllByText('·')).toHaveLength(2);
  });

  it('leaves out the description and amount it was not given', () => {
    render(
      <MemoryRouter>
        <DocumentCard to='/repairs/r-1' number='RP-000001' details={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('RP-000001');
    expect(screen.getByRole('listitem').textContent).toBe('RP-000001');
  });
});
