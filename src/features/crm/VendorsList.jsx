import React, { useMemo, useState } from 'react';
import { BadgePercent, Ban, Download, FileText, Pencil, Plus, Receipt, Trash2, Truck } from 'lucide-react';

import { ColumnHeader, useColumnFilters } from '../../components/ColumnFilters';
import { exportRows, useListSearch } from '../../components/ListToolbar';
import { EmptyState, TableTotals } from '../../components/ui/Primitives';
import { confirmDialog, notify } from '../../components/ui/notify';
import DocumentListShell from '../../components/list/DocumentListShell';
import { VendorForm } from '../../components/pickers/VendorPicker';
import PartyDetail from '../parties/PartyDetail';
import { getVendorDisplayName } from '../../utils/contacts';
import { formatMoney } from '../../utils/money';
import { isGstRegistered, outstandingByParty, standingOf } from '../../utils/partyStanding';

/**
 * The vendor master.
 *
 * Lifted out of App.jsx when it moved onto the shared list layout: it is a
 * screen in its own right, and a screen that cannot be rendered on its own
 * cannot be tested on its own either.
 */
export default function VendorsList({ db, setDb, currentCompany }) {
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

  /*
   * What is owed to each vendor, from the bills themselves — the mirror of the
   * customer side, and computed the same way for the same reason: the stored
   * `balance` was never maintained and read ₹0.00 for everybody.
   */
  const vendorStanding = useMemo(
    () => outstandingByParty({ docs: db.bills || [], idKey: 'vendorId', companyId: currentCompany.id }),
    [db.bills, currentCompany.id]
  );

  const [vendStatus, setVendStatus] = useState('');
  const VEND_STATUS_TABS = [
    { value: '', label: 'All', tone: 'all' },
    { value: 'Owed', label: 'You owe', tone: 'outstanding' },
    { value: 'Overdue', label: 'Overdue', tone: 'overdue' },
    { value: 'Registered', label: 'GST registered', tone: 'paid' },
    { value: 'Unregistered', label: 'Unregistered', tone: 'draft' },
  ];
  const vendMatches = (v, tab) => {
    const st = standingOf(vendorStanding, v.id);
    if (tab === 'Owed') return st.outstanding > 0.0001;
    if (tab === 'Overdue') return st.overdue > 0.0001;
    if (tab === 'Registered') return isGstRegistered(v);
    if (tab === 'Unregistered') return !isGstRegistered(v);
    return true;
  };
  const visibleVendors = vendStatus ? shownVendors.filter((v) => vendMatches(v, vendStatus)) : shownVendors;

  const vendStatusCounts = useMemo(() => {
    const counts = { '': shownVendors.length };
    for (const t of VEND_STATUS_TABS) {
      if (!t.value) continue;
      counts[t.value] = shownVendors.filter((v) => vendMatches(v, t.value)).length;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownVendors, vendorStanding]);

  const vendHeadline = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let registered = 0;
    let owed = 0;
    for (const v of shownVendors) {
      const st = standingOf(vendorStanding, v.id);
      outstanding += st.outstanding;
      overdue += st.overdue;
      if (st.outstanding > 0.0001) owed += 1;
      if (isGstRegistered(v)) registered += 1;
    }
    return { count: shownVendors.length, outstanding, overdue, registered, owed };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownVendors, vendorStanding]);

  const vendExportColumns = [
    { key: 'name', label: 'Name', value: (r) => getVendorDisplayName(r) },
    { key: 'phone', label: 'Phone', value: (r) => r.mobile || r.phone || '' },
    { key: 'email', label: 'Email' },
    { key: 'gstRegistration', label: 'GST Reg.' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'outstanding', label: 'Payable', value: (r) => standingOf(vendorStanding, r.id).outstanding },
    { key: 'overdue', label: 'Overdue', value: (r) => standingOf(vendorStanding, r.id).overdue },
  ];

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
      <div className="space-y-6">
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
      <div className="space-y-6">
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
    <DocumentListShell
      title="Vendors"
      description="Who you buy from, and what you still owe each of them"
      company={currentCompany}
      search={{
        value: vendorSearch.query,
        onChange: vendorSearch.setQuery,
        placeholder: 'Search vendors…',
        label: 'Search vendors',
      }}
      moreItems={[{ key: 'export', label: 'Export vendors', Icon: Download }]}
      onMoreSelect={(k) => {
        if (k !== 'export') return;
        exportRows({
          fileName: `Vendors_${currentCompany?.name || 'company'}`,
          label: 'vendor(s)',
          columns: vendExportColumns,
          rows: visibleVendors,
        });
      }}
      primary={
        <button type="button" onClick={() => setIsCreating(true)} className="ui-btn ui-btn-primary">
          <Plus size={16} aria-hidden="true" /> New Vendor
        </button>
      }
      cards={[
        { label: 'Total vendors', value: vendHeadline.count, count: true, tone: 'draft', Icon: Truck },
        { label: 'You owe', value: vendHeadline.owed, count: true, tone: 'outstanding', Icon: FileText },
        { label: 'Payable', value: vendHeadline.outstanding, tone: 'sent', Icon: Receipt },
        { label: 'Overdue', value: vendHeadline.overdue, tone: 'overdue', Icon: Ban },
        { label: 'GST registered', value: vendHeadline.registered, count: true, tone: 'paid', Icon: BadgePercent },
      ]}
      tabs={VEND_STATUS_TABS}
      tabsLabel="Vendor filter"
      statusValue={vendStatus}
      statusCounts={vendStatusCounts}
      onStatusChange={setVendStatus}
      tip={{
        storageKey: 'neev.tip.vendors',
        text: 'Payable and overdue are read off the bills themselves — a vendor with an unregistered GSTIN puts the purchase under reverse charge.',
        Icon: Truck,
      }}
    >
      <div className="overflow-x-auto ui-table-scroll">
        <table className="ui-table ui-table-wide ui-table-sticky">
          <thead>
            <tr>
              <ColumnHeader label="Name" col="name" state={vendorSearchFilters} />
              <ColumnHeader label="Phone" col="phone" state={vendorSearchFilters} />
              <ColumnHeader label="Email" col="email" state={vendorSearchFilters} />
              <ColumnHeader label="GST Reg." col="gstReg" state={vendorSearchFilters} />
              <ColumnHeader label="GSTIN" col="gstin" state={vendorSearchFilters} />
              <th scope="col" className="ui-num">Payable</th>
              <th scope="col" className="ui-num">Overdue</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="ui-rows">
            {visibleVendors.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <EmptyState
                    icon={Truck}
                    kind="new"
                    title={vendStatus ? 'No vendors match' : 'No vendors yet'}
                    description={
                      vendStatus
                        ? 'Nothing in this company matches that filter.'
                        : 'A vendor is who a bill comes from — their GSTIN decides whether you can claim the tax on it.'
                    }
                    routes={
                      vendStatus
                        ? undefined
                        : [
                            {
                              label: 'Add one now',
                              description: 'Name, GSTIN, how you pay them.',
                              onSelect: () => setIsCreating(true),
                            },
                            {
                              label: 'Import your list',
                              description: 'Bring across the suppliers you already buy from.',
                              onSelect: () => setIsCreating(true),
                            },
                          ]
                    }
                  />
                </td>
              </tr>
            ) : (
              visibleVendors.map((vendor) => (
                <tr
                  key={vendor.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    if (e.target?.closest?.('button')) return;
                    setViewingVendor(vendor);
                  }}
                >
                  <td className="ui-col-entity truncate" title={getVendorDisplayName(vendor) || ''}>
                    {getVendorDisplayName(vendor) || '-'}
                  </td>
                  <td className="ui-col-meta">{vendor.mobile || vendor.phone || '-'}</td>
                  <td className="ui-col-meta truncate" title={vendor.email || ''}>
                    {vendor.email || '-'}
                  </td>
                  <td className="ui-col-meta">{vendor.gstRegistration || 'Unregistered'}</td>
                  <td className="ui-col-meta truncate" title={vendor.gstin || ''}>
                    {vendor.gstin || '-'}
                  </td>
                  <td className="ui-col-amount">
                    {formatMoney(standingOf(vendorStanding, vendor.id).outstanding, currentCompany)}
                  </td>
                  <td className="ui-col-amount">
                    {standingOf(vendorStanding, vendor.id).overdue > 0.0001 ? (
                      <span className="ui-amount-neg">
                        {formatMoney(standingOf(vendorStanding, vendor.id).overdue, currentCompany)}
                      </span>
                    ) : (
                      <span className="ui-muted">—</span>
                    )}
                  </td>
                  <td className="ui-col-meta">
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
      <TableTotals
        count={visibleVendors.length}
        totalCount={vendors.length}
        noun="vendors"
        figures={[{ label: 'Payable', value: formatMoney(vendHeadline.outstanding, currentCompany) }]}
      />
    </DocumentListShell>
  );
}
