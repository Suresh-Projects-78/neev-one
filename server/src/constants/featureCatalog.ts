/**
 * The feature catalog: every optional capability, and whether it is on.
 *
 * Standing rule for this product — anything we add must be switchable per
 * organisation from Settings. A single shop should not have to look at branch
 * and warehouse fields it will never use; a distributor should.
 *
 * Adding a feature means adding one row here. The API serves this list, the
 * Settings screen renders from it, and both the server and the client gate on
 * the same keys, so there is no second list to keep in step.
 */

export type FeatureDef = {
  key: string;
  label: string;
  description: string;
  /** Value for an organisation that has never touched the setting. */
  defaultEnabled: boolean;
  category: 'Operations' | 'Accounting' | 'Inventory' | 'Governance' | 'Communication' | 'Data';
  /** Turning the parent off forces these off too. */
  dependsOn?: string;
  /** Not switchable — listed so the screen can show why. */
  locked?: boolean;
  lockedReason?: string;
};

export const FEATURE_CATALOG: FeatureDef[] = [
  // ---- Operations -------------------------------------------------------
  {
    key: 'branches',
    label: 'Branches',
    description:
      'Run more than one location under this company. When off, branch fields are hidden and everything posts to the head office.',
    defaultEnabled: true,
    category: 'Operations',
  },
  {
    key: 'warehouses',
    label: 'Warehouses',
    description:
      'Track stock by warehouse within a branch. When off, the warehouse field disappears from invoicing and inventory.',
    defaultEnabled: true,
    category: 'Operations',
    dependsOn: 'inventory',
  },
  {
    key: 'estimates',
    label: 'Estimates and quotes',
    description: 'Raise a quotation before the invoice.',
    defaultEnabled: true,
    category: 'Operations',
  },
  {
    key: 'creditNotes',
    label: 'Credit notes and sales returns',
    description: 'Issue credit against a sales invoice.',
    defaultEnabled: true,
    category: 'Operations',
  },
  {
    key: 'purchaseOrders',
    label: 'Purchase orders',
    description: 'Raise a PO before the vendor bill.',
    defaultEnabled: true,
    category: 'Operations',
  },
  {
    key: 'debitNotes',
    label: 'Debit notes and purchase returns',
    description: 'Issue debit against a vendor bill.',
    defaultEnabled: true,
    category: 'Operations',
  },
  {
    key: 'expenses',
    label: 'Expenses',
    description: 'Record expenses separately from vendor bills.',
    defaultEnabled: true,
    category: 'Operations',
  },

  // ---- Accounting -------------------------------------------------------
  {
    key: 'ledger',
    label: 'General ledger',
    description: 'Double-entry posting behind every document. Reports read from it.',
    defaultEnabled: true,
    category: 'Accounting',
    locked: true,
    lockedReason: 'The books cannot be switched off',
  },
  {
    key: 'bankReconciliation',
    label: 'Bank and cash reconciliation',
    description:
      'Adds a reconcile screen and a bank-date column. Receipt and payment entry is unaffected: the voucher stays the single record either way.',
    defaultEnabled: false,
    category: 'Accounting',
  },
  {
    key: 'standaloneReceiptsPayments',
    label: 'Separate Receipt and Payment screens',
    description:
      'On: money in and money out are entered on their own screens. Off: they are entered inside the bank and cash book instead, which suits a business that works from its bank statement. The record written is the same either way, so nothing is entered twice.',
    defaultEnabled: true,
    category: 'Accounting',
  },
  {
    key: 'paymentTerms',
    label: 'Payment terms and automatic due dates',
    description:
      "Give each customer and vendor a credit period, and set a document's due date from it. When off, the due date stays a plain field the operator fills in.",
    defaultEnabled: true,
    category: 'Accounting',
  },
  {
    key: 'periodLock',
    label: 'Period lock',
    description: 'Close a period so nothing can post into it after the fact.',
    defaultEnabled: true,
    category: 'Accounting',
  },
  {
    key: 'multiCurrency',
    label: 'Multi-currency',
    description: 'Invoice in a currency other than INR, with exchange rates and revaluation.',
    defaultEnabled: false,
    category: 'Accounting',
  },

  // ---- Inventory --------------------------------------------------------
  {
    key: 'inventory',
    label: 'Inventory',
    description: 'Track stock quantities. Turn off for a services-only business.',
    defaultEnabled: true,
    category: 'Inventory',
  },
  {
    key: 'stockTransfers',
    label: 'Stock and inter-branch transfers',
    description: 'Move stock between warehouses and branches.',
    defaultEnabled: true,
    category: 'Inventory',
    dependsOn: 'inventory',
  },
  {
    key: 'batchSerial',
    label: 'Batch and serial numbers',
    description: 'Track batches with expiry, or individual serial numbers, on stock items.',
    defaultEnabled: false,
    category: 'Inventory',
    dependsOn: 'inventory',
  },

  // ---- Governance -------------------------------------------------------
  {
    key: 'roleProfiles',
    label: 'Role profiles',
    description: 'Bundle several roles and assign them as one.',
    defaultEnabled: true,
    category: 'Governance',
  },
  {
    key: 'fieldPermissions',
    label: 'Field-level permissions',
    description: 'Restrict individual fields, such as discount or amount paid, by role.',
    defaultEnabled: false,
    category: 'Governance',
  },
  {
    key: 'approvals',
    label: 'Approval thresholds',
    description: 'Hold documents above an amount until someone with the approving role signs off.',
    defaultEnabled: false,
    category: 'Governance',
  },
  {
    key: 'userPermissions',
    label: 'Document restrictions',
    description: 'Limit a user to certain customers, vendors or cost centres.',
    defaultEnabled: false,
    category: 'Governance',
  },

  // ---- Communication ----------------------------------------------------
  {
    key: 'emailVerification',
    label: 'Email verification',
    description:
      'Send a confirmation link when someone signs up, and show a reminder until the address is confirmed.',
    defaultEnabled: true,
    category: 'Communication',
  },
  {
    key: 'notifications',
    label: 'Email notifications',
    description:
      'Approval requests, decisions and reminders by email. Sign-in and password mail is always sent regardless.',
    defaultEnabled: true,
    category: 'Communication',
  },
  {
    key: 'customSmtp',
    label: 'Own mail server',
    description: 'Send from your own SMTP server and address instead of the platform default.',
    defaultEnabled: false,
    category: 'Communication',
    dependsOn: 'notifications',
  },

  // ---- Data -------------------------------------------------------------
  {
    key: 'einvoice',
    label: 'e-Invoice and e-Way Bill JSON',
    description:
      'Download NIC-schema JSON per invoice for the e-invoice and e-way bill portals\u2019 bulk tools. Direct IRP submission needs GSP credentials and is not included yet.',
    defaultEnabled: false,
    category: 'Operations',
  },
  {
    key: 'recurringInvoices',
    label: 'Recurring invoices',
    description:
      'Mark an invoice as repeating monthly. On sign-in, invoices that have come due are raised as drafts for review — nothing posts until you approve each one.',
    defaultEnabled: true,
    category: 'Operations',
  },
  {
    key: 'insights',
    label: 'Dashboard insights',
    description:
      'A card of observations computed directly from your books — receivable concentration, collection-rate movement, spend spikes. Nothing predictive, nothing invented.',
    defaultEnabled: true,
    category: 'Data',
  },
  {
    key: 'gridTools',
    label: 'Power grid tools',
    description:
      'Saved views, column show/hide, bulk actions and a row preview drawer on the big list pages. When off, lists stay plain tables.',
    defaultEnabled: true,
    category: 'Data',
  },
  {
    key: 'imports',
    label: 'Data import',
    description:
      'Import journal entries and sales invoices from a CSV file, with a downloadable template. Files are staged and validated first, so you see every problem before anything is written.',
    defaultEnabled: false,
    category: 'Data',
  },
];

export const FEATURE_BY_KEY = new Map(FEATURE_CATALOG.map((f) => [f.key, f]));

export const isKnownFeature = (key: string) => FEATURE_BY_KEY.has(key);

/**
 * Applies stored overrides on top of the defaults, then resolves dependencies:
 * a feature whose parent is off is off regardless of its own setting.
 */
export function resolveFeatures(overrides: Record<string, boolean>) {
  const resolved: Record<string, boolean> = {};

  for (const f of FEATURE_CATALOG) {
    if (f.locked) {
      resolved[f.key] = true;
      continue;
    }
    resolved[f.key] = Object.prototype.hasOwnProperty.call(overrides, f.key)
      ? Boolean(overrides[f.key])
      : f.defaultEnabled;
  }

  // One pass is enough: the catalog is only one level deep. Guard anyway so a
  // future grandchild does not silently stay on.
  for (let i = 0; i < 3; i += 1) {
    let changed = false;
    for (const f of FEATURE_CATALOG) {
      if (!f.dependsOn) continue;
      if (resolved[f.key] && resolved[f.dependsOn] === false) {
        resolved[f.key] = false;
        changed = true;
      }
    }
    if (!changed) break;
  }

  return resolved;
}
