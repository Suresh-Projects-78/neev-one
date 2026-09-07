import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../permissions/useFeatures', () => ({ useFeatures: () => ({ isEnabled: () => true }) }));
import CompanyGroups from './CompanyGroups';

const seed = {
  activeCompanyId: 1,
  companies: [
    { id: 1, name: 'Neev', state: 'Haryana', gstin: '', currency: 'INR', parentCompanyId: null },
    { id: 2, name: 'Neev South', state: 'Karnataka', gstin: '', currency: 'INR', parentCompanyId: null },
  ],
  invoices: [], customers: [], items: [], bills: [],
};

const Host = () => {
  const [db, setDb] = useState(seed);
  return <CompanyGroups db={db} setDb={setDb} currentCompany={db.companies[0]} />;
};

describe('Company Profile', () => {
  /*
   * Branches and warehouses both open the record that was saved. A company
   * dropped you back on the list with a toast, so the only way to see what had
   * actually been stored was to find the row again and press the pencil.
   */
  it('opens a record when View is pressed', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getAllByRole('button', { name: 'View' })[0]);
    const panel = await screen.findByLabelText('Company details');
    expect(panel).toBeInTheDocument();
    expect(panel.textContent).toContain('Haryana');
  });

  it('shows the fields a company is defined by, not just its name', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getAllByRole('button', { name: 'View' })[0]);
    const panel = await screen.findByLabelText('Company details');
    const labels = [...panel.querySelectorAll('dt')].map((d) => d.textContent.trim());
    expect(labels).toEqual(
      expect.arrayContaining(['Name', 'State', 'GSTIN', 'Currency', 'Parent', 'Billed', 'Outstanding'])
    );
  });

  it('lands on the record it just saved, rather than back on the list', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getAllByRole('button', { name: /^Edit / })[0]);
    const name = await screen.findByDisplayValue('Neev');
    await user.clear(name);
    await user.type(name, 'Neev Renamed');
    await user.click(screen.getByRole('button', { name: /save|update/i }));
    await waitFor(async () => {
      const panel = await screen.findByLabelText('Company details');
      expect(panel.textContent).toContain('Neev Renamed');
    });
  });

  it('closes back to the list', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getAllByRole('button', { name: 'View' })[0]);
    await screen.findByLabelText('Company details');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByLabelText('Company details')).toBeNull());
  });
});
