/**
 * The Features screen, in the six groups the business thinks in.
 *
 * The catalogue's own `category` was written for the server — Operations,
 * Accounting, Governance, Data — and nineteen of thirty-nine switches land in
 * "Operations", which tells the person reading it nothing. These are the
 * groups the setting-up conversation actually has: what kind of organisation
 * is this, what does it sell, what does it buy, what does it stock, what tax
 * does it answer to.
 *
 * A view over the catalogue, not a second source of truth. The server still
 * decides which features exist, their defaults, and whether one is locked.
 *
 * Anything not named here falls to "Other", deliberately: a capability added
 * on the server later must appear somewhere without a matching edit here, or
 * it is invisible until somebody notices.
 */

export const FEATURE_GROUPS = [
  { key: 'organisation', label: 'Organisation', blurb: 'The shape of the business: where it trades from, and in what.' },
  { key: 'general', label: 'General', blurb: 'Behaviour that is not tied to one part of the book.' },
  { key: 'sales', label: 'Sales', blurb: 'Which documents the selling side raises.' },
  { key: 'purchases', label: 'Purchases / Expenses', blurb: 'What the buying side uses.' },
  { key: 'inventory', label: 'Inventory', blurb: 'How much the product tracks about stock.' },
  { key: 'taxation', label: 'Taxation', blurb: 'Which taxes this company answers to.' },
  { key: 'other', label: 'Other', blurb: 'Everything without a home of its own.' },
];

/**
 * feature key → group key.
 *
 * Where a switch changes the shape of the organisation rather than a single
 * screen, `settingsKey` names the screen to go to once it is on — a branch
 * switch is useless until there are branches.
 */
const ASSIGNMENT = {
  /* Organisation */
  branches: { group: 'organisation', settingsKey: 'settingsBranches', settingsLabel: 'Set up branches' },
  warehouses: { group: 'organisation', settingsKey: 'settingsWarehouses', settingsLabel: 'Set up warehouses' },
  multiCurrency: { group: 'organisation', settingsKey: 'settingsCurrencies', settingsLabel: 'Set up currencies' },
  companyGroups: { group: 'organisation' },

  /* General */
  paymentReminders: { group: 'general' },
  costCenters: { group: 'general' },
  insights: { group: 'general' },
  gridTools: { group: 'general' },
  imports: { group: 'general' },

  /* Sales */
  pos: { group: 'sales' },
  estimates: { group: 'sales' },
  deliveryChallans: { group: 'sales' },
  salesOrders: { group: 'sales' },
  recurringInvoices: { group: 'sales' },
  creditNotes: { group: 'sales' },
  salesmen: { group: 'sales' },
  discountRules: { group: 'sales' },
  priceLists: { group: 'sales' },

  /* Purchases / Expenses */
  purchaseOrders: { group: 'purchases' },
  debitNotes: { group: 'purchases' },
  expenses: { group: 'purchases' },

  /* Inventory */
  inventory: { group: 'inventory' },
  stockTransfers: { group: 'inventory' },
  batchSerial: { group: 'inventory' },
  batchExpiry: { group: 'inventory' },
  reorderAlerts: { group: 'inventory' },

  /* Taxation */
  einvoice: { group: 'taxation' },
};

export const groupForFeature = (key) => ASSIGNMENT[String(key || '')]?.group || 'other';
export const settingsLinkFor = (key) => {
  const a = ASSIGNMENT[String(key || '')];
  return a?.settingsKey ? { key: a.settingsKey, label: a.settingsLabel || 'Open settings' } : null;
};
export const groupMeta = (key) => FEATURE_GROUPS.find((g) => g.key === key) || null;

export default FEATURE_GROUPS;
