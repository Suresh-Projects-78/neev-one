import React, { useMemo, useState } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { PageHeader, EmptyState, StatusPill } from '../../components/ui/Primitives';
import { notify, confirmDialog } from '../../components/ui/notify';
import { formatMoney } from '../../utils/money';
import { advanceRunDate } from '../../hooks/useRecurringInvoices';

/**
 * Recurring invoice schedules — rent, AMC, subscriptions, retainers.
 *
 * A schedule is a snapshot of an invoice plus a cadence. Due periods
 * materialise as DRAFT invoices (on sign-in, or the Run button here); each
 * draft is then reviewed, saved (→ Sent), and collected (→ Paid) like any
 * invoice. Status chain per schedule: Scheduled → Generated → Sent → Paid.
 */

const FREQ_LABEL = { WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly' };

export default function RecurringInvoices({ db, setDb, currentCompany }) {
  const companyId = currentCompany.id;
  const templates = useMemo(
    () => (Array.isArray(db.recurringTemplates) ? db.recurringTemplates.filter((t) => t.companyId === companyId) : []),
    [db.recurringTemplates, companyId]
  );
  const invoices = useMemo(() => (db.invoices || []).filter((i) => i.companyId === companyId), [db.invoices, companyId]);

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [sourceInvoiceId, setSourceInvoiceId] = useState('');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 10); // 1st of next month
  });
  const [endDate, setEndDate] = useState('');

  /** Latest generated invoice for a schedule decides its lifecycle stage. */
  const stageOf = (t) => {
    const generated = invoices
      .filter((i) => Number(i.recurringTemplateId) === Number(t.id))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    if (!generated.length) return { stage: 'Scheduled', latest: null, count: 0 };
    const latest = generated[0];
    const st = String(latest.status || '').toLowerCase();
    const stage = st === 'paid' ? 'Paid' : st === 'draft' ? 'Generated' : 'Sent';
    return { stage, latest, count: generated.length };
  };

  const createSchedule = () => {
    const src = invoices.find((i) => Number(i.id) === Number(sourceInvoiceId));
    if (!src) {
      notify.error('Pick the invoice to repeat.');
      return;
    }
    if (!startDate) {
      notify.error('Pick the first run date.');
      return;
    }
    const nextId = (db.recurringTemplates || []).reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1;
    setDb((prev) => ({
      ...prev,
      recurringTemplates: [
        ...(prev.recurringTemplates || []),
        {
          id: nextId,
          companyId,
          sourceInvoiceId: src.id,
          sourceNumber: src.number,
          customerId: src.customerId,
          customerName: src.customerName,
          items: src.items || [],
          subtotal: src.subtotal,
          cgstTotal: src.cgstTotal,
          sgstTotal: src.sgstTotal,
          igstTotal: src.igstTotal,
          gstTotal: src.gstTotal,
          total: src.total,
          frequency,
          nextRunDate: startDate,
          endDate: endDate || null,
          active: true,
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    setCreatorOpen(false);
    setSourceInvoiceId('');
    notify.success(`${src.customerName || 'Invoice'} will repeat ${FREQ_LABEL[frequency].toLowerCase()} from ${startDate}.`);
  };

  /** Materialise every due period for one schedule right now. */
  const runNow = (t) => {
    const today = new Date().toISOString().slice(0, 10);
    let createdCount = 0;
    setDb((prev) => {
      const list = Array.isArray(prev.invoices) ? [...prev.invoices] : [];
      let nextId = list.reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
      let run = t.nextRunDate;
      let guard = 0;
      while (run && run <= today && guard < 12 && (!t.endDate || run <= t.endDate)) {
        guard += 1;
        createdCount += 1;
        list.push({
          id: ++nextId,
          companyId,
          number: '',
          date: run,
          dueDate: '',
          customerId: t.customerId,
          customerName: t.customerName,
          items: t.items || [],
          subtotal: t.subtotal,
          cgstTotal: t.cgstTotal,
          sgstTotal: t.sgstTotal,
          igstTotal: t.igstTotal,
          gstTotal: t.gstTotal,
          total: t.total,
          paidAmount: 0,
          status: 'Draft',
          recurringTemplateId: t.id,
          createdAt: new Date().toISOString(),
        });
        run = advanceRunDate(run, t.frequency);
      }
      if (!createdCount) return prev;
      return {
        ...prev,
        invoices: list,
        recurringTemplates: (prev.recurringTemplates || []).map((x) =>
          x.id === t.id ? { ...x, nextRunDate: run, lastRunAt: new Date().toISOString() } : x
        ),
      };
    });
    setTimeout(() => {
      if (createdCount > 0) notify.success(`${createdCount} draft invoice${createdCount === 1 ? '' : 's'} generated — review and save to post.`);
      else notify.info('Nothing due yet — next run is in the future.');
    }, 300);
  };

  const toggle = (t) =>
    setDb((prev) => ({
      ...prev,
      recurringTemplates: (prev.recurringTemplates || []).map((x) => (x.id === t.id ? { ...x, active: x.active === false } : x)),
    }));

  const remove = async (t) => {
    const ok = await confirmDialog({
      title: 'Delete schedule',
      message: `Stop repeating for ${t.customerName || t.sourceNumber}? Already-generated invoices stay.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDb((prev) => ({ ...prev, recurringTemplates: (prev.recurringTemplates || []).filter((x) => x.id !== t.id) }));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Recurring Invoices"
          description="Rent, AMC, subscriptions, retainers — schedules raise draft invoices on their own; you review and send."
        />
        <button type="button" onClick={() => setCreatorOpen(true)} className="ui-btn ui-btn-primary">
          <Plus size={15} aria-hidden="true" /> New Schedule
        </button>
      </div>

      {creatorOpen ? (
        <div className="ui-card space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="ui-label">Repeat this invoice</label>
              <select value={sourceInvoiceId} onChange={(e) => setSourceInvoiceId(e.target.value)} className="ui-select w-full px-3 py-2">
                <option value="">Select invoice</option>
                {invoices
                  .filter((i) => String(i.status || '') !== 'Cancelled')
                  .slice()
                  .sort((a, b) => String(b.date).localeCompare(String(a.date)))
                  .slice(0, 100)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.number || '(draft)'} — {i.customerName} — {formatMoney(Number(i.total || 0), currentCompany)}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="ui-label">Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="ui-select w-full px-3 py-2">
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div>
              <label className="ui-label">First run (e.g. every 1st)</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="ui-input w-full px-3 py-2" />
            </div>
            <div>
              <label className="ui-label">End date (optional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="ui-input w-full px-3 py-2" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreatorOpen(false)} className="ui-btn ui-btn-secondary">Cancel</button>
            <button type="button" onClick={createSchedule} className="ui-btn ui-btn-primary">Create Schedule</button>
          </div>
        </div>
      ) : null}

      {templates.length === 0 ? (
        <div className="ui-card">
          <EmptyState
            icon={RefreshCw}
            title="No recurring schedules"
            description="Pick any invoice and set a cadence — ₹25,000 · Monthly · every 1st. Drafts appear on schedule; you review and send."
          />
        </div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Customer</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium ui-muted uppercase">Amount</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Frequency</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Next run</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Generated</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Lifecycle</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Schedule</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => {
                const { stage, count } = stageOf(t);
                return (
                  <tr key={t.id} className="border-t">
                    <td className="ui-col-entity px-4 py-2.5 font-medium">{t.customerName || '—'}</td>
                    <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(t.total || 0), currentCompany)}</td>
                    <td className="px-4 py-2.5">{FREQ_LABEL[t.frequency] || 'Monthly'}</td>
                    <td className="ui-col-date px-4 py-2.5">{t.active === false ? '—' : t.nextRunDate || '—'}</td>
                    <td className="px-4 py-2.5">{count}</td>
                    <td className="px-4 py-2.5">
                      <span className="ui-caption">Scheduled → Generated → Sent → Paid</span>
                      <div><StatusPill status={stage} /></div>
                    </td>
                    <td className="px-4 py-2.5"><StatusPill status={t.active === false ? 'Paused' : 'Active'} /></td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button type="button" onClick={() => runNow(t)} disabled={t.active === false} className="ui-btn ui-btn-secondary !h-8 text-xs">
                          Run now
                        </button>
                        <button type="button" onClick={() => toggle(t)} className="ui-btn ui-btn-secondary !h-8 text-xs">
                          {t.active === false ? 'Resume' : 'Pause'}
                        </button>
                        <button type="button" onClick={() => remove(t)} className="ui-icon-btn !h-8 !w-8" aria-label="Delete schedule">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
