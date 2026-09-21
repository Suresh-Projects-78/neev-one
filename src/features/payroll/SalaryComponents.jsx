import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { SkeletonCard, EmptyState } from '../../components/ui/Primitives';
import SettingsScreenHeader from '../settings/SettingsScreenHeader';
import Drawer from '../../components/ui/Drawer';
import { confirmDialog, notify } from '../../components/ui/notify';
import {
  listSalaryComponents,
  createSalaryComponent,
  updateSalaryComponent,
  deleteSalaryComponent,
  validateSalaryFormula,
} from '../../api/payrollComponents';

/**
 * The lines a salary is built from.
 *
 * This is the foundation of payroll: a structure is a list of these, a payslip
 * is what they evaluated to, and the ledger entry is where they post. So the
 * screen's job is to make each one's behaviour legible rather than to hide it
 * behind a name — two allowances with the same amount can be entirely
 * different things depending on whether they are taxable and whether they
 * count towards provident fund wages, and that difference belongs on the row,
 * not three clicks away.
 *
 * Every rule lives on the server. The form shows what it is told and reports
 * what it is refused; it does not decide for itself whether a combination is
 * allowed, because a second copy of a payroll rule is a copy that can disagree
 * with the one that actually runs.
 */

const TYPES = [
  { id: 'EARNING', label: 'Earnings', singular: 'Earning' },
  { id: 'DEDUCTION', label: 'Deductions', singular: 'Deduction' },
  { id: 'EMPLOYER_CONTRIBUTION', label: 'Employer costs', singular: 'Employer contribution' },
];

const METHODS = [
  { id: 'FIXED', label: 'Fixed amount' },
  { id: 'PERCENTAGE', label: 'Percentage of' },
  { id: 'FORMULA', label: 'Formula' },
  { id: 'VARIABLE', label: 'Entered each month' },
  { id: 'STATUTORY', label: 'Statutory rule' },
  { id: 'BALANCING', label: 'Balance of CTC' },
];

const BASES = ['BASIC', 'GROSS', 'CTC', 'MONTHLY_CTC'];
const SCHEMES = ['PF', 'ESI', 'PT', 'TDS', 'LWF'];

const blank = (type) => ({
  name: '',
  code: '',
  type,
  description: '',
  calculationMethod: 'FIXED',
  amount: 0,
  percentage: 0,
  formula: '',
  calculationBase: '',
  rounding: 'NEAREST',
  statutoryScheme: null,
  isTaxable: type === 'EARNING',
  prorate: true,
  includeInPfWage: false,
  includeInEsiWage: false,
  includeInGratuityWage: false,
  includeInGross: type === 'EARNING',
  /* An employer contribution never reaches take-home pay, and the server
     refuses one that claims to — so the form does not start it in a state it
     would immediately be told off for. */
  includeInNetPay: type !== 'EMPLOYER_CONTRIBUTION',
  isVariable: false,
  isFlexibleBenefit: false,
  expenseLedgerId: null,
  liabilityLedgerId: null,
  costCentreBehaviour: 'EMPLOYEE',
  displayOrder: 0,
  isActive: true,
});

/** How a component works, in the words somebody configuring payroll would use. */
const describeMethod = (c) => {
  if (c.calculationMethod === 'PERCENTAGE') return `${Number(c.percentage)}% of ${c.calculationBase || '—'}`;
  if (c.calculationMethod === 'FORMULA') return c.formula || 'Formula';
  if (c.calculationMethod === 'VARIABLE') return 'Entered each month';
  if (c.calculationMethod === 'STATUTORY') return `${c.statutoryScheme || 'Statutory'} rule`;
  if (c.calculationMethod === 'BALANCING') return 'Balance of CTC';
  return 'Fixed amount';
};

export default function SalaryComponents() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('EARNING');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    try {
      setRows(await listSalaryComponents());
      setError('');
    } catch (e) {
      setError(String(e?.message || 'Could not load salary components.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const out = {};
    for (const t of TYPES) out[t.id] = rows.filter((r) => r.type === t.id).length;
    return out;
  }, [rows]);

  const shown = useMemo(
    () => rows.filter((r) => r.type === type).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)),
    [rows, type]
  );

  const remove = async (row) => {
    const ok = await confirmDialog({
      title: `Delete ${row.name}?`,
      message:
        'A component that has never been used on a payslip can be deleted. One that has must be made inactive instead, so old payslips stay readable.',
      confirmLabel: 'Yes, delete',
    });
    if (!ok) return;
    try {
      await deleteSalaryComponent(row.id);
      notify.success(`${row.name} deleted.`);
      load();
    } catch (e) {
      notify.error(String(e?.message || 'Could not delete that component.'));
    }
  };

  if (loading) return <SkeletonCard lines={6} />;

  return (
    <div className="space-y-6">
      <SettingsScreenHeader
        entity="settings"
        title="Salary components"
        description="The earnings, deductions and employer costs a salary is built from."
        actions={
          <button type="button" className="ui-btn ui-btn-primary" onClick={() => setEditing(blank(type))}>
            <Plus size={16} aria-hidden="true" /> New component
          </button>
        }
      />

      {error ? (
        <div className="ui-card p-3 text-sm" role="alert" style={{ borderColor: 'rgb(var(--neg))', color: 'rgb(var(--neg))' }}>
          {error}
        </div>
      ) : null}

      {/* One strip, three populations. A deduction and an employer cost read
          almost the same on a row and mean opposite things to net pay, so they
          are never mixed into one list. */}
      <div className="ui-segmented" role="tablist" aria-label="Component type">
        {TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={type === t.id}
            className="ui-segment"
            onClick={() => setType(t.id)}
          >
            {t.label}
            <span className="ui-segment-count">{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={`No ${TYPES.find((t) => t.id === type)?.singular.toLowerCase()} components yet`}
          description="A salary structure is a list of components. Add the ones this company pays, and the structure can be built from them."
          action={
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => setEditing(blank(type))}>
              <Plus size={16} aria-hidden="true" /> New component
            </button>
          }
        />
      ) : (
        <div className="ui-card overflow-hidden">
          <div className="overflow-x-auto ui-table-scroll">
            <table className="ui-table w-full">
              <thead>
                <tr>
                  <th scope="col" className="ui-th">Component</th>
                  <th scope="col" className="ui-th">Code</th>
                  <th scope="col" className="ui-th">How it is worked out</th>
                  <th scope="col" className="ui-th ui-col-h-center">Taxable</th>
                  <th scope="col" className="ui-th ui-col-h-center">Prorated</th>
                  <th scope="col" className="ui-th">Counts towards</th>
                  <th scope="col" className="ui-th ui-col-h-center">Status</th>
                  <th scope="col" className="ui-th ui-col-h-center w-10">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => {
                  const wages = [
                    c.includeInPfWage ? 'PF' : null,
                    c.includeInEsiWage ? 'ESI' : null,
                    c.includeInGratuityWage ? 'Gratuity' : null,
                  ].filter(Boolean);
                  return (
                    <tr key={c.id} className="ui-row-click" onClick={() => setEditing(c)}>
                      <td className="ui-col-entity">{c.name}</td>
                      <td className="ui-col-id">{c.code}</td>
                      <td className="ui-col-meta">{describeMethod(c)}</td>
                      <td className="ui-col-h-center">{c.isTaxable ? 'Yes' : 'No'}</td>
                      <td className="ui-col-h-center">{c.prorate ? 'Yes' : 'No'}</td>
                      <td className="ui-col-meta">{wages.length ? wages.join(', ') : '—'}</td>
                      <td>
                        <span className={`ui-pill ${c.isActive ? 'ui-pill-pos' : 'ui-pill-neutral'}`}>
                          {c.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="ui-icon-btn"
                          aria-label={`Delete ${c.name}`}
                          onClick={() => remove(c)}
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ComponentDrawer
        component={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}

/* Split so the form's state lives only while it is open: closing discards an
   unsaved edit, and reopening reads the row fresh rather than a stale copy. */
const ComponentDrawer = ({ component, onClose, onSaved }) => (
  <Drawer
    open={Boolean(component)}
    onClose={onClose}
    title={component?.id ? 'Edit component' : 'New salary component'}
    description="What this line is, how it is worked out, and what it counts towards."
  >
    {component ? <ComponentForm initial={component} onClose={onClose} onSaved={onSaved} /> : null}
  </Drawer>
);

const ComponentForm = ({ initial, onClose, onSaved }) => {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [formulaCheck, setFormulaCheck] = useState(null);
  const checkedFor = useRef('');

  const set = (patch) => setForm((p) => ({ ...p, ...patch }));
  const isNew = !initial.id;

  /* Checked against the same parser the payroll run uses, so a formula that
     passes here cannot fail on the twentieth employee of a run. Debounced —
     this is somebody typing, not somebody submitting. */
  useEffect(() => {
    if (form.calculationMethod !== 'FORMULA') {
      setFormulaCheck(null);
      return undefined;
    }
    const text = String(form.formula || '').trim();
    if (!text) {
      setFormulaCheck(null);
      return undefined;
    }
    const t = setTimeout(() => {
      checkedFor.current = text;
      validateSalaryFormula(text)
        .then((verdict) => {
          if (checkedFor.current === text) setFormulaCheck(verdict);
        })
        .catch(() => setFormulaCheck(null));
    }, 350);
    return () => clearTimeout(t);
  }, [form.formula, form.calculationMethod]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        amount: Number(form.amount || 0),
        percentage: Number(form.percentage || 0),
        displayOrder: Number(form.displayOrder || 0),
        statutoryScheme: form.calculationMethod === 'STATUTORY' ? form.statutoryScheme : null,
      };
      if (isNew) await createSalaryComponent(payload);
      else await updateSalaryComponent(initial.id, payload);
      notify.success(`${form.name} saved.`);
      onSaved();
    } catch (err) {
      notify.error(String(err?.message || 'Could not save that component.'));
    } finally {
      setSaving(false);
    }
  };

  const Check = ({ field, label, hint = '' }) => (
    <label className="flex items-start gap-2 text-sm" htmlFor={`component-${field}`}>
      <input
        id={`component-${field}`}
        type="checkbox"
        className="ui-checkbox mt-0.5"
        checked={Boolean(form[field])}
        onChange={(e) => set({ [field]: e.target.checked })}
      />
      <span className="min-w-0">
        <span className="block">{label}</span>
        {hint ? <span className="ui-caption block">{hint}</span> : null}
      </span>
    </label>
  );

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem] gap-3">
          <div>
            <label className="ui-label" htmlFor="component-name">Name</label>
            <input
              id="component-name"
              className="ui-input w-full"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="ui-label" htmlFor="component-code">Code</label>
            <input
              id="component-code"
              className="ui-input ui-mono w-full"
              value={form.code}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })}
              required
            />
            <span className="ui-caption">What a formula refers to.</span>
          </div>
        </div>

        <div>
          <label className="ui-label" htmlFor="component-description">Description</label>
          <input
            id="component-description"
            className="ui-input w-full"
            value={form.description || ''}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="ui-t-sec">How it is worked out</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="ui-label" htmlFor="component-method">Method</label>
            <select
              id="component-method"
              className="ui-select w-full"
              value={form.calculationMethod}
              onChange={(e) => set({ calculationMethod: e.target.value })}
            >
              {METHODS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          {form.calculationMethod === 'FIXED' ? (
            <div>
              <label className="ui-label" htmlFor="component-amount">Amount</label>
              <input
                id="component-amount"
                type="number"
                min="0"
                step="0.01"
                className="ui-input ui-num w-full"
                value={form.amount}
                onChange={(e) => set({ amount: e.target.value })}
              />
            </div>
          ) : null}

          {form.calculationMethod === 'PERCENTAGE' ? (
            <>
              <div>
                <label className="ui-label" htmlFor="component-percentage">Percentage</label>
                <input
                  id="component-percentage"
                  type="number"
                  min="0"
                  step="0.01"
                  className="ui-input ui-num w-full"
                  value={form.percentage}
                  onChange={(e) => set({ percentage: e.target.value })}
                />
              </div>
              <div>
                <label className="ui-label" htmlFor="component-base">Of</label>
                <select
                  id="component-base"
                  className="ui-select w-full"
                  value={form.calculationBase || ''}
                  onChange={(e) => set({ calculationBase: e.target.value })}
                >
                  <option value="">Choose one</option>
                  {BASES.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          {form.calculationMethod === 'STATUTORY' ? (
            <div>
              <label className="ui-label" htmlFor="component-scheme">Scheme</label>
              <select
                id="component-scheme"
                className="ui-select w-full"
                value={form.statutoryScheme || ''}
                onChange={(e) => set({ statutoryScheme: e.target.value })}
              >
                <option value="">Choose one</option>
                {SCHEMES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div>
            <label className="ui-label" htmlFor="component-rounding">Rounding</label>
            <select
              id="component-rounding"
              className="ui-select w-full"
              value={form.rounding}
              onChange={(e) => set({ rounding: e.target.value })}
            >
              <option value="NONE">None</option>
              <option value="NEAREST">Nearest rupee</option>
              <option value="UP">Up</option>
              <option value="DOWN">Down</option>
            </select>
          </div>
        </div>

        {form.calculationMethod === 'FORMULA' ? (
          <div>
            <label className="ui-label" htmlFor="component-formula">Formula</label>
            <input
              id="component-formula"
              className="ui-input ui-mono w-full"
              value={form.formula || ''}
              onChange={(e) => set({ formula: e.target.value })}
              placeholder="BASIC * 0.4"
            />
            {/* What it does, on a worked example, before it is saved. */}
            {formulaCheck?.ok ? (
              <span className="ui-caption block mt-1">
                Reads correctly. On a ₹40,000 basic and ₹80,000 gross this pays{' '}
                <span className="ui-num">{Number(formulaCheck.sample ?? 0).toLocaleString('en-IN')}</span>.
              </span>
            ) : null}
            {formulaCheck && !formulaCheck.ok ? (
              <span className="ui-caption block mt-1" style={{ color: 'rgb(var(--neg))' }}>
                {formulaCheck.error}
              </span>
            ) : null}
            {!formulaCheck ? (
              <span className="ui-caption block mt-1">
                BASIC, GROSS, CTC, PAYABLE_DAYS and WORKING_DAYS, with IF, MIN, MAX and ROUND.
              </span>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <h3 className="ui-t-sec">What it counts towards</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
          <Check field="isTaxable" label="Taxable" hint="Counts towards income tax." />
          <Check field="prorate" label="Prorated" hint="Reduced when somebody joins or leaves mid-period." />
          <Check field="includeInGross" label="Part of gross" />
          <Check field="includeInNetPay" label="Part of net pay" />
          <Check field="includeInPfWage" label="Counts towards PF wages" />
          <Check field="includeInEsiWage" label="Counts towards ESI wages" />
          <Check field="includeInGratuityWage" label="Counts towards gratuity wages" />
          <Check field="isVariable" label="Entered each month" hint="The amount is given per payroll rather than standing." />
          <Check field="isActive" label="Active" hint="An inactive component stays on old payslips but is offered nowhere new." />
        </div>
      </section>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" className="ui-btn ui-btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="ui-btn ui-btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save component'}
        </button>
      </div>
    </form>
  );
};
