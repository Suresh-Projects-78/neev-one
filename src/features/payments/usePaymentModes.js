import { useEffect, useState } from 'react';

import { listPaymentModes } from '../../api/payments';

/**
 * Loads the cash and bank ledgers a payment may be made through.
 *
 * Requirement 14: the Mode field is these accounts, not a hardcoded
 * Cash/Bank/UPI/Card list. A user who created "HDFC Current A/c" picks that,
 * and the receipt debits that exact ledger.
 *
 * Failure is reported rather than swallowed: with no modes the form cannot
 * post to the ledger, and a silently empty dropdown reads as "no accounts
 * configured" when the truth may be an expired session.
 */
export default function usePaymentModes() {
  const [modes, setModes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const rows = await listPaymentModes();
        if (!cancelled) {
          setModes(rows);
          setError('');
        }
      } catch (e) {
        if (!cancelled) {
          setModes([]);
          setError(String(e?.message || 'Unable to load cash and bank accounts.'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { modes, loading, error };
}

/** "1200 · HDFC Current A/c" — code first, because that is how ledgers are read. */
export const modeLabel = (mode) => `${mode.code} · ${mode.name}`;
