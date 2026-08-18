import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MoreVertical, Pencil, Trash2 , Link2, CheckCircle2} from 'lucide-react';

import RecordReceiptForm from '../payments/RecordReceiptForm';
import RecordDisbursementForm from '../payments/RecordDisbursementForm';
import { formatMoney, formatMoneyCompact, round2 } from '../../utils/money';
import { StatTile } from '../../components/ui/Primitives';
import { ArrowDownLeft, ArrowUpRight, Landmark, ListTodo } from 'lucide-react';

const safeArray = (v) => (Array.isArray(v) ? v : []);

const parseAmount = (v) => {
  const raw = String(v ?? '').trim();
  if (!raw) return 0;
  const cleaned = raw
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^0-9.\-()]/g, '')
    .trim();

  // Handle (123.45) as negative
  const isParen = cleaned.startsWith('(') && cleaned.endsWith(')');
  const num = Number(isParen ? cleaned.slice(1, -1) : cleaned);
  if (!Number.isFinite(num)) return 0;
  return isParen ? -num : num;
};

const inferDirection = (typeText, signedAmount) => {
  const t = String(typeText || '').trim().toLowerCase();
  if (t) {
    if (t.includes('out') || t.includes('debit') || t === 'dr' || t.includes('payment') || t.includes('withdraw')) return 'OUT';
    if (t.includes('in') || t.includes('credit') || t === 'cr' || t.includes('receipt') || t.includes('deposit')) return 'IN';
  }
  return Number(signedAmount || 0) < 0 ? 'OUT' : 'IN';
};

const toIsoDate = (value) => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};

const normalizeDate = (value) => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // dd-mm-yyyy / dd/mm/yyyy (also accepts mm-dd-yyyy when unambiguous)
  // `/` and `-` need no escaping inside a character class.
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    let y = Number(m[3]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(y)) return '';
    if (y < 100) y += 2000;

    let day = a;
    let month = b;

    // If second part can't be month, treat as mm/dd/yyyy.
    if (a <= 12 && b > 12) {
      day = b;
      month = a;
    }

    const dt = new Date(Date.UTC(y, month - 1, day));
    if (
      Number.isFinite(dt.getTime()) &&
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === month - 1 &&
      dt.getUTCDate() === day
    ) {
      return dt.toISOString().slice(0, 10);
    }
  }

  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
};

const normalizeHeader = (h) =>
  String(h || '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

const parseCsv = (text) => {
  // Minimal CSV parser (supports quoted fields)
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => String(l).trim() !== '');

  if (lines.length === 0) return { headers: [], rows: [] };

  const detectDelimiter = (line) => {
    const s = String(line || '');
    const commas = (s.match(/,/g) || []).length;
    const semis = (s.match(/;/g) || []).length;
    const tabs = (s.match(/\t/g) || []).length;
    if (semis > commas && semis >= tabs) return ';';
    if (tabs > commas && tabs > semis) return '\t';
    return ',';
  };

  const delimiter = detectDelimiter(lines[0]);

  const parseLine = (line) => {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      const nx = line[i + 1];

      if (ch === '"') {
        if (inQuotes && nx === '"') {
          cur += '"';
          i++;
          continue;
        }
        inQuotes = !inQuotes;
        continue;
      }

      if (!inQuotes && ch === delimiter) {
        out.push(cur);
        cur = '';
        continue;
      }

      cur += ch;
    }
    out.push(cur);
    return out;
  };

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
};

const CashBankModule = ({ db, setDb, currentCompany, openModal, openLedgerCreate, openTxnLedgerCreate }) => {
  const companyId = Number(currentCompany?.id || 0);

  const nextNumericId = (list, field = 'id') => {
    return safeArray(list).reduce((m, x) => Math.max(m, Number(x?.[field] || 0)), 0) + 1;
  };

  const getInvoiceBalance = (inv) => {
    const total = Number(inv?.total ?? 0);
    const paid = Number(inv?.paidAmount ?? 0);
    const bal = total - paid;
    return Number.isFinite(bal) ? Math.max(0, round2(bal)) : 0;
  };

  const canCollectAgainstInvoice = (inv) => {
    const rawStatus = String(inv?.status || '').trim();
    if (rawStatus === 'Draft') return false;
    if (rawStatus === 'Cancelled') return false;
    return getInvoiceBalance(inv) > 0.0001;
  };

  const getDocBalance = (doc) => {
    const total = Number(doc?.total ?? 0);
    const paid = Number(doc?.paidAmount ?? 0);
    const bal = total - paid;
    return Number.isFinite(bal) ? Math.max(0, round2(bal)) : 0;
  };

  const canPayDoc = (doc) => {
    const rawStatus = String(doc?.status || '').trim();
    if (rawStatus === 'Draft') return false;
    if (rawStatus === 'Cancelled') return false;
    return getDocBalance(doc) > 0.0001;
  };

  const groupById = useMemo(() => {
    const m = new Map();
    for (const g of safeArray(db.accountGroups).filter((x) => x.companyId === companyId)) {
      m.set(String(g.id), g);
    }
    return m;
  }, [db.accountGroups, companyId]);

  const isUnderNamedRoot = (groupId, rootName) => {
    const rootLowerName = String(rootName || '').trim().toLowerCase();
    if (!rootLowerName) return false;
    if (groupId === null || groupId === undefined || String(groupId) === '') return false;

    let cur = groupById.get(String(groupId || '')) || null;
    const seen = new Set();
    while (cur && !seen.has(String(cur.id))) {
      seen.add(String(cur.id));
      const nm = String(cur.name || '').trim().toLowerCase();
      if (nm === rootLowerName) return true;
      const pid = cur.parentGroupId;
      if (pid === null || pid === undefined || pid === '') return false;
      cur = groupById.get(String(pid)) || null;
    }
    return false;
  };

  const cashBankAccounts = useMemo(() => {
    return safeArray(db.chartOfAccounts)
      .filter((a) => a.companyId === companyId)
      .filter((a) => {
        const gid = a?.groupId;
        return (
          isUnderNamedRoot(gid, 'bank accounts') ||
          isUnderNamedRoot(gid, 'cash-in-hand')
        );
      })
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [db.chartOfAccounts, companyId, groupById]);

  const [selectedAccountId, setSelectedAccountId] = useState(() => {
    const first = cashBankAccounts[0];
    return first?.id ? String(first.id) : '';
  });

  useEffect(() => {
    if (!cashBankAccounts.length) return;
    const exists = cashBankAccounts.some((a) => String(a.id) === String(selectedAccountId));
    if (selectedAccountId && exists) return;
    const first = cashBankAccounts[0];
    if (first?.id) setSelectedAccountId(String(first.id));
  }, [cashBankAccounts, selectedAccountId]);

  const selectedAccount = useMemo(() => {
    return cashBankAccounts.find((a) => String(a.id) === String(selectedAccountId)) || null;
  }, [cashBankAccounts, selectedAccountId]);

  const allTxns = useMemo(() => {
    return safeArray(db.bankTransactions)
      .filter((t) => t.companyId === companyId)
      .filter((t) => (selectedAccountId ? String(t.cashBankAccountId) === String(selectedAccountId) : true))
      .slice()
      .sort((a, b) => {
        const da = String(a.date || '');
        const dbb = String(b.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b.id) - Number(a.id);
      });
  }, [db.bankTransactions, companyId, selectedAccountId]);

  const [view, setView] = useState('uncategorised'); // 'uncategorised' | 'categorised' | 'all'

  const isCategorised = (t) => Boolean(t?.ledgerId);

  const txns = useMemo(() => {
    if (view === 'all') return allTxns;
    if (view === 'categorised') return allTxns.filter((t) => isCategorised(t));
    return allTxns.filter((t) => !isCategorised(t));
  }, [allTxns, view]);

  const uncategorisedCount = useMemo(() => allTxns.filter((t) => !isCategorised(t)).length, [allTxns]);

  // Money through the selected account, for the overview tiles.
  const flow = useMemo(() => {
    let moneyIn = 0;
    let moneyOut = 0;
    for (const t of allTxns) {
      const amt = Number(t.amount ?? 0);
      if (!Number.isFinite(amt)) continue;
      if (t.direction === 'OUT') moneyOut += amt;
      else moneyIn += amt;
    }
    return { moneyIn, moneyOut, net: moneyIn - moneyOut };
  }, [allTxns]);
  const categorisedCount = useMemo(() => allTxns.filter((t) => isCategorised(t)).length, [allTxns]);

  const ledgerById = useMemo(() => {
    const m = new Map();
    for (const a of safeArray(db.chartOfAccounts).filter((x) => x.companyId === companyId)) {
      m.set(String(a.id), a);
    }
    return m;
  }, [db.chartOfAccounts, companyId]);

  const ledgerOptions = useMemo(() => {
    return safeArray(db.chartOfAccounts)
      .filter((a) => a.companyId === companyId)
      .slice()
      .sort((a, b) => {
        const ac = String(a.code || '').trim();
        const bc = String(b.code || '').trim();
        if (ac && bc && ac !== bc) return ac.localeCompare(bc);
        return String(a.name || '').localeCompare(String(b.name || ''));
      })
      .map((a) => ({
        value: String(a.id),
        label: String(a.name || '').trim(),
        code: String(a.code || '').trim(),
        meta: [a.ledgerCategory, a.type, a.subType].filter(Boolean).join(' • '),
      }));
  }, [db.chartOfAccounts, companyId]);

  const customers = useMemo(() => {
    return safeArray(db.customers).filter((c) => c.companyId === companyId);
  }, [db.customers, companyId]);

  const vendors = useMemo(() => {
    return safeArray(db.vendors).filter((v) => v.companyId === companyId);
  }, [db.vendors, companyId]);

  const customerByLedgerId = useMemo(() => {
    const m = new Map();
    for (const c of customers) {
      if (c?.accountId !== undefined && c?.accountId !== null && String(c.accountId) !== '') {
        m.set(String(c.accountId), c);
      }
    }
    return m;
  }, [customers]);

  const vendorByLedgerId = useMemo(() => {
    const m = new Map();
    for (const v of vendors) {
      if (v?.accountId !== undefined && v?.accountId !== null && String(v.accountId) !== '') {
        m.set(String(v.accountId), v);
      }
    }
    return m;
  }, [vendors]);

  const resolvePartyByLedgerId = (ledgerId) => {
    const idStr = String(ledgerId || '').trim();
    if (!idStr) return null;
    const cust = customerByLedgerId.get(idStr) || null;
    if (cust) return { kind: 'customer', partyId: Number(cust.id) };
    const vend = vendorByLedgerId.get(idStr) || null;
    if (vend) return { kind: 'vendor', partyId: Number(vend.id) };
    return null;
  };

  const linkBankTxnToPayment = ({ bankTxnId, ledgerId, paymentId }) => {
    if (!bankTxnId) return;
    setDb((prev) => {
      const list = safeArray(prev.bankTransactions);
      const next = list.map((t) => {
        if (t.companyId !== companyId) return t;
        if (String(t.id) !== String(bankTxnId)) return t;
        return {
          ...t,
          ledgerId: ledgerId !== undefined && ledgerId !== null && String(ledgerId) !== '' ? Number(ledgerId) : t.ledgerId,
          linkedPaymentId: paymentId !== undefined && paymentId !== null && String(paymentId) !== '' ? Number(paymentId) : t.linkedPaymentId,
          updatedAt: new Date().toISOString(),
        };
      });
      return { ...prev, bankTransactions: next };
    });
  };

  const openKnockoff = ({ bankTxn, ledgerId }) => {
    if (!bankTxn) return;
    const party = resolvePartyByLedgerId(ledgerId);
    const dir = String(bankTxn.direction || '').toUpperCase();

    if (party?.kind === 'customer' && dir === 'IN') {
      openModal(
        <RecordReceiptForm
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          hideMode={true}
          initialData={{
            date: bankTxn.date,
            amount: String(bankTxn.amount ?? ''),
            customerId: String(party.partyId),
            mode: 'Bank',
            reference: '',
            notes: String(bankTxn.narration || bankTxn.description || '').trim(),
            cashBankAccountId: bankTxn.cashBankAccountId,
            sourceBankTransactionId: bankTxn.id,
          }}
          onSaved={(receipt) => linkBankTxnToPayment({ bankTxnId: bankTxn.id, ledgerId, paymentId: receipt?.id })}
          onClose={() => openModal(null)}
        />,
        { title: 'Knock-off Invoices / Record Receipt', maxWidthClass: 'max-w-4xl' }
      );
      return;
    }

    if (party?.kind === 'vendor' && dir === 'OUT') {
      openModal(
        <RecordDisbursementForm
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          hideMode={true}
          initialData={{
            date: bankTxn.date,
            amount: String(bankTxn.amount ?? ''),
            vendorId: String(party.partyId),
            mode: 'Bank',
            reference: '',
            notes: String(bankTxn.narration || bankTxn.description || '').trim(),
            cashBankAccountId: bankTxn.cashBankAccountId,
            sourceBankTransactionId: bankTxn.id,
          }}
          onSaved={(payment) => linkBankTxnToPayment({ bankTxnId: bankTxn.id, ledgerId, paymentId: payment?.id })}
          onClose={() => openModal(null)}
        />,
        { title: 'Knock-off Bills / Record Payment', maxWidthClass: 'max-w-5xl' }
      );
      return;
    }

    // Fallback: not a party ledger or direction mismatch.
    setDb((prev) => {
      const list = safeArray(prev.bankTransactions);
      const next = list.map((t) => {
        if (t.companyId !== companyId) return t;
        if (String(t.id) !== String(bankTxn.id)) return t;
        return { ...t, ledgerId: Number(ledgerId), updatedAt: new Date().toISOString() };
      });
      return { ...prev, bankTransactions: next };
    });
  };

  const uploadInputRef = useRef(null);

  const [pendingAddTxnInitial, setPendingAddTxnInitial] = useState(null);

  const openAddTxn = (initial = null) => {
    if (!cashBankAccounts.length) {
      alert('Please create a cash/bank account first.');
      return;
    }

    const effectiveAccount =
      cashBankAccounts.find((a) => String(a.id) === String(initial?.cashBankAccountId || '')) ||
      selectedAccount ||
      cashBankAccounts[0] ||
      null;

    if (!effectiveAccount) {
      alert('Please select a cash/bank account first.');
      return;
    }

    const TxnForm = ({ onClose }) => {
      const isEdit = initial?.editTxnId !== null && initial?.editTxnId !== undefined && String(initial?.editTxnId) !== '';
      const isCategoriseExisting = initial?.bankTxnId !== null && initial?.bankTxnId !== undefined && String(initial?.bankTxnId) !== '';
      const [form, setForm] = useState(() => ({
        cashBankAccountId: String(initial?.cashBankAccountId || effectiveAccount?.id || '').trim(),
        date: String(initial?.date || new Date().toISOString().slice(0, 10)),
        direction: initial?.direction === 'OUT' ? 'OUT' : 'IN',
        ledgerId: String(initial?.ledgerId || '').trim(),
        amount: String(initial?.amount || ''),
        narration: String(initial?.narration || '').trim(),
      }));

      const [knockoffAllocations, setKnockoffAllocations] = useState(() => ({}));

      const selectedLedger = useMemo(() => {
        if (!form.ledgerId) return null;
        return ledgerOptions.find((o) => String(o.value) === String(form.ledgerId)) || null;
      }, [form.ledgerId, ledgerOptions]);

      const knockoffParty = useMemo(() => resolvePartyByLedgerId(form.ledgerId), [form.ledgerId]);

      const knockoffMode = useMemo(() => {
        const dir = String(form.direction || '').toUpperCase();
        if (knockoffParty?.kind === 'customer' && dir === 'IN') return 'customer';
        if (knockoffParty?.kind === 'vendor' && dir === 'OUT') return 'vendor';
        return null;
      }, [form.direction, knockoffParty]);

      const outstandingInvoices = useMemo(() => {
        if (knockoffMode !== 'customer') return [];
        const cid = Number(knockoffParty?.partyId);
        if (!Number.isFinite(cid) || !cid) return [];
        return safeArray(db.invoices)
          .filter((i) => i.companyId === companyId)
          .filter((i) => Number(i.customerId) === cid)
          .filter((i) => canCollectAgainstInvoice(i))
          .slice()
          .sort((a, b) => {
            const da = String(a.date || '');
            const dbb = String(b.date || '');
            if (da !== dbb) return da < dbb ? 1 : -1;
            return Number(b.id) - Number(a.id);
          });
      }, [db.invoices, companyId, knockoffMode, knockoffParty]);

      const outstandingDocs = useMemo(() => {
        if (knockoffMode !== 'vendor') return [];
        const vid = Number(knockoffParty?.partyId);
        if (!Number.isFinite(vid) || !vid) return [];

        const billRows = safeArray(db.bills)
          .filter((b) => b.companyId === companyId)
          .filter((b) => Number(b.vendorId) === vid)
          .filter((b) => canPayDoc(b))
          .map((b) => ({
            key: `bill:${b.id}`,
            voucherType: 'bill',
            id: Number(b.id),
            number: b.number,
            date: b.date,
            balance: getDocBalance(b),
          }));

        const expenseRows = safeArray(db.expenses)
          .filter((e) => e.companyId === companyId)
          .filter((e) => Number(e.vendorId) === vid)
          .filter((e) => canPayDoc(e))
          .map((e) => ({
            key: `expense:${e.id}`,
            voucherType: 'expense',
            id: Number(e.id),
            number: e.number,
            date: e.date,
            balance: getDocBalance(e),
          }));

        return [...billRows, ...expenseRows].sort((a, b) => {
          const da = String(a.date || '');
          const dbb = String(b.date || '');
          if (da !== dbb) return da < dbb ? 1 : -1;
          return Number(b.id) - Number(a.id);
        });
      }, [db.bills, db.expenses, companyId, knockoffMode, knockoffParty]);

      const knockoffComputed = useMemo(() => {
        const raw = Number(form.amount ?? 0);
        const totalAmount = Number.isFinite(raw) ? Math.max(0, raw) : 0;

        let allocated = 0;
        const lines = [];

        if (knockoffMode === 'customer') {
          for (const inv of outstandingInvoices) {
            const key = String(inv.id);
            const row = knockoffAllocations[key];
            if (!row?.selected) continue;
            const want = Number(row?.amount ?? 0);
            const amt = Number.isFinite(want) ? Math.max(0, want) : 0;
            if (amt <= 0) continue;
            const balance = getInvoiceBalance(inv);
            const capped = Math.min(balance, amt);
            if (capped <= 0) continue;
            allocated = round2(allocated + capped);
            lines.push({
              voucherType: 'invoice',
              voucherId: Number(inv.id),
              documentNumber: inv.number,
              amount: round2(capped),
            });
          }
        }

        if (knockoffMode === 'vendor') {
          for (const d of outstandingDocs) {
            const row = knockoffAllocations[d.key];
            if (!row?.selected) continue;
            const want = Number(row?.amount ?? 0);
            const amt = Number.isFinite(want) ? Math.max(0, want) : 0;
            if (amt <= 0) continue;
            const capped = Math.min(d.balance, amt);
            if (capped <= 0) continue;
            allocated = round2(allocated + capped);
            lines.push({
              voucherType: d.voucherType,
              voucherId: Number(d.id),
              documentNumber: d.number,
              amount: round2(capped),
            });
          }
        }

        const advance = round2(Math.max(0, totalAmount - allocated));
        return {
          totalAmount: round2(totalAmount),
          allocated: round2(allocated),
          advance,
          lines,
        };
      }, [form.amount, knockoffAllocations, knockoffMode, outstandingDocs, outstandingInvoices]);

      const toggleKnockoffRow = (key, selected, suggestedAmount) => {
        setKnockoffAllocations((prev) => {
          const next = { ...prev };
          const existing = next[key] || { selected: false, amount: 0 };
          const nextSelected = Boolean(selected);
          let nextAmount = existing.amount;
          if (nextSelected && (!Number(nextAmount) || Number(nextAmount) <= 0)) {
            nextAmount = round2(Number(suggestedAmount ?? 0) || 0);
          }
          next[key] = { ...existing, selected: nextSelected, amount: nextAmount };
          return next;
        });
      };

      const setKnockoffAmount = (key, amount) => {
        setKnockoffAllocations((prev) => {
          const next = { ...prev };
          const existing = next[key] || { selected: true, amount: 0 };
          next[key] = { ...existing, selected: true, amount };
          return next;
        });
      };

      const selectedCashBankAccount = useMemo(() => {
        if (!form.cashBankAccountId) return null;
        return cashBankAccounts.find((a) => String(a.id) === String(form.cashBankAccountId)) || null;
      }, [form.cashBankAccountId, cashBankAccounts]);

      const canCreateLedger = typeof openTxnLedgerCreate === 'function';
      const canCreateCashBank = typeof openLedgerCreate === 'function';

      const openLedgerPicker = () => {
        const snapshot = {
          cashBankAccountId: form.cashBankAccountId,
          date: form.date,
          direction: form.direction,
          ledgerId: form.ledgerId,
          amount: form.amount,
          narration: form.narration,
        };

        const LedgerPicker = () => {
          const [query, setQuery] = useState(() => {
            const seed = String(initial?.ledgerSearch || '').trim();
            if (seed) return seed;
            if (selectedLedger?.label) return String(selectedLedger.label);
            return '';
          });

          const normalized = String(query || '').trim().toLowerCase();
          const filtered = useMemo(() => {
            if (!normalized) return ledgerOptions;
            return ledgerOptions.filter((o) => {
              const hay = `${o.code || ''} ${o.label || ''} ${o.meta || ''}`.toLowerCase();
              return hay.includes(normalized);
            });
          }, [normalized, ledgerOptions]);

          const showCreate = canCreateLedger && Boolean(String(query || '').trim()) && filtered.length === 0;
          const canAttemptCreate = canCreateLedger && Boolean(String(query || '').trim());

          return (
            <div className="space-y-3">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="ui-input w-full px-3 py-2"
                placeholder="Search ledger"
                autoFocus
              />

              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[55vh] overflow-y-auto divide-y">
                  {filtered.length === 0 ? (
                    <div className="px-4 py-10 text-center ui-muted">No results</div>
                  ) : (
                    filtered.map((o) => {
                      const isSelected = String(o.value) === String(snapshot.ledgerId);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => {
                            openModal(null);
                            setPendingAddTxnInitial({
                              ...snapshot,
                              ledgerId: String(o.value),
                              ledgerSearch: String(o.label || '').trim(),
                            });
                          }}
                          className={`w-full px-4 py-3 text-left ui-hover-sunken ${isSelected ? 'ui-sunken' : ''}`}
                        >
                          <div className="font-medium ui-fg">{o.label}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {canCreateLedger ? (
                <button
                  type="button"
                  disabled={!showCreate}
                  onClick={() => {
                    const typed = String(query || '').trim();
                    if (!typed) return;
                    if (!showCreate) return;
                    openTxnLedgerCreate(typed, (created) => {
                      const nextId = created?.id !== null && created?.id !== undefined ? String(created.id) : '';
                      const nextName = String(created?.name || '').trim();
                      setPendingAddTxnInitial({
                        ...snapshot,
                        ledgerId: nextId,
                        ledgerSearch: nextName || typed,
                      });
                    });
                  }}
                  className={`w-full px-4 py-2 rounded-lg ${ showCreate ? 'ui-primary-bg ' : 'ui-sunken ui-muted cursor-not-allowed'
                  }`}
                  title={
                    !canAttemptCreate
                      ? 'Type a ledger name to create'
                      : showCreate
                        ? ''
                        : 'Ledger already exists. Choose from the list.'
                  }
                >
                  Create new ledger
                </button>
              ) : null}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setPendingAddTxnInitial(snapshot);
                    openModal(null);
                  }}
                  className="px-4 py-2 border rounded-lg ui-hover-sunken"
                >
                  Back
                </button>
              </div>
            </div>
          );
        };

        openModal(<LedgerPicker />, { title: 'Select Ledger', maxWidthClass: 'max-w-2xl' });
      };

      const save = (e) => {
        e.preventDefault();

        const cashBankAccountId = String(form.cashBankAccountId || '').trim();
        if (!cashBankAccountId) {
          alert('Cash/Bank account is required');
          return;
        }

        const ledgerId = String(form.ledgerId || '').trim();
        if (!ledgerId) {
          alert('Ledger is required');
          return;
        }

        const amt = parseAmount(form.amount);
        if (!Number.isFinite(amt) || amt <= 0) {
          alert('Amount must be greater than 0');
          return;
        }

        const direction = form.direction === 'OUT' ? 'OUT' : 'IN';

        if (isEdit) {
          setDb((prev) => {
            const list = safeArray(prev.bankTransactions);
            const editId = Number(initial?.editTxnId);
            const next = list.map((t) => {
              if (t.companyId !== companyId) return t;
              if (Number(t.id) !== editId) return t;
              return {
                ...t,
                cashBankAccountId: Number(cashBankAccountId),
                date: form.date,
                direction,
                ledgerId: Number(ledgerId),
                amount: round2(amt),
                narration: String(form.narration || '').trim(),
                description: String(form.narration || '').trim(),
                updatedAt: new Date().toISOString(),
              };
            });
            return { ...prev, bankTransactions: next };
          });

          if (String(form.cashBankAccountId || '').trim() && String(form.cashBankAccountId) !== String(selectedAccountId)) {
            setSelectedAccountId(String(form.cashBankAccountId));
          }
          onClose?.();
          return;
        }

        const party = resolvePartyByLedgerId(ledgerId);
        const shouldKnockoff =
          (party?.kind === 'customer' && direction === 'IN') || (party?.kind === 'vendor' && direction === 'OUT');

        const nowIso = new Date().toISOString();
        const txnId = isCategoriseExisting ? Number(initial?.bankTxnId) : nextNumericId(db.bankTransactions);

        let linkedPaymentId = null;
        let nextInvoices = safeArray(db.invoices);
        let nextBills = safeArray(db.bills);
        let nextExpenses = safeArray(db.expenses);
        let nextPayments = safeArray(db.payments);

        if (shouldKnockoff) {
          const amountNum = round2(amt);
          const paymentId = nextNumericId(db.payments);
          linkedPaymentId = paymentId;

          if (party?.kind === 'customer') {
            const cid = Number(party.partyId);
            const customer = safeArray(db.customers).find((c) => c.companyId === companyId && Number(c.id) === cid) || null;
            const customerName = customer?.name || customer?.displayName || customer?.companyName || customer?.legalName || '';

            // Validate allocations
            for (const line of knockoffComputed.lines.filter((l) => l.voucherType === 'invoice')) {
              const inv = safeArray(db.invoices).find((i) => i.companyId === companyId && Number(i.id) === Number(line.voucherId));
              if (!inv) {
                alert('One of the selected invoices was not found. Please refresh and try again.');
                return;
              }
              if (!canCollectAgainstInvoice(inv)) {
                alert(`Cannot record against invoice ${inv.number || ''} (Draft/Cancelled/No balance).`);
                return;
              }
              const balance = getInvoiceBalance(inv);
              if (Number(line.amount) > balance + 0.0001) {
                alert(`Allocation exceeds outstanding for invoice ${inv.number || ''}.`);
                return;
              }
            }
            if (knockoffComputed.allocated > amountNum + 0.0001) {
              alert('Total allocated cannot be more than receipt amount');
              return;
            }

            const receiptNo = `RCPT-${paymentId}`;
            const receiptRecord = {
              id: paymentId,
              companyId,
              voucherType: 'receipt',
              voucherId: null,
              direction: 'IN',
              cashBankAccountId: Number(cashBankAccountId),
              sourceBankTransactionId: txnId,
              receiptNo,
              date: form.date,
              customerId: cid,
              customerName,
              amount: amountNum,
              allocatedAmount: round2(knockoffComputed.allocated),
              advanceAmount: round2(knockoffComputed.advance),
              allocations: knockoffComputed.lines
                .filter((l) => l.voucherType === 'invoice')
                .map((l) => ({
                  voucherType: 'invoice',
                  voucherId: Number(l.voucherId),
                  documentNumber: l.documentNumber,
                  amount: round2(l.amount),
                })),
              mode: 'Bank',
              reference: '',
              notes: String(form.narration || '').trim(),
              createdAt: nowIso,
            };

            nextInvoices = safeArray(db.invoices).map((inv) => {
              if (inv.companyId !== companyId) return inv;
              const line = receiptRecord.allocations.find((a) => Number(a.voucherId) === Number(inv.id));
              if (!line) return inv;

              const total = Number(inv.total ?? 0);
              const alreadyPaid = Number(inv.paidAmount ?? 0);
              const nextPaid = round2(Math.min(total, alreadyPaid + Number(line.amount ?? 0)));
              const rawStatus = String(inv.status || '').trim();
              const nextStatus =
                rawStatus === 'Draft'
                  ? 'Draft'
                  : total > 0 && nextPaid >= total - 0.0001
                    ? 'Paid'
                    : nextPaid > 0
                      ? 'Partial'
                      : 'Unpaid';
              return { ...inv, paidAmount: nextPaid, status: nextStatus, updatedAt: nowIso };
            });

            nextPayments = [...safeArray(db.payments), receiptRecord];
          }

          if (party?.kind === 'vendor') {
            const vid = Number(party.partyId);
            const vendor = safeArray(db.vendors).find((v) => v.companyId === companyId && Number(v.id) === vid) || null;
            const vendorName = vendor?.name || vendor?.displayName || vendor?.companyName || vendor?.legalName || '';

            if (knockoffComputed.allocated > amountNum + 0.0001) {
              alert('Total allocated cannot be more than payment amount');
              return;
            }

            // Validate allocations
            const billsList = safeArray(db.bills).filter((b) => b.companyId === companyId);
            const expensesList = safeArray(db.expenses).filter((x) => x.companyId === companyId);
            for (const line of knockoffComputed.lines.filter((l) => l.voucherType === 'bill' || l.voucherType === 'expense')) {
              const list = line.voucherType === 'bill' ? billsList : expensesList;
              const doc = list.find((d) => Number(d.id) === Number(line.voucherId));
              if (!doc) {
                alert('One of the selected documents was not found. Please refresh and try again.');
                return;
              }
              if (!canPayDoc(doc)) {
                alert(`Cannot record against ${line.voucherType} ${doc.number || ''} (Draft/Cancelled/No balance).`);
                return;
              }
              const balance = getDocBalance(doc);
              if (Number(line.amount) > balance + 0.0001) {
                alert(`Allocation exceeds outstanding for ${line.voucherType} ${doc.number || ''}.`);
                return;
              }
            }

            const paymentNo = `PAY-${paymentId}`;
            const paymentRecord = {
              id: paymentId,
              companyId,
              voucherType: 'payment',
              voucherId: null,
              direction: 'OUT',
              cashBankAccountId: Number(cashBankAccountId),
              sourceBankTransactionId: txnId,
              paymentNo,
              date: form.date,
              vendorId: vid,
              vendorName,
              amount: amountNum,
              allocatedAmount: round2(knockoffComputed.allocated),
              advanceAmount: round2(knockoffComputed.advance),
              allocations: knockoffComputed.lines
                .filter((l) => l.voucherType === 'bill' || l.voucherType === 'expense')
                .map((l) => ({
                  voucherType: l.voucherType,
                  voucherId: Number(l.voucherId),
                  documentNumber: l.documentNumber,
                  amount: round2(l.amount),
                })),
              mode: 'Bank',
              reference: '',
              notes: String(form.narration || '').trim(),
              createdAt: nowIso,
            };

            nextBills = safeArray(db.bills).map((b) => {
              if (b.companyId !== companyId) return b;
              const line = paymentRecord.allocations.find((a) => a.voucherType === 'bill' && Number(a.voucherId) === Number(b.id));
              if (!line) return b;
              const total = Number(b.total ?? 0);
              const alreadyPaid = Number(b.paidAmount ?? 0);
              const nextPaid = round2(Math.min(total, alreadyPaid + Number(line.amount ?? 0)));
              const rawStatus = String(b.status || '').trim();
              const nextStatus =
                rawStatus === 'Draft'
                  ? 'Draft'
                  : total > 0 && nextPaid >= total - 0.0001
                    ? 'Paid'
                    : nextPaid > 0
                      ? 'Partial'
                      : 'Unpaid';
              return { ...b, paidAmount: nextPaid, status: nextStatus, updatedAt: nowIso };
            });

            nextExpenses = safeArray(db.expenses).map((ex) => {
              if (ex.companyId !== companyId) return ex;
              const line = paymentRecord.allocations.find((a) => a.voucherType === 'expense' && Number(a.voucherId) === Number(ex.id));
              if (!line) return ex;
              const total = Number(ex.total ?? 0);
              const alreadyPaid = Number(ex.paidAmount ?? 0);
              const nextPaid = round2(Math.min(total, alreadyPaid + Number(line.amount ?? 0)));
              const rawStatus = String(ex.status || '').trim();
              const nextStatus =
                rawStatus === 'Draft'
                  ? 'Draft'
                  : total > 0 && nextPaid >= total - 0.0001
                    ? 'Paid'
                    : nextPaid > 0
                      ? 'Partial'
                      : 'Unpaid';
              return { ...ex, paidAmount: nextPaid, status: nextStatus, updatedAt: nowIso };
            });

            nextPayments = [...safeArray(db.payments), paymentRecord];
          }
        }

        const bankTxnRecord = {
          id: txnId,
          companyId,
          cashBankAccountId: Number(cashBankAccountId),
          date: form.date,
          direction,
          ledgerId: Number(ledgerId),
          amount: round2(amt),
          narration: String(form.narration || '').trim(),
          description: String(form.narration || '').trim(),
          reference: '',
          linkedPaymentId: linkedPaymentId !== null ? Number(linkedPaymentId) : null,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        setDb((prev) => {
          const next = { ...prev };
          if (shouldKnockoff) {
            next.invoices = nextInvoices;
            next.bills = nextBills;
            next.expenses = nextExpenses;
            next.payments = nextPayments;
          }

          const list = safeArray(prev.bankTransactions);
          if (isCategoriseExisting) {
            next.bankTransactions = list.map((t) => {
              if (t.companyId !== companyId) return t;
              if (String(t.id) !== String(txnId)) return t;
              return {
                ...t,
                cashBankAccountId: bankTxnRecord.cashBankAccountId,
                date: bankTxnRecord.date,
                direction: bankTxnRecord.direction,
                ledgerId: bankTxnRecord.ledgerId,
                amount: bankTxnRecord.amount,
                narration: bankTxnRecord.narration,
                description: bankTxnRecord.description,
                linkedPaymentId: bankTxnRecord.linkedPaymentId,
                updatedAt: nowIso,
              };
            });
            return next;
          }

          next.bankTransactions = [...list, bankTxnRecord];
          return next;
        });

        if (String(form.cashBankAccountId || '').trim() && String(form.cashBankAccountId) !== String(selectedAccountId)) {
          setSelectedAccountId(String(form.cashBankAccountId));
        }

        onClose?.();
      };

      return (
        <form onSubmit={save} className="space-y-4">
          <div className="text-sm ui-muted">
            Add a bank/cash transaction for{' '}
            <span className="font-semibold">{selectedCashBankAccount?.name || effectiveAccount?.name}</span>.
          </div>

          {!isCategoriseExisting ? (
            <div>
              <div className="flex items-center justify-between gap-2">
                <label className="block text-sm font-medium mb-1">Cash / Bank Account</label>
                {canCreateCashBank ? (
                  <button
                    type="button"
                    onClick={() => {
                      const snapshot = {
                        ...form,
                        ledgerSearch: String(initial?.ledgerSearch || '').trim(),
                      };
                      openLedgerCreate('', (created) => {
                        const nextId = created?.id !== null && created?.id !== undefined ? String(created.id) : '';
                        // Re-open after DB updates so the dropdown includes the new account.
                        setPendingAddTxnInitial({
                          ...snapshot,
                          cashBankAccountId: nextId || snapshot.cashBankAccountId,
                        });
                        if (nextId) setSelectedAccountId(nextId);
                      });
                    }}
                    className="px-3 py-1.5 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm"
                  >
                    New
                  </button>
                ) : null}
              </div>
              <select
                value={form.cashBankAccountId}
                onChange={(e) => setForm((p) => ({ ...p, cashBankAccountId: e.target.value }))}
                className="ui-select w-full px-3 py-2"
                required
              >
                <option value="">Select</option>
                {cashBankAccounts.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {String(a.name || '').trim()}
                  </option>
                ))}
              </select>
              <div className="text-xs ui-muted mt-1">This is where the entry will hit.</div>
            </div>
          ) : (
            <div className="text-sm ui-muted">
              <span className="font-medium">Cash / Bank Account:</span>{' '}
              <span className="font-semibold">{selectedCashBankAccount?.name || effectiveAccount?.name || '-'}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                className="ui-input w-full px-3 py-2"
                required
              />
            </div>
            {!isCategoriseExisting ? (
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={form.direction}
                  onChange={(e) => setForm((p) => ({ ...p, direction: e.target.value }))}
                  className="ui-select w-full px-3 py-2"
                >
                  <option value="IN">Receipt (Money In)</option>
                  <option value="OUT">Payment (Money Out)</option>
                </select>
              </div>
            ) : (
              <div className="text-sm ui-muted flex items-end">
                <div>
                  <div className="text-sm font-medium mb-1">Type</div>
                  <div className="px-3 py-2 border rounded-lg ui-sunken">
                    {form.direction === 'OUT' ? 'Payment (Money Out)' : 'Receipt (Money In)'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <label className="block text-sm font-medium mb-1">Ledger</label>
            </div>

            <button
              type="button"
              onClick={openLedgerPicker}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-left ui-surface ui-hover-sunken"
            >
              <span className={selectedLedger ? 'ui-fg' : 'ui-subtle'}>
                {selectedLedger ? `${selectedLedger.label}` : 'Select Ledger'}
              </span>
              <span className="text-xs ui-muted">Change</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Amount</label>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                className="ui-input w-full px-3 py-2"
                step="0.01"
                required
              />
            </div>
            <div />
          </div>

          {knockoffMode === 'customer' ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Knock-off Invoices</div>
              <div className="grid grid-cols-3 gap-3 text-sm ui-sunken border rounded-lg p-3">
                <div>
                  <div className="ui-muted">Allocated</div>
                  <div className="font-semibold">{formatMoney(knockoffComputed.allocated, currentCompany)}</div>
                </div>
                <div>
                  <div className="ui-muted">Advance</div>
                  <div className="font-semibold">{formatMoney(knockoffComputed.advance, currentCompany)}</div>
                </div>
                <div>
                  <div className="ui-muted">Selected</div>
                  <div className="font-semibold">
                    {Object.values(knockoffAllocations).filter((v) => Boolean(v?.selected)).length}
                  </div>
                </div>
              </div>

              <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
                <table className="ui-table w-full">
                  <thead className="ui-sunken border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase w-12">Sel</th>
                      <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Invoice #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Outstanding</th>
                      <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Allocate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {outstandingInvoices.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center ui-muted">
                          No outstanding invoices. This receipt will be recorded as advance.
                        </td>
                      </tr>
                    ) : (
                      outstandingInvoices.map((inv) => {
                        const key = String(inv.id);
                        const row = knockoffAllocations[key] || { selected: false, amount: 0 };
                        const balance = getInvoiceBalance(inv);

                        const totalAmount = Math.max(0, Number(form.amount ?? 0) || 0);
                        const alreadyAllocated = Object.entries(knockoffAllocations)
                          .filter(([k, v]) => k !== key && v?.selected)
                          .reduce((sum, [, v]) => sum + (Number(v?.amount ?? 0) || 0), 0);
                        const remaining = Math.max(0, totalAmount - alreadyAllocated);
                        const suggested = Math.min(balance, remaining || balance);

                        return (
                          <tr key={key} className="ui-hover-sunken">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={Boolean(row.selected)}
                                onChange={(e) => toggleKnockoffRow(key, e.target.checked, suggested)}
                              />
                            </td>
                            <td className="ui-col-meta px-4 py-3 text-sm">{inv.number || `INV-${inv.id}`}</td>
                            <td className="ui-col-date px-4 py-3 text-sm">{inv.date}</td>
                            <td className="ui-col-amount px-4 py-3 text-sm text-right">{formatMoney(balance, currentCompany)}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <input
                                type="number"
                                className="ui-input w-28 px-2 py-1 text-right"
                                value={row.amount}
                                min="0"
                                step="0.01"
                                onChange={(e) => setKnockoffAmount(key, e.target.value)}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {knockoffMode === 'vendor' ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">Knock-off Bills / Expenses</div>
              <div className="grid grid-cols-3 gap-3 text-sm ui-sunken border rounded-lg p-3">
                <div>
                  <div className="ui-muted">Allocated</div>
                  <div className="font-semibold">{formatMoney(knockoffComputed.allocated, currentCompany)}</div>
                </div>
                <div>
                  <div className="ui-muted">Advance</div>
                  <div className="font-semibold">{formatMoney(knockoffComputed.advance, currentCompany)}</div>
                </div>
                <div>
                  <div className="ui-muted">Selected</div>
                  <div className="font-semibold">
                    {Object.values(knockoffAllocations).filter((v) => Boolean(v?.selected)).length}
                  </div>
                </div>
              </div>

              <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
                <table className="ui-table w-full">
                  <thead className="ui-sunken border-b">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase w-12">Sel</th>
                      <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Doc #</th>
                      <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Outstanding</th>
                      <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Allocate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {outstandingDocs.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-8 text-center ui-muted">
                          No outstanding bills/expenses. This payment will be recorded as advance.
                        </td>
                      </tr>
                    ) : (
                      outstandingDocs.map((d) => {
                        const key = d.key;
                        const row = knockoffAllocations[key] || { selected: false, amount: 0 };

                        const totalAmount = Math.max(0, Number(form.amount ?? 0) || 0);
                        const alreadyAllocated = Object.entries(knockoffAllocations)
                          .filter(([k, v]) => k !== key && v?.selected)
                          .reduce((sum, [, v]) => sum + (Number(v?.amount ?? 0) || 0), 0);
                        const remaining = Math.max(0, totalAmount - alreadyAllocated);
                        const suggested = Math.min(d.balance, remaining || d.balance);

                        return (
                          <tr key={key} className="ui-hover-sunken">
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={Boolean(row.selected)}
                                onChange={(e) => toggleKnockoffRow(key, e.target.checked, suggested)}
                              />
                            </td>
                            <td className="ui-col-meta px-4 py-3 text-sm">{d.number || `${d.voucherType}-${d.id}`}</td>
                            <td className="ui-col-date px-4 py-3 text-sm">{d.date}</td>
                            <td className="ui-col-amount px-4 py-3 text-sm text-right">{formatMoney(d.balance, currentCompany)}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              <input
                                type="number"
                                className="ui-input w-28 px-2 py-1 text-right"
                                value={row.amount}
                                min="0"
                                step="0.01"
                                onChange={(e) => setKnockoffAmount(key, e.target.value)}
                              />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium mb-1">Narration</label>
            <input
              type="text"
              value={form.narration}
              onChange={(e) => setForm((p) => ({ ...p, narration: e.target.value }))}
              className="ui-input w-full px-3 py-2"
              placeholder="Narration"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => onClose?.()} className="px-4 py-2 border rounded-lg ui-hover-sunken">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg ui-primary-bg ">
              {isEdit ? 'Save' : 'Add'}
            </button>
          </div>
        </form>
      );
    };

    const isEdit = initial?.editTxnId !== null && initial?.editTxnId !== undefined && String(initial?.editTxnId) !== '';
    const isCategoriseExisting = initial?.bankTxnId !== null && initial?.bankTxnId !== undefined && String(initial?.bankTxnId) !== '';
    openModal(
      <TxnForm onClose={() => openModal(null)} />,
      {
        title: isEdit ? 'Edit Transaction' : isCategoriseExisting ? 'Categorise Transaction' : 'Add Transaction',
        maxWidthClass: 'max-w-5xl',
      }
    );
  };

  useEffect(() => {
    if (!pendingAddTxnInitial) return;
    // Run after any state/db updates so lists are fresh.
    openAddTxn(pendingAddTxnInitial);
    setPendingAddTxnInitial(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAddTxnInitial, db.chartOfAccounts, db.accountGroups]);

  const onUploadStatement = async (file) => {
    if (!file) return;
    if (!cashBankAccounts.length) {
      alert('No cash/bank accounts found. Please create one first.');
      return;
    }

    try {
      let text = '';
      try {
        text = await file.text();
      } catch {
        alert('Unable to read the statement file.');
        return;
      }

    const { headers, rows } = parseCsv(text);
    if (!headers.length || !rows.length) {
      alert('No rows found in the uploaded file.');
      return;
    }

    const headerMap = new Map(headers.map((h, idx) => [normalizeHeader(h), idx]));
    const pickIdx = (names) => {
      for (const n of names) {
        const idx = headerMap.get(n);
        if (idx !== undefined) return idx;
      }
      return -1;
    };

      const accountIdx = pickIdx([
        'cash / bank account',
        'cash/bank account',
        'cash bank account',
        'bank/cash account',
        'bank account',
        'cash account',
        'account',
        // Backward-compatible with the earlier template naming
        'ledger name',
        'ledger',
      ]);
      const dateIdx = pickIdx(['date', 'txn date', 'transaction date', 'value date']);
      const typeIdx = pickIdx(['type', 'txn type', 'transaction type', 'dr/cr']);
      const paymentIdx = pickIdx(['payment', 'payments', 'paid', 'debit', 'withdrawal', 'dr']);
      const receiptsIdx = pickIdx(['receipts', 'receipt', 'received', 'credit', 'deposit', 'cr']);
      const amountIdx = pickIdx(['amount', 'amt', 'transaction amount']);
      const narrationIdx = pickIdx(['narration', 'description', 'particulars', 'remarks', 'details']);

    if (dateIdx < 0 || (amountIdx < 0 && paymentIdx < 0 && receiptsIdx < 0)) {
      alert(
        `CSV must contain Date and either Amount or Payment/Receipts columns.\nDetected headers: ${headers
          .map((h) => String(h || '').trim())
          .filter(Boolean)
          .join(', ')}`
      );
      return;
    }

      // Duplicate detection (within same cash/bank account)
      const makeFingerprint = ({ cashBankAccountId, date, direction, amount, narration }) => {
        const d = String(date || '').trim();
        const dir = String(direction || '').trim().toUpperCase();
        const amt = round2(Math.abs(Number(amount || 0)));
        const nar = String(narration || '').trim().toLowerCase().replace(/\s+/g, ' ');
        return `${companyId}|${String(cashBankAccountId)}|${d}|${dir}|${amt}|${nar}`;
      };

      const existingFingerprints = new Set(
        safeArray(db.bankTransactions)
          .filter((t) => t.companyId === companyId)
          .map((t) =>
            makeFingerprint({
              cashBankAccountId: Number(t.cashBankAccountId),
              date: toIsoDate(t.date) || String(t.date || '').trim(),
              direction: t.direction,
              amount: t.amount,
              narration: t.narration || t.description || '',
            })
          )
      );

      const incomingFingerprints = new Set();
      const duplicates = [];

      const accountNameToId = new Map(cashBankAccounts.map((a) => [String(a.name || '').trim().toLowerCase(), Number(a.id)]));
      const fallbackAccountId = Number(selectedAccount?.id || cashBankAccounts[0]?.id || 0);
      const unknownAccounts = new Set();
      let firstImportedAccountId = null;

      const newTxns = [];
    for (const r of rows) {
      const date = normalizeDate(r[dateIdx]);
      const typeText = typeIdx >= 0 ? r[typeIdx] : '';
      const narration = narrationIdx >= 0 ? String(r[narrationIdx] || '').trim() : '';
        const accountText = accountIdx >= 0 ? String(r[accountIdx] || '').trim() : '';

        const hasPayRecColumns = paymentIdx >= 0 || receiptsIdx >= 0;
        const paymentRaw = paymentIdx >= 0 ? parseAmount(r[paymentIdx]) : 0;
        const receiptsRaw = receiptsIdx >= 0 ? parseAmount(r[receiptsIdx]) : 0;

        let direction = 'IN';
        let amount = 0;

        if (hasPayRecColumns) {
          // Template-style import: compute net = receipts - payment
          const net = receiptsRaw - paymentRaw;
          if (net > 0.0001) direction = 'IN';
          else if (net < -0.0001) direction = 'OUT';
          amount = round2(Math.abs(net));
        }

        if (!amount || amount <= 0) {
          const rawAmt = amountIdx >= 0 ? r[amountIdx] : '';
          const amtParsed = parseAmount(rawAmt);
          direction = inferDirection(typeText, amtParsed);
          amount = round2(Math.abs(amtParsed));
        }

        if (!amount || amount <= 0) continue;

        const finalDate = date || new Date().toISOString().slice(0, 10);
        let cashBankAccountId = fallbackAccountId;
        if (accountText) {
          const resolved = accountNameToId.get(accountText.toLowerCase()) || 0;
          if (resolved) cashBankAccountId = resolved;
          else unknownAccounts.add(accountText);
        }

        if (!cashBankAccountId) {
          // No account could be inferred.
          continue;
        }

        if (firstImportedAccountId === null) firstImportedAccountId = cashBankAccountId;

        const fp = makeFingerprint({ cashBankAccountId, date: finalDate, direction, amount, narration });
        if (existingFingerprints.has(fp) || incomingFingerprints.has(fp)) {
          duplicates.push({ date: finalDate, direction, amount, narration });
        }
        incomingFingerprints.add(fp);

        newTxns.push({
          date: finalDate,
          direction,
          amount,
          narration,
          cashBankAccountId,
        });
    }

      if (newTxns.length === 0) {
        alert('No valid transactions found to import.');
        return;
      }

    setDb((prev) => {
      const list = safeArray(prev.bankTransactions);
      let nextId = list.reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
      const appended = newTxns.map((t) => ({
        id: nextId++,
        companyId,
          cashBankAccountId: Number(t.cashBankAccountId),
        date: t.date,
        direction: t.direction,
          ledgerId: undefined,
        amount: t.amount,
        narration: t.narration,
        description: t.narration,
          reference: '',
        linkedPaymentId: null,
        createdAt: new Date().toISOString(),
      }));
      return { ...prev, bankTransactions: [...list, ...appended] };
    });

    setView('all');
      if (firstImportedAccountId) setSelectedAccountId(String(firstImportedAccountId));

      if (duplicates.length > 0) {
        const sample = duplicates
          .slice(0, 5)
          .map((d) => `${d.date} ${d.direction} ${formatMoney(Number(d.amount || 0), currentCompany)} ${String(d.narration || '').slice(0, 40)}`)
          .join('\n');
        const unknownMsg =
          unknownAccounts.size > 0
            ? `\n\nWarning: unknown account name(s) skipped: ${Array.from(unknownAccounts).slice(0, 10).join(', ')}${
                unknownAccounts.size > 10 ? ' …' : ''
              }`
            : '';
        alert(
          `Imported ${newTxns.length} transaction(s).\nWarning: detected ${duplicates.length} duplicate(s) (imported anyway).${unknownMsg}\n\nSample duplicates:\n${sample}`
        );
      } else {
        const unknownMsg =
          unknownAccounts.size > 0
            ? `\n\nWarning: unknown account name(s) skipped: ${Array.from(unknownAccounts).slice(0, 10).join(', ')}${
                unknownAccounts.size > 10 ? ' …' : ''
              }`
            : '';
        alert(`Imported ${newTxns.length} transaction(s).${unknownMsg}`);
      }
    } catch (err) {
      // Avoid silent failures when a helper or parse step throws.
      console.error('Upload/import failed', err);
      alert(`Import failed: ${err?.message || String(err)}`);
    }
  };

  const openUpload = () => {
    if (!cashBankAccounts.length) {
      alert('No cash/bank accounts found. Please create one first.');
      return;
    }
    uploadInputRef.current?.click?.();
  };

  const downloadUploadTemplate = () => {
    const header = ['Cash / bank account', 'Date', 'Description', 'Payment', 'Receipts'];
    const today = new Date().toISOString().slice(0, 10);
    const exampleAccount = String(selectedAccount?.name || cashBankAccounts[0]?.name || '');
    const example1 = [exampleAccount, today, 'Sample receipt narration', '', '1000.00'];
    const example2 = [exampleAccount, today, 'Sample payment narration', '750.00', ''];
    const csv = `${header.join(',')}\n${example1.join(',')}\n${example2.join(',')}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cashbank-upload-template.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const linkTxnToPayment = ({ txnId, paymentId }) => {
    setDb((prev) => {
      const list = safeArray(prev.bankTransactions);
      const next = list.map((t) => {
        if (t.companyId !== companyId) return t;
        if (String(t.id) !== String(txnId)) return t;
        return { ...t, linkedPaymentId: Number(paymentId), updatedAt: new Date().toISOString() };
      });
      return { ...prev, bankTransactions: next };
    });
  };

  const openReconcile = (txn) => {
    if (!txn) return;

    const initial = {
      date: toIsoDate(txn.date),
      amount: String(txn.amount ?? ''),
      mode: 'Bank',
      reference: String(txn.reference || '').trim(),
      notes: String(txn.description || '').trim(),
      cashBankAccountId: Number(txn.cashBankAccountId),
      sourceBankTransactionId: Number(txn.id),
    };

    if (txn.direction === 'OUT') {
      openModal(
        <div className="ui-surface rounded-xl border p-4">
          <RecordDisbursementForm
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            initialData={initial}
            onSaved={(rec) => {
              if (rec?.id) linkTxnToPayment({ txnId: txn.id, paymentId: rec.id });
            }}
            onClose={() => openModal(null)}
          />
        </div>,
        { title: 'Reconcile Payment', maxWidthClass: 'max-w-4xl' }
      );
      return;
    }

    openModal(
      <div className="ui-surface rounded-xl border p-4">
        <RecordReceiptForm
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          initialData={initial}
          onSaved={(rec) => {
            if (rec?.id) linkTxnToPayment({ txnId: txn.id, paymentId: rec.id });
          }}
          onClose={() => openModal(null)}
        />
      </div>,
      { title: 'Reconcile Receipt', maxWidthClass: 'max-w-4xl' }
    );
  };

  const openCreateAccount = () => {
    if (typeof openLedgerCreate === 'function') {
      openLedgerCreate();
      return;
    }
    alert('Ledger creation is not available.');
  };

  const accountsEmpty = cashBankAccounts.length === 0;

  const [openActionId, setOpenActionId] = useState(null);

  const [selectedTxnIds, setSelectedTxnIds] = useState(() => new Set());

  useEffect(() => {
    // Drop selections that are not visible anymore (account/view/company changes).
    setSelectedTxnIds((prev) => {
      const visible = new Set(txns.map((t) => String(t.id)));
      const next = new Set();
      for (const id of prev) {
        if (visible.has(String(id))) next.add(String(id));
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId, view, companyId]);

  const allVisibleSelected = useMemo(() => {
    if (!txns.length) return false;
    return txns.every((t) => selectedTxnIds.has(String(t.id)));
  }, [txns, selectedTxnIds]);

  const anySelected = selectedTxnIds.size > 0;

  const toggleSelectTxn = (txnId, checked) => {
    setSelectedTxnIds((prev) => {
      const next = new Set(prev);
      const id = String(txnId);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleSelectAllVisible = (checked) => {
    setSelectedTxnIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const t of txns) next.add(String(t.id));
      } else {
        for (const t of txns) next.delete(String(t.id));
      }
      return next;
    });
  };

  const deleteSelectedTxns = () => {
    if (!selectedTxnIds.size) return;
    const ok = window.confirm(`Delete ${selectedTxnIds.size} selected transaction(s)?`);
    if (!ok) return;
    setDb((prev) => {
      const list = safeArray(prev.bankTransactions);
      const next = list.filter((t) => {
        if (t.companyId !== companyId) return true;
        if (String(t.cashBankAccountId) !== String(selectedAccountId)) return true;
        return !selectedTxnIds.has(String(t.id));
      });
      return { ...prev, bankTransactions: next };
    });
    setSelectedTxnIds(new Set());
    setOpenActionId(null);
  };

  const openCategorise = (txn) => {
    if (!txn) return;
    if (isCategorised(txn)) return;
    openAddTxn({
      bankTxnId: txn.id,
      cashBankAccountId: txn.cashBankAccountId,
      date: txn.date,
      direction: txn.direction,
      ledgerId: '',
      amount: String(txn.amount ?? ''),
      narration: String(txn.narration || txn.description || '').trim(),
      ledgerSearch: '',
    });
  };

  const deleteTxn = (txn) => {
    if (!txn) return;
    const ok = window.confirm('Delete this transaction?');
    if (!ok) return;
    setDb((prev) => {
      const list = safeArray(prev.bankTransactions);
      return { ...prev, bankTransactions: list.filter((t) => !(t.companyId === companyId && String(t.id) === String(txn.id))) };
    });
    setOpenActionId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="ui-title text-lg">Cash & Bank</h3>
          <div className="text-sm ui-muted">Reconcile bank/cash transactions with receipts and payments.</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={deleteSelectedTxns}
            disabled={!anySelected}
            className={`px-4 py-2 rounded-lg border ${ anySelected ? 'ui-surface ui-hover-sunken ui-border-c text-red-600' : 'ui-sunken ui-muted ui-border-c'
            }`}
          >
            Delete Selected
          </button>
          <button
            type="button"
            onClick={openCreateAccount}
            className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            New Account
          </button>
          <button
            type="button"
            onClick={downloadUploadTemplate}
            className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            Download Template
          </button>
          <button
            type="button"
            onClick={openUpload}
            className={`px-4 py-2 rounded-lg border ${ accountsEmpty ? 'ui-sunken ui-muted ui-border-c' : 'ui-surface ui-hover-sunken ui-border-c'
            }`}
          >
            Upload Statement
          </button>
          <button
            type="button"
            onClick={openAddTxn}
            className={`px-4 py-2 rounded-lg ${ accountsEmpty ? 'ui-sunken ui-muted' : 'ui-primary-bg '
            }`}
          >
            Add Transaction
          </button>
        </div>
      </div>

      {allTxns.length > 0 ? (
        <div className="ui-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Money in"
            amount={flow.moneyIn}
            format={(v) => formatMoneyCompact(v, currentCompany)}
            title={formatMoney(flow.moneyIn, currentCompany)}
            hint={selectedAccount ? selectedAccount.name : 'All accounts'}
            tone="pos"
            icon={ArrowDownLeft}
            tint="cash"
          />
          <StatTile
            label="Money out"
            amount={flow.moneyOut}
            format={(v) => formatMoneyCompact(v, currentCompany)}
            title={formatMoney(flow.moneyOut, currentCompany)}
            hint={`${allTxns.length} transaction${allTxns.length === 1 ? '' : 's'}`}
            tone="neg"
            icon={ArrowUpRight}
            tint="cash"
          />
          <StatTile
            label="Net movement"
            amount={flow.net}
            format={(v) => formatMoneyCompact(v, currentCompany)}
            title={formatMoney(flow.net, currentCompany)}
            hint="In less out, this account"
            icon={Landmark}
            tint="cash"
          />
          <StatTile
            label="To categorise"
            value={String(uncategorisedCount)}
            hint={uncategorisedCount ? 'Lines awaiting a ledger' : 'Everything categorised'}
            icon={ListTodo}
            tint="cash"
          />
        </div>
      ) : null}

      <input
        ref={uploadInputRef}
        type="file"
        accept=".csv,text/csv"
        className="ui-input sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0] || null;
          e.target.value = '';
          if (f) onUploadStatement(f);
        }}
      />

      <div className="ui-surface border rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Cash/Bank Account</label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="ui-select w-full px-3 py-2"
            >
              <option value="">Select</option>
              {cashBankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">View</label>
            <select value={view} onChange={(e) => setView(e.target.value)} className="ui-select w-full px-3 py-2">
              <option value="uncategorised">Uncategorised ({uncategorisedCount})</option>
              <option value="categorised">Categorised ({categorisedCount})</option>
              <option value="all">All ({allTxns.length})</option>
            </select>
          </div>
        </div>

        {!selectedAccount ? (
          <div className="text-sm ui-muted">Select an account to see its transactions.</div>
        ) : (
          <div className="border rounded-xl overflow-hidden">
            <table className="ui-table w-full">
              <thead className="ui-sunken border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                      disabled={txns.length === 0}
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Ledger</th>
                  <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Narration</th>
                  <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Payment</th>
                  <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Receipts</th>
                  <th className="px-4 py-3 text-left text-xs font-medium ui-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium ui-muted uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {txns.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm ui-muted">
                      No transactions.
                    </td>
                  </tr>
                ) : (
                  txns.map((t) => {
                    const isOut = t.direction === 'OUT';
                    const categorised = isCategorised(t);
                    const ledger = t.ledgerId ? ledgerById.get(String(t.ledgerId)) : null;
                    const ledgerName = categorised ? (ledger?.name || '-') : 'Uncategorised';
                    return (
                      <tr key={t.id} className="ui-hover-sunken">
                        <td className="px-4 py-3 text-sm">
                          <input
                            type="checkbox"
                            checked={selectedTxnIds.has(String(t.id))}
                            onChange={(e) => toggleSelectTxn(t.id, e.target.checked)}
                          />
                        </td>
                        <td className="ui-col-date px-4 py-3 text-sm">{t.date}</td>
                        <td className="ui-col-meta px-4 py-3 text-sm">{String(t.description || '').trim() || '-'}</td>
                        <td className="ui-col-meta px-4 py-3 text-sm">{ledgerName}</td>
                        <td className="ui-col-meta px-4 py-3 text-sm">{String(t.narration || '').trim() || '-'}</td>
                        <td className="ui-col-amount px-4 py-3 text-sm text-right font-semibold text-red-600">
                          {isOut ? formatMoney(Number(t.amount ?? 0), currentCompany) : '-'}
                        </td>
                        <td className="ui-col-amount px-4 py-3 text-sm text-right font-semibold text-green-700">
                          {isOut ? '-' : formatMoney(Number(t.amount ?? 0), currentCompany)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {categorised ? (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">Categorised</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openCategorise(t)}
                              className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
                            >
                              Uncategorised
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right relative">
                          <button
                            type="button"
                            onClick={() => setOpenActionId((p) => (String(p) === String(t.id) ? null : t.id))}
                            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
                            title="Actions"
                          >
                            <MoreVertical size={18} />
                          </button>

                          {String(openActionId || '') === String(t.id) ? (
                            <div className="absolute right-4 mt-2 w-40 ui-surface border rounded-lg shadow-sm overflow-hidden z-10">
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenActionId(null);
                                  openAddTxn({
                                    editTxnId: t.id,
                                    cashBankAccountId: t.cashBankAccountId,
                                    date: t.date,
                                    direction: t.direction,
                                    ledgerId: t.ledgerId ? String(t.ledgerId) : '',
                                    amount: String(t.amount ?? ''),
                                    narration: String(t.narration || '').trim(),
                                    ledgerSearch: String(ledgerById.get(String(t.ledgerId))?.name || '').trim(),
                                  });
                                }}
                                className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 ui-hover-sunken"
                              >
                                <Pencil size={16} />
                                <span>Edit</span>
                              </button>
                              {/* Both existed as complete implementations with
                                  no way to reach them — the menu offered only
                                  Edit and Delete, so matching a bank line to
                                  its invoices could never actually be done. */}
                              {!t.linkedPaymentId && t.ledgerId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    openKnockoff({ bankTxn: t, ledgerId: t.ledgerId });
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 ui-hover-sunken"
                                >
                                  <Link2 size={16} />
                                  <span>Knock-off invoices</span>
                                </button>
                              ) : null}
                              {!t.linkedPaymentId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenActionId(null);
                                    openReconcile(t);
                                  }}
                                  className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 ui-hover-sunken"
                                >
                                  <CheckCircle2 size={16} />
                                  <span>Reconcile</span>
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => deleteTxn(t)}
                                className="w-full px-4 py-2 text-left text-sm flex items-center gap-2 ui-hover-sunken text-red-600"
                              >
                                <Trash2 size={16} />
                                <span>Delete</span>
                              </button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CashBankModule;
