import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DocFormActions, AmountInWordsBand, DocFormFootnote } from '../../components/DocumentForm';

import { createPortal } from 'react-dom';
import { returnableLines, returnStatusLabel } from '../../utils/returns';
import BillPreview from './BillPreview';
import KnockOffForm from '../../components/KnockOffForm';
import { isOnAccount, noteBalance, documentOutstanding } from '../../utils/onAccount';
import WarehouseField from '../../components/WarehouseField';
import { useDocumentFormKeys } from '../../components/ui/useDocumentFormKeys';
import { notify, confirmDialog } from '../../components/ui/notify';
import { useFieldErrors } from '../../components/ui/useFieldErrors';
import { PermissionButton } from '../../permissions/ActionGuard';
import { FieldError, FieldErrorSummary } from '../../components/ui/Primitives';
import { createDocApi, deleteDocApi, hasApiSession, saveSettlementApi } from '../../api/purchaseDocs';
import { resolvePurchaseRate } from '../../utils/pricing';
import { isTracked, needsExpiry } from '../../utils/batches';
import { Ban, ClipboardList, Copy, CreditCard, Download, Eye, FileStack, FileText, MoreVertical, NotebookPen, Pencil, Plus, Printer, Receipt, RefreshCw, ShoppingCart, Trash2, Upload, X } from 'lucide-react';
import { EmptyState, TableTotals, StatusPill } from '../../components/ui/Primitives';

import VendorPicker from '../../components/pickers/VendorPicker';
import { dueDateFor } from '../../utils/paymentTerms';
import { plusDaysIso, todayIso } from '../../utils/dates';
import ItemPicker from '../../components/pickers/ItemPicker';

import RecordDisbursementForm from '../payments/RecordDisbursementForm';
import { bumpCompanyNextNumber, getDocSettings, nextFreeVoucherNumber } from '../../utils/docSettings';
import { getVendorDisplayName } from '../../utils/contacts';
import { amountInWordsInr, formatMoney, round2 } from '../../utils/money';
import Modal from '../../components/ui/Modal';
import DocumentCustomFields, { hasCustomFieldsAt } from '../../components/DocumentCustomFields';
import DocumentPrintView from '../../components/DocumentPrintView';
import PrintDownloadFrame from '../../components/PrintDownloadFrame';
import { getVisibleCustomFields } from '../../utils/invoicePrefs';
import {
  computeGstForLine,
  computeGstForLines,
  getCompanyGstProfile,
  getPartyGstProfile,
  isIntraStateSupply,
} from '../../utils/gst';
import { computeInventorySummaryByItemId, isStockItem } from '../../utils/inventory';
import { useColumnFilters, ColumnHeader } from '../../components/ColumnFilters';
import { ListToolbar, useListSearch } from '../../components/ListToolbar';
import { usePeriodFilter } from '../../components/ListControls';
import {
  StatCards,
  StatusTabs,
  ListSearch,
  FiltersButton,
  MoreButton,
  ExportButton,
  Pagination,
  ListTip,
  usePaged,
} from '../../components/list/ListPageParts';
import { PageHeader } from '../../components/ui/Primitives';
import DocumentListShell from '../../components/list/DocumentListShell';
import { blockIfClosed } from '../../utils/bookClose';
import { DocumentNumber, DocDate, MoneyValue } from '../../components/docs';
import { exportFormatFromKey, exportMenuItem, runListExport } from '../../components/list/exportMenu';

export const BillForm = ({ db, setDb, currentCompany, initialData, onClose, warehouses = [], defaultWarehouseId = '' }) => {
  const fieldErrors = useFieldErrors('bill');
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
  const generatedBillNumberInit = nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'bill', branchId: initBranchId || null, takenNumbers: (db.bills || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) });

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
      // Kept so a saved bill can close the order it came from.
      sourcePurchaseOrderId: initialData.sourcePurchaseOrderId ?? null,
      items: copiedItems.length ? copiedItems : base.items,
    };
  });

  const branchIdForNumbering = resolveBranchIdFromWarehouseId(formData.warehouseId) || null;
  const billDocSettings = getDocSettings(db, currentCompany, { branchId: branchIdForNumbering });
  const billNumbering = billDocSettings?.numbering?.bill;
  const isBillAuto = String(billNumbering?.mode || '').toLowerCase() === 'auto';
  const lockBillNumber = isBillAuto && !billNumbering?.allowManualOverride;
  const generatedBillNumber = nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'bill', branchId: branchIdForNumbering, takenNumbers: (db.bills || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) });

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
    // Same fix the invoice form already carries. Every other field clears its
    // error the moment it is answered; the line grid did not, so "Every line
    // needs an item" stayed on screen after the line had one — and the count
    // beside Create Bill still said a field needed attention on a bill that
    // saved perfectly well.
    //
    // Outside the updater on purpose: this is a side effect, not part of
    // computing the next form state.
    if (field === 'itemId') fieldErrors.clearField('items');

    setFormData((prev) => {
      const nextItems = [...prev.items];
      const next = { ...nextItems[index], [field]: value };

      if (field === 'itemId') {
        const item = pickedItem || itemsMaster.find((i) => i.id === parseInt(value));
        if (item) {
          const resolved = resolvePurchaseRate({
            db,
            companyId: currentCompany.id,
            vendorId: prev.vendorId,
            itemId: item.id,
            item,
          });
          next.description = item.name;
          next.rate = resolved.rate;
          next.gstRate = Number(item.gstRate ?? 0);
          next.hsnSac = item.hsnSac || '';
          if (resolved.source !== 'item master') notify.info(`Rate ${resolved.rate} from ${resolved.source}`);
        }
      }

      if (field === 'quantity' || field === 'rate' || field === 'gstRate' || field === 'itemId' || field === 'discountPct') {
        const computed = computeGstForLine({
          quantity: Number(next.quantity ?? 1),
          rate: Number(next.rate ?? 0),
          gstRate: Number(next.gstRate ?? 0),
          discountPct: Number(next.discountPct ?? 0),
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
    // Everything about a field, gathered in one pass and shown at the fields —
    // not one at a time in the opposite corner of the screen.
    const billNumberClash = db.bills.some((b) => b.companyId === currentCompany.id && String(b.number || '').trim() === billNumber);

    fieldErrors.reset();
    fieldErrors.require('number', billNumber, 'Bill number is required');
    fieldErrors.check(
      'number',
      !billNumber || !billNumberClash,
      'That number is already used. Change it, or adjust numbering in Company Profile.'
    );
    fieldErrors.require('date', formData.date, 'Bill date is required');
    fieldErrors.require('warehouseId', formData.warehouseId, 'Warehouse is required');
    fieldErrors.require('vendorId', formData.vendorId, 'Vendor is required');
    fieldErrors.check(
      'items',
      !(formData.items || []).some((l) => !String(l.itemId || '').trim()),
      'Every line needs an item — GST is charged per item.'
    );
    if (fieldErrors.failed()) return;

    // Closed books: nothing back-dates into a period already reported.
    {
      const closed = blockIfClosed(db, currentCompany.id, formData.date, 'This bill');
      if (closed) {
        notify.error(closed);
        return;
      }
    }

    if (!companyState) {
      notify.error('Please set Company State in Company Profile before creating GST bills.');
      return;
    }

    const vendorObj = vendors.find((v) => v.id === parseInt(formData.vendorId));
    const billVendorName = getVendorDisplayName(vendorObj);

    // Batch-tracked items must arrive with their batch details — checked
    // BEFORE the server write so a validation failure cannot half-save.
    const itemsByIdForBatch = new Map(itemsMaster.map((i) => [String(i.id), i]));
    if (!wantsDraft) {
      for (const l of computed.lines) {
        const master = itemsByIdForBatch.get(String(l.itemId));
        if (!isTracked(master)) continue;
        if (!String(l.batchNo || '').trim()) {
          notify.error(`"${master.name}" is batch-tracked — enter a batch number on its line.`);
          return;
        }
        if (needsExpiry(master) && !String(l.expiryDate || '').trim()) {
          notify.error(`"${master.name}" needs an expiry date on its batch.`);
          return;
        }
      }
    }

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
      sourcePurchaseOrderId: formData.sourcePurchaseOrderId ?? null,
      createdAt: new Date().toISOString(),
    };

    // Batch-tracked lines create their batch records on receipt.
    const newBatches = [];
    let nextBatchId = (db.batches || []).reduce((m, b) => Math.max(m, Number(b.id) || 0), 0);
    for (const l of computed.lines) {
      const master = itemsByIdForBatch.get(String(l.itemId));
      if (!isTracked(master)) continue;
      if (String(l.batchNo || '').trim()) {
        newBatches.push({
          id: ++nextBatchId,
          companyId: currentCompany.id,
          itemId: l.itemId,
          batchNo: String(l.batchNo).trim(),
          mfgDate: l.mfgDate || '',
          expiryDate: l.expiryDate || '',
          qtyIn: Number(l.quantity) || 0,
          sourceBillNumber: newBill.number,
          createdAt: new Date().toISOString(),
        });
      }
    }

    setDb({
      ...db,
      bills: [...db.bills, newBill],
      batches: newBatches.length ? [...(db.batches || []), ...newBatches] : db.batches,
      companies: bumpCompanyNextNumber({ db, companyId: currentCompany.id, voucherKey: 'bill', usedNumber: billNumber, branchId: branchIdForNumbering }),
    });
    onClose?.();
    notify.success(`Bill created successfully!${newBatches.length ? ` ${newBatches.length} batch(es) received.` : ''}`);
  };

  // The shared document contract: same keys on a bill as on an invoice.
  const onFormKeyDown = useDocumentFormKeys({
    formRef,
    lineCount: formData.items.length,
    addLine: addItem,
    removeLine: removeItem,
  });

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown} noValidate className="space-y-6">
      <DocFormActions primaryLabel={initialData?.id ? 'Update Bill' : 'Create Bill'} />

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
      {/*
        The head of the document, in the invoice's two columns: who it came from
        and where the goods landed on the left, the paperwork that identifies it
        on the right, ruled off between them.
      */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-4">
        <div className="lg:col-span-6 space-y-4">
        <div
          ref={(el) => fieldErrors.register('vendorId', el)}
          data-invalid-within={fieldErrors.error('vendorId') ? 'true' : undefined}
        >
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
                fieldErrors.clearField('vendorId');
                return {
                  ...prev,
                  vendorId,
                  dueDate: picked ? dueDateFor(prev.date, picked) || prev.dueDate : prev.dueDate,
                };
              })
            }
          />
          <FieldError error={fieldErrors.error('vendorId')} id={fieldErrors.errorId('vendorId')} />
        </div>

        <div
          ref={(el) => fieldErrors.register('warehouseId', el)}
          data-invalid-within={fieldErrors.error('warehouseId') ? 'true' : undefined}
        >
          <WarehouseField
            value={formData.warehouseId}
            onChange={(warehouseId) => {
              fieldErrors.clearField('warehouseId');
              setFormData((p) => ({ ...p, warehouseId }));
            }}
            options={warehouseOptions}
            activeWarehouseId={defaultWarehouseId}
            isEdit={Boolean(initialData)}
            className="ui-select w-full ui-surface"
          />
          <FieldError error={fieldErrors.error('warehouseId')} id={fieldErrors.errorId('warehouseId')} />
        </div>

        </div>

        <div
          className="lg:col-span-6 space-y-4 lg:ps-6"
          style={{ borderInlineStart: '1px solid rgb(var(--border))' }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-[1.5fr_1fr_1fr] gap-3">
        <div>
          <label className="ui-label">Bill Number</label>
          <input
            type="text"
            value={formData.number}
            onChange={(e) => {
              fieldErrors.clearField('number');
              setFormData({ ...formData, number: e.target.value });
            }}
            className={`w-full px-3 py-2 border rounded-lg ${lockBillNumber ? 'ui-sunken' : ''}`}
            disabled={lockBillNumber}
            required
            {...fieldErrors.props('number')}
          />
          <FieldError error={fieldErrors.error('number')} id={fieldErrors.errorId('number')} />
        </div>

            <div className="min-w-0">
              <label className="ui-label" htmlFor="bill-date">
                Date <span className="text-[rgb(var(--neg-ink))]">*</span>
              </label>
              <input
                id="bill-date"
                type="date"
                value={formData.date}
                onChange={(e) => {
                  fieldErrors.clearField('date');
                  setFormData({ ...formData, date: e.target.value });
                }}
                className="ui-input w-full"
                required
                {...fieldErrors.props('date')}
              />
            </div>

            <div className="min-w-0">
              <label className="ui-label" htmlFor="bill-due">
                Due Date <span className="text-[rgb(var(--neg-ink))]">*</span>
              </label>
              <input
                id="bill-due"
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="ui-input w-full"
                required
              />
            </div>
          </div>

          {/* The supplier's own number and date for this bill — what the
              invoice calls Ref No. and Ref Date. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="min-w-0">
              <label className="ui-label" htmlFor="bill-ref">Ref No.</label>
              <input
                id="bill-ref"
                type="text"
                value={formData.refNo}
                onChange={(e) => setFormData({ ...formData, refNo: e.target.value })}
                className="ui-input w-full"
                placeholder="Supplier bill no"
              />
            </div>
            <div className="min-w-0">
              <label className="ui-label" htmlFor="bill-ref-date">Ref Date</label>
              <input
                id="bill-ref-date"
                type="date"
                value={formData.refDate}
                onChange={(e) => setFormData({ ...formData, refDate: e.target.value })}
                className="ui-input w-full"
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2">
          <label className="ui-label">Line Items</label>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table ui-grid-dense w-full ui-table-wide">
            <thead className="ui-sunken">
              <tr>
                <th className="ui-th text-left w-[28%]">Item</th>
                <th className="ui-th text-left w-[20%]">Description</th>
                <th className="ui-th ui-num w-[7%]">
                  Qty <span className="text-[rgb(var(--neg-ink))]">*</span>
                </th>
                <th className="ui-th text-left w-[6%]">Unit</th>
                <th className="ui-th ui-num w-[11%]">
                  Rate (₹) <span className="text-[rgb(var(--neg-ink))]">*</span>
                </th>
                <th className="ui-th ui-num w-[7%]">Disc %</th>
                <th className="ui-th ui-num w-[8%]">Tax %</th>
                <th className="ui-th ui-num w-[13%]">Amount (₹)</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {computed.lines.map((item, idx) => {
                const master = itemsMaster.find((i) => String(i.id) === String(item.itemId));
                const tracked = isTracked(master);
                return (
                  <React.Fragment key={idx}>
                    <tr className="border-t" data-line-row={idx}>
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
                        {/* The unit belongs to the item, so it is shown rather
                            than asked for. */}
                        <span className="text-[0.8125rem] ui-muted">{String(master?.unit || '').trim() || '—'}</span>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={item.rate}
                          onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                          className="ui-input w-full min-w-0 px-2 py-1"
                          min="0"
                          step="0.01"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {/* A supplier's discount is on the bill, and without a
                            column for it the rate had to be back-worked by
                            hand — which is how a bill stops matching the
                            purchase order it came from. */}
                        <input
                          type="number"
                          value={item.discountPct || ''}
                          onChange={(e) => updateItem(idx, 'discountPct', e.target.value)}
                          className="ui-input w-full min-w-0 px-2 py-1"
                          min="0"
                          max="100"
                          step="0.01"
                          placeholder="0"
                          aria-label={`Discount percent for line ${idx + 1}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span className="ui-num block text-[0.8125rem]">{Number(item.gstRate ?? 0)}%</span>
                      </td>
                      <td className="ui-col-amount px-3 py-2">{formatMoney(item.lineTotal || 0, currentCompany)}</td>
                      <td className="px-3 py-2">
                        <button type="button" onClick={() => removeItem(idx)} className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]">
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                    {tracked ? (
                      <tr className="border-t-0">
                        <td colSpan={9} className="px-3 pb-2 pt-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="ui-muted font-medium">Batch:</span>
                            <input
                              type="text"
                              value={item.batchNo || ''}
                              onChange={(e) => updateItem(idx, 'batchNo', e.target.value)}
                              className="ui-input !h-8 w-32 px-2 text-xs"
                              placeholder="Batch no *"
                            />
                            <span className="ui-muted">Mfg</span>
                            <input
                              type="date"
                              value={item.mfgDate || ''}
                              onChange={(e) => updateItem(idx, 'mfgDate', e.target.value)}
                              className="ui-input !h-8 w-36 px-2 text-xs"
                            />
                            {needsExpiry(master) ? (
                              <>
                                <span className="ui-muted">Expiry</span>
                                <input
                                  type="date"
                                  value={item.expiryDate || ''}
                                  onChange={(e) => updateItem(idx, 'expiryDate', e.target.value)}
                                  className="ui-input !h-8 w-36 px-2 text-xs"
                                />
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={addItem} className="ui-btn ui-btn-secondary">
            <Plus size={15} aria-hidden="true" /> Add Item
          </button>
          <span className="ui-subtle text-xs">or press Tab in the last field of the last row</span>
          <FieldError error={fieldErrors.error('items')} id={fieldErrors.errorId('items')} />
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-80 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="ui-money">{formatMoney(computed.subtotal, currentCompany)}</span>
            </div>
            {isIntra ? (
              <>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span className="ui-money">{formatMoney(computed.cgstTotal, currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span className="ui-money">{formatMoney(computed.sgstTotal, currentCompany)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span className="ui-money">{formatMoney(computed.igstTotal, currentCompany)}</span>
              </div>
            )}
            <div className="ui-total-row border-t pt-2">
              <span>Total:</span>
              <span className="ui-money">{formatMoney(computed.total, currentCompany)}</span>
            </div>
          </div>
        </div>
      </div>

      <AmountInWordsBand words={amountInWordsInr(computed.total)} />

      <DocFormFootnote />

      <div className="ui-entry-summary">
        <span className="ui-t-label">Total</span>
        <span className="ui-money-lg">{formatMoney(computed.total, currentCompany)}</span>
        <span className="ui-caption">
          {formData.items.filter((l) => String(l.itemId || '').trim()).length} line(s)
          {computed.gstTotal > 0 ? ` · ${formatMoney(computed.gstTotal, currentCompany)} GST` : ''}
        </span>
        <FieldErrorSummary errors={fieldErrors.errors} />
      </div>
    </form>
  );
};

export const PurchaseOrdersList = ({
  db,
  setDb,
  openModal,
  currentCompany,
  warehouses = [],
  onConvertToBill,
  onNewPo,
  onEditPo,
}) => {
  /**
   * { id, left, top } — the row menu and where to put it.
   *
   * Position is carried because the menu is rendered in a portal on <body>
   * rather than inside the row. Absolutely positioned inside the cell, it sat
   * within .ui-table-scroll, whose overflow:auto cut it off: on a list with
   * one row the container ended at 370px while "Convert to Bill" ran to 389,
   * so half of it was invisible and unclickable. Same escape the sales lists
   * already make.
   */
  const [poMenu, setPoMenu] = useState(null);
  const [previewPo, setPreviewPo] = useState(null);

  const PO_MENU_WIDTH = 208;
  const PO_MENU_HEIGHT = 150;

  const openPoMenu = (poId, anchorEl) => {
    if (!anchorEl) return setPoMenu({ id: poId, left: 0, top: 0 });
    const rect = anchorEl.getBoundingClientRect();
    const pad = 12;
    const vw = window.innerWidth || 1024;
    const vh = window.innerHeight || 768;
    let left = rect.right - PO_MENU_WIDTH;
    left = Math.max(pad, Math.min(left, vw - PO_MENU_WIDTH - pad));
    // Flip above the button when there is no room below it.
    let top = rect.bottom + 8;
    if (top + PO_MENU_HEIGHT > vh - pad) top = rect.top - PO_MENU_HEIGHT - 8;
    top = Math.max(pad, Math.min(top, vh - pad - 40));
    setPoMenu({ id: poId, left, top });
  };

  /**
   * An order is Pending from the moment it is raised until a bill answers it,
   * and then it is Closed. The bill is the fact, so the status is read from it
   * rather than trusted from a flag someone forgot to set — a bill raised from
   * the Bills screen against this PO closes it just the same.
   */
  const poStatusOf = React.useCallback(
    (po) => {
      const stored = String(po?.status || '').trim();
      if (stored === 'Cancelled') return 'Cancelled';
      const poNumber = String(po?.number || '').trim().toLowerCase();
      const billed = (db?.bills || []).some((b) => {
        if (String(b?.status || '').toLowerCase() === 'cancelled') return false;
        if (String(b?.sourcePurchaseOrderId ?? '') === String(po?.id ?? '')) return true;
        // Bills raised before the link existed still name the order in their
        // reference, and that is the same fact written another way.
        return Boolean(poNumber) && String(b?.refNo || '').trim().toLowerCase() === poNumber;
      });
      if (billed || stored === 'Billed' || stored === 'Closed') return 'Closed';
      return 'Pending';
    },
    [db?.bills]
  );

  const openEditPo = (po) => {
    if (typeof onEditPo === 'function') {
      onEditPo(po);
      return;
    }
    openModal(
      <PurchaseOrderForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialData={po}
        onClose={() => openModal(null)}
      />
    );
  };

  const cancelPo = async (po) => {
    const ok = await confirmDialog({
      title: `Cancel ${po?.number || 'this order'}?`,
      message: 'The order stays on record as cancelled and can no longer be billed.',
      confirmLabel: 'Yes, cancel it',
    });
    if (!ok) return;
    setDb((prev) => ({
      ...prev,
      purchaseOrders: (prev.purchaseOrders || []).map((x) =>
        String(x.id) === String(po.id) ? { ...x, status: 'Cancelled', cancelledAt: new Date().toISOString() } : x
      ),
    }));
    notify.success(`${po?.number || 'Purchase order'} cancelled.`);
  };

  const deletePo = async (po) => {
    const ok = await confirmDialog({
      title: `Delete ${po?.number || 'this order'}?`,
      message: 'It goes for good. Cancel it instead if you need the paper trail.',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setDb((prev) => ({
      ...prev,
      purchaseOrders: (prev.purchaseOrders || []).filter((x) => String(x.id) !== String(po.id)),
    }));
    notify.success(`${po?.number || 'Purchase order'} deleted.`);
  };

  const warehouseById = React.useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return new Map(list.map((w) => [String(w?.id), w]));
  }, [warehouses]);

  const poPeriod = usePeriodFilter();
  const poSearch = useListSearch(
    db.purchaseOrders.filter((po) => po.companyId === currentCompany.id),
    ['number', 'vendorName', 'date', 'status'],
    'purchaseOrders'
  );
  const poFilters = useColumnFilters();

  // What is hiding rows right now, in the user's words.
  const poFilterChips = React.useMemo(() => {
    const chips = [];
    if (String(poSearch.query || '').trim()) {
      chips.push({ label: 'Search', value: String(poSearch.query).trim(), onRemove: () => poSearch.setQuery('') });
    }
    for (const [key, f] of Object.entries(poFilters.filters || {})) {
      const shown = Array.isArray(f?.values) ? f.values.filter(Boolean).join(', ') : String(f?.value || '');
      chips.push({ label: key, value: shown || 'set', onRemove: () => poFilters.clearColumn(key) });
    }
    return chips;
  }, [poSearch, poFilters]);
  const purchaseOrders = poFilters.applyFilters(
    poSearch.filtered
      .filter((r) => poPeriod.inRange(r?.date))
      .slice()
      .sort((a, b) => {
        const da = String(a?.date || '');
        const dbb = String(b?.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b?.id || 0) - Number(a?.id || 0);
      }),
    {
      number: (r) => r.number,
      vendor: (r) => r.vendorName,
      warehouse: (r) => warehouseById.get(String(r?.warehouseId || ''))?.name || '',
      date: (r) => r.date,
      amount: (r) => r.total,
      status: (r) => poStatusOf(r),
    }
  );

  // Over the filtered set, so the figure always describes what is on screen.
  const poTotals = useMemo(() => {
    let ordered = 0;
    for (const po of purchaseOrders) ordered += Number(po.total || 0);
    return [{ label: 'Ordered', value: formatMoney(ordered, currentCompany) }];
  }, [purchaseOrders, currentCompany]);


  const [poStatus, setPoStatus] = useState('');
  const PO_STATUS_TABS = [
    { value: '', label: 'All', tone: 'all' },
    { value: 'Pending', label: 'Awaiting the goods', tone: 'outstanding' },
    { value: 'Closed', label: 'Billed', tone: 'paid' },
    { value: 'Cancelled', label: 'Cancelled', tone: 'cancelled' },
  ];
  const poShown = poStatus ? purchaseOrders.filter((po) => poStatusOf(po) === poStatus) : purchaseOrders;

  const poStatusCounts = useMemo(() => {
    const counts = { '': purchaseOrders.length };
    for (const po of purchaseOrders) {
      const st = poStatusOf(po);
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
  }, [purchaseOrders, poStatusOf]);

  /*
   * An order is a commitment, not a liability: nothing is owed until the bill
   * arrives. The figure that matters is what has been ordered and not yet
   * billed — goods somebody is still waiting for, money already promised.
   */
  const poHeadline = useMemo(() => {
    let ordered = 0;
    let open = 0;
    let billed = 0;
    let cancelled = 0;
    for (const po of purchaseOrders) {
      const amt = Number(po.total || 0);
      const st = poStatusOf(po);
      if (st === 'Cancelled') {
        cancelled += amt;
        continue;
      }
      ordered += amt;
      if (st === 'Closed') billed += amt;
      else open += amt;
    }
    return { count: purchaseOrders.length, ordered, open, billed, cancelled };
  }, [purchaseOrders, poStatusOf]);

  const poExportColumns = [
    { key: 'number', label: 'PO #' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'date', label: 'Date' },
    { key: 'total', label: 'Amount', value: (r) => Number(r.total || 0) },
    { key: 'status', label: 'Status', value: (r) => poStatusOf(r) },
  ];

  const createPo = () => {
    // A purchase order is entered the same way a bill is: its own page, not a
    // popup, because the two forms hold the same kind of work.
    if (typeof onNewPo === 'function') {
      onNewPo();
      return;
    }
    openModal(<PurchaseOrderForm db={db} setDb={setDb} currentCompany={currentCompany} onClose={() => openModal(null)} />);
  };

  return (
    <DocumentListShell
      title="Purchase Orders"
      description="What you have committed to buy, until the bill arrives against it"
      company={currentCompany}
      search={{
        value: poSearch.query,
        onChange: poSearch.setQuery,
        placeholder: 'Search purchase orders…',
        label: 'Search purchase orders',
      }}
      moreItems={[exportMenuItem('Export purchase orders')]}
      onMoreSelect={(k) => {
        const format = exportFormatFromKey(k);
        if (!format) return;
        runListExport({
          format,
          title: 'Purchase orders',
          fileName: `PurchaseOrders_${currentCompany?.name || 'company'}`,
          label: 'purchase order(s)',
          columns: poExportColumns,
          rows: poShown,
        });
      }}
      primary={
        <button type="button" onClick={createPo} className="ui-btn ui-btn-primary">
          <Plus size={16} aria-hidden="true" /> New PO
        </button>
      }
      cards={[
        { label: 'Total orders', value: poHeadline.count, count: true, tone: 'draft', Icon: ShoppingCart },
        { label: 'Ordered', value: poHeadline.ordered, tone: 'sent', Icon: FileText },
        { label: 'Awaiting the goods', value: poHeadline.open, tone: 'outstanding', Icon: ClipboardList },
        { label: 'Billed', value: poHeadline.billed, tone: 'paid', Icon: Receipt },
        { label: 'Cancelled', value: poHeadline.cancelled, tone: 'cancelled', Icon: Ban },
      ]}
      tabs={PO_STATUS_TABS}
      tabsLabel="Purchase order status"
      statusValue={poStatus}
      statusCounts={poStatusCounts}
      onStatusChange={setPoStatus}
      tip={{
        storageKey: 'neev.tip.purchaseOrders',
        Icon: ShoppingCart,
        text: 'An order closes itself when a bill names it — nothing here has to be ticked off by hand.',
      }}
    >
        <div className="ui-table-scroll">
        <table className="ui-table ui-table-wide ui-table-sticky">
          <thead>
            <tr>
              <ColumnHeader label="PO #" col="number" state={poFilters} />
              <ColumnHeader label="Vendor" col="vendor" state={poFilters} />
              <ColumnHeader label="Date" col="date" state={poFilters} />
              <ColumnHeader label="Amount" col="amount" state={poFilters} className="ui-num" align="right" />
              <ColumnHeader label="Status" col="status" state={poFilters} />
              <ColumnHeader label="Warehouse" col="warehouse" state={poFilters} />
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="ui-rows">
            {poShown.length === 0 ? (
              <tr>
                <td colSpan="7">
                  {db.purchaseOrders.filter((x) => x.companyId === currentCompany.id).length === 0 ? (
                    <EmptyState
                      icon={ClipboardList}
                      kind="new"
                      title="Nothing ordered yet"
                      description="A purchase order records what you asked a vendor for, so the bill that arrives can be checked against it."
                      routes={[
                        {
                          label: 'Raise one now',
                          description: 'Pick a vendor and list what you are asking for.',
                          onSelect: () => createPo(),
                        },
                        {
                          label: 'From a sales order',
                          description: 'Buy in what a customer has already ordered.',
                          onSelect: () => createPo(),
                        },
                      ]}
                    />
                  ) : (
                    <EmptyState
                      icon={ClipboardList}
                      kind="filtered"
                      totalCount={db.purchaseOrders.filter((x) => x.companyId === currentCompany.id).length}
                      filters={poFilterChips}
                      onClearFilters={() => { poSearch.setQuery(''); poFilters.clearAll(); }}
                    />
                  )}
                </td>
              </tr>
            ) : (
              poShown.map((po) => {
                const whId = String(po?.warehouseId || '').trim();
                const wh = whId ? warehouseById.get(whId) : null;
                const whLabel = wh ? String(wh?.name || `Warehouse ${wh?.id}`) : whId ? `Warehouse ${whId}` : '-';
                const status = poStatusOf(po);
                return (
                  <tr key={po.id} className="ui-hover-sunken">
                    <td className="ui-col-id"><DocumentNumber value={po.number} label="purchase order" /></td>
                    <td className="ui-col-entity">{po.vendorName}</td>
                    <td className="ui-col-date"><DocDate value={po.date} /></td>
                    <td className="ui-col-amount"><MoneyValue value={po.total || 0} company={currentCompany} /></td>
                    <td>
                      <StatusPill status={status} />
                    </td>
                    <td className="ui-col-meta">{whLabel}</td>
                    <td className="relative w-10 text-right">
                      <button
                        type="button"
                        data-po-menu-button={po.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (poMenu?.id === po.id) setPoMenu(null);
                          else openPoMenu(po.id, e.currentTarget);
                        }}
                        className="p-2 rounded-lg ui-hover-sunken"
                        aria-haspopup="menu"
                        aria-label={`Actions for ${po.number}`}
                      >
                        <MoreVertical size={18} />
                      </button>

                      {poMenu?.id === po.id ? createPortal(
                        <div
                          className="fixed z-[120] w-52 ui-surface border ui-border-c rounded-xl shadow-lg overflow-hidden text-left"
                          style={{ left: poMenu.left, top: poMenu.top }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setPoMenu(null);
                              if (status === 'Pending') openEditPo(po);
                            }}
                            disabled={status !== 'Pending'}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                              status === 'Pending' ? 'ui-hover-sunken' : 'ui-subtle cursor-not-allowed'
                            }`}
                          >
                            <Pencil size={15} /> Edit
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPoMenu(null);
                              setPreviewPo(po);
                            }}
                            aria-label={`Print purchase order ${po.number}`}
                            className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 ui-hover-sunken"
                          >
                            <Printer size={15} /> Print
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPoMenu(null);
                              if (status === 'Pending' && onConvertToBill) onConvertToBill(po);
                            }}
                            disabled={status !== 'Pending' || !onConvertToBill}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                              status === 'Pending' && onConvertToBill ? 'ui-hover-sunken' : 'ui-subtle cursor-not-allowed'
                            }`}
                          >
                            <Plus size={15} /> Convert to Bill
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setPoMenu(null);
                              if (status === 'Pending') cancelPo(po);
                            }}
                            disabled={status !== 'Pending'}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                              status === 'Pending' ? 'ui-hover-sunken' : 'ui-subtle cursor-not-allowed'
                            }`}
                          >
                            <X size={15} /> Cancel
                          </button>

                          <div className="border-t ui-border-c" />

                          <button
                            type="button"
                            onClick={() => {
                              setPoMenu(null);
                              if (status !== 'Closed') deletePo(po);
                            }}
                            disabled={status === 'Closed'}
                            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${
                              status === 'Closed' ? 'ui-subtle cursor-not-allowed' : 'ui-hover-sunken text-[rgb(var(--neg))]'
                            }`}
                          >
                            <Trash2 size={15} /> Delete
                          </button>
                        </div>,
                        document.body
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
        <TableTotals
          count={poShown.length}
          totalCount={poSearch.filtered.length}
          noun="purchase orders"
          figures={poTotals}
        />

      {previewPo ? (
        <Modal
          title={`Purchase Order ${previewPo.number || ''}`.trim()}
          maxWidthClass="max-w-5xl"
          onClose={() => setPreviewPo(null)}
        >
          <PrintDownloadFrame
            title={`Purchase Order ${previewPo.number || ''}`.trim()}
            fileBase={previewPo.number || 'purchase-order'}
          >
            <DocumentPrintView
              db={db}
              currentCompany={currentCompany}
              docTitle="PURCHASE ORDER"
              doc={previewPo}
              party={(db.vendors || []).find((v) => String(v.id) === String(previewPo.vendorId)) || null}
              partyLabel="Vendor"
              sideRows={[{ label: 'Status', value: previewPo.status }]}
              footNote="Please quote this order number on your invoice and delivery documents. Goods remain subject to inspection on receipt."
            />
          </PrintDownloadFrame>
        </Modal>
      ) : null}
    </DocumentListShell>
  );
};

export const PurchaseOrderForm = ({
  db,
  setDb,
  currentCompany,
  onClose,
  initialData = null,
  warehouses = [],
  defaultWarehouseId = '',
}) => {
  const formRef = useRef(null);
  const isEditPo = Boolean(initialData?.id);
  const vendors = db.vendors.filter((v) => v.companyId === currentCompany.id);
  const itemsMaster = db.items.filter((i) => i.companyId === currentCompany.id);

  const activeBranchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '').trim();
  const poDocSettings = getDocSettings(db, currentCompany, { branchId: activeBranchId || null });
  const poNumbering = poDocSettings?.numbering?.purchaseOrder;
  const isPoAuto = String(poNumbering?.mode || '').toLowerCase() === 'auto';
  const lockPoNumber = isPoAuto && !poNumbering?.allowManualOverride;
  const generatedPoNumber = nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'purchaseOrder', branchId: activeBranchId || null, takenNumbers: (db.purchaseOrders || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) });

  const customFields = React.useMemo(() => getVisibleCustomFields(currentCompany, 'purchaseOrder'), [currentCompany]);
  const setCustomField = (key, value) =>
    setFormData((p) => ({ ...p, customFields: { ...(p.customFields || {}), [key]: value } }));

  const [formData, setFormData] = useState(() => {
    if (initialData) {
      return {
        number: String(initialData.number || ''),
        date: String(initialData.date || new Date().toISOString().split('T')[0]),
        vendorId: initialData.vendorId ? String(initialData.vendorId) : '',
        warehouseId: String(initialData.warehouseId || defaultWarehouseId || '').trim(),
        items:
          Array.isArray(initialData.items) && initialData.items.length
            ? initialData.items.map((l) => ({
                itemId: String(l?.itemId || ''),
                description: l?.description || '',
                quantity: Number(l?.quantity ?? 1),
                rate: Number(l?.rate ?? 0),
                amount: Number(l?.amount ?? 0),
              }))
            : [{ itemId: '', description: '', quantity: 1, rate: 0, amount: 0 }],
        notes: initialData.notes || '',
      };
    }
    return {
      number: isPoAuto ? nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'purchaseOrder', branchId: activeBranchId || null, takenNumbers: (db.purchaseOrders || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) }) || '' : '',
      date: new Date().toISOString().split('T')[0],
      vendorId: '',
      warehouseId: String(defaultWarehouseId || '').trim(),
      items: [{ itemId: '', description: '', quantity: 1, rate: 0, amount: 0 }],
      notes: '',
    };
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
          next.unit = item.unit || '';
          next.hsnSac = item.hsnSac || '';
          /*
           * The tax rate the order is placed at.
           *
           * A purchase order never asked for one, so converting it to a bill
           * had to guess the rate from the item master — and a rate agreed with
           * the vendor that differs from the master's was simply lost. Stored
           * on the line, the bill uses what was ordered.
           */
          next.gstRate = Number(item.gstRate ?? 0);
        }
      }

      if (field === 'quantity' || field === 'rate' || field === 'itemId' || field === 'discountPct') {
        const qty = Number(next.quantity ?? 1);
        const rate = Number(next.rate ?? 0);
        const pct = Number(next.discountPct ?? 0);
        const gross = (Number.isFinite(qty) ? qty : 1) * (Number.isFinite(rate) ? rate : 0);
        next.amount = round2(gross - (Number.isFinite(pct) && pct > 0 ? gross * (Math.min(pct, 100) / 100) : 0));
      }

      nextItems[index] = next;
      return { ...prev, items: nextItems };
    });
  };

  const subtotal = round2((formData.items || []).reduce((sum, l) => sum + Number(l.amount || 0), 0));

  /*
   * What the vendor will invoice, shown but not stored.
   *
   * A purchase order posts nothing — no ledger entry, no GST return — so its
   * stored value stays the taxable value it has always been. The buyer still
   * needs to see the figure that will arrive on the bill, so the tax is
   * computed from the lines and shown under the total as a memo.
   */
  const poVendor = vendors.find((v) => String(v.id) === String(formData.vendorId)) || null;
  const poTax = computeGstForLines({
    lines: formData.items || [],
    isIntra: isIntraStateSupply({
      companyState: getCompanyGstProfile(currentCompany).state,
      partyState: getPartyGstProfile(poVendor).state,
    }),
  });

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

    if (isEditPo) {
      setDb((prev) => ({
        ...prev,
        purchaseOrders: (prev.purchaseOrders || []).map((x) =>
          String(x.id) === String(initialData.id)
            ? {
                ...x,
                date: formData.date,
                vendorId: formData.vendorId,
                vendorName: getVendorDisplayName(vendorObj),
                warehouseId: String(formData.warehouseId || '').trim(),
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
                customFields: { ...(formData.customFields || {}) },
                updatedAt: new Date().toISOString(),
              }
            : x
        ),
      }));
      onClose?.();
      notify.success(`${formData.number || 'Purchase order'} updated.`);
      return;
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
      warehouseId: String(formData.warehouseId || '').trim(),
      subtotal,
      total: subtotal,
      notes: formData.notes,
      customFields: { ...(formData.customFields || {}) },
      // A raised order is pending until a bill answers it.
      status: 'Pending',
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

  // The shared document contract, so a purchase order behaves like the bill it
  // becomes.
  const onFormKeyDown = useDocumentFormKeys({
    formRef,
    lineCount: formData.items.length,
    addLine: addItem,
    removeLine: removeItem,
  });

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown} className="space-y-6">
      <DocFormActions primaryLabel={isEditPo ? 'Update PO' : 'Create PO'} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="ui-label">PO Number</label>
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
          <label className="ui-label">Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
            className="ui-input w-full"
            required
          />
        </div>

        <WarehouseField
          value={formData.warehouseId}
          onChange={(warehouseId) => setFormData((p) => ({ ...p, warehouseId }))}
          options={Array.isArray(warehouses) ? warehouses : []}
          activeWarehouseId={defaultWarehouseId}
          isEdit={isEditPo}
          required={false}
          className="ui-select w-full ui-surface"
        />
      </div>

      <div>
        <div className="mb-2">
          <label className="ui-label">Line Items</label>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table ui-grid-dense w-full ui-table-wide">
            <thead className="ui-sunken">
              <tr>
                <th className="ui-th text-left w-[26%]">Item</th>
                <th className="ui-th text-left w-[22%]">Description</th>
                <th className="ui-th ui-num w-[8%]">Qty</th>
                <th className="ui-th text-left w-[7%]">Unit</th>
                <th className="ui-th ui-num w-[12%]">Rate (₹)</th>
                <th className="ui-th ui-num w-[8%]">Disc %</th>
                <th className="ui-th ui-num w-[8%]">Tax %</th>
                <th className="ui-th ui-num w-[13%]">Amount (₹)</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, idx) => (
                <tr key={idx} className="border-t" data-line-row={idx}>
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
                      className="ui-input w-full min-w-0 px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} className="ui-input w-full min-w-0 px-2 py-1 text-right" min="1" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={item.unit || ''} onChange={(e) => updateItem(idx, 'unit', e.target.value)} className="ui-input w-full min-w-0 px-2 py-1" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="ui-input w-full min-w-0 px-2 py-1 text-right"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.discountPct ?? 0}
                      onChange={(e) => updateItem(idx, 'discountPct', e.target.value)}
                      className="ui-input w-full min-w-0 px-2 py-1 text-right"
                      min="0"
                      max="100"
                      step="0.01"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.gstRate ?? 0}
                      onChange={(e) => updateItem(idx, 'gstRate', e.target.value)}
                      className="ui-input w-full min-w-0 px-2 py-1 text-right"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="ui-col-amount px-3 py-2 text-right">{formatMoney(item.amount || 0, currentCompany)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={formData.items.length === 1}
                      aria-label={`Remove line ${idx + 1}`}
                      className="ui-btn ui-btn-ghost ui-btn-sm disabled:opacity-40"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={addItem} className="ui-btn ui-btn-secondary">
            <Plus size={15} aria-hidden="true" /> Add Item
          </button>
          <span className="ui-subtle text-xs">or press Tab in the last field of the last row</span>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-2">
            <div className="ui-total-row border-t pt-2">
              <span>Total:</span>
              <span className="ui-money">{formatMoney(subtotal, currentCompany)}</span>
            </div>
            {poTax.gstTotal > 0 ? (
              <div className="ui-caption space-y-1 border-t pt-2">
                <div className="flex justify-between">
                  <span>GST as ordered</span>
                  <span className="ui-money">{formatMoney(poTax.gstTotal, currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Expected bill value</span>
                  <span className="ui-money">{formatMoney(poTax.total, currentCompany)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div>
        <label className="ui-label">Notes</label>
        <textarea value={formData.notes} onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))} className="ui-input w-full" rows={3} />
      </div>

      {hasCustomFieldsAt(customFields, 'header', 'reference', 'notes') ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <DocumentCustomFields fields={customFields} values={formData.customFields} onChange={setCustomField} where="header" />
          <DocumentCustomFields fields={customFields} values={formData.customFields} onChange={setCustomField} where="reference" />
          <DocumentCustomFields fields={customFields} values={formData.customFields} onChange={setCustomField} where="notes" />
        </div>
      ) : null}

      <DocFormFootnote />

      {/* The figure and the line count, kept on screen while the lines are
          typed — the same running total the invoice carries. */}
      <div className="ui-entry-summary">
        <span className="ui-t-label">Total</span>
        <span className="ui-money-lg">{formatMoney(poTax.total ?? subtotal, currentCompany)}</span>
        <span className="ui-caption">
          {formData.items.filter((l) => String(l.itemId || '').trim()).length} line(s)
          {poTax.gstTotal > 0 ? ` · ${formatMoney(poTax.gstTotal, currentCompany)} GST` : ''}
        </span>
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
  onNavigate = null,
  onRaiseDebitNote,
  // Optional override for duplicating a bill. The code below already checked
  // for it but it was never a prop, so the branch was unreachable and a parent
  // could not hook into duplication at all.
  onDuplicateBill,
  onEditBill,
  warehouses = [],
  defaultWarehouseId = '',
}) => {
  const billPeriod = usePeriodFilter();
  const billSearch = useListSearch(
    db.bills.filter((b) => b.companyId === currentCompany.id),
    ['number', 'vendorName', 'refNo', 'date'],
    'bills'
  );
  const bills = billSearch.filtered;
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const colFilters = useColumnFilters();

  // Pinned once per mount: a clock read during render makes every derived
  // age impure and re-renders disagree with each other.
  const [nowMs] = useState(() => Date.now());

  const billFilterChips = React.useMemo(() => {
    const chips = [];
    if (String(billSearch.query || '').trim()) {
      chips.push({ label: 'Search', value: String(billSearch.query).trim(), onRemove: () => billSearch.setQuery('') });
    }
    if (statusFilter && statusFilter !== 'All') {
      chips.push({ label: 'Status', value: statusFilter, onRemove: () => setStatusFilter('All') });
    }
    for (const [key, f] of Object.entries(colFilters.filters || {})) {
      const shown = Array.isArray(f?.values) ? f.values.filter(Boolean).join(', ') : String(f?.value || '');
      chips.push({ label: key, value: shown || 'set', onRemove: () => colFilters.clearColumn(key) });
    }
    return chips;
  }, [billSearch, statusFilter, colFilters]);

  const clearAllBillFilters = () => {
    billSearch.setQuery('');
    setStatusFilter('All');
    colFilters.clearAll();
  };
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  /** Open the bill as the document a vendor would recognise. */
  const openBillDocument = (bill) => {
    if (typeof openModal !== 'function') return;
    openModal(<BillPreview db={db} currentCompany={currentCompany} bill={bill} />, {
      title: `Purchase bill ${bill?.number || ''}`.trim(),
      maxWidthClass: 'max-w-5xl',
    });
  };

  /**
   * Cancelling keeps the number and the paper trail; deleting does not. A bill
   * that has been paid or partly returned is history, so it is cancelled, never
   * removed.
   */
  const cancelBill = async (bill) => {
    const ok = await confirmDialog({
      title: `Cancel ${bill?.number || 'this bill'}?`,
      message: 'The bill stays on record as cancelled, and stops counting towards payables and stock.',
      confirmLabel: 'Yes, cancel it',
    });
    if (!ok) return;
    setDb((prev) => ({
      ...prev,
      bills: (prev.bills || []).map((x) =>
        String(x.id) === String(bill.id) ? { ...x, status: 'Cancelled', cancelledAt: new Date().toISOString() } : x
      ),
    }));
    notify.success(`${bill?.number || 'Bill'} cancelled.`);
  };

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

/** The answer the status word provokes — how late, or how much is left. */
const billStatusReason = (doc, status, company, nowMs) => {
  const s = String(status || '').toLowerCase();
  const total = Number(doc?.total ?? 0);
  const paid = Number(doc?.paidAmount ?? 0);
  if ((s === 'overdue' || s === 'over due') && doc?.dueDate) {
    const due = new Date(`${String(doc.dueDate).slice(0, 10)}T00:00:00`);
    const days = Math.max(0, Math.round((nowMs - due.getTime()) / 86400000));
    return days ? `${days} day${days === 1 ? '' : 's'}` : '';
  }
  if (s === 'partial' && total > 0) return `${formatMoney(paid, company)} of ${formatMoney(total, company)}`;
  if (s === 'unpaid' && doc?.dueDate) {
    const due = new Date(`${String(doc.dueDate).slice(0, 10)}T00:00:00`);
    const days = Math.round((due.getTime() - nowMs) / 86400000);
    if (days >= 0) return `due in ${days} day${days === 1 ? '' : 's'}`;
  }
  return '';
};

  const getDerivedStatus = (bill) => {
    const total = Number(bill?.total ?? 0);
    // Money the vendor was paid, plus value knocked off from debit notes raised
    // on account: both reduce what is still owed on this bill.
    const settled = documentOutstanding(bill, db.debitNotes || []);
    const paid = settled.paid + settled.knocked;

    const raw = String(bill?.status || '').trim();
    if (raw === 'Draft') return 'Draft';
    if (raw === 'Cancelled') return 'Cancelled';
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

  /**
   * The five figures, and the count on every tab. Drafts stay out of the money
   * — a draft bill is an intention, not a liability — but stay in the count.
   */
  const billExportColumns = [
    { key: 'number', label: 'Bill No.' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'date', label: 'Bill Date' },
    { key: 'dueDate', label: 'Due Date' },
    { key: 'total', label: 'Amount', align: 'right', value: (r) => Number(r.total || 0) },
    { key: 'status', label: 'Status', value: (r) => getDerivedStatus(r) },
    { key: 'balance', label: 'Balance', align: 'right', value: (r) => Math.max(0, Number(r.total || 0) - Number(r.paidAmount || 0)) },
  ];

  /*
   * Every filter this page offers EXCEPT the status tab.
   *
   * Split out because the tab counts have to be computed against this set, not
   * against the fully filtered one: counting after the status filter would make
   * every tab except the selected one read zero the moment you picked one.
   */
  const billsExStatus = colFilters.applyFilters(
    bills
      .filter((b) => billPeriod.inRange(b?.date))
      .slice()
      .sort((a, b) => {
        const da = String(a?.date || '');
        const dbb = String(b?.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b?.id || 0) - Number(a?.id || 0);
      }),
    {
      number: (r) => r.number,
      vendor: (r) => r.vendorName,
      warehouse: (r) => warehouseById.get(String(r?.warehouseId || ''))?.name || r?.warehouseId || '',
      date: (r) => r.date,
      refNo: (r) => r.refNo,
      refDate: (r) => r.refDate,
      total: (r) => r.total,
      status: (r) => getDerivedStatus(r),
    }
  );

  /** The rows the table draws: the above, narrowed by the selected status tab. */
  const filteredBills =
    statusFilter === 'All'
      ? billsExStatus
      : billsExStatus.filter((b) => getDerivedStatus(b) === statusFilter);

  /*
   * The five figures across the top, over the rows actually on screen.
   *
   * They used to read the whole book while the table drew the filtered set, so
   * narrowing to one vendor or one month left the cards describing the year —
   * two different sets of data on one screen with nothing saying so.
   */
  const billHeadline = useMemo(() => {
    const live = filteredBills.filter((b) => String(b.status || '').toLowerCase() !== 'draft');
    const bal = (b) => Math.max(0, Number(b.total || 0) - Number(b.paidAmount || 0));
    const today = new Date().toISOString().slice(0, 10);
    return {
      count: filteredBills.length,
      billed: live.reduce((t, b) => t + Number(b.total || 0), 0),
      paid: live.reduce((t, b) => t + Number(b.paidAmount || 0), 0),
      unpaid: live.reduce((t, b) => t + bal(b), 0),
      overdue: live
        .filter((b) => bal(b) > 0 && String(b.dueDate || '').slice(0, 10) && String(b.dueDate).slice(0, 10) < today)
        .reduce((t, b) => t + bal(b), 0),
    };
  }, [filteredBills]);

  /** Counted over everything the search, period and column filters left standing. */
  const billStatusCounts = useMemo(() => {
    const c = { '': billsExStatus.length };
    for (const b of billsExStatus) {
      const d = getDerivedStatus(b);
      c[d] = (c[d] || 0) + 1;
    }
    return c;
  }, [billsExStatus]);

  // Over the filtered set, so the figure always describes what is on screen.
  const { pageCount: billPageCount, safePage: safeBillPage, pageRows: pagedBills } = usePaged(filteredBills, perPage, page);

  const billTotals = useMemo(() => {
    let booked = 0;
    let owed = 0;
    let gst = 0;
    for (const b of filteredBills) {
      const total = Number(b.total || 0);
      booked += total;
      owed += Math.max(0, total - Number(b.paidAmount || 0));
      gst += Number(b.gstTotal || 0);
    }
    return [
      { label: 'Booked', value: formatMoney(booked, currentCompany) },
      { label: 'Payable', value: formatMoney(owed, currentCompany), tone: owed > 0 ? 'neg' : undefined },
      { label: 'GST', value: formatMoney(gst, currentCompany) },
    ];
  }, [filteredBills, currentCompany]);


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
    <DocumentListShell
      title="Purchase Invoices"
      description="Create, view and manage all your vendor bills"
      company={currentCompany}
      search={{
        value: billSearch.query,
        onChange: (v) => {
          billSearch.setQuery(v);
          setPage(1);
        },
        placeholder: 'Search bills…',
        label: 'Search bills',
      }}
      moreItems={[
        exportMenuItem('Export bills'),
        { key: 'dataImport', label: 'Import bills', Icon: Download },
        { sep: true },
        { key: 'purchaseOrders', label: 'Purchase orders', Icon: ShoppingCart, group: 'Elsewhere in purchases' },
        { key: 'debitNotes', label: 'Purchase returns', Icon: Receipt },
      ]}
      onMoreSelect={(k) => {
        const format = exportFormatFromKey(k);
        if (format) {
          runListExport({
            format,
            title: 'Bills',
            fileName: `Bills_${currentCompany?.name || 'company'}`,
            label: 'bill(s)',
            columns: billExportColumns,
            rows: filteredBills,
          });
          return;
        }
        if (typeof onNavigate === 'function') onNavigate(k);
      }}
      primary={
        <PermissionButton
          permission="PURCHASE::Bills::CREATE"
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
          className="ui-btn ui-btn-primary"
        >
          <Plus size={16} aria-hidden="true" /> New Bill
        </PermissionButton>
      }
      cards={[
        { label: 'Total bills', value: billHeadline.count, count: true, tone: 'draft', Icon: FileText },
        { label: 'Total bill amount', value: billHeadline.billed, tone: 'sent', Icon: Receipt },
        { label: 'Paid amount', value: billHeadline.paid, tone: 'paid', Icon: CreditCard },
        { label: 'Unpaid amount', value: billHeadline.unpaid, tone: 'outstanding', Icon: ClipboardList },
        { label: 'Overdue bills', value: billHeadline.overdue, tone: 'overdue', Icon: Ban },
      ]}
      tabs={[
        { value: 'All', label: 'All', tone: 'all' },
        { value: 'Draft', label: 'Draft', tone: 'draft' },
        { value: 'Unpaid', label: 'Received', tone: 'sent' },
        { value: 'Partial', label: 'Partially paid', tone: 'partial' },
        { value: 'Paid', label: 'Paid', tone: 'paid' },
        { value: 'Over due', label: 'Overdue', tone: 'overdue' },
        { value: 'Cancelled', label: 'Cancelled', tone: 'cancelled' },
      ]}
      tabsLabel="Bill status"
      statusValue={statusFilter}
      statusCounts={{ ...billStatusCounts, All: billsExStatus.length }}
      onStatusChange={(v) => {
        setStatusFilter(v);
        setPage(1);
      }}
      tip={{
        storageKey: 'neev:tip:recurringBills',
        Icon: RefreshCw,
        text: 'Bills that repeat every month — rent, AMC, subscriptions — can be scheduled rather than retyped.',
        actionLabel: 'Set one up',
        onAction: () => {
          if (typeof onNavigate === 'function') onNavigate('recurringInvoices');
        },
      }}
    >
        <div className="ui-table-scroll">
        <table className="ui-table ui-table-wide ui-table-sticky">
          <thead>
            <tr>
              <ColumnHeader label="Bill #" col="number" state={colFilters} />
              <ColumnHeader label="Vendor" col="vendor" state={colFilters} />
              <ColumnHeader label="Date" col="date" state={colFilters} />
              <ColumnHeader label="Ref No" col="refNo" state={colFilters} />
              <ColumnHeader label="Ref Date" col="refDate" state={colFilters} />
              <ColumnHeader label="Amount" col="total" state={colFilters} className="ui-num" align="right" />
              <ColumnHeader label="Status" col="status" state={colFilters} />
              <ColumnHeader label="Warehouse" col="warehouse" state={colFilters} />
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="ui-rows">
            {filteredBills.length === 0 ? (
              <tr>
                <td colSpan="9">
                  {db.bills.filter((x) => x.companyId === currentCompany.id).length === 0 ? (
                    <EmptyState
                      icon={FileStack}
                      kind="new"
                      title="No bills yet"
                      description="A vendor bill is what you owe and the input GST you can claim against it."
                      action={
                        <button type="button" onClick={() => onNewBill?.()} className="ui-btn ui-btn-primary">
                          + New Bill
                        </button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={FileStack}
                      kind="filtered"
                      totalCount={db.bills.filter((x) => x.companyId === currentCompany.id).length}
                      filters={billFilterChips}
                      onClearFilters={clearAllBillFilters}
                    />
                  )}
                </td>
              </tr>
            ) : (
              pagedBills.map((b) => {
                const whId = String(b?.warehouseId || '').trim();
                const wh = whId ? warehouseById.get(whId) : null;
                const whLabel = wh ? String(wh?.name || `Warehouse ${wh?.id}`) : whId ? `Warehouse ${whId}` : '-';
                const derived = getDerivedStatus(b);
                const returnMark = returnStatusLabel(b, db.debitNotes || [], 'originalBillId');
                // What the vendor has been debited against this bill, so the
                // list says how much of it is under dispute, not merely that
                // some of it is.
                const debitValue = (db.debitNotes || [])
                  .filter((dn) => String(dn?.originalBillId ?? '') === String(b.id))
                  .filter((dn) => String(dn?.status || '').toLowerCase() !== 'cancelled')
                  .reduce((t, dn) => t + (Number(dn.total) || 0), 0);
                return (
                  <tr
                    key={b.id}
                    className="ui-hover-sunken cursor-pointer"
                    onClick={() => openBillDocument(b)}
                    title="Open this bill as a document"
                  >
                    <td className="ui-col-id"><DocumentNumber value={b.number} label="bill" /></td>
                    <td className="ui-col-entity">{b.vendorName}</td>
                    <td className="ui-col-date"><DocDate value={b.date} /></td>
                    <td className="ui-col-meta">{b.refNo || '-'}</td>
                    <td className="ui-col-date"><DocDate value={b.refDate || '-'} /></td>
                    <td className="ui-col-amount"><MoneyValue value={b.total || 0} company={currentCompany} /></td>
                    <td>
                      <StatusPill status={derived} reason={billStatusReason(b, derived, currentCompany, nowMs)} />
                      {returnMark ? (
                        <span
                          className="ml-1 px-2 py-1 rounded-full text-xs font-medium bg-[rgb(var(--warn-soft))] text-[rgb(var(--warn-ink))]"
                          title={`Debit notes of ${formatMoney(debitValue, currentCompany)} raised against this bill`}
                        >
                          Debit Note {formatMoney(debitValue, currentCompany)}
                        </span>
                      ) : null}
                    </td>
                    <td className="ui-col-meta">{whLabel}</td>
                    <td
                      className="relative w-10"
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
        <TableTotals
          count={filteredBills.length}
          totalCount={bills.length}
          noun="bills"
          figures={billTotals}
        />

        <Pagination
          total={filteredBills.length}
          page={safeBillPage}
          perPage={perPage}
          pageCount={billPageCount}
          onPage={setPage}
          onPerPage={(n) => {
            setPerPage(n);
            setPage(1);
          }}
          noun="bills"
        />

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
                    openBillDocument(bill);
                  }}
                  className="w-full px-4 py-2 text-left ui-hover-sunken flex items-center gap-2"
                >
                  <Eye size={16} /> View / Print
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    if (derived !== 'Cancelled') onEditBill?.(bill);
                  }}
                  disabled={derived === 'Cancelled'}
                  className={`w-full px-4 py-2 text-left flex items-center gap-2 ${
                    derived === 'Cancelled' ? 'ui-subtle cursor-not-allowed' : 'ui-hover-sunken ui-fg'
                  }`}
                >
                  <Pencil size={16} /> Edit
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
                    if (derived !== 'Cancelled') cancelBill(bill);
                  }}
                  disabled={derived === 'Cancelled'}
                  className={`w-full px-4 py-2 text-left flex items-center gap-2 ${
                    derived === 'Cancelled' ? 'ui-subtle cursor-not-allowed' : 'ui-hover-sunken ui-fg'
                  }`}
                >
                  <X size={16} /> Cancel
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
    </DocumentListShell>
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
  const formRef = useRef(null);
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
  const generatedDebitNumberInit = nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'debitNote', branchId: initBranchId || null, takenNumbers: (db.debitNotes || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) });

  const warehouseOptions = React.useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return list.slice().sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, [warehouses]);

  const customFields = React.useMemo(() => getVisibleCustomFields(currentCompany, 'debitNote'), [currentCompany]);
  const setCustomField = (key, value) =>
    setFormData((p) => ({ ...p, customFields: { ...(p.customFields || {}), [key]: value } }));

  const [formData, setFormData] = useState(() => {
    const today = new Date().toISOString().split('T')[0];

    const base = {
      number: isDebitAutoInit ? generatedDebitNumberInit || '' : '',
      date: today,
      originalBillId: '',
      vendorId: '',
      warehouseId: String(defaultWarehouseId || '').trim(),
      customFields: {},
      items: [{ itemId: '', description: '', quantity: 1, rate: 0, gstRate: 0, hsnSac: '', unit: '', discountPct: 0, amount: 0 }],
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

  /**
   * A return that spans several bills cannot honestly name one of them, so it
   * is raised on account: the value sits against the vendor until someone
   * knocks it off. That is a different document, so switching modes clears the
   * single-bill link rather than leaving a half-set one behind.
   */
  const [onAccountMode, setOnAccountMode] = useState(false);
  const billsForVendor = React.useMemo(() => {
    const vendorId = String(formData.vendorId || '').trim();
    if (!vendorId) return [];
    return companyBills
      .filter((b) => String(b.vendorId ?? '') === vendorId)
      .filter((b) => String(b.status || '').toLowerCase() !== 'cancelled')
      .slice()
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [companyBills, formData.vendorId]);

  const toggleOnAccount = (next) => {
    setOnAccountMode(next);
    setFormData((prev) => ({
      ...prev,
      originalBillId: next ? '' : prev.originalBillId,
      billIds: next ? prev.billIds || [] : [],
    }));
  };

  const branchIdForNumbering = resolveBranchIdFromWarehouseId(formData.warehouseId) || null;
  const debitDocSettings = getDocSettings(db, currentCompany, { branchId: branchIdForNumbering });
  const debitNumbering = debitDocSettings?.numbering?.debitNote;
  const isDebitAuto = String(debitNumbering?.mode || '').toLowerCase() === 'auto';
  const lockDebitNumber = isDebitAuto && !debitNumbering?.allowManualOverride;
  const generatedDebitNumber = nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'debitNote', branchId: branchIdForNumbering, takenNumbers: (db.debitNotes || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) });

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

    // Only what has not gone back already — the mirror of the credit note rule.
    const state = returnableLines(bill, db.debitNotes || [], 'originalBillId');

    if (state.fullyReturned) {
      notify.error(`${bill.number} has already been fully returned — there is nothing left to debit.`);
      return;
    }

    const copiedItems = state.open.map((line) => {
      const qty = Number(line.remainingQty) || 0;
      const rate = Number(line.rate ?? 0);
      const itemId = line.itemId !== undefined && line.itemId !== null ? String(line.itemId) : '';
      const master = itemId ? itemsMaster.find((i) => i.id === parseInt(itemId)) : null;
      const gstRate = Number(master?.gstRate ?? line.gstRate ?? 0);
      const hsnSac = master?.hsnSac || line.hsnSac || '';
      return {
        itemId,
        description: master?.name || line.description || '',
        quantity: qty,
        maxQuantity: qty,
        rate: Number.isFinite(rate) ? rate : 0,
        gstRate: Number.isFinite(gstRate) ? gstRate : 0,
        hsnSac,
        amount: qty * (Number.isFinite(rate) ? rate : 0),
      };
    });

    if (state.partlyReturned) {
      notify.info(`${bill.number} was partly returned already — only the quantities still open are shown.`);
    }

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

  const handleSubmit = async (e) => {
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
    if (!onAccountMode && !originalBill) {
      notify.error('Please select the original bill');
      return;
    }
    if (onAccountMode && !(formData.billIds || []).length) {
      notify.error('Tick the bills this return covers.');
      return;
    }

    const originalWarehouseId = String(onAccountMode ? '' : originalBill?.warehouseId || '').trim();
    const selectedWarehouseId = String(formData.warehouseId || '').trim();
    if (!onAccountMode && originalWarehouseId && selectedWarehouseId && originalWarehouseId !== selectedWarehouseId) {
      notify.error('Debit note warehouse must match the original bill warehouse.');
      return;
    }

    if (!formData.vendorId) {
      notify.error('Vendor is required');
      return;
    }

    // Enforced at save as well as in the prefill, since lines can be typed over.
    // A note raised on account answers no single bill, so there is nothing to
    // check it against — its own knock-offs are what keep it honest.
    const returnState = onAccountMode
      ? { fullyReturned: false, lines: [] }
      : returnableLines(originalBill, db.debitNotes || [], 'originalBillId');
    if (returnState.fullyReturned) {
      notify.error(`${originalBill.number} has already been fully returned.`);
      return;
    }
    const remainingByItem = new Map(returnState.lines.map((l) => [String(l.itemId), l.remainingQty]));
    for (const line of onAccountMode ? [] : formData.items || []) {
      const key = String(line.itemId || '');
      if (!key) continue;
      const want = Number(line.quantity) || 0;
      if (want <= 0) continue;
      const canReturn = remainingByItem.get(key);
      if (canReturn === undefined) {
        notify.error(`${line.description || `Item ${key}`} is not on ${originalBill.number}.`);
        return;
      }
      if (want > canReturn + 0.0001) {
        notify.error(
          canReturn <= 0
            ? `${line.description || `Item ${key}`} has already been returned in full.`
            : `Only ${canReturn} of ${line.description || `item ${key}`} is still open to return.`
        );
        return;
      }
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

    // Server first: a debit note reverses a booked liability, so it must
    // reach the books. The local copy mirrors it for the UI.
    let backendDocId = null;
    let serverNumber = '';
    if (hasApiSession()) {
      try {
        const saved = await createDocApi('debitNote', {
          number: debitNumber || undefined,
          date: formData.date,
          againstDocId: originalBill?.backendDocId ? String(originalBill.backendDocId) : null,
          partyId: vendorObj?.backendPartyId ? String(vendorObj.backendPartyId) : null,
          partyName: getVendorDisplayName(vendorObj) || originalBill?.vendorName || '',
          partyGstin: vendorGstin || null,
          placeOfSupplyState: vendorState || null,
          taxType: isIntra ? 'CGST_SGST' : 'IGST',
          subtotal: computed.subtotal,
          cgstTotal: computed.cgstTotal,
          sgstTotal: computed.sgstTotal,
          igstTotal: computed.igstTotal,
          gstTotal: computed.gstTotal,
          total: computed.total,
          status: 'Open',
          items: computed.lines,
        });
        backendDocId = saved?.id || null;
        serverNumber = String(saved?.number || '');
      } catch (err) {
        notify.error(String(err?.message || 'Debit note not saved to the server.'));
        return;
      }
    }

    const newDebitNote = {
      id: db.debitNotes.length + 1,
      companyId: currentCompany.id,
      backendDocId,
      number: serverNumber || debitNumber,
      date: formData.date,
      warehouseId: String(formData.warehouseId || '').trim(),
      originalBillId: onAccountMode ? null : originalBill.id,
      originalBillNumber: onAccountMode ? '' : originalBill.number,
      // On account: the value waits on the vendor's ledger until it is knocked
      // off against their bills.
      settlementMode: onAccountMode ? 'ON_ACCOUNT' : 'DOCUMENT',
      billIds: onAccountMode ? (formData.billIds || []).map(String) : [],
      allocations: [],
      vendorId: formData.vendorId,
      vendorName: getVendorDisplayName(vendorObj) || originalBill?.vendorName || '',
      vendorGstin: vendorGstin,
      placeOfSupplyState: vendorState,
      taxType: isIntra ? 'CGST_SGST' : 'IGST',
      customFields: { ...(formData.customFields || {}) },
      items: computed.lines,
      subtotal: computed.subtotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      gstTotal: computed.gstTotal,
      total: computed.total,
      /**
       * Open, matching what was just sent to the server.
       *
       * The write-through a few lines up posts this same note with
       * status: 'Open', while the local record was stamped Draft. The two
       * copies of one document therefore disagreed from the moment it was
       * created — and since every report is computed from the local book,
       * which skips drafts, a purchase return reversed nothing: the vendor
       * was still owed the full amount and the input GST was never given
       * back, with no action anywhere to take the note out of draft.
       */
      status: 'Open',
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

  // The shared document contract, so a debit note answers to the same keys as
  // the bill it corrects.
  const onFormKeyDown = useDocumentFormKeys({
    formRef,
    lineCount: formData.items.length,
    addLine: addItem,
    removeLine: removeItem,
  });

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown} className="space-y-6">
      <DocFormActions primaryLabel={initialData?.id ? 'Update Debit Note' : 'Create Debit Note'} />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="ui-label">Debit Note Number</label>
          <input
            type="text"
            value={formData.number}
            onChange={(e) => setFormData((p) => ({ ...p, number: e.target.value }))}
            className={`w-full px-3 py-2 border rounded-lg ${lockDebitNumber ? 'ui-sunken' : ''}`}
            disabled={lockDebitNumber}
            required
          />
        </div>

        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <label className="ui-label">
              {onAccountMode ? 'Bills this return covers' : 'Original Bill # *'}
            </label>
            <button
              type="button"
              onClick={() => toggleOnAccount(!onAccountMode)}
              className="text-xs underline ui-muted hover:ui-fg"
            >
              {onAccountMode ? 'Against a single bill instead' : 'Goods from several bills?'}
            </button>
          </div>

          {onAccountMode ? (
            <div className="space-y-2">
              <div className="border rounded-lg max-h-40 overflow-y-auto p-2 space-y-1">
                {billsForVendor.length === 0 ? (
                  <div className="text-xs ui-muted px-1">
                    Pick the vendor first — their bills will be listed here.
                  </div>
                ) : (
                  billsForVendor.map((b) => (
                    <label key={b.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="ui-checkbox"
                        checked={(formData.billIds || []).some((id) => String(id) === String(b.id))}
                        onChange={(e) =>
                          setFormData((prev) => {
                            const set = new Set((prev.billIds || []).map(String));
                            if (e.target.checked) set.add(String(b.id));
                            else set.delete(String(b.id));
                            return { ...prev, billIds: [...set] };
                          })
                        }
                      />
                      <span className="truncate">
                        {b.number} · {b.date} · {formatMoney(Number(b.total || 0), currentCompany)}
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="text-xs ui-muted">
                The value goes to the vendor&apos;s ledger as unsettled, and you knock it off against their bills
                later — from the Purchase Returns list.
              </div>
            </div>
          ) : (
            <select value={formData.originalBillId} onChange={(e) => onSelectOriginalBill(e.target.value)} className="ui-select w-full" required>
              <option value="">Select Bill</option>
              {companyBills.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.number}
                </option>
              ))}
            </select>
          )}
        </div>

        <WarehouseField
          value={formData.warehouseId}
          onChange={(warehouseId) => setFormData((p) => ({ ...p, warehouseId }))}
          options={warehouseOptions}
          activeWarehouseId={defaultWarehouseId}
          isEdit={Boolean(initialData)}
          className="ui-select w-full ui-surface"
        />

        <div>
          <label className="ui-label">Debit Note Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
            className="ui-input w-full"
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
            disabled={Boolean(String(formData.originalBillId || '').trim()) && Boolean(String(formData.vendorId || '').trim())}
            disabledHint="Vendor comes from the original bill"
          />
        </div>

        <DocumentCustomFields fields={customFields} values={formData.customFields} onChange={setCustomField} where="header" />
        <DocumentCustomFields fields={customFields} values={formData.customFields} onChange={setCustomField} where="reference" />
      </div>

      <div>
        <div className="mb-2">
          <label className="ui-label">Line Items</label>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table ui-grid-dense w-full ui-table-wide">
            <thead className="ui-sunken">
              <tr>
                <th className="ui-th text-left w-[26%]">Item</th>
                <th className="ui-th text-left w-[22%]">Description</th>
                <th className="ui-th ui-num w-[8%]">Qty</th>
                <th className="ui-th text-left w-[7%]">Unit</th>
                <th className="ui-th ui-num w-[12%]">Rate (₹)</th>
                <th className="ui-th ui-num w-[8%]">Disc %</th>
                <th className="ui-th ui-num w-[8%]">Tax %</th>
                <th className="ui-th ui-num w-[13%]">Amount (₹)</th>
                <th className="px-3 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, idx) => (
                <tr key={idx} className="border-t" data-line-row={idx}>
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
                      className="ui-input w-full min-w-0 px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} className="ui-input w-full min-w-0 px-2 py-1 text-right" min="1" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="text" value={item.unit || ''} onChange={(e) => updateItem(idx, 'unit', e.target.value)} className="ui-input w-full min-w-0 px-2 py-1" />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) => updateItem(idx, 'rate', e.target.value)}
                      className="ui-input w-full min-w-0 px-2 py-1 text-right"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.discountPct ?? 0}
                      onChange={(e) => updateItem(idx, 'discountPct', e.target.value)}
                      className="ui-input w-full min-w-0 px-2 py-1 text-right"
                      min="0"
                      max="100"
                      step="0.01"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      value={item.gstRate ?? 0}
                      onChange={(e) => updateItem(idx, 'gstRate', e.target.value)}
                      className="ui-input w-full min-w-0 px-2 py-1 text-right"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="ui-col-amount px-3 py-2 text-right">{formatMoney((computed.lines[idx]?.lineTotal ?? item.lineTotal) || 0, currentCompany)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={formData.items.length === 1}
                      aria-label={`Remove line ${idx + 1}`}
                      className="ui-btn ui-btn-ghost ui-btn-sm disabled:opacity-40"
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={addItem} className="ui-btn ui-btn-secondary">
            <Plus size={15} aria-hidden="true" /> Add Item
          </button>
          <span className="ui-subtle text-xs">or press Tab in the last field of the last row</span>
        </div>

        <div className="mt-4 flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="ui-money">{formatMoney(computed.subtotal, currentCompany)}</span>
            </div>
            {isIntra ? (
              <>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span className="ui-money">{formatMoney(computed.cgstTotal, currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span className="ui-money">{formatMoney(computed.sgstTotal, currentCompany)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span className="ui-money">{formatMoney(computed.igstTotal, currentCompany)}</span>
              </div>
            )}
            <div className="ui-total-row border-t pt-2">
              <span>Total:</span>
              <span className="ui-money">{formatMoney(computed.total, currentCompany)}</span>
            </div>
          </div>
        </div>
      </div>

      {hasCustomFieldsAt(customFields, 'notes') ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <DocumentCustomFields fields={customFields} values={formData.customFields} onChange={setCustomField} where="notes" />
        </div>
      ) : null}

      <AmountInWordsBand words={amountInWordsInr(computed.total)} />

      <DocFormFootnote />

      <div className="ui-entry-summary">
        <span className="ui-t-label">Total</span>
        <span className="ui-money-lg">{formatMoney(computed.total, currentCompany)}</span>
        <span className="ui-caption">
          {formData.items.filter((l) => String(l.itemId || '').trim()).length} line(s)
          {computed.gstTotal > 0 ? ` · ${formatMoney(computed.gstTotal, currentCompany)} GST` : ''}
        </span>
      </div>
    </form>
  );
};

export const DebitNotesList = ({ db, setDb, openModal, currentCompany, onNewDebitNote, warehouses = [], defaultWarehouseId = '', onNavigate = null }) => {
  const warehouseById = React.useMemo(() => {
    const list = Array.isArray(warehouses) ? warehouses : [];
    return new Map(list.map((w) => [String(w?.id), w]));
  }, [warehouses]);

  const [previewNote, setPreviewNote] = useState(null);

  /** Settle an on-account note against the vendor's open bills. */
  const openKnockOff = (note) => {
    if (typeof openModal !== 'function') return;
    openModal(
      <KnockOffForm
        note={note}
        documents={db.bills || []}
        notes={db.debitNotes || []}
        currentCompany={currentCompany}
        partyKey="vendorId"
        docLabel="bill"
        onCancel={() => openModal(null)}
        onConfirm={async (allocations) => {
          const today = new Date().toISOString().slice(0, 10);
          const stamped = allocations.map((a) => ({ ...a, date: today }));
          const next = [...(note.allocations || []), ...stamped];

          // The books already carry this note; what travels here is which
          // documents its value answers, so a second browser agrees.
          if (note.backendDocId && hasApiSession()) {
            try {
              await saveSettlementApi('debitNote', note.backendDocId, {
                settlementMode: 'ON_ACCOUNT',
                billIds: (note.billIds || []).map(String),
                allocations: next,
              });
            } catch (err) {
              notify.error(String(err?.message || 'Settlement not saved to the server.'));
              return;
            }
          }

          setDb((prev) => ({
            ...prev,
            debitNotes: (prev.debitNotes || []).map((x) =>
              String(x.id) === String(note.id) ? { ...x, allocations: next } : x
            ),
          }));
          openModal(null);
          const total = allocations.reduce((t, a) => t + Number(a.amount || 0), 0);
          notify.success(`${formatMoney(total, currentCompany)} knocked off against ${allocations.length} bill(s).`);
        }}
      />,
      { title: `Knock off ${note?.number || ''}`.trim(), maxWidthClass: 'max-w-3xl' }
    );
  };

  const dnFilters = useColumnFilters();
  const dnPeriod = usePeriodFilter();
  const dnSearch = useListSearch(
    db.debitNotes.filter((dn) => dn.companyId === currentCompany.id),
    ['number', 'vendorName', 'originalBillNumber', 'date'],
    'debitNotes'
  );

  // What is hiding rows right now. An empty list should not say "none yet" to
  // somebody who has simply filtered them all away.
  const dnFilterChips = React.useMemo(() => {
    const chips = [];
    if (String(dnSearch.query || '').trim()) {
      chips.push({ label: 'Search', value: String(dnSearch.query).trim(), onRemove: () => dnSearch.setQuery('') });
    }
    for (const [key, f] of Object.entries(dnFilters.filters || {})) {
      const shown = Array.isArray(f?.values) ? f.values.filter(Boolean).join(', ') : String(f?.value || '');
      chips.push({ label: key, value: shown || 'set', onRemove: () => dnFilters.clearColumn(key) });
    }
    return chips;
  }, [dnSearch, dnFilters]);
  const debitNotes = dnFilters.applyFilters(
    dnSearch.filtered
      .filter((r) => dnPeriod.inRange(r?.date))
      .slice()
      .sort((a, b) => {
        const da = String(a?.date || '');
        const dbb = String(b?.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b?.id || 0) - Number(a?.id || 0);
      }),
    {
      number: (r) => r.number,
      original: (r) => r.originalBillNumber,
      vendor: (r) => r.vendorName,
      warehouse: (r) => warehouseById.get(String(r?.warehouseId || ''))?.name || r?.warehouseId || '',
      date: (r) => r.date,
      amount: (r) => r.total,
      status: (r) => r.status,
    }
  );

  /*
   * A debit note is money the vendor owes back. Like the sales side, the one
   * that matters is on account and unsettled: raised against no particular
   * bill and not yet knocked off anything.
   */
  const [dnStatus, setDnStatus] = useState('');
  const dnStatusOf = (dn) => {
    const st = String(dn?.status || 'Draft');
    if (st === 'Draft' || st === 'Cancelled') return st;
    if (isOnAccount(dn)) return noteBalance(dn).unsettled > 0.0001 ? 'On account' : 'Settled';
    return 'Open';
  };
  const DN_STATUS_TABS = [
    { value: '', label: 'All', tone: 'all' },
    { value: 'Draft', label: 'Draft', tone: 'draft' },
    { value: 'Open', label: 'Issued', tone: 'sent' },
    { value: 'On account', label: 'On account', tone: 'outstanding' },
    { value: 'Settled', label: 'Settled', tone: 'paid' },
  ];
  const dnShown = dnStatus ? debitNotes.filter((dn) => dnStatusOf(dn) === dnStatus) : debitNotes;

  const dnStatusCounts = useMemo(() => {
    const counts = { '': debitNotes.length };
    for (const dn of debitNotes) {
      const st = dnStatusOf(dn);
      counts[st] = (counts[st] || 0) + 1;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debitNotes]);

  const dnHeadline = useMemo(() => {
    let value = 0;
    let onAccount = 0;
    let drafted = 0;
    let againstBill = 0;
    for (const dn of debitNotes) {
      const amt = Number(dn.total || 0);
      value += amt;
      if (dnStatusOf(dn) === 'Draft') drafted += amt;
      else if (isOnAccount(dn)) onAccount += noteBalance(dn).unsettled;
      else againstBill += amt;
    }
    return { count: debitNotes.length, value, onAccount, drafted, againstBill };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debitNotes]);

  const dnExportColumns = [
    { key: 'number', label: 'Debit note #' },
    { key: 'originalBillNumber', label: 'Original bill' },
    { key: 'vendorName', label: 'Vendor' },
    { key: 'date', label: 'Date' },
    { key: 'total', label: 'Amount', value: (r) => Number(r.total || 0) },
    { key: 'status', label: 'Status', value: (r) => dnStatusOf(r) },
  ];

  const openNewDebitNote = () => {
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
  };

  return (
    <DocumentListShell
      title="Purchase Returns"
      description="A debit note reduces what you owe when goods go back to the vendor"
      company={currentCompany}
      search={{
        value: dnSearch.query,
        onChange: dnSearch.setQuery,
        placeholder: 'Search debit notes…',
        label: 'Search debit notes',
      }}
      moreItems={[
        exportMenuItem('Export debit notes'),
        ...(onNavigate ? [{ key: 'dataImport', label: 'Import purchase returns', Icon: Upload }] : []),
      ]}
      onMoreSelect={(k) => {
        if (k === 'dataImport') {
          onNavigate?.('dataImport', 'DEBIT_NOTE');
          return;
        }
        const format = exportFormatFromKey(k);
        if (!format) return;
        runListExport({
          format,
          title: 'Purchase returns',
          fileName: `DebitNotes_${currentCompany?.name || 'company'}`,
          label: 'debit note(s)',
          columns: dnExportColumns,
          rows: dnShown,
        });
      }}
      primary={
        <button type="button" onClick={openNewDebitNote} className="ui-btn ui-btn-primary">
          <Plus size={16} aria-hidden="true" /> New Debit Note
        </button>
      }
      cards={[
        { label: 'Total debit notes', value: dnHeadline.count, count: true, tone: 'draft', Icon: NotebookPen },
        { label: 'Total returned', value: dnHeadline.value, tone: 'refund', Icon: FileText },
        { label: 'Against bills', value: dnHeadline.againstBill, tone: 'paid', Icon: CreditCard },
        { label: 'On account, unused', value: dnHeadline.onAccount, tone: 'outstanding', Icon: ClipboardList },
        { label: 'Still in draft', value: dnHeadline.drafted, tone: 'cancelled', Icon: Ban },
      ]}
      tabs={DN_STATUS_TABS}
      tabsLabel="Debit note status"
      statusValue={dnStatus}
      statusCounts={dnStatusCounts}
      onStatusChange={setDnStatus}
      tip={{
        storageKey: 'neev.tip.debitNotes',
        Icon: NotebookPen,
        text: 'A debit note on account is money the vendor owes you until it is knocked off a bill — the row says how much is left.',
      }}
    >
      <div className="ui-table-scroll">
        <table className="ui-table ui-table-wide ui-table-sticky">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Debit note #" col="number" state={dnFilters} />
              <ColumnHeader label="Original bill" col="original" state={dnFilters} />
              <ColumnHeader label="Vendor" col="vendor" state={dnFilters} />
              <ColumnHeader label="Date" col="date" state={dnFilters} />
              <ColumnHeader label="Amount" col="amount" state={dnFilters} className="ui-num" align="right" />
              <ColumnHeader label="Status" col="status" state={dnFilters} />
              <ColumnHeader label="Warehouse" col="warehouse" state={dnFilters} />
              <th scope="col" className="ui-num"><span className="sr-only">On account</span></th>
            </tr>
          </thead>
          <tbody className="ui-rows">
            {dnShown.length === 0 ? (
              <tr>
                <td colSpan="8">
                  {dnFilterChips.length === 0 && !dnStatus ? (
                    <EmptyState
                      icon={NotebookPen}
                      kind="new"
                      title="No purchase returns yet"
                      description="A debit note is what the vendor owes you back — goods returned, an overcharge, a discount agreed after the bill."
                      routes={[
                        {
                          label: 'Return against a bill',
                          description: 'Pick the bill, choose the lines going back.',
                          onSelect: () => openNewDebitNote(),
                        },
                        {
                          label: 'Debit on account',
                          description: 'Record what they owe now, knock it off later.',
                          onSelect: () => openNewDebitNote(),
                        },
                      ]}
                    />
                  ) : (
                    <EmptyState
                      icon={NotebookPen}
                      kind="filtered"
                      totalCount={(db.debitNotes || []).filter((d) => d.companyId === currentCompany.id).length}
                      filters={dnFilterChips}
                      onClearFilters={() => {
                        dnSearch.setQuery('');
                        dnFilters.clearAll();
                      }}
                    />
                  )}
                </td>
              </tr>
            ) : (
              dnShown.map((dn) => {
                const whId = String(dn?.warehouseId || '').trim();
                const wh = whId ? warehouseById.get(whId) : null;
                const whLabel = wh ? String(wh?.name || `Warehouse ${wh?.id}`) : whId ? `Warehouse ${whId}` : '-';
                return (
                  <tr key={dn.id} className="ui-hover-sunken">
                    <td className="ui-col-id"><DocumentNumber value={dn.number} label="debit note" /></td>
                    <td className="ui-col-meta">
                      {dn.originalBillNumber || (
                        <span className="ui-muted">
                          {(dn.billIds || []).length ? `${(dn.billIds || []).length} bills · on account` : '—'}
                        </span>
                      )}
                    </td>
                    <td className="ui-col-entity">{dn.vendorName}</td>
                    <td className="ui-col-date"><DocDate value={dn.date} /></td>
                    <td className="ui-col-amount"><MoneyValue value={dn.total || 0} company={currentCompany} kind="refund" /></td>
                    <td>
                      <StatusPill status={dnStatusOf(dn)} />
                    </td>
                    <td className="ui-col-meta">{whLabel}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => setPreviewNote(dn)}
                        aria-label={`Print debit note ${dn.number}`}
                        className="ui-btn ui-btn-secondary ui-btn-sm text-xs mr-2"
                      >
                        <Printer size={13} aria-hidden="true" /> Print
                      </button>
                      {isOnAccount(dn) ? (
                        noteBalance(dn).unsettled > 0.0001 ? (
                          <button
                            type="button"
                            onClick={() => openKnockOff(dn)}
                            className="ui-btn ui-btn-secondary ui-btn-sm text-xs"
                            title="Knock this off against the vendor's open bills"
                          >
                            Knock off {formatMoney(noteBalance(dn).unsettled, currentCompany)}
                          </button>
                        ) : (
                          <span className="ui-caption">Settled</span>
                        )
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <TableTotals
          count={dnShown.length}
          totalCount={(db.debitNotes || []).filter((d) => d.companyId === currentCompany.id).length}
          noun="debit notes"
          figures={[
            { label: 'Value', value: formatMoney(dnShown.reduce((t, d) => t + Number(d.total || 0), 0), currentCompany) },
          ]}
        />
      </div>

      {previewNote ? (
        <Modal
          title={`Debit Note ${previewNote.number || ''}`.trim()}
          maxWidthClass="max-w-5xl"
          onClose={() => setPreviewNote(null)}
        >
          <PrintDownloadFrame
            title={`Debit Note ${previewNote.number || ''}`.trim()}
            fileBase={previewNote.number || 'debit-note'}
          >
            <DocumentPrintView
              db={db}
              currentCompany={currentCompany}
              docTitle="DEBIT NOTE"
              doc={previewNote}
              party={(db.vendors || []).find((v) => String(v.id) === String(previewNote.vendorId)) || null}
              partyLabel="Vendor"
              metaRows={[{ label: 'Against bill', value: previewNote.originalBillNumber }]}
              sideRows={[
                { label: 'GSTIN', value: previewNote.vendorGstin },
                { label: 'Place of supply', value: previewNote.placeOfSupplyState },
              ]}
              footNote="Debit note under section 34 of the CGST Act. The input tax credit claimed on the original bill is reduced by the tax shown above."
            />
          </PrintDownloadFrame>
        </Modal>
      ) : null}
    </DocumentListShell>
  );
};
