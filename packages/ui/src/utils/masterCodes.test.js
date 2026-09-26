import { describe, expect, it } from 'vitest';
import { nextCustomerCode, nextVendorCode } from './masterCodes';

describe('master code previews', () => {
  it('shows the first available customer code in the 2–5 series', () => {
    expect(nextCustomerCode([])).toBe('200000');
    expect(nextCustomerCode([{ code: '200000' }, { code: '200001' }])).toBe('200002');
  });

  it('shows the first available vendor code in the 6–9 series', () => {
    expect(nextVendorCode([])).toBe('600000');
    expect(nextVendorCode([{ code: '600000' }])).toBe('600001');
  });
});
