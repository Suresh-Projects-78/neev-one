import React, { useMemo, useState } from 'react';
import { CalendarClock, Download, FileText, MoreVertical, Pause, PauseCircle, Play, Plus, Receipt, RefreshCw, Settings, Trash2 } from 'lucide-react';
import { EmptyState, StatusPill } from '../../components/ui/Primitives';
import DocumentListShell from '../../components/list/DocumentListShell';
import { exportRows, useListSearch } from '../../components/ListToolbar';
import { notify, confirmDialog } from '../../components/ui/notify';
import { formatMoney } from '../../utils/money';
import { branchLabel } from '../../utils/branchLabel';
import { advanceRunDate } from '../../hooks/useRecurringInvoices';
import CustomerPicker from '../../components/pickers/CustomerPicker';
import ItemPicker from '../../components/pickers/ItemPicker';
import { computeGstForLines } from '../../utils/gst';
import { DocumentNumber, SalesDate, DueDate, MoneyValue, SalesBalance } from '../../components/docs';
import { patchSchedule, removeSchedule, saveSchedule } from '../../utils/recurringSync';
import { runSchedulesNow } from '../../api/recurring';

/**
 * Recurring invoice schedules — rent, AMC, subscriptions, retainers.
 *
 * A schedule is a snapshot of an invoice plus a cadence. Due periods
 * materialise as DRAFT invoices (on sign-in, or the Run button here); each
 * draft is then reviewed, saved (→ Sent), and collected (→ Paid) like any
 * invoice. Status chain per schedule: Scheduled → Generated → Sent → Paid.
 */

const FREQ_LABEL = { WEEKLY: 'Weekly', MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', YEARLY: 'Yearly' };
const INTERVAL_UNIT = { WEEKLY: 'week(s)', MONTHLY: 'month(s)', QUARTERLY: 'quarter(s)', YEARLY: 'year(s)' };

export default function RecurringInvoices({ db, setDb, currentCompany, onNavigate = null, branches = [], warehouses = [] }) {
  const companyId = currentCompany.id;
  const templates = useMemo(
    () => (Array.isArray(db.recurringTemplates) ? db.recurringTemplates.filter((t) => t.companyId === companyId) : []),
    [db.recurringTemplates, companyId]
  );
  const invoices = useMemo(() => (db.invoices || []).filter((i) => i.companyId === companyId), [db.invoices, companyId]);

  const [creatorOpen, setCreatorOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState(null);
  // A schedule can copy an invoice that already exists, or be written from
  // scratch — a retainer that has never been billed once still needs to repeat.
  const [mode, setMode] = useState('NEW');
  const [sourceInvoiceId, setSourceInvoiceId] = useState('');
  const emptyLine = { itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 };
  const [draft, setDraft] = useState({ customerId: '', notes: '', items: [{ ...emptyLine }] });
  /*
   * What this schedule is called.
   *
   * A customer can have three of them — rent, AMC, a retainer — and every row
   * read "ABC Traders · Monthly" without it, so the list could not be scanned
   * and the ⋮ menu acted on whichever one you guessed.
   */
  const [scheduleName, setScheduleName] = useState('');
  /*
   * The rest of what a schedule needs to raise a usable invoice.
   *
   * `interval` is how many periods to skip — every second month. `endMode`
   * chooses between running forever and stopping after a count, which is a
   * different instruction from an end date: "bill twelve times" needs nobody
   * to work out which month that lands in. `dueDays` finally gives the raised
   * draft a due date; without one every generated invoice sat outside the
   * ageing report until somebody opened it and typed one.
   */
  const [interval, setInterval_] = useState(1);
  const [endMode, setEndMode] = useState('NONE');
  const [maxOccurrences, setMaxOccurrences] = useState('');
  const [dueDays, setDueDays] = useState(30);
  const [scheduleBranchId, setScheduleBranchId] = useState('');
  const [scheduleWarehouseId, setScheduleWarehouseId] = useState('');
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

  const createSchedule = async () => {
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
      /*
       * The server keeps the schedule and raises its invoices. This screen used
       * to do both, which meant a business that took a fortnight off billed
       * nobody.
       */
      const scheduleServerPatch = await saveSchedule({
        name: scheduleName.trim() || customerName,
        customerId: draft.customerId,
        customerName,
        branchId: scheduleBranchId,
        warehouseId: scheduleWarehouseId,
        frequency,
        interval,
        nextRunDate: startDate,
        endDate: endDate || null,
        maxOccurrences: endMode === 'COUNT' ? maxOccurrences : null,
        dueDays,
        notes: draft.notes || '',
        items: draftTotals.lines,
        subtotal: draftTotals.subtotal,
        cgstTotal: draftTotals.cgstTotal,
        sgstTotal: draftTotals.sgstTotal,
        igstTotal: draftTotals.igstTotal,
        gstTotal: draftTotals.gstTotal,
        total: draftTotals.total,
      });
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
            name: scheduleName.trim(),
            branchId: scheduleBranchId,
            warehouseId: scheduleWarehouseId,
            interval: Math.max(1, Number(interval) || 1),
            maxOccurrences: endMode === 'COUNT' ? Math.max(1, Number(maxOccurrences) || 1) : null,
            generatedCount: 0,
            dueDays: Number(dueDays) >= 0 ? Number(dueDays) : 30,
            frequency,
            nextRunDate: startDate,
            endDate: endDate || null,
            active: true,
            createdAt: new Date().toISOString(),
            ...scheduleServerPatch,
          },
        ],
      }));
      setCreatorOpen(false);
      setDraft({ customerId: '', notes: '', items: [{ ...emptyLine }] });
      setScheduleName('');
      notify.success(`${customerName || 'This schedule'} will repeat ${FREQ_LABEL[frequency].toLowerCase()} from ${startDate}.`);
      return;
    }

    const src = invoices.find((i) => Number(i.id) === Number(sourceInvoiceId));
    if (!src) {
      notify.error('Pick the invoice to repeat.');
      return;
    }
    const nextId = (db.recurringTemplates || []).reduce((m, t) => Math.max(m, Number(t.id) || 0), 0) + 1;
    const scheduleServerPatch = await saveSchedule({
      name: scheduleName.trim() || src.customerName,
      customerId: src.customerId,
      customerName: src.customerName,
      branchId: scheduleBranchId,
      warehouseId: scheduleWarehouseId,
      frequency,
      interval,
      nextRunDate: startDate,
      endDate: endDate || null,
      maxOccurrences: endMode === 'COUNT' ? maxOccurrences : null,
      dueDays,
      items: src.items || [],
      subtotal: src.subtotal,
      cgstTotal: src.cgstTotal,
      sgstTotal: src.sgstTotal,
      igstTotal: src.igstTotal,
      gstTotal: src.gstTotal,
      total: src.total,
    });
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
          name: scheduleName.trim(),
          branchId: scheduleBranchId,
          warehouseId: scheduleWarehouseId,
          interval: Math.max(1, Number(interval) || 1),
          maxOccurrences: endMode === 'COUNT' ? Math.max(1, Number(maxOccurrences) || 1) : null,
          generatedCount: 0,
          dueDays: Number(dueDays) >= 0 ? Number(dueDays) : 30,
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
          ...scheduleServerPatch,
        },
      ],
    }));
    setCreatorOpen(false);
    setSourceInvoiceId('');
    setScheduleName('');
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

  const toggle = (t) => {
    // Paused here means paused on the server too, or the hourly job keeps
    // billing a customer somebody has just stopped billing.
    patchSchedule(t, { isActive: t.active === false });
    setDb((prev) => ({
      ...prev,
      recurringTemplates: (prev.recurringTemplates || []).map((x) => (x.id === t.id ? { ...x, active: x.active === false } : x)),
    }));
  };

  const remove = async (t) => {
    const ok = await confirmDialog({
      title: 'Delete schedule',
      message: `Stop repeating for ${t.customerName || t.sourceNumber}? Already-generated invoices stay.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    await removeSchedule(t);
    setDb((prev) => ({ ...prev, recurringTemplates: (prev.recurringTemplates || []).filter((x) => x.id !== t.id) }));
  };

  /**
   * The schedule read back as a sentence, before it is created.
   *
   * A cadence assembled from five controls is easy to get wrong and hard to
   * check by looking at the controls themselves — this is the same settings
   * stated the way somebody would say them out loud.
   */
  const schedulePreview = useMemo(() => {
    const n = Math.max(1, Number(interval) || 1);
    const unit = (INTERVAL_UNIT[frequency] || 'month(s)').replace('(s)', n === 1 ? '' : 's');
    const every = n === 1 ? `every ${unit}` : `every ${n} ${unit}`;
    const from = startDate ? ` from ${startDate}` : '';
    const stop =
      endMode === 'COUNT' && Number(maxOccurrences) > 0
        ? `, stopping after ${Number(maxOccurrences)} invoice${Number(maxOccurrences) === 1 ? '' : 's'}`
        : endDate
          ? `, ending ${endDate}`
          : ', with no end';
    const terms = Number(dueDays) > 0 ? ` Each invoice is due ${Number(dueDays)} days later.` : ' Each invoice is due on receipt.';
    return `Raises a draft invoice ${every}${from}${stop}.${terms}`;
  }, [interval, frequency, startDate, endDate, endMode, maxOccurrences, dueDays]);

  const exportSchedules = () =>
    exportRows({
      fileName: `RecurringInvoices_${currentCompany?.name || 'company'}`,
      label: 'schedule(s)',
      columns: [
        { key: 'name', label: 'Schedule name' },
        { key: 'customerName', label: 'Customer' },
        { key: 'frequency', label: 'Frequency' },
        { key: 'total', label: 'Amount', value: (r) => Number(r.total || 0) },
        { key: 'nextRunDate', label: 'Next invoice date' },
        { key: 'status', label: 'Status', value: (r) => scheduleStatus(r) },
      ],
      rows: shownTemplates,
    });

  const recSearch = useListSearch(templates, ['name', 'customerName', 'frequency', 'status', 'nextRunDate', 'sourceNumber']);

  const [customerFilter, setCustomerFilter] = useState('');
  const [freqFilter, setFreqFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 20;

  /** Active, paused, or finished — one word per schedule, from its own state. */
  const scheduleStatus = (t) => {
    if (t.active === false) return 'Paused';
    const end = String(t.endDate || '').slice(0, 10);
    if (end && end < new Date().toISOString().slice(0, 10)) return 'Inactive';
    return 'Active';
  };

  /*
   * The four narrowings the list offers, in the order the eye reads them, and
   * the date range applied to the next run — the column people are actually
   * looking at when they ask "what is due this month".
   */
  const shownTemplates = useMemo(() => {
    const from = String(fromDate || '').trim();
    const to = String(toDate || '').trim();
    return recSearch.filtered.filter((t) => {
      if (customerFilter && String(t.customerId || '') !== customerFilter) return false;
      if (freqFilter && String(t.frequency || '') !== freqFilter) return false;
      if (statusFilter && scheduleStatus(t) !== statusFilter) return false;
      const next = String(t.nextRunDate || '').slice(0, 10);
      if (from && (!next || next < from)) return false;
      if (to && (!next || next > to)) return false;
      return true;
    });
    // scheduleStatus reads only the row it is given.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recSearch.filtered, customerFilter, freqFilter, statusFilter, fromDate, toDate]);

  const pageCount = Math.max(1, Math.ceil(shownTemplates.length / perPage));
  const safePage = Math.min(page, pageCount);
  const pagedTemplates = shownTemplates.slice((safePage - 1) * perPage, safePage * perPage);

  const REC_STATUS_TABS = [
    { value: '', label: 'All', tone: 'all' },
    { value: 'Active', label: 'Active', tone: 'paid' },
    { value: 'Paused', label: 'Paused', tone: 'draft' },
    { value: 'Inactive', label: 'Finished', tone: 'cancelled' },
  ];

  const recStatusCounts = useMemo(() => {
    const counts = { '': recSearch.filtered.length };
    for (const t of recSearch.filtered) {
      const st = scheduleStatus(t);
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recSearch.filtered]);

  /*
   * What a schedule list is read for: how much of the month's billing raises
   * itself, and how much of it has stopped doing so. Amounts are normalised to
   * a month — a quarterly retainer is a third of itself every month, and
   * comparing a yearly AMC against a monthly rent at face value says nothing.
   */
  const recHeadline = useMemo(() => {
    const PER_YEAR = { WEEKLY: 52, FORTNIGHTLY: 26, MONTHLY: 12, QUARTERLY: 4, HALF_YEARLY: 2, YEARLY: 1 };
    let monthly = 0;
    let paused = 0;
    let active = 0;
    let dueThisMonth = 0;
    const monthEnd = new Date();
    monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
    const monthEndIso = monthEnd.toISOString().slice(0, 10);
    for (const t of shownTemplates) {
      const amt = Number(t.amount ?? t.total ?? 0);
      const perYear = PER_YEAR[String(t.frequency || 'MONTHLY').toUpperCase()] ?? 12;
      const perMonth = (amt * perYear) / 12;
      const st = scheduleStatus(t);
      if (st === 'Active') {
        active += 1;
        monthly += perMonth;
        const next = String(t.nextRunDate || '').slice(0, 10);
        if (next && next <= monthEndIso) dueThisMonth += amt;
      } else if (st === 'Paused') {
        paused += perMonth;
      }
    }
    return { count: shownTemplates.length, active, monthly, paused, dueThisMonth };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownTemplates]);

  const scheduleCustomers = useMemo(() => {
    const seen = new Map();
    for (const t of templates) {
      const id = String(t.customerId || '');
      if (id && !seen.has(id)) seen.set(id, t.customerName || id);
    }
    return [...seen.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
  }, [templates]);
  return (
    <DocumentListShell
      title="Recurring Invoices"
      description="Schedules live on the server and raise their drafts hourly, whether or not anyone is signed in. You review and send."
      company={currentCompany}
      search={{
        value: recSearch.query,
        onChange: (v) => {
          recSearch.setQuery(v);
          setPage(1);
        },
        placeholder: 'Search schedules…',
        label: 'Search schedules',
      }}
      headerExtras={
        /*
          The server raises these hourly on its own. This is for somebody who
          does not want to wait for the hour — and it is safe to press twice,
          because a period that has already been billed is claimed and cannot
          be billed again.
        */
        <button
          type="button"
          onClick={async () => {
            try {
              const r = await runSchedulesNow();
              notify.success(
                r?.raised
                  ? `${r.raised} draft invoice${r.raised === 1 ? '' : 's'} raised — review and save to post.`
                  : 'Nothing is due right now.'
              );
            } catch (e) {
              notify.error(`Could not run the schedules: ${String(e?.message || e)}`);
            }
          }}
          className="ui-btn ui-btn-secondary"
        >
          Run now
        </button>
      }
      moreItems={[
        { key: 'export', label: 'Export schedules', Icon: Download },
        { sep: true },
        { key: 'settingsInvoiceFields', label: 'Invoice settings', Icon: Settings, group: 'Configure — every invoice' },
      ]}
      onMoreSelect={(k) => {
        if (k === 'export') {
          exportSchedules();
          return;
        }
        if (typeof onNavigate === 'function') onNavigate(k);
      }}
      primary={
        <button type="button" onClick={() => setCreatorOpen(true)} className="ui-btn ui-btn-primary">
          <Plus size={16} aria-hidden="true" /> New Schedule
        </button>
      }
      cards={[
        { label: 'Total schedules', value: recHeadline.count, count: true, tone: 'draft', Icon: RefreshCw },
        { label: 'Active schedules', value: recHeadline.active, count: true, tone: 'paid', Icon: CalendarClock },
        { label: 'Billing per month', value: recHeadline.monthly, tone: 'sent', Icon: FileText },
        { label: 'Due this month', value: recHeadline.dueThisMonth, tone: 'outstanding', Icon: Receipt },
        { label: 'Paused per month', value: recHeadline.paused, tone: 'cancelled', Icon: PauseCircle },
      ]}
      tabs={REC_STATUS_TABS}
      tabsLabel="Schedule status"
      statusValue={statusFilter}
      statusCounts={recStatusCounts}
      onStatusChange={(v) => {
        setStatusFilter(v);
        setPage(1);
      }}
      tip={{
        storageKey: 'neev.tip.recurringSchedules',
        text: 'A schedule bills its period once. Pressing Run now twice cannot raise the same month again.',
        Icon: RefreshCw,
      }}
      above={
        <>
      {creatorOpen ? (
        <div className="ui-card space-y-4 p-5">
          <div>
            <label htmlFor="rec-name" className="ui-label">
              Schedule name
            </label>
            <input
              id="rec-name"
              type="text"
              value={scheduleName}
              onChange={(e) => setScheduleName(e.target.value)}
              className="ui-input w-full sm:max-w-sm"
              placeholder="Office rent, AMC, monthly retainer…"
            />
            <p className="mt-1 text-xs ui-muted">
              What this one is for. A customer can have several, and the list is read by name.
            </p>
          </div>

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
                    className="ui-input w-full"
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
                      <th className="ui-th ui-num w-32">Rate (₹)</th>
                      <th className="ui-th ui-num w-20">Tax %</th>
                      <th className="ui-th ui-num w-32">Amount (₹)</th>
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
                        <td className="ui-money px-3 py-2 text-right">
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
                {/* Named as every other line grid names it. A schedule is not
                    a document — it has no number, no date and nothing to post —
                    so it keeps its own chrome, but the grid under it behaves
                    like the invoice's. */}
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, items: [...p.items, { ...emptyLine }] }))}
                  className="ui-btn ui-btn-secondary"
                >
                  <Plus size={15} aria-hidden="true" /> Add Item
                </button>
                <div className="text-sm">
                  <span className="ui-muted mr-2">Each run:</span>
                  <span className="ui-money">{formatMoney(draftTotals.total || 0, currentCompany)}</span>
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
              <select value={sourceInvoiceId} onChange={(e) => setSourceInvoiceId(e.target.value)} className="ui-select w-full">
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
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)} className="ui-select w-full">
                <option value="WEEKLY">Weekly</option>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div>
              {/* Every period, or every second, or every third. "Quarterly" and
                  "every 3 months" are the same to a calendar and not to the
                  person setting it up. */}
              <label className="ui-label" htmlFor="rec-interval">Repeat every</label>
              <div className="flex items-center gap-2">
                <input
                  id="rec-interval"
                  type="number"
                  min="1"
                  max="52"
                  value={interval}
                  onChange={(e) => setInterval_(e.target.value)}
                  className="ui-input ui-mono w-20"
                />
                <span className="ui-muted text-sm">{INTERVAL_UNIT[frequency] || 'month(s)'}</span>
              </div>
            </div>
            <div>
              <label className="ui-label">Start date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="ui-input w-full" />
            </div>
            <div>
              <label className="ui-label">End date (optional)</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="ui-input w-full" />
            </div>
            <div className="sm:col-span-2">
              {/* An end date and a count are two different instructions.
                  "Bill twelve times" needs nobody to work out which month
                  that lands in. */}
              <span className="ui-label block mb-1">Number of invoices</span>
              <div className="flex items-center gap-4 flex-wrap">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="rec-end-mode"
                    checked={endMode === 'NONE'}
                    onChange={() => setEndMode('NONE')}
                  />
                  No limit
                </label>
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="rec-end-mode"
                    checked={endMode === 'COUNT'}
                    onChange={() => setEndMode('COUNT')}
                  />
                  End after
                </label>
                <input
                  type="number"
                  min="1"
                  aria-label="Number of invoices"
                  disabled={endMode !== 'COUNT'}
                  value={maxOccurrences}
                  onChange={(e) => setMaxOccurrences(e.target.value)}
                  className="ui-input ui-mono w-24"
                />
                <span className="ui-muted text-sm">invoices</span>
              </div>
            </div>
            <div>
              {/* Every draft this raised had an empty due date, so none of them
                  could ever be overdue and none appeared in the ageing report
                  until a person opened it and typed one. */}
              <label className="ui-label" htmlFor="rec-due">Payment terms on each invoice</label>
              <select
                id="rec-due"
                value={String(dueDays)}
                onChange={(e) => setDueDays(e.target.value)}
                className="ui-select w-full"
              >
                <option value="0">Due on receipt</option>
                <option value="7">Net 7 days</option>
                <option value="15">Net 15 days</option>
                <option value="30">Net 30 days</option>
                <option value="45">Net 45 days</option>
                <option value="60">Net 60 days</option>
              </select>
            </div>
            <div>
              <label className="ui-label" htmlFor="rec-branch">Branch</label>
              <select
                id="rec-branch"
                value={scheduleBranchId}
                onChange={(e) => setScheduleBranchId(e.target.value)}
                className="ui-select w-full"
              >
                <option value="">All branches</option>
                {(Array.isArray(branches) ? branches : []).map((b) => (
                  <option key={String(b.id)} value={String(b.id)}>{branchLabel(b)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label" htmlFor="rec-warehouse">Warehouse</label>
              <select
                id="rec-warehouse"
                value={scheduleWarehouseId}
                onChange={(e) => setScheduleWarehouseId(e.target.value)}
                className="ui-select w-full"
              >
                <option value="">Not set</option>
                {(Array.isArray(warehouses) ? warehouses : []).map((w) => (
                  <option key={String(w.id)} value={String(w.id)}>{w.name || `Warehouse ${w.id}`}</option>
                ))}
              </select>
            </div>
          </div>

          {/* What this will actually do, in a sentence, before it is created. */}
          <p className="ui-caption">{schedulePreview}</p>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCreatorOpen(false)} className="ui-btn ui-btn-secondary">Cancel</button>
            <button type="button" onClick={createSchedule} className="ui-btn ui-btn-primary">Create Schedule</button>
          </div>
        </div>
      ) : null}

        </>
      }
    >
      {/* Customer, frequency and the date window. Search and status moved to
          the header and the tabs, where every other list keeps them; what is
          left is what those two cannot say. */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
        <select
          className="ui-select w-auto"
          value={customerFilter}
          onChange={(e) => { setCustomerFilter(e.target.value); setPage(1); }}
          aria-label="Customer"
        >
          <option value="">All customers</option>
          {scheduleCustomers.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        <select
          className="ui-select w-auto"
          value={freqFilter}
          onChange={(e) => { setFreqFilter(e.target.value); setPage(1); }}
          aria-label="Frequency"
        >
          <option value="">All frequencies</option>
          {Object.entries(FREQ_LABEL).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <input
            type="date"
            className="ui-input w-auto"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
            aria-label="Next invoice date from"
          />
          <span className="ui-subtle">–</span>
          <input
            type="date"
            className="ui-input w-auto"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1); }}
            aria-label="Next invoice date to"
          />
        </div>
      </div>

      <div className="overflow-x-auto ui-table-scroll">
            <table className="ui-table ui-table-wide ui-table-sticky">
              <thead>
                <tr>
                  <th scope="col" className="w-10">#</th>
                  <th scope="col">Schedule name</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Frequency</th>
                  <th scope="col" className="ui-num">Amount</th>
                  <th scope="col">Next invoice date</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="w-10"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="ui-rows">
                {pagedTemplates.length === 0 ? (
                  <tr>
                    <td colSpan="8">
                      <EmptyState
                        icon={RefreshCw}
                        kind="new"
                        title="No recurring schedules"
                        description="A schedule is an invoice that raises itself — rent on the 1st, an AMC every quarter, a retainer every month."
                        routes={[
                          {
                            label: 'Write one now',
                            description: 'Name it, pick a customer and a cadence.',
                            onSelect: () => setCreatorOpen(true),
                          },
                          {
                            label: 'Repeat an invoice',
                            description: 'Take one you already raised and set it to come round again.',
                            onSelect: () => setCreatorOpen(true),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ) : (
                pagedTemplates.map((t, i) => {
                  const { stage, count } = stageOf(t);
                  const status = scheduleStatus(t);
                  return (
                    <tr key={t.id}>
                      <td className="ui-col-meta ui-mono ui-subtle">
                        {(safePage - 1) * perPage + i + 1}
                      </td>
                      <td className="ui-col-entity">
                        {t.name || t.sourceNumber || '—'}
                        {/* Where the schedule has reached, kept under the name
                            rather than in a column of its own: it is context
                            for the row, not something the list is sorted by. */}
                        <div className="ui-caption">
                          {count ? `${count} raised · last ${String(stage).toLowerCase()}` : 'Nothing raised yet'}
                        </div>
                      </td>
                      <td className="ui-col-entity">{t.customerName || '—'}</td>
                      <td className="ui-col-meta">{FREQ_LABEL[t.frequency] || 'Monthly'}</td>
                      <td className="ui-col-amount">
                        <MoneyValue value={t.total} company={currentCompany} />
                      </td>
                      <td className="ui-col-date">
                        {status === 'Active' ? <SalesDate value={t.nextRunDate} /> : '—'}
                      </td>
                      <td><StatusPill status={status} /></td>
                      <td className="text-right">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setRowMenu(rowMenu === t.id ? null : t.id)}
                            className="ui-icon-btn"
                            aria-haspopup="menu"
                            aria-expanded={rowMenu === t.id}
                            aria-label={`Actions for ${t.name || t.customerName || 'schedule'}`}
                          >
                            <MoreVertical size={16} />
                          </button>
                          {rowMenu === t.id ? (
                            <div className="absolute end-0 mt-1 z-30 ui-card p-1 min-w-[11rem]" role="menu">
                              <button
                                type="button"
                                role="menuitem"
                                disabled={t.active === false}
                                onClick={() => { setRowMenu(null); runNow(t); }}
                                className="w-full text-left px-3 py-2 rounded-md text-sm ui-hover-sunken flex items-center gap-2 disabled:opacity-50"
                              >
                                <RefreshCw size={15} aria-hidden="true" /> Run now
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => { setRowMenu(null); toggle(t); }}
                                className="w-full text-left px-3 py-2 rounded-md text-sm ui-hover-sunken flex items-center gap-2"
                              >
                                {t.active === false ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
                                {t.active === false ? 'Resume' : 'Pause'}
                              </button>
                              <div className="my-1" style={{ borderTop: '1px solid rgb(var(--border))' }} />
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => { setRowMenu(null); remove(t); }}
                                className="w-full text-left px-3 py-2 rounded-md text-sm ui-hover-sunken flex items-center gap-2"
                                style={{ color: 'rgb(var(--neg-ink))' }}
                              >
                                <Trash2 size={15} aria-hidden="true" /> Delete
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
                )}
              </tbody>
            </table>
      </div>

          <div
            className="flex items-center justify-between gap-3 flex-wrap px-4 py-3"
            style={{ borderTop: '1px solid rgb(var(--border))' }}
          >
            <span className="ui-subtle text-xs">
              Showing {shownTemplates.length === 0 ? 0 : (safePage - 1) * perPage + 1} –{' '}
              {Math.min(safePage * perPage, shownTemplates.length)} of {shownTemplates.length} schedules
            </span>
            {pageCount > 1 ? (
              <div className="flex items-center gap-1.5">
                <button type="button" className="ui-btn ui-btn-sm" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} aria-label="Previous page">‹</button>
                <span className="ui-mono text-xs px-2">{safePage} / {pageCount}</span>
                <button type="button" className="ui-btn ui-btn-sm" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)} aria-label="Next page">›</button>
              </div>
            ) : null}
          </div>
    </DocumentListShell>
  );
}
