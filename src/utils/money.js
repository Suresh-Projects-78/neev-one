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
