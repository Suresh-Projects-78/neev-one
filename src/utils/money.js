export const round2 = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
};

export const getCurrencyCode = (_company) => {
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

/**
 * Indian numbering, because "One Lakh Twenty One Thousand" is what a customer
 * here reads back to check the figure — "One Hundred Twenty One Thousand" is
 * the same number written for somebody else.
 */
const WORD_ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const WORD_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const wordsUnder100 = (n) => (n < 20 ? WORD_ONES[n] : `${WORD_TENS[Math.floor(n / 10)]}${n % 10 ? ` ${WORD_ONES[n % 10]}` : ''}`);
const wordsUnder1000 = (n) =>
  `${n > 99 ? `${WORD_ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ' ' : ''}` : ''}${wordsUnder100(n % 100)}`;

export const amountInWordsInr = (value) => {
  const total = Number(value);
  if (!Number.isFinite(total)) return '';
  const negative = total < 0;
  // Work in paise from the start. Deriving them by subtracting the rupees
  // loses a half-paisa to floating point — 1.005 came out as "One Only".
  const paiseTotal = Math.round(Math.abs(total) * 100);
  let rupees = Math.floor(paiseTotal / 100);
  const paise = paiseTotal % 100;

  const parts = [];
  [[10000000, 'Crore'], [100000, 'Lakh'], [1000, 'Thousand']].forEach(([size, name]) => {
    if (rupees >= size) {
      parts.push(`${wordsUnder1000(Math.floor(rupees / size))} ${name}`);
      rupees %= size;
    }
  });
  if (rupees) parts.push(wordsUnder1000(rupees));

  const body = parts.join(' ').replace(/\s+/g, ' ').trim() || 'Zero';
  const paiseText = paise ? ` and ${wordsUnder100(paise)} Paise` : '';
  return `${negative ? 'Minus ' : ''}Rupees ${body}${paiseText} Only`;
};
