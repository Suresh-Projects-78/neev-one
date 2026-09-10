import { describe, expect, it, vi, beforeEach } from 'vitest';

const created = vi.fn();
const errors = vi.fn();
let signedIn = true;

vi.mock('../api/masters', () => ({
  createCustomer: (...a) => created(...a),
  toServerCustomer: (c) => ({ name: c.name, gstRegistrationType: 'UNREGISTERED' }),
}));
vi.mock('../api/purchaseDocs', () => ({ hasApiSession: () => signedIn }));
vi.mock('./ui/notify', () => ({ notify: { error: (...a) => errors(...a), success: vi.fn() } }));
vi.mock('../features/settings/ModulePicker', () => ({ default: () => null }));

import { saveOnboardingCustomer } from './OnboardingWizard';

beforeEach(() => {
  created.mockReset().mockResolvedValue({ party: { id: 'srv-party-1', code: 'C-001' } });
  errors.mockReset();
  signedIn = true;
});

/*
 * The first customer a business ever creates.
 *
 * The wizard step wrote to the browser and nowhere else, so the one customer
 * the product itself walks somebody through creating was the one that never
 * reached the server — gone on the next device, and invisible to hydration,
 * which matches on the server id this record never had.
 */
describe('the wizard’s first customer reaches the server', () => {
  it('creates it and links the local row to its twin', async () => {
    const patch = await saveOnboardingCustomer({ name: 'Acme Traders', billingAddress: { state: 'Karnataka' } });

    expect(created).toHaveBeenCalledTimes(1);
    expect(created.mock.calls[0][0].name).toBe('Acme Traders');
    // backendPartyId, because that is the key hydration matches on — anything
    // else and the same customer arrives a second time on the next device.
    expect(patch.backendPartyId).toBe('srv-party-1');
  });

  it('keeps the customer here and says so when the server refuses it', async () => {
    created.mockRejectedValue(new Error('name already used'));

    expect(await saveOnboardingCustomer({ name: 'Acme' })).toEqual({});
    expect(String(errors.mock.calls[0][0])).toMatch(/name already used/);
  });

  it('does nothing when the wizard is run without a session', async () => {
    signedIn = false;
    expect(await saveOnboardingCustomer({ name: 'Acme' })).toEqual({});
    expect(created).not.toHaveBeenCalled();
  });
});
