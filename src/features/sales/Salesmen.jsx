import React, { useMemo, useState } from 'react';
import { Plus, Trash2, UserCheck } from 'lucide-react';
import { PageHeader, EmptyState } from '../../components/ui/Primitives';
import { ListToolbar, exportRows, useListSearch } from '../../components/ListToolbar';
import { notify, confirmDialog } from '../../components/ui/notify';
import { formatMoney } from '../../utils/money';

/**
 * Salesman master + performance report. Invoices carry salesmanId (picked on
 * the invoice form); commission is the salesman's percentage applied to his
 * non-draft, non-cancelled invoice subtotals (pre-GST — commission on tax
 * would overstate it).
 */
export default function Salesmen({ db, setDb, currentCompany }) {
  const companyId = currentCompany.id;
  const salesmen = useMemo(
    () => (Array.isArray(db.salesmen) ? db.salesmen.filter((s) => s.companyId === companyId) : []),
    [db.salesmen, companyId]
  );

  const [form, setForm] = useState({ name: '', phone: '', commissionPct: '' });

  const add = () => {
    const name = form.name.trim();
    if (!name) {
      notify.error('Salesman name is required');
      return;
    }
    const nextId = (db.salesmen || []).reduce((m, s) => Math.max(m, Number(s.id) || 0), 0) + 1;
    setDb((prev) => ({
      ...prev,
      salesmen: [
        ...(prev.salesmen || []),
        {
          id: nextId,
          companyId,
          name,
          phone: form.phone.trim(),
          commissionPct: Math.max(0, Math.min(100, Number(form.commissionPct) || 0)),
          createdAt: new Date().toISOString(),
        },
      ],
    }));
    setForm({ name: '', phone: '', commissionPct: '' });
    notify.success(`${name} added.`);
  };

  const remove = async (s) => {
    const ok = await confirmDialog({ title: 'Remove salesman', message: `Remove ${s.name}? Past invoices keep his name.`, confirmLabel: 'Remove' });
    if (!ok) return;
    setDb((prev) => ({ ...prev, salesmen: (prev.salesmen || []).filter((x) => Number(x.id) !== Number(s.id)) }));
  };

  /** Performance from real invoices — commission on pre-GST subtotal. */
  const perf = useMemo(() => {
    const map = new Map(salesmen.map((s) => [Number(s.id), { salesman: s, invoices: 0, sales: 0, commission: 0 }]));
    for (const inv of db.invoices || []) {
      if (inv.companyId !== companyId) continue;
      const st = String(inv.status || '').toLowerCase();
      if (st === 'draft' || st === 'cancelled') continue;
      const slot = map.get(Number(inv.salesmanId));
      if (!slot) continue;
      slot.invoices += 1;
      slot.sales += Number(inv.subtotal || 0);
      slot.commission += (Number(inv.subtotal || 0) * Number(slot.salesman.commissionPct || 0)) / 100;
    }
    return [...map.values()].sort((a, b) => b.sales - a.sales);
  }, [db.invoices, salesmen, companyId]);

  const smSearch = useListSearch(perf, [(r) => r.salesman?.name, (r) => r.salesman?.phone]);
  const shownPerf = smSearch.filtered;

  return (
    <div className="space-y-5">
      <PageHeader title="Salesmen" description="Who sold what — every invoice can carry a salesman; commission is computed on pre-GST sales." />

      <div className="ui-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="ui-label">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="ui-input w-48 px-3 py-2" />
          </div>
          <div>
            <label className="ui-label">Phone</label>
            <input type="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} className="ui-input w-36 px-3 py-2" />
          </div>
          <div>
            <label className="ui-label">Commission %</label>
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={form.commissionPct}
              onChange={(e) => setForm((p) => ({ ...p, commissionPct: e.target.value }))}
              className="ui-input w-28 px-3 py-2"
              placeholder="0"
            />
          </div>
          <button type="button" onClick={add} className="ui-btn ui-btn-primary">
            <Plus size={15} aria-hidden="true" /> Add salesman
          </button>
        </div>
      </div>

      <ListToolbar
        search={smSearch.query}
        onSearch={smSearch.setQuery}
        placeholder="Search salesmen (name, phone)"
        count={shownPerf.length}
        countLabel="salesmen"
        onExport={() =>
          exportRows({
            fileName: `Salesmen_${currentCompany?.name || 'company'}`,
            label: 'salesman/men',
            columns: [
              { key: 'name', label: 'Salesman', value: (r) => r.salesman?.name || '' },
              { key: 'phone', label: 'Phone', value: (r) => r.salesman?.phone || '' },
              { key: 'commissionPct', label: 'Commission %', value: (r) => Number(r.salesman?.commissionPct || 0) },
              { key: 'invoices', label: 'Invoices', value: (r) => r.invoices },
              { key: 'sales', label: 'Sales (pre-GST)', value: (r) => Number(r.sales || 0) },
              { key: 'commission', label: 'Commission due', value: (r) => Number(r.commission || 0) },
            ],
            rows: shownPerf,
          })
        }
      />

      {salesmen.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={UserCheck} title="No salesmen yet" description="Add the team; then pick a salesman on each invoice." />
        </div>
      ) : (
        <div className="ui-card overflow-x-auto">
          <table className="ui-table w-full">
            <thead>
              <tr>
                <th className="ui-th">Salesman</th>
                <th className="ui-th">Phone</th>
                <th className="ui-th">Commission %</th>
                <th className="ui-th ui-num">Invoices</th>
                <th className="ui-th ui-num">Sales (pre-GST)</th>
                <th className="ui-th ui-num">Commission due</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {shownPerf.map(({ salesman: s, invoices, sales, commission }) => (
                <tr key={s.id} className="border-t">
                  <td className="ui-col-entity px-4 py-2.5 font-medium">{s.name}</td>
                  <td className="ui-col-meta px-4 py-2.5">{s.phone || '—'}</td>
                  <td className="px-4 py-2.5">{Number(s.commissionPct || 0)}%</td>
                  <td className="px-4 py-2.5 text-right">{invoices}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{formatMoney(sales, currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{formatMoney(commission, currentCompany)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button type="button" onClick={() => remove(s)} className="ui-icon-btn !h-8 !w-8" aria-label={`Remove ${s.name}`}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
