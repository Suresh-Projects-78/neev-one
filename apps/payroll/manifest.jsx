import { ArrowUpRight, BadgePercent, BarChart3, CalendarClock, FileText, Landmark, Layers, Percent, RefreshCw, Table2, Users, Wallet } from 'lucide-react';

import PayrollOverview from './src/screens/PayrollOverview';
import PayRuns from './src/screens/PayRuns';
import SalarySlips from './src/screens/SalarySlips';
import PayrollPayments from './src/screens/PayrollPayments';
import PayrollAdjustments from './src/screens/PayrollAdjustments';
import SalaryStructures from './src/screens/SalaryStructures';
import SalaryAssignments from './src/screens/SalaryAssignments';
import SalaryRevisions from './src/screens/SalaryRevisions';
import PayrollLoans from './src/screens/PayrollLoans';
import PayrollCompliance from './src/screens/PayrollCompliance';
import PayrollReports from './src/screens/PayrollReports';
import PayrollLedgerMapping from './src/screens/PayrollLedgerMapping';

/**
 * Everything the shell knows about Payroll.
 *
 * Its navigation, its screens, and where it opens. Nothing else — no route
 * table shared with another app, no entry in anybody else's sidebar. Deleting
 * this file removes Payroll from Clor without leaving a hole in Accounting,
 * which is the test of whether the boundary is real.
 *
 * Payroll owns payroll.db and reaches Accounting only through an adapter, so a
 * company that has Payroll and not Accounting still gets everything here
 * except the one thing that genuinely needs a ledger: posting.
 */
export const payrollApp = {
  id: 'payroll',
  name: 'Payroll',
  icon: Wallet,
  blurb: 'Salaries, statutory deductions, payslips, and the journal they post.',
  available: true,
  database: 'payroll.db',
  home: 'overview',

  nav: [
    { key: 'overview', label: 'Overview', icon: BarChart3 },
    { key: 'runs', label: 'Pay Runs', icon: CalendarClock },
    { key: 'slips', label: 'Salary Slips', icon: FileText },
    { key: 'payments', label: 'Payments', icon: ArrowUpRight },
    { key: 'adjustments', label: 'Adjustments', icon: Percent },
    { key: 'structures', label: 'Salary Structures', icon: Layers },
    { key: 'assignments', label: 'Salary Assignments', icon: Users },
    { key: 'revisions', label: 'Salary Revisions', icon: RefreshCw },
    { key: 'loans', label: 'Loans & Advances', icon: Landmark },
    { key: 'compliance', label: 'Compliance', icon: BadgePercent },
    { key: 'reports', label: 'Reports', icon: Table2 },
    { key: 'ledgers', label: 'Ledger mapping', icon: Landmark },
  ],

  screens: {
    overview: PayrollOverview,
    runs: PayRuns,
    slips: SalarySlips,
    payments: PayrollPayments,
    adjustments: PayrollAdjustments,
    structures: SalaryStructures,
    assignments: SalaryAssignments,
    revisions: SalaryRevisions,
    loans: PayrollLoans,
    compliance: PayrollCompliance,
    reports: PayrollReports,
    ledgers: PayrollLedgerMapping,
  },
};
