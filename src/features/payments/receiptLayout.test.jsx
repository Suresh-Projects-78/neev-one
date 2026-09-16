/**
 * Where the fields sit.
 *
 * The head of the receipt is one three-column grid, not two halves with a rule
 * between them, and the reference falls directly under the account it names
 * the instrument of. These are layout facts the screenshots kept catching and
 * the test suite did not.
 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/payments', () => ({ createPayment: vi.fn(async () => ({})) }));

import RecordReceiptForm from './RecordReceiptForm';

const COMPANY = { id: 1, name: 'Neev Steels', state: 'Karnataka' };
/* TDS is a company setting, and the section is not drawn without it. */
const COMPANY_TDS = {
  ...COMPANY,
  profile: { taxCompliances: { tds: { enabled: true, tan: 'BLRN12345F' } } },
};

const db0 = {
  companies: [COMPANY],
  customers: [],
  invoices: [],
  creditNotes: [],
  payments: [],
  accountGroups: [{ id: 21, companyId: 1, name: 'Indirect Income', parentGroupId: null }],
  chartOfAccounts: [{ id: 401, companyId: 1, name: 'Interest Received', groupId: 21 }],
};

const Host = ({ tds = false }) => {
  const [db, setDb] = useState(db0);
  return (
    <RecordReceiptForm
      db={db}
      setDb={setDb}
      currentCompany={tds ? COMPANY_TDS : COMPANY}
      screenTitle="New Receipt"
      onClose={() => {}}
    />
  );
};

describe('the head of the receipt', () => {
  it('is one grid of three columns, not two halves with a rule', () => {
    render(<Host />);
    const heading = screen.getByText('Receipt Details');
    const grid = heading.parentElement.querySelector('.grid');
    expect(grid.className).toMatch(/lg:grid-cols-3/);
    /* The rule belonged to a two-column split that no longer exists. */
    expect(grid.className).not.toMatch(/grid-cols-12/);
    expect(heading.closest('section').querySelector('[style*="border-inline-start"]')).toBeNull();
  });

  /*
   * Six fields in three columns, two rows — and each second-row field sits
   * under the one it qualifies. With a three-column grid that is a statement
   * about DOM order: cell 4 falls under cell 1, 5 under 2, 6 under 3.
   */
  it('carries all six fields', () => {
    render(<Host />);
    const grid = screen.getByText('Receipt Details').parentElement.querySelector('.grid');
    for (const label of [
      /Received into/, /Receipt No\./, /Receipt Date/,
      /Receipt Mode/, /Reference \/ UTR \/ Cheque No\./, /Narration \/ Description/,
    ]) {
      expect(within(grid).getByText(label)).toBeInTheDocument();
    }
    expect(grid.children).toHaveLength(6);
  });

  it('puts each second-row field under the one it qualifies', () => {
    render(<Host />);
    const grid = screen.getByText('Receipt Details').parentElement.querySelector('.grid');
    const cells = [...grid.children];
    const at = (re) => cells.findIndex((c) => within(c).queryByText(re));

    expect(at(/Received into/)).toBe(0);
    expect(at(/Receipt No\./)).toBe(1);
    expect(at(/Receipt Date/)).toBe(2);
    /* The mode under the account the money landed in. */
    expect(at(/Receipt Mode/)).toBe(3);
    /* The instrument's number under the receipt's own number. */
    expect(at(/Reference \/ UTR \/ Cheque No\./)).toBe(4);
    /* The sentence under the date. */
    expect(at(/Narration \/ Description/)).toBe(5);
  });

  it('opens the mode on what the account implies, and lets it be changed', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(<Host />);
    const mode = screen.getByLabelText('Receipt Mode');
    /* No account chosen yet, so the field falls back rather than blanking. */
    expect(mode.value).toBe('Cash');
    await user.selectOptions(mode, 'NEFT');
    expect(mode.value).toBe('NEFT');
  });

  it('names the screen and says what it is for', () => {
    render(<Host />);
    expect(screen.getByRole('heading', { name: 'New Receipt' })).toBeInTheDocument();
    expect(screen.getByText(/Record money received into your business/)).toBeInTheDocument();
  });
});

describe('the receipt summary', () => {
  it('states three figures, not the eight it used to', () => {
    render(<Host />);
    /* The heading and the figures are siblings, so the card is the parent. */
    const card = screen.getByText('Receipt Summary').parentElement;
    expect(within(card).getByText('Total allocation')).toBeInTheDocument();
    expect(within(card).getByText('TDS deducted')).toBeInTheDocument();
    expect(within(card).getByText('Bank amount (Total receipt)')).toBeInTheDocument();
    /* Named boxes that no longer exist, and the same number under three
       different words. */
    expect(within(card).queryByText('Amount received')).toBeNull();
    expect(within(card).queryByText('Bank charges')).toBeNull();
    expect(within(card).queryByText('Invoices selected')).toBeNull();
  });

  it('keeps Notes as its own thing, apart from the narration', () => {
    render(<Host />);
    /* Two different jobs: the narration is the line the ledger prints, in the
       head with the rest of the document; Notes is everything else. */
    expect(screen.getByLabelText('Notes').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Narration / Description').tagName).toBe('INPUT');
  });

  it('keeps the on-account line for the receipts that have one', () => {
    render(<Host />);
    /* Nothing allocated, nothing waiting — so the line is not drawn at all
       rather than reading nought on every receipt. */
    expect(screen.queryByText('On account (unallocated)')).toBeNull();
  });
});

describe('the allocation table', () => {
  it('does not cry unallocated before anything has been entered', () => {
    render(<Host />);
    expect(screen.queryByText('Unallocated')).toBeNull();
  });

  it('puts Add Row below the rows it adds to', () => {
    render(<Host />);
    const table = screen.getByText(/Ledger allocation/i).closest('section').querySelector('table');
    const addRow = screen.getByRole('button', { name: /Add Row/i });
    /* DOCUMENT_POSITION_FOLLOWING: the button comes after the table. */
    expect(table.compareDocumentPosition(addRow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

/**
 * The acceptance list, walked against the rendered screen.
 *
 * Every element that has to be there, asserted in one place — because the
 * things that kept going missing were never the ones under test, and a list
 * checked by eye is a list that drifts.
 */
describe('nothing on the screen has gone missing', () => {
  const CHECKS = [
    ['Receipt Details', () => screen.getByText('Receipt Details')],
    ['Receive into', () => screen.getByText(/Received into/)],
    ['Receipt No.', () => screen.getByText(/Receipt No\./)],
    ['Receipt Date', () => screen.getByText(/Receipt Date/)],
    ['Receipt Mode', () => screen.getByLabelText('Receipt Mode')],
    ['Reference / UTR / Cheque No.', () => screen.getByLabelText(/Reference \/ UTR \/ Cheque No\./)],
    ['Narration / Description', () => screen.getByLabelText('Narration / Description')],
    ['Ledger allocation', () => screen.getByText(/Ledger allocation/i)],
    ['Ledger field', () => screen.getByLabelText(/Account, allocation row 1/i)],
    ['Amount field', () => screen.getByLabelText(/Amount, allocation row 1/i)],
    ['Add Row', () => screen.getByRole('button', { name: /Add Row/i })],
    ['TDS section', () => screen.getByText('TDS (optional)')],
    ['TDS Ledger', () => screen.getByLabelText('TDS Ledger')],
    ['TDS Amount', () => screen.getByLabelText('TDS Amount')],
    ['Receipt Summary', () => screen.getByText('Receipt Summary')],
    ['Total allocation', () => screen.getByText('Total allocation')],
    ['TDS deducted', () => screen.getByText('TDS deducted')],
    ['Bank amount (Total receipt)', () => screen.getByText('Bank amount (Total receipt)')],
    ['Notes', () => screen.getByLabelText('Notes')],
  ];

  it('has every one of them', () => {
    render(<Host tds />);
    const missing = CHECKS.filter(([, get]) => {
      try { get(); return false; } catch { return true; }
    }).map(([name]) => name);
    expect(missing).toEqual([]);
  });
});
