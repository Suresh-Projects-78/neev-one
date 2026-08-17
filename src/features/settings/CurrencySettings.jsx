import React, { useCallback, useEffect, useState } from 'react';
import { Coins, Plus } from 'lucide-react';

import { createCurrency, listCurrencies, listRates, saveRate } from '../../api/currencies';
import { EmptyState, PageHeader, Spinner } from '../../components/ui/Primitives';

/**
 * Currencies and exchange rates — requirement 8.
 *
 * The screen states the rule the ledger relies on: the books are kept in the
 * base currency, and a foreign document is translated at the rate in force on
 * its own date. Operators who do not know that will assume a wrong rate was
 * used when a back-dated invoice does not match today's.
 */

const today = () => new Date().toISOString().slice(0, 10);

export default function CurrencySettings() {
  const [baseCurrency, setBaseCurrency] = useState('INR');
  const [currencies, setCurrencies] = useState([]);
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [draft, setDraft] = useState({ code: '', name: '', symbol: '' });
  const [rateDraft, setRateDraft] = useState({ code: '', date: today(), rate: '' });

  const reload = useCallback(async () => {
    try {
      const data = await listCurrencies();
      setBaseCurrency(String(data?.baseCurrency || 'INR'));
      setCurrencies(data?.currencies || []);
      setRates(await listRates());
      setError('');
    } catch (e) {
      setError(String(e?.message || 'Could not load currencies.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (fn, done) => {
    setBusy(true);
    try {
      await fn();
      setError('');
      done?.();
      await reload();
    } catch (e) {
      setError(String(e?.message || 'That did not work.'));
    } finally {
      setBusy(false);
    }
  };

  const onAddCurrency = (e) => {
    e.preventDefault();
    run(
      () =>
        createCurrency({
          code: draft.code.trim().toUpperCase(),
          name: draft.name.trim(),
          symbol: draft.symbol.trim() || undefined,
        }),
      () => setDraft({ code: '', name: '', symbol: '' })
    );
  };

  const onAddRate = (e) => {
    e.preventDefault();
    run(
      () => saveRate({ code: rateDraft.code, date: rateDraft.date, rate: Number(rateDraft.rate) }),
      () => setRateDraft((p) => ({ ...p, rate: '' }))
    );
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Currencies and exchange rates"
        description={`The books are kept in ${baseCurrency}. A document in any other currency is translated at the rate in force on its own date.`}
      />

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <form onSubmit={onAddCurrency} className="ui-card p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2">
          <Plus size={16} /> Add a currency
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Code *</label>
            <input
              value={draft.code}
              onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
              className="ui-input uppercase"
              maxLength={3}
              placeholder="USD"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              className="ui-input"
              placeholder="US Dollar"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Symbol</label>
            <input
              value={draft.symbol}
              onChange={(e) => setDraft((p) => ({ ...p, symbol: e.target.value }))}
              className="ui-input"
              placeholder="$"
            />
          </div>
        </div>
        <button type="submit" disabled={busy} className="ui-btn-primary disabled:opacity-50">
          {busy ? 'Saving…' : 'Add currency'}
        </button>
      </form>

      {currencies.length === 0 ? (
        <EmptyState
          icon={Coins}
          title="No foreign currencies yet"
          description={`Everything is in ${baseCurrency}. Add a currency above to invoice in another one.`}
        />
      ) : (
        <>
          <form onSubmit={onAddRate} className="ui-card p-4 space-y-3">
            <h3 className="font-semibold">Record a rate</h3>
            <p className="text-xs ui-muted">
              How many {baseCurrency} one unit is worth, on a date. Rates are kept per date and never overwritten
              across dates — a past document keeps the rate it was posted at.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Currency *</label>
                <select
                  value={rateDraft.code}
                  onChange={(e) => setRateDraft((p) => ({ ...p, code: e.target.value }))}
                  className="ui-select"
                  required
                >
                  <option value="">Select</option>
                  {currencies.map((c) => (
                    <option key={c.id} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date *</label>
                <input
                  type="date"
                  value={rateDraft.date}
                  onChange={(e) => setRateDraft((p) => ({ ...p, date: e.target.value }))}
                  className="ui-input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{baseCurrency} per unit *</label>
                <input
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={rateDraft.rate}
                  onChange={(e) => setRateDraft((p) => ({ ...p, rate: e.target.value }))}
                  className="ui-input"
                  placeholder="83.00"
                  required
                />
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={busy} className="ui-btn-primary disabled:opacity-50">
                  {busy ? 'Saving…' : 'Save rate'}
                </button>
              </div>
            </div>
          </form>

          <div className="ui-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left ui-muted">
                  <th className="px-4 py-2">Currency</th>
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2 text-right">{baseCurrency} per unit</th>
                </tr>
              </thead>
              <tbody>
                {rates.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center ui-muted">
                      No rates recorded. An invoice in a foreign currency cannot be saved until one exists for its
                      date.
                    </td>
                  </tr>
                ) : (
                  rates.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-4 py-2 font-medium">{r.code}</td>
                      <td className="px-4 py-2">{r.date}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.rate}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
