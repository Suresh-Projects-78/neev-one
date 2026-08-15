// ...existing code...
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const config = require('./config');
const { sequelize, Role } = require('./models');

const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/company');
const branchRoutes = require('./routes/branch');
const userRoutes = require('./routes/user');
const roleRoutes = require('./routes/role');
const warehouseRoutes = require('./routes/warehouse');
const contextRoutes = require('./routes/context');
const sampleRoutes = require('./routes/sample');
const profileRoutes = require('./routes/profile');
const { normalizePermissions } = require('./services/permissionCatalog');

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use('/api/auth', authRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/warehouses', warehouseRoutes);
app.use('/api/context', contextRoutes);
app.use('/api/sample', sampleRoutes);
app.use('/api/profile', profileRoutes);
 

// Health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Handle DevTools probe to eliminate 404/CSP noise (return 204 No Content)
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.sendStatus(204);
});

async function init() {
  // sync DB and seed default roles
  await sequelize.sync({ alter: true });
  const roles = [
    { key: 'admin', label: 'Admin', isSystem: true, permissions: ['*'] },
    {
      key: 'accountant',
      label: 'Accountant',
      isSystem: true,
      permissions: [
        'dashboard.view',
        'sales.invoices.view',
        'sales.invoices.create',
        'sales.invoices.edit',
        'sales.receipts.view',
        'sales.receipts.create',
        'purchases.bills.view',
        'purchases.bills.create',
        'purchases.bills.edit',
        'purchases.payments.view',
        'purchases.payments.create',
        'journalEntries.view',
        'journalEntries.create',
        'expenses.view',
        'expenses.create',
        'cashBank.view',
        'inventory.view',
        'reports.view',
        'master.items.view',
        'master.items.create',
        'master.items.edit',
        'master.customers.view',
        'master.customers.create',
        'master.customers.edit',
        'master.vendors.view',
        'master.vendors.create',
        'master.vendors.edit',
        'settings.company.view',
        'settings.tax.view',
      ],
    },
    {
      key: 'viewer',
      label: 'Viewer',
      isSystem: true,
      permissions: [
        'dashboard.view',
        'sales.invoices.view',
        'sales.receipts.view',
        'sales.estimates.view',
        'sales.creditNotes.view',
        'purchases.bills.view',
        'purchases.payments.view',
        'purchases.purchaseOrders.view',
        'purchases.debitNotes.view',
        'journalEntries.view',
        'expenses.view',
        'cashBank.view',
        'inventory.view',
        'reports.view',
        'reports.trialBalance.view',
        'reports.profitLoss.view',
        'reports.balanceSheet.view',
        'reports.cashFlow.view',
        'reports.gstr1.view',
        'reports.gstr3b.view',
        'reports.salesReports.view',
        'master.items.view',
        'master.customers.view',
        'master.vendors.view',
        'master.chartOfAccounts.view',
        'master.gstRates.view',
        'master.invoiceTemplates.view',
        'master.numbering.view',
        'settings.company.view',
        'settings.tax.view',
      ],
    },
  ];

  for (const r of roles) {
    const defaults = {
      ...r,
      companyId: null,
      permissions: normalizePermissions(r.permissions),
    };
    const [row] = await Role.findOrCreate({ where: { key: r.key }, defaults });
    // keep existing rows up-to-date when we add new fields
    await row.update({
      label: defaults.label,
      isSystem: true,
      companyId: null,
      permissions: defaults.permissions,
    });
  }

  // bind explicitly to 0.0.0.0 so the server accepts connections from localhost and external
  const server = app.listen(config.port, '0.0.0.0', () => {
    const addr = server.address();
    console.log(`Server running PID:${process.pid}`);
    try {
      console.log('Address:', addr);
      console.log(`Accessible at http://0.0.0.0:${config.port} and http://127.0.0.1:${config.port}`);
    } catch (e) {
      console.log('Startup address logging failed', e && e.stack ? e.stack : e);
    }
  });

  server.on('error', (err) => {
    console.error('Server error during listen:', err && err.message ? err.message : err);
    process.exit(1);
  });

  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err && err.stack ? err.stack : err);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled rejection:', reason && reason.stack ? reason.stack : reason);
  });
}

init().catch((e) => { console.error(e); process.exit(1); });
