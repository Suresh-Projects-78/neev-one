import { useEffect, useState } from 'react';

/**
 * Grid view state: which columns are visible, plus named saved views that
 * bundle a column set with the caller's filter snapshot.
 *
 * Persistence is localStorage, keyed per company and list, because a view is
 * a personal working arrangement — one user's "Overdue this month" should not
 * appear on a colleague's screen, and losing it on refresh would make the
 * feature pointless.
 *
 * The hook owns columns; filters stay in the list component (they already
 * live there) and cross the boundary only as a snapshot at save time and a
 * restore call at apply time.
 */

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

export function useGridView({ storageKey, columns, getFilterSnapshot, applyFilterSnapshot }) {
  const hiddenKey = `${storageKey}:hiddenCols`;
  const viewsKey = `${storageKey}:views`;

  const [hidden, setHidden] = useState(() => {
    const v = load(hiddenKey, []);
    return Array.isArray(v) ? v.filter((k) => typeof k === 'string') : [];
  });
  const [views, setViews] = useState(() => {
    const v = load(viewsKey, []);
    return Array.isArray(v) ? v.filter((x) => x && typeof x.name === 'string') : [];
  });
  const [activeView, setActiveView] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(hiddenKey, JSON.stringify(hidden));
    } catch {
      /* storage full or blocked — the session still works, it just forgets */
    }
  }, [hiddenKey, hidden]);

  useEffect(() => {
    try {
      localStorage.setItem(viewsKey, JSON.stringify(views));
    } catch {
      /* same: persistence is best-effort */
    }
  }, [viewsKey, views]);

  const isVisible = (key) => {
    const col = columns.find((c) => c.key === key);
    if (col?.always) return true;
    return !hidden.includes(key);
  };

  const toggleColumn = (key) => {
    const col = columns.find((c) => c.key === key);
    if (col?.always) return; // identity and actions columns cannot be hidden
    setHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
    setActiveView(''); // hand-editing columns detaches from the named view
  };

  const resetColumns = () => {
    setHidden([]);
    setActiveView('');
  };

  const saveView = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return false;
    const view = { name: trimmed, hidden: [...hidden], filters: getFilterSnapshot() };
    setViews((prev) => [...prev.filter((v) => v.name !== trimmed), view]);
    setActiveView(trimmed);
    return true;
  };

  const applyView = (name) => {
    const view = views.find((v) => v.name === name);
    if (!view) return;
    setHidden(Array.isArray(view.hidden) ? view.hidden : []);
    applyFilterSnapshot(view.filters || {});
    setActiveView(view.name);
  };

  const deleteView = (name) => {
    setViews((prev) => prev.filter((v) => v.name !== name));
    if (activeView === name) setActiveView('');
  };

  return { columns, isVisible, toggleColumn, resetColumns, hidden, views, activeView, saveView, applyView, deleteView };
}
