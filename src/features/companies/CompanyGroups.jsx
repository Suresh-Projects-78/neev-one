import React, { useMemo, useState } from 'react';
import { Building2, ChevronRight, CornerDownRight, Pencil } from 'lucide-react';

import { formatMoney, formatMoneyCompact } from '../../utils/money';
import { PageHeader, EmptyState, StatusPill } from '../../components/ui/Primitives';
import { notify } from '../../components/ui/notify';
import { GST_STATE_BY_CODE } from '../../utils/gst';

/**
 * The company group viewer.
 *
 * One workspace can hold several companies — a parent with subsidiaries, or
 * sibling firms under one proprietor. Until now the app silently used the
 * first company in the list; this page makes the group visible: hierarchy,
 * per-company activity, group rollups, and switching which company the rest
 * of the product operates on.
 *
 * Hierarchy is client-side (`parentCompanyId` on the company record). Cycles
 * are refused at edit time, and a child whose parent was deleted renders as a
 * root rather than vanishing.
 */

const num = (v) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export default function CompanyGroups({ db, setDb, currentCompany, onSwitched }) {
  const companies = useMemo(
    () => (Array.isArray(db?.companies) ? db.companies : []),
    [db]
  );

  const [editing, setEditing] = useState(null); // { id? , parentCompanyId? } — no id = create
  const [form, setForm] = useState({ name: '', gstin: '', state: '', parentCompanyId: '' });

  /** Billed / outstanding per company, from its invoices. */
  const activityById = useMemo(() => {
    const map = new Map();
    for (const c of companies) map.set(c.id, { billed: 0, outstanding: 0, docs: 0 });
    for (const inv of Array.isArray(db?.invoices) ? db.invoices : []) {
      const slot = map.get(inv.companyId);
      if (!slot) continue;
      const st = String(inv.status || '').toLowerCase();
      if (st === 'draft' || st === 'cancelled') continue;
      slot.docs += 1;
      slot.billed += num(inv.total);
      slot.outstanding += Math.max(0, num(inv.total) - num(inv.paidAmount));
    }
    return map;
  }, [companies, db]);

  const byId = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  /** Roots (no parent, or parent missing) with children attached, any depth. */
  const tree = useMemo(() => {
    const children = new Map();
    for (const c of companies) {
      const pid = c.parentCompanyId;
      const validParent = pid != null && pid !== '' && byId.has(pid) && pid !== c.id;
      const key = validParent ? pid : null;
      if (!children.has(key)) children.set(key, []);
      children.get(key).push(c);
    }
    const attach = (c) => ({ company: c, children: (children.get(c.id) || []).map(attach) });
    return (children.get(null) || []).map(attach);
  }, [companies, byId]);

  /** Rollup includes the company and every descendant. */
  const rollup = (node) => {
    const own = activityById.get(node.company.id) || { billed: 0, outstanding: 0, docs: 0 };
    return node.children.reduce(
      (acc, child) => {
        const r = rollup(child);
        return { billed: acc.billed + r.billed, outstanding: acc.outstanding + r.outstanding, docs: acc.docs + r.docs };
      },
      { ...own }
    );
  };

  const wouldCycle = (companyId, candidateParentId) => {
    let cur = candidateParentId;
    const seen = new Set();
    while (cur != null && cur !== '' && !seen.has(cur)) {
      if (cur === companyId) return true;
      seen.add(cur);
      cur = byId.get(cur)?.parentCompanyId;
    }
    return false;
  };

  const openEdit = (c) => {
    setEditing({ id: c.id });
    setForm({
      name: c.name || '',
      gstin: c.gstin || '',
      state: c.state || '',
      parentCompanyId: c.parentCompanyId != null ? String(c.parentCompanyId) : '',
    });
  };

  const save = () => {
    const name = form.name.trim();
    if (!name) {
      notify.error('The company needs a name.');
      return;
    }
    const parentRaw = String(form.parentCompanyId || '').trim();
    const parentCompanyId = parentRaw === '' ? null : Number(parentRaw);

    if (editing?.id != null) {
      if (parentCompanyId != null && wouldCycle(editing.id, parentCompanyId)) {
        notify.error('That parent would make the company its own ancestor.');
        return;
      }
      setDb((prev) => ({
        ...prev,
        companies: (prev.companies || []).map((c) =>
          c.id === editing.id
            ? { ...c, name, gstin: form.gstin.trim(), state: form.state.trim(), parentCompanyId }
            : c
        ),
      }));
      notify.success(`${name} updated.`);
    } else {
      setDb((prev) => {
        const list = Array.isArray(prev.companies) ? prev.companies : [];
        const nextId = list.reduce((m, c) => Math.max(m, num(c.id)), 0) + 1;
        return {
          ...prev,
          companies: [
            ...list,
            {
              id: nextId,
              name,
              gstin: form.gstin.trim(),
              state: form.state.trim(),
              parentCompanyId,
              currency: 'INR',
              createdAt: new Date().toISOString(),
            },
          ],
        };
      });
      notify.success(`${name} added to the group.`);
    }
    setEditing(null);
  };

  const setActive = (c) => {
    setDb((prev) => ({ ...prev, activeCompanyId: c.id }));
    notify.success(`Now working in ${c.name}. Every module reads this company.`);
    onSwitched?.(c);
  };

  const CompanyCard = ({ node, depth }) => {
    const c = node.company;
    const act = activityById.get(c.id) || { billed: 0, outstanding: 0, docs: 0 };
    const isActive = c.id === currentCompany?.id;
    const isGroupHead = node.children.length > 0;
    const roll = isGroupHead ? rollup(node) : null;

    return (
      <div style={{ marginLeft: depth ? '1.75rem' : 0 }}>
        <div className={`ui-card ui-lift mb-3 flex flex-wrap items-center gap-4 p-4 ${isActive ? 'ring-1 ring-[rgb(var(--brand))]' : ''}`}>
          {depth > 0 ? <CornerDownRight size={15} className="ui-subtle -ml-1 flex-shrink-0" aria-hidden="true" /> : null}
          <span
            className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: 'rgb(var(--brand-soft))', color: 'rgb(var(--brand-ink))' }}
            aria-hidden="true"
          >
            <Building2 size={18} />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{c.name}</span>
              {isActive ? <StatusPill status="Active" /> : null}
              {isGroupHead ? (
                <span className="ui-caption">
                  {node.children.length} subsidiar{node.children.length === 1 ? 'y' : 'ies'}
                </span>
              ) : null}
            </div>
            <div className="ui-caption mt-0.5">
              {[c.gstin ? `GSTIN ${c.gstin}` : null, c.state || null].filter(Boolean).join(' · ') || 'No GST details yet'}
            </div>
          </div>

          <div className="flex items-center gap-6 text-sm">
            <span className="text-right">
              <span className="ui-caption block">Billed</span>
              <span className="ui-col-amount font-semibold" title={formatMoney(act.billed, c)}>
                {formatMoneyCompact(act.billed, c)}
              </span>
            </span>
            <span className="text-right">
              <span className="ui-caption block">Outstanding</span>
              <span className="ui-col-amount font-semibold" title={formatMoney(act.outstanding, c)}>
                {formatMoneyCompact(act.outstanding, c)}
              </span>
            </span>
            {roll ? (
              <span className="text-right">
                <span className="ui-caption block">Group billed</span>
                <span className="ui-col-amount font-semibold" title={formatMoney(roll.billed, c)}>
                  {formatMoneyCompact(roll.billed, c)}
                </span>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            {!isActive ? (
              <button type="button" onClick={() => setActive(c)} className="ui-btn ui-btn-secondary ui-btn-sm text-xs">
                Set active <ChevronRight size={13} aria-hidden="true" />
              </button>
            ) : null}
            <button type="button" onClick={() => openEdit(c)} className="ui-icon-btn ui-btn-sm !w-8" aria-label={`Edit ${c.name}`}>
              <Pencil size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
        {node.children.map((child) => (
          <CompanyCard key={child.company.id} node={child} depth={depth + 1} />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Company Profile"
        description="The group at a glance — switch the active company and see who owes what."
      />

      {editing ? (
        <div className="ui-card ui-in p-5">
          <h3 className="ui-t-sec mb-3">{editing.id != null ? 'Edit company' : 'New company'}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="ui-label">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} className="ui-input" autoFocus />
            </div>
            <div>
              <label className="ui-label">GSTIN (optional)</label>
              <input type="text" value={form.gstin} onChange={(e) => setForm((p) => ({ ...p, gstin: e.target.value }))} className="ui-input" placeholder="27ABCDE1234F1Z5" />
            </div>
            <div>
              <label className="ui-label">State</label>
              <select value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value }))} className="ui-select">
                <option value="">Select state</option>
                {Object.values(GST_STATE_BY_CODE).map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="ui-label">Parent company</label>
              <select
                value={form.parentCompanyId}
                onChange={(e) => setForm((p) => ({ ...p, parentCompanyId: e.target.value }))}
                className="ui-select"
              >
                <option value="">None — top-level company</option>
                {companies
                  .filter((c) => c.id !== editing.id)
                  .map((c) => (
                    <option key={c.id} value={String(c.id)}>{c.name}</option>
                  ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setEditing(null)} className="ui-btn ui-btn-secondary">Cancel</button>
            <button type="button" onClick={save} className="ui-btn ui-btn-primary">
              {editing.id != null ? 'Save changes' : 'Add company'}
            </button>
          </div>
        </div>
      ) : null}

      {tree.length === 0 ? (
        <div className="ui-card">
          <EmptyState icon={Building2} title="No companies yet" description="Add the first company to start the group." />
        </div>
      ) : (
        <div>
          {tree.map((node) => (
            <CompanyCard key={node.company.id} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
