// Centralized DB initialization + migrations

export const getDefaultDocSettings = () => ({
  numbering: {
    invoice: { mode: 'auto', prefix: 'INV-', suffix: '', nextNumber: 1, allowManualOverride: true },
    estimate: { mode: 'auto', prefix: 'EST-', suffix: '', nextNumber: 1, allowManualOverride: true },
    bill: { mode: 'auto', prefix: 'BILL-', suffix: '', nextNumber: 1, allowManualOverride: true },
    purchaseOrder: { mode: 'auto', prefix: 'PO-', suffix: '', nextNumber: 1, allowManualOverride: true },
    expense: { mode: 'auto', prefix: 'EXP-', suffix: '', nextNumber: 1, allowManualOverride: true },
    creditNote: { mode: 'auto', prefix: 'CN-', suffix: '', nextNumber: 1, allowManualOverride: true },
    debitNote: { mode: 'auto', prefix: 'DN-', suffix: '', nextNumber: 1, allowManualOverride: true },
    journalEntry: { mode: 'auto', prefix: 'JE-', suffix: '', nextNumber: 1, allowManualOverride: true },
  },
  templates: {
    invoice: { templateId: 'classic', accentId: 'blue' },
    estimate: { templateId: 'classic', accentId: 'blue' },
    bill: { templateId: 'classic', accentId: 'indigo' },
    purchaseOrder: { templateId: 'classic', accentId: 'indigo' },
    expense: { templateId: 'minimal', accentId: 'slate' },
    creditNote: { templateId: 'classic', accentId: 'orange' },
    debitNote: { templateId: 'classic', accentId: 'orange' },
    journalEntry: { templateId: 'minimal', accentId: 'slate' },
  },
  migrations: {},
});

export const initDB = () => {
  const defaultDB = {
    companies: [
      {
        id: 1,
        name: 'Demo Company Ltd',
        address: '123 Business St',
        city: 'New York',
        state: '',
        country: 'India',
        taxId: '12-3456789',
        gstRegistration: 'Registered',
        gstin: '',
        currency: 'INR',
        fiscalYearStart: '01-01',
        docSettings: getDefaultDocSettings(),
      },
    ],
    users: [
      {
        id: 1,
        username: 'admin',
        password: 'admin123',
        role: 'admin',
        companyId: 1,
        email: 'admin@demo.com',
      },
    ],
    accountTypes: [
      { id: 1, companyId: 1, main: 'Balance Sheet', accountClass: 'Asset', name: 'Current Assets', isSystem: true },
      { id: 2, companyId: 1, main: 'Balance Sheet', accountClass: 'Asset', name: 'Fixed Assets', isSystem: true },
      { id: 3, companyId: 1, main: 'Balance Sheet', accountClass: 'Liability', name: 'Current Liabilities', isSystem: true },
      { id: 4, companyId: 1, main: 'Balance Sheet', accountClass: 'Liability', name: 'Non Current Liabilities', isSystem: true },
      { id: 5, companyId: 1, main: 'Balance Sheet', accountClass: 'Equity', name: 'Capital & Equity', isSystem: true },
      { id: 6, companyId: 1, main: 'P&L', accountClass: 'Income', name: 'Income', isSystem: true },
      { id: 7, companyId: 1, main: 'P&L', accountClass: 'Expense', name: 'Expenses', isSystem: true },
    ],
    accountGroups: [
      // P&L
      { id: 1, companyId: 1, typeId: 7, name: 'Indirect Expenses', parentGroupId: null, groupCategory: 'Expense', isSystem: true },
      { id: 2, companyId: 1, typeId: 7, name: 'Direct Expenses', parentGroupId: null, groupCategory: 'Expense', isSystem: true },
      { id: 3, companyId: 1, typeId: 6, name: 'Indirect Income', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 4, companyId: 1, typeId: 6, name: 'Direct Income', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 5, companyId: 1, typeId: 6, name: 'Sales Accounts', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 6, companyId: 1, typeId: 7, name: 'Purchase Accounts', parentGroupId: null, groupCategory: 'Expense', isSystem: true },

      // Balance Sheet - Current Assets
      { id: 7, companyId: 1, typeId: 1, name: 'Sundry Debtors', parentGroupId: null, groupCategory: 'Customer', isSystem: true },
      { id: 8, companyId: 1, typeId: 1, name: 'Cash-in-Hand', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 9, companyId: 1, typeId: 1, name: 'Bank Accounts', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 10, companyId: 1, typeId: 1, name: 'Deposits (Asset)', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 11, companyId: 1, typeId: 1, name: 'Loans & Advances (Asset)', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 12, companyId: 1, typeId: 1, name: 'Stock-in-Hand', parentGroupId: null, groupCategory: 'General', isSystem: true },

      // Balance Sheet - Current Liabilities
      { id: 13, companyId: 1, typeId: 3, name: 'Investments', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 14, companyId: 1, typeId: 3, name: 'Sundry Creditors', parentGroupId: null, groupCategory: 'Vendor', isSystem: true },
      { id: 15, companyId: 1, typeId: 3, name: 'Duties & Taxes', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 16, companyId: 1, typeId: 3, name: 'Provisions', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 17, companyId: 1, typeId: 3, name: 'Short term Loans', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 18, companyId: 1, typeId: 3, name: 'Outstanding Expenses', parentGroupId: null, groupCategory: 'General', isSystem: true },

      // Balance Sheet - Non Current Liabilities
      { id: 19, companyId: 1, typeId: 4, name: 'Long term Loans', parentGroupId: null, groupCategory: 'General', isSystem: true },

      // Balance Sheet - Fixed Assets
      { id: 20, companyId: 1, typeId: 2, name: 'Plant & Machinery', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 21, companyId: 1, typeId: 2, name: 'Furniture & Fixtures', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 22, companyId: 1, typeId: 2, name: 'Computers', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 23, companyId: 1, typeId: 2, name: 'Vehicles', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 24, companyId: 1, typeId: 2, name: 'Buildings', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 25, companyId: 1, typeId: 2, name: 'Leasehold Assets', parentGroupId: null, groupCategory: 'General', isSystem: true },

      // Balance Sheet - Capital & Equity
      { id: 26, companyId: 1, typeId: 5, name: 'Capital Accounts', parentGroupId: null, groupCategory: 'General', isSystem: true },
      { id: 27, companyId: 1, typeId: 5, name: 'Reserves & Surplus', parentGroupId: null, groupCategory: 'General', isSystem: true },

      // Primary fallbacks (hidden from new selections)
      { id: 28, companyId: 1, typeId: 1, name: 'Primary', parentGroupId: null, groupCategory: 'General', isSystem: true, isLegacy: true },
      { id: 29, companyId: 1, typeId: 2, name: 'Primary', parentGroupId: null, groupCategory: 'General', isSystem: true, isLegacy: true },
      { id: 30, companyId: 1, typeId: 3, name: 'Primary', parentGroupId: null, groupCategory: 'General', isSystem: true, isLegacy: true },
      { id: 31, companyId: 1, typeId: 4, name: 'Primary', parentGroupId: null, groupCategory: 'General', isSystem: true, isLegacy: true },
      { id: 32, companyId: 1, typeId: 5, name: 'Primary', parentGroupId: null, groupCategory: 'General', isSystem: true, isLegacy: true },
      { id: 33, companyId: 1, typeId: 6, name: 'Primary', parentGroupId: null, groupCategory: 'General', isSystem: true, isLegacy: true },
      { id: 34, companyId: 1, typeId: 7, name: 'Primary', parentGroupId: null, groupCategory: 'General', isSystem: true, isLegacy: true },
    ],
    chartOfAccounts: [
      {
        id: 1,
        companyId: 1,
        code: '1000',
        name: 'Cash',
        type: 'Asset',
        subType: 'Current Assets',
        main: 'Balance Sheet',
        groupId: 8,
        balance: 0,
      },
      {
        id: 2,
        companyId: 1,
        code: '1010',
        name: 'HDFC Bank',
        type: 'Asset',
        subType: 'Current Assets',
        main: 'Balance Sheet',
        groupId: 9,
        balance: 0,
      },
      {
        id: 6,
        companyId: 1,
        code: '2100',
        name: 'Short Term Loan',
        type: 'Liability',
        subType: 'Current Liabilities',
        main: 'Balance Sheet',
        groupId: 17,
        balance: 0,
      },
      {
        id: 7,
        companyId: 1,
        code: '3000',
        name: "Owner's Equity",
        type: 'Equity',
        subType: 'Capital & Equity',
        main: 'Balance Sheet',
        groupId: 26,
        balance: 0,
      },
      {
        id: 8,
        companyId: 1,
        code: '4000',
        name: 'Sales Revenue',
        type: 'Income',
        subType: 'Income',
        main: 'P&L',
        groupId: 5,
        balance: 0,
      },
      {
        id: 9,
        companyId: 1,
        code: '5000',
        name: 'COGS',
        type: 'Expense',
        subType: 'Expenses',
        main: 'P&L',
        groupId: 2,
        balance: 0,
      },
      {
        id: 10,
        companyId: 1,
        code: '6000',
        name: 'Operating Expenses',
        type: 'Expense',
        subType: 'Expenses',
        main: 'P&L',
        groupId: 1,
        balance: 0,
      },
    ],
    customers: [
      {
        id: 1,
        companyId: 1,
        name: 'ABC Corp',
        displayName: 'ABC Corp',
        email: 'contact@abc.com',
        phone: '123-456-7890',
        gstRegistration: 'Unregistered',
        gstin: '',
        billingAddress: { state: '' },
        balance: 0,
      },
      {
        id: 2,
        companyId: 1,
        name: 'XYZ Ltd',
        displayName: 'XYZ Ltd',
        email: 'info@xyz.com',
        phone: '098-765-4321',
        gstRegistration: 'Unregistered',
        gstin: '',
        billingAddress: { state: '' },
        balance: 0,
      },
    ],
    vendors: [
      {
        id: 1,
        companyId: 1,
        name: 'Supplier Co',
        email: 'sales@supplier.com',
        phone: '555-1234',
        gstRegistration: 'Unregistered',
        gstin: '',
        billingAddress: { state: '' },
        balance: 0,
      },
      {
        id: 2,
        companyId: 1,
        name: 'Materials Inc',
        email: 'orders@materials.com',
        phone: '555-5678',
        gstRegistration: 'Unregistered',
        gstin: '',
        billingAddress: { state: '' },
        balance: 0,
      },
    ],
    bankTransactions: [],
    items: [
      {
        id: 1,
        companyId: 1,
        code: 'ITM001',
        name: 'Product A',
        type: 'Goods',
        unit: 'Pcs',
        salePrice: 100,
        purchasePrice: 60,
        hsnSac: '',
        gstRate: 18,
        stock: 50,
      },
      {
        id: 2,
        companyId: 1,
        code: 'ITM002',
        name: 'Product B',
        type: 'Goods',
        unit: 'Pcs',
        salePrice: 200,
        purchasePrice: 120,
        hsnSac: '',
        gstRate: 18,
        stock: 30,
      },
      {
        id: 3,
        companyId: 1,
        code: 'SRV001',
        name: 'Consulting',
        type: 'Service',
        unit: 'Hours',
        salePrice: 150,
        purchasePrice: 0,
        hsnSac: '',
        gstRate: 18,
        stock: 0,
      },
    ],
    invoices: [],
    estimates: [],
    creditNotes: [],
    purchaseOrders: [],
    bills: [],
    debitNotes: [],
    expenses: [],
    stockTransfers: [],
    journalEntries: [],
    payments: [],
    gstRates: [
      { id: 1, companyId: 1, rate: 0 },
      { id: 2, companyId: 1, rate: 5 },
      { id: 3, companyId: 1, rate: 12 },
      { id: 4, companyId: 1, rate: 18 },
      { id: 5, companyId: 1, rate: 28 },
    ],
    uoms: [
      { id: 1, companyId: 1, name: 'Pcs' },
      { id: 2, companyId: 1, name: 'Hours' },
    ],
  };
  return defaultDB;
};

// Empty tenant DB: no demo company, masters, or transactions.
// normalizeDB() will still ensure required arrays and per-company system defaults.
export const initEmptyDB = () => {
  return {
    companies: [],
    users: [],
    accountTypes: [],
    accountGroups: [],
    chartOfAccounts: [],
    customers: [],
    vendors: [],
    bankTransactions: [],
    items: [],
    invoices: [],
    estimates: [],
    creditNotes: [],
    purchaseOrders: [],
    bills: [],
    debitNotes: [],
    expenses: [],
    stockTransfers: [],
    journalEntries: [],
    payments: [],
    gstRates: [],
    uoms: [],
  };
};

export const seedDummyDataV1 = (db, { companyId, count = 75 } = {}) => {
  const cid = Number(companyId);
  const n = Math.max(1, Math.min(100, Number(count) || 0));
  if (!cid) return db;

  const safeArray = (v) => (Array.isArray(v) ? v : []);
  const nextNumericId = (list, field = 'id') => safeArray(list).reduce((m, x) => Math.max(m, Number(x?.[field] || 0)), 0) + 1;
  const clamp2 = (x) => Math.round(Number(x || 0) * 100) / 100;

  const nowIso = new Date().toISOString();
  const today = nowIso.slice(0, 10);
  const addDays = (ymd, days) => {
    const dt = new Date(String(ymd || '') || new Date().toISOString());
    if (Number.isNaN(dt.getTime())) return today;
    dt.setDate(dt.getDate() + Number(days || 0));
    return dt.toISOString().slice(0, 10);
  };

  // deterministic-ish rng
  let rng = 123456789;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };
  const pick = (arr) => (arr && arr.length ? arr[Math.floor(rand() * arr.length)] : null);

  const next = { ...db };
  const companies = safeArray(next.companies);
  const company = companies.find((c) => Number(c?.id) === cid) || null;
  if (!company) return db;

  const doc = company?.docSettings && typeof company.docSettings === 'object' ? company.docSettings : getDefaultDocSettings();
  const migrations = doc?.migrations && typeof doc.migrations === 'object' ? doc.migrations : {};
  if (migrations.dummySeedV1Applied) return db;

  // Ensure some cash/bank ledgers exist for bank transactions + payments
  const groups = safeArray(next.accountGroups).filter((g) => Number(g.companyId) === cid);
  const coaAll = safeArray(next.chartOfAccounts);
  const coa = coaAll.filter((a) => Number(a.companyId) === cid);
  const groupByName = new Map(groups.map((g) => [String(g.name || '').trim().toLowerCase(), g]));
  const cashGroup = groupByName.get('cash-in-hand') || null;
  const bankGroup = groupByName.get('bank accounts') || null;
  const indirectExpensesGroup = groupByName.get('indirect expenses') || null;

  const findLedger = (nameLower) => coa.find((a) => String(a.name || '').trim().toLowerCase() === nameLower) || null;
  let cashLedger = findLedger('cash');
  let bankLedger = coa.find((a) => String(a.name || '').trim().toLowerCase().includes('bank')) || null;
  let expenseLedger = findLedger('operating expenses') || null;

  if (!cashLedger && cashGroup) {
    const id = nextNumericId(next.chartOfAccounts);
    cashLedger = {
      id,
      companyId: cid,
      code: '1000',
      name: 'Cash',
      type: 'Asset',
      subType: 'Current Assets',
      main: 'Balance Sheet',
      groupId: Number(cashGroup.id),
      ledgerCategory: 'General',
      openingBalance: 0,
      balance: 0,
      createdAt: nowIso,
    };
    next.chartOfAccounts = [...coaAll, cashLedger];
  }
  if (!bankLedger && bankGroup) {
    const id = nextNumericId(next.chartOfAccounts);
    bankLedger = {
      id,
      companyId: cid,
      code: '1010',
      name: 'HDFC Bank',
      type: 'Asset',
      subType: 'Current Assets',
      main: 'Balance Sheet',
      groupId: Number(bankGroup.id),
      ledgerCategory: 'General',
      openingBalance: 0,
      balance: 0,
      createdAt: nowIso,
    };
    next.chartOfAccounts = [...safeArray(next.chartOfAccounts), bankLedger];
  }
  if (!expenseLedger && indirectExpensesGroup) {
    const id = nextNumericId(next.chartOfAccounts);
    expenseLedger = {
      id,
      companyId: cid,
      code: '6000',
      name: 'Operating Expenses',
      type: 'Expense',
      subType: 'Expenses',
      main: 'P&L',
      groupId: Number(indirectExpensesGroup.id),
      ledgerCategory: 'Expense',
      openingBalance: 0,
      balance: 0,
      createdAt: nowIso,
    };
    next.chartOfAccounts = [...safeArray(next.chartOfAccounts), expenseLedger];
  }

  // Customers
  {
    const existing = safeArray(next.customers);
    let nextId = nextNumericId(existing);
    const states = ['KA', 'MH', 'TN', 'DL', 'GJ', 'RJ', 'UP', 'WB', 'TS', 'HR'];
    const gstRegs = ['Registered', 'Unregistered'];
    const rows = [];
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const state = pick(states);
      const registered = pick(gstRegs) === 'Registered';
      rows.push({
        id,
        companyId: cid,
        name: `Customer ${String(id).padStart(3, '0')}`,
        displayName: `Customer ${String(id).padStart(3, '0')}`,
        email: `customer${id}@example.com`,
        phone: `9${String(100000000 + id).slice(0, 9)}`,
        gstRegistration: registered ? 'Registered' : 'Unregistered',
        gstin: registered ? `29ABCDE${String(1000 + (id % 9000)).padStart(4, '0')}F1Z${id % 9}` : '',
        billingAddress: { state },
        balance: 0,
        createdAt: nowIso,
      });
    }
    next.customers = [...existing, ...rows];
  }

  // Vendors
  {
    const existing = safeArray(next.vendors);
    let nextId = nextNumericId(existing);
    const states = ['KA', 'MH', 'TN', 'DL', 'GJ', 'RJ', 'UP', 'WB', 'TS', 'HR'];
    const gstRegs = ['Registered', 'Unregistered'];
    const rows = [];
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const state = pick(states);
      const registered = pick(gstRegs) === 'Registered';
      rows.push({
        id,
        companyId: cid,
        name: `Vendor ${String(id).padStart(3, '0')}`,
        email: `vendor${id}@example.com`,
        phone: `8${String(100000000 + id).slice(0, 9)}`,
        gstRegistration: registered ? 'Registered' : 'Unregistered',
        gstin: registered ? `29PQRSX${String(1000 + (id % 9000)).padStart(4, '0')}G1Z${id % 9}` : '',
        billingAddress: { state },
        balance: 0,
        createdAt: nowIso,
      });
    }
    next.vendors = [...existing, ...rows];
  }

  // Items
  {
    const existing = safeArray(next.items);
    let nextId = nextNumericId(existing);
    const gstRates = [0, 5, 12, 18, 28];
    const uoms = ['Pcs', 'Kg', 'Box', 'Hours'];
    const rows = [];
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const isService = i % 5 === 0;
      const gstRate = Number(pick(gstRates) ?? 18);
      const salePrice = clamp2(50 + Math.floor(rand() * 5000));
      const purchasePrice = clamp2(Math.max(0, salePrice * (0.5 + rand() * 0.3)));
      rows.push({
        id,
        companyId: cid,
        code: `ITM${String(id).padStart(4, '0')}`,
        name: isService ? `Service ${String(id).padStart(3, '0')}` : `Product ${String(id).padStart(3, '0')}`,
        type: isService ? 'Service' : 'Goods',
        unit: pick(uoms) || 'Pcs',
        salePrice,
        purchasePrice,
        hsnSac: isService ? `SAC${String(100000 + (id % 99999)).slice(0, 6)}` : `HSN${String(1000 + (id % 9000)).slice(0, 4)}`,
        gstRate,
        stock: isService ? 0 : Math.floor(rand() * 200),
        createdAt: nowIso,
      });
    }
    next.items = [...existing, ...rows];
  }

  const companyCustomers = safeArray(next.customers).filter((c) => Number(c.companyId) === cid);
  const companyVendors = safeArray(next.vendors).filter((v) => Number(v.companyId) === cid);
  const companyItems = safeArray(next.items).filter((it) => Number(it.companyId) === cid);

  const makeGstLine = ({ item, quantity, rate, gstRate }) => {
    const qty = Number(quantity ?? 0);
    const rt = Number(rate ?? 0);
    const gr = Number(gstRate ?? 0);
    const taxable = clamp2((Number.isFinite(qty) ? qty : 0) * (Number.isFinite(rt) ? rt : 0));
    const gst = clamp2(taxable * (Number.isFinite(gr) ? gr : 0) / 100);
    const cgst = clamp2(gst / 2);
    const sgst = clamp2(gst / 2);
    const lineTotal = clamp2(taxable + gst);
    return {
      itemId: item?.id !== undefined && item?.id !== null ? String(item.id) : '',
      description: String(item?.name || 'Item').trim(),
      quantity: Number.isFinite(qty) ? qty : 1,
      rate: Number.isFinite(rt) ? rt : 0,
      gstRate: Number.isFinite(gr) ? gr : 0,
      hsnSac: String(item?.hsnSac || '').trim(),
      amount: taxable,
      taxableAmount: taxable,
      gstAmount: gst,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: 0,
      lineTotal,
      taxType: 'CGST_SGST',
    };
  };

  // Invoices
  {
    const existing = safeArray(next.invoices);
    let nextId = nextNumericId(existing);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const customer = pick(companyCustomers);
      const lineCount = 1 + Math.floor(rand() * 3);
      const lines = [];
      for (let k = 0; k < lineCount; k++) {
        const item = pick(companyItems);
        const qty = Math.max(1, Math.floor(rand() * 10));
        const rate = Number(item?.salePrice ?? (100 + Math.floor(rand() * 500)));
        const gstRate = Number(item?.gstRate ?? 18);
        lines.push(makeGstLine({ item, quantity: qty, rate, gstRate }));
      }
      const subtotal = clamp2(lines.reduce((s, l) => s + Number(l.taxableAmount || 0), 0));
      const gstTotal = clamp2(lines.reduce((s, l) => s + Number(l.gstAmount || 0), 0));
      const total = clamp2(lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0));
      const paidAmount = i % 4 === 0 ? total : i % 4 === 1 ? clamp2(total * 0.4) : 0;
      const status = paidAmount >= total - 0.0001 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';

      rows.push({
        id,
        companyId: cid,
        number: `INV-D${String(id).padStart(5, '0')}`,
        date: addDays(today, -Math.floor(rand() * 120)),
        dueDate: addDays(today, 15 + Math.floor(rand() * 30)),
        status,
        refNo: `REF-${String(id).padStart(5, '0')}`,
        refDate: addDays(today, -Math.floor(rand() * 130)),
        customerId: customer ? String(customer.id) : '',
        customerName: customer?.displayName || customer?.name || 'Customer',
        customerGstin: String(customer?.gstin || ''),
        placeOfSupplyState: String(customer?.billingAddress?.state || ''),
        taxType: 'CGST_SGST',
        items: lines,
        subtotal,
        cgstTotal: clamp2(gstTotal / 2),
        sgstTotal: clamp2(gstTotal / 2),
        igstTotal: 0,
        gstTotal,
        total,
        paidAmount: clamp2(paidAmount),
        createdAt: nowIso,
      });
    }
    next.invoices = [...existing, ...rows];
  }

  // Estimates
  {
    const existing = safeArray(next.estimates);
    let nextId = nextNumericId(existing);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const customer = pick(companyCustomers);
      const lineCount = 1 + Math.floor(rand() * 3);
      const lines = [];
      for (let k = 0; k < lineCount; k++) {
        const item = pick(companyItems);
        const qty = Math.max(1, Math.floor(rand() * 10));
        const rate = Number(item?.salePrice ?? (100 + Math.floor(rand() * 500)));
        const gstRate = Number(item?.gstRate ?? 18);
        lines.push(makeGstLine({ item, quantity: qty, rate, gstRate }));
      }
      const subtotal = clamp2(lines.reduce((s, l) => s + Number(l.taxableAmount || 0), 0));
      const gstTotal = clamp2(lines.reduce((s, l) => s + Number(l.gstAmount || 0), 0));
      const total = clamp2(lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0));
      rows.push({
        id,
        companyId: cid,
        number: `EST-D${String(id).padStart(5, '0')}`,
        date: addDays(today, -Math.floor(rand() * 120)),
        validUntil: addDays(today, 10 + Math.floor(rand() * 40)),
        status: i % 6 === 0 ? 'Accepted' : i % 6 === 1 ? 'Rejected' : 'Draft',
        refNo: `ESTREF-${String(id).padStart(5, '0')}`,
        customerId: customer ? String(customer.id) : '',
        customerName: customer?.displayName || customer?.name || 'Customer',
        customerGstin: String(customer?.gstin || ''),
        placeOfSupplyState: String(customer?.billingAddress?.state || ''),
        taxType: 'CGST_SGST',
        items: lines,
        subtotal,
        cgstTotal: clamp2(gstTotal / 2),
        sgstTotal: clamp2(gstTotal / 2),
        igstTotal: 0,
        gstTotal,
        total,
        notes: `Dummy estimate notes ${id}`,
        createdAt: nowIso,
      });
    }
    next.estimates = [...existing, ...rows];
  }

  // Purchase Orders
  {
    const existing = safeArray(next.purchaseOrders);
    let nextId = nextNumericId(existing);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const vendor = pick(companyVendors);
      const lineCount = 1 + Math.floor(rand() * 3);
      const items = [];
      for (let k = 0; k < lineCount; k++) {
        const item = pick(companyItems);
        const qty = Math.max(1, Math.floor(rand() * 25));
        const rate = Number(item?.purchasePrice ?? (50 + Math.floor(rand() * 300)));
        const amount = clamp2(qty * rate);
        items.push({
          itemId: item?.id !== undefined && item?.id !== null ? String(item.id) : '',
          description: item?.name || 'Item',
          quantity: qty,
          rate,
          amount,
        });
      }
      const subtotal = clamp2(items.reduce((s, l) => s + Number(l.amount || 0), 0));
      rows.push({
        id,
        companyId: cid,
        number: `PO-D${String(id).padStart(5, '0')}`,
        date: addDays(today, -Math.floor(rand() * 120)),
        vendorId: vendor ? String(vendor.id) : '',
        vendorName: vendor?.name || 'Vendor',
        items,
        subtotal,
        total: subtotal,
        notes: `Dummy PO notes ${id}`,
        status: i % 5 === 0 ? 'Sent' : 'Draft',
        createdAt: nowIso,
      });
    }
    next.purchaseOrders = [...existing, ...rows];
  }

  // Bills
  {
    const existing = safeArray(next.bills);
    let nextId = nextNumericId(existing);
    const rows = [];
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const vendor = pick(companyVendors);
      const lineCount = 1 + Math.floor(rand() * 3);
      const lines = [];
      for (let k = 0; k < lineCount; k++) {
        const item = pick(companyItems);
        const qty = Math.max(1, Math.floor(rand() * 25));
        const rate = Number(item?.purchasePrice ?? (50 + Math.floor(rand() * 300)));
        const gstRate = Number(item?.gstRate ?? 18);
        lines.push(makeGstLine({ item, quantity: qty, rate, gstRate }));
      }
      const subtotal = clamp2(lines.reduce((s, l) => s + Number(l.taxableAmount || 0), 0));
      const gstTotal = clamp2(lines.reduce((s, l) => s + Number(l.gstAmount || 0), 0));
      const total = clamp2(lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0));
      const paidAmount = i % 6 === 0 ? total : i % 6 === 1 ? clamp2(total * 0.25) : 0;
      const status = paidAmount >= total - 0.0001 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';

      rows.push({
        id,
        companyId: cid,
        number: `BILL-D${String(id).padStart(5, '0')}`,
        date: addDays(today, -Math.floor(rand() * 120)),
        dueDate: addDays(today, 10 + Math.floor(rand() * 40)),
        status,
        refNo: `SUP-${String(id).padStart(5, '0')}`,
        refDate: addDays(today, -Math.floor(rand() * 120)),
        vendorId: vendor ? String(vendor.id) : '',
        vendorName: vendor?.name || 'Vendor',
        vendorGstin: String(vendor?.gstin || ''),
        placeOfSupplyState: String(vendor?.billingAddress?.state || ''),
        taxType: 'CGST_SGST',
        items: lines,
        subtotal,
        cgstTotal: clamp2(gstTotal / 2),
        sgstTotal: clamp2(gstTotal / 2),
        igstTotal: 0,
        gstTotal,
        total,
        paidAmount,
        createdAt: nowIso,
      });
    }
    next.bills = [...existing, ...rows];
  }

  // Expenses
  {
    const existing = safeArray(next.expenses);
    let nextId = nextNumericId(existing);
    const rows = [];
    const expenseCats = ['Office', 'Travel', 'Utilities', 'Marketing', 'Subscriptions', 'Repairs'];
    const gstRates = [0, 5, 12, 18, 28];

    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const vendor = pick(companyVendors);
      const amount = clamp2(100 + Math.floor(rand() * 25000));
      const gstRate = Number(pick(gstRates) ?? 18);
      const gstTotal = clamp2(amount * gstRate / 100);
      const total = clamp2(amount + gstTotal);
      const paidAmount = i % 7 === 0 ? total : i % 7 === 1 ? clamp2(total * 0.5) : 0;
      const status = paidAmount >= total - 0.0001 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Unpaid';
      rows.push({
        id,
        companyId: cid,
        number: `EXP-D${String(id).padStart(5, '0')}`,
        date: addDays(today, -Math.floor(rand() * 120)),
        dueDate: addDays(today, 10 + Math.floor(rand() * 40)),
        status,
        description: `Dummy expense ${id} - ${pick(expenseCats)}`,
        category: pick(expenseCats),
        vendorId: vendor ? String(vendor.id) : '',
        vendorName: vendor?.name || 'Vendor',
        vendorGstin: String(vendor?.gstin || ''),
        placeOfSupplyState: String(vendor?.billingAddress?.state || ''),
        refNo: `EXPREF-${String(id).padStart(5, '0')}`,
        refDate: addDays(today, -Math.floor(rand() * 140)),
        amount,
        gstRate,
        taxableTotal: amount,
        cgstTotal: clamp2(gstTotal / 2),
        sgstTotal: clamp2(gstTotal / 2),
        igstTotal: 0,
        gstTotal,
        total,
        paidAmount,
        createdAt: nowIso,
      });
    }
    next.expenses = [...existing, ...rows];
  }

  // Journal Entries
  {
    const existing = safeArray(next.journalEntries);
    let nextId = nextNumericId(existing);
    const rows = [];
    const cashAcc = cashLedger;
    const expAcc = expenseLedger;
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const amt = clamp2(100 + Math.floor(rand() * 9000));
      if (!cashAcc || !expAcc) break;
      rows.push({
        id,
        companyId: cid,
        number: `JE-D${String(id).padStart(5, '0')}`,
        date: addDays(today, -Math.floor(rand() * 120)),
        narration: `Dummy JV ${id}: expense paid in cash`,
        lines: [
          {
            accountId: String(expAcc.id),
            debit: amt,
            credit: 0,
            accountName: expAcc.name,
            accountCode: expAcc.code,
          },
          {
            accountId: String(cashAcc.id),
            debit: 0,
            credit: amt,
            accountName: cashAcc.name,
            accountCode: cashAcc.code,
          },
        ],
        totalDebit: amt,
        totalCredit: amt,
        createdAt: nowIso,
      });
    }
    next.journalEntries = [...existing, ...rows];
  }

  // Bank transactions
  {
    const existing = safeArray(next.bankTransactions);
    let nextId = nextNumericId(existing);
    const rows = [];
    const accountIds = [cashLedger?.id, bankLedger?.id].filter((x) => x !== undefined && x !== null);
    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const cashBankAccountId = Number(pick(accountIds) ?? accountIds[0] ?? 0);
      const direction = i % 2 === 0 ? 'IN' : 'OUT';
      rows.push({
        id,
        companyId: cid,
        cashBankAccountId,
        date: addDays(today, -Math.floor(rand() * 120)),
        direction,
        ledgerId: direction === 'OUT' && expenseLedger ? Number(expenseLedger.id) : null,
        amount: clamp2(500 + Math.floor(rand() * 50000)),
        narration: `Dummy ${direction === 'IN' ? 'receipt' : 'payment'} ${id}`,
        description: `Dummy bank txn ${id}`,
        reference: `BNK-${String(id).padStart(6, '0')}`,
        linkedPaymentId: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }
    next.bankTransactions = [...existing, ...rows];
  }

  // Payments (receipts + payments)
  {
    const existing = safeArray(next.payments);
    let nextId = nextNumericId(existing);
    const rows = [];
    const invs = safeArray(next.invoices).filter((x) => Number(x.companyId) === cid);
    const bills = safeArray(next.bills).filter((x) => Number(x.companyId) === cid);

    for (let i = 0; i < n; i++) {
      const id = nextId++;
      const isReceipt = i % 2 === 0;
      const date = addDays(today, -Math.floor(rand() * 120));
      const amount = clamp2(200 + Math.floor(rand() * 15000));
      if (isReceipt) {
        const inv = pick(invs);
        rows.push({
          id,
          companyId: cid,
          voucherType: 'receipt',
          voucherId: null,
          direction: 'IN',
          cashBankAccountId: cashLedger ? Number(cashLedger.id) : undefined,
          sourceBankTransactionId: undefined,
          receiptNo: `RCPT-D${String(id).padStart(5, '0')}`,
          date,
          customerId: inv?.customerId ? Number(inv.customerId) : Number(pick(companyCustomers)?.id || 0),
          customerName: String(inv?.customerName || pick(companyCustomers)?.name || 'Customer'),
          amount,
          allocatedAmount: 0,
          advanceAmount: amount,
          allocations: [],
          mode: 'Cash',
          reference: `RCPTREF-${String(id).padStart(5, '0')}`,
          notes: `Dummy receipt notes ${id}`,
          createdAt: nowIso,
        });
      } else {
        const b = pick(bills);
        rows.push({
          id,
          companyId: cid,
          voucherType: 'payment',
          voucherId: null,
          direction: 'OUT',
          cashBankAccountId: bankLedger ? Number(bankLedger.id) : (cashLedger ? Number(cashLedger.id) : undefined),
          sourceBankTransactionId: undefined,
          paymentNo: `PAY-D${String(id).padStart(5, '0')}`,
          date,
          vendorId: b?.vendorId ? Number(b.vendorId) : Number(pick(companyVendors)?.id || 0),
          vendorName: String(b?.vendorName || pick(companyVendors)?.name || 'Vendor'),
          amount,
          allocatedAmount: 0,
          advanceAmount: amount,
          allocations: [],
          mode: 'Bank',
          reference: `PAYREF-${String(id).padStart(5, '0')}`,
          notes: `Dummy payment notes ${id}`,
          createdAt: nowIso,
        });
      }
    }
    next.payments = [...existing, ...rows];
  }

  // Stamp migration flag onto company
  {
    const appliedAt = nowIso;
    const nextMigrations = { ...migrations, dummySeedV1Applied: true, dummySeedV1AppliedAt: appliedAt };
    const nextDocSettings = { ...getDefaultDocSettings(), ...doc, migrations: nextMigrations };
    next.companies = companies.map((c) => (Number(c?.id) === cid ? { ...c, docSettings: nextDocSettings } : c));
  }

  return next;
};

export const normalizeDB = (db) => {
  const next = { ...db };

  if (!Array.isArray(next.bankTransactions)) next.bankTransactions = [];

  if (!Array.isArray(next.stockTransfers)) next.stockTransfers = [];

  if (!Array.isArray(next.accountTypes)) next.accountTypes = [];
  if (!Array.isArray(next.accountGroups)) next.accountGroups = [];

  const ensureDefaultsForCompany = (companyId) => {
    const types = next.accountTypes.filter((t) => Number(t.companyId) === Number(companyId));
    const groups = next.accountGroups.filter((g) => Number(g.companyId) === Number(companyId));

    const TEMPLATE_TYPES = [
      { main: 'Balance Sheet', accountClass: 'Asset', name: 'Current Assets' },
      { main: 'Balance Sheet', accountClass: 'Asset', name: 'Fixed Assets' },
      { main: 'Balance Sheet', accountClass: 'Liability', name: 'Current Liabilities' },
      { main: 'Balance Sheet', accountClass: 'Liability', name: 'Non Current Liabilities' },
      { main: 'Balance Sheet', accountClass: 'Equity', name: 'Capital & Equity' },
      { main: 'P&L', accountClass: 'Income', name: 'Income' },
      { main: 'P&L', accountClass: 'Expense', name: 'Expenses' },
    ];

    const ensureType = ({ main, accountClass, name }) => {
      const found = types.find(
        (t) =>
          String(t.main || '').trim() === main &&
          String(t.accountClass || '').trim() === accountClass &&
          String(t.name || '').trim().toLowerCase() === name.toLowerCase()
      );
      if (found) {
        found.isSystem = true;
        found.isLegacy = Boolean(found.isLegacy) && false;
        return found;
      }
      const nextId = next.accountTypes.reduce((m, t) => Math.max(m, Number(t?.id || 0)), 0) + 1;
      const created = { id: nextId, companyId, main, accountClass, name, isSystem: true };
      next.accountTypes.push(created);
      types.push(created);
      return created;
    };

    const typeByName = new Map();
    for (const t of TEMPLATE_TYPES) {
      const row = ensureType(t);
      typeByName.set(t.name, row);
    }

    const TEMPLATE_GROUPS = [
      // P&L
      { typeName: 'Expenses', name: 'Indirect Expenses', groupCategory: 'Expense' },
      { typeName: 'Expenses', name: 'Direct Expenses', groupCategory: 'Expense' },
      { typeName: 'Income', name: 'Indirect Income', groupCategory: 'General' },
      { typeName: 'Income', name: 'Direct Income', groupCategory: 'General' },
      { typeName: 'Income', name: 'Sales Accounts', groupCategory: 'General' },
      { typeName: 'Expenses', name: 'Purchase Accounts', groupCategory: 'Expense' },

      // Balance Sheet - Current Assets
      { typeName: 'Current Assets', name: 'Sundry Debtors', groupCategory: 'Customer' },
      { typeName: 'Current Assets', name: 'Cash-in-Hand', groupCategory: 'General' },
      { typeName: 'Current Assets', name: 'Bank Accounts', groupCategory: 'General' },
      { typeName: 'Current Assets', name: 'Deposits (Asset)', groupCategory: 'General' },
      { typeName: 'Current Assets', name: 'Loans & Advances (Asset)', groupCategory: 'General' },
      { typeName: 'Current Assets', name: 'Stock-in-Hand', groupCategory: 'General' },
      { typeName: 'Current Assets', name: 'Input GST', groupCategory: 'General' },

      // Balance Sheet - Current Liabilities
      { typeName: 'Current Liabilities', name: 'Investments', groupCategory: 'General' },
      { typeName: 'Current Liabilities', name: 'Sundry Creditors', groupCategory: 'Vendor' },
      { typeName: 'Current Liabilities', name: 'Duties & Taxes', groupCategory: 'General' },
      { typeName: 'Current Liabilities', name: 'Output GST', groupCategory: 'General' },
      { typeName: 'Current Liabilities', name: 'Provisions', groupCategory: 'General' },
      { typeName: 'Current Liabilities', name: 'Short term Loans', groupCategory: 'General' },
      { typeName: 'Current Liabilities', name: 'Outstanding Expenses', groupCategory: 'General' },

      // Balance Sheet - Non Current Liabilities
      { typeName: 'Non Current Liabilities', name: 'Long term Loans', groupCategory: 'General' },

      // Balance Sheet - Fixed Assets
      { typeName: 'Fixed Assets', name: 'Plant & Machinery', groupCategory: 'General' },
      { typeName: 'Fixed Assets', name: 'Furniture & Fixtures', groupCategory: 'General' },
      { typeName: 'Fixed Assets', name: 'Computers', groupCategory: 'General' },
      { typeName: 'Fixed Assets', name: 'Vehicles', groupCategory: 'General' },
      { typeName: 'Fixed Assets', name: 'Buildings', groupCategory: 'General' },
      { typeName: 'Fixed Assets', name: 'Leasehold Assets', groupCategory: 'General' },

      // Balance Sheet - Capital & Equity
      { typeName: 'Capital & Equity', name: 'Capital Accounts', groupCategory: 'General' },
      { typeName: 'Capital & Equity', name: 'Reserves & Surplus', groupCategory: 'General' },
    ];

    const templateGroupKeySet = new Set();

    const ensureGroup = ({ typeId, name, parentGroupId = null, groupCategory = 'General', isLegacy = false }) => {
      const found = groups.find(
        (g) =>
          Number(g.typeId) === Number(typeId) &&
          String(g.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase()
      );
      if (found) {
        found.isSystem = true;
        found.groupCategory = found.groupCategory || groupCategory;
        found.isLegacy = Boolean(found.isLegacy) && isLegacy;
        return found;
      }
      const nextId = next.accountGroups.reduce((m, g) => Math.max(m, Number(g?.id || 0)), 0) + 1;
      const created = { id: nextId, companyId, typeId: Number(typeId), name, parentGroupId, groupCategory, isSystem: true, isLegacy };
      next.accountGroups.push(created);
      groups.push(created);
      return created;
    };

    // Create template groups
    for (const g of TEMPLATE_GROUPS) {
      const typeRow = typeByName.get(g.typeName);
      if (!typeRow) continue;
      templateGroupKeySet.add(`${Number(typeRow.id)}__${String(g.name).trim().toLowerCase()}`);
      ensureGroup({ typeId: typeRow.id, name: g.name, groupCategory: g.groupCategory, isLegacy: false });
    }

    // Keep Primary fallback groups (legacy/hidden)
    for (const t of types) {
      ensureGroup({ typeId: t.id, name: 'Primary', groupCategory: 'General', isLegacy: true });
    }

    // Mark non-template types/groups as legacy (hidden from dropdowns), but keep them for existing ledgers
    const templateTypeNames = new Set(TEMPLATE_TYPES.map((t) => `${t.main}__${t.accountClass}__${t.name.toLowerCase()}`));
    for (const t of types) {
      if (t && t.isUserDefined) {
        t.isLegacy = false;
        continue;
      }
      const key = `${String(t.main || '').trim()}__${String(t.accountClass || '').trim()}__${String(t.name || '').trim().toLowerCase()}`;
      if (!templateTypeNames.has(key)) {
        t.isLegacy = true;
      } else {
        t.isLegacy = false;
        t.isSystem = true;
      }
    }
    for (const g of groups) {
      if (g && g.isUserDefined) {
        g.isLegacy = false;
        continue;
      }
      const key = `${Number(g.typeId)}__${String(g.name || '').trim().toLowerCase()}`;
      if (String(g.name || '').trim().toLowerCase() === 'primary') {
        g.isLegacy = true;
        continue;
      }
      if (!templateGroupKeySet.has(key)) {
        // Hard replace: anything outside the template is legacy/hidden.
        g.isLegacy = true;
      } else {
        g.isLegacy = false;
        g.isSystem = true;
      }
    }

    const sundryDebtors = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'sundry debtors') || null;
    const sundryCreditors = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'sundry creditors') || null;
    const cashInHand = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'cash-in-hand') || null;
    const indirectExpenses = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'indirect expenses') || null;
    const inputGstGroup = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'input gst') || null;
    const outputGstGroup = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'output gst') || null;

    return { sundryDebtors, sundryCreditors, cashInHand, indirectExpenses, inputGstGroup, outputGstGroup };
  };

  const companies = Array.isArray(next.companies) ? next.companies : [];
  const templateInfoByCompany = new Map();
  for (const c of companies) {
    templateInfoByCompany.set(Number(c.id), ensureDefaultsForCompany(c.id));
  }

  if (Array.isArray(next.chartOfAccounts)) {
    next.chartOfAccounts = next.chartOfAccounts.map((a) => {
      const ledgerCategory = String(a?.ledgerCategory || '').trim();
      return {
        ...a,
        ledgerCategory: ledgerCategory || 'General',
        main: String(a?.main || '').trim() || (['Income', 'Expense'].includes(String(a?.type || '').trim()) ? 'P&L' : 'Balance Sheet'),
        groupId: a?.groupId !== undefined ? a.groupId : null,
      };
    });
  }

  // Hard replace: migrate existing ledgers into template groups (one-time per company)
  const getCompanyDocSettings = (company) => {
    const ds = company?.docSettings && typeof company.docSettings === 'object' ? company.docSettings : {};
    const migrations = ds.migrations && typeof ds.migrations === 'object' ? ds.migrations : {};
    return { docSettings: ds, migrations };
  };

  const groupCategoryToLedgerCategory = (groupCategory) => {
    const c = String(groupCategory || '').trim();
    if (c === 'Customer') return 'Customer';
    if (c === 'Vendor') return 'Vendor';
    if (c === 'Expense') return 'Expense';
    return 'General';
  };

  const pickTemplateGroupName = (ledger) => {
    const ledgerCategory = String(ledger?.ledgerCategory || '').trim();
    const accountClass = String(ledger?.type || '').trim();
    const subType = String(ledger?.subType || '').trim().toLowerCase();
    const name = String(ledger?.name || '').trim().toLowerCase();

    if (ledgerCategory === 'Customer') return 'sundry debtors';
    if (ledgerCategory === 'Vendor') return 'sundry creditors';
    if (ledgerCategory === 'Expense') {
      // Keep it simple: default all expenses to Indirect Expenses.
      // Users can later create more ledgers under template groups as needed.
      return 'indirect expenses';
    }

     if (name.includes('receivable') || name.includes('debtors')) return 'sundry debtors';
     if (name.includes('payable') || name.includes('creditors')) return 'sundry creditors';
     if (name === "owner's equity" || name.includes('capital')) return 'capital accounts';
     if (name.includes('fixed assets') || (accountClass === 'Asset' && subType.includes('fixed'))) return 'plant & machinery';

    if (accountClass === 'Asset') {
      if (name.includes('cash')) return 'cash-in-hand';
      if (name.includes('bank')) return 'bank accounts';
      if (name.includes('inventory') || name.includes('stock')) return 'stock-in-hand';
      if (name.includes('deposit')) return 'deposits (asset)';
      if (name.includes('advance') || name.includes('loan')) return 'loans & advances (asset)';
      if (subType.includes('fixed')) {
        if (name.includes('vehicle')) return 'vehicles';
        if (name.includes('computer')) return 'computers';
        if (name.includes('furniture')) return 'furniture & fixtures';
        if (name.includes('building')) return 'buildings';
        return 'plant & machinery';
      }
      // Default for other assets
      return 'loans & advances (asset)';
    }

    if (accountClass === 'Liability') {
      if (name.includes('creditor') || name.includes('payable')) return 'sundry creditors';
      if (name.includes('tax') || name.includes('gst') || name.includes('duty')) return 'duties & taxes';
      if (name.includes('outstanding')) return 'outstanding expenses';
      if (name.includes('provision')) return 'provisions';
      if (name.includes('loan')) return subType.includes('non current') ? 'long term loans' : 'short term loans';
      if (name.includes('investment')) return 'investments';
      return 'outstanding expenses';
    }

    if (accountClass === 'Equity') {
      if (name.includes('reserve') || name.includes('surplus')) return 'reserves & surplus';
      return 'capital accounts';
    }

    if (accountClass === 'Income') {
      if (name.includes('sale')) return 'sales accounts';
      return 'indirect income';
    }

    if (accountClass === 'Expense') {
      return 'indirect expenses';
    }

    return 'cash-in-hand';
  };

  const migrateCompanyToTemplate = (company) => {
    const companyId = Number(company?.id);
    if (!companyId) return;

    const { docSettings, migrations } = getCompanyDocSettings(company);
    const alreadyApplied = Boolean(migrations.coaTemplateHardReplaceV1Applied);

    const allGroups = Array.isArray(next.accountGroups) ? next.accountGroups : [];
    const allTypes = Array.isArray(next.accountTypes) ? next.accountTypes : [];

    const templateGroupsByName = new Map();
    for (const g of allGroups) {
      if (Number(g.companyId) !== companyId) continue;
      if (g.isLegacy) continue;
      templateGroupsByName.set(String(g.name || '').trim().toLowerCase(), g);
    }

    function getTemplateGroup(nameLower) {
      return templateGroupsByName.get(String(nameLower || '').trim().toLowerCase()) || null;
    }

    const isForcedLedgerName = (nm) => {
      const n = String(nm || '').trim().toLowerCase();
      if (!n) return false;
      return (
        n === 'accounts receivable' ||
        n === 'accounts payable' ||
        n === 'fixed assets' ||
        n === 'cash' ||
        n === 'inventory' ||
        n === "owner's equity" ||
        n === 'sales revenue' ||
        n === 'cogs' ||
        n === 'operating expenses' ||
        n === 'short term loan'
      );
    };

    const shouldForceTemplatePlacement = (ledger) => {
      const cat = String(ledger?.ledgerCategory || '').trim();
      if (cat === 'Customer' || cat === 'Vendor' || cat === 'Expense') return true;
      return isForcedLedgerName(ledger?.name);
    };

    const getTargetGroupForLedger = (ledger) => {
      const targetName = pickTemplateGroupName(ledger);
      return getTemplateGroup(targetName);
    };

    const typeById = new Map();
    for (const t of allTypes) {
      if (Number(t.companyId) !== companyId) continue;
      typeById.set(String(t.id), t);
    }

    const groupById = new Map();
    for (const g of allGroups) {
      if (Number(g.companyId) !== companyId) continue;
      groupById.set(String(g.id), g);
    }

    if (alreadyApplied) {
      const coa = Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : [];
      const hasNonTemplateLedger = coa.some((a) => {
        if (Number(a.companyId) !== companyId) return false;
        const gid = a?.groupId !== null && a?.groupId !== undefined && a?.groupId !== '' ? String(a.groupId) : '';
        if (!gid) return true;
        const g = groupById.get(gid);
        if (!g) return true;
        const gName = String(g.name || '').trim().toLowerCase();
        if (gName === 'primary') return true;
        return Boolean(g.isLegacy);
      });
        const hasMisplacedForcedLedger = coa.some((a) => {
          if (Number(a.companyId) !== companyId) return false;
          if (!shouldForceTemplatePlacement(a)) return false;
          const gid = a?.groupId !== null && a?.groupId !== undefined && a?.groupId !== '' ? String(a.groupId) : '';
          const currentGroup = gid ? groupById.get(gid) : null;
          const targetGroup = getTargetGroupForLedger(a);
          if (!targetGroup) return false;
          const currentName = String(currentGroup?.name || '').trim().toLowerCase();
          const targetName = String(targetGroup?.name || '').trim().toLowerCase();
          return currentName !== targetName;
        });

        if (!hasNonTemplateLedger && !hasMisplacedForcedLedger) return;
    }

    const updateLedgerToGroup = (ledger, group) => {
      const t = group ? typeById.get(String(group.typeId)) : null;
      const derivedType = String(t?.accountClass || ledger.type || '').trim();
      const derivedSubType = String(t?.name || ledger.subType || '').trim();
      const derivedMain = String(t?.main || ledger.main || '').trim();

      return {
        ...ledger,
        groupId: group ? Number(group.id) : ledger.groupId,
        ledgerCategory: group ? groupCategoryToLedgerCategory(group.groupCategory) : ledger.ledgerCategory,
        type: derivedType || ledger.type,
        subType: derivedSubType || ledger.subType,
        main: derivedMain || ledger.main,
      };
    };

    if (Array.isArray(next.chartOfAccounts)) {
      next.chartOfAccounts = next.chartOfAccounts.map((a) => {
        if (Number(a.companyId) !== companyId) return a;

        const currentGroup = a?.groupId !== null && a?.groupId !== undefined && a?.groupId !== '' ? groupById.get(String(a.groupId)) : null;
        const alreadyTemplate = currentGroup && !currentGroup.isLegacy && String(currentGroup.name || '').trim().toLowerCase() !== 'primary';
          const force = shouldForceTemplatePlacement(a);
          if (alreadyTemplate) {
            if (!force) return a;
            // If the user placed an Expense ledger into a valid template expense group, keep it.
            // This prevents "Edit Ledger" (group change) from being overwritten on normalize.
            const cat = String(a?.ledgerCategory || '').trim();
            if (cat === 'Expense') {
              const gname = String(currentGroup?.name || '').trim().toLowerCase();
              const keep = gname === 'direct expenses' || gname === 'indirect expenses' || gname === 'purchase accounts';
              if (keep) return a;
            }
          }

          const targetGroup = getTargetGroupForLedger(a);
          if (!targetGroup) return a;

          const currentName = String(currentGroup?.name || '').trim().toLowerCase();
          const targetName = String(targetGroup?.name || '').trim().toLowerCase();
          if (!force && alreadyTemplate && currentName === targetName) return a;

          return updateLedgerToGroup(a, targetGroup);
      });
    }

    // Force customers/vendors to default template groups if missing or legacy
    const info = templateInfoByCompany.get(companyId) || {};
    const sundryDebtors = info.sundryDebtors && !info.sundryDebtors.isLegacy ? info.sundryDebtors : getTemplateGroup('sundry debtors');
    const sundryCreditors = info.sundryCreditors && !info.sundryCreditors.isLegacy ? info.sundryCreditors : getTemplateGroup('sundry creditors');

    if (Array.isArray(next.customers) && sundryDebtors) {
      next.customers = next.customers.map((cust) => {
        if (Number(cust.companyId) !== companyId) return cust;
        const currentGroup = cust?.groupId !== undefined && cust?.groupId !== null && cust?.groupId !== '' ? groupById.get(String(cust.groupId)) : null;
        const needsDefault = !cust?.groupId || (currentGroup && currentGroup.isLegacy);
        if (!needsDefault) return cust;
        return { ...cust, groupId: Number(sundryDebtors.id) };
      });
    }

    if (Array.isArray(next.vendors) && sundryCreditors) {
      next.vendors = next.vendors.map((vend) => {
        if (Number(vend.companyId) !== companyId) return vend;
        const currentGroup = vend?.groupId !== undefined && vend?.groupId !== null && vend?.groupId !== '' ? groupById.get(String(vend.groupId)) : null;
        const needsDefault = !vend?.groupId || (currentGroup && currentGroup.isLegacy);
        if (!needsDefault) return vend;
        return { ...vend, groupId: Number(sundryCreditors.id) };
      });
    }

    // Stamp migration
    const appliedAt = new Date().toISOString();
    const nextMigrations = { ...migrations, coaTemplateHardReplaceV1Applied: true, coaTemplateHardReplaceV1AppliedAt: appliedAt };
    const nextDocSettings = { ...docSettings, migrations: nextMigrations };
    next.companies = (Array.isArray(next.companies) ? next.companies : []).map((c) =>
      Number(c.id) === companyId ? { ...c, docSettings: nextDocSettings } : c
    );
  };

  for (const c of companies) migrateCompanyToTemplate(c);

  // Assign missing groupId for ledgers to a default "Primary" group within their derived type
  if (Array.isArray(next.chartOfAccounts)) {
    const groupByCompanyAndType = new Map();
    for (const g of next.accountGroups) {
      const companyId = Number(g.companyId);
      const typeId = Number(g.typeId);
      const key = `${companyId}__${typeId}__${String(g.name || '').trim().toLowerCase()}`;
      groupByCompanyAndType.set(key, g);
    }

    const typeByCompanyAndClass = new Map();
    for (const t of next.accountTypes) {
      const companyId = Number(t.companyId);
      const key = `${companyId}__${String(t.accountClass || '').trim()}`;
      if (!typeByCompanyAndClass.has(key)) typeByCompanyAndClass.set(key, t);
    }

    next.chartOfAccounts = next.chartOfAccounts.map((a) => {
      if (a?.groupId !== null && a?.groupId !== undefined && a?.groupId !== '') return a;
      const companyId = Number(a.companyId);
      const accountClass = String(a.type || '').trim() || 'Asset';
      const type = typeByCompanyAndClass.get(`${companyId}__${accountClass}`);
      if (!type) return a;
      const primary = groupByCompanyAndType.get(`${companyId}__${Number(type.id)}__primary`);
      if (!primary) return a;
      return {
        ...a,
        groupId: primary.id,
        subType: String(type.name || '').trim() || a.subType,
        main: String(type.main || '').trim() || a.main,
      };
    });
  }

  // Ensure customers have optional groupId and a linked ledger account
  if (Array.isArray(next.customers)) {
    const coa = Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : [];
    const groups = Array.isArray(next.accountGroups) ? next.accountGroups : [];
    const types = Array.isArray(next.accountTypes) ? next.accountTypes : [];

    const typeById = new Map(types.map((t) => [String(t.id), t]));

    const findSundryDebtorsGroup = (companyId) =>
      groups.find(
        (g) =>
          Number(g.companyId) === Number(companyId) &&
          !g.isLegacy &&
          String(g.name || '').trim().toLowerCase() === 'sundry debtors'
      ) || null;

    const nextCoaIdBase = coa.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0);
    let nextCoaId = nextCoaIdBase + 1;

    next.customers = next.customers.map((cust) => {
      const companyId = Number(cust.companyId);
      const existingAccountId = cust?.accountId ? String(cust.accountId) : '';
      const groupId = cust?.groupId !== undefined && cust?.groupId !== null && cust?.groupId !== '' ? Number(cust.groupId) : null;
      const defaultGroup = findSundryDebtorsGroup(companyId);
      const effectiveGroupId = groupId || (defaultGroup ? Number(defaultGroup.id) : null);

      const existingLedger = existingAccountId
        ? coa.find((a) => Number(a.companyId) === companyId && String(a.id) === existingAccountId)
        : null;

      if (existingLedger) {
        return {
          ...cust,
          groupId: effectiveGroupId,
          accountId: existingLedger.id,
        };
      }

      if (!effectiveGroupId) {
        return {
          ...cust,
          groupId: null,
          accountId: existingAccountId || '',
        };
      }

      const group = groups.find((g) => Number(g.id) === Number(effectiveGroupId) && Number(g.companyId) === companyId) || null;
      const type = group ? typeById.get(String(group.typeId)) : null;

      const code = `CUST-${cust.id}`;
      const name = String(cust.displayName || cust.name || '').trim() || `Customer ${cust.id}`;
      const newLedger = {
        id: nextCoaId++,
        companyId,
        code,
        name,
        ledgerCategory: 'Customer',
        groupId: effectiveGroupId,
        type: String(type?.accountClass || 'Asset'),
        subType: String(type?.name || ''),
        main: String(type?.main || 'Balance Sheet'),
        balance: Number(cust.balance || 0),
      };
      next.chartOfAccounts.push(newLedger);

      return {
        ...cust,
        groupId: effectiveGroupId,
        accountId: newLedger.id,
      };
    });
  }

  // Ensure vendors have optional groupId and a linked ledger account
  if (Array.isArray(next.vendors)) {
    const coa = Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : [];
    const groups = Array.isArray(next.accountGroups) ? next.accountGroups : [];
    const types = Array.isArray(next.accountTypes) ? next.accountTypes : [];

    const typeById = new Map(types.map((t) => [String(t.id), t]));

    const findSundryCreditorsGroup = (companyId) =>
      groups.find(
        (g) =>
          Number(g.companyId) === Number(companyId) &&
          !g.isLegacy &&
          String(g.name || '').trim().toLowerCase() === 'sundry creditors'
      ) || null;

    let nextCoaId = coa.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;

    next.vendors = next.vendors.map((vend) => {
      const companyId = Number(vend.companyId);
      const existingAccountId = vend?.accountId ? String(vend.accountId) : '';
      const groupId = vend?.groupId !== undefined && vend?.groupId !== null && vend?.groupId !== '' ? Number(vend.groupId) : null;
      const defaultGroup = findSundryCreditorsGroup(companyId);
      const effectiveGroupId = groupId || (defaultGroup ? Number(defaultGroup.id) : null);

      const existingLedger = existingAccountId
        ? coa.find((a) => Number(a.companyId) === companyId && String(a.id) === existingAccountId)
        : null;

      if (existingLedger) {
        return {
          ...vend,
          groupId: effectiveGroupId,
          accountId: existingLedger.id,
        };
      }

      if (!effectiveGroupId) {
        return {
          ...vend,
          groupId: null,
          accountId: existingAccountId || '',
        };
      }

      const group = groups.find((g) => Number(g.id) === Number(effectiveGroupId) && Number(g.companyId) === companyId) || null;
      const type = group ? typeById.get(String(group.typeId)) : null;

      const code = `VEND-${vend.id}`;
      const name = String(vend.displayName || vend.name || '').trim() || `Vendor ${vend.id}`;
      const newLedger = {
        id: nextCoaId++,
        companyId,
        code,
        name,
        ledgerCategory: 'Vendor',
        groupId: effectiveGroupId,
        type: String(type?.accountClass || 'Liability'),
        subType: String(type?.name || ''),
        main: String(type?.main || 'Balance Sheet'),
        balance: Number(vend.balance || 0),
      };
      next.chartOfAccounts.push(newLedger);

      return {
        ...vend,
        groupId: effectiveGroupId,
        accountId: newLedger.id,
      };
    });
  }

  // Ensure GST ledgers exist and keep their balances in sync (derived from saved voucher GST totals)
  {
    const coa = Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : [];
    const groups = Array.isArray(next.accountGroups) ? next.accountGroups : [];
    const types = Array.isArray(next.accountTypes) ? next.accountTypes : [];
    const typeById = new Map(types.map((t) => [String(t.id), t]));

    const sumDocs = (docs, companyId) => {
      const list = Array.isArray(docs) ? docs : [];
      return list.reduce(
        (acc, d) => {
          if (Number(d?.companyId) !== Number(companyId)) return acc;
          acc.cgst += Number(d?.cgstTotal ?? 0);
          acc.sgst += Number(d?.sgstTotal ?? 0);
          acc.igst += Number(d?.igstTotal ?? 0);
          return acc;
        },
        { cgst: 0, sgst: 0, igst: 0 }
      );
    };

    const ensureLedger = ({ companyId, groupId, code, name }) => {
      const group = groups.find((g) => Number(g.companyId) === Number(companyId) && !g.isLegacy && Number(g.id) === Number(groupId)) || null;
      if (!group) return null;
      const type = typeById.get(String(group.typeId)) || null;

      const byCode = coa.find((a) => Number(a.companyId) === Number(companyId) && String(a.code || '').trim().toLowerCase() === String(code || '').trim().toLowerCase());
      if (byCode) {
        return {
          ...byCode,
          name: String(name || '').trim() || byCode.name,
          isSystem: true,
          groupId: Number(group.id),
          ledgerCategory: String(byCode.ledgerCategory || '').trim() || 'General',
          type: String(type?.accountClass || byCode.type || ''),
          subType: String(type?.name || byCode.subType || ''),
          main: String(type?.main || byCode.main || ''),
        };
      }

      const byName = coa.find(
        (a) =>
          Number(a.companyId) === Number(companyId) &&
          String(a.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase() &&
          Number(a.groupId) === Number(group.id)
      );
      if (byName) {
        return {
          ...byName,
          code: String(byName.code || '').trim() || String(code || '').trim(),
          isSystem: true,
          groupId: Number(group.id),
          ledgerCategory: String(byName.ledgerCategory || '').trim() || 'General',
          type: String(type?.accountClass || byName.type || ''),
          subType: String(type?.name || byName.subType || ''),
          main: String(type?.main || byName.main || ''),
        };
      }

      const nextId = coa.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;
      const created = {
        id: nextId,
        companyId: Number(companyId),
        code: String(code || '').trim(),
        name: String(name || '').trim(),
        isSystem: true,
        ledgerCategory: 'General',
        groupId: Number(group.id),
        type: String(type?.accountClass || ''),
        subType: String(type?.name || ''),
        main: String(type?.main || ''),
        balance: 0,
      };
      coa.push(created);
      return created;
    };

    const companies = Array.isArray(next.companies) ? next.companies : [];
    for (const c of companies) {
      const companyId = Number(c?.id);
      if (!companyId) continue;

      const info = templateInfoByCompany.get(companyId) || {};
      const inputGstGroup = info.inputGstGroup && !info.inputGstGroup.isLegacy ? info.inputGstGroup : groups.find((g) => Number(g.companyId) === companyId && !g.isLegacy && String(g.name || '').trim().toLowerCase() === 'input gst');
      const outputGstGroup = info.outputGstGroup && !info.outputGstGroup.isLegacy ? info.outputGstGroup : groups.find((g) => Number(g.companyId) === companyId && !g.isLegacy && String(g.name || '').trim().toLowerCase() === 'output gst');

      if (!inputGstGroup || !outputGstGroup) continue;

      const outCgst = ensureLedger({ companyId, groupId: outputGstGroup.id, code: 'GST-OUT-CGST', name: 'Output CGST' });
      const outSgst = ensureLedger({ companyId, groupId: outputGstGroup.id, code: 'GST-OUT-SGST', name: 'Output SGST' });
      const outIgst = ensureLedger({ companyId, groupId: outputGstGroup.id, code: 'GST-OUT-IGST', name: 'Output IGST' });

      const inCgst = ensureLedger({ companyId, groupId: inputGstGroup.id, code: 'GST-IN-CGST', name: 'Input CGST' });
      const inSgst = ensureLedger({ companyId, groupId: inputGstGroup.id, code: 'GST-IN-SGST', name: 'Input SGST' });
      const inIgst = ensureLedger({ companyId, groupId: inputGstGroup.id, code: 'GST-IN-IGST', name: 'Input IGST' });

      // Persist any ensureLedger updates back into next.chartOfAccounts
      const replaceById = new Map();
      for (const l of [outCgst, outSgst, outIgst, inCgst, inSgst, inIgst]) {
        if (!l) continue;
        replaceById.set(String(l.id), l);
      }
      if (replaceById.size) {
        next.chartOfAccounts = (Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : []).map((a) => {
          if (Number(a.companyId) !== companyId) return a;
          const repl = replaceById.get(String(a.id));
          return repl ? { ...a, ...repl } : a;
        });
      }

      // Compute balances from vouchers (matches GSTR-3B logic + DN/CN adjustments)
      const inv = sumDocs(next.invoices, companyId);
      const cn = sumDocs(next.creditNotes, companyId);
      const bills = sumDocs(next.bills, companyId);
      const exp = sumDocs(next.expenses, companyId);
      const dn = sumDocs(next.debitNotes, companyId);

      const output = {
        cgst: Math.max(0, Number(inv.cgst) - Number(cn.cgst)),
        sgst: Math.max(0, Number(inv.sgst) - Number(cn.sgst)),
        igst: Math.max(0, Number(inv.igst) - Number(cn.igst)),
      };
      const input = {
        cgst: Math.max(0, Number(bills.cgst) + Number(exp.cgst) - Number(dn.cgst)),
        sgst: Math.max(0, Number(bills.sgst) + Number(exp.sgst) - Number(dn.sgst)),
        igst: Math.max(0, Number(bills.igst) + Number(exp.igst) - Number(dn.igst)),
      };

      const updateBalance = (ledger, nextBal) => {
        if (!ledger) return;
        const idStr = String(ledger.id);
        next.chartOfAccounts = (Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : []).map((a) => {
          if (Number(a.companyId) !== companyId) return a;
          if (String(a.id) !== idStr) return a;
          return { ...a, balance: Number.isFinite(nextBal) ? nextBal : 0 };
        });
      };

      updateBalance(outCgst, Number(output.cgst) || 0);
      updateBalance(outSgst, Number(output.sgst) || 0);
      updateBalance(outIgst, Number(output.igst) || 0);
      updateBalance(inCgst, Number(input.cgst) || 0);
      updateBalance(inSgst, Number(input.sgst) || 0);
      updateBalance(inIgst, Number(input.igst) || 0);
    }
  }

  // Cleanup: remove legacy/demo ledgers completely (after ensuring contacts are linked)
  // This rewires references first (journals/customers/vendors) and then removes the old ledgers.
  const cleanupLegacyDemoLedgers = (company) => {
    const companyId = Number(company?.id);
    if (!companyId) return;

    const { docSettings, migrations } = getCompanyDocSettings(company);
    const alreadyApplied = Boolean(migrations.coaTemplateCleanupV1Applied);
    if (alreadyApplied) return;

    const coa = Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : [];
    const groups = Array.isArray(next.accountGroups) ? next.accountGroups : [];
    const types = Array.isArray(next.accountTypes) ? next.accountTypes : [];

    const typeById = new Map(types.map((t) => [String(t.id), t]));
    const groupsByName = new Map();
    for (const g of groups) {
      if (Number(g.companyId) !== companyId) continue;
      if (g.isLegacy) continue;
      groupsByName.set(String(g.name || '').trim().toLowerCase(), g);
    }

    const groupCategoryToLedgerCategoryLocal = (c) => {
      if (c === 'Customer') return 'Customer';
      if (c === 'Vendor') return 'Vendor';
      if (c === 'Expense') return 'Expense';
      return 'General';
    };

    const nextCoaIdBase = coa.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0);
    let nextCoaId = nextCoaIdBase + 1;

    const ensureLedgerInGroup = ({ name, groupNameLower }) => {
      const group = groupsByName.get(String(groupNameLower || '').trim().toLowerCase()) || null;
      if (!group) return null;

      const existing = coa.find(
        (a) =>
          Number(a.companyId) === companyId &&
          String(a.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase() &&
          Number(a.groupId) === Number(group.id)
      );
      if (existing) return existing;

      const type = typeById.get(String(group.typeId)) || null;
      const newLedger = {
        id: nextCoaId++,
        companyId,
        code: `SYS-${String(groupNameLower || '').trim().toUpperCase().replace(/\s+/g, '-')}`,
        name: String(name || '').trim(),
        ledgerCategory: groupCategoryToLedgerCategoryLocal(group.groupCategory),
        groupId: Number(group.id),
        type: String(type?.accountClass || ''),
        subType: String(type?.name || ''),
        main: String(type?.main || ''),
        balance: 0,
      };
      coa.push(newLedger);
      return newLedger;
    };

    const purgeNames = new Set(['accounts receivable', 'accounts payable', 'inventory', 'fixed assets']);
    const candidates = coa.filter((a) => Number(a.companyId) === companyId && purgeNames.has(String(a.name || '').trim().toLowerCase()));
    if (!candidates.length) {
      const appliedAt = new Date().toISOString();
      const nextMigrations = { ...migrations, coaTemplateCleanupV1Applied: true, coaTemplateCleanupV1AppliedAt: appliedAt };
      const nextDocSettings = { ...docSettings, migrations: nextMigrations };
      next.companies = (Array.isArray(next.companies) ? next.companies : []).map((c) =>
        Number(c.id) === companyId ? { ...c, docSettings: nextDocSettings } : c
      );
      return;
    }

    const replacementByName = new Map();
    replacementByName.set('accounts receivable', ensureLedgerInGroup({ name: 'Sundry Debtors', groupNameLower: 'sundry debtors' }));
    replacementByName.set('accounts payable', ensureLedgerInGroup({ name: 'Sundry Creditors', groupNameLower: 'sundry creditors' }));
    replacementByName.set('inventory', ensureLedgerInGroup({ name: 'Stock-in-Hand', groupNameLower: 'stock-in-hand' }));
    replacementByName.set('fixed assets', ensureLedgerInGroup({ name: 'Plant & Machinery', groupNameLower: 'plant & machinery' }));

    const idMap = new Map();
    for (const oldLedger of candidates) {
      const key = String(oldLedger.name || '').trim().toLowerCase();
      const replacement = replacementByName.get(key) || null;
      if (!replacement) continue;
      idMap.set(String(oldLedger.id), String(replacement.id));
    }

    const remapAccountId = (rawId) => {
      const k = String(rawId || '').trim();
      return idMap.get(k) || k;
    };

    if (Array.isArray(next.customers) && idMap.size) {
      next.customers = next.customers.map((c) => {
        if (Number(c.companyId) !== companyId) return c;
        const nextAccountId = remapAccountId(c.accountId);
        return nextAccountId !== String(c.accountId || '') ? { ...c, accountId: nextAccountId } : c;
      });
    }

    if (Array.isArray(next.vendors) && idMap.size) {
      next.vendors = next.vendors.map((v) => {
        if (Number(v.companyId) !== companyId) return v;
        const nextAccountId = remapAccountId(v.accountId);
        return nextAccountId !== String(v.accountId || '') ? { ...v, accountId: nextAccountId } : v;
      });
    }

    if (Array.isArray(next.journalEntries) && idMap.size) {
      next.journalEntries = next.journalEntries.map((j) => {
        if (Number(j.companyId) !== companyId) return j;
        const nextLines = (Array.isArray(j.lines) ? j.lines : []).map((l) => {
          const nextId = remapAccountId(l?.accountId);
          if (nextId === String(l?.accountId || '')) return l;
          const acc = coa.find((a) => Number(a.companyId) === companyId && String(a.id) === String(nextId)) || null;
          return {
            ...l,
            accountId: nextId,
            accountName: acc?.name || l?.accountName || '',
            accountCode: acc?.code || l?.accountCode || '',
          };
        });
        return { ...j, lines: nextLines };
      });
    }

    const idsToRemove = new Set(Array.from(idMap.keys()));
    next.chartOfAccounts = (Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : []).filter(
      (a) => !(Number(a.companyId) === companyId && idsToRemove.has(String(a.id)))
    );

    const appliedAt = new Date().toISOString();
    const nextMigrations = { ...migrations, coaTemplateCleanupV1Applied: true, coaTemplateCleanupV1AppliedAt: appliedAt };
    const nextDocSettings = { ...docSettings, migrations: nextMigrations };
    next.companies = (Array.isArray(next.companies) ? next.companies : []).map((c) =>
      Number(c.id) === companyId ? { ...c, docSettings: nextDocSettings } : c
    );
  };

  for (const c of companies) cleanupLegacyDemoLedgers(c);

  // Cleanup: purge legacy account types/groups (old COA structure) completely.
  // Safety: before deleting groups/types, ensure all ledgers point to a template group.
  const purgeLegacyCOAStructures = (company) => {
    const companyId = Number(company?.id);
    if (!companyId) return;

    const { docSettings, migrations } = getCompanyDocSettings(company);
    const alreadyApplied = Boolean(migrations.coaTemplatePurgeLegacyStructuresV1Applied);
    if (alreadyApplied) return;

    const allGroups = Array.isArray(next.accountGroups) ? next.accountGroups : [];
    const allTypes = Array.isArray(next.accountTypes) ? next.accountTypes : [];

    const typeById = new Map();
    for (const t of allTypes) {
      if (Number(t.companyId) !== companyId) continue;
      typeById.set(String(t.id), t);
    }

    const groupById = new Map();
    for (const g of allGroups) {
      if (Number(g.companyId) !== companyId) continue;
      groupById.set(String(g.id), g);
    }

    const templateGroupsByName = new Map();
    for (const g of allGroups) {
      if (Number(g.companyId) !== companyId) continue;
      if (g.isLegacy) continue;
      if (String(g.name || '').trim().toLowerCase() === 'primary') continue;
      templateGroupsByName.set(String(g.name || '').trim().toLowerCase(), g);
    }

    const getTemplateGroup = (nameLower) => templateGroupsByName.get(String(nameLower || '').trim().toLowerCase()) || null;

    const updateLedgerToGroup = (ledger, group) => {
      const t = group ? typeById.get(String(group.typeId)) : null;
      const derivedType = String(t?.accountClass || ledger.type || '').trim();
      const derivedSubType = String(t?.name || ledger.subType || '').trim();
      const derivedMain = String(t?.main || ledger.main || '').trim();
      return {
        ...ledger,
        groupId: group ? Number(group.id) : ledger.groupId,
        ledgerCategory: group ? groupCategoryToLedgerCategory(group.groupCategory) : ledger.ledgerCategory,
        type: derivedType || ledger.type,
        subType: derivedSubType || ledger.subType,
        main: derivedMain || ledger.main,
      };
    };

    // Step 1: Ensure no ledger still references a legacy/missing group
    if (Array.isArray(next.chartOfAccounts)) {
      next.chartOfAccounts = next.chartOfAccounts.map((a) => {
        if (Number(a.companyId) !== companyId) return a;
        const gidRaw = a?.groupId !== null && a?.groupId !== undefined && a?.groupId !== '' ? String(a.groupId) : '';
        const currentGroup = gidRaw ? groupById.get(gidRaw) : null;
        const isBadGroup = !currentGroup || Boolean(currentGroup.isLegacy) || String(currentGroup.name || '').trim().toLowerCase() === 'primary';
        if (!isBadGroup) return a;

        const targetName = pickTemplateGroupName(a);
        const targetGroup = getTemplateGroup(targetName) || getTemplateGroup('cash-in-hand');
        if (!targetGroup) return a;
        return updateLedgerToGroup(a, targetGroup);
      });
    }

    // Step 2: Delete legacy groups/types for the company
    next.accountGroups = (Array.isArray(next.accountGroups) ? next.accountGroups : []).filter(
      (g) => !(Number(g.companyId) === companyId && (Boolean(g.isLegacy) || String(g.name || '').trim().toLowerCase() === 'primary'))
    );
    next.accountTypes = (Array.isArray(next.accountTypes) ? next.accountTypes : []).filter(
      (t) => !(Number(t.companyId) === companyId && Boolean(t.isLegacy))
    );

    // Stamp migration
    const appliedAt = new Date().toISOString();
    const nextMigrations = { ...migrations, coaTemplatePurgeLegacyStructuresV1Applied: true, coaTemplatePurgeLegacyStructuresV1AppliedAt: appliedAt };
    const nextDocSettings = { ...docSettings, migrations: nextMigrations };
    next.companies = (Array.isArray(next.companies) ? next.companies : []).map((c) =>
      Number(c.id) === companyId ? { ...c, docSettings: nextDocSettings } : c
    );
  };

  for (const c of companies) purgeLegacyCOAStructures(c);

  if (Array.isArray(next.items)) {
    next.items = next.items.map((it) => {
      const openingQtyRaw = it?.openingQty !== undefined && it?.openingQty !== null && it?.openingQty !== ''
        ? it.openingQty
        : it?.stock;

      const openingQty = Number(openingQtyRaw);
      const normalizedOpeningQty = Number.isFinite(openingQty) ? openingQty : 0;

      return {
        ...it,
        openingQty: normalizedOpeningQty,
      };
    });
  }

  if (!Array.isArray(next.payments)) next.payments = [];

  if (Array.isArray(next.invoices)) {
    next.invoices = next.invoices.map((inv) => {
      const raw = String(inv?.status || '').trim();
      const mappedStatus =
        raw === 'Pending'
          ? 'Unpaid'
          : raw === 'Overdue'
            ? 'Over due'
            : raw === 'Over Due'
              ? 'Over due'
              : raw;

      return {
        ...inv,
        paidAmount: Number(inv?.paidAmount ?? 0),
        status: mappedStatus || 'Unpaid',
      };
    });
  }

  if (Array.isArray(next.bills)) {
    next.bills = next.bills.map((b) => {
      const raw = String(b?.status || '').trim();
      const mappedStatus =
        raw === 'Pending'
          ? 'Unpaid'
          : raw === 'Overdue'
            ? 'Over due'
            : raw === 'Over Due'
              ? 'Over due'
              : raw;

      return {
        ...b,
        paidAmount: Number(b?.paidAmount ?? 0),
        status: mappedStatus || 'Unpaid',
      };
    });
  }

  if (Array.isArray(next.expenses)) {
    next.expenses = next.expenses.map((ex) => {
      const raw = String(ex?.status || '').trim();
      const mappedStatus =
        raw === 'Pending'
          ? 'Unpaid'
          : raw === 'Overdue'
            ? 'Over due'
            : raw === 'Over Due'
              ? 'Over due'
              : raw;

      return {
        ...ex,
        paidAmount: Number(ex?.paidAmount ?? 0),
        dueDate: ex?.dueDate || ex?.date || new Date().toISOString().slice(0, 10),
        status: mappedStatus || 'Unpaid',
      };
    });
  }

  if (!Array.isArray(next.gstRates)) {
    const companies = Array.isArray(next.companies) ? next.companies : [];
    const defaultRates = [0, 5, 12, 18, 28];
    let nextId = 1;

    next.gstRates = companies.flatMap((c) =>
      defaultRates.map((rate) => ({
        id: nextId++,
        companyId: c.id,
        rate,
      }))
    );
  }

  if (!Array.isArray(next.uoms)) {
    const companies = Array.isArray(next.companies) ? next.companies : [];
    const defaultUoms = ['Pcs', 'Hours'];
    let nextId = 1;

    next.uoms = companies.flatMap((c) => {
      const fromItems = Array.isArray(next.items)
        ? next.items
            .filter((i) => i.companyId === c.id)
            .map((i) => String(i?.unit || '').trim())
            .filter(Boolean)
        : [];

      const names = Array.from(new Set([...defaultUoms, ...fromItems]));

      return names.map((name) => ({
        id: nextId++,
        companyId: c.id,
        name,
      }));
    });
  }

  // Seed demo vouchers/transactions (one-time per company)
  {
    const seedDemoTransactionsV1 = (company) => {
      const companyId = Number(company?.id);
      if (!companyId) return;

      const { docSettings, migrations } = getCompanyDocSettings(company);
      const demoDisabled = Boolean(migrations.disableDemoSeed || migrations.demoTransactionsV1Disabled);
      const alreadyApplied = Boolean(migrations.demoTransactionsV1Applied);
      if (alreadyApplied || demoDisabled) return;

      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);
      const addDays = (ymd, days) => {
        const dt = new Date(String(ymd || '') || new Date().toISOString());
        if (Number.isNaN(dt.getTime())) return today;
        dt.setDate(dt.getDate() + Number(days || 0));
        return dt.toISOString().slice(0, 10);
      };
      const r2 = (n) => {
        const x = Number(n || 0);
        if (!Number.isFinite(x)) return 0;
        return Math.round(x * 100) / 100;
      };

      // Ensure arrays exist
      if (!Array.isArray(next.invoices)) next.invoices = [];
      if (!Array.isArray(next.creditNotes)) next.creditNotes = [];
      if (!Array.isArray(next.bills)) next.bills = [];
      if (!Array.isArray(next.debitNotes)) next.debitNotes = [];
      if (!Array.isArray(next.purchaseOrders)) next.purchaseOrders = [];
      if (!Array.isArray(next.expenses)) next.expenses = [];
      if (!Array.isArray(next.stockTransfers)) next.stockTransfers = [];
      if (!Array.isArray(next.journalEntries)) next.journalEntries = [];
      if (!Array.isArray(next.bankTransactions)) next.bankTransactions = [];

      const coa = Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : [];
      const groups = Array.isArray(next.accountGroups) ? next.accountGroups : [];
      const customers = Array.isArray(next.customers) ? next.customers : [];
      const vendors = Array.isArray(next.vendors) ? next.vendors : [];
      const items = Array.isArray(next.items) ? next.items : [];

      const bankGroup =
        groups.find((g) => Number(g.companyId) === companyId && String(g.name || '').trim().toLowerCase() === 'bank accounts') || null;
      const cashGroup =
        groups.find((g) => Number(g.companyId) === companyId && String(g.name || '').trim().toLowerCase() === 'cash-in-hand') || null;

      const cashLedger =
        coa.find((a) => Number(a.companyId) === companyId && String(a.name || '').trim().toLowerCase() === 'cash') ||
        (cashGroup
          ? coa.find((a) => Number(a.companyId) === companyId && Number(a.groupId) === Number(cashGroup.id))
          : null) ||
        null;

      const operatingExpensesLedger =
        coa.find((a) => Number(a.companyId) === companyId && String(a.name || '').trim().toLowerCase() === 'operating expenses') || null;

      const bankLedger =
        (bankGroup
          ? coa.find((a) => Number(a.companyId) === companyId && Number(a.groupId) === Number(bankGroup.id))
          : null) ||
        coa.find((a) => Number(a.companyId) === companyId && String(a.name || '').toLowerCase().includes('bank')) ||
        null;

      if (!bankLedger && bankGroup) {
        const nextCoaId = coa.reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;
        const created = {
          id: nextCoaId,
          companyId,
          code: '1010',
          name: 'HDFC Bank',
          type: 'Asset',
          subType: 'Current Assets',
          main: 'Balance Sheet',
          groupId: Number(bankGroup.id),
          ledgerCategory: 'General',
          balance: 120000,
          createdAt: nowIso,
        };
        next.chartOfAccounts = [...coa, created];
      }

      const companyCustomers = customers.filter((c) => Number(c.companyId) === companyId);
      const companyVendors = vendors.filter((v) => Number(v.companyId) === companyId);
      const pickCustomer = companyCustomers[0] || null;
      const pickVendor = companyVendors[0] || null;

      const itemA = items.find((it) => Number(it.companyId) === companyId && String(it.code || '').trim() === 'ITM001') || items[0] || null;
      const itemB = items.find((it) => Number(it.companyId) === companyId && String(it.code || '').trim() === 'ITM002') || items[1] || itemA;
      const service = items.find((it) => Number(it.companyId) === companyId && String(it.code || '').trim() === 'SRV001') || null;

      const makeGstLine = ({ itemId, description, quantity, rate, gstRate }) => {
        const qty = Number(quantity ?? 0);
        const rt = Number(rate ?? 0);
        const gr = Number(gstRate ?? 0);
        const taxable = r2((Number.isFinite(qty) ? qty : 0) * (Number.isFinite(rt) ? rt : 0));
        const gst = r2(taxable * (Number.isFinite(gr) ? gr : 0) / 100);
        const cgst = r2(gst / 2);
        const sgst = r2(gst / 2);
        const lineTotal = r2(taxable + gst);
        return {
          itemId: itemId !== undefined && itemId !== null ? String(itemId) : '',
          description: String(description || '').trim(),
          quantity: Number.isFinite(qty) ? qty : 0,
          rate: Number.isFinite(rt) ? rt : 0,
          gstRate: Number.isFinite(gr) ? gr : 0,
          hsnSac: '',
          amount: taxable,
          taxableAmount: taxable,
          gstAmount: gst,
          cgstAmount: cgst,
          sgstAmount: sgst,
          igstAmount: 0,
          lineTotal,
          taxType: 'CGST_SGST',
        };
      };

      const seedIfEmpty = (listName, rows) => {
        const list = Array.isArray(next[listName]) ? next[listName] : [];
        const companyRows = list.filter((x) => Number(x?.companyId) === companyId);
        if (companyRows.length > 0) return;
        next[listName] = [...list, ...rows];
      };

      // Invoices
      {
        const baseId = (Array.isArray(next.invoices) ? next.invoices : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
        const c = pickCustomer;
        const lines1 = [
          makeGstLine({ itemId: itemA?.id, description: itemA?.name || 'Product A', quantity: 5, rate: 100, gstRate: 18 }),
          makeGstLine({ itemId: itemB?.id, description: itemB?.name || 'Product B', quantity: 2, rate: 200, gstRate: 18 }),
        ];
        const subtotal1 = r2(lines1.reduce((s, l) => s + Number(l.taxableAmount || 0), 0));
        const gstTotal1 = r2(lines1.reduce((s, l) => s + Number(l.gstAmount || 0), 0));
        const total1 = r2(lines1.reduce((s, l) => s + Number(l.lineTotal || 0), 0));

        const lines2 = [
          makeGstLine({ itemId: service?.id || itemA?.id, description: service?.name || 'Consulting', quantity: 3, rate: 150, gstRate: 18 }),
        ];
        const subtotal2 = r2(lines2.reduce((s, l) => s + Number(l.taxableAmount || 0), 0));
        const gstTotal2 = r2(lines2.reduce((s, l) => s + Number(l.gstAmount || 0), 0));
        const total2 = r2(lines2.reduce((s, l) => s + Number(l.lineTotal || 0), 0));

        seedIfEmpty('invoices', [
          {
            id: baseId,
            companyId,
            number: 'INV-1001',
            date: addDays(today, -20),
            dueDate: addDays(today, 10),
            status: 'Unpaid',
            refNo: 'PO-REF-01',
            refDate: addDays(today, -21),
            customerId: c ? String(c.id) : '',
            customerName: c?.displayName || c?.name || 'Customer',
            customerGstin: '',
            placeOfSupplyState: '',
            taxType: 'CGST_SGST',
            items: lines1,
            subtotal: subtotal1,
            cgstTotal: r2(gstTotal1 / 2),
            sgstTotal: r2(gstTotal1 / 2),
            igstTotal: 0,
            gstTotal: gstTotal1,
            total: total1,
            paidAmount: 0,
            createdAt: nowIso,
          },
          {
            id: baseId + 1,
            companyId,
            number: 'INV-1002',
            date: addDays(today, -8),
            dueDate: addDays(today, 22),
            status: 'Partial',
            refNo: '',
            refDate: '',
            customerId: c ? String(c.id) : '',
            customerName: c?.displayName || c?.name || 'Customer',
            customerGstin: '',
            placeOfSupplyState: '',
            taxType: 'CGST_SGST',
            items: lines2,
            subtotal: subtotal2,
            cgstTotal: r2(gstTotal2 / 2),
            sgstTotal: r2(gstTotal2 / 2),
            igstTotal: 0,
            gstTotal: gstTotal2,
            total: total2,
            paidAmount: r2(total2 / 2),
            createdAt: nowIso,
          },
        ]);
      }

      // Credit Notes
      {
        const baseId = (Array.isArray(next.creditNotes) ? next.creditNotes : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
        const firstInv = (Array.isArray(next.invoices) ? next.invoices : []).find(
          (i) => Number(i.companyId) === companyId
        );
        const c = pickCustomer;
        if (firstInv) {
          const cnLines = [makeGstLine({ itemId: itemA?.id, description: itemA?.name || 'Product A (Return)', quantity: 1, rate: 100, gstRate: 18 })];
          const subtotal = r2(cnLines.reduce((s, l) => s + Number(l.taxableAmount || 0), 0));
          const gstTotal = r2(cnLines.reduce((s, l) => s + Number(l.gstAmount || 0), 0));
          const total = r2(cnLines.reduce((s, l) => s + Number(l.lineTotal || 0), 0));

          seedIfEmpty('creditNotes', [
            {
              id: baseId,
              companyId,
              number: 'CN-2001',
              date: addDays(today, -5),
              originalInvoiceId: Number(firstInv.id),
              originalInvoiceNumber: String(firstInv.number || ''),
              customerId: c ? String(c.id) : String(firstInv.customerId || ''),
              customerName: c?.displayName || c?.name || String(firstInv.customerName || ''),
              customerGstin: '',
              placeOfSupplyState: '',
              taxType: 'CGST_SGST',
              items: cnLines,
              subtotal,
              cgstTotal: r2(gstTotal / 2),
              sgstTotal: r2(gstTotal / 2),
              igstTotal: 0,
              gstTotal,
              total,
              status: 'Issued',
              createdAt: nowIso,
            },
          ]);
        }
      }

      // Purchase Orders
      {
        const baseId = (Array.isArray(next.purchaseOrders) ? next.purchaseOrders : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
        const v = pickVendor;
        const poItems = [
          {
            itemId: itemA?.id !== undefined && itemA?.id !== null ? String(itemA.id) : '',
            description: itemA?.name || 'Product A',
            quantity: 10,
            rate: 60,
            amount: r2(10 * 60),
          },
          {
            itemId: itemB?.id !== undefined && itemB?.id !== null ? String(itemB.id) : '',
            description: itemB?.name || 'Product B',
            quantity: 5,
            rate: 120,
            amount: r2(5 * 120),
          },
        ];
        const subtotal = r2(poItems.reduce((s, l) => s + Number(l.amount || 0), 0));

        seedIfEmpty('purchaseOrders', [
          {
            id: baseId,
            companyId,
            number: 'PO-3001',
            date: addDays(today, -12),
            vendorId: v ? String(v.id) : '',
            vendorName: v?.name || 'Vendor',
            items: poItems,
            subtotal,
            total: subtotal,
            notes: 'Demo purchase order',
            status: 'Draft',
            createdAt: nowIso,
          },
        ]);
      }

      // Bills
      {
        const baseId = (Array.isArray(next.bills) ? next.bills : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
        const v = pickVendor;
        const billLines = [
          makeGstLine({ itemId: itemA?.id, description: itemA?.name || 'Product A', quantity: 10, rate: 60, gstRate: 18 }),
          makeGstLine({ itemId: itemB?.id, description: itemB?.name || 'Product B', quantity: 5, rate: 120, gstRate: 18 }),
        ];
        const subtotal = r2(billLines.reduce((s, l) => s + Number(l.taxableAmount || 0), 0));
        const gstTotal = r2(billLines.reduce((s, l) => s + Number(l.gstAmount || 0), 0));
        const total = r2(billLines.reduce((s, l) => s + Number(l.lineTotal || 0), 0));

        seedIfEmpty('bills', [
          {
            id: baseId,
            companyId,
            number: 'BILL-4001',
            date: addDays(today, -15),
            dueDate: addDays(today, 15),
            status: 'Unpaid',
            refNo: 'SUP-INV-8899',
            refDate: addDays(today, -15),
            vendorId: v ? String(v.id) : '',
            vendorName: v?.name || 'Vendor',
            vendorGstin: '',
            placeOfSupplyState: '',
            taxType: 'CGST_SGST',
            items: billLines,
            subtotal,
            cgstTotal: r2(gstTotal / 2),
            sgstTotal: r2(gstTotal / 2),
            igstTotal: 0,
            gstTotal,
            total,
            paidAmount: 0,
            createdAt: nowIso,
          },
        ]);
      }

      // Debit Notes
      {
        const baseId = (Array.isArray(next.debitNotes) ? next.debitNotes : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
        const firstBill = (Array.isArray(next.bills) ? next.bills : []).find((b) => Number(b.companyId) === companyId);
        const v = pickVendor;
        if (firstBill) {
          const dnLines = [makeGstLine({ itemId: itemA?.id, description: itemA?.name || 'Product A (Return)', quantity: 2, rate: 60, gstRate: 18 })];
          const subtotal = r2(dnLines.reduce((s, l) => s + Number(l.taxableAmount || 0), 0));
          const gstTotal = r2(dnLines.reduce((s, l) => s + Number(l.gstAmount || 0), 0));
          const total = r2(dnLines.reduce((s, l) => s + Number(l.lineTotal || 0), 0));

          seedIfEmpty('debitNotes', [
            {
              id: baseId,
              companyId,
              number: 'DN-5001',
              date: addDays(today, -3),
              originalBillId: Number(firstBill.id),
              originalBillNumber: String(firstBill.number || ''),
              vendorId: v ? String(v.id) : String(firstBill.vendorId || ''),
              vendorName: v?.name || String(firstBill.vendorName || '') || 'Vendor',
              vendorGstin: '',
              placeOfSupplyState: '',
              taxType: 'CGST_SGST',
              items: dnLines,
              subtotal,
              cgstTotal: r2(gstTotal / 2),
              sgstTotal: r2(gstTotal / 2),
              igstTotal: 0,
              gstTotal,
              total,
              status: 'Issued',
              createdAt: nowIso,
            },
          ]);
        }
      }

      // Expenses
      {
        const baseId = (Array.isArray(next.expenses) ? next.expenses : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
        const v = pickVendor;
        const amount = 2000;
        const gstRate = 18;
        const taxableTotal = r2(amount);
        const gstTotal = r2(taxableTotal * gstRate / 100);
        const total = r2(taxableTotal + gstTotal);

        seedIfEmpty('expenses', [
          {
            id: baseId,
            companyId,
            number: 'EXP-6001',
            date: addDays(today, -9),
            dueDate: addDays(today, 21),
            status: 'Unpaid',
            description: 'Office Rent (Demo)',
            category: 'Operating',
            vendorId: v ? String(v.id) : '',
            vendorName: v?.name || 'Vendor',
            vendorGstin: '',
            placeOfSupplyState: '',
            refNo: 'RENT-DEC',
            refDate: addDays(today, -9),
            amount: taxableTotal,
            gstRate,
            taxableTotal,
            cgstTotal: r2(gstTotal / 2),
            sgstTotal: r2(gstTotal / 2),
            igstTotal: 0,
            gstTotal,
            total,
            paidAmount: 0,
            createdAt: nowIso,
          },
        ]);
      }

      // Journal Entries
      {
        const baseId = (Array.isArray(next.journalEntries) ? next.journalEntries : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
        const expenseLedger = operatingExpensesLedger;
        const cashAcc = cashLedger ||
          (Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : []).find(
            (a) => Number(a.companyId) === companyId && String(a.name || '').trim().toLowerCase() === 'cash'
          );

        if (expenseLedger && cashAcc) {
          seedIfEmpty('journalEntries', [
            {
              id: baseId,
              companyId,
              number: 'JE-7001',
              date: addDays(today, -6),
              narration: 'Demo JV: Office expenses paid in cash',
              lines: [
                {
                  accountId: String(expenseLedger.id),
                  debit: 1500,
                  credit: 0,
                  accountName: expenseLedger.name,
                  accountCode: expenseLedger.code,
                },
                {
                  accountId: String(cashAcc.id),
                  debit: 0,
                  credit: 1500,
                  accountName: cashAcc.name,
                  accountCode: cashAcc.code,
                },
              ],
              totalDebit: 1500,
              totalCredit: 1500,
              createdAt: nowIso,
            },
          ]);
        }
      }

      // Bank / Cash transactions (Cash & Bank module)
      {
        const baseId = (Array.isArray(next.bankTransactions) ? next.bankTransactions : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;
        const cashId = cashLedger ? Number(cashLedger.id) : null;
        const bankId =
          (bankGroup
            ? (Array.isArray(next.chartOfAccounts) ? next.chartOfAccounts : []).find(
                (a) => Number(a.companyId) === companyId && Number(a.groupId) === Number(bankGroup.id)
              )
            : null)?.id || null;

        if (cashId || bankId) {
          seedIfEmpty('bankTransactions', [
            {
              id: baseId,
              companyId,
              cashBankAccountId: cashId || Number(bankId),
              date: addDays(today, -7),
              direction: 'IN',
              ledgerId: null,
              amount: 5000,
              narration: 'Cash receipt (Uncategorised demo)',
              description: 'Cash receipt (Uncategorised demo)',
              reference: '',
              linkedPaymentId: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            {
              id: baseId + 1,
              companyId,
              cashBankAccountId: bankId ? Number(bankId) : Number(cashId),
              date: addDays(today, -4),
              direction: 'OUT',
              ledgerId: null,
              amount: 2500,
              narration: 'Bank payment (Uncategorised demo)',
              description: 'Bank payment (Uncategorised demo)',
              reference: '',
              linkedPaymentId: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
            {
              id: baseId + 2,
              companyId,
              cashBankAccountId: cashId || Number(bankId),
              date: addDays(today, -2),
              direction: 'OUT',
              ledgerId: operatingExpensesLedger ? Number(operatingExpensesLedger.id) : null,
              amount: 1200,
              narration: 'Office supplies (Operating Expenses)',
              description: 'Office supplies (Operating Expenses)',
              reference: '',
              linkedPaymentId: null,
              createdAt: nowIso,
              updatedAt: nowIso,
            },
          ]);
        }
      }

      // Stamp migration
      const appliedAt = nowIso;
      const nextMigrations = { ...migrations, demoTransactionsV1Applied: true, demoTransactionsV1AppliedAt: appliedAt };
      const nextDocSettings = { ...docSettings, migrations: nextMigrations };
      next.companies = (Array.isArray(next.companies) ? next.companies : []).map((c) =>
        Number(c.id) === companyId ? { ...c, docSettings: nextDocSettings } : c
      );
    };

    const companies = Array.isArray(next.companies) ? next.companies : [];
    for (const c of companies) seedDemoTransactionsV1(c);
  }

  // Ensure openingBalance exists and keep ledger balances in sync with vouchers/payments/journals.
  // This makes Trial Balance / P&L / Balance Sheet reflect operational data.
  {
    const safeArray = (v) => (Array.isArray(v) ? v : []);
    const lower = (s) => String(s || '').trim().toLowerCase();
    const r2 = (n) => {
      const x = Number(n ?? 0);
      if (!Number.isFinite(x)) return 0;
      return Math.round(x * 100) / 100;
    };
    const isDebitNature = (type) => ['asset', 'expense'].includes(lower(type));

    const nextId = (arr) => safeArray(arr).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) + 1;

    const findGroupIdByName = (companyId, nameLower) => {
      const groups = safeArray(next.accountGroups).filter((g) => Number(g?.companyId) === Number(companyId));
      const hit = groups.find((g) => lower(g?.name) === lower(nameLower));
      return hit ? Number(hit.id) : null;
    };

    const ensureControlAccount = (companyId, { code, name, type, subType, main, groupId }) => {
      const accounts = safeArray(next.chartOfAccounts);
      const existing = accounts.find(
        (a) =>
          Number(a?.companyId) === Number(companyId) &&
          ((code && lower(a?.code) === lower(code)) || (name && lower(a?.name) === lower(name)))
      );
      if (existing) return String(existing.id);

      const created = {
        id: nextId(next.chartOfAccounts),
        companyId: Number(companyId),
        code: String(code || ''),
        name: String(name || ''),
        type,
        subType,
        main,
        groupId: groupId ?? null,
        balance: 0,
        openingBalance: 0,
      };
      next.chartOfAccounts = [...accounts, created];
      return String(created.id);
    };

    // Migration: remove old demo seed balances (Cash 50k etc) that otherwise show up in Trial Balance.
    // Safe: only applies when balances/openingBalance match the known old demo seed amounts.
    const getCompanyDocSettingsSafe = (company) => {
      const doc = company?.docSettings && typeof company.docSettings === 'object' ? company.docSettings : {};
      const migrations = doc?.migrations && typeof doc.migrations === 'object' ? doc.migrations : {};
      return { docSettings: doc, migrations };
    };

    {
      const companies = safeArray(next.companies);
      for (const c of companies) {
        const companyId = Number(c?.id);
        if (!companyId) continue;

        const { docSettings, migrations } = getCompanyDocSettingsSafe(c);
        if (migrations.demoSeedOpeningBalancesResetV1Applied) continue;

        const seedRules = [
          { code: '1000', amount: 50000 },
          { code: '1010', amount: 120000 },
          { code: '2100', amount: 20000 },
          { code: '3000', amount: 130000 },
        ];
        const seedByCode = new Map(seedRules.map((r) => [String(r.code), Number(r.amount)]));

        let changed = false;
        next.chartOfAccounts = safeArray(next.chartOfAccounts).map((a) => {
          if (Number(a?.companyId) !== companyId) return a;
          const code = String(a?.code || '').trim();
          if (!seedByCode.has(code)) return a;

          const expected = Number(seedByCode.get(code) ?? 0);
          const bal = Number(a?.balance ?? 0);
          const opening = a?.openingBalance !== undefined && a?.openingBalance !== null ? Number(a.openingBalance) : null;

          const balMatches = Number.isFinite(bal) && Math.abs(bal - expected) < 0.01;
          // Only consider openingBalance a match if it actually exists.
          // If openingBalance is missing, we rely on balance matching the known legacy demo amount.
          const openingMatches = opening === null ? false : (Number.isFinite(opening) && Math.abs(opening - expected) < 0.01);

          if (!balMatches && !openingMatches) return a;

          changed = true;
          return {
            ...a,
            openingBalance: 0,
            balance: 0,
          };
        });

        if (changed) {
          const appliedAt = new Date().toISOString();
          const nextMigrations = { ...migrations, demoSeedOpeningBalancesResetV1Applied: true, demoSeedOpeningBalancesResetV1AppliedAt: appliedAt };
          const nextDocSettings = { ...docSettings, migrations: nextMigrations };
          next.companies = safeArray(next.companies).map((cc) => (Number(cc?.id) === companyId ? { ...cc, docSettings: nextDocSettings } : cc));
        }
      }
    }

    // One-time-ish migration: capture current balance as openingBalance if missing.
    // GST ledgers are always derived, so their openingBalance is forced to 0.
    next.chartOfAccounts = safeArray(next.chartOfAccounts).map((a) => {
      const codeLower = lower(a?.code);
      const isGst = codeLower.startsWith('gst-');
      const currentBalance = Number(a?.balance ?? 0);
      const existingOpening = a?.openingBalance;
      const opening = existingOpening !== undefined && existingOpening !== null ? Number(existingOpening) : currentBalance;

      return {
        ...a,
        openingBalance: isGst ? 0 : Number.isFinite(opening) ? opening : 0,
        balance: Number.isFinite(currentBalance) ? currentBalance : 0,
      };
    });

    // Ensure every company has AR/AP control ledgers so accrual postings always hit chartOfAccounts.
    // Also auto-link customers/vendors to these control ledgers when they don't have accountId.
    {
      const companies = safeArray(next.companies);
      for (const c of companies) {
        const companyId = Number(c?.id);
        if (!companyId) continue;

        const debtorsGroupId = findGroupIdByName(companyId, 'sundry debtors');
        const creditorsGroupId = findGroupIdByName(companyId, 'sundry creditors');
        const outstandingExpensesGroupId = findGroupIdByName(companyId, 'outstanding expenses');
        const depositsGroupId = findGroupIdByName(companyId, 'deposits (asset)');

        const arId = ensureControlAccount(companyId, {
          code: '1100',
          name: 'Accounts Receivable',
          type: 'Asset',
          subType: 'Current Assets',
          main: 'Balance Sheet',
          groupId: debtorsGroupId,
        });

        const apId = ensureControlAccount(companyId, {
          code: '2000',
          name: 'Accounts Payable',
          type: 'Liability',
          subType: 'Current Liabilities',
          main: 'Balance Sheet',
          groupId: creditorsGroupId,
        });

        // Used when an expense/payment has no vendor.
        ensureControlAccount(companyId, {
          code: '2050',
          name: 'Outstanding Expenses',
          type: 'Liability',
          subType: 'Current Liabilities',
          main: 'Balance Sheet',
          groupId: outstandingExpensesGroupId,
        });

        // Fallback account to keep double-entry balanced when some reference is missing/invalid.
        ensureControlAccount(companyId, {
          code: '9999',
          name: 'Suspense / Uncategorised',
          type: 'Asset',
          subType: 'Current Assets',
          main: 'Balance Sheet',
          groupId: depositsGroupId,
        });

        const validAccountIds = new Set(
          safeArray(next.chartOfAccounts)
            .filter((a) => Number(a?.companyId) === companyId)
            .map((a) => String(a.id))
        );

        next.customers = safeArray(next.customers).map((cu) => {
          if (Number(cu?.companyId) !== companyId) return cu;
          const cur = cu?.accountId !== undefined && cu?.accountId !== null ? String(cu.accountId).trim() : '';
          if (cur && validAccountIds.has(cur)) return cu;
          return { ...cu, accountId: Number(arId) };
        });

        next.vendors = safeArray(next.vendors).map((v) => {
          if (Number(v?.companyId) !== companyId) return v;
          const cur = v?.accountId !== undefined && v?.accountId !== null ? String(v.accountId).trim() : '';
          if (cur && validAccountIds.has(cur)) return v;
          return { ...v, accountId: Number(apId) };
        });
      }
    }

    const companies = safeArray(next.companies);
    const allAccounts = safeArray(next.chartOfAccounts);
    const allCustomers = safeArray(next.customers);
    const allVendors = safeArray(next.vendors);
    const allInvoices = safeArray(next.invoices);
    const allCreditNotes = safeArray(next.creditNotes);
    const allBills = safeArray(next.bills);
    const allDebitNotes = safeArray(next.debitNotes);
    const allExpenses = safeArray(next.expenses);
    const allJournals = safeArray(next.journalEntries);
    const allPayments = safeArray(next.payments);
    const allBankTxns = safeArray(next.bankTransactions);

    const computedBalanceByAccountId = new Map();

    for (const company of companies) {
      const companyId = Number(company?.id);
      if (!companyId) continue;

      const accounts = allAccounts.filter((a) => Number(a.companyId) === companyId);
      const accountById = new Map(accounts.map((a) => [String(a.id), a]));

      const customers = allCustomers.filter((c) => Number(c.companyId) === companyId);
      const customerById = new Map(customers.map((c) => [String(c.id), c]));

      const vendors = allVendors.filter((v) => Number(v.companyId) === companyId);
      const vendorById = new Map(vendors.map((v) => [String(v.id), v]));

      const findAccountIdByName = (nameLower) => {
        const hit = accounts.find((a) => lower(a.name) === String(nameLower || '').trim().toLowerCase());
        return hit ? String(hit.id) : '';
      };
      const findAccountIdByCode = (codeLower) => {
        const hit = accounts.find((a) => lower(a.code) === String(codeLower || '').trim().toLowerCase());
        return hit ? String(hit.id) : '';
      };

      const cashAccountId = findAccountIdByName('cash');
      const defaultBankAccountId =
        findAccountIdByName('hdfc bank') ||
        String(accounts.find((a) => lower(a.name).includes('bank'))?.id || '') ||
        cashAccountId;

      const salesRevenueId = findAccountIdByName('sales revenue') || String(accounts.find((a) => lower(a.type) === 'income')?.id || '');
      const purchaseAccountsId =
        findAccountIdByName('purchase accounts') || String(accounts.find((a) => lower(a.name).includes('purchase'))?.id || '');
      const operatingExpensesId =
        findAccountIdByName('operating expenses') || String(accounts.find((a) => lower(a.type) === 'expense')?.id || '');
      const suspenseAccountId =
        findAccountIdByCode('9999') ||
        findAccountIdByName('suspense / uncategorised') ||
        findAccountIdByName('suspense');
      const outstandingExpensesId = findAccountIdByName('outstanding expenses') || findAccountIdByCode('2050') || suspenseAccountId;

      const gstOutCgstId = findAccountIdByCode('gst-out-cgst') || findAccountIdByName('output cgst');
      const gstOutSgstId = findAccountIdByCode('gst-out-sgst') || findAccountIdByName('output sgst');
      const gstOutIgstId = findAccountIdByCode('gst-out-igst') || findAccountIdByName('output igst');

      const gstInCgstId = findAccountIdByCode('gst-in-cgst') || findAccountIdByName('input cgst');
      const gstInSgstId = findAccountIdByCode('gst-in-sgst') || findAccountIdByName('input sgst');
      const gstInIgstId = findAccountIdByCode('gst-in-igst') || findAccountIdByName('input igst');

      const deltaById = new Map();
      const addDelta = (accountId, debit, credit) => {
        const id = String(accountId || '').trim();
        if (!id) return;
        const acc = accountById.get(id);
        if (!acc) return;

        const d = r2(Number(debit ?? 0));
        const c = r2(Number(credit ?? 0));
        if (!d && !c) return;

        const cur = Number(deltaById.get(id) ?? 0);
        const effect = isDebitNature(acc.type) ? d - c : c - d;
        deltaById.set(id, r2(cur + effect));
      };

      const post = (accountId, debit, credit) => addDelta(accountId, debit, credit);

      // Journal Entries (direct postings)
      for (const j of allJournals) {
        if (Number(j?.companyId) !== companyId) continue;
        const lines = safeArray(j?.lines);
        let totalDebit = 0;
        let totalCredit = 0;
        for (const l of lines) {
          const rawId = String(l?.accountId || '').trim();
          const id = rawId && accountById.has(rawId) ? rawId : suspenseAccountId;

          const d = Number(l?.debit ?? 0);
          const c = Number(l?.credit ?? 0);
          totalDebit += Number.isFinite(d) ? d : 0;
          totalCredit += Number.isFinite(c) ? c : 0;

          post(id, d, c);
        }

        const diff = r2(totalDebit - totalCredit);
        if (diff > 0.009) {
          post(suspenseAccountId, 0, diff);
        } else if (diff < -0.009) {
          post(suspenseAccountId, -diff, 0);
        }
      }

      // Invoices (accrual)
      for (const inv of allInvoices) {
        if (Number(inv?.companyId) !== companyId) continue;
        const st = lower(inv?.status);
        if (st === 'draft' || st === 'cancelled') continue;

        const customerId = String(inv?.customerId || '').trim();
        const customer = customerById.get(customerId) || null;
        const customerAccountIdRaw = customer?.accountId !== undefined && customer?.accountId !== null ? String(customer.accountId) : '';
        const customerAccountId = customerAccountIdRaw && accountById.has(customerAccountIdRaw) ? customerAccountIdRaw : suspenseAccountId;

        const subtotal = Number(inv?.subtotal ?? inv?.taxableTotal ?? 0);
        const cgst = Number(inv?.cgstTotal ?? 0);
        const sgst = Number(inv?.sgstTotal ?? 0);
        const igst = Number(inv?.igstTotal ?? 0);
        const total = r2(subtotal + cgst + sgst + igst);

        post(customerAccountId, total, 0);
        post(salesRevenueId, 0, subtotal);
        post(gstOutCgstId, 0, cgst);
        post(gstOutSgstId, 0, sgst);
        post(gstOutIgstId, 0, igst);
      }

      // Credit Notes (reverse sales)
      for (const cn of allCreditNotes) {
        if (Number(cn?.companyId) !== companyId) continue;
        const st = lower(cn?.status);
        if (st === 'draft' || st === 'cancelled') continue;

        const customerId = String(cn?.customerId || '').trim();
        const customer = customerById.get(customerId) || null;
        const customerAccountIdRaw = customer?.accountId !== undefined && customer?.accountId !== null ? String(customer.accountId) : '';
        const customerAccountId = customerAccountIdRaw && accountById.has(customerAccountIdRaw) ? customerAccountIdRaw : suspenseAccountId;

        const subtotal = Number(cn?.subtotal ?? cn?.taxableTotal ?? 0);
        const cgst = Number(cn?.cgstTotal ?? 0);
        const sgst = Number(cn?.sgstTotal ?? 0);
        const igst = Number(cn?.igstTotal ?? 0);
        const total = r2(subtotal + cgst + sgst + igst);

        post(customerAccountId, 0, total);
        post(salesRevenueId, subtotal, 0);
        post(gstOutCgstId, cgst, 0);
        post(gstOutSgstId, sgst, 0);
        post(gstOutIgstId, igst, 0);
      }

      // Bills (accrual purchases)
      for (const b of allBills) {
        if (Number(b?.companyId) !== companyId) continue;
        const st = lower(b?.status);
        if (st === 'draft' || st === 'cancelled') continue;

        const vendorId = String(b?.vendorId || '').trim();
        const vendor = vendorById.get(vendorId) || null;
        const vendorAccountIdRaw = vendor?.accountId !== undefined && vendor?.accountId !== null ? String(vendor.accountId) : '';
        const vendorAccountId = vendorAccountIdRaw && accountById.has(vendorAccountIdRaw) ? vendorAccountIdRaw : suspenseAccountId;

        const subtotal = Number(b?.subtotal ?? b?.taxableTotal ?? 0);
        const cgst = Number(b?.cgstTotal ?? 0);
        const sgst = Number(b?.sgstTotal ?? 0);
        const igst = Number(b?.igstTotal ?? 0);
        const total = r2(subtotal + cgst + sgst + igst);

        post(purchaseAccountsId, subtotal, 0);
        post(gstInCgstId, cgst, 0);
        post(gstInSgstId, sgst, 0);
        post(gstInIgstId, igst, 0);
        post(vendorAccountId, 0, total);
      }

      // Debit Notes (reverse purchases)
      for (const dn of allDebitNotes) {
        if (Number(dn?.companyId) !== companyId) continue;
        const st = lower(dn?.status);
        if (st === 'draft' || st === 'cancelled') continue;

        const vendorId = String(dn?.vendorId || '').trim();
        const vendor = vendorById.get(vendorId) || null;
        const vendorAccountIdRaw = vendor?.accountId !== undefined && vendor?.accountId !== null ? String(vendor.accountId) : '';
        const vendorAccountId = vendorAccountIdRaw && accountById.has(vendorAccountIdRaw) ? vendorAccountIdRaw : suspenseAccountId;

        const subtotal = Number(dn?.subtotal ?? dn?.taxableTotal ?? 0);
        const cgst = Number(dn?.cgstTotal ?? 0);
        const sgst = Number(dn?.sgstTotal ?? 0);
        const igst = Number(dn?.igstTotal ?? 0);
        const total = r2(subtotal + cgst + sgst + igst);

        post(vendorAccountId, total, 0);
        post(purchaseAccountsId, 0, subtotal);
        post(gstInCgstId, 0, cgst);
        post(gstInSgstId, 0, sgst);
        post(gstInIgstId, 0, igst);
      }

      // Expenses (accrual)
      for (const ex of allExpenses) {
        if (Number(ex?.companyId) !== companyId) continue;
        const st = lower(ex?.status);
        if (st === 'draft' || st === 'cancelled') continue;

        const taxable = Number(ex?.taxableTotal ?? ex?.amount ?? 0);
        const cgst = Number(ex?.cgstTotal ?? 0);
        const sgst = Number(ex?.sgstTotal ?? 0);
        const igst = Number(ex?.igstTotal ?? 0);
        const total = r2(taxable + cgst + sgst + igst);

        const vendorId = String(ex?.vendorId || '').trim();
        const vendor = vendorById.get(vendorId) || null;
        const vendorAccountIdRaw = vendor?.accountId !== undefined && vendor?.accountId !== null ? String(vendor.accountId) : '';
        const vendorAccountId = vendorAccountIdRaw && accountById.has(vendorAccountIdRaw) ? vendorAccountIdRaw : '';
        const creditAccountId = vendorAccountId || outstandingExpensesId || suspenseAccountId;

        post(operatingExpensesId, taxable, 0);
        post(gstInCgstId, cgst, 0);
        post(gstInSgstId, sgst, 0);
        post(gstInIgstId, igst, 0);
        post(creditAccountId, 0, total);
      }

      // Payments / Receipts (settlement)
      const resolveCashBankAccountId = (p) => {
        const explicit = p?.cashBankAccountId !== undefined && p?.cashBankAccountId !== null ? String(p.cashBankAccountId) : '';
        if (explicit && accountById.has(explicit)) return explicit;
        const mode = lower(p?.mode);
        if (mode === 'cash') return cashAccountId;
        return defaultBankAccountId || cashAccountId;
      };

      const invoiceById = new Map(
        allInvoices
          .filter((i) => Number(i?.companyId) === companyId)
          .map((i) => [String(i.id), i])
      );
      const billById = new Map(
        allBills
          .filter((b) => Number(b?.companyId) === companyId)
          .map((b) => [String(b.id), b])
      );
      const expenseById = new Map(
        allExpenses
          .filter((e) => Number(e?.companyId) === companyId)
          .map((e) => [String(e.id), e])
      );

      for (const p of allPayments) {
        if (Number(p?.companyId) !== companyId) continue;

        const dir = lower(p?.direction);
        const amount = Number(p?.amount ?? 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;

        const cashBankId = resolveCashBankAccountId(p);

        if (dir === 'in') {
          // Credit customer (reduce receivable / create advance), Debit cash/bank
          let customerId = p?.customerId !== undefined && p?.customerId !== null ? String(p.customerId) : '';
          if (!customerId && p?.voucherType === 'invoice') {
            const inv = invoiceById.get(String(p?.voucherId || '')) || null;
            customerId = inv ? String(inv.customerId || '') : '';
          }

          const customer = customerById.get(String(customerId || '').trim()) || null;
          const customerAccountIdRaw = customer?.accountId !== undefined && customer?.accountId !== null ? String(customer.accountId) : '';
          const customerAccountId = customerAccountIdRaw && accountById.has(customerAccountIdRaw) ? customerAccountIdRaw : suspenseAccountId;

          post(cashBankId, amount, 0);
          post(customerAccountId, 0, amount);
        } else if (dir === 'out') {
          // Debit vendor (reduce payable / create advance), Credit cash/bank
          let vendorId = p?.vendorId !== undefined && p?.vendorId !== null ? String(p.vendorId) : '';

          if (!vendorId && p?.voucherType === 'bill') {
            const bill = billById.get(String(p?.voucherId || '')) || null;
            vendorId = bill ? String(bill.vendorId || '') : '';
          }
          if (!vendorId && p?.voucherType === 'expense') {
            const ex = expenseById.get(String(p?.voucherId || '')) || null;
            vendorId = ex ? String(ex.vendorId || '') : '';
          }

          const vendor = vendorById.get(String(vendorId || '').trim()) || null;
          const vendorAccountIdRaw = vendor?.accountId !== undefined && vendor?.accountId !== null ? String(vendor.accountId) : '';
          const vendorAccountId = vendorAccountIdRaw && accountById.has(vendorAccountIdRaw) ? vendorAccountIdRaw : '';
          const debitAccountId = vendorAccountId || outstandingExpensesId || suspenseAccountId;

          post(debitAccountId, amount, 0);
          post(cashBankId, 0, amount);
        }
      }

      // Cash/Bank module transactions (only when not already linked to a payment/receipt record)
      for (const t of allBankTxns) {
        if (Number(t?.companyId) !== companyId) continue;
        const linked = t?.linkedPaymentId !== undefined && t?.linkedPaymentId !== null ? Number(t.linkedPaymentId) : null;
        if (linked) continue;
        const cashBankId = String(t?.cashBankAccountId || '').trim();
        const counterIdRaw = String(t?.ledgerId || '').trim();
        if (!cashBankId) continue;
        const counterId = counterIdRaw && accountById.has(counterIdRaw) ? counterIdRaw : suspenseAccountId;
        const amt = Number(t?.amount ?? 0);
        if (!Number.isFinite(amt) || amt <= 0) continue;
        const dir = lower(t?.direction);
        if (dir === 'in') {
          post(cashBankId, amt, 0);
          post(counterId, 0, amt);
        } else if (dir === 'out') {
          post(counterId, amt, 0);
          post(cashBankId, 0, amt);
        }
      }

      // Compute final balances for this company
      for (const acc of accounts) {
        const id = String(acc.id);
        const opening = Number(acc?.openingBalance ?? 0);
        const delta = Number(deltaById.get(id) ?? 0);
        computedBalanceByAccountId.set(id, r2(opening + delta));
      }

      // Ensure Trial Balance balances by absorbing any residual difference into Suspense.
      // This covers legacy/partial data (e.g., opening balances without equity offset) and rounding drift.
      if (suspenseAccountId) {
        const suspenseAcc = accountById.get(String(suspenseAccountId)) || null;
        const suspenseSign = suspenseAcc ? (isDebitNature(suspenseAcc.type) ? 1 : -1) : 1;

        const diff = r2(
          accounts.reduce((sum, acc) => {
            const bal = Number(computedBalanceByAccountId.get(String(acc.id)) ?? 0);
            const sign = isDebitNature(acc.type) ? 1 : -1;
            return sum + sign * bal;
          }, 0)
        );

        if (Math.abs(diff) > 0.01) {
          const current = Number(computedBalanceByAccountId.get(String(suspenseAccountId)) ?? 0);
          // New diff = diff + suspenseSign * adjustment => 0 => adjustment = -diff / suspenseSign
          const adjustment = suspenseSign === -1 ? diff : -diff;
          computedBalanceByAccountId.set(String(suspenseAccountId), r2(current + adjustment));
        }
      }
    }

    if (computedBalanceByAccountId.size) {
      next.chartOfAccounts = safeArray(next.chartOfAccounts).map((a) => {
        const id = String(a?.id);
        if (!computedBalanceByAccountId.has(id)) return a;
        return { ...a, balance: computedBalanceByAccountId.get(id) };
      });
    }
  }

  return next;
};

export const buildLedgerStatement = (db, companyId, accountId) => {
  const safeArray = (v) => (Array.isArray(v) ? v : []);
  const lower = (s) => String(s || '').trim().toLowerCase();
  const r2 = (n) => {
    const x = Number(n ?? 0);
    if (!Number.isFinite(x)) return 0;
    return Math.round(x * 100) / 100;
  };
  const isDebitNature = (type) => ['asset', 'expense'].includes(lower(type));

  const safeText = (v) => String(v ?? '').trim();
  const joinAddress = (addr) => {
    const a = addr && typeof addr === 'object' ? addr : {};
    const parts = [a.line1, a.line2, a.city, a.district, a.state, a.pincode, a.country].map((x) => safeText(x)).filter(Boolean);
    return parts.join(', ');
  };
  const truncate = (s, max = 160) => {
    const str = String(s ?? '');
    if (str.length <= max) return str;
    return `${str.slice(0, Math.max(0, max - 1))}…`;
  };

  const cid = Number(companyId);
  const targetId = String(accountId || '').trim();
  if (!cid || !targetId) return { account: null, rows: [] };

  const accounts = safeArray(db?.chartOfAccounts).filter((a) => Number(a?.companyId) === cid);
  const accountById = new Map(accounts.map((a) => [String(a.id), a]));
  const target = accountById.get(targetId) || null;
  if (!target) return { account: null, rows: [] };

  const findAccountIdByName = (nameLower) => {
    const hit = accounts.find((a) => lower(a?.name) === lower(nameLower));
    return hit ? String(hit.id) : '';
  };
  const findAccountIdByCode = (codeLower) => {
    const hit = accounts.find((a) => lower(a?.code) === lower(codeLower));
    return hit ? String(hit.id) : '';
  };

  const suspenseId = findAccountIdByCode('9999') || findAccountIdByName('suspense / uncategorised') || findAccountIdByName('suspense');
  const arId = findAccountIdByCode('1100') || findAccountIdByName('accounts receivable') || findAccountIdByName('sundry debtors');
  const apId = findAccountIdByCode('2000') || findAccountIdByName('accounts payable') || findAccountIdByName('sundry creditors');
  const outstandingExpensesId = findAccountIdByCode('2050') || findAccountIdByName('outstanding expenses') || suspenseId;

  const customers = safeArray(db?.customers).filter((c) => Number(c?.companyId) === cid);
  const customerById = new Map(customers.map((c) => [String(c.id), c]));
  const vendors = safeArray(db?.vendors).filter((v) => Number(v?.companyId) === cid);
  const vendorById = new Map(vendors.map((v) => [String(v.id), v]));

  const items = safeArray(db?.items).filter((i) => Number(i?.companyId) === cid);
  const itemById = new Map(items.map((i) => [String(i.id), i]));

  const summarizeItems = (lines) => {
    const list = safeArray(lines);
    if (!list.length) return '';
    const parts = list
      .map((l) => {
        const item = l?.itemId ? itemById.get(String(l.itemId)) : null;
        const name = safeText(item?.name || l?.description);
        const qty = Number(l?.quantity ?? 0);
        const rate = Number(l?.rate ?? 0);
        const hsn = safeText(l?.hsnSac || item?.hsnSac);
        const base = name || 'Item';
        const qtyRate = Number.isFinite(qty) && Number.isFinite(rate) ? `${r2(qty)} x ${r2(rate)}` : '';
        const suffix = [qtyRate, hsn ? `HSN/SAC ${hsn}` : ''].filter(Boolean).join(', ');
        return suffix ? `${base} (${suffix})` : base;
      })
      .filter(Boolean);
    return truncate(parts.join(' | '), 260);
  };

  const labelForAccountId = (id) => {
    const a = accountById.get(String(id)) || null;
    return a ? String(a.name || '') : '';
  };

  const rows = [];
  const pushRow = ({ date, particulars, voucherType, voucherNo, narration, debit, credit, meta }) => {
    const d = r2(debit);
    const c = r2(credit);
    if (!d && !c) return;
    rows.push({
      date: String(date || ''),
      particulars: String(particulars || ''),
      voucherType: String(voucherType || ''),
      voucherNo: String(voucherNo || ''),
      narration: String(narration || ''),
      debit: d,
      credit: c,
      ...(meta && typeof meta === 'object' ? meta : {}),
    });
  };

  const addPostingIfMatches = ({ date, voucherType, voucherNo, narration, debitId, creditId, amount, debitParticulars, creditParticulars, meta }) => {
    const amt = r2(amount);
    if (!amt) return;

    if (String(debitId) === targetId) {
      pushRow({
        date,
        particulars: debitParticulars || labelForAccountId(creditId),
        voucherType,
        voucherNo,
        narration,
        debit: amt,
        credit: 0,
        meta,
      });
    }
    if (String(creditId) === targetId) {
      pushRow({
        date,
        particulars: creditParticulars || labelForAccountId(debitId),
        voucherType,
        voucherNo,
        narration,
        debit: 0,
        credit: amt,
        meta,
      });
    }
  };

  const resolveCashBankAccountId = (p) => {
    const explicit = p?.cashBankAccountId !== undefined && p?.cashBankAccountId !== null ? String(p.cashBankAccountId) : '';
    if (explicit && accountById.has(explicit)) return explicit;
    const mode = lower(p?.mode);
    if (mode === 'cash') return findAccountIdByName('cash');
    return findAccountIdByName('hdfc bank') || String(accounts.find((a) => lower(a?.name).includes('bank'))?.id || '') || findAccountIdByName('cash');
  };

  // Journal Entries
  for (const j of safeArray(db?.journalEntries)) {
    if (Number(j?.companyId) !== cid) continue;
    const st = lower(j?.status);
    if (st === 'cancelled') continue;
    const date = j?.date || j?.createdAt || '';
    const voucherNo = j?.number || j?.voucherNo || String(j?.id || '');
    const narration = j?.narration || j?.notes || '';
    const lines = safeArray(j?.lines);

    for (const l of lines) {
      const rawId = String(l?.accountId || '').trim();
      const id = rawId && accountById.has(rawId) ? rawId : suspenseId;
      if (String(id) !== targetId) continue;
      pushRow({
        date,
        particulars: 'Journal',
        voucherType: 'Journal',
        voucherNo,
        narration,
        debit: Number(l?.debit ?? 0),
        credit: Number(l?.credit ?? 0),
        meta: {
          voucherKey: 'journalEntry',
          voucherId: j?.id ?? null,
          reference: safeText(j?.refNo || ''),
        },
      });
    }
  }

  // Invoices
  for (const inv of safeArray(db?.invoices)) {
    if (Number(inv?.companyId) !== cid) continue;
    const st = lower(inv?.status);
    if (st === 'draft' || st === 'cancelled') continue;

    const date = inv?.date || inv?.issueDate || inv?.createdAt || '';
    const voucherNo = inv?.number || String(inv?.id || '');
    const narration = String(inv?.notes || inv?.narration || `Invoice ${voucherNo}`);

    const subtotal = Number(inv?.subtotal ?? inv?.taxableTotal ?? 0);
    const cgst = Number(inv?.cgstTotal ?? 0);
    const sgst = Number(inv?.sgstTotal ?? 0);
    const igst = Number(inv?.igstTotal ?? 0);
    const total = r2(subtotal + cgst + sgst + igst);

    const customerId = String(inv?.customerId || '').trim();
    const customer = customerById.get(customerId) || null;
    const customerAccountIdRaw = customer?.accountId !== undefined && customer?.accountId !== null ? String(customer.accountId) : '';
    const customerAccountId = customerAccountIdRaw && accountById.has(customerAccountIdRaw) ? customerAccountIdRaw : arId || suspenseId;

    const salesRevenueId = findAccountIdByName('sales revenue') || String(accounts.find((a) => lower(a?.type) === 'income')?.id || '');
    const gstOutCgstId = findAccountIdByCode('gst-out-cgst') || findAccountIdByName('output cgst');
    const gstOutSgstId = findAccountIdByCode('gst-out-sgst') || findAccountIdByName('output sgst');
    const gstOutIgstId = findAccountIdByCode('gst-out-igst') || findAccountIdByName('output igst');

    const invoiceMeta = {
      voucherKey: 'invoice',
      voucherId: inv?.id ?? null,
      partyType: 'Customer',
      partyId: customer ? customer.id : customerId || null,
      partyName: safeText(customer?.displayName || customer?.name || inv?.customerName || ''),
      partyGstin: safeText(customer?.gstin || inv?.customerGstin || ''),
      partyPan: safeText(customer?.pan || ''),
      partyBillingAddress: joinAddress(customer?.billingAddress),
      partyShippingAddress: joinAddress(customer?.shippingAddress),
      placeOfSupply: safeText(inv?.placeOfSupplyState || ''),
      taxable: r2(subtotal),
      cgst: r2(cgst),
      sgst: r2(sgst),
      igst: r2(igst),
      total: r2(total),
      itemsSummary: summarizeItems(inv?.items),
      reference: safeText(inv?.refNo || ''),
    };

    addPostingIfMatches({ date, voucherType: 'Invoice', voucherNo, narration, debitId: customerAccountId, creditId: salesRevenueId || suspenseId, amount: subtotal });
    addPostingIfMatches({ date, voucherType: 'Invoice', voucherNo, narration, debitId: customerAccountId, creditId: salesRevenueId || suspenseId, amount: subtotal, meta: invoiceMeta });
    addPostingIfMatches({ date, voucherType: 'Invoice', voucherNo, narration, debitId: customerAccountId, creditId: gstOutCgstId || suspenseId, amount: cgst, meta: invoiceMeta });
    addPostingIfMatches({ date, voucherType: 'Invoice', voucherNo, narration, debitId: customerAccountId, creditId: gstOutSgstId || suspenseId, amount: sgst, meta: invoiceMeta });
    addPostingIfMatches({ date, voucherType: 'Invoice', voucherNo, narration, debitId: customerAccountId, creditId: gstOutIgstId || suspenseId, amount: igst, meta: invoiceMeta });

    // If stored components are empty but total exists, keep the statement readable
    if (!subtotal && !cgst && !sgst && !igst && total) {
      addPostingIfMatches({ date, voucherType: 'Invoice', voucherNo, narration, debitId: customerAccountId, creditId: salesRevenueId || suspenseId, amount: total, meta: invoiceMeta });
    }
  }

  // Credit Notes
  for (const cn of safeArray(db?.creditNotes)) {
    if (Number(cn?.companyId) !== cid) continue;
    const st = lower(cn?.status);
    if (st === 'draft' || st === 'cancelled') continue;

    const date = cn?.date || cn?.issueDate || cn?.createdAt || '';
    const voucherNo = cn?.number || String(cn?.id || '');
    const narration = String(cn?.notes || cn?.narration || `Credit Note ${voucherNo}`);

    const subtotal = Number(cn?.subtotal ?? cn?.taxableTotal ?? 0);
    const cgst = Number(cn?.cgstTotal ?? 0);
    const sgst = Number(cn?.sgstTotal ?? 0);
    const igst = Number(cn?.igstTotal ?? 0);
    const total = r2(subtotal + cgst + sgst + igst);

    const customerId = String(cn?.customerId || '').trim();
    const customer = customerById.get(customerId) || null;
    const customerAccountIdRaw = customer?.accountId !== undefined && customer?.accountId !== null ? String(customer.accountId) : '';
    const customerAccountId = customerAccountIdRaw && accountById.has(customerAccountIdRaw) ? customerAccountIdRaw : arId || suspenseId;

    const salesRevenueId = findAccountIdByName('sales revenue') || String(accounts.find((a) => lower(a?.type) === 'income')?.id || '');
    const gstOutCgstId = findAccountIdByCode('gst-out-cgst') || findAccountIdByName('output cgst');
    const gstOutSgstId = findAccountIdByCode('gst-out-sgst') || findAccountIdByName('output sgst');
    const gstOutIgstId = findAccountIdByCode('gst-out-igst') || findAccountIdByName('output igst');

    const creditNoteMeta = {
      voucherKey: 'creditNote',
      voucherId: cn?.id ?? null,
      partyType: 'Customer',
      partyId: customer ? customer.id : customerId || null,
      partyName: safeText(customer?.displayName || customer?.name || cn?.customerName || ''),
      partyGstin: safeText(customer?.gstin || cn?.customerGstin || ''),
      partyPan: safeText(customer?.pan || ''),
      partyBillingAddress: joinAddress(customer?.billingAddress),
      partyShippingAddress: joinAddress(customer?.shippingAddress),
      placeOfSupply: safeText(cn?.placeOfSupplyState || ''),
      taxable: r2(subtotal),
      cgst: r2(cgst),
      sgst: r2(sgst),
      igst: r2(igst),
      total: r2(total),
      itemsSummary: summarizeItems(cn?.items),
      reference: safeText(cn?.refNo || ''),
    };

    addPostingIfMatches({ date, voucherType: 'Credit Note', voucherNo, narration, debitId: salesRevenueId || suspenseId, creditId: customerAccountId, amount: subtotal, meta: creditNoteMeta });
    addPostingIfMatches({ date, voucherType: 'Credit Note', voucherNo, narration, debitId: gstOutCgstId || suspenseId, creditId: customerAccountId, amount: cgst, meta: creditNoteMeta });
    addPostingIfMatches({ date, voucherType: 'Credit Note', voucherNo, narration, debitId: gstOutSgstId || suspenseId, creditId: customerAccountId, amount: sgst, meta: creditNoteMeta });
    addPostingIfMatches({ date, voucherType: 'Credit Note', voucherNo, narration, debitId: gstOutIgstId || suspenseId, creditId: customerAccountId, amount: igst, meta: creditNoteMeta });

    if (!subtotal && !cgst && !sgst && !igst && total) {
      addPostingIfMatches({ date, voucherType: 'Credit Note', voucherNo, narration, debitId: salesRevenueId || suspenseId, creditId: customerAccountId, amount: total, meta: creditNoteMeta });
    }
  }

  // Bills
  for (const b of safeArray(db?.bills)) {
    if (Number(b?.companyId) !== cid) continue;
    const st = lower(b?.status);
    if (st === 'draft' || st === 'cancelled') continue;

    const date = b?.date || b?.issueDate || b?.createdAt || '';
    const voucherNo = b?.number || String(b?.id || '');
    const narration = String(b?.notes || b?.narration || `Bill ${voucherNo}`);

    const subtotal = Number(b?.subtotal ?? b?.taxableTotal ?? 0);
    const cgst = Number(b?.cgstTotal ?? 0);
    const sgst = Number(b?.sgstTotal ?? 0);
    const igst = Number(b?.igstTotal ?? 0);
    const total = r2(subtotal + cgst + sgst + igst);

    const vendorId = String(b?.vendorId || '').trim();
    const vendor = vendorById.get(vendorId) || null;
    const vendorAccountIdRaw = vendor?.accountId !== undefined && vendor?.accountId !== null ? String(vendor.accountId) : '';
    const vendorAccountId = vendorAccountIdRaw && accountById.has(vendorAccountIdRaw) ? vendorAccountIdRaw : apId || suspenseId;

    const purchaseAccountsId = findAccountIdByName('purchase accounts') || String(accounts.find((a) => lower(a?.name || '').includes('purchase'))?.id || '');
    const gstInCgstId = findAccountIdByCode('gst-in-cgst') || findAccountIdByName('input cgst');
    const gstInSgstId = findAccountIdByCode('gst-in-sgst') || findAccountIdByName('input sgst');
    const gstInIgstId = findAccountIdByCode('gst-in-igst') || findAccountIdByName('input igst');

    const billMeta = {
      voucherKey: 'bill',
      voucherId: b?.id ?? null,
      partyType: 'Vendor',
      partyId: vendor ? vendor.id : vendorId || null,
      partyName: safeText(vendor?.displayName || vendor?.name || b?.vendorName || ''),
      partyGstin: safeText(vendor?.gstin || b?.vendorGstin || ''),
      partyPan: safeText(vendor?.pan || ''),
      partyBillingAddress: joinAddress(vendor?.billingAddress),
      partyShippingAddress: joinAddress(vendor?.shippingAddress),
      placeOfSupply: safeText(b?.placeOfSupplyState || ''),
      taxable: r2(subtotal),
      cgst: r2(cgst),
      sgst: r2(sgst),
      igst: r2(igst),
      total: r2(total),
      itemsSummary: summarizeItems(b?.items),
      reference: safeText(b?.refNo || ''),
    };

    addPostingIfMatches({ date, voucherType: 'Bill', voucherNo, narration, debitId: purchaseAccountsId || suspenseId, creditId: vendorAccountId, amount: subtotal, meta: billMeta });
    addPostingIfMatches({ date, voucherType: 'Bill', voucherNo, narration, debitId: gstInCgstId || suspenseId, creditId: vendorAccountId, amount: cgst, meta: billMeta });
    addPostingIfMatches({ date, voucherType: 'Bill', voucherNo, narration, debitId: gstInSgstId || suspenseId, creditId: vendorAccountId, amount: sgst, meta: billMeta });
    addPostingIfMatches({ date, voucherType: 'Bill', voucherNo, narration, debitId: gstInIgstId || suspenseId, creditId: vendorAccountId, amount: igst, meta: billMeta });

    if (!subtotal && !cgst && !sgst && !igst && total) {
      addPostingIfMatches({ date, voucherType: 'Bill', voucherNo, narration, debitId: purchaseAccountsId || suspenseId, creditId: vendorAccountId, amount: total, meta: billMeta });
    }
  }

  // Debit Notes
  for (const dn of safeArray(db?.debitNotes)) {
    if (Number(dn?.companyId) !== cid) continue;
    const st = lower(dn?.status);
    if (st === 'draft' || st === 'cancelled') continue;

    const date = dn?.date || dn?.issueDate || dn?.createdAt || '';
    const voucherNo = dn?.number || String(dn?.id || '');
    const narration = String(dn?.notes || dn?.narration || `Debit Note ${voucherNo}`);

    const subtotal = Number(dn?.subtotal ?? dn?.taxableTotal ?? 0);
    const cgst = Number(dn?.cgstTotal ?? 0);
    const sgst = Number(dn?.sgstTotal ?? 0);
    const igst = Number(dn?.igstTotal ?? 0);
    const total = r2(subtotal + cgst + sgst + igst);

    const vendorId = String(dn?.vendorId || '').trim();
    const vendor = vendorById.get(vendorId) || null;
    const vendorAccountIdRaw = vendor?.accountId !== undefined && vendor?.accountId !== null ? String(vendor.accountId) : '';
    const vendorAccountId = vendorAccountIdRaw && accountById.has(vendorAccountIdRaw) ? vendorAccountIdRaw : apId || suspenseId;

    const purchaseAccountsId = findAccountIdByName('purchase accounts') || String(accounts.find((a) => lower(a?.name || '').includes('purchase'))?.id || '');
    const gstInCgstId = findAccountIdByCode('gst-in-cgst') || findAccountIdByName('input cgst');
    const gstInSgstId = findAccountIdByCode('gst-in-sgst') || findAccountIdByName('input sgst');
    const gstInIgstId = findAccountIdByCode('gst-in-igst') || findAccountIdByName('input igst');

    const debitNoteMeta = {
      voucherKey: 'debitNote',
      voucherId: dn?.id ?? null,
      partyType: 'Vendor',
      partyId: vendor ? vendor.id : vendorId || null,
      partyName: safeText(vendor?.displayName || vendor?.name || dn?.vendorName || ''),
      partyGstin: safeText(vendor?.gstin || dn?.vendorGstin || ''),
      partyPan: safeText(vendor?.pan || ''),
      partyBillingAddress: joinAddress(vendor?.billingAddress),
      partyShippingAddress: joinAddress(vendor?.shippingAddress),
      placeOfSupply: safeText(dn?.placeOfSupplyState || ''),
      taxable: r2(subtotal),
      cgst: r2(cgst),
      sgst: r2(sgst),
      igst: r2(igst),
      total: r2(total),
      itemsSummary: summarizeItems(dn?.items),
      reference: safeText(dn?.refNo || ''),
    };

    addPostingIfMatches({ date, voucherType: 'Debit Note', voucherNo, narration, debitId: vendorAccountId, creditId: purchaseAccountsId || suspenseId, amount: subtotal, meta: debitNoteMeta });
    addPostingIfMatches({ date, voucherType: 'Debit Note', voucherNo, narration, debitId: vendorAccountId, creditId: gstInCgstId || suspenseId, amount: cgst, meta: debitNoteMeta });
    addPostingIfMatches({ date, voucherType: 'Debit Note', voucherNo, narration, debitId: vendorAccountId, creditId: gstInSgstId || suspenseId, amount: sgst, meta: debitNoteMeta });
    addPostingIfMatches({ date, voucherType: 'Debit Note', voucherNo, narration, debitId: vendorAccountId, creditId: gstInIgstId || suspenseId, amount: igst, meta: debitNoteMeta });

    if (!subtotal && !cgst && !sgst && !igst && total) {
      addPostingIfMatches({ date, voucherType: 'Debit Note', voucherNo, narration, debitId: vendorAccountId, creditId: purchaseAccountsId || suspenseId, amount: total, meta: debitNoteMeta });
    }
  }

  // Expenses
  for (const ex of safeArray(db?.expenses)) {
    if (Number(ex?.companyId) !== cid) continue;
    const st = lower(ex?.status);
    if (st === 'draft' || st === 'cancelled') continue;

    const date = ex?.date || ex?.expenseDate || ex?.createdAt || '';
    const voucherNo = ex?.number || String(ex?.id || '');
    const narration = String(ex?.notes || ex?.narration || `Expense ${voucherNo}`);

    const taxable = Number(ex?.taxableTotal ?? ex?.amount ?? 0);
    const cgst = Number(ex?.cgstTotal ?? 0);
    const sgst = Number(ex?.sgstTotal ?? 0);
    const igst = Number(ex?.igstTotal ?? 0);
    const total = r2(taxable + cgst + sgst + igst);

    const vendorId = String(ex?.vendorId || '').trim();
    const vendor = vendorById.get(vendorId) || null;
    const vendorAccountIdRaw = vendor?.accountId !== undefined && vendor?.accountId !== null ? String(vendor.accountId) : '';
    const vendorAccountId = vendorAccountIdRaw && accountById.has(vendorAccountIdRaw) ? vendorAccountIdRaw : '';
    const creditId = vendorAccountId || outstandingExpensesId || suspenseId;

    const operatingExpensesId = findAccountIdByName('operating expenses') || String(accounts.find((a) => lower(a?.type) === 'expense')?.id || '');
    const gstInCgstId = findAccountIdByCode('gst-in-cgst') || findAccountIdByName('input cgst');
    const gstInSgstId = findAccountIdByCode('gst-in-sgst') || findAccountIdByName('input sgst');
    const gstInIgstId = findAccountIdByCode('gst-in-igst') || findAccountIdByName('input igst');

    const expenseMeta = {
      voucherKey: 'expense',
      voucherId: ex?.id ?? null,
      partyType: vendor ? 'Vendor' : '',
      partyId: vendor ? vendor.id : vendorId || null,
      partyName: safeText(vendor?.displayName || vendor?.name || ex?.vendorName || ''),
      partyGstin: safeText(vendor?.gstin || ex?.vendorGstin || ''),
      partyPan: safeText(vendor?.pan || ''),
      partyBillingAddress: joinAddress(vendor?.billingAddress),
      partyShippingAddress: joinAddress(vendor?.shippingAddress),
      placeOfSupply: safeText(ex?.placeOfSupplyState || ''),
      taxable: r2(taxable),
      cgst: r2(cgst),
      sgst: r2(sgst),
      igst: r2(igst),
      total: r2(total),
      itemsSummary: '',
      reference: safeText(ex?.refNo || ''),
    };

    addPostingIfMatches({ date, voucherType: 'Expense', voucherNo, narration, debitId: operatingExpensesId || suspenseId, creditId, amount: taxable, meta: expenseMeta });
    addPostingIfMatches({ date, voucherType: 'Expense', voucherNo, narration, debitId: gstInCgstId || suspenseId, creditId, amount: cgst, meta: expenseMeta });
    addPostingIfMatches({ date, voucherType: 'Expense', voucherNo, narration, debitId: gstInSgstId || suspenseId, creditId, amount: sgst, meta: expenseMeta });
    addPostingIfMatches({ date, voucherType: 'Expense', voucherNo, narration, debitId: gstInIgstId || suspenseId, creditId, amount: igst, meta: expenseMeta });

    if (!taxable && !cgst && !sgst && !igst && total) {
      addPostingIfMatches({ date, voucherType: 'Expense', voucherNo, narration, debitId: operatingExpensesId || suspenseId, creditId, amount: total, meta: expenseMeta });
    }
  }

  // Payments / Receipts
  for (const p of safeArray(db?.payments)) {
    if (Number(p?.companyId) !== cid) continue;
    const amount = Number(p?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const dir = lower(p?.direction);
    const date = p?.date || p?.paymentDate || p?.createdAt || '';
    const voucherNo = p?.number || String(p?.id || '');
    const narration = String(p?.narration || p?.notes || '');

    const cashBankId = resolveCashBankAccountId(p) || suspenseId;
    const cashBankName = labelForAccountId(cashBankId) || '';

    if (dir === 'in') {
      let customerId = p?.customerId !== undefined && p?.customerId !== null ? String(p.customerId) : '';
      if (!customerId && lower(p?.voucherType) === 'invoice') {
        const inv = safeArray(db?.invoices).find((i) => Number(i?.companyId) === cid && String(i?.id) === String(p?.voucherId || '')) || null;
        customerId = inv ? String(inv?.customerId || '') : '';
      }
      const customer = customerById.get(String(customerId || '').trim()) || null;
      const customerAccountIdRaw = customer?.accountId !== undefined && customer?.accountId !== null ? String(customer.accountId) : '';
      const customerAccountId = customerAccountIdRaw && accountById.has(customerAccountIdRaw) ? customerAccountIdRaw : arId || suspenseId;

      addPostingIfMatches({
        date,
        voucherType: 'Receipt',
        voucherNo,
        narration,
        debitId: cashBankId,
        creditId: customerAccountId,
        amount,
        meta: {
          voucherKey: 'receipt',
          voucherId: p?.id ?? null,
          partyType: 'Customer',
          partyId: customer ? customer.id : customerId || null,
          partyName: safeText(customer?.displayName || customer?.name || ''),
          partyGstin: safeText(customer?.gstin || ''),
          partyPan: safeText(customer?.pan || ''),
          partyBillingAddress: joinAddress(customer?.billingAddress),
          partyShippingAddress: joinAddress(customer?.shippingAddress),
          reference: safeText(p?.refNo || p?.reference || ''),
          cashBank: safeText(cashBankName),
        },
      });
    } else if (dir === 'out') {
      let vendorId = p?.vendorId !== undefined && p?.vendorId !== null ? String(p.vendorId) : '';
      const vt = lower(p?.voucherType);
      if (!vendorId && vt === 'bill') {
        const bill = safeArray(db?.bills).find((b) => Number(b?.companyId) === cid && String(b?.id) === String(p?.voucherId || '')) || null;
        vendorId = bill ? String(bill?.vendorId || '') : '';
      }
      if (!vendorId && vt === 'expense') {
        const ex = safeArray(db?.expenses).find((e) => Number(e?.companyId) === cid && String(e?.id) === String(p?.voucherId || '')) || null;
        vendorId = ex ? String(ex?.vendorId || '') : '';
      }
      const vendor = vendorById.get(String(vendorId || '').trim()) || null;
      const vendorAccountIdRaw = vendor?.accountId !== undefined && vendor?.accountId !== null ? String(vendor.accountId) : '';
      const vendorAccountId = vendorAccountIdRaw && accountById.has(vendorAccountIdRaw) ? vendorAccountIdRaw : '';
      const debitId = vendorAccountId || outstandingExpensesId || apId || suspenseId;

      addPostingIfMatches({
        date,
        voucherType: 'Payment',
        voucherNo,
        narration,
        debitId,
        creditId: cashBankId,
        amount,
        meta: {
          voucherKey: 'payment',
          voucherId: p?.id ?? null,
          partyType: vendor ? 'Vendor' : '',
          partyId: vendor ? vendor.id : vendorId || null,
          partyName: safeText(vendor?.displayName || vendor?.name || ''),
          partyGstin: safeText(vendor?.gstin || ''),
          partyPan: safeText(vendor?.pan || ''),
          partyBillingAddress: joinAddress(vendor?.billingAddress),
          partyShippingAddress: joinAddress(vendor?.shippingAddress),
          reference: safeText(p?.refNo || p?.reference || ''),
          cashBank: safeText(cashBankName),
        },
      });
    }
  }

  // Cash/Bank module transactions (unlinked)
  for (const t of safeArray(db?.bankTransactions)) {
    if (Number(t?.companyId) !== cid) continue;
    const linked = t?.linkedPaymentId !== undefined && t?.linkedPaymentId !== null ? Number(t.linkedPaymentId) : null;
    if (linked) continue;

    const date = t?.date || t?.createdAt || '';
    const voucherNo = String(t?.reference || t?.id || '');
    const narration = String(t?.narration || t?.description || '');

    const cashBankId = String(t?.cashBankAccountId || '').trim();
    const counterRaw = String(t?.ledgerId || '').trim();
    const counterId = counterRaw && accountById.has(counterRaw) ? counterRaw : suspenseId;
    if (!cashBankId) continue;

    const amt = Number(t?.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    const dir = lower(t?.direction);

    if (dir === 'in') {
      addPostingIfMatches({
        date,
        voucherType: 'Cash/Bank',
        voucherNo,
        narration,
        debitId: cashBankId,
        creditId: counterId,
        amount: amt,
        meta: {
          voucherKey: 'cashBank',
          voucherId: t?.id ?? null,
          reference: safeText(t?.reference || ''),
          cashBank: safeText(labelForAccountId(cashBankId) || ''),
        },
      });
    } else if (dir === 'out') {
      addPostingIfMatches({
        date,
        voucherType: 'Cash/Bank',
        voucherNo,
        narration,
        debitId: counterId,
        creditId: cashBankId,
        amount: amt,
        meta: {
          voucherKey: 'cashBank',
          voucherId: t?.id ?? null,
          reference: safeText(t?.reference || ''),
          cashBank: safeText(labelForAccountId(cashBankId) || ''),
        },
      });
    }
  }

  const sorted = rows
    .map((r, idx) => ({ ...r, _idx: idx }))
    .sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : 0;
      const bd = b.date ? new Date(b.date).getTime() : 0;
      if (ad !== bd) return ad - bd;
      return a._idx - b._idx;
    })
    .map(({ _idx, ...r }) => r);

  const opening = r2(Number(target?.openingBalance ?? 0));
  const debitNature = isDebitNature(target?.type);
  let running = opening;
  const withRunning = sorted.map((r) => {
    const d = Number(r.debit ?? 0);
    const c = Number(r.credit ?? 0);
    running = r2(running + (debitNature ? d - c : c - d));
    return { ...r, runningBalance: running };
  });

  return {
    account: target,
    openingBalance: opening,
    rows: withRunning,
  };
};
