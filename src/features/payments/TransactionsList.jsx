import React, { useMemo, useState } from 'react';
import { notify } from '../../components/ui/notify';

import RecordPaymentForm from './RecordPaymentForm';
import { formatMoney, round2 } from '../../utils/money';
import { TableTotals } from '../../components/ui/Primitives';
import { downloadCsv } from '../../utils/csv';
import { ListToolbar, useListSearch } from '../../components/ListToolbar';
import { usePeriodFilter } from '../../components/ListControls';
import { StatCards, ListSearch, FiltersButton, MoreButton, ExportButton, Pagination, usePaged } from '../../components/list/ListPageParts';
import { PageHeader } from '../../components/ui/Primitives';
import { CreditCard, FileText, Landmark, Receipt, Undo2 } from 'lucide-react';
import { useColumnFilters, ColumnHeader } from '../../components/ColumnFilters';
import { Download } from 'lucide-react';

const safeArray = (v) => (Array.isArray(v) ? v : []);

const getVoucherLabel = (voucherType) => {
  if (voucherType === 'invoice') return 'Invoice';
  if (voucherType === 'bill') return 'Bill';
  if (voucherType === 'expense') return 'Expense';
  if (voucherType === 'receipt') return 'Receipt';
  if (voucherType === 'payment') return 'Payment';
  return String(voucherType || 'Document');
};

const resolveVoucher = ({ db, companyId, voucherType, voucherId }) => {
  const id = Number(voucherId);
  if (!Number.isFinite(id)) return null;

  if (voucherType === 'invoice') return safeArray(db.invoices).find((d) => d.companyId === companyId && Number(d.id) === id) || null;
  if (voucherType === 'bill') return safeArray(db.bills).find((d) => d.companyId === companyId && Number(d.id) === id) || null;
  if (voucherType === 'expense') return safeArray(db.expenses).find((d) => d.companyId === companyId && Number(d.id) === id) || null;
  return null;
};

const getBalanceForVoucher = (voucher) => {
  const total = Number(voucher?.total ?? 0);
  const paid = Number(voucher?.paidAmount ?? 0);
  const balance = total - paid;
  return Number.isFinite(balance) ? Math.max(0, balance) : 0;
};

const canRecordAgainstVoucher = ({ voucherType, voucher }) => {
  if (!voucher) return false;

  const rawStatus = String(voucher?.status || '').trim();
  if (rawStatus === 'Draft') return false;
  if (voucherType === 'invoice' && rawStatus === 'Cancelled') return false;

  return getBalanceForVoucher(voucher) > 0.0001;
};

const SelectAndRecordPrompt = ({ db, setDb, currentCompany, openModal, kind, onClose }) => {
  // kind: 'receipt' | 'payment'
  const companyId = currentCompany.id;

  const [voucherType, setVoucherType] = useState(kind === 'receipt' ? 'invoice' : 'bill');
  const [voucherId, setVoucherId] = useState('');

  const invoices = useMemo(() => safeArray(db.invoices).filter((i) => i.companyId === companyId), [db, companyId]);
  const bills = useMemo(() => safeArray(db.bills).filter((b) => b.companyId === companyId), [db, companyId]);
  const expenses = useMemo(() => safeArray(db.expenses).filter((e) => e.companyId === companyId), [db, companyId]);

  const list = voucherType === 'invoice' ? invoices : voucherType === 'bill' ? bills : expenses;

  const eligibleDocs = useMemo(() => {
    return list.filter((d) => canRecordAgainstVoucher({ voucherType, voucher: d }));
  }, [list, voucherType]);

  const selected = useMemo(() => {
    const id = Number(voucherId);
    if (!Number.isFinite(id)) return null;
    return list.find((d) => Number(d.id) === id) || null;
  }, [list, voucherId]);

  const openRecord = () => {
    if (!selected) return;

    const titlePrefix = voucherType === 'invoice' ? 'Record Receipt' : 'Record Payment';
    openModal(
      <RecordPaymentForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        voucherType={voucherType}
        voucher={selected}
        onClose={() => openModal(null)}
      />,
      { title: `${titlePrefix} ${selected?.number || ''}`.trim(), maxWidthClass: 'max-w-3xl' }
    );
  };

  const title = kind === 'receipt' ? 'Record Receipt' : 'Record Payment';

  return (
    <div className="space-y-4">
      {kind === 'payment' ? (
        <div>
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            value={voucherType}
            onChange={(e) => {
              setVoucherType(e.target.value);
              setVoucherId('');
            }}
            className="ui-select w-full px-3 py-2"
          >
            <option value="bill">Bill</option>
            <option value="expense">Expense</option>
          </select>
        </div>
      ) : null}

      <div>
        <label className="block text-sm font-medium mb-1">{getVoucherLabel(voucherType)} #</label>
        <select
          value={voucherId}
          onChange={(e) => setVoucherId(e.target.value)}
          className="ui-select w-full px-3 py-2"
        >
          <option value="">Select</option>
          {eligibleDocs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.number}
            </option>
          ))}
        </select>
        {eligibleDocs.length === 0 ? (
          <div className="text-sm ui-muted mt-2">No eligible documents found (needs balance and not Draft).</div>
        ) : null}
      </div>

      {selected ? (
        <div className="grid grid-cols-3 gap-3 text-sm ui-sunken border rounded-lg p-3">
          <div>
            <div className="ui-muted">Total</div>
            <div className="font-semibold">{formatMoney(Number(selected.total ?? 0), currentCompany)}</div>
          </div>
          <div>
            <div className="ui-muted">Paid</div>
            <div className="font-semibold">{formatMoney(Number(selected.paidAmount ?? 0), currentCompany)}</div>
          </div>
          <div>
            <div className="ui-muted">Balance</div>
            <div className="font-semibold">{formatMoney(getBalanceForVoucher(selected), currentCompany)}</div>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => onClose?.()} className="px-4 py-2 border rounded-lg ui-hover-sunken">
          Cancel
        </button>
        <button
          type="button"
          onClick={openRecord}
          disabled={!selected || !canRecordAgainstVoucher({ voucherType, voucher: selected })}
          className={`px-4 py-2 rounded-lg ${ !selected || !canRecordAgainstVoucher({ voucherType, voucher: selected })
              ? 'ui-sunken ui-muted cursor-not-allowed'
              : 'ui-btn ui-btn-primary '
          }`}
        >
          {title}
        </button>
      </div>
    </div>
  );
};

const TransactionView = ({ title, payload }) => {
  const shareText = useMemo(() => {
    const lines = [
      title,
      payload?.documentNumber ? `Document: ${payload.documentNumber}` : null,
      payload?.partyName ? `Party: ${payload.partyName}` : null,
      payload?.date ? `Date: ${payload.date}` : null,
      payload?.mode ? `Mode: ${payload.mode}` : null,
      payload?.reference ? `Reference: ${payload.reference}` : null,
      payload?.amount !== undefined && payload?.amount !== null ? `Amount: ${String(payload.amount)}` : null,
    ].filter(Boolean);
    return lines.join('\n');
  }, [payload, title]);

  const doPrint = () => {
    try {
      const prevTitle = document.title;
      if (payload?.documentNumber) document.title = String(payload.documentNumber);

      document.body.classList.add('print-mode');
      const cleanup = () => {
        document.body.classList.remove('print-mode');
        document.title = prevTitle;
      };
      window.addEventListener('afterprint', cleanup, { once: true });
      window.print();
      window.setTimeout(cleanup, 1200);
    } catch {
      // ignore
    }
  };

  const doShare = async () => {
    try {
      if (navigator?.share) {
        await navigator.share({ title, text: shareText });
        return;
      }
    } catch {
      // fallthrough to copy
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        notify.success('Copied to clipboard');
        return;
      }
    } catch {
      // ignore
    }

    notify.error(shareText);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm ui-muted">{title}</div>
          <div className="font-semibold">{payload?.documentNumber || '-'}</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={doPrint}
            className="px-3 py-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            Print
          </button>
          <button
            type="button"
            onClick={doShare}
            className="px-3 py-2 rounded-lg ui-btn ui-btn-primary "
          >
            Share
          </button>
        </div>
      </div>

      <div className="printable ui-surface border rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="ui-muted">Party</div>
            <div className="font-medium">{payload?.partyName || '-'}</div>
          </div>
          <div>
            <div className="ui-muted">Date</div>
            <div className="font-medium">{payload?.date || '-'}</div>
          </div>
          <div>
            <div className="ui-muted">Mode</div>
            <div className="font-medium">{payload?.mode || '-'}</div>
          </div>
          <div>
            <div className="ui-muted">Reference</div>
            <div className="font-medium">{payload?.reference || '-'}</div>
          </div>
          <div>
            <div className="ui-muted">Type</div>
            <div className="font-medium">{payload?.typeLabel || '-'}</div>
          </div>
          <div>
            <div className="ui-muted">Amount</div>
            <div className="font-semibold">{formatMoney(payload?.amount || 0, payload?.currentCompany)}</div>
          </div>
        </div>

        {payload?.notes ? (
          <div className="text-sm">
            <div className="ui-muted">Notes</div>
            <div className="whitespace-pre-wrap">{payload.notes}</div>
          </div>
        ) : null}

        {Array.isArray(payload?.allocations) && payload.allocations.length ? (
          <div className="text-sm">
            <div className="ui-muted mb-2">Allocations</div>
            <div className="border rounded-lg overflow-hidden">
              <table className="ui-table w-full">
                <thead className="ui-sunken border-b">
                  <tr>
                    <th className="ui-th">Document #</th>
                    <th className="ui-th ui-num">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payload.allocations.map((a, idx) => (
                    <tr key={idx}>
                      <td className="ui-col-id px-3 py-2">
                        {a?.voucherType ? `${getVoucherLabel(a.voucherType)}: ` : ''}
                        {a?.documentNumber || a?.voucherId || '-'}
                      </td>
                      <td className="ui-col-amount px-3 py-2 text-right font-semibold">
                        {formatMoney(Number(a?.amount ?? 0), payload?.currentCompany)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {Number(payload?.advanceAmount ?? 0) > 0 ? (
              <div className="mt-3 flex items-center justify-between">
                <div className="ui-muted">Advance</div>
                <div className="font-semibold">{formatMoney(Number(payload.advanceAmount ?? 0), payload?.currentCompany)}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const TransactionsTable = ({ title, rows, currentCompany, rightActions, onView }) => {
  const period = usePeriodFilter();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const search = useListSearch(rows, ['documentNumber', 'partyName', 'mode', 'reference', 'typeLabel', 'date']);
  const colFilters = useColumnFilters();
  const shown = colFilters.applyFilters(search.filtered.filter((r) => period.inRange(r?.date)), {
    date: (r) => r.date,
    typeLabel: (r) => r.typeLabel,
    documentNumber: (r) => r.documentNumber,
    partyName: (r) => r.partyName,
    mode: (r) => r.mode,
    reference: (r) => r.reference,
    amount: (r) => r.amount,
  });

  const exportRows = () => {
    if (!shown.length) {
      notify.error('Nothing to export.');
      return;
    }
    downloadCsv({
      fileName: `${title}_${currentCompany?.name || 'company'}`,
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'typeLabel', label: 'Type' },
        { key: 'documentNumber', label: 'Document #' },
        { key: 'partyName', label: 'Party' },
        { key: 'mode', label: 'Mode' },
        { key: 'reference', label: 'Reference' },
        { key: 'amount', label: 'Amount', value: (r) => round2(Number(r.amount || 0)) },
      ],
      rows: shown,
    });
    notify.success(`${shown.length} ${title.toLowerCase()} exported.`);
  };

  const { pageCount, safePage, pageRows } = usePaged(shown, perPage, page);

  /**
   * Five figures, and every one of them countable from the rows themselves.
   *
   * The reference proposed "Employee payments" and "Refunds"; neither is
   * modelled — a payment has a party and a mode, not an employee flag — and a
   * card that can only ever read zero teaches people the row above it is
   * guesswork too. These are the splits the data actually supports.
   */
  /*
   * Over `shown`, the rows actually on screen — not `rows`, the whole book.
   *
   * Reading the unfiltered set meant searching for one party left five figures
   * describing every receipt ever taken, sitting directly above a table showing
   * three. Two different sets of data on one screen with nothing saying so.
   */
  const headline = useMemo(() => {
    const sum = (rs) => rs.reduce((t, r) => t + Number(r.amount || 0), 0);
    const month = new Date().toISOString().slice(0, 7);
    const byMode = new Map();
    for (const r of shown) byMode.set(r.mode || '—', (byMode.get(r.mode || '—') || 0) + Number(r.amount || 0));
    const top = [...byMode.entries()].sort((a2, b2) => b2[1] - a2[1])[0];
    return {
      count: shown.length,
      total: sum(shown),
      thisMonth: sum(shown.filter((r) => String(r.date || '').slice(0, 7) === month)),
      allocated: sum(shown.filter((r) => (r.allocations || []).length > 0)),
      unallocated: sum(shown.filter((r) => Number(r.advanceAmount || 0) > 0)),
      topMode: top ? { name: top[0], value: top[1] } : null,
    };
  }, [shown]);

  return (
    <div className="space-y-4">
      <PageHeader
        title={title}
        description={`View and manage all ${title.toLowerCase()}`}
        actions={
          <>
            <ListSearch
              value={search.query}
              onChange={(v) => {
                search.setQuery(v);
                setPage(1);
              }}
              placeholder={`Search ${title.toLowerCase()}…`}
              label={`Search ${title.toLowerCase()}`}
            />
            <FiltersButton
              period={period.period}
              onPeriodChange={(k) => {
                period.setPeriod(k);
                setPage(1);
              }}
              dateFrom={period.dateFrom}
              dateTo={period.dateTo}
              onDateFromChange={period.setDateFrom}
              onDateToChange={period.setDateTo}
              onClear={() => {
                search.setQuery('');
                period.clear();
                colFilters.clearAll();
                setPage(1);
              }}
              activeCount={(search.query.trim() ? 1 : 0) + (period.period !== 'all' ? 1 : 0) + Object.keys(colFilters.filters || {}).length}
            />
            <MoreButton
              items={[{ key: 'export', label: 'Export as CSV', Icon: Download }]}
              onSelect={(k) => {
                if (k === 'export') exportRows();
              }}
            />
            {rightActions ? <>{rightActions}</> : null}
          </>
        }
      />

      <StatCards
        company={currentCompany}
        cards={[
          { label: `Total ${title.toLowerCase()}`, value: headline.count, count: true, tone: 'info', Icon: FileText },
          { label: 'Total value', value: headline.total, tone: 'party', Icon: Receipt },
          { label: 'This month', value: headline.thisMonth, tone: 'pos', Icon: CreditCard },
          { label: 'Against documents', value: headline.allocated, tone: 'info', Icon: Landmark, hint: 'Allocated to invoices or bills' },
          headline.topMode
            ? { label: `Most used — ${headline.topMode.name}`, value: headline.topMode.value, tone: 'warn', Icon: Undo2, hint: 'By value' }
            : null,
        ]}
      />


      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full ui-table-sticky">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Date" col="date" state={colFilters} className="ui-th" />
              <ColumnHeader label="Type" col="typeLabel" state={colFilters} className="ui-th" />
              <ColumnHeader label="Document #" col="documentNumber" state={colFilters} className="ui-th" />
              <ColumnHeader label="Party" col="partyName" state={colFilters} className="ui-th" />
              <ColumnHeader label="Mode" col="mode" state={colFilters} className="ui-th" />
              <ColumnHeader label="Reference" col="reference" state={colFilters} className="ui-th" />
              <ColumnHeader label="Amount" col="amount" state={colFilters} className="ui-th ui-num" align="right" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center ui-muted">
                  No transactions found
                </td>
              </tr>
            ) : (
              pageRows.map((r) => (
                <tr
                  key={r.id}
                  className={onView ? 'ui-hover-sunken cursor-pointer' : 'ui-hover-sunken'}
                  onClick={() => {
                    if (typeof onView === 'function') onView(r);
                  }}
                >
                  <td className="ui-col-date px-4 py-2.5">{r.date || '-'}</td>
                  <td className="ui-col-meta px-4 py-2.5">{r.typeLabel}</td>
                  <td className="ui-col-id px-4 py-2.5 font-medium">{r.documentNumber || '-'}</td>
                  <td className="ui-col-entity px-4 py-2.5">{r.partyName || '-'}</td>
                  <td className="ui-col-meta px-4 py-2.5">{r.mode || '-'}</td>
                  <td className="ui-col-meta px-4 py-2.5">{r.reference || '-'}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{formatMoney(r.amount || 0, currentCompany)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <TableTotals
          count={shown.length}
          totalCount={(rows || []).length}
          noun="transactions"
          figures={[{ label: 'Value', value: formatMoney(shown.reduce((t, r) => t + Number(r.amount || 0), 0), currentCompany) }]}
        />

        <Pagination
          total={shown.length}
          page={safePage}
          perPage={perPage}
          pageCount={pageCount}
          onPage={setPage}
          onPerPage={(n) => {
            setPerPage(n);
            setPage(1);
          }}
          noun={title.toLowerCase()}
        />
      </div>
    </div>
  );
};

export const ReceiptsTransactionsList = ({ db, setDb, currentCompany, openModal, onRecordReceipt }) => {
  const rows = useMemo(() => {
    const companyId = currentCompany.id;
    const payments = safeArray(db.payments).filter((p) => p.companyId === companyId);

    return payments
      .filter((p) => String(p.direction || '').toUpperCase() === 'IN')
      .map((p) => {
        const isReceipt = String(p.voucherType || '') === 'receipt';
        const voucher = isReceipt ? null : resolveVoucher({ db, companyId, voucherType: p.voucherType, voucherId: p.voucherId });
        const partyName = isReceipt ? p.customerName || '' : voucher?.customerName || voucher?.partyName || '';

        return {
          id: p.id,
          date: p.date,
          amount: Number(p.amount ?? 0),
          mode: p.mode,
          reference: p.reference,
          notes: p.notes,
          typeLabel: getVoucherLabel(p.voucherType),
          documentNumber: isReceipt ? p.receiptNo || '' : voucher?.number || '',
          partyName,
          allocations: isReceipt ? safeArray(p.allocations) : null,
          advanceAmount: isReceipt ? Number(p.advanceAmount ?? 0) : 0,
        };
      })
      .sort((a, b) => {
        const da = String(a.date || '');
        const dbb = String(b.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b.id) - Number(a.id);
      });
  }, [db, currentCompany.id]);

  return (
    <TransactionsTable
      title="Receipts"
      rows={rows}
      currentCompany={currentCompany}
      onView={(row) => {
        if (typeof openModal !== 'function') return;
        const title = row?.documentNumber ? `Receipt ${row.documentNumber}` : 'Receipt';
        openModal(<TransactionView title={title} payload={{ ...row, currentCompany }} />, {
          title,
          maxWidthClass: 'max-w-3xl',
        });
      }}
      rightActions={
        <button
          type="button"
          onClick={() => {
            if (typeof onRecordReceipt === 'function') {
              onRecordReceipt();
              return;
            }

            if (typeof openModal !== 'function' || typeof setDb !== 'function') return;
            openModal(
              <SelectAndRecordPrompt
                db={db}
                setDb={setDb}
                currentCompany={currentCompany}
                openModal={openModal}
                kind="receipt"
                onClose={() => openModal(null)}
              />,
              { title: 'Record Receipt', maxWidthClass: 'max-w-md' }
            );
          }}
          className="px-4 py-2 rounded-lg ui-btn ui-btn-primary "
        >
          Record Receipt
        </button>
      }
    />
  );
};

export const PaymentsTransactionsList = ({ db, setDb, currentCompany, openModal, onRecordPayment }) => {
  const rows = useMemo(() => {
    const companyId = currentCompany.id;
    const payments = safeArray(db.payments).filter((p) => p.companyId === companyId);

    return payments
      .filter((p) => String(p.direction || '').toUpperCase() === 'OUT' && p.voucherType !== 'invoice')
      .map((p) => {
        const isGroupedPayment = String(p.voucherType || '') === 'payment';
        const voucher = isGroupedPayment ? null : resolveVoucher({ db, companyId, voucherType: p.voucherType, voucherId: p.voucherId });
        const partyName = isGroupedPayment ? p.vendorName || '' : voucher?.vendorName || voucher?.partyName || '';
        return {
          id: p.id,
          date: p.date,
          amount: Number(p.amount ?? 0),
          mode: p.mode,
          reference: p.reference,
          notes: p.notes,
          typeLabel: getVoucherLabel(p.voucherType),
          documentNumber: isGroupedPayment ? p.paymentNo || '' : voucher?.number || '',
          partyName,
          allocations: isGroupedPayment ? safeArray(p.allocations) : null,
          advanceAmount: isGroupedPayment ? Number(p.advanceAmount ?? 0) : 0,
        };
      })
      .sort((a, b) => {
        const da = String(a.date || '');
        const dbb = String(b.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b.id) - Number(a.id);
      });
  }, [db, currentCompany.id]);

  return (
    <TransactionsTable
      title="Payments"
      rows={rows}
      currentCompany={currentCompany}
      onView={(row) => {
        if (typeof openModal !== 'function') return;
        const title = row?.documentNumber ? `Payment ${row.documentNumber}` : 'Payment';
        openModal(<TransactionView title={title} payload={{ ...row, currentCompany }} />, {
          title,
          maxWidthClass: 'max-w-3xl',
        });
      }}
      rightActions={
        <button
          type="button"
          onClick={() => {
            if (typeof onRecordPayment === 'function') {
              onRecordPayment();
              return;
            }

            if (typeof openModal !== 'function' || typeof setDb !== 'function') return;
            openModal(
              <SelectAndRecordPrompt
                db={db}
                setDb={setDb}
                currentCompany={currentCompany}
                openModal={openModal}
                kind="payment"
                onClose={() => openModal(null)}
              />,
              { title: 'Record Payment', maxWidthClass: 'max-w-md' }
            );
          }}
          className="px-4 py-2 rounded-lg ui-btn ui-btn-primary "
        >
          Record Payment
        </button>
      }
    />
  );
};
