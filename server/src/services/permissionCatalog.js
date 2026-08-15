const CATALOG = [
  // Core
  { key: 'dashboard.view', label: 'Dashboard: View' },

  // Sales
  { key: 'sales.invoices.view', label: 'Invoices: View' },
  { key: 'sales.invoices.create', label: 'Invoices: Create' },
  { key: 'sales.invoices.edit', label: 'Invoices: Edit' },
  { key: 'sales.invoices.delete', label: 'Invoices: Delete' },

  { key: 'sales.receipts.view', label: 'Receipts: View' },
  { key: 'sales.receipts.create', label: 'Receipts: Create' },

  { key: 'sales.estimates.view', label: 'Estimates/Quotes: View' },
  { key: 'sales.estimates.create', label: 'Estimates/Quotes: Create' },
  { key: 'sales.estimates.edit', label: 'Estimates/Quotes: Edit' },
  { key: 'sales.estimates.delete', label: 'Estimates/Quotes: Delete' },

  { key: 'sales.creditNotes.view', label: 'Sales Returns (Credit Notes): View' },
  { key: 'sales.creditNotes.create', label: 'Sales Returns (Credit Notes): Create' },

  // Purchases
  { key: 'purchases.bills.view', label: 'Bills: View' },
  { key: 'purchases.bills.create', label: 'Bills: Create' },
  { key: 'purchases.bills.edit', label: 'Bills: Edit' },
  { key: 'purchases.bills.delete', label: 'Bills: Delete' },

  { key: 'purchases.payments.view', label: 'Payments: View' },
  { key: 'purchases.payments.create', label: 'Payments: Create' },

  { key: 'purchases.purchaseOrders.view', label: 'Purchase Orders: View' },
  { key: 'purchases.purchaseOrders.create', label: 'Purchase Orders: Create' },

  { key: 'purchases.debitNotes.view', label: 'Purchase Returns (Debit Notes): View' },
  { key: 'purchases.debitNotes.create', label: 'Purchase Returns (Debit Notes): Create' },

  // Cash/Bank & Accounting
  { key: 'cashBank.view', label: 'Cash & Bank: View' },
  { key: 'journalEntries.view', label: 'Journal Entries: View' },
  { key: 'journalEntries.create', label: 'Journal Entries: Create' },

  // Expenses
  { key: 'expenses.view', label: 'Expenses: View' },
  { key: 'expenses.create', label: 'Expenses: Create' },

  // Inventory
  { key: 'inventory.view', label: 'Inventory: View' },

  // Reports
  { key: 'reports.view', label: 'Reports: View' },
  { key: 'reports.trialBalance.view', label: 'Trial Balance: View' },
  { key: 'reports.profitLoss.view', label: 'P&L: View' },
  { key: 'reports.balanceSheet.view', label: 'Balance Sheet: View' },
  { key: 'reports.cashFlow.view', label: 'Cash Flow: View' },
  { key: 'reports.gstr1.view', label: 'GSTR-1: View' },
  { key: 'reports.gstr3b.view', label: 'GSTR-3B: View' },
  { key: 'reports.salesReports.view', label: 'Sales Reports: View' },

  // Master Data
  { key: 'master.items.view', label: 'Items: View' },
  { key: 'master.items.create', label: 'Items: Create' },
  { key: 'master.items.edit', label: 'Items: Edit' },
  { key: 'master.items.delete', label: 'Items: Delete' },

  { key: 'master.customers.view', label: 'Customers: View' },
  { key: 'master.customers.create', label: 'Customers: Create' },
  { key: 'master.customers.edit', label: 'Customers: Edit' },
  { key: 'master.customers.delete', label: 'Customers: Delete' },

  { key: 'master.vendors.view', label: 'Vendors: View' },
  { key: 'master.vendors.create', label: 'Vendors: Create' },
  { key: 'master.vendors.edit', label: 'Vendors: Edit' },
  { key: 'master.vendors.delete', label: 'Vendors: Delete' },

  { key: 'master.chartOfAccounts.view', label: 'Chart of Accounts: View' },
  { key: 'master.gstRates.view', label: 'GST Rates: View' },
  { key: 'master.invoiceTemplates.view', label: 'Invoice Templates: View' },
  { key: 'master.numbering.view', label: 'Numbering: View' },

  // Settings
  { key: 'settings.company.view', label: 'Settings: Company' },
  { key: 'settings.tax.view', label: 'Settings: Tax & Compliances' },
  { key: 'settings.users.view', label: 'Settings: Users & Roles' },
  { key: 'settings.roles.manage', label: 'Settings: Manage Roles' },
  { key: 'settings.users.manage', label: 'Settings: Manage Users' },
];

const byKey = new Map(CATALOG.map((p) => [p.key, p]));

function normalizePermissions(input) {
  if (!Array.isArray(input)) return [];
  const keys = input
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  // allow '*'
  if (keys.includes('*')) return ['*'];
  // keep only known keys
  return Array.from(new Set(keys.filter((k) => byKey.has(k))));
}

function hasPermission(permissions, key) {
  const list = Array.isArray(permissions) ? permissions : [];
  if (list.includes('*')) return true;
  return list.includes(key);
}

module.exports = { CATALOG, normalizePermissions, hasPermission };
