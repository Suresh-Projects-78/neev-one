import { useEffect, useRef } from 'react';

import { notify } from '../components/ui/notify';

/**
 * Recurring invoices, materialised as drafts.
 *
 * A template is a snapshot of an invoice marked "repeat monthly". On sign-in
 * this raises a DRAFT for every period that has come due since the last run —
 * drafts, deliberately: nothing posts to the ledger until a person reviews
 * and saves each one, so a forgotten template cannot quietly bill a customer
 * for months.
 *
 * Catch-up is bounded (12 periods) so a template dormant for years cannot
 * flood the invoice list.
 */

const addMonths = (iso, n) => {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(d, lastDay)); // Jan 31 + 1mo = Feb 28, not Mar 3
  return date.toISOString().slice(0, 10);
};

/** Next run for a template's frequency (default monthly). */
export const advanceRunDate = (iso, frequency) => {
  switch (String(frequency || 'MONTHLY')) {
    case 'WEEKLY': {
      const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 7);
      return d.toISOString().slice(0, 10);
    }
    case 'QUARTERLY':
      return addMonths(iso, 3);
    case 'YEARLY':
      return addMonths(iso, 12);
    default:
      return addMonths(iso, 1);
  }
};

export function useRecurringInvoices({ enabled, db, setDb, currentCompanyId }) {
  const ranFor = useRef('');

  useEffect(() => {
    const key = String(currentCompanyId || '');
    if (!enabled || !key || ranFor.current === key) return;
    const templates = (Array.isArray(db?.recurringTemplates) ? db.recurringTemplates : []).filter(
      (t) => t.companyId === currentCompanyId && t.active !== false
    );
    if (!templates.length) return;
    ranFor.current = key;

    const today = new Date().toISOString().slice(0, 10);
    let created = 0;

    setDb((prev) => {
      const invoices = Array.isArray(prev.invoices) ? [...prev.invoices] : [];
      let nextId = invoices.reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0);
      const nextTemplates = (prev.recurringTemplates || []).map((t) => {
        if (t.companyId !== currentCompanyId || t.active === false) return t;
        let run = t.nextRunDate;
        let guard = 0;
        let touched = false;
        while (run && run <= today && guard < 12 && (!t.endDate || run <= t.endDate)) {
          guard += 1;
          touched = true;
          created += 1;
          invoices.push({
            id: ++nextId,
            companyId: currentCompanyId,
            number: '', // drafts take a number when saved through the form
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
        return touched ? { ...t, nextRunDate: run, lastRunAt: new Date().toISOString() } : t;
      });

      if (!created) return prev;
      return { ...prev, invoices, recurringTemplates: nextTemplates };
    });

    // setDb is synchronous enough for this count to be right in practice, and
    // the toast is advisory either way.
    setTimeout(() => {
      if (created > 0) {
        notify.info(`${created} recurring draft invoice${created === 1 ? '' : 's'} created — review and save to post.`);
      }
    }, 400);
  }, [enabled, db, setDb, currentCompanyId]);
}
