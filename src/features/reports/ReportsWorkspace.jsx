import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileSpreadsheet,
  Landmark,
  PackageSearch,
  ReceiptIndianRupee,
  Search,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from 'lucide-react';

import { EntityMark } from '../../components/ui/Primitives';
import { formatMoney } from '../../utils/money';

const report = (name, route = '', feature = '') => ({ name, route, feature });

const BUCKETS = {
  sales: {
    title: 'Sales', icon: ReceiptIndianRupee, source: 'sales',
    reports: [
      report('Sales Register', 'salesReports'), report('Sales Invoice Register'),
      report('Sales Return/Credit Note Register'), report('Customer-wise Sales'), report('Item-wise Sales'),
      report('Category-wise Sales'), report('Branch-wise Sales', '', 'branches'),
      report('Salesperson-wise Sales', 'salesBySalesman', 'salesmen'), report('Monthly Sales Summary'),
      report('GST-wise Sales'), report('HSN/SAC-wise Sales'),
    ],
  },
  purchases: {
    title: 'Purchases', icon: WalletCards, source: 'purchases',
    reports: [
      report('Purchase Register'), report('Purchase Bill Register'), report('Purchase Return/Debit Note Register'),
      report('Vendor-wise Purchase'), report('Item-wise Purchase'), report('Category-wise Purchase'),
      report('Branch-wise Purchase', '', 'branches'), report('Monthly Purchase Summary'),
      report('GST-wise Purchase'), report('HSN/SAC-wise Purchase'),
    ],
  },
  expenses: {
    title: 'Expenses', icon: CircleDollarSign, source: 'expenses',
    reports: [
      report('Expense Register'), report('Expense Ledger-wise'), report('Expense Category-wise'),
      report('Vendor-wise Expense'), report('Branch-wise Expense', '', 'branches'),
      report('Cost Centre-wise Expense', '', 'costCenters'), report('Monthly Expense Analysis'),
    ],
  },
  receipts: {
    title: 'Receipts', icon: ReceiptIndianRupee, source: 'receipts',
    reports: [
      report('Receipt Register'), report('Customer/Ledger-wise Receipts'), report('Bank-wise Receipts'),
      report('Cash Receipts'), report('Advance Receipts'), report('Invoice-adjusted Receipts'),
      report('TDS-deducted Receipts'),
    ],
  },
  payments: {
    title: 'Payments', icon: WalletCards, source: 'payments',
    reports: [
      report('Payment Register'), report('Vendor/Ledger-wise Payments'), report('Bank-wise Payments'),
      report('Cash Payments'), report('Advance Payments'), report('Bill-adjusted Payments'), report('TDS Payments'),
    ],
  },
  ledgers: {
    title: 'Ledgers', icon: BookOpen, source: 'ledgers',
    reports: [
      report('Ledger Statement'), report('Ledger Summary'), report('Ledger Group Summary'),
      report('Group-wise Ledger Report'), report('Day Book'), report('General Ledger', 'ledgerTrialBalance'),
      report('Ledger Monthly Summary'),
    ],
  },
  receivables: {
    title: 'Receivables', icon: UsersRound, source: 'sales',
    reports: [
      report('Customer Outstanding'), report('Invoice-wise Outstanding'), report('Customer Aging'),
      report('Overdue Receivables'), report('Advance from Customers'),
    ],
  },
  payables: {
    title: 'Payables', icon: UsersRound, source: 'purchases',
    reports: [
      report('Vendor Outstanding'), report('Bill-wise Outstanding'), report('Vendor Aging'),
      report('Overdue Payables'), report('Advances to Vendors'),
    ],
  },
  journals: {
    title: 'Journal & Voucher Reports', icon: FileSpreadsheet, source: 'journals',
    reports: [report('Journal Register'), report('Voucher Register'), report('Day Book'), report('Voucher Type Summary')],
  },
  inventoryStock: {
    title: 'Stock Reports', icon: PackageSearch, source: 'inventory',
    reports: [
      report('Stock Summary', 'inventoryOverview', 'inventory'), report('Stock Ledger', '', 'inventory'),
      report('Stock Valuation', '', 'inventory'), report('Reorder Report', '', 'inventory'),
      report('Negative Stock Report', '', 'inventory'),
    ],
  },
  inventoryItem: {
    title: 'Item Reports', icon: PackageSearch, source: 'inventory',
    reports: [report('Item Movement', '', 'inventory'), report('Item-wise Stock', '', 'inventory')],
  },
  inventoryWarehouse: {
    title: 'Warehouse Reports', icon: Building2, source: 'inventory', feature: 'warehouses',
    reports: [
      report('Warehouse-wise Stock', '', 'warehouses'), report('Branch-wise Stock', '', 'branches'),
    ],
  },
  gst: {
    title: 'GST Reports', icon: ShieldCheck, source: 'gst',
    reports: [
      report('GSTR-1', 'gstr1'), report('GSTR-3B', 'gstr3b'), report('GST Sales Register'),
      report('GST Purchase Register'), report('HSN/SAC Summary'), report('Tax Liability Summary'),
      report('Input Tax Credit Summary', 'gstr2bReco'), report('GST Ledger Summary'),
    ],
  },
  tds: {
    title: 'TDS Reports', icon: ShieldCheck, source: 'tds',
    reports: [
      report('TDS Receivable Register', 'tds'), report('TDS Payable Register', 'tdsTcs'),
      report('Section-wise TDS'), report('Party-wise TDS'), report('TDS Deduction Summary'),
      report('TDS Payment Summary'), report('Filing-ready TDS Summary'),
    ],
  },
  branch: {
    title: 'Branch Reports', icon: Building2, source: 'analysis', feature: 'branches',
    reports: [report('Branch P&L'), report('Branch-wise Sales/Purchase/Expense')],
  },
  costCentre: {
    title: 'Cost Centre Reports', icon: BarChart3, source: 'analysis', feature: 'costCenters',
    reports: [
      report('Cost Centre P&L', 'costCenters'), report('Cost Centre Ledger Summary'),
      report('Cost Centre Transaction Report'),
    ],
  },
};

const NAV_GROUPS = [
  { title: 'Business Reports', keys: ['sales', 'purchases', 'expenses', 'receipts', 'payments'] },
  { title: 'Accounting Reports', keys: ['ledgers', 'receivables', 'payables', 'journals'] },
  {
    title: 'Financial Statements',
    direct: [
      report('Profit & Loss', 'profitLoss'), report('Balance Sheet', 'balanceSheet'),
      report('Trial Balance', 'trialBalance'), report('Cash Flow Statement', 'cashFlow'),
    ],
  },
  { title: 'Inventory', keys: ['inventoryStock', 'inventoryItem', 'inventoryWarehouse'] },
  {
    title: 'Cash & Bank',
    direct: [report('Cash Book'), report('Bank Book'), report('Bank Reconciliation', 'bankReco')],
    bucket: 'cashBank',
  },
  { title: 'Tax & Compliance', keys: ['gst', 'tds'] },
  { title: 'Analysis', keys: ['branch', 'costCentre'] },
];

const CASH_BANK_REPORTS = [
  report('Cash Book'), report('Bank Book'), report('Account-wise Transactions'),
  report('Bank Reconciliation Statement', 'bankReco'), report('Unreconciled Transactions', 'bankReco'),
  report('Contra Register'),
];

const collectionFor = (db, source) => {
  if (source === 'sales') return db?.invoices || [];
  if (source === 'purchases') return db?.bills || db?.purchases || [];
  if (source === 'expenses') return db?.expenses || [];
  if (source === 'receipts') return (db?.payments || []).filter((row) => /receipt|received/i.test(String(row.type || row.kind || row.voucherType || '')));
  if (source === 'payments') return (db?.payments || []).filter((row) => !/receipt|received/i.test(String(row.type || row.kind || row.voucherType || '')));
  if (source === 'journals') return db?.journalEntries || db?.journals || [];
  if (source === 'inventory') return db?.items || [];
  if (source === 'ledgers') return db?.chartOfAccounts || [];
  return [];
};

const rowDate = (row) => String(row?.date || row?.invoiceDate || row?.billDate || row?.createdAt || '').slice(0, 10);
const rowNumber = (row) => row?.number || row?.invoiceNumber || row?.billNumber || row?.voucherNo || row?.code || `#${row?.id || ''}`;
const rowParty = (row) => row?.customerName || row?.vendorName || row?.partyName || row?.ledgerName || row?.name || '—';
const rowAmount = (row) => Number(row?.total ?? row?.amount ?? row?.balance ?? row?.closingBalance ?? 0) || 0;

const GenericReport = ({ title, bucket, db, currentCompany, onBack }) => {
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const rows = useMemo(() => {
    const companyId = currentCompany?.id;
    const needle = query.trim().toLowerCase();
    return collectionFor(db, bucket?.source)
      .filter((row) => !companyId || !row?.companyId || String(row.companyId) === String(companyId))
      .filter((row) => !from || !rowDate(row) || rowDate(row) >= from)
      .filter((row) => !to || !rowDate(row) || rowDate(row) <= to)
      .filter((row) => !needle || [rowNumber(row), rowParty(row), row?.status].some((v) => String(v || '').toLowerCase().includes(needle)));
  }, [bucket?.source, currentCompany?.id, db, from, query, to]);
  const total = rows.reduce((sum, row) => sum + rowAmount(row), 0);

  return (
    <div className="min-w-0 flex-1 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button type="button" className="ui-link mb-2 text-sm" onClick={onBack}>← All {bucket?.title}</button>
          <h2 className="ui-t-page">{title}</h2>
          <p className="ui-muted text-sm">Prepared from saved {bucket?.title.toLowerCase()} entries.</p>
        </div>
        <div className="ui-card px-4 py-3 text-right">
          <div className="ui-label">Total</div>
          <div className="ui-money-lg">{formatMoney(total, currentCompany)}</div>
        </div>
      </div>

      <div className="ui-toolbar rounded-xl border ui-border-c sm:grid-cols-[minmax(14rem,1fr)_auto_auto]">
        <label className="relative block">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 ui-subtle" aria-hidden="true" />
          <input className="ui-input w-full ps-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this report" />
        </label>
        <input className="ui-input" type="date" aria-label="From date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input className="ui-input" type="date" aria-label="To date" value={to} onChange={(event) => setTo(event.target.value)} />
      </div>

      <div className="ui-table-scroll rounded-xl border ui-border-c">
        <table className="ui-table w-full">
          <thead><tr><th>Date</th><th>Number</th><th>Party / Ledger</th><th>Status</th><th className="ui-num">Amount</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={row?.id || `${rowNumber(row)}-${index}`}>
                <td>{rowDate(row) || '—'}</td><td className="ui-mono">{rowNumber(row)}</td>
                <td>{rowParty(row)}</td><td>{row?.status || 'Recorded'}</td>
                <td className="ui-num ui-money">{formatMoney(rowAmount(row), currentCompany)}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} className="py-12 text-center ui-muted">No entries match this report and date range.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ReportsWorkspace = ({ db, currentCompany, onNavigate, isEnabled = () => true }) => {
  const firstKey = 'sales';
  const [selectedKey, setSelectedKey] = useState(firstKey);
  const [openGroups, setOpenGroups] = useState(() => new Set(NAV_GROUPS.map((group) => group.title)));
  const [selectedReport, setSelectedReport] = useState(null);
  const [search, setSearch] = useState('');

  const bucket = selectedKey === 'cashBank'
    ? { title: 'Cash & Bank', icon: Landmark, source: 'cashBank', reports: CASH_BANK_REPORTS }
    : BUCKETS[selectedKey] || BUCKETS[firstKey];
  const universalReports = useMemo(() => {
    const items = [];
    for (const [bucketKey, value] of Object.entries(BUCKETS)) {
      if (value.feature && !isEnabled(value.feature)) continue;
      for (const item of value.reports || []) {
        if (!item.feature || isEnabled(item.feature)) items.push({ ...item, bucketKey, category: value.title });
      }
    }
    for (const item of CASH_BANK_REPORTS) items.push({ ...item, bucketKey: 'cashBank', category: 'Cash & Bank' });
    for (const group of NAV_GROUPS) {
      for (const item of group.direct || []) {
        if (!item.feature || isEnabled(item.feature)) items.push({ ...item, bucketKey: group.bucket || '', category: group.title });
      }
    }
    return items.filter((item, index, rows) => rows.findIndex((candidate) => candidate.name === item.name && candidate.bucketKey === item.bucketKey) === index);
  }, [isEnabled]);
  const query = search.trim().toLowerCase();
  const reports = query
    ? universalReports.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(query))
    : (bucket.reports || [])
        .filter((item) => !item.feature || isEnabled(item.feature))
        .map((item) => ({ ...item, bucketKey: selectedKey, category: bucket.title }));

  const openReport = (item) => {
    if (item.route) onNavigate?.(item.route);
    else {
      if (item.bucketKey) setSelectedKey(item.bucketKey);
      setSelectedReport(item);
    }
  };

  if (selectedReport) {
    return (
      <div className="flex min-h-[calc(100dvh-8rem)] gap-0 overflow-hidden rounded-xl border ui-border-c bg-[rgb(var(--surface))]">
        <ReportSidebar selectedKey={selectedKey} setSelectedKey={(key) => { setSelectedKey(key); setSelectedReport(null); }} openGroups={openGroups} setOpenGroups={setOpenGroups} onNavigate={onNavigate} isEnabled={isEnabled} />
        <main className="min-w-0 flex-1 p-5 lg:p-7">
          <GenericReport title={selectedReport.name} bucket={bucket} db={db} currentCompany={currentCompany} onBack={() => setSelectedReport(null)} />
        </main>
      </div>
    );
  }

  const Icon = bucket.icon || FileSpreadsheet;
  return (
    <div className="space-y-3">
      <div
        className="sticky top-0 z-50 grid grid-cols-1 items-center gap-3 border-b py-2.5 ui-border-c sm:grid-cols-[1fr_minmax(16rem,24rem)_1fr]"
        style={{ backgroundColor: 'rgb(var(--app-bg))', boxShadow: '0 8px 16px rgb(0 0 0 / 0.04)' }}
      >
        <div className="flex items-center gap-2.5"><EntityMark entity="report" /><h1 className="ui-t-page">Reports</h1></div>
        <label className="relative block w-full">
          <Search size={17} className="absolute start-3 top-1/2 -translate-y-1/2 ui-subtle" aria-hidden="true" />
          <input className="ui-input w-full ps-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search all reports…" aria-label="Search all reports" />
        </label>
        <span aria-hidden="true" />
      </div>
      <div className="flex min-h-[calc(100dvh-12rem)] overflow-hidden rounded-xl border ui-border-c bg-[rgb(var(--surface))]">
        <ReportSidebar selectedKey={selectedKey} setSelectedKey={setSelectedKey} openGroups={openGroups} setOpenGroups={setOpenGroups} onNavigate={onNavigate} isEnabled={isEnabled} />
        <main className="min-w-0 flex-1 p-5 lg:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b ui-border-c pb-4">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[rgb(var(--heading-bg))]"><Icon size={17} /></span>
              <div><h2 className="text-sm font-bold">{query ? 'Search results' : bucket.title}</h2><p className="ui-muted text-xs">{reports.length} report{reports.length === 1 ? '' : 's'} available</p></div>
            </div>
          </div>
          <div className="grid overflow-hidden rounded-xl border ui-border-c xl:grid-cols-2">
            {reports.map((item) => (
              <button key={`${item.bucketKey || selectedKey}-${item.name}`} type="button" onClick={() => openReport(item)} className="group flex min-h-12 w-full items-center gap-3 border-b ui-border-c px-4 py-3 text-left transition-all hover:bg-[rgb(var(--heading-bg))] focus-visible:z-10 xl:odd:border-e">
                <span className="grid h-7 w-7 flex-none place-items-center rounded-md bg-[rgb(var(--surface-sunken))] transition-colors group-hover:bg-[rgb(var(--surface))]"><FileSpreadsheet size={14} className="ui-muted" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.name}</span>
                <ChevronRight size={15} className="ui-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            ))}
            {!reports.length ? <div className="col-span-full rounded-xl border border-dashed ui-border-c px-5 py-12 text-center text-sm ui-muted">No reports match “{search}”.</div> : null}
          </div>
        </main>
      </div>
    </div>
  );
};

const ReportSidebar = ({ selectedKey, setSelectedKey, openGroups, setOpenGroups, onNavigate, isEnabled }) => {
  const toggle = (title) => setOpenGroups((current) => {
    const next = new Set(current);
    if (next.has(title)) next.delete(title); else next.add(title);
    return next;
  });
  return (
    <aside className="hidden w-64 flex-none border-e ui-border-c bg-[rgb(var(--surface-sunken))] p-3 sm:block" aria-label="Report categories">
      <div className="ui-section-label px-2">Reports</div>
      <nav className="space-y-1">
        {NAV_GROUPS.map((group) => {
          const keys = (group.keys || []).filter((key) => !BUCKETS[key]?.feature || isEnabled(BUCKETS[key].feature));
          const direct = (group.direct || []).filter((item) => !item.feature || isEnabled(item.feature));
          if (!keys.length && !direct.length) return null;
          const open = openGroups.has(group.title);
          return (
            <div key={group.title}>
              <button type="button" onClick={() => toggle(group.title)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm font-semibold hover:bg-[rgb(var(--heading-bg))]">
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span>{group.title}</span>
              </button>
              {open ? (
                <div className="ms-3 border-s ui-border-c ps-2">
                  {keys.map((key) => {
                    const item = BUCKETS[key];
                    return <button key={key} type="button" data-active={selectedKey === key ? 'true' : undefined} onClick={() => setSelectedKey(key)} className="ui-nav-item my-0.5 w-full justify-start px-2 py-1.5 text-[0.8125rem]">{item.title}</button>;
                  })}
                  {direct.map((item) => (
                    <button key={item.name} type="button" onClick={() => item.route ? onNavigate?.(item.route) : setSelectedKey(group.bucket || 'cashBank')} className="ui-nav-item my-0.5 w-full justify-start px-2 py-1.5 text-[0.8125rem]">{item.name}</button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
};

export default ReportsWorkspace;
