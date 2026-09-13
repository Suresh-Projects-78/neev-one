import { tdsAmountOn, tdsThresholdState } from '../../utils/tds';
import { fyRange } from '../../utils/tdsTcs';
import { natureByCode, natureForSection, resolveRule, ruleRate, ruleReference } from './ruleMaster';

/**
 * One TDS engine, used by every screen that deducts.
 *
 * The specification's rule, and the reason for it: a purchaseTDS(), a
 * paymentTDS() and a receiptTDS() are three copies of the same law that drift
 * apart, and the first thing to drift is the one nobody tests — the threshold.
 * So every screen asks this one function the same question and is handed the
 * same normalized answer, including the snapshot it must store.
 *
 * What the engine decides, in order:
 *
 *   1. Is TDS switched on for this company at all?
 *   2. Which nature applies — what the transaction says, else what the party
 *      says, else what the company says, else none.
 *   3. Which rule version was in force on the TRANSACTION's date.
 *   4. What the base is, and whether the threshold has been crossed.
 *   5. At what rate — the rule's, unless the party carries a certificate or
 *      has no PAN.
 *   6. Into which ledger it posts.
 *
 * It computes and explains. It does not write: posting stays with the code
 * that owns the document, and the compliance record is written from the result
 * this returns.
 */

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const day = (v) => String(v || '').slice(0, 10);
const lower = (s) => String(s || '').trim().toLowerCase();

/** Severities the specification names. BLOCK stops a posting; WARNING does not. */
export const BLOCK = 'BLOCK';
export const WARNING = 'WARNING';
export const INFO = 'INFO';

/** Company TDS configuration, from where the tax screen already writes it. */
export const companyTdsProfile = (company) => {
  const tax = company?.profile?.taxCompliances;
  const tds = tax && typeof tax === 'object' ? tax.tds : null;
  return {
    enabled: Boolean(tds?.enabled),
    tan: String(tds?.tan || '').trim().toUpperCase(),
    state: String(tds?.state || '').trim(),
    deductorName: String(tds?.deductorName || company?.name || '').trim(),
    deductorType: String(tds?.deductorType || '').trim(),
    defaultNatureCode: String(tds?.defaultNatureCode || '').trim().toUpperCase(),
  };
};

/**
 * A party's TDS defaults, read from the master as it stands today.
 *
 * Read at calculation time and snapshotted at posting time: what the vendor's
 * PAN is *now* decides what is deducted now, and what it was then stays on the
 * transaction that was posted then.
 */
export const partyTdsProfile = (party) => {
  const explicitNature = String(party?.tdsNatureCode || '').trim().toUpperCase();
  const fromSection = explicitNature ? null : natureForSection(party?.tdsSection);
  return {
    id: party?.id ?? null,
    name: String(party?.displayName || party?.name || '').trim(),
    pan: String(party?.pan || '').trim().toUpperCase(),
    /* Undefined means "nobody has said" — which is not the same as "no". */
    applicable: party?.tdsApplicable === undefined ? null : Boolean(party.tdsApplicable),
    natureCode: explicitNature || fromSection?.code || '',
    deducteeType: String(party?.tdsDeducteeType || 'COMPANY').trim().toUpperCase(),
    residentialStatus: String(party?.tdsResidentialStatus || 'RESIDENT').trim().toUpperCase(),
    defaultLedgerId: String(party?.tdsLedgerId || '').trim(),
    certificate:
      party?.tdsCertificate && typeof party.tdsCertificate === 'object' ? party.tdsCertificate : null,
  };
};

/**
 * Whether a lower/nil deduction certificate under section 197 covers this
 * transaction. The certificate's own rate then replaces the rule's.
 */
const certificateRate = (certificate, onDate) => {
  if (!certificate) return null;
  const d = day(onDate);
  const from = day(certificate.validFrom);
  const to = day(certificate.validTo);
  if (from && d < from) return null;
  if (to && d > to) return null;
  const rate = Number(certificate.rate);
  if (!Number.isFinite(rate) || rate < 0) return null;
  return rate;
};

/**
 * The TDS a transaction should carry.
 *
 * `taxableBase` is the value the rule is applied to — the taxable value, not
 * the GST-inclusive total. `priorBase` is what this party has already been
 * billed under this nature in the same financial year, so the threshold means
 * something; the caller knows where its own documents live, so it passes it.
 */
export const resolveTds = ({
  company,
  party,
  transactionDate,
  taxableBase = 0,
  explicitNatureCode = '',
  explicitRate = null,
  side = 'PAYABLE',
  priorBase = 0,
  ledgers = [],
  existingEventFor = null,
}) => {
  const profile = companyTdsProfile(company);
  const warnings = [];
  const none = (reason) => ({
    applicable: false,
    reason,
    natureCode: '',
    ruleVersionId: '',
    statutoryReference: '',
    sectionCode: '',
    baseAmount: 0,
    rate: 0,
    tdsAmount: 0,
    ledgerId: '',
    side,
    trigger: '',
    thresholdReason: '',
    warnings,
  });

  if (!profile.enabled) return none('TDS is switched off for this company.');

  const partyProfile = partyTdsProfile(party);
  if (partyProfile.applicable === false && !explicitNatureCode) {
    return none('This party is marked as not liable to TDS.');
  }

  /* Nature: what the transaction says, then the party, then the company. */
  const natureCode =
    String(explicitNatureCode || '').trim().toUpperCase() ||
    partyProfile.natureCode ||
    profile.defaultNatureCode ||
    '';
  if (!natureCode) return none('No TDS nature applies to this transaction.');

  const nature = natureByCode(natureCode);
  if (!nature) return none(`Unknown TDS nature "${natureCode}".`);

  /* The rule in force on the transaction's own date — never today's. */
  const rule = resolveRule(natureCode, transactionDate);
  if (!rule) {
    return {
      ...none(`No TDS rule is in force for ${nature.name} on ${day(transactionDate)}.`),
      blocked: true,
      severity: BLOCK,
    };
  }

  const base = Math.max(0, r2(taxableBase));
  const threshold = tdsThresholdState(rule.sectionCode, base, Math.max(0, Number(priorBase) || 0));

  /* Rate: a certificate first, then no PAN, then the rule. */
  const certRate = certificateRate(partyProfile.certificate, transactionDate);
  let rate = ruleRate(rule, partyProfile.deducteeType);
  let rateSource = 'RULE';
  if (certRate != null) {
    rate = certRate;
    rateSource = 'CERTIFICATE';
  } else if (!partyProfile.pan) {
    /* No PAN is 20% by law, and the missing PAN is itself a compliance
       exception — the return cannot be filed without it. */
    rate = Math.max(rate, 20);
    rateSource = 'NO_PAN';
    warnings.push({ severity: WARNING, code: 'PAN_MISSING', message: 'No PAN on file — deducted at 20%.' });
  }
  if (explicitRate !== null && explicitRate !== '' && Number.isFinite(Number(explicitRate))) {
    rate = Number(explicitRate);
    rateSource = 'TYPED';
  }

  /* Already deducted against the same obligation: the bill deducted it, and a
     payment against that bill must not deduct it again. */
  const duplicate = typeof existingEventFor === 'function' ? existingEventFor({ natureCode, rule }) : null;
  if (duplicate) {
    return {
      ...none('TDS was already deducted for this obligation.'),
      natureCode,
      ruleVersionId: rule.id,
      duplicateOf: duplicate,
      severity: INFO,
    };
  }

  const tdsAmount = threshold?.crossed ? r2(tdsAmountOn(threshold.base, rate)) : 0;

  /* Which ledger it lands in: the party's own mapping if it still fits the
     nature and side, else the single mapped ledger, else nothing — and nothing
     is a block, because a deduction with no destination cannot post. */
  const eligible = tdsLedgersFor(ledgers, { natureCode, side });
  const preferred = eligible.find((l) => String(l.id) === partyProfile.defaultLedgerId);
  const ledger = preferred || (eligible.length === 1 ? eligible[0] : null);
  if (!eligible.length) {
    warnings.push({
      severity: BLOCK,
      code: 'NO_LEDGER',
      message: `No active ${lower(side)} ledger is mapped to ${nature.name}.`,
    });
  }

  return {
    applicable: tdsAmount > 0,
    natureCode,
    natureName: nature.name,
    ruleVersionId: rule.id,
    statutoryReference: ruleReference(rule),
    sectionCode: rule.sectionCode,
    returnCategory: rule.returnCategory,
    baseAmount: threshold?.crossed ? r2(threshold.base) : base,
    rate,
    rateSource,
    tdsAmount,
    ledgerId: ledger ? String(ledger.id) : '',
    eligibleLedgers: eligible,
    side,
    trigger: rule.deductionTrigger,
    thresholdCrossed: Boolean(threshold?.crossed),
    thresholdReason: String(threshold?.reason || ''),
    warnings,
    blocked: warnings.some((w) => w.severity === BLOCK),
  };
};

/**
 * The ledgers a deduction of this nature may post to.
 *
 * §14, and mandatory: a Contractor deduction must not offer the Professional
 * Fees ledger, or the receivable side of its own nature. Showing every ledger
 * in the group is how a deduction ends up in the wrong one.
 */
export const tdsLedgersFor = (ledgers, { natureCode, side = 'PAYABLE' }) => {
  const want = String(natureCode || '').trim().toUpperCase();
  const wantSide = String(side || 'PAYABLE').trim().toUpperCase();
  return (Array.isArray(ledgers) ? ledgers : [])
    .filter((l) => l?.active !== false && l?.isActive !== false)
    .filter((l) => String(l?.tdsSide || '').toUpperCase() === wantSide)
    .filter((l) => {
      const mapped = String(l?.tdsNatureCode || '').trim().toUpperCase();
      if (mapped) return mapped === want;
      /* Rows written before natures existed carry a section instead. */
      return natureForSection(l?.tdsSection)?.code === want;
    })
    .slice()
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
};

/**
 * What this party has already been billed under this nature this year.
 *
 * The threshold is an annual one for most sections, and once it is crossed the
 * whole aggregate becomes liable — so the figure has to know what came before
 * it. Documents are passed in because the engine does not know which of them
 * the caller means.
 */
export const priorBaseFor = (documents, { partyId, natureCode, onDate, excludeId = null }) => {
  const fy = fyRange(day(onDate));
  const want = String(natureCode || '').trim().toUpperCase();
  return (Array.isArray(documents) ? documents : [])
    .filter((d) => String(d?.partyId ?? d?.vendorId ?? d?.customerId ?? '') === String(partyId ?? ''))
    .filter((d) => String(d?.tdsNatureCode || '').toUpperCase() === want)
    .filter((d) => lower(d?.status) !== 'cancelled')
    .filter((d) => String(d?.id ?? '') !== String(excludeId ?? ''))
    .filter((d) => day(d?.date) >= fy.from && day(d?.date) <= fy.to)
    .reduce((t, d) => t + (Number(d?.taxableValue) || Number(d?.subtotal) || 0), 0);
};

/**
 * The compliance record for a computed deduction.
 *
 * Everything that could change later is copied in now: the PAN, the nature,
 * the rule version, the statutory reference, the base, the rate and the
 * ledger. Editing a vendor tomorrow must not restate what was deducted today.
 */
export const tdsEventFrom = (result, { company, party, source, branchId = '', date, deductionDate }) => {
  const profile = companyTdsProfile(company);
  const partyProfile = partyTdsProfile(party);
  const on = day(date);
  return {
    /*
     * The regime the event belongs to. Everything downstream — register,
     * challans, exceptions, the return dataset — reads the same normalized
     * store, and TCS is the same machinery pointed at collections instead of
     * deductions (206C sections, collected from the buyer, 27EQ instead of
     * 26Q). Stamping the regime NOW means TCS arrives later as new rows in
     * the same store and a filter in the reports, not a second store and a
     * migration. Until then every event is TDS and readers need not filter.
     */
    regime: 'TDS',
    companyId: company?.id ?? null,
    branchId: String(branchId || ''),
    sourceType: String(source?.type || ''),
    sourceId: source?.id ?? null,
    sourceNumber: String(source?.number || ''),
    partyId: partyProfile.id,
    partyName: partyProfile.name,
    panSnapshot: partyProfile.pan,
    tanSnapshot: profile.tan,
    transactionDate: on,
    deductionDate: day(deductionDate || date),
    natureCode: result.natureCode,
    ruleVersionId: result.ruleVersionId,
    sectionReference: result.statutoryReference,
    sectionCode: result.sectionCode,
    baseAmount: result.baseAmount,
    rate: result.rate,
    tdsAmount: result.tdsAmount,
    ledgerId: result.ledgerId,
    side: result.side,
    returnQuarter: returnQuarter(on),
    status: 'Posted',
    createdAt: new Date().toISOString(),
  };
};

/** "2026-27 Q2" — the quarter a deduction is reported in. */
export const returnQuarter = (date) => {
  const d = day(date);
  if (!d) return '';
  const fy = fyRange(d);
  const month = Number(d.slice(5, 7));
  const q = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 && month <= 12 ? 3 : 4;
  return `${fy.label || `${fy.from.slice(0, 4)}-${String(Number(fy.from.slice(0, 4)) + 1).slice(2)}`} Q${q}`;
};
