import { useMemo, useState } from 'react';
import { AlertTriangle, Download, FileText, Filter, Landmark, Plus, Receipt, Scale, Search, SlidersHorizontal } from 'lucide-react';

import DocumentListShell from '@ui/components/list/DocumentListShell';
import { LIST_PERIODS, usePeriodFilter } from '@ui/components/ListControls';
import PopupSelect from '@ui/components/pickers/PopupSelect';
import { EmptyState, StatusPill } from '@ui/components/ui/Primitives';
import { formatMoney } from '@ui/utils/money';
import { useFeatures } from '@ui/permissions/useFeatures';
import { companyTdsProfile } from './engine';
import { TDS_NATURES, natureByCode } from './ruleMaster';
import { datasetChecksum, filingFor, quarterValidation, returnCsv, returnDataset } from './returns';
import {
  challanRegister,
  dueSummary,
  monthWise,
  natureWise,
  partyWise,
  payableSummary,
  quarterWise,
  receivableSummary,
  tdsEvents,
  tdsExceptions,
  tdsReconciliation,
  unmappedNatures,
} from './reports';

/**
 * Where a company looks at its TDS.
 *
 * One screen, six views, because they answer six versions of one question and
 * splitting them across the rail would make a person navigate to find out
 * whether the number they just saw was the same number. Everything on it is
 * read from the normalized events — nothing is recomputed from a document, so
 * what is shown here is what was actually deducted and posted.
 */

const REPORTS = [
  { value: 'payable', label: 'TDS Payable', view: 'register', side: 'PAYABLE' },
  { value: 'receivable', label: 'TDS Receivable', view: 'register', side: 'RECEIVABLE' },
  { value: 'register', label: 'TDS Deduction Register', view: 'register', side: '' },
  { value: 'challans', label: 'TDS Payment / Challan', view: 'challans', side: 'PAYABLE' },
  { value: 'return', label: 'TDS Returns', view: 'return', side: 'PAYABLE' },
  { value: 'reconciliation', label: 'TDS Reconciliation', view: 'reconciliation', side: 'PAYABLE' },
  { value: 'nature', label: 'Section-wise Summary', view: 'nature', side: '' },
  { value: 'party', label: 'Party-wise Summary', view: 'party', side: '' },
  { value: 'exceptions', label: 'TDS Exceptions', view: 'exceptions', side: '' },
];

const SEVERITY_STYLE = {
  BLOCK: 'text-[rgb(var(--neg-ink))]',
  WARNING: 'text-[rgb(var(--warn-ink,var(--fg)))]',
  INFO: 'ui-muted',
};

export default function TdsModule({ db, setDb = null, currentCompany, onNewChallan = null, onOpenSettings = null }) {
  const { isEnabled } = useFeatures();
  const branchesEnabled = isEnabled('branches');
  const companyId = currentCompany?.id;
  const profile = companyTdsProfile(currentCompany);
  const period = usePeriodFilter();
  const [view, setView] = useState('register');
  const [selectedReport, setSelectedReport] = useState('payable');
  const [search, setSearch] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const [quarter, setQuarter] = useState('');
  const [side, setSide] = useState('PAYABLE');
  const [partyId, setPartyId] = useState('');
  const [natureCode, setNatureCode] = useState('');
  const [status, setStatus] = useState('');
  const [branchId, setBranchId] = useState('');
  const [ledgerId, setLedgerId] = useState('');

  const selectReport = (value) => {
    const report = REPORTS.find((item) => item.value === value) || REPORTS[0];
    setSelectedReport(report.value);
    setView(report.view);
    setSide(report.side);
  };

  const filter = useMemo(
    () => ({ from: period.dateFrom, to: period.dateTo, quarter, side, partyId, natureCode, status, branchId: branchesEnabled ? branchId : '', ledgerId }),
    [period.dateFrom, period.dateTo, quarter, side, partyId, natureCode, status, branchId, ledgerId, branchesEnabled]
  );

  /* Every option list is derived from the events themselves — the report
     offers only what the data actually contains. */
  const allEvents = useMemo(() => tdsEvents(db, companyId, {}), [db, companyId]);
  const partyOptions = useMemo(() => {
    const by = new Map();
    for (const e of allEvents) if (e.partyId != null) by.set(String(e.partyId), String(e.partyName || e.partyId));
    return [...by.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [allEvents]);
  const branchOptions = useMemo(() => {
    const set = new Set(allEvents.map((e) => String(e.branchId || '')).filter(Boolean));
    return [...set].sort().map((b) => ({ value: b, label: b }));
  }, [allEvents]);
  const ledgerOptions = useMemo(() => {
    const ids = new Set(allEvents.map((e) => String(e.ledgerId || '')).filter(Boolean));
    return [...ids]
      .map((id) => ({ value: id, label: String((db?.chartOfAccounts || []).find((a) => String(a.id) === id)?.name || `Ledger ${id}`) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allEvents, db?.chartOfAccounts]);

  const payable = useMemo(() => payableSummary(db, companyId, filter), [db, companyId, filter]);
  const receivable = useMemo(() => receivableSummary(db, companyId, filter), [db, companyId, filter]);
  const events = useMemo(() => tdsEvents(db, companyId, filter), [db, companyId, filter]);
  const visibleEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return events;
    return events.filter((event) => [event.partyName, event.panSnapshot, event.sourceNumber, event.sourceType, event.sectionReference, event.sectionCode, event.returnQuarter].some((value) => String(value || '').toLowerCase().includes(query)));
  }, [events, search]);
  const challans = useMemo(() => challanRegister(db, companyId), [db, companyId]);
  const exceptions = useMemo(() => tdsExceptions(db, companyId, filter), [db, companyId, filter]);
  const recon = useMemo(() => tdsReconciliation(db, companyId, filter), [db, companyId, filter]);
  const unmapped = useMemo(() => unmappedNatures(db, companyId), [db, companyId]);
  const quarters = useMemo(() => quarterWise(db, companyId, {}), [db, companyId]);

  /*
   * The quarter, checked and set out as it would be filed.
   *
   * V1 does not file — but a quarter is either complete or it is not, and that
   * is a handful of checks somebody would otherwise do by eye in April.
   */
  const validation = useMemo(() => quarterValidation(db, companyId, quarter), [db, companyId, quarter]);
  const dataset = useMemo(() => returnDataset(db, companyId, quarter), [db, companyId, quarter]);

  /* The quarter's filing lifecycle: Open → Frozen → Filed. The freeze pins
     the dataset's signature; the screen says so when the data moves after. */
  const filing = useMemo(() => filingFor(db, companyId, quarter), [db, companyId, quarter]);
  const checksumNow = useMemo(() => datasetChecksum(dataset), [dataset]);
  const frozenDrift = Boolean(filing && filing.checksum && filing.checksum !== checksumNow);
  const who = () => {
    try {
      return String(localStorage.getItem('userEmail') || '').trim() || 'User';
    } catch {
      return 'User';
    }
  };
  const [ackNo, setAckNo] = useState('');

  const freezeQuarter = () => {
    if (!setDb || !quarter || !validation.ready) return;
    setDb((prev) => {
      const rows = Array.isArray(prev.tdsFilings) ? prev.tdsFilings : [];
      if (rows.some((f) => Number(f.companyId) === Number(companyId) && f.quarter === quarter)) return prev;
      const id = rows.reduce((m, f) => Math.max(m, Number(f?.id) || 0), 0) + 1;
      return {
        ...prev,
        tdsFilings: [
          ...rows,
          { id, companyId, quarter, status: 'Frozen', checksum: checksumNow, frozenAt: new Date().toISOString(), frozenBy: who(), exports: [] },
        ],
      };
    });
  };

  const recordExport = () => {
    if (!setDb || !filing) return 0;
    const version = (filing.exports?.length || 0) + 1;
    setDb((prev) => ({
      ...prev,
      tdsFilings: (prev.tdsFilings || []).map((f) =>
        f.id === filing.id
          ? {
              ...f,
              status: f.status === 'Filed' ? 'Filed' : 'Frozen',
              exports: [
                ...(f.exports || []),
                { version, at: new Date().toISOString(), by: who(), checksum: checksumNow, totals: { ...dataset.totals } },
              ],
            }
          : f
      ),
    }));
    return version;
  };

  const recordAcknowledgement = () => {
    if (!setDb || !filing || !String(ackNo).trim()) return;
    setDb((prev) => ({
      ...prev,
      tdsFilings: (prev.tdsFilings || []).map((f) =>
        f.id === filing.id
          ? { ...f, status: 'Filed', acknowledgementNo: String(ackNo).trim(), filedAt: new Date().toISOString(), filedBy: who() }
          : f
      ),
    }));
    setAckNo('');
  };

  const downloadReturn = () => {
    /* A frozen quarter's export is a VERSION on the filing record; before
       the freeze it is only a draft preview and says so in its name. */
    const version = filing ? recordExport() : 0;
    const csv = returnCsv(dataset);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const base = `tds-${String(quarter || 'quarter').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`;
    link.download = version ? `${base}-v${version}.csv` : `${base}-draft.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const dues = useMemo(() => dueSummary(db, companyId), [db, companyId]);

  const exportRegister = () => {
    const lines = [
      ['Date', 'Party', 'PAN', 'Voucher No.', 'TDS Section', 'Gross Amount', 'TDS Rate', 'TDS Amount', 'Status'],
      ...visibleEvents.map((event) => [event.transactionDate, event.partyName, event.panSnapshot, event.sourceNumber || event.sourceId, event.sectionReference || event.sectionCode, event.baseAmount, event.rate, event.tdsAmount, event.status]),
    ];
    const csv = lines.map((line) => line.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedReport}-tds-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /* TDS switched off is not an empty register — it is a company that does not
     deduct, and saying so is more use than showing it six empty tables. */
  if (!profile.enabled) {
    return (
      <DocumentListShell entity="tds" title="TDS" company={currentCompany}>
        <EmptyState
          title="TDS is switched off for this company"
          message="Settings → Tax compliances turns it on, along with the TAN and deductor details a challan and a return need."
          routes={
            onOpenSettings
              ? [{ label: 'Open tax settings', description: 'Enable TDS and record the TAN.', onSelect: () => onOpenSettings('settingsTds') }]
              : undefined
          }
        />
      </DocumentListShell>
    );
  }

  return (
    <DocumentListShell
      entity="tds"
      title="TDS"
      description="View, analyse and manage TDS compliance"
      company={currentCompany}
      headerExtras={<><div><label className="ui-label" htmlFor="tds-financial-year">Financial Year</label><select id="tds-financial-year" className="ui-select" value={String(quarter || '').match(/FY \d{4}-\d{2}/)?.[0] || ''} onChange={(e) => { const fy = e.target.value; const match = quarters.find((item) => String(item.quarter).startsWith(fy)); setQuarter(match?.quarter || ''); }}><option value="">All financial years</option>{[...new Set(quarters.map((item) => String(item.quarter || '').match(/FY \d{4}-\d{2}/)?.[0]).filter(Boolean))].map((fy) => <option key={fy} value={fy}>{fy}</option>)}</select></div><div><label className="ui-label" htmlFor="tds-header-period">Quarter / Period</label><select id="tds-header-period" className="ui-select" value={quarter} onChange={(e) => setQuarter(e.target.value)}><option value="">All quarters</option>{quarters.map((item) => <option key={item.quarter} value={item.quarter}>{item.quarter}</option>)}</select></div></>}
      primary={onNewChallan ? <button type="button" onClick={onNewChallan} className="ui-btn ui-btn-primary"><Plus size={16} aria-hidden="true" /> Record challan</button> : null}
      cards={[
        { label: 'TDS Deducted', value: payable.deducted, tone: 'all', Icon: Scale, hint: `${payable.count} deduction transactions`, onSelect: () => selectReport('register') },
        { label: 'TDS Payable', value: payable.outstanding, tone: 'outstanding', Icon: Landmark, hint: `${dues.overdueCount} overdue transaction(s)`, onSelect: () => selectReport('payable') },
        { label: 'TDS Paid', value: payable.allocated, tone: 'paid', Icon: FileText, hint: `${challans.length} challan(s) recorded`, onSelect: () => selectReport('challans') },
        { label: 'TDS Receivable', value: receivable.deducted, tone: 'sent', Icon: Receipt, hint: `${receivable.count} customer deductions`, onSelect: () => selectReport('receivable') },
      ]}
      above={
        <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 sm:w-72"><label className="ui-label" htmlFor="tds-report-select">Select Report</label><select id="tds-report-select" className="ui-select w-full font-semibold" value={selectedReport} onChange={(e) => selectReport(e.target.value)}>{REPORTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
          <div className="min-w-0 sm:w-56">
            <PopupSelect
              label="Period"
      title="periods"
              value={period.period}
              onChange={(next) => period.setPeriod(String(next || 'all'))}
              options={LIST_PERIODS.map((p) => ({ value: p.key, label: p.label }))}
              placeholder="All time"
              showValueSubtext={false}
            />
          </div>
          {/* §22's filters: side, party, nature, status, branch, ledger —
              every list derived from the events, every choice feeding the
              one filter the whole report layer reads. */}
          <div className="min-w-0 w-48">
            <label className="ui-label" htmlFor="tds-f-party">Party</label>
            <select id="tds-f-party" className="ui-select w-full" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">All parties</option>
              {partyOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-0 w-48">
            <label className="ui-label" htmlFor="tds-f-nature">TDS Section</label>
            <select id="tds-f-nature" className="ui-select w-full" value={natureCode} onChange={(e) => setNatureCode(e.target.value)}>
              <option value="">All natures</option>
              {TDS_NATURES.filter((n) => n.active !== false).map((n) => (
                <option key={n.code} value={n.code}>{n.name}</option>
              ))}
            </select>
          </div>
          {advancedOpen ? <div className="min-w-0 w-36">
            <label className="ui-label" htmlFor="tds-f-status">Status</label>
            <select id="tds-f-status" className="ui-select w-full" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="Posted">Posted</option>
              <option value="Reversed">Reversed</option>
              <option value="Reversal">Reversal</option>
            </select>
          </div> : null}
          {branchesEnabled && branchOptions.length ? (
            <div className="min-w-0 w-40">
              <label className="ui-label" htmlFor="tds-f-branch">Branch</label>
              <select id="tds-f-branch" className="ui-select w-full" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">All branches</option>
                {branchOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ) : null}
          {advancedOpen && ledgerOptions.length ? (
            <div className="min-w-0 w-48">
              <label className="ui-label" htmlFor="tds-f-ledger">Ledger</label>
              <select id="tds-f-ledger" className="ui-select w-full" value={ledgerId} onChange={(e) => setLedgerId(e.target.value)}>
                <option value="">All ledgers</option>
                {ledgerOptions.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ) : null}
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => setAdvancedOpen(false)}>Apply</button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen}><Filter size={15} /> Filter</button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setCompactLayout((compact) => !compact)}><SlidersHorizontal size={15} /> Layout</button>
          <button type="button" className="ui-btn ui-btn-secondary" onClick={exportRegister}><Download size={15} /> Export</button>
          {unmapped.length ? (
            <p className="ui-caption">
              No ledger is mapped to {unmapped.map((u) => u.natureName).join(', ')} — deductions under it cannot post.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">{(selectedReport === 'receivable' ? [['Invoice amount', receivable.deducted], ['TDS receivable', receivable.deducted], ['Pending TDS', receivable.deducted]] : selectedReport === 'nature' ? natureWise(db, companyId, filter).slice(0, 4).map((row) => [row.references.join(', ') || row.natureCode, row.tdsAmount]) : [['Gross amount', visibleEvents.reduce((sum, event) => sum + Number(event.baseAmount || 0), 0)], ['TDS deducted', payable.deducted], ['TDS paid', payable.allocated], ['TDS payable', payable.outstanding], ['Overdue', dues.overdue]]).map(([label, amount]) => <div key={label} className="ui-card min-w-36 px-4 py-3"><div className="ui-caption">{label}</div><div className="ui-money-lg">{formatMoney(amount, currentCompany)}</div></div>)}</div>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b ui-border-c p-3"><div><h2 className="ui-t-sec">{REPORTS.find((item) => item.value === selectedReport)?.label}</h2><p className="ui-caption">TDS compliance report for the selected period</p></div><div className="relative"><Search size={15} className="ui-muted absolute start-3 top-1/2 -translate-y-1/2" /><input aria-label="Search TDS report" className="ui-input w-64 ps-9" placeholder="Search party, PAN, voucher…" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div>
      <div className="ui-table-scroll">
        {view === 'register' ? (
          <table className="ui-table ui-table-wide ui-table-sticky">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Party</th>
                <th scope="col">PAN</th>
                {!compactLayout ? <th scope="col">Nature</th> : null}
                <th scope="col">Section</th>
                <th scope="col">Source</th>
                <th scope="col" className="text-end">Base</th>
                <th scope="col" className="text-end">Rate</th>
                <th scope="col" className="text-end">TDS</th>
                {!compactLayout ? <th scope="col">Quarter</th> : null}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {visibleEvents.length === 0 ? (
                <tr>
                  <td colSpan={compactLayout ? 9 : 11}>
                    <EmptyState
      title="Nothing deducted in this window"
                      message="A bill, a payment or a receipt that deducts writes its record here, with the rule it was computed under."
                    />
                  </td>
                </tr>
              ) : (
                visibleEvents.map((e) => (
                  <tr key={e.id}>
                    <td>{e.transactionDate}</td>
                    <td className="truncate">{e.partyName || '—'}</td>
                    <td className="ui-mono">{e.panSnapshot || '—'}</td>
                    {!compactLayout ? <td className="truncate">{natureByCode(e.natureCode)?.name || e.natureCode || '—'}</td> : null}
                    {/* The reference it carried when it was posted, not the one
                        in force today — that is the whole point of the snapshot. */}
                    <td className="ui-mono">{e.sectionReference || e.sectionCode || '—'}</td>
                    <td className="truncate">
                      {e.sourceType} {e.sourceNumber ? `· ${e.sourceNumber}` : ''}
                    </td>
                    <td className="ui-money">{formatMoney(e.baseAmount, currentCompany)}</td>
                    <td className="ui-money">{Number(e.rate || 0)}%</td>
                    <td className={`ui-money ${String(e.side).toUpperCase() === 'RECEIVABLE' ? 'text-[rgb(var(--pos-ink))]' : ''}`}>
                      {formatMoney(e.tdsAmount, currentCompany)}
                    </td>
                    {!compactLayout ? <td>{e.returnQuarter || '—'}</td> : null}
                    <td><StatusPill status={e.status} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}

        {view === 'party' ? (
          <table className="ui-table ui-table-wide ui-table-sticky">
            <thead>
              <tr>
                <th scope="col">Party</th>
                <th scope="col">PAN</th>
                <th scope="col">Side</th>
                <th scope="col" className="text-end">Base</th>
                <th scope="col" className="text-end">TDS</th>
                <th scope="col" className="text-end">Entries</th>
              </tr>
            </thead>
            <tbody>
              {partyWise(db, companyId, filter).map((r) => (
                <tr key={`${r.side}-${r.partyId}`}>
                  <td className="truncate">{r.partyName || '—'}</td>
                  <td className="ui-mono">{r.pan || '—'}</td>
                  <td>{r.side === 'RECEIVABLE' ? 'Receivable' : 'Payable'}</td>
                  <td className="ui-money">{formatMoney(r.baseAmount, currentCompany)}</td>
                  <td className="ui-money">{formatMoney(r.tdsAmount, currentCompany)}</td>
                  <td className="ui-money">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {view === 'nature' ? (
          <table className="ui-table ui-table-wide ui-table-sticky">
            <thead>
              <tr>
                <th scope="col">Nature</th>
                <th scope="col">Statutory references used</th>
                <th scope="col">Side</th>
                <th scope="col" className="text-end">Base</th>
                <th scope="col" className="text-end">TDS</th>
                <th scope="col" className="text-end">Entries</th>
              </tr>
            </thead>
            <tbody>
              {natureWise(db, companyId, filter).map((r) => (
                <tr key={`${r.side}-${r.natureCode}`}>
                  <td className="truncate">{r.natureName}</td>
                  {/* Both sides of April 2026 legitimately appear together. */}
                  <td className="ui-mono truncate">{r.references.join(', ') || '—'}</td>
                  <td>{r.side === 'RECEIVABLE' ? 'Receivable' : 'Payable'}</td>
                  <td className="ui-money">{formatMoney(r.baseAmount, currentCompany)}</td>
                  <td className="ui-money">{formatMoney(r.tdsAmount, currentCompany)}</td>
                  <td className="ui-money">{r.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}

        {view === 'periods' ? (
          <div className="space-y-6">
            <div>
              <div className="ui-t-label mb-2">Quarter-wise</div>
              <table className="ui-table ui-table-wide">
                <thead>
                  <tr>
                    <th scope="col">Quarter</th>
                    <th scope="col" className="text-end">TDS</th>
                    <th scope="col" className="text-end">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {quarters.map((q) => (
                    <tr key={q.quarter}>
                      <td>{q.quarter}</td>
                      <td className="ui-money">{formatMoney(q.tdsAmount, currentCompany)}</td>
                      <td className="ui-money">{q.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <div className="ui-t-label mb-2">Month-wise</div>
              <table className="ui-table ui-table-wide">
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col">Side</th>
                    <th scope="col" className="text-end">Base</th>
                    <th scope="col" className="text-end">TDS</th>
                    <th scope="col" className="text-end">Entries</th>
                  </tr>
                </thead>
                <tbody>
                  {monthWise(db, companyId, filter).map((m) => (
                    <tr key={`${m.month}-${m.side}`}>
                      <td className="ui-mono">{m.month}</td>
                      <td>{m.side === 'RECEIVABLE' ? 'Receivable' : 'Payable'}</td>
                      <td className="ui-money">{formatMoney(m.baseAmount, currentCompany)}</td>
                      <td className="ui-money">{formatMoney(m.tdsAmount, currentCompany)}</td>
                      <td className="ui-money">{m.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {view === 'challans' ? (
          <table className="ui-table ui-table-wide ui-table-sticky">
            <thead>
              <tr>
                <th scope="col">Challan</th>
                <th scope="col">TAN</th>
                <th scope="col">Tax Year</th>
                <th scope="col">Paid on</th>
                <th scope="col">Bank / BSR</th>
                <th scope="col" className="text-end">Tax</th>
                <th scope="col" className="text-end">Interest</th>
                <th scope="col" className="text-end">Late fee</th>
                <th scope="col" className="text-end">Total</th>
                <th scope="col" className="text-end">Allocated</th>
                <th scope="col">Status</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {challans.length === 0 ? (
                <tr>
                  <td colSpan={12}>
                    <EmptyState
      title="No challans recorded"
                      message="Record what was paid to the department, then allocate it against the deductions it covers."
                    />
                  </td>
                </tr>
              ) : (
                challans.map((c) => (
                  <tr key={c.id}>
                    <td className="ui-mono">{c.number || '—'}</td>
                    <td className="ui-mono">{c.tan || '—'}</td>
                    <td>{c.taxYear || '—'}</td>
                    <td>{c.paymentDate || '—'}</td>
                    <td className="truncate">{[c.bankName, c.bsrCode].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="ui-money">{formatMoney(c.taxAmount, currentCompany)}</td>
                    <td className="ui-money">{formatMoney(c.interest, currentCompany)}</td>
                    <td className="ui-money">{formatMoney(c.lateFee, currentCompany)}</td>
                    <td className="ui-money">{formatMoney(c.totalAmount, currentCompany)}</td>
                    <td className="ui-money">{formatMoney(c.allocated, currentCompany)}</td>
                    <td><StatusPill status={c.status} /></td>
                    <td>
                      {/* The last step before Return Ready: a fully allocated
                          challan is CONFIRMED against the bank / 26Q by a
                          person, never marked by arithmetic alone. */}
                      {setDb && c.status === 'Fully allocated' ? (
                        <button
                          type="button"
                          className="ui-btn ui-btn-secondary ui-btn-sm"
                          onClick={() =>
                            setDb((prev) => ({
                              ...prev,
                              tdsChallans: (prev.tdsChallans || []).map((row) =>
                                row.companyId === companyId && String(row.id) === String(c.id)
                                  ? { ...row, reconciled: true, reconciledAt: new Date().toISOString() }
                                  : row
                              ),
                            }))
                          }
                        >
                          Mark reconciled
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}

        {view === 'exceptions' ? (
          <table className="ui-table ui-table-wide ui-table-sticky">
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Party</th>
                <th scope="col">What is wrong</th>
                <th scope="col">Entry</th>
              </tr>
            </thead>
            <tbody>
              {exceptions.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState
      title="Nothing standing in the way"
                      message="Every deduction in this window has a PAN, a ledger, a rule version and a challan behind it."
                    />
                  </td>
                </tr>
              ) : (
                exceptions.map((x, i) => (
                  <tr key={`${x.eventId}-${x.code}-${i}`}>
                    <td className={SEVERITY_STYLE[x.severity] || ''}>{x.severity}</td>
                    <td className="truncate">{x.party || '—'}</td>
                    <td>{x.message}</td>
                    <td className="ui-mono">#{x.eventId}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : null}

        {view === 'return' ? (
          <div className="space-y-4">
            {!quarter ? (
              <EmptyState
      title="Choose a quarter"
                message="A return is prepared one quarter at a time. Pick one above and this becomes the return it would file."
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="ui-t-label">{quarter}</div>
                      <StatusPill status={filing ? filing.status : 'Open'} />
                    </div>
                    <p className="ui-caption">
                      {validation.ready
                        ? `Ready — ${dataset.totals.deductees} deductee(s), ${formatMoney(dataset.totals.tdsAmount, currentCompany)} deducted.`
                        : validation.blocking.length
                          ? `${validation.blocking.length} thing(s) must be fixed before this can be filed.`
                          : 'Nothing deducted in this quarter.'}
                      {filing?.exports?.length ? ` ${filing.exports.length} export(s), latest v${filing.exports.length}.` : ''}
                      {filing?.acknowledgementNo ? ` Filed — acknowledgement ${filing.acknowledgementNo}.` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!filing && setDb ? (
                      /* The freeze pins the dataset's signature; exports from
                         here on are numbered versions of a known state. */
                      <button
                        type="button"
                        onClick={freezeQuarter}
                        className="ui-btn ui-btn-secondary"
                        disabled={!validation.ready}
      title={validation.ready ? undefined : 'Resolve the blocking problems first.'}
                      >
                        Freeze quarter
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={downloadReturn}
                      className="ui-btn ui-btn-secondary"
                      disabled={!dataset.lines.length}
                    >
                      <Download size={16} aria-hidden="true" />
                      {filing ? ` Export v${(filing.exports?.length || 0) + 1}` : ' Download draft'}
                    </button>
                    {filing && filing.status !== 'Filed' && setDb ? (
                      <>
                        <input
                          type="text"
                          className="ui-input ui-mono w-44"
                          placeholder="Acknowledgement no."
                          aria-label="Acknowledgement number"
                          value={ackNo}
                          onChange={(e) => setAckNo(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={recordAcknowledgement}
                          className="ui-btn ui-btn-primary"
                          disabled={!String(ackNo).trim()}
                        >
                          Record filing
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>

                {frozenDrift ? (
                  <p className="ui-caption text-[rgb(var(--neg-ink))]">
                    The quarter has CHANGED since it was frozen on {String(filing.frozenAt || '').slice(0, 10)} — the
                    next export will be a new version that no longer matches the frozen signature.
                  </p>
                ) : null}

                {validation.problems.length ? (
                  <ul className="space-y-1">
                    {validation.problems.map((p, i) => (
                      <li key={`${p.code}-${p.eventId}-${i}`} className="text-sm">
                        <span className={SEVERITY_STYLE[p.severity] || ''}>{p.severity}</span>{' '}
                        <span className="ui-muted">{p.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {/* One line per deductee, section and rate — a 26Q is
                    deductee-wise, not document-wise. */}
                <table className="ui-table ui-table-wide">
                  <thead>
                    <tr>
                      <th scope="col">Deductee</th>
                      <th scope="col">PAN</th>
                      <th scope="col">Section</th>
                      <th scope="col" className="text-end">Rate</th>
                      <th scope="col" className="text-end">Paid / credited</th>
                      <th scope="col" className="text-end">TDS</th>
                      <th scope="col" className="text-end">Deposited</th>
                      <th scope="col">Challans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.lines.map((l) => (
                      <tr key={`${l.deducteeId}-${l.sectionCode}-${l.rate}`}>
                        <td className="truncate">{l.deductee || '—'}</td>
                        <td className="ui-mono">{l.pan || '—'}</td>
                        <td className="ui-mono">{l.sectionReference}</td>
                        <td className="ui-money">{l.rate}%</td>
                        <td className="ui-money">{formatMoney(l.baseAmount, currentCompany)}</td>
                        <td className="ui-money">{formatMoney(l.tdsAmount, currentCompany)}</td>
                        <td className={`ui-money ${l.unpaidAmount > 0.005 ? 'text-[rgb(var(--neg-ink))]' : ''}`}>
                          {formatMoney(l.paidAmount, currentCompany)}
                        </td>
                        <td className="ui-mono truncate">{l.challans.join(', ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        ) : null}

        {view === 'reconciliation' ? (
          <table className="ui-table ui-table-wide ui-table-sticky">
            <thead>
              <tr>
                <th scope="col">Ledger</th>
                <th scope="col" className="text-end">Deducted</th>
                <th scope="col" className="text-end">Paid over</th>
                <th scope="col" className="text-end">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {recon.ledgers.map((l) => (
                <tr key={l.ledgerId || 'unmapped'}>
                  <td className="truncate">{l.name}</td>
                  <td className="ui-money">{formatMoney(l.deducted, currentCompany)}</td>
                  <td className="ui-money">{formatMoney(l.allocated, currentCompany)}</td>
                  <td className={`ui-money ${l.outstanding > 0.005 ? 'text-[rgb(var(--neg-ink))]' : ''}`}>
                    {formatMoney(l.outstanding, currentCompany)}
                  </td>
                </tr>
              ))}
              <tr>
                <td className="font-medium">All ledgers</td>
                <td className="ui-money">{formatMoney(recon.register, currentCompany)}</td>
                <td className="ui-money">{formatMoney(recon.paid, currentCompany)}</td>
                <td className="ui-money">{formatMoney(recon.outstanding, currentCompany)}</td>
              </tr>
            </tbody>
          </table>
        ) : null}
      </div>
    </DocumentListShell>
  );
}
