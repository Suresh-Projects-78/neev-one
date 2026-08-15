export const VOUCHER_DEFS = [
  { key: 'invoice', label: 'Invoice', listKey: 'invoices' },
  { key: 'estimate', label: 'Estimate', listKey: 'estimates' },
  { key: 'bill', label: 'Purchase (Bill)', listKey: 'bills' },
  { key: 'purchaseOrder', label: 'Purchase Order', listKey: 'purchaseOrders' },
  { key: 'debitNote', label: 'Debit Note', listKey: 'debitNotes' },
  { key: 'expense', label: 'Expense', listKey: 'expenses' },
  { key: 'creditNote', label: 'Credit Note', listKey: 'creditNotes' },
  { key: 'journalEntry', label: 'Journal Entry', listKey: 'journalEntries' },
];

// Numbering supports additional voucher types beyond printable templates.
export const NUMBERING_VOUCHER_DEFS = [
  ...VOUCHER_DEFS,
  { key: 'warehouseTransfer', label: 'Warehouse Transfer', listKey: null },
  { key: 'branchTransfer', label: 'Branch Transfer', listKey: null },
];

export const TEMPLATE_OPTIONS = [
  { id: 'classic', name: 'Classic' },
  { id: 'modern', name: 'Modern' },
  { id: 'minimal', name: 'Minimal' },
  { id: 'compact', name: 'Compact' },
  { id: 'bold', name: 'Bold' },
  { id: 'a5', name: 'A5 (GST)' },
  { id: 'a5Compact', name: 'A5 (Compact)' },
  { id: 'a5Clean', name: 'A5 (Clean)' },
  { id: 'a5Boxed', name: 'A5 (Boxed)' },
  { id: 'a4Modern', name: 'A4 (Modern)' },
  { id: 'a4BoxedGst', name: 'A4 (Boxed GST Split)' },
  { id: 'a4Letterhead', name: 'A4 (Letterhead)' },
];

export const ACCENT_OPTIONS = [
  { id: 'blue', name: 'Blue', barClass: 'bg-blue-600' },
  { id: 'indigo', name: 'Indigo', barClass: 'bg-indigo-600' },
  { id: 'green', name: 'Green', barClass: 'bg-green-600' },
  { id: 'orange', name: 'Orange', barClass: 'bg-orange-600' },
  { id: 'violet', name: 'Violet', barClass: 'bg-violet-600' },
  { id: 'slate', name: 'Slate', barClass: 'bg-slate-600' },
];

export const getVoucherDef = (voucherKey) => VOUCHER_DEFS.find((v) => v.key === voucherKey);

export const getNumberingVoucherDef = (voucherKey) => NUMBERING_VOUCHER_DEFS.find((v) => v.key === voucherKey);

export const getDocSettings = (db, company, { branchId = null } = {}) => {
  const companyId = company?.id;
  const base = company?.docSettings || {};

  const normalizedBranchId = branchId ? String(branchId).trim() : '';
  const byBranch = (base?.numberingByBranch && typeof base.numberingByBranch === 'object') ? base.numberingByBranch : {};
  const branchOverrides = normalizedBranchId ? (byBranch?.[normalizedBranchId] || {}) : {};

  const ensureNumbering = (voucherKey, fallbackPrefix, { fallbackNextNumber } = {}) => {
    const listKey = getNumberingVoucherDef(voucherKey)?.listKey;
    const count = listKey ? (db?.[listKey] || []).filter((d) => d.companyId === companyId).length : 0;
    const existing = (branchOverrides && typeof branchOverrides === 'object' && branchOverrides?.[voucherKey])
      ? branchOverrides[voucherKey]
      : (base?.numbering?.[voucherKey] || {});
    return {
      mode: existing.mode || 'auto',
      prefix: existing.prefix !== undefined ? existing.prefix : fallbackPrefix,
      suffix: existing.suffix !== undefined ? existing.suffix : '',
      nextNumber:
        Number(existing.nextNumber || 0) > 0
          ? Number(existing.nextNumber)
          : (Number(fallbackNextNumber || 0) > 0 ? Number(fallbackNextNumber) : count + 1),
      allowManualOverride: existing.allowManualOverride !== undefined ? Boolean(existing.allowManualOverride) : true,
    };
  };

  const ensureTemplate = (voucherKey, templateId, accentId) => {
    const existing = base?.templates?.[voucherKey] || {};
    return {
      templateId: existing.templateId || templateId,
      accentId: existing.accentId || accentId,
    };
  };

  return {
    ...base,
    numbering: {
      invoice: ensureNumbering('invoice', 'INV-'),
      estimate: ensureNumbering('estimate', 'EST-'),
      bill: ensureNumbering('bill', 'BILL-'),
      purchaseOrder: ensureNumbering('purchaseOrder', 'PO-'),
      expense: ensureNumbering('expense', 'EXP-'),
      creditNote: ensureNumbering('creditNote', 'CN-'),
      debitNote: ensureNumbering('debitNote', 'DN-'),
      journalEntry: ensureNumbering('journalEntry', 'JE-'),
      warehouseTransfer: ensureNumbering('warehouseTransfer', 'WT-', { fallbackNextNumber: 1 }),
      branchTransfer: ensureNumbering('branchTransfer', 'BT-', { fallbackNextNumber: 1 }),
    },
    templates: {
      invoice: ensureTemplate('invoice', 'classic', 'blue'),
      estimate: ensureTemplate('estimate', 'classic', 'blue'),
      bill: ensureTemplate('bill', 'classic', 'indigo'),
      purchaseOrder: ensureTemplate('purchaseOrder', 'classic', 'indigo'),
      expense: ensureTemplate('expense', 'minimal', 'slate'),
      creditNote: ensureTemplate('creditNote', 'classic', 'orange'),
      debitNote: ensureTemplate('debitNote', 'classic', 'orange'),
      journalEntry: ensureTemplate('journalEntry', 'minimal', 'slate'),
    },
  };
};

export const formatVoucherNumberPreview = (numbering) => {
  if (!numbering) return '';
  if (String(numbering.mode || '').toLowerCase() === 'manual') return '(manual)';
  const prefix = String(numbering.prefix || '');
  const suffix = String(numbering.suffix || '');
  const n = Number(numbering.nextNumber || 1);
  return `${prefix}${Number.isFinite(n) ? n : 1}${suffix}`;
};

export const generateVoucherNumber = ({ db, company, voucherKey, branchId = null }) => {
  const settings = getDocSettings(db, company, { branchId });
  const numbering = settings?.numbering?.[voucherKey];
  if (!numbering) return '';
  if (String(numbering.mode || '').toLowerCase() === 'manual') return '';
  return formatVoucherNumberPreview(numbering);
};

export const parseVoucherNumberInt = (value, { prefix = '', suffix = '' } = {}) => {
  const s = String(value || '').trim();
  const p = String(prefix || '');
  const suf = String(suffix || '');
  if (p && !s.startsWith(p)) return null;
  if (suf && !s.endsWith(suf)) return null;
  const core = s.slice(p.length, suf ? -suf.length : undefined).trim();
  if (!core) return null;
  const n = parseInt(core, 10);
  return Number.isFinite(n) ? n : null;
};

export const bumpCompanyNextNumber = ({ db, companyId, voucherKey, usedNumber, branchId = null }) => {
  const company = db.companies.find((c) => c.id === companyId);
  if (!company) return db.companies;

  const currentSettings = getDocSettings(db, company, { branchId });
  const currentNumbering = currentSettings?.numbering?.[voucherKey];
  if (!currentNumbering || String(currentNumbering.mode || '').toLowerCase() !== 'auto') return db.companies;

  const parsed = parseVoucherNumberInt(usedNumber, currentNumbering);
  const nextCandidate = parsed !== null ? parsed + 1 : Number(currentNumbering.nextNumber || 1) + 1;
  const nextNumber = Math.max(Number(currentNumbering.nextNumber || 1), Number(nextCandidate || 1));

  return db.companies.map((c) => {
    if (c.id !== companyId) return c;

    const baseDoc = (c?.docSettings && typeof c.docSettings === 'object') ? c.docSettings : {};
    const normalizedBranchId = branchId ? String(branchId).trim() : '';

    if (normalizedBranchId) {
      const prevByBranch = (baseDoc?.numberingByBranch && typeof baseDoc.numberingByBranch === 'object') ? baseDoc.numberingByBranch : {};
      const prevBranchNum = (prevByBranch?.[normalizedBranchId] && typeof prevByBranch[normalizedBranchId] === 'object') ? prevByBranch[normalizedBranchId] : {};
      const currentMerged = getDocSettings(db, c, { branchId: normalizedBranchId });
      const prevCfg = prevBranchNum?.[voucherKey] || currentMerged?.numbering?.[voucherKey] || {};
      const nextByBranch = {
        ...prevByBranch,
        [normalizedBranchId]: {
          ...prevBranchNum,
          [voucherKey]: {
            ...prevCfg,
            nextNumber,
          },
        },
      };

      return {
        ...c,
        docSettings: {
          ...baseDoc,
          numberingByBranch: nextByBranch,
        },
      };
    }

    const currentMerged = getDocSettings(db, c);
    const merged = {
      ...baseDoc,
      ...currentMerged,
      numbering: {
        ...(currentMerged?.numbering || {}),
        [voucherKey]: {
          ...(currentMerged?.numbering?.[voucherKey] || {}),
          nextNumber,
        },
      },
    };
    return {
      ...c,
      docSettings: merged,
    };
  });
};
