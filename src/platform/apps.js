import { BookOpen, Briefcase, UserRound, Wallet } from 'lucide-react';

/**
 * The applications Clor is made of.
 *
 * Clor is a platform, not one program with modules. Accounting is the oldest
 * and most complete of its applications, which is why it used to look like the
 * whole product — but it is one app among several, and this is the list that
 * says so.
 *
 * Everything that needs to know what apps exist reads this: the marketing
 * header, the sidebar's app switcher, and the decision about where somebody
 * lands after signing in. One list, so a new app appears in all three by being
 * added here rather than by being remembered in three places.
 *
 * `feature` is the flag that says a company has the app. It stays the
 * subscription question — which apps a tenant is paying for — and is checked
 * the same way everywhere.
 *
 * `home` is the screen key the app opens on. It is deliberately the app's own
 * overview rather than a shared dashboard: somebody who only uses Payroll
 * should land in Payroll.
 */

export const APPS = [
  {
    id: 'accounting',
    name: 'Accounting',
    /* What it is for, in the words of somebody deciding whether they need it. */
    blurb: 'Invoices, bills, GST and a double-entry ledger that balances itself.',
    icon: BookOpen,
    feature: null, // Accounting is the base application; every tenant has it.
    home: 'dashboard',
    route: '/app/accounting',
    available: true,
  },
  {
    id: 'payroll',
    name: 'Payroll',
    blurb: 'Salaries, statutory deductions, payslips, and the journal they post.',
    icon: Wallet,
    feature: 'payroll',
    home: 'payrollOverview',
    route: '/app/payroll',
    available: true,
  },
  {
    id: 'people',
    name: 'People',
    blurb: 'The staff directory every other app refers to.',
    icon: UserRound,
    feature: 'people',
    home: null,
    route: '/app/people',
    /* Not built yet. Listed because a customer deciding on Clor should see
       where it is going, and hidden from the switcher until it exists. */
    available: false,
  },
  {
    id: 'projects',
    name: 'Projects',
    blurb: 'Projects, time and what each of them cost.',
    icon: Briefcase,
    feature: 'projects',
    home: null,
    route: '/app/projects',
    available: false,
  },
];

/** The apps a company actually has, in the order above. */
export const subscribedApps = (isEnabled) =>
  APPS.filter((app) => app.available && (!app.feature || isEnabled(app.feature)));

/** The apps a company could add. */
export const availableApps = (isEnabled) =>
  APPS.filter((app) => app.available && app.feature && !isEnabled(app.feature));

/**
 * Where somebody should land.
 *
 * A company using only Payroll should not arrive in Accounting and have to go
 * looking. When exactly one app is subscribed, that app is home; when several
 * are, Accounting is, because it is where the day starts for the companies
 * that have both.
 */
export const landingApp = (isEnabled) => {
  const mine = subscribedApps(isEnabled);
  if (mine.length === 1) return mine[0];
  return mine.find((a) => a.id === 'accounting') || mine[0] || null;
};

export const appById = (id) => APPS.find((a) => a.id === id) || null;
