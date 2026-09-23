import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ReportsWorkspace from './ReportsWorkspace';

const company = { id: 1, name: 'Neev' };

describe('ReportsWorkspace', () => {
  it('opens with the category sidebar and the complete sales report list', () => {
    render(<ReportsWorkspace db={{ invoices: [] }} currentCompany={company} />);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Business Reports' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sales' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sales Register' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'HSN/SAC-wise Sales' })).toBeInTheDocument();
  });

  it('changes the report list when a sub-sidebar category is selected', () => {
    render(<ReportsWorkspace db={{}} currentCompany={company} />);
    fireEvent.click(screen.getByRole('button', { name: 'Purchases' }));

    expect(screen.getByRole('heading', { name: 'Purchases' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Purchase Register' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sales Register' })).toBeNull();
  });

  it('opens implemented reports through the application router', () => {
    const onNavigate = vi.fn();
    render(<ReportsWorkspace db={{}} currentCompany={company} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profit & Loss' }));
    expect(onNavigate).toHaveBeenCalledWith('profitLoss');
  });

  it('hides reports for disabled branch, warehouse and cost-centre features', () => {
    render(<ReportsWorkspace db={{}} currentCompany={company} isEnabled={() => false} />);
    expect(screen.queryByRole('button', { name: 'Branch Reports' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Warehouse Reports' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cost Centre Reports' })).toBeNull();
  });
});
