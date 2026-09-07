import { useMemo, useState, useRef } from 'react';
import { useDocumentFormKeys } from '../../components/ui/useDocumentFormKeys';
import { DocFormActions } from '../../components/DocumentForm';
import { notify } from '../../components/ui/notify';
import { getNextNumericId } from '../../utils/ids';
import { round2, formatMoney } from '../../utils/money';
import { cashPaymentWarning, cashReceiptWarning } from '../../utils/cashLimits';

const RecordPaymentForm = ({ db, setDb, currentCompany, voucherType, voucher, onClose }) => {
  const formRef = useRef(null);
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

  /*
   * Section 40A(3) on the paying side, 269ST on the receiving side. This form
   * does both, so which one applies follows the voucher.
   *
   * 40A(3) warns rather than blocks: Rule 6DD carries exceptions — payments to
   * a bank or to government, places with no banking facility — and only the
   * person entering it knows whether one applies. 269ST has no such escape at
   * the counter and the penalty is the whole amount, so that one stops the save.
   */
  const cashWarning = useMemo(() => {
    if (String(formData.mode || '').toLowerCase() !== 'cash') return null;
    const amount = Number(formData.amount ?? 0);
    if (!(amount > 0)) return null;
    return isInvoice ? cashReceiptWarning({ amount }) : cashPaymentWarning({ amount });
  }, [formData.mode, formData.amount, isInvoice]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = Number(formData.amount ?? 0);
    if (cashWarning?.severity === 'block') {
      notify.error(`${cashWarning.section}: ${cashWarning.message}`);
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      notify.error('Amount must be greater than 0');
      return;
    }
    if (amount > balance + 0.0001) {
      notify.error('Amount cannot be more than balance');
      return;
    }

    const listKey = voucherType === 'invoice' ? 'invoices' : voucherType === 'bill' ? 'bills' : 'expenses';
    const list = Array.isArray(db[listKey]) ? db[listKey] : [];
    const targetId = Number(voucher?.id);
    const target = list.find((d) => Number(d.id) === targetId);
    if (!target) {
      notify.error('Document not found');
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

    notify.success(isInvoice ? 'Receipt recorded!' : 'Payment recorded!');
    onClose?.();
  };

  /*
   * The shared document contract. A payment has no line grid, so this is the
   * part that matters on a settlement screen: Ctrl+S saves, Ctrl+Enter
   * commits, and Enter moves to the next field instead of posting the moment
   * the cursor is in the amount box.
   */
  const onFormKeyDown = useDocumentFormKeys({ formRef });

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown} className="space-y-4">
      {cashWarning ? (
        <div
          role="alert"
          className="rounded-xl border p-3 text-sm"
          style={{
            borderColor: cashWarning.severity === 'block' ? 'rgb(var(--neg))' : 'rgb(var(--warn))',
            backgroundColor:
              cashWarning.severity === 'block' ? 'rgb(var(--neg-soft))' : 'rgb(var(--warn-soft, var(--surface-sunken)))',
            color: 'rgb(var(--fg))',
          }}
        >
          <span className="ui-t-label block mb-0.5">Section {cashWarning.section}</span>
          {cashWarning.message}
        </div>
      ) : null}
      <DocFormActions primaryLabel={title} secondaryLabel="Cancel" onSecondary={onClose} />

      <div>
        <div className="text-sm ui-muted">Document</div>
        <div className="font-medium">{voucher?.number || '-'}</div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm ui-sunken border rounded-lg p-3">
        <div>
          <div className="ui-muted">Total</div>
          <div className="ui-money">{formatMoney(total, currentCompany)}</div>
        </div>
        <div>
          <div className="ui-muted">Paid</div>
          <div className="ui-money">{formatMoney(alreadyPaid, currentCompany)}</div>
        </div>
        <div>
          <div className="ui-muted">Balance</div>
          <div className="ui-money">{formatMoney(balance, currentCompany)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
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
        <div>
          <label className="ui-label">Amount</label>
          <input
            type="number"
            value={formData.amount}
            onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
            className="ui-input w-full"
            min="0"
            step="0.01"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="ui-label">Mode</label>
          <select
            value={formData.mode}
            onChange={(e) => setFormData((p) => ({ ...p, mode: e.target.value }))}
            className="ui-select w-full"
          >
            <option>Cash</option>
            <option>Bank</option>
            <option>UPI</option>
            <option>Card</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className="ui-label">Reference</label>
          <input
            type="text"
            value={formData.reference}
            onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))}
            className="ui-input w-full"
            placeholder="Txn / UTR / Cheque no"
          />
        </div>
      </div>

      <div>
        <label className="ui-label">Notes</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
          className="ui-input w-full"
          rows={3}
        />
      </div>


    </form>
  );
};

export default RecordPaymentForm;
