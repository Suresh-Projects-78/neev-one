import React, { useMemo, useState } from 'react';
import { BadgePercent, Ban, Download, FileText, Pencil, Plus, Receipt, Trash2, Users } from 'lucide-react';

import { ColumnHeader, useColumnFilters } from '../../components/ColumnFilters';
import { exportRows, useListSearch } from '../../components/ListToolbar';
import { EmptyState, TableTotals } from '../../components/ui/Primitives';
import { confirmDialog, notify } from '../../components/ui/notify';
import DocumentListShell from '../../components/list/DocumentListShell';
import { CustomerForm } from '../../components/pickers/CustomerPicker';
import PartyDetail from '../parties/PartyDetail';
import { getCustomerDisplayName } from '../../utils/contacts';
import { formatMoney } from '../../utils/money';
import { isGstRegistered, outstandingByParty, standingOf } from '../../utils/partyStanding';

/**
 * The customer master.
 *
 * Lifted out of App.jsx when it moved onto the shared list layout: it is a
 * screen in its own right, and a screen that cannot be rendered on its own
 * cannot be tested on its own either.
 */
export default function CustomersList({ db, setDb, currentCompany }) {
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

  /*
   * What each customer owes, from the invoices themselves.
   *
   * The list carried a stored `balance` that nothing maintained, so the column
   * read ₹0.00 for every customer while the invoice list showed lakhs against
   * the same names. A customer master is opened to answer "who owes me what".
   */
  const customerStanding = useMemo(
    () => outstandingByParty({ docs: db.invoices || [], idKey: 'customerId', companyId: currentCompany.id }),
    [db.invoices, currentCompany.id]
  );

  const [custStatus, setCustStatus] = useState('');
  const CUST_STATUS_TABS = [
    { value: '', label: 'All', tone: 'all' },
    { value: 'Owing', label: 'Owing', tone: 'outstanding' },
    { value: 'Overdue', label: 'Overdue', tone: 'overdue' },
    { value: 'Registered', label: 'GST registered', tone: 'paid' },
    { value: 'Unregistered', label: 'Unregistered', tone: 'draft' },
  ];
  const custMatches = (c, tab) => {
    const st = standingOf(customerStanding, c.id);
    if (tab === 'Owing') return st.outstanding > 0.0001;
    if (tab === 'Overdue') return st.overdue > 0.0001;
    if (tab === 'Registered') return isGstRegistered(c);
    if (tab === 'Unregistered') return !isGstRegistered(c);
    return true;
  };
  const visibleCustomers = custStatus ? shownCustomers.filter((c) => custMatches(c, custStatus)) : shownCustomers;

  const custStatusCounts = useMemo(() => {
    const counts = { '': shownCustomers.length };
    for (const t of CUST_STATUS_TABS) {
      if (!t.value) continue;
      counts[t.value] = shownCustomers.filter((c) => custMatches(c, t.value)).length;
    }
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownCustomers, customerStanding]);

  const custHeadline = useMemo(() => {
    let outstanding = 0;
    let overdue = 0;
    let registered = 0;
    let owing = 0;
    for (const c of shownCustomers) {
      const st = standingOf(customerStanding, c.id);
      outstanding += st.outstanding;
      overdue += st.overdue;
      if (st.outstanding > 0.0001) owing += 1;
      if (isGstRegistered(c)) registered += 1;
    }
    return { count: shownCustomers.length, outstanding, overdue, registered, owing };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownCustomers, customerStanding]);

  const custExportColumns = [
    { key: 'name', label: 'Name', value: (r) => getCustomerDisplayName(r) },
    { key: 'phone', label: 'Phone', value: (r) => r.mobile || r.phone || '' },
    { key: 'email', label: 'Email' },
    { key: 'gstRegistration', label: 'GST Reg.' },
    { key: 'gstin', label: 'GSTIN' },
    { key: 'outstanding', label: 'Outstanding', value: (r) => standingOf(customerStanding, r.id).outstanding },
    { key: 'overdue', label: 'Overdue', value: (r) => standingOf(customerStanding, r.id).overdue },
  ];

  const getCustomerReferences = (customerId) => {
    const idStr = String(customerId);
    const sources = [
      { key: 'invoices', label: 'Invoice' },
      { key: 'estimates', label: 'Quotation' },
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

  /*
   * The form carries its own header — the name on the left, Back, Cancel, Save
   * and the ⋮ on the right, which is what the master asks for. This screen used
   * to print a second heading and a second Back above the card.
   */
  if (isCreating) {
    const seed = isCreating === true ? null : isCreating;
    return (
      <div className="space-y-6">
        <div className="ui-surface rounded-xl shadow-sm border p-6">
          <CustomerForm
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            seedData={seed}
            onClose={() => setIsCreating(false)}
          />
        </div>
      </div>
    );
  }

  if (editingCustomer) {
    return (
      <div className="space-y-6">
        <div className="ui-surface rounded-xl shadow-sm border p-6">
          <CustomerForm
            db={db}
            setDb={setDb}
            currentCompany={currentCompany}
            initialData={editingCustomer}
            onClose={() => setEditingCustomer(null)}
            onDuplicate={(values) => {
              setEditingCustomer(null);
              setIsCreating(values);
            }}
          />
        </div>
      </div>
    );
  }


  return (
    <DocumentListShell
      title="Customers"
      description="Who you sell to, and what each of them owes"
      company={currentCompany}
      search={{
        value: customerSearch.query,
        onChange: customerSearch.setQuery,
        placeholder: 'Search customers…',
        label: 'Search customers',
      }}
      moreItems={[{ key: 'export', label: 'Export customers', Icon: Download }]}
      onMoreSelect={(k) => {
        if (k !== 'export') return;
        exportRows({
          fileName: `Customers_${currentCompany?.name || 'company'}`,
          label: 'customer(s)',
          columns: custExportColumns,
          rows: visibleCustomers,
        });
      }}
      primary={
        <button type="button" onClick={() => setIsCreating(true)} className="ui-btn ui-btn-primary">
          <Plus size={16} aria-hidden="true" /> New Customer
        </button>
      }
      cards={[
        { label: 'Total customers', value: custHeadline.count, count: true, tone: 'draft', Icon: Users },
        { label: 'Owing you', value: custHeadline.owing, count: true, tone: 'outstanding', Icon: FileText },
        { label: 'Outstanding', value: custHeadline.outstanding, tone: 'sent', Icon: Receipt },
        { label: 'Overdue', value: custHeadline.overdue, tone: 'overdue', Icon: Ban },
        { label: 'GST registered', value: custHeadline.registered, count: true, tone: 'paid', Icon: BadgePercent },
      ]}
      tabs={CUST_STATUS_TABS}
      tabsLabel="Customer filter"
      statusValue={custStatus}
      statusCounts={custStatusCounts}
      onStatusChange={setCustStatus}
      tip={{
        storageKey: 'neev.tip.customers',
        text: 'Outstanding and overdue are read off the invoices themselves — there is no balance to keep up to date.',
        Icon: Users,
      }}
    >
      <div className="overflow-x-auto ui-table-scroll">
        <table className="ui-table ui-table-wide ui-table-sticky">
          <thead>
            <tr>
              <ColumnHeader label="Name" col="name" state={customerSearchFilters} />
              <ColumnHeader label="Phone" col="phone" state={customerSearchFilters} />
              <ColumnHeader label="Email" col="email" state={customerSearchFilters} />
              <ColumnHeader label="GST Reg." col="gstReg" state={customerSearchFilters} />
              <ColumnHeader label="GSTIN" col="gstin" state={customerSearchFilters} />
              <th scope="col" className="ui-num">Outstanding</th>
              {/* Overdue beside outstanding, not instead of it: the second
                  figure is the one somebody rings about. */}
              <th scope="col" className="ui-num">Overdue</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="ui-rows">
            {visibleCustomers.length === 0 ? (
              <tr>
                <td colSpan="8">
                  <EmptyState
                    icon={Users}
                    kind="new"
                    title={custStatus ? 'No customers match' : 'No customers yet'}
                    description={
                      custStatus
                        ? 'Nothing in this company matches that filter.'
                        : 'A customer is who an invoice is addressed to — their GSTIN decides how the tax on it is split.'
                    }
                    routes={
                      custStatus
                        ? undefined
                        : [
                            {
                              label: 'Add one now',
                              description: 'Name, GSTIN, where to send the invoice.',
                              onSelect: () => setIsCreating(true),
                            },
                            {
                              label: 'Import your list',
                              description: 'Bring across the customers you already have.',
                              onSelect: () => setIsCreating(true),
                            },
                          ]
                    }
                  />
                </td>
              </tr>
            ) : (
              visibleCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    if (e.target?.closest?.('button')) return;
                    setViewingCustomer(customer);
                  }}
                >
                  <td className="ui-col-entity truncate" title={getCustomerDisplayName(customer)}>
                    {getCustomerDisplayName(customer)}
                  </td>
                  <td className="ui-col-meta truncate" title={customer.mobile || customer.phone || ''}>
                    {customer.mobile || customer.phone || '-'}
                  </td>
                  <td className="ui-col-meta truncate" title={customer.email || ''}>
                    {customer.email || '-'}
                  </td>
                  <td className="ui-col-meta">{customer.gstRegistration || 'Unregistered'}</td>
                  <td className="ui-col-meta truncate" title={customer.gstin || ''}>
                    {customer.gstin || '-'}
                  </td>
                  <td className="ui-col-amount">
                    {formatMoney(standingOf(customerStanding, customer.id).outstanding, currentCompany)}
                  </td>
                  <td className="ui-col-amount">
                    {standingOf(customerStanding, customer.id).overdue > 0.0001 ? (
                      <span className="ui-amount-neg">
                        {formatMoney(standingOf(customerStanding, customer.id).overdue, currentCompany)}
                      </span>
                    ) : (
                      <span className="ui-muted">—</span>
                    )}
                  </td>
                  <td className="ui-col-meta">
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
      <TableTotals
        count={visibleCustomers.length}
        totalCount={customers.length}
        noun="customers"
        figures={[{ label: 'Outstanding', value: formatMoney(custHeadline.outstanding, currentCompany) }]}
      />
    </DocumentListShell>
  );
}
