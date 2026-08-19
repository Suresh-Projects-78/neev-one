import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

import { ACCENT_OPTIONS, getDocSettings } from '../../utils/docSettings';
import { formatMoney } from '../../utils/money';
import { GST_STATE_BY_CODE } from '../../utils/gst';

const InfoRow = ({ label, value, right = false }) => {
  if (!value) return null;
  return (
    <div className={`text-sm ${right ? 'text-right' : ''}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-medium text-gray-900">{value}</div>
    </div>
  );
};

const InvoicePreview = ({ db, currentCompany, invoice }) => {
  const docSettings = useMemo(() => getDocSettings(db, currentCompany), [db, currentCompany]);

  // Signed e-invoice QR, rendered from the JWT the IRP returned.
  const [irnQrDataUrl, setIrnQrDataUrl] = useState('');
  useEffect(() => {
    let cancelled = false;
    const apply = (v) => {
      if (!cancelled) setIrnQrDataUrl(v);
    };
    const src = invoice?.irnSignedQr;
    if (!src) {
      Promise.resolve().then(() => apply(''));
    } else {
      QRCode.toDataURL(String(src), { margin: 1, width: 192 })
        .then(apply)
        .catch(() => apply(''));
    }
    return () => {
      cancelled = true;
    };
  }, [invoice?.irnSignedQr]);
  const templateId = String(docSettings?.templates?.invoice?.templateId || 'classic');
  const accentId = String(docSettings?.templates?.invoice?.accentId || 'blue');
  const accent = ACCENT_OPTIONS.find((a) => a.id === accentId) || ACCENT_OPTIONS[0];

  const company = currentCompany || {};
  const customer = useMemo(() => {
    const id = invoice?.customerId ? parseInt(invoice.customerId) : null;
    if (!id) return null;
    return (db.customers || []).find((c) => c.companyId === company.id && c.id === id) || null;
  }, [db, company.id, invoice?.customerId]);

  const itemsById = useMemo(() => {
    const map = new Map();
    (db.items || []).filter((i) => i.companyId === company.id).forEach((i) => map.set(String(i.id), i));
    return map;
  }, [db, company.id]);

  const lines = Array.isArray(invoice?.items) ? invoice.items : [];

  const customerAddress = useMemo(() => {
    const addr = customer?.billingAddress || customer?.shippingAddress || {};
    const parts = [addr.line1, addr.line2, addr.city, addr.state, addr.pincode, addr.country]
      .map((p) => String(p || '').trim())
      .filter(Boolean);
    return parts.join(', ');
  }, [customer]);

  const codeForStateName = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '';
    for (const [code, stateName] of Object.entries(GST_STATE_BY_CODE || {})) {
      if (String(stateName || '').trim().toLowerCase() === trimmed.toLowerCase()) return code;
    }
    return '';
  };

  const companyAddress = useMemo(() => {
    const parts = [company?.address, company?.city, company?.state, company?.country]
      .map((p) => String(p || '').trim())
      .filter(Boolean);
    return parts.join(', ');
  }, [company?.address, company?.city, company?.state, company?.country]);

  const content = (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-gray-900">{company?.name || 'Company'}</div>
          {company?.gstin ? <div className="text-xs text-gray-500">GSTIN: {company.gstin}</div> : null}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-gray-900">Invoice</div>
          <div className="text-xs text-gray-500">No: {invoice?.number || '-'}</div>
          <div className="text-xs text-gray-500">Date: {invoice?.date || '-'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border rounded-lg p-4">
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-700 uppercase">Bill To</div>
          <div className="text-sm font-semibold text-gray-900">{invoice?.customerName || customer?.displayName || customer?.name || '-'}</div>
          {customerAddress ? <div className="text-xs text-gray-500">{customerAddress}</div> : null}
          {invoice?.customerGstin ? <div className="text-xs text-gray-500">GSTIN: {invoice.customerGstin}</div> : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InfoRow label="Due Date" value={invoice?.dueDate || ''} right />
          <InfoRow label="Place of Supply" value={invoice?.placeOfSupplyState || ''} right />
          <InfoRow label="Tax Type" value={invoice?.taxType ? String(invoice.taxType).replace('_', ' / ') : ''} right />
          <InfoRow label="Status" value={invoice?.status || ''} right />
        </div>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Rate</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-500">
                  No line items
                </td>
              </tr>
            ) : (
              lines.map((l, idx) => {
                const item = l?.itemId ? itemsById.get(String(l.itemId)) : null;
                const name = item?.name || l?.description || '';
                const qty = Number(l?.quantity ?? 0);
                const rate = Number(l?.rate ?? 0);
                const total = Number(l?.lineTotal ?? l?.amount ?? 0);
                return (
                  <tr key={idx}>
                    <td className="px-3 py-2 text-sm text-gray-900">{name || '-'}</td>
                    <td className="px-3 py-2 text-sm text-right">{Number.isFinite(qty) ? qty : '-'}</td>
                    <td className="px-3 py-2 text-sm text-right">{formatMoney(Number.isFinite(rate) ? rate : 0, currentCompany)}</td>
                    <td className="px-3 py-2 text-sm text-right font-medium">{formatMoney(Number.isFinite(total) ? total : 0, currentCompany)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-full md:w-80 border rounded-lg p-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-medium">{formatMoney(Number(invoice?.subtotal ?? 0), currentCompany)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">GST</span>
            <span className="font-medium">{formatMoney(Number(invoice?.gstTotal ?? 0), currentCompany)}</span>
          </div>
          <div className="flex justify-between border-t pt-2 mt-2 font-bold">
            <span>Total</span>
            <span>{formatMoney(Number(invoice?.total ?? 0), currentCompany)}</span>
          </div>
        </div>
      </div>

      {invoice?.irn ? (
        <div className="flex items-start justify-between gap-3 border rounded-lg p-3">
          <div className="min-w-0 text-xs text-gray-700">
            <div className="font-semibold uppercase">e-Invoice</div>
            <div className="break-all font-mono">IRN: {invoice.irn}</div>
            {invoice.irnAckNo ? <div>Ack: {invoice.irnAckNo} · {invoice.irnAckDate || ''}</div> : null}
            {invoice.irnStatus === 'CANCELLED' ? <div className="font-semibold">IRN CANCELLED</div> : null}
          </div>
          {irnQrDataUrl ? <img src={irnQrDataUrl} alt="Signed e-invoice QR" className="h-24 w-24 flex-shrink-0" /> : null}
        </div>
      ) : null}
      {invoice?.shipToAddress ? (
        <div className="border rounded-lg p-3 text-xs text-gray-700">
          <span className="font-semibold uppercase">Ship to ({invoice.shipToAddress.code}):</span>{' '}
          {[invoice.shipToAddress.label, invoice.shipToAddress.line1, invoice.shipToAddress.city, invoice.shipToAddress.state, invoice.shipToAddress.pincode]
            .filter(Boolean)
            .join(', ')}
        </div>
      ) : null}
      {String(docSettings?.templates?.invoice?.termsText || '').trim() ? (
        <div className="border rounded-lg p-3 text-xs text-gray-600 whitespace-pre-line">
          <div className="font-semibold uppercase text-gray-700 mb-1">Terms &amp; Conditions</div>
          {docSettings.templates.invoice.termsText}
        </div>
      ) : null}
    </div>
  );

  if (templateId === 'modern') {
    return (
      <div className="printable space-y-4">
        <div className="flex items-stretch gap-3">
          <div className={`w-2 rounded-lg ${accent.barClass}`} />
          <div className="flex-1">{content}</div>
        </div>
      </div>
    );
  }

  if (templateId === 'minimal') {
    return <div className="printable space-y-4">{content}</div>;
  }

  if (templateId === 'compact') {
    return (
      <div className="printable space-y-3">
        <div className="border rounded-lg overflow-hidden">
          <div className={`h-2 ${accent.barClass}`} />
          <div className="p-3">{content}</div>
        </div>
      </div>
    );
  }

  if (templateId === 'bold') {
    return (
      <div className="printable space-y-3">
        <div className={`rounded-lg p-3 text-white ${accent.barClass}`}>
          <div className="flex items-center justify-between">
            <div className="font-bold">{company?.name || 'Company'}</div>
            <div className="text-sm font-semibold">Invoice</div>
          </div>
          <div className="text-xs opacity-95">No: {invoice?.number || '-'}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">{content}</div>
      </div>
    );
  }

  if (templateId === 'a4Modern') {
    const place = String(invoice?.placeOfSupplyState || '').trim();
    const placeCode = codeForStateName(place);
    const placeDisplay = place ? `${place}${placeCode ? ` (${placeCode})` : ''}` : '';

    return (
      <div className="printable max-w-[980px] mx-auto text-sm text-gray-900">
        <div className="border rounded-lg overflow-hidden bg-white">
          <div className={`h-2 ${accent.barClass}`} />
          <div className="p-6 space-y-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-2xl font-extrabold">{company?.name || 'Company'}</div>
                {companyAddress ? <div className="text-xs text-gray-600">{companyAddress}</div> : null}
                {company?.gstin ? <div className="text-xs text-gray-600">GSTIN: {company.gstin}</div> : null}
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold tracking-wide">TAX INVOICE</div>
                <div className="mt-2 text-xs text-gray-600">Invoice No: {invoice?.number || '-'}</div>
                <div className="text-xs text-gray-600">Date: {invoice?.date || '-'}</div>
                {invoice?.dueDate ? <div className="text-xs text-gray-600">Due: {invoice.dueDate}</div> : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-700 uppercase">Bill To</div>
                <div className="mt-1 font-semibold">
                  {invoice?.customerName || customer?.displayName || customer?.name || '-'}
                </div>
                {customerAddress ? <div className="text-xs text-gray-600">{customerAddress}</div> : null}
                {invoice?.customerGstin ? <div className="text-xs text-gray-600">GSTIN: {invoice.customerGstin}</div> : null}
                {placeDisplay ? <div className="text-xs text-gray-600">Place of Supply: {placeDisplay}</div> : null}
              </div>

              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-700 uppercase">Summary</div>
                <div className="mt-2 flex justify-between">
                  <span className="text-gray-600">Taxable</span>
                  <span className="font-semibold">{formatMoney(Number(invoice?.subtotal ?? 0), currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">GST</span>
                  <span className="font-semibold">{formatMoney(Number(invoice?.gstTotal ?? 0), currentCompany)}</span>
                </div>
                <div className="flex justify-between border-t mt-2 pt-2">
                  <span className="font-bold">Total</span>
                  <span className="font-bold">{formatMoney(Number(invoice?.total ?? 0), currentCompany)}</span>
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-[5%]">Sr</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product / Service</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-[10%]">HSN/SAC</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[8%]">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[12%]">Rate</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[12%]">Taxable</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[8%]">GST%</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[12%]">GST Amt</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[13%]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-gray-500">
                        No line items
                      </td>
                    </tr>
                  ) : (
                    lines.map((l, idx) => {
                      const item = l?.itemId ? itemsById.get(String(l.itemId)) : null;
                      const name = String(item?.name || l?.description || '').trim();
                      const hsn = String(l?.hsnSac || item?.hsnSac || '').trim();
                      const qty = Number(l?.quantity ?? 0);
                      const unit = String(item?.unit || '').trim();
                      const rate = Number(l?.rate ?? 0);
                      const taxable = Number(l?.taxableAmount ?? l?.amount ?? 0);
                      const gstRate = Number(l?.gstRate ?? 0);
                      const gstAmt = Number.isFinite(Number(l?.gstAmount))
                        ? Number(l?.gstAmount)
                        : Number.isFinite(Number(l?.igstAmount))
                          ? Number(l?.igstAmount)
                          : Number.isFinite(Number(l?.cgstAmount)) || Number.isFinite(Number(l?.sgstAmount))
                            ? Number(l?.cgstAmount ?? 0) + Number(l?.sgstAmount ?? 0)
                            : 0;
                      const total = Number(l?.lineTotal ?? taxable + gstAmt);

                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2">{idx + 1}</td>
                          <td className="px-3 py-2">{name || '-'}</td>
                          <td className="px-3 py-2">{hsn || '-'}</td>
                          <td className="px-3 py-2 text-right">{Number.isFinite(qty) ? `${qty}${unit ? ` ${unit}` : ''}` : '-'}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(Number.isFinite(rate) ? rate : 0, currentCompany)}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(Number.isFinite(taxable) ? taxable : 0, currentCompany)}</td>
                          <td className="px-3 py-2 text-right">{Number.isFinite(gstRate) ? gstRate : 0}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(Number.isFinite(gstAmt) ? gstAmt : 0, currentCompany)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatMoney(Number.isFinite(total) ? total : 0, currentCompany)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-700 uppercase">Terms</div>
                <div className="text-xs text-gray-600 mt-2">This is a computer generated invoice. Signature not required.</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-700 uppercase">For {company?.name || 'Company'}</div>
                <div className="mt-10 text-xs text-gray-600">(Authorized Signatory)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'a4BoxedGst') {
    const place = String(invoice?.placeOfSupplyState || '').trim();
    const placeCode = codeForStateName(place);
    const placeDisplay = place ? `${place}${placeCode ? ` (${placeCode})` : ''}` : '';

    const isIntra = String(invoice?.taxType || '').toUpperCase() === 'CGST_SGST';

    const safeNum = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

    return (
      <div className="printable max-w-[980px] mx-auto text-sm text-gray-900">
        <div className="border-2 border-gray-900 bg-white">
          <div className={`h-2 ${accent.barClass}`} />
          <div className="p-6 border-b-2 border-gray-900">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-2xl font-extrabold">{company?.name || 'Company'}</div>
                {companyAddress ? <div className="text-xs text-gray-600">{companyAddress}</div> : null}
                {company?.gstin ? <div className="text-xs text-gray-600">GSTIN: {company.gstin}</div> : null}
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold tracking-wide">TAX INVOICE</div>
                <div className="mt-2 text-xs text-gray-600">Invoice No: {invoice?.number || '-'}</div>
                <div className="text-xs text-gray-600">Date: {invoice?.date || '-'}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b-2 border-gray-900">
            <div className="p-4 border-r-2 border-gray-900">
              <div className="text-xs font-semibold uppercase">Bill To</div>
              <div className="font-semibold mt-1">{invoice?.customerName || customer?.displayName || customer?.name || '-'}</div>
              {customerAddress ? <div className="text-xs text-gray-600">{customerAddress}</div> : null}
              {invoice?.customerGstin ? <div className="text-xs text-gray-600">GSTIN: {invoice.customerGstin}</div> : null}
              {placeDisplay ? <div className="text-xs text-gray-600">Place of Supply: {placeDisplay}</div> : null}
            </div>
            <div className="p-4">
              <div className="text-xs font-semibold uppercase">Totals</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="text-gray-600">Taxable</div>
                <div className="text-right font-semibold">{formatMoney(safeNum(invoice?.subtotal), currentCompany)}</div>
                {isIntra ? (
                  <>
                    <div className="text-gray-600">CGST</div>
                    <div className="text-right font-semibold">{formatMoney(safeNum(invoice?.cgstTotal), currentCompany)}</div>
                    <div className="text-gray-600">SGST</div>
                    <div className="text-right font-semibold">{formatMoney(safeNum(invoice?.sgstTotal), currentCompany)}</div>
                  </>
                ) : (
                  <>
                    <div className="text-gray-600">IGST</div>
                    <div className="text-right font-semibold">{formatMoney(safeNum(invoice?.igstTotal), currentCompany)}</div>
                  </>
                )}
                <div className="text-gray-600">Total</div>
                <div className="text-right font-bold">{formatMoney(safeNum(invoice?.total), currentCompany)}</div>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="border-2 border-gray-900 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b-2 border-gray-900">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold border-r-2 border-gray-900 w-[5%]">Sr</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold border-r-2 border-gray-900">Item</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold border-r-2 border-gray-900 w-[10%]">HSN</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900 w-[8%]">Qty</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900 w-[10%]">Rate</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900 w-[12%]">Taxable</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900 w-[7%]">GST%</th>
                    {isIntra ? (
                      <>
                        <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900 w-[10%]">CGST</th>
                        <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900 w-[10%]">SGST</th>
                      </>
                    ) : (
                      <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900 w-[10%]">IGST</th>
                    )}
                    <th className="px-2 py-2 text-right text-xs font-semibold w-[12%]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={isIntra ? 10 : 9} className="px-3 py-10 text-center text-gray-600">
                        No line items
                      </td>
                    </tr>
                  ) : (
                    lines.map((l, idx) => {
                      const item = l?.itemId ? itemsById.get(String(l.itemId)) : null;
                      const name = String(item?.name || l?.description || '').trim();
                      const hsn = String(l?.hsnSac || item?.hsnSac || '').trim();
                      const qty = safeNum(l?.quantity);
                      const unit = String(item?.unit || '').trim();
                      const rate = safeNum(l?.rate);
                      const taxable = safeNum(l?.taxableAmount ?? l?.amount);
                      const gstRate = safeNum(l?.gstRate);
                      const cgst = safeNum(l?.cgstAmount);
                      const sgst = safeNum(l?.sgstAmount);
                      const igst = safeNum(l?.igstAmount);
                      const total = safeNum(l?.lineTotal ?? taxable + safeNum(l?.gstAmount));

                      return (
                        <tr key={idx}>
                          <td className="px-2 py-2 border-r-2 border-gray-900">{idx + 1}</td>
                          <td className="px-2 py-2 border-r-2 border-gray-900">{name || '-'}</td>
                          <td className="px-2 py-2 border-r-2 border-gray-900">{hsn || '-'}</td>
                          <td className="px-2 py-2 text-right border-r-2 border-gray-900">{Number.isFinite(qty) ? `${qty}${unit ? ` ${unit}` : ''}` : '-'}</td>
                          <td className="px-2 py-2 text-right border-r-2 border-gray-900">{formatMoney(rate, currentCompany)}</td>
                          <td className="px-2 py-2 text-right border-r-2 border-gray-900">{formatMoney(taxable, currentCompany)}</td>
                          <td className="px-2 py-2 text-right border-r-2 border-gray-900">{gstRate}</td>
                          {isIntra ? (
                            <>
                              <td className="px-2 py-2 text-right border-r-2 border-gray-900">{formatMoney(cgst, currentCompany)}</td>
                              <td className="px-2 py-2 text-right border-r-2 border-gray-900">{formatMoney(sgst, currentCompany)}</td>
                            </>
                          ) : (
                            <td className="px-2 py-2 text-right border-r-2 border-gray-900">{formatMoney(igst, currentCompany)}</td>
                          )}
                          <td className="px-2 py-2 text-right font-semibold">{formatMoney(total, currentCompany)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="border-2 border-gray-900 p-4">
                <div className="text-xs font-semibold uppercase">Terms</div>
                <div className="text-xs text-gray-600 mt-2">Subject to jurisdiction.</div>
              </div>
              <div className="border-2 border-gray-900 p-4">
                <div className="text-xs font-semibold uppercase">For {company?.name || 'Company'}</div>
                <div className="mt-10 text-xs text-gray-600">(Authorized Signatory)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'a4Letterhead') {
    const place = String(invoice?.placeOfSupplyState || '').trim();
    const placeCode = codeForStateName(place);
    const placeDisplay = place ? `${place}${placeCode ? ` (${placeCode})` : ''}` : '';

    return (
      <div className="printable max-w-[980px] mx-auto text-sm text-gray-900">
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className={`p-6 ${accent.barClass} text-white`}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-2xl font-extrabold">{company?.name || 'Company'}</div>
                {companyAddress ? <div className="text-xs opacity-95">{companyAddress}</div> : null}
                {company?.gstin ? <div className="text-xs opacity-95">GSTIN: {company.gstin}</div> : null}
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold tracking-wide">TAX INVOICE</div>
                <div className="mt-2 text-xs opacity-95">Invoice No: {invoice?.number || '-'}</div>
                <div className="text-xs opacity-95">Date: {invoice?.date || '-'}</div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-700 uppercase">Bill To</div>
                <div className="mt-1 font-semibold">{invoice?.customerName || customer?.displayName || customer?.name || '-'}</div>
                {customerAddress ? <div className="text-xs text-gray-600">{customerAddress}</div> : null}
                {invoice?.customerGstin ? <div className="text-xs text-gray-600">GSTIN: {invoice.customerGstin}</div> : null}
                {placeDisplay ? <div className="text-xs text-gray-600">Place of Supply: {placeDisplay}</div> : null}
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-700 uppercase">Totals</div>
                <div className="mt-2 flex justify-between">
                  <span className="text-gray-600">Taxable</span>
                  <span className="font-semibold">{formatMoney(Number(invoice?.subtotal ?? 0), currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">GST</span>
                  <span className="font-semibold">{formatMoney(Number(invoice?.gstTotal ?? 0), currentCompany)}</span>
                </div>
                <div className="flex justify-between border-t mt-2 pt-2">
                  <span className="font-bold">Total</span>
                  <span className="font-bold">{formatMoney(Number(invoice?.total ?? 0), currentCompany)}</span>
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-[5%]">Sr</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product / Service</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[10%]">Qty</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[12%]">Taxable</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[10%]">GST%</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-[13%]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-gray-500">
                        No line items
                      </td>
                    </tr>
                  ) : (
                    lines.map((l, idx) => {
                      const item = l?.itemId ? itemsById.get(String(l.itemId)) : null;
                      const name = String(item?.name || l?.description || '').trim();
                      const qty = Number(l?.quantity ?? 0);
                      const unit = String(item?.unit || '').trim();
                      const taxable = Number(l?.taxableAmount ?? l?.amount ?? 0);
                      const gstRate = Number(l?.gstRate ?? 0);
                      const gstAmt = Number.isFinite(Number(l?.gstAmount))
                        ? Number(l?.gstAmount)
                        : Number.isFinite(Number(l?.igstAmount))
                          ? Number(l?.igstAmount)
                          : Number.isFinite(Number(l?.cgstAmount)) || Number.isFinite(Number(l?.sgstAmount))
                            ? Number(l?.cgstAmount ?? 0) + Number(l?.sgstAmount ?? 0)
                            : 0;
                      const total = Number(l?.lineTotal ?? taxable + gstAmt);

                      return (
                        <tr key={idx}>
                          <td className="px-3 py-2">{idx + 1}</td>
                          <td className="px-3 py-2">{name || '-'}</td>
                          <td className="px-3 py-2 text-right">{Number.isFinite(qty) ? `${qty}${unit ? ` ${unit}` : ''}` : '-'}</td>
                          <td className="px-3 py-2 text-right">{formatMoney(Number.isFinite(taxable) ? taxable : 0, currentCompany)}</td>
                          <td className="px-3 py-2 text-right">{Number.isFinite(gstRate) ? gstRate : 0}</td>
                          <td className="px-3 py-2 text-right font-semibold">{formatMoney(Number.isFinite(total) ? total : 0, currentCompany)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-700 uppercase">Notes</div>
                <div className="text-xs text-gray-600 mt-2" style={{ whiteSpace: 'pre-wrap' }}>
                  This is a computer generated invoice. Signature not required.
                </div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold text-gray-700 uppercase">For {company?.name || 'Company'}</div>
                <div className="mt-10 text-xs text-gray-600">(Authorized Signatory)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'a5' || templateId === 'a5Compact' || templateId === 'a5Clean' || templateId === 'a5Boxed') {
    const place = String(invoice?.placeOfSupplyState || '').trim();
    const placeCode = codeForStateName(place);
    const placeDisplay = place ? `${place}${placeCode ? ` (${placeCode})` : ''}` : '';

    const variant = templateId;
    const isCompact = variant === 'a5Compact';
    const isClean = variant === 'a5Clean';
    const isBoxed = variant === 'a5Boxed';

    const outerClass = isCompact ? 'text-[10px] leading-4' : 'text-[11px] leading-4';
    const borderClass = isBoxed ? 'border-2 border-gray-900' : 'border border-gray-900';
      const pHead = isCompact ? 'p-2' : 'p-3';
    const pCell = isCompact ? 'p-2' : 'p-3';

    return (
      <div className={`max-w-[720px] mx-auto text-gray-900 ${outerClass}`}>
        <div className={`${borderClass} bg-white`}>
          <div className={`${pHead} ${isBoxed ? 'border-b-2 border-gray-900' : 'border-b border-gray-900'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-bold">{company?.name || 'Company'}</div>
                {companyAddress ? <div className="text-[10px] text-gray-700">{companyAddress}</div> : null}
                {company?.gstin ? <div className="text-[10px] text-gray-700">GSTIN : {company.gstin}</div> : null}
              </div>
              <div className="text-right">
                <div className="text-lg font-extrabold tracking-wide">TAX INVOICE</div>
                <div className="text-[10px] font-semibold">
                  {variant === 'a5Compact' ? 'A5 COMPACT' : variant === 'a5Clean' ? 'A5 CLEAN' : variant === 'a5Boxed' ? 'A5 BOXED' : 'ORIGINAL FOR RECIPIENT'}
                </div>
              </div>
            </div>
          </div>

          <div className={`grid ${isCompact ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <div className={`${pCell} ${isBoxed ? 'border-r-2 border-gray-900' : 'border-r border-gray-900'}`}>
              <div className="font-semibold">M/S</div>
              <div className="font-semibold">{invoice?.customerName || customer?.displayName || customer?.name || '-'}</div>
              {customerAddress ? <div className="text-[10px] text-gray-700">{customerAddress}</div> : null}
              {invoice?.customerGstin ? <div className="text-[10px] text-gray-700">GSTIN : {invoice.customerGstin}</div> : null}
              {placeDisplay ? <div className="text-[10px] text-gray-700">Place of Supply : {placeDisplay}</div> : null}
            </div>

            {!isCompact && (
              <div className={`${pCell} ${isBoxed ? 'border-r-2 border-gray-900' : 'border-r border-gray-900'}`}>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                  <div className="font-semibold">Invoice No.</div>
                  <div>{invoice?.number || '-'}</div>
                  <div className="font-semibold">Challan No</div>
                  <div>{invoice?.refNo || '—'}</div>
                  <div className="font-semibold">E-Way Bill No.</div>
                  <div>—</div>
                  <div className="font-semibold">Transport</div>
                  <div>—</div>
                  <div className="font-semibold">Transport ID</div>
                  <div>—</div>
                </div>
              </div>
            )}

            <div className={pCell}>
              <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <div className="font-semibold">Invoice No.</div>
                <div>{invoice?.number || '-'}</div>
                <div className="font-semibold">Invoice Date</div>
                <div>{invoice?.date || '-'}</div>
                {!isClean && (
                  <>
                    <div className="font-semibold">Challan Date</div>
                    <div>{invoice?.refDate || '—'}</div>
                  </>
                )}
                <div className="font-semibold">Due Date</div>
                <div>{invoice?.dueDate || '—'}</div>
              </div>
            </div>
          </div>

          <div className={isBoxed ? 'border-t-2 border-gray-900' : 'border-t border-gray-900'}>
            <table className="w-full border-collapse">
              <thead>
                <tr className={isBoxed ? 'border-b-2 border-gray-900' : 'border-b border-gray-900'}>
                  <th className="p-1 border-r border-gray-900 w-[6%]">Sr.</th>
                  <th className="p-1 border-r border-gray-900">Name of Product / Service</th>
                  {!isCompact && <th className="p-1 border-r border-gray-900 w-[12%]">HSN/SAC</th>}
                  <th className="p-1 border-r border-gray-900 w-[10%]">Qty</th>
                  {!isCompact && <th className="p-1 border-r border-gray-900 w-[12%]">Rate</th>}
                  <th className="p-1 border-r border-gray-900 w-[14%]">Taxable</th>
                  <th className="p-1 border-r border-gray-900 w-[10%]">GST %</th>
                  {!isCompact && <th className="p-1 border-r border-gray-900 w-[12%]">GST Amt</th>}
                  <th className="p-1 w-[14%]">Total</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-6 text-center text-gray-600">
                      No line items
                    </td>
                  </tr>
                ) : (
                  lines.map((l, idx) => {
                    const item = l?.itemId ? itemsById.get(String(l.itemId)) : null;
                    const name = String(item?.name || l?.description || '').trim();
                    const hsn = String(l?.hsnSac || item?.hsnSac || '').trim();
                    const qty = Number(l?.quantity ?? 0);
                    const unit = String(item?.unit || '').trim();
                    const rate = Number(l?.rate ?? 0);
                    const taxable = Number(l?.taxableAmount ?? l?.amount ?? 0);
                    const gstRate = Number(l?.gstRate ?? 0);
                    const gstAmt = Number.isFinite(Number(l?.gstAmount))
                      ? Number(l?.gstAmount)
                      : Number.isFinite(Number(l?.igstAmount))
                        ? Number(l?.igstAmount)
                        : 0;
                    const total = Number(l?.lineTotal ?? taxable + gstAmt);

                    return (
                      <tr key={idx} className="border-b border-gray-200 last:border-b-0">
                        <td className="p-1 border-r border-gray-900 text-center">{idx + 1}</td>
                        <td className="p-1 border-r border-gray-900">{name || '-'}</td>
                        {!isCompact && <td className="p-1 border-r border-gray-900 text-center">{hsn || '-'}</td>}
                        <td className="p-1 border-r border-gray-900 text-center">{Number.isFinite(qty) ? `${qty}${unit ? ` ${unit}` : ''}` : '-'}</td>
                        {!isCompact && <td className="p-1 border-r border-gray-900 text-right">{formatMoney(Number.isFinite(rate) ? rate : 0, currentCompany)}</td>}
                        <td className="p-1 border-r border-gray-900 text-right">{formatMoney(Number.isFinite(taxable) ? taxable : 0, currentCompany)}</td>
                        <td className="p-1 border-r border-gray-900 text-center">{Number.isFinite(gstRate) ? gstRate : 0}</td>
                        {!isCompact && (
                          <td className="p-1 border-r border-gray-900 text-right">{formatMoney(Number.isFinite(gstAmt) ? gstAmt : 0, currentCompany)}</td>
                        )}
                        <td className="p-1 text-right">{formatMoney(Number.isFinite(total) ? total : 0, currentCompany)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className={`grid ${isCompact ? 'grid-cols-2' : 'grid-cols-3'} ${isBoxed ? 'border-t-2 border-gray-900' : 'border-t border-gray-900'}`}>
            <div className={`${pCell} ${isCompact ? '' : 'col-span-2'} ${isBoxed ? 'border-r-2 border-gray-900' : 'border-r border-gray-900'}`}>
              <div className="font-semibold">Total in words</div>
              <div className="text-[10px] text-gray-700">(in words not configured)</div>

              {!isClean && (
                <>
                  <div className="mt-3 font-semibold">Terms and Conditions</div>
                  <div className="text-[10px] text-gray-700">Goods once sold will not be taken back.</div>
                </>
              )}

              <div className="mt-8 font-semibold">Customer Signature</div>
            </div>
            <div className={pCell}>
              <div className="space-y-1">
                <div className="flex justify-between font-semibold">
                  <span>Taxable Amount</span>
                  <span>{formatMoney(Number(invoice?.subtotal ?? 0), currentCompany)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Total Tax</span>
                  <span>{formatMoney(Number(invoice?.gstTotal ?? 0), currentCompany)}</span>
                </div>
                <div className={`flex justify-between font-extrabold ${isBoxed ? 'border-t-2 border-gray-900' : 'border-t border-gray-900'} mt-2 pt-2`}>
                  <span>Total Amount</span>
                  <span>{formatMoney(Number(invoice?.total ?? 0), currentCompany)}</span>
                </div>

                <div className="mt-6 text-[10px] text-gray-700">
                  This is a computer generated invoice. Signature not required.
                </div>
              </div>
            </div>
          </div>

          <div className="p-2 border-t border-gray-900 text-[10px] text-gray-700">
            Thank you for shopping with us!
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="printable space-y-3">
      <div className="border rounded-lg overflow-hidden">
        <div className={`h-2 ${accent.barClass}`} />
        <div className="p-4">{content}</div>
      </div>
    </div>
  );
};

export default InvoicePreview;
