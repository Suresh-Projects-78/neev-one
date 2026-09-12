import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => true }) }));

import CashBankTransactions from './CashBankTransactions';

/**
 * The cash book.
 *
 * Account first, then period, on one line and nothing else — §4. The screen it
 * replaces asked a different question entirely ("has this import been
 * categorised?"), which is about the import rather than about the account.
 */

const COMPANY = { id: 1, name: 'Neev Steels' };

const db = {
  companies: [COMPANY],
  accountGroups: [
    { id: 1, companyId: 1, name: 'Bank Accounts', parentGroupId: null },
    { id: 2, companyId: 1, name: 'Cash-in-Hand', parentGroupId: null },
  ],
  chartOfAccounts: [
    { id: 11, companyId: 1, name: 'HDFC Bank - Current A/c', groupId: 1, serverLedgerAccountId: 'srv-hdfc' },
    { id: 12, companyId: 1, name: 'Petty Cash', groupId: 2, serverLedgerAccountId: 'srv-cash' },
  ],
  payments: [
    { id: 1, companyId: 1, date: '2026-09-12', voucherType: 'payment', ledgerAccountId: 'srv-hdfc', amount: 100000, partyName: 'ABC Traders' },
    { id: 2, companyId: 1, date: '2026-09-13', voucherType: 'receipt', ledgerAccountId: 'srv-hdfc', amount: 50000, partyName: 'ABC Industries', reconciled: true },
    { id: 3, companyId: 1, date: '2026-09-14', voucherType: 'receipt', ledgerAccountId: 'srv-cash', amount: 35000, partyName: 'Customer Advance' },
  ],
  journalEntries: [
    { id: 7, companyId: 1, date: '2026-09-15', lines: [{ accountId: '12', debit: 25000, credit: 0 }, { accountId: '11', debit: 0, credit: 25000 }] },
  ],
  bankTransactions: [],
};

const view = (props = {}) => render(<CashBankTransactions db={db} currentCompany={COMPANY} {...props} />);
const rowFor = (text) => screen.getAllByText(text).map((el) => el.closest('tr')).find(Boolean);
/* The contra row names the other account, which is also an account row's own
   name elsewhere on the page — so it is found by its type, not its ledger. */
const contraRow = () => screen.getByText('Contra').closest('tr');

describe('the columns the spec asks for', () => {
  it('are date, account, ledger name, type, amount, status and action', () => {
    view();
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent.trim())).toEqual([
      'Date', 'Account', 'Ledger name', 'Type', 'Amount', 'Status', 'Action',
    ]);
  });

  it('offers no search — a cash book is read, not hunted through', () => {
    view();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();
  });

  it('puts account before period, both on the one line', () => {
    view();
    const account = screen.getByRole('combobox', { name: 'Account' });
    const period = screen.getByRole('combobox', { name: 'Period' });
    expect(account.parentElement.parentElement).toBe(period.parentElement.parentElement);
    expect(account.compareDocumentPosition(period) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('the three types, and only three', () => {
  it('names a payment, a receipt and a contra', () => {
    view();
    expect(within(rowFor('ABC Traders')).getByText('Payment')).toBeInTheDocument();
    expect(within(rowFor('ABC Industries')).getByText('Receipt')).toBeInTheDocument();
    expect(within(contraRow()).getByText('Contra')).toBeInTheDocument();
  });

  /* Red, green, blue — §4 and the acceptance criteria both say so, and the
     colour is read before the word is. */
  it('colours payment red, receipt green and contra blue', () => {
    view();
    expect(within(rowFor('ABC Traders')).getByText('Payment').className).toMatch(/neg-ink/);
    expect(within(rowFor('ABC Industries')).getByText('Receipt').className).toMatch(/pos-ink/);
    expect(within(contraRow()).getByText('Contra').className).toMatch(/ov-blue/);
  });
});

describe('the figures above the list', () => {
  it('total each type and count the rows', () => {
    view();
    const card = (label) => screen.getByText(label).closest('div').parentElement;
    expect(within(card('Total payments')).getByText(/1,00,000\.00/)).toBeInTheDocument();
    expect(within(card('Total receipts')).getByText(/85,000\.00/)).toBeInTheDocument();
    expect(within(card('Total contra')).getByText(/25,000\.00/)).toBeInTheDocument();
    expect(within(card('Total transactions')).getByText('4')).toBeInTheDocument();
  });

  it('follows the account that was chosen', async () => {
    const user = userEvent.setup();
    view();
    await user.click(screen.getByRole('combobox', { name: 'Account' }));
    await user.click(screen.getByRole('option', { name: 'Petty Cash' }));

    /* The cash account saw one receipt and one leg of the transfer. */
    const card = (label) => screen.getByText(label).closest('div').parentElement;
    expect(within(card('Total transactions')).getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('ABC Traders')).toBeNull();
  });
});

describe('acting on a row', () => {
  /* A cash-book row is a view of a payment, a journal or an imported line —
     acting on it means going to the document itself. */
  it('offers View, which opens the screen that owns the source', async () => {
    const user = userEvent.setup();
    const opened = vi.fn();
    view({ onOpenSource: opened });

    const row = screen.getByText('ABC Traders').closest('tr');
    await user.click(within(row).getByRole('button', { name: 'View' }));

    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ kind: 'payment', type: 'Payment' }));
  });

  it('offers the sibling screens under More', async () => {
    const user = userEvent.setup();
    const reco = vi.fn();
    view({ onOpenReconciliation: reco, onOpenAccounts: () => {} });

    await user.click(screen.getByRole('button', { name: /More/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Reconciliation' }));
    expect(reco).toHaveBeenCalled();
  });
});

describe('starting an entry', () => {
  it('offers the three kinds under one primary', async () => {
    const user = userEvent.setup();
    const payment = vi.fn();
    const contra = vi.fn();
    view({ onNewPayment: payment, onNewReceipt: () => {}, onNewContra: contra });

    await user.click(screen.getByRole('button', { name: /New Transaction/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent.trim())).toEqual([
      'Payment', 'Receipt', 'Contra — move between accounts',
    ]);

    await user.click(within(menu).getByRole('menuitem', { name: 'Payment' }));
    expect(payment).toHaveBeenCalled();
  });

  it('keeps importing a statement beside it, not under it', () => {
    const importing = vi.fn();
    view({ onImportStatement: importing });
    expect(screen.getByRole('button', { name: /Import Statement/ })).toBeInTheDocument();
  });
});
