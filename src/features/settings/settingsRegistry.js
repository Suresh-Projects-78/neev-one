import {
  BadgePercent,
  Bell,
  Boxes,
  Building2,
  Coins,
  FileStack,
  FileText,
  Landmark,
  NotebookPen,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Settings,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  Upload,
  Users,
} from 'lucide-react';

/**
 * Every setting this product has, written down once.
 *
 * Settings was a rail group of thirty-four entries under nine headings: open
 * it and the sidebar became something you scrolled rather than read, and every
 * other module was pushed off the screen while you looked for one switch.
 *
 * The fix is not a shorter list — nothing here is redundant — it is a place of
 * its own. This registry is what that place is built from: the hub's cards and
 * their counts, the local navigation inside a category, the breadcrumb over a
 * page, and the search that finds a setting by what somebody would call it.
 * Five lists that would have drifted apart, kept as one.
 *
 * `key` is the screen key the application already routes on. Nothing here
 * invents a route: every entry points at a screen that exists today, so a link
 * from anywhere else in the product still lands where it always did.
 */

export const SETTINGS_CATEGORIES = [
  {
    id: 'organisation',
    title: 'Organisation',
    icon: Building2,
    description: 'Company information, locations and financial periods.',
  },
  {
    id: 'business',
    title: 'Business Operations',
    icon: SlidersHorizontal,
    description: 'How the day-to-day documents and workflows behave.',
  },
  {
    id: 'finance',
    title: 'Finance & Accounting',
    icon: Landmark,
    description: 'Accounting rules, payments and the money controls.',
  },
  {
    id: 'tax',
    title: 'Tax & Compliance',
    icon: BadgePercent,
    description: 'GST registration, rates and what the returns read.',
  },
  {
    id: 'security',
    title: 'Users & Security',
    icon: Shield,
    description: 'Who can sign in, what they may do, and what was done.',
  },
  {
    id: 'platform',
    title: 'Platform & Communication',
    icon: Settings,
    description: 'Email, documents, templates and the data you bring in.',
  },
];

/**
 * The settings themselves.
 *
 * `group` is the small heading a category's local navigation shows when it
 * holds enough entries to need one. `keywords` are the words somebody would
 * actually type — "tds" for the tax page, "password" for login — because a
 * search that only matches the title finds nothing the title does not say.
 */
export const SETTINGS_ITEMS = [
  // Organisation
  { key: 'settingsCompany', title: 'Company Profile', category: 'organisation', icon: Building2, perm: 'SETTINGS::Company Profile::VIEW', description: 'Name, GSTIN, address and the state your supplies are made from.', keywords: ['gstin', 'address', 'pan', 'logo', 'state', 'legal name'] },
  { key: 'settingsBranches', title: 'Branches', category: 'organisation', icon: Building2, perm: 'MASTERS::Company/Branch setup::VIEW', feature: 'branches', description: 'The places you trade from, and the number series each one uses.', keywords: ['location', 'office', 'place of business'] },
  { key: 'settingsWarehouses', title: 'Warehouses', category: 'organisation', icon: Package, perm: 'MASTERS::Company/Branch setup::VIEW', feature: 'warehouses', description: 'Where stock is held, and which branch each store belongs to.', keywords: ['godown', 'store', 'stock location'] },
  { key: 'yearEndClose', title: 'Financial Year', category: 'organisation', icon: Settings, perm: 'ACCOUNTING::Ledger::VIEW', description: 'The year the books run on, and closing a period against further entries.', keywords: ['fy', 'year end', 'close', 'lock', 'period'] },
  { key: 'settingsCurrencies', title: 'Currency', category: 'organisation', icon: Coins, perm: 'ACCOUNTING::Ledger::VIEW', feature: 'multiCurrency', description: 'The currencies you bill in and the rates they convert at.', keywords: ['forex', 'exchange rate', 'multi currency'] },

  // Business operations
  { key: 'settingsModules', title: 'Modules', category: 'business', icon: Boxes, perm: 'SETTINGS::Company Profile::VIEW', group: 'What is switched on', description: 'Which parts of the product this company uses.', keywords: ['features', 'turn on', 'enable', 'switch off'] },
  { key: 'settingsFeatures', title: 'Preferences', category: 'business', icon: Settings, perm: 'SETTINGS::Company Profile::VIEW', group: 'What is switched on', description: 'The individual switches behind each module.', keywords: ['toggles', 'options', 'behaviour'] },
  { key: 'settingsSales', title: 'Sales', category: 'business', icon: FileText, perm: 'SETTINGS::Company Profile::VIEW', group: 'Documents', description: 'Defaults for invoices, quotations and the rest of the sell side.', keywords: ['invoice', 'quotation', 'estimate', 'terms'] },
  { key: 'settingsPurchases', title: 'Purchases', category: 'business', icon: ShoppingCart, perm: 'SETTINGS::Company Profile::VIEW', group: 'Documents', description: 'Defaults for bills, orders and purchase returns.', keywords: ['bill', 'purchase order', 'vendor'] },
  { key: 'settingsInventory', title: 'Inventory', category: 'business', icon: Package, perm: 'SETTINGS::Company Profile::VIEW', group: 'Documents', description: 'How stock is valued and when it is allowed to go negative.', keywords: ['stock', 'valuation', 'batch', 'expiry'] },
  { key: 'settingsInvoiceFields', title: 'Invoice Settings', category: 'business', icon: FileText, perm: 'SETTINGS::Company Profile::VIEW', group: 'Documents', description: 'Which fields an invoice asks for, and what prints on it.', keywords: ['invoice fields', 'numbering', 'declaration', 'e-invoice'] },
  { key: 'settingsCustomFields', title: 'Custom Fields', category: 'business', icon: Plus, perm: 'SETTINGS::Company Profile::VIEW', group: 'Documents', description: 'Your own fields on a document, and where they appear.', keywords: ['extra fields', 'reference', 'udf'] },
  { key: 'discountRules', title: 'Discount Rules', category: 'business', icon: Tags, perm: 'SALES::Invoices::VIEW', feature: 'discountRules', group: 'Documents', description: 'Standing discounts and who they apply to.', keywords: ['discount', 'scheme', 'offer'] },
  { key: 'recurringInvoices', title: 'Recurring Invoices', category: 'business', icon: RefreshCw, perm: 'SALES::Invoices::VIEW', feature: 'recurringInvoices', group: 'Automation', description: 'Schedules that raise their own invoices — rent, AMC, retainers.', keywords: ['schedule', 'repeat', 'subscription', 'amc'] },

  // Finance & accounting
  { key: 'settingsAccounting', title: 'Accounting', category: 'finance', icon: NotebookPen, perm: 'SETTINGS::Company Profile::VIEW', description: 'Posting rules, rounding and the ledgers documents default to.', keywords: ['ledger', 'posting', 'rounding', 'journal'] },
  { key: 'settingsPaymentsReceipts', title: 'Payments', category: 'finance', icon: Receipt, perm: 'SETTINGS::Company Profile::VIEW', description: 'How receipts and payments are recorded and allocated.', keywords: ['receipt', 'payment', 'allocation', 'tds', 'bank charges'] },
  { key: 'settingsAccount', title: 'Account Overview', category: 'finance', icon: Building2, perm: 'SETTINGS::Company Profile::VIEW', group: 'Your account', description: 'The plan this account is on and what it includes.', keywords: ['plan', 'subscription', 'entitlement'] },
  { key: 'settingsBilling', title: 'Billing', category: 'finance', icon: Receipt, perm: 'SETTINGS::Company Profile::VIEW', group: 'Your account', description: 'What you are charged for Neev, and the invoices for it.', keywords: ['payment method', 'invoice', 'card', 'subscription'] },

  // Tax & compliance
  { key: 'settingsTax', title: 'GST', category: 'tax', icon: BadgePercent, perm: 'SETTINGS::Tax Settings::VIEW', description: 'Registration type, filing frequency and what the returns read.', keywords: ['gstin', 'composition', 'gstr', 'filing', 'reverse charge'] },
  { key: 'gstRates', title: 'Tax Rates', category: 'tax', icon: BadgePercent, perm: 'MASTERS::GST Rates::VIEW', description: 'The rates items can carry, and which is the default.', keywords: ['gst rate', 'hsn', 'cess', 'slab'] },

  // Users & security
  { key: 'settingsUsers', title: 'Users', category: 'security', icon: Users, perm: 'SETTINGS::Users::VIEW', group: 'Access', description: 'Who can sign in, and which branches they work in.', keywords: ['people', 'staff', 'invite', 'deactivate'] },
  { key: 'settingsRoles', title: 'Roles', category: 'security', icon: Shield, perm: 'SETTINGS::Roles::VIEW', group: 'Access', description: 'The named sets of permissions you assign to people.', keywords: ['role', 'admin', 'accountant', 'rbac'] },
  { key: 'settingsPermissions', title: 'Permissions', category: 'security', icon: Shield, perm: 'SETTINGS::Roles::VIEW', group: 'Access', description: 'What each role may see, create, change and approve.', keywords: ['rights', 'access', 'field level', 'rbac'] },
  { key: 'settingsGovernance', title: 'Approval Workflows', category: 'security', icon: Shield, perm: 'SETTINGS::Roles::VIEW', group: 'Access', description: 'What needs a second pair of eyes before it is posted.', keywords: ['approval', 'limit', 'maker checker', 'workflow'] },
  { key: 'settingsSecurity', title: 'Login & Security', category: 'security', icon: Shield, perm: 'SETTINGS::Users::VIEW', group: 'Security', description: 'Passwords, sessions and two-factor sign-in.', keywords: ['password', '2fa', 'mfa', 'session', 'lockout'] },
  { key: 'settingsAudit', title: 'Audit Trail', category: 'security', icon: Shield, perm: 'SETTINGS::Users::VIEW', group: 'Security', description: 'Who changed what, and when.', keywords: ['log', 'history', 'trail', 'who changed'] },
  { key: 'settingsSso', title: 'Single Sign-On', category: 'security', icon: Shield, perm: 'SETTINGS::Users::VIEW', group: 'Security', description: 'Sign in through your own identity provider.', keywords: ['sso', 'saml', 'google', 'okta', 'identity'] },

  // Platform & communication
  { key: 'settingsEmail', title: 'Email', category: 'platform', icon: NotebookPen, perm: 'SETTINGS::Company Profile::VIEW', feature: 'notifications', group: 'Communication', description: 'The address documents are sent from, and what they say.', keywords: ['smtp', 'send', 'mail', 'from address'] },
  { key: 'paymentReminders', title: 'Payment Reminders', category: 'platform', icon: Bell, perm: 'SALES::Receipts::VIEW', feature: 'paymentReminders', group: 'Communication', description: 'When a customer is chased for an overdue invoice.', keywords: ['reminder', 'dunning', 'chase', 'overdue'] },
  { key: 'invoiceTemplates', title: 'Invoice Templates', category: 'platform', icon: FileText, perm: 'SETTINGS::Document Templates::VIEW', group: 'Documents', description: 'What a printed document looks like.', keywords: ['template', 'print', 'layout', 'letterhead'] },
  { key: 'docNumbering', title: 'Numbering', category: 'platform', icon: Settings, perm: 'SETTINGS::Document Numbering::VIEW', group: 'Documents', description: 'The prefix and next number for every kind of document.', keywords: ['prefix', 'series', 'sequence', 'next number'] },
  { key: 'settingsDocuments', title: 'Documents', category: 'platform', icon: FileStack, perm: 'SETTINGS::Company Profile::VIEW', group: 'Documents', description: 'Terms, declarations and the notes documents carry.', keywords: ['terms', 'declaration', 'notes', 'footer'] },
  { key: 'dataImport', title: 'Data & Import', category: 'platform', icon: Upload, perm: 'ACCOUNTING::Ledger::VIEW', feature: 'imports', group: 'System', description: 'Bring journals, invoices and bills in from a file.', keywords: ['import', 'csv', 'migrate', 'template', 'upload'] },
];

/** Every settings screen key, for deciding whether a screen belongs in here. */
export const SETTINGS_KEYS = new Set(SETTINGS_ITEMS.map((i) => i.key));

export const isSettingsKey = (key) => SETTINGS_KEYS.has(String(key || ''));

export const settingFor = (key) => SETTINGS_ITEMS.find((i) => i.key === String(key || '')) || null;

export const categoryFor = (id) => SETTINGS_CATEGORIES.find((c) => c.id === String(id || '')) || null;

/**
 * What this person may actually open.
 *
 * The same two tests the rail already applies — the permission and the feature
 * flag — so a category cannot advertise four settings and open onto one, and
 * nothing appears here that the sidebar would have hidden.
 */
export const visibleSettings = ({ can, isEnabled }) =>
  SETTINGS_ITEMS.filter(
    (item) => (!item.perm || !can || can(item.perm)) && (!item.feature || !isEnabled || isEnabled(item.feature))
  );

/** Categories that still hold something, with their settings and a count. */
export const visibleCategories = ({ can, isEnabled }) => {
  const items = visibleSettings({ can, isEnabled });
  return SETTINGS_CATEGORIES.map((category) => ({
    ...category,
    items: items.filter((i) => i.category === category.id),
  })).filter((c) => c.items.length > 0);
};

/**
 * A category's local navigation, in groups.
 *
 * A category with three entries does not need headings over them; one with
 * eight does, or it is the long rail again in a narrower column.
 */
export const groupedForCategory = (categoryId, { can, isEnabled }) => {
  const items = visibleSettings({ can, isEnabled }).filter((i) => i.category === categoryId);
  const groups = [];
  for (const item of items) {
    const name = item.group || '';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(item);
    else groups.push({ name, items: [item] });
  }
  // One heading over the whole list says nothing the page title has not said.
  if (groups.length === 1) return [{ name: '', items: groups[0].items }];
  return groups;
};

/**
 * Search, over what somebody would type rather than what the title says.
 *
 * "password" finds Login & Security, "tds" finds Payments, "gstin" finds both
 * the company profile and the GST page — because each entry carries the words
 * people use for it alongside its own name.
 */
export const searchSettings = (query, { can, isEnabled } = {}) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];

  const scored = [];
  for (const item of visibleSettings({ can, isEnabled })) {
    const title = item.title.toLowerCase();
    const words = [title, item.description.toLowerCase(), ...(item.keywords || [])].join(' ');
    if (!words.includes(q)) continue;

    // Title first, then a word that starts with it, then anything containing it.
    const rank = title === q ? 0 : title.startsWith(q) ? 1 : title.includes(q) ? 2 : 3;
    scored.push({ rank, item });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.item.title.localeCompare(b.item.title))
    .map((s) => s.item);
};

/** `Settings / Users & Security / Roles`, as clickable parts. */
export const breadcrumbFor = (key) => {
  const item = settingFor(key);
  const crumbs = [{ label: 'Settings', target: 'settings' }];
  if (!item) return crumbs;
  const category = categoryFor(item.category);
  if (category) crumbs.push({ label: category.title, target: `category:${category.id}` });
  crumbs.push({ label: item.title, target: null });
  return crumbs;
};

/**
 * The handful worth a shortcut at the top of the hub.
 *
 * Fixed rather than guessed: nothing in the product records which settings a
 * person opens, and a "frequently used" row that is really a hardcoded four
 * should at least be the four a new company actually needs first.
 */
export const FREQUENT_SETTINGS = ['settingsCompany', 'settingsTax', 'settingsUsers', 'settingsInvoiceFields'];

export default SETTINGS_ITEMS;
