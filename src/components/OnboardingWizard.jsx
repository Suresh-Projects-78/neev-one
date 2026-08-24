import React, { useState } from 'react';
import { ArrowRight, Building2, Check, UserPlus } from 'lucide-react';

import { notify } from './ui/notify';

/**
 * First-run wizard. A new company used to land on an empty dashboard with
 * thirteen navigation entries and no hint where books begin. Three steps:
 * name the company properly (GSTIN and state drive every tax computation),
 * add the first customer, and jump straight into the first invoice.
 *
 * Dismissable at every step — a bookkeeper who knows the product should
 * never be fenced in by a tutorial. The flag is per company, in
 * localStorage: seeing it once is enough.
 */

const seenKey = (companyId) => `onboarded:${companyId}`;

// eslint-disable-next-line react-refresh/only-export-components
export const shouldOnboard = (db, company) => {
  if (!company?.id) return false;
  try {
    if (localStorage.getItem(seenKey(company.id))) return false;
  } catch {
    return false;
  }
  const invoices = (db?.invoices || []).filter((i) => i.companyId === company.id);
  const customers = (db?.customers || []).filter((c) => c.companyId === company.id);
  return invoices.length === 0 && customers.length === 0;
};

export default function OnboardingWizard({ setDb, currentCompany, onDone, onCreateInvoice }) {
  const [step, setStep] = useState(0);
  const [companyName, setCompanyName] = useState(currentCompany?.name || '');
  const [gstin, setGstin] = useState(currentCompany?.gstin || '');
  const [state, setState] = useState(currentCompany?.state || '');
  const [customerName, setCustomerName] = useState('');

  const finish = () => {
    try {
      localStorage.setItem(seenKey(currentCompany.id), '1');
    } catch {
      /* still dismiss for the session */
    }
    onDone?.();
  };

  const saveCompany = () => {
    if (!companyName.trim()) {
      notify.error('The company needs a name.');
      return;
    }
    setDb((prev) => ({
      ...prev,
      companies: (prev.companies || []).map((c) =>
        c.id === currentCompany.id
          ? { ...c, name: companyName.trim(), gstin: gstin.trim(), state: state.trim() }
          : c
      ),
    }));
    setStep(1);
  };

  const saveCustomer = () => {
    const name = customerName.trim();
    if (!name) {
      setStep(2); // an empty customer is a skip, not an error
      return;
    }
    setDb((prev) => {
      const customers = Array.isArray(prev.customers) ? prev.customers : [];
      const nextId = customers.reduce((m, c) => Math.max(m, Number(c?.id || 0)), 0) + 1;
      return {
        ...prev,
        customers: [
          ...customers,
          { id: nextId, companyId: currentCompany.id, name, gstRegistration: 'Unregistered', createdAt: new Date().toISOString() },
        ],
      };
    });
    setStep(2);
  };

  const STEPS = ['Company', 'First customer', 'First invoice'];

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="onboard-title">
      <div className="absolute inset-0" style={{ backgroundColor: 'rgb(0 0 0 / 0.5)' }} aria-hidden="true" />
      <div className="ui-card ui-in-pop relative w-full max-w-lg p-6" style={{ boxShadow: 'var(--shadow-pop)' }}>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className="flex items-center gap-2 text-xs font-medium"
                style={{ color: i <= step ? 'rgb(var(--brand))' : 'rgb(var(--fg-subtle))' }}
              >
                <span
                  className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold"
                  style={
                    i < step
                      ? { backgroundColor: 'rgb(var(--pos))', color: '#fff' }
                      : i === step
                      ? { backgroundColor: 'rgb(var(--brand))', color: 'rgb(var(--on-brand))' }
                      : { backgroundColor: 'rgb(var(--surface-sunken))', color: 'rgb(var(--fg-subtle))' }
                  }
                >
                  {i < step ? <Check size={11} /> : i + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </span>
            ))}
          </div>
          <button type="button" onClick={finish} className="ui-btn ui-btn-ghost ui-btn-sm text-xs">
            Skip setup
          </button>
        </div>

        {step === 0 ? (
          <div>
            <h2 id="onboard-title" className="ui-title text-lg flex items-center gap-2">
              <Building2 size={18} style={{ color: 'rgb(var(--brand))' }} aria-hidden="true" /> Welcome — set up your company
            </h2>
            <p className="ui-muted mt-1 text-sm">GSTIN and state drive every tax split, so they are worth thirty seconds now.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="ui-label">Company name</label>
                <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="ui-input" autoFocus />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="ui-label">GSTIN (optional)</label>
                  <input type="text" value={gstin} onChange={(e) => setGstin(e.target.value)} className="ui-input" placeholder="27ABCDE1234F1Z5" />
                </div>
                <div>
                  <label className="ui-label">State</label>
                  <input type="text" value={state} onChange={(e) => setState(e.target.value)} className="ui-input" placeholder="Maharashtra" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={saveCompany} className="ui-btn ui-btn-primary">
                Continue <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div>
            <h2 id="onboard-title" className="ui-title text-lg flex items-center gap-2">
              <UserPlus size={18} style={{ color: 'rgb(var(--brand))' }} aria-hidden="true" /> Who do you bill first?
            </h2>
            <p className="ui-muted mt-1 text-sm">One customer is enough to raise the first invoice. Details can come later.</p>
            <div className="mt-4">
              <label className="ui-label">Customer name</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="ui-input"
                placeholder="Acme Traders"
                autoFocus
              />
            </div>
            <div className="mt-5 flex justify-between">
              <button type="button" onClick={() => setStep(2)} className="ui-btn ui-btn-ghost">
                Skip
              </button>
              <button type="button" onClick={saveCustomer} className="ui-btn ui-btn-primary">
                Continue <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div>
            <h2 id="onboard-title" className="ui-title text-lg">Books begin with a document</h2>
            <p className="ui-muted mt-1 text-sm">
              Raise the first invoice and watch it post to the ledger the moment you save — the trial balance foots from
              day one.
            </p>
            <div className="mt-5 flex justify-between">
              <button type="button" onClick={finish} className="ui-btn ui-btn-secondary">
                Explore the dashboard
              </button>
              <button
                type="button"
                onClick={() => {
                  finish();
                  onCreateInvoice?.();
                }}
                className="ui-btn ui-btn-primary"
              >
                Create first invoice <ArrowRight size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
