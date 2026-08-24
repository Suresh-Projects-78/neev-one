import React, { useMemo, useState } from 'react';
import { Bell, Copy, Mail, MessageCircle } from 'lucide-react';
import { PageHeader, EmptyState, StatusPill } from '../../components/ui/Primitives';
import { ListToolbar, exportRows, useListSearch } from '../../components/ListToolbar';
import { notify } from '../../components/ui/notify';
import { formatMoney } from '../../utils/money';
import {
  collectiblesList,
  buildReminderMessage,
  waLink,
  mailtoLink,
  lastReminder,
  needsReminder,
} from '../../utils/reminders';

/**
 * Payment reminders — the collections desk.
 *
 * Every open invoice with a balance, most overdue first. The schedule is
 * due-date → +7 → +15; an invoice that reached a stage without a reminder
 * shows "Send now". Buttons open WhatsApp (wa.me deep link, prefilled
 * message, the customer's mobile) or the mail client; each send is stamped
 * on the invoice so the stage tracking knows what went out.
 */
export default function PaymentReminders({ db, setDb, currentCompany }) {
  const companyId = currentCompany.id;
  const today = new Date().toISOString().slice(0, 10);
  const rows = useMemo(() => collectiblesList(db, companyId, today), [db, companyId, today]);
  const customersById = useMemo(
    () => new Map((db.customers || []).filter((c) => c.companyId === companyId).map((c) => [String(c.id), c])),
    [db.customers, companyId]
  );

  const [filter, setFilter] = useState('ALL'); // ALL | DUE | S2 | S3 | SENDNOW

  const stageLabel = (s) => (s === 3 ? '15+ days' : s === 2 ? '7+ days' : s === 1 ? 'Due' : 'Not due');

  const counts = {
    due: rows.filter((r) => r.stage === 1).length,
    s2: rows.filter((r) => r.stage === 2).length,
    s3: rows.filter((r) => r.stage === 3).length,
    sendNow: rows.filter((r) => needsReminder(r.invoice, today)).length,
  };

  const prSearch = useListSearch(
    rows.filter((r) => {
      if (filter === 'DUE') return r.stage === 1;
      if (filter === 'S2') return r.stage === 2;
      if (filter === 'S3') return r.stage === 3;
      if (filter === 'SENDNOW') return needsReminder(r.invoice, today);
      return true;
    }),
    [(r) => r.invoice?.number, (r) => r.invoice?.customerName, (r) => r.invoice?.dueDate]
  );
  const shown = prSearch.filtered;

  const markSent = (invoice, channel) => {
    const entry = { date: today, channel, stage: reminderStageSafe(invoice) };
    setDb((prev) => ({
      ...prev,
      invoices: (prev.invoices || []).map((i) =>
        i.id === invoice.id ? { ...i, remindersSent: [...(i.remindersSent || []), entry] } : i
      ),
    }));
  };
  const reminderStageSafe = (inv) => {
    const r = rows.find((x) => x.invoice.id === inv.id);
    return r ? r.stage : 1;
  };

  const messageFor = (invoice) => {
    const customer = customersById.get(String(invoice.customerId)) || null;
    const shareUrl = invoice.id ? `${window.location.origin}/?invoiceId=${invoice.id}` : '';
    return { customer, message: buildReminderMessage({ invoice, customer, company: currentCompany, shareUrl }) };
  };

  const sendWhatsApp = (invoice) => {
    const { customer, message } = messageFor(invoice);
    const phone = customer?.mobile || customer?.phone || '';
    window.open(waLink(phone, message), '_blank', 'noopener');
    markSent(invoice, 'whatsapp');
    notify.success(`WhatsApp reminder opened for ${invoice.number}${phone ? '' : ' (no mobile on the customer — pick the contact in WhatsApp)'}`);
  };

  const sendEmail = (invoice) => {
    const { customer, message } = messageFor(invoice);
    const email = customer?.email || '';
    window.open(mailtoLink(email, `Payment reminder — Invoice ${invoice.number}`, message), '_self');
    markSent(invoice, 'email');
    notify.success(`Email reminder opened for ${invoice.number}`);
  };

  const copyMessage = async (invoice) => {
    const { message } = messageFor(invoice);
    try {
      await navigator.clipboard.writeText(message);
      markSent(invoice, 'copy');
      notify.success('Reminder message copied.');
    } catch {
      notify.error('Clipboard unavailable — use WhatsApp/Email buttons instead.');
    }
  };

  const filters = [
    ['ALL', `All open (${rows.length})`],
    ['SENDNOW', `Send now (${counts.sendNow})`],
    ['DUE', `Due (${counts.due})`],
    ['S2', `7+ days (${counts.s2})`],
    ['S3', `15+ days (${counts.s3})`],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payment Reminders"
        description="Due → +7 → +15 schedule. WhatsApp opens with the message ready — the fastest collections channel there is."
      />

      <div className="flex flex-wrap gap-2">
        {filters.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setFilter(key)} className={`ui-btn !h-8 text-xs ${filter === key ? 'ui-btn-primary' : 'ui-btn-secondary'}`}>
            {label}
          </button>
        ))}
      </div>

      <ListToolbar
        search={prSearch.query}
        onSearch={prSearch.setQuery}
        placeholder="Search collectibles (invoice, customer)"
        count={shown.length}
        countLabel="invoices"
        onExport={() =>
          exportRows({
            fileName: `PaymentReminders_${currentCompany?.name || 'company'}`,
            label: 'collectible(s)',
            columns: [
              { key: 'invoice', label: 'Invoice', value: (r) => r.invoice?.number || '' },
              { key: 'customer', label: 'Customer', value: (r) => r.invoice?.customerName || '' },
              { key: 'dueDate', label: 'Due date', value: (r) => r.invoice?.dueDate || '' },
              { key: 'overdueDays', label: 'Overdue days', value: (r) => r.overdueDays ?? '' },
              { key: 'balance', label: 'Balance', value: (r) => Number(r.balance || 0) },
              { key: 'stage', label: 'Stage', value: (r) => r.stage ?? '' },
            ],
            rows: shown,
          })
        }
      />

      {shown.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={Bell} title="Nothing to chase" description="No open invoices with a balance in this filter." />
        </div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th className="ui-th">Invoice</th>
                <th className="ui-th">Customer</th>
                <th className="ui-th">Due date</th>
                <th className="ui-th ui-num">Overdue</th>
                <th className="ui-th ui-num">Balance</th>
                <th className="ui-th">Stage</th>
                <th className="ui-th">Last reminder</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ invoice: inv, overdue, stage, balance }) => {
                const last = lastReminder(inv);
                const urgent = needsReminder(inv, today);
                return (
                  <tr key={inv.id} className="border-t">
                    <td className="ui-col-id px-4 py-2.5 font-medium">{inv.number}</td>
                    <td className="ui-col-entity px-4 py-2.5">{inv.customerName}</td>
                    <td className="ui-col-date px-4 py-2.5">{inv.dueDate || '—'}</td>
                    <td className="px-4 py-2.5 text-right">{overdue > 0 ? `${overdue}d` : '—'}</td>
                    <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{formatMoney(balance, currentCompany)}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={stageLabel(stage)} />
                      {urgent ? <span className="ui-caption ml-1 text-[rgb(var(--warn-ink))]">Send now</span> : null}
                    </td>
                    <td className="ui-col-meta px-4 py-2.5 text-xs">{last ? `${last.date} · ${last.channel}` : 'Never'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button type="button" onClick={() => sendWhatsApp(inv)} className="ui-btn ui-btn-secondary !h-8 text-xs" title="WhatsApp">
                          <MessageCircle size={13} aria-hidden="true" /> WhatsApp
                        </button>
                        <button type="button" onClick={() => sendEmail(inv)} className="ui-icon-btn !h-8 !w-8" aria-label="Email reminder" title="Email">
                          <Mail size={14} />
                        </button>
                        <button type="button" onClick={() => copyMessage(inv)} className="ui-icon-btn !h-8 !w-8" aria-label="Copy message" title="Copy message">
                          <Copy size={14} />
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
