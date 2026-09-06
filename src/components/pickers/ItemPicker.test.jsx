import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/masters', () => ({
  listItems: () => Promise.reject(new Error('offline')),
  createItem: () => Promise.reject(new Error('offline')),
}));
vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => false }) }));

import ItemPicker from './ItemPicker';

const COMPANY = { id: 1 };
const DB = {
  items: [
    { id: 11, companyId: 1, name: 'MS Angle 50mm', code: 'A50', unit: 'Pcs', gstRate: 18, salePrice: 100 },
    { id: 12, companyId: 1, name: 'MS Plate 10mm', code: 'P10', unit: 'Pcs', gstRate: 18, salePrice: 200 },
    { id: 13, companyId: 1, name: 'Bolt M12', code: 'B12', unit: 'Pcs', gstRate: 18, salePrice: 5 },
  ],
  uoms: [], gstRates: [],
};

const Host = () => {
  const [value, setValue] = useState('');
  return (
    <form>
      <ItemPicker db={DB} setDb={() => {}} currentCompany={COMPANY} value={value} onChange={setValue} />
      <input aria-label="description" />
    </form>
  );
};

const openPicker = async (user) => {
  await user.click(screen.getByRole('button', { name: /select item/i }));
  return waitFor(() => screen.getByPlaceholderText(/search item/i));
};

describe('ItemPicker keyboard', () => {
  it('ArrowDown moves the highlight in the list', async () => {
    const user = userEvent.setup();
    render(<Host />);
    const search = await openPicker(user);
    // The dialog must hand the caret to the search box, not keep it on the
    // panel. This is the whole bug: keys typed at a div go nowhere.
    expect(document.activeElement).toBe(search);
    const first = search.getAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}');
    expect(search.getAttribute('aria-activedescendant')).not.toBe(first);
  });

  it('Enter picks the highlighted item', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openPicker(user);
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /MS Plate 10mm/i })).toBeInTheDocument()
    );
  });

  it('typing filters, then Enter picks the match', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openPicker(user);
    await user.keyboard('Bolt');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.getByRole('button', { name: /Bolt M12/i })).toBeInTheDocument());
  });

  it('Escape closes without choosing', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await openPicker(user);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByPlaceholderText(/search item/i)).toBeNull());
    expect(screen.getByRole('button', { name: /select item/i })).toBeInTheDocument();
  });
});
