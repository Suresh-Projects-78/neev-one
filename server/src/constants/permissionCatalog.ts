import { PermissionAction } from './enums.js';

/**
 * The permission catalog: the single source of truth for what can be granted.
 *
 * Shape mirrors ERPNext's Role Permission Manager — a module holds resources
 * (ERPNext calls them DocTypes), and each resource declares which actions are
 * meaningful for it. A report has no CREATE; a voucher has no APPROVE unless it
 * runs through an approval step.
 *
 * The API serves this to the UI so the permission matrix is rendered from server
 * truth rather than a hardcoded client list that can drift.
 */

export type FieldDef = {
  key: string;
  label: string;
  /** 0 = ordinary. Above 0 requires a rule granting at least this level. */
  permLevel: number;
};

export type ResourceDef = {
  key: string; // subModule value stored on Permission
  label: string;
  description?: string;
  actions: string[];
  /** Fields worth restricting individually. Anything unlisted is level 0. */
  fields?: FieldDef[];
};

export type ModuleDef = {
  key: string; // module value stored on Permission
  label: string;
  description?: string;
  resources: ResourceDef[];
};

const A = PermissionAction;

// Common action sets, named so the intent is readable at each call site.
const DOCUMENT = [A.VIEW, A.CREATE, A.EDIT, A.DELETE, A.EXPORT];
const DOCUMENT_APPROVAL = [A.VIEW, A.CREATE, A.EDIT, A.DELETE, A.APPROVE, A.EXPORT];
const MASTER = [A.VIEW, A.CREATE, A.EDIT, A.DELETE];
const REPORT = [A.VIEW, A.EXPORT];
const SETTING = [A.VIEW, A.EDIT];

export const PERMISSION_CATALOG: ModuleDef[] = [
  {
    key: 'SALES',
    label: 'Sales',
    description: 'Customer-facing documents and collections',
    resources: [
      {
        key: 'Invoices',
        label: 'Invoices',
        actions: DOCUMENT,
        // Pricing and settlement are held above the ordinary level: a clerk may
        // raise an invoice without being able to discount it or mark it paid.
        fields: [
          { key: 'discount', label: 'Discount', permLevel: 1 },
          { key: 'paidAmount', label: 'Amount paid', permLevel: 1 },
          { key: 'status', label: 'Status', permLevel: 1 },
        ],
      },
      { key: 'Receipts', label: 'Receipts', actions: DOCUMENT },
      { key: 'Estimates', label: 'Estimates / Quotes', actions: DOCUMENT },
      { key: 'Credit Notes', label: 'Credit Notes', actions: DOCUMENT_APPROVAL },
    ],
  },
  {
    key: 'PURCHASE',
    label: 'Purchases',
    description: 'Vendor documents and payments',
    resources: [
      { key: 'Bills', label: 'Bills', actions: DOCUMENT },
      { key: 'Payments', label: 'Payments', actions: DOCUMENT_APPROVAL },
      { key: 'Purchase Orders', label: 'Purchase Orders', actions: DOCUMENT_APPROVAL },
      { key: 'Debit Notes', label: 'Debit Notes', actions: DOCUMENT_APPROVAL },
    ],
  },
  {
    key: 'INVENTORY',
    label: 'Inventory',
    description: 'Stock on hand and its movements',
    resources: [
      { key: 'Stock Adjustment', label: 'Stock Adjustment', actions: DOCUMENT_APPROVAL },
      { key: 'Stock Transfer', label: 'Stock Transfer', actions: DOCUMENT_APPROVAL },
      { key: 'Inter-branch transfer', label: 'Inter-branch Transfer', actions: DOCUMENT_APPROVAL },
    ],
  },
  {
    key: 'ACCOUNTING',
    label: 'Accounting',
    description: 'The general ledger and its entries',
    resources: [
      {
        key: 'Ledger',
        label: 'General Ledger',
        description: 'Post and reverse journal entries; lock periods',
        actions: [A.VIEW, A.CREATE, A.EDIT, A.APPROVE, A.EXPORT],
      },
      { key: 'Journal Entries', label: 'Journal Entries', actions: DOCUMENT },
      { key: 'Chart of Accounts', label: 'Chart of Accounts', actions: MASTER },
    ],
  },
  {
    key: 'CASHBANK',
    label: 'Cash & Bank',
    resources: [
      { key: 'Cash & Bank', label: 'Cash & Bank', actions: DOCUMENT },
      { key: 'Bank Transactions', label: 'Bank Transactions', actions: DOCUMENT },
    ],
  },
  {
    key: 'EXPENSES',
    label: 'Expenses',
    resources: [{ key: 'Expenses', label: 'Expenses', actions: DOCUMENT_APPROVAL }],
  },
  {
    key: 'MASTERS',
    label: 'Master Data',
    description: 'Reference data shared across documents',
    resources: [
      { key: 'Customers', label: 'Customers', actions: MASTER },
      { key: 'Vendors', label: 'Vendors', actions: MASTER },
      { key: 'Items', label: 'Items', actions: MASTER },
      { key: 'GST Rates', label: 'GST Rates', actions: MASTER },
      { key: 'Units of Measure', label: 'Units of Measure', actions: MASTER },
      {
        key: 'Company/Branch setup',
        label: 'Company, Branch & Warehouse',
        description: 'Create and edit branches and warehouses',
        actions: MASTER,
      },
    ],
  },
  {
    key: 'REPORTS',
    label: 'Reports',
    resources: [
      { key: 'Trial Balance', label: 'Trial Balance', actions: REPORT },
      { key: 'Profit & Loss', label: 'Profit & Loss', actions: REPORT },
      { key: 'Balance Sheet', label: 'Balance Sheet', actions: REPORT },
      { key: 'Cash Flow', label: 'Cash Flow', actions: REPORT },
      { key: 'Sales Reports', label: 'Sales Reports', actions: REPORT },
      { key: 'GSTR-1', label: 'GSTR-1', actions: REPORT },
      { key: 'GSTR-3B', label: 'GSTR-3B', actions: REPORT },
    ],
  },
  {
    key: 'SETTINGS',
    label: 'Settings',
    description: 'Administration. Grant with care.',
    resources: [
      { key: 'Users', label: 'Users', actions: MASTER },
      { key: 'Roles', label: 'Roles & Permissions', actions: MASTER },
      { key: 'Company Profile', label: 'Company Profile', actions: SETTING },
      { key: 'Tax Settings', label: 'Tax Settings', actions: SETTING },
      { key: 'Document Numbering', label: 'Document Numbering', actions: SETTING },
      { key: 'Document Templates', label: 'Document Templates', actions: SETTING },
    ],
  },
];

/** Flat list of every grantable permission, as (module, subModule, action). */
/** Field definitions for a resource, or an empty list. */
export const fieldsFor = (module: string, resource: string): FieldDef[] => {
  const mod = PERMISSION_CATALOG.find((m) => m.key === module);
  return mod?.resources.find((r) => r.key === resource)?.fields || [];
};

export const flattenCatalog = () => {
  const rows: Array<{ module: string; subModule: string; action: string }> = [];
  for (const m of PERMISSION_CATALOG) {
    for (const r of m.resources) {
      for (const a of r.actions) {
        rows.push({ module: m.key, subModule: r.key, action: a });
      }
    }
  }
  return rows;
};

/** `MODULE::Resource::ACTION` — the wire format used by the UI and /auth/me. */
export const permKey = (module: string, subModule: string | null, action: string) =>
  `${module}::${subModule || ''}::${action}`;

/** Guards writes: a role may only be granted permissions that exist in the catalog. */
const CATALOG_KEYS = new Set(flattenCatalog().map((r) => permKey(r.module, r.subModule, r.action)));
export const isKnownPermission = (module: string, subModule: string | null, action: string) =>
  CATALOG_KEYS.has(permKey(module, subModule, action));

/**
 * Preset role templates, equivalent to ERPNext's stock roles. Each lists the
 * permissions granted; anything not listed is denied.
 */
export const ROLE_PRESETS: Record<string, { label: string; description: string; grants: Array<[string, string, string[]]> }> = {
  ADMIN: {
    label: 'Administrator',
    description: 'Full access to every module, including users and roles',
    grants: PERMISSION_CATALOG.map((m) => [m.key, '*', ['*']] as [string, string, string[]]),
  },
  ACCOUNTANT: {
    label: 'Accountant',
    description: 'Full books and reporting; no user or role administration',
    grants: [
      ['SALES', '*', [A.VIEW, A.CREATE, A.EDIT, A.EXPORT]],
      ['PURCHASE', '*', [A.VIEW, A.CREATE, A.EDIT, A.EXPORT]],
      ['ACCOUNTING', '*', [A.VIEW, A.CREATE, A.EDIT, A.EXPORT]],
      ['CASHBANK', '*', [A.VIEW, A.CREATE, A.EDIT, A.EXPORT]],
      ['EXPENSES', '*', [A.VIEW, A.CREATE, A.EDIT, A.EXPORT]],
      ['INVENTORY', '*', [A.VIEW]],
      ['MASTERS', '*', [A.VIEW, A.CREATE, A.EDIT]],
      ['REPORTS', '*', [A.VIEW, A.EXPORT]],
      ['SETTINGS', 'Company Profile', [A.VIEW]],
      ['SETTINGS', 'Tax Settings', [A.VIEW]],
    ],
  },
  SALES: {
    label: 'Sales User',
    description: 'Raise sales documents and see customers; no purchase or ledger access',
    grants: [
      ['SALES', '*', [A.VIEW, A.CREATE, A.EDIT]],
      ['MASTERS', 'Customers', [A.VIEW, A.CREATE, A.EDIT]],
      ['MASTERS', 'Items', [A.VIEW]],
      ['INVENTORY', '*', [A.VIEW]],
      ['REPORTS', 'Sales Reports', [A.VIEW]],
    ],
  },
  STORE: {
    label: 'Store Keeper',
    description: 'Stock movements for the branches and warehouses assigned to the user',
    grants: [
      ['INVENTORY', '*', [A.VIEW, A.CREATE, A.EDIT]],
      ['MASTERS', 'Items', [A.VIEW]],
      ['SALES', 'Invoices', [A.VIEW]],
      ['PURCHASE', 'Bills', [A.VIEW]],
    ],
  },
  VIEWER: {
    label: 'Viewer',
    description: 'Read-only across the product',
    grants: PERMISSION_CATALOG.map((m) => [m.key, '*', [A.VIEW]] as [string, string, string[]]),
  },
};

/** Expands a preset's wildcards into concrete catalog rows. */
export const expandPreset = (presetKey: string) => {
  const preset = ROLE_PRESETS[presetKey];
  if (!preset) return [];

  const out: Array<{ module: string; subModule: string; action: string }> = [];
  for (const [moduleKey, resourceKey, actions] of preset.grants) {
    const mod = PERMISSION_CATALOG.find((m) => m.key === moduleKey);
    if (!mod) continue;
    const resources = resourceKey === '*' ? mod.resources : mod.resources.filter((r) => r.key === resourceKey);
    for (const r of resources) {
      const wanted = actions.includes('*') ? r.actions : r.actions.filter((a) => actions.includes(a));
      for (const a of wanted) out.push({ module: mod.key, subModule: r.key, action: a });
    }
  }
  return out;
};
