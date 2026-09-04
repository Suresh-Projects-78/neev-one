import InventoryModule from './features/inventory/InventoryModule';
import StockAdjustments from './features/inventory/StockAdjustments';
import { notify, confirmDialog } from './components/ui/notify';
import { createDocApi, hasApiSession as hasDocsApiSession } from './api/purchaseDocs';
import { useServerDocSync } from './hooks/useServerDocSync';
import { useRecurringInvoices } from './hooks/useRecurringInvoices';
import OnboardingWizard, { shouldOnboard } from './components/OnboardingWizard';
import { buildGstr1Json, buildGstr3bJson, downloadJson } from './utils/gstrExport';
import Toaster from './components/ui/Toaster';
import StockTransferModule, { StockTransferEditor } from './features/inventory/StockTransferModule';
import { computeInventorySummaryByItemId, isStockItem } from './utils/inventory';
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgePercent,
  BarChart3,
  Check,
  BookOpen,
  Building2,
  ChevronDown,
  ClipboardList,
  Download,
  FileStack,
  FileText,
  LayoutDashboard,
  MoreVertical,
  NotebookPen,
  Package,
  Pencil,
  Plus,
  Receipt,
  RefreshCw,
  Landmark,
  LogOut,
  Settings,
  UserRound,
  Shield,
  ShoppingCart,
  Tags,
  Trash2,
  Truck,
  Users,
  Boxes,
  Coins,
  Upload,
  ArrowRight,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
/* Duotone icons for the module rail — the two-tone fill is what reads as a
   "coloured icon" rather than a tinted outline. Leaf items stay lucide, tinted
   with their module colour, so the two sets never mix at the same level. */
import {
  Bank as PhBank,
  ChartBar as PhReports,
  Database as PhMaster,
  GearSix as PhSettings,
  Notebook as PhJournal,
  Package as PhInventory,
  Receipt as PhSales,
  Scales as PhTrialBalance,
  ShieldCheck as PhApprovals,
  ShoppingCartSimple as PhPurchases,
  SquaresFour as PhDashboard,
  Wallet as PhExpenses,
} from '@phosphor-icons/react';
import Modal from './components/ui/Modal';
import PopupSelect from './components/pickers/PopupSelect';
import AccountPicker from './components/pickers/AccountPicker';
import VendorPicker, { VendorForm } from './components/pickers/VendorPicker';
import { CustomerForm } from './components/pickers/CustomerPicker';
import { buildLedgerStatement, getDefaultDocSettings, initDB, initEmptyDB, normalizeDB } from './data/db';
import { nextFreeVoucherNumber } from './utils/docSettings';
import { dueDateFor, termDaysFor, termsLabel } from './utils/paymentTerms';
import { exportLedgerToExcel, exportLedgerToPdf, printLedger } from './utils/ledgerExport';
import { formatMoney, formatMoneyCompact, round2 } from './utils/money';
import { downloadCsv, downloadCsvTemplate, parseCsv, readFileText } from './utils/csv';
import { useColumnFilters, ColumnHeader } from './components/ColumnFilters';
import { ListToolbar, exportRows, useListSearch } from './components/ListToolbar';
import { getCustomerDisplayName, getVendorDisplayName } from './utils/contacts';
import {
  ACCENT_OPTIONS,
  TEMPLATE_OPTIONS,
  NUMBERING_VOUCHER_DEFS,
  VOUCHER_DEFS,
  bumpCompanyNextNumber,
  formatVoucherNumberPreview,
  getDocSettings,
  getVoucherDef,
} from './utils/docSettings';
import {
  computeGstForLine,
  getCompanyGstProfile,
  GST_STATE_BY_CODE,
  getGstStateFromGstin,
  getPartyGstProfile,
  isIntraStateSupply,
} from './utils/gst';

import {
  PaymentsTransactionsList,
  ReceiptsTransactionsList,
} from './features/payments/TransactionsList';
import RecordReceiptForm from './features/payments/RecordReceiptForm';
import RecordDisbursementForm from './features/payments/RecordDisbursementForm';

const InvoicePreview = lazy(() => import('./features/sales/InvoicePreview'));
import AuthGate from './components/AuthGate';
import {
  CreditNoteForm,
  CreditNotesList,
  EstimateForm,
  EstimatesList,
  InvoiceForm,
  InvoicesList,
} from './features/sales';

import {
  BillForm,
  BillsList,
  DebitNoteForm,
  DebitNotesList,
  PurchaseOrderForm,
  PurchaseOrdersList,
} from './features/purchase';
const CashBankModule = lazy(() => import('./features/cashBank/CashBankModule'));
import { AccountGroupForm } from './features/accounts/AccountGroupTypeForms';
import { SettingsWarehousesBranches } from './features/admin/SettingsWarehousesBranches';
import { SettingsUsersRoles } from './features/admin/SettingsUsersRoles';
import { SettingsBranches } from './features/admin/SettingsBranches';
import EInvoiceSettings from './features/admin/EInvoiceSettings';
import { SettingsWarehouses } from './features/admin/SettingsWarehouses';
import { SettingsUsers } from './features/admin/SettingsUsers';
import { SettingsRoles } from './features/admin/SettingsRoles';
import { createWarehouse, listWarehouses } from './api/admin';
import { listBranches } from './api/admin';
import { getMyAuthContext } from './api/auth';
import { createLedgerAccount } from './api/ledger';
import { PageHeader, StatTile, ThemeToggle, SkeletonStats, TableTotals, FieldError, FieldErrorSummary, StatusPill, EmptyState } from './components/ui/Primitives';
import DocHeaderStrip from './components/ui/DocHeaderStrip';
import { PermissionProvider } from './permissions/PermissionContext';
import { usePermissions } from './permissions/usePermissions';
import { PermissionButton } from './permissions/ActionGuard';
import RolePermissionManager from './features/admin/RolePermissionManager';
import FeatureSettings from './features/settings/FeatureSettings';
import TermsSettings from './features/settings/TermsSettings';
import InvoiceFieldSettings from './features/settings/InvoiceFieldSettings';
import { DocFormActions, DocFormFootnote } from './components/DocumentForm';
import { usePeriodFilter } from './components/ListControls';
import EmailSettings from './features/settings/EmailSettings';
import SecuritySettings from './features/settings/SecuritySettings';
import ProfileSettings from './features/settings/ProfileSettings';
import NumberingSettings from './features/settings/NumberingSettings';
import CurrencySettings from './features/settings/CurrencySettings';
const BatchSerialManager = lazy(() => import('./features/inventory/BatchSerialManager'));
const PriceLists = lazy(() => import('./features/pricing/PriceLists'));
const Salesmen = lazy(() => import('./features/sales/Salesmen'));
const DeliveryChallans = lazy(() => import('./features/sales/DeliveryChallans'));
const PosScreen = lazy(() => import('./features/sales/PosScreen'));
const DiscountRules = lazy(() => import('./features/sales/DiscountRules'));
const SalesOrders = lazy(() => import('./features/sales/SalesOrders'));
const ExpenseVoucher = lazy(() => import('./features/expenses/ExpenseVoucher'));
const BatchStock = lazy(() => import('./features/inventory/BatchStock'));
const Gstr2bReco = lazy(() => import('./features/reports/Gstr2bReco'));
const PaymentReminders = lazy(() => import('./features/sales/PaymentReminders'));
const TallyExport = lazy(() => import('./features/reports/TallyExport'));
const ReorderAlerts = lazy(() => import('./features/inventory/ReorderAlerts'));
const TdsTcsReport = lazy(() => import('./features/reports/TdsTcsReport'));
const SalesBySalesman = lazy(() => import('./features/reports/SalesBySalesman'));
const FixedAssets = lazy(() => import('./features/accounting/FixedAssets'));
const YearEndClose = lazy(() => import('./features/accounting/YearEndClose'));
const CostCenters = lazy(() => import('./features/accounting/CostCenters'));
const RecurringInvoices = lazy(() => import('./features/sales/RecurringInvoices'));
const ImportCenter = lazy(() => import('./features/data/ImportCenter'));
import DashboardOverview from './features/dashboard/DashboardOverview';
import ChartCard from './components/charts/ChartCard';

/* Lazily loaded chart primitives for module overviews — same chunk the main
   dashboard pulls, so navigating between them costs one fetch total. */
const LazyPeriodBars = lazy(() => import('./components/charts/CircularCharts').then((m) => ({ default: m.PeriodBars })));
const LazyCompositionPie = lazy(() => import('./components/charts/CircularCharts').then((m) => ({ default: m.CompositionPie })));
const ModuleChartFallback = ({ height = 220 }) => (
  <div className="ui-skel w-full" style={{ height, borderRadius: 'var(--radius)' }} aria-hidden="true" />
);
import PurchaseOverview from './features/purchase/PurchaseOverview';
import PartyDetail from './features/parties/PartyDetail';
import CompanyGroups from './features/companies/CompanyGroups';
import CommandPalette from './components/ui/CommandPalette';
import { buildRecordIndex, searchRecords } from './utils/searchIndex';
import { setSearchSeed } from './utils/searchSeed';
import { useGlobalShortcuts } from './components/ui/useGlobalShortcuts';
import { useCommandPalette } from './components/ui/useCommandPalette';
import { useDocumentFormKeys } from './components/ui/useDocumentFormKeys';
import SalesOverview from './features/sales/SalesOverview';
import GovernanceSettings from './features/admin/GovernanceSettings';
import ApprovalsInbox from './features/approvals/ApprovalsInbox';
import LedgerTrialBalance from './features/reports/LedgerTrialBalance';
import { FeatureProvider } from './permissions/FeatureProvider';
import { useFeatures } from './permissions/useFeatures';
import { nextItemCode, bumpItemCodeSeries } from './utils/itemCode';
import { useTheme } from './components/ui/useTheme';
import { useDensity } from './components/ui/useDensity';
import { useFieldErrors } from './components/ui/useFieldErrors';
const normalizeId = (v) => String(v ?? '').trim();

const getBranchLabel = (b) => {
  if (!b) return '';
  const code = String(b.branchCode || b.code || '').trim();
  const name = String(b.branchName || b.name || '').trim();
  if (code && name) return `${code} - ${name}`;
  return name || code || `Branch ${String(b.id)}`;
};

/**
 * The org id the SERVER knows this company by.
 *
 * `currentCompany.id` is a local numeric id (1, 2, 3...) from the client
 * store. Falling back to it meant calling `/api/orgs/1/warehouses`, which the
 * server rejects as an orgId mismatch — the warehouse list then failed on
 * every load. The session's activeOrgId is the right fallback; when neither is
 * known there is no server org to ask about, so callers should skip the fetch.
 */
const resolveServerOrgId = (company) => {
  const backend = String(company?.profile?.backendCompanyId || '').trim();
  if (backend) return backend;
  try {
    return String(localStorage.getItem('activeOrgId') || '').trim();
  } catch {
    return '';
  }
};


const VendorsList = ({ db, setDb, currentCompany }) => {
  const vendors = db.vendors.filter((v) => v.companyId === currentCompany.id);
  const vendorSearch = useListSearch(vendors, [(v) => getVendorDisplayName(v), 'phone', 'mobile', 'email', 'gstin']);
  const vendorSearchFilters = useColumnFilters();
  const shownVendors = vendorSearchFilters.applyFilters(vendorSearch.filtered, {
    name: (r) => getVendorDisplayName(r),
    phone: (r) => r.mobile || r.phone || '',
    email: (r) => r.email,
    gstReg: (r) => r.gstRegistration,
    gstin: (r) => r.gstin,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [viewingVendor, setViewingVendor] = useState(null);

  const getVendorReferences = (vendorId) => {
    const idStr = String(vendorId);
    const sources = [
      { key: 'purchaseOrders', label: 'Purchase Order' },
      { key: 'bills', label: 'Bill' },
      { key: 'debitNotes', label: 'Debit Note' },
      { key: 'expenses', label: 'Expense' },
    ];

    const refs = [];
    for (const src of sources) {
      const docs = Array.isArray(db[src.key]) ? db[src.key] : [];
      for (const doc of docs) {
        if (doc?.companyId !== currentCompany.id) continue;
        const used = String(doc?.vendorId || '') === idStr;
        if (!used) continue;
        const num = String(doc?.number || '').trim();
        refs.push(`${src.label}${num ? ` ${num}` : ''}`);
      }
    }
    return refs;
  };

  const onEditVendor = (vendor) => {
    setEditingVendor(vendor);
    setIsCreating(false);
  };



  const onDeleteVendor = async (vendor) => {
    const refs = getVendorReferences(vendor.id);
    if (refs.length) {
      const preview = refs.slice(0, 5).join(', ');
      notify.error(`Cannot delete this vendor because it is used in: ${preview}${refs.length > 5 ? '...' : ''}`);
      return;
    }

    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete vendor "${String(vendor.name || vendor.displayName || '').trim() || 'this vendor'}"?`, confirmLabel: 'Yes, continue' });
    if (!ok) return;

    setDb({
      ...db,
      vendors: (Array.isArray(db.vendors) ? db.vendors : []).filter(
        (v) => !(v.companyId === currentCompany.id && String(v.id) === String(vendor.id))
      ),
    });
  };

  if (viewingVendor) {
    return (
      <PartyDetail
        db={db}
        currentCompany={currentCompany}
        party={viewingVendor}
        kind="vendor"
        displayName={getVendorDisplayName(viewingVendor)}
        onBack={() => setViewingVendor(null)}
        onEdit={() => {
          const v = viewingVendor;
          setViewingVendor(null);
          onEditVendor(v);
        }}
      />
    );
  }

  if (isCreating) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="ui-btn ui-btn-secondary"
            >
              Back
            </button>
            <h3 className="ui-t-sec">New Vendor</h3>
          </div>
        </div>

        <div className="ui-surface rounded-xl shadow-sm border p-6">
          <VendorForm db={db} setDb={setDb} currentCompany={currentCompany} onClose={() => setIsCreating(false)} />
        </div>
      </div>
    );
  }

  if (editingVendor) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditingVendor(null)}
              className="ui-btn ui-btn-secondary"
            >
              Back
            </button>
            <div>
              <h3 className="ui-t-sec">Edit Vendor</h3>
              <div className="text-sm ui-muted">{getVendorDisplayName(editingVendor) || ''}</div>
            </div>
          </div>
        </div>

        <div className="ui-surface rounded-xl shadow-sm border p-6">
          <VendorForm
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            initialData={editingVendor}
            onClose={() => setEditingVendor(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Vendors</h3>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="ui-btn ui-btn-primary "
        >
          <Plus size={20} /> New Vendor
        </button>
      </div>

      <ListToolbar
        search={vendorSearch.query}
        onSearch={vendorSearch.setQuery}
        placeholder="Search vendors (name, phone, email, GSTIN)"
        count={shownVendors.length}
        countLabel="vendors"
        onExport={() =>
          exportRows({
            fileName: `Vendors_${currentCompany?.name || 'company'}`,
            label: 'vendor(s)',
            columns: [
              { key: 'name', label: 'Name', value: (r) => getVendorDisplayName(r) },
              { key: 'phone', label: 'Phone', value: (r) => r.mobile || r.phone || '' },
              { key: 'email', label: 'Email' },
              { key: 'gstRegistration', label: 'GST Reg.' },
              { key: 'gstin', label: 'GSTIN' },
            ],
            rows: shownVendors,
          })
        }
        exportTitle="Vendors — {currentCompany?.name || 'Company'}"
        exportFileName={`Vendors_${currentCompany?.name || 'company'}`}
        exportSheetName="Vendors"
        exportColumns={[
              { key: 'name', label: 'Name', value: (r) => getVendorDisplayName(r) },
              { key: 'phone', label: 'Phone', value: (r) => r.mobile || r.phone || '' },
              { key: 'email', label: 'Email' },
              { key: 'gstRegistration', label: 'GST Reg.' },
              { key: 'gstin', label: 'GSTIN' },
        ]}
        exportRows={shownVendors}
      />

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full ui-table-wide">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Name" col="name" state={vendorSearchFilters} className="ui-th" />
              <ColumnHeader label="Phone" col="phone" state={vendorSearchFilters} className="ui-th" />
              <ColumnHeader label="Email" col="email" state={vendorSearchFilters} className="ui-th" />
              <ColumnHeader label="GST Reg." col="gstReg" state={vendorSearchFilters} className="ui-th" />
              <ColumnHeader label="GSTIN" col="gstin" state={vendorSearchFilters} className="ui-th" />
              <th className="ui-th">Balance</th>
              <th className="ui-th ui-num">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shownVendors.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-12 text-center ui-muted">
                  No vendors found
                </td>
              </tr>
            ) : (
              shownVendors.map((vendor) => (
                <tr
                  key={vendor.id}
                  className="ui-hover-sunken cursor-pointer"
                  onClick={(e) => {
                    if (e.target?.closest?.('button')) return;
                    setViewingVendor(vendor);
                  }}
                >
                  <td className="px-4 py-2.5 ui-col-entity truncate" title={getVendorDisplayName(vendor) || ''}>
                    {getVendorDisplayName(vendor) || '-'}
                  </td>
                  <td className="px-4 py-2.5 ui-col-meta">{vendor.phone || '-'}</td>
                  <td className="px-4 py-2.5 ui-col-meta truncate" title={vendor.email || ''}>
                    {vendor.email || '-'}
                  </td>
                  <td className="px-4 py-2.5 ui-col-meta">{vendor.gstRegistration || 'Unregistered'}</td>
                  <td className="px-4 py-2.5 ui-col-meta truncate" title={vendor.gstin || ''}>
                    {vendor.gstin || '-'}
                  </td>
                  <td className="px-4 py-2.5 ui-col-amount">{formatMoney(vendor.balance || 0, currentCompany)}</td>
                  <td className="px-4 py-2.5 ui-col-meta">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEditVendor(vendor)}
                        className="px-3 py-1.5 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm flex items-center gap-1"
                      >
                        <Pencil size={16} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteVendor(vendor)}
                        className="px-3 py-1.5 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm flex items-center gap-1 text-[rgb(var(--neg))]"
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CustomersList = ({ db, setDb, currentCompany }) => {
  const customers = db.customers.filter((c) => c.companyId === currentCompany.id);
  const customerSearch = useListSearch(customers, [(c) => getCustomerDisplayName(c), 'phone', 'mobile', 'email', 'gstin']);
  const customerSearchFilters = useColumnFilters();
  const shownCustomers = customerSearchFilters.applyFilters(customerSearch.filtered, {
    name: (r) => getCustomerDisplayName(r),
    phone: (r) => r.mobile || r.phone || '',
    email: (r) => r.email,
    gstReg: (r) => r.gstRegistration,
    gstin: (r) => r.gstin,
  });
  const [isCreating, setIsCreating] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [viewingCustomer, setViewingCustomer] = useState(null);

  const getCustomerReferences = (customerId) => {
    const idStr = String(customerId);
    const sources = [
      { key: 'invoices', label: 'Invoice' },
      { key: 'estimates', label: 'Estimate' },
      { key: 'creditNotes', label: 'Credit Note' },
    ];

    const refs = [];
    for (const src of sources) {
      const docs = Array.isArray(db[src.key]) ? db[src.key] : [];
      for (const doc of docs) {
        if (doc?.companyId !== currentCompany.id) continue;
        const used = String(doc?.customerId || '') === idStr;
        if (!used) continue;
        const num = String(doc?.number || '').trim();
        refs.push(`${src.label}${num ? ` ${num}` : ''}`);
      }
    }
    return refs;
  };

  const onEditCustomer = (customer) => {
    setEditingCustomer(customer);
    setIsCreating(false);
  };

  const onDeleteCustomer = async (customer) => {
    const refs = getCustomerReferences(customer.id);
    if (refs.length) {
      const preview = refs.slice(0, 5).join(', ');
      notify.error(`Cannot delete this customer because it is used in: ${preview}${refs.length > 5 ? '...' : ''}`);
      return;
    }

    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete customer "${String(getCustomerDisplayName(customer) || '').trim() || 'this customer'}"?`, confirmLabel: 'Yes, continue' });
    if (!ok) return;

    setDb({
      ...db,
      customers: (Array.isArray(db.customers) ? db.customers : []).filter(
        (c) => !(c.companyId === currentCompany.id && String(c.id) === String(customer.id))
      ),
    });
  };

  if (viewingCustomer) {
    return (
      <PartyDetail
        db={db}
        currentCompany={currentCompany}
        party={viewingCustomer}
        kind="customer"
        displayName={getCustomerDisplayName(viewingCustomer)}
        onBack={() => setViewingCustomer(null)}
        onEdit={() => {
          const c = viewingCustomer;
          setViewingCustomer(null);
          onEditCustomer(c);
        }}
      />
    );
  }

  if (isCreating) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="ui-btn ui-btn-secondary"
            >
              Back
            </button>
            <h3 className="ui-t-sec">New Customer</h3>
          </div>
        </div>

        <div className="ui-surface rounded-xl shadow-sm border p-6">
          <CustomerForm db={db} setDb={setDb} currentCompany={currentCompany} onClose={() => setIsCreating(false)} />
        </div>
      </div>
    );
  }

  if (editingCustomer) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setEditingCustomer(null)}
              className="ui-btn ui-btn-secondary"
            >
              Back
            </button>
            <div>
              <h3 className="ui-t-sec">Edit Customer</h3>
              <div className="text-sm ui-muted">{getCustomerDisplayName(editingCustomer) || ''}</div>
            </div>
          </div>
        </div>

        <div className="ui-surface rounded-xl shadow-sm border p-6">
          <CustomerForm
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            initialData={editingCustomer}
            onClose={() => setEditingCustomer(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Customers</h3>
        <button
          type="button"
          onClick={() => setIsCreating(true)}
          className="ui-btn ui-btn-primary "
        >
          <Plus size={20} /> New Customer
        </button>
      </div>

      <ListToolbar
        search={customerSearch.query}
        onSearch={customerSearch.setQuery}
        placeholder="Search customers (name, phone, email, GSTIN)"
        count={shownCustomers.length}
        countLabel="customers"
        onExport={() =>
          exportRows({
            fileName: `Customers_${currentCompany?.name || 'company'}`,
            label: 'customer(s)',
            columns: [
              { key: 'name', label: 'Name', value: (r) => getCustomerDisplayName(r) },
              { key: 'phone', label: 'Phone', value: (r) => r.mobile || r.phone || '' },
              { key: 'email', label: 'Email' },
              { key: 'gstRegistration', label: 'GST Reg.' },
              { key: 'gstin', label: 'GSTIN' },
            ],
            rows: shownCustomers,
          })
        }
        exportTitle="Customers — {currentCompany?.name || 'Company'}"
        exportFileName={`Customers_${currentCompany?.name || 'company'}`}
        exportSheetName="Customers"
        exportColumns={[
              { key: 'name', label: 'Name', value: (r) => getCustomerDisplayName(r) },
              { key: 'phone', label: 'Phone', value: (r) => r.mobile || r.phone || '' },
              { key: 'email', label: 'Email' },
              { key: 'gstRegistration', label: 'GST Reg.' },
              { key: 'gstin', label: 'GSTIN' },
        ]}
        exportRows={shownCustomers}
      />

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full ui-table-wide">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Name" col="name" state={customerSearchFilters} className="ui-th" />
              <ColumnHeader label="Phone" col="phone" state={customerSearchFilters} className="ui-th" />
              <ColumnHeader label="Email" col="email" state={customerSearchFilters} className="ui-th" />
              <ColumnHeader label="GST Reg." col="gstReg" state={customerSearchFilters} className="ui-th" />
              <ColumnHeader label="GSTIN" col="gstin" state={customerSearchFilters} className="ui-th" />
              <th className="ui-th">Balance</th>
              <th className="ui-th ui-num">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shownCustomers.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-12 text-center ui-muted">
                  No customers found
                </td>
              </tr>
            ) : (
              shownCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="ui-hover-sunken cursor-pointer"
                  onClick={(e) => {
                    if (e.target?.closest?.('button')) return;
                    setViewingCustomer(customer);
                  }}
                >
                  <td className="px-4 py-2.5 ui-col-entity truncate" title={getCustomerDisplayName(customer)}>
                    {getCustomerDisplayName(customer)}
                  </td>
                  <td className="px-4 py-2.5 ui-col-meta truncate" title={customer.mobile || customer.phone || ''}>
                    {customer.mobile || customer.phone || '-'}
                  </td>
                  <td className="px-4 py-2.5 ui-col-meta truncate" title={customer.email || ''}>
                    {customer.email || '-'}
                  </td>
                  <td className="px-4 py-2.5 ui-col-meta">{customer.gstRegistration || 'Unregistered'}</td>
                  <td className="px-4 py-2.5 ui-col-meta truncate" title={customer.gstin || ''}>
                    {customer.gstin || '-'}
                  </td>
                  <td className="px-4 py-2.5 ui-col-amount">{formatMoney(customer.balance || 0, currentCompany)}</td>
                  <td className="px-4 py-2.5 ui-col-meta">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEditCustomer(customer)}
                        className="px-3 py-1.5 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm flex items-center gap-1"
                      >
                        <Pencil size={16} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCustomer(customer)}
                        className="px-3 py-1.5 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm flex items-center gap-1 text-[rgb(var(--neg))]"
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const ExpensesList = ({ db, setDb, openModal, currentCompany }) => {
  const expenses = db.expenses.filter((e) => e.companyId === currentCompany.id);
  const [statusFilter, setStatusFilter] = useState('All');
  const [isCreating, setIsCreating] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const importInputRef = useRef(null);
  const expenseColFilters = useColumnFilters();

  const getDerivedStatus = (expense) => {
    const total = Number(expense?.total ?? 0);
    const paid = Number(expense?.paidAmount ?? 0);

    const raw = String(expense?.status || '').trim();
    if (raw === 'Draft') return 'Draft';
    if (raw === 'Paid') return 'Paid';
    if (total > 0 && paid >= total - 0.0001) return 'Paid';

    const due = expense?.dueDate ? new Date(expense.dueDate) : null;
    const today = new Date();
    if (due && !Number.isNaN(due.getTime())) {
      const dueYmd = due.toISOString().slice(0, 10);
      const todayYmd = today.toISOString().slice(0, 10);
      if (dueYmd < todayYmd && total > 0 && paid < total - 0.0001) return 'Over due';
    }

    if (paid > 0) return 'Partial';
    return 'Unpaid';
  };

  const inPeriod = (e) => {
    const d = String(e?.date || '').slice(0, 10);
    if (!d) return !fromDate && !toDate;
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    return true;
  };

  const filteredExpenses = expenseColFilters.applyFilters(
    expenses
      .filter((e) => {
        const derived = getDerivedStatus(e);
        if (statusFilter !== 'All' && derived !== statusFilter) return false;
        return inPeriod(e);
      })
      .slice()
      .sort((a, b) => {
        const da = String(a?.date || '');
        const dbb = String(b?.date || '');
        if (da !== dbb) return da < dbb ? 1 : -1;
        return Number(b?.id || 0) - Number(a?.id || 0);
      }),
    {
      number: (r) => r.number,
      date: (r) => r.date,
      dueDate: (r) => r.dueDate,
      description: (r) => r.description,
      vendor: (r) => r.vendorName,
      refNo: (r) => r.refNo,
      amount: (r) => r.total,
      status: (r) => getDerivedStatus(r),
    }
  );

  // Over the filtered set, so the figure always describes what is on screen.
  const expenseTotals = useMemo(() => {
    let spent = 0;
    let unpaid = 0;
    for (const e of filteredExpenses) {
      const total = Number(e.total || 0);
      spent += total;
      unpaid += Math.max(0, total - Number(e.paidAmount || 0));
    }
    return [
      { label: 'Spent', value: formatMoney(spent, currentCompany) },
      { label: 'Unpaid', value: formatMoney(unpaid, currentCompany), tone: unpaid > 0 ? 'neg' : undefined },
    ];
  }, [filteredExpenses, currentCompany]);


  const ledgerNamesOf = (e) =>
    (Array.isArray(e?.lines) ? e.lines : []).map((l) => l.ledgerName).filter(Boolean).join('; ');

  const exportExpenses = () => {
    if (!filteredExpenses.length) {
      notify.error('Nothing to export in the current view.');
      return;
    }
    downloadCsv({
      fileName: `Expenses_${currentCompany?.name || 'company'}${fromDate || toDate ? `_${fromDate || 'start'}_to_${toDate || 'today'}` : ''}`,
      columns: [
        { key: 'number', label: 'Voucher No' },
        { key: 'date', label: 'Date' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'vendorName', label: 'Vendor' },
        { key: 'refNo', label: 'Vendor Inv No' },
        { key: 'refDate', label: 'Vendor Inv Date' },
        { key: 'description', label: 'Narration' },
        { key: 'ledgers', label: 'Expense Ledgers', value: (r) => ledgerNamesOf(r) },
        { key: 'taxable', label: 'Taxable', value: (r) => round2(Number(r.subtotal ?? r.taxableTotal ?? 0)) },
        { key: 'gstTotal', label: 'GST', value: (r) => round2(Number(r.gstTotal ?? 0)) },
        { key: 'total', label: 'Total', value: (r) => round2(Number(r.total ?? 0)) },
        { key: 'paidAmount', label: 'Paid', value: (r) => round2(Number(r.paidAmount ?? 0)) },
        { key: 'status', label: 'Status', value: (r) => getDerivedStatus(r) },
      ],
      rows: filteredExpenses,
    });
    notify.success(`${filteredExpenses.length} expense(s) exported.`);
  };

  const downloadImportTemplate = () => {
    downloadCsvTemplate({
      fileName: 'Expense_Import_Template',
      columns: [
        { key: 'Date', label: 'Date' },
        { key: 'Vendor', label: 'Vendor' },
        { key: 'Vendor Inv No', label: 'Vendor Inv No' },
        { key: 'Vendor Inv Date', label: 'Vendor Inv Date' },
        { key: 'Narration', label: 'Narration' },
        { key: 'Expense Ledger', label: 'Expense Ledger' },
        { key: 'Description', label: 'Description' },
        { key: 'Amount', label: 'Amount' },
        { key: 'GST %', label: 'GST %' },
      ],
      sample: {
        Date: new Date().toISOString().slice(0, 10),
        Vendor: 'ABC Trading Co.',
        'Vendor Inv No': 'INV-2024-058',
        'Vendor Inv Date': new Date().toISOString().slice(0, 10),
        Narration: 'Office rent for the month',
        'Expense Ledger': 'Office Rent',
        Description: 'Monthly rent',
        Amount: '25000',
        'GST %': '18',
      },
    });
    notify.success('Template downloaded. One row per expense line; rows sharing a Vendor Inv No become one voucher.');
  };

  const importExpenses = async (file) => {
    try {
      const { rows } = parseCsv(await readFileText(file));
      if (!rows.length) {
        notify.error('That file has no data rows.');
        return;
      }

      const ledgers = (db.chartOfAccounts || []).filter((a) => a.companyId === currentCompany.id);
      const findLedger = (name) =>
        ledgers.find((l) => String(l.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase());
      const vendorsList = (db.vendors || []).filter((v) => v.companyId === currentCompany.id);
      const findVendor = (name) =>
        vendorsList.find((v) => getVendorDisplayName(v).trim().toLowerCase() === String(name || '').trim().toLowerCase());

      // Lines that share a vendor invoice number (or, failing that, a
      // date+vendor) belong to one voucher — the same grouping the entry form
      // produces.
      const groups = new Map();
      const problems = [];
      rows.forEach((r, i) => {
        const ledgerName = r['Expense Ledger'] || '';
        const ledger = findLedger(ledgerName);
        const amount = Number(r.Amount || 0);
        if (!ledger) {
          problems.push(`Row ${i + 2}: no ledger named "${ledgerName}"`);
          return;
        }
        if (!(amount > 0)) {
          problems.push(`Row ${i + 2}: amount must be greater than zero`);
          return;
        }
        const key = String(r['Vendor Inv No'] || '').trim() || `${r.Date}|${r.Vendor}`;
        if (!groups.has(key)) groups.set(key, { head: r, lines: [] });
        groups.get(key).lines.push({ ledger, description: r.Description || '', amount, gstRate: Number(r['GST %'] || 0) });
      });

      if (!groups.size) {
        notify.error(problems[0] || 'Nothing importable in that file.');
        return;
      }

      const { state: companyState } = getCompanyGstProfile(currentCompany);
      let nextId = (db.expenses || []).reduce((m, x) => Math.max(m, Number(x?.id) || 0), 0);
      const activeBranchId = normalizeId(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '');
      let seq = 0;
      const created = [];

      // Reserve a free number per voucher up front, so an import can never
      // hand out a number the book already uses.
      const usedNumbers = (db.expenses || [])
        .filter((e) => e.companyId === currentCompany.id)
        .map((e) => String(e.number || '').trim());
      const importedNumbers = [];
      for (let i = 0; i < groups.size; i += 1) {
        const n = nextFreeVoucherNumber({
          db,
          company: currentCompany,
          voucherKey: 'expense',
          branchId: activeBranchId || null,
          takenNumbers: [...usedNumbers, ...importedNumbers],
        });
        importedNumbers.push(n);
      }

      for (const { head, lines } of groups.values()) {
        const vendor = findVendor(head.Vendor);
        const { state: vendorState, gstin: vendorGstin, gstRegistration } = getPartyGstProfile(vendor);
        const isIntra = isIntraStateSupply({ companyState, partyState: vendorState });
        const charges = String(gstRegistration || '').trim().toLowerCase() === 'registered';

        const built = lines.map((l) => {
          const rate = charges ? l.gstRate : 0;
          const gstAmount = round2((l.amount * rate) / 100);
          return {
            ledgerId: l.ledger.id,
            ledgerName: l.ledger.name,
            description: l.description,
            amount: round2(l.amount),
            gstRate: rate,
            gstAmount,
            cgstAmount: isIntra ? round2(gstAmount / 2) : 0,
            sgstAmount: isIntra ? round2(gstAmount / 2) : 0,
            igstAmount: isIntra ? 0 : gstAmount,
            lineTotal: round2(l.amount + gstAmount),
          };
        });
        const subtotal = round2(built.reduce((t, l) => t + l.amount, 0));
        const gstTotal = round2(built.reduce((t, l) => t + l.gstAmount, 0));
        seq += 1;
        created.push({
          id: ++nextId,
          companyId: currentCompany.id,
          number: importedNumbers[seq - 1] || `EXP-IMP-${nextId}`,
          date: String(head.Date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          dueDate: String(head.Date || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
          refNo: head['Vendor Inv No'] || '',
          refDate: String(head['Vendor Inv Date'] || '').slice(0, 10),
          description: head.Narration || '',
          vendorId: vendor?.id ?? '',
          vendorName: getVendorDisplayName(vendor),
          vendorGstin,
          placeOfSupplyState: vendorState,
          taxType: isIntra ? 'CGST_SGST' : 'IGST',
          lines: built,
          subtotal,
          taxableTotal: subtotal,
          cgstTotal: round2(built.reduce((t, l) => t + l.cgstAmount, 0)),
          sgstTotal: round2(built.reduce((t, l) => t + l.sgstAmount, 0)),
          igstTotal: round2(built.reduce((t, l) => t + l.igstAmount, 0)),
          gstTotal,
          total: round2(subtotal + gstTotal),
          amount: subtotal,
          paidAmount: 0,
          status: 'Unpaid',
          branchId: activeBranchId || '',
          warehouseId: String(localStorage.getItem('activeWarehouseId') || '').trim(),
          importedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      }

      setDb((prev) => {
        let companies = prev.companies;
        for (const row of created) {
          companies = bumpCompanyNextNumber({
            db: { ...prev, companies },
            companyId: currentCompany.id,
            voucherKey: 'expense',
            usedNumber: row.number,
            branchId: activeBranchId || null,
          });
        }
        return { ...prev, expenses: [...(prev.expenses || []), ...created], companies };
      });
      notify.success(
        `${created.length} expense voucher(s) imported${problems.length ? `. ${problems.length} row(s) skipped: ${problems[0]}` : '.'}`
      );
    } catch (err) {
      notify.error(String(err?.message || 'Import failed.'));
    }
  };

  const openVoucher = (expense) => {
    openModal(
      <ExpenseVoucher expense={expense} currentCompany={currentCompany} db={db} />,
      { title: `Expense ${expense?.number || ''}`.trim(), maxWidthClass: 'max-w-4xl' }
    );
  };

  const openRecordPayment = (expense) => {
    openModal(
      <RecordPaymentForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        voucherType="expense"
        voucher={expense}
        onClose={() => openModal(null)}
      />
    );
  };

  if (isCreating) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="ui-btn ui-btn-secondary"
            >
              Back
            </button>
            <h3 className="ui-t-sec">New Expense</h3>
          </div>
        </div>

        <div className="ui-surface rounded-xl shadow-sm border p-6">
          <ExpenseForm db={db} setDb={setDb} currentCompany={currentCompany} openModal={openModal} onClose={() => setIsCreating(false)} />
        </div>
      </div>
    );
  }

  const expenseFlow = (() => {
    const active = expenses.filter((e) => String(e?.status || '') !== 'Draft');
    const total = active.reduce((sum, e) => sum + Number(e?.total || 0), 0);
    const paid = active.reduce((sum, e) => sum + Math.min(Number(e?.paidAmount || 0), Number(e?.total || 0)), 0);
    return { total, paid, unpaid: Math.max(0, total - paid), count: active.length };
  })();

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Expenses</h3>
        <PermissionButton
          permission="EXPENSES::Expenses::CREATE"
          onClick={() => setIsCreating(true)}
          className="ui-btn ui-btn-primary "
        >
          <Plus size={20} /> New Expense
        </PermissionButton>
      </div>

      {expenseFlow.count > 0 ? (
        <div className="ui-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Spent"
            amount={expenseFlow.total}
            format={(v) => formatMoneyCompact(v, currentCompany)}
            title={formatMoney(expenseFlow.total, currentCompany)}
            hint={`Across ${expenseFlow.count} voucher${expenseFlow.count === 1 ? '' : 's'}`}
            icon={Receipt}
          />
          <StatTile
            label="Paid"
            amount={expenseFlow.paid}
            format={(v) => formatMoneyCompact(v, currentCompany)}
            title={formatMoney(expenseFlow.paid, currentCompany)}
            hint={expenseFlow.total > 0 ? `${Math.round((expenseFlow.paid / expenseFlow.total) * 100)}% of spend` : 'Nothing yet'}
            tone="pos"
            icon={Check}
          />
          <StatTile
            label="Unpaid"
            amount={expenseFlow.unpaid}
            format={(v) => formatMoneyCompact(v, currentCompany)}
            title={formatMoney(expenseFlow.unpaid, currentCompany)}
            tone={expenseFlow.unpaid > 0 ? 'neg' : 'neutral'}
            hint="Awaiting payment"
            icon={FileText}
          />
          <StatTile
            label="Average voucher"
            amount={expenseFlow.count ? expenseFlow.total / expenseFlow.count : 0}
            format={(v) => formatMoneyCompact(v, currentCompany)}
            title={formatMoney(expenseFlow.count ? expenseFlow.total / expenseFlow.count : 0, currentCompany)}
            hint="Spend per voucher"
            icon={ClipboardList}
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2 flex-wrap">
        {['All', 'Paid', 'Unpaid', 'Partial', 'Over due', 'Draft'].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 rounded-full text-sm border ${ statusFilter === s ? 'ui-sunken ui-border-c ui-fg' : 'ui-surface ui-border-c ui-fg'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="ui-card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="ui-label">From</label>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="ui-input px-3 py-2" />
        </div>
        <div>
          <label className="ui-label">To</label>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="ui-input px-3 py-2" />
        </div>
        {fromDate || toDate ? (
          <button type="button" onClick={() => { setFromDate(''); setToDate(''); }} className="ui-btn ui-btn-secondary !h-10">
            Clear period
          </button>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={exportExpenses} className="ui-btn ui-btn-secondary !h-10">
            <Download size={15} aria-hidden="true" /> Export
          </button>
          <button type="button" onClick={downloadImportTemplate} className="ui-btn ui-btn-secondary !h-10">
            Import template
          </button>
          <button type="button" onClick={() => importInputRef.current?.click()} className="ui-btn ui-btn-secondary !h-10">
            <Upload size={15} aria-hidden="true" /> Import
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              e.target.value = '';
              if (f) importExpenses(f);
            }}
          />
        </div>
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <div className="ui-table-scroll">
        <table className="ui-table w-full ui-table-wide ui-table-sticky">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Voucher #" col="number" state={expenseColFilters} className="ui-th" />
              <ColumnHeader label="Date" col="date" state={expenseColFilters} className="ui-th" />
              <ColumnHeader label="Due Date" col="dueDate" state={expenseColFilters} className="ui-th" />
              <ColumnHeader label="Narration" col="description" state={expenseColFilters} className="ui-th" />
              <ColumnHeader label="Vendor" col="vendor" state={expenseColFilters} className="ui-th" />
              <ColumnHeader label="Ref No" col="refNo" state={expenseColFilters} className="ui-th" />
              <th className="ui-th">Ref Date</th>
              <ColumnHeader label="Amount" col="amount" state={expenseColFilters} className="ui-th" />
              <ColumnHeader label="Status" col="status" state={expenseColFilters} className="ui-th" />
              <th className="ui-th">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredExpenses.length === 0 ? (
              <tr>
                <td colSpan="10" className="p-0">
                  {/*
                    Was the bare words "No expenses found", where Bills gets an
                    icon, a sentence explaining what the record is for, and a
                    button to make one. Same component now, and it tells the
                    two cases apart: nothing recorded yet, against filters
                    hiding what is there.
                  */}
                  <EmptyState
                    icon={Receipt}
                    kind={expenses.length ? 'filtered' : 'new'}
                    totalCount={expenses.length}
                    title={expenses.length ? 'No expenses match these filters' : 'No expenses yet'}
                    description={
                      expenses.length
                        ? 'Widen the period or clear the status filter to see the rest.'
                        : 'An expense voucher is money the business spent, and the input GST you can claim against it.'
                    }
                    action={
                      expenses.length ? null : (
                        <PermissionButton
                          permission="EXPENSES::Expenses::CREATE"
                          onClick={() => setIsCreating(true)}
                          className="ui-btn ui-btn-primary"
                        >
                          <Plus size={16} /> New Expense
                        </PermissionButton>
                      )
                    }
                  />
                </td>
              </tr>
            ) : (
              filteredExpenses.map((expense) => {
                const derived = getDerivedStatus(expense);
                return (
                  <tr
                    key={expense.id}
                    className="ui-hover-sunken cursor-pointer"
                    onClick={(e) => {
                      if (e.target?.closest?.('button')) return;
                      openVoucher(expense);
                    }}
                  >
                  <td className="px-4 py-2.5 ui-col-entity">{expense.number || '-'}</td>
                  <td className="px-4 py-2.5 ui-col-meta">{expense.date}</td>
                  <td className="px-4 py-2.5 ui-col-meta">{expense.dueDate || '-'}</td>
                  <td className="px-4 py-2.5 ui-col-meta truncate" title={expense.description || ''}>{expense.description}</td>
                  <td className="px-4 py-2.5 ui-col-entity">{expense.vendorName || '-'}</td>
                  <td className="px-4 py-2.5 ui-col-id">{expense.refNo || '-'}</td>
                  <td className="px-4 py-2.5 ui-col-meta">{expense.refDate || '-'}</td>
                  <td className="px-4 py-2.5 ui-col-amount">{formatMoney(expense.total, currentCompany)}</td>
                  <td className="px-4 py-2.5 ui-col-meta">
                    <StatusPill status={derived} />
                  </td>
                  <td className="px-4 py-2.5 ui-col-meta">
                    <button
                      type="button"
                      onClick={() => openRecordPayment(expense)}
                      disabled={derived === 'Paid' || derived === 'Draft'}
                      className={`px-3 py-1 rounded-lg text-sm border ${ derived === 'Paid' || derived === 'Draft'
                          ? 'ui-sunken ui-muted ui-border-c cursor-not-allowed'
                          : 'ui-surface ui-hover-sunken ui-border-c'
                      }`}
                    >
                      Record Payment
                    </button>
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
        <TableTotals
          count={filteredExpenses.length}
          totalCount={expenses.length}
          noun="vouchers"
          figures={expenseTotals}
        />
      </div>
    </div>
  );
};

const emptyExpenseLine = () => ({ ledgerId: '', description: '', amount: '', gstRate: 0 });

/** Sentinel value for the "create one" entry inside the ledger picker. */
const NEW_LEDGER_OPTION = '__new_ledger__';

const ExpenseForm = ({ db, setDb, currentCompany, openModal, onClose, initialData = null }) => {
  const expenseErrors = useFieldErrors('expense');
  const activeBranchId = normalizeId(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '');
  const expenseDocSettings = getDocSettings(db, currentCompany, { branchId: activeBranchId || null });
  const expenseNumbering = expenseDocSettings?.numbering?.expense;
  const isExpenseAuto = String(expenseNumbering?.mode || '').toLowerCase() === 'auto';
  const lockExpenseNumber = isExpenseAuto && !expenseNumbering?.allowManualOverride;
  const takenExpenseNumbers = (db.expenses || [])
    .filter((e) => e.companyId === currentCompany.id)
    .map((e) => String(e.number || '').trim());
  const generatedExpenseNumber = nextFreeVoucherNumber({
    db,
    company: currentCompany,
    voucherKey: 'expense',
    branchId: activeBranchId || null,
    takenNumbers: takenExpenseNumbers,
  });

  const formRef = useRef(null);
  const [submitAsDraft, setSubmitAsDraft] = useState(false);

  /*
   * Named, not inline: a ref read inside a prop passed to a component reads to
   * the hooks lint as a render-phase access, because it cannot tell an event
   * handler from any other callback.
   */
  const submitExpenseAsDraft = () => {
    setSubmitAsDraft(true);
    formRef.current?.requestSubmit();
  };

  const [formData, setFormData] = useState(() => ({
    number: initialData?.number || generatedExpenseNumber || '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    costCenterId: initialData?.costCenterId ?? '',
    // Same day unless the vendor grants credit — the vendor's terms decide,
    // not a blanket +30 days.
    dueDate: initialData?.dueDate || initialData?.date || new Date().toISOString().split('T')[0],
    dueDateTouched: Boolean(initialData?.dueDate),
    description: initialData?.description || '',
    vendorId: initialData?.vendorId ?? '',
    refNo: initialData?.refNo || '',
    refDate: initialData?.refDate || '',
    lines: Array.isArray(initialData?.lines) && initialData.lines.length ? initialData.lines : [emptyExpenseLine()],
  }));

  const vendors = db.vendors.filter((v) => v.companyId === currentCompany.id);

  // Every ledger sitting under a group whose category is Expense — that is
  // "all ledgers created under Direct or Indirect expenses", including any
  // sub-groups the user made themselves.
  const expenseLedgers = useMemo(() => {
    const groups = (db.accountGroups || []).filter((g) => g.companyId === currentCompany.id);
    const groupById = new Map(groups.map((g) => [String(g.id), g]));
    const isExpenseGroup = (gid) => {
      let cur = groupById.get(String(gid || ''));
      const seen = new Set();
      while (cur && !seen.has(String(cur.id))) {
        seen.add(String(cur.id));
        if (String(cur.groupCategory || '').trim() === 'Expense') return true;
        cur = cur.parentGroupId ? groupById.get(String(cur.parentGroupId)) : null;
      }
      return false;
    };
    return (db.chartOfAccounts || [])
      .filter((a) => a.companyId === currentCompany.id && isExpenseGroup(a.groupId))
      .map((a) => ({ ...a, groupName: String(groupById.get(String(a.groupId))?.name || '') }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [db.chartOfAccounts, db.accountGroups, currentCompany.id]);

  const { state: companyState } = getCompanyGstProfile(currentCompany);
  const gstEnabled = (currentCompany?.profile?.taxCompliances?.gstEnabled ?? currentCompany?.gstEnabled ?? true) !== false;
  const vendor = formData.vendorId ? vendors.find((v) => v.id === parseInt(formData.vendorId)) : null;

  // The due date follows the entry date plus whatever credit the vendor has on
  // file, and keeps following them until the operator types their own date.
  const derivedDueDate = vendor ? dueDateFor(formData.date, vendor, 0) : String(formData.date || '');
  if (!formData.dueDateTouched && derivedDueDate && derivedDueDate !== formData.dueDate) {
    setFormData((p) => (p.dueDateTouched ? p : { ...p, dueDate: derivedDueDate }));
  }
  const { state: vendorState, gstin: vendorGstin, gstRegistration } = getPartyGstProfile(vendor);
  const isIntra = isIntraStateSupply({ companyState, partyState: vendorState });

  // GST rides on the vendor's registration: an unregistered or composition
  // vendor cannot charge it, so those lines are taxable value only.
  const vendorChargesGst = gstEnabled && String(gstRegistration || '').trim().toLowerCase() === 'registered';

  const computed = useMemo(() => {
    const rows = (formData.lines || []).map((l) => {
      const amount = Number(l.amount) || 0;
      const rate = vendorChargesGst ? Number(l.gstRate) || 0 : 0;
      const gstAmount = round2((amount * rate) / 100);
      return {
        ledgerId: l.ledgerId,
        description: String(l.description || '').trim(),
        amount: round2(amount),
        gstRate: rate,
        gstAmount,
        cgstAmount: isIntra ? round2(gstAmount / 2) : 0,
        sgstAmount: isIntra ? round2(gstAmount / 2) : 0,
        igstAmount: isIntra ? 0 : gstAmount,
        lineTotal: round2(amount + gstAmount),
      };
    });
    const subtotal = round2(rows.reduce((s, r) => s + r.amount, 0));
    const gstTotal = round2(rows.reduce((s, r) => s + r.gstAmount, 0));
    return {
      rows,
      subtotal,
      gstTotal,
      cgstTotal: round2(rows.reduce((s, r) => s + r.cgstAmount, 0)),
      sgstTotal: round2(rows.reduce((s, r) => s + r.sgstAmount, 0)),
      igstTotal: round2(rows.reduce((s, r) => s + r.igstAmount, 0)),
      total: round2(subtotal + gstTotal),
    };
  }, [formData.lines, vendorChargesGst, isIntra]);

  const updateLine = (idx, patch) =>
    setFormData((p) => ({ ...p, lines: p.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));

  const onPickLedger = (idx, ledgerId) => {
    const led = expenseLedgers.find((l) => String(l.id) === String(ledgerId));
    updateLine(idx, {
      ledgerId,
      // The ledger's own rate is the default; the operator can still override.
      gstRate: led && led.gstRate !== null && led.gstRate !== undefined ? Number(led.gstRate) : 0,
      description: formData.lines[idx]?.description || '',
    });
  };

  // Creating the ledger without leaving the voucher: the picker is limited to
  // expense groups, and the new ledger drops straight into the current line.
  const expenseGroupIds = useMemo(() => {
    const groups = (db.accountGroups || []).filter((g) => g.companyId === currentCompany.id);
    const byId = new Map(groups.map((g) => [String(g.id), g]));
    const isExpense = (g) => {
      let cur = g;
      const seen = new Set();
      while (cur && !seen.has(String(cur.id))) {
        seen.add(String(cur.id));
        if (String(cur.groupCategory || '').trim() === 'Expense') return true;
        cur = cur.parentGroupId ? byId.get(String(cur.parentGroupId)) : null;
      }
      return false;
    };
    return groups.filter(isExpense).map((g) => String(g.id));
  }, [db.accountGroups, currentCompany.id]);

  const openLedgerCreate = (lineIdxRaw = null) => {
    // Guard against being wired straight to onClick, where the argument would
    // be a click event rather than a line index.
    const lineIdx = Number.isInteger(lineIdxRaw) ? lineIdxRaw : null;
    if (typeof openModal !== 'function') {
      notify.error('Create the ledger under Master Data → Chart of Accounts.');
      return;
    }
    openModal(
      <ChartAccountForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        openModal={openModal}
        includeGroupIds={expenseGroupIds}
        onCreated={(created) => {
          if (!created?.id) return;
          const idx = lineIdx === null ? formData.lines.findIndex((l) => !String(l.ledgerId || '').trim()) : lineIdx;
          const target = idx >= 0 ? idx : formData.lines.length;
          setFormData((p) => {
            const lines = target >= p.lines.length ? [...p.lines, emptyExpenseLine()] : [...p.lines];
            lines[target] = {
              ...lines[target],
              ledgerId: String(created.id),
              gstRate: created.gstRate !== null && created.gstRate !== undefined ? Number(created.gstRate) : 0,
            };
            return { ...p, lines };
          });
        }}
        onClose={() => openModal(null)}
      />,
      { title: 'New Expense Ledger', maxWidthClass: 'max-w-2xl' }
    );
  };

  const addLine = () => setFormData((p) => ({ ...p, lines: [...p.lines, emptyExpenseLine()] }));
  const removeLine = (idx) =>
    setFormData((p) => ({ ...p, lines: p.lines.length > 1 ? p.lines.filter((_, i) => i !== idx) : p.lines }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    const wantsDraft = submitAsDraft;
    if (wantsDraft) setSubmitAsDraft(false);

    let expenseNumber = String(formData.number || '').trim();
    if (isExpenseAuto) {
      if (lockExpenseNumber) expenseNumber = String(generatedExpenseNumber || '').trim();
      else if (!expenseNumber) expenseNumber = String(generatedExpenseNumber || '').trim();
    }
    const expenseNumberClash = db.expenses.some((ex) => ex.companyId === currentCompany.id && String(ex.number || '').trim() === expenseNumber);
    const usableLines = computed.rows.filter((r) => String(r.ledgerId || '').trim() && r.amount > 0);

    // One pass, every failure, each at its own field.
    expenseErrors.reset();
    expenseErrors.require('number', expenseNumber, 'Voucher number is required');
    expenseErrors.check(
      'number',
      !expenseNumber || !expenseNumberClash,
      'That number is already used. Change it, or adjust numbering in Company Profile.'
    );
    expenseErrors.require('date', formData.date, 'Voucher date is required');
    expenseErrors.require('dueDate', formData.dueDate, 'Due date is required');
    expenseErrors.check('lines', usableLines.length > 0, 'Add at least one line with a ledger and an amount.');
    expenseErrors.check(
      'lines',
      !(formData.lines || []).some((l) => Number(l.amount) > 0 && !String(l.ledgerId || '').trim()),
      'Every line with an amount needs an expense ledger.'
    );
    if (expenseErrors.failed()) return;

    if (gstEnabled && !companyState) {
      notify.error('Please set Company State in Tax & Compliances before creating GST expenses.');
      return;
    }

    const ledgerName = (id) => expenseLedgers.find((l) => String(l.id) === String(id))?.name || '';

    // Server first: an unpaid expense is a liability; it must reach the books
    // or not exist. Drafts stay local until they become real.
    let backendDocId = null;
    let serverNumber = '';
    if (!wantsDraft && hasDocsApiSession()) {
      try {
        const saved = await createDocApi('expense', {
          number: expenseNumber || undefined,
          date: formData.date,
          dueDate: formData.dueDate || null,
          refNo: formData.refNo || null,
          refDate: formData.refDate || null,
          partyId: vendor?.backendPartyId ? String(vendor.backendPartyId) : null,
          partyName: getVendorDisplayName(vendor) || 'Expense',
          partyGstin: vendorGstin || null,
          placeOfSupplyState: vendorState || null,
          description: formData.description || null,
          subtotal: computed.subtotal,
          cgstTotal: computed.cgstTotal,
          sgstTotal: computed.sgstTotal,
          igstTotal: computed.igstTotal,
          gstTotal: computed.gstTotal,
          total: computed.total,
          status: 'Unpaid',
          items: usableLines.map((r) => ({
            description: `${ledgerName(r.ledgerId)}${r.description ? ` — ${r.description}` : ''}`,
            quantity: 1,
            rate: r.amount,
            gstRate: r.gstRate,
            taxableAmount: r.amount,
            gstAmount: r.gstAmount,
            lineTotal: r.lineTotal,
          })),
        });
        backendDocId = saved?.id || null;
        serverNumber = String(saved?.number || '');
      } catch (err) {
        notify.error(String(err?.message || 'Expense not saved to the server.'));
        return;
      }
    }

    const newExpense = {
      id: (db.expenses || []).reduce((m, x) => Math.max(m, Number(x?.id) || 0), 0) + 1,
      companyId: currentCompany.id,
      backendDocId,
      number: serverNumber || expenseNumber,
      date: formData.date,
      dueDate: formData.dueDate,
      refNo: formData.refNo,
      refDate: formData.refDate,
      description: formData.description,
      costCenterId: formData.costCenterId,
      vendorId: formData.vendorId,
      vendorName: getVendorDisplayName(vendor),
      vendorGstin: vendorGstin,
      placeOfSupplyState: vendorState,
      taxType: isIntra ? 'CGST_SGST' : 'IGST',
      lines: usableLines.map((r) => ({ ...r, ledgerName: ledgerName(r.ledgerId) })),
      taxableTotal: computed.subtotal,
      subtotal: computed.subtotal,
      cgstTotal: computed.cgstTotal,
      sgstTotal: computed.sgstTotal,
      igstTotal: computed.igstTotal,
      gstTotal: computed.gstTotal,
      total: computed.total,
      amount: computed.subtotal,
      paidAmount: 0,
      status: wantsDraft ? 'Draft' : 'Unpaid',
      // Where this was entered from, so the header's scope can find it later.
      branchId: activeBranchId || '',
      warehouseId: String(localStorage.getItem('activeWarehouseId') || '').trim(),
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      expenses: [...db.expenses, newExpense],
      companies: bumpCompanyNextNumber({ db, companyId: currentCompany.id, voucherKey: 'expense', usedNumber: expenseNumber, branchId: activeBranchId || null }),
    });
    onClose?.();
    notify.success('Expense created!');
  };

  const costCenters = (db.costCenters || []).filter((c) => c.companyId === currentCompany.id);

  // The shared document contract: same keys on an expense voucher as on a
  // bill.
  const onFormKeyDown = useDocumentFormKeys({
    formRef,
    lineCount: formData.lines.length,
    addLine,
    removeLine,
  });

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown} noValidate className="space-y-6">
      <DocFormActions
        primaryLabel="Submit Expense"
        secondaryLabel="Save Draft"
        onSecondary={submitExpenseAsDraft}
      />

      {/* Voucher number and date sit to the right of the heading so the body
          of the form keeps the full width for entry. */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="ui-t-sec">Expense</div>
          <div className="text-xs ui-muted">Book a spend against one or more expense ledgers.</div>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className="block text-sm font-medium mb-1">Voucher No.</label>
            <input
              type="text"
              value={formData.number}
              onChange={(e) => {
                expenseErrors.clearField('number');
                setFormData({ ...formData, number: e.target.value });
              }}
              className={`ui-input w-full px-3 py-2 ${lockExpenseNumber ? 'ui-sunken' : ''}`}
              disabled={lockExpenseNumber}
              required
              {...expenseErrors.props('number')}
            />
            <FieldError error={expenseErrors.error('number')} id={expenseErrors.errorId('number')} />
          </div>
          <div className="w-44">
            <label className="block text-sm font-medium mb-1">Date</label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => {
                expenseErrors.clearField('date');
                setFormData({ ...formData, date: e.target.value });
              }}
              className="ui-input w-full px-3 py-2"
              required
              {...expenseErrors.props('date')}
            />
            <FieldError error={expenseErrors.error('date')} id={expenseErrors.errorId('date')} />
          </div>
        </div>
      </div>

      {/* Vendor gets a line of its own — it drives GST on every line below. */}
      <div>
        <VendorPicker
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          value={formData.vendorId}
          onChange={(vendorId) => setFormData((prev) => ({ ...prev, vendorId }))}
          label="Vendor"
          showCreateButton
        />
        {formData.vendorId ? (
          <div className="text-xs ui-muted mt-1">
            {vendorChargesGst
              ? `Registered vendor — GST applies at each ledger's rate (${isIntra ? 'CGST + SGST' : 'IGST'}).`
              : `${String(gstRegistration || 'Unregistered')} vendor — no GST on this expense.`}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Vendor Inv No.</label>
          <input
            type="text"
            value={formData.refNo}
            onChange={(e) => setFormData({ ...formData, refNo: e.target.value })}
            className="ui-input w-full px-3 py-2"
            placeholder="Vendor's invoice number"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Vendor Inv Date</label>
          <input
            type="date"
            value={formData.refDate}
            onChange={(e) => setFormData({ ...formData, refDate: e.target.value })}
            className="ui-input w-full px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Due Date</label>
          <input
            type="date"
            value={formData.dueDate}
            onChange={(e) => {
              expenseErrors.clearField('dueDate');
              setFormData({ ...formData, dueDate: e.target.value, dueDateTouched: true });
            }}
            className="ui-input w-full px-3 py-2"
            required
            {...expenseErrors.props('dueDate')}
          />
          <FieldError error={expenseErrors.error('dueDate')} id={expenseErrors.errorId('dueDate')} />
          {vendor ? (
            <div className="text-xs ui-muted mt-1">
              {termDaysFor(vendor, 0) > 0 ? termsLabel(vendor, 0) : 'No credit period — due on the expense date'}
            </div>
          ) : null}
        </div>

        {costCenters.length ? (
          <div>
            <label className="block text-sm font-medium mb-1">Cost Center</label>
            <select
              value={formData.costCenterId || ''}
              onChange={(e) => setFormData({ ...formData, costCenterId: e.target.value ? Number(e.target.value) : '' })}
              className="ui-select w-full px-3 py-2"
            >
              <option value="">— none —</option>
              {costCenters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Expense Ledgers (Direct / Indirect Expenses)</label>
          <span className="flex items-center gap-3">
            <FieldError error={expenseErrors.error('lines')} id={expenseErrors.errorId('lines')} />
            <button type="button" onClick={addLine} className="ui-fg ui-hover-fg text-sm flex items-center gap-1">
              <Plus size={16} /> Add Row
            </button>
          </span>
        </div>

        {expenseLedgers.length === 0 ? (
          <div className="ui-card p-4 text-sm ui-muted mb-2">
            No expense ledgers yet — pick <span className="font-medium">+ Create new ledger…</span> in the Expense Ledger
            column, or create them under Master Data → Chart of Accounts in a Direct or Indirect Expenses group.
          </div>
        ) : null}

        <div className="border rounded-lg overflow-x-auto">
          <table className="ui-table w-full ui-table-wide">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="ui-th w-10">#</th>
                <th className="ui-th">Expense Ledger</th>
                <th className="ui-th">Description</th>
                <th className="ui-th ui-num">Amount</th>
                <th className="ui-th">GST %</th>
                <th className="ui-th ui-num">GST Amount</th>
                <th className="ui-th ui-num">Total</th>
                <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {formData.lines.map((line, idx) => {
                const row = computed.rows[idx] || { gstAmount: 0, lineTotal: 0 };
                return (
                  <tr key={idx} data-line-row={idx}>
                    <td className="px-3 py-2 ui-muted">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <select
                        value={line.ledgerId || ''}
                        onChange={(e) => {
                          if (e.target.value === NEW_LEDGER_OPTION) {
                            openLedgerCreate(idx);
                            return;
                          }
                          onPickLedger(idx, e.target.value);
                        }}
                        className="ui-select w-full px-2 py-1"
                      >
                        <option value="">Select ledger</option>
                        {expenseLedgers.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                        <option value={NEW_LEDGER_OPTION}>+ Create new ledger…</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={line.description || ''}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        className="ui-input w-full px-2 py-1"
                        placeholder="Optional detail"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.amount}
                        onChange={(e) => updateLine(idx, { amount: e.target.value })}
                        className="ui-input w-28 px-2 py-1 text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {/* An unregistered vendor cannot charge GST, so the rate is
                          not a choice at all — showing NA beats a dead dropdown. */}
                      {vendorChargesGst ? (
                        <select
                          value={String(line.gstRate ?? 0)}
                          onChange={(e) => updateLine(idx, { gstRate: Number(e.target.value) })}
                          className="ui-select w-24 px-2 py-1"
                        >
                          {[0, 0.25, 3, 5, 12, 18, 28].map((r) => (
                            <option key={r} value={String(r)}>{r}%</option>
                          ))}
                        </select>
                      ) : (
                        <span className="ui-muted text-sm" title="GST applies only to registered vendors">NA</span>
                      )}
                    </td>
                    <td className="ui-col-amount px-3 py-2 text-right">
                      {vendorChargesGst ? formatMoney(row.gstAmount, currentCompany) : <span className="ui-muted">NA</span>}
                    </td>
                    <td className="ui-col-amount px-3 py-2 text-right font-semibold">{formatMoney(row.lineTotal, currentCompany)}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeLine(idx)} className="text-[rgb(var(--neg))]" aria-label={`Remove line ${idx + 1}`}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Narration reads as a summary of the lines, so it comes after them. */}
      <div>
        <label className="block text-sm font-medium mb-1">Narration</label>
        <input
          type="text"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="ui-input w-full px-3 py-2"
          placeholder="What this spend was for"
        />
      </div>

      <div className="flex justify-end">
        <div className="w-80 space-y-2">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>{formatMoney(computed.subtotal, currentCompany)}</span>
          </div>
          {vendorChargesGst ? (
            isIntra ? (
              <>
                <div className="flex justify-between">
                  <span>CGST:</span>
                  <span>{formatMoney(computed.cgstTotal, currentCompany)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SGST:</span>
                  <span>{formatMoney(computed.sgstTotal, currentCompany)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between">
                <span>IGST:</span>
                <span>{formatMoney(computed.igstTotal, currentCompany)}</span>
              </div>
            )
          ) : (
            <div className="flex justify-between ui-muted">
              <span>GST:</span>
              <span>NA</span>
            </div>
          )}
          <div className="ui-total-row border-t pt-2">
            <span>Total Expense:</span>
            <span>{formatMoney(computed.total, currentCompany)}</span>
          </div>
        </div>
      </div>

      <DocFormFootnote />
    </form>
  );
};

const ItemsList = ({ db, setDb, openModal, currentCompany, warehouses = [] }) => {
  const items = db.items.filter((i) => i.companyId === currentCompany.id);
  const itemSearch = useListSearch(items, ['code', 'name', 'hsnSac', 'category', 'barcode']);
  const itemSearchFilters = useColumnFilters();
  const shownItems = itemSearchFilters.applyFilters(itemSearch.filtered, {
    code: (r) => r.code,
    name: (r) => r.name,
    type: (r) => r.type,
    hsn: (r) => r.hsnSac,
    gst: (r) => r.gstRate,
    price: (r) => r.salePrice,
  });
  const inventoryByItemId = useMemo(() => {
    return computeInventorySummaryByItemId({ db, companyId: currentCompany.id });
  }, [db, currentCompany.id]);

  const getItemReferences = (itemId) => {
    const idStr = String(itemId);
    const sources = [
      { key: 'invoices', label: 'Invoice' },
      { key: 'estimates', label: 'Estimate' },
      { key: 'creditNotes', label: 'Credit Note' },
      { key: 'purchaseOrders', label: 'Purchase Order' },
      { key: 'bills', label: 'Bill' },
      { key: 'debitNotes', label: 'Debit Note' },
    ];

    const refs = [];
    for (const src of sources) {
      const docs = Array.isArray(db[src.key]) ? db[src.key] : [];
      for (const doc of docs) {
        if (doc?.companyId !== currentCompany.id) continue;
        const lines = Array.isArray(doc?.items) ? doc.items : [];
        const used = lines.some((l) => String(l?.itemId || '') === idStr);
        if (!used) continue;
        const num = String(doc?.number || '').trim();
        refs.push(`${src.label}${num ? ` ${num}` : ''}`);
      }
    }
    return refs;
  };

  const onEdit = (item) => {
    openModal(
      <ItemForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        warehouses={warehouses}
        initialData={item}
        onClose={() => openModal(null)}
      />,
      { title: 'Edit Item', maxWidthClass: 'max-w-3xl' }
    );
  };

  const onDelete = async (item) => {
    const refs = getItemReferences(item.id);
    if (refs.length) {
      const preview = refs.slice(0, 5).join(', ');
      notify.error(`Cannot delete this item because it is used in: ${preview}${refs.length > 5 ? '...' : ''}`);
      return;
    }

    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete item "${String(item.name || '').trim() || String(item.code || '').trim() || 'this item'}"?`, confirmLabel: 'Yes, continue' });
    if (!ok) return;

    setDb({
      ...db,
      items: db.items.filter((i) => !(i.companyId === currentCompany.id && i.id === item.id)),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Items</h3>
        <button
          onClick={() =>
            openModal(
              <ItemForm
                db={db}
                setDb={setDb}
                currentCompany={currentCompany}
                warehouses={warehouses}
                onClose={() => openModal(null)}
              />,
              { title: 'New Item', maxWidthClass: 'max-w-3xl' }
            )
          }
          className="ui-btn ui-btn-primary "
        >
          <Plus size={20} /> New Item
        </button>
      </div>

      <ListToolbar
        search={itemSearch.query}
        onSearch={itemSearch.setQuery}
        placeholder="Search items (code, name, HSN, category, barcode)"
        count={shownItems.length}
        countLabel="items"
        onExport={() =>
          exportRows({
            fileName: `Items_${currentCompany?.name || 'company'}`,
            label: 'item(s)',
            columns: [
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Name' },
              { key: 'type', label: 'Type' },
              { key: 'category', label: 'Category' },
              { key: 'hsnSac', label: 'HSN/SAC' },
              { key: 'gstRate', label: 'GST %', value: (r) => Number(r.gstRate || 0) },
              { key: 'salePrice', label: 'Sale Price', value: (r) => Number(r.salePrice || 0) },
              { key: 'purchasePrice', label: 'Purchase Price', value: (r) => Number(r.purchasePrice || 0) },
            ],
            rows: shownItems,
          })
        }
        exportTitle="Items — {currentCompany?.name || 'Company'}"
        exportFileName={`Items_${currentCompany?.name || 'company'}`}
        exportSheetName="Items"
        exportColumns={[
              { key: 'code', label: 'Code' },
              { key: 'name', label: 'Name' },
              { key: 'type', label: 'Type' },
              { key: 'category', label: 'Category' },
              { key: 'hsnSac', label: 'HSN/SAC' },
              { key: 'gstRate', label: 'GST %', value: (r) => Number(r.gstRate || 0) },
              { key: 'salePrice', label: 'Sale Price', value: (r) => Number(r.salePrice || 0) },
              { key: 'purchasePrice', label: 'Purchase Price', value: (r) => Number(r.purchasePrice || 0) },
        ]}
        exportRows={shownItems}
      />

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="Code" col="code" state={itemSearchFilters} className="ui-th" />
              <ColumnHeader label="Name" col="name" state={itemSearchFilters} className="ui-th" />
              <ColumnHeader label="Type" col="type" state={itemSearchFilters} className="ui-th" />
              <ColumnHeader label="HSN/SAC" col="hsn" state={itemSearchFilters} className="ui-th" />
              <ColumnHeader label="GST %" col="gst" state={itemSearchFilters} className="ui-th" />
              <ColumnHeader label="Sale Price" col="price" state={itemSearchFilters} className="ui-th" />
              <th className="ui-th">Stock</th>
              <th className="ui-th ui-num">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shownItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-10 text-center ui-muted">
                  No items yet
                </td>
              </tr>
            ) : null}
            {shownItems.map((item) => (
              <tr key={item.id} className="ui-hover-sunken">
                <td className="px-4 py-2.5 ui-col-entity">{item.code}</td>
                <td className="px-4 py-2.5 ui-col-meta">{item.name}</td>
                <td className="px-4 py-2.5 ui-col-meta">{item.type}</td>
                <td className="px-4 py-2.5 ui-col-id">{item.hsnSac || '-'}</td>
                <td className="px-4 py-2.5 ui-col-meta">{Number.isFinite(Number(item.gstRate)) ? Number(item.gstRate) : 0}</td>
                <td className="px-4 py-2.5 ui-col-meta">{formatMoney(item.salePrice || 0, currentCompany)}</td>
                <td className="px-4 py-2.5 ui-col-meta">
                  {isStockItem(item) ? (
                    <>
                      {(inventoryByItemId.get(String(item.id))?.closingQty ?? 0)} {item.unit}
                    </>
                  ) : (
                    '-'
                  )}
                </td>
                <td className="px-4 py-2.5 ui-col-meta">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      className="px-3 py-1.5 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm flex items-center gap-1"
                      title="Edit"
                    >
                      <Pencil size={16} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      className="px-3 py-1.5 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm flex items-center gap-1 text-[rgb(var(--neg))]"
                      title="Delete"
                    >
                      <Trash2 size={16} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const NEW_CATEGORY_OPTION = '__new_item_category__';

const ItemForm = ({ db, setDb, currentCompany, warehouses = [], initialData = null, onClose }) => {
  const { isEnabled: itemFeatureEnabled } = useFeatures();
  // Batch and expiry are only offered when the company has switched the
  // capability on; nothing downstream asks for a batch otherwise.
  const batchCapable = itemFeatureEnabled('batchExpiry') || itemFeatureEnabled('batchSerial');
  const itemErrors = useFieldErrors('item');
  const isEdit = Boolean(initialData);

  const [formData, setFormData] = useState(() => {
    if (initialData) {
      return {
        code: String(initialData.code || ''),
        name: String(initialData.name || ''),
        description: String(initialData.description || ''),
        category: String(initialData.category || ''),
        type: initialData.type || 'Goods',
        unit: initialData.unit || 'Pcs',
        hsnSac: String(initialData.hsnSac || ''),
        gstRate: Number.isFinite(Number(initialData.gstRate)) ? Number(initialData.gstRate) : 0,
        salePrice: Number.isFinite(Number(initialData.salePrice)) ? Number(initialData.salePrice) : 0,
        purchasePrice: Number.isFinite(Number(initialData.purchasePrice)) ? Number(initialData.purchasePrice) : 0,
        mrp: Number.isFinite(Number(initialData.mrp)) ? Number(initialData.mrp) : '',
        trackingType: initialData.trackingType || 'NONE',
        barcode: String(initialData.barcode || ''),
        reorderLevel: Number.isFinite(Number(initialData.reorderLevel)) ? Number(initialData.reorderLevel) : '',
        openingWarehouseId: String(initialData.openingWarehouseId || '').trim(),
        openingQty: Number.isFinite(Number(initialData.openingQty))
          ? Number(initialData.openingQty)
          : Number.isFinite(Number(initialData.stock))
            ? Number(initialData.stock)
            : 0,
      };
    }

    return {
      code: nextItemCode(db, currentCompany, 'Goods'),
      name: '',
      description: '',
      category: '',
      type: 'Goods',
      unit: 'Pcs',
      hsnSac: '',
      gstRate: 0,
      salePrice: 0,
      purchasePrice: 0,
      mrp: '',
      trackingType: 'NONE',
      barcode: '',
      reorderLevel: '',
      openingQty: 0,
      // Opening stock has to land somewhere. The warehouse the user is already
      // scoped to is the right guess; the field is editable either way.
      openingWarehouseId: String(localStorage.getItem('activeWarehouseId') || '').trim(),
    };
  });

  // Categories come from the master; an item that still carries a hand-typed
  // one keeps it, and a new one can be added without leaving this form.
  // The form opens with a snapshot of the book, so a category added from here
  // is remembered locally too — otherwise it would read as "not in the master"
  // until the form is reopened.
  const [addedCategories, setAddedCategories] = useState([]);
  const categoryNames = useMemo(() => {
    const fromMaster = (db.itemCategories || [])
      .filter((c) => c.companyId === currentCompany.id)
      .map((c) => String(c.name || '').trim())
      .filter(Boolean);
    return [...new Set([...fromMaster, ...addedCategories])].sort((a, b) => a.localeCompare(b));
  }, [db.itemCategories, currentCompany.id, addedCategories]);

  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const saveNewCategory = () => {
    const name = String(newCategoryName || '').trim();
    if (!name) {
      notify.error('Category name is required');
      return;
    }
    const exists = (db.itemCategories || []).some(
      (c) => c.companyId === currentCompany.id && String(c.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (!exists) {
      const nextId = Math.max(0, ...(db.itemCategories || []).map((c) => Number(c.id) || 0)) + 1;
      setDb((prev) => ({
        ...prev,
        itemCategories: [...(prev.itemCategories || []), { id: nextId, companyId: currentCompany.id, name, description: '' }],
      }));
    }
    setAddedCategories((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setFormData((prev) => ({ ...prev, category: name }));
    setNewCategoryName('');
    setNewCategoryOpen(false);
    notify.success(`Category "${name}" added.`);
  };

  const trackingValue = String(formData.trackingType || 'NONE');
  const batchEnabled = trackingValue === 'BATCH' || trackingValue === 'BATCH_EXPIRY';
  const expiryEnabled = trackingValue === 'BATCH_EXPIRY';

  const uoms = (db.uoms || [])
    .filter((u) => u.companyId === currentCompany.id)
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  const uomNames = uoms.map((u) => String(u.name || '').trim()).filter(Boolean);
  const unitValue = String(formData.unit ?? '').trim();

  const [newUnitOpen, setNewUnitOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const saveNewUnit = () => {
    const name = String(newUnitName || '').trim();
    if (!name) {
      notify.error('Unit name is required');
      return;
    }
    const exists = (db.uoms || []).some(
      (u) => u.companyId === currentCompany.id && String(u.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (!exists) {
      const nextUomId = Math.max(0, ...(db.uoms || []).map((u) => Number(u.id) || 0)) + 1;
      setDb({
        ...db,
        uoms: [...(db.uoms || []), { id: nextUomId, companyId: currentCompany.id, name, createdAt: new Date().toISOString() }],
      });
    }
    setFormData((p) => ({ ...p, unit: name }));
    setNewUnitOpen(false);
    setNewUnitName('');
    notify.success(exists ? `Unit "${name}" selected.` : `Unit "${name}" added.`);
  };

  const gstRates = (db.gstRates || [])
    .filter((r) => r.companyId === currentCompany.id)
    .slice()
    .sort((a, b) => Number(a.rate) - Number(b.rate));
  const gstRateValues = gstRates.map((r) => String(Number(r.rate)));
  const gstRateValue = String(formData.gstRate ?? 0);

  const handleSubmit = (e) => {
    e.preventDefault();

    const code = String(formData.code || '').trim();
    const name = String(formData.name || '').trim();

    const gstRate = parseFloat(String(formData.gstRate ?? '0'));
    const salePrice = parseFloat(String(formData.salePrice ?? '0'));
    const purchasePrice = parseFloat(String(formData.purchasePrice ?? '0'));
    const mrp = parseFloat(String(formData.mrp ?? '0'));
    const openingQty = parseFloat(String(formData.openingQty ?? '0'));

    const clash = (db.items || []).some(
      (it) =>
        it.companyId === currentCompany.id &&
        String(it.code || '').trim().toLowerCase() === code.toLowerCase() &&
        (!isEdit || String(it.id) !== String(initialData?.id))
    );
    // Both blanks and the clash reported together, at their own fields.
    itemErrors.reset();
    itemErrors.require('code', code, 'Item code is required');
    itemErrors.check('code', !code || !clash, 'That code is already used by another item.');
    itemErrors.require('name', name, 'Item name is required');
    if (itemErrors.failed()) return;

    if (isEdit) {
      const existing = (db.items || []).find((it) => it.companyId === currentCompany.id && String(it.id) === String(initialData?.id));
      if (!existing) {
        notify.error('Item not found. It may have been removed.');
        onClose?.();
        return;
      }

      const updated = {
        ...existing,
        companyId: currentCompany.id,
        code,
        name,
        description: String(formData.description || '').trim(),
        category: String(formData.category || '').trim(),
        type: formData.type,
        unit: formData.unit,
        hsnSac: String(formData.hsnSac || ''),
        gstRate: Number.isFinite(gstRate) ? gstRate : 0,
        salePrice: Number.isFinite(salePrice) ? salePrice : 0,
        purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : 0,
        mrp: Number.isFinite(mrp) && mrp > 0 ? mrp : null,
        trackingType: formData.trackingType || 'NONE',
        barcode: String(formData.barcode || '').trim(),
        reorderLevel: Number(formData.reorderLevel) > 0 ? Number(formData.reorderLevel) : null,
        openingQty: Number.isFinite(openingQty) ? Math.max(0, openingQty) : 0,
        openingWarehouseId: String(formData.openingWarehouseId || '').trim(),
        // keep legacy field in sync (older screens/data)
        stock: Number.isFinite(openingQty) ? Math.max(0, openingQty) : Number(existing?.stock ?? 0) || 0,
      };

      setDb({
        ...db,
        items: db.items.map((it) => (it.companyId === currentCompany.id && String(it.id) === String(existing.id) ? updated : it)),
      });
      onClose?.();
      notify.success('Item updated!');
      return;
    }

    const nextId = Math.max(0, ...(db.items || []).map((i) => Number(i.id) || 0)) + 1;
    const newItem = {
      id: nextId,
      companyId: currentCompany.id,
      code,
      name,
      description: String(formData.description || '').trim(),
      category: String(formData.category || '').trim(),
      type: formData.type,
      unit: formData.unit,
      hsnSac: String(formData.hsnSac || ''),
      gstRate: Number.isFinite(gstRate) ? gstRate : 0,
      salePrice: Number.isFinite(salePrice) ? salePrice : 0,
      purchasePrice: Number.isFinite(purchasePrice) ? purchasePrice : 0,
      mrp: Number.isFinite(mrp) && mrp > 0 ? mrp : null,
      trackingType: formData.trackingType || 'NONE',
      barcode: String(formData.barcode || '').trim(),
      reorderLevel: Number(formData.reorderLevel) > 0 ? Number(formData.reorderLevel) : null,
      openingQty: Number.isFinite(openingQty) ? Math.max(0, openingQty) : 0,
      stock: Number.isFinite(openingQty) ? Math.max(0, openingQty) : 0,
    };

    setDb({
      ...db,
      items: [...db.items, newItem],
      // Advance the series so the next item of this type does not offer the
      // number this one just took.
      companies: bumpItemCodeSeries(db, currentCompany, newItem.type, newItem.code),
    });
    onClose?.();
    notify.success('Item created!');
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/*
          Type first: it decides which code series the item is numbered from
          and whether batch and expiry apply, so asking it last meant the code
          was already minted from the wrong series.
        */}
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Type</label>
          <select
            value={formData.type}
            onChange={(e) => {
              const type = e.target.value;
              setFormData((p) => ({
                ...p,
                type,
                // Only renumber a new item; an existing code is the one on the
                // shelf label and is not ours to change.
                code: initialData ? p.code : nextItemCode(db, currentCompany, type),
                trackingType: type === 'Service' ? 'NONE' : p.trackingType,
              }));
            }}
            className="ui-select w-full px-3 py-2"
          >
            <option>Goods</option>
            <option>Service</option>
          </select>
          <p className="ui-caption mt-1">
            {String(formData.type || '').toLowerCase() === 'service'
              ? 'A service is not stocked, so it has no opening quantity, batch or expiry.'
              : 'Goods are stocked, and can be tracked by batch and expiry.'}
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Code</label>
          <input
            type="text"
            value={formData.code}
            onChange={(e) => {
              itemErrors.clearField('code');
              setFormData({ ...formData, code: e.target.value });
            }}
            className="ui-input w-full px-3 py-2"
            required
            {...itemErrors.props('code')}
          />
          <FieldError error={itemErrors.error('code')} id={itemErrors.errorId('code')} />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => {
              itemErrors.clearField('name');
              setFormData({ ...formData, name: e.target.value });
            }}
            className="ui-input w-full px-3 py-2"
            required
            {...itemErrors.props('name')}
          />
          <FieldError error={itemErrors.error('name')} id={itemErrors.errorId('name')} />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="ui-input w-full px-3 py-2"
            rows={2}
            placeholder="Shown on documents alongside the item name"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Category</label>
          <select
            value={categoryNames.includes(formData.category) ? formData.category : formData.category ? formData.category : ''}
            onChange={(e) => {
              if (e.target.value === NEW_CATEGORY_OPTION) {
                setNewCategoryOpen(true);
                return;
              }
              setFormData({ ...formData, category: e.target.value });
            }}
            className="ui-select w-full px-3 py-2"
          >
            <option value="">No category</option>
            {categoryNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {formData.category && !categoryNames.includes(formData.category) ? (
              <option value={formData.category}>{formData.category} (not in the master)</option>
            ) : null}
            <option value={NEW_CATEGORY_OPTION}>+ Create a new category…</option>
          </select>
          <div className="text-xs ui-muted mt-1">Maintained under Master Data → Item Categories.</div>

          {newCategoryOpen ? (
            <div className="mt-2 rounded-lg border p-3 ui-sunken space-y-2">
              <label className="block text-sm font-medium">New category</label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="ui-input w-full px-3 py-2"
                placeholder="e.g. Beverages"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setNewCategoryOpen(false);
                    setNewCategoryName('');
                  }}
                  className="ui-btn ui-btn-secondary ui-btn-sm text-xs"
                >
                  Cancel
                </button>
                <button type="button" onClick={saveNewCategory} className="ui-btn ui-btn-primary ui-btn-sm text-xs">
                  Add category
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {String(formData.type || '').toLowerCase() === 'goods' ? (
          <div>
            <label className="block text-sm font-medium mb-1">Opening Stock (Qty)</label>
            <input
              type="number"
              value={formData.openingQty}
              onChange={(e) => setFormData({ ...formData, openingQty: e.target.value })}
              className="ui-input w-full px-3 py-2"
              min="0"
              step="0.01"
            />
            {/* Stock that does not say where it is cannot be sold from
                anywhere: every availability check is per warehouse. */}
            <label className="block text-sm font-medium mb-1 mt-3">Opening stock is held at</label>
            <select
              value={formData.openingWarehouseId || ''}
              onChange={(e) => setFormData({ ...formData, openingWarehouseId: e.target.value })}
              className="ui-select w-full px-3 py-2"
            >
              <option value="">Not assigned — counts in any warehouse</option>
              {(Array.isArray(warehouses) ? warehouses : []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div />
        )}
        <div>
          <label className="block text-sm font-medium mb-1">HSN/SAC</label>
          <input
            type="text"
            value={formData.hsnSac}
            onChange={(e) => setFormData({ ...formData, hsnSac: e.target.value })}
            className="ui-input w-full px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">GST %</label>
          <select
            value={gstRateValue}
            onChange={(e) => setFormData({ ...formData, gstRate: e.target.value })}
            className="ui-select w-full px-3 py-2"
          >
            {!gstRateValues.includes(gstRateValue) && <option value={gstRateValue}>{gstRateValue}% (legacy)</option>}
            {gstRates.length === 0 ? (
              <option value="0">0%</option>
            ) : (
              gstRates.map((r) => (
                <option key={r.id} value={String(Number(r.rate))}>
                  {Number(r.rate)}%
                </option>
              ))
            )}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Unit</label>
          <select
            value={unitValue}
            onChange={(e) => {
              if (e.target.value === '__new__') {
                setNewUnitOpen(true);
                return;
              }
              setFormData({ ...formData, unit: e.target.value });
            }}
            className="ui-select w-full px-3 py-2"
          >
            {unitValue && !uomNames.includes(unitValue) && <option value={unitValue}>{unitValue} (legacy)</option>}
            {uoms.length === 0 ? <option value={unitValue || 'Pcs'}>{unitValue || 'Pcs'}</option> : null}
            {uoms.map((u) => (
              <option key={u.id} value={u.name}>
                {u.name}
              </option>
            ))}
            <option value="__new__">+ New unit…</option>
          </select>
          {newUnitOpen ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                className="ui-input flex-1 px-3 py-2"
                placeholder="e.g. Box, Kg, Hour"
                autoFocus
              />
              <button type="button" onClick={saveNewUnit} className="ui-btn ui-btn-primary !h-9 text-xs">
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewUnitOpen(false);
                  setNewUnitName('');
                }}
                className="ui-btn ui-btn-secondary !h-9 text-xs"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Sale Price</label>
          <input
            type="number"
            value={formData.salePrice}
            onChange={(e) => setFormData({ ...formData, salePrice: e.target.value })}
            className="ui-input w-full px-3 py-2"
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Purchase Price</label>
          <input
            type="number"
            value={formData.purchasePrice}
            onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
            className="ui-input w-full px-3 py-2"
            min="0"
            step="0.01"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">MRP</label>
          <input
            type="number"
            value={formData.mrp}
            onChange={(e) => setFormData({ ...formData, mrp: e.target.value })}
            className="ui-input w-full px-3 py-2"
            min="0"
            step="0.01"
            placeholder="Maximum retail price"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Barcode</label>
          <input
            type="text"
            value={formData.barcode}
            onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
            className="ui-input w-full px-3 py-2"
            placeholder="Scan or type EAN/UPC"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Reorder level</label>
          <input
            type="number"
            value={formData.reorderLevel}
            onChange={(e) => setFormData({ ...formData, reorderLevel: e.target.value })}
            className="ui-input w-full px-3 py-2"
            min="0"
            step="1"
            placeholder="Alert when stock falls to this"
          />
        </div>
        {batchCapable && String(formData.type || '').toLowerCase() === 'goods' ? (
          <div className="col-span-2 rounded-lg border p-3 space-y-2">
            <div className="text-sm font-medium">Batch &amp; expiry</div>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="ui-checkbox mt-0.5"
                checked={batchEnabled}
                onChange={(e) =>
                  setFormData({ ...formData, trackingType: e.target.checked ? 'BATCH' : 'NONE' })
                }
              />
              <span>
                Track batches
                <span className="block text-xs ui-muted">
                  Purchases, sales and transfers of this item will ask for a batch number.
                </span>
              </span>
            </label>
            <label className={`flex items-start gap-2 text-sm ${batchEnabled ? 'cursor-pointer' : 'ui-subtle cursor-not-allowed'}`}>
              <input
                type="checkbox"
                className="ui-checkbox mt-0.5"
                checked={expiryEnabled}
                disabled={!batchEnabled}
                onChange={(e) =>
                  setFormData({ ...formData, trackingType: e.target.checked ? 'BATCH_EXPIRY' : 'BATCH' })
                }
              />
              <span>
                Track expiry
                <span className="block text-xs ui-muted">
                  Each batch also carries an expiry date, and the oldest is used first.
                </span>
              </span>
            </label>
          </div>
        ) : (
          <div />
        )}
      </div>
      <button type="submit" className="w-full px-4 py-2 ui-btn ui-btn-primary rounded-lg ">
        {isEdit ? 'Update Item' : 'Create Item'}
      </button>
    </form>
  );
};

const StockAdjustment = () => {
  return (
    <div className="ui-surface rounded-xl shadow-sm p-6 border">
      <h3 className="ui-t-sec mb-4">Stock Adjustment</h3>
      <p className="ui-muted">Adjust inventory stock levels</p>
    </div>
  );
};

const InventoryOverview = ({ db, currentCompany }) => {
  const items = db.items.filter((i) => i.companyId === currentCompany.id);

  const byItemId = useMemo(() => computeInventorySummaryByItemId({ db, companyId: currentCompany.id }), [db, currentCompany.id]);
  const totalValue = items.reduce((sum, i) => {
    if (!isStockItem(i)) return sum;
    const qty = Number(byItemId.get(String(i.id))?.closingQty ?? 0);
    return sum + qty * Number(i.purchasePrice ?? 0);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-6">
        <div className="ui-surface rounded-xl shadow-sm p-6 border">
          <h4 className="text-sm ui-muted mb-2">Total Items</h4>
          <p className="ui-money-lg">{items.length}</p>
        </div>
        <div className="ui-surface rounded-xl shadow-sm p-6 border">
          <h4 className="text-sm ui-muted mb-2">Inventory Value</h4>
          <p className="ui-money-lg">{formatMoney(totalValue, currentCompany)}</p>
        </div>
      </div>
    </div>
  );
};

const ChartOfAccounts = ({ db, setDb, openModal, currentCompany }) => {
  const accounts = db.chartOfAccounts.filter((a) => a.companyId === currentCompany.id);
  const [coaView, setCoaView] = useState('ledgers');
  const [openMenu, setOpenMenu] = useState(null);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const menuRef = useRef(null);

  const MENU_WIDTH = 192; // w-48
  const MENU_HEIGHT_ESTIMATE = 120;

  const LedgerCreateChooser = ({ onClose }) => {
    const openCustomerCreate = () => {
      openModal(
        <div className="ui-surface rounded-xl shadow-sm border p-6">
          <CustomerForm db={db} setDb={setDb} currentCompany={currentCompany} onClose={() => openModal(null)} />
        </div>,
        { title: 'New Customer', maxWidthClass: 'max-w-3xl' }
      );
    };

    const openVendorCreate = () => {
      openModal(
        <div className="ui-surface rounded-xl shadow-sm border p-6">
          <VendorForm db={db} setDb={setDb} currentCompany={currentCompany} onClose={() => openModal(null)} />
        </div>,
        { title: 'New Vendor', maxWidthClass: 'max-w-3xl' }
      );
    };

    const openOtherLedgerCreate = () => {
      openModal(
        <ChartAccountForm
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          openModal={openModal}
          excludeGroupCategories={['Customer', 'Vendor']}
          onClose={() => openModal(null)}
        />,
        { title: 'New Ledger', maxWidthClass: 'max-w-2xl' }
      );
    };

    return (
      <div className="space-y-4">
        <div className="text-sm ui-muted">Choose what you want to create:</div>

        <div className="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={openVendorCreate}
            className="w-full text-left px-4 py-3 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            <div className="font-semibold">1. Vendor</div>
            <div className="text-xs ui-muted">Opens vendor creation form</div>
          </button>

          <button
            type="button"
            onClick={openCustomerCreate}
            className="w-full text-left px-4 py-3 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            <div className="font-semibold">2. Customer</div>
            <div className="text-xs ui-muted">Opens customer creation form</div>
          </button>

          <button
            type="button"
            onClick={openOtherLedgerCreate}
            className="w-full text-left px-4 py-3 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            <div className="font-semibold">3. Others</div>
            <div className="text-xs ui-muted">Create any ledger other than Vendor/Customer ledgers</div>
          </button>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border ui-hover-sunken">
            Cancel
          </button>
        </div>
      </div>
    );
  };

  const accountTypes = (Array.isArray(db.accountTypes) ? db.accountTypes : [])
    .filter((t) => t.companyId === currentCompany.id)
    .filter((t) => !t.isLegacy)
    .slice()
    .sort((a, b) => {
      const am = String(a.main || '');
      const bm = String(b.main || '');
      if (am !== bm) return am.localeCompare(bm);
      return String(a.name || '').localeCompare(String(b.name || ''));
    });

  const accountGroups = (Array.isArray(db.accountGroups) ? db.accountGroups : [])
    .filter((g) => g.companyId === currentCompany.id)
    .filter((g) => !g.isLegacy)
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const typeById = useMemo(() => {
    const m = new Map();
    for (const t of accountTypes) m.set(String(t.id), t);
    return m;
  }, [accountTypes]);

  const groupById = useMemo(() => {
    const m = new Map();
    for (const g of accountGroups) m.set(String(g.id), g);
    return m;
  }, [accountGroups]);

  const typeRowToParent = (t) => {
    const main = String(t?.main || '').trim();
    const cls = String(t?.accountClass || '').trim();
    if (main === 'P&L') {
      if (cls === 'Expense') return 'Expenses';
      return 'Income';
    }
    if (cls === 'Liability' || cls === 'Equity') return 'Liabilities';
    return 'Assets';
  };

  useEffect(() => {
    if (!openMenu?.id) return;

    const onMouseDown = (e) => {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      const btn = e.target?.closest?.('[data-coa-menu-button]');
      if (btn && String(btn.getAttribute('data-coa-menu-button')) === String(openMenu.buttonKey)) return;
      setOpenMenu(null);
    };

    const onScrollOrResize = () => setOpenMenu(null);

    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);

    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [openMenu?.id]);

  const openRowMenu = (kind, id, anchorEl) => {
    const buttonKey = `${String(kind)}:${String(id)}`;

    setOpenMenu({ kind, id, buttonKey, left: 0, top: 0 });
    const rect = anchorEl?.getBoundingClientRect?.();
    if (!rect) return;

    const leftPref = rect.right - MENU_WIDTH;
    const left = Math.max(8, Math.min(leftPref, window.innerWidth - MENU_WIDTH - 8));

    const topPref = rect.bottom + 8;
    const top = Math.max(8, Math.min(topPref, window.innerHeight - MENU_HEIGHT_ESTIMATE - 8));

    setOpenMenu({ kind, id, buttonKey, left, top });
  };

  const ledgerRows = useMemo(() => {
    return accounts
      .map((a) => {
        const group = a?.groupId ? groupById.get(String(a.groupId)) : null;
        const typeRow = group ? typeById.get(String(group.typeId)) : null;
        return {
          ...a,
          _groupName: group?.name || '',
          _parent: typeRow
            ? typeRowToParent(typeRow)
            : String(a.main || '').trim() === 'P&L'
              ? (String(a.type || '').trim() === 'Expense' ? 'Expenses' : 'Income')
              : String(a.type || '').trim() === 'Liability' || String(a.type || '').trim() === 'Equity'
                ? 'Liabilities'
                : 'Assets',
        };
      })
      .sort((x, y) => {
        const pa = String(x._parent || '');
        const pb = String(y._parent || '');
        if (pa !== pb) return pa.localeCompare(pb);
        const ga = String(x._groupName || '');
        const gb = String(y._groupName || '');
        if (ga !== gb) return ga.localeCompare(gb);
        return String(x.name || '').localeCompare(String(y.name || ''));
      });
  }, [accounts, groupById, typeById]);

  const visibleLedgerRows = useMemo(() => {
    const q = String(ledgerSearch || '').trim().toLowerCase();
    if (!q) return ledgerRows;
    return ledgerRows.filter((a) => {
      const hay = `${String(a?.name || '')} ${String(a?.code || '')} ${String(a?._groupName || '')} ${String(a?._parent || '')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [ledgerRows, ledgerSearch]);

  const groupRows = useMemo(() => {
    return accountGroups
      .map((g) => {
        const typeRow = g?.typeId ? typeById.get(String(g.typeId)) : null;
        return {
          ...g,
          _parent: typeRow ? typeRowToParent(typeRow) : '-',
        };
      })
      .sort((a, b) => {
        const pa = String(a._parent || '');
        const pb = String(b._parent || '');
        if (pa !== pb) return pa.localeCompare(pb);
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [accountGroups, typeById]);

  const visibleGroupRows = useMemo(() => {
    const q = String(groupSearch || '').trim().toLowerCase();
    if (!q) return groupRows;
    return groupRows.filter((g) => {
      const hay = `${String(g?.name || '')} ${String(g?._parent || '')} ${String(g?.groupCategory || '')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [groupRows, groupSearch]);

  const openNewLedger = () => {
    openModal(<LedgerCreateChooser onClose={() => openModal(null)} />, { title: 'Create', maxWidthClass: 'max-w-lg' });
  };

  const openNewGroup = () => {
    openModal(<SimpleAccountGroupCreateForm db={db} setDb={setDb} currentCompany={currentCompany} onClose={() => openModal(null)} />, {
      title: 'New Group',
      maxWidthClass: 'max-w-2xl',
    });
  };

  const openEditLedger = (ledger) => {
    openModal(
      <ChartAccountForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        openModal={openModal}
        initialData={ledger}
        onClose={() => openModal(null)}
      />,
      { title: 'Edit Ledger', maxWidthClass: 'max-w-2xl' }
    );
  };

  const openEditGroup = (group) => {
    if (group?.isSystem && !group?.isUserDefined) {
      notify.error('System groups cannot be edited.');
      return;
    }

    openModal(
      <div className="ui-surface rounded-xl shadow-sm border p-6">
        <AccountGroupForm
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          initialData={group}
          onClose={() => openModal(null)}
        />
      </div>,
      { title: 'Edit Group', maxWidthClass: 'max-w-2xl' }
    );
  };

  const canDeleteLedger = (ledgerId) => {
    const id = String(ledgerId || '').trim();
    if (!id) return { ok: false, reason: 'Invalid ledger.' };

    const usedInJournal = (Array.isArray(db.journalEntries) ? db.journalEntries : [])
      .filter((j) => j.companyId === currentCompany.id)
      .some((j) => (Array.isArray(j.lines) ? j.lines : []).some((l) => String(l?.accountId || '').trim() === id));
    if (usedInJournal) return { ok: false, reason: 'Ledger is used in Journal Entries.' };

    const linkedCustomer = (Array.isArray(db.customers) ? db.customers : [])
      .filter((c) => c.companyId === currentCompany.id)
      .some((c) => String(c?.accountId || '').trim() === id);
    if (linkedCustomer) return { ok: false, reason: 'Ledger is linked to a Customer.' };

    const linkedVendor = (Array.isArray(db.vendors) ? db.vendors : [])
      .filter((v) => v.companyId === currentCompany.id)
      .some((v) => String(v?.accountId || '').trim() === id);
    if (linkedVendor) return { ok: false, reason: 'Ledger is linked to a Vendor.' };

    return { ok: true, reason: '' };
  };

  const deleteLedger = async (ledger) => {
    const check = canDeleteLedger(ledger?.id);
    if (!check.ok) {
      notify.error(`Cannot delete this ledger. ${check.reason}`);
      return;
    }

    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete ledger "${String(ledger?.name || '').trim() || 'this ledger'}"?`, confirmLabel: 'Yes, continue' });
    if (!ok) return;

    setDb({
      ...db,
      chartOfAccounts: (Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : []).filter(
        (a) => !(a.companyId === currentCompany.id && String(a.id) === String(ledger.id))
      ),
    });
  };

  const canDeleteGroup = (groupId) => {
    const id = String(groupId || '').trim();
    if (!id) return { ok: false, reason: 'Invalid group.' };

    const group = groupById.get(id);
    if (group?.isSystem && !group?.isUserDefined) return { ok: false, reason: 'System groups cannot be deleted.' };

    const usedByLedger = accounts.some((a) => String(a?.groupId || '').trim() === id);
    if (usedByLedger) return { ok: false, reason: 'Group is used by one or more ledgers.' };

    return { ok: true, reason: '' };
  };

  const deleteGroup = async (group) => {
    const check = canDeleteGroup(group?.id);
    if (!check.ok) {
      notify.error(`Cannot delete this group. ${check.reason}`);
      return;
    }

    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete group "${String(group?.name || '').trim() || 'this group'}"?`, confirmLabel: 'Yes, continue' });
    if (!ok) return;

    setDb({
      ...db,
      accountGroups: (Array.isArray(db.accountGroups) ? db.accountGroups : []).filter(
        (g) => !(g.companyId === currentCompany.id && String(g.id) === String(group.id))
      ),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Chart of Accounts</h3>
        <div className="flex gap-2">
          {coaView === 'ledgers' ? (
            <button
              type="button"
              onClick={openNewLedger}
              className="ui-btn ui-btn-primary "
            >
              <Plus size={20} /> New Ledger
            </button>
          ) : (
            <button
              type="button"
              onClick={openNewGroup}
              className="ui-btn ui-btn-primary "
            >
              <Plus size={20} /> New Group
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setOpenMenu(null);
            setCoaView('ledgers');
          }}
          className={`px-4 py-2 rounded-lg border text-sm ${ coaView === 'ledgers' ? 'ui-btn ui-btn-primary ui-border-strong-c' : 'ui-surface ui-hover-sunken ui-border-c'
          }`}
        >
          Ledgers
        </button>
        <button
          type="button"
          onClick={() => {
            setOpenMenu(null);
            setCoaView('groups');
          }}
          className={`px-4 py-2 rounded-lg border text-sm ${ coaView === 'groups' ? 'ui-btn ui-btn-primary ui-border-strong-c' : 'ui-surface ui-hover-sunken ui-border-c'
          }`}
        >
          Groups
        </button>
      </div>

      <div className="space-y-6">
        {coaView === 'ledgers' ? (
          <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
            <div className="ui-sunken px-6 py-3 border-b">
              <div className="font-bold ui-fg">Ledgers</div>
              <div className="text-xs ui-muted">View: Ledger → Group → Parent</div>
              <div className="mt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    className="ui-input flex-1 min-w-[220px] px-3 py-2 ui-surface"
                    placeholder="Search ledgers (name, code, group)"
                  />
                  <span className="text-xs ui-muted">{visibleLedgerRows.length} ledgers</span>
                  <button
                    type="button"
                    onClick={() =>
                      exportRows({
                        fileName: `ChartOfAccounts_${currentCompany?.name || 'company'}`,
                        label: 'ledger(s)',
                        columns: [
                          { key: 'code', label: 'Code' },
                          { key: 'name', label: 'Ledger' },
                          { key: 'group', label: 'Group', value: (r) => r._group || r.groupName || '' },
                          { key: 'parent', label: 'Parent', value: (r) => r._parent || '' },
                          { key: 'openingBalance', label: 'Opening', value: (r) => Number(r.openingBalance || 0) },
                          { key: 'balance', label: 'Balance', value: (r) => Number(r.balance || 0) },
                        ],
                        rows: visibleLedgerRows,
                      })
                    }
                    className="ui-btn ui-btn-secondary"
                  >
                    <Download size={15} aria-hidden="true" /> Export
                  </button>
                </div>
              </div>
            </div>
            <table className="ui-table w-full">
              <thead className="ui-sunken border-b">
                <tr>
                  <th className="ui-th">Ledger</th>
                  <th className="ui-th">Group</th>
                  <th className="ui-th">Parent</th>
                  <th className="ui-th ui-num">Balance</th>
                  <th className="ui-th ui-num">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleLedgerRows.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-sm ui-muted">
                      No ledgers found
                    </td>
                  </tr>
                ) : (
                  visibleLedgerRows.map((a) => {
                    const buttonKey = `ledger:${String(a.id)}`;
                    return (
                      <tr key={a.id} className="ui-hover-sunken">
                        <td className="px-4 py-2.5 ui-col-entity">{a.name}</td>
                        <td className="ui-col-meta px-4 py-2.5 ui-fg">{a._groupName || '-'}</td>
                        <td className="ui-col-meta px-4 py-2.5 ui-fg">{a._parent || '-'}</td>
                        <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{formatMoney(a.balance || 0, currentCompany)}</td>
                        <td
                          className="px-4 py-2.5 text-right"
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openMenu?.buttonKey === buttonKey) {
                                setOpenMenu(null);
                              } else {
                                openRowMenu('ledger', a.id, e.currentTarget);
                              }
                            }}
                            className="p-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c inline-flex"
                            aria-label="Ledger actions"
                            data-coa-menu-button={buttonKey}
                          >
                            <MoreVertical size={18} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
            <div className="ui-sunken px-6 py-3 border-b">
              <div className="font-bold ui-fg">Groups</div>
              <div className="text-xs ui-muted">All groups under Parents</div>
              <div className="mt-3">
                <input
                  type="text"
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  className="ui-input w-full px-3 py-2 ui-surface"
                  placeholder="Search groups (name, category)"
                />
                <button
                  type="button"
                  onClick={() =>
                    exportRows({
                      fileName: `AccountGroups_${currentCompany?.name || 'company'}`,
                      label: 'group(s)',
                      columns: [
                        { key: 'name', label: 'Group' },
                        { key: 'parent', label: 'Parent', value: (r) => r._parent || '' },
                        { key: 'groupCategory', label: 'Category' },
                      ],
                      rows: visibleGroupRows,
                    })
                  }
                  className="ui-btn ui-btn-secondary mt-2"
                >
                  <Download size={15} aria-hidden="true" /> Export
                </button>
              </div>
            </div>
            <table className="ui-table w-full">
              <thead className="ui-sunken border-b">
                <tr>
                  <th className="ui-th">Group</th>
                  <th className="ui-th">Parent</th>
                  <th className="ui-th">Category</th>
                  <th className="ui-th ui-num">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {visibleGroupRows.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-sm ui-muted">
                      No groups found
                    </td>
                  </tr>
                ) : (
                  visibleGroupRows.map((g) => {
                    const buttonKey = `group:${String(g.id)}`;
                    return (
                      <tr key={g.id} className="ui-hover-sunken">
                        <td className="px-4 py-2.5 ui-col-entity">{g.name}</td>
                        <td className="ui-col-meta px-4 py-2.5 ui-fg">{g._parent || '-'}</td>
                        <td className="ui-col-meta px-4 py-2.5 ui-fg">{String(g.groupCategory || 'General')}</td>
                        <td
                          className="px-4 py-2.5 text-right"
                          onMouseDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onMouseDown={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openMenu?.buttonKey === buttonKey) {
                                setOpenMenu(null);
                              } else {
                                openRowMenu('group', g.id, e.currentTarget);
                              }
                            }}
                            className="p-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c inline-flex"
                            aria-label="Group actions"
                            data-coa-menu-button={buttonKey}
                          >
                            <MoreVertical size={18} />
                          </button>
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

      {openMenu?.id ? (
        <div
          ref={menuRef}
          className="fixed w-48 ui-surface border ui-border-c rounded-xl shadow-lg overflow-hidden z-[9999]"
          style={{ left: openMenu.left, top: openMenu.top }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          data-coa-menu
        >
          {(() => {
            if (openMenu.kind === 'ledger') {
              const ledger = ledgerRows.find((x) => String(x.id) === String(openMenu.id));
              if (!ledger) return null;
              return (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      openEditLedger(ledger);
                    }}
                    className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2"
                  >
                    <span className="ui-muted">Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      deleteLedger(ledger);
                    }}
                    className="w-full px-4 py-2 text-left text-sm ui-hover-sunken flex items-center gap-2 text-[rgb(var(--neg))]"
                  >
                    <span>Delete</span>
                  </button>
                </>
              );
            }

            const group = groupRows.find((x) => String(x.id) === String(openMenu.id));
            if (!group) return null;

            const editDisabled = Boolean(group?.isSystem && !group?.isUserDefined);
            const canDel = canDeleteGroup(group?.id);
            const deleteDisabled = !canDel.ok;

            return (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    openEditGroup(group);
                  }}
                  disabled={editDisabled}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${ editDisabled ? 'ui-subtle cursor-not-allowed ui-surface' : 'ui-hover-sunken'
                  }`}
                >
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null);
                    deleteGroup(group);
                  }}
                  disabled={deleteDisabled}
                  className={`w-full px-4 py-2 text-left text-sm flex items-center gap-2 ${ deleteDisabled ? 'ui-subtle cursor-not-allowed ui-surface' : 'ui-hover-sunken text-[rgb(var(--neg))]'
                  }`}
                  title={deleteDisabled ? canDel.reason : ''}
                >
                  <span>Delete</span>
                </button>
              </>
            );
          })()}
        </div>
      ) : null}
    </div>
  );
};

const ChartAccountForm = ({
  db,
  setDb,
  currentCompany,
  openModal,
  onClose,
  initialData = null,
  initialName = '',
  onCreated,
  excludeGroupCategories = [],
  includeGroupIds = null,
}) => {
  const excludedCats = new Set((Array.isArray(excludeGroupCategories) ? excludeGroupCategories : []).map((x) => String(x || '').trim()));
  const includeIds = includeGroupIds ? new Set((Array.isArray(includeGroupIds) ? includeGroupIds : []).map((x) => String(x))) : null;

  const groups = (Array.isArray(db.accountGroups) ? db.accountGroups : [])
    .filter((g) => g.companyId === currentCompany.id)
    .filter((g) => !g.isLegacy)
    .filter((g) => !excludedCats.has(String(g.groupCategory || '').trim()))
    .filter((g) => (includeIds ? includeIds.has(String(g.id)) : true))
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const types = (Array.isArray(db.accountTypes) ? db.accountTypes : [])
    .filter((t) => t.companyId === currentCompany.id)
    .filter((t) => !t.isLegacy)
    .slice();

  const typeById = useMemo(() => {
    const m = new Map();
    for (const t of types) m.set(String(t.id), t);
    return m;
  }, [db.accountTypes, currentCompany.id]);

  const groupById = useMemo(() => {
    const m = new Map();
    for (const g of groups) m.set(String(g.id), g);
    return m;
  }, [db.accountGroups, currentCompany.id]);

  const isUnderNamedRoot = useMemo(() => {
    return (groupId, rootLowerName) => {
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
  }, [groupById]);

  const groupByNameLower = useMemo(() => {
    const m = new Map();
    for (const g of groups) m.set(String(g.name || '').trim().toLowerCase(), g);
    return m;
  }, [groups]);

  const groupOptions = useMemo(() => {
    return groups.map((g) => ({ value: String(g.id), label: String(g.name || '').trim() }));
  }, [groups]);

  const isEdit = Boolean(initialData && (initialData.id !== null && initialData.id !== undefined && String(initialData.id) !== ''));
  const defaultGroupForEdit = isEdit ? String(initialData?.groupId ?? '').trim() : '';

  const getDefaultGroupId = (category) => {
    const c = String(category || '').trim();
    if (c === 'Customer') {
      const g = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'sundry debtors');
      return g ? String(g.id) : '';
    }
    if (c === 'Vendor') {
      const g = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'sundry creditors');
      return g ? String(g.id) : '';
    }
    if (c === 'Expense') {
      const g = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'indirect expenses');
      return g ? String(g.id) : '';
    }
    const cash = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'cash-in-hand');
    if (cash) return String(cash.id);
    const g = groups.find((x) => String(x.name || '').trim().toLowerCase() === 'primary');
    return g ? String(g.id) : '';
  };

  const groupCategoryToLedgerCategory = (groupCategory) => {
    const c = String(groupCategory || '').trim();
    if (c === 'Customer') return 'Customer';
    if (c === 'Vendor') return 'Vendor';
    if (c === 'Expense') return 'Expense';
    return 'General';
  };

  const [formData, setFormData] = useState({
    name: isEdit ? String(initialData?.name || '').trim() : String(initialName || '').trim(),
    // When the caller restricts the groups (creating an expense ledger from the
    // expense voucher, say), the default has to be one of those — the usual
    // Cash-in-Hand default is not on the list and would render as blank.
    groupId: isEdit
      ? defaultGroupForEdit
      : includeIds
        ? String(
            groups.find((g) => String(g.name || '').trim().toLowerCase() === 'indirect expenses')?.id ??
              groups[0]?.id ??
              ''
          )
        : getDefaultGroupId('General'),
    openingBalance: isEdit ? Number(initialData?.openingBalance ?? initialData?.balance ?? 0) : 0,
    bankName: isEdit ? String(initialData?.bankDetails?.bankName || '').trim() : '',
    bankAccountNumber: isEdit ? String(initialData?.bankDetails?.accountNumber || '').trim() : '',
    bankBranch: isEdit ? String(initialData?.bankDetails?.branch || '').trim() : '',
    bankIfsc: isEdit ? String(initialData?.bankDetails?.ifsc || '').trim() : '',
    gstRate: isEdit ? String(initialData?.gstRate ?? '') : '',
  });

  const isBankGroupSelected = useMemo(() => {
    const gid = String(formData.groupId || '').trim();
    if (!gid) return false;
    return isUnderNamedRoot(gid, 'bank accounts');
  }, [formData.groupId, isUnderNamedRoot]);

  const isCashGroupSelected = useMemo(() => {
    const gid = String(formData.groupId || '').trim();
    if (!gid) return false;
    return isUnderNamedRoot(gid, 'cash-in-hand');
  }, [formData.groupId, isUnderNamedRoot]);

  // Expense ledgers carry a default GST rate: expense booking reads it so an
  // operator picking "Office Rent" gets its 18% without remembering it.
  const isExpenseGroupSelected = useMemo(() => {
    const g = groupById.get(String(formData.groupId || '').trim());
    return String(g?.groupCategory || '').trim() === 'Expense';
  }, [formData.groupId, groupById]);

  // A cash/bank chart ledger must also exist as a server ledger account —
  // that is what the receipt/payment "mode" dropdown and GL postings use.
  // Best-effort: an offline save keeps the chart row; sync retries next edit.
  const syncCashBankLedgerToServer = async (chartRow) => {
    if (!isBankGroupSelected && !isCashGroupSelected) return;
    try {
      const { account } = await createLedgerAccount({
        name: chartRow.name,
        accountType: 'ASSET',
        controlKind: isBankGroupSelected ? 'BANK' : 'CASH',
        sourceKey: `coa-${currentCompany.id}-${chartRow.id}`,
      });
      if (account?.id) {
        setDb((prev) => ({
          ...prev,
          chartOfAccounts: (Array.isArray(prev.chartOfAccounts) ? prev.chartOfAccounts : []).map((a) =>
            a.companyId === currentCompany.id && String(a.id) === String(chartRow.id)
              ? { ...a, serverLedgerAccountId: account.id }
              : a
          ),
        }));
        notify.success(`${chartRow.name} is now available in Payment/Receipt entry.`);
      }
    } catch (err) {
      notify.error(`Ledger saved locally, but server sync failed: ${String(err?.message || err)}`);
    }
  };

  const openCreateGroupFromPicker = (typedName) => {
    openModal(
      <SimpleAccountGroupCreateForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        initialName={String(typedName || '').trim()}
        onCreated={(g) => {
          if (g?.id !== null && g?.id !== undefined) {
            setFormData((p) => ({ ...p, groupId: String(g.id) }));
          }
        }}
        onClose={() => openModal(null)}
      />,
      { title: 'New Group', maxWidthClass: 'max-w-2xl' }
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const name = String(formData.name || '').trim();
    let groupRow = null;
    const openingBalance = round2(Number(formData.openingBalance || 0));

    if (!name) {
      notify.error('Account name is required');
      return;
    }

    const groupValue = String(formData.groupId || '').trim();
    if (!groupValue) {
      notify.error('Group is required');
      return;
    }

    groupRow = groupById.get(groupValue) || null;
    if (!groupRow) {
      notify.error('Please select a valid group.');
      return;
    }

    const typeRow = groupRow ? typeById.get(String(groupRow.typeId)) : null;
    if (!typeRow) {
      notify.error('Parent mapping not found for selected group');
      return;
    }

    const derivedType = String(typeRow.accountClass || '').trim();
    const derivedSubType = String(typeRow.name || '').trim();
    const derivedMain = String(typeRow.main || '').trim();

    const derivedLedgerCategory = groupCategoryToLedgerCategory(groupRow?.groupCategory);

    let bankDetails = undefined;
    if (isBankGroupSelected) {
      const bankName = String(formData.bankName || '').trim();
      const accountNumber = String(formData.bankAccountNumber || '').trim();
      const branch = String(formData.bankBranch || '').trim();
      const ifsc = String(formData.bankIfsc || '').trim();

      if (!bankName) {
        notify.error('Bank name is required for Bank Accounts');
        return;
      }
      if (!accountNumber) {
        notify.error('Account number is required for Bank Accounts');
        return;
      }

      bankDetails = {
        bankName,
        accountNumber,
        branch,
        ifsc,
      };
    }

    const existingCodes = new Set(
      (Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : [])
        .filter((a) => a.companyId === currentCompany.id)
        .map((a) => String(a.code || '').trim().toLowerCase())
    );

    if (isEdit) {
      const existing = (Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : []).find(
        (a) => a.companyId === currentCompany.id && String(a.id) === String(initialData.id)
      );
      if (!existing) {
        notify.error('Ledger not found');
        return;
      }

      const updated = {
        ...existing,
        name,
        ledgerCategory: derivedLedgerCategory,
        groupId: Number(groupRow.id),
        type: derivedType,
        subType: derivedSubType,
        main: derivedMain,
        openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
        balance: Number.isFinite(openingBalance) ? openingBalance : 0,
        bankDetails,
        gstRate: isExpenseGroupSelected && String(formData.gstRate || '').trim() !== '' ? Number(formData.gstRate) : null,
        updatedAt: new Date().toISOString(),
      };

      const updatedJournalEntries = (Array.isArray(db.journalEntries) ? db.journalEntries : []).map((j) => {
        if (j.companyId !== currentCompany.id) return j;
        const nextLines = (Array.isArray(j.lines) ? j.lines : []).map((l) => {
          if (String(l?.accountId || '').trim() !== String(updated.id)) return l;
          return { ...l, accountName: updated.name, accountCode: updated.code };
        });
        return { ...j, lines: nextLines };
      });

      setDb({
        ...db,
        chartOfAccounts: (Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : []).map((a) =>
          a.companyId === currentCompany.id && String(a.id) === String(updated.id) ? updated : a
        ),
        journalEntries: updatedJournalEntries,
      });

      syncCashBankLedgerToServer(updated);
      onCreated?.(updated);
      onClose?.();
      return;
    }

    const nextId = (Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : []).reduce((m, a) => Math.max(m, Number(a?.id || 0)), 0) + 1;
    const prefix = derivedLedgerCategory === 'Customer' ? 'CUST' : derivedLedgerCategory === 'Vendor' ? 'VEND' : derivedLedgerCategory === 'Expense' ? 'EXP' : 'LED';
    let autoCode = `${prefix}-${nextId}`;
    while (existingCodes.has(autoCode.toLowerCase())) {
      autoCode = `${prefix}-${Math.floor(Math.random() * 1000000)}`;
    }

    const newAccount = {
      id: nextId,
      companyId: currentCompany.id,
      code: autoCode,
      name,
      ledgerCategory: derivedLedgerCategory,
      groupId: Number(groupRow.id),
      type: derivedType,
      subType: derivedSubType,
      main: derivedMain,
      openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
      balance: Number.isFinite(openingBalance) ? openingBalance : 0,
      bankDetails,
      gstRate: isExpenseGroupSelected && String(formData.gstRate || '').trim() !== '' ? Number(formData.gstRate) : null,
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      chartOfAccounts: [...(Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : []), newAccount],
    });

    syncCashBankLedgerToServer(newAccount);
    onCreated?.(newAccount);
    onClose?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Ledger Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
          className="ui-input w-full px-3 py-2"
          placeholder="e.g., ABC Traders"
          required
        />
      </div>

      <div>
        <PopupSelect
          label="Group"
          value={formData.groupId}
          onChange={(val) => {
            const raw = String(val || '').trim();
            if (!raw) {
              setFormData((p) => ({ ...p, groupId: '' }));
              return;
            }

            const byId = groupById.get(raw);
            if (byId) {
              setFormData((p) => ({ ...p, groupId: String(byId.id) }));
              return;
            }

            const byName = groupByNameLower.get(raw.toLowerCase());
            if (byName) {
              setFormData((p) => ({ ...p, groupId: String(byName.id) }));
              return;
            }

            setFormData((p) => ({ ...p, groupId: '' }));
          }}
          options={groupOptions}
          placeholder="Select group"
          title="Select Group"
          showValueSubtext={false}
          maxWidthClass="max-w-2xl"
          allowCustom
          customActionText="Create new Group"
          onCustomAction={(typed) => openCreateGroupFromPicker(typed)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Opening Balance</label>
        <input
          type="number"
          value={formData.openingBalance}
          onChange={(e) => setFormData((p) => ({ ...p, openingBalance: e.target.value }))}
          className="ui-input w-full px-3 py-2"
          step="0.01"
        />
      </div>

      {isExpenseGroupSelected ? (
        <div>
          <label className="block text-sm font-medium mb-1">Default GST rate</label>
          <select
            value={String(formData.gstRate ?? '')}
            onChange={(e) => setFormData((p) => ({ ...p, gstRate: e.target.value }))}
            className="ui-select w-full px-3 py-2"
          >
            <option value="">— none —</option>
            {[0, 0.25, 3, 5, 12, 18, 28].map((r) => (
              <option key={r} value={String(r)}>{r}%</option>
            ))}
          </select>
          <div className="text-xs ui-muted mt-1">Expense booking fills this rate when the ledger is picked.</div>
        </div>
      ) : null}

      {isBankGroupSelected ? (
        <div className="border rounded-xl p-4 ui-sunken space-y-4">
          <div className="font-semibold">Bank Details</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Bank Name</label>
              <input
                type="text"
                value={formData.bankName}
                onChange={(e) => setFormData((p) => ({ ...p, bankName: e.target.value }))}
                className="ui-input w-full px-3 py-2"
                placeholder="e.g., HDFC Bank"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Account Number</label>
              <input
                type="text"
                value={formData.bankAccountNumber}
                onChange={(e) => setFormData((p) => ({ ...p, bankAccountNumber: e.target.value }))}
                className="ui-input w-full px-3 py-2"
                placeholder="e.g., 1234567890"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Branch</label>
              <input
                type="text"
                value={formData.bankBranch}
                onChange={(e) => setFormData((p) => ({ ...p, bankBranch: e.target.value }))}
                className="ui-input w-full px-3 py-2"
                placeholder="e.g., Andheri"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">IFSC</label>
              <input
                type="text"
                value={formData.bankIfsc}
                onChange={(e) => setFormData((p) => ({ ...p, bankIfsc: e.target.value }))}
                className="ui-input w-full px-3 py-2"
                placeholder="e.g., HDFC0000123"
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border ui-hover-sunken">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">
          {isEdit ? 'Save' : 'Create'}
        </button>
      </div>
    </form>
  );
};

const SimpleAccountGroupCreateForm = ({ db, setDb, currentCompany, initialName = '', onCreated, onClose }) => {
  const groups = useMemo(() => {
    return (Array.isArray(db.accountGroups) ? db.accountGroups : [])
      .filter((g) => g.companyId === currentCompany.id)
      .filter((g) => !g.isLegacy)
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [db.accountGroups, currentCompany.id]);

  const groupOptions = useMemo(() => {
    return groups.map((g) => ({ value: String(g.id), label: String(g.name || '').trim() }));
  }, [groups]);

  const [formData, setFormData] = useState(() => {
    const firstId = groups[0]?.id ? String(groups[0].id) : '';
    return {
      name: String(initialName || '').trim(),
      parentGroupId: firstId,
    };
  });

  // Groups load synchronously from the local store; if they ever appear a
  // render late, adjust during render rather than in an effect.
  if (!formData.parentGroupId && groups[0]?.id) {
    setFormData((p) => ({ ...p, parentGroupId: String(groups[0].id) }));
  }

  const handleSubmit = (e) => {
    e.preventDefault();

    const name = String(formData.name || '').trim();
    const parentGroupId = String(formData.parentGroupId || '').trim();

    if (!name) {
      notify.error('Group name is required');
      return;
    }

    if (!parentGroupId) {
      notify.error('Group is required');
      return;
    }

    const parent = groups.find((g) => String(g.id) === parentGroupId) || null;
    if (!parent) {
      notify.error('Please select a valid group.');
      return;
    }

    const clash = groups.some((g) => String(g.name || '').trim().toLowerCase() === name.toLowerCase());
    if (clash) {
      notify.error('Group already exists');
      return;
    }

    const nextId = groups.reduce((m, g) => Math.max(m, Number(g?.id || 0)), 0) + 1;
    const newGroup = {
      id: nextId,
      companyId: currentCompany.id,
      typeId: Number(parent.typeId),
      name,
      parentGroupId: Number(parentGroupId),
      groupCategory: String(parent.groupCategory || 'General').trim() || 'General',
      isUserDefined: true,
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      accountGroups: [...(Array.isArray(db.accountGroups) ? db.accountGroups : []), newGroup],
    });

    onCreated?.(newGroup);
    onClose?.();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">Group Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
          className="ui-input w-full px-3 py-2"
          placeholder="e.g., Bank Charges"
          required
        />
      </div>

      <div>
        <PopupSelect
          label="Group"
          value={formData.parentGroupId}
          onChange={(val) => setFormData((p) => ({ ...p, parentGroupId: String(val || '').trim() }))}
          options={groupOptions}
          placeholder="Select group"
          title="Select Group"
          showValueSubtext={false}
          maxWidthClass="max-w-2xl"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => onClose?.()} className="px-4 py-2 rounded-lg border ui-hover-sunken">
          Cancel
        </button>
        <button type="submit" className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">
          Create
        </button>
      </div>
    </form>
  );
};

const JournalEntriesList = ({ db, setDb, currentCompany, onNewJournal, onEditJournal }) => {
  const jvPeriod = usePeriodFilter();
  const jvSearch = useListSearch(
    db.journalEntries.filter((j) => j.companyId === currentCompany.id),
    ['number', 'narration', 'date', 'status']
  );
  const jvFilters = useColumnFilters();
  const journalEntries = jvFilters.applyFilters(jvSearch.filtered.filter((r) => jvPeriod.inRange(r?.date)), {
    number: (r) => r.number,
    date: (r) => r.date,
    narration: (r) => r.narration,
    status: (r) => r.status,
  });

  const deleteEntry = async (jv) => {
    const ok = await confirmDialog({ title: 'Please confirm', message: `Delete journal entry "${String(jv?.number || '').trim() || 'this entry'}"?`, confirmLabel: 'Yes, continue' });
    if (!ok) return;
    setDb({
      ...db,
      journalEntries: (Array.isArray(db.journalEntries) ? db.journalEntries : []).filter(
        (x) => !(x.companyId === currentCompany.id && String(x.id) === String(jv.id))
      ),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Journal Entries</h3>
        <button
          onClick={onNewJournal}
          className="ui-btn ui-btn-primary "
        >
          <Plus size={20} /> New Entry
        </button>
      </div>

      <ListToolbar
        search={jvSearch.query}
        onSearch={jvSearch.setQuery}
        placeholder="Search journal entries (number, narration)"
        count={journalEntries.length}
        countLabel="entries"
        onExport={() =>
          exportRows({
            fileName: `JournalEntries_${currentCompany?.name || 'company'}`,
            label: 'entry/entries',
            columns: [
              { key: 'number', label: 'JV #' },
              { key: 'date', label: 'Date' },
              { key: 'narration', label: 'Narration' },
              { key: 'debit', label: 'Debit', value: (r) => Number(r.totalDebit ?? r.debit ?? 0) },
              { key: 'credit', label: 'Credit', value: (r) => Number(r.totalCredit ?? r.credit ?? 0) },
              { key: 'status', label: 'Status' },
            ],
            rows: journalEntries,
          })
        }
        period={jvPeriod.period}
        onPeriodChange={jvPeriod.setPeriod}
        dateFrom={jvPeriod.dateFrom}
        dateTo={jvPeriod.dateTo}
        onDateFromChange={jvPeriod.setDateFrom}
        onDateToChange={jvPeriod.setDateTo}
        exportTitle="Journal Entries — {currentCompany?.name || 'Company'}"
        exportFileName={`JournalEntries_${currentCompany?.name || 'company'}`}
        exportSheetName="Journal Entries"
        exportColumns={[
              { key: 'number', label: 'JV #' },
              { key: 'date', label: 'Date' },
              { key: 'narration', label: 'Narration' },
              { key: 'debit', label: 'Debit', value: (r) => Number(r.totalDebit ?? r.debit ?? 0) },
              { key: 'credit', label: 'Credit', value: (r) => Number(r.totalCredit ?? r.credit ?? 0) },
              { key: 'status', label: 'Status' },
        ]}
        exportRows={journalEntries}
      />

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border ui-border-c">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <ColumnHeader label="JV #" col="number" state={jvFilters} className="ui-th" />
              <ColumnHeader label="Date" col="date" state={jvFilters} className="ui-th" />
              <ColumnHeader label="Narration" col="narration" state={jvFilters} className="ui-th" />
              <th className="ui-th ui-num">Debit</th>
              <th className="ui-th ui-num">Credit</th>
              <ColumnHeader label="Status" col="status" state={jvFilters} className="ui-th" />
              <th className="ui-th ui-num">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {journalEntries.length === 0 ? (
              <tr>
                <td colSpan="7" className="p-0">
                  <EmptyState
                    icon={BookOpen}
                    title="No journal entries yet"
                    description="A journal entry posts a debit and a matching credit directly to the ledger — for adjustments the documents do not cover."
                    action={
                      <button type="button" onClick={onNewJournal} className="ui-btn ui-btn-primary">
                        <Plus size={16} /> New Entry
                      </button>
                    }
                  />
                </td>
              </tr>
            ) : (
              journalEntries.map((jv) => (
                <tr key={jv.id} className="ui-hover-sunken">
                  <td className="px-4 py-2.5 ui-col-entity">{jv.number}</td>
                  <td className="px-4 py-2.5 ui-col-meta">{jv.date}</td>
                  <td className="px-4 py-2.5 ui-col-meta">
                    <div className="font-medium">{jv.narration || '-'}</div>
                    <div className="text-xs ui-muted">{(jv.lines || []).length} lines</div>
                  </td>
                  <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{formatMoney(jv.totalDebit || 0, currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{formatMoney(jv.totalCredit || 0, currentCompany)}</td>
                  <td className="px-4 py-2.5 ui-col-meta">
                    <StatusPill status={(jv.totalDebit || 0) === (jv.totalCredit || 0) ? 'Balanced' : 'Unbalanced'} />
                  </td>
                  <td className="px-4 py-2.5 ui-col-meta">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => onEditJournal?.(jv)}
                        className="px-3 py-1.5 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm flex items-center gap-1"
                      >
                        <Pencil size={16} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteEntry(jv)}
                        className="px-3 py-1.5 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm flex items-center gap-1 text-[rgb(var(--neg))]"
                      >
                        <Trash2 size={16} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const JournalEntryForm = ({ db, setDb, currentCompany, openModal, onClose, initialData = null }) => {
  const formRef = useRef(null);
  const accounts = db.chartOfAccounts.filter((a) => a.companyId === currentCompany.id);

  const accountOptions = useMemo(() => {
    return accounts
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .map((a) => ({ value: String(a.id), label: String(a.name || '').trim() }));
  }, [accounts]);

  const activeBranchId = normalizeId(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || '');
  const jvDocSettings = getDocSettings(db, currentCompany, { branchId: activeBranchId || null });
  const jvNumbering = jvDocSettings?.numbering?.journalEntry;
  const isJvAuto = String(jvNumbering?.mode || '').toLowerCase() === 'auto';
  const lockJvNumber = isJvAuto && !jvNumbering?.allowManualOverride;
  const generatedJvNumber = nextFreeVoucherNumber({db, company: currentCompany, voucherKey: 'journalEntry', branchId: activeBranchId || null, takenNumbers: (db.journalEntries || []).filter((x) => x.companyId === currentCompany.id).map((x) => String(x.number || '').trim()) });

  const isEdit = Boolean(initialData && initialData.id);

  const [formData, setFormData] = useState(() => ({
    number: isEdit ? String(initialData?.number || '').trim() : generatedJvNumber || `JV-${Date.now()}`,
    date: isEdit ? (initialData?.date || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
    narration: isEdit ? (initialData?.narration || '') : '',
    lines:
      isEdit && Array.isArray(initialData?.lines) && initialData.lines.length
        ? initialData.lines.map((l) => ({
            accountId: String(l?.accountId || '').trim(),
            debit: Number(l?.debit || 0),
            credit: Number(l?.credit || 0),
          }))
        : [
            { accountId: '', debit: 0, credit: 0 },
            { accountId: '', debit: 0, credit: 0 },
          ],
  }));

  const addLine = () => {
    setFormData((p) => ({ ...p, lines: [...p.lines, { accountId: '', debit: 0, credit: 0 }] }));
  };

  const removeLine = (index) => {
    setFormData((p) => ({ ...p, lines: p.lines.filter((_, i) => i !== index) }));
  };

  const updateLine = (index, field, value) => {
    setFormData((p) => {
      const nextLines = [...p.lines];
      const next = { ...nextLines[index], [field]: value };

      if (field === 'debit') {
        const debit = Number(value || 0);
        next.debit = Number.isFinite(debit) ? debit : 0;
        if (next.debit > 0) next.credit = 0;
      }
      if (field === 'credit') {
        const credit = Number(value || 0);
        next.credit = Number.isFinite(credit) ? credit : 0;
        if (next.credit > 0) next.debit = 0;
      }

      nextLines[index] = next;
      return { ...p, lines: nextLines };
    });
  };

  const openCreateLedgerForLine = (lineIndex, initialName) => {
    if (typeof openModal !== 'function') {
      notify.error('Unable to open ledger creation.');
      return;
    }

    openModal(
      <ChartAccountForm
        db={db}
        setDb={setDb}
        currentCompany={currentCompany}
        openModal={openModal}
        initialName={String(initialName || '').trim()}
        onCreated={(ledger) => {
          if (!ledger?.id && ledger?.id !== 0) return;
          updateLine(lineIndex, 'accountId', String(ledger.id));
        }}
        onClose={() => openModal(null)}
      />,
      { title: 'New Ledger', maxWidthClass: 'max-w-2xl' }
    );
  };

  const totalDebit = round2((formData.lines || []).reduce((sum, l) => sum + Number(l.debit || 0), 0));
  const totalCredit = round2((formData.lines || []).reduce((sum, l) => sum + Number(l.credit || 0), 0));
  const difference = round2(totalDebit - totalCredit);
  const isBalanced = Math.abs(difference) < 0.005 && totalDebit > 0;

  const handleSubmit = (e) => {
    e.preventDefault();

    // Year-end lock: nothing back-dates into closed books.
    {
      const lock = (db.fyLocks || []).find((l) => l.companyId === currentCompany.id);
      if (lock && String(formData.date || '').slice(0, 10) <= lock.upTo) {
        notify.error(`Books are locked up to ${lock.upTo} (Year-End Close). Pick a later date or unlock the year.`);
        return;
      }
    }

    let jvNumber = String(formData.number || '').trim();
    if (isJvAuto) {
      if (lockJvNumber) jvNumber = String(generatedJvNumber || '').trim();
      else if (!jvNumber) jvNumber = String(generatedJvNumber || '').trim();
    }
    if (!jvNumber) {
      notify.error('Journal number is required');
      return;
    }

    const numberClash = db.journalEntries.some(
      (j) =>
        j.companyId === currentCompany.id &&
        String(j.number || '').trim() === jvNumber &&
        (!isEdit || String(j.id) !== String(initialData.id))
    );
    if (numberClash) {
      notify.error('Journal number already exists. Please change the number or update numbering settings in Company Profile.');
      return;
    }

    const cleanLines = (formData.lines || [])
      .map((l) => ({
        accountId: String(l.accountId || '').trim(),
        debit: round2(Number(l.debit || 0)),
        credit: round2(Number(l.credit || 0)),
      }))
      .filter((l) => l.accountId && (l.debit > 0 || l.credit > 0));

    if (cleanLines.length < 2) {
      notify.error('Please add at least two lines with amounts.');
      return;
    }
    if (cleanLines.some((l) => !l.accountId)) {
      notify.error('Account is required for each line.');
      return;
    }

    const debitSum = round2(cleanLines.reduce((sum, l) => sum + l.debit, 0));
    const creditSum = round2(cleanLines.reduce((sum, l) => sum + l.credit, 0));
    if (debitSum <= 0 || creditSum <= 0) {
      notify.error('Both total debit and total credit must be greater than 0.');
      return;
    }
    if (Math.abs(debitSum - creditSum) > 0.01) {
      notify.error('Journal entry must be balanced (Total Debit = Total Credit).');
      return;
    }

    const resolveLines = cleanLines.map((l) => {
      const acc = accounts.find((a) => String(a.id) === String(l.accountId));
      return {
        ...l,
        accountName: acc?.name || '',
        accountCode: acc?.code || '',
      };
    });

    if (isEdit) {
      const updated = {
        ...initialData,
        number: jvNumber,
        date: formData.date,
        narration: formData.narration,
        lines: resolveLines,
        totalDebit: debitSum,
        totalCredit: creditSum,
        updatedAt: new Date().toISOString(),
      };

      setDb({
        ...db,
        journalEntries: (Array.isArray(db.journalEntries) ? db.journalEntries : []).map((j) =>
          j.companyId === currentCompany.id && String(j.id) === String(initialData.id) ? updated : j
        ),
      });

      onClose?.();
      return;
    }

    const nextId = (Array.isArray(db.journalEntries) ? db.journalEntries : []).reduce((m, j) => Math.max(m, Number(j?.id || 0)), 0) + 1;
    const newJv = {
      id: nextId,
      companyId: currentCompany.id,
      number: jvNumber,
      date: formData.date,
      narration: formData.narration,
      lines: resolveLines,
      totalDebit: debitSum,
      totalCredit: creditSum,
      createdAt: new Date().toISOString(),
    };

    setDb({
      ...db,
      journalEntries: [...(Array.isArray(db.journalEntries) ? db.journalEntries : []), newJv],
      companies: bumpCompanyNextNumber({ db, companyId: currentCompany.id, voucherKey: 'journalEntry', usedNumber: jvNumber, branchId: activeBranchId || null }),
    });

    onClose?.();
  };

  // The shared document contract, so a journal answers to the same keys as
  // every other document: Ctrl+S saves, Enter moves on, Ctrl+= adds a line,
  // Ctrl+D duplicates it, Ctrl+Delete removes it.
  const onFormKeyDown = useDocumentFormKeys({
    formRef,
    lineCount: formData.lines.length,
    addLine,
    removeLine,
  });

  return (
    <form ref={formRef} onSubmit={handleSubmit} onKeyDown={onFormKeyDown} className="space-y-6">
      <DocFormActions
        primaryLabel={isEdit ? 'Update Entry' : 'Create Entry'}
        disabled={!isBalanced}
      />

      <DocHeaderStrip
        numberLabel="Journal No."
        number={formData.number}
        onNumberChange={(v) => setFormData((p) => ({ ...p, number: v }))}
        numberLocked={lockJvNumber}
        numberHint={lockJvNumber ? 'Numbered automatically from the series' : ''}
        date={formData.date}
        onDateChange={(v) => setFormData((p) => ({ ...p, date: v }))}
      />

      <div>
        <label className="block text-sm font-medium mb-1">Narration</label>
        <input
          type="text"
          value={formData.narration}
          onChange={(e) => setFormData((p) => ({ ...p, narration: e.target.value }))}
          className="ui-input w-full px-3 py-2"
          placeholder="Optional"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="block text-sm font-medium">Lines</label>
          <button type="button" onClick={addLine} className="ui-fg ui-hover-fg text-sm flex items-center gap-1">
            <Plus size={16} /> Add Line
          </button>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full">
            <thead className="ui-sunken">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium">Account</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Debit</th>
                <th className="px-3 py-2 text-right text-xs font-medium">Credit</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {formData.lines.map((line, idx) => (
                <tr key={idx} className="border-t" data-line-row={idx}>
                  <td className="ui-col-meta px-3 py-2">
                    <PopupSelect
                      label={null}
                      value={line.accountId}
                      onChange={(val) => updateLine(idx, 'accountId', String(val || '').trim())}
                      options={accountOptions}
                      placeholder="Select ledger"
                      title="Select Ledger"
                      showValueSubtext={false}
                      maxWidthClass="max-w-2xl"
                      allowCustom
                      customActionText="Create new Ledger"
                      onCustomAction={(typed) => openCreateLedgerForLine(idx, typed)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={line.debit}
                      onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                      className="ui-input w-32 px-2 py-1 text-right"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      value={line.credit}
                      onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                      className="ui-input w-32 px-2 py-1 text-right"
                      min="0"
                      step="0.01"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]"
                      disabled={formData.lines.length <= 2}
                      title={formData.lines.length <= 2 ? 'Minimum 2 lines' : 'Remove line'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex justify-end">
          <div className="ui-card p-3 w-80" aria-live="polite">
            <div className="flex justify-between text-sm">
              <span className="ui-muted">Total Dr</span>
              <span className="ui-amount">{formatMoney(totalDebit, currentCompany)}</span>
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span className="ui-muted">Total Cr</span>
              <span className="ui-amount">{formatMoney(totalCredit, currentCompany)}</span>
            </div>
            <div
              className="flex justify-between text-sm mt-2 pt-2"
              style={{ borderTop: '1px solid rgb(var(--border))' }}
            >
              <span className="ui-muted">Difference</span>
              <span className={`ui-amount ${isBalanced ? 'ui-amount-pos' : 'ui-amount-neg'}`}>
                {formatMoney(Math.abs(difference), currentCompany)}
                {difference > 0 ? ' Dr' : difference < 0 ? ' Cr' : ''}
              </span>
            </div>
            <div className="mt-2">
              {isBalanced ? (
                <span className="ui-pill ui-pill-pos">Dr = Cr</span>
              ) : (
                <span className="ui-pill ui-pill-neg">
                  {totalDebit === 0 && totalCredit === 0 ? 'Nothing entered yet' : 'Does not balance'}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The reason the button at the top is disabled, kept where the figures
          that caused it are — not beside a button on another part of the
          screen. */}
      {!isBalanced ? (
        <p className="ui-subtle text-xs text-right">Debits and credits must match before this can be saved</p>
      ) : null}

      <DocFormFootnote />
    </form>
  );
};

const TrialBalance = ({ db, currentCompany, onOpenLedger }) => {
  const accounts = db.chartOfAccounts.filter((a) => a.companyId === currentCompany.id);
  const groups = db.accountGroups.filter((g) => g.companyId === currentCompany.id);
  const isDebitNature = (type) => ['Asset', 'Expense'].includes(String(type || '').trim());

  const rows = useMemo(() => {
    const groupById = new Map(groups.map((g) => [String(g.id), g]));
    return accounts.map((account) => {
      const bal = Number(account?.balance ?? 0);
      const debitNature = isDebitNature(account?.type);

      const debit = debitNature ? Math.max(0, bal) : Math.max(0, -bal);
      const credit = debitNature ? Math.max(0, -bal) : Math.max(0, bal);

      const groupName = account?.groupId ? String(groupById.get(String(account.groupId))?.name || '') : '';

      return {
        ...account,
        _group: groupName,
        _debit: round2(debit),
        _credit: round2(credit),
      };
    });
  }, [accounts, groups]);

  const totalDebit = rows.reduce((sum, r) => sum + Number(r._debit ?? 0), 0);
  const totalCredit = rows.reduce((sum, r) => sum + Number(r._credit ?? 0), 0);

  return (
    <div className="space-y-4">
      <h3 className="ui-t-sec">Trial Balance</h3>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="ui-th">Account</th>
              <th className="ui-th">Group</th>
              <th className="ui-th ui-num">Debit</th>
              <th className="ui-th ui-num">Credit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((account) => (
              <tr key={account.id} className="ui-hover-sunken">
                <td className="px-4 py-2.5 ui-col-meta">
                  <button
                    type="button"
                    onClick={() => onOpenLedger && onOpenLedger(account.id)}
                    className="font-medium text-left hover:underline"
                  >
                    {account.name}
                  </button>
                </td>
                <td className="ui-col-meta px-4 py-2.5 ui-muted">{account._group || '-'}</td>
                <td className="ui-col-amount px-4 py-2.5 text-right">
                  {account._debit > 0 ? formatMoney(account._debit, currentCompany) : '-'}
                </td>
                <td className="ui-col-amount px-4 py-2.5 text-right">
                  {account._credit > 0 ? formatMoney(account._credit, currentCompany) : '-'}
                </td>
              </tr>
            ))}
            <tr className="ui-sunken font-bold border-t-2">
              <td className="px-4 py-2.5 ui-col-meta">TOTAL</td>
              <td className="ui-col-amount px-4 py-2.5" />
              <td className="px-4 py-2.5 text-right">{formatMoney(totalDebit, currentCompany)}</td>
              <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(totalCredit, currentCompany)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className={`p-4 rounded-lg ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'bg-[rgb(var(--pos-soft))]' : 'bg-[rgb(var(--neg-soft))]'}`}>
        <p className={`font-medium ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'text-[rgb(var(--pos))]' : 'text-[rgb(var(--neg))]'}`}>
          {Math.abs(totalDebit - totalCredit) < 0.01 ? '✓ Trial Balance is balanced' : '✗ Trial Balance is not balanced'}
        </p>
      </div>
    </div>
  );
};

// warehouses/activeWarehouseId are needed by the invoice, bill and note editors
// this view opens from a ledger row. They were referenced below without ever
// being props, so opening any of those editors from a ledger threw
// "warehouses is not defined" and the modal never appeared.
const LedgerView = ({
  db,
  setDb,
  currentCompany,
  ledgerId,
  onBack,
  openModal,
  warehouses = [],
  activeWarehouseId = '',
}) => {
  const LEDGER_COLUMN_DEFS = [
    { key: 'date', label: 'Date', align: 'left' },
    { key: 'particulars', label: 'Particulars', align: 'left' },
    { key: 'voucherType', label: 'Vch Type', align: 'left' },
    { key: 'voucherNo', label: 'Vch No', align: 'left' },
    { key: 'narration', label: 'Narration', align: 'left' },
    { key: 'partyName', label: 'Party', align: 'left' },
    { key: 'partyGstin', label: 'GSTIN', align: 'left' },
    { key: 'partyPan', label: 'PAN', align: 'left' },
    { key: 'partyBillingAddress', label: 'Billing Address', align: 'left' },
    { key: 'partyShippingAddress', label: 'Shipping Address', align: 'left' },
    { key: 'placeOfSupply', label: 'Place of Supply', align: 'left' },
    { key: 'itemsSummary', label: 'Items', align: 'left' },
    { key: 'reference', label: 'Ref No', align: 'left' },
    { key: 'cashBank', label: 'Cash/Bank', align: 'left' },
    { key: 'taxable', label: 'Taxable', align: 'right' },
    { key: 'cgst', label: 'CGST', align: 'right' },
    { key: 'sgst', label: 'SGST', align: 'right' },
    { key: 'igst', label: 'IGST', align: 'right' },
    { key: 'total', label: 'Total', align: 'right' },
    { key: 'debit', label: 'Debit', align: 'right' },
    { key: 'credit', label: 'Credit', align: 'right' },
    { key: 'runningBalance', label: 'Balance', align: 'right' },
  ];

  const DEFAULT_LEDGER_COLUMNS = ['date', 'particulars', 'voucherType', 'voucherNo', 'debit', 'credit', 'runningBalance'];

  const companyLedgerView =
    currentCompany?.docSettings?.ledgerView && typeof currentCompany.docSettings.ledgerView === 'object'
      ? currentCompany.docSettings.ledgerView
      : {};
  const columnsByLedgerId =
    companyLedgerView?.columnsByLedgerId && typeof companyLedgerView.columnsByLedgerId === 'object'
      ? companyLedgerView.columnsByLedgerId
      : {};

  const selectedColumnKeys = useMemo(() => {
    const raw = columnsByLedgerId?.[String(ledgerId)] || null;
    const keys = Array.isArray(raw) ? raw.map((k) => String(k || '').trim()).filter(Boolean) : [];
    return keys.length ? keys : DEFAULT_LEDGER_COLUMNS;
  }, [columnsByLedgerId, ledgerId]);

  const columnDefsByKey = useMemo(() => new Map(LEDGER_COLUMN_DEFS.map((c) => [c.key, c])), []);
  const visibleColumns = useMemo(() => {
    return selectedColumnKeys.map((k) => columnDefsByKey.get(k)).filter(Boolean);
  }, [selectedColumnKeys, columnDefsByKey]);

  const persistLedgerColumns = (keys) => {
    if (typeof setDb !== 'function') return;
    const clean = Array.isArray(keys) ? keys.map((k) => String(k || '').trim()).filter(Boolean) : [];
    if (!clean.length) return;

    setDb((prev) => {
      const prevCompanies = Array.isArray(prev?.companies) ? prev.companies : [];
      const nextCompanies = prevCompanies.map((c) => {
        if (Number(c?.id) !== Number(currentCompany.id)) return c;
        const ds = c?.docSettings && typeof c.docSettings === 'object' ? c.docSettings : {};
        const lv = ds?.ledgerView && typeof ds.ledgerView === 'object' ? ds.ledgerView : {};
        const byLedger = lv?.columnsByLedgerId && typeof lv.columnsByLedgerId === 'object' ? lv.columnsByLedgerId : {};
        return {
          ...c,
          docSettings: {
            ...ds,
            ledgerView: {
              ...lv,
              columnsByLedgerId: {
                ...byLedger,
                [String(ledgerId)]: clean,
              },
            },
          },
        };
      });
      return { ...prev, companies: nextCompanies };
    });
  };

  const openColumnSettings = () => {
    if (!openModal) return;

    const LedgerColumnsModal = () => {
      const [draft, setDraft] = useState(() => selectedColumnKeys.slice());
      const toggle = (key) => {
        setDraft((prev) => {
          const has = prev.includes(key);
          if (has) return prev.filter((k) => k !== key);
          return [...prev, key];
        });
      };

      return (
        <div className="space-y-4">
          <div className="text-sm ui-muted">Choose which columns to show for this ledger.</div>

          <div className="max-h-80 overflow-y-auto border rounded-lg p-3 ui-surface">
            <div className="grid grid-cols-2 gap-2">
              {LEDGER_COLUMN_DEFS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.includes(c.key)} onChange={() => toggle(c.key)} />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (!draft.length) return notify.error('Select at least one column');
                persistLedgerColumns(draft);
                openModal(null);
              }}
              className="px-4 py-2 rounded-lg ui-btn ui-btn-primary "
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setDraft(DEFAULT_LEDGER_COLUMNS.slice())}
              className="ui-btn ui-btn-secondary"
            >
              Reset Default
            </button>
            <button
              type="button"
              onClick={() => openModal(null)}
              className="ml-auto ui-btn ui-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    };

    openModal(<LedgerColumnsModal />, { title: 'Ledger Columns', maxWidthClass: 'max-w-2xl' });
  };

  const renderCell = (row, key) => {
    const r = row || {};
    const k = String(key || '').trim();

    const money = (n) => (Number(n ?? 0) ? formatMoney(Number(n ?? 0), currentCompany) : '-');

    if (k === 'date') return r?.date ? new Date(r.date).toLocaleDateString() : '-';
    if (k === 'particulars') {
      const showNarrationInline = !selectedColumnKeys.includes('narration');
      const showItemsInline = !selectedColumnKeys.includes('itemsSummary');
      return (
        <div>
          <div className="text-sm font-medium ui-fg">{r?.particulars || '-'}</div>
          {showNarrationInline && r?.narration ? <div className="text-xs ui-muted">{r.narration}</div> : null}
          {showItemsInline && r?.itemsSummary ? <div className="text-xs ui-muted">{r.itemsSummary}</div> : null}
        </div>
      );
    }
    if (k === 'voucherType') return r?.voucherType || '-';
    if (k === 'voucherNo') return r?.voucherNo || '-';
    if (k === 'narration') return r?.narration || '-';
    if (k === 'partyName') return r?.partyName || '-';
    if (k === 'partyGstin') return r?.partyGstin || '-';
    if (k === 'partyPan') return r?.partyPan || '-';
    if (k === 'partyBillingAddress') return r?.partyBillingAddress || '-';
    if (k === 'partyShippingAddress') return r?.partyShippingAddress || '-';
    if (k === 'placeOfSupply') return r?.placeOfSupply || '-';
    if (k === 'itemsSummary') return r?.itemsSummary || '-';
    if (k === 'reference') return r?.reference || '-';
    if (k === 'cashBank') return r?.cashBank || '-';

    if (['taxable', 'cgst', 'sgst', 'igst', 'total'].includes(k)) return money(r?.[k]);
    if (k === 'debit') return money(r?.debit);
    if (k === 'credit') return money(r?.credit);
    if (k === 'runningBalance') return formatMoney(Number(r?.runningBalance ?? 0), currentCompany);

    return r?.[k] !== undefined && r?.[k] !== null && String(r?.[k]).trim() ? String(r?.[k]) : '-';
  };
  // Row action will be shown via modal when a row is clicked

  const openRowActions = (row) => {
    if (!openModal) {
      const choice = window.prompt('Action: type view, edit or delete', 'view');
      const c = String(choice || '').trim().toLowerCase();
      if (c === 'view') return handleView(row);
      if (c === 'edit') return handleEdit(row);
      if (c === 'delete') return handleDelete(row);
      return;
    }

    openModal(
      <div className="space-y-4">
        <div className="text-sm ui-muted">Choose action for this entry.</div>
        <div className="flex flex-col">
          <button type="button" onClick={() => { openModal(null); handleView(row); }} className="text-left px-3 py-2 ui-hover-sunken">View</button>
          <button type="button" onClick={() => { openModal(null); handleEdit(row); }} className="text-left px-3 py-2 ui-hover-sunken">Edit</button>
          <button type="button" onClick={() => { openModal(null); handleDelete(row); }} className="text-left px-3 py-2 ui-hover-sunken text-[rgb(var(--neg))]">Delete</button>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={() => openModal(null)} className="ui-btn ui-btn-secondary">Close</button>
        </div>
      </div>
    );
  };

  const handleView = (row) => {
    if (!openModal) return notify.error('No modal handler available');
    openModal(
      <div className="space-y-4">
        <h4 className="ui-t-sec">Entry details</h4>
        <div className="text-sm ui-fg">
          <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(row, null, 2)}</pre>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={() => openModal(null)} className="ui-btn ui-btn-secondary">
            Close
          </button>
        </div>
      </div>
    );
  };

  const handleEdit = (row) => {
    const meta = row?.meta || {};
    const key = String(meta.voucherKey || '').trim();
    const id = meta.voucherId ?? meta.voucherId;
    if (!key || !id) {
      // If underlying voucher is not available, open a generic row editor that allows
      // editing the ledger row or creating a journal entry.
      if (!openModal) {
        const txt = window.prompt('Edit entry JSON', JSON.stringify(row || {}, null, 2));
        if (!txt) return;
        try {
          const parsed = JSON.parse(txt);
          // try to create a journal entry from parsed
          const debit = Number(parsed.debit || parsed.amount || 0);
          const credit = Number(parsed.credit || 0);
          const date = parsed.date || new Date().toISOString().slice(0, 10);
          const narration = parsed.particulars || parsed.narration || 'Edited entry';
          const nextId = ((Array.isArray(db.journalEntries) ? db.journalEntries : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) || 0) + 1;
          const je = { id: nextId, companyId: currentCompany.id, date, narration, lines: [{ accountId: String(ledgerId), debit, credit }], createdAt: new Date().toISOString() };
          setDb((prev) => ({ ...prev, journalEntries: [...(Array.isArray(prev.journalEntries) ? prev.journalEntries : []), je] }));
        } catch {
          notify.error('Invalid JSON');
        }
        return;
      }
      const GenericRowEditor = ({ initial, onClose }) => {
        const [useForm, setUseForm] = useState(true);
        const [txt, setTxt] = useState(JSON.stringify(initial || {}, null, 2));
        const [form, setForm] = useState({
          date: initial?.date || new Date().toISOString().slice(0, 10),
          particulars: initial?.particulars || initial?.narration || '',
          debit: initial?.debit ?? 0,
          credit: initial?.credit ?? 0,
        });

        const save = () => {
          try {
            let parsed = null;
            if (useForm) {
              parsed = { ...initial, date: form.date, particulars: form.particulars, debit: Number(form.debit || 0), credit: Number(form.credit || 0) };
            } else {
              parsed = JSON.parse(txt);
            }

            // If parsed contains voucherKey/listKey/id then update that voucher
            const pKey = String(parsed?.meta?.voucherKey || parsed?.voucherKey || '').trim();
            const pId = parsed?.meta?.voucherId ?? parsed?.voucherId;
            const def = pKey ? getVoucherDef(pKey) : null;
            const listKey = def?.listKey || null;
            if (listKey && pId) {
              setDb((prev) => {
                const next = { ...prev };
                next[listKey] = (prev[listKey] || []).map((it) => (String(it?.id) === String(pId) ? { ...it, ...parsed } : it));
                return next;
              });
              onClose && onClose();
              return;
            }

            // Otherwise create a journal entry representing this row
            const debit = Number(parsed.debit || parsed.amount || 0);
            const credit = Number(parsed.credit || 0);
            const date = parsed.date || new Date().toISOString().slice(0, 10);
            const narration = parsed.particulars || parsed.narration || 'Edited entry';
            const nextId = ((Array.isArray(db.journalEntries) ? db.journalEntries : []).reduce((m, x) => Math.max(m, Number(x?.id || 0)), 0) || 0) + 1;
            const je = { id: nextId, companyId: currentCompany.id, date, narration, lines: [{ accountId: String(ledgerId), debit, credit }], createdAt: new Date().toISOString() };
            setDb((prev) => ({ ...prev, journalEntries: [...(Array.isArray(prev.journalEntries) ? prev.journalEntries : []), je] }));
            onClose && onClose();
          } catch (e) {
            notify.error('Invalid JSON: ' + e.message);
          }
        };

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm ui-muted">Edit entry — simple form or JSON.</div>
              <div>
                <label className="text-xs ui-muted mr-2">Raw JSON</label>
                <input type="checkbox" checked={!useForm} onChange={() => setUseForm((v) => !v)} />
              </div>
            </div>
            {useForm ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs ui-muted">Date</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Particulars</label>
                  <input value={form.particulars} onChange={(e) => setForm((p) => ({ ...p, particulars: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Debit</label>
                  <input value={form.debit} onChange={(e) => setForm((p) => ({ ...p, debit: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Credit</label>
                  <input value={form.credit} onChange={(e) => setForm((p) => ({ ...p, credit: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
              </div>
            ) : (
              <textarea value={txt} onChange={(e) => setTxt(e.target.value)} className="ui-input w-full h-64 p-2 text-xs font-mono" />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { onClose && onClose(); }} className="ui-btn ui-btn-secondary">Cancel</button>
              <button type="button" onClick={save} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">Save</button>
            </div>
          </div>
        );
      };

      openModal(<GenericRowEditor initial={row} onClose={() => openModal(null)} />);
      return;
    }
    const def = getVoucherDef(key);
    const listKey = def?.listKey || null;

    // If a dedicated form component exists, use it.
    if (key === 'invoice') {
      const inv = (Array.isArray(db.invoices) ? db.invoices : []).find((x) => String(x?.id) === String(id));
      openModal(
        <InvoiceForm
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          initialData={inv}
          warehouses={warehouses}
          defaultWarehouseId={activeWarehouseId}
          onClose={() => openModal(null)}
        />
      );
      return;
    }
    if (key === 'bill') {
      const b = (Array.isArray(db.bills) ? db.bills : []).find((x) => String(x?.id) === String(id));
      openModal(
        <BillForm
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          initialData={b}
          warehouses={warehouses}
          defaultWarehouseId={activeWarehouseId}
          onClose={() => openModal(null)}
        />
      );
      return;
    }
    if (key === 'creditNote') {
      const cn = (Array.isArray(db.creditNotes) ? db.creditNotes : []).find((x) => String(x?.id) === String(id));
      openModal(
        <CreditNoteForm
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          initialData={cn}
          warehouses={warehouses}
          defaultWarehouseId={activeWarehouseId}
          onClose={() => openModal(null)}
        />
      );
      return;
    }
    if (key === 'debitNote') {
      const dn = (Array.isArray(db.debitNotes) ? db.debitNotes : []).find((x) => String(x?.id) === String(id));
      openModal(
        <DebitNoteForm
          db={db}
          setDb={setDb}
          currentCompany={currentCompany}
          initialData={dn}
          warehouses={warehouses}
          defaultWarehouseId={activeWarehouseId}
          onClose={() => openModal(null)}
        />
      );
      return;
    }
    if (key === 'estimate') {
      const est = (Array.isArray(db.estimates) ? db.estimates : []).find((x) => String(x?.id) === String(id));
      openModal(<EstimateForm db={db} setDb={setDb} currentCompany={currentCompany} initialData={est} onClose={() => openModal(null)} />);
      return;
    }
    if (key === 'purchaseOrder') {
      const po = (Array.isArray(db.purchaseOrders) ? db.purchaseOrders : []).find((x) => String(x?.id) === String(id));
      openModal(<PurchaseOrderForm db={db} setDb={setDb} currentCompany={currentCompany} initialData={po} onClose={() => openModal(null)} />);
      return;
    }
    if (key === 'expense') {
      const ex = (Array.isArray(db.expenses) ? db.expenses : []).find((x) => String(x?.id) === String(id));
      openModal(<ExpenseForm db={db} setDb={setDb} currentCompany={currentCompany} openModal={openModal} onClose={() => openModal(null)} initialData={ex} />);
      return;
    }
    if (key === 'journalEntry') {
      const je = (Array.isArray(db.journalEntries) ? db.journalEntries : []).find((x) => String(x?.id) === String(id));
      openModal(<JournalEntryForm db={db} setDb={setDb} currentCompany={currentCompany} initialData={je} onClose={() => openModal(null)} />);
      return;
    }

    // Generic editor fallback: edit raw JSON for any voucher list
    if (listKey && Array.isArray(db[listKey])) {
      const existing = db[listKey].find((x) => String(x?.id) === String(id)) || null;
      const GenericVoucherEditor = ({ initial, onClose }) => {
        const [useForm, setUseForm] = useState(true);
        const [txt, setTxt] = useState(JSON.stringify(initial || {}, null, 2));
        const [form, setForm] = useState({
          date: initial?.date || initial?.issueDate || '',
          number: initial?.number || initial?.voucherNo || '',
          total: initial?.total ?? initial?.amount ?? initial?.grandTotal ?? '',
        });

        const save = () => {
          try {
            let parsed = null;
            if (useForm) {
              parsed = { ...initial, date: form.date, number: form.number };
              if (form.total !== undefined && form.total !== '') parsed.total = Number(form.total);
            } else {
              parsed = JSON.parse(txt);
            }
            setDb((prev) => {
              const next = { ...prev };
              next[listKey] = (prev[listKey] || []).map((it) => (String(it?.id) === String(id) ? parsed : it));
              return next;
            });
            onClose && onClose();
          } catch (e) {
            notify.error('Invalid JSON: ' + e.message);
          }
        };

        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm ui-muted">Edit voucher — simple form or JSON.</div>
              <div>
                <label className="text-xs ui-muted mr-2">Raw JSON</label>
                <input type="checkbox" checked={!useForm} onChange={() => setUseForm((v) => !v)} />
              </div>
            </div>
            {useForm ? (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs ui-muted">Date</label>
                  <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Number</label>
                  <input value={form.number} onChange={(e) => setForm((p) => ({ ...p, number: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Total</label>
                  <input value={form.total} onChange={(e) => setForm((p) => ({ ...p, total: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
              </div>
            ) : (
              <textarea value={txt} onChange={(e) => setTxt(e.target.value)} className="ui-input w-full h-64 p-2 text-xs font-mono" />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => { onClose && onClose(); }} className="ui-btn ui-btn-secondary">Cancel</button>
              <button type="button" onClick={save} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">Save</button>
            </div>
          </div>
        );
      };

      openModal(<GenericVoucherEditor initial={existing} onClose={() => openModal(null)} />);
      return;
    }

    // fallback: view details
    handleView(row);
  };

  const handleDelete = async (row) => {
    const meta = row?.meta || {};
    const key = String(meta.voucherKey || '').trim();
    const id = meta.voucherId ?? meta.voucherId;
    if (!key || !id) return notify.error('Cannot delete this entry');
    const ok = await confirmDialog({ title: 'Please confirm', message: 'Delete this voucher? This action cannot be undone.', confirmLabel: 'Yes, continue' });
    if (!ok) return;

    const def = getVoucherDef(key);
    const listKey = def?.listKey || null;
    if (!listKey) return notify.error('Delete not supported for this voucher type');

    setDb((prev) => {
      const next = { ...prev };
      const deleted = (Array.isArray(prev[listKey]) ? prev[listKey] : []).find((x) => String(x?.id) === String(id)) || null;
      next[listKey] = (Array.isArray(prev[listKey]) ? prev[listKey] : []).filter((x) => String(x?.id) !== String(id));
      // show undo modal
      setTimeout(() => {
        if (!openModal) return;
        openModal(
          <div className="space-y-4">
            <div className="text-sm ui-fg">Deleted voucher.</div>
            <div className="flex gap-2">
              <button type="button" onClick={() => openModal(null)} className="ui-btn ui-btn-secondary">Close</button>
              <button type="button" onClick={() => {
                // restore
                setDb((prev2) => {
                  const next2 = { ...prev2 };
                  next2[listKey] = [...(Array.isArray(prev2[listKey]) ? prev2[listKey] : []), deleted].filter(Boolean);
                  return next2;
                });
                openModal(null);
              }} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">Undo</button>
            </div>
          </div>
        );
      }, 50);
      return next;
    });
  };
  const statement = useMemo(() => {
    return buildLedgerStatement(db, currentCompany.id, ledgerId);
  }, [db, currentCompany.id, ledgerId]);

  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(new Set());
  // persist expanded groups per ledger in localStorage
  useEffect(() => {
    try {
      const key = `ledger_expanded_${String(ledgerId || '')}`;
      const raw = localStorage.getItem(key);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setExpandedGroups(new Set(arr));
      }
    } catch {
      // ignore
    }
  }, [ledgerId]);

  useEffect(() => {
    try {
      const key = `ledger_expanded_${String(ledgerId || '')}`;
      localStorage.setItem(key, JSON.stringify(Array.from(expandedGroups)));
    } catch {
      // ignore
    }
  }, [expandedGroups, ledgerId]);

  const expandAll = () => {
    const set = new Set();
    displayRows.forEach((r, i) => {
      const meta = r?.meta || {};
      const key = `${String(meta.voucherKey || 'row')}:${String(meta.voucherId ?? meta.reference ?? i)}`;
      set.add(key);
    });
    setExpandedGroups(set);
  };

  const collapseAll = () => setExpandedGroups(new Set());

  const account = statement?.account || null;
  const rows = Array.isArray(statement?.rows) ? statement.rows : [];
  const opening = Number(statement?.openingBalance ?? 0);

  // Apply period filter (from/to) to the rows while keeping running balances computed earlier
  const filteredRows = useMemo(() => {
    if (!filterFrom && !filterTo) return rows;
    const f = filterFrom ? new Date(filterFrom) : null;
    const t = filterTo ? new Date(filterTo) : null;
    if ((f && Number.isNaN(f.getTime())) || (t && Number.isNaN(t.getTime()))) return rows;
    return rows.filter((r) => {
      if (!r?.date) return false;
      const d = new Date(r.date);
      if (Number.isNaN(d.getTime())) return false;
      if (f && d.getTime() < f.getTime()) return false;
      if (t && d.getTime() > t.getTime()) return false;
      return true;
    });
  }, [rows, filterFrom, filterTo]);

  // Opening balance to show for the filtered view should be the running balance just before the first filtered row
  const openingForFiltered = useMemo(() => {
    if (!filterFrom && !filterTo) return opening;
    if (!filteredRows.length) {
      // If no rows in period, opening should be running balance before the period start
      if (!filterFrom) return opening;
      const f = new Date(filterFrom);
      if (Number.isNaN(f.getTime())) return opening;
      // find last row strictly before from
      const idx = rows.findIndex((r) => {
        const d = r?.date ? new Date(r.date) : null;
        return d && !Number.isNaN(d.getTime()) && d.getTime() >= f.getTime();
      });
      if (idx <= 0) return opening;
      return Number(rows[idx - 1]?.runningBalance ?? opening);
    }
    const first = filteredRows[0];
    const idx = rows.findIndex((r) => r._idx === first._idx || (r.date === first.date && r.particulars === first.particulars && r.debit === first.debit && r.credit === first.credit));
    if (idx <= 0) return opening;
    return Number(rows[idx - 1]?.runningBalance ?? opening);
  }, [filterFrom, filterTo, filteredRows, rows, opening]);

  // Must sit above the `!account` early return below: a hook skipped on the
  // "ledger not found" render changes the hook order, and React then throws
  // "rendered fewer hooks than expected" as soon as a ledger does resolve.
  const periodLabel = useMemo(() => {
    if (!filterFrom && !filterTo) return 'Period';
    const fmt = (s) => {
      if (!s) return '';
      try {
        return new Date(s).toLocaleDateString();
      } catch {
        return String(s);
      }
    };
    if (filterFrom && filterTo) return `${fmt(filterFrom)} → ${fmt(filterTo)}`;
    if (filterFrom) return `From ${fmt(filterFrom)}`;
    return `To ${fmt(filterTo)}`;
  }, [filterFrom, filterTo]);

  if (!account) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="ui-t-sec">Ledger</h3>
          <button type="button" onClick={onBack} className="ui-btn ui-btn-secondary">
            Back
          </button>
        </div>
        <div className="ui-surface border rounded-xl p-6 text-sm ui-muted">Ledger not found.</div>
      </div>
    );
  }

  // Use filtered rows (date filter applied) for display, totals and exports/print
  const displayRows = filteredRows;
  const totalDebit = displayRows.reduce((s, r) => s + Number(r?.debit ?? 0), 0);
  const totalCredit = displayRows.reduce((s, r) => s + Number(r?.credit ?? 0), 0);

  const closingForFiltered = displayRows.length ? Number(displayRows[displayRows.length - 1]?.runningBalance ?? 0) : openingForFiltered;

  const doExport = (format) => {
    const payload = {
      companyName: currentCompany?.name || '',
      ledgerName: account?.name || '',
      openingBalance: openingForFiltered,
      closingBalance: closingForFiltered,
      rows: displayRows,
      columns: visibleColumns.map((c) => ({ key: c.key, label: c.label })),
    };

    if (format === 'pdf') {
      exportLedgerToPdf({ ...payload, fileName: `${account?.name || 'ledger'}.pdf` });
    } else if (format === 'excel') {
      exportLedgerToExcel({ ...payload, fileName: `${account?.name || 'ledger'}.xlsx` });
    }
  };

  const openExportChooser = () => {
    if (!openModal) {
      const choice = window.prompt('Export format: type PDF or Excel', 'PDF');
      const c = String(choice || '').trim().toLowerCase();
      if (c === 'pdf') doExport('pdf');
      else if (c === 'excel' || c === 'xlsx') doExport('excel');
      return;
    }

    openModal(
      <div className="space-y-4">
        <div className="text-sm ui-muted">Choose export format for this ledger.</div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              openModal(null);
              doExport('pdf');
            }}
            className="px-4 py-2 rounded-lg ui-btn ui-btn-primary "
          >
            PDF
          </button>
          <button
            type="button"
            onClick={() => {
              openModal(null);
              doExport('excel');
            }}
            className="ui-btn ui-btn-secondary"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => openModal(null)}
            className="ml-auto ui-btn ui-btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>,
      { title: 'Export Ledger', maxWidthClass: 'max-w-md' }
    );
  };

  const openPeriodModal = () => {
    if (!openModal) {
      const from = window.prompt('From date (YYYY-MM-DD)', filterFrom || '');
      const to = window.prompt('To date (YYYY-MM-DD)', filterTo || '');
      if (from !== null) setFilterFrom(String(from || ''));
      if (to !== null) setFilterTo(String(to || ''));
      return;
    }

    const PeriodModal = () => {
      const [draftFrom, setDraftFrom] = useState(filterFrom || '');
      const [draftTo, setDraftTo] = useState(filterTo || '');

      return (
        <div className="space-y-4">
          <div className="text-sm ui-muted">Select period for ledger entries.</div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs ui-muted">From</label>
              <input type="date" value={draftFrom} onChange={(e) => setDraftFrom(e.target.value)} className="ui-input w-full px-3 py-2" />
            </div>
            <div className="flex-1">
              <label className="block text-xs ui-muted">To</label>
              <input type="date" value={draftTo} onChange={(e) => setDraftTo(e.target.value)} className="ui-input w-full px-3 py-2" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => openModal(null)} className="ui-btn ui-btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setFilterFrom(draftFrom);
                setFilterTo(draftTo);
                openModal(null);
              }}
              className="px-4 py-2 rounded-lg ui-btn ui-btn-primary "
            >
              Apply
            </button>
            <button
              type="button"
              onClick={() => {
                setDraftFrom('');
                setDraftTo('');
                setFilterFrom('');
                setFilterTo('');
                openModal(null);
              }}
              className="ml-auto ui-btn ui-btn-secondary"
            >
              Clear
            </button>
          </div>
        </div>
      );
    };

    openModal(<PeriodModal />, { title: 'Period', maxWidthClass: 'max-w-md' });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="ui-t-sec">Ledger: {account.name}</h3>
          <div className="text-sm ui-muted">As of {new Date().toLocaleDateString()}</div>
        </div>
          <div className="flex items-center gap-2">
          <button type="button" onClick={onBack} className="ui-btn ui-btn-secondary">
            Back
          </button>

          <button
            type="button"
            onClick={openColumnSettings}
            className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-xs"
            title="Configure columns"
          >
            <Settings size={14} /> Columns
          </button>

          <button
            type="button"
            onClick={openPeriodModal}
            className="ui-btn ui-btn-secondary text-sm"
            title="Select period"
          >
            {periodLabel}
          </button>

          <button
            type="button"
            onClick={openExportChooser}
            className="ui-btn ui-btn-secondary"
          >
            <Download size={18} /> Export
          </button>

          <button
            type="button"
            onClick={expandAll}
            className="px-3 py-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm"
            title="Expand all entries"
          >
            Expand All
          </button>

          <button
            type="button"
            onClick={collapseAll}
            className="px-3 py-2 rounded-lg border ui-surface ui-hover-sunken ui-border-c text-sm"
            title="Collapse all entries"
          >
            Collapse All
          </button>

          <button
            type="button"
            onClick={() =>
              printLedger({
                companyName: currentCompany?.name || '',
                ledgerName: account?.name || '',
                openingBalance: openingForFiltered,
                closingBalance: closingForFiltered,
                rows: displayRows,
                columns: visibleColumns.map((c) => ({ key: c.key, label: c.label })),
              })
            }
            className="px-6 py-3 rounded-lg border ui-surface ui-hover-sunken ui-border-c"
          >
            Print
          </button>
        </div>
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border">
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  className={`px-4 py-3 text-xs font-medium ui-muted uppercase ${c.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {c.label}
                </th>
              ))}
              {/* actions moved to row click modal */}
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="ui-sunken">
              {visibleColumns.map((c) => {
                let content = '-';
                if (c.key === 'particulars') content = 'Opening Balance';
                if (c.key === 'runningBalance') content = formatMoney(openingForFiltered, currentCompany);
                return (
                  <td
                    key={c.key}
                    className={`px-4 py-3 text-sm ${c.align === 'right' ? 'text-right' : 'text-left'} ui-muted`}
                  >
                    {content}
                  </td>
                );
              })}
            </tr>
            {(() => {
              // Group ledger rows by voucher number (Vch No) primarily, with voucher type as context.
              // Fallback to meta.voucherKey:voucherId when voucherNo is missing.
              const groupsMap = new Map();
              displayRows.forEach((r, i) => {
                const meta = r?.meta || {};
                const vno = r?.voucherNo ? String(r.voucherNo).trim() : (meta.voucherNo ? String(meta.voucherNo).trim() : '');
                const vtype = r?.voucherType ? String(r.voucherType).trim() : (meta.voucherType ? String(meta.voucherType).trim() : '');
                let key;
                if (vno) key = `${vtype || 'v'}:${vno}`;
                else key = `${String(meta.voucherKey || 'row')}:${String(meta.voucherId ?? meta.reference ?? i)}`;
                if (!groupsMap.has(key)) groupsMap.set(key, []);
                groupsMap.get(key).push(r);
              });

              const groups = Array.from(groupsMap.entries()).map(([key, rows]) => {
                // Choose a representative row for the summary: pick the row with largest absolute amount (debit-credit)
                const representative = rows.reduce((best, x) => {
                  if (!best) return x;
                  const valX = Math.abs(Number(x.debit || 0) - Number(x.credit || 0));
                  const valBest = Math.abs(Number(best.debit || 0) - Number(best.credit || 0));
                  return valX > valBest ? x : best;
                }, rows[0]);
                const last = rows[rows.length - 1];
                const debit = rows.reduce((s, x) => s + Number(x.debit || 0), 0);
                const credit = rows.reduce((s, x) => s + Number(x.credit || 0), 0);
                return {
                  key,
                  rows,
                  date: representative?.date || rows[0]?.date,
                  particulars: representative?.particulars || rows[0]?.particulars,
                  voucherType: representative?.voucherType || rows[0]?.voucherType,
                  voucherNo: representative?.voucherNo || rows[0]?.voucherNo,
                  debit,
                  credit,
                  runningBalance: last.runningBalance,
                  meta: representative?.meta || rows[0]?.meta || {},
                };
              });

              return groups.map((g) => {
                const isExpanded = expandedGroups.has(g.key);
                return (
                  <React.Fragment key={g.key}>
                    <tr
                      className="ui-hover-sunken cursor-pointer"
                      onClick={() => {
                        const next = new Set(expandedGroups);
                        if (next.has(g.key)) next.delete(g.key);
                        else next.add(g.key);
                        setExpandedGroups(next);
                      }}
                      onDoubleClick={() => openRowActions(g.rows[0])}
                    >
                      {visibleColumns.map((c) => {
                        let content = '-';
                        if (c.key === 'date') content = g.date || '-';
                        else if (c.key === 'particulars') {
                          const party = g.meta?.partyName ? `${g.meta.partyName} • ${g.particulars || ''}` : g.particulars || '';
                          content = (
                            <div className="flex items-center gap-2">
                              <span className="text-xs px-2 py-1 rounded-lg border ui-surface ui-muted" aria-hidden>
                                {isExpanded ? '▾' : '▸'}
                              </span>
                              <div className="truncate">{party}</div>
                            </div>
                          );
                        } else if (c.key === 'voucherType') content = `${g.voucherType || ''}`;
                        else if (c.key === 'debit') content = formatMoney(g.debit || 0, currentCompany);
                        else if (c.key === 'credit') content = formatMoney(g.credit || 0, currentCompany);
                        else if (c.key === 'runningBalance') content = formatMoney(Number(g.runningBalance ?? 0), currentCompany);
                        else content = renderCell(g.rows[0], c.key);

                        return (
                          <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : 'text-left'} text-sm ui-fg`}>
                            {content}
                          </td>
                        );
                      })}
                    </tr>
                    {isExpanded && (() => {
                      // Aggregate expanded rows by particulars so each account (Sales/CGST/SGST etc.) shows once
                      const aggMap = new Map();
                      g.rows.forEach((r) => {
                        const key = String(r.particulars || (r.meta && (r.meta.accountName || r.meta.account)) || 'line').trim();
                        if (!aggMap.has(key)) aggMap.set(key, []);
                        aggMap.get(key).push(r);
                      });

                      const aggs = Array.from(aggMap.entries()).map(([particulars, rows]) => {
                        const rep = rows[0];
                        const debit = rows.reduce((s, x) => s + Number(x.debit || 0), 0);
                        const credit = rows.reduce((s, x) => s + Number(x.credit || 0), 0);
                        const runningBalance = rows[rows.length - 1]?.runningBalance ?? rep.runningBalance ?? null;
                        return { particulars, rows, rep, debit, credit, runningBalance };
                      });

                      return aggs.map((a, ai) => (
                        <tr key={`${g.key}:agg:${ai}`} className="ui-sunken">
                          {visibleColumns.map((c) => {
                            if (c.key === 'particulars') {
                              return (
                                <td key={c.key} className={`px-4 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'} text-sm ui-muted pl-6`}>
                                  <div className="font-medium">{a.particulars}</div>
                                </td>
                              );
                            }

                            if (c.key === 'debit') {
                              return (
                                <td key={c.key} className={`px-4 py-2 text-sm ui-muted text-right`}>{formatMoney(a.debit || 0, currentCompany)}</td>
                              );
                            }

                            if (c.key === 'credit') {
                              return (
                                <td key={c.key} className={`px-4 py-2 text-sm ui-muted text-right`}>{formatMoney(a.credit || 0, currentCompany)}</td>
                              );
                            }

                            if (c.key === 'runningBalance') {
                              return (
                                <td key={c.key} className={`px-4 py-2 text-sm ui-muted text-right`}>{a.runningBalance != null ? formatMoney(Number(a.runningBalance), currentCompany) : '-'}</td>
                              );
                            }

                            // For other columns, prefer representative row but strip item/narration details
                            const repRow = { ...(a.rep || {}), itemsSummary: undefined, narration: undefined };
                            return (
                              <td key={c.key} className={`px-4 py-2 ${c.align === 'right' ? 'text-right' : 'text-left'} text-sm ui-muted pl-6`}>
                                {renderCell(repRow, c.key)}
                              </td>
                            );
                          })}
                        </tr>
                      ));
                    })()}
                  </React.Fragment>
                );
              });
            })()}
            <tr className="ui-sunken font-bold border-t-2">
              {visibleColumns.map((c, idx) => {
                if (c.key === 'debit') {
                  return (
                    <td key={c.key} className="ui-col-amount px-4 py-3 text-right">
                      {formatMoney(totalDebit, currentCompany)}
                    </td>
                  );
                }
                if (c.key === 'credit') {
                  return (
                    <td key={c.key} className="ui-col-amount px-4 py-3 text-right">
                      {formatMoney(totalCredit, currentCompany)}
                    </td>
                  );
                }
                if (c.key === 'runningBalance') {
                  return (
                    <td key={c.key} className="ui-col-amount px-4 py-3 text-right">
                      {formatMoney(Number(account?.balance ?? 0), currentCompany)}
                    </td>
                  );
                }
                if (idx === 0) {
                  return (
                    <td key={c.key} className="ui-col-meta px-4 py-3">
                      TOTAL
                    </td>
                  );
                }
                return <td key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : 'text-left'}`} />;
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

const AccountingOverview = () => {
  return (
    <div className="ui-surface rounded-xl shadow-sm p-6 border">
      <h3 className="ui-t-sec mb-4">Accounting Module</h3>
      <p className="ui-muted">Select a sub-module from the sidebar</p>
    </div>
  );
};

const ProfitLoss = ({ db, currentCompany, onOpenLedger }) => {
  const accounts = db.chartOfAccounts.filter((a) => a.companyId === currentCompany.id);
  const groups = (Array.isArray(db.accountGroups) ? db.accountGroups : []).filter((g) => g.companyId === currentCompany.id);
  const types = (Array.isArray(db.accountTypes) ? db.accountTypes : []).filter((t) => t.companyId === currentCompany.id);

  const typeById = useMemo(() => {
    const m = new Map();
    for (const t of types) m.set(String(t.id), t);
    return m;
  }, [db.accountTypes, currentCompany.id]);

  const groupById = useMemo(() => {
    const m = new Map();
    for (const g of groups) m.set(String(g.id), g);
    return m;
  }, [db.accountGroups, currentCompany.id]);

  const withDerived = useMemo(() => {
    return accounts
      .map((a) => {
        const group = a?.groupId ? groupById.get(String(a.groupId)) : null;
        const typeRow = group?.typeId ? typeById.get(String(group.typeId)) : null;
        const derivedMain = String(typeRow?.main || a?.main || '').trim() || (['Income', 'Expense'].includes(String(a?.type || '').trim()) ? 'P&L' : 'Balance Sheet');
        const derivedClass = String(typeRow?.accountClass || a?.type || '').trim();
        return {
          ...a,
          _derivedMain: derivedMain,
          _derivedClass: derivedClass,
          _groupName: String(group?.name || '').trim(),
        };
      })
      .filter((a) => String(a._derivedMain || '').trim() === 'P&L');
  }, [accounts, groupById, typeById]);

  const incomeAccounts = useMemo(() => {
    return withDerived
      .filter((a) => String(a._derivedClass || '').trim() === 'Income')
      .slice()
      .sort((x, y) => {
        const gx = String(x._groupName || '');
        const gy = String(y._groupName || '');
        if (gx !== gy) return gx.localeCompare(gy);
        return String(x.name || '').localeCompare(String(y.name || ''));
      });
  }, [withDerived]);

  const expenseAccounts = useMemo(() => {
    return withDerived
      .filter((a) => String(a._derivedClass || '').trim() === 'Expense')
      .slice()
      .sort((x, y) => {
        const gx = String(x._groupName || '');
        const gy = String(y._groupName || '');
        if (gx !== gy) return gx.localeCompare(gy);
        return String(x.name || '').localeCompare(String(y.name || ''));
      });
  }, [withDerived]);

  const income = incomeAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const expenses = expenseAccounts.reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const netProfit = income - expenses;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Profit & Loss Statement</h3>
        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg ui-hover-sunken">
          <Download size={20} /> Export PDF
        </button>
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border">
        <div className="text-center mb-6">
          <h4 className="ui-t-sec">{currentCompany.name}</h4>
          <p className="text-sm ui-muted">Profit & Loss Statement</p>
          <p className="text-sm ui-muted">As of {new Date().toLocaleDateString()}</p>
        </div>

        <div className="space-y-4">
          <div>
            <h5 className="font-bold ui-fg mb-2">REVENUE</h5>
            {incomeAccounts.map((account) => (
                <div key={account.id} className="flex justify-between py-1 pl-4">
                  <button type="button" onClick={() => onOpenLedger && onOpenLedger(account.id)} className="ui-muted text-left hover:underline">
                    {account.name}
                  </button>
                  <span>{formatMoney(account.balance || 0, currentCompany)}</span>
                </div>
              ))}
            <div className="flex justify-between font-semibold border-t mt-2 pt-2">
              <span>Total Income</span>
              <span>{formatMoney(income, currentCompany)}</span>
            </div>
          </div>

          <div>
            <h5 className="font-bold ui-fg mb-2">EXPENSES</h5>
            {expenseAccounts.map((account) => (
                <div key={account.id} className="flex justify-between py-1 pl-4">
                  <button type="button" onClick={() => onOpenLedger && onOpenLedger(account.id)} className="ui-muted text-left hover:underline">
                    {account.name}
                  </button>
                  <span>{formatMoney(account.balance || 0, currentCompany)}</span>
                </div>
              ))}
            <div className="flex justify-between font-semibold border-t mt-2 pt-2">
              <span>Total Expenses</span>
              <span>{formatMoney(expenses, currentCompany)}</span>
            </div>
          </div>

          <div
            className={`ui-total-row border-t-2 pt-4 ${netProfit >= 0 ? 'text-[rgb(var(--pos))]' : 'text-[rgb(var(--neg))]'}`}
          >
            <span>NET PROFIT</span>
            <span>{formatMoney(netProfit, currentCompany)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const BalanceSheet = ({ db, currentCompany, onOpenLedger }) => {
  const accounts = db.chartOfAccounts.filter((a) => a.companyId === currentCompany.id);
  const groups = (Array.isArray(db.accountGroups) ? db.accountGroups : []).filter((g) => g.companyId === currentCompany.id);
  const types = (Array.isArray(db.accountTypes) ? db.accountTypes : []).filter((t) => t.companyId === currentCompany.id);

  const typeById = useMemo(() => {
    const m = new Map();
    for (const t of types) m.set(String(t.id), t);
    return m;
  }, [db.accountTypes, currentCompany.id]);

  const groupById = useMemo(() => {
    const m = new Map();
    for (const g of groups) m.set(String(g.id), g);
    return m;
  }, [db.accountGroups, currentCompany.id]);

  const withDerived = useMemo(() => {
    return accounts.map((a) => {
      const group = a?.groupId ? groupById.get(String(a.groupId)) : null;
      const typeRow = group?.typeId ? typeById.get(String(group.typeId)) : null;
      const derivedMain = String(typeRow?.main || a?.main || '').trim() || (['Income', 'Expense'].includes(String(a?.type || '').trim()) ? 'P&L' : 'Balance Sheet');
      const derivedClass = String(typeRow?.accountClass || a?.type || '').trim();
      return {
        ...a,
        _derivedMain: derivedMain,
        _derivedClass: derivedClass,
      };
    });
  }, [accounts, groupById, typeById]);

  const balanceSheetAccounts = withDerived.filter((a) => String(a._derivedMain || '').trim() === 'Balance Sheet');
  const pnlAccounts = withDerived.filter((a) => String(a._derivedMain || '').trim() === 'P&L');

  const assets = balanceSheetAccounts.filter((a) => a._derivedClass === 'Asset').reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const liabilities = balanceSheetAccounts.filter((a) => a._derivedClass === 'Liability').reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const equity = balanceSheetAccounts.filter((a) => a._derivedClass === 'Equity').reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const income = pnlAccounts.filter((a) => a._derivedClass === 'Income').reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const expenses = pnlAccounts.filter((a) => a._derivedClass === 'Expense').reduce((sum, a) => sum + Number(a.balance || 0), 0);
  const netProfit = income - expenses;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Balance Sheet</h3>
        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg ui-hover-sunken">
          <Download size={20} /> Export PDF
        </button>
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border">
        <div className="text-center mb-6">
          <h4 className="ui-t-sec">{currentCompany.name}</h4>
          <p className="text-sm ui-muted">Balance Sheet</p>
          <p className="text-sm ui-muted">As of {new Date().toLocaleDateString()}</p>
        </div>

        <div className="grid grid-cols-2 gap-8">
          <div>
            <h5 className="font-bold ui-fg mb-3">ASSETS</h5>
            {balanceSheetAccounts
              .filter((a) => a._derivedClass === 'Asset')
              .map((account) => (
                <div key={account.id} className="flex justify-between py-1 pl-4">
                  <button type="button" onClick={() => onOpenLedger && onOpenLedger(account.id)} className="ui-muted text-left hover:underline">
                    {account.name}
                  </button>
                  <span>{formatMoney(account.balance || 0, currentCompany)}</span>
                </div>
              ))}
            <div className="flex justify-between font-semibold border-t mt-2 pt-2">
              <span>Total Assets</span>
              <span>{formatMoney(assets, currentCompany)}</span>
            </div>
          </div>

          <div>
            <div className="mb-6">
              <h5 className="font-bold ui-fg mb-3">LIABILITIES</h5>
              {balanceSheetAccounts
                .filter((a) => a._derivedClass === 'Liability')
                .map((account) => (
                  <div key={account.id} className="flex justify-between py-1 pl-4">
                    <button type="button" onClick={() => onOpenLedger && onOpenLedger(account.id)} className="ui-muted text-left hover:underline">
                      {account.name}
                    </button>
                    <span>{formatMoney(account.balance || 0, currentCompany)}</span>
                  </div>
                ))}
              <div className="flex justify-between font-semibold border-t mt-2 pt-2">
                <span>Total Liabilities</span>
                <span>{formatMoney(liabilities, currentCompany)}</span>
              </div>
            </div>

            <div>
              <h5 className="font-bold ui-fg mb-3">EQUITY</h5>
              {balanceSheetAccounts
                .filter((a) => a._derivedClass === 'Equity')
                .map((account) => (
                  <div key={account.id} className="flex justify-between py-1 pl-4">
                    <button type="button" onClick={() => onOpenLedger && onOpenLedger(account.id)} className="ui-muted text-left hover:underline">
                      {account.name}
                    </button>
                    <span>{formatMoney(account.balance || 0, currentCompany)}</span>
                  </div>
                ))}
              <div className="flex justify-between py-1 pl-4">
                <span className="ui-muted">Current Year Profit / (Loss)</span>
                <span className={netProfit >= 0 ? 'text-[rgb(var(--pos))]' : 'text-[rgb(var(--neg))]'}>
                  {formatMoney(netProfit, currentCompany)}
                </span>
              </div>
              <div className="flex justify-between font-semibold border-t mt-2 pt-2">
                <span>Total Equity</span>
                <span>{formatMoney(equity + netProfit, currentCompany)}</span>
              </div>
            </div>

            <div className="ui-total-row border-t-2 mt-4 pt-2">
              <span>Total Liabilities & Equity</span>
              <span>{formatMoney(liabilities + equity + netProfit, currentCompany)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const CashFlowStatement = ({ db, currentCompany }) => {
  const payments = (Array.isArray(db.payments) ? db.payments : []).filter((p) => p.companyId === currentCompany.id);

  const totals = useMemo(() => {
    const byKey = new Map();
    const add = (key, amount) => {
      const cur = Number(byKey.get(key) ?? 0);
      byKey.set(key, round2(cur + (Number.isFinite(amount) ? amount : 0)));
    };

    let inflow = 0;
    let outflow = 0;

    for (const p of payments) {
      const dir = String(p?.direction || '').trim().toUpperCase();
      const vt = String(p?.voucherType || '').trim().toLowerCase();
      const amt = Number(p?.amount ?? 0);
      if (!Number.isFinite(amt) || amt === 0) continue;

      if (dir === 'IN') {
        inflow += amt;
        add(vt === 'receipt' ? 'Receipts' : 'Customer Collections', amt);
      } else if (dir === 'OUT') {
        outflow += amt;
        if (vt === 'payment') add('Payments to Vendors', amt);
        else if (vt === 'expense') add('Payments for Expenses', amt);
        else if (vt === 'bill') add('Payments for Bills', amt);
        else add('Other Payments', amt);
      }
    }

    return {
      inflow: round2(inflow),
      outflow: round2(outflow),
      net: round2(inflow - outflow),
      lines: [...byKey.entries()].map(([label, amount]) => ({ label, amount })),
    };
  }, [payments]);

  const positiveLines = totals.lines.filter((l) => Number(l.amount ?? 0) > 0).sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Cash Flow Statement</h3>
        <button className="flex items-center gap-2 px-4 py-2 border rounded-lg ui-hover-sunken">
          <Download size={20} /> Export PDF
        </button>
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border">
        <div className="text-center mb-6">
          <h4 className="ui-t-sec">{currentCompany.name}</h4>
          <p className="text-sm ui-muted">Cash Flow Statement</p>
          <p className="text-sm ui-muted">As of {new Date().toLocaleDateString()}</p>
          <p className="text-xs ui-muted mt-2">
            Based on recorded Receipts/Payments transactions.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <h5 className="font-bold ui-fg mb-2">CASH INFLOWS</h5>
            {positiveLines
              .filter((l) => l.label === 'Receipts' || l.label === 'Customer Collections')
              .map((l) => (
                <div key={l.label} className="flex justify-between py-1 pl-4">
                  <span className="ui-muted">{l.label}</span>
                  <span>{formatMoney(l.amount, currentCompany)}</span>
                </div>
              ))}
            <div className="flex justify-between font-semibold border-t mt-2 pt-2">
              <span>Total Inflows</span>
              <span>{formatMoney(totals.inflow, currentCompany)}</span>
            </div>
          </div>

          <div>
            <h5 className="font-bold ui-fg mb-2">CASH OUTFLOWS</h5>
            {positiveLines
              .filter((l) => !['Receipts', 'Customer Collections'].includes(l.label))
              .map((l) => (
                <div key={l.label} className="flex justify-between py-1 pl-4">
                  <span className="ui-muted">{l.label}</span>
                  <span>{formatMoney(l.amount, currentCompany)}</span>
                </div>
              ))}
            <div className="flex justify-between font-semibold border-t mt-2 pt-2">
              <span>Total Outflows</span>
              <span>{formatMoney(totals.outflow, currentCompany)}</span>
            </div>
          </div>

          <div className={`ui-total-row border-t-2 pt-4 ${totals.net >= 0 ? 'text-[rgb(var(--pos))]' : 'text-[rgb(var(--neg))]'}`}>
            <span>NET CASH FLOW</span>
            <span>{formatMoney(totals.net, currentCompany)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const SalesReports = ({ db, currentCompany }) => {
  const invoices = db.invoices.filter((i) => i.companyId === currentCompany.id);

  return (
    <div className="space-y-4">
      <h3 className="ui-t-sec">Sales Reports</h3>

      <div className="grid grid-cols-2 gap-6">
        <div className="ui-surface rounded-xl shadow-sm p-6 border">
          <h4 className="font-bold mb-4">Sales by Status</h4>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>Draft</span>
              <span className="font-semibold">{invoices.filter((i) => i.status === 'Draft').length}</span>
            </div>
            <div className="flex justify-between">
              <span>Paid</span>
              <span className="font-semibold">{invoices.filter((i) => i.status === 'Paid').length}</span>
            </div>
            <div className="flex justify-between">
              <span>Unpaid</span>
              <span className="font-semibold">{invoices.filter((i) => i.status === 'Unpaid').length}</span>
            </div>
          </div>
        </div>

        <div className="ui-surface rounded-xl shadow-sm p-6 border">
          <h4 className="font-bold mb-4">Total Sales</h4>
          <p className="ui-money-lg ui-amount-pos">{formatMoney(invoices.reduce((sum, i) => sum + i.total, 0), currentCompany)}</p>
        </div>
      </div>
    </div>
  );
};

/**
 * The reports hub, in the product's card language.
 *
 * Was a bare master-detail of text rows — the thinnest screen in the app
 * sitting on the richest data. Now every report is a tile: icon, name, and
 * one line saying what question it answers, grouped by category. Tiles are
 * clickable cards, so they take the hover lift.
 */
const REPORT_META = {
  ledgerTrialBalance: { icon: BookOpen, desc: 'Every posting to every account, in order — drill into any account\u2019s ledger.' },
  trialBalance: { icon: BookOpen, desc: 'Every account\u2019s closing balance. Must foot to zero.' },
  profitLoss: { icon: BarChart3, desc: 'What you earned and what it cost, over a period.' },
  balanceSheet: { icon: FileStack, desc: 'What the business owns and owes, at a date.' },
  cashFlow: { icon: Coins, desc: 'Where money came from and where it went.' },
  gstr1: { icon: BadgePercent, desc: 'Outward supplies, ready for the GSTR-1 return.' },
  gstr3b: { icon: BadgePercent, desc: 'Summary return: tax on sales less input credit.' },
  gstr2bReco: { icon: BadgePercent, desc: 'Match the portal\u2019s 2B against your bills — know which ITC is safe.' },
  tallyExport: { icon: FileStack, desc: 'Masters + vouchers as Tally XML — what the CA asks for.' },
  tdsTcs: { icon: Landmark, desc: 'Per-party 194Q/206C accumulation and the payable for challan filing.' },
  fixedAssets: { icon: Building2, desc: 'Asset register + WDV depreciation schedule with the yearly journal.' },
  yearEndClose: { icon: BookOpen, desc: 'P&L to capital, then lock the year against back-dating.' },
  costCenters: { icon: BarChart3, desc: 'P&L by branch/project — who actually makes money.' },
  salesReports: { icon: ClipboardList, desc: 'Billing by status and totals across customers.' },
};

const ReportsOverview = ({ sections, onNavigate }) => {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Everything is computed from posted documents — never from a cache."
      />

      {sections.map((sec) => (
        <section key={sec.key} aria-label={sec.title}>
          <h3 className="ui-card-label mb-3" style={{ color: 'rgb(var(--fg))' }}>{sec.title}</h3>
          <div className="ui-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(sec.items || []).map((r) => {
              const meta = REPORT_META[r.key] || {};
              const Icon = meta.icon || FileText;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onNavigate?.(r.key)}
                  className="ui-card ui-lift group flex items-start gap-3.5 p-5 text-left"
                >
                  <span
                    className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: 'rgb(var(--accent-soft))', color: 'rgb(var(--brand-ink))' }}
                    aria-hidden="true"
                  >
                    <Icon size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{r.label}</span>
                      <ArrowRight
                        size={15}
                        className="ui-subtle flex-shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </span>
                    {meta.desc ? <span className="ui-caption mt-1 block leading-snug">{meta.desc}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

const TemplatePreview = ({ companyName, voucherLabel, templateId, accentBarClass }) => {
  const title = `${voucherLabel} Preview`;
  const header = (
    <div className="border rounded-lg overflow-hidden">
      <div className={`h-2 ${accentBarClass}`} />
      <div className="p-4 flex items-start justify-between">
        <div>
          <div className="ui-t-sec ui-fg">{companyName}</div>
          <div className="text-xs ui-muted">Document Template Preview</div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold">{voucherLabel}</div>
          <div className="text-xs ui-muted">No: {voucherLabel.toUpperCase().slice(0, 3)}-0001</div>
          <div className="text-xs ui-muted">Date: {new Date().toISOString().slice(0, 10)}</div>
        </div>
      </div>
    </div>
  );

  const rows = (
    <div className="border rounded-lg overflow-hidden">
      <table className="ui-table w-full">
        <thead className="ui-sunken border-b">
          <tr>
            <th className="ui-th">Item</th>
            <th className="ui-th ui-num">Qty</th>
            <th className="ui-th ui-num">Rate</th>
            <th className="ui-th ui-num">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <tr>
            <td className="px-3 py-2">Sample Item A</td>
            <td className="ui-col-meta px-3 py-2 text-right">1</td>
            <td className="ui-col-meta px-3 py-2 text-right">₹1,000</td>
            <td className="ui-col-meta px-3 py-2 text-right font-medium">₹1,000</td>
          </tr>
          <tr>
            <td className="ui-col-meta px-3 py-2">Sample Item B</td>
            <td className="ui-col-meta px-3 py-2 text-right">2</td>
            <td className="ui-col-meta px-3 py-2 text-right">₹500</td>
            <td className="ui-col-meta px-3 py-2 text-right font-medium">₹1,000</td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  const totals = (
    <div className="border rounded-lg p-4 text-sm">
      <div className="flex justify-between">
        <span className="ui-muted">Subtotal</span>
        <span className="font-medium">₹2,000</span>
      </div>
      <div className="flex justify-between">
        <span className="ui-muted">GST</span>
        <span className="font-medium">₹360</span>
      </div>
      <div className="flex justify-between border-t mt-2 pt-2 font-bold">
        <span>Total</span>
        <span>₹2,360</span>
      </div>
    </div>
  );

  if (templateId === 'modern') {
    return (
      <div className="space-y-3">
        <div className="flex items-stretch gap-3">
          <div className={`w-2 rounded-lg ${accentBarClass}`} />
          <div className="flex-1">
            <div className="text-xs ui-muted">{title}</div>
            <div className="ui-title text-xl ui-fg">{voucherLabel}</div>
            <div className="text-sm ui-muted">{companyName}</div>
          </div>
          <div className="text-right text-sm ui-muted">
            <div>No: {voucherLabel.toUpperCase().slice(0, 3)}-0001</div>
            <div>Date: {new Date().toISOString().slice(0, 10)}</div>
          </div>
        </div>
        {rows}
        {totals}
      </div>
    );
  }

  if (templateId === 'minimal') {
    return (
      <div className="space-y-3">
        <div className="border rounded-lg p-4">
          <div className="flex justify-between">
            <div>
              <div className="text-xs ui-muted">{companyName}</div>
              <div className="ui-t-sec">{voucherLabel}</div>
            </div>
            <div className="text-right text-xs ui-muted">
              <div>No: {voucherLabel.toUpperCase().slice(0, 3)}-0001</div>
              <div>Date: {new Date().toISOString().slice(0, 10)}</div>
            </div>
          </div>
        </div>
        {rows}
        {totals}
      </div>
    );
  }

  if (templateId === 'compact') {
    return (
      <div className="space-y-2">
        <div className="border rounded-lg overflow-hidden">
          <div className={`h-2 ${accentBarClass}`} />
          <div className="p-3 flex items-start justify-between">
            <div>
              <div className="text-sm font-bold ui-fg">{companyName}</div>
              <div className="text-xs ui-muted">{title}</div>
            </div>
            <div className="text-right text-xs ui-muted">
              <div className="font-semibold ui-fg">{voucherLabel}</div>
              <div>No: {voucherLabel.toUpperCase().slice(0, 3)}-0001</div>
              <div>Date: {new Date().toISOString().slice(0, 10)}</div>
            </div>
          </div>
        </div>
        {rows}
        {totals}
      </div>
    );
  }

  if (templateId === 'bold') {
    return (
      <div className="space-y-3">
        <div className={`rounded-lg p-4 text-white ${accentBarClass}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="ui-t-sec">{companyName}</div>
              <div className="text-xs opacity-90">{title}</div>
            </div>
            <div className="text-right text-xs opacity-95">
              <div className="text-sm font-semibold">{voucherLabel}</div>
              <div>No: {voucherLabel.toUpperCase().slice(0, 3)}-0001</div>
              <div>Date: {new Date().toISOString().slice(0, 10)}</div>
            </div>
          </div>
        </div>
        {rows}
        {totals}
      </div>
    );
  }

  if (templateId === 'a5') {
    return (
      <div className="max-w-[620px] mx-auto text-[11px] leading-4 ui-fg">
        <div className="border border-gray-900">
          <div className="p-3 border-b border-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-bold">{companyName}</div>
                <div className="text-[10px] ui-fg">(Sample address line 1, city, state - pincode)</div>
                <div className="text-[10px] ui-fg">GSTIN: 27ABCDE1234F1Z5</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-extrabold tracking-wide">TAX INVOICE</div>
                <div className="text-[10px] font-semibold">ORIGINAL FOR RECIPIENT</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3">
            <div className="p-3 border-r border-gray-900">
              <div className="font-semibold">M/S</div>
              <div className="font-semibold">Customer Name</div>
              <div className="text-[10px] ui-fg">Address line…</div>
              <div className="text-[10px] ui-fg">GSTIN: 29ABCDE1234F1Z5</div>
              <div className="text-[10px] ui-fg">Place of Supply: Kerala (32)</div>
            </div>
            <div className="p-3 border-r border-gray-900">
              <div className="grid grid-cols-2 gap-x-2">
                <div className="font-semibold">Invoice No.</div>
                <div>GST-0001</div>
                <div className="font-semibold">Challan No</div>
                <div>—</div>
                <div className="font-semibold">E-Way Bill No.</div>
                <div>—</div>
                <div className="font-semibold">Transport</div>
                <div>—</div>
              </div>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 gap-x-2">
                <div className="font-semibold">Invoice Date</div>
                <div>{new Date().toISOString().slice(0, 10)}</div>
                <div className="font-semibold">Challan Date</div>
                <div>—</div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-900">
            <table className="ui-table w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-900">
                  <th className="p-1 border-r border-gray-900">Sr</th>
                  <th className="p-1 border-r border-gray-900">Name of Product / Service</th>
                  <th className="p-1 border-r border-gray-900">HSN/SAC</th>
                  <th className="p-1 border-r border-gray-900">Qty</th>
                  <th className="p-1 border-r border-gray-900">Rate</th>
                  <th className="p-1 border-r border-gray-900">Taxable</th>
                  <th className="p-1 border-r border-gray-900">GST %</th>
                  <th className="p-1 border-r border-gray-900">GST Amt</th>
                  <th className="p-1">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">1</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900">Sample Item A</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">8302</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">1</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-right">₹1,000</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-right">₹1,000</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">18</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-right">₹180</td>
                  <td className="ui-col-meta p-1 text-right">₹1,180</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 border-t border-gray-900">
            <div className="p-3 col-span-2 border-r border-gray-900">
              <div className="font-semibold">Terms and Conditions</div>
              <div className="text-[10px] ui-fg">This is a sample A5 template preview.</div>
              <div className="mt-8 font-semibold">Customer Signature</div>
            </div>
            <div className="p-3">
              <div className="flex justify-between font-semibold">
                <span>Taxable Amount</span>
                <span>₹2,000</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total Tax</span>
                <span>₹360</span>
              </div>
              <div className="flex justify-between font-extrabold border-t border-gray-900 mt-2 pt-2">
                <span>Total Amount</span>
                <span>₹2,360</span>
              </div>
              <div className="mt-6 text-[10px] ui-fg">This is a computer generated invoice.</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'a5Compact') {
    return (
      <div className="max-w-[620px] mx-auto text-[10px] leading-4 ui-fg">
        <div className="border border-gray-900">
          <div className="p-2 border-b border-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold">{companyName}</div>
                <div className="text-[10px] ui-fg">GSTIN: 27ABCDE1234F1Z5</div>
              </div>
              <div className="text-right">
                <div className="text-base font-extrabold">TAX INVOICE</div>
                <div className="text-[10px] font-semibold">A5 Compact</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2">
            <div className="p-2 border-r border-gray-900">
              <div className="font-semibold">M/S Customer Name</div>
              <div className="text-[10px] ui-fg">GSTIN: 29ABCDE1234F1Z5</div>
              <div className="text-[10px] ui-fg">Place of Supply: Kerala (32)</div>
            </div>
            <div className="p-2">
              <div className="grid grid-cols-2 gap-x-2">
                <div className="font-semibold">Invoice No.</div>
                <div>GST-0001</div>
                <div className="font-semibold">Invoice Date</div>
                <div>{new Date().toISOString().slice(0, 10)}</div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-900">
            <table className="ui-table w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-900">
                  <th className="p-1 border-r border-gray-900">Sr</th>
                  <th className="p-1 border-r border-gray-900">Item</th>
                  <th className="p-1 border-r border-gray-900">Qty</th>
                  <th className="p-1 border-r border-gray-900">Taxable</th>
                  <th className="p-1 border-r border-gray-900">GST%</th>
                  <th className="p-1">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">1</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900">Sample Item A</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">1</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-right">₹1,000</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">18</td>
                  <td className="ui-col-meta p-1 text-right">₹1,180</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-2 border-t border-gray-900">
            <div className="p-2 border-r border-gray-900">
              <div className="font-semibold">Terms</div>
              <div className="text-[10px] ui-fg">Computer generated invoice.</div>
            </div>
            <div className="p-2">
              <div className="flex justify-between font-semibold">
                <span>Taxable</span>
                <span>₹2,000</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Tax</span>
                <span>₹360</span>
              </div>
              <div className="flex justify-between font-extrabold border-t border-gray-900 mt-1 pt-1">
                <span>Total</span>
                <span>₹2,360</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'a5Clean') {
    return (
      <div className="max-w-[620px] mx-auto text-[11px] leading-4 ui-fg">
        <div className="border border-gray-900">
          <div className={`h-2 ${accentBarClass}`} />
          <div className="p-3 border-b border-gray-900">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-base font-bold">{companyName}</div>
                <div className="text-[10px] ui-fg">GSTIN: 27ABCDE1234F1Z5</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-extrabold tracking-wide">TAX INVOICE</div>
                <div className="text-[10px] font-semibold">A5 Clean</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3">
            <div className="p-3 border-r border-gray-900">
              <div className="font-semibold">M/S</div>
              <div className="font-semibold">Customer Name</div>
              <div className="text-[10px] ui-fg">GSTIN: 29ABCDE1234F1Z5</div>
            </div>
            <div className="p-3 border-r border-gray-900">
              <div className="grid grid-cols-2 gap-x-2">
                <div className="font-semibold">Invoice No.</div>
                <div>GST-0001</div>
                <div className="font-semibold">Invoice Date</div>
                <div>{new Date().toISOString().slice(0, 10)}</div>
              </div>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 gap-x-2">
                <div className="font-semibold">Place of Supply</div>
                <div>Kerala (32)</div>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-900">
            <table className="ui-table w-full border-collapse">
              <thead>
                <tr className="border-b border-gray-900">
                  <th className="p-1 border-r border-gray-900">Sr</th>
                  <th className="p-1 border-r border-gray-900">Name</th>
                  <th className="p-1 border-r border-gray-900">HSN</th>
                  <th className="p-1 border-r border-gray-900">Qty</th>
                  <th className="p-1 border-r border-gray-900">Taxable</th>
                  <th className="p-1 border-r border-gray-900">GST%</th>
                  <th className="p-1">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">1</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900">Sample Item A</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">8302</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">1</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-right">₹1,000</td>
                  <td className="ui-col-meta p-1 border-r border-gray-900 text-center">18</td>
                  <td className="ui-col-meta p-1 text-right">₹1,180</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 border-t border-gray-900">
            <div className="p-3 col-span-2 border-r border-gray-900">
              <div className="font-semibold">Customer Signature</div>
              <div className="mt-10" />
            </div>
            <div className="p-3">
              <div className="flex justify-between font-semibold">
                <span>Taxable</span>
                <span>₹2,000</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Tax</span>
                <span>₹360</span>
              </div>
              <div className="flex justify-between font-extrabold border-t border-gray-900 mt-2 pt-2">
                <span>Total</span>
                <span>₹2,360</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'a5Boxed') {
    return (
      <div className="max-w-[620px] mx-auto text-[11px] leading-4 ui-fg">
        <div className="border-2 border-gray-900">
          <div className="p-3 border-b-2 border-gray-900">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold">{companyName}</div>
              <div className="text-center">
                <div className="text-lg font-extrabold">TAX INVOICE</div>
                <div className="text-[10px] font-semibold">A5 Boxed</div>
              </div>
              <div className="text-right text-[10px]">
                <div className="font-semibold">GSTIN: 27ABCDE1234F1Z5</div>
                <div>Date: {new Date().toISOString().slice(0, 10)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b-2 border-gray-900">
            <div className="p-3 border-r-2 border-gray-900">
              <div className="font-semibold">Bill To</div>
              <div className="font-semibold">Customer Name</div>
              <div className="text-[10px] ui-fg">GSTIN: 29ABCDE1234F1Z5</div>
              <div className="text-[10px] ui-fg">Place of Supply: Kerala (32)</div>
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 gap-x-2">
                <div className="font-semibold">Invoice No.</div>
                <div>GST-0001</div>
                <div className="font-semibold">Challan No.</div>
                <div>—</div>
              </div>
            </div>
          </div>

          <div>
            <table className="ui-table w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-gray-900">
                  <th className="p-1 border-r-2 border-gray-900">Sr</th>
                  <th className="p-1 border-r-2 border-gray-900">Product / Service</th>
                  <th className="p-1 border-r-2 border-gray-900">HSN</th>
                  <th className="p-1 border-r-2 border-gray-900">Qty</th>
                  <th className="p-1 border-r-2 border-gray-900">Taxable</th>
                  <th className="p-1 border-r-2 border-gray-900">GST%</th>
                  <th className="p-1">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="ui-col-meta p-1 border-r-2 border-gray-900 text-center">1</td>
                  <td className="ui-col-meta p-1 border-r-2 border-gray-900">Sample Item A</td>
                  <td className="ui-col-meta p-1 border-r-2 border-gray-900 text-center">8302</td>
                  <td className="ui-col-meta p-1 border-r-2 border-gray-900 text-center">1</td>
                  <td className="ui-col-meta p-1 border-r-2 border-gray-900 text-right">₹1,000</td>
                  <td className="ui-col-meta p-1 border-r-2 border-gray-900 text-center">18</td>
                  <td className="ui-col-meta p-1 text-right">₹1,180</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 border-t-2 border-gray-900">
            <div className="p-3 col-span-2 border-r-2 border-gray-900">
              <div className="font-semibold">Terms</div>
              <div className="text-[10px] ui-fg">Subject to jurisdiction.</div>
              <div className="mt-8 font-semibold">Customer Signature</div>
            </div>
            <div className="p-3">
              <div className="flex justify-between font-semibold">
                <span>Taxable</span>
                <span>₹2,000</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Tax</span>
                <span>₹360</span>
              </div>
              <div className="flex justify-between font-extrabold border-t-2 border-gray-900 mt-2 pt-2">
                <span>Total</span>
                <span>₹2,360</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'a4Modern') {
    return (
      <div className="max-w-[980px] mx-auto text-sm ui-fg">
        <div className="border rounded-lg overflow-hidden">
          <div className={`h-2 ${accentBarClass}`} />
          <div className="p-6">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-2xl font-extrabold">{companyName}</div>
                <div className="text-xs ui-muted">(Sample address line 1, city, state - pincode)</div>
                <div className="text-xs ui-muted">GSTIN: 27ABCDE1234F1Z5</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold tracking-wide">TAX INVOICE</div>
                <div className="text-xs font-semibold ui-fg">A4 Modern</div>
                <div className="mt-2 text-xs ui-muted">Invoice No: GST-0001</div>
                <div className="text-xs ui-muted">Date: {new Date().toISOString().slice(0, 10)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold ui-fg uppercase">Bill To</div>
                <div className="mt-1 font-semibold">Customer Name</div>
                <div className="text-xs ui-muted">GSTIN: 29ABCDE1234F1Z5</div>
                <div className="text-xs ui-muted">Place of Supply: Kerala (32)</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold ui-fg uppercase">Summary</div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="ui-muted">Taxable</span>
                  <span className="font-semibold">₹2,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="ui-muted">GST</span>
                  <span className="font-semibold">₹360</span>
                </div>
                <div className="flex justify-between text-sm border-t mt-2 pt-2">
                  <span className="font-bold">Total</span>
                  <span className="font-bold">₹2,360</span>
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden mt-6">
              <table className="ui-table w-full">
                <thead className="ui-sunken border-b">
                  <tr>
                    <th className="ui-th">Sr</th>
                    <th className="ui-th">Product / Service</th>
                    <th className="ui-th">HSN/SAC</th>
                    <th className="ui-th ui-num">Qty</th>
                    <th className="ui-th ui-num">Rate</th>
                    <th className="ui-th ui-num">Taxable</th>
                    <th className="ui-th ui-num">GST%</th>
                    <th className="ui-th ui-num">GST Amt</th>
                    <th className="ui-th ui-num">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="ui-col-meta px-3 py-2">1</td>
                    <td className="ui-col-meta px-3 py-2">Sample Item A</td>
                    <td className="ui-col-meta px-3 py-2">8302</td>
                    <td className="ui-col-meta px-3 py-2 text-right">1</td>
                    <td className="ui-col-meta px-3 py-2 text-right">₹1,000</td>
                    <td className="ui-col-meta px-3 py-2 text-right">₹1,000</td>
                    <td className="ui-col-meta px-3 py-2 text-right">18</td>
                    <td className="ui-col-meta px-3 py-2 text-right">₹180</td>
                    <td className="ui-col-meta px-3 py-2 text-right font-semibold">₹1,180</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold ui-fg uppercase">Terms</div>
                <div className="text-xs ui-muted mt-2">This is a computer generated invoice. Signature not required.</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold ui-fg uppercase">For {companyName}</div>
                <div className="mt-10 text-xs ui-muted">(Authorized Signatory)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'a4BoxedGst') {
    return (
      <div className="max-w-[980px] mx-auto text-sm ui-fg">
        <div className="border-2 border-gray-900 ui-surface">
          <div className={`h-2 ${accentBarClass}`} />
          <div className="p-6 border-b-2 border-gray-900">
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-2xl font-extrabold">{companyName}</div>
                <div className="text-xs ui-muted">(Sample address line 1, city, state - pincode)</div>
                <div className="text-xs ui-muted">GSTIN: 27ABCDE1234F1Z5</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold tracking-wide">TAX INVOICE</div>
                <div className="text-xs font-semibold ui-fg">A4 Boxed GST Split</div>
                <div className="mt-2 text-xs ui-muted">Invoice No: GST-0001</div>
                <div className="text-xs ui-muted">Date: {new Date().toISOString().slice(0, 10)}</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 border-b-2 border-gray-900">
            <div className="p-4 border-r-2 border-gray-900">
              <div className="text-xs font-semibold uppercase">Bill To</div>
              <div className="font-semibold mt-1">Customer Name</div>
              <div className="text-xs ui-muted">GSTIN: 29ABCDE1234F1Z5</div>
              <div className="text-xs ui-muted">Place of Supply: Kerala (32)</div>
            </div>
            <div className="p-4">
              <div className="text-xs font-semibold uppercase">Totals</div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div className="ui-muted">Taxable</div>
                <div className="text-right font-semibold">₹2,000</div>
                <div className="ui-muted">CGST</div>
                <div className="text-right font-semibold">₹180</div>
                <div className="ui-muted">SGST</div>
                <div className="text-right font-semibold">₹180</div>
                <div className="ui-muted">Total</div>
                <div className="text-right font-bold">₹2,360</div>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="border-2 border-gray-900 overflow-hidden">
              <table className="ui-table w-full">
                <thead className="ui-sunken border-b-2 border-gray-900">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold border-r-2 border-gray-900">Sr</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold border-r-2 border-gray-900">Item</th>
                    <th className="px-2 py-2 text-left text-xs font-semibold border-r-2 border-gray-900">HSN</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900">Qty</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900">Rate</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900">Taxable</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900">GST%</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900">CGST</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold border-r-2 border-gray-900">SGST</th>
                    <th className="px-2 py-2 text-right text-xs font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="ui-col-meta px-2 py-2 border-r-2 border-gray-900">1</td>
                    <td className="ui-col-meta px-2 py-2 border-r-2 border-gray-900">Sample Item A</td>
                    <td className="ui-col-meta px-2 py-2 border-r-2 border-gray-900">8302</td>
                    <td className="ui-col-meta px-2 py-2 text-right border-r-2 border-gray-900">1</td>
                    <td className="ui-col-meta px-2 py-2 text-right border-r-2 border-gray-900">₹1,000</td>
                    <td className="ui-col-meta px-2 py-2 text-right border-r-2 border-gray-900">₹1,000</td>
                    <td className="ui-col-meta px-2 py-2 text-right border-r-2 border-gray-900">18</td>
                    <td className="ui-col-meta px-2 py-2 text-right border-r-2 border-gray-900">₹90</td>
                    <td className="ui-col-meta px-2 py-2 text-right border-r-2 border-gray-900">₹90</td>
                    <td className="ui-col-meta px-2 py-2 text-right font-semibold">₹1,180</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="border-2 border-gray-900 p-4">
                <div className="text-xs font-semibold uppercase">Terms</div>
                <div className="text-xs ui-muted mt-2">Subject to jurisdiction.</div>
              </div>
              <div className="border-2 border-gray-900 p-4">
                <div className="text-xs font-semibold uppercase">For {companyName}</div>
                <div className="mt-10 text-xs ui-muted">(Authorized Signatory)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (templateId === 'a4Letterhead') {
    return (
      <div className="max-w-[980px] mx-auto text-sm ui-fg">
        <div className="ui-surface border rounded-lg overflow-hidden">
          <div className={`p-6 ${accentBarClass} text-white`}>
            <div className="flex items-start justify-between gap-6">
              <div>
                <div className="text-2xl font-extrabold">{companyName}</div>
                <div className="text-xs opacity-95">(Sample address line 1, city, state - pincode)</div>
                <div className="text-xs opacity-95">GSTIN: 27ABCDE1234F1Z5</div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-extrabold tracking-wide">TAX INVOICE</div>
                <div className="text-xs font-semibold opacity-95">A4 Letterhead</div>
                <div className="mt-2 text-xs opacity-95">Invoice No: GST-0001</div>
                <div className="text-xs opacity-95">Date: {new Date().toISOString().slice(0, 10)}</div>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold ui-fg uppercase">Bill To</div>
                <div className="mt-1 font-semibold">Customer Name</div>
                <div className="text-xs ui-muted">GSTIN: 29ABCDE1234F1Z5</div>
                <div className="text-xs ui-muted">Place of Supply: Kerala (32)</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold ui-fg uppercase">Summary</div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="ui-muted">Taxable</span>
                  <span className="font-semibold">₹2,000</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="ui-muted">GST</span>
                  <span className="font-semibold">₹360</span>
                </div>
                <div className="flex justify-between text-sm border-t mt-2 pt-2">
                  <span className="font-bold">Total</span>
                  <span className="font-bold">₹2,360</span>
                </div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="ui-table w-full">
                <thead className="ui-sunken border-b">
                  <tr>
                    <th className="ui-th">Sr</th>
                    <th className="ui-th">Product / Service</th>
                    <th className="ui-th ui-num">Qty</th>
                    <th className="ui-th ui-num">Taxable</th>
                    <th className="ui-th ui-num">GST%</th>
                    <th className="ui-th ui-num">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  <tr>
                    <td className="ui-col-meta px-3 py-2">1</td>
                    <td className="ui-col-meta px-3 py-2">Sample Item A</td>
                    <td className="ui-col-meta px-3 py-2 text-right">1</td>
                    <td className="ui-col-meta px-3 py-2 text-right">₹1,000</td>
                    <td className="ui-col-meta px-3 py-2 text-right">18</td>
                    <td className="ui-col-meta px-3 py-2 text-right font-semibold">₹1,180</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold ui-fg uppercase">Notes</div>
                <div className="text-xs ui-muted mt-2">This is a computer generated invoice. Signature not required.</div>
              </div>
              <div className="border rounded-lg p-4">
                <div className="text-xs font-semibold ui-fg uppercase">For {companyName}</div>
                <div className="mt-10 text-xs ui-muted">(Authorized Signatory)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {header}
      {rows}
      {totals}
    </div>
  );
};

const MdmOverview = () => {
  return (
    <div className="ui-surface rounded-xl shadow-sm p-6 border">
      <h3 className="ui-t-sec mb-2">Master Data (MDM)</h3>
      <p className="ui-muted">Select a master from the sidebar</p>
    </div>
  );
};

const UomsList = ({ db, setDb, currentCompany }) => {
  const uoms = (db.uoms || [])
    .filter((u) => u.companyId === currentCompany.id)
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const [newUom, setNewUom] = useState('');

  const addUom = () => {
    const name = String(newUom || '').trim();
    if (!name) {
      notify.error('Please enter a UoM name.');
      return;
    }

    const exists = uoms.some((u) => String(u.name || '').trim().toLowerCase() === name.toLowerCase());
    if (exists) {
      notify.error('This UoM already exists.');
      return;
    }

    const nextId = Math.max(0, ...(db.uoms || []).map((u) => Number(u.id) || 0)) + 1;
    const next = { id: nextId, companyId: currentCompany.id, name };

    setDb({
      ...db,
      uoms: [...(db.uoms || []), next],
    });
    setNewUom('');
  };

  const deleteUom = (id) => {
    setDb({
      ...db,
      uoms: (db.uoms || []).filter((u) => u.id !== id),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Units of Measure (UoM)</h3>
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Add UoM</label>
            <input
              type="text"
              value={newUom}
              onChange={(e) => setNewUom(e.target.value)}
              className="ui-input w-full px-3 py-2"
              placeholder="e.g. Pcs, Kg, Hours"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={addUom}
              className="w-full px-4 py-2 ui-btn ui-btn-primary rounded-lg "
            >
              Add
            </button>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="ui-th">UoM</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {uoms.length === 0 ? (
                <tr>
                  <td colSpan="2" className="px-6 py-10 text-center ui-muted">
                    No UoMs found
                  </td>
                </tr>
              ) : (
                uoms.map((u) => (
                  <tr key={u.id} className="ui-hover-sunken">
                    <td className="px-4 py-2.5 ui-col-entity">{u.name}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => deleteUom(u.id)} className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-sm ui-muted">Tip: Items pick their Unit from this master.</div>
      </div>
    </div>
  );
};

/**
 * Item categories — the master behind the Category field on an item.
 *
 * Categories used to be typed free-hand on each item, so the same shelf could
 * be spelled three ways and a category-level discount would miss two of them.
 * They live here now; the item form picks from this list (and can add to it).
 * Categories already typed on items are imported once, so nothing is lost.
 */
const ItemCategoriesList = ({ db, setDb, currentCompany }) => {
  const categories = (db.itemCategories || [])
    .filter((c) => c.companyId === currentCompany.id)
    .slice()
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

  const items = (db.items || []).filter((i) => i.companyId === currentCompany.id);

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editing, setEditing] = useState(null); // { id, name, description }

  const catSearch = useListSearch(categories, ['name', 'description']);
  const catFilters = useColumnFilters();

  const countFor = (name) => {
    const key = String(name || '').trim().toLowerCase();
    return items.filter((i) => String(i.category || '').trim().toLowerCase() === key).length;
  };

  const rows = catFilters.apply(catSearch.filtered, {
    name: (c) => c.name,
    description: (c) => c.description || '',
    items: (c) => countFor(c.name),
  });

  // One-time import of whatever was already typed on items.
  const orphans = [
    ...new Set(
      items
        .map((i) => String(i.category || '').trim())
        .filter(Boolean)
        .filter((name) => !categories.some((c) => String(c.name || '').trim().toLowerCase() === name.toLowerCase()))
    ),
  ];

  const importOrphans = () => {
    if (!orphans.length) return;
    let nextId = Math.max(0, ...(db.itemCategories || []).map((c) => Number(c.id) || 0));
    const added = orphans.map((name) => ({ id: ++nextId, companyId: currentCompany.id, name, description: '' }));
    setDb({ ...db, itemCategories: [...(db.itemCategories || []), ...added] });
    notify.success(`${added.length} categor${added.length === 1 ? 'y' : 'ies'} imported from items.`);
  };

  const addCategory = () => {
    const name = String(newName || '').trim();
    if (!name) {
      notify.error('Category name is required.');
      return;
    }
    if (categories.some((c) => String(c.name || '').trim().toLowerCase() === name.toLowerCase())) {
      notify.error('That category already exists.');
      return;
    }
    const nextId = Math.max(0, ...(db.itemCategories || []).map((c) => Number(c.id) || 0)) + 1;
    setDb({
      ...db,
      itemCategories: [
        ...(db.itemCategories || []),
        { id: nextId, companyId: currentCompany.id, name, description: String(newDescription || '').trim() },
      ],
    });
    setNewName('');
    setNewDescription('');
    notify.success(`Category "${name}" created.`);
  };

  const saveEdit = () => {
    const name = String(editing?.name || '').trim();
    if (!name) {
      notify.error('Category name is required.');
      return;
    }
    const clash = categories.some(
      (c) => Number(c.id) !== Number(editing.id) && String(c.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    if (clash) {
      notify.error('Another category already has that name.');
      return;
    }
    const before = categories.find((c) => Number(c.id) === Number(editing.id));
    const oldName = String(before?.name || '').trim();

    setDb({
      ...db,
      itemCategories: (db.itemCategories || []).map((c) =>
        Number(c.id) === Number(editing.id) ? { ...c, name, description: String(editing.description || '').trim() } : c
      ),
      // Items carry the category by name, so a rename has to follow through.
      items: (db.items || []).map((i) =>
        i.companyId === currentCompany.id && String(i.category || '').trim().toLowerCase() === oldName.toLowerCase()
          ? { ...i, category: name }
          : i
      ),
    });
    setEditing(null);
    notify.success('Category updated.');
  };

  const deleteCategory = async (cat) => {
    const used = countFor(cat.name);
    const ok = await confirmDialog({
      title: 'Delete category',
      message: used
        ? `${used} item(s) use "${cat.name}". They keep the name on the item, but it will no longer be offered here.`
        : `Delete category "${cat.name}"?`,
      confirmLabel: 'Yes, delete',
    });
    if (!ok) return;
    setDb({ ...db, itemCategories: (db.itemCategories || []).filter((c) => Number(c.id) !== Number(cat.id)) });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h3 className="ui-t-sec">Item Categories</h3>
          <div className="text-sm ui-muted">The list every item picks its category from.</div>
        </div>
      </div>

      {orphans.length ? (
        <div className="rounded-xl border p-4 bg-[rgb(var(--warn-soft))] flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-[rgb(var(--warn-ink))]">
            {orphans.length} categor{orphans.length === 1 ? 'y is' : 'ies are'} typed on items but not in this master:{' '}
            {orphans.slice(0, 5).join(', ')}
            {orphans.length > 5 ? '…' : ''}
          </div>
          <button type="button" onClick={importOrphans} className="ui-btn ui-btn-primary ui-btn-sm text-xs">
            Import them
          </button>
        </div>
      ) : null}

      <div className="ui-surface rounded-xl shadow-sm p-6 border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1">Category name</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="ui-input w-full px-3 py-2"
              placeholder="e.g. Beverages, Spare Parts"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              className="ui-input w-full px-3 py-2"
              placeholder="Optional"
            />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={addCategory} className="w-full px-4 py-2 ui-btn ui-btn-primary rounded-lg">
              Add
            </button>
          </div>
        </div>

        <ListToolbar
          search={catSearch.query}
          onSearch={catSearch.setQuery}
          placeholder="Search categories (name, description)"
          count={rows.length}
          countLabel="categories"
          onExport={() =>
            exportRows({
              fileName: `ItemCategories_${currentCompany?.name || 'company'}`,
              label: 'categor(y/ies)',
              columns: [
                { key: 'name', label: 'Category' },
                { key: 'description', label: 'Description' },
                { key: 'items', label: 'Items', value: (c) => countFor(c.name) },
              ],
              rows,
            })
          }
        />

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full">
            <thead className="ui-sunken border-b">
              <tr>
                <ColumnHeader label="Category" col="name" state={catFilters} className="ui-th" />
                <ColumnHeader label="Description" col="description" state={catFilters} className="ui-th" />
                <ColumnHeader label="Items" col="items" state={catFilters} className="ui-th ui-num" align="right" />
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-10 text-center ui-muted">
                    No categories yet
                  </td>
                </tr>
              ) : (
                rows.map((c) => {
                  const isEditing = Number(editing?.id) === Number(c.id);
                  return (
                    <tr key={c.id} className="ui-hover-sunken">
                      <td className="px-4 py-2.5 ui-col-entity">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editing.name}
                            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                            className="ui-input w-full px-2 !h-8"
                          />
                        ) : (
                          <span className="font-medium">{c.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 ui-col-meta">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editing.description}
                            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                            className="ui-input w-full px-2 !h-8"
                          />
                        ) : (
                          <span className="ui-muted">{c.description || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right ui-num">{countFor(c.name)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <button type="button" onClick={saveEdit} className="ui-btn ui-btn-primary ui-btn-sm text-xs mr-2">
                              Save
                            </button>
                            <button type="button" onClick={() => setEditing(null)} className="ui-btn ui-btn-secondary ui-btn-sm text-xs">
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setEditing({ id: c.id, name: c.name, description: c.description || '' })}
                              className="ui-icon-btn mr-1"
                              aria-label={`Edit ${c.name}`}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCategory(c)}
                              className="ui-icon-btn text-[rgb(var(--neg))]"
                              aria-label={`Delete ${c.name}`}
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="text-sm ui-muted">Items pick their Category from this master, and discount rules match on it.</div>
      </div>
    </div>
  );
};

const GstRatesList = ({ db, setDb, currentCompany }) => {
  const gstRates = (db.gstRates || [])
    .filter((r) => r.companyId === currentCompany.id)
    .slice()
    .sort((a, b) => Number(a.rate) - Number(b.rate));

  const [newRate, setNewRate] = useState('');
  const [newRateName, setNewRateName] = useState('');

  const addRate = () => {
    const rate = Number(newRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      notify.error('Please enter a valid GST rate (0 to 100).');
      return;
    }

    const exists = gstRates.some((r) => Number(r.rate) === rate);
    if (exists) {
      notify.error('This GST rate already exists.');
      return;
    }

    const name = String(newRateName || '').trim() || `GST ${rate}%`;

    const nextId = Math.max(0, ...(db.gstRates || []).map((r) => Number(r.id) || 0)) + 1;
    const next = {
      id: nextId,
      companyId: currentCompany.id,
      rate,
      name,
    };

    // The named rate becomes a ledger of its own, so tax collected under it
    // is visible in the chart of accounts, not just inside document totals.
    const coa = Array.isArray(db.chartOfAccounts) ? db.chartOfAccounts : [];
    const ledgerExists = coa.some(
      (a) => a.companyId === currentCompany.id && String(a.name || '').trim().toLowerCase() === name.toLowerCase()
    );
    const nextCoaId = coa.reduce((m, a) => Math.max(m, Number(a.id) || 0), 0) + 1;
    const dutiesGroup = (db.accountGroups || []).find(
      (g) => g.companyId === currentCompany.id && /duties|taxes/i.test(String(g.name || ''))
    );
    const rateLedger = ledgerExists
      ? null
      : {
          id: nextCoaId,
          companyId: currentCompany.id,
          code: `GST-${String(rate).replace('.', '_')}`,
          name,
          ledgerCategory: 'Tax',
          groupId: dutiesGroup?.id ?? null,
          type: 'Liability',
          subType: 'Duties & Taxes',
          main: 'Balance Sheet',
          balance: 0,
          gstRate: rate,
          createdAt: new Date().toISOString(),
        };

    setDb({
      ...db,
      gstRates: [...(db.gstRates || []), next],
      ...(rateLedger ? { chartOfAccounts: [...coa, rateLedger] } : {}),
    });
    setNewRate('');
    setNewRateName('');
    notify.success(rateLedger ? `${name} added — ledger created under Duties & Taxes.` : `${name} added.`);
  };

  const deleteRate = (id) => {
    setDb({
      ...db,
      gstRates: (db.gstRates || []).filter((r) => r.id !== id),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">GST Rates</h3>
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border space-y-4">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Rate (%)</label>
            <input
              type="number"
              value={newRate}
              onChange={(e) => setNewRate(e.target.value)}
              className="ui-input w-full px-3 py-2"
              min="0"
              max="100"
              step="0.01"
              placeholder="e.g. 18"
            />
            {Number(newRate) > 0 ? (
              <div className="ui-caption mt-1">
                Intra-state: CGST {Number(newRate) / 2}% + SGST {Number(newRate) / 2}% · Inter-state: IGST {Number(newRate)}%
              </div>
            ) : null}
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium mb-1">Name (becomes a ledger)</label>
            <input
              type="text"
              value={newRateName}
              onChange={(e) => setNewRateName(e.target.value)}
              className="ui-input w-full px-3 py-2"
              placeholder={Number(newRate) > 0 ? `GST ${Number(newRate)}%` : 'e.g. GST 18%'}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={addRate}
              className="w-full px-4 py-2 ui-btn ui-btn-primary rounded-lg "
            >
              Add
            </button>
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="ui-table w-full">
            <thead className="ui-sunken border-b">
              <tr>
                <th className="ui-th">Rate (%)</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgb(var(--border))]">
              {gstRates.length === 0 ? (
                <tr>
                  <td colSpan="2" className="px-6 py-10 text-center ui-muted">
                    No GST rates found
                  </td>
                </tr>
              ) : (
                gstRates.map((r) => (
                  <tr key={r.id} className="ui-hover-sunken">
                    <td className="px-4 py-2.5 ui-col-entity">{Number(r.rate)}%</td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" onClick={() => deleteRate(r.id)} className="text-[rgb(var(--neg))] hover:text-[rgb(var(--neg))]">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-sm ui-muted">
          Tip: Items store their GST % directly. This list is your standard rate master.
        </div>
      </div>
    </div>
  );
};

const DocNumberingSettings = ({ db, setDb, currentCompany, branches = [] }) => {
  const [scopeBranchId, setScopeBranchId] = useState('');
  // Draft keyed by scope; changing scope re-seeds during render instead of
  // syncing state from props in an effect.
  const [numberingDraft, setNumberingDraft] = useState(() => ({
    scope: '',
    value: getDocSettings(db, currentCompany, { branchId: null }),
  }));
  if (numberingDraft.scope !== (scopeBranchId || '')) {
    setNumberingDraft({
      scope: scopeBranchId || '',
      value: getDocSettings(db, currentCompany, { branchId: scopeBranchId ? scopeBranchId : null }),
    });
  }
  const docSettings = numberingDraft.value;
  const setDocSettings = (updater) =>
    setNumberingDraft((p) => ({ ...p, value: typeof updater === 'function' ? updater(p.value) : updater }));

  const updateNumberingSetting = (voucherKey, patch) => {
    setDocSettings((prev) => ({
      ...prev,
      numbering: {
        ...prev.numbering,
        [voucherKey]: {
          ...prev.numbering[voucherKey],
          ...patch,
        },
      },
    }));
  };

  const handleSave = () => {
    setDb({
      ...db,
      companies: db.companies.map((c) => {
        if (c.id !== currentCompany.id) return c;

        const baseDoc = (c?.docSettings && typeof c.docSettings === 'object') ? c.docSettings : {};
        const normalizedBranchId = String(scopeBranchId || '').trim();

        if (normalizedBranchId) {
          const prevByBranch = (baseDoc?.numberingByBranch && typeof baseDoc.numberingByBranch === 'object') ? baseDoc.numberingByBranch : {};
          const prevBranchNum = (prevByBranch?.[normalizedBranchId] && typeof prevByBranch[normalizedBranchId] === 'object') ? prevByBranch[normalizedBranchId] : {};
          const nextByBranch = {
            ...prevByBranch,
            [normalizedBranchId]: {
              ...prevBranchNum,
              ...(docSettings?.numbering || {}),
            },
          };

          return {
            ...c,
            docSettings: {
              ...baseDoc,
              numberingByBranch: nextByBranch,
            },
          };
        }

        return {
          ...c,
          docSettings: {
            ...baseDoc,
            numbering: {
              ...(baseDoc?.numbering || {}),
              ...(docSettings?.numbering || {}),
            },
          },
        };
      }),
    });
    notify.success('Numbering settings saved.');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Numbering</h3>
        <button onClick={handleSave} className="px-4 py-2 ui-btn ui-btn-primary rounded-lg ">
          Save
        </button>
      </div>

      {/*
        Item codes, which are not a voucher series but belong with the others:
        this is the screen somebody opens when they want to decide how things
        are numbered. Goods and services get their own series because a
        business that sells both usually wants to tell them apart at a glance.
      */}
      <div className="ui-surface rounded-xl shadow-sm p-6 border space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="ui-t-label">Item codes</div>
            <p className="ui-caption mt-1">
              Off by default, and new items get a timestamp. Switch it on to number goods and services in their own
              series.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm shrink-0">
            <input
              type="checkbox"
              checked={Boolean(docSettings?.numbering?.itemCode?.enabled)}
              onChange={(e) =>
                setDocSettings((prev) => ({
                  ...prev,
                  numbering: {
                    ...prev.numbering,
                    itemCode: { ...(prev.numbering?.itemCode || {}), enabled: e.target.checked },
                  },
                }))
              }
            />
            Use item code series
          </label>
        </div>

        {docSettings?.numbering?.itemCode?.enabled ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { key: 'goods', label: 'Goods', fallbackPrefix: 'GD-' },
              { key: 'service', label: 'Services', fallbackPrefix: 'SV-' },
            ].map((row) => {
              const cfg = docSettings?.numbering?.itemCode?.[row.key] || {};
              const prefix = String(cfg.prefix ?? row.fallbackPrefix);
              const digits = Number(cfg.digits ?? 4) || 4;
              const nextNumber = Number(cfg.nextNumber ?? 1) || 1;
              const patch = (p) =>
                setDocSettings((prev) => ({
                  ...prev,
                  numbering: {
                    ...prev.numbering,
                    itemCode: {
                      ...(prev.numbering?.itemCode || {}),
                      [row.key]: { ...(prev.numbering?.itemCode?.[row.key] || {}), ...p },
                    },
                  },
                }));
              return (
                <div key={row.key} className="ui-sunken rounded-xl p-4 space-y-3">
                  <div className="ui-t-label">{row.label}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs uppercase tracking-wide ui-subtle mb-0.5">Prefix</label>
                      <input
                        type="text"
                        value={prefix}
                        onChange={(e) => patch({ prefix: e.target.value })}
                        className="ui-input w-full px-2 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wide ui-subtle mb-0.5">Digits</label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={digits}
                        onChange={(e) => patch({ digits: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                        className="ui-input w-full px-2 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wide ui-subtle mb-0.5">Next</label>
                      <input
                        type="number"
                        min="1"
                        value={nextNumber}
                        onChange={(e) => patch({ nextNumber: Math.max(1, Number(e.target.value) || 1) })}
                        className="ui-input w-full px-2 py-1.5"
                      />
                    </div>
                  </div>
                  <p className="ui-caption">
                    Next code: <span className="fig">{`${prefix}${String(nextNumber).padStart(digits, '0')}`}</span>
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs uppercase tracking-wide ui-subtle mb-0.5">Apply To</label>
            <select
              value={scopeBranchId}
              onChange={(e) => setScopeBranchId(String(e.target.value || '').trim())}
              className="ui-select w-full px-3 py-2 ui-surface"
            >
              <option value="">Company default</option>
              {(Array.isArray(branches) ? branches : [])
                .slice()
                .sort((a, b) => getBranchLabel(a).localeCompare(getBranchLabel(b)))
                .map((b) => (
                  <option key={String(b?.id)} value={String(b?.id)}>
                    {getBranchLabel(b) || `Branch ${String(b?.id)}`}
                  </option>
                ))}
            </select>
            <div className="text-xs ui-muted mt-1">
              {scopeBranchId ? 'Edits apply only to the selected branch.' : 'Edits apply to company-wide defaults.'}
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-bold">Voucher Numbering</h4>
          <p className="text-sm ui-muted">Configure prefix/suffix, auto/manual numbering, and manual override per voucher.</p>
        </div>

        <div className="space-y-3">
          {NUMBERING_VOUCHER_DEFS.map((v) => {
            const cfg = docSettings?.numbering?.[v.key];
            const isManual = String(cfg?.mode || '').toLowerCase() === 'manual';
            return (
              <div key={v.key} className="border rounded-lg px-3 py-2 lg:flex lg:items-end lg:gap-3">
                <div className="lg:w-44 flex items-baseline justify-between lg:block shrink-0 pb-1 lg:pb-0">
                  <div className="font-semibold text-sm">{v.label}</div>
                  <div className="ui-caption truncate" title={formatVoucherNumberPreview(cfg)}>{formatVoucherNumberPreview(cfg)}</div>
                </div>

                <div className="grid grid-cols-7 gap-2 flex-1">
                  <div className="col-span-1">
                    <label className="block text-xs uppercase tracking-wide ui-subtle mb-0.5">Mode</label>
                    <select
                      value={cfg?.mode || 'auto'}
                      onChange={(e) => updateNumberingSetting(v.key, { mode: e.target.value })}
                      className="ui-select w-full !h-8 !min-h-0 px-2 text-sm"
                    >
                      <option value="auto">Auto</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>

                  <div className="col-span-1">
                    <label className="block text-xs uppercase tracking-wide ui-subtle mb-0.5">Prefix</label>
                    <input
                      type="text"
                      value={cfg?.prefix || ''}
                      onChange={(e) => updateNumberingSetting(v.key, { prefix: e.target.value })}
                      className="ui-input w-full !h-8 !min-h-0 px-2 text-sm"
                    />
                  </div>

                  <div className="col-span-1">
                    <label className="block text-xs uppercase tracking-wide ui-subtle mb-0.5">Suffix</label>
                    <input
                      type="text"
                      value={cfg?.suffix || ''}
                      onChange={(e) => updateNumberingSetting(v.key, { suffix: e.target.value })}
                      className="ui-input w-full !h-8 !min-h-0 px-2 text-sm"
                    />
                  </div>

                  <div className="col-span-1">
                    <label className="block text-xs uppercase tracking-wide ui-subtle mb-0.5">Digits</label>
                    <select
                      value={String(cfg?.digits || 0)}
                      onChange={(e) => updateNumberingSetting(v.key, { digits: Number(e.target.value) })}
                      className="ui-select w-full !h-8 !min-h-0 px-2 text-sm"
                      disabled={isManual}
                    >
                      <option value="0">None</option>
                      {[2, 3, 4, 5, 6, 8].map((d) => (
                        <option key={d} value={String(d)}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-span-1">
                    <label className="block text-xs uppercase tracking-wide ui-subtle mb-0.5">Next No</label>
                    <input
                      type="number"
                      value={cfg?.nextNumber ?? 1}
                      onChange={(e) => updateNumberingSetting(v.key, { nextNumber: Number(e.target.value || 1) })}
                      className={`w-full px-2 py-2 border rounded-lg ${isManual ? 'ui-sunken' : ''}`}
                      disabled={isManual}
                      min="1"
                      step="1"
                    />
                  </div>

                  <div className="col-span-2 flex items-end">
                    <label className={`flex items-center gap-2 text-sm ${isManual ? 'ui-subtle' : ''}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(cfg?.allowManualOverride)}
                        onChange={(e) => updateNumberingSetting(v.key, { allowManualOverride: e.target.checked })}
                        disabled={isManual}
                      />
                      Allow manual override (Auto mode)
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const DocTemplateSettings = ({ db, setDb, currentCompany }) => {
  const [docSettings, setDocSettings] = useState(() => getDocSettings(db, currentCompany));
  const [templatePreview, setTemplatePreview] = useState(null);

  useEffect(() => {
    setDocSettings(getDocSettings(db, currentCompany));
  }, [db, currentCompany]);

  const updateTemplateSetting = (voucherKey, patch) => {
    setDocSettings((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [voucherKey]: {
          ...prev.templates[voucherKey],
          ...patch,
        },
      },
    }));
  };

  const handleSave = () => {
    setDb({
      ...db,
      companies: db.companies.map((c) =>
        c.id === currentCompany.id
          ? {
              ...c,
              docSettings,
            }
          : c
      ),
    });
    notify.success('Template settings saved.');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Templates</h3>
        <button onClick={handleSave} className="px-4 py-2 ui-btn ui-btn-primary rounded-lg ">
          Save
        </button>
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border space-y-4">
        <div>
          <h4 className="font-bold">Document Templates</h4>
          <p className="text-sm ui-muted">Choose a template and accent color for each voucher print layout.</p>
        </div>

        <div className="space-y-3">
          {VOUCHER_DEFS.map((v) => {
            const cfg = docSettings?.templates?.[v.key];
            const accent = ACCENT_OPTIONS.find((a) => a.id === cfg?.accentId) || ACCENT_OPTIONS[0];
            const templateName = TEMPLATE_OPTIONS.find((t) => t.id === cfg?.templateId)?.name || 'Classic';
            return (
              <div key={v.key} className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{v.label}</div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm ui-muted">{templateName}</div>
                    <button
                      type="button"
                      onClick={() =>
                        setTemplatePreview({
                          voucherLabel: v.label,
                          templateId: cfg?.templateId || 'classic',
                          accentBarClass: accent.barClass,
                        })
                      }
                      className="px-3 py-1.5 border rounded-lg text-sm ui-hover-sunken"
                    >
                      Preview
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Template</label>
                    <select
                      value={cfg?.templateId || 'classic'}
                      onChange={(e) => updateTemplateSetting(v.key, { templateId: e.target.value })}
                      className="ui-select w-full px-2 py-2"
                    >
                      {TEMPLATE_OPTIONS.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1">Accent Color</label>
                    <select
                      value={cfg?.accentId || 'blue'}
                      onChange={(e) => updateTemplateSetting(v.key, { accentId: e.target.value })}
                      className="ui-select w-full px-2 py-2"
                    >
                      {ACCENT_OPTIONS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <div className="w-full border rounded-lg overflow-hidden">
                      <div className={`h-2 ${accent.barClass}`} />
                      <div className="p-2 text-xs ui-muted">Preview header bar</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {templatePreview && (
        <Modal onClose={() => setTemplatePreview(null)} title={`${templatePreview.voucherLabel} Template`} maxWidthClass="max-w-3xl">
          <TemplatePreview
            companyName={currentCompany?.name || ''}
            voucherLabel={templatePreview.voucherLabel}
            templateId={templatePreview.templateId}
            accentBarClass={templatePreview.accentBarClass}
          />
        </Modal>
      )}
    </div>
  );
};

const InvoiceTemplateSettings = ({ db, setDb, currentCompany }) => {
  const [docSettings, setDocSettings] = useState(() => getDocSettings(db, currentCompany));
  const [templatePreview, setTemplatePreview] = useState(null);

  useEffect(() => {
    setDocSettings(getDocSettings(db, currentCompany));
  }, [db, currentCompany]);

  const updateInvoiceTemplate = (patch) => {
    setDocSettings((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        invoice: {
          ...prev.templates?.invoice,
          ...patch,
        },
      },
    }));
  };

  const handleSave = () => {
    setDb({
      ...db,
      companies: db.companies.map((c) =>
        c.id === currentCompany.id
          ? {
              ...c,
              docSettings,
            }
          : c
      ),
    });
    notify.success('Invoice template saved.');
  };

  const cfg = docSettings?.templates?.invoice;
  const templateId = cfg?.templateId || 'classic';
  const accent = ACCENT_OPTIONS.find((a) => a.id === cfg?.accentId) || ACCENT_OPTIONS[0];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Invoice Templates</h3>
        <button onClick={handleSave} className="px-4 py-2 ui-btn ui-btn-primary rounded-lg ">
          Save
        </button>
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border space-y-4">
        <div>
          <h4 className="font-bold">Select Invoice Template</h4>
          <p className="text-sm ui-muted">This template is used when you open an invoice from the invoice list.</p>
        </div>

        <div className="max-w-xl space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium mb-1">Template</label>
              <select
                value={templateId}
                onChange={(e) => updateInvoiceTemplate({ templateId: e.target.value })}
                className="ui-select w-full px-3 py-2"
              >
                {TEMPLATE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Accent colour</label>
              <select
                value={cfg?.accentId || ACCENT_OPTIONS[0].id}
                onChange={(e) => updateInvoiceTemplate({ accentId: e.target.value })}
                className="ui-select w-full px-3 py-2"
              >
                {ACCENT_OPTIONS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Terms &amp; conditions (printed on every invoice)</label>
            <textarea
              value={cfg?.termsText || ''}
              onChange={(e) => updateInvoiceTemplate({ termsText: e.target.value })}
              className="ui-input w-full px-3 py-2"
              rows={4}
              placeholder={'1. Goods once sold will not be taken back.\n2. Interest @18% p.a. on overdue invoices.'}
            />
          </div>

          <button
            type="button"
            onClick={() =>
              setTemplatePreview({
                voucherLabel: 'Invoice',
                templateId,
                accentBarClass: accent.barClass,
              })
            }
            className="w-full px-4 py-2 border rounded-lg text-sm ui-hover-sunken"
          >
            Preview
          </button>
        </div>
      </div>

      {templatePreview && (
        <Modal onClose={() => setTemplatePreview(null)} title="Invoice Template" maxWidthClass="max-w-3xl">
          <TemplatePreview
            companyName={currentCompany?.name || ''}
            voucherLabel={templatePreview.voucherLabel}
            templateId={templatePreview.templateId}
            accentBarClass={templatePreview.accentBarClass}
          />
        </Modal>
      )}
    </div>
  );
};

const CompanyProfile = ({ db, setDb, currentCompany }) => {
  const stateOptions = [
    'Andaman & Nicobar Islands',
    'Andhra Pradesh',
    'Arunachal Pradesh',
    'Assam',
    'Bihar',
    'Chandigarh',
    'Chhattisgarh',
    'Dadra & Nagar Haveli',
    'Daman & Diu',
    'Delhi',
    'Goa',
    'Gujarat',
    'Haryana',
    'Himachal Pradesh',
    'Jammu & Kashmir',
    'Jharkhand',
    'Karnataka',
    'Kerala',
    'Ladakh',
    'Lakshadweep',
    'Madhya Pradesh',
    'Maharashtra',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Odisha',
    'Puducherry',
    'Punjab',
    'Rajasthan',
    'Sikkim',
    'Tamil Nadu',
    'Telangana',
    'Tripura',
    'Uttar Pradesh',
    'Uttarakhand',
    'West Bengal',
  ];

  const codeForStateName = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '';
    for (const [code, stateName] of Object.entries(GST_STATE_BY_CODE || {})) {
      if (String(stateName || '').trim().toLowerCase() === trimmed.toLowerCase()) return code;
    }
    return '';
  };

  const seedCompanyForm = () => {
    const profile = getCompanyGstProfile(currentCompany);
    return {
      name: currentCompany?.name || '',
      currency: 'INR',
      gstRegistration: profile.gstRegistration || 'Registered',
      gstin: profile.gstin || '',
      state: profile.state || '',
    };
  };

  // Keyed to the company and reset during render on a switch — the effect
  // that re-seeded it also wiped in-progress edits whenever anything in db
  // changed, which was a bug, not a feature.
  const [companyForm, setCompanyForm] = useState(() => ({ key: currentCompany?.id, value: seedCompanyForm() }));
  if (companyForm.key !== currentCompany?.id) {
    setCompanyForm({ key: currentCompany?.id, value: seedCompanyForm() });
  }
  const formData = companyForm.value;
  const setFormData = (updater) =>
    setCompanyForm((p) => ({ ...p, value: typeof updater === 'function' ? updater(p.value) : updater }));

  const handleSave = () => {
    const gstinNormalized = String(formData.gstin || '').trim().toUpperCase();
    const stateFromGstin = getGstStateFromGstin(gstinNormalized);
    const nextState = stateFromGstin || String(formData.state || '').trim();

    setDb({
      ...db,
      companies: db.companies.map((c) =>
        c.id === currentCompany.id
          ? {
              ...c,
              name: formData.name,
              currency: 'INR',
              gstRegistration: formData.gstRegistration,
              gstin: gstinNormalized,
              state: nextState,
              country: c.country || 'India',
            }
          : c
      ),
    });

    notify.success('Company profile saved.');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">Company Profile</h3>
        <button onClick={handleSave} className="px-4 py-2 ui-btn ui-btn-primary rounded-lg ">
          Save
        </button>
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Company Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              className="ui-input w-full px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Currency</label>
            <input
              type="text"
              value={formData.currency}
              readOnly
              className="ui-input w-full px-3 py-2 ui-sunken"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">GST Registration</label>
            <select
              value={formData.gstRegistration}
              onChange={(e) => setFormData((p) => ({ ...p, gstRegistration: e.target.value }))}
              className="ui-select w-full px-3 py-2"
            >
              <option value="Registered">Registered</option>
              <option value="Unregistered">Unregistered</option>
              <option value="Composition">Composition</option>
              <option value="SEZ">SEZ</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">GSTIN</label>
            <input
              type="text"
              value={formData.gstin}
              onChange={(e) => {
                const nextGstin = e.target.value;
                const stateFromGstin = getGstStateFromGstin(nextGstin);
                setFormData((p) => ({
                  ...p,
                  gstin: nextGstin,
                  state: stateFromGstin ? stateFromGstin : p.state,
                }));
              }}
              className="ui-input w-full px-3 py-2"
              placeholder="e.g. 29ABCDE1234F1Z5"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">State</label>
            <PopupSelect
              label={null}
              title="Select State"
              value={formData.state}
              onChange={(next) => setFormData((p) => ({ ...p, state: next }))}
              options={stateOptions.map((s) => ({ value: s, label: s, code: codeForStateName(s) }))}
              placeholder="Select State"
            />
          </div>

          <div className="flex items-end">
            <div className="w-full text-sm ui-muted ui-sunken border rounded-lg px-3 py-2">
              Effective GST: {String(formData.state || '').trim() ? `${formData.state}` : 'Set state'}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

const TaxCompliancesView = ({ db, setDb, currentCompany }) => {
  const [saving, setSaving] = useState(false);

  const savedProfile = (currentCompany?.profile && typeof currentCompany.profile === 'object') ? currentCompany.profile : {};
  const savedTax = (savedProfile?.taxCompliances && typeof savedProfile.taxCompliances === 'object') ? savedProfile.taxCompliances : {};

  const stateOptions = Array.from(
    new Set(Object.values(GST_STATE_BY_CODE || {}).map((s) => String(s || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const codeForStateName = (name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return '';
    for (const [code, stateName] of Object.entries(GST_STATE_BY_CODE || {})) {
      if (String(stateName || '').trim().toLowerCase() === trimmed.toLowerCase()) return code;
    }
    return '';
  };

  const [gstEnabled, setGstEnabled] = useState(() => (savedTax?.gstEnabled ?? currentCompany?.gstEnabled ?? true) !== false);
  const [tdsEnabled, setTdsEnabled] = useState(() => Boolean(savedTax?.tds?.enabled ?? false));
  const [tcsEnabled, setTcsEnabled] = useState(() => Boolean(savedTax?.tcs?.enabled ?? false));

  const [gst, setGst] = useState(() => {
    const profile = getCompanyGstProfile(currentCompany);
    return {
      gstRegistration: profile.gstRegistration || 'Registered',
      gstin: profile.gstin || '',
      state: profile.state || '',
    };
  });

  const [tds, setTds] = useState(() => {
    const t = (savedTax?.tds && typeof savedTax.tds === 'object') ? savedTax.tds : {};
    return {
      registrationType: t.registrationType || 'Applicable',
      tan: t.tan || '',
      state: t.state || '',
    };
  });

  const [tcs, setTcs] = useState(() => {
    const t = (savedTax?.tcs && typeof savedTax.tcs === 'object') ? savedTax.tcs : {};
    return {
      registrationType: t.registrationType || 'Applicable',
      tan: t.tan || '',
      state: t.state || '',
    };
  });

  useEffect(() => {
    const profile = getCompanyGstProfile(currentCompany);
    const nextSavedProfile = (currentCompany?.profile && typeof currentCompany.profile === 'object') ? currentCompany.profile : {};
    const nextSavedTax = (nextSavedProfile?.taxCompliances && typeof nextSavedProfile.taxCompliances === 'object') ? nextSavedProfile.taxCompliances : {};
    setGst({
      gstRegistration: profile.gstRegistration || 'Registered',
      gstin: profile.gstin || '',
      state: profile.state || '',
    });
    setGstEnabled((nextSavedTax?.gstEnabled ?? currentCompany?.gstEnabled ?? true) !== false);
    setTdsEnabled(Boolean(nextSavedTax?.tds?.enabled ?? false));
    setTcsEnabled(Boolean(nextSavedTax?.tcs?.enabled ?? false));
    setTds({
      registrationType: nextSavedTax?.tds?.registrationType || 'Applicable',
      tan: nextSavedTax?.tds?.tan || '',
      state: nextSavedTax?.tds?.state || '',
    });
    setTcs({
      registrationType: nextSavedTax?.tcs?.registrationType || 'Applicable',
      tan: nextSavedTax?.tcs?.tan || '',
      state: nextSavedTax?.tcs?.state || '',
    });
  }, [currentCompany, db]);

  const saveAll = async () => {
    const gstReg = String(gst.gstRegistration || 'Registered').trim() || 'Registered';
    const gstinNormalized = String(gst.gstin || '').trim().toUpperCase();
    const stateFromGstin = getGstStateFromGstin(gstinNormalized);
    const nextGstState = stateFromGstin || String(gst.state || '').trim();

    const normalizedTdsTan = String(tds.tan || '').trim().toUpperCase();
    const normalizedTcsTan = String(tcs.tan || '').trim().toUpperCase();
    const nextTdsState = String(tds.state || '').trim();
    const nextTcsState = String(tcs.state || '').trim();

    if (gstEnabled) {
      if (!nextGstState) return notify.error('GST State is required when GST is enabled.');
      if (gstReg !== 'Unregistered' && !gstinNormalized) return notify.error('GSTIN is required for the selected GST Registration type.');
    }
    if (tdsEnabled) {
      if (!normalizedTdsTan) return notify.error('TDS TAN Number is required when TDS is enabled.');
      if (!nextTdsState) return notify.error('TDS State is required when TDS is enabled.');
    }
    if (tcsEnabled) {
      if (!normalizedTcsTan) return notify.error('TCS TAN Number is required when TCS is enabled.');
      if (!nextTcsState) return notify.error('TCS State is required when TCS is enabled.');
    }

    const nextTax = {
      ...(savedTax || {}),
      gstEnabled: Boolean(gstEnabled),
      tds: {
        enabled: Boolean(tdsEnabled),
        registrationType: String(tds.registrationType || 'Applicable').trim() || 'Applicable',
        tan: normalizedTdsTan,
        state: nextTdsState,
      },
      tcs: {
        enabled: Boolean(tcsEnabled),
        registrationType: String(tcs.registrationType || 'Applicable').trim() || 'Applicable',
        tan: normalizedTcsTan,
        state: nextTcsState,
      },
    };

    setSaving(true);
    try {
      setDb({
        ...db,
        companies: (db.companies || []).map((c) =>
          c.id === currentCompany.id
            ? {
                ...c,
                gstEnabled: Boolean(gstEnabled),
                gstRegistration: gstReg,
                gstin: gstEnabled ? gstinNormalized : c.gstin,
                state: gstEnabled ? nextGstState : c.state,
                country: c.country || 'India',
                profile: {
                  ...(c?.profile && typeof c.profile === 'object' ? c.profile : {}),
                  taxCompliances: nextTax,
                },
              }
            : c
        ),
      });

      // NOTE: tax & compliance settings are stored locally only. The old
      // PUT /api/profile/company call was removed with the unused Sequelize
      // backend that served it; the live API has no such route, so the request
      // never reached a handler and its failure was never checked. A real
      // endpoint lands with the server-side company profile work.
      notify.success('Tax & compliances saved.');
      return;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="ui-t-sec">Tax & Compliances</div>
          <div className="text-sm ui-muted">GST, TDS and TCS settings</div>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={saveAll}
          className={`px-4 py-2 rounded-lg ${saving ? 'ui-sunken ui-subtle' : 'ui-btn ui-btn-primary '}`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="border rounded-xl p-5 shadow-sm ui-surface">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold ui-fg">GST</div>
            <div className="text-xs ui-muted">Enable GST and keep registration details</div>
          </div>
          <label className="flex items-center gap-2 text-sm ui-fg select-none">
            <input
              type="checkbox"
              checked={gstEnabled}
              onChange={(e) => setGstEnabled(e.target.checked)}
              className="ui-checkbox"
            />
            <span>Enabled</span>
          </label>
        </div>

        {!gstEnabled ? (
          <div className="mt-4 text-sm ui-muted ui-sunken border rounded-lg px-3 py-3">
            GST is disabled.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs ui-muted">GST Registration Type</label>
              <select
                value={gst.gstRegistration}
                onChange={(e) => setGst((p) => ({ ...p, gstRegistration: e.target.value }))}
                className="ui-select w-full px-3 py-2 ui-surface"
              >
                <option value="Registered">Registered</option>
                <option value="Unregistered">Unregistered</option>
                <option value="Composition">Composition</option>
                <option value="SEZ">SEZ</option>
              </select>
            </div>

            <div>
              <label className="block text-xs ui-muted">GST Number (GSTIN)</label>
              <input
                value={gst.gstin}
                onChange={(e) => {
                  const nextGstin = e.target.value;
                  const stateFromGstin = getGstStateFromGstin(nextGstin);
                  setGst((p) => ({
                    ...p,
                    gstin: nextGstin,
                    state: stateFromGstin ? stateFromGstin : p.state,
                  }));
                }}
                className="ui-input w-full px-3 py-2"
                placeholder="e.g. 29ABCDE1234F1Z5"
              />
              <div className="text-xs ui-muted mt-1">State auto-fills from GSTIN (first 2 digits).</div>
            </div>

            <div>
              <label className="block text-xs ui-muted">State</label>
              <PopupSelect
                label={null}
                title="Select State"
                value={gst.state}
                onChange={(next) => setGst((p) => ({ ...p, state: next }))}
                options={stateOptions.map((s) => ({ value: s, label: s, code: codeForStateName(s) }))}
                placeholder="Select State"
              />
            </div>

            <div className="flex items-end">
              <div className="w-full text-sm ui-muted ui-sunken border rounded-lg px-3 py-2">
                Effective GST: {String(gst.state || '').trim() ? `${gst.state}` : 'Set state'}
              </div>
            </div>
          </div>
        )}
      </div>

      <EInvoiceSettings />

      <div className="border rounded-xl p-5 shadow-sm ui-surface">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold ui-fg">TDS</div>
            <div className="text-xs ui-muted">Enable TDS and keep TAN details</div>
          </div>
          <label className="flex items-center gap-2 text-sm ui-fg select-none">
            <input
              type="checkbox"
              checked={tdsEnabled}
              onChange={(e) => setTdsEnabled(e.target.checked)}
              className="ui-checkbox"
            />
            <span>Enabled</span>
          </label>
        </div>

        {!tdsEnabled ? (
          <div className="mt-4 text-sm ui-muted ui-sunken border rounded-lg px-3 py-3">
            TDS is disabled.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs ui-muted">Registration Type</label>
              <select
                value={tds.registrationType}
                onChange={(e) => setTds((p) => ({ ...p, registrationType: e.target.value }))}
                className="ui-select w-full px-3 py-2 ui-surface"
              >
                <option value="Applicable">Applicable</option>
                <option value="Not Applicable">Not Applicable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs ui-muted">TDS Number (TAN)</label>
              <input
                value={tds.tan}
                onChange={(e) => {
                  const next = e.target.value;
                  const maybeState = getGstStateFromGstin(next);
                  setTds((p) => ({ ...p, tan: next, state: maybeState ? maybeState : p.state }));
                }}
                className="ui-input w-full px-3 py-2"
                placeholder="Enter TAN"
              />
            </div>
            <div>
              <label className="block text-xs ui-muted">State</label>
              <PopupSelect
                label={null}
                title="Select State"
                value={tds.state}
                onChange={(next) => setTds((p) => ({ ...p, state: next }))}
                options={stateOptions.map((s) => ({ value: s, label: s, code: codeForStateName(s) }))}
                placeholder="Select State"
              />
            </div>
          </div>
        )}
      </div>

      <div className="border rounded-xl p-5 shadow-sm ui-surface">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold ui-fg">TCS</div>
            <div className="text-xs ui-muted">Enable TCS and keep TAN details</div>
          </div>
          <label className="flex items-center gap-2 text-sm ui-fg select-none">
            <input
              type="checkbox"
              checked={tcsEnabled}
              onChange={(e) => setTcsEnabled(e.target.checked)}
              className="ui-checkbox"
            />
            <span>Enabled</span>
          </label>
        </div>

        {!tcsEnabled ? (
          <div className="mt-4 text-sm ui-muted ui-sunken border rounded-lg px-3 py-3">
            TCS is disabled.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs ui-muted">Registration Type</label>
              <select
                value={tcs.registrationType}
                onChange={(e) => setTcs((p) => ({ ...p, registrationType: e.target.value }))}
                className="ui-select w-full px-3 py-2 ui-surface"
              >
                <option value="Applicable">Applicable</option>
                <option value="Not Applicable">Not Applicable</option>
              </select>
            </div>
            <div>
              <label className="block text-xs ui-muted">TCS Number (TAN)</label>
              <input
                value={tcs.tan}
                onChange={(e) => {
                  const next = e.target.value;
                  const maybeState = getGstStateFromGstin(next);
                  setTcs((p) => ({ ...p, tan: next, state: maybeState ? maybeState : p.state }));
                }}
                className="ui-input w-full px-3 py-2"
                placeholder="Enter TAN"
              />
            </div>
            <div>
              <label className="block text-xs ui-muted">State</label>
              <PopupSelect
                label={null}
                title="Select State"
                value={tcs.state}
                onChange={(next) => setTcs((p) => ({ ...p, state: next }))}
                options={stateOptions.map((s) => ({ value: s, label: s, code: codeForStateName(s) }))}
                placeholder="Select State"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const SettingsView = ({ db, setDb, currentCompany, initialTab = 'company', showSidebar = true }) => {
  const [activeTab, setActiveTab] = useState(() => (String(initialTab || 'company') === 'tax' ? 'tax' : 'company'));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next = String(initialTab || 'company');
    setActiveTab(next === 'tax' ? 'tax' : 'company');
  }, [initialTab]);

  const COMPANY_ENTITY_TYPES = ['Proprietorship', 'Partnership', 'Pvt Ltd', 'Ltd', 'LLP'];
  const INDUSTRY_OPTIONS = ['Retail', 'Manufacturing', 'Services'];
  const COUNTRY_OPTIONS = ['India'];
  const TZ_OPTIONS = ['Asia/Kolkata'];
  const CURRENCY_OPTIONS = ['INR'];

  const saved = (currentCompany && typeof currentCompany === 'object' ? currentCompany.profile : null) || {};
  const companySettings = (saved.companySettings && typeof saved.companySettings === 'object') ? saved.companySettings : {};

  const [form, setForm] = useState(() => ({
    legalName: companySettings.legalName || (currentCompany?.name || ''),
    tradeName: companySettings.tradeName || '',
    entityType: companySettings.entityType || 'Proprietorship',
    industries: Array.isArray(companySettings.industries) ? companySettings.industries : [],
    incorporationDate: companySettings.incorporationDate || '',
    financialYearStart: companySettings.financialYearStart || '',
    booksBeginDate: companySettings.booksBeginDate || '',
    baseCurrency: companySettings.baseCurrency || 'INR',
    country: companySettings.country || 'India',
    timeZone: companySettings.timeZone || 'Asia/Kolkata',

    officialEmail: companySettings.officialEmail || '',
    phone: companySettings.phone || '',
    website: companySettings.website || '',

    regAddress1: companySettings.regAddress1 || '',
    regAddress2: companySettings.regAddress2 || '',
    regCity: companySettings.regCity || '',
    regStateCode: companySettings.regStateCode || '',
    regPincode: companySettings.regPincode || '',
    regCountry: companySettings.regCountry || 'India',
  }));

  useEffect(() => {
    const nextSaved = (currentCompany && typeof currentCompany === 'object' ? currentCompany.profile : null) || {};
    const nextCompanySettings = (nextSaved.companySettings && typeof nextSaved.companySettings === 'object') ? nextSaved.companySettings : {};
    setForm({
      legalName: nextCompanySettings.legalName || (currentCompany?.name || ''),
      tradeName: nextCompanySettings.tradeName || '',
      entityType: nextCompanySettings.entityType || 'Proprietorship',
      industries: Array.isArray(nextCompanySettings.industries) ? nextCompanySettings.industries : [],
      incorporationDate: nextCompanySettings.incorporationDate || '',
      financialYearStart: nextCompanySettings.financialYearStart || '',
      booksBeginDate: nextCompanySettings.booksBeginDate || '',
      baseCurrency: nextCompanySettings.baseCurrency || 'INR',
      country: nextCompanySettings.country || 'India',
      timeZone: nextCompanySettings.timeZone || 'Asia/Kolkata',
      officialEmail: nextCompanySettings.officialEmail || '',
      phone: nextCompanySettings.phone || '',
      website: nextCompanySettings.website || '',
      regAddress1: nextCompanySettings.regAddress1 || '',
      regAddress2: nextCompanySettings.regAddress2 || '',
      regCity: nextCompanySettings.regCity || '',
      regStateCode: nextCompanySettings.regStateCode || '',
      regPincode: nextCompanySettings.regPincode || '',
      regCountry: nextCompanySettings.regCountry || 'India',
    });
  }, [currentCompany?.id]);

  const updateForm = async (patch) => setForm((p) => ({ ...p, ...patch }));

  const saveCompanySettings = async () => {
    const legalName = String(form.legalName || '').trim();
    const regAddress1 = String(form.regAddress1 || '').trim();
    const regCity = String(form.regCity || '').trim();
    const regStateCode = String(form.regStateCode || '').trim();
    const regPincode = String(form.regPincode || '').trim();
    const regCountry = String(form.regCountry || '').trim();

    if (!legalName) return notify.error('Legal Company Name is required.');
    // Name the exact gap: "Registered Address is required" while the user is
    // looking at a filled address line reads as a broken form.
    const missing = [
      [!regAddress1, 'Address Line 1'],
      [!regCity, 'City'],
      [!regStateCode, 'State / UT'],
      [!regPincode, 'Pincode'],
      [!regCountry, 'Country'],
    ]
      .filter(([bad]) => bad)
      .map(([, label]) => label);
    if (missing.length) {
      return notify.error(`Registered address: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} still empty.`);
    }

    const stateName = (GST_STATE_BY_CODE && regStateCode && GST_STATE_BY_CODE[regStateCode]) ? GST_STATE_BY_CODE[regStateCode] : '';

    const payload = {
      legalName,
      tradeName: String(form.tradeName || '').trim(),
      entityType: String(form.entityType || '').trim(),
      industries: Array.isArray(form.industries) ? form.industries : [],
      incorporationDate: form.incorporationDate || '',
      financialYearStart: form.financialYearStart || '',
      booksBeginDate: form.booksBeginDate || '',
      baseCurrency: String(form.baseCurrency || 'INR').trim(),
      country: String(form.country || 'India').trim(),
      timeZone: String(form.timeZone || 'Asia/Kolkata').trim(),
      officialEmail: String(form.officialEmail || '').trim(),
      phone: String(form.phone || '').trim(),
      website: String(form.website || '').trim(),
      regAddress1,
      regAddress2: String(form.regAddress2 || '').trim(),
      regCity,
      regStateCode,
      regStateName: stateName,
      regPincode,
      regCountry,
    };

    setSaving(true);
    try {
      // Save to local DB
      setDb((prev) => {
        const companies = Array.isArray(prev?.companies) ? prev.companies : [];
        const nextCompanies = companies.map((c) => {
          if (Number(c?.id) !== Number(currentCompany?.id)) return c;
          const prevProfile = c?.profile && typeof c.profile === 'object' ? c.profile : {};
          return {
            ...c,
            name: legalName,
            // Mirror the fields every GST document reads. The profile blob is
            // the source of record for this page, but invoice/bill/note
            // creation checks company.state and company.gstin at the root —
            // saving here without mirroring left documents blocked on
            // "Company state not set" forever.
            state: stateName || c.state || '',
            // Same reason, and the rest of the address is not optional either.
            // The invoice and expense-voucher print blocks read these four keys
            // and nothing else, and the e-invoice payload falls back to the
            // literal '-' for Addr1 and 0 for Pin when they are blank — so a
            // company that filled this page in and saved it successfully was
            // still printing a GST invoice with no supplier address on it and
            // submitting a placeholder pincode to the IRP.
            address: [regAddress1, payload.regAddress2].filter(Boolean).join(', '),
            city: regCity,
            pincode: regPincode,
            country: regCountry,
            ...(payload.gstin !== undefined ? { gstin: String(payload.gstin || '').trim() } : {}),
            profile: {
              ...prevProfile,
              companySettings: payload,
            },
          };
        });
        return { ...prev, companies: nextCompanies };
      });

      // Local-only for now — see the note on the tax & compliances save above.
      notify.success('Company settings saved.');
    } catch {
      notify.error('Failed to save company settings.');
    } finally {
      setSaving(false);
    }
  };

  const UsersRoles = () => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [branches, setBranches] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [activeWarehouseId, setActiveWarehouseId] = useState(() => String(localStorage.getItem('activeWarehouseId') || ''));
    const [permCatalog, setPermCatalog] = useState([]);

    const [selectedUserId, setSelectedUserId] = useState(null);
    const [selectedRoleId, setSelectedRoleId] = useState(null);
    const [selectedBranchId, setSelectedBranchId] = useState(null);
    const [selectedWarehouseId, setSelectedWarehouseId] = useState(null);

    const [permSearch, setPermSearch] = useState('');
    const [activeSection, setActiveSection] = useState('users'); // users | roles | branches | warehouses

    const [newUser, setNewUser] = useState(() => ({
      email: '',
      name: '',
      mobile: '',
      password: '',
      roleId: '',
    }));

    const [userEdit, setUserEdit] = useState(() => ({
      name: '',
      mobile: '',
      roleId: '',
      branchIds: [],
      warehouseIds: [],
    }));

    const [newRole, setNewRole] = useState(() => ({
      label: '',
      description: '',
      permissions: [],
    }));

    const [roleEdit, setRoleEdit] = useState(() => ({
      label: '',
      description: '',
      permissions: [],
    }));

    const [newBranch, setNewBranch] = useState(() => ({
      name: '',
      code: '',
      address: '',
    }));

    const [branchEdit, setBranchEdit] = useState(() => ({
      name: '',
      code: '',
      address: '',
      isActive: true,
    }));

    const [newWarehouse, setNewWarehouse] = useState(() => ({
      name: '',
      code: '',
      location: '',
      address: '',
      branchId: '',
    }));

    const [warehouseEdit, setWarehouseEdit] = useState(() => ({
      name: '',
      code: '',
      location: '',
      address: '',
      branchId: '',
      isActive: true,
    }));

    const backendCompanyId = resolveServerOrgId(currentCompany) || '';
    const token = localStorage.getItem('token');
    const orgId = String(localStorage.getItem('activeOrgId') || '').trim();

    const authHeaders = useMemo(() => {
      return {
        Authorization: `Bearer ${token}`,
        'X-Company-Id': String(backendCompanyId),
        ...(orgId ? { 'x-org-id': orgId } : {}),
      };
    }, [token, backendCompanyId, orgId]);

    const loadAll = async () => {
      setLoading(true);
      setError('');
      try {
        const [uRes, rRes, bRes, wRes, pRes] = await Promise.all([
          fetch('/api/users/company', { headers: authHeaders }),
          fetch('/api/roles/company', { headers: authHeaders }),
          fetch('/api/branches/company', { headers: authHeaders }),
          fetch('/api/warehouses/company', { headers: authHeaders }),
          fetch('/api/roles/permissions', { headers: authHeaders }),
        ]);

        const readJson = async (res) => {
          const text = await res.text();
          return text ? JSON.parse(text) : null;
        };

        const [uData, rData, bData, wData, pData] = await Promise.all([
          readJson(uRes),
          readJson(rRes),
          readJson(bRes),
          readJson(wRes),
          readJson(pRes),
        ]);

        if (!uRes.ok) throw new Error((uData && uData.error) || `Users HTTP ${uRes.status}`);
        if (!rRes.ok) throw new Error((rData && rData.error) || `Roles HTTP ${rRes.status}`);
        if (!bRes.ok) throw new Error((bData && bData.error) || `Branches HTTP ${bRes.status}`);
        if (!wRes.ok) throw new Error((wData && wData.error) || `Warehouses HTTP ${wRes.status}`);
        if (!pRes.ok) throw new Error((pData && pData.error) || `Permissions HTTP ${pRes.status}`);

        setUsers(Array.isArray(uData?.users) ? uData.users : []);
        setRoles(Array.isArray(rData?.roles) ? rData.roles : []);
        setBranches(Array.isArray(bData?.branches) ? bData.branches : []);
        setWarehouses(Array.isArray(wData?.warehouses) ? wData.warehouses : []);
        setPermCatalog(Array.isArray(pData?.permissions) ? pData.permissions : []);
      } catch (e) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      if (!currentCompany?.id) return;
      loadAll();
    }, [currentCompany?.id]);

    const selectedUser = useMemo(() => {
      if (!selectedUserId) return null;
      return users.find((u) => String(u.userId) === String(selectedUserId)) || null;
    }, [users, selectedUserId]);

    const selectedRole = useMemo(() => {
      if (!selectedRoleId) return null;
      return roles.find((r) => String(r.id) === String(selectedRoleId)) || null;
    }, [roles, selectedRoleId]);

    useEffect(() => {
      if (!selectedUser) {
        setUserEdit({ name: '', mobile: '', roleId: '', branchIds: [], warehouseIds: [] });
        return;
      }

      setUserEdit({
        name: selectedUser?.name || '',
        mobile: selectedUser?.mobile || '',
        roleId: selectedUser?.roleId != null ? String(selectedUser.roleId) : '',
        branchIds: Array.isArray(selectedUser?.branchIds) ? selectedUser.branchIds : [],
        warehouseIds: Array.isArray(selectedUser?.warehouseIds) ? selectedUser.warehouseIds : [],
      });
    }, [selectedUserId]);

    useEffect(() => {
      if (!selectedRole) {
        setRoleEdit({ label: '', description: '', permissions: [] });
        return;
      }
      setRoleEdit({
        label: selectedRole?.label || '',
        description: selectedRole?.description || '',
        permissions: Array.isArray(selectedRole?.permissions) ? selectedRole.permissions : [],
      });
    }, [selectedRoleId]);

    const selectedBranch = useMemo(() => {
      if (!selectedBranchId) return null;
      return branches.find((b) => String(b.id) === String(selectedBranchId)) || null;
    }, [branches, selectedBranchId]);

    const selectedWarehouse = useMemo(() => {
      if (!selectedWarehouseId) return null;
      return warehouses.find((w) => String(w.id) === String(selectedWarehouseId)) || null;
    }, [warehouses, selectedWarehouseId]);

    const activeWarehouse = useMemo(() => {
      if (!activeWarehouseId) return null;
      return warehouses.find((w) => String(w.id) === String(activeWarehouseId)) || null;
    }, [warehouses, activeWarehouseId]);

    useEffect(() => {
      if (!selectedBranch) {
        setBranchEdit({ name: '', code: '', address: '', isActive: true });
        return;
      }
      setBranchEdit({
        name: selectedBranch?.name || '',
        code: selectedBranch?.code || '',
        address: selectedBranch?.address || '',
        isActive: selectedBranch?.isActive !== false,
      });
    }, [selectedBranchId]);

    useEffect(() => {
      if (!selectedWarehouse) {
        setWarehouseEdit({ name: '', code: '', location: '', address: '', branchId: '', isActive: true });
        return;
      }
      setWarehouseEdit({
        name: selectedWarehouse?.name || '',
        code: selectedWarehouse?.code || '',
        location: selectedWarehouse?.location || '',
        address: selectedWarehouse?.address || '',
        branchId: selectedWarehouse?.branchId ? String(selectedWarehouse.branchId) : '',
        isActive: selectedWarehouse?.isActive !== false,
      });
    }, [selectedWarehouseId]);

    const filteredPerms = useMemo(() => {
      const q = String(permSearch || '').trim().toLowerCase();
      const list = Array.isArray(permCatalog) ? permCatalog : [];
      if (!q) return list;
      return list.filter((p) => {
        const k = String(p?.key || '').toLowerCase();
        const l = String(p?.label || '').toLowerCase();
        return k.includes(q) || l.includes(q);
      });
    }, [permCatalog, permSearch]);

    const createUser = async () => {
      setError('');
      const email = String(newUser.email || '').trim();
      const password = String(newUser.password || '');
      if (!email) return notify.error('Email is required.');
      if (password && password.length < 8) return notify.error('Password must be at least 8 characters.');

      try {
        const res = await fetch('/api/users/company-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            email,
            name: String(newUser.name || '').trim(),
            mobile: String(newUser.mobile || '').trim(),
            password: password ? password : undefined,
            roleId: newUser.roleId ? Number(newUser.roleId) : undefined,
          }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        setNewUser({ email: '', name: '', mobile: '', password: '', roleId: '' });
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const saveUserBasics = async () => {
      if (!selectedUser) return;
      setError('');
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(String(selectedUser.userId))}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ name: userEdit.name, mobile: userEdit.mobile }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const saveUserRole = async () => {
      if (!selectedUser) return;
      if (!userEdit.roleId) return notify.error('Select a role.');
      setError('');
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(String(selectedUser.userId))}/role`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ roleId: Number(userEdit.roleId) }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const saveUserBranches = async () => {
      if (!selectedUser) return;
      setError('');
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(String(selectedUser.userId))}/branches`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ branchIds: userEdit.branchIds }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const saveUserWarehouses = async () => {
      if (!selectedUser) return;
      setError('');
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(String(selectedUser.userId))}/warehouses`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ warehouseIds: userEdit.warehouseIds }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const removeUser = async () => {
      if (!selectedUser) return;
      const ok = await confirmDialog({ title: 'Please confirm', message: `Remove ${selectedUser.email || 'this user'} from this company?`, confirmLabel: 'Yes, continue' });
      if (!ok) return;
      setError('');
      try {
        const res = await fetch(`/api/users/${encodeURIComponent(String(selectedUser.userId))}/company`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        setSelectedUserId(null);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const createRole = async () => {
      setError('');
      const label = String(newRole.label || '').trim();
      if (!label) return notify.error('Role name is required.');

      try {
        const res = await fetch('/api/roles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ label, description: newRole.description || '', permissions: newRole.permissions }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        setNewRole({ label: '', description: '', permissions: [] });
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const saveRole = async () => {
      if (!selectedRole) return;
      if (selectedRole.isSystem) return;
      setError('');
      const label = String(roleEdit.label || '').trim();
      if (!label) return notify.error('Role name is required.');
      try {
        const res = await fetch(`/api/roles/${encodeURIComponent(String(selectedRole.id))}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ label, description: roleEdit.description || '', permissions: roleEdit.permissions }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const deleteRole = async () => {
      if (!selectedRole) return;
      if (selectedRole.isSystem) return;
      const ok = await confirmDialog({ title: 'Please confirm', message: `Delete role "${selectedRole.label}"?`, confirmLabel: 'Yes, continue' });
      if (!ok) return;
      setError('');
      try {
        const res = await fetch(`/api/roles/${encodeURIComponent(String(selectedRole.id))}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        setSelectedRoleId(null);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    /* ---- Branch CRUD ---- */
    const createBranch = async () => {
      setError('');
      const name = String(newBranch.name || '').trim();
      if (!name) return notify.error('Branch name is required.');
      try {
        const res = await fetch('/api/branches', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            name,
            code: newBranch.code || '',
            address: newBranch.address || '',
          }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        setNewBranch({ name: '', code: '', address: '' });
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const saveBranch = async () => {
      if (!selectedBranch) return;
      setError('');
      const name = String(branchEdit.name || '').trim();
      if (!name) return notify.error('Branch name is required.');
      try {
        const res = await fetch(`/api/branches/${encodeURIComponent(String(selectedBranch.id))}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            name,
            code: branchEdit.code || '',
            address: branchEdit.address || '',
            isActive: branchEdit.isActive,
          }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const deleteBranch = async () => {
      if (!selectedBranch) return;
      const ok = await confirmDialog({ title: 'Please confirm', message: `Delete branch "${selectedBranch.name}"?`, confirmLabel: 'Yes, continue' });
      if (!ok) return;
      setError('');
      try {
        const res = await fetch(`/api/branches/${encodeURIComponent(String(selectedBranch.id))}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        setSelectedBranchId(null);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    /* ---- Warehouse CRUD ---- */
    const createWarehouse = async () => {
      setError('');
      const name = String(newWarehouse.name || '').trim();
      if (!name) return notify.error('Warehouse name is required.');
      try {
        const res = await fetch('/api/warehouses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            name,
            code: newWarehouse.code || '',
            location: newWarehouse.location || '',
            address: newWarehouse.address || '',
            branchId: newWarehouse.branchId ? Number(newWarehouse.branchId) : null,
          }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        setNewWarehouse({ name: '', code: '', location: '', address: '', branchId: '' });
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const saveWarehouse = async () => {
      if (!selectedWarehouse) return;
      setError('');
      const name = String(warehouseEdit.name || '').trim();
      if (!name) return notify.error('Warehouse name is required.');
      try {
        const res = await fetch(`/api/warehouses/${encodeURIComponent(String(selectedWarehouse.id))}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            name,
            code: warehouseEdit.code || '',
            location: warehouseEdit.location || '',
            address: warehouseEdit.address || '',
            branchId: warehouseEdit.branchId ? Number(warehouseEdit.branchId) : null,
            isActive: warehouseEdit.isActive,
          }),
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const deleteWarehouse = async () => {
      if (!selectedWarehouse) return;
      const ok = await confirmDialog({ title: 'Please confirm', message: `Delete warehouse "${selectedWarehouse.name}"?`, confirmLabel: 'Yes, continue' });
      if (!ok) return;
      setError('');
      try {
        const res = await fetch(`/api/warehouses/${encodeURIComponent(String(selectedWarehouse.id))}`, {
          method: 'DELETE',
          headers: authHeaders,
        });
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) throw new Error((data && (data.error || data.details)) || `HTTP ${res.status}`);
        setSelectedWarehouseId(null);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e));
      }
    };

    const setActiveWarehouse = (warehouseId) => {
      const id = warehouseId ? String(warehouseId) : '';
      if (!id) {
        localStorage.removeItem('activeWarehouseId');
        setActiveWarehouseId('');
        return;
      }
      localStorage.setItem('activeWarehouseId', id);
      setActiveWarehouseId(id);
    };

    const roleOptions = roles.map((r) => ({ value: String(r.id), label: r.label }));
    const branchOptions = branches.map((b) => ({ value: String(b.id), label: b.name + (b.code ? ` (${b.code})` : '') }));

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <div className="ui-t-sec">Users, Roles, Branches & Warehouses</div>
            <div className="text-sm ui-muted">Manage users, roles, branches and warehouses</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              {['users', 'roles', 'branches', 'warehouses'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setActiveSection(s)}
                  className={`px-3 py-2 text-sm capitalize ${activeSection === s ? 'ui-btn ui-btn-primary' : 'ui-surface ui-fg ui-hover-sunken'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={loadAll}
              className="ui-btn ui-btn-secondary"
            >
              Refresh
            </button>
          </div>
        </div>

        {error ? <div className="ui-surface border rounded-xl p-4 text-sm text-[rgb(var(--neg))]">{error}</div> : null}

        {error ? <div className="ui-surface border rounded-xl p-4 text-sm text-[rgb(var(--neg))]">{error}</div> : null}

        {activeSection === 'users' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Users column */}
          <div className="ui-surface border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b ui-sunken">
              <div className="font-bold">Users</div>
              <div className="text-xs ui-muted">Company users and their assignments</div>
            </div>

            <div className="p-5 space-y-4">
              <div className="border rounded-xl p-4">
                <div className="text-sm font-semibold">Add / Attach User</div>
                <div className="text-xs ui-muted">If the email already exists, it will be attached to this company.</div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs ui-muted">Email</label>
                    <input
                      value={newUser.email}
                      onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))}
                      className="ui-input w-full px-3 py-2"
                      placeholder="user@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-xs ui-muted">Name</label>
                    <input
                      value={newUser.name}
                      onChange={(e) => setNewUser((p) => ({ ...p, name: e.target.value }))}
                      className="ui-input w-full px-3 py-2"
                      placeholder="Full name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs ui-muted">Mobile</label>
                    <input
                      value={newUser.mobile}
                      onChange={(e) => setNewUser((p) => ({ ...p, mobile: e.target.value }))}
                      className="ui-input w-full px-3 py-2"
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <label className="block text-xs ui-muted">Password (new user)</label>
                    <input
                      type="password"
                      value={newUser.password}
                      onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                      className="ui-input w-full px-3 py-2"
                      placeholder="Min 8 chars"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs ui-muted">Role</label>
                    <select
                      value={newUser.roleId}
                      onChange={(e) => setNewUser((p) => ({ ...p, roleId: e.target.value }))}
                      className="ui-select w-full px-3 py-2 ui-surface"
                    >
                      <option value="">Select role</option>
                      {roleOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={createUser}
                    className={`px-4 py-2 rounded-lg ${loading ? 'ui-sunken ui-subtle' : 'ui-btn ui-btn-primary '}`}
                  >
                    Add User
                  </button>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b ui-sunken text-sm font-semibold">User List</div>
                <div className="max-h-64 overflow-auto">
                  <table className="ui-table w-full">
                    <thead className="ui-sunken border-b">
                      <tr>
                        <th className="ui-th">Name</th>
                        <th className="ui-th">Email</th>
                        <th className="ui-th">Role</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {loading ? (
                        <tr><td colSpan={3} className="px-4 py-6 text-sm ui-muted">Loading...</td></tr>
                      ) : users.length === 0 ? (
                        <tr><td colSpan={3} className="px-4 py-6 text-sm ui-muted">No users found.</td></tr>
                      ) : (
                        users.map((u) => {
                          const active = String(u.userId) === String(selectedUserId);
                          return (
                            <tr
                              key={String(u.userId)}
                              className={`cursor-pointer ${active ? 'bg-stone-100' : 'ui-hover-sunken'}`}
                              onClick={() => setSelectedUserId(String(u.userId))}
                            >
                              <td className="ui-col-entity px-4 py-3 font-medium ui-fg">{u.name || '-'}</td>
                              <td className="ui-col-entity px-4 py-3 ui-fg">{u.email || '-'}</td>
                              <td className="ui-col-meta px-4 py-3 ui-fg">{u.roleLabel || u.roleKey || '-'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border rounded-xl p-4">
                <div className="text-sm font-semibold">Edit Selected User</div>
                {!selectedUser ? (
                  <div className="text-sm ui-muted mt-2">Select a user from the list to edit.</div>
                ) : (
                  <div className="space-y-3 mt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs ui-muted">Email</label>
                        <input value={selectedUser.email || ''} disabled className="ui-input w-full px-3 py-2 ui-sunken" />
                      </div>
                      <div>
                        <label className="block text-xs ui-muted">Role</label>
                        <select
                          value={userEdit.roleId}
                          onChange={(e) => setUserEdit((p) => ({ ...p, roleId: e.target.value }))}
                          className="ui-select w-full px-3 py-2 ui-surface"
                        >
                          <option value="">Select role</option>
                          {roleOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                        <div className="mt-2 flex justify-end">
                          <button type="button" onClick={saveUserRole} className="px-3 py-2 rounded-lg ui-surface border ui-hover-sunken">
                            Save Role
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs ui-muted">Name</label>
                        <input
                          value={userEdit.name}
                          onChange={(e) => setUserEdit((p) => ({ ...p, name: e.target.value }))}
                          className="ui-input w-full px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block text-xs ui-muted">Mobile</label>
                        <input
                          value={userEdit.mobile}
                          onChange={(e) => setUserEdit((p) => ({ ...p, mobile: e.target.value }))}
                          className="ui-input w-full px-3 py-2"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={saveUserBasics} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">
                        Save User
                      </button>
                      <button type="button" onClick={removeUser} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">
                        Remove
                      </button>
                    </div>

                    <div className="border rounded-lg p-3">
                      <div className="text-sm font-semibold">Branches</div>
                      {branches.length === 0 ? (
                        <div className="text-sm ui-muted mt-2">No branches found.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          {branches.map((b) => {
                            const checked = userEdit.branchIds.includes(b.id);
                            return (
                              <label key={b.id} className="flex items-center gap-2 text-sm ui-fg">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(userEdit.branchIds);
                                    if (e.target.checked) next.add(b.id);
                                    else next.delete(b.id);
                                    setUserEdit((p) => ({ ...p, branchIds: Array.from(next) }));
                                  }}
                                  className="ui-checkbox"
                                />
                                <span>{b.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-3 flex justify-end">
                        <button type="button" onClick={saveUserBranches} className="px-3 py-2 rounded-lg ui-surface border ui-hover-sunken">
                          Save Branches
                        </button>
                      </div>
                    </div>

                    <div className="border rounded-lg p-3">
                      <div className="text-sm font-semibold">Warehouses</div>
                      {warehouses.length === 0 ? (
                        <div className="text-sm ui-muted mt-2">No warehouses found.</div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          {warehouses.map((w) => {
                            const checked = userEdit.warehouseIds.includes(w.id);
                            return (
                              <label key={w.id} className="flex items-center gap-2 text-sm ui-fg">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(userEdit.warehouseIds);
                                    if (e.target.checked) next.add(w.id);
                                    else next.delete(w.id);
                                    setUserEdit((p) => ({ ...p, warehouseIds: Array.from(next) }));
                                  }}
                                  className="ui-checkbox"
                                />
                                <span>{w.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-3 flex justify-end">
                        <button type="button" onClick={saveUserWarehouses} className="px-3 py-2 rounded-lg ui-surface border ui-hover-sunken">
                          Save Warehouses
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Roles column */}
          <div className="ui-surface border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b ui-sunken">
              <div className="font-bold">Roles</div>
              <div className="text-xs ui-muted">Create roles and assign permissions (matrix)</div>
            </div>

            <div className="p-5 space-y-4">
              <div className="border rounded-xl p-4">
                <div className="text-sm font-semibold">Create Role</div>
                <div className="grid grid-cols-1 gap-3 mt-3">
                  <div>
                    <label className="block text-xs ui-muted">Role Name</label>
                    <input
                      value={newRole.label}
                      onChange={(e) => setNewRole((p) => ({ ...p, label: e.target.value }))}
                      className="ui-input w-full px-3 py-2"
                      placeholder="e.g. Sales Executive"
                    />
                  </div>
                  <div>
                    <label className="block text-xs ui-muted">Permissions</label>
                    <input
                      value={permSearch}
                      onChange={(e) => setPermSearch(e.target.value)}
                      className="ui-input w-full px-3 py-2"
                      placeholder="Search permissions"
                    />
                    <div className="mt-2 max-h-48 overflow-auto border rounded-lg p-2 ui-surface">
                      {filteredPerms.length === 0 ? (
                        <div className="text-sm ui-muted px-2 py-2">No permissions match.</div>
                      ) : (
                        <div className="space-y-1">
                          {filteredPerms.map((p) => {
                            const key = String(p?.key || '').trim();
                            if (!key) return null;
                            const checked = newRole.permissions.includes(key);
                            return (
                              <label key={key} className="flex items-start gap-2 text-sm ui-fg px-2 py-1 ui-hover-sunken rounded-lg">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const next = new Set(newRole.permissions);
                                    if (next.has(key)) next.delete(key);
                                    else next.add(key);
                                    setNewRole((prev) => ({ ...prev, permissions: Array.from(next) }));
                                  }}
                                  className="ui-checkbox mt-0.5"
                                />
                                <div>
                                  <div className="font-medium">{p.label || key}</div>
                                  <div className="text-xs ui-muted">{key}</div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    disabled={loading}
                    onClick={createRole}
                    className={`px-4 py-2 rounded-lg ${loading ? 'ui-sunken ui-subtle' : 'ui-btn ui-btn-primary '}`}
                  >
                    Create Role
                  </button>
                </div>
              </div>

              <div className="border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b ui-sunken text-sm font-semibold">Role List</div>
                <div className="max-h-56 overflow-auto">
                  <table className="ui-table w-full">
                    <thead className="ui-sunken border-b">
                      <tr>
                        <th className="ui-th">Role</th>
                        <th className="ui-th">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {roles.length === 0 ? (
                        <tr><td colSpan={2} className="px-4 py-6 text-sm ui-muted">No roles found.</td></tr>
                      ) : (
                        roles.map((r) => {
                          const active = String(r.id) === String(selectedRoleId);
                          return (
                            <tr
                              key={String(r.id)}
                              className={`cursor-pointer ${active ? 'bg-stone-100' : 'ui-hover-sunken'}`}
                              onClick={() => setSelectedRoleId(String(r.id))}
                            >
                              <td className="ui-col-meta px-4 py-3 font-medium ui-fg">{r.label}</td>
                              <td className="ui-col-meta px-4 py-3 ui-fg">{r.isSystem ? 'System' : 'Custom'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="border rounded-xl p-4">
                <div className="text-sm font-semibold">Edit Selected Role</div>
                {!selectedRole ? (
                  <div className="text-sm ui-muted mt-2">Select a role from the list to edit.</div>
                ) : selectedRole.isSystem ? (
                  <div className="text-sm ui-muted mt-2">System roles cannot be edited here.</div>
                ) : (
                  <div className="space-y-3 mt-3">
                    <div>
                      <label className="block text-xs ui-muted">Role Name</label>
                      <input
                        value={roleEdit.label}
                        onChange={(e) => setRoleEdit((p) => ({ ...p, label: e.target.value }))}
                        className="ui-input w-full px-3 py-2"
                      />
                    </div>

                    <div>
                      <label className="block text-xs ui-muted">Permissions</label>
                      <div className="mt-2 max-h-56 overflow-auto border rounded-lg p-2 ui-surface">
                        {filteredPerms.length === 0 ? (
                          <div className="text-sm ui-muted px-2 py-2">No permissions match.</div>
                        ) : (
                          <div className="space-y-1">
                            {filteredPerms.map((p) => {
                              const key = String(p?.key || '').trim();
                              if (!key) return null;
                              const checked = roleEdit.permissions.includes(key);
                              return (
                                <label key={key} className="flex items-start gap-2 text-sm ui-fg px-2 py-1 ui-hover-sunken rounded-lg">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => {
                                      const next = new Set(roleEdit.permissions);
                                      if (next.has(key)) next.delete(key);
                                      else next.add(key);
                                      setRoleEdit((prev) => ({ ...prev, permissions: Array.from(next) }));
                                    }}
                                    className="ui-checkbox mt-0.5"
                                  />
                                  <div>
                                    <div className="font-medium">{p.label || key}</div>
                                    <div className="text-xs ui-muted">{key}</div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={saveRole} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">
                        Save Role
                      </button>
                      <button type="button" onClick={deleteRole} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        )}

        {activeSection === 'roles' && (
        <div className="ui-surface border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b ui-sunken">
            <div className="font-bold">Roles</div>
            <div className="text-xs ui-muted">Create and manage roles with permissions</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="border rounded-xl p-4">
              <div className="text-sm font-semibold">Create Role</div>
              <div className="grid grid-cols-1 gap-3 mt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs ui-muted">Role Name</label>
                    <input
                      value={newRole.label}
                      onChange={(e) => setNewRole((p) => ({ ...p, label: e.target.value }))}
                      className="ui-input w-full px-3 py-2"
                      placeholder="e.g. Sales Executive"
                    />
                  </div>
                  <div>
                    <label className="block text-xs ui-muted">Description</label>
                    <input
                      value={newRole.description}
                      onChange={(e) => setNewRole((p) => ({ ...p, description: e.target.value }))}
                      className="ui-input w-full px-3 py-2"
                      placeholder="Optional description"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs ui-muted">Permissions</label>
                  <input
                    value={permSearch}
                    onChange={(e) => setPermSearch(e.target.value)}
                    className="ui-input w-full px-3 py-2"
                    placeholder="Search permissions"
                  />
                  <div className="mt-2 max-h-40 overflow-auto border rounded-lg p-2 ui-surface">
                    {filteredPerms.length === 0 ? (
                      <div className="text-sm ui-muted px-2 py-2">No permissions match.</div>
                    ) : (
                      <div className="space-y-1">
                        {filteredPerms.map((p) => {
                          const key = String(p?.key || '').trim();
                          if (!key) return null;
                          const checked = newRole.permissions.includes(key);
                          return (
                            <label key={key} className="flex items-start gap-2 text-sm ui-fg px-2 py-1 ui-hover-sunken rounded-lg">
                              <input type="checkbox" checked={checked} onChange={() => {
                                const next = new Set(newRole.permissions);
                                if (next.has(key)) next.delete(key); else next.add(key);
                                setNewRole((prev) => ({ ...prev, permissions: Array.from(next) }));
                              }} className="ui-checkbox mt-0.5" />
                              <div>
                                <div className="font-medium">{p.label || key}</div>
                                <div className="text-xs ui-muted">{key}</div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" disabled={loading} onClick={createRole} className={`px-4 py-2 rounded-lg ${loading ? 'ui-sunken ui-subtle' : 'ui-btn ui-btn-primary '}`}>
                  Create Role
                </button>
              </div>
            </div>
            <div className="border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b ui-sunken text-sm font-semibold">Role List</div>
              <div className="max-h-56 overflow-auto">
                <table className="ui-table w-full">
                  <thead className="ui-sunken border-b">
                    <tr>
                      <th className="ui-th">Role</th>
                      <th className="ui-th">Description</th>
                      <th className="ui-th">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {roles.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-6 text-sm ui-muted">No roles found.</td></tr>
                    ) : (
                      roles.map((r) => {
                        const active = String(r.id) === String(selectedRoleId);
                        return (
                          <tr key={String(r.id)} className={`cursor-pointer ${active ? 'bg-stone-100' : 'ui-hover-sunken'}`} onClick={() => setSelectedRoleId(String(r.id))}>
                            <td className="ui-col-meta px-4 py-3 font-medium ui-fg">{r.label}</td>
                            <td className="ui-col-meta px-4 py-3 ui-muted">{r.description || '-'}</td>
                            <td className="ui-col-meta px-4 py-3 ui-fg">{r.isSystem ? 'System' : 'Custom'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {selectedRole && !selectedRole.isSystem && (
            <div className="border rounded-xl p-4">
              <div className="text-sm font-semibold">Edit Role: {selectedRole.label}</div>
              <div className="space-y-3 mt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs ui-muted">Role Name</label>
                    <input value={roleEdit.label} onChange={(e) => setRoleEdit((p) => ({ ...p, label: e.target.value }))} className="ui-input w-full px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-xs ui-muted">Description</label>
                    <input value={roleEdit.description} onChange={(e) => setRoleEdit((p) => ({ ...p, description: e.target.value }))} className="ui-input w-full px-3 py-2" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs ui-muted">Permissions</label>
                  <div className="mt-2 max-h-48 overflow-auto border rounded-lg p-2 ui-surface">
                    {filteredPerms.map((p) => {
                      const key = String(p?.key || '').trim();
                      if (!key) return null;
                      const checked = roleEdit.permissions.includes(key);
                      return (
                        <label key={key} className="flex items-start gap-2 text-sm ui-fg px-2 py-1 ui-hover-sunken rounded-lg">
                          <input type="checkbox" checked={checked} onChange={() => {
                            const next = new Set(roleEdit.permissions);
                            if (next.has(key)) next.delete(key); else next.add(key);
                            setRoleEdit((prev) => ({ ...prev, permissions: Array.from(next) }));
                          }} className="ui-checkbox mt-0.5" />
                          <div>
                            <div className="font-medium">{p.label || key}</div>
                            <div className="text-xs ui-muted">{key}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={saveRole} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">Save Role</button>
                  <button type="button" onClick={deleteRole} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">Delete</button>
                </div>
              </div>
            </div>
            )}
          </div>
        </div>
        )}

        {activeSection === 'branches' && (
        <div className="ui-surface border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b ui-sunken">
            <div className="font-bold">Branches</div>
            <div className="text-xs ui-muted">Create and manage company branches</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="border rounded-xl p-4">
              <div className="text-sm font-semibold">Create Branch</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs ui-muted">Branch Name *</label>
                  <input value={newBranch.name} onChange={(e) => setNewBranch((p) => ({ ...p, name: e.target.value }))} className="ui-input w-full px-3 py-2" placeholder="Main Branch" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Code</label>
                  <input value={newBranch.code} onChange={(e) => setNewBranch((p) => ({ ...p, code: e.target.value }))} className="ui-input w-full px-3 py-2" placeholder="MAIN" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Address</label>
                  <input value={newBranch.address} onChange={(e) => setNewBranch((p) => ({ ...p, address: e.target.value }))} className="ui-input w-full px-3 py-2" placeholder="123 Street..." />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" disabled={loading} onClick={createBranch} className={`px-4 py-2 rounded-lg ${loading ? 'ui-sunken ui-subtle' : 'ui-btn ui-btn-primary '}`}>
                  Create Branch
                </button>
              </div>
            </div>
            <div className="border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b ui-sunken text-sm font-semibold">Branch List</div>
              <div className="max-h-64 overflow-auto">
                <table className="ui-table w-full">
                  <thead className="ui-sunken border-b">
                    <tr>
                      <th className="ui-th">Name</th>
                      <th className="ui-th">Code</th>
                      <th className="ui-th">Address</th>
                      <th className="ui-th">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {branches.length === 0 ? (
                      <tr><td colSpan={4} className="px-4 py-6 text-sm ui-muted">No branches found.</td></tr>
                    ) : (
                      branches.map((b) => {
                        const active = String(b.id) === String(selectedBranchId);
                        return (
                          <tr key={String(b.id)} className={`cursor-pointer ${active ? 'bg-stone-100' : 'ui-hover-sunken'}`} onClick={() => setSelectedBranchId(String(b.id))}>
                            <td className="ui-col-entity px-4 py-3 font-medium ui-fg">{b.name}</td>
                            <td className="ui-col-meta px-4 py-3 ui-fg">{b.code || '-'}</td>
                            <td className="ui-col-meta px-4 py-3 ui-muted">{b.address || '-'}</td>
                            <td className="ui-col-meta px-4 py-3">{b.isActive !== false ? <span className="text-[rgb(var(--pos))]">Active</span> : <span className="text-[rgb(var(--neg))]">Inactive</span>}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {selectedBranch && (
            <div className="border rounded-xl p-4">
              <div className="text-sm font-semibold">Edit Branch: {selectedBranch.name}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block text-xs ui-muted">Branch Name *</label>
                  <input value={branchEdit.name} onChange={(e) => setBranchEdit((p) => ({ ...p, name: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Code</label>
                  <input value={branchEdit.code} onChange={(e) => setBranchEdit((p) => ({ ...p, code: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Address</label>
                  <input value={branchEdit.address} onChange={(e) => setBranchEdit((p) => ({ ...p, address: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Status</label>
                  <select value={branchEdit.isActive ? 'active' : 'inactive'} onChange={(e) => setBranchEdit((p) => ({ ...p, isActive: e.target.value === 'active' }))} className="ui-select w-full px-3 py-2 ui-surface">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={saveBranch} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">Save Branch</button>
                <button type="button" onClick={deleteBranch} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">Delete</button>
              </div>
            </div>
            )}
          </div>
        </div>
        )}

        {activeSection === 'warehouses' && (
        <div className="ui-surface border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b ui-sunken">
            <div className="font-bold">Warehouses</div>
            <div className="text-xs ui-muted">Create and manage warehouses (can be linked to branches)</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="border rounded-xl p-4 ui-surface">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">Active Warehouse (request header)</div>
                  <div className="text-xs ui-muted">
                    {activeWarehouse ? `${activeWarehouse.name} (ID ${activeWarehouse.id})` : 'Not set; requests will omit x-warehouse-id.'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!selectedWarehouse) {
                        notify.error('Select a warehouse from the list first.');
                        return;
                      }
                      setActiveWarehouse(selectedWarehouse.id);
                    }}
                    className="px-3 py-2 rounded-lg ui-btn ui-btn-primary "
                  >
                    Use selected
                  </button>
                  {activeWarehouseId ? (
                    <button
                      type="button"
                      onClick={() => setActiveWarehouse('')}
                      className="px-3 py-2 rounded-lg border ui-surface ui-hover-sunken"
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="border rounded-xl p-4">
              <div className="text-sm font-semibold">Create Warehouse</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs ui-muted">Warehouse Name *</label>
                  <input value={newWarehouse.name} onChange={(e) => setNewWarehouse((p) => ({ ...p, name: e.target.value }))} className="ui-input w-full px-3 py-2" placeholder="Main Warehouse" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Code</label>
                  <input value={newWarehouse.code} onChange={(e) => setNewWarehouse((p) => ({ ...p, code: e.target.value }))} className="ui-input w-full px-3 py-2" placeholder="WH-001" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Location</label>
                  <input value={newWarehouse.location} onChange={(e) => setNewWarehouse((p) => ({ ...p, location: e.target.value }))} className="ui-input w-full px-3 py-2" placeholder="City, Zone..." />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Address</label>
                  <input value={newWarehouse.address} onChange={(e) => setNewWarehouse((p) => ({ ...p, address: e.target.value }))} className="ui-input w-full px-3 py-2" placeholder="123 Street..." />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Branch (optional)</label>
                  <select value={newWarehouse.branchId} onChange={(e) => setNewWarehouse((p) => ({ ...p, branchId: e.target.value }))} className="ui-select w-full px-3 py-2 ui-surface">
                    <option value="">No branch</option>
                    {branchOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button type="button" disabled={loading} onClick={createWarehouse} className={`px-4 py-2 rounded-lg ${loading ? 'ui-sunken ui-subtle' : 'ui-btn ui-btn-primary '}`}>
                  Create Warehouse
                </button>
              </div>
            </div>
            <div className="border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b ui-sunken text-sm font-semibold">Warehouse List</div>
              <div className="max-h-64 overflow-auto">
                <table className="ui-table w-full">
                  <thead className="ui-sunken border-b">
                    <tr>
                      <th className="ui-th">Name</th>
                      <th className="ui-th">Code</th>
                      <th className="ui-th">Location</th>
                      <th className="ui-th">Branch</th>
                      <th className="ui-th">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {warehouses.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-6 text-sm ui-muted">No warehouses found.</td></tr>
                    ) : (
                      warehouses.map((w) => {
                        const active = String(w.id) === String(selectedWarehouseId);
                        return (
                          <tr key={String(w.id)} className={`cursor-pointer ${active ? 'bg-stone-100' : 'ui-hover-sunken'}`} onClick={() => setSelectedWarehouseId(String(w.id))}>
                            <td className="ui-col-entity px-4 py-3 font-medium ui-fg">{w.name}</td>
                            <td className="ui-col-meta px-4 py-3 ui-fg">{w.code || '-'}</td>
                            <td className="ui-col-meta px-4 py-3 ui-muted">{w.location || '-'}</td>
                            <td className="ui-col-meta px-4 py-3 ui-muted">{w.branchName || '-'}</td>
                            <td className="ui-col-meta px-4 py-3">{w.isActive !== false ? <span className="text-[rgb(var(--pos))]">Active</span> : <span className="text-[rgb(var(--neg))]">Inactive</span>}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {selectedWarehouse && (
            <div className="border rounded-xl p-4">
              <div className="text-sm font-semibold">Edit Warehouse: {selectedWarehouse.name}</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block text-xs ui-muted">Warehouse Name *</label>
                  <input value={warehouseEdit.name} onChange={(e) => setWarehouseEdit((p) => ({ ...p, name: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Code</label>
                  <input value={warehouseEdit.code} onChange={(e) => setWarehouseEdit((p) => ({ ...p, code: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Location</label>
                  <input value={warehouseEdit.location} onChange={(e) => setWarehouseEdit((p) => ({ ...p, location: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Address</label>
                  <input value={warehouseEdit.address} onChange={(e) => setWarehouseEdit((p) => ({ ...p, address: e.target.value }))} className="ui-input w-full px-3 py-2" />
                </div>
                <div>
                  <label className="block text-xs ui-muted">Branch</label>
                  <select value={warehouseEdit.branchId} onChange={(e) => setWarehouseEdit((p) => ({ ...p, branchId: e.target.value }))} className="ui-select w-full px-3 py-2 ui-surface">
                    <option value="">No branch</option>
                    {branchOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs ui-muted">Status</label>
                  <select value={warehouseEdit.isActive ? 'active' : 'inactive'} onChange={(e) => setWarehouseEdit((p) => ({ ...p, isActive: e.target.value === 'active' }))} className="ui-select w-full px-3 py-2 ui-surface">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" onClick={saveWarehouse} className="px-4 py-2 rounded-lg ui-btn ui-btn-primary ">Save Warehouse</button>
                <button type="button" onClick={deleteWarehouse} className="px-4 py-2 rounded-lg border ui-surface ui-hover-sunken">Delete</button>
              </div>
            </div>
            )}
          </div>
        </div>
        )}
      </div>
    );
  };

  return (
    <div className="ui-surface border rounded-xl overflow-hidden">
      <div className="flex">
        {showSidebar ? (
          <div className="w-64 border-r ui-surface p-4">
            <div className="space-y-1">
              {[{ key: 'company', title: 'Company' }, { key: 'tax', title: 'Tax & Compliances' }].map((s) => {
                const isActive = s.key === activeTab;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setActiveTab(s.key)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${ isActive ? 'bg-stone-100 border-stone-300 ui-fg' : 'ui-surface border-transparent ui-fg ui-hover-sunken'
                    }`}
                  >
                    <div className="text-sm font-semibold">{s.title}</div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex-1 p-6">
          {activeTab === 'company' ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="ui-t-sec">Company</div>
                  <div className="text-sm ui-muted">Basic, contact and registered address</div>
                </div>
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveCompanySettings}
                  className={`px-4 py-2 rounded-lg ${saving ? 'ui-sunken ui-subtle' : 'ui-btn ui-btn-primary '}`}
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>

              <div className="space-y-6 max-w-4xl">
                <div className="border rounded-xl p-5 shadow-sm ui-surface">
                  <div className="flex items-baseline justify-between gap-4 mb-4">
                    <div>
                      <div className="text-sm font-semibold ui-fg">Basic details</div>
                      <div className="text-xs ui-muted">Business identity and accounting defaults</div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs ui-muted">Legal Company Name</label>
                      <input value={form.legalName} onChange={(e) => updateForm({ legalName: e.target.value })} className="ui-input w-full px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-xs ui-muted">Display / Trade Name</label>
                      <input value={form.tradeName} onChange={(e) => updateForm({ tradeName: e.target.value })} className="ui-input w-full px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-xs ui-muted">Business Type / Entity Type</label>
                      <select value={form.entityType} onChange={(e) => updateForm({ entityType: e.target.value })} className="ui-select w-full px-3 py-2 ui-surface">
                        {COMPANY_ENTITY_TYPES.map((x) => (
                          <option key={x} value={x}>{x}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs ui-muted">Industry</label>
                      <div className="mt-2 border rounded-lg p-3 ui-surface">
                        <div className="space-y-2">
                          {INDUSTRY_OPTIONS.map((x) => {
                            const checked = Array.isArray(form.industries) && form.industries.includes(x);
                            return (
                              <label key={x} className="flex items-center gap-2 text-sm ui-fg">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = new Set(Array.isArray(form.industries) ? form.industries : []);
                                    if (e.target.checked) next.add(x);
                                    else next.delete(x);
                                    updateForm({ industries: Array.from(next) });
                                  }}
                                  className="ui-checkbox"
                                />
                                <span>{x}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                      <div className="text-xs ui-muted mt-1">Select one or more</div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs ui-muted">Incorporation Date</label>
                        <input type="date" value={form.incorporationDate} onChange={(e) => updateForm({ incorporationDate: e.target.value })} className="ui-input w-full px-3 py-2" />
                      </div>
                      <div>
                        <label className="block text-xs ui-muted">Financial Year Start</label>
                        <input type="date" value={form.financialYearStart} onChange={(e) => updateForm({ financialYearStart: e.target.value })} className="ui-input w-full px-3 py-2" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs ui-muted">Books Begin Date</label>
                        <input type="date" value={form.booksBeginDate} onChange={(e) => updateForm({ booksBeginDate: e.target.value })} className="ui-input w-full px-3 py-2" />
                      </div>
                      <div>
                        <label className="block text-xs ui-muted">Base Currency</label>
                        <select value={form.baseCurrency} onChange={(e) => updateForm({ baseCurrency: e.target.value })} className="ui-select w-full px-3 py-2 ui-surface">
                          {CURRENCY_OPTIONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs ui-muted">Country</label>
                        <select value={form.country} onChange={(e) => updateForm({ country: e.target.value })} className="ui-select w-full px-3 py-2 ui-surface">
                          {COUNTRY_OPTIONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs ui-muted">Time Zone</label>
                        <select value={form.timeZone} onChange={(e) => updateForm({ timeZone: e.target.value })} className="ui-select w-full px-3 py-2 ui-surface">
                          {TZ_OPTIONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="border rounded-xl p-5 shadow-sm ui-surface">
                  <div className="mb-4">
                    <div className="text-sm font-semibold ui-fg">Contact details</div>
                    <div className="text-xs ui-muted">Where customers and vendors can reach you</div>
                  </div>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs ui-muted">Official Email</label>
                        <input value={form.officialEmail} onChange={(e) => updateForm({ officialEmail: e.target.value })} className="ui-input w-full px-3 py-2" />
                      </div>
                      <div>
                        <label className="block text-xs ui-muted">Phone Number</label>
                        <input value={form.phone} onChange={(e) => updateForm({ phone: e.target.value })} className="ui-input w-full px-3 py-2" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs ui-muted">Website</label>
                      <input value={form.website} onChange={(e) => updateForm({ website: e.target.value })} className="ui-input w-full px-3 py-2" />
                    </div>
                  </div>
                </div>

                <div className="border rounded-xl p-5 shadow-sm ui-surface">
                  <div className="mb-4">
                    <div className="text-sm font-semibold ui-fg">Registered Address (Mandatory)</div>
                    <div className="text-xs ui-muted">Used for GST state mapping and statutory documents</div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs ui-muted">Address Line 1</label>
                      <input value={form.regAddress1} onChange={(e) => updateForm({ regAddress1: e.target.value })} className="ui-input w-full px-3 py-2" />
                    </div>
                    <div>
                      <label className="block text-xs ui-muted">Address Line 2</label>
                      <input value={form.regAddress2} onChange={(e) => updateForm({ regAddress2: e.target.value })} className="ui-input w-full px-3 py-2" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs ui-muted">City</label>
                        <input value={form.regCity} onChange={(e) => updateForm({ regCity: e.target.value })} className="ui-input w-full px-3 py-2" />
                      </div>
                      <div>
                        <label className="block text-xs ui-muted">State / UT</label>
                        <select value={form.regStateCode} onChange={(e) => updateForm({ regStateCode: e.target.value })} className="ui-select w-full px-3 py-2 ui-surface">
                          <option value="">Select</option>
                          {Object.keys(GST_STATE_BY_CODE || {}).sort().map((code) => (
                            <option key={code} value={code}>{GST_STATE_BY_CODE[code]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs ui-muted">Pincode</label>
                        <input value={form.regPincode} onChange={(e) => updateForm({ regPincode: e.target.value })} className="ui-input w-full px-3 py-2" />
                      </div>
                      <div>
                        <label className="block text-xs ui-muted">Country</label>
                        <select value={form.regCountry} onChange={(e) => updateForm({ regCountry: e.target.value })} className="ui-select w-full px-3 py-2 ui-surface">
                          {COUNTRY_OPTIONS.map((x) => (
                            <option key={x} value={x}>{x}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="text-xs ui-muted">State code is stored internally for GST mappings.</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <TaxCompliancesView db={db} setDb={setDb} currentCompany={currentCompany} />
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * Month picker + download for the portal-schema JSON. Lives beside the report
 * heading; the JSON is what the GST offline tool / portal imports.
 */
const GstrExportControl = ({ label, onExport }) => {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // yyyy-mm
  return (
    <div className="flex items-center gap-2">
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="ui-input !h-9 !min-h-0 w-auto text-sm"
        aria-label="Return period"
      />
      <button
        type="button"
        onClick={() => {
          const period = `${month.slice(5, 7)}${month.slice(0, 4)}`; // MMYYYY
          onExport(period);
        }}
        className="ui-btn ui-btn-primary"
      >
        <Download size={15} aria-hidden="true" /> {label}
      </button>
    </div>
  );
};

const Gstr1Report = ({ db, currentCompany }) => {
  const invoices = db.invoices.filter((i) => i.companyId === currentCompany.id);
  const creditNotes = db.creditNotes.filter((c) => c.companyId === currentCompany.id);

  const normalizeLine = (line, isIntra) => {
    const gstRate = Number(line.gstRate ?? 0);
    const taxableAmount = Number.isFinite(Number(line.taxableAmount))
      ? Number(line.taxableAmount)
      : Number.isFinite(Number(line.amount))
        ? Number(line.amount)
        : Number(line.quantity ?? 0) * Number(line.rate ?? 0);

    const hasSplit =
      Number.isFinite(Number(line.cgstAmount)) ||
      Number.isFinite(Number(line.sgstAmount)) ||
      Number.isFinite(Number(line.igstAmount)) ||
      Number.isFinite(Number(line.gstAmount));

    if (hasSplit) {
      return {
        gstRate,
        taxableAmount: round2(taxableAmount),
        cgstAmount: round2(Number(line.cgstAmount ?? 0)),
        sgstAmount: round2(Number(line.sgstAmount ?? 0)),
        igstAmount: round2(Number(line.igstAmount ?? 0)),
        gstAmount: round2(Number(line.gstAmount ?? 0)),
      };
    }

    const computed = computeGstForLine({
      quantity: Number(line.quantity ?? 1),
      rate: Number(line.rate ?? 0),
      gstRate,
      isIntra,
    });

    return {
      gstRate,
      taxableAmount: computed.taxableAmount,
      cgstAmount: computed.cgstAmount,
      sgstAmount: computed.sgstAmount,
      igstAmount: computed.igstAmount,
      gstAmount: computed.gstAmount,
    };
  };

  const addDocToSummary = (doc, sign, groups, totals) => {
    const isIntra = doc.taxType ? doc.taxType === 'CGST_SGST' : true;
    const lines = Array.isArray(doc.items) ? doc.items : [];

    lines.forEach((line) => {
      const nl = normalizeLine(line, isIntra);
      const gstRate = Number.isFinite(nl.gstRate) ? nl.gstRate : 0;
      const key = `${isIntra ? 'CGST_SGST' : 'IGST'}|${gstRate}`;

      const entry = groups.get(key) || {
        taxType: isIntra ? 'CGST/SGST' : 'IGST',
        gstRate,
        taxableAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        gstAmount: 0,
      };

      entry.taxableAmount = round2(entry.taxableAmount + sign * nl.taxableAmount);
      entry.cgstAmount = round2(entry.cgstAmount + sign * nl.cgstAmount);
      entry.sgstAmount = round2(entry.sgstAmount + sign * nl.sgstAmount);
      entry.igstAmount = round2(entry.igstAmount + sign * nl.igstAmount);
      entry.gstAmount = round2(entry.gstAmount + sign * nl.gstAmount);
      groups.set(key, entry);
    });

    totals.taxableAmount = round2(totals.taxableAmount + sign * Number(doc.subtotal ?? 0));
    totals.cgstAmount = round2(totals.cgstAmount + sign * Number(doc.cgstTotal ?? 0));
    totals.sgstAmount = round2(totals.sgstAmount + sign * Number(doc.sgstTotal ?? 0));
    totals.igstAmount = round2(totals.igstAmount + sign * Number(doc.igstTotal ?? 0));
    totals.gstAmount = round2(totals.gstAmount + sign * Number(doc.gstTotal ?? 0));
    totals.totalAmount = round2(totals.totalAmount + sign * Number(doc.total ?? 0));
  };

  const rateGroups = new Map();
  const totals = { taxableAmount: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, gstAmount: 0, totalAmount: 0 };

  invoices.forEach((inv) => addDocToSummary(inv, +1, rateGroups, totals));
  creditNotes.forEach((cn) => addDocToSummary(cn, -1, rateGroups, totals));

  const rateRows = Array.from(rateGroups.values()).sort((a, b) => {
    if (a.taxType !== b.taxType) return a.taxType.localeCompare(b.taxType);
    return a.gstRate - b.gstRate;
  });

  const docRows = [
    ...invoices.map((inv) => ({
      type: 'Invoice',
      number: inv.number,
      date: inv.date,
      partyName: inv.customerName,
      partyGstin: inv.customerGstin || '',
      placeOfSupply: inv.placeOfSupplyState || '',
      taxable: Number(inv.subtotal ?? 0),
      cgst: Number(inv.cgstTotal ?? 0),
      sgst: Number(inv.sgstTotal ?? 0),
      igst: Number(inv.igstTotal ?? 0),
      total: Number(inv.total ?? 0),
    })),
    ...creditNotes.map((cn) => ({
      type: 'Credit Note',
      number: cn.number,
      date: cn.date,
      partyName: cn.customerName,
      partyGstin: cn.customerGstin || '',
      placeOfSupply: cn.placeOfSupplyState || '',
      taxable: -Number(cn.subtotal ?? 0),
      cgst: -Number(cn.cgstTotal ?? 0),
      sgst: -Number(cn.sgstTotal ?? 0),
      igst: -Number(cn.igstTotal ?? 0),
      total: -Number(cn.total ?? 0),
    })),
  ].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">GST - GSTR-1 (Summary)</h3>
        <GstrExportControl
          label="Portal JSON"
          onExport={(period) => {
            if (!String(currentCompany?.gstin || '').trim()) {
              notify.error('Set the company GSTIN in Company Profile before exporting a return.');
              return;
            }
            const json = buildGstr1Json({ invoices, creditNotes, items: db.items || [], company: currentCompany, period });
            downloadJson(`GSTR1_${currentCompany.gstin}_${period}.json`, json);
            notify.success(`GSTR-1 JSON for ${period} downloaded.`);
          }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="ui-surface rounded-xl shadow-sm p-5 border">
          <div className="text-sm ui-muted">Taxable Value (Net)</div>
          <div className="ui-money-lg">{formatMoney(totals.taxableAmount, currentCompany)}</div>
        </div>
        <div className="ui-surface rounded-xl shadow-sm p-5 border">
          <div className="text-sm ui-muted">GST (Net)</div>
          <div className="ui-money-lg">{formatMoney(totals.gstAmount, currentCompany)}</div>
          <div className="text-xs ui-muted mt-1">
            CGST {formatMoney(totals.cgstAmount, currentCompany)} · SGST {formatMoney(totals.sgstAmount, currentCompany)} · IGST {formatMoney(totals.igstAmount, currentCompany)}
          </div>
        </div>
        <div className="ui-surface rounded-xl shadow-sm p-5 border">
          <div className="text-sm ui-muted">Total (Net)</div>
          <div className="ui-money-lg">{formatMoney(totals.totalAmount, currentCompany)}</div>
        </div>
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border ui-border-c">
        <div className="px-6 py-4 border-b ui-sunken">
          <h4 className="font-bold">Rate-wise Summary</h4>
        </div>
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="ui-th">Tax Type</th>
              <th className="ui-th ui-num">GST %</th>
              <th className="ui-th ui-num">Taxable</th>
              <th className="ui-th ui-num">CGST</th>
              <th className="ui-th ui-num">SGST</th>
              <th className="ui-th ui-num">IGST</th>
              <th className="ui-th ui-num">GST</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {rateRows.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-10 text-center ui-muted">
                  No GST transactions yet.
                </td>
              </tr>
            ) : (
              rateRows.map((r) => (
                <tr key={`${r.taxType}-${r.gstRate}`} className="ui-hover-sunken">
                  <td className="px-4 py-2.5 ui-col-meta">{r.taxType}</td>
                  <td className="ui-col-meta px-4 py-2.5 text-right">{Number(r.gstRate || 0).toFixed(2)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(r.taxableAmount || 0), currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(r.cgstAmount || 0), currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(r.sgstAmount || 0), currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(r.igstAmount || 0), currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{formatMoney(Number(r.gstAmount || 0), currentCompany)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="ui-surface rounded-xl shadow-sm overflow-hidden border ui-border-c">
        <div className="px-6 py-4 border-b ui-sunken">
          <h4 className="font-bold">Document Summary (Invoices & Credit Notes)</h4>
        </div>
        <table className="ui-table w-full">
          <thead className="ui-sunken border-b">
            <tr>
              <th className="ui-th">Type</th>
              <th className="ui-th">Number</th>
              <th className="ui-th">Date</th>
              <th className="ui-th">Party</th>
              <th className="ui-th">GSTIN</th>
              <th className="ui-th">POS</th>
              <th className="ui-th ui-num">Taxable</th>
              <th className="ui-th ui-num">CGST</th>
              <th className="ui-th ui-num">SGST</th>
              <th className="ui-th ui-num">IGST</th>
              <th className="ui-th ui-num">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--border))]">
            {docRows.length === 0 ? (
              <tr>
                <td colSpan="11" className="px-6 py-10 text-center ui-muted">
                  No invoices or credit notes found.
                </td>
              </tr>
            ) : (
              docRows.map((r, idx) => (
                <tr key={`${r.type}-${r.number}-${idx}`} className="ui-hover-sunken">
                  <td className="px-4 py-2.5 ui-col-meta">{r.type}</td>
                  <td className="px-4 py-2.5 ui-col-entity">{r.number}</td>
                  <td className="px-4 py-2.5 ui-col-meta">{r.date}</td>
                  <td className="px-4 py-2.5 ui-col-meta">{r.partyName}</td>
                  <td className="px-4 py-2.5 ui-col-meta">{r.partyGstin}</td>
                  <td className="px-4 py-2.5 ui-col-meta">{r.placeOfSupply}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(r.taxable || 0), currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(r.cgst || 0), currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(r.sgst || 0), currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right">{formatMoney(Number(r.igst || 0), currentCompany)}</td>
                  <td className="ui-col-amount px-4 py-2.5 text-right font-semibold">{formatMoney(Number(r.total || 0), currentCompany)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Gstr3bReport = ({ db, currentCompany }) => {
  const invoices = db.invoices.filter((i) => i.companyId === currentCompany.id);
  const creditNotes = db.creditNotes.filter((c) => c.companyId === currentCompany.id);
  const bills = db.bills.filter((b) => b.companyId === currentCompany.id);
  const expenses = db.expenses.filter((e) => e.companyId === currentCompany.id);

  const sumDocs = (docs, sign) => {
    return docs.reduce(
      (acc, d) => {
        acc.taxable += sign * Number(d.subtotal ?? d.taxableTotal ?? 0);
        acc.cgst += sign * Number(d.cgstTotal ?? 0);
        acc.sgst += sign * Number(d.sgstTotal ?? 0);
        acc.igst += sign * Number(d.igstTotal ?? 0);
        acc.gst += sign * Number(d.gstTotal ?? 0);
        return acc;
      },
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0 }
    );
  };

  const outward = sumDocs(invoices, +1);
  const outwardCredit = sumDocs(creditNotes, -1);
  const outwardNet = {
    taxable: round2(outward.taxable + outwardCredit.taxable),
    cgst: round2(outward.cgst + outwardCredit.cgst),
    sgst: round2(outward.sgst + outwardCredit.sgst),
    igst: round2(outward.igst + outwardCredit.igst),
    gst: round2(outward.gst + outwardCredit.gst),
  };

  const inwardBills = sumDocs(bills, +1);
  const inwardExpenses = sumDocs(expenses, +1);
  const inwardItc = {
    taxable: round2(inwardBills.taxable + inwardExpenses.taxable),
    cgst: round2(inwardBills.cgst + inwardExpenses.cgst),
    sgst: round2(inwardBills.sgst + inwardExpenses.sgst),
    igst: round2(inwardBills.igst + inwardExpenses.igst),
    gst: round2(inwardBills.gst + inwardExpenses.gst),
  };

  const netPayable = {
    cgst: round2(outwardNet.cgst - inwardItc.cgst),
    sgst: round2(outwardNet.sgst - inwardItc.sgst),
    igst: round2(outwardNet.igst - inwardItc.igst),
    gst: round2(outwardNet.gst - inwardItc.gst),
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="ui-t-sec">GST - GSTR-3B (Summary)</h3>
        <GstrExportControl
          label="Portal JSON"
          onExport={(period) => {
            if (!String(currentCompany?.gstin || '').trim()) {
              notify.error('Set the company GSTIN in Company Profile before exporting a return.');
              return;
            }
            const json = buildGstr3bJson({
              invoices: db.invoices.filter((i) => i.companyId === currentCompany.id),
              creditNotes: db.creditNotes.filter((c) => c.companyId === currentCompany.id),
              bills: db.bills.filter((b) => b.companyId === currentCompany.id),
              expenses: db.expenses.filter((e) => e.companyId === currentCompany.id),
              debitNotes: db.debitNotes.filter((d) => d.companyId === currentCompany.id),
              company: currentCompany,
              period,
            });
            downloadJson(`GSTR3B_${currentCompany.gstin}_${period}.json`, json);
            notify.success(`GSTR-3B JSON for ${period} downloaded.`);
          }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="ui-surface rounded-xl shadow-sm p-5 border">
          <div className="text-sm ui-muted">Outward Supplies (Net)</div>
          <div className="ui-money-lg">{formatMoney(outwardNet.gst, currentCompany)}</div>
          <div className="text-xs ui-muted mt-1">
            Taxable {formatMoney(outwardNet.taxable, currentCompany)} · CGST {formatMoney(outwardNet.cgst, currentCompany)} · SGST {formatMoney(outwardNet.sgst, currentCompany)} · IGST {formatMoney(outwardNet.igst, currentCompany)}
          </div>
        </div>

        <div className="ui-surface rounded-xl shadow-sm p-5 border">
          <div className="text-sm ui-muted">ITC (Bills + Expenses)</div>
          <div className="ui-money-lg">{formatMoney(inwardItc.gst, currentCompany)}</div>
          <div className="text-xs ui-muted mt-1">
            Taxable {formatMoney(inwardItc.taxable, currentCompany)} · CGST {formatMoney(inwardItc.cgst, currentCompany)} · SGST {formatMoney(inwardItc.sgst, currentCompany)} · IGST {formatMoney(inwardItc.igst, currentCompany)}
          </div>
        </div>

        <div className="ui-surface rounded-xl shadow-sm p-5 border">
          <div className="text-sm ui-muted">Net Tax Payable (Proxy)</div>
          <div className="ui-money-lg">{formatMoney(netPayable.gst, currentCompany)}</div>
          <div className="text-xs ui-muted mt-1">
            CGST {formatMoney(netPayable.cgst, currentCompany)} · SGST {formatMoney(netPayable.sgst, currentCompany)} · IGST {formatMoney(netPayable.igst, currentCompany)}
          </div>
        </div>
      </div>

      <div className="ui-surface rounded-xl shadow-sm p-6 border">
        <h4 className="font-bold mb-3">What this report uses</h4>
        <div className="text-sm ui-muted space-y-1">
          <div>Outward: Invoices minus Credit Notes (based on saved GST totals).</div>
          <div>ITC: Bills and Expenses (based on saved GST totals).</div>
        </div>
      </div>
    </div>
  );
};

const AppShell = () => {
  const { can, loading: permsLoading } = usePermissions();
  const { isEnabled } = useFeatures();
  const { theme, toggle: toggleTheme } = useTheme();
  const { density, set: setDensity } = useDensity();
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(localStorage.getItem('token')));
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  /**
   * Where to draw the account menu.
   *
   * It has to leave the rail entirely. <main> runs a fade animation, and an
   * animation creates a stacking context — so a menu painted inside the
   * sidebar, at any z-index, still ends up underneath the page content. It was
   * being sliced down the middle by the content panel.
   *
   * Rendered to <body> at fixed coordinates measured off the trigger, opening
   * upward because downward from the foot of the rail is off the screen.
   */


  /**
   * How tall the rail can be.
   *
   * The account block is pinned to the foot of the rail, so the rail has to
   * reach the foot of the window — otherwise it ends wherever the icon list
   * ends and the avatar floats in the middle of the screen with nothing under
   * it.
   *
   * The height cannot be written as CSS arithmetic because the rail's top edge
   * moves: the unconfirmed-email banner sits above it and goes away once the
   * address is confirmed. So it is measured, and re-measured when the window
   * resizes or the banner comes and goes.
   */
  /*
   * The rail's height is CSS, not measurement.
   *
   * It used to read its own getBoundingClientRect().top every 800ms and set
   * its height from that. The rail is position: sticky, so its top moves as
   * the page scrolls — which changed the height, which moved the top, four
   * times a second, forever. The rail crept up the screen on its own with
   * nobody touching anything.
   *
   * The sticky offset is a constant (4.5rem) and so is the gap under it, so
   * the height is a constant too: one calc, no polling, no feedback loop.
   */
  const getDbStorageKey = () => {
    const token = String(localStorage.getItem('token') || '').trim();
    const authed = Boolean(token);
    const accountId = authed ? (String(localStorage.getItem('accountId') || 'unknown').trim() || 'unknown') : 'guest';
    const orgId = authed
      ? (String(localStorage.getItem('activeOrgId') || localStorage.getItem('orgId') || 'unknown').trim() || 'unknown')
      : 'default';
    return `accountingDB:${accountId}:${orgId}`;
  };

  /**
   * True when the stored book could not be read. While set, nothing is written
   * back — see the persist effect below.
   */
  const dbLoadFailedRef = useRef(false);

  /**
   * Reading the book must never be able to destroy it.
   *
   * This used to be a try/catch whose catch returned a normalised *empty*
   * book. So any throw inside normalizeDB — a bad migration, one malformed
   * record, a bug introduced in a release — silently replaced the company's
   * books with nothing, and the effect below immediately wrote that nothing
   * over the only copy. The failure that should have been "we cannot read
   * this" became "this no longer exists", with no warning and nothing to
   * recover from.
   *
   * It is not hypothetical: a scoping mistake of mine threw here and wiped a
   * test company's customers, items and receipts in exactly this way.
   *
   * Now a failure keeps the data instead. The raw text is copied aside, the
   * un-normalised book is handed back so the user can still see and export
   * what they have, and persistence is switched off so the damaged read
   * cannot overwrite the good record.
   */
  const loadDbFromStorage = useCallback(() => {
    const storageKey = getDbStorageKey();
    const token = String(localStorage.getItem('token') || '').trim();
    const authed = Boolean(token);

    let raw = null;
    try {
      raw = localStorage.getItem(storageKey);
    } catch {
      raw = null;
    }

    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    try {
      const loaded = normalizeDB(parsed || (authed ? initEmptyDB() : initDB()));
      dbLoadFailedRef.current = false;
      return loaded;
    } catch (err) {
      // Nothing stored yet: starting empty is correct, not data loss.
      if (!parsed) {
        dbLoadFailedRef.current = false;
        try {
          return normalizeDB(authed ? initEmptyDB() : initDB());
        } catch {
          return authed ? initEmptyDB() : initDB();
        }
      }

      // There is a real book and we could not process it. Preserve it.
      dbLoadFailedRef.current = true;
      try {
        if (raw && !localStorage.getItem(`${storageKey}:recovery`)) {
          localStorage.setItem(`${storageKey}:recovery`, raw);
        }
      } catch {
        /* storage may be full; the original is still untouched */
      }
      console.error('normalizeDB failed; keeping the stored book and disabling saves.', err);
      notify.error('Your books could not be fully loaded, so saving is switched off to protect them. Reload, and tell support if this repeats.');
      return parsed;
    }
  }, []);

  const [dbStorageKey, setDbStorageKey] = useState(() => getDbStorageKey());
  const [db, _setDb] = useState(() => {
    return loadDbFromStorage();
  });

  const setDb = useCallback(
    (nextOrUpdater) => {
      _setDb((prev) => {
        const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(prev) : nextOrUpdater;
        return normalizeDB(next);
      });
    },
    [_setDb]
  );

  useEffect(() => {
    setDb((prev) => normalizeDB(prev));
  }, []);

  useEffect(() => {
    // Refuse to write a book we could not read. Overwriting here is what turns
    // a read failure into permanent data loss.
    if (dbLoadFailedRef.current) return;
    const nextKey = getDbStorageKey();
    setDbStorageKey(nextKey);
    localStorage.setItem(nextKey, JSON.stringify(db));
  }, [db]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const nextKey = getDbStorageKey();
    if (nextKey === dbStorageKey) return;
    setDbStorageKey(nextKey);
    _setDb(loadDbFromStorage());
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const orgId = String(localStorage.getItem('activeOrgId') || '').trim();
    if (!orgId) return;

    setDb((prev) => {
      const companies = Array.isArray(prev?.companies) ? prev.companies : [];
      const first = companies?.[0] || null;
      const companyId = Number(first?.id || 0);

      const existingMigrations = first?.docSettings?.migrations || {};
      if (existingMigrations.dummySeedV1Applied) return prev;

      // If tenant DB has no local company row yet (normal login path), create one.
      if (!companyId) {
        const nowIso = new Date().toISOString();
        const baseDoc = getDefaultDocSettings();
        const nextCompany = {
          id: 1,
          name: 'Company',
          address: '',
          city: '',
          state: '',
          country: 'India',
          taxId: '',
          gstRegistration: 'Unregistered',
          gstin: '',
          currency: 'INR',
          fiscalYearStart: '01-01',
          docSettings: {
            ...baseDoc,
            migrations: {
              ...(baseDoc.migrations || {}),
              disableDemoSeed: true,
            },
          },
          createdAt: nowIso,
        };

        // The company row is all a fresh tenant needs. It used to arrive with
        // seventy-five invented customers, vendors and items and a year of
        // invented transactions, which made the product impossible to evaluate
        // against real books — every list, total and chart was fiction.
        return { ...prev, companies: [nextCompany] };
      }

      return prev;
    });
  }, [isAuthenticated, dbStorageKey, setDb]);


  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const onDown = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) setAccountMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setAccountMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountMenuOpen]);


  // A 401 from any API call means the session is over; drop back to sign-in
  // instead of rendering a shell with no permissions.
  useEffect(() => {
    const onExpired = () => setIsAuthenticated(false);
    window.addEventListener('auth:session-expired', onExpired);
    return () => window.removeEventListener('auth:session-expired', onExpired);
  }, []);

  const logout = async () => {
    // Tell the server first: without this the refresh token stays valid and
    // "sign out" only clears this browser.
    try {
      const refreshToken = String(localStorage.getItem('refreshToken') || '').trim();
      if (refreshToken) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
      }
    } catch {
      // A failed call must not trap the user in a signed-in shell.
    }
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
  };

  // The Companies page can switch which company the whole product operates
  // on; first-in-list remains the fallback so existing single-company data
  // behaves exactly as before.
  const currentCompany =
    (db.companies || []).find((c) => c.id === db.activeCompanyId) ||
    (db.companies || [])[0] ||
    { id: 1, name: 'Accounting', currency: 'INR' };

  // Fresh browser, existing books: pull server documents into the local db.
  useServerDocSync({ enabled: isAuthenticated, currentCompanyId: currentCompany?.id, setDb });

  const [onboardDismissed, setOnboardDismissed] = useState(false);
  // Latch it. shouldOnboard asks whether there are no customers and no
  // invoices, and step two of the wizard creates a customer — so recomputing
  // this every render made the wizard close itself the moment somebody
  // completed a step, before the third step ("raise the first invoice", the
  // whole point of it) had ever been on screen. It also meant finish() never
  // ran, so the seen-it flag was never written and the wizard came back on the
  // next load. Whether to open is a question about the moment of arrival; once
  // open, only the user closes it.
  const [onboardLatched, setOnboardLatched] = useState(false);
  const onboardEligible = isAuthenticated && shouldOnboard(db, currentCompany);
  if (onboardEligible && !onboardLatched && !onboardDismissed) setOnboardLatched(true);
  const showOnboarding = isAuthenticated && !onboardDismissed && onboardLatched;

  // Templates marked "repeat monthly" raise their due drafts on sign-in.
  useRecurringInvoices({
    enabled: isAuthenticated && isEnabled('recurringInvoices'),
    db,
    setDb,
    currentCompanyId: currentCompany?.id,
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    const existing = String(localStorage.getItem('activeBranchId') || '').trim();
    if (existing) return;
    const fallback = currentCompany?.profile?.backendBranchId;
    if (fallback) {
      localStorage.setItem('activeBranchId', String(fallback));
      localStorage.setItem('branchId', String(fallback));
      return;
    }

    // Some login flows don't provide backendBranchId but the backend still requires x-branch-id.
    // As a fallback, reuse the first selected dashboard branch (if any) so we can load branches/warehouses.
    try {
      const raw = String(localStorage.getItem('dashboardBranchIds') || '').trim();
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const first = Array.isArray(parsed) ? normalizeId(parsed[0]) : '';
      if (!first) return;
      localStorage.setItem('activeBranchId', String(first));
      localStorage.setItem('branchId', String(first));
    } catch {
      // ignore
    }
  }, [isAuthenticated, currentCompany?.profile?.backendBranchId]);

  const [activeWarehouseId, setActiveWarehouseId] = useState(() => String(localStorage.getItem('activeWarehouseId') || ''));
  const [activeBranchId, setActiveBranchId] = useState(() => String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || ''));
  const [warehouses, setWarehouses] = useState([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const [warehousesError, setWarehousesError] = useState('');

  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchesError, setBranchesError] = useState('');
  const [branchesReloadKey, setBranchesReloadKey] = useState(0);

  const [authCtx, setAuthCtx] = useState({ loading: false, error: '', data: null });

  const activeOrgId = String(localStorage.getItem('activeOrgId') || '').trim();
  const [warehousesReloadKey, setWarehousesReloadKey] = useState(0);
  const reloadWarehouses = useCallback(() => setWarehousesReloadKey((x) => x + 1), []);

  // Load allowed branches for the logged-in user (active org). Intentionally skips x-branch-id.
  useEffect(() => {
    if (!isAuthenticated) return;
    const orgId = String(localStorage.getItem('activeOrgId') || '').trim();
    if (!orgId) return;

    let cancelled = false;
    const load = async () => {
      setAuthCtx({ loading: true, error: '', data: null });
      try {
        const data = await getMyAuthContext();
        if (cancelled) return;
        setAuthCtx({ loading: false, error: '', data });
      } catch (e) {
        if (cancelled) return;
        setAuthCtx({ loading: false, error: String(e?.message || e), data: null });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, activeOrgId]);

  /*
   * Identity for the chrome. `/auth/me` is already fetched once per session
   * for permissions, so the name and picture come from there rather than a
   * second request — and they update the moment the profile page saves,
   * because that response is written back into the same context.
   *
   * localStorage is the fallback for the first paint, before /auth/me lands.
   *
   * Declared here rather than beside the header that renders it: the `screen`
   * memo hands these to the dashboard, and a const read above its declaration
   * is not a warning, it is a blank page.
   */
  const meUser = authCtx?.data?.user || {};
  const userEmail = String(meUser.email || localStorage.getItem('userEmail') || '').trim() || 'User';
  const userDisplayName =
    [meUser.firstName, meUser.lastName].filter(Boolean).join(' ').trim() || String(meUser.fullName || '').trim();
  const userAvatarUrl = meUser.avatarUrl || '';
  const userInitials = (() => {
    const src = userDisplayName || userEmail;
    const parts = String(src).trim().split(/[\s._@-]+/).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  })();

  const isOrgAdmin = Boolean(authCtx?.data?.isOrgAdmin);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const orgMenuRef = useRef(null);

  useEffect(() => {
    if (!orgMenuOpen) return;
    const onMouseDown = (e) => {
      if (!orgMenuRef.current) return;
      if (orgMenuRef.current.contains(e.target)) return;
      setOrgMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [orgMenuOpen]);


  const availableOrgs = useMemo(() => {
    const list = authCtx?.data?.orgs;
    return Array.isArray(list) ? list : [];
  }, [authCtx?.data]);

  const activeOrgName = useMemo(() => {
    const match = availableOrgs.find((o) => String(o.orgId) === String(activeOrgId));
    return match?.org?.name || currentCompany?.name || 'Accounting';
  }, [availableOrgs, activeOrgId, currentCompany?.name]);

  /**
   * Switching company changes the tenant for every subsequent request. The
   * branch belongs to the old org, so it is cleared and re-resolved, and the
   * page is reloaded so no cached list survives the switch.
   */
  const switchOrg = useCallback((nextOrgId) => {
    const target = String(nextOrgId || '').trim();
    if (!target || target === String(localStorage.getItem('activeOrgId') || '')) {
      setOrgMenuOpen(false);
      return;
    }
    try {
      localStorage.setItem('activeOrgId', target);
      localStorage.removeItem('activeBranchId');
      localStorage.removeItem('branchId');
      localStorage.removeItem('activeWarehouseId');
    } catch {
      // ignore
    }
    window.location.reload();
  }, []);
  const allowedBranchIds = useMemo(() => {
    const ids = authCtx?.data?.allowedBranchIds;
    return Array.isArray(ids) ? ids.map((x) => String(x)) : [];
  }, [authCtx?.data]);

  // Branch/warehouse authority comes from the server (/auth/me) only. Never from
  // a locally-stored identity, which the user controls.
  const hasBranchRestriction = useMemo(() => !isOrgAdmin, [isOrgAdmin]);

  const allowedBranchIdSet = useMemo(() => new Set(allowedBranchIds.map((x) => String(x))), [allowedBranchIds]);

  const branchesForUser = useMemo(() => {
    if (!hasBranchRestriction) return branches;
    return (Array.isArray(branches) ? branches : []).filter((b) => allowedBranchIdSet.has(String(b?.id)));
  }, [branches, hasBranchRestriction, allowedBranchIdSet]);

  const warehousesForUser = useMemo(() => {
    if (!hasBranchRestriction) return warehouses;
    return (Array.isArray(warehouses) ? warehouses : []).filter((w) => allowedBranchIdSet.has(String(w?.branchId)));
  }, [warehouses, hasBranchRestriction, allowedBranchIdSet]);

  const allowedWarehouseIdSet = useMemo(() => {
    return new Set((Array.isArray(warehousesForUser) ? warehousesForUser : []).map((w) => String(w?.id)));
  }, [warehousesForUser]);

  // Ensure active branch is within allowed branches (non-admin users).
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!hasBranchRestriction) return;
    // authCtx starts as { loading: false, data: null }, so "not loading" is not
    // the same as "answered". Acting before /auth/me returns would clear the
    // active branch on every page load, because allowedBranchIds is still empty.
    if (authCtx.loading || !authCtx.data) return;

    const existing = String(localStorage.getItem('activeBranchId') || '').trim();
    if (existing && allowedBranchIdSet.has(existing)) return;

    const firstAllowed = allowedBranchIds.length ? String(allowedBranchIds[0]) : '';
    if (!firstAllowed) {
      localStorage.removeItem('activeBranchId');
      localStorage.removeItem('branchId');
      return;
    }
    localStorage.setItem('activeBranchId', firstAllowed);
    localStorage.setItem('branchId', firstAllowed);
    if (typeof reloadWarehouses === 'function') reloadWarehouses();
  }, [isAuthenticated, hasBranchRestriction, authCtx.loading, allowedBranchIds, allowedBranchIdSet, reloadWarehouses]);

  // Filter local DB vouchers/transfers by allowed warehouses/branches for non-admin users.
  const dbForUser = useMemo(() => {
    const activeWh = String(activeWarehouseId || '').trim();
    const activeBr = String(activeBranchId || '').trim();
    const scoped = Boolean(activeWh) || Boolean(activeBr);
    if (!hasBranchRestriction && !scoped) return db;

    // Where the user says they are standing, from the header. Picking a
    // warehouse means every list is that warehouse's work; "All warehouses" is
    // the company-wide view. A document filed before warehouses existed has no
    // warehouse of its own, so it only shows in the company-wide view.
    const warehouseBranch = new Map(
      (Array.isArray(warehouses) ? warehouses : []).map((w) => [String(w?.id), String(w?.branchId || '')])
    );
    const inActiveScope = (row) => {
      if (!scoped) return true;
      const whId = String(row?.warehouseId || '').trim();
      const brId = String(row?.branchId || '').trim() || warehouseBranch.get(whId) || '';
      // Older records were filed before the app asked where they belonged.
      // Hiding them everywhere would lose them, so they stay visible.
      if (!whId && !brId) return true;
      if (activeWh) return whId ? whId === activeWh : brId === (warehouseBranch.get(activeWh) || '');
      return brId === activeBr;
    };
    const transferInActiveScope = (t) => {
      if (!scoped) return true;
      if (activeWh) {
        return (
          String(t?.sourceWarehouseId || '').trim() === activeWh ||
          String(t?.targetWarehouseId || '').trim() === activeWh
        );
      }
      return (
        String(t?.sourceBranchId || '').trim() === activeBr || String(t?.targetBranchId || '').trim() === activeBr
      );
    };

    const filterByWarehouse = (rows) => {
      const list = Array.isArray(rows) ? rows : [];
      return list.filter((r) => {
        if (Number(r?.companyId) !== Number(currentCompany?.id)) return true;
        if (!inActiveScope(r)) return false;
        if (!hasBranchRestriction) return true;
        const whId = String(r?.warehouseId || '').trim();
        if (!whId) return false;
        return allowedWarehouseIdSet.has(whId);
      });
    };

    // A transfer belongs to both ends of it: the branch that sends it and the
    // branch that has to approve it. Filtering on the sender alone would hide
    // an inbound consignment from the only people who can receive it.
    const filterTransfers = (rows) => {
      const list = Array.isArray(rows) ? rows : [];
      return list.filter((t) => {
        if (Number(t?.companyId) !== Number(currentCompany?.id)) return true;
        if (!transferInActiveScope(t)) return false;
        if (!hasBranchRestriction) return true;
        const sourceBranchId = String(t?.sourceBranchId || '').trim();
        const targetBranchId = String(t?.targetBranchId || '').trim();
        if (!sourceBranchId && !targetBranchId) return false;
        return (
          (sourceBranchId && allowedBranchIdSet.has(sourceBranchId)) ||
          (targetBranchId && allowedBranchIdSet.has(targetBranchId))
        );
      });
    };

    return {
      ...db,
      invoices: filterByWarehouse(db?.invoices),
      creditNotes: filterByWarehouse(db?.creditNotes),
      bills: filterByWarehouse(db?.bills),
      debitNotes: filterByWarehouse(db?.debitNotes),
      estimates: filterByWarehouse(db?.estimates),
      purchaseOrders: filterByWarehouse(db?.purchaseOrders),
      salesOrders: filterByWarehouse(db?.salesOrders),
      deliveryChallans: filterByWarehouse(db?.deliveryChallans),
      expenses: filterByWarehouse(db?.expenses),
      stockTransfers: filterTransfers(db?.stockTransfers),
    };
  }, [
    db,
    hasBranchRestriction,
    allowedWarehouseIdSet,
    allowedBranchIdSet,
    currentCompany?.id,
    activeWarehouseId,
    activeBranchId,
    warehouses,
  ]);

  const [active, setActive] = useState('dashboard');

  /**
   * A new screen starts at the top of itself.
   *
   * The window keeps its scroll offset across a view change, so opening a
   * screen from halfway down a long list dropped you into the middle of the
   * next one — past its heading, its filters and its primary action, with no
   * indication anything was above. It reads as a half-loaded page.
   *
   * Not smooth: this is not the user scrolling, it is a different screen, and
   * animating it would imply the two are one continuous surface.
   */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [active]);

  const [ledgerNav, setLedgerNav] = useState({ ledgerId: null, returnTo: 'trialBalance' });
  const openLedger = useCallback(
    (ledgerId) => {
      setLedgerNav({ ledgerId, returnTo: active });
      setActive('ledger');
    },
    [active]
  );
    const reportSections = useMemo(
      () => [
        {
          key: 'financials',
          title: 'Financials',
          items: [
            // Two reports that both said "Trial Balance" — you could not tell
            // from the hub which one you wanted. They are different things:
            // one walks each account's postings, the other lists closing
            // balances and must foot to zero. Named for what they are.
            { key: 'ledgerTrialBalance', label: 'General Ledger' },
            { key: 'trialBalance', label: 'Trial Balance' },
            { key: 'profitLoss', label: 'P&L' },
            { key: 'balanceSheet', label: 'Balance Sheet' },
            { key: 'cashFlow', label: 'Cash Flow' },
          ],
        },
        {
          key: 'gst',
          title: 'GST',
          items: [
            { key: 'gstr1', label: 'GSTR-1' },
            { key: 'gstr3b', label: 'GSTR-3B' },
            { key: 'gstr2bReco', label: 'GSTR-2B Reconciliation' },
          ],
        },
        {
          key: 'sales',
          title: 'Sales',
          items: [
            { key: 'salesReports', label: 'Sales Reports' },
            { key: 'salesBySalesman', label: 'Sales by Salesman' },
          ],
        },
        {
          key: 'accountant',
          title: 'Accountant',
          items: [
            { key: 'tallyExport', label: 'Tally Export' },
            { key: 'tdsTcs', label: 'TDS / TCS (194Q & 206C)' },
            { key: 'fixedAssets', label: 'Fixed Assets' },
            { key: 'yearEndClose', label: 'Year-End Close' },
            { key: 'costCenters', label: 'Cost Centers' },
          ],
        },
      ],
      []
    );

    const reportPageKeys = useMemo(() => {
      const keys = new Set();
      for (const sec of reportSections) {
        for (const it of sec.items || []) {
          keys.add(String(it.key));
        }
      }
      return keys;
    }, [reportSections]);

  const [modal, setModal] = useState({ content: null, title: 'Form', maxWidthClass: 'max-w-4xl' });
  const [invoiceEditor, setInvoiceEditor] = useState({ open: false, initial: null });
  const [estimateEditor, setEstimateEditor] = useState({ open: false, initial: null });
  const [receiptEditor, setReceiptEditor] = useState({ open: false });
  const [paymentEditor, setPaymentEditor] = useState({ open: false });
  const [billEditor, setBillEditor] = useState({ open: false, initial: null });
  const [poEditor, setPoEditor] = useState({ open: false, initial: null });
  const [debitNoteEditor, setDebitNoteEditor] = useState({ open: false, initialOriginalBillId: null });
  const [creditNoteEditor, setCreditNoteEditor] = useState({ open: false, initialOriginalInvoiceId: null });
  const [journalEditor, setJournalEditor] = useState({ open: false, initial: null });
  const [stockTransferEditor, setStockTransferEditor] = useState({ open: false, initial: null });

  useEffect(() => {
    if (active !== 'invoices') {
      setInvoiceEditor({ open: false, initial: null });
    }
  }, [active]);

  useEffect(() => {
    if (active !== 'estimates') {
      setEstimateEditor({ open: false, initial: null });
    }
  }, [active]);

  useEffect(() => {
    if (active !== 'bills') setBillEditor({ open: false, initial: null });
    if (active !== 'debitNotes') setDebitNoteEditor({ open: false, initialOriginalBillId: null });
    if (active !== 'creditNotes') setCreditNoteEditor({ open: false, initialOriginalInvoiceId: null });
    if (active !== 'receipts') setReceiptEditor({ open: false });
    if (active !== 'payments' && active !== 'paymentsExpense') setPaymentEditor({ open: false });
    if (active !== 'journalEntries') setJournalEditor({ open: false, initial: null });
    if (active !== 'warehouseTransfers' && active !== 'branchTransfers') setStockTransferEditor({ open: false, initial: null });
  }, [active]);

  // What each settings area would tell you if you opened it. Shown beside its
  // name in the rail, so "is email set up?" and "how many branches?" answer
  // themselves. Cheap to read, and it keeps a 15-item list from being opaque.
  const branchCountLabel = branches.length ? String(branches.length) : '';
  const warehouseCountLabel = warehouses.length ? String(warehouses.length) : '';
  const featureCountLabel = useMemo(() => {
    const flags = currentCompany?.profile?.features;
    if (!flags || typeof flags !== 'object') return '';
    const values = Object.values(flags);
    if (!values.length) return '';
    return `${values.filter(Boolean).length}/${values.length}`;
  }, [currentCompany?.profile?.features]);
  const gstStateLabel =
    (currentCompany?.profile?.taxCompliances?.gstEnabled ?? currentCompany?.gstEnabled ?? true) !== false ? 'GST on' : 'GST off';
  const emailStateLabel = currentCompany?.profile?.emailSettings?.fromAddress ? '' : 'Not set';

  const navModel = useMemo(
    () => [
      { type: 'item', key: 'dashboard', label: 'Dashboard', icon: PhDashboard, ph: true },
      {
        type: 'group',
        key: 'salesMenu',
        label: 'Sales',
        icon: PhSales,
        ph: true,
        items: [
          { key: 'sales', label: 'Overview', icon: BarChart3, perm: 'SALES::Invoices::VIEW' },
          { key: 'invoices', label: 'Invoices', icon: FileText, perm: 'SALES::Invoices::VIEW' },
          { key: 'pos', label: 'POS', icon: Receipt, perm: 'SALES::Invoices::CREATE', feature: 'pos' },
          { key: 'receipts', label: 'Receipts', icon: Receipt, perm: 'SALES::Receipts::VIEW', feature: 'standaloneReceiptsPayments' },
          { key: 'estimates', label: 'Estimates / Quotes', icon: ClipboardList, perm: 'SALES::Estimates::VIEW', feature: 'estimates' },
          { key: 'salesOrders', label: 'Sales Orders', icon: ClipboardList, perm: 'SALES::Invoices::VIEW', feature: 'salesOrders' },
          { key: 'deliveryChallans', label: 'Delivery Challans', icon: Truck, perm: 'SALES::Invoices::VIEW', feature: 'deliveryChallans' },
          { key: 'creditNotes', label: 'Sales Returns', icon: Receipt, perm: 'SALES::Credit Notes::VIEW', feature: 'creditNotes' },
          { key: 'recurringInvoices', label: 'Recurring', icon: RefreshCw, perm: 'SALES::Invoices::VIEW', feature: 'recurringInvoices' },
        ],
      },
      {
        // Chasing money and talking to customers is its own job, done by its
        // own people. It does not belong inside the invoicing menu.
        type: 'group',
        key: 'crmMenu',
        label: 'CRM',
        icon: Users,
        /*
         * The people, not just the chasing.
         *
         * This group held a single entry — Payment Reminders — while Customers,
         * Vendors and Salesmen sat under Master Data among items, units, tax
         * rates and document numbering. So a module named for dealing with
         * people contained no people, and the people were filed with the
         * catalogue and the configuration.
         *
         * Master Data keeps what the business sells and how documents behave.
         * Who the business deals with lives here, next to chasing them.
         */
        items: [
          { key: 'customers', label: 'Customers', icon: Users, perm: 'MASTERS::Customers::VIEW' },
          { key: 'vendors', label: 'Vendors', icon: Truck, perm: 'MASTERS::Vendors::VIEW' },
          { key: 'salesmen', label: 'Salesmen', icon: Users, perm: 'SALES::Invoices::VIEW', feature: 'salesmen' },
          { key: 'paymentReminders', label: 'Payment Reminders', icon: Bell, perm: 'SALES::Receipts::VIEW', feature: 'paymentReminders' },
        ],
      },
      {
        type: 'group',
        key: 'purchasesMenu',
        label: 'Purchases',
        icon: PhPurchases,
        ph: true,
        items: [
          { key: 'purchaseOverview', label: 'Overview', icon: BarChart3, perm: 'PURCHASE::Bills::VIEW' },
          { key: 'bills', label: 'Bills', icon: FileStack, perm: 'PURCHASE::Bills::VIEW' },
          { key: 'payments', label: 'Payments', icon: NotebookPen, perm: 'PURCHASE::Payments::VIEW', feature: 'standaloneReceiptsPayments' },
          { key: 'purchaseOrders', label: 'Purchase Orders', icon: ShoppingCart, perm: 'PURCHASE::Purchase Orders::VIEW', feature: 'purchaseOrders' },
          { key: 'debitNotes', label: 'Purchase Returns', icon: NotebookPen, perm: 'PURCHASE::Debit Notes::VIEW', feature: 'debitNotes' },
        ],
      },
      { type: 'item', key: 'cashBank', label: 'Cash & Bank', icon: PhBank, ph: true, perm: 'CASHBANK::Cash & Bank::VIEW' },
      // A group of one is a menu that opens onto itself. With the duplicate
      // Payments entry gone, Expenses is a destination, not a section.
      { type: 'item', key: 'expenses', label: 'Expenses', icon: PhExpenses, ph: true, perm: 'EXPENSES::Expenses::VIEW', feature: 'expenses' },
      {
        type: 'group',
        key: 'inventoryMenu',
        label: 'Inventory',
        icon: PhInventory,
        ph: true,
        items: [
          { key: 'inventory', label: 'Inventory', icon: Package, perm: 'INVENTORY::Stock Adjustment::VIEW', feature: 'inventory' },
          { key: 'warehouseTransfers', label: 'Warehouse Transfers', icon: Truck, perm: 'INVENTORY::Stock Transfer::VIEW', feature: 'stockTransfers' },
          { key: 'branchTransfers', label: 'Branch Transfers', icon: Truck, perm: 'INVENTORY::Inter-branch transfer::VIEW', feature: 'stockTransfers' },
          { key: 'batchSerial', label: 'Batches & Serials', icon: Boxes, perm: 'INVENTORY::Stock Adjustment::VIEW', feature: 'batchSerial' },
          { key: 'stockAdjustments', label: 'Stock Adjustments', icon: ClipboardList, perm: 'INVENTORY::Stock Adjustment::VIEW' },
          { key: 'batchStock', label: 'Batch Stock & Expiry', icon: Boxes, perm: 'INVENTORY::Stock Adjustment::VIEW', feature: 'batchExpiry' },
          { key: 'reorderAlerts', label: 'Reorder Alerts', icon: Package, perm: 'INVENTORY::Stock Adjustment::VIEW', feature: 'reorderAlerts' },
        ],
      },
      { type: 'item', key: 'journalEntries', label: 'Journal Entries', icon: PhJournal, ph: true, perm: 'ACCOUNTING::Journal Entries::VIEW' },
      { type: 'item', key: 'approvals', label: 'Approvals', icon: PhApprovals, ph: true, feature: 'approvals' },
      { type: 'item', key: 'reports', label: 'Reports', icon: PhReports, ph: true, permAny: ['REPORTS::Trial Balance::VIEW','REPORTS::Profit & Loss::VIEW','REPORTS::Balance Sheet::VIEW','REPORTS::Cash Flow::VIEW','REPORTS::Sales Reports::VIEW','REPORTS::GSTR-1::VIEW','REPORTS::GSTR-3B::VIEW'] },
      {
        type: 'group',
        key: 'mdmMenu',
        label: 'Master Data',
        icon: PhMaster,
        ph: true,
        items: [
          { key: 'companies', label: 'Company Profile', icon: Building2, perm: 'SETTINGS::Company Profile::VIEW', feature: 'companyGroups' },
          { key: 'items', label: 'Items', icon: Tags, perm: 'MASTERS::Items::VIEW' },
          { key: 'uoms', label: 'Units', icon: Boxes, perm: 'MASTERS::Items::VIEW' },
          { key: 'itemCategories', label: 'Item Categories', icon: Tags, perm: 'MASTERS::Items::VIEW' },
          { key: 'priceLists', label: 'Price Lists', icon: Tags, perm: 'MASTERS::Items::VIEW', feature: 'priceLists' },
          { key: 'bankCash', label: 'Chart of Accounts', icon: Building2, perm: 'ACCOUNTING::Chart of Accounts::VIEW' },
          { key: 'gstRates', label: 'GST Rates', icon: BadgePercent, perm: 'MASTERS::GST Rates::VIEW' },
          { key: 'invoiceTemplates', label: 'Invoice Templates', icon: FileText, perm: 'SETTINGS::Document Templates::VIEW' },
          { key: 'docNumbering', label: 'Numbering', icon: Settings, perm: 'SETTINGS::Document Numbering::VIEW' },
          { key: 'settingsTerms', label: 'Terms & Conditions', icon: FileText, perm: 'SETTINGS::Document Templates::VIEW' },
        ],
      },
            {
        type: 'group',
        key: 'settingsMenu',
        label: 'Settings',
        icon: PhSettings,
        ph: true,
        /*
         * Structured to the settings map, so the order and the section names
         * are the ones the business asked for rather than the order these
         * screens happened to get built in.
         *
         * Only screens that exist are listed. The map also calls for
         * Automation and Integrations, and for per-module preference panes
         * under Business — none of which are built. Listing them here as dead
         * links would make the product look finished and behave broken, so
         * they are tracked outside the rail until they do something.
         */
        items: [
          { type: 'subgroup', label: 'Organisation' },
          { key: 'settingsCompany', label: 'Company Profile', icon: Building2, perm: 'SETTINGS::Company Profile::VIEW' },
          { key: 'settingsBranches', label: 'Branches & Locations', icon: Building2, perm: 'MASTERS::Company/Branch setup::VIEW', feature: 'branches', state: branchCountLabel },
          { key: 'settingsWarehouses', label: 'Warehouses', icon: Package, perm: 'MASTERS::Company/Branch setup::VIEW', feature: 'warehouses', state: warehouseCountLabel },
          { key: 'yearEndClose', label: 'Financial Year', icon: Settings, perm: 'ACCOUNTING::Ledger::VIEW' },
          { key: 'settingsCurrencies', label: 'Currency', icon: Coins, perm: 'ACCOUNTING::Ledger::VIEW', feature: 'multiCurrency' },

          { type: 'subgroup', label: 'Business' },
          { key: 'settingsFeatures', label: 'General Preferences', icon: Settings, perm: 'SETTINGS::Company Profile::VIEW', state: featureCountLabel },
          { key: 'settingsSales', label: 'Sales', icon: FileText, perm: 'SETTINGS::Company Profile::VIEW' },
          { key: 'settingsPurchases', label: 'Purchases', icon: ShoppingCart, perm: 'SETTINGS::Company Profile::VIEW' },
          { key: 'settingsInventory', label: 'Inventory', icon: Package, perm: 'SETTINGS::Company Profile::VIEW' },
          { key: 'settingsAccounting', label: 'Accounting', icon: NotebookPen, perm: 'SETTINGS::Company Profile::VIEW' },
          { key: 'settingsPaymentsReceipts', label: 'Payments & Receipts', icon: Receipt, perm: 'SETTINGS::Company Profile::VIEW' },
          { key: 'settingsDocuments', label: 'Documents', icon: FileStack, perm: 'SETTINGS::Company Profile::VIEW' },
          { key: 'settingsInvoiceFields', label: 'Invoice Fields', icon: FileText, perm: 'SETTINGS::Company Profile::VIEW' },
          { key: 'discountRules', label: 'Discount Rules', icon: Tags, perm: 'SALES::Invoices::VIEW', feature: 'discountRules' },

          { type: 'subgroup', label: 'Tax & Compliance' },
          { key: 'settingsTax', label: 'GST', icon: BadgePercent, perm: 'SETTINGS::Tax Settings::VIEW', state: gstStateLabel },
          { key: 'gstRates', label: 'Tax Rates', icon: BadgePercent, perm: 'MASTERS::GST Rates::VIEW' },

          { type: 'subgroup', label: 'Users & Access' },
          { key: 'settingsUsers', label: 'Users', icon: Users, perm: 'SETTINGS::Users::VIEW' },
          { key: 'settingsRoles', label: 'Roles', icon: Shield, perm: 'SETTINGS::Roles::VIEW' },
          { key: 'settingsPermissions', label: 'Permissions', icon: Shield, perm: 'SETTINGS::Roles::VIEW' },
          { key: 'settingsGovernance', label: 'Approval Workflows', icon: Shield, perm: 'SETTINGS::Roles::VIEW' },
          { key: 'settingsSecurity', label: 'Login & Security', icon: Shield, perm: 'SETTINGS::Users::VIEW' },

          { type: 'subgroup', label: 'Communication' },
          { key: 'settingsEmail', label: 'Email', icon: NotebookPen, perm: 'SETTINGS::Company Profile::VIEW', feature: 'notifications', state: emailStateLabel },
          { key: 'paymentReminders', label: 'Payment Reminders', icon: Bell, perm: 'SALES::Receipts::VIEW', feature: 'paymentReminders' },

          { type: 'subgroup', label: 'Documents' },
          { key: 'invoiceTemplates', label: 'Invoice Templates', icon: FileText, perm: 'SETTINGS::Document Templates::VIEW' },
          { key: 'docNumbering', label: 'Numbering', icon: Settings, perm: 'SETTINGS::Document Numbering::VIEW' },

          { type: 'subgroup', label: 'Automation' },
          { key: 'recurringInvoices', label: 'Recurring Transactions', icon: RefreshCw, perm: 'SALES::Invoices::VIEW', feature: 'recurringInvoices' },

          { type: 'subgroup', label: 'System' },
          { key: 'dataImport', label: 'Data & Import', icon: Upload, perm: 'ACCOUNTING::Ledger::VIEW', feature: 'imports' },
        ],
      },
    ],
    [branchCountLabel, warehouseCountLabel, featureCountLabel, gstStateLabel, emailStateLabel]
  );

  // Hide anything the user cannot open. The server re-checks on every request;
  // this only stops the UI offering doors that are locked.
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

  /*
   * Alt+I / S / P / R / C / D and Ctrl+/ — the review sheet's global set.
   *
   * Each one lands the operator on the screen that owns the document and
   * opens its editor, rather than opening a floating form over whatever they
   * were looking at: the list behind a new invoice is part of how you check
   * you are not raising it twice.
   */
  useGlobalShortcuts({
    newInvoice: () => {
      setActive('invoices');
      setInvoiceEditor({ open: true, initial: null });
    },
    newSalesOrder: () => setActive('salesOrders'),
    newPayment: () => {
      setActive('payments');
      setPaymentEditor({ open: true });
    },
    newReceipt: () => {
      setActive('receipts');
      setReceiptEditor({ open: true, initial: null });
    },
    newCreditNote: () => {
      setActive('creditNotes');
      setCreditNoteEditor({ open: true, initialOriginalInvoiceId: null });
    },
    dashboard: () => setActive('dashboard'),
    openCommand: () => setPaletteOpen(true),
  });

  // --- shell trio: collapsed rail, quick create, notifications ---
  const [navCollapsed, setNavCollapsed] = useState(() => localStorage.getItem('navCollapsed') === '1');
  const toggleNavCollapsed = () =>
    setNavCollapsed((v) => {
      try { localStorage.setItem('navCollapsed', v ? '0' : '1'); } catch { /* best effort */ }
      return !v;
    });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const quickRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);
  const [notifSeenKey, setNotifSeenKey] = useState(() => localStorage.getItem('notifSeenKey') || '');
  // Pinned per mount so overdue bucketing is stable across renders.
  const [shellNowTs] = useState(() => Date.now());

  // The drawer closes itself on navigation — tapping a destination should
  // reveal the page, not leave a panel covering it.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [active]);
  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setMobileNavOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileNavOpen]);

  // Close the two header popovers on outside click, same contract as the
  // org and profile menus.
  useEffect(() => {
    if (!quickOpen && !notifOpen) return undefined;
    const onDown = (e) => {
      if (quickOpen && !quickRef.current?.contains(e.target)) setQuickOpen(false);
      if (notifOpen && !notifRef.current?.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [quickOpen, notifOpen]);

  /**
   * Notification feed computed from the books — never invented. Two event
   * classes today: receivables past due, and payables falling due this week.
   */
  const notifications = useMemo(() => {
    const out = [];
    const companyId = currentCompany?.id;
    if (!companyId) return out;
    const todayStr = new Date(shellNowTs).toISOString().slice(0, 10);
    const weekStr = new Date(shellNowTs + 7 * 86_400_000).toISOString().slice(0, 10);
    const numv = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

    const overdue = (Array.isArray(db?.invoices) ? db.invoices : []).filter((i) => {
      if (i.companyId !== companyId) return false;
      const st = String(i.status || '').toLowerCase();
      if (st === 'draft' || st === 'cancelled') return false;
      const due = numv(i.total) - numv(i.paidAmount);
      return due > 0.0001 && String(i.dueDate || '') && String(i.dueDate) < todayStr;
    });
    if (overdue.length) {
      const total = overdue.reduce((sum, i) => sum + numv(i.total) - numv(i.paidAmount), 0);
      out.push({
        id: 'overdue-invoices',
        tone: 'neg',
        title: `${overdue.length} invoice${overdue.length === 1 ? '' : 's'} overdue`,
        body: `${formatMoney(total, currentCompany)} past due date`,
        target: 'invoices',
      });
    }

    const payables = [
      ...(Array.isArray(db?.bills) ? db.bills : []),
      ...(Array.isArray(db?.expenses) ? db.expenses : []),
    ].filter((b) => {
      if (b.companyId !== companyId) return false;
      const st = String(b.status || '').toLowerCase();
      if (st === 'draft' || st === 'cancelled' || st === 'paid') return false;
      const due = numv(b.total) - numv(b.paidAmount);
      const d = String(b.dueDate || '');
      return due > 0.0001 && d && d >= todayStr && d <= weekStr;
    });
    if (payables.length) {
      const total = payables.reduce((sum, b) => sum + numv(b.total) - numv(b.paidAmount), 0);
      out.push({
        id: 'payables-week',
        tone: 'warn',
        title: `${payables.length} payable${payables.length === 1 ? '' : 's'} due this week`,
        body: `${formatMoney(total, currentCompany)} to schedule`,
        target: 'bills',
      });
    }

    return out;
  }, [db, currentCompany, shellNowTs]);

  const notifKey = notifications.map((n) => `${n.id}:${n.body}`).join('|');
  const notifUnseen = notifications.length > 0 && notifKey !== notifSeenKey;
  const markNotifsSeen = () => {
    setNotifSeenKey(notifKey);
    try { localStorage.setItem('notifSeenKey', notifKey); } catch { /* best effort */ }
  };

  const QUICK_CREATE = [
    { label: 'Invoice', run: () => { setActive('invoices'); setInvoiceEditor({ open: true, initial: null }); } },
    { label: 'Bill', run: () => { setActive('bills'); setBillEditor({ open: true, initial: null }); } },
    { label: 'Journal entry', run: () => { setActive('journalEntries'); setJournalEditor({ open: true, initial: null }); } },
    { label: 'Expense', run: () => setActive('expenses') },
    { label: 'Customer', run: () => setActive('customers') },
    { label: 'Vendor', run: () => setActive('vendors') },
  ];

  const visibleNav = useMemo(() => {
    if (permsLoading) return navModel;
    // Hidden when the user lacks the permission OR the org has the feature off.
    const allow = (entry) =>
      (!entry.perm || can(entry.perm)) &&
      (!entry.permAny || entry.permAny.some((k) => can(k))) &&
      isEnabled(entry.feature);
    return navModel
      .map((entry) => {
        if (entry.type !== 'group') return allow(entry) ? entry : null;
        const kept = entry.items.filter((i) => i.type === 'subgroup' || allow(i));
        // A heading whose every item was hidden by a permission or a feature
        // flag is a section that says nothing. Keep a heading only when a real
        // item follows it before the next heading — otherwise Settings grows
        // empty headings as modules are switched off.
        const items = kept.filter((item, idx) => {
          if (item.type !== 'subgroup') return true;
          for (let i = idx + 1; i < kept.length; i += 1) {
            if (kept[i].type === 'subgroup') break;
            return true;
          }
          return false;
        });
        return items.some((i) => i.type !== 'subgroup') ? { ...entry, items } : null;
      })
      .filter(Boolean);
  }, [navModel, can, permsLoading, isEnabled]);

  /**
   * Palette entries come from the already permission- and feature-filtered nav,
   * so the palette can never offer a destination the sidebar hides. One source,
   * two surfaces.
   */
  const paletteItems = useMemo(() => {
    const out = [];
    for (const entry of visibleNav) {
      if (entry.type === 'group') {
        for (const item of entry.items) {
          out.push({ key: item.key, label: item.label, group: entry.label, icon: item.icon });
        }
      } else {
        out.push({ key: entry.key, label: entry.label, group: 'Go to', icon: entry.icon });
      }
    }
    return out;
  }, [visibleNav]);

  /**
   * The same nav, read as a set of screens the user can actually reach. The
   * record index is built against this, so the palette cannot surface a
   * document whose screen the sidebar is hiding.
   */
  const reachableScreens = useMemo(() => {
    const keys = new Set();
    for (const entry of visibleNav) {
      if (entry.type === 'group') entry.items.forEach((i) => keys.add(i.key));
      else keys.add(entry.key);
    }
    return keys;
  }, [visibleNav]);

  const recordIndex = useMemo(
    () =>
      buildRecordIndex({
        db: dbForUser,
        companyId: currentCompany?.id,
        canOpen: (screen) => reachableScreens.has(screen),
      }),
    [dbForUser, currentCompany?.id, reachableScreens]
  );

  const activeGroupKey = useMemo(() => {
    for (const entry of navModel) {
      if (entry.type !== 'group') continue;
      if (entry.items.some((i) => i.key === active)) return entry.key;
    }
    return null;
  }, [active, navModel]);

  /**
   * Which groups are open.
   *
   * The rail spent a day as a strip of unlabelled icons beside a column of the
   * current module. It read well and tested badly: nine glyphs, four of them
   * documents-with-lines, and no way to tell Purchases from Expenses without
   * hovering each one. Labels are what make a rail learnable — the reflow it
   * costs is the lesser problem.
   */
  const [openGroups, setOpenGroups] = useState(() => (activeGroupKey ? { [activeGroupKey]: true } : {}));

  useEffect(() => {
    if (!activeGroupKey) return;
    // Also closes whatever else was open: arriving somewhere is the same kind
    // of event as opening its group by hand.
    setOpenGroups((prev) => (prev[activeGroupKey] ? prev : { [activeGroupKey]: true }));
  }, [activeGroupKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const orgId = resolveServerOrgId(currentCompany);
    if (!orgId) return;

    let cancelled = false;
    const load = async () => {
      setWarehousesLoading(true);
      setWarehousesError('');
      try {
        const data = await listWarehouses(String(orgId));
        if (cancelled) return;
        const list = Array.isArray(data?.warehouses) ? data.warehouses : [];
        setWarehouses(list);
        if (activeWarehouseId && !list.some((w) => String(w.id) === String(activeWarehouseId))) {
          localStorage.removeItem('activeWarehouseId');
          setActiveWarehouseId('');
        }
      } catch (e) {
        if (cancelled) return;
        setWarehouses([]);
        setWarehousesError(String(e?.message || e));
      } finally {
        // Guarded rather than returned from: a return inside finally discards
        // whatever the try/catch was propagating.
        if (!cancelled) setWarehousesLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentCompany?.id, currentCompany?.profile?.backendCompanyId, activeOrgId, dbStorageKey, warehousesReloadKey]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const orgId = resolveServerOrgId(currentCompany);
    if (!orgId) return;

    let cancelled = false;
    const load = async () => {
      setBranchesLoading(true);
      setBranchesError('');
      try {
        const data = await listBranches(String(orgId));
        if (cancelled) return;
        const list = Array.isArray(data?.branches) ? data.branches : [];
        setBranches(list);
      } catch (e) {
        if (cancelled) return;
        setBranches([]);
        setBranchesError(String(e?.message || e));
      } finally {
        // Guarded rather than returned from: a return inside finally discards
        // whatever the try/catch was propagating.
        if (!cancelled) setBranchesLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, currentCompany?.id, currentCompany?.profile?.backendCompanyId, activeOrgId, dbStorageKey, branchesReloadKey]);

  // Ensure we always have an active branch id (some flows don't populate backendBranchId)
  useEffect(() => {
    if (!isAuthenticated) return;
    if (branchesLoading) return;
    if (!Array.isArray(branches) || branches.length === 0) return;

    const existing = String(localStorage.getItem('activeBranchId') || '').trim();
    if (existing) return;

    const first = branches[0];
    const fallback = first?.id != null ? String(first.id) : '';
    if (!fallback) return;

    localStorage.setItem('activeBranchId', fallback);
    localStorage.setItem('branchId', fallback);
    if (typeof reloadWarehouses === 'function') reloadWarehouses();
  }, [isAuthenticated, branchesLoading, branches, reloadWarehouses]);

  const setActiveWarehouse = useCallback(
    (warehouseId) => {
      const nextId = warehouseId ? String(warehouseId) : '';
      if (nextId && !warehousesForUser.some((w) => String(w.id) === nextId)) {
        setWarehousesError('You do not have access to this warehouse.');
        return;
      }
      if (nextId) {
        localStorage.setItem('activeWarehouseId', nextId);
      } else {
        localStorage.removeItem('activeWarehouseId');
      }
      setActiveWarehouseId(nextId);
    },
    [warehousesForUser]
  );

  // Warehouses belonging to the branch currently in the header. A branch with
  // one warehouse needs no picker; the transfer forms still read the active id.
  const warehousesForActiveBranch = useMemo(() => {
    const list = Array.isArray(warehousesForUser) ? warehousesForUser : [];
    const bid = String(activeBranchId || '').trim();
    if (!bid) return list;
    const scoped = list.filter((w) => String(w?.branchId || '') === bid);
    return scoped.length ? scoped : list;
  }, [warehousesForUser, activeBranchId]);

  /**
   * Switching branch is the top-level shift: it re-scopes every screen, so the
   * warehouse selection is dropped (the old one belongs to the old branch) and
   * the warehouse list is refetched for the new branch.
   */
  const setActiveBranch = useCallback(
    (branchId) => {
      const nextId = branchId ? String(branchId) : '';
      if (!nextId) return;
      if (!branchesForUser.some((b) => String(b.id) === nextId)) return;

      localStorage.setItem('activeBranchId', nextId);
      localStorage.setItem('branchId', nextId);
      localStorage.removeItem('activeWarehouseId');
      setActiveBranchId(nextId);
      setActiveWarehouseId('');
      if (typeof reloadWarehouses === 'function') reloadWarehouses();
    },
    [branchesForUser, reloadWarehouses]
  );

  useEffect(() => {
    if (!isAuthenticated) return;
    if (warehousesLoading) return;
    if (!currentCompany?.id) return;

    const companyId = currentCompany.id;
    const migrations = currentCompany?.docSettings?.migrations || {};
    if (migrations.headWarehouseBackfillV1Applied) return;

    const hasMissingWarehouse = (list) => {
      const rows = Array.isArray(list) ? list : [];
      return rows.some((r) => r?.companyId === companyId && !String(r?.warehouseId || '').trim());
    };

    const needsBackfill =
      hasMissingWarehouse(db?.invoices) ||
      hasMissingWarehouse(db?.creditNotes) ||
      hasMissingWarehouse(db?.bills) ||
      hasMissingWarehouse(db?.debitNotes) ||
      hasMissingWarehouse(db?.estimates) ||
      hasMissingWarehouse(db?.purchaseOrders);

    // If there are no legacy demo vouchers missing a warehouse, don't do anything.
    if (!needsBackfill) return;

    let cancelled = false;
    const run = async () => {
      try {
        const nameToMatch = 'head warehouse';
        let head = (Array.isArray(warehouses) ? warehouses : []).find((w) => String(w?.name || '').trim().toLowerCase() === nameToMatch) || null;

        if (!head) {
          const orgId = resolveServerOrgId(currentCompany);
          const branchId = String(localStorage.getItem('activeBranchId') || localStorage.getItem('branchId') || currentCompany?.profile?.backendBranchId || '').trim();

          if (orgId && branchId) {
            const payload = {
              branchId,
              name: 'Head Warehouse',
              addressLine1: null,
              addressLine2: null,
              city: null,
              state: null,
              country: 'India',
              gstRegistrationType: 'UNREGISTERED',
              gstin: null,
              contactPerson: null,
              phone: null,
              email: null,
            };

            const created = await createWarehouse(String(orgId), payload);
            head = created?.warehouse || null;
            if (typeof reloadWarehouses === 'function') reloadWarehouses();
          }
        }

        if (cancelled) return;
        if (!head?.id) return;

        const headId = String(head.id);

        setDb((prev) => {
          const applyToList = (rows) => {
            const list = Array.isArray(rows) ? rows : [];
            return list.map((r) => {
              if (r?.companyId !== companyId) return r;
              if (String(r?.warehouseId || '').trim()) return r;
              return { ...r, warehouseId: headId };
            });
          };

          const companies = Array.isArray(prev?.companies) ? prev.companies : [];
          const nextCompanies = companies.map((c) => {
            if (c?.id !== companyId) return c;
            const prevDoc = c?.docSettings || {};
            const prevMig = prevDoc?.migrations || {};
            return {
              ...c,
              docSettings: {
                ...prevDoc,
                migrations: {
                  ...prevMig,
                  headWarehouseBackfillV1Applied: true,
                },
              },
            };
          });

          const next = {
            ...prev,
            companies: nextCompanies,
            invoices: applyToList(prev?.invoices),
            creditNotes: applyToList(prev?.creditNotes),
            bills: applyToList(prev?.bills),
            debitNotes: applyToList(prev?.debitNotes),
            estimates: applyToList(prev?.estimates),
            purchaseOrders: applyToList(prev?.purchaseOrders),
          };

          return next;
        });

        if (!String(activeWarehouseId || '').trim()) {
          localStorage.setItem('activeWarehouseId', headId);
          setActiveWarehouseId(headId);
        }
      } catch {
        // Best-effort only: if creation fails, don't block the app.
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    isAuthenticated,
    warehousesLoading,
    warehouses,
    currentCompany?.id,
    currentCompany?.profile?.backendCompanyId,
    currentCompany?.profile?.backendBranchId,
    db,
    activeWarehouseId,
    reloadWarehouses,
    setDb,
  ]);

  const activeLabel = useMemo(() => {
    const reportKeyToLabel = {
      reports: 'Reports',
      trialBalance: 'Trial Balance',
      profitLoss: 'P&L',
      balanceSheet: 'Balance Sheet',
      cashFlow: 'Cash Flow',
      gstr1: 'GSTR-1',
      gstr3b: 'GSTR-3B',
      salesReports: 'Sales Reports',
      // Reached from the account menu rather than the rail, so the loop over
      // navModel below never finds them.
      settingsProfile: 'My profile',
      settings: 'Settings',
    };

    if (active === 'ledger') {
      const a = (db.chartOfAccounts || []).find((x) => String(x.id) === String(ledgerNav.ledgerId) && x.companyId === currentCompany.id) || null;
      return a ? `Ledger: ${a.name}` : 'Ledger';
    }

    for (const entry of navModel) {
      if (entry.type === 'item' && entry.key === active) return entry.label;
      if (entry.type === 'group') {
        const item = entry.items.find((i) => i.key === active);
        if (item) return item.label;
      }
    }
    if (reportKeyToLabel[active]) return reportKeyToLabel[active];

    // Last resort: a screen that is in neither the rail nor the map should
    // still read as words. It used to render the route key, so the pill said
    // "settingsProfile" in front of the user.
    return String(active || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/^./, (c) => c.toUpperCase());
  }, [active, navModel]);

  const openModal = (content, opts = {}) => {
    if (!content) {
      setModal({ content: null, title: 'Form', maxWidthClass: 'max-w-4xl' });
      return;
    }
    setModal({
      content,
      title: opts.title || 'Form',
      maxWidthClass: opts.maxWidthClass || 'max-w-4xl',
    });
  };

  const shareHandledRef = useRef(false);

  useEffect(() => {
    if (shareHandledRef.current) return;

    let invoiceId = '';
    try {
      const params = new URLSearchParams(window.location.search);
      invoiceId = String(params.get('invoiceId') || '').trim();
    } catch {
      invoiceId = '';
    }

    if (!invoiceId) return;

    const inv = (db.invoices || []).find((i) => String(i.id) === invoiceId && i.companyId === currentCompany.id) || null;
    if (!inv) return;

    shareHandledRef.current = true;
    setActive('invoices');
    openModal(<InvoicePreview db={db} currentCompany={currentCompany} invoice={inv} />, {
      title: `Invoice ${inv?.number || ''}`.trim(),
      maxWidthClass: 'max-w-5xl',
    });
  }, [db, currentCompany.id]);

  const page = useMemo(() => {
    switch (active) {
      case 'dashboard':
        return (
          <DashboardOverview
            db={dbForUser}
            currentCompany={currentCompany}
            branches={branchesForUser}
            // "New invoice" has to actually start one. This was wired
            // identically to onOpenInvoices, so the dashboard's primary action
            // — and the one in its empty state, which exists to get a first
            // document raised — only dropped you on the list to press New
            // Invoice again.
            onNewInvoice={() => {
              setActive('invoices');
              setInvoiceEditor({ open: true, initial: null });
            }}
            onOpenInvoices={() => setActive('invoices')}
            onOpenReceipts={() => setActive('receipts')}
            onOpenCustomers={() => setActive('customers')}
            onOpenPurchases={() => setActive('purchaseOverview')}
            // The warehouse selector in the header governed nothing on this
            // page, which is the kind of control that teaches people the
            // filters do not work.
            activeWarehouseId={activeWarehouseId}
            // The search field on the dashboard is the command palette the
            // shell already owns, not a second search that would have to be
            // built and kept in step with it.
            onOpenCommand={() => setPaletteOpen(true)}
            // Identity comes from /auth/me, the same place the header takes it
            // from, so the picture and the name cannot disagree between the
            // corner and the middle of the page.
            userName={userDisplayName}
            userAvatarUrl={userAvatarUrl}
            userInitials={userInitials}
            onNewBill={() => {
              setActive('bills');
              setBillEditor({ open: true, initial: null });
            }}
            onRecordReceipt={() => {
              setActive('receipts');
              setReceiptEditor({ open: true, initial: null });
            }}
            onOpenReports={() => setActive('reports')}
          />
        );
      case 'sales':
        return (
          <SalesOverview
            db={dbForUser}
            currentCompany={currentCompany}
            branches={branchesForUser}
            warehouses={warehousesForUser}
            branchesLoading={branchesLoading}
            branchesError={branchesError}
            onNavigate={setActive}
            /* The quick actions land on the screen that owns the document and
               open its editor, rather than floating a form over the overview:
               the list behind a new invoice is part of how you check you are
               not raising it twice. */
            onNewInvoice={() => {
              setActive('invoices');
              setInvoiceEditor({ open: true, initial: null });
            }}
            onNewCreditNote={() => {
              setActive('creditNotes');
              setCreditNoteEditor({ open: true, initialOriginalInvoiceId: null });
            }}
            onRecordReceipt={() => {
              setActive('receipts');
              setReceiptEditor({ open: true, initial: null });
            }}
          />
        );
      case 'invoices':
        if (invoiceEditor.open) {
          const isEdit = Boolean(invoiceEditor.initial && invoiceEditor.initial?.id !== undefined && invoiceEditor.initial?.id !== null);
          return (
            /*
             * No header of its own any more. The name of the document and
             * every way out of it — Back, Save Draft, Create Invoice, ⋮ — are
             * one pinned bar inside the form, so the primary action is still
             * on screen at the twentieth line.
             */
            <div className="space-y-4">
              <div className="ui-surface border rounded-xl p-4">
                <InvoiceForm
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  branches={branchesForUser}
                  screenTitle={isEdit ? 'Edit Invoice' : 'New Invoice'}
                  screenSubtitle={isEdit ? invoiceEditor.initial?.number || '' : ''}
                  onBack={() => setInvoiceEditor({ open: false, initial: null })}
                  initialData={invoiceEditor.initial}
                  warehouses={warehousesForUser}
                  defaultWarehouseId={activeWarehouseId}
                  onClose={() => setInvoiceEditor({ open: false, initial: null })}
                  onDuplicateInvoice={(inv) => {
                    // A copy, not the original: no id, no number, today's
                    // date. Sharing the number would collide the moment it
                    // saved, and a GST series must not repeat.
                    const copy = { ...(inv || {}) };
                    [
                      'id',
                      'number',
                      'status',
                      'paidAmount',
                      'backendInvoiceId',
                      'irn',
                      'irnSignedQr',
                      'irnAckNo',
                      'irnAckDate',
                      'irnStatus',
                      'ewbNo',
                      'ewbDate',
                      'ewbValidTill',
                      'cancelledAt',
                    ].forEach((k) => delete copy[k]);
                    copy.date = new Date().toISOString().slice(0, 10);
                    copy.customFields = { ...(inv?.customFields || {}) };
                    setInvoiceEditor({ open: true, initial: copy });
                  }}
                  onOpenInvoiceSettings={(screen) => {
                    // Configuring the document is not part of raising it, so
                    // the form closes rather than leaving a half-typed invoice
                    // behind a settings screen.
                    setInvoiceEditor({ open: false, initial: null });
                    setActive(screen);
                  }}
                />
              </div>
            </div>
          );
        }
        return (
          <InvoicesList
            db={dbForUser}
            setDb={setDb}
            openModal={openModal}
            currentCompany={currentCompany}
            warehouses={warehousesForUser}
            defaultWarehouseId={activeWarehouseId}
            onNewInvoice={() => setInvoiceEditor({ open: true, initial: null })}
            onEditInvoice={(inv) => setInvoiceEditor({ open: true, initial: inv })}
            onOpenRecurring={() => setActive('recurringInvoices')}
            onNavigate={(screen) => setActive(screen)}
            onRaiseCreditNote={(inv) => {
              setActive('creditNotes');
              setCreditNoteEditor({ open: true, initialOriginalInvoiceId: inv?.id ?? null });
            }}
          />
        );
      case 'estimates':
        if (estimateEditor.open) {
          const isEdit = Boolean(estimateEditor.initial && estimateEditor.initial?.id !== undefined && estimateEditor.initial?.id !== null);
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="ui-t-sec">{isEdit ? 'Edit Estimate' : 'New Estimate'}</h3>
                  <div className="text-sm ui-muted">{isEdit ? estimateEditor.initial?.number || '' : ''}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setEstimateEditor({ open: false, initial: null })}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <div className="ui-surface border rounded-xl p-4">
                <EstimateForm
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  initialData={estimateEditor.initial}
                  onClose={() => setEstimateEditor({ open: false, initial: null })}
                />
              </div>
            </div>
          );
        }
        return (
          <EstimatesList
            db={dbForUser}
            setDb={setDb}
            openModal={openModal}
            currentCompany={currentCompany}
            warehouses={warehousesForUser}
            defaultWarehouseId={activeWarehouseId}
            onNewEstimate={() => setEstimateEditor({ open: true, initial: null })}
            onEditEstimate={(est) => setEstimateEditor({ open: true, initial: est })}
            onConvertToInvoice={(est) => {
              const initialInvoice = {
                status: 'Draft',
                date: est?.date || undefined,
                dueDate: est?.dueDate || undefined,
                customerId: est?.customerId || '',
                refNo: est?.number || '',
                refDate: est?.date || '',
                sourceEstimateId: est?.id ?? null,
                items: Array.isArray(est?.items)
                  ? est.items.map((l) => ({
                      itemId: l?.itemId !== undefined && l?.itemId !== null && l?.itemId !== '' ? String(l.itemId) : '',
                      description: l?.description ?? '',
                      quantity: Number(l?.quantity ?? 1),
                      rate: Number(l?.rate ?? 0),
                      gstRate: Number(l?.gstRate ?? 0),
                      hsnSac: l?.hsnSac || '',
                      amount: Number(l?.amount ?? 0),
                    }))
                  : undefined,
              };

              setActive('invoices');
              setInvoiceEditor({ open: true, initial: initialInvoice });
            }}
          />
        );
      case 'journalEntries':
        if (journalEditor.open) {
          const isEdit = Boolean(journalEditor.initial && journalEditor.initial?.id !== undefined && journalEditor.initial?.id !== null);
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="ui-t-sec">{isEdit ? 'Edit Journal Entry' : 'New Journal Entry'}</h3>
                  <div className="text-sm ui-muted">{isEdit ? journalEditor.initial?.number || '' : ''}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setJournalEditor({ open: false, initial: null })}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <div className="ui-surface border rounded-xl p-4">
                <JournalEntryForm
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  openModal={openModal}
                  initialData={journalEditor.initial}
                  onClose={() => setJournalEditor({ open: false, initial: null })}
                />
              </div>
            </div>
          );
        }
        return (
          <JournalEntriesList
            db={dbForUser}
            setDb={setDb}
            currentCompany={currentCompany}
            onNewJournal={() => setJournalEditor({ open: true, initial: null })}
            onEditJournal={(jv) => setJournalEditor({ open: true, initial: jv })}
          />
        );
      case 'creditNotes':
        if (creditNoteEditor.open) {
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="ui-t-sec">New Credit Note</h3>
                <button
                  type="button"
                  onClick={() => setCreditNoteEditor({ open: false, initialOriginalInvoiceId: null })}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <div className="ui-surface border rounded-xl p-4">
                <CreditNoteForm
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  initialOriginalInvoiceId={creditNoteEditor.initialOriginalInvoiceId}
                  warehouses={warehousesForUser}
                  defaultWarehouseId={activeWarehouseId}
                  onClose={() => setCreditNoteEditor({ open: false, initialOriginalInvoiceId: null })}
                />
              </div>
            </div>
          );
        }
        return (
          <CreditNotesList
            db={dbForUser}
            setDb={setDb}
            openModal={openModal}
            currentCompany={currentCompany}
            warehouses={warehousesForUser}
            defaultWarehouseId={activeWarehouseId}
            onNewCreditNote={() => setCreditNoteEditor({ open: true, initialOriginalInvoiceId: null })}
          />
        );
      case 'receipts':
        if (receiptEditor.open) {
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="ui-t-sec">Record Receipt</h3>
                <button
                  type="button"
                  onClick={() => setReceiptEditor({ open: false })}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <div className="ui-surface border rounded-xl p-4">
                <RecordReceiptForm
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  onClose={() => setReceiptEditor({ open: false })}
                />
              </div>
            </div>
          );
        }

        return (
          <ReceiptsTransactionsList
            db={dbForUser}
            setDb={setDb}
            openModal={openModal}
            currentCompany={currentCompany}
            onRecordReceipt={() => setReceiptEditor({ open: true })}
          />
        );
      case 'payments':
      case 'paymentsExpense':
        if (paymentEditor.open) {
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="ui-t-sec">Record Payment</h3>
                <button
                  type="button"
                  onClick={() => setPaymentEditor({ open: false })}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <div className="ui-surface border rounded-xl p-4">
                <RecordDisbursementForm
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  onClose={() => setPaymentEditor({ open: false })}
                />
              </div>
            </div>
          );
        }

        return (
          <PaymentsTransactionsList
            db={dbForUser}
            setDb={setDb}
            openModal={openModal}
            currentCompany={currentCompany}
            onRecordPayment={() => setPaymentEditor({ open: true })}
          />
        );
      case 'bankCash':
        return <ChartOfAccounts db={dbForUser} setDb={setDb} openModal={openModal} currentCompany={currentCompany} />;
      case 'cashBank': {
        const companyId = currentCompany.id;

        const groups = (Array.isArray(db.accountGroups) ? db.accountGroups : [])
          .filter((g) => g.companyId === companyId)
          .filter((g) => !g.isLegacy);

        const groupById = new Map(groups.map((g) => [String(g.id), g]));

        const isUnderNamedRoot = (groupId, rootLowerName) => {
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

        const includeGroupIds = groups
          .filter((g) => isUnderNamedRoot(g.id, 'bank accounts') || isUnderNamedRoot(g.id, 'cash-in-hand'))
          .map((g) => g.id);

        const openLedgerCreate = (initialName = '', onCreated) => {
          openModal(
            <ChartAccountForm
              db={db}
              setDb={setDb}
              currentCompany={currentCompany}
              openModal={openModal}
              includeGroupIds={includeGroupIds}
              initialName={String(initialName || '').trim()}
              onCreated={onCreated}
              onClose={() => openModal(null)}
            />,
            { title: 'New Cash/Bank Account', maxWidthClass: 'max-w-2xl' }
          );
        };

        const openTxnLedgerCreate = (initialName = '', onCreated) => {
          openModal(
            <ChartAccountForm
              db={db}
              setDb={setDb}
              currentCompany={currentCompany}
              openModal={openModal}
              initialName={String(initialName || '').trim()}
              onCreated={onCreated}
              onClose={() => openModal(null)}
            />,
            { title: 'New Ledger', maxWidthClass: 'max-w-2xl' }
          );
        };

        return (
          <CashBankModule
            db={dbForUser}
            setDb={setDb}
            currentCompany={currentCompany}
            openModal={openModal}
            openLedgerCreate={openLedgerCreate}
            openTxnLedgerCreate={openTxnLedgerCreate}
          />
        );
      }
      case 'inventory':
        return <InventoryModule db={dbForUser} setDb={setDb} openModal={openModal} currentCompany={currentCompany} warehouses={warehousesForUser} />;
      case 'warehouseTransfers':
      case 'branchTransfers':
        if (stockTransferEditor.open) {
          const mode = active === 'branchTransfers' ? 'branch' : 'warehouse';
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="ui-t-sec">
                    {mode === 'branch'
                      ? stockTransferEditor.initial
                        ? 'Edit Branch Transfer'
                        : 'New Branch Transfer'
                      : stockTransferEditor.initial
                        ? 'Edit Warehouse Transfer'
                        : 'New Warehouse Transfer'}
                  </h3>
                  {stockTransferEditor.initial?.number ? (
                    <div className="text-sm ui-muted">{String(stockTransferEditor.initial.number)}</div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setStockTransferEditor({ open: false, initial: null })}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <div className="ui-surface border rounded-xl p-4">
                <StockTransferEditor
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  branches={branchesForUser}
                  warehouses={warehousesForUser}
                  allBranches={branches}
                  allWarehouses={warehouses}
                  activeWarehouseId={activeWarehouseId}
                  initial={stockTransferEditor.initial}
                  mode={mode}
                  onBack={() => setStockTransferEditor({ open: false, initial: null })}
                />
              </div>
            </div>
          );
        }

        return (
          <StockTransferModule
            db={dbForUser}
            setDb={setDb}
            currentCompany={currentCompany}
            openModal={openModal}
            branches={branchesForUser}
            warehouses={warehousesForUser}
            mode={active === 'branchTransfers' ? 'branch' : 'warehouse'}
            activeWarehouseId={activeWarehouseId}
            activeBranchId={activeBranchId}
            onNew={() => setStockTransferEditor({ open: true, initial: null })}
            onEdit={(initial) => setStockTransferEditor({ open: true, initial })}
          />
        );
      case 'financials':
        return <TrialBalance db={dbForUser} currentCompany={currentCompany} />;
      case 'salesReports':
        return <SalesReports db={dbForUser} currentCompany={currentCompany} />;
      case 'companies':
        return (
          <CompanyGroups
            db={dbForUser}
            setDb={setDb}
            currentCompany={currentCompany}
            onSwitched={() => setActive('dashboard')}
          />
        );
      case 'purchaseOverview':
        return <PurchaseOverview db={dbForUser} currentCompany={currentCompany} />;
      case 'purchaseOrders':
        if (poEditor.open) {
          // Entered on its own page, the way a bill is — same shape of work,
          // same shape of screen.
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="ui-t-sec">{poEditor.initial ? 'Edit Purchase Order' : 'New Purchase Order'}</h3>
                <button
                  type="button"
                  onClick={() => setPoEditor({ open: false, initial: null })}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <div className="ui-surface rounded-xl shadow-sm p-6 border">
                <PurchaseOrderForm
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  warehouses={warehousesForUser}
                  defaultWarehouseId={activeWarehouseId}
                  initialData={poEditor.initial}
                  onClose={() => setPoEditor({ open: false, initial: null })}
                />
              </div>
            </div>
          );
        }
        return (
          <PurchaseOrdersList
            db={dbForUser}
            setDb={setDb}
            openModal={openModal}
            currentCompany={currentCompany}
            warehouses={warehousesForUser}
            defaultWarehouseId={activeWarehouseId}
            onNewPo={() => setPoEditor({ open: true, initial: null })}
            onEditPo={(po) => setPoEditor({ open: true, initial: po })}
            onConvertToBill={(po) => {
              // Carry the order across: vendor, warehouse and lines prefill the
              // bill, and the bill remembers which order it answers. The order
              // closes when that bill is actually saved — marking it here would
              // close orders for bills the user then abandoned.
              setBillEditor({
                open: true,
                initial: {
                  vendorId: po.vendorId,
                  warehouseId: po.warehouseId,
                  refNo: po.number,
                  refDate: po.date,
                  sourcePurchaseOrderId: po.id,
                  /**
                   * Put the tax rate back on each line.
                   *
                   * A purchase order stores itemId, description, quantity,
                   * rate and amount — and no gstRate, because the PO form
                   * never asks for tax. Handing those lines to the bill
                   * unchanged produced a bill with CGST and SGST of zero on
                   * goods that carry 18%, so the input credit simply vanished:
                   * ₹6,480 on a ₹36,000 order, silently, unless somebody
                   * noticed and re-picked the item by hand.
                   *
                   * The item master knows the rate, which is where the bill
                   * form gets it when a line is entered directly.
                   */
                  items: (po.items || []).map((line) => {
                    const master = (db.items || []).find((i) => String(i.id) === String(line.itemId));
                    return {
                      ...line,
                      gstRate: Number(line.gstRate ?? master?.gstRate ?? 0),
                      hsnSac: line.hsnSac || master?.hsnSac || '',
                    };
                  }),
                },
              });
              setActive('bills');
            }}
          />
        );
      case 'bills':
        if (typeof BillsList === 'undefined' || typeof BillForm === 'undefined') {
          return (
            <div className="space-y-3">
              <div className="ui-t-sec">Bills</div>
              <div className="ui-surface border rounded-xl p-4 text-sm ui-fg">
                Bills module failed to load (missing component). Please refresh the page.
              </div>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-lg ui-btn ui-btn-primary "
              >
                Refresh
              </button>
            </div>
          );
        }
        if (billEditor.open) {
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="ui-t-sec">New Bill</h3>
                <button
                  type="button"
                  onClick={() => setBillEditor({ open: false, initial: null })}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <div className="ui-surface border rounded-xl p-4">
                <BillForm
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  initialData={billEditor.initial}
                  warehouses={warehousesForUser}
                  defaultWarehouseId={activeWarehouseId}
                  onClose={() => setBillEditor({ open: false, initial: null })}
                />
              </div>
            </div>
          );
        }
        return (
          <BillsList
            db={dbForUser}
            setDb={setDb}
            openModal={openModal}
            currentCompany={currentCompany}
            warehouses={warehousesForUser}
            defaultWarehouseId={activeWarehouseId}
            onNewBill={() => setBillEditor({ open: true, initial: null })}
            onNavigate={(screen) => setActive(screen)}
            onDuplicateBill={(initial) => setBillEditor({ open: true, initial })}
            onEditBill={(bill) => setBillEditor({ open: true, initial: bill })}
            onRaiseDebitNote={(bill) => {
              setActive('debitNotes');
              setDebitNoteEditor({ open: true, initialOriginalBillId: bill?.id ?? null });
            }}
          />
        );
      case 'debitNotes':
        if (debitNoteEditor.open) {
          return (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="ui-t-sec">New Debit Note</h3>
                <button
                  type="button"
                  onClick={() => setDebitNoteEditor({ open: false, initialOriginalBillId: null })}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <div className="ui-surface border rounded-xl p-4">
                <DebitNoteForm
                  db={dbForUser}
                  setDb={setDb}
                  currentCompany={currentCompany}
                  initialOriginalBillId={debitNoteEditor.initialOriginalBillId}
                  warehouses={warehousesForUser}
                  defaultWarehouseId={activeWarehouseId}
                  onClose={() => setDebitNoteEditor({ open: false, initialOriginalBillId: null })}
                />
              </div>
            </div>
          );
        }
        return (
          <DebitNotesList
            db={dbForUser}
            setDb={setDb}
            openModal={openModal}
            currentCompany={currentCompany}
            warehouses={warehousesForUser}
            defaultWarehouseId={activeWarehouseId}
            onNewDebitNote={() => setDebitNoteEditor({ open: true, initialOriginalBillId: null })}
          />
        );
      case 'expenses':
        return <ExpensesList db={dbForUser} setDb={setDb} openModal={openModal} currentCompany={currentCompany} />;
      case 'items':
        return (
          <ItemsList
            db={dbForUser}
            setDb={setDb}
            openModal={openModal}
            currentCompany={currentCompany}
            warehouses={warehousesForActiveBranch}
          />
        );
      case 'customers':
        return <CustomersList db={dbForUser} setDb={setDb} openModal={openModal} currentCompany={currentCompany} />;
      case 'inventoryOverview':
        return <InventoryOverview db={db} currentCompany={currentCompany} />;
      case 'stockAdjustment':
        return <StockAdjustment db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'uoms':
        return <UomsList db={db} setDb={setDb} currentCompany={currentCompany} />;
      case 'itemCategories':
        return <ItemCategoriesList db={db} setDb={setDb} currentCompany={currentCompany} />;
      case 'vendors':
        return <VendorsList db={dbForUser} setDb={setDb} openModal={openModal} currentCompany={currentCompany} />;
      case 'mdm':
        return <MdmOverview />;
      case 'accounts':
        return <ChartOfAccounts db={dbForUser} setDb={setDb} openModal={openModal} currentCompany={currentCompany} />;
      case 'trialBalance':
        return <TrialBalance db={dbForUser} currentCompany={currentCompany} onOpenLedger={openLedger} />;
      case 'profitLoss':
        return <ProfitLoss db={dbForUser} currentCompany={currentCompany} onOpenLedger={openLedger} />;
      case 'balanceSheet':
        return <BalanceSheet db={dbForUser} currentCompany={currentCompany} onOpenLedger={openLedger} />;
      case 'ledger':
        return (
          <LedgerView
            db={dbForUser}
            setDb={setDb}
            currentCompany={currentCompany}
            ledgerId={ledgerNav.ledgerId}
            openModal={openModal}
            warehouses={warehouses}
            activeWarehouseId={activeWarehouseId}
            onBack={() => setActive(ledgerNav.returnTo || 'trialBalance')}
          />
        );
      case 'cashFlow':
        return <CashFlowStatement db={dbForUser} currentCompany={currentCompany} />;
      case 'reports':
        return <ReportsOverview sections={reportSections} onNavigate={(key) => setActive(key)} />;
      case 'gstr1':
        return <Gstr1Report db={dbForUser} currentCompany={currentCompany} />;
      case 'gstr3b':
        return <Gstr3bReport db={dbForUser} currentCompany={currentCompany} />;
      case 'gstRates':
        return <GstRatesList db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'invoiceTemplates':
        return <InvoiceTemplateSettings db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'docNumbering':
        return <DocNumberingSettings db={dbForUser} setDb={setDb} currentCompany={currentCompany} branches={branchesForUser} />;
      case 'docTemplates':
        return <DocTemplateSettings db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'companyProfile':
        return <CompanyProfile db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'settingsCompany':
        return <SettingsView db={dbForUser} setDb={setDb} currentCompany={currentCompany} initialTab="company" showSidebar={false} />;
      case 'settingsTax':
        return <SettingsView db={dbForUser} setDb={setDb} currentCompany={currentCompany} initialTab="tax" showSidebar={false} />;
      case 'settingsBranches': {
        const orgId = resolveServerOrgId(currentCompany);
        return <SettingsBranches orgId={orgId} onBranchesChanged={() => setBranchesReloadKey((k) => k + 1)} />;
      }
      case 'settingsWarehouses': {
        const orgId = resolveServerOrgId(currentCompany);
        const branchId = localStorage.getItem('activeBranchId');
        return <SettingsWarehouses orgId={orgId} branchId={branchId} onWarehousesChanged={reloadWarehouses} />;
      }
      case 'settingsUsers': {
        const orgId = resolveServerOrgId(currentCompany);
        return <SettingsUsers orgId={orgId} />;
      }
      case 'settingsRoles': {
        const orgId = resolveServerOrgId(currentCompany);
        return <SettingsRoles orgId={orgId} />;
      }
      case 'settingsPermissions':
        return <RolePermissionManager />;
      case 'settingsTerms':
        return <TermsSettings db={db} setDb={setDb} currentCompany={currentCompany} />;
      case 'settingsInvoiceFields':
        return <InvoiceFieldSettings db={db} setDb={setDb} currentCompany={currentCompany} />;
      case 'settingsFeatures':
        return <FeatureSettings />;
      // The Business panes are the same screen filtered to one part of the
      // business, not six copies of it.
      case 'settingsSales':
      case 'settingsPurchases':
      case 'settingsInventory':
      case 'settingsAccounting':
      case 'settingsPaymentsReceipts':
      case 'settingsDocuments':
        return <FeatureSettings pane={active} />;
      case 'settingsEmail':
        return <EmailSettings />;
      case 'settingsSecurity':
        return <SecuritySettings />;
      case 'settingsGovernance':
        return <GovernanceSettings />;
      case 'settingsProfile':
        return <ProfileSettings />;
      case 'settingsNumbering':
        return <NumberingSettings />;
      case 'settingsCurrencies':
        return <CurrencySettings />;
      case 'dataImport':
        return <ImportCenter />;
      case 'batchSerial':
        return <BatchSerialManager />;
      case 'stockAdjustments':
        return (
          <StockAdjustments
            db={dbForUser}
            setDb={setDb}
            currentCompany={currentCompany}
            warehouses={warehousesForUser}
            branches={branchesForUser}
            activeWarehouseId={activeWarehouseId}
          />
        );
      case 'batchStock':
        return <BatchStock db={dbForUser} currentCompany={currentCompany} />;
      case 'reorderAlerts':
        return <ReorderAlerts db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'gstr2bReco':
        return <Gstr2bReco db={dbForUser} currentCompany={currentCompany} />;
      case 'paymentReminders':
        return <PaymentReminders db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'salesBySalesman':
        return <SalesBySalesman db={dbForUser} currentCompany={currentCompany} />;
      case 'tallyExport':
        return <TallyExport db={dbForUser} currentCompany={currentCompany} />;
      case 'tdsTcs':
        return <TdsTcsReport db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'fixedAssets':
        return <FixedAssets db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'yearEndClose':
        return <YearEndClose db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'costCenters':
        return <CostCenters db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'priceLists':
        return <PriceLists db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'discountRules':
        return <DiscountRules db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'salesOrders':
        return (
          <SalesOrders
            db={dbForUser}
            setDb={setDb}
            currentCompany={currentCompany}
            onConvertToInvoice={(order) => {
              // Bill what is still unbilled, at the terms the order agreed —
              // an invoice raised from an order should need no re-typing, and
              // billing a line twice is the mistake this prevents.
              const billed = new Map();
              for (const inv of dbForUser.invoices || []) {
                if (Number(inv?.sourceSalesOrderId) !== Number(order.id)) continue;
                if (String(inv?.status || '').toLowerCase() === 'cancelled') continue;
                for (const l of inv.items || []) {
                  const k = String(l.itemId);
                  billed.set(k, (billed.get(k) || 0) + (Number(l.quantity) || 0));
                }
              }
              const lines = (order.items || [])
                .map((l) => {
                  const ordered = Number(l.quantity) || 0;
                  const already = billed.get(String(l.itemId)) || 0;
                  const remaining = Math.max(0, Math.round((ordered - already) * 1000) / 1000);
                  return { ...l, remaining };
                })
                .filter((l) => l.remaining > 0)
                .map((l) => ({
                  ...l,
                  itemId: String(l.itemId),
                  quantity: l.remaining,
                  rate: Number(l.rate) || 0,
                  gstRate: Number(l.gstRate) || 0,
                  hsnSac: l.hsnSac || '',
                  amount: Math.round((l.remaining * (Number(l.rate) || 0)) * 100) / 100,
                }));

              if (!lines.length) {
                notify.info(`${order.number} is fully billed — nothing left to invoice.`);
                return;
              }

              setInvoiceEditor({
                open: true,
                initial: {
                  customerId: order.customerId,
                  refNo: order.number,
                  refDate: order.date || '',
                  salesmanId: order.salesmanId || '',
                  notes: order.notes || '',
                  warehouseId: order.warehouseId || activeWarehouseId || '',
                  sourceSalesOrderId: order.id,
                  items: lines,
                },
              });
              setActive('invoices');
            }}
          />
        );
      case 'recurringInvoices':
        return <RecurringInvoices db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'salesmen':
        return <Salesmen db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'pos':
        return <PosScreen db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      case 'deliveryChallans':
        return (
          <DeliveryChallans
            db={dbForUser}
            setDb={setDb}
            currentCompany={currentCompany}
            onConvert={(challan) => {
              // Status flips to Invoiced only when the invoice actually saves
              // (sourceChallanId is picked up by the invoice submit).
              setInvoiceEditor({
                open: true,
                initial: {
                  customerId: challan.customerId,
                  refNo: challan.number,
                  refDate: challan.date || '',
                  notes: challan.notes || '',
                  warehouseId: challan.warehouseId || activeWarehouseId || '',
                  sourceChallanId: challan.id,
                  items: (challan.items || []).map((l) => {
                    const master = (dbForUser.items || []).find((i) => String(i.id) === String(l.itemId));
                    const qty = Number(l.quantity) || 1;
                    const rate = Number(l.rate) || 0;
                    return {
                      ...l,
                      itemId: String(l.itemId),
                      description: l.description || master?.name || '',
                      quantity: qty,
                      rate,
                      gstRate: Number(l.gstRate ?? master?.gstRate ?? 0),
                      hsnSac: l.hsnSac || master?.hsnSac || '',
                      amount: Math.round(qty * rate * 100) / 100,
                    };
                  }),
                },
              });
              setActive('invoices');
            }}
          />
        );
      case 'approvals':
        return <ApprovalsInbox currentCompany={currentCompany} />;
      case 'ledgerTrialBalance':
        return <LedgerTrialBalance currentCompany={currentCompany} />;
      case 'settingsUsersRoles': {
        const orgId = resolveServerOrgId(currentCompany);
        return <SettingsUsersRoles orgId={orgId} />;
      }
      case 'settings':
        return <SettingsView db={dbForUser} setDb={setDb} currentCompany={currentCompany} />;
      default:
        return <SalesOverview db={dbForUser} currentCompany={currentCompany} branches={branchesForUser} warehouses={warehousesForUser} onNavigate={setActive} />;
    }
  }, [active, billEditor, branchesForUser, creditNoteEditor, currentCompany, dbForUser, debitNoteEditor, estimateEditor, invoiceEditor, journalEditor, openLedger, paymentEditor, receiptEditor, ledgerNav, stockTransferEditor, warehousesForUser, activeWarehouseId, activeBranchId, poEditor]);

  if (!isAuthenticated) {
    return (
      <AuthGate
        onAuth={(payload) => {
          const token = typeof payload === 'string' ? payload : payload?.token;
          if (!token) return;
          localStorage.setItem('token', token);

          const onboarding = typeof payload === 'object' ? payload?.onboarding : null;
          if (onboarding?.orgId) {
            localStorage.setItem('activeOrgId', String(onboarding.orgId));
          }

          if (onboarding?.branchId) {
            localStorage.setItem('activeBranchId', String(onboarding.branchId));
            localStorage.setItem('branchId', String(onboarding.branchId));
          }

          if (onboarding?.companyId) {
            const nextKey = getDbStorageKey();
            setDbStorageKey(nextKey);
            _setDb(() => {
              const prev = loadDbFromStorage();
              const companies = Array.isArray(prev?.companies) ? prev.companies : [];
              const defaultDoc = getDefaultDocSettings();
              const nowIso = new Date().toISOString();

              const ensureDemoDisabledDocSettings = (docSettings) => {
                const ds = docSettings && typeof docSettings === 'object' ? docSettings : {};
                const migrations = ds.migrations && typeof ds.migrations === 'object' ? ds.migrations : {};
                return {
                  ...defaultDoc,
                  ...ds,
                  migrations: {
                    ...defaultDoc.migrations,
                    ...migrations,
                    disableDemoSeed: true,
                    demoTransactionsV1Applied: true,
                  },
                };
              };

              const makeBlankCompany = () => ({
                id: 1,
                name: onboarding.companyName || 'Company',
                address: '',
                city: '',
                state: '',
                country: 'India',
                taxId: '',
                gstRegistration: 'Unregistered',
                gstin: '',
                currency: 'INR',
                fiscalYearStart: '01-01',
                docSettings: ensureDemoDisabledDocSettings(defaultDoc),
                profile: {
                  backendCompanyId: onboarding.companyId,
                  backendBranchId: onboarding.branchId || null,
                },
                createdAt: nowIso,
              });

              if (companies.length === 0) {
                return { ...prev, companies: [makeBlankCompany()] };
              }

              const nextCompanies = companies.map((c, idx) => {
                if (idx !== 0) return c;
                const prevProfile = c?.profile && typeof c.profile === 'object' ? c.profile : {};
                return {
                  ...c,
                  name: onboarding.companyName || c.name,
                  docSettings: ensureDemoDisabledDocSettings(c?.docSettings),
                  profile: {
                    ...prevProfile,
                    backendCompanyId: onboarding.companyId,
                    backendBranchId: onboarding.branchId || prevProfile.backendBranchId || null,
                  },
                };
              });
              return { ...prev, companies: nextCompanies };
            });
          } else {
            const nextKey = getDbStorageKey();
            setDbStorageKey(nextKey);
            _setDb(() => loadDbFromStorage());
          }

          setIsAuthenticated(true);
        }}
      />
    );
  }

  if (hasBranchRestriction && !authCtx.loading && authCtx.data && allowedBranchIds.length === 0) {
    return (
      <div className="min-h-screen ui-sunken flex items-center justify-center p-6">
        <div className="max-w-lg w-full ui-surface border rounded-xl p-6">
          <div className="ui-t-sec">No branches assigned</div>
          <div className="text-sm ui-muted mt-2">
            Your user does not have access to any branch. Ask an admin to assign branches to your user.
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => logout()}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
            >
              Logout
            </button>
          </div>
          {authCtx.error ? <div className="mt-3 text-xs text-[rgb(var(--neg))]">{authCtx.error}</div> : null}
        </div>
      </div>
    );
  }

  return (
    /*
     * The shell is exactly one viewport tall and does not scroll. The header
     * and the navigation rail are therefore fixed by construction, and the
     * content column is the only thing that moves.
     *
     * Sticky was not enough: a sticky rail still travels with the page until
     * it reaches its offset, so it visibly slid up on every scroll. Owning the
     * viewport removes the travel rather than compensating for it.
     */
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={{ backgroundColor: 'rgb(var(--app-bg))' }}
    >
      {/* Ambient brand light for the whole shell: fixed so it stays put while
          content scrolls, quiet so tables stay tables. The background colour
          itself is untouched — this paints over --app-bg, never replaces it. */}
      <div className="ui-ambient ui-ambient-quiet ui-ambient-fixed" aria-hidden="true" />
      <Toaster />
      {showOnboarding ? (
        <OnboardingWizard
          setDb={setDb}
          currentCompany={currentCompany}
          onDone={() => setOnboardDismissed(true)}
          onCreateInvoice={() => {
            setActive('invoices');
            setInvoiceEditor({ open: true, initial: null });
          }}
        />
      ) : null}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 ui-btn ui-btn-primary"
      >
        Skip to main content
      </a>

      <header
        className="shrink-0 z-40 backdrop-blur"
        style={{
          backgroundColor: 'rgb(var(--surface) / 0.85)',
          borderBottom: '1px solid rgb(var(--border))',
        }}
      >
        <div className="w-full px-4 lg:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Phone-only: the rail lives in a drawer, opened here. */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="ui-icon-btn md:hidden"
              aria-label="Open navigation"
              aria-expanded={mobileNavOpen}
            >
              <PanelLeftOpen size={18} aria-hidden="true" />
            </button>
            <Building2 size={17} style={{ color: 'rgb(var(--accent))' }} aria-hidden="true" />

            {availableOrgs.length > 1 ? (
              <div className="relative" ref={orgMenuRef}>
                <button
                  type="button"
                  onClick={() => setOrgMenuOpen((v) => !v)}
                  className="ui-btn ui-btn-ghost !px-1.5 max-w-[16rem]"
                  aria-haspopup="menu"
                  aria-expanded={orgMenuOpen}
                >
                  <span className="ui-title text-sm truncate">{activeOrgName}</span>
                  <ChevronDown size={14} aria-hidden="true" />
                </button>

                {orgMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute left-0 mt-2 w-72 rounded-lg overflow-hidden z-50 ui-card ui-in-pop"
                    style={{ boxShadow: 'var(--shadow-pop)', '--pop-origin': 'top left' }}
                  >
                    <div className="px-3 py-2 ui-subtle text-xs uppercase tracking-wide">Switch company</div>
                    {availableOrgs.map((o) => {
                      const isActive = String(o.orgId) === String(activeOrgId);
                      return (
                        <button
                          key={o.orgId}
                          type="button"
                          role="menuitem"
                          onClick={() => switchOrg(o.orgId)}
                          className="w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-[rgb(var(--surface-sunken))] flex items-center justify-between gap-2"
                          style={isActive ? { color: 'rgb(var(--accent))', fontWeight: 600 } : undefined}
                        >
                          <span className="truncate">{o.org?.name || o.orgId}</span>
                          {isActive ? <Check size={14} aria-hidden="true" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="ui-title text-sm truncate">{activeOrgName}</div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* The location shift lives here, on top of the software: branch
                first, then a warehouse within it. Each control appears only
                when there is a choice to make. */}
            {branchesForUser.length > 1 ? (
              <select
                value={activeBranchId || ''}
                onChange={(e) => setActiveBranch(e.target.value)}
                className="ui-select hidden md:block !h-9 !min-h-0 max-w-[11rem] text-sm"
                aria-label="Active branch"
              >
                {branchesForUser.map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.branchCode ? `${b.branchCode} - ${b.branchName || ''}`.trim() : b.branchName || `Branch ${b.id}`}
                  </option>
                ))}
              </select>
            ) : null}

            {warehousesForActiveBranch.length > 1 ? (
              <select
                value={activeWarehouseId || ''}
                onChange={(e) => setActiveWarehouse(e.target.value)}
                className="ui-select hidden md:block !h-9 !min-h-0 max-w-[11rem] text-sm"
                aria-label="Active warehouse"
              >
                <option value="">All warehouses</option>
                {warehousesForActiveBranch.map((w) => (
                  <option key={w.id} value={String(w.id)}>
                    {w.name || `Warehouse ${w.id}`}
                  </option>
                ))}
              </select>
            ) : null}

            {/*
              Quick create: the two-click path to any new document.

              Secondary, not primary. It was filled brand orange, and so is the
              one action every page puts in its own top right — so on the
              dashboard "New" and "New invoice" sat twelve pixels apart, both
              shouting, and neither reading as the thing to do. This one repeats
              on all fifty-nine screens; the page's own action is the one
              DESIGN.md reserves the accent for.
            */}
            <div className="relative" ref={quickRef}>
              <button
                type="button"
                onClick={() => setQuickOpen((v) => !v)}
                className="ui-btn ui-btn-secondary !h-9 !px-2.5"
                aria-haspopup="menu"
                aria-expanded={quickOpen}
                aria-label="Quick create"
              >
                <Plus size={16} aria-hidden="true" />
                <span className="hidden lg:inline">New</span>
              </button>
              {quickOpen ? (
                <div
                  role="menu"
                  className="ui-card ui-in-pop absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden py-1"
                  style={{ boxShadow: 'var(--shadow-pop)' }}
                >
                  {QUICK_CREATE.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setQuickOpen(false);
                        q.run();
                      }}
                      className="w-full px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-[rgb(var(--surface-sunken))]"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {/* Notifications: computed from the books, never invented. */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  if (!notifOpen) markNotifsSeen();
                }}
                className="ui-icon-btn relative !h-9 !w-9"
                aria-haspopup="menu"
                aria-expanded={notifOpen}
                aria-label={`Notifications${notifications.length ? `, ${notifications.length} item${notifications.length === 1 ? '' : 's'}` : ''}`}
              >
                <Bell size={16} aria-hidden="true" />
                {notifUnseen ? (
                  <span
                    className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: 'rgb(var(--brand))' }}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
              {notifOpen ? (
                <div
                  role="menu"
                  className="ui-card ui-in-pop absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden"
                  style={{ boxShadow: 'var(--shadow-pop)' }}
                >
                  <div className="px-4 py-2.5" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
                    <span className="ui-card-label" style={{ color: 'rgb(var(--fg))' }}>Notifications</span>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="ui-caption px-4 py-6 text-center">All clear — nothing needs attention.</p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setNotifOpen(false);
                          setActive(n.target);
                        }}
                        className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[rgb(var(--surface-sunken))]"
                        style={{ borderBottom: '1px solid rgb(var(--border))' }}
                      >
                        <span
                          className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: `rgb(var(--${n.tone}))` }}
                          aria-hidden="true"
                        />
                        <span>
                          <span className="block text-sm font-medium">{n.title}</span>
                          <span className="ui-caption">{n.body}</span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <span className="ui-pill ui-pill-neutral hidden lg:inline-flex">{activeLabel}</span>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />

            {/*
              Identity, top right, where people reach for it.

              The rail already carries an account menu at the bottom, and it
              stays — it is where somebody looking at navigation finds their
              own name. This one is the shortcut: a face in the corner, one
              click to the profile, and nothing else in it. Two doors to the
              same room is not duplication when the room is the one people ask
              for by two different names.
            */}
            <div className="relative shrink-0" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setAccountMenuOpen((v) => !v)}
                className="block h-8 w-8 shrink-0 rounded-full overflow-hidden"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                aria-label="Your profile"
                title={userEmail}
              >
                {userAvatarUrl ? (
                  <img
                    src={userAvatarUrl}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                    style={{ border: '1px solid rgb(var(--border))' }}
                  />
                ) : (
                  <span
                    className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: 'rgb(var(--accent-soft))', color: 'rgb(var(--brand-ink))' }}
                    aria-hidden="true"
                  >
                    {userInitials}
                  </span>
                )}
              </button>

              {accountMenuOpen ? (
                <div
                  role="menu"
                  className="ui-card ui-in-pop absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden py-1"
                  style={{ boxShadow: 'var(--shadow-pop)' }}
                >
                  <div className="flex items-center gap-3 px-3 py-2.5" style={{ borderBottom: '1px solid rgb(var(--border))' }}>
                    {userAvatarUrl ? (
                      <img
                        src={userAvatarUrl}
                        alt=""
                        width={36}
                        height={36}
                        className="h-9 w-9 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span
                        className="h-9 w-9 rounded-full inline-flex items-center justify-center text-xs font-bold shrink-0"
                        style={{ backgroundColor: 'rgb(var(--accent-soft))', color: 'rgb(var(--brand-ink))' }}
                        aria-hidden="true"
                      >
                        {userInitials}
                      </span>
                    )}
                    <span className="min-w-0">
                      {userDisplayName ? (
                        <span className="block text-sm font-semibold truncate">{userDisplayName}</span>
                      ) : null}
                      <span className="ui-caption block truncate">{userEmail}</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setActive('settingsProfile');
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[rgb(var(--surface-sunken))]"
                  >
                    <UserRound size={15} aria-hidden="true" /> My account
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      setActive('settings');
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[rgb(var(--surface-sunken))]"
                  >
                    <Settings size={15} aria-hidden="true" /> Settings
                  </button>

                  {/* Row density had no other home once the rail menu went. */}
                  <div className="px-3 py-2" style={{ borderTop: '1px solid rgb(var(--border))' }}>
                    <span className="ui-t-label block mb-1.5" style={{ color: 'rgb(var(--fg-subtle))' }}>
                      Row density
                    </span>
                    <div
                      className="flex items-center rounded-lg p-0.5"
                      style={{ backgroundColor: 'rgb(var(--surface-sunken))' }}
                      role="group"
                      aria-label="Row density"
                    >
                      {[
                        { key: 'comfortable', label: 'Comfortable' },
                        { key: 'compact', label: 'Compact' },
                      ].map((d) => (
                        <button
                          key={d.key}
                          type="button"
                          onClick={() => setDensity(d.key)}
                          aria-pressed={density === d.key}
                          className="flex-1 h-7 rounded-lg text-xs font-medium transition-colors"
                          style={
                            density === d.key
                              ? { backgroundColor: 'rgb(var(--surface))', color: 'rgb(var(--fg))', boxShadow: 'var(--shadow-card)' }
                              : { color: 'rgb(var(--fg-muted))' }
                          }
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountMenuOpen(false);
                      logout();
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[rgb(var(--surface-sunken))]"
                    style={{ borderTop: '1px solid rgb(var(--border))' }}
                  >
                    <LogOut size={15} aria-hidden="true" /> Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/*
        The verify-email strip used to sit here, above every screen, for as
        long as the address stayed unconfirmed. A permanent banner is not a
        prompt — it becomes part of the furniture within a day and then costs
        every screen a row of height forever.

        `resendVerification` is still wired; the prompt belongs in the account
        menu, where it can be acted on once rather than ignored daily.
      */}

      <div className="w-full flex-1 min-h-0 px-4 lg:px-6 py-5 flex flex-col md:flex-row gap-5 overflow-hidden">
        {mobileNavOpen ? (
          <div
            className="fixed inset-0 z-[110] md:hidden"
            style={{ backgroundColor: 'rgb(0 0 0 / 0.45)' }}
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
        ) : null}
        <aside
          className={`shrink-0 transition-[width] duration-200 ${navCollapsed ? 'ui-rail-narrow' : 'md:w-56 lg:w-60'} ${
            mobileNavOpen
              ? 'max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-[115] max-md:w-72 max-md:overflow-y-auto max-md:p-2 max-md:ui-in-left'
              : 'max-md:hidden'
          } md:block`}
        >
          <nav
            aria-label="Main"
            /* Height, not max-height: the account block is pinned to the foot
               of the rail, and a content-sized rail leaves it floating in the
               middle of the screen with nothing under it. */
            className="ui-panel p-2 md:h-full flex flex-col min-h-0"
          >
            {/* Collapse control: desktop only — on a phone the rail already
                stacks above the content and hiding labels saves nothing. */}
            <button
              type="button"
              onClick={toggleNavCollapsed}
              className={`ui-nav-item hidden md:flex ${navCollapsed ? 'md:justify-center' : ''}`}
              aria-pressed={navCollapsed}
              aria-label={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
              title={navCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            >
              {navCollapsed ? <PanelLeftOpen size={16} aria-hidden="true" /> : <PanelLeftClose size={16} aria-hidden="true" />}
              <span className={navCollapsed ? 'md:hidden' : ''}>Collapse</span>
            </button>

            <div className="space-y-0.5 min-h-0 flex-1 overflow-y-auto">
              {visibleNav.map((entry) => {
                if (entry.type === 'item') {
                  const Icon = entry.icon;
                  const reportKeys = new Set([
                    'reports',
                    'trialBalance',
                    'profitLoss',
                    'balanceSheet',
                    'cashFlow',
                    'gstr1',
                    'gstr3b',
                    'salesReports',
                  ]);
                  const isReportsEntry = entry.key === 'reports';
                  const isActive = active === entry.key || (isReportsEntry && reportKeys.has(active));
                  return (
                    <button
                      key={entry.key}
                      type="button"
                      onClick={() => setActive(entry.key)}
                      className={`ui-nav-item ${navCollapsed ? 'md:justify-center' : ''}`}
                      data-level="module"
                      data-active={isActive}
                      aria-current={isActive ? 'page' : undefined}
                      title={navCollapsed ? entry.label : undefined}
                    >
                      <Icon
                        size={16}
                        aria-hidden="true"
                        {...(entry.ph ? { weight: 'duotone' } : {})}
                        
                      />
                      <span className={navCollapsed ? 'md:hidden' : ''}>{entry.label}</span>
                    </button>
                  );
                }

                const GroupIcon = entry.icon;
                const isOpen = !!openGroups[entry.key];
                const isGroupActive = activeGroupKey === entry.key;

                return (
                  <div key={entry.key}>
                    <button
                      type="button"
                      onClick={() => {
                        // Collapsed rail: a group tap re-opens the rail with
                        // that group expanded — a flyout would need its own
                        // focus management for four entries.
                        if (navCollapsed && window.innerWidth >= 768) {
                          toggleNavCollapsed();
                          setOpenGroups({ [entry.key]: true });
                          return;
                        }
                        // One group open at a time. With eleven modules and
                        // Settings alone running to forty entries, two groups
                        // open pushes the rest below the fold and the rail
                        // becomes something you scroll rather than read.
                        setOpenGroups((prev) => (prev[entry.key] ? {} : { [entry.key]: true }));
                      }}
                      className={`ui-nav-item ${navCollapsed ? 'md:justify-center' : 'justify-between'}`}
                      data-level="module"
                      data-active={isGroupActive || undefined}
                      aria-expanded={isOpen}
                      title={navCollapsed ? entry.label : undefined}
                    >
                      <span className={`flex items-center gap-2.5 ${navCollapsed ? 'md:gap-0' : ''}`}>
                        <GroupIcon
                          size={16}
                          aria-hidden="true"
                          {...(entry.ph ? { weight: 'duotone' } : {})}
                          
                        />
                        <span className={navCollapsed ? 'md:hidden' : ''}>{entry.label}</span>
                      </span>
                      <ChevronDown
                        size={14}
                        aria-hidden="true"
                        className={`transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'} ${navCollapsed ? 'md:hidden' : ''}`}
                      />
                    </button>

                    {isOpen && (
                      <div className={`mt-0.5 space-y-0.5 pl-5 ${navCollapsed ? 'md:hidden' : ''}`}>
                        {entry.items.map((item) => {
                          // A heading inside a group. Settings is fifteen items
                          // and heading for twenty-five once Payroll, CRM and
                          // Attendance arrive; without headings it is a list
                          // you read every time instead of a shape you learn.
                          if (item.type === 'subgroup') {
                            return (
                              <div
                                key={`sub-${item.label}`}
                                className="ui-t-label px-2.5 pt-3 pb-1 first:pt-1"
                              >
                                {item.label}
                              </div>
                            );
                          }

                          const Icon = item.icon;
                          const isActive = active === item.key;
                          // What the screen would tell you if you opened it.
                          const state = typeof item.state === 'function' ? item.state() : item.state;
                          return (
                            <button
                              key={item.key}
                              type="button"
                              onClick={() => setActive(item.key)}
                              className="ui-nav-item"
                              data-active={isActive}
                              aria-current={isActive ? 'page' : undefined}
                            >
                              <Icon
                                size={15}
                                aria-hidden="true"
                                
                              />
                              <span className="min-w-0 truncate">{item.label}</span>
                              {state ? (
                                <span className="ml-auto shrink-0 text-xs ui-subtle tabular-nums">{state}</span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/*
              The rail used to carry an account menu here, pinned to the bottom.
              It moved to the avatar in the top right — one identity control,
              where the sketch put it. Two doors to the same room turned out to
              be two things to keep in step for no gain.
            */}
          </nav>
        </aside>

        {paletteOpen ? (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          items={paletteItems}
          searchRecords={(q) => searchRecords(recordIndex, q)}
          onSelect={(item) => {
            // A record hands its number to the list it opens, so the screen
            // arrives filtered to the thing that was picked rather than showing
            // eighty-eight rows and leaving the user to find it again.
            if (item.screen) {
              setSearchSeed(item.screen, item.seed);
              setActive(item.screen);
              return;
            }
            setActive(item.key);
          }}
        />
        ) : null}

        <main
          id="main-content"
          key={active}
          className="min-w-0 flex-1 ui-in-fade ui-content overflow-y-auto overflow-x-hidden min-h-0 pe-4"
          /*
           * Two fixes, because the two families of scrollbar break this
           * differently.
           *
           * Overlay scrollbars — macOS, and most touch devices — take no
           * layout width at all and are painted *over* the content, so the
           * primary action in the top right ended up half under the bar. Only
           * padding clears that, and it has to survive the bar widening on
           * hover, which is why it is 16px rather than 4.
           *
           * Classic scrollbars — Windows, most Linux — do take width, and
           * without a reserved gutter the whole page jolts sideways the moment
           * content grows past one viewport. scrollbar-gutter holds the track
           * open whether or not the bar is showing.
           */
          style={{ scrollbarGutter: 'stable' }}
        >
          {/*
            A failed warehouse load used to be silent: the dropdown was simply
            empty, which reads as "no warehouses configured" when the truth may
            be an expired session or a server that is down. Branch errors were
            already surfaced; this is the warehouse counterpart.
          */}
          {warehousesError ? (
            <div className="mb-4 rounded-lg border border-[rgb(var(--neg)/0.35)] bg-[rgb(var(--neg-soft))] px-4 py-3 text-sm text-[rgb(var(--neg))]">
              Could not load warehouses: {warehousesError}
            </div>
          ) : null}
          {reportPageKeys.has(String(active)) && active !== 'reports' ? (
            <div className="space-y-4">
              <div>
                <button
                  type="button"
                  onClick={() => setActive('reports')}
                  className="ui-btn ui-btn-secondary"
                >
                  Back
                </button>
              </div>
              <Suspense fallback={<SkeletonStats count={4} />}>{page}</Suspense>
            </div>
          ) : (
            <Suspense fallback={<SkeletonStats count={4} />}>{page}</Suspense>
          )}
        </main>
      </div>

      {modal.content && (
        <Modal onClose={() => openModal(null)} title={modal.title} maxWidthClass={modal.maxWidthClass}>
          {modal.content}
        </Modal>
      )}
    </div>
  );
};

/**
 * The permission set is fetched once per session and shared by the whole shell.
 * `enabled` keeps the request from firing before there is a token and an org to
 * ask about, and the session key remounts the provider when either changes.
 */
const App = () => {
  const [sessionKey, setSessionKey] = useState(() => {
    const token = String(localStorage.getItem('token') || '').trim();
    const org = String(localStorage.getItem('activeOrgId') || '').trim();
    return `${token ? 'auth' : 'anon'}:${org}`;
  });

  useEffect(() => {
    // Login and org switching both happen through localStorage in this app, so
    // poll cheaply rather than threading a callback through every call site.
    const id = setInterval(() => {
      const token = String(localStorage.getItem('token') || '').trim();
      const org = String(localStorage.getItem('activeOrgId') || '').trim();
      const next = `${token ? 'auth' : 'anon'}:${org}`;
      setSessionKey((prev) => (prev === next ? prev : next));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const hasSession = sessionKey.startsWith('auth:') && sessionKey.split(':')[1];

  return (
    <PermissionProvider key={sessionKey} enabled={Boolean(hasSession)}>
      <FeatureProvider key={`f:${sessionKey}`} enabled={Boolean(hasSession)}>
        <AppShell />
      </FeatureProvider>
    </PermissionProvider>
  );
};

export default App;
