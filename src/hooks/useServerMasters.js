import { useCallback, useEffect, useState } from 'react';

/**
 * Loads a master list from the server, falling back to whatever is in the local
 * database when the call fails.
 *
 * The fallback matters during the migration: customers, vendors and items still
 * exist in browser storage from before the server owned them, and a network
 * failure should degrade to the old behaviour rather than emptying a picker
 * in the middle of an invoice.
 */
export const useServerMasters = (loader, localRows, { enabled = true } = {}) => {
  const [rows, setRows] = useState(localRows || []);
  const [source, setSource] = useState('local');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    (search) => {
      if (!enabled) return Promise.resolve();
      setLoading(true);
      setError('');
      return Promise.resolve()
        .then(() => loader(search))
        .then((serverRows) => {
          setRows(Array.isArray(serverRows) ? serverRows : []);
          setSource('server');
        })
        .catch((e) => {
          setError(String(e?.message || e));
          setRows(localRows || []);
          setSource('local');
        })
        .finally(() => setLoading(false));
    },
    // localRows changes identity on every render of the parent, so depending on
    // it here would reload the list continuously.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, loader]
  );

  useEffect(() => {
    load();
  }, [load]);

  return { rows, source, loading, error, reload: load };
};

export default useServerMasters;
