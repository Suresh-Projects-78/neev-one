import { round2 } from './money';

export const GST_STATE_BY_CODE = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

export const getGstStateFromGstin = (gstin) => {
  const code = String(gstin || '').trim().slice(0, 2);
  if (!/^[0-9]{2}$/.test(code)) return '';
  return GST_STATE_BY_CODE[code] || '';
};

export const normalizeState = (value) => String(value || '').trim().toLowerCase();

export const getCompanyGstProfile = (company) => {
  return {
    gstin: String(company?.gstin || '').trim(),
    state: String(company?.state || '').trim(),
    gstRegistration: company?.gstRegistration || 'Registered',
  };
};

export const getPartyGstProfile = (party) => {
  return {
    gstin: String(party?.gstin || '').trim(),
    state: String(party?.billingAddress?.state || party?.state || '').trim(),
    gstRegistration: party?.gstRegistration || 'Unregistered',
  };
};

export const isIntraStateSupply = ({ companyState, partyState }) => {
  const a = normalizeState(companyState);
  const b = normalizeState(partyState);
  if (!a || !b) return true;
  return a === b;
};

export const canDetermineSupplyType = ({ companyState, partyState }) => {
  const a = normalizeState(companyState);
  const b = normalizeState(partyState);
  return Boolean(a && b);
};

export const computeGstForLine = ({ quantity, rate, gstRate, isIntra }) => {
  const qty = Number(quantity);
  const r = Number(rate);
  const gr = Number(gstRate);

  const taxable = round2((Number.isFinite(qty) ? qty : 0) * (Number.isFinite(r) ? r : 0));
  const gst = round2(taxable * ((Number.isFinite(gr) ? gr : 0) / 100));

  if (isIntra) {
    const half = round2(gst / 2);
    return {
      taxableAmount: taxable,
      gstAmount: gst,
      cgstAmount: half,
      sgstAmount: half,
      igstAmount: 0,
      lineTotal: round2(taxable + gst),
      taxType: 'CGST_SGST',
    };
  }

  return {
    taxableAmount: taxable,
    gstAmount: gst,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: gst,
    lineTotal: round2(taxable + gst),
    taxType: 'IGST',
  };
};

export const computeGstForLines = ({ lines, isIntra }) => {
  const normalizedLines = Array.isArray(lines) ? lines : [];
  const computedLines = normalizedLines.map((l) => {
    const quantity = Number(l.quantity ?? 1);
    const rate = Number(l.rate ?? 0);
    const gstRate = Number(l.gstRate ?? 0);
    const computed = computeGstForLine({ quantity, rate, gstRate, isIntra });

    return {
      ...l,
      quantity: Number.isFinite(quantity) ? quantity : 1,
      rate: Number.isFinite(rate) ? rate : 0,
      gstRate: Number.isFinite(gstRate) ? gstRate : 0,
      amount: computed.taxableAmount,
      taxableAmount: computed.taxableAmount,
      gstAmount: computed.gstAmount,
      cgstAmount: computed.cgstAmount,
      sgstAmount: computed.sgstAmount,
      igstAmount: computed.igstAmount,
      lineTotal: computed.lineTotal,
      taxType: computed.taxType,
    };
  });

  const subtotal = round2(computedLines.reduce((sum, l) => sum + (l.taxableAmount || 0), 0));
  const cgstTotal = round2(computedLines.reduce((sum, l) => sum + (l.cgstAmount || 0), 0));
  const sgstTotal = round2(computedLines.reduce((sum, l) => sum + (l.sgstAmount || 0), 0));
  const igstTotal = round2(computedLines.reduce((sum, l) => sum + (l.igstAmount || 0), 0));
  const gstTotal = round2(cgstTotal + sgstTotal + igstTotal);
  const total = round2(subtotal + gstTotal);

  return {
    lines: computedLines,
    subtotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    gstTotal,
    total,
  };
};
