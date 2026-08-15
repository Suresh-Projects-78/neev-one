import { useState } from 'react';
import { getNextNumericId } from '../../utils/ids';
import { round2, formatMoney } from '../../utils/money';

const RecordPaymentForm = ({ db, setDb, currentCompany, voucherType, voucher, onClose }) => {
  const isInvoice = voucherType === 'invoice';
  const title = isInvoice ? 'Record Receipt' : 'Record Payment';

  const total = Number(voucher?.total ?? 0);
  const alreadyPaid = Number(voucher?.paidAmount ?? 0);
  const balance = Math.max(0, round2(total - alreadyPaid));

  const [formData, setFormData] = useState({
    date: new Date().toISOString().slice(0, 10),
    amount: balance,
    mode: 'Cash',
    reference: '',
    notes: '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = Number(formData.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }
    if (amount > balance + 0.0001) {
      alert('Amount cannot be more than balance');
      return;
    }

    const listKey = voucherType === 'invoice' ? 'invoices' : voucherType === 'bill' ? 'bills' : 'expenses';
    const list = Array.isArray(db[listKey]) ? db[listKey] : [];
    const targetId = Number(voucher?.id);
    const target = list.find((d) => Number(d.id) === targetId);
    if (!target) {
      alert('Document not found');
      return;
    }

    const nextPaid = round2(Math.min(total, Number(target.paidAmount ?? 0) + amount));
    const targetStatus = String(target.status || '').trim();
    const nextStatus =
      targetStatus === 'Draft'
        ? 'Draft'
        : total > 0 && nextPaid >= total - 0.0001
          ? 'Paid'
          : nextPaid > 0
            ? 'Partial'
            : 'Unpaid';

    const paymentId = getNextNumericId(db.payments);
    const paymentRecord = {
      id: paymentId,
      companyId: currentCompany.id,
      voucherType,
      voucherId: targetId,
      direction: isInvoice ? 'IN' : 'OUT',
      date: formData.date,
      amount: round2(amount),
      mode: formData.mode,
      reference: formData.reference,
      notes: formData.notes,
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      [listKey]: list.map((d) =>
        Number(d.id) === targetId
          ? {
              ...d,
              paidAmount: nextPaid,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            }
          : d
      ),
      payments: [...(Array.isArray(db.payments) ? db.payments : []), paymentRecord],
    });

    alert(isInvoice ? 'Receipt recorded!' : 'Payment recorded!');
    onClose?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <div className="text-sm text-gray-500">Document</div>
        <div className="font-semibold">{voucher?.number || '-'}</div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm bg-gray-50 border rounded-lg p-3">
        <div>
          <div className="text-gray-500">Total</div>
          <div className="font-semibold">{formatMoney(total, currentCompany)}</div>
        </div>
        <div>
          <div className="text-gray-500">Paid</div>
          <div className="font-semibold">{formatMoney(alreadyPaid, currentCompany)}</div>
        </div>
        <div>
          <div className="text-gray-500">Balance</div>
          <div className="font-semibold">{formatMoney(balance, currentCompany)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Amount</label>
          <input
            type="number"
            value={formData.amount}
            onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
            min="0"
            step="0.01"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Mode</label>
          <select
            value={formData.mode}
            onChange={(e) => setFormData((p) => ({ ...p, mode: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
          >
            <option>Cash</option>
            <option>Bank</option>
            <option>UPI</option>
            <option>Card</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Reference</label>
          <input
            type="text"
            value={formData.reference}
            onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))}
            className="w-full px-3 py-2 border rounded-lg"
            placeholder="Txn / UTR / Cheque no"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
          className="w-full px-3 py-2 border rounded-lg"
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-50">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          {title}
        </button>
      </div>
    </form>
  );
};

export default RecordPaymentForm;
