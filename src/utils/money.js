export const round2 = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
};

export const getCurrencyCode = (company) => {
  return 'INR';
};

export const formatMoney = (amount, company) => {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const currency = getCurrencyCode(company);

  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `₹${safe.toFixed(2)}`;
  }
};

/**
 * Compact money for KPI figures: ₹13.3L, ₹1.34Cr.
 *
 * A dashboard number is read at a glance, and eleven digits at 42px is a
 * number nobody reads — it is a number they measure. Indian units (lakh,
 * crore) rather than M/B, because that is how the figure gets said out loud
 * by the people using this. The exact amount stays available in the tables and
 * in the tooltip, so precision is never lost, only deferred.
 */
export const formatMoneyCompact = (amount, company) => {
  const value = Number(amount);
  const safe = Number.isFinite(value) ? value : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);

  const symbol = (() => {
    try {
      return (
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: getCurrencyCode(company) })
          .formatToParts(0)
          .find((p) => p.type === 'currency')?.value || '₹'
      );
    } catch {
      return '₹';
    }
  })();

  // Trim a trailing ".0" so 13.0L reads as 13L.
  const trim = (n, dp) => String(Number(n.toFixed(dp))).replace(/\.0$/, '');

  if (abs >= 1e7) return `${sign}${symbol}${trim(abs / 1e7, 2)}Cr`;
  if (abs >= 1e5) return `${sign}${symbol}${trim(abs / 1e5, 2)}L`;
  if (abs >= 1000) return `${sign}${symbol}${trim(abs / 1000, 1)}K`;
  return `${sign}${symbol}${trim(abs, 0)}`;
};
