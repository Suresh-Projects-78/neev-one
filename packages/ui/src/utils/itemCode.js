/**
 * Item codes, per item type.
 *
 * The product generated `ITM` plus a millisecond timestamp. That is unique,
 * and useless to read: thirteen digits that say nothing about what the thing
 * is, identical in shape whether it is a bag of cement or an hour of labour.
 *
 * A company that wants GD-0001 for goods and SV-0001 for services can now say
 * so. Until it does, nothing changes — the timestamp is what existing books
 * already contain, and quietly renumbering them would be worse than an ugly
 * code.
 */

const TIMESTAMP_FALLBACK = () => `ITM${Date.now()}`;

/** 'Service' → 'service'; anything else is goods. */
export const itemTypeKey = (type) => (String(type || '').trim().toLowerCase() === 'service' ? 'service' : 'goods');

/** The stored series config for one item type, with defaults filled in. */
export const itemCodeSeries = (company, type) => {
  const cfg = company?.docSettings?.numbering?.itemCode || {};
  const key = itemTypeKey(type);
  const series = cfg?.[key] || {};
  return {
    enabled: Boolean(cfg.enabled),
    prefix: String(series.prefix ?? (key === 'service' ? 'SV-' : 'GD-')),
    digits: Math.max(1, Math.min(12, Number(series.digits ?? 4) || 4)),
    nextNumber: Math.max(1, Number(series.nextNumber ?? 1) || 1),
  };
};

/**
 * The code a new item of this type should get.
 *
 * Skips any number already taken by an existing item of the same company, so
 * a series that fell behind the data — an imported item, a manual code —
 * cannot mint a duplicate.
 */
export const nextItemCode = (db, company, type) => {
  const series = itemCodeSeries(company, type);
  if (!series.enabled) return TIMESTAMP_FALLBACK();

  const taken = new Set(
    (Array.isArray(db?.items) ? db.items : [])
      .filter((it) => Number(it?.companyId) === Number(company?.id))
      .map((it) => String(it?.code || '').trim().toUpperCase())
  );

  let n = series.nextNumber;
  for (let guard = 0; guard < 10000; guard += 1) {
    const code = `${series.prefix}${String(n).padStart(series.digits, '0')}`;
    if (!taken.has(code.toUpperCase())) return code;
    n += 1;
  }
  return TIMESTAMP_FALLBACK();
};

/** Advance the series past the code just used. Returns the next companies array. */
export const bumpItemCodeSeries = (db, company, type, usedCode) => {
  const companies = Array.isArray(db?.companies) ? db.companies : [];
  const series = itemCodeSeries(company, type);
  if (!series.enabled) return companies;

  const key = itemTypeKey(type);
  const digitsPart = String(usedCode || '').slice(series.prefix.length);
  const used = Number(digitsPart);
  if (!Number.isFinite(used)) return companies;

  return companies.map((c) => {
    if (Number(c?.id) !== Number(company?.id)) return c;
    const doc = c?.docSettings && typeof c.docSettings === 'object' ? c.docSettings : {};
    const numbering = doc?.numbering && typeof doc.numbering === 'object' ? doc.numbering : {};
    const itemCode = numbering?.itemCode && typeof numbering.itemCode === 'object' ? numbering.itemCode : {};
    return {
      ...c,
      docSettings: {
        ...doc,
        numbering: {
          ...numbering,
          itemCode: {
            ...itemCode,
            [key]: { ...(itemCode[key] || {}), prefix: series.prefix, digits: series.digits, nextNumber: used + 1 },
          },
        },
      },
    };
  });
};
