import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => false }) }));

const reconcilePayment = vi.fn();
const reconcileBankBookEntry = vi.fn();
vi.mock('../../api/payments', () => ({ reconcilePayment: (...a) => reconcilePayment(...a) }));
vi.mock('../../api/bankBook', () => ({ reconcileBankBookEntry: (...a) => reconcileBankBookEntry(...a) }));

const notifyError = vi.fn();
vi.mock('../../components/ui/notify', () => ({
  notify: { error: (...a) => notifyError(...a), success: vi.fn() },
  confirmDialog: vi.fn(),
}));

import BankReconciliation from './BankReconciliation';

const COMPANY = { id: 1, name: 'Neev Steels' };

const dbWith = (over = {}) => ({
  companies: [COMPANY],
  chartOfAccounts: [
    { id: 7, companyId: 1, name: 'HDFC Current', groupName: 'Bank Accounts', serverLedgerAccountId: 'led-7' },
  ],
  payments: [],
  bankTransactions: [],
  ...over,
});

/** A CSV the way a bank actually exports one: debit and credit columns. */
const STATEMENT = [
  'Date,Description,Debit,Credit,Balance',
  '2026-09-01,NEFT-ACME TRADERS-9921,,5000,105000',
  '2026-09-02,CHQ 400122 RENT,12000,,93000',
  '2026-09-30,BANK CHARGES,236,,92764',
].join('\n');

const loadStatement = async (csv = STATEMENT) => {
  const input = document.querySelector('input[type="file"]');
  const file = new File([csv], 'statement.csv', { type: 'text/csv' });
  // jsdom does not implement File.text().
  file.text = () => Promise.resolve(csv);
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(document.body.textContent).toContain('Reconciliation'));
};

beforeEach(() => {
  reconcilePayment.mockReset().mockResolvedValue({});
  reconcileBankBookEntry.mockReset().mockResolvedValue({});
  notifyError.mockClear();
});

const paid = (id, date, amount, narration) => ({
  id,
  companyId: 1,
  ledgerAccountId: 'led-7',
  voucherType: 'payment',
  date,
  amount,
  number: narration,
});
const received = (id, date, amount, narration) => ({ ...paid(id, date, amount, narration), voucherType: 'receipt' });

describe('reconciling a bank account', () => {
  /*
   * The point of the screen. What the product had was an import that turned
   * statement rows into new transactions and doubled the money on a book that
   * had already recorded them.
   */
  it('ties a statement line to the payment already in the book', async () => {
    render(
      <BankReconciliation db={dbWith({ payments: [received(1, '2026-09-01', 5000, 'Acme Traders')] })} currentCompany={COMPANY} />
    );
    await loadStatement();
    expect(screen.getByText(/Matched \(1\)/)).toBeInTheDocument();
    expect(screen.getByText(/On the statement, not in the books \(2\)/)).toBeInTheDocument();
  });

  /*
   * The two leftovers are the whole answer: a bank charge nobody recorded, and
   * a cheque that has not cleared.
   */
  it('separates what each side has not seen', async () => {
    render(
      <BankReconciliation
        db={dbWith({ payments: [paid(2, '2026-09-28', 40000, 'Cheque 400130')] })}
        currentCompany={COMPANY}
      />
    );
    await loadStatement();
    expect(screen.getByText(/In the books, not on the statement \(1\)/)).toBeInTheDocument();
    const stmtOnly = screen.getByText(/On the statement, not in the books/).parentElement;
    expect(within(stmtOnly).getByText(/BANK CHARGES/)).toBeInTheDocument();
  });

  /* A cheque is written the day it is handed over and clears when it clears. */
  it('matches a cheque that cleared a day later', async () => {
    render(
      <BankReconciliation db={dbWith({ payments: [paid(3, '2026-09-01', 12000, 'Cheque 400122 rent')] })} currentCompany={COMPANY} />
    );
    await loadStatement();
    expect(screen.getByText(/cleared 1 day later/)).toBeInTheDocument();
  });

  /*
   * The number the exercise exists for. Everything unexplained has to be
   * stated, not rounded away.
   */
  it('shows the difference and says when it is nil', async () => {
    render(
      <BankReconciliation
        db={dbWith({
          payments: [
            received(1, '2026-09-01', 5000, 'Acme Traders'),
            paid(2, '2026-09-02', 12000, 'Cheque 400122 rent'),
            paid(3, '2026-09-30', 236, 'Bank charges'),
          ],
        })}
        currentCompany={COMPANY}
      />
    );
    await loadStatement();
    // Book: +5000 -12000 -236 = -7236. Everything matched, so the statement
    // balance has to equal it for the account to reconcile.
    const closing = screen.getByLabelText('Closing balance per statement');
    fireEvent.change(closing, { target: { value: '-7236' } });
    await waitFor(() => expect(screen.getByText('This account reconciles.')).toBeInTheDocument());
  });

  it('names the unexplained amount when it does not reconcile', async () => {
    render(<BankReconciliation db={dbWith()} currentCompany={COMPANY} />);
    await loadStatement();
    const closing = screen.getByLabelText('Closing balance per statement');
    fireEvent.change(closing, { target: { value: '0' } });
    await waitFor(() => expect(screen.getByText(/is unexplained/)).toBeInTheDocument());
  });

  /*
   * Rejecting a suggested match must put both of its sides back among the
   * unexplained, or the difference stops adding up while the screen still
   * claims the account reconciles.
   */
  it('returns both sides to the leftovers when a match is rejected', async () => {
    render(
      <BankReconciliation db={dbWith({ payments: [received(1, '2026-09-01', 5000, 'Acme Traders')] })} currentCompany={COMPANY} />
    );
    await loadStatement();
    expect(screen.getByText(/On the statement, not in the books \(2\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Unmatch/ }));
    await waitFor(() => expect(screen.getByText(/Matched \(0\)/)).toBeInTheDocument());
    expect(screen.getByText(/On the statement, not in the books \(3\)/)).toBeInTheDocument();
    expect(screen.getByText(/In the books, not on the statement \(1\)/)).toBeInTheDocument();
  });

  /* The file already says the closing balance; asking again is busy-work. */
  it('takes the closing balance from the statement', async () => {
    render(<BankReconciliation db={dbWith()} currentCompany={COMPANY} />);
    await loadStatement();
    expect(screen.getByLabelText('Closing balance per statement')).toHaveValue(92764);
  });

  /*
   * Told, not merely ignored. A file that silently does nothing reads as a
   * broken button, and the person tries the same file again.
   */
  it('says what a file was missing when it is not a statement', async () => {
    notifyError.mockClear();
    render(<BankReconciliation db={dbWith()} currentCompany={COMPANY} />);
    const input = document.querySelector('input[type="file"]');
    const csv = 'Foo,Bar\n1,2';
    const file = new File([csv], 'nope.csv', { type: 'text/csv' });
    file.text = () => Promise.resolve(csv);
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(String(notifyError.mock.calls[0][0])).toMatch(/needs a Date column/i);
    expect(screen.getByText(/Bring a statement/)).toBeInTheDocument();
  });

  it('asks for an account before anything else', () => {
    render(<BankReconciliation db={dbWith({ chartOfAccounts: [] })} currentCompany={COMPANY} />);
    expect(screen.getByText('No bank or cash account yet')).toBeInTheDocument();
  });
});

/*
 * Until this existed the screen worked out the answer and then forgot it. The
 * matching, the confirming and the unmatching all lived in component state, so
 * closing the tab threw the reconciliation away and the next statement
 * re-proposed every payment again.
 */
describe('tying the reconciliation off', () => {
  const withMatch = (over = {}) =>
    dbWith({ payments: [received(1, '2026-09-01', 5000, 'Acme Traders')], ...over });

  it('saves each matched pair against its payment', async () => {
    const setDb = vi.fn();
    /*
     * A cheque written on the 1st and cleared on the 2nd, deliberately: with
     * both dates the same, sending the book's date instead of the bank's is
     * indistinguishable and the assertion below proves nothing.
     */
    const db = dbWith({ payments: [paid(4, '2026-09-01', 12000, 'Cheque 400122 rent')] });
    render(<BankReconciliation db={db} setDb={setDb} currentCompany={COMPANY} />);
    await loadStatement();
    fireEvent.click(screen.getByRole('button', { name: /Reconcile 1 matched/ }));

    await waitFor(() => expect(reconcilePayment).toHaveBeenCalledTimes(1));
    const [id, payload] = reconcilePayment.mock.calls[0];
    expect(id).toBe('4');
    expect(payload.reconciled).toBe(true);
    // The bank's date, not the book's — that is the point of the column.
    expect(payload.bankDate).toBe('2026-09-02');
    // And what the bank called it, so a query six months later is answerable.
    expect(payload.statementRef).toContain('CHQ 400122 RENT');
  });

  it('marks the local book so the row does not come back as outstanding', async () => {
    const setDb = vi.fn();
    render(<BankReconciliation db={withMatch()} setDb={setDb} currentCompany={COMPANY} />);
    await loadStatement();
    fireEvent.click(screen.getByRole('button', { name: /Reconcile 1 matched/ }));

    await waitFor(() => expect(setDb).toHaveBeenCalled());
    const next = setDb.mock.calls[0][0]({ payments: [received(1, '2026-09-01', 5000, 'Acme')] });
    expect(next.payments[0].reconciled).toBe(true);
  });

  /*
   * A payment tied off in an earlier session is not outstanding. Without this
   * every statement a business ever loads re-proposes every payment it has
   * ever made.
   */
  it('leaves an already-reconciled payment out of the book side', async () => {
    const db = dbWith({ payments: [{ ...received(1, '2026-09-01', 5000, 'Acme Traders'), reconciled: true }] });
    render(<BankReconciliation db={db} setDb={() => {}} currentCompany={COMPANY} />);
    await loadStatement();
    expect(screen.getByText(/Matched \(0\)/)).toBeInTheDocument();
    expect(screen.getByText(/In the books, not on the statement \(0\)/)).toBeInTheDocument();
  });

  /* A cash-book line is tied off the same way a payment is, now that it has a
     server record of its own. */
  it('ties off a bank book line too', async () => {
    const setDb = vi.fn();
    const db = dbWith({
      bankTransactions: [
        {
          id: 9,
          companyId: 1,
          cashBankAccountId: 7,
          backendBankEntryId: 'bbe-9',
          date: '2026-09-30',
          direction: 'OUT',
          amount: 236,
          narration: 'Bank charges',
        },
      ],
    });
    render(<BankReconciliation db={db} setDb={setDb} currentCompany={COMPANY} />);
    await loadStatement();
    fireEvent.click(screen.getByRole('button', { name: /Reconcile 1 matched/ }));

    await waitFor(() => expect(reconcileBankBookEntry).toHaveBeenCalledTimes(1));
    expect(reconcileBankBookEntry.mock.calls[0][0]).toBe('bbe-9');
    expect(reconcileBankBookEntry.mock.calls[0][1].reconciled).toBe(true);

    const next = setDb.mock.calls[0][0]({ payments: [], bankTransactions: [{ id: 9 }] });
    expect(next.bankTransactions[0].reconciled).toBe(true);
  });

  /*
   * A line the server has never seen — written on this device before the cash
   * book had a table, or written while offline. It can be matched on screen and
   * not tied off, and the screen says so rather than quietly leaving it out.
   */
  it('says which matches it cannot save yet', async () => {
    const db = dbWith({
      bankTransactions: [
        { id: 9, companyId: 1, cashBankAccountId: 7, date: '2026-09-01', direction: 'IN', amount: 5000, narration: 'Acme Traders' },
      ],
    });
    render(<BankReconciliation db={db} setDb={() => {}} currentCompany={COMPANY} />);
    await loadStatement();
    expect(screen.getByText(/1 not on the server yet — matched here, not tied off/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reconcile 0 matched/ })).toBeDisabled();
  });

  /* An already-reconciled cash-book line is not outstanding either. */
  it('leaves an already-reconciled bank book line out', async () => {
    const db = dbWith({
      bankTransactions: [
        {
          id: 9,
          companyId: 1,
          cashBankAccountId: 7,
          backendBankEntryId: 'bbe-9',
          date: '2026-09-30',
          direction: 'OUT',
          amount: 236,
          narration: 'Bank charges',
          reconciled: true,
        },
      ],
    });
    render(<BankReconciliation db={db} setDb={() => {}} currentCompany={COMPANY} />);
    await loadStatement();
    expect(screen.getByText(/Matched \(0\)/)).toBeInTheDocument();
  });

  /* A refusal on one payment must not take the rest down with it. */
  it('reports what could not be saved', async () => {
    reconcilePayment.mockRejectedValue(new Error('reconciliation is switched off'));
    render(<BankReconciliation db={withMatch()} setDb={vi.fn()} currentCompany={COMPANY} />);
    await loadStatement();
    fireEvent.click(screen.getByRole('button', { name: /Reconcile 1 matched/ }));
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(String(notifyError.mock.calls[0][0])).toMatch(/could not be saved/);
  });
});
