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
  category: 'Operations' | 'Accounting' | 'Inventory' | 'Governance' | 'Data';
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

  // ---- Data -------------------------------------------------------------
  {
    key: 'imports',
    label: 'Data import',
    description: 'Import documents and masters from a spreadsheet, with a dry run before committing.',
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
