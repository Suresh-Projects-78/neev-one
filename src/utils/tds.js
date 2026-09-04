/**
 * TDS on a sales invoice.
 *
 * On the sell side TDS is not a tax the business charges — it is tax the
 * *customer* withholds from the payment and deposits against the seller's PAN.
 * So it never changes the invoice: the goods, the GST and the total are what
 * they were, and what moves is how much cash arrives. The document states the
 * deduction so both sides agree on the figure before the payment is short.
 *
 * That distinction matters in the ledger too. Reducing the invoice total by
 * the TDS would understate output GST and lose the receivable; the deduction
 * is a separate asset — tax already paid on the seller's behalf — that is
 * claimed against the year's liability.
 *
 * The base is the taxable value, not the total. CBDT Circular 23/2017: where
 * GST on services is shown separately on the invoice, tax is deducted on the
 * amount excluding that GST.
 */

/**
 * The sections a sales invoice actually meets, with the rate that applies when
 * the payee has furnished a PAN. Rates are defaults, not law for every case —
 * an individual contractor is 1% where a company is 2%, a lower-deduction
 * certificate under 197 overrides everything — so the rate stays editable and
 * the section only seeds it.
 */
export const TDS_SECTIONS = [
  { code: '194C', label: 'Contractor / sub-contractor', rate: 2 },
  { code: '194J', label: 'Professional or technical services', rate: 10 },
  { code: '194H', label: 'Commission or brokerage', rate: 2 },
  { code: '194I(a)', label: 'Rent — plant, machinery, equipment', rate: 2 },
  { code: '194I(b)', label: 'Rent — land, building, furniture', rate: 10 },
  { code: '194A', label: 'Interest other than on securities', rate: 10 },
  { code: '194Q', label: 'Purchase of goods', rate: 0.1 },
];

export const tdsSection = (code) =>
  TDS_SECTIONS.find((s) => s.code === String(code || '').trim()) || null;

/** The rate a section defaults to, or 0 when the code is not one we carry. */
export const tdsDefaultRate = (code) => Number(tdsSection(code)?.rate ?? 0);

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * What the customer will withhold.
 *
 * @param taxableValue the invoice's taxable amount — after any invoice-level
 *        discount and including other charges, but before GST
 * @param rate percent
 */
export const tdsAmountOn = (taxableValue, rate) => {
  const base = Number(taxableValue) || 0;
  const pct = Number(rate) || 0;
  if (base <= 0 || pct <= 0) return 0;
  return round2((base * pct) / 100);
};

/** "194J · Professional or technical services @ 10%" */
export const tdsLabel = (code, rate) => {
  const s = tdsSection(code);
  const pct = Number(rate) || 0;
  if (!s) return pct ? `TDS @ ${pct}%` : 'TDS';
  return `${s.code} · ${s.label} @ ${pct}%`;
};

/** The short form a totals row and a printed document use. */
export const tdsShortLabel = (code, rate) => {
  const pct = Number(rate) || 0;
  const c = String(code || '').trim();
  return c ? `TDS ${c} @ ${pct}%` : `TDS @ ${pct}%`;
};

export default TDS_SECTIONS;
