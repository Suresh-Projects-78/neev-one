import {
  ArrowRightLeft,
  BadgePercent,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  Boxes,
  Building2,
  CalendarClock,
  CalendarDays,
  CircleArrowDown,
  CircleArrowUp,
  ClipboardList,
  CreditCard,
  FileSignature,
  FileText,
  GitBranch,
  Hash,
  IndianRupee,
  Landmark,
  ListTree,
  MapPin,
  Package,
  Percent,
  Receipt,
  RefreshCw,
  RotateCcw,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Tags,
  Truck,
  Undo2,
  UserRound,
  UserRoundCheck,
  Users,
  Warehouse,
  WalletCards,
} from 'lucide-react';

/**
 * What a thing is, said the same way everywhere.
 *
 * An item was a Package on one screen, a Box on another and a ShoppingBag on a
 * third, and a vendor was a Building on the list and a Truck on the form. The
 * mapping lives here so a screen asks for `iconFor('item')` rather than
 * choosing, and so changing what an item looks like is one edit.
 *
 * Two separate ideas, deliberately kept apart:
 *
 *   ENTITY_ICON — what the thing IS. One icon per business object.
 *   ENTITY_TONE — which part of the book it belongs to. A colour family, not
 *                 a per-page colour: sales is one blue whether you are looking
 *                 at invoices, quotations or delivery challans.
 *
 * Neither is the brand. The brand says what you can DO — create, save, select
 * — so if a page identity ever wears it, the page and its primary action stop
 * being tellable apart.
 */

export const ENTITY_ICON = {
  /* sales */
  invoice: FileText,
  invoices: FileText,
  quotation: FileSignature,
  salesOrder: ClipboardList,
  deliveryChallan: Truck,
  salesReturn: RotateCcw,
  recurring: RefreshCw,

  /* people */
  customer: UserRound,
  customers: Users,
  salesperson: UserRoundCheck,
  employee: UserRound,

  /* purchase */
  purchase: ShoppingCart,
  purchaseOrder: ClipboardList,
  bill: Receipt,
  vendor: Building2,
  vendors: Building2,
  purchaseReturn: Undo2,

  /* cash and bank */
  bank: Landmark,
  bankAccount: CreditCard,
  receipt: CircleArrowDown,
  payment: CircleArrowUp,
  transfer: ArrowRightLeft,
  paymentMethod: WalletCards,

  /* inventory */
  item: Package,
  items: Boxes,
  inventory: Boxes,
  warehouse: Warehouse,
  stockTransfer: ArrowRightLeft,
  adjustment: SlidersHorizontal,
  category: Tags,

  /* expense */
  expense: Receipt,

  /* accounting */
  chartOfAccounts: ListTree,
  ledger: BookOpen,
  account: BookOpen,
  journal: BookOpenCheck,

  /* tax */
  tax: Percent,
  gst: Percent,
  tds: BadgePercent,

  /* organisation and system */
  company: Building2,
  branch: GitBranch,
  location: MapPin,
  currency: IndianRupee,
  reference: Hash,
  date: CalendarDays,
  dueDate: CalendarClock,
  report: BarChart3,
  settings: Settings,
};

/** Which colour family a screen belongs to. Matches the `--id-*` tokens. */
export const ENTITY_TONE = {
  invoice: 'sales',
  invoices: 'sales',
  quotation: 'sales',
  salesOrder: 'sales',
  deliveryChallan: 'sales',
  salesReturn: 'sales',
  recurring: 'sales',

  customer: 'crm',
  customers: 'crm',
  salesperson: 'crm',
  employee: 'crm',

  purchase: 'purchase',
  purchaseOrder: 'purchase',
  bill: 'purchase',
  vendor: 'purchase',
  vendors: 'purchase',
  purchaseReturn: 'purchase',

  bank: 'banking',
  bankAccount: 'banking',
  receipt: 'banking',
  payment: 'banking',
  transfer: 'banking',
  paymentMethod: 'banking',

  item: 'inventory',
  items: 'inventory',
  inventory: 'inventory',
  warehouse: 'inventory',
  stockTransfer: 'inventory',
  adjustment: 'inventory',
  category: 'inventory',

  expense: 'expense',

  chartOfAccounts: 'accounting',
  ledger: 'accounting',
  account: 'accounting',
  journal: 'accounting',

  tax: 'tax',
  gst: 'tax',
  tds: 'tax',

  company: 'org',
  branch: 'org',
  location: 'org',
  report: 'reports',
  settings: 'settings',
};

export const iconFor = (entity) => ENTITY_ICON[entity] || null;
export const toneFor = (entity) => ENTITY_TONE[entity] || 'settings';
