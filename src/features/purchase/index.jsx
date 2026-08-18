import React, { useEffect, useRef, useState } from 'react';
import { notify, confirmDialog } from '../../components/ui/notify';
import { createDocApi, deleteDocApi, hasApiSession } from '../../api/purchaseDocs';
import { Copy, CreditCard, MoreVertical, Plus, Trash2 } from 'lucide-react';

import VendorPicker from '../../components/pickers/VendorPicker';
import { dueDateFor } from '../../utils/paymentTerms';
import { plusDaysIso, todayIso } from '../../utils/dates';
import ItemPicker from '../../components/pickers/ItemPicker';

import RecordDisbursementForm from '../payments/RecordDisbursementForm';
import { bumpCompanyNextNumber, generateVoucherNumber, getDocSettings } from '../../utils/docSettings';
import { getVendorDisplayName } from '../../utils/contacts';
import { formatMoney, round2 } from '../../utils/money';
import {
  computeGstForLine,
  computeGstForLines,
  getCompanyGstProfile,
  getPartyGstProfile,
  isIntraStateSupply,
} from '../../utils/gst';
import { computeInventorySummaryByItemId, isStockItem } from '../../utils/inventory';

export const BillForm = ({ db, setDb, currentCompany, initialData, onClose, warehouses = [], defaultWarehouseId = '' }) => {
  const activeBranchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  const resolveBranchIdFromWarehouseId = (warehouseId) => {
    const wid = String(warehouseId || '').trim();
    if (!wid) return activeBranchId || '';
    const w = (Array.isArray(warehouses) ? warehouses : []).find((x) => String(x?.id || '').trim() === wid) || null;
    return String(w?.branchId || '').trim() || activeBranchId || '';
  };

  const initWarehouseId = String(initialData?.warehouseId || defaultWarehouseId || '').trim();
  const initBranchId = resolveBranchIdFromWarehouseId(initWarehouseId) || '';
  const billDocSettingsInit = getDocSettings(db, currentCompany, { branchId: initBranchId || null });
  const billNumberingInit = billDocSettingsInit?.numbering?.bill;
  const isBillAutoInit = String(billNumberingInit?.mode || '').toLowerCase() === 'auto';
  const generatedBillNumberInit = generateVoucherNumber({ db, company: currentCompany, voucherKey: 'bill', branchId: initBranchId || null });

  const formRef = useRef(null);
  const [submitAsDraft, setSubmitAsDraft] = useState(false);

  const [formData, setFormData] = useState(() => {
    const today = todayIso();
    const defaultDue = plusDaysIso(30);

    const base = {
      number: isBillAutoInit ? generatedBillNumberInit || '' : '',
      date: today,
      dueDate: defaultDue,
      status: 'Unpaid',
      refNo: '',
      refDate: '',
      vendorId: '',
      warehouseId: String(defaultWarehouseId || '').trim(),
      items: [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '' }],
    };

    if (!initialData) return base;

    const copiedItems = Array.isArray(initialData.items)
      ? initialData.items.map((l) => ({
          itemId: l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '',
          description: l?.description ?? '',
          quantity: Number(l?.quantity ?? 1),
          rate: Number(l?.rate ?? 0),
          gstRate: Number(l?.gstRate ?? 0),
          hsnSac: l?.hsnSac || '',
        }))
      : base.items;

    return {
      ...base,
      refNo: initialData.refNo || '',
      refDate: initialData.refDate || '',
      vendorId:
        initialData.vendorId !== undefined && initialData.vendorId !== null && initialData.vendorId !== ''
          ? String(initialData.vendorId)
          : '',
      warehouseId: String(initialData?.warehouseId || base.warehouseId || '').trim(),
      items: copiedItems.length ? copiedItems : base.items,
    };
  });

  const branchIdForNumbering = resolveBranchIdFromWarehouseId(formData.warehouseId) || null;
  const billDocSettings = getDocSettings(db, currentCompany, { branchId: branchIdForNumbering });
  const billNumbering = billDocSettings?.numbering?.bill;
  const isBillAuto = String(billNumbering?.mode || '').toLowerCase() === 'auto';
  const lockBillNumber = isBillAuto && !billNumbering?.allowManualOverride;
  const generatedBillNumber = generateVoucherNumber({ db, company: currentCompany, voucherKey: 'bill', branchId: branchIdForNumbering });

  const warehouseOptions = React.useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return list.slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [warehouses]);

  const vendors = db.vendors.filter((v) => v.companyId === currentCompany.id);
  const itemsMaster = db.items.filter((i) => i.companyId === currentCompany.id);

  const { state: companyState } = getCompanyGstProfile(currentCompany);
  const vendor = formData.vendorId ? vendors.find((v) => v.id === parseInt(formData.vendorId)) : null;
  const { state: vendorState, gstin: vendorGstin } = getPartyGstProfile(vendor);
  const isIntra = isIntraStateSupply({ companyState, partyState: vendorState });

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '' }],
    }));
  };

  const removeItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index, field, value, pickedItem = null) => {
    setFormData((prev) => {
      const nextItems = [...prev.items];
      const next = { ...nextItems[index], [field]: value };

      if (field === 'itemId') {
        const item = pickedItem || itemsMaster.find((i) => i.id === parseInt(value));
        if (item) {
          next.description = item.name;
          next.rate = item.purchasePrice;
          next.gstRate = Number(item.gstRate ?? 0);
          next.hsnSac = item.hsnSac || '';
        }
      }

      if (field === 'quantity' || field === 'rate' || field === 'gstRate' || field === 'itemId') {
        const computed = computeGstForLine({
          quantity: Number(next.quantity ?? 1),
          rate: Number(next.rate ?? 0),
          gstRate: Number(next.gstRate ?? 0),
          isIntra,
        });
        next.amount = computed.taxableAmount;
        next.taxableAmount = computed.taxableAmount;
        next.gstAmount = computed.gstAmount;
        next.cgstAmount = computed.cgstAmount;
        next.sgstAmount = computed.sgstAmount;
        next.igstAmount = computed.igstAmount;
        next.lineTotal = computed.lineTotal;
        next.taxType = computed.taxType;
      }

      nextItems[index] = next;
      return { ...prev, items: nextItems };
    });
  };

  const computed = computeGstForLines({ lines: formData.items, isIntra });

  const handleSubmit = async (e) => {
    e.preventDefault();

    const wantsDraft = submitAsDraft;
    if (wantsDraft) setSubmitAsDraft(false);

    let billNumber = String(formData.number || '').trim();
    if (isBillAuto) {
      if (lockBillNumber) billNumber = String(generatedBillNumber || '').trim();
      else if (!billNumber) billNumber = String(generatedBillNumber || '').trim();
    }
    if (!billNumber) {
      notify.error('Bill number is required');
      return;
    }

    if (!String(formData.warehouseId || '').trim()) {
      notify.error('Warehouse is required');
      return;
    }

    const billNumberClash = db.bills.some((b) => b.companyId === currentCompany.id && String(b.number || '').trim() === billNumber);
    if (billNumberClash) {
      notify.error('Bill number already exists. Please change the number or update numbering settings in Company Profile.');
      return;
    }

    if (!formData.vendorId) {
      notify.error('Vendor is required');
      return;
    }

    if (!companyState) {
      notify.error('Please set Company State in Company Profile before creating GST bills.');
      return;
    }

    const hasMissingItem = (formData.items || []).some((l) => !String(l.itemId || '').trim());
    if (hasMissingItem) {
      notify.error('Please select an Item for every line. Items are mandatory for GST.');
      return;
    }

    const vendorObj = vendors.find((v) => v.id === parseInt(formData.vendorId));
    const billVendorName = getVendorDisplayName(vendorObj);

    // Server first: a non-draft bill is a liability and must reach the books.
    // The local copy mirrors it for the UI; drafts stay local until real.
    let backendDocId = null;
    let serverNumber = '';
    if (!wantsDraft && hasApiSession()) {
      try {
        const saved = await createDocApi('bill', {
          number: billNumber || undefined,
          date: formData.date,
          dueDate: formData.dueDate || null,
          refNo: formData.refNo || null,
          refDate: formData.refDate || null,
          partyId: vendorObj?.backendPartyId ? String(vendorObj.backendPartyId) : null,
          partyName: billVendorName,
          partyGstin: vendorGstin || null,
          placeOfSupplyState: vendorState || null,
          taxType: isIntra ? 'CGST_SGST' : 'IGST',
          subtotal: computed.subtotal,
          cgstTotal: computed.cgstTotal,
          sgstTotal: computed.sgstTotal,
          igstTotal: computed.igstTotal,
          gstTotal: computed.gstTotal,
          total: computed.total,
          status: 'Unpaid',
          items: computed.lines,
        });
        backendDocId = saved?.id || null;
        serverNumber = String(saved?.number || '');
      } catch (err) {
        notify.error(String(err?.message || 'Bill not saved to the server.'));
        return;
      }
    }

    const newBill = {
      id: db.bills.length + 1,
      companyId: currentCompany.id,
      ...formData,
      backendDocId,
      number: serverNumber || billNumber,
      warehouseId: String(formData.warehouseId || '').trim(),
      vendorName: billVendorName,
      vendorGstin: vendorGstin,
      placeOfSupplyState: vendorState,
      taxType: isIntra ? 'CGST_SGST' : 'IGST',
      items: computed.lines,
      subtotal: computed.subtotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      gstTotal: computed.gstTotal,
      total: computed.total,
      paidAmount: 0,
      status: wantsDraft ? 'Draft' : 'Unpaid',
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      bills: [...db.bills, newBill],
      companies: bumpCompanyNextNumber({ db, companyId: currentCompany.id, voucherKey: 'bill', usedNumber: billNumber, branchId: branchIdForNumbering }),
    });
    onClose?.();
    notify.success('Bill created successfully!');
  };

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setSubmitAsDraft(true);
            formRef.current?.requestSubmit();
          }}
          className="ui-btn ui-btn-secondary"
        >
          Save Draft
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Bill Number</label>
          <input
            type="text"
            value={formData.number}
            onChange={(e) => setFormData({ ...formData, number: e.target.value })}
            className={`w-full px-3 py-2 border rounded-lg ${lockBillNumber ? 'ui-sunken' : ''}`}
            disabled={lockBillNumber}
            required
          />
        </div>

        <div>
          <VendorPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.vendorId}
            onChange={(vendorId) =>
              setFormData((prev) => {
                // Requirement 12: the bill due date follows the vendor's agreed
                // credit period rather than a blanket +30 days.
                const picked = vendors.find((v) => String(v.id) === String(vendorId));
                return {
                  ...prev,
                  vendorId,
                  dueDate: picked ? dueDateFor(prev.date, picked) || prev.dueDate : prev.dueDate,
                };
              })
            }
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Warehouse *</label>
          <select
            value={formData.warehouseId}
            onChange={(e) => setFormData((p) => ({ ...p, warehouseId: e.target.value }))}
            className="ui-select w-full px-3 py-2 ui-surface"
            required
          >
            <option value="">Select Warehouse</option>
            {warehouseOptions.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {w.name || `Warehouse ${w.id}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Bill Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            className="ui-input w-full px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Due Date</label>
          <input
            type="date"
            value={formData.dueDate}
            onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
            className="ui-input w-full px-3 py-2"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Ref No</label>
          <input
            type="text"
            value={formData.refNo}
            onChange={(e) => setFormData({ ...formData, refNo: e.target.value })}
            className="ui-input w-full px-3 py-2"
            placeholder="Customer invoice no"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Ref Date</label>
          <input
            type="date"
            value={formData.refDate}
            onChange={(e) => setFormData({ ...formData, refDate: e.target.value })}
            className="ui-input w-full px-3 py-2"
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Line Items</label>
          <button type="button" onClick={addItem} className="ui-fg ui-hover-fg text-sm flex items-center gap-1">
            <Plus size={16} /> Add Item
          </button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full ui-table-wide">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Qty</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Rate</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Line Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {computed.lines.map((item, idx) => (
                <tr key={idx} className="border-t">
                  <td className="ui-col-meta px-3 py-2">
                    <ItemPicker
                      db={db}
                      setDb={setDb}
                      currentCompany={currentCompany}
                      value={item.itemId}
                      onChange={(itemId, picked) => updateItem(idx, 'itemId', itemId, picked)}
                      label={null}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      className="ui-input w-full px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                      className="ui-input w-full px-2 py-1"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="ui-input w-full px-2 py-1"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="ui-col-amount px-3 py-2 font-semibold">{formatMoney(item.lineTotal || 0, currentCompany)}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => removeItem(idx)} className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-80 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatMoney(computed.subtotal, currentCompany)}</span>
            </div>
            {isIntra ? (
              <>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span>{formatMoney(computed.cgstTotal, currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span>{formatMoney(computed.sgstTotal, currentCompany)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span>{formatMoney(computed.igstTotal, currentCompany)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total:</span>
              <span>{formatMoney(computed.total, currentCompany)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="px-6 py-2 ui-btn ui-btn-primary rounded-lg ">
          Create Bill
        </button>
      </div>
    </form>
  );
};

export const PurchaseOrdersList = ({ db, setDb, openModal, currentCompany, warehouses = [], onConvertToBill }) => {
  const purchaseOrders = db.purchaseOrders.filter((po) => po.companyId === currentCompany.id);

  const warehouseById = React.useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return new Map(list.map((w) => [String(w?.id), w]));
  }, [warehouses]);

  const createPo = () => {
    openModal(<PurchaseOrderForm db={db} setDb={setDb} currentCompany={currentCompany} onClose={() => openModal(null)} />);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-title text-lg">Purchase Orders</h3>
        <button onClick={createPo} className="ui-btn ui-btn-primary ">
          <Plus size={20} /> New PO
        </button>
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border ui-border-c">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">PO #</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Vendor</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Warehouse</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Date</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Amount</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Status</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium ui-muted uppercase"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {purchaseOrders.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-12 text-center ui-muted">
                  No purchase orders found. Click "New PO" to create one.
                </td>
              </tr>
            ) : (
              purchaseOrders.map((po) => {
                const whId = String(po?.warehouseId || '').trim();
                const wh = whId ? warehouseById.get(whId) : null;
                const whLabel = wh ? String(wh?.name || `Warehouse ${wh?.id}`) : whId ? `Warehouse ${whId}` : '-';
                return (
                  <tr key={po.id} className="ui-hover-sunken">
                    <td className="ui-col-id px-4 py-2.5 font-medium">{po.number}</td>
                    <td className="ui-col-entity px-4 py-2.5">{po.vendorName}</td>
                    <td className="ui-col-meta px-4 py-2.5">{whLabel}</td>
                    <td className="ui-col-date px-4 py-2.5">{po.date}</td>
                    <td className="ui-col-amount px-4 py-2.5 font-semibold">{formatMoney(po.total || 0, currentCompany)}</td>
                    <td className="ui-col-meta px-4 py-2.5">
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-[rgb(var(--warn-soft))] text-[rgb(var(--warn))]">{po.status || 'Draft'}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {onConvertToBill && po.status !== 'Billed' ? (
                        <button
                          type="button"
                          onClick={() => onConvertToBill(po)}
                          className="ui-btn ui-btn-secondary !h-8 text-xs"
                          title={`Raise a bill from ${po.number}`}
                        >
                          Convert to Bill
                        </button>
                      ) : po.status === 'Billed' ? (
                        <span className="ui-caption">Billed</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PurchaseOrderForm = ({ db, setDb, currentCompany, onClose }) => {
  const vendors = db.vendors.filter((v) => v.companyId === currentCompany.id);
  const itemsMaster = db.items.filter((i) => i.companyId === currentCompany.id);

  const activeBranchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  const poDocSettings = getDocSettings(db, currentCompany, { branchId: activeBranchId || null });
  const poNumbering = poDocSettings?.numbering?.purchaseOrder;
  const isPoAuto = String(poNumbering?.mode || '').toLowerCase() === 'auto';
  const lockPoNumber = isPoAuto && !poNumbering?.allowManualOverride;
  const generatedPoNumber = generateVoucherNumber({ db, company: currentCompany, voucherKey: 'purchaseOrder', branchId: activeBranchId || null });

  const [formData, setFormData] = useState({
    number: isPoAuto ? generateVoucherNumber({ db, company: currentCompany, voucherKey: 'purchaseOrder', branchId: activeBranchId || null }) || '' : '',
    date: new Date().toISOString().split('T')[0],
    vendorId: '',
    items: [{ itemId: '', description: '', quantity: 1, rate: 0, amount: 0 }],
    notes: '',
  });

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { itemId: '', description: '', quantity: 1, rate: 0, amount: 0 }],
    }));
  };

  const removeItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index, field, value, pickedItem = null) => {
    setFormData((prev) => {
      const nextItems = [...prev.items];
      const next = { ...nextItems[index], [field]: value };

      if (field === 'itemId') {
        const item = pickedItem || itemsMaster.find((i) => i.id === parseInt(value));
        if (item) {
          next.description = item.name;
          next.rate = Number(item.purchasePrice ?? 0);
        }
      }

      if (field === 'quantity' || field === 'rate' || field === 'itemId') {
        const qty = Number(next.quantity ?? 1);
        const rate = Number(next.rate ?? 0);
        next.amount = round2((Number.isFinite(qty) ? qty : 1) * (Number.isFinite(rate) ? rate : 0));
      }

      nextItems[index] = next;
      return { ...prev, items: nextItems };
    });
  };

  const subtotal = round2((formData.items || []).reduce((sum, l) => sum + Number(l.amount || 0), 0));

  const handleSubmit = async (e) => {
    e.preventDefault();

    let poNumber = String(formData.number || '').trim();
    if (isPoAuto) {
      if (lockPoNumber) poNumber = String(generatedPoNumber || '').trim();
      else if (!poNumber) poNumber = String(generatedPoNumber || '').trim();
    }
    if (!poNumber) {
      notify.error('PO number is required');
      return;
    }

    const poNumberClash = db.purchaseOrders.some((po) => po.companyId === currentCompany.id && String(po.number || '').trim() === poNumber);
    if (poNumberClash) {
      notify.error('PO number already exists. Please change the number or update numbering settings in Company Profile.');
      return;
    }

    if (!formData.vendorId) {
      notify.error('Vendor is required');
      return;
    }

    const hasMissingItem = (formData.items || []).some((l) => !String(l.itemId || '').trim());
    if (hasMissingItem) {
      notify.error('Please select an Item for every line.');
      return;
    }

    const vendorObj = vendors.find((v) => v.id === parseInt(formData.vendorId));

    // Same server-first rule as estimates: intentions survive the browser.
    let backendDocId = null;
    let serverNumber = '';
    if (hasApiSession()) {
      try {
        const saved = await createDocApi('purchaseOrder', {
          number: poNumber || undefined,
          date: formData.date,
          partyId: vendorObj?.backendPartyId ? String(vendorObj.backendPartyId) : null,
          partyName: getVendorDisplayName(vendorObj) || 'Vendor',
          warehouseId: String(formData.warehouseId || '').trim() || null,
          subtotal,
          total: subtotal,
          status: 'Draft',
          notes: formData.notes || null,
          items: formData.items || [],
        });
        backendDocId = saved?.id || null;
        serverNumber = String(saved?.number || '');
      } catch (err) {
        notify.error(String(err?.message || 'Purchase order not saved to the server.'));
        return;
      }
    }

    const newPo = {
      id: db.purchaseOrders.length + 1,
      companyId: currentCompany.id,
      backendDocId,
      number: serverNumber || poNumber,
      date: formData.date,
      vendorId: formData.vendorId,
      vendorName: getVendorDisplayName(vendorObj),
      items: formData.items.map((l) => ({
        ...l,
        itemId: String(l.itemId || ''),
        quantity: Number(l.quantity ?? 1),
        rate: Number(l.rate ?? 0),
        amount: Number(l.amount ?? 0),
      })),
      subtotal,
      total: subtotal,
      notes: formData.notes,
      status: 'Draft',
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      purchaseOrders: [...db.purchaseOrders, newPo],
      companies: bumpCompanyNextNumber({ db, companyId: currentCompany.id, voucherKey: 'purchaseOrder', usedNumber: poNumber, branchId: activeBranchId || null }),
    });

    onClose?.();
    notify.success('Purchase order created successfully!');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">PO Number</label>
          <input
            type="text"
            value={formData.number}
            onChange={(e) => setFormData((p) => ({ ...p, number: e.target.value }))}
            className={`w-full px-3 py-2 border rounded-lg ${lockPoNumber ? 'ui-sunken' : ''}`}
            disabled={lockPoNumber}
            required
          />
        </div>

        <div>
          <VendorPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.vendorId}
            onChange={(vendorId) => setFormData((p) => ({ ...p, vendorId }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
            className="ui-input w-full px-3 py-2"
            required
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Line Items</label>
          <button type="button" onClick={addItem} className="ui-fg ui-hover-fg text-sm flex items-center gap-1">
            <Plus size={16} /> Add Item
          </button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full ui-table-wide">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Qty</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Rate</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, idx) => (
                <tr key={idx} className="border-t">
                  <td className="ui-col-meta px-3 py-2">
                    <ItemPicker
                      db={db}
                      setDb={setDb}
                      currentCompany={currentCompany}
                      value={item.itemId}
                      onChange={(itemId, picked) => updateItem(idx, 'itemId', itemId, picked)}
                      label={null}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      className="ui-input w-full px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} className="ui-input w-20 px-2 py-1" min="1" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="ui-input w-28 px-2 py-1"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="ui-col-amount px-3 py-2 font-semibold">{formatMoney(item.amount || 0, currentCompany)}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => removeItem(idx)} className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total:</span>
              <span>{formatMoney(subtotal, currentCompany)}</span>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} className="ui-input w-full px-3 py-2" rows={3} />
      </div>

      <div className="flex justify-end">
        <button type="submit" className="px-6 py-2 ui-btn ui-btn-primary rounded-lg ">
          Create PO
        </button>
      </div>
    </form>
  );
};

export const BillsList = ({
  db,
  setDb,
  openModal,
  currentCompany,
  onNewBill,
  onRaiseDebitNote,
  // Optional override for duplicating a bill. The code below already checked
  // for it but it was never a prop, so the branch was unreachable and a parent
  // could not hook into duplication at all.
  onDuplicateBill,
  warehouses = [],
  defaultWarehouseId = '',
}) => {
  const bills = db.bills.filter((b) => b.companyId === currentCompany.id);
  const [statusFilter, setStatusFilter] = useState('All');
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  const warehouseById = React.useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return new Map(list.map((w) => [String(w?.id), w]));
  }, [warehouses]);

  const MENU_WIDTH = 224; // w-56
  const MENU_HEIGHT_ESTIMATE = 240;

  useEffect(() => {
    if (!openMenu?.id) return;

    const onMouseDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      const btn = e.target?.closest?.('[data-bill-menu-button]');
      if (btn && String(btn.getAttribute('data-bill-menu-button')) === String(openMenu.id)) return;
      setOpenMenu(null);
    };

    const onScrollOrResize = () => setOpenMenu(null);

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [openMenu?.id]);

  const getDerivedStatus = (bill) => {
    const total = Number(bill?.total ?? 0);
    const paid = Number(bill?.paidAmount ?? 0);

    const raw = String(bill?.status || '').trim();
    if (raw === 'Draft') return 'Draft';
    if (raw === 'Paid') return 'Paid';
    if (total > 0 && paid >= total - 0.0001) return 'Paid';

    const due = bill?.dueDate ? new Date(bill.dueDate) : null;
    const today = new Date();
    if (due && !Number.isNaN(due.getTime())) {
      const dueYmd = due.toISOString().slice(0, 10);
      const todayYmd = today.toISOString().slice(0, 10);
      if (dueYmd < todayYmd && total > 0 && paid < total - 0.0001) return 'Over due';
    }

    if (paid > 0) return 'Partial';
    return 'Unpaid';
  };

  const filteredBills = bills.filter((b) => {
    const derived = getDerivedStatus(b);
    if (statusFilter === 'All') return true;
    return derived === statusFilter;
  });

  const openRecordPayment = (bill) => {
    // The server-posting disbursement form, same as the Payments screen, so a
    // payment recorded from a bill row reaches the ledger like any other.
    openModal(
      <RecordDisbursementForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialData={{
          vendorId: bill?.vendorId,
          amount: Math.max(0, Number(bill?.total ?? 0) - Number(bill?.paidAmount ?? 0)),
        }}
        onClose={() => openModal(null)}
      />,
      { title: `Record Payment ${bill?.number || ''}`.trim(), maxWidthClass: 'max-w-4xl' }
    );
  };

  const duplicateBill = (bill) => {
    const copyBill = {
      ...bill,
      id: undefined,
      number: '',
      date: undefined,
      dueDate: undefined,
      status: 'Draft',
      paidAmount: 0,
      createdAt: undefined,
      updatedAt: undefined,
    };

    if (Array.isArray(copyBill.items)) {
      copyBill.items = copyBill.items.map((l) => ({
        itemId: l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '',
        description: l?.description ?? '',
        quantity: Number(l?.quantity ?? 1),
        rate: Number(l?.rate ?? 0),
        gstRate: Number(l?.gstRate ?? 0),
        hsnSac: l?.hsnSac || '',
        amount: Number(l?.amount ?? 0),
      }));
    }

    if (typeof onDuplicateBill === 'function') {
      onDuplicateBill(copyBill);
      return;
    }

    openModal(
      <BillForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialData={copyBill}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouseId}
        onClose={() => openModal(null)}
      />,
      { title: 'New Bill', maxWidthClass: 'max-w-5xl' }
    );
  };

  const deleteBill = async (bill) => {
    const usedInDebitNotes = (Array.isArray(db.debitNotes) ? db.debitNotes : []).some(
      (dn) => dn?.companyId === currentCompany.id && Number(dn?.originalBillId) === Number(bill.id)
    );
    if (usedInDebitNotes) {
      notify.error('Cannot delete this bill because it is referenced in a Debit Note.');
      return;
    }

    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete bill ${bill?.number || ''}? This cannot be undone.`.trim(), confirmLabel: 'Yes, continue' });
    if (!ok) return;

    // Server copy first: the delete reverses the GL posting there. If that
    // fails, the local list must not drift ahead of the books.
    if (bill?.backendDocId && hasApiSession()) {
      try {
        await deleteDocApi('bill', bill.backendDocId);
      } catch (err) {
        notify.error(String(err?.message || 'Unable to delete the bill on the server.'));
        return;
      }
    }

    setDb((prev) => ({
      ...prev,
      bills: (prev.bills || []).filter((b) => b.id !== bill.id),
      payments: (Array.isArray(prev.payments) ? prev.payments : []).filter(
        (p) => {
          if (p?.voucherType === 'bill' && Number(p?.voucherId) === Number(bill.id)) return false;
          if (p?.voucherType === 'payment' && Array.isArray(p?.allocations)) {
            const hit = p.allocations.some((a) => a?.voucherType === 'bill' && Number(a?.voucherId) === Number(bill.id));
            if (hit) return false;
          }
          return true;
        }
      ),
    }));
  };

  const raiseDebitNote = (bill) => {
    if (typeof onRaiseDebitNote === 'function') {
      onRaiseDebitNote(bill);
      return;
    }

    openModal(
      <DebitNoteForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialOriginalBillId={bill?.id}
        warehouses={warehouses}
        defaultWarehouseId={defaultWarehouseId}
        onClose={() => openModal(null)}
      />,
      { title: 'New Debit Note', maxWidthClass: 'max-w-5xl' }
    );
  };

  const openBillMenu = (billId, anchorEl) => {
    if (!anchorEl) {
      setOpenMenu({ id: billId, left: 0, top: 0 });
      return;
    }

    const rect = anchorEl.getBoundingClientRect();
    const padding = 12;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;

    let left = rect.right - MENU_WIDTH;
    left = Math.max(padding, Math.min(left, vw - MENU_WIDTH - padding));

    let top = rect.bottom + 8;
    if (top + MENU_HEIGHT_ESTIMATE > vh - padding) {
      top = rect.top - MENU_HEIGHT_ESTIMATE - 8;
    }
    top = Math.max(padding, Math.min(top, vh - padding - 40));

    setOpenMenu({ id: billId, left, top });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-title text-lg">Bills</h3>
        <button
          onClick={() => {
            if (typeof onNewBill === 'function') {
              onNewBill();
              return;
            }
            openModal(
              <BillForm
                db={db}
                setDb={setDb}
                currentCompany={currentCompany}
                warehouses={warehouses}
                defaultWarehouseId={defaultWarehouseId}
                onClose={() => openModal(null)}
              />
            );
          }}
          className="ui-btn ui-btn-primary "
        >
          <Plus size={20} /> New Bill
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {['All', 'Paid', 'Unpaid', 'Partial', 'Over due', 'Draft'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-sm border ${ statusFilter === s ? 'ui-sunken ui-border-c ui-fg' : 'ui-surface ui-border-c ui-fg'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Bill #</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Vendor</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Warehouse</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Date</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Ref No</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Ref Date</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Total</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Status</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredBills.length === 0 ? (
              <tr>
                <td colSpan="9" className="px-6 py-12 text-center ui-muted">
                  No bills found
                </td>
              </tr>
            ) : (
              filteredBills.map((b) => {
                const whId = String(b?.warehouseId || '').trim();
                const wh = whId ? warehouseById.get(whId) : null;
                const whLabel = wh ? String(wh?.name || `Warehouse ${wh?.id}`) : whId ? `Warehouse ${whId}` : '-';
                const derived = getDerivedStatus(b);
                const statusPillClass =
                  derived === 'Paid'
                    ? 'bg-[rgb(var(--pos-soft))] text-[rgb(var(--pos))]'
                    : derived === 'Over due'
                      ? 'bg-[rgb(var(--neg-soft))] text-[rgb(var(--neg))]'
                      : derived === 'Draft'
                        ? 'ui-sunken ui-fg'
                        : 'bg-[rgb(var(--warn-soft))] text-[rgb(var(--warn))]';

                return (
                  <tr key={b.id} className="ui-hover-sunken">
                    <td className="ui-col-id px-4 py-2.5 font-medium">{b.number}</td>
                    <td className="ui-col-entity px-4 py-2.5">{b.vendorName}</td>
                    <td className="ui-col-meta px-4 py-2.5">{whLabel}</td>
                    <td className="ui-col-date px-4 py-2.5">{b.date}</td>
                    <td className="ui-col-id px-4 py-2.5">{b.refNo || '-'}</td>
                    <td className="ui-col-date px-4 py-2.5">{b.refDate || '-'}</td>
                    <td className="ui-col-amount px-4 py-2.5 font-semibold">{formatMoney(b.total || 0, currentCompany)}</td>
                    <td className="ui-col-meta px-4 py-2.5">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusPillClass}`}>{derived}</span>
                    </td>
                    <td
                      className="px-6 py-4"
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        data-bill-menu-button={b.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                        }}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          openBillMenu(b.id, e.currentTarget);
                        }}
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
                        title="Actions"
                      >
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {openMenu?.id ? (
        <div
          ref={menuRef}
          className="fixed z-[9999] w-56 ui-surface border rounded-lg shadow-lg overflow-hidden"
          style={{ left: openMenu.left, top: openMenu.top }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {(() => {
            const bill = filteredBills.find((b) => b.id === openMenu.id) || bills.find((b) => b.id === openMenu.id);
            if (!bill) return null;
            const derived = getDerivedStatus(bill);
            const canRecordPayment = !(derived === 'Paid' || derived === 'Draft');

            return (
              <div className="py-1 text-sm">
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    if (canRecordPayment) openRecordPayment(bill);
                  }}
                  disabled={!canRecordPayment}
                  className={`w-full px-4 py-2 text-left flex items-center gap-2 ${ canRecordPayment ? 'ui-hover-sunken ui-fg' : 'ui-subtle cursor-not-allowed'
                  }`}
                >
                  <CreditCard size={16} /> Record Payment
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    duplicateBill(bill);
                  }}
                  className="w-full px-4 py-2 text-left ui-hover-sunken flex items-center gap-2"
                >
                  <Copy size={16} /> Duplicate
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    raiseDebitNote(bill);
                  }}
                  disabled={derived === 'Draft'}
                  className={`w-full px-4 py-2 text-left flex items-center gap-2 ${ derived === 'Draft' ? 'ui-subtle cursor-not-allowed' : 'ui-hover-sunken ui-fg'
                  }`}
                >
                  <Plus size={16} /> Raise Debit Note
                </button>

                <div className="my-1 border-t" />

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    deleteBill(bill);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-[rgb(var(--neg-soft))] text-[rgb(var(--neg))] flex items-center gap-2"
                >
                  <Trash2 size={16} /> Delete
                </button>
              </div>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
};

export const DebitNoteForm = ({
  db,
  setDb,
  currentCompany,
  initialOriginalBillId,
  onClose,
  warehouses = [],
  defaultWarehouseId = '',
  initialData = null,
}) => {
  const companyBills = db.bills.filter((b) => b.companyId === currentCompany.id);
  const vendors = db.vendors.filter((v) => v.companyId === currentCompany.id);
  const itemsMaster = db.items.filter((i) => i.companyId === currentCompany.id);

  const { state: companyState } = getCompanyGstProfile(currentCompany);

  const activeBranchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  const resolveBranchIdFromWarehouseId = (warehouseId) => {
    const wid = String(warehouseId || '').trim();
    if (!wid) return activeBranchId || '';
    const w = (Array.isArray(warehouses) ? warehouses : []).find((x) => String(x?.id || '').trim() === wid) || null;
    return String(w?.branchId || '').trim() || activeBranchId || '';
  };

  const initWarehouseId = String(initialData?.warehouseId || defaultWarehouseId || '').trim();
  const initBranchId = resolveBranchIdFromWarehouseId(initWarehouseId) || '';
  const debitDocSettingsInit = getDocSettings(db, currentCompany, { branchId: initBranchId || null });
  const debitNumberingInit = debitDocSettingsInit?.numbering?.debitNote;
  const isDebitAutoInit = String(debitNumberingInit?.mode || '').toLowerCase() === 'auto';
  const generatedDebitNumberInit = generateVoucherNumber({ db, company: currentCompany, voucherKey: 'debitNote', branchId: initBranchId || null });

  const warehouseOptions = React.useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return list.slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [warehouses]);

  const [formData, setFormData] = useState(() => {
    const today = new Date().toISOString().split('T')[0];

    const base = {
      number: isDebitAutoInit ? generatedDebitNumberInit || '' : '',
      date: today,
      originalBillId: '',
      vendorId: '',
      warehouseId: String(defaultWarehouseId || '').trim(),
      items: [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
    };

    if (!initialData) return base;

    const copiedItems = Array.isArray(initialData.items)
      ? initialData.items.map((line) => {
          const qty = Number(line.quantity ?? 1);
          const rate = Number(line.rate ?? 0);
          const itemId = line.itemId !== undefined && line.itemId !== null ? String(line.itemId) : '';
          const master = itemId ? itemsMaster.find((i) => i.id === parseInt(itemId)) : null;
          const gstRate = Number(master?.gstRate ?? line.gstRate ?? 0);
          const hsnSac = master?.hsnSac || line.hsnSac || '';
          return {
            itemId,
            description: master?.name || line.description || '',
            quantity: Number.isFinite(qty) ? qty : 1,
            rate: Number.isFinite(rate) ? rate : 0,
            gstRate: Number.isFinite(gstRate) ? gstRate : 0,
            hsnSac,
            amount: (Number.isFinite(qty) ? qty : 1) * (Number.isFinite(rate) ? rate : 0),
          };
        })
      : base.items;

    return {
      ...base,
      number: String(initialData?.number || base.number || '').trim(),
      date: initialData?.date || base.date,
      originalBillId:
        initialData?.originalBillId !== undefined && initialData?.originalBillId !== null && initialData?.originalBillId !== ''
          ? String(initialData.originalBillId)
          : '',
      vendorId:
        initialData?.vendorId !== undefined && initialData?.vendorId !== null && initialData?.vendorId !== ''
          ? String(initialData.vendorId)
          : '',
      warehouseId: String(initialData?.warehouseId || base.warehouseId || '').trim(),
      items: copiedItems.length ? copiedItems : base.items,
    };
  });

  const branchIdForNumbering = resolveBranchIdFromWarehouseId(formData.warehouseId) || null;
  const debitDocSettings = getDocSettings(db, currentCompany, { branchId: branchIdForNumbering });
  const debitNumbering = debitDocSettings?.numbering?.debitNote;
  const isDebitAuto = String(debitNumbering?.mode || '').toLowerCase() === 'auto';
  const lockDebitNumber = isDebitAuto && !debitNumbering?.allowManualOverride;
  const generatedDebitNumber = generateVoucherNumber({ db, company: currentCompany, voucherKey: 'debitNote', branchId: branchIdForNumbering });

  const vendor = formData.vendorId ? vendors.find((v) => v.id === parseInt(formData.vendorId)) : null;
  const { state: vendorState, gstin: vendorGstin } = getPartyGstProfile(vendor);
  const isIntra = isIntraStateSupply({ companyState, partyState: vendorState });
  const computed = computeGstForLines({ lines: formData.items, isIntra });

  const onSelectOriginalBill = (billIdValue) => {
    const billId = parseInt(billIdValue);
    const bill = companyBills.find((b) => b.id === billId);

    if (!bill) {
      setFormData((prev) => ({
        ...prev,
        originalBillId: '',
        vendorId: '',
        warehouseId: String(defaultWarehouseId || '').trim(),
        items: [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
      }));
      return;
    }

    const copiedItems = (bill.items || []).map((line) => {
      const qty = Number(line.quantity ?? 1);
      const rate = Number(line.rate ?? 0);
      const itemId = line.itemId !== undefined && line.itemId !== null ? String(line.itemId) : '';
      const master = itemId ? itemsMaster.find((i) => i.id === parseInt(itemId)) : null;
      const gstRate = Number(master?.gstRate ?? line.gstRate ?? 0);
      const hsnSac = master?.hsnSac || line.hsnSac || '';
      return {
        itemId,
        description: master?.name || line.description || '',
        quantity: Number.isFinite(qty) ? qty : 1,
        rate: Number.isFinite(rate) ? rate : 0,
        gstRate: Number.isFinite(gstRate) ? gstRate : 0,
        hsnSac,
        amount: (Number.isFinite(qty) ? qty : 1) * (Number.isFinite(rate) ? rate : 0),
      };
    });

    setFormData((prev) => ({
      ...prev,
      originalBillId: billIdValue,
      vendorId: bill.vendorId ? String(bill.vendorId) : '',
      warehouseId: String(bill?.warehouseId || prev.warehouseId || defaultWarehouseId || '').trim(),
      items:
        copiedItems.length
          ? copiedItems
          : [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
    }));
  };

  useEffect(() => {
    if (!initialOriginalBillId) return;
    const nextId = String(initialOriginalBillId);
    if (!nextId || nextId === String(formData.originalBillId || '')) return;
    onSelectOriginalBill(nextId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOriginalBillId, companyBills.length]);

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', amount: 0 }],
    }));
  };

  const removeItem = (index) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index, field, value, pickedItem = null) => {
    const nextItems = [...formData.items];

    if (field === 'itemId') {
      const item = pickedItem || itemsMaster.find((i) => i.id === parseInt(value));
      if (item) {
        nextItems[index] = {
          ...nextItems[index],
          itemId: value,
          description: item.name,
          rate: item.purchasePrice,
          gstRate: Number(item.gstRate ?? 0),
          hsnSac: item.hsnSac || '',
        };
      }
    } else {
      nextItems[index] = {
        ...nextItems[index],
        [field]: value,
      };
    }

    if (field === 'quantity' || field === 'rate' || field === 'gstRate' || field === 'itemId') {
      const computedLine = computeGstForLine({
        quantity: Number(nextItems[index].quantity ?? 1),
        rate: Number(nextItems[index].rate ?? 0),
        gstRate: Number(nextItems[index].gstRate ?? 0),
        isIntra,
      });

      nextItems[index] = {
        ...nextItems[index],
        amount: computedLine.taxableAmount,
        taxableAmount: computedLine.taxableAmount,
        gstAmount: computedLine.gstAmount,
        cgstAmount: computedLine.cgstAmount,
        sgstAmount: computedLine.sgstAmount,
        igstAmount: computedLine.igstAmount,
        lineTotal: computedLine.lineTotal,
        taxType: computedLine.taxType,
      };
    }

    setFormData((prev) => ({ ...prev, items: nextItems }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    let debitNumber = String(formData.number || '').trim();
    if (isDebitAuto) {
      if (lockDebitNumber) debitNumber = String(generatedDebitNumber || '').trim();
      else if (!debitNumber) debitNumber = String(generatedDebitNumber || '').trim();
    }
    if (!debitNumber) {
      notify.error('Debit note number is required');
      return;
    }

    if (!String(formData.warehouseId || '').trim()) {
      notify.error('Warehouse is required');
      return;
    }

    const debitNumberClash = db.debitNotes.some((dn) => dn.companyId === currentCompany.id && String(dn.number || '').trim() === debitNumber);
    if (debitNumberClash) {
      notify.error('Debit note number already exists. Please change the number or update numbering settings in Company Profile.');
      return;
    }

    const originalBill = companyBills.find((b) => b.id === parseInt(formData.originalBillId));
    if (!originalBill) {
      notify.error('Please select the original bill');
      return;
    }

    const originalWarehouseId = String(originalBill?.warehouseId || '').trim();
    const selectedWarehouseId = String(formData.warehouseId || '').trim();
    if (originalWarehouseId && selectedWarehouseId && originalWarehouseId !== selectedWarehouseId) {
      notify.error('Debit note warehouse must match the original bill warehouse.');
      return;
    }

    if (!formData.vendorId) {
      notify.error('Vendor is required');
      return;
    }

    if (!companyState) {
      notify.error('Please set Company State in Company Profile before creating GST debit notes.');
      return;
    }

    const hasMissingItem = (formData.items || []).some((l) => !String(l.itemId || '').trim());
    if (hasMissingItem) {
      notify.error('Please select an Item for every line. Items are mandatory for GST.');
      return;
    }

    // Block negative stock for Goods (Services do not affect inventory)
    {
      const inventoryByItemId = computeInventorySummaryByItemId({
        db,
        companyId: currentCompany.id,
        warehouseId: String(formData.warehouseId || '').trim(),
      });
      const itemsById = new Map(itemsMaster.map((it) => [String(it.id), it]));

      const requiredOut = new Map();
      (Array.isArray(formData.items) ? formData.items : []).forEach((l) => {
        const itemId = l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '';
        if (!itemId) return;
        const master = itemsById.get(itemId);
        if (!master || !isStockItem(master)) return;
        const qty = Number(l?.quantity ?? 0);
        const q = Number.isFinite(qty) ? Math.max(0, qty) : 0;
        if (q <= 0) return;
        requiredOut.set(itemId, (requiredOut.get(itemId) || 0) + q);
      });

      for (const [itemId, needQty] of requiredOut.entries()) {
        const closingQty = Number(inventoryByItemId.get(String(itemId))?.closingQty ?? 0);
        const available = Number.isFinite(closingQty) ? closingQty : 0;
        if (needQty > available + 0.0001) {
          const master = itemsById.get(String(itemId));
          const label = master?.name || master?.code || `Item ${itemId}`;
          notify.error(`Negative stock not allowed. "${label}" available ${available}, required ${needQty}.`);
          return;
        }
      }
    }

    const vendorObj = vendors.find((v) => v.id === parseInt(formData.vendorId));

    const newDebitNote = {
      id: db.debitNotes.length + 1,
      companyId: currentCompany.id,
      number: debitNumber,
      date: formData.date,
      warehouseId: String(formData.warehouseId || '').trim(),
      originalBillId: originalBill.id,
      originalBillNumber: originalBill.number,
      vendorId: formData.vendorId,
      vendorName: getVendorDisplayName(vendorObj) || originalBill.vendorName || '',
      vendorGstin: vendorGstin,
      placeOfSupplyState: vendorState,
      taxType: isIntra ? 'CGST_SGST' : 'IGST',
      items: computed.lines,
      subtotal: computed.subtotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      gstTotal: computed.gstTotal,
      total: computed.total,
      status: 'Draft',
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      debitNotes: [...db.debitNotes, newDebitNote],
      companies: bumpCompanyNextNumber({
        db,
        companyId: currentCompany.id,
        voucherKey: 'debitNote',
        usedNumber: debitNumber,
        branchId: branchIdForNumbering,
      }),
    });

    onClose?.();
    notify.success('Debit note created successfully!');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Debit Note Number</label>
          <input
            type="text"
            value={formData.number}
            onChange={(e) => setFormData((p) => ({ ...p, number: e.target.value }))}
            className={`w-full px-3 py-2 border rounded-lg ${lockDebitNumber ? 'ui-sunken' : ''}`}
            disabled={lockDebitNumber}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Original Bill #</label>
          <select value={formData.originalBillId} onChange={(e) => onSelectOriginalBill(e.target.value)} className="ui-select w-full px-3 py-2" required>
            <option value="">Select Bill</option>
            {companyBills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.number}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Warehouse *</label>
          <select
            value={formData.warehouseId}
            onChange={(e) => setFormData((p) => ({ ...p, warehouseId: e.target.value }))}
            className="ui-select w-full px-3 py-2 ui-surface"
            required
          >
            <option value="">Select Warehouse</option>
            {warehouseOptions.map((w) => (
              <option key={String(w.id)} value={String(w.id)}>
                {w.name || `Warehouse ${w.id}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Debit Note Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
            className="ui-input w-full px-3 py-2"
            required
          />
        </div>

        <div>
          <VendorPicker
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            value={formData.vendorId}
            onChange={(vendorId) => setFormData((prev) => ({ ...prev, vendorId }))}
          />
        </div>
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Line Items</label>
          <button type="button" onClick={addItem} className="ui-fg ui-hover-fg text-sm flex items-center gap-1">
            <Plus size={16} /> Add Item
          </button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full ui-table-wide">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Item</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Qty</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Rate</th>
                <th className="px-3 py-2 text-left text-xs font-medium">Line Total</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, idx) => (
                <tr key={idx} className="border-t">
                  <td className="ui-col-meta px-3 py-2">
                    <ItemPicker
                      db={db}
                      setDb={setDb}
                      currentCompany={currentCompany}
                      value={item.itemId}
                      onChange={(itemId, picked) => updateItem(idx, 'itemId', itemId, picked)}
                      label={null}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(idx, 'description', e.target.value)}
                      className="ui-input w-full px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} className="ui-input w-20 px-2 py-1" min="1" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="ui-input w-24 px-2 py-1"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="ui-col-amount px-3 py-2 font-semibold">{formatMoney((computed.lines[idx]?.lineTotal ?? item.lineTotal) || 0, currentCompany)}</td>
                  <td className="px-3 py-2">
                    <button type="button" onClick={() => removeItem(idx)} className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span>{formatMoney(computed.subtotal, currentCompany)}</span>
            </div>
            {isIntra ? (
              <>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span>{formatMoney(computed.cgstTotal, currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span>{formatMoney(computed.sgstTotal, currentCompany)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span>{formatMoney(computed.igstTotal, currentCompany)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>Total:</span>
              <span>{formatMoney(computed.total, currentCompany)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" className="px-6 py-2 ui-btn ui-btn-primary rounded-lg ">
          Create Debit Note
        </button>
      </div>
    </form>
  );
};

export const DebitNotesList = ({ db, setDb, openModal, currentCompany, onNewDebitNote, warehouses = [], defaultWarehouseId = '' }) => {
  const debitNotes = db.debitNotes.filter((dn) => dn.companyId === currentCompany.id);

  const warehouseById = React.useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return new Map(list.map((w) => [String(w?.id), w]));
  }, [warehouses]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-title text-lg">Debit Notes</h3>
        <button
          onClick={() => {
            if (typeof onNewDebitNote === 'function') {
              onNewDebitNote();
              return;
            }
            openModal(
              <DebitNoteForm
                db={db}
                setDb={setDb}
                currentCompany={currentCompany}
                warehouses={warehouses}
                defaultWarehouseId={defaultWarehouseId}
                onClose={() => openModal(null)}
              />
            );
          }}
          className="ui-btn ui-btn-primary "
        >
          <Plus size={20} /> New Debit Note
        </button>
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border ui-border-c">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Debit Note #</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Original Bill</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Vendor</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Warehouse</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Date</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Amount</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium ui-muted uppercase">Status</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium ui-muted uppercase"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {debitNotes.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-12 text-center ui-muted">
                  No debit notes found. Click "New Debit Note" to create one.
                </td>
              </tr>
            ) : (
              debitNotes.map((dn) => {
                const whId = String(dn?.warehouseId || '').trim();
                const wh = whId ? warehouseById.get(whId) : null;
                const whLabel = wh ? String(wh?.name || `Warehouse ${wh?.id}`) : whId ? `Warehouse ${whId}` : '-';
                return (
                  <tr key={dn.id} className="ui-hover-sunken">
                    <td className="ui-col-id px-4 py-2.5 font-medium">{dn.number}</td>
                    <td className="ui-col-meta px-4 py-2.5">{dn.originalBillNumber}</td>
                    <td className="ui-col-entity px-4 py-2.5">{dn.vendorName}</td>
                    <td className="ui-col-meta px-4 py-2.5">{whLabel}</td>
                    <td className="ui-col-date px-4 py-2.5">{dn.date}</td>
                    <td className="ui-col-amount px-4 py-2.5 font-semibold">{formatMoney(dn.total || 0, currentCompany)}</td>
                    <td className="ui-col-meta px-4 py-2.5">
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-[rgb(var(--warn-soft))] text-[rgb(var(--warn))]">{dn.status || 'Draft'}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
