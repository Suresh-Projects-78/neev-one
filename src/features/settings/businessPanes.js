/**
 * Which Business settings screen each capability belongs on.
 *
 * The settings map asks for Business to be six screens — Sales, Purchases,
 * Inventory, Accounting, Payments & Receipts, Documents — where today there is
 * one page of thirty-eight switches sorted by an internal category that means
 * nothing to the person reading it. "Operations" holds nineteen of them,
 * spanning point of sale, reorder alerts and recurring invoices.
 *
 * This is a view over the catalogue, not a second source of truth. The server
 * still decides what features exist and whether they are locked; this only
 * decides which screen shows which switch.
 *
 * Anything not named here falls through to General Preferences. That matters:
 * a capability added on the server later must show up somewhere without a
 * matching change here, or it would be invisible until someone noticed.
 */

export const BUSINESS_PANES = [
  { key: 'settingsSales', label: 'Sales', blurb: 'Which sales documents this company raises, and how they price.' },
  { key: 'settingsPurchases', label: 'Purchases', blurb: 'What the buying side of the business uses.' },
  { key: 'settingsInventory', label: 'Inventory', blurb: 'How much the product tracks about stock.' },
  { key: 'settingsAccounting', label: 'Accounting', blurb: 'How the books behave.' },
  { key: 'settingsPaymentsReceipts', label: 'Payments & Receipts', blurb: 'How money in and money out are recorded and chased.' },
  { key: 'settingsDocuments', label: 'Documents', blurb: 'What the product produces for customers and for the tax authority.' },
];

/** feature key → pane key */
const ASSIGNMENT = {
  // Sales
  estimates: 'settingsSales',
  salesOrders: 'settingsSales',
  deliveryChallans: 'settingsSales',
  creditNotes: 'settingsSales',
  pos: 'settingsSales',
  priceLists: 'settingsSales',
  salesmen: 'settingsSales',
  discountRules: 'settingsSales',
  recurringInvoices: 'settingsSales',

  // Purchases
  purchaseOrders: 'settingsPurchases',
  debitNotes: 'settingsPurchases',
  expenses: 'settingsPurchases',

  // Inventory
  inventory: 'settingsInventory',
  warehouses: 'settingsInventory',
  stockTransfers: 'settingsInventory',
  batchSerial: 'settingsInventory',
  batchExpiry: 'settingsInventory',
  reorderAlerts: 'settingsInventory',

  // Accounting
  ledger: 'settingsAccounting',
  periodLock: 'settingsAccounting',
  multiCurrency: 'settingsAccounting',

  // Payments & Receipts
  standaloneReceiptsPayments: 'settingsPaymentsReceipts',
  paymentTerms: 'settingsPaymentsReceipts',
  paymentReminders: 'settingsPaymentsReceipts',
  bankReconciliation: 'settingsPaymentsReceipts',

  // Documents
  einvoice: 'settingsDocuments',
};

export const paneForFeature = (featureKey) => ASSIGNMENT[String(featureKey || '')] || '';

/** True when this feature has no home of its own and belongs on General Preferences. */
export const isGeneralFeature = (featureKey) => !paneForFeature(featureKey);

export const paneMeta = (paneKey) => BUSINESS_PANES.find((p) => p.key === paneKey) || null;

export default BUSINESS_PANES;
