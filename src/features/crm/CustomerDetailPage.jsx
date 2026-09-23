import React, { useMemo, useState } from 'react';
import {
  ArrowDownRight, ArrowLeft, ArrowUpRight, Building2, CalendarDays, ChevronDown, CreditCard, Download,
  FileText, Info, Landmark, Mail, MapPin, MoreVertical, Pencil, Phone,
  Plus, Search, UserRound, Users, Wallet,
} from 'lucide-react';

import { formatMoney } from '../../utils/money';
import { getCustomerDisplayName, partyEmail, partyMobile } from '../../utils/contacts';
import { DocDate, DocumentNumber, MoneyValue } from '../../components/docs';
import { EmptyState } from '../../components/ui/Primitives';

const num = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const text = (value) => String(value ?? '').trim();

const addressText = (address) => {
  if (!address) return '';
  if (typeof address === 'string') return address;
  return [address.line1, address.line2, address.city, address.state, address.pincode || address.pin || address.zip]
    .map(text).filter(Boolean).join(', ');
};

const customerCode = (customer) => text(customer?.code || customer?.customerCode) || `CUST-${String(customer?.id || '').padStart(3, '0')}`;

const monthKey = (value) => String(value || '').slice(0, 7);
const deltaPercent = (current, previous) => previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : 0;

function Trend({ value, label = 'vs last month' }) {
  const positive = value >= 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold ${positive ? 'text-emerald-700' : 'text-rose-700'}`}><Icon size={13} />{Math.abs(value).toFixed(1)}% <span className="font-normal ui-subtle">{label}</span></span>;
}

function SummaryMetric({ label, value, hint, trend, icon: Icon, tone }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border p-4 ui-border-c ui-surface-raised">
      <div className={`absolute inset-x-0 top-0 h-1 ${tone}`} />
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-xs font-bold uppercase tracking-wide ui-subtle">{label}</div><div className="mt-2 text-2xl font-bold tracking-tight">{value}</div></div>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[rgb(var(--surface-2))]"><Icon size={18} /></span>
      </div>
      <div className="mt-2 min-h-5">{trend == null ? <span className="text-sm ui-subtle">{hint}</span> : <Trend value={trend} />}</div>
      {trend == null ? null : <div className="mt-1 text-xs ui-subtle">{hint}</div>}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="ui-subtle">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{value || '—'}</dd>
    </div>
  );
}

function DetailSection({ icon: Icon, title, children, open = false }) {
  return (
    <details className="border-t ui-border-c" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
        <Icon size={15} aria-hidden="true" />
        <span className="flex-1">{title}</span>
        <ChevronDown size={15} className="ui-subtle" aria-hidden="true" />
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export default function CustomerDetailPage({ db, currentCompany, customer, onBack, onEdit, onNewTransaction }) {
  const [tab, setTab] = useState('Summary');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [customPeriodOpen, setCustomPeriodOpen] = useState(false);
  const name = getCustomerDisplayName(customer) || 'Customer';
  const customerId = String(customer?.id ?? '');

  const invoices = useMemo(() => (db?.invoices || []).filter((row) =>
    row.companyId === currentCompany?.id && String(row.customerId) === customerId
  ), [db?.invoices, currentCompany?.id, customerId]);
  const receipts = useMemo(() => (db?.payments || []).filter((row) =>
    row.companyId === currentCompany?.id && String(row.customerId) === customerId &&
    ['receipt', 'receipts'].includes(String(row.type || row.voucherType || 'receipt').toLowerCase())
  ), [db?.payments, currentCompany?.id, customerId]);
  const creditNotes = useMemo(() => (db?.creditNotes || []).filter((row) =>
    row.companyId === currentCompany?.id && String(row.customerId) === customerId
  ), [db?.creditNotes, currentCompany?.id, customerId]);

  const transactions = useMemo(() => {
    const invoiceRows = invoices.map((row) => ({
      id: `invoice-${row.id}`, date: row.date, type: 'Sales', number: row.number,
      reference: row.reference || row.poNumber || '—', debit: num(row.total), credit: 0,
      status: row.status || (num(row.paidAmount) >= num(row.total) ? 'Paid' : 'Unpaid'), raw: row,
    }));
    const receiptRows = receipts.map((row) => ({
      id: `receipt-${row.id}`, date: row.date, type: 'Receipt', number: row.number,
      reference: row.reference || row.referenceNo || row.utr || '—', debit: 0,
      credit: num(row.amount || row.total), status: row.status || 'Cleared', raw: row,
    }));
    const creditRows = creditNotes.map((row) => ({
      id: `credit-${row.id}`, date: row.date, type: 'CN', number: row.number,
      reference: row.reference || 'Return', debit: 0, credit: num(row.total || row.amount),
      status: row.status || 'Adjusted', raw: row,
    }));
    const sorted = [...invoiceRows, ...receiptRows, ...creditRows]
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    return sorted.reduce(
      (result, row) => {
        const balance = result.balance + row.debit - row.credit;
        return { balance, rows: [...result.rows, { ...row, balance }] };
      },
      { balance: 0, rows: [] }
    ).rows.reverse();
  }, [invoices, receipts, creditNotes]);

  const totalSales = invoices.filter((r) => !['draft', 'cancelled'].includes(String(r.status || '').toLowerCase()))
    .reduce((sum, row) => sum + num(row.total), 0);
  const totalReceipts = receipts.reduce((sum, row) => sum + num(row.amount || row.total), 0);
  const totalCreditNotes = creditNotes.reduce((sum, row) => sum + num(row.total || row.amount), 0);
  const outstanding = Math.max(0, invoices.reduce((sum, row) => sum + Math.max(0, num(row.total) - num(row.paidAmount)), 0));
  const openInvoices = invoices.filter((row) => num(row.total) - num(row.paidAmount) > 0.0001);
  const settledInvoices = invoices.filter((row) => num(row.total) > 0 && num(row.paidAmount) >= num(row.total));
  const averagePaymentDays = settledInvoices.length
    ? Math.round(settledInvoices.reduce((sum, row) => {
        const issued = new Date(`${row.date || ''}T00:00:00`).getTime();
        const paid = new Date(`${row.paidDate || row.paymentDate || row.updatedAt || row.dueDate || row.date || ''}T00:00:00`).getTime();
        return sum + (Number.isFinite(issued) && Number.isFinite(paid) ? Math.max(0, (paid - issued) / 86_400_000) : 0);
      }, 0) / settledInvoices.length)
    : 0;
  const returnPercent = totalSales > 0 ? (totalCreditNotes / totalSales) * 100 : 0;
  const outstandingPercent = totalSales > 0 ? (outstanding / totalSales) * 100 : 0;
  const averageOutstanding = openInvoices.length ? outstanding / openInvoices.length : 0;
  const monthlyActivity = useMemo(() => {
    const now = new Date();
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: date.toLocaleDateString('en-IN', { month: 'short' }),
        sales: 0,
        receipts: 0,
      };
    });
    const byMonth = new Map(months.map((month) => [month.key, month]));
    invoices.forEach((row) => { const month = byMonth.get(monthKey(row.date)); if (month) month.sales += num(row.total); });
    receipts.forEach((row) => { const month = byMonth.get(monthKey(row.date)); if (month) month.receipts += num(row.amount || row.total); });
    return months;
  }, [invoices, receipts]);
  const currentMonth = monthlyActivity.at(-1) || { sales: 0, receipts: 0 };
  const previousMonth = monthlyActivity.at(-2) || { sales: 0, receipts: 0 };
  const salesMom = deltaPercent(currentMonth.sales, previousMonth.sales);
  const receiptsMom = deltaPercent(currentMonth.receipts, previousMonth.receipts);
  const chartMax = Math.max(1, ...monthlyActivity.flatMap((month) => [month.sales, month.receipts]));
  const collectionRate = totalSales > 0 ? Math.min(100, (totalReceipts / totalSales) * 100) : 0;
  const periodStart = useMemo(() => {
    if (!periodFilter || periodFilter === 'custom') return '';
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    if (periodFilter === 'month') return `${year}-${String(month + 1).padStart(2, '0')}-01`;
    if (periodFilter === 'quarter') return `${year}-${String(Math.floor(month / 3) * 3 + 1).padStart(2, '0')}-01`;
    return `${year}-01-01`;
  }, [periodFilter]);
  const filtered = transactions.filter((row) => {
    const matchesSearch = `${row.type} ${row.number} ${row.reference} ${row.status}`.toLowerCase().includes(query.toLowerCase());
    const matchesType = !typeFilter || row.type === typeFilter;
    const rowDate = String(row.date || '');
    const matchesPreset = !periodStart || rowDate >= periodStart;
    const matchesFrom = periodFilter !== 'custom' || !customFrom || rowDate >= customFrom;
    const matchesTo = periodFilter !== 'custom' || !customTo || rowDate <= customTo;
    return matchesSearch && matchesType && matchesPreset && matchesFrom && matchesTo;
  });
  const displayed = filtered;

  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const billingAddress = addressText(customer?.billingAddress || customer?.address);
  const shippingAddress = addressText(customer?.shippingAddress);
  const addressSource = customer?.billingAddress || customer?.address;
  const addressParts = typeof addressSource === 'string' ? addressSource.split(',').map(text).filter(Boolean) : [];
  const city = text(customer?.city || (typeof addressSource === 'object' && addressSource?.city) || addressParts.at(-3));
  const state = text(customer?.state || (typeof addressSource === 'object' && addressSource?.state) || addressParts.at(-2));
  const cityState = [city, state].filter(Boolean).join(', ');
  const phone = partyMobile(customer);
  const email = partyEmail(customer);
  const tabs = ['Summary', 'Statement'];

  return (
    <div className="space-y-3 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 ui-subtle hover:text-[rgb(var(--fg))]">
          <ArrowLeft size={15} aria-hidden="true" /> Customers
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onNewTransaction} className="ui-btn ui-btn-primary"><Plus size={15} /> New Transaction <ChevronDown size={14} /></button>
          <button type="button" onClick={onEdit} className="ui-btn ui-btn-secondary"><Pencil size={15} /> Edit</button>
          <button type="button" className="ui-btn ui-btn-secondary px-2.5" aria-label="More customer actions"><MoreVertical size={16} /></button>
        </div>
      </div>

      <section className="ui-card p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-emerald-100 text-lg font-bold text-emerald-800">{initials || 'CU'}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{name}</h1>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Active</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm ui-subtle">
              <span>{customerCode(customer)}</span><span>{customer?.customerType || 'Regular Customer'}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-sm ui-subtle">
              {cityState ? <span className="inline-flex items-center gap-1.5"><MapPin size={15} />{cityState}</span> : null}
              {phone ? <span className="inline-flex items-center gap-1.5"><Phone size={15} />{phone}</span> : null}
              {email ? <span className="inline-flex items-center gap-1.5"><Mail size={15} />{email}</span> : null}
              {customer?.gstin ? <span className="font-medium">GSTIN: {customer.gstin}</span> : null}
            </div>
          </div>
          <div className="grid min-w-[18rem] grid-cols-2 gap-2">
            <div className="rounded-xl bg-orange-50 px-4 py-3"><div className="text-[10px] font-semibold uppercase text-orange-700">Credit limit</div><div className="mt-1 font-bold">{formatMoney(num(customer?.creditLimit), currentCompany)}</div></div>
            <div className="rounded-xl bg-slate-50 px-4 py-3"><div className="text-[10px] font-semibold uppercase ui-subtle">Payment terms</div><div className="mt-1 font-bold">{num(customer?.paymentTermDays || customer?.creditDays)} Days</div></div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <section className="ui-card min-w-0 overflow-hidden">
          <div className="flex overflow-x-auto border-b px-3 ui-border-c" role="tablist" aria-label="Customer information">
            {tabs.map((item) => <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${tab === item ? 'border-[rgb(var(--fg))] text-[rgb(var(--fg))]' : 'border-transparent ui-subtle'}`}>{item}</button>)}
          </div>

          {tab === 'Summary' ? (
            <div className="space-y-5 bg-[rgb(var(--surface-2))] p-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><h2 className="text-lg font-bold">Business overview</h2><p className="mt-1 text-sm ui-subtle">Sales, collections, returns and payment behaviour for this customer.</p></div>
                <div className="rounded-full border bg-[rgb(var(--surface))] px-3 py-1.5 text-xs font-semibold ui-border-c">Updated from live transactions</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <SummaryMetric label="Total sold" value={formatMoney(totalSales, currentCompany)} hint={`${invoices.length} sales invoice${invoices.length === 1 ? '' : 's'}`} trend={salesMom} icon={FileText} tone="bg-blue-500" />
                <SummaryMetric label="Amount received" value={formatMoney(totalReceipts, currentCompany)} hint={`${collectionRate.toFixed(1)}% of sales collected`} trend={receiptsMom} icon={CreditCard} tone="bg-emerald-500" />
                <SummaryMetric label="Average payment time" value={`${averagePaymentDays} days`} hint={`${settledInvoices.length} fully settled invoice${settledInvoices.length === 1 ? '' : 's'}`} icon={CalendarDays} tone="bg-violet-500" />
                <SummaryMetric label="Credit notes" value={formatMoney(totalCreditNotes, currentCompany)} hint={`${returnPercent.toFixed(1)}% return against sales`} icon={FileText} tone="bg-amber-500" />
                <SummaryMetric label="Average outstanding" value={formatMoney(averageOutstanding, currentCompany)} hint={`${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}`} icon={Wallet} tone="bg-orange-500" />
                <SummaryMetric label="Outstanding ratio" value={`${outstandingPercent.toFixed(1)}%`} hint={`${formatMoney(outstanding, currentCompany)} currently due`} icon={Wallet} tone="bg-rose-500" />
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(16rem,1fr)]">
                <section className="rounded-2xl border bg-[rgb(var(--surface))] p-5 ui-border-c">
                  <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Sales and collections</h3><p className="mt-1 text-sm ui-subtle">Six-month movement</p></div><div className="flex gap-4 text-xs font-medium"><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-blue-500" />Sales</span><span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Receipts</span></div></div>
                  <div className="mt-6 grid h-52 grid-cols-6 items-end gap-3 border-b ui-border-c">
                    {monthlyActivity.map((month) => (
                      <div key={month.key} className="flex h-full min-w-0 flex-col justify-end">
                        <div className="flex h-[10rem] items-end justify-center gap-1.5">
                          <div title={`Sales: ${formatMoney(month.sales, currentCompany)}`} className="w-3 rounded-t bg-blue-500/85 transition-all" style={{ height: `${Math.max(month.sales ? 6 : 1, (month.sales / chartMax) * 100)}%` }} />
                          <div title={`Receipts: ${formatMoney(month.receipts, currentCompany)}`} className="w-3 rounded-t bg-emerald-500/85 transition-all" style={{ height: `${Math.max(month.receipts ? 6 : 1, (month.receipts / chartMax) * 100)}%` }} />
                        </div>
                        <div className="mt-3 text-center text-xs font-medium ui-subtle">{month.label}</div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border bg-[rgb(var(--surface))] p-5 ui-border-c">
                  <div><h3 className="font-bold">Collection health</h3><p className="mt-1 text-sm ui-subtle">Share of sales collected</p></div>
                  <div className="mt-5 flex justify-center">
                    <div className="grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(rgb(var(--pos)) ${collectionRate}%, rgb(var(--surface-3)) 0)` }}>
                      <div className="grid h-24 w-24 place-items-center rounded-full bg-[rgb(var(--surface))] text-center"><div><div className="text-2xl font-bold">{collectionRate.toFixed(0)}%</div><div className="text-xs ui-subtle">collected</div></div></div>
                    </div>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2 text-sm"><div className="rounded-xl bg-emerald-50 p-3"><div className="text-xs text-emerald-700">Received</div><div className="mt-1 font-bold text-emerald-900">{formatMoney(totalReceipts, currentCompany)}</div></div><div className="rounded-xl bg-orange-50 p-3"><div className="text-xs text-orange-700">Outstanding</div><div className="mt-1 font-bold text-orange-900">{formatMoney(outstanding, currentCompany)}</div></div></div>
                </section>
              </div>
            </div>
          ) : tab === 'Statement' ? (
            <>
              <div className="grid grid-cols-1 items-center gap-2 border-b p-3 ui-border-c md:grid-cols-[minmax(15rem,2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_auto]">
                <label className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 ui-subtle" /><input value={query} onChange={(e) => setQuery(e.target.value)} className="ui-input w-full pl-9 text-sm" placeholder="Search transactions…" aria-label="Search customer transactions" /></label>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="ui-input w-full text-sm" aria-label="Transaction type"><option value="">All transactions</option><option value="Sales">Sales</option><option value="CN">Credit notes</option><option value="Receipt">Receipts</option></select>
                <div className="relative">
                  <select
                    value={periodFilter}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPeriodFilter(value);
                      setCustomPeriodOpen(value === 'custom');
                    }}
                    onClick={() => { if (periodFilter === 'custom') setCustomPeriodOpen(true); }}
                    className="ui-input w-full text-sm"
                    aria-label="Transaction period"
                  >
                    <option value="">All periods</option><option value="month">This month</option><option value="quarter">This quarter</option><option value="year">This year</option><option value="custom">{customFrom || customTo ? `${customFrom || 'Start'} – ${customTo || 'Today'}` : 'Custom period'}</option>
                  </select>
                  {customPeriodOpen ? (
                    <div className="absolute right-0 top-[calc(100%+0.4rem)] z-30 w-72 rounded-xl border bg-[rgb(var(--surface))] p-3 shadow-xl ui-border-c" role="dialog" aria-label="Select custom period">
                      <div className="mb-3 text-sm font-bold">Custom period</div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs font-semibold ui-subtle">From<input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="ui-input mt-1 w-full text-sm" aria-label="Custom period from" /></label>
                        <label className="text-xs font-semibold ui-subtle">To<input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} min={customFrom || undefined} className="ui-input mt-1 w-full text-sm" aria-label="Custom period to" /></label>
                      </div>
                      <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => setCustomPeriodOpen(false)} className="ui-btn ui-btn-secondary px-3">Cancel</button><button type="button" onClick={() => setCustomPeriodOpen(false)} className="ui-btn ui-btn-primary px-3">Apply</button></div>
                    </div>
                  ) : null}
                </div>
                <button type="button" className="ui-btn ui-btn-secondary px-3"><Download size={15} /> Export</button>
              </div>
              {displayed.length ? (
                <div className="overflow-x-auto ui-table-scroll">
                  <table className="ui-table w-full text-sm">
                    <thead><tr><th>Date</th><th>Type</th><th>Voucher No.</th><th className="ui-num">Debit</th><th className="ui-num">Credit</th><th className="ui-num">Balance</th></tr></thead>
                    <tbody className="ui-rows">{displayed.map((row) => <tr key={row.id}><td className="ui-col-date"><DocDate value={row.date || '—'} /></td><td className="font-semibold">{row.type}</td><td className="ui-col-id"><DocumentNumber value={row.number || '—'} /></td><td className="ui-col-amount">{row.debit ? <MoneyValue value={row.debit} company={currentCompany} /> : '—'}</td><td className="ui-col-amount">{row.credit ? <MoneyValue value={row.credit} company={currentCompany} /> : '—'}</td><td className="ui-col-amount"><MoneyValue value={row.balance} company={currentCompany} /></td></tr>)}</tbody>
                  </table>
                </div>
              ) : <EmptyState icon={FileText} title="No transactions found" description={query ? 'Try a different search.' : 'Customer activity will appear here.'} />}
            </>
          ) : null}
        </section>

        <aside className="ui-card h-fit overflow-hidden">
          <DetailSection title="Customer details" icon={UserRound} open><dl><InfoRow label="Customer name" value={name} /><InfoRow label="Customer code" value={customerCode(customer)} /><InfoRow label="Customer type" value={customer?.customerType || 'Regular Customer'} /><InfoRow label="GSTIN" value={customer?.gstin} /><InfoRow label="PAN" value={customer?.pan} /><InfoRow label="Phone" value={phone} /><InfoRow label="Email" value={email} /><InfoRow label="Billing address" value={billingAddress} /><InfoRow label="Shipping address" value={shippingAddress} /></dl></DetailSection>
          <DetailSection title="Financial information" icon={Wallet}><dl><InfoRow label="Credit limit" value={formatMoney(num(customer?.creditLimit), currentCompany)} /><InfoRow label="Payment terms" value={`${num(customer?.paymentTermDays || customer?.creditDays)} Days`} /><InfoRow label="Outstanding" value={formatMoney(outstanding, currentCompany)} /></dl></DetailSection>
          <DetailSection title="Statutory details" icon={Building2}><dl><InfoRow label="GST registration" value={customer?.gstRegistration} /><InfoRow label="GSTIN" value={customer?.gstin} /><InfoRow label="PAN" value={customer?.pan} /></dl></DetailSection>
          <DetailSection title="Bank details" icon={Landmark}><p className="text-sm ui-subtle">Bank details added to the customer master appear here.</p></DetailSection>
          <DetailSection title="Contact persons" icon={Users}><p className="text-sm ui-subtle">{Array.isArray(customer?.contacts) ? `${customer.contacts.length} contact person${customer.contacts.length === 1 ? '' : 's'}` : 'No contact persons added.'}</p></DetailSection>
          <DetailSection title="More information" icon={Info}><p className="text-sm ui-subtle">{customer?.notes || customer?.description || 'No additional information.'}</p></DetailSection>
        </aside>
      </div>
    </div>
  );
}
