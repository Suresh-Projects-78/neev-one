import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Lock, RotateCcw, Save, Search } from 'lucide-react';

import { getFeatureCatalog, setFeatures } from '../../api/features';
import { PageHeader, Spinner, SkeletonCard } from '../../components/ui/Primitives';
import { useFeatures } from '../../permissions/useFeatures';
import {
  FEATURE_GROUPS,
  TAX_FEATURES,
  groupForFeature,
  iconForFeature,
  settingsLinkFor,
} from '../settings/featureRegistry';

/**
 * The one place a capability is switched on or off.
 *
 * It used to be four places: Settings → Preferences held all forty switches,
 * six Business panes held the same switches filtered by subject, and the
 * onboarding picker offered them again as packs. Four surfaces, one store —
 * so nothing was ever out of step, but nobody could answer "where do I turn
 * Sales Orders on" with one sentence.
 *
 * This is that sentence. The panes are gone and their routes come here; the
 * onboarding picker stays, because asking "do you hold stock" once at signup
 * is a different job from tuning a working system.
 *
 * It is a presentation layer. The catalogue on the server decides what exists,
 * what it defaults to and what is locked; `setFeatures` remains the only
 * writer. Nothing here holds feature state of its own.
 */

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'on', label: 'Enabled' },
  { key: 'off', label: 'Disabled' },
];

/** Yes/No, not a switch: a dropdown says what the current answer IS. */
const YesNo = ({ value, onChange, disabled, label }) => (
  <select
    value={value ? 'yes' : 'no'}
    onChange={(e) => onChange(e.target.value === 'yes')}
    disabled={disabled}
    aria-label={label}
    className="ui-select ui-feature-answer"
  >
    <option value="yes">Yes</option>
    <option value="no">No</option>
  </select>
);

export const FeaturesPage = ({ onNavigate = null, currentCompany = null }) => {
  const { reload: reloadFeatures } = useFeatures();

  const [catalog, setCatalog] = useState([]);
  const [values, setValues] = useState({});
  const [baseline, setBaseline] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(0);

  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const [state, setState] = useState('all');

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

  /*
   * A child cannot be on while its parent is off. The server resolves this on
   * save as well; showing it live is what explains why a control stopped
   * responding instead of leaving it looking broken.
   */
  const effective = useMemo(() => {
    const out = { ...values };
    for (const f of catalog) {
      if (f.dependsOn && out[f.dependsOn] === false) out[f.key] = false;
    }
    return out;
  }, [values, catalog]);

  /* The tax three are read from where they already live. This screen shows
     their state and points at the page that owns them; it never writes them. */
  const taxCompliances = currentCompany?.profile?.taxCompliances || null;
  const taxRows = useMemo(
    () =>
      TAX_FEATURES.map((t) => ({
        key: t.key,
        label: t.label,
        icon: t.icon,
        enabled: t.read(taxCompliances),
        config: t.config,
        readOnly: true,
      })),
    [taxCompliances]
  );

  const q = query.trim().toLowerCase();

  const sections = useMemo(() => {
    const rows = catalog.map((f) => ({
      key: f.key,
      label: f.label,
      description: f.description,
      icon: iconForFeature(f.key),
      group: groupForFeature(f.key),
      locked: f.locked,
      lockedReason: f.lockedReason,
      notEntitled: f.entitled === false,
      upgradeHint: f.upgradeHint,
      dependsOn: f.dependsOn,
      config: settingsLinkFor(f.key)?.key || '',
      configLabel: settingsLinkFor(f.key)?.label || 'Configure',
      enabled: Boolean(effective[f.key]),
    }));

    const all = [...rows, ...taxRows.map((t) => ({ ...t, group: 'taxation', configLabel: 'Configure' }))];

    const matched = all.filter((r) => {
      if (group !== 'all' && r.group !== group) return false;
      if (state === 'on' && !r.enabled) return false;
      if (state === 'off' && r.enabled) return false;
      if (q && !`${r.label} ${r.key}`.toLowerCase().includes(q)) return false;
      return true;
    });

    const map = new Map();
    for (const r of matched) {
      if (!map.has(r.group)) map.set(r.group, []);
      map.get(r.group).push(r);
    }
    return FEATURE_GROUPS.filter((g) => map.has(g.key)).map((g) => ({ ...g, items: map.get(g.key) }));
  }, [catalog, effective, taxRows, group, state, q]);

  /*
   * Turning a parent off takes its children with it, and says so before the
   * save rather than after. Nothing is deleted either way — a feature that is
   * off hides its screens; the documents it raised stay in the book.
   */
  const toggle = (key, next) =>
    setValues((prev) => {
      const out = { ...prev, [key]: next };
      if (!next) for (const f of catalog) if (f.dependsOn === key) out[f.key] = false;
      return out;
    });

  const childrenOf = (key) => catalog.filter((f) => f.dependsOn === key && values[f.key]);

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

  if (loading) return <SkeletonCard lines={5} />;

  return (
    <div className="space-y-3">
      <PageHeader
        entity="settings"
        title="Features"
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
              <RotateCcw size={16} aria-hidden="true" /> Revert
            </button>
            <button type="button" className="ui-btn ui-btn-primary" onClick={save} disabled={!dirty || saving}>
              {saving ? <Spinner /> : <Save size={16} aria-hidden="true" />}
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="ui-scope-field inline-flex" style={{ flex: '1 1 16rem', maxWidth: '22rem' }}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search features"
            aria-label="Search features"
            className="ui-input w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[{ key: 'all', label: 'All' }, ...FEATURE_GROUPS.filter((g) => g.key !== 'other')].map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setGroup(g.key)}
              className="ui-btn ui-btn-sm"
              data-active={group === g.key ? 'true' : undefined}
              style={
                group === g.key
                  ? { backgroundColor: 'rgb(var(--brand) / 0.12)', color: 'rgb(var(--brand-ink))', border: '1px solid rgb(var(--brand) / 0.3)' }
                  : { border: '1px solid rgb(var(--border-strong))' }
              }
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="ms-auto flex items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setState(f.key)}
              className="ui-btn ui-btn-sm"
              style={
                state === f.key
                  ? { backgroundColor: 'rgb(var(--brand) / 0.12)', color: 'rgb(var(--brand-ink))', border: '1px solid rgb(var(--brand) / 0.3)' }
                  : { border: '1px solid rgb(var(--border-strong))' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {!sections.length ? (
        <div className="ui-card p-6 text-center text-sm ui-muted">
          {q ? `No feature matches “${query.trim()}”.` : 'Nothing here.'}
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.key} className="ui-card overflow-hidden">
          <div
            className="px-4 py-2 ui-sunken flex items-center justify-between gap-3"
            style={{ borderBottom: '1px solid rgb(var(--border))' }}
          >
            <div className="ui-t-label">{section.label}</div>
            <div className="ui-caption">
              {section.items.length} {section.items.length === 1 ? 'feature' : 'features'}
            </div>
          </div>

          <div>
            {section.items.map((r) => {
              const Icon = r.icon;
              const parent = r.dependsOn ? catalog.find((x) => x.key === r.dependsOn) : null;
              const blocked = Boolean(parent && values[parent.key] === false);
              const disabled = r.locked || blocked || r.notEntitled || r.readOnly;
              const losing = !r.readOnly && values[r.key] ? childrenOf(r.key) : [];

              return (
                <div key={r.key} className="ui-feature-row">
                  {Icon ? (
                    <span
                      aria-hidden="true"
                      className="ui-feature-mark"
                      style={{
                        '--cat-ink': `var(--cat-${section.key})`,
                        '--cat-soft': `var(--cat-${section.key}-soft)`,
                      }}
                    >
                      <Icon size={16} />
                    </span>
                  ) : null}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{r.label}</span>
                      {r.locked ? (
                        <span className="ui-pill ui-pill-neutral">
                          <Lock size={10} aria-hidden="true" /> Always on
                        </span>
                      ) : null}
                      {r.notEntitled ? (
                        <span className="ui-pill ui-pill-neutral">
                          <Lock size={10} aria-hidden="true" /> {r.upgradeHint || 'Not on your plan'}
                        </span>
                      ) : null}
                      {blocked ? <span className="ui-pill ui-pill-warn">Needs {parent.label}</span> : null}
                    </span>
                    {/* Explanatory text only where something is at stake: a
                        dependency, a consequence, or a value this screen does
                        not own. A line under "Sales Orders" saying it enables
                        sales orders is noise. */}
                    {losing.length ? (
                      <span className="ui-caption block mt-0.5">
                        Turning this off also turns off {losing.map((c) => c.label).join(', ')}. Nothing is deleted.
                      </span>
                    ) : null}
                  </span>

                  {r.readOnly ? (
                    <span className="text-sm ui-muted flex-none text-center" style={{ width: '6rem' }}>
                      {r.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  ) : (
                    <YesNo
                      value={Boolean(effective[r.key])}
                      onChange={(next) => toggle(r.key, next)}
                      disabled={disabled}
                      label={r.label}
                    />
                  )}

                  {/* Configure appears where a capability has a real screen and
                      is switched on. No screen, no link — a row is not made
                      consistent by inventing somewhere for it to go. */}
                  <span className="flex-none" style={{ width: '6.25rem' }}>
                    {r.config && r.enabled && onNavigate ? (
                      <button type="button" onClick={() => onNavigate(r.config)} className="ui-feature-config">
                        Configure <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <p className="ui-subtle text-xs">
        Switching a feature off hides it. Nothing already recorded is deleted, and turning it back on restores access.
      </p>
    </div>
  );
};

export default FeaturesPage;
