import { describe, expect, it, beforeEach } from 'vitest';
import { shouldOnboard, markOnboardingSeen } from './OnboardingWizard';

const company = (over = {}) => ({ id: 1, profile: { backendCompanyId: 'org_abc' }, ...over });
const emptyBook = { invoices: [], customers: [] };

describe('onboarding is asked once', () => {
  beforeEach(() => localStorage.clear());

  it('offers to set up an empty book', () => {
    expect(shouldOnboard(emptyBook, company())).toBe(true);
  });

  /*
   * The bug this pins: dismissing wrote nothing to storage, so the wizard came
   * back at every sign-in for as long as the book stayed empty. Closing it is
   * an answer and has to survive a reload.
   */
  it('does not ask again once it has been dismissed', () => {
    markOnboardingSeen(company());
    expect(shouldOnboard(emptyBook, company())).toBe(false);
  });

  /*
   * `id` is 1 for the first company in every browser, so keying on it meant
   * two businesses opened on one machine shared an answer.
   */
  it('keeps the answer per organisation, not per local id', () => {
    markOnboardingSeen(company({ profile: { backendCompanyId: 'org_abc' } }));
    const otherOrg = company({ profile: { backendCompanyId: 'org_xyz' } });
    expect(shouldOnboard(emptyBook, otherOrg)).toBe(true);
  });

  it('stops offering once the book has anything in it', () => {
    expect(shouldOnboard({ invoices: [{ companyId: 1 }], customers: [] }, company())).toBe(false);
    expect(shouldOnboard({ invoices: [], customers: [{ companyId: 1 }] }, company())).toBe(false);
  });
});
