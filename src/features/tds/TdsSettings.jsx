import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

import { PageHeader, StatusPill } from '../../components/ui/Primitives';
import { notify } from '../../components/ui/notify';
import { fyRange } from '../../utils/tdsTcs';
import { tdsGroupSide } from '../../utils/tdsLedgers';
import { NEW_ACT_FROM, TDS_NATURES, resolveRule, ruleReference } from './ruleMaster';
import { unmappedNatures } from './reports';

/**
 * Configuration → Taxation → TDS: the one place TDS is configured.
 *
 * Purchase and sales forms carry only compact, transaction-level controls;
 * everything an administrator decides lives here — whether the company
 * deducts at all, its identity as a deductor, its defaults, which ledgers
 * accumulate which natures, and which parties carry which defaults. The
 * Natures/Rules section is deliberately READ-ONLY: rates, thresholds and
 * statutory references come from the controlled Rule Master, and a settings
 * page that let somebody retype them would be a second answer to a question
 * the Act already answered.
 */

const DEDUCTOR_TYPES = ['Company', 'Firm', 'Individual/HUF', 'AOP/BOI', 'Local Authority', 'Government', 'Others'];

const todayIso = () => new Date().toISOString().slice(0, 10);

const Section = ({ title, description, children, actions = null }) => (
  <section className="ui-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="ui-t-sec">{title}</h3>
        {description ? <p className="ui-caption mt-0.5 max-w-2xl">{description}</p> : null}
      </div>
      {actions}
    </div>
    <div className="mt-4">{children}</div>
  </section>
);

const TdsSettings = ({ db, setDb, currentCompany, onOpenChart = null, onOpenVendors = null, onOpenCustomers = null }) => {
  const companyId = currentCompany?.id;
  const saved = currentCompany?.profile?.taxCompliances?.tds || {};

  const [form, setForm] = useState(() => ({
    enabled: Boolean(saved.enabled),
    tan: String(saved.tan || ''),
    deductorName: String(saved.deductorName || currentCompany?.name || ''),
    deductorType: String(saved.deductorType || 'Company'),
    defaultNatureCode: String(saved.defaultNatureCode || ''),
    defaultPayableLedgerId: String(saved.defaultPayableLedgerId || ''),
    defaultReceivableLedgerId: String(saved.defaultReceivableLedgerId || ''),
    /* Advanced */
    state: String(saved.state || ''),
    registrationType: String(saved.registrationType || 'Applicable'),
  }));
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const groups = useMemo(
    () => (db?.accountGroups || []).filter((g) => Number(g?.companyId) === Number(companyId)),
    [db?.accountGroups, companyId]
  );

  /* Every ledger filed under the TDS branch of the chart, with its side. */
  const tdsLedgers = useMemo(
    () =>
      (db?.chartOfAccounts || [])
        .filter((a) => Number(a?.companyId) === Number(companyId))
        .map((a) => ({ ...a, side: String(a?.tdsSide || '').toUpperCase() || tdsGroupSide(groups, a.groupId) }))
        .filter((a) => a.side)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    [db?.chartOfAccounts, companyId, groups]
  );
  const payableLedgers = tdsLedgers.filter((l) => l.side === 'PAYABLE');
  const receivableLedgers = tdsLedgers.filter((l) => l.side === 'RECEIVABLE');

  const unmapped = useMemo(() => unmappedNatures(db, companyId), [db, companyId]);

  /* Parties carrying TDS defaults, and the gap that blocks a return. */
  const parties = useMemo(() => {
    const rows = [];
    for (const v of db?.vendors || []) {
      if (Number(v.companyId) !== Number(companyId)) continue;
      if (v.tdsApplicable === undefined && !v.tdsNatureCode && !v.tdsSection) continue;
      rows.push({ kind: 'Vendor', name: v.displayName || v.name || '', pan: String(v.pan || '').trim(), applicable: v.tdsApplicable !== false, nature: String(v.tdsNatureCode || '') });
    }
    for (const c of db?.customers || []) {
      if (Number(c.companyId) !== Number(companyId)) continue;
      if (c.tdsApplicable === undefined && !c.tdsNatureCode && !c.tdsSection) continue;
      rows.push({ kind: 'Customer', name: c.displayName || c.name || '', pan: String(c.pan || '').trim(), applicable: c.tdsApplicable !== false, nature: String(c.tdsNatureCode || '') });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }, [db?.vendors, db?.customers, companyId]);
  const panMissing = parties.filter((p) => p.applicable && !p.pan).length;

  const fy = fyRange(todayIso());

  const save = () => {
    const tan = String(form.tan || '').trim().toUpperCase();
    if (form.enabled && !tan) {
      notify.error('TAN is required while TDS is enabled — the challan and the return both carry it.');
      return;
    }
    if (form.enabled && tan && !/^[A-Z]{4}\d{5}[A-Z]$/.test(tan)) {
      notify.error('That is not a TAN — four letters, five digits, one letter.');
      return;
    }

    setDb((prev) => ({
      ...prev,
      companies: (prev.companies || []).map((c) => {
        if (Number(c.id) !== Number(companyId)) return c;
        const profile = c?.profile && typeof c.profile === 'object' ? c.profile : {};
        const taxCompliances = profile?.taxCompliances && typeof profile.taxCompliances === 'object' ? profile.taxCompliances : {};
        return {
          ...c,
          profile: {
            ...profile,
            taxCompliances: {
              ...taxCompliances,
              tds: {
                ...(taxCompliances.tds && typeof taxCompliances.tds === 'object' ? taxCompliances.tds : {}),
                enabled: Boolean(form.enabled),
                tan,
                deductorName: String(form.deductorName || '').trim(),
                deductorType: String(form.deductorType || '').trim(),
                defaultNatureCode: String(form.defaultNatureCode || '').trim().toUpperCase(),
                defaultPayableLedgerId: String(form.defaultPayableLedgerId || '').trim(),
                defaultReceivableLedgerId: String(form.defaultReceivableLedgerId || '').trim(),
                state: String(form.state || '').trim(),
                registrationType: String(form.registrationType || 'Applicable').trim(),
              },
            },
          },
        };
      }),
    }));
    notify.success('TDS configuration saved.');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        entity="tds"
        title="TDS"
              actions={
          <button type="button" onClick={save} className="ui-btn ui-btn-primary">
            Save configuration
          </button>
        }
      />

      {/* 1 — the switch everything else hangs off. */}
      <Section
        title="Enable TDS"
        description="Off: no form asks a TDS question and nothing is calculated. On: the compact controls appear on purchases, payments, sales and receipts."
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="ui-checkbox"
            checked={form.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
          />
          This company deducts and tracks TDS
        </label>
      </Section>

      {/* 2 — who the deductor is. */}
      <Section title="TDS Profile" description="The identity the challan and the quarterly return carry.">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="ui-label" htmlFor="tds-tan">TAN</label>
            <input
              id="tds-tan"
              type="text"
              className="ui-input ui-mono w-full uppercase"
              value={form.tan}
              onChange={(e) => set({ tan: e.target.value })}
              placeholder="BLRN12345F"
            />
          </div>
          <div>
            <label className="ui-label" htmlFor="tds-deductor-name">Deductor Name</label>
            <input
              id="tds-deductor-name"
              type="text"
              className="ui-input w-full"
              value={form.deductorName}
              onChange={(e) => set({ deductorName: e.target.value })}
            />
          </div>
          <div>
            <label className="ui-label" htmlFor="tds-deductor-type">Deductor Type</label>
            <select
              id="tds-deductor-type"
              className="ui-select w-full"
              value={form.deductorType}
              onChange={(e) => set({ deductorType: e.target.value })}
            >
              {DEDUCTOR_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label">Financial Year Context</label>
            {/* Stated, not chosen: the FY follows each transaction's date, and
                the 2026 Act transition follows the rule master. */}
            <div className="ui-input ui-sunken flex items-center">{fy?.label || '—'}</div>
            <p className="ui-caption mt-1">Follows each transaction's date; the {NEW_ACT_FROM} Act transition is automatic.</p>
          </div>
          <div>
            <label className="ui-label" htmlFor="tds-default-nature">Default Nature</label>
            <select
              id="tds-default-nature"
              className="ui-select w-full"
              value={form.defaultNatureCode}
              onChange={(e) => set({ defaultNatureCode: e.target.value })}
            >
              <option value="">— none —</option>
              {TDS_NATURES.filter((n) => n.active !== false).map((n) => (
                <option key={n.code} value={n.code}>{n.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label" htmlFor="tds-default-payable">Default Payable Ledger</label>
            <select
              id="tds-default-payable"
              className="ui-select w-full"
              value={form.defaultPayableLedgerId}
              onChange={(e) => set({ defaultPayableLedgerId: e.target.value })}
            >
              <option value="">— pick per transaction —</option>
              {payableLedgers.map((l) => (
                <option key={l.id} value={String(l.id)}>{l.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="ui-label" htmlFor="tds-default-receivable">Default Receivable Ledger</label>
            <select
              id="tds-default-receivable"
              className="ui-select w-full"
              value={form.defaultReceivableLedgerId}
              onChange={(e) => set({ defaultReceivableLedgerId: e.target.value })}
            >
              <option value="">— pick per transaction —</option>
              {receivableLedgers.map((l) => (
                <option key={l.id} value={String(l.id)}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* The compliance minutiae, folded away from the everyday fields. */}
        <div className="mt-4 border-t pt-3">
          <button
            type="button"
            className="ui-btn ui-btn-ghost ui-btn-sm !px-0"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            {advancedOpen ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            Advanced
          </button>
          {advancedOpen ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="ui-label" htmlFor="tds-state">Deductor State</label>
                <input
                  id="tds-state"
                  type="text"
                  className="ui-input w-full"
                  value={form.state}
                  onChange={(e) => set({ state: e.target.value })}
                />
              </div>
              <div>
                <label className="ui-label" htmlFor="tds-reg-type">Registration Type</label>
                <select
                  id="tds-reg-type"
                  className="ui-select w-full"
                  value={form.registrationType}
                  onChange={(e) => set({ registrationType: e.target.value })}
                >
                  {['Applicable', 'Not Applicable'].map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>
      </Section>

      {/* 3 — the controlled master, stated. */}
      <Section
        title="TDS Natures / Rules"
        description="The Rule Master's current answers — versioned, effective-dated, read-only. Rates and thresholds are never typed anywhere in the product."
      >
        <div className="ui-table-scroll">
          <table className="ui-table">
            <thead>
              <tr>
                <th scope="col">Nature</th>
                {/* The stable identity everything stores — shown so an
                    administrator reading an export can tie it back. */}
                <th scope="col">Internal Code</th>
                <th scope="col">Reference in force</th>
                <th scope="col" className="text-end">Rate</th>
                <th scope="col">Rule version</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {TDS_NATURES.map((n) => {
                const rule = resolveRule(n.code, todayIso());
                return (
                  <tr key={n.code}>
                    <td className="truncate">{n.name}</td>
                    <td className="ui-mono truncate">{n.code}</td>
                    <td className="ui-mono">{ruleReference(rule) || '—'}</td>
                    <td className="ui-money">{Number(rule?.rate ?? 0)}%</td>
                    <td className="ui-mono">{rule?.id || '—'}</td>
                    <td><StatusPill status={n.active === false ? 'Inactive' : 'Active'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 4 — which ledgers accumulate which natures. */}
      <Section
        title="Ledger Mapping"
        description="Ledgers under TDS Payable and TDS Receivable, and the nature each accumulates. Mapping is edited on the ledger itself — Chart of Accounts → the ledger → TDS Mapping."
        actions={
          onOpenChart ? (
            <button type="button" onClick={onOpenChart} className="ui-btn ui-btn-secondary ui-btn-sm">
              <ExternalLink size={14} aria-hidden="true" /> Open Chart of Accounts
            </button>
          ) : null
        }
      >
        {unmapped.length ? (
          <p className="ui-caption mb-2 text-[rgb(var(--neg-ink))]">
            No ledger is mapped to {unmapped.map((u) => u.natureName).join(', ')} — deductions under it cannot post.
          </p>
        ) : null}
        {tdsLedgers.length === 0 ? (
          <p className="ui-caption">No TDS ledgers yet. Create them under Others → New Ledger, filed under TDS Payable or TDS Receivable.</p>
        ) : (
          <div className="ui-table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Ledger</th>
                  <th scope="col">Side</th>
                  <th scope="col">Nature</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {tdsLedgers.map((l) => (
                  <tr key={l.id}>
                    <td className="truncate">{l.name}</td>
                    <td>{l.side === 'RECEIVABLE' ? 'Receivable' : 'Payable'}</td>
                    <td className="truncate">
                      {TDS_NATURES.find((n) => n.code === String(l.tdsNatureCode || '').toUpperCase())?.name || l.tdsNatureCode || '—'}
                    </td>
                    <td><StatusPill status={l.isActive === false ? 'Inactive' : 'Active'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* 5 — who deductions default from and to. */}
      <Section
        title="Party Defaults"
        description="Vendors and customers carrying TDS defaults. Defaults are edited on the party master; the engine reads them at each transaction."
        actions={
          <div className="flex items-center gap-2">
            {onOpenVendors ? (
              <button type="button" onClick={onOpenVendors} className="ui-btn ui-btn-secondary ui-btn-sm">Vendors</button>
            ) : null}
            {onOpenCustomers ? (
              <button type="button" onClick={onOpenCustomers} className="ui-btn ui-btn-secondary ui-btn-sm">Customers</button>
            ) : null}
          </div>
        }
      >
        {panMissing ? (
          <p className="ui-caption mb-2 text-[rgb(var(--neg-ink))]">
            {panMissing} TDS-applicable part{panMissing === 1 ? 'y has' : 'ies have'} no PAN — deduction runs at 20% and the return cannot be filed.
          </p>
        ) : null}
        {parties.length === 0 ? (
          <p className="ui-caption">No party carries TDS defaults yet. Set them on the vendor or customer master.</p>
        ) : (
          <div className="ui-table-scroll">
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">Party</th>
                  <th scope="col">Type</th>
                  <th scope="col">PAN</th>
                  <th scope="col">Default nature</th>
                  <th scope="col">TDS</th>
                </tr>
              </thead>
              <tbody>
                {parties.map((p, i) => (
                  <tr key={`${p.kind}-${p.name}-${i}`}>
                    <td className="truncate">{p.name || '—'}</td>
                    <td>{p.kind}</td>
                    <td className="ui-mono">{p.pan || '—'}</td>
                    <td className="truncate">{TDS_NATURES.find((n) => n.code === p.nature.toUpperCase())?.name || p.nature || '—'}</td>
                    <td><StatusPill status={p.applicable ? 'Applicable' : 'Not applicable'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
};

export default TdsSettings;
