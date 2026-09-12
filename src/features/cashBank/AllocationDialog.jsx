import { useMemo, useState } from 'react';
import { FileText, Plus, Trash2 } from 'lucide-react';

import Modal from '../../components/ui/Modal';
import { notify } from '../../components/ui/notify';
import { formatMoney, round2 } from '../../utils/money';
import { postJournalToLedger } from '../../utils/journalSync';
import RecordDisbursementForm from '../payments/RecordDisbursementForm';
import RecordReceiptForm from '../payments/RecordReceiptForm';
import { allocationJournalLines, allocationSummary, partyForLedger, validateAllocation } from './allocations';

/**
 * One bank line, split across the book.
 *
 * The parent — what the bank said — sits at the top and cannot be touched
 * from here. Underneath, the child rows say what the money was. The three
 * figures the specification insists on are always in view: Bank Amount,
 * Allocated, Difference.
 *
 * A row comes in two kinds, and the ledger picked decides which:
 *
 * ORDINARY ledgers (bank charges, interest, GST…) stay plain rows — a
 * ledger, an amount, a narration — and post together as one journal through
 * the same engine a hand-typed entry uses.
 *
 * PARTY ledgers hand over to the payment engine instead. A vendor row on a
 * bank debit offers "Allocate bills"; a customer row on a credit offers
 * "Allocate invoices" — each opening the same disbursement / receipt form
 * every other payment goes through, with its bill knock-off, partial
 * allocation, advance handling and TDS intact. Outstanding balances move
 * only inside that engine; this dialog never touches them. A row settled
 * that way carries the voucher it became and is excluded from the closing
 * journal, whose bank leg covers only the plain rows.
 */
const AllocationDialog = ({ db, setDb, currentCompany, txn, onClose }) => {
  const companyId = currentCompany?.id;
  const out = String(txn?.direction || '').toUpperCase() === 'OUT';

  const ledgers = useMemo(
    () =>
      (db?.chartOfAccounts || [])
        .filter((a) => a.companyId === companyId)
        .filter((a) => String(a.id) !== String(txn?.cashBankAccountId))
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [db?.chartOfAccounts, companyId, txn?.cashBankAccountId]
  );

  const existing = useMemo(
    () =>
      (db?.bankAllocations || [])
        .filter((a) => Number(a.companyId) === Number(companyId))
        .filter((a) => String(a.bankTransactionId) === String(txn?.id)),
    [db?.bankAllocations, companyId, txn?.id]
  );

  const [rows, setRows] = useState(() =>
    existing.length
      ? existing.map((a) => ({
          ledgerId: String(a.ledgerId || ''),
          amount: String(a.amount ?? ''),
          narration: String(a.narration || ''),
          paymentId: a.paymentId ?? null,
          paymentNumber: String(a.paymentNumber || ''),
          partyKind: String(a.partyKind || ''),
          partyId: a.partyId ?? null,
        }))
      : [{ ledgerId: '', amount: '', narration: '', paymentId: null, paymentNumber: '', partyKind: '', partyId: null }]
  );

  /* Which row is inside the payment engine right now, or null. */
  const [engineRow, setEngineRow] = useState(null);

  const numericRows = rows.map((r) => ({ ...r, amount: Number(r.amount || 0) }));
  const summary = allocationSummary(txn, numericRows);
  const check = validateAllocation(txn, numericRows);

  const setRow = (i, patch) => setRows((prev) => prev.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((prev) => [...prev, { ledgerId: '', amount: '', narration: '', paymentId: null, paymentNumber: '', partyKind: '', partyId: null }]);
  const removeRow = (i) => setRows((prev) => (prev.length > 1 ? prev.filter((_, n) => n !== i) : prev));

  /** The party behind a row's ledger, if the direction lets them settle it. */
  const rowParty = (r) => {
    const hit = partyForLedger(db, companyId, r.ledgerId);
    if (!hit) return null;
    if (hit.kind === 'vendor' && !out) return null;
    if (hit.kind === 'customer' && out) return null;
    return hit;
  };

  /** What the engine settled comes back as the row's own facts. */
  const engineSaved = (i, hit) => (payment) => {
    const settled = round2(Number(payment?.netCash ?? payment?.netCashAmount ?? payment?.amount ?? 0));
    setRow(i, {
      amount: String(settled || ''),
      paymentId: payment?.id ?? null,
      paymentNumber: String(payment?.number || payment?.paymentNo || ''),
      partyKind: hit.kind,
      partyId: hit.party?.id ?? null,
    });
    setEngineRow(null);
  };

  /** Replace this txn's child rows; post the journal only when told to. */
  const save = async ({ post }) => {
    const live = rows
      .map((r) => ({
        ledgerId: String(r.ledgerId || '').trim(),
        amount: round2(Math.abs(Number(r.amount || 0))),
        narration: String(r.narration || '').trim(),
        paymentId: r.paymentId ?? null,
        paymentNumber: String(r.paymentNumber || ''),
        partyKind: String(r.partyKind || ''),
        partyId: r.partyId ?? null,
      }))
      .filter((r) => r.amount > 0.005);

    if (post && !check.canPost) return;
    if (!post && !check.canSave) {
      notify.error(check.problems[0] || 'Nothing to save.');
      return;
    }

    /* Only the plain ledger rows still need accounting — the engine rows'
       vouchers already posted theirs. No plain rows, no journal. */
    const direct = live.filter((r) => !r.paymentId);

    let journalPatch = {};
    let journalId = null;
    if (post && direct.length) {
      const accounts = (db.chartOfAccounts || []).filter((a) => a.companyId === companyId);
      const lines = allocationJournalLines(txn, live).map((l) => {
        const acc = accounts.find((a) => String(a.id) === String(l.accountId));
        return { ...l, accountName: acc?.name || '', accountCode: acc?.code || '' };
      });
      journalPatch = await postJournalToLedger({
        chartRows: accounts,
        entry: {
          date: txn.date,
          narration: `Bank allocation — ${String(txn.narration || txn.description || '').trim() || txn.date}`,
          lines,
        },
      });
      journalId = ((db.journalEntries || []).reduce((m, j) => Math.max(m, Number(j?.id || 0)), 0) || 0) + 1;
    }

    const directTotal = round2(direct.reduce((t, r) => t + r.amount, 0));

    setDb((prev) => {
      const others = (prev.bankAllocations || []).filter(
        (a) => !(Number(a.companyId) === Number(companyId) && String(a.bankTransactionId) === String(txn.id))
      );
      let nextId = (prev.bankAllocations || []).reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;
      const children = live.map((r) => ({
        id: nextId++,
        companyId,
        bankTransactionId: txn.id,
        ledgerId: r.ledgerId,
        amount: r.amount,
        narration: r.narration,
        /* The accounting linkage — one of the two, never both: the voucher
           the payment engine wrote, or the journal the plain rows share. */
        paymentId: r.paymentId,
        paymentNumber: r.paymentNumber || undefined,
        partyKind: r.partyKind || undefined,
        partyId: r.partyId ?? undefined,
        journalEntryId: post && !r.paymentId ? journalId : null,
        createdAt: new Date().toISOString(),
      }));

      const journalEntry =
        post && direct.length
          ? {
              id: journalId,
              companyId,
              number: `BA-${txn.id}`,
              date: txn.date,
              narration: `Bank allocation — ${String(txn.narration || txn.description || '').trim() || txn.date}`,
              lines: allocationJournalLines(txn, live).map((l) => {
                const acc = (prev.chartOfAccounts || []).find((a) => String(a.id) === String(l.accountId));
                return { ...l, accountName: acc?.name || '', accountCode: acc?.code || '' };
              }),
              totalDebit: directTotal,
              totalCredit: directTotal,
              sourceBankTransactionId: txn.id,
              createdAt: new Date().toISOString(),
              ...journalPatch,
            }
          : null;

      return {
        ...prev,
        bankAllocations: [...others, ...children],
        journalEntries: journalEntry ? [...(prev.journalEntries || []), journalEntry] : prev.journalEntries,
        /* The parent's bank-side facts never move; what changes is only the
           note that its accounting now exists. */
        bankTransactions: (prev.bankTransactions || []).map((t) =>
          t.companyId === companyId && String(t.id) === String(txn.id)
            ? { ...t, allocationJournalId: journalEntry ? journalId : t.allocationJournalId ?? null }
            : t
        ),
      };
    });

    notify.success(post ? 'Allocated and posted.' : 'Allocation saved — not posted yet.');
    onClose?.();
  };

  /* The payment engine, opened inside this dialog for one row. */
  if (engineRow) {
    const { index, hit } = engineRow;
    const r = rows[index];
    const initialData = {
      date: txn?.date,
      amount: String(Number(r?.amount || 0) > 0.005 ? r.amount : summary.difference || ''),
      mode: 'Bank',
      notes: String(txn?.narration || txn?.description || '').trim(),
      cashBankAccountId: txn?.cashBankAccountId,
      sourceBankTransactionId: txn?.id,
      ...(hit.kind === 'vendor' ? { vendorId: String(hit.party.id) } : { customerId: String(hit.party.id) }),
    };
    return (
      <Modal
        onClose={() => setEngineRow(null)}
        title={hit.kind === 'vendor' ? 'Allocate Bills — record payment' : 'Allocate Invoices — record receipt'}
        maxWidthClass="max-w-5xl"
      >
        {hit.kind === 'vendor' ? (
          <RecordDisbursementForm
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            hideMode={true}
            initialData={initialData}
            onSaved={engineSaved(index, hit)}
            onClose={() => setEngineRow(null)}
          />
        ) : (
          <RecordReceiptForm
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            hideMode={true}
            initialData={initialData}
            onSaved={engineSaved(index, hit)}
            onClose={() => setEngineRow(null)}
          />
        )}
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title="Allocate bank transaction" maxWidthClass="max-w-3xl">
      <div className="space-y-4">
        {/* The immutable parent, stated, not editable. */}
        <div className="ui-sunken rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{txn?.date}</span>
            <span className="ui-muted truncate">{String(txn?.narration || txn?.description || '').trim() || '—'}</span>
            {txn?.reference ? <span className="ui-mono ui-muted">{txn.reference}</span> : null}
            <span className={`ui-money ms-auto ${out ? 'text-[rgb(var(--neg-ink))]' : 'text-[rgb(var(--pos-ink))]'}`}>
              {out ? '−' : ''}{formatMoney(summary.bankAmount, currentCompany)}
            </span>
          </div>
        </div>

        {/* The three figures, always on screen. */}
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="ui-caption">Bank amount</dt>
            <dd className="ui-money">{formatMoney(summary.bankAmount, currentCompany)}</dd>
          </div>
          <div>
            <dt className="ui-caption">Allocated</dt>
            <dd className="ui-money">{formatMoney(summary.allocated, currentCompany)}</dd>
          </div>
          <div>
            <dt className="ui-caption">Difference</dt>
            <dd className={`ui-money ${Math.abs(summary.difference) > 0.005 ? 'text-[rgb(var(--neg-ink))]' : 'text-[rgb(var(--pos-ink))]'}`}>
              {formatMoney(summary.difference, currentCompany)}
            </dd>
          </div>
        </dl>

        <div className="space-y-2">
          {rows.map((r, i) => {
            /* A row the engine settled states its voucher and stays put:
               removing it here would not un-post the payment it became. */
            if (r.paymentId) {
              const acc = ledgers.find((l) => String(l.id) === String(r.ledgerId));
              return (
                <div key={i} className="ui-sunken flex items-center gap-3 rounded-lg border p-2.5 text-sm">
                  <FileText size={15} aria-hidden="true" className="ui-muted shrink-0" />
                  <span className="truncate">{acc?.name || 'Party ledger'}</span>
                  <span className="ui-caption">
                    settled via {r.paymentNumber || (r.partyKind === 'customer' ? 'receipt' : 'payment')}
                    {r.partyKind === 'customer' ? ' — any excess stays as customer advance' : ''}
                  </span>
                  <span className="ui-money ms-auto">{formatMoney(Number(r.amount || 0), currentCompany)}</span>
                </div>
              );
            }
            const hit = rowParty(r);
            return (
              <div key={i} className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <label className="ui-label" htmlFor={`alloc-ledger-${i}`}>Ledger</label>
                  <select
                    id={`alloc-ledger-${i}`}
                    className="ui-select w-full"
                    value={r.ledgerId}
                    onChange={(e) => setRow(i, { ledgerId: e.target.value })}
                  >
                    <option value="">Select ledger</option>
                    {ledgers.map((l) => (
                      <option key={l.id} value={String(l.id)}>{l.name}</option>
                    ))}
                  </select>
                </div>
                {hit ? (
                  /* A party ledger settles documents, not a bare journal leg. */
                  <button
                    type="button"
                    className="ui-btn ui-btn-secondary whitespace-nowrap"
                    onClick={() => setEngineRow({ index: i, hit })}
                  >
                    {hit.kind === 'vendor' ? 'Allocate Bills' : 'Allocate Invoices'}
                  </button>
                ) : (
                  <div className="w-32">
                    <label className="ui-label" htmlFor={`alloc-amount-${i}`}>Amount</label>
                    <input
                      id={`alloc-amount-${i}`}
                      type="number"
                      min="0"
                      step="0.01"
                      className="ui-input ui-money w-full"
                      value={r.amount}
                      onChange={(e) => setRow(i, { amount: e.target.value })}
                    />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <label className="ui-label" htmlFor={`alloc-narr-${i}`}>Narration</label>
                  <input
                    id={`alloc-narr-${i}`}
                    type="text"
                    className="ui-input w-full"
                    value={r.narration}
                    onChange={(e) => setRow(i, { narration: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={rows.length === 1}
                  className="ui-icon-btn !h-9 !w-9"
                  aria-label={`Remove allocation row ${i + 1}`}
                >
                  <Trash2 size={15} aria-hidden="true" className="text-[rgb(var(--neg))]" />
                </button>
              </div>
            );
          })}
          <button type="button" onClick={addRow} className="ui-btn ui-btn-secondary ui-btn-sm">
            <Plus size={14} aria-hidden="true" /> Add row
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <p className="ui-caption">
            {check.canPost
              ? 'Fully allocated — posting writes one balanced journal for the plain rows; party rows are already in the books.'
              : 'Post needs the difference at zero; Save keeps a partial split without posting.'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose}>Cancel</button>
            <button type="button" className="ui-btn ui-btn-secondary" disabled={!check.canSave} onClick={() => save({ post: false })}>
              Save
            </button>
            <button type="button" className="ui-btn ui-btn-primary" disabled={!check.canPost} onClick={() => save({ post: true })}>
              Allocate &amp; post
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AllocationDialog;
