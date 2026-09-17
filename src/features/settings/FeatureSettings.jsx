import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Lock, RotateCcw, Save } from 'lucide-react';

import { getFeatureCatalog, setFeatures } from '../../api/features';
import { PageHeader, Spinner, SkeletonCard } from '../../components/ui/Primitives';
import { useFeatures } from '../../permissions/useFeatures';
import { paneForFeature, paneMeta } from './businessPanes';
import { FEATURE_GROUPS, groupForFeature, settingsLinkFor } from './featureGroups';

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
export const FeatureSettings = ({ pane = '', onNavigate = null }) => {
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

  /**
   * Only the switches that belong on this screen.
   *
   * With no pane this is General Preferences, which keeps everything that has
   * not been given a home of its own — so a capability added on the server
   * later appears here rather than nowhere.
   */
  /*
   * On a pane, the switches that belong to it. On the Features screen itself,
   * everything — the whole catalogue grouped the way the business thinks about
   * it, rather than the leftovers that no pane claimed.
   */
  const shown = useMemo(
    () => (pane ? catalog.filter((f) => paneForFeature(f.key) === pane) : catalog),
    [catalog, pane]
  );

  /* A pane is one subject already, so its own categories are the finer cut.
     The Features screen groups by the business's six headings instead. */
  const sections = useMemo(() => {
    const order = pane
      ? CATEGORY_ORDER.map((c) => ({ key: c, label: c, blurb: CATEGORY_BLURB[c] }))
      : FEATURE_GROUPS;
    const keyOf = pane ? (f) => f.category : (f) => groupForFeature(f.key);
    const map = new Map();
    for (const f of shown) {
      const k = keyOf(f);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(f);
    }
    return order.filter((o) => map.has(o.key)).map((o) => ({ ...o, items: map.get(o.key) }));
  }, [shown, pane]);

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
      <SkeletonCard lines={4} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        entity="settings"
        title={paneMeta(pane)?.label || 'General Preferences'}
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

      {sections.map((section) => (
        <section key={section.key} className="ui-card overflow-hidden">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
            <div className="ui-title text-sm">{section.label}</div>
            <div className="ui-subtle text-xs mt-0.5">{section.blurb}</div>
          </div>

          <div>
            {section.items.map((f, idx) => {
              const parent = f.dependsOn ? catalog.find((x) => x.key === f.dependsOn) : null;
              const blockedByParent = Boolean(parent && values[parent.key] === false);
              /*
               * A feature the plan does not carry is shown locked with the plan
               * that carries it, not hidden. A module that is simply absent
               * reads as a product that cannot do the thing; one that looks
               * ordinary and then fails on save is worse. `entitled` is absent
               * on an older response, so undefined counts as entitled.
               */
              const notEntitled = f.entitled === false;
              const disabled = f.locked || blockedByParent || notEntitled;

              return (
                <label
                  key={f.key}
                  className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-[rgb(var(--surface-sunken))]"
                  style={idx ? { borderTop: '1px solid rgb(var(--border))' } : undefined}
                >
                  <input
                    type="checkbox"
                    className="ui-checkbox mt-1"
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
                      {notEntitled ? (
                        <span className="ui-pill ui-pill-neutral">
                          <Lock size={10} aria-hidden="true" /> {f.upgradeHint || 'Not on your plan'}
                        </span>
                      ) : null}
                      {blockedByParent ? (
                        <span className="ui-pill ui-pill-warn">Needs {parent.label}</span>
                      ) : null}
                    </span>
                    <span id={`feat-${f.key}-desc`} className="ui-muted text-xs block mt-0.5">
                      {f.locked && f.lockedReason ? `${f.description} ${f.lockedReason}.` : f.description}
                    </span>
                    {/* Some switches only change the shape of the organisation:
                        turning branches on does nothing until there are
                        branches, so the row says where to go next rather than
                        leaving the operator to find it. */}
                    {settingsLinkFor(f.key) && effective[f.key] && onNavigate ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onNavigate(settingsLinkFor(f.key).key);
                        }}
                        className="text-xs font-medium underline underline-offset-2 mt-1 inline-flex items-center gap-1"
                        style={{ color: 'rgb(var(--brand-ink))' }}
                      >
                        {settingsLinkFor(f.key).label}
                        <ArrowRight size={12} aria-hidden="true" />
                      </button>
                    ) : null}
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
