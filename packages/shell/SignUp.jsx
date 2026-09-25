import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

import { GST_STATE_BY_CODE, getGstStateFromGstin } from '@ui/utils/gst';

import AuthLayout from './AuthLayout';
import { APPS } from './registry';
import { useSession } from './session';

/**
 * Starting a company, which on this platform is two decisions and not one.
 *
 * Who you are, then which apps you are buying. The second step is the one that
 * matters architecturally: choosing Payroll and not Accounting has to be a
 * supported answer, and the company created from it has to work — a rail, a
 * landing screen, a database of its own — without ever touching a ledger.
 *
 * The step also stands in for provisioning. In the product, ticking Payroll
 * creates payroll.db for this tenant and seeds the statutory rates; ticking
 * Accounting creates accounting.db and a chart of accounts. Nothing is shared
 * between them but the tenant's identity.
 */
export default function SignUp({ onHome, onSignIn }) {
  const { signUp } = useSession();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', password: '', company: '', gstin: '', state: '' });
  const [chosen, setChosen] = useState(['accounting']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (patch) => {
    setForm((f) => {
      const next = { ...f, ...patch };
      /* The first two digits of a GSTIN are the state, so a typed GSTIN
         answers the question below it. Only when the state is still blank:
         overwriting a deliberate choice would be worse than asking twice. */
      if (patch.gstin && !f.state) {
        const derived = getGstStateFromGstin(patch.gstin);
        if (derived) next.state = derived;
      }
      return next;
    });
    setError('');
  };

  const GST_STATES = useMemo(
    () => [...new Set(Object.values(GST_STATE_BY_CODE))].sort((a, b) => a.localeCompare(b)),
    []
  );

  const buildable = useMemo(() => APPS.filter((a) => a.available), []);
  const planned = useMemo(() => APPS.filter((a) => !a.available), []);

  const toggle = (id) =>
    setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const next = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Tell us who you are.');
    if (!form.email.trim()) return setError('An email address, so you can be signed back in.');
    if (form.password.length < 8) return setError('A password of at least eight characters.');
    if (!form.company.trim()) return setError('The company these books belong to.');
    /*
     * A company is named on every screen and stored in plain text. If it is
     * the password, the password is now on the header of every page and in
     * the database as a label — so this is refused rather than tidied up
     * afterwards. It happens when a password manager fills the box after the
     * password field, which is why it is worth checking and not merely
     * unlikely.
     */
    if (form.company.trim() === form.password) {
      return setError('That is your password. The company name is shown on every screen — give it the business’s name.');
    }
    if (!form.state.trim()) return setError('The state your head office is in — it decides how GST splits.');
    setStep(2);
  };

  const finish = async () => {
    if (!chosen.length) {
      setError('Choose at least one app. You can add the others later.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signUp({
        fullName: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        company: form.company.trim(),
        gstin: form.gstin.trim(),
        state: form.state.trim(),
        apps: chosen,
      });
    } catch (err) {
      setError(String(err?.message || 'Could not create that company.'));
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={step === 1 ? 'Start a company' : 'Choose your apps'}
      subtitle={
        step === 1
          ? 'Two steps. The second one decides what this company actually gets.'
          : `${form.company} starts with what you tick here. Nothing else is created.`
      }
      wide={step === 2}
      onHome={onHome}
      footer={
        step === 1 ? (
          <span className="ui-muted">
            Already have an account?{' '}
            <button type="button" className="ui-link font-medium" onClick={onSignIn}>
              Sign in
            </button>
          </span>
        ) : null
      }
    >
      {step === 1 ? (
        <form onSubmit={next} className="space-y-5">
          <div>
            <label className="ui-label" htmlFor="signup-name">Your name</label>
            <input
              id="signup-name"
              className="ui-input h-11 w-full"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              autoComplete="name"
              autoFocus
            />
          </div>

          <div>
            <label className="ui-label" htmlFor="signup-email">Email address</label>
            <input
              id="signup-email"
              type="email"
              className="ui-input h-11 w-full"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
              autoComplete="username"
            />
          </div>

          <div>
            <label className="ui-label" htmlFor="signup-password">Password</label>
            <input
              id="signup-password"
              type="password"
              className="ui-input h-11 w-full"
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
              autoComplete="new-password"
            />
            <p className="ui-caption mt-1">At least eight characters.</p>
          </div>

          <div>
            <label className="ui-label" htmlFor="signup-company">Company name</label>
            <input
              id="signup-company"
              className="ui-input h-11 w-full"
              value={form.company}
              onChange={(e) => set({ company: e.target.value })}
              /* Named for the browser, so a password manager cannot decide
                 for itself that the box after a password is part of the
                 credential. */
              autoComplete="organization"
            />
          </div>

          <div>
            <label className="ui-label" htmlFor="signup-gstin">
              GSTIN <span className="ui-caption">· optional</span>
            </label>
            <input
              id="signup-gstin"
              className="ui-input h-11 w-full ui-mono"
              value={form.gstin}
              onChange={(e) => set({ gstin: e.target.value.toUpperCase() })}
              autoComplete="off"
              maxLength={15}
              placeholder="27AAAAA0000A1Z5"
            />
            <p className="ui-caption mt-1">Fills the state below when it is a valid number.</p>
          </div>

          <div>
            <label className="ui-label" htmlFor="signup-state">State</label>
            <select
              id="signup-state"
              className="ui-select h-11 w-full"
              value={form.state}
              onChange={(e) => set({ state: e.target.value })}
            >
              <option value="">Select a state</option>
              {GST_STATES.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
            <p className="ui-caption mt-1">
              Decides whether every invoice splits into CGST and SGST or lands as IGST.
            </p>
          </div>

          {error ? <p className="text-sm" style={{ color: 'rgb(var(--neg))' }}>{error}</p> : null}

          <button type="submit" className="ui-btn ui-btn-brand ui-btn-lg w-full">
            Continue <ArrowRight size={16} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2">
            {buildable.map((app) => {
              const on = chosen.includes(app.id);
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => toggle(app.id)}
                  aria-pressed={on}
                  className="ui-panel p-4 text-left"
                  style={
                    on
                      ? { borderColor: 'rgb(var(--brand))', boxShadow: '0 0 0 1px rgb(var(--brand))' }
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="grid place-items-center w-9 h-9 rounded-lg shrink-0"
                      style={{ backgroundColor: 'rgb(var(--brand-soft))', color: 'rgb(var(--brand))' }}
                    >
                      <app.icon size={18} aria-hidden="true" />
                    </span>
                    <span
                      className="w-5 h-5 rounded-md grid place-items-center shrink-0"
                      style={{
                        backgroundColor: on ? 'rgb(var(--brand))' : 'transparent',
                        border: on ? 'none' : '1px solid rgb(var(--border))',
                        /* The ink that goes on the brand colour, which is not
                           white in dark mode — a white tick on a light orange
                           box is a tick nobody can see. */
                        color: 'rgb(var(--on-brand))',
                      }}
                      aria-hidden="true"
                    >
                      {on ? <Check size={13} /> : null}
                    </span>
                  </div>
                  <span className="mt-3 block font-medium">{app.name}</span>
                  <span className="mt-1 block text-sm ui-muted">{app.blurb}</span>
                  <span className="mt-3 block ui-caption ui-mono">{app.database}</span>
                </button>
              );
            })}

            {planned.map((app) => (
              <div key={app.id} className="ui-panel p-4 opacity-60">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="grid place-items-center w-9 h-9 rounded-lg shrink-0"
                    style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}
                  >
                    <app.icon size={18} aria-hidden="true" />
                  </span>
                  <span className="ui-pill ui-pill-neutral">Coming</span>
                </div>
                <span className="mt-3 block font-medium">{app.name}</span>
                <span className="mt-1 block text-sm ui-muted">{app.blurb}</span>
              </div>
            ))}
          </div>

          <p className="ui-caption">
            Each app you tick gets its own database for this company. They are never merged, and an app
            you did not tick is not created at all — which is what lets a company buy Payroll without
            being handed a ledger it will never open.
          </p>

          {error ? <p className="text-sm" style={{ color: 'rgb(var(--neg))' }}>{error}</p> : null}

          <div className="flex items-center gap-3">
            <button type="button" className="ui-btn ui-btn-secondary" onClick={() => setStep(1)}>
              <ArrowLeft size={16} aria-hidden="true" /> Back
            </button>
            <button
              type="button"
              className="ui-btn ui-btn-brand ui-btn-lg flex-1"
              onClick={finish}
              disabled={busy}
            >
              {busy ? 'Creating…' : `Create ${form.company || 'company'}`}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
