/**
 * Which face Features shows, decided by where you are asking from.
 *
 * Both answers target the same thing. What differs is whether there is work
 * underneath worth keeping. From Home there is not — nothing is half-typed on
 * the dashboard — so Features is a destination and the rail goes to the full
 * page, exactly as it would for Reports. From inside a module there is: an
 * invoice with four lines on it, a customer half-filled, a report scrolled to
 * the right row. `<main>` is keyed on the route, so navigating away would
 * remount all of that empty. There, Features is a tool, opened over the screen
 * and put away again with the screen untouched.
 *
 * The decision reads the CURRENT route, never the destination — deciding from
 * the destination was the mistake that made the rail always go to the page.
 */

/** Routes that already show the Features page; asking for Features from one is asking to stay. */
export const FEATURES_PAGE_ROUTES = new Set([
  'features',
  // The retired Settings capability panes, which render the same page for saved links.
  'settingsFeatures',
  'settingsSales',
  'settingsPurchases',
  'settingsInventory',
  'settingsAccounting',
  'settingsPaymentsReceipts',
  'settingsDocuments',
]);

/** The landing screen: nothing underneath to preserve, so Features is a destination from here. */
export const LANDING_ROUTE = 'dashboard';

/**
 * 'page' — navigate to the full Features page.
 * 'panel' — open the contextual panel over the current screen.
 */
export const featuresPresentationFor = (activeRoute) => {
  const key = String(activeRoute || '');
  if (!key || key === LANDING_ROUTE || FEATURES_PAGE_ROUTES.has(key)) return 'page';
  return 'panel';
};
