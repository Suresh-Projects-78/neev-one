import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import DashboardOverview from './DashboardOverview';

/**
 * Home, once the books are running.
 *
 * The setup list answers "what do I still have to do". This answers "what is
 * happening", and the day the last setup step is ticked the screen has to
 * become the second one — which is the whole point of the state.
 *
 * Every figure here is checked against the fixture rather than against itself:
 * a panel that renders is worth nothing if the number in it is not the one the
 * books hold.
 */

const co = { id: 1, name: 'Mani beriyanis', state: 'Karnataka' };
const iso = (d) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

const running = {
  companies: [co],
  invoices: [
    /* Overdue by nine days. */
    { id: 1, companyId: 1, number: 'INV-0042', customerName: 'Acme Pvt Ltd', date: iso(-12), dueDate: iso(-9), total: 48500, balance: 48500, status: 'Sent' },
    /* Falls due inside the week. */
    { id: 2, companyId: 1, number: 'INV-0041', customerName: 'Kumar Traders', date: iso(-6), dueDate: iso(4), total: 18900, balance: 18900, status: 'Sent' },
    /* Falls due well beyond it. */
    { id: 3, companyId: 1, number: 'INV-0040', customerName: 'Fresh Farms', date: iso(-20), dueDate: iso(30), total: 273750, balance: 273750, status: 'Sent' },
  ],
  bills: [{ id: 1, companyId: 1, number: 'BILL-019', vendorName: 'ABC Supplies', date: iso(-4), dueDate: iso(3), total: 22400, balance: 22400, status: 'Open' }],
  payments: [],
  chartOfAccounts: [],
  customers: [{ id: 1, companyId: 1, name: 'Acme Pvt Ltd' }],
  items: [],
  journalEntries: [],
};

const fresh = { ...running, invoices: [], bills: [], customers: [], payments: [] };

const renderHome = (db, props = {}) =>
  render(
    <DashboardOverview
      db={db}
      currentCompany={co}
      userName="manickam"
      onNewInvoice={() => {}}
      onOpenInvoices={() => {}}
      onNavigate={() => {}}
      {...props}
    />
  );

describe('the screen follows the state of the books', () => {
  it('shows the setup list while nothing has been billed', () => {
    renderHome(fresh);
    expect(screen.getByText('Finish setting up')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Things to do' })).toBeNull();
  });

  it('shows what is happening once a book is running', () => {
    renderHome(running);
    expect(screen.queryByText('Finish setting up')).toBeNull();
    for (const panel of ['Things to do', 'Quick links', 'Revenue and expenses', 'Cash flow', 'Recent activity']) {
      expect(screen.getByRole('region', { name: panel })).toBeInTheDocument();
    }
  });
});

describe('the figures are the ones the books hold', () => {
  it('splits what is owed to you by when it falls due', () => {
    renderHome(running);
    const panel = screen.getAllByRole('region', { name: 'Receivables' }).at(-1);
    const row = (label) => within(panel).getByText(label).closest('div').textContent;
    /* Overdue, this week, later — 48,500 / 18,900 / 2,73,750. */
    expect(row('Overdue')).toContain('48,500');
    expect(row('Due in 7 days')).toContain('18,900');
    expect(row('Due later')).toContain('2,73,750');
  });

  it('splits what you owe the same way', () => {
    renderHome(running);
    const panel = screen.getByRole('region', { name: 'Payables' });
    expect(within(panel).getByText('Due in 7 days').closest('div').textContent).toContain('22,400');
  });

  it('puts the overdue money on the list of things to do', () => {
    renderHome(running);
    const todo = screen.getByRole('region', { name: 'Things to do' });
    expect(within(todo).getByText(/overdue from customers/)).toBeInTheDocument();
    expect(within(todo).getByText(/bills due this week/)).toBeInTheDocument();
  });

  it('names the last documents raised, newest first', () => {
    renderHome(running);
    const rows = within(screen.getByRole('region', { name: 'Recent activity' })).getAllByRole('button');
    /* The View all control is first; the documents follow it, newest first —
       the bill is four days old and the invoice six. */
    const numbers = rows.slice(1).map((r) => r.textContent);
    expect(numbers[0]).toContain('BILL-019');
    expect(numbers[1]).toContain('INV-0041');
  });
});

describe('a panel with nothing in it says so', () => {
  it('does not print a zero where there is no answer', () => {
    renderHome({ ...running, invoices: running.invoices.slice(0, 1), bills: [] });
    const todo = screen.getByRole('region', { name: 'Things to do' });
    /* No bills at all, so no "due this week" line — not a ₹0.00 one. */
    expect(within(todo).queryByText(/bills due this week/)).toBeNull();
  });
});
