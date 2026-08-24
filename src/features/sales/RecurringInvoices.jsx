import React, { useMemo, useState } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { PageHeader, EmptyState, StatusPill } from '../../components/ui/Primitives';
import { ListToolbar, exportRows, useListSearch } from '../../components/ListToolbar';
import { notify, confirmDialog } from '../../components/ui/notify';
import { formatMoney } from '../../utils/money';
import { advanceRunDate } from '../../hooks/useRecurringInvoices';
import CustomerPicker from '../../components/pickers/CustomerPicker';
import ItemPicker from '../../components/pickers/ItemPicker';
import { computeGstForLines } from '../../utils/gst';

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
  // A schedule can copy an invoice that already exists, or be written from
  // scratch — a retainer that has never been billed once still needs to repeat.
  const [mode, setMode] = useState('NEW');
  const [sourceInvoiceId, setSourceInvoiceId] = useState('');
  const emptyLine = { itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 };
  const [draft, setDraft] = useState({ customerId: '', notes: '', items: [{ ...emptyLine }] });
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

  const itemsMaster = useMemo(
    () => (db.items || []).filter((i) => i.companyId === companyId),
    [db.items, companyId]
  );
  const customers = useMemo(
    () => (db.customers || []).filter((c) => c.companyId === companyId),
    [db.customers, companyId]
  );

  const setLine = (idx, patch) =>
    setDraft((prev) => ({ ...prev, items: prev.items.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));

  const pickItem = (idx, itemId, picked) => {
    const master = picked || itemsMaster.find((i) => String(i.id) === String(itemId));
    if (!master) {
      setLine(idx, { itemId: '' });
      return;
    }
    setLine(idx, {
      itemId: String(master.id),
      description: master.name || '',
      rate: Number(master.salePrice ?? 0),
      gstRate: Number(master.gstRate ?? 0),
      hsnSac: master.hsnSac || '',
    });
  };

  /** The lines a scratch schedule will repeat, priced and taxed. */
  const draftTotals = useMemo(() => {
    const lines = draft.items
      .filter((l) => String(l.itemId || '').trim())
      .map((l) => ({
        ...l,
        quantity: Number(l.quantity) || 0,
        rate: Number(l.rate) || 0,
        gstRate: Number(l.gstRate) || 0,
        amount: Math.round((Number(l.quantity) || 0) * (Number(l.rate) || 0) * 100) / 100,
      }));
    const customer = customers.find((c) => String(c.id) === String(draft.customerId));
    const companyStateName = String(currentCompany?.state || '').trim().toLowerCase();
    const customerStateName = String(customer?.billingAddress?.state || customer?.state || '').trim().toLowerCase();
    const isIntra = !companyStateName || !customerStateName || companyStateName === customerStateName;
    const computed = computeGstForLines({ lines, isIntra });
    return { lines: computed.lines || lines, ...computed, customer };
  }, [draft.items, draft.customerId, customers, currentCompany?.state]);

  const createSchedule = () => {
    if (!startDate) {
      notify.error('Pick the first run date.');
      return;
    }

    if (mode === 'NEW') {
      if (!String(draft.customerId || '').trim()) {
        notify.error('Pick the customer this repeats for.');
        return;
      }
      if (!draftTotals.lines.length) {
        notify.error('Add at least one line to repeat.');
        return;
      }
      const nextTemplateId = (db.recurringTemplates || []).reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1;
      const customerName = draftTotals.customer?.displayName || draftTotals.customer?.name || '';
      setDb((prev) => ({
        ...prev,
        recurringTemplates: [
          ...(prev.recurringTemplates || []),
          {
            id: nextTemplateId,
            companyId,
            sourceInvoiceId: null,
            sourceNumber: '',
            customerId: draft.customerId,
            customerName,
            items: draftTotals.lines,
            subtotal: draftTotals.subtotal,
            cgstTotal: draftTotals.cgstTotal,
            sgstTotal: draftTotals.sgstTotal,
            igstTotal: draftTotals.igstTotal,
            gstTotal: draftTotals.gstTotal,
            total: draftTotals.total,
            notes: draft.notes || '',
            frequency,
            nextRunDate: startDate,
            endDate: endDate || null,
            active: true,
            createdAt: new Date().toISOString(),
          },
        ],
      }));
      setCreatorOpen(false);
      setDraft({ customerId: '', notes: '', items: [{ ...emptyLine }] });
      notify.success(`${customerName || 'This schedule'} will repeat ${FREQ_LABEL[frequency].toLowerCase()} from ${startDate}.`);
      return;
    }

    const src = invoices.find((i) => Number(i.id) === Number(sourceInvoiceId));
    if (!src) {
      notify.error('Pick the invoice to repeat.');
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

  const recSearch = useListSearch(templates, ['customerName', 'frequency', 'status', 'nextRunDate']);
  const shownTemplates = recSearch.filtered;
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
          <div className="flex gap-2">
            {[
              { id: 'NEW', label: 'Write a new one' },
              { id: 'COPY', label: 'Repeat an existing invoice' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  mode === m.id ? 'ui-sunken ui-fg ui-border-strong-c font-medium' : 'ui-surface ui-muted ui-border-c'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {mode === 'NEW' ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <CustomerPicker
                  db={db}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  value={draft.customerId}
                  onChange={(customerId) => setDraft((p) => ({ ...p, customerId }))}
                />
                <div>
                  <label className="ui-label">Notes (optional)</label>
                  <input
                    type="text"
                    value={draft.notes}
                    onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                    className="ui-input w-full px-3 py-2"
                    placeholder="Shown on every invoice this raises"
                  />
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <table className="ui-table w-full">
                  <thead className="ui-sunken border-b">
                    <tr>
                      <th className="ui-th">Item</th>
                      <th className="ui-th ui-num w-24">Qty</th>
                      <th className="ui-th ui-num w-32">Rate</th>
                      <th className="ui-th ui-num w-20">GST %</th>
                      <th className="ui-th ui-num w-32">Amount</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {draft.items.map((l, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <ItemPicker
                            db={db}
                            setDb={setDb}
                            currentCompany={currentCompany}
                            value={l.itemId}
                            onChange={(itemId, picked) => pickItem(idx, itemId, picked)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.quantity}
                            onChange={(e) => setLine(idx, { quantity: e.target.value })}
                            className="ui-input w-full px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={l.rate}
                            onChange={(e) => setLine(idx, { rate: e.target.value })}
                            className="ui-input w-full px-2 py-1 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-right ui-muted">{Number(l.gstRate) || 0}%</td>
                        <td className="px-3 py-2 text-right font-medium">
                          {formatMoney((Number(l.quantity) || 0) * (Number(l.rate) || 0), currentCompany)}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => setDraft((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }))}
                            disabled={draft.items.length === 1}
                            className="ui-subtle hover:text-[rgb(var(--neg))] disabled:opacity-40"
                            aria-label="Remove line"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, items: [...p.items, { ...emptyLine }] }))}
                  className="ui-btn ui-btn-secondary !h-8 text-xs"
                >
                  <Plus size={14} /> Add line
                </button>
                <div className="text-sm">
                  <span className="ui-muted mr-2">Each run:</span>
                  <span className="font-semibold">{formatMoney(draftTotals.total || 0, currentCompany)}</span>
                  <span className="ui-muted text-xs ml-2">
                    ({formatMoney(draftTotals.subtotal || 0, currentCompany)} + {formatMoney(draftTotals.gstTotal || 0, currentCompany)} GST)
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-4">
            {mode === 'COPY' ? (
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
            ) : null}
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

      <ListToolbar
        search={recSearch.query}
        onSearch={recSearch.setQuery}
        placeholder="Search schedules (customer, frequency, status)"
        count={shownTemplates.length}
        countLabel="schedules"
        onExport={() =>
          exportRows({
            fileName: `RecurringInvoices_${currentCompany?.name || 'company'}`,
            label: 'schedule(s)',
            columns: [
              { key: 'customerName', label: 'Customer' },
              { key: 'amount', label: 'Amount', value: (r) => Number(r.amount || 0) },
              { key: 'frequency', label: 'Frequency' },
              { key: 'nextRunDate', label: 'Next run' },
              { key: 'endDate', label: 'Ends' },
              { key: 'status', label: 'Status' },
            ],
            rows: shownTemplates,
          })
        }
      />

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
                <th className="ui-th">Customer</th>
                <th className="ui-th ui-num">Amount</th>
                <th className="ui-th">Frequency</th>
                <th className="ui-th">Next run</th>
                <th className="ui-th">Generated</th>
                <th className="ui-th">Lifecycle</th>
                <th className="ui-th">Schedule</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {shownTemplates.map((t) => {
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
