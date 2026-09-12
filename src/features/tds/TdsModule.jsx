import { useMemo, useState } from 'react';
import { AlertTriangle, FileText, Landmark, Plus, Receipt, Scale, TrendingDown } from 'lucide-react';

import DocumentListShell from '../../components/list/DocumentListShell';
import { LIST_PERIODS, usePeriodFilter } from '../../components/ListControls';
import PopupSelect from '../../components/pickers/PopupSelect';
import { EmptyState, StatusPill } from '../../components/ui/Primitives';
import { formatMoney } from '../../utils/money';
import { companyTdsProfile } from './engine';
import { natureByCode } from './ruleMaster';
import {
  challanRegister,
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

const VIEWS = [
  { value: 'register', label: 'Register', tone: 'all' },
  { value: 'party', label: 'Party-wise', tone: 'sent' },
  { value: 'nature', label: 'Nature-wise', tone: 'paid' },
  { value: 'challans', label: 'Challans', tone: 'draft' },
  { value: 'exceptions', label: 'Exceptions', tone: 'overdue' },
  { value: 'reconciliation', label: 'Reconciliation', tone: 'outstanding' },
];

const SEVERITY_STYLE = {
  BLOCK: 'text-[rgb(var(--neg-ink))]',
  WARNING: 'text-[rgb(var(--warn-ink,var(--fg)))]',
  INFO: 'ui-muted',
};

export default function TdsModule({ db, currentCompany, onNewChallan = null, onOpenSettings = null }) {
  const companyId = currentCompany?.id;
  const profile = companyTdsProfile(currentCompany);
  const period = usePeriodFilter();
  const [view, setView] = useState('register');
  const [quarter, setQuarter] = useState('');

  const filter = useMemo(
    () => ({ from: period.dateFrom, to: period.dateTo, quarter }),
    [period.dateFrom, period.dateTo, quarter]
  );

  const payable = useMemo(() => payableSummary(db, companyId, filter), [db, companyId, filter]);
  const receivable = useMemo(() => receivableSummary(db, companyId, filter), [db, companyId, filter]);
  const events = useMemo(() => tdsEvents(db, companyId, filter), [db, companyId, filter]);
  const challans = useMemo(() => challanRegister(db, companyId), [db, companyId]);
  const exceptions = useMemo(() => tdsExceptions(db, companyId, filter), [db, companyId, filter]);
  const recon = useMemo(() => tdsReconciliation(db, companyId, filter), [db, companyId, filter]);
  const unmapped = useMemo(() => unmappedNatures(db, companyId), [db, companyId]);
  const quarters = useMemo(() => quarterWise(db, companyId, {}), [db, companyId]);

  const unallocatedChallans = challans.filter((c) => c.unallocated > 0.005);
  const blocking = exceptions.filter((x) => x.severity === 'BLOCK');

  /* TDS switched off is not an empty register — it is a company that does not
     deduct, and saying so is more use than showing it six empty tables. */
  if (!profile.enabled) {
    return (
      <DocumentListShell title="TDS" description="Deduction, challans and the quarterly return." company={currentCompany}>
        <EmptyState
          title="TDS is switched off for this company"
          message="Settings → Tax compliances turns it on, along with the TAN and deductor details a challan and a return need."
          routes={
            onOpenSettings
              ? [{ label: 'Open tax settings', description: 'Enable TDS and record the TAN.', onSelect: () => onOpenSettings('settingsTax') }]
              : undefined
          }
        />
      </DocumentListShell>
    );
  }

  return (
    <DocumentListShell
      title="TDS"
      description="What was deducted, what has been paid over, and what stands between here and a filed quarter."
      company={currentCompany}
      primary={
        onNewChallan ? (
          <button type="button" onClick={onNewChallan} className="ui-btn ui-btn-primary">
            <Plus size={16} aria-hidden="true" /> Record challan
          </button>
        ) : null
      }
      cards={[
        { label: 'TDS payable', value: payable.outstanding, tone: 'outstanding', Icon: Landmark },
        { label: 'TDS receivable', value: receivable.deducted, tone: 'paid', Icon: Receipt },
        { label: 'Deducted', value: payable.deducted, tone: 'sent', Icon: TrendingDown },
        { label: 'Unallocated challans', value: unallocatedChallans.length, count: true, tone: 'draft', Icon: FileText },
        { label: 'Exceptions', value: exceptions.length, count: true, tone: blocking.length ? 'overdue' : 'draft', Icon: AlertTriangle },
        { label: 'Unmapped natures', value: unmapped.length, count: true, tone: unmapped.length ? 'overdue' : 'draft', Icon: Scale },
      ]}
      above={
        <div className="flex flex-wrap items-end gap-3">
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
          <div className="min-w-0 sm:w-64">
            <PopupSelect
              label="Return quarter"
              title="quarters"
              value={quarter}
              onChange={(next) => setQuarter(String(next || ''))}
              options={[
                { value: '', label: 'All quarters' },
                ...quarters.map((q) => ({ value: q.quarter, label: `${q.quarter} · ${q.count} entries` })),
              ]}
              placeholder="All quarters"
              showValueSubtext={false}
            />
          </div>
          {unmapped.length ? (
            <p className="ui-caption">
              No ledger is mapped to {unmapped.map((u) => u.natureName).join(', ')} — deductions under it cannot post.
            </p>
          ) : null}
        </div>
      }
      tabs={VIEWS}
      tabsLabel="View"
      statusValue={view}
      statusCounts={{
        register: events.length,
        party: partyWise(db, companyId, filter).length,
        nature: natureWise(db, companyId, filter).length,
        challans: challans.length,
        exceptions: exceptions.length,
        reconciliation: recon.ledgers.length,
      }}
      onStatusChange={setView}
    >
      <div className="ui-table-scroll">
        {view === 'register' ? (
          <table className="ui-table ui-table-wide ui-table-sticky">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Party</th>
                <th scope="col">PAN</th>
                <th scope="col">Nature</th>
                <th scope="col">Section</th>
                <th scope="col">Source</th>
                <th scope="col" className="text-end">Base</th>
                <th scope="col" className="text-end">Rate</th>
                <th scope="col" className="text-end">TDS</th>
                <th scope="col">Quarter</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyState
                      title="Nothing deducted in this window"
                      message="A bill, a payment or a receipt that deducts writes its record here, with the rule it was computed under."
                    />
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <tr key={e.id}>
                    <td>{e.transactionDate}</td>
                    <td className="truncate">{e.partyName || '—'}</td>
                    <td className="ui-mono">{e.panSnapshot || '—'}</td>
                    <td className="truncate">{natureByCode(e.natureCode)?.name || e.natureCode || '—'}</td>
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
                    <td>{e.returnQuarter || '—'}</td>
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

        {view === 'challans' ? (
          <table className="ui-table ui-table-wide ui-table-sticky">
            <thead>
              <tr>
                <th scope="col">Challan</th>
                <th scope="col">Paid on</th>
                <th scope="col">Bank / BSR</th>
                <th scope="col" className="text-end">Tax</th>
                <th scope="col" className="text-end">Interest</th>
                <th scope="col" className="text-end">Late fee</th>
                <th scope="col" className="text-end">Total</th>
                <th scope="col" className="text-end">Allocated</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {challans.length === 0 ? (
                <tr>
                  <td colSpan={9}>
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
                    <td>{c.paymentDate || '—'}</td>
                    <td className="truncate">{[c.bankName, c.bsrCode].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="ui-money">{formatMoney(c.taxAmount, currentCompany)}</td>
                    <td className="ui-money">{formatMoney(c.interest, currentCompany)}</td>
                    <td className="ui-money">{formatMoney(c.lateFee, currentCompany)}</td>
                    <td className="ui-money">{formatMoney(c.totalAmount, currentCompany)}</td>
                    <td className="ui-money">{formatMoney(c.allocated, currentCompany)}</td>
                    <td><StatusPill status={c.status} /></td>
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
