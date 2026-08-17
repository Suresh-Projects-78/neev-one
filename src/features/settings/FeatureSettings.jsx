import React, { useEffect, useMemo, useState } from 'react';
import { Check, Lock, RotateCcw, Save } from 'lucide-react';

import { getFeatureCatalog, setFeatures } from '../../api/features';
import { PageHeader, Spinner } from '../../components/ui/Primitives';
import { useFeatures } from '../../permissions/useFeatures';

const CATEGORY_ORDER = ['Operations', 'Accounting', 'Inventory', 'Governance', 'Communication', 'Data'];

const CATEGORY_BLURB = {
  Operations: 'Which documents and locations this company uses day to day',
  Accounting: 'How the books behave',
  Inventory: 'Stock tracking depth',
  Governance: 'Controls over who may do what',
  Communication: 'What the product sends, and from where',
  Data: 'Getting information in and out',
};

/**
 * Turn product capabilities on and off per organisation.
 *
 * Everything switched off here disappears from navigation and from forms, so a
 * single-shop customer is not asked for a branch on every invoice.
 */
export const FeatureSettings = () => {
  const { reload: reloadFeatures } = useFeatures();

  const [catalog, setCatalog] = useState([]);
  const [values, setValues] = useState({});
  const [baseline, setBaseline] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(getFeatureCatalog)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data?.features) ? data.features : [];
        const current = {};
        for (const f of list) current[f.key] = Boolean(f.enabled);
        setCatalog(list);
        setValues(current);
        setBaseline(current);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message || e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = useMemo(
    () => Object.keys(values).some((k) => values[k] !== baseline[k]),
    [values, baseline]
  );

  const byCategory = useMemo(() => {
    const map = new Map();
    for (const f of catalog) {
      if (!map.has(f.category)) map.set(f.category, []);
      map.get(f.category).push(f);
    }
    return map;
  }, [catalog]);

  // A child cannot be on while its parent is off; the server resolves this too,
  // but showing it live explains why a toggle stopped responding.
  const effective = useMemo(() => {
    const out = { ...values };
    for (const f of catalog) {
      if (f.dependsOn && out[f.dependsOn] === false) out[f.key] = false;
    }
    return out;
  }, [values, catalog]);

  const toggle = (key, next) => setValues((prev) => ({ ...prev, [key]: next }));

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await setFeatures(values);
      const applied = res?.features || values;
      setValues(applied);
      setBaseline(applied);
      setSavedAt(Date.now());
      reloadFeatures();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="ui-card p-8 flex items-center justify-center gap-3">
        <Spinner />
        <span className="ui-muted text-sm">Loading features…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Features"
        description="Switch capabilities on or off for this company. Anything off is hidden from menus and forms."
        actions={
          <>
            {dirty ? <span className="ui-pill ui-pill-warn">Unsaved changes</span> : null}
            {!dirty && savedAt ? (
              <span className="ui-pill ui-pill-pos" role="status">
                <Check size={11} aria-hidden="true" /> Saved
              </span>
            ) : null}
            <button
              type="button"
              className="ui-btn ui-btn-secondary"
              onClick={() => setValues(baseline)}
              disabled={!dirty || saving}
            >
              <RotateCcw size={15} aria-hidden="true" /> Revert
            </button>
            <button type="button" className="ui-btn ui-btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? <Spinner /> : <Save size={15} aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      />

      {error ? (
        <div
          className="ui-card p-3 text-sm"
          role="alert"
          style={{ borderColor: 'rgb(var(--neg))', color: 'rgb(var(--neg))' }}
        >
          {error}
        </div>
      ) : null}

      {CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((category) => (
        <section key={category} className="ui-card overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
            <div className="ui-title text-sm">{category}</div>
            <div className="ui-subtle text-xs mt-0.5">{CATEGORY_BLURB[category]}</div>
          </div>

          <div>
            {byCategory.get(category).map((f, idx) => {
              const parent = f.dependsOn ? catalog.find((x) => x.key === f.dependsOn) : null;
              const blockedByParent = Boolean(parent && values[parent.key] === false);
              const disabled = f.locked || blockedByParent;

              return (
                <label
                  key={f.key}
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[rgb(var(--surface-sunken))]"
                  style={idx ? { borderTop: '1px solid rgb(var(--border))' } : undefined}
                >
                  <input
                    type="checkbox"
                    className="ui-input mt-1"
                    checked={Boolean(effective[f.key])}
                    disabled={disabled}
                    onChange={(e) => toggle(f.key, e.target.checked)}
                    aria-describedby={`feat-${f.key}-desc`}
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="ui-title text-sm">{f.label}</span>
                      {f.locked ? (
                        <span className="ui-pill ui-pill-neutral">
                          <Lock size={10} aria-hidden="true" /> Always on
                        </span>
                      ) : null}
                      {blockedByParent ? (
                        <span className="ui-pill ui-pill-warn">Needs {parent.label}</span>
                      ) : null}
                    </span>
                    <span id={`feat-${f.key}-desc`} className="ui-muted text-xs block mt-0.5">
                      {f.locked && f.lockedReason ? `${f.description} ${f.lockedReason}.` : f.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>
      ))}

      <p className="ui-subtle text-xs">
        Switching a feature off hides it; it does not delete anything already recorded. Turning it back on restores
        access to that data.
      </p>
    </div>
  );
};

export default FeatureSettings;
