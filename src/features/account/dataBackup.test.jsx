import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const exportCompanyData = vi.fn();
const notifyError = vi.fn();
const notifySuccess = vi.fn();

vi.mock('../../api/dataExport', () => ({ exportCompanyData: (...a) => exportCompanyData(...a) }));
vi.mock('../../components/ui/notify', () => ({
  notify: { error: (...a) => notifyError(...a), success: (...a) => notifySuccess(...a) },
  confirmDialog: vi.fn(),
}));

import DataBackup from './DataBackup';

const COMPANY = { id: 1, name: 'Neev Steels' };

const PAYLOAD = {
  export: {
    format: 'neev-one/company-export',
    company: { id: 'o1', name: 'Neev Steels' },
    counts: { invoices: 8, journalEntries: 15, parties: 4 },
  },
  data: { invoices: [], journalEntries: [], parties: [] },
};

beforeEach(() => {
  exportCompanyData.mockReset().mockResolvedValue(PAYLOAD);
  notifyError.mockClear();
  notifySuccess.mockClear();
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:probe');
  globalThis.URL.revokeObjectURL = vi.fn();
});

/*
 * The client's own books, which is a different thing from the server backup —
 * that one is every customer's data in a single file and belongs to whoever
 * runs the service.
 */
describe('taking a copy of the company data', () => {
  it('downloads a file named for the company and the day', async () => {
    const clicks = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      if (tag === 'a') {
        el.click = () => clicks.push(el.download);
      }
      return el;
    });

    render(<DataBackup currentCompany={COMPANY} />);
    fireEvent.click(screen.getByRole('button', { name: /Download backup/i }));

    await waitFor(() => expect(clicks.length).toBe(1));
    expect(clicks[0]).toMatch(/^Neev Steels-backup-\d{4}-\d{2}-\d{2}\.json$/);
    document.createElement.mockRestore();
  });

  it('reports what it took, so the person can see it worked', async () => {
    render(<DataBackup currentCompany={COMPANY} />);
    fireEvent.click(screen.getByRole('button', { name: /Download backup/i }));

    // 8 + 15 + 4 across the counts the server reported.
    await waitFor(() => expect(notifySuccess).toHaveBeenCalled());
    expect(String(notifySuccess.mock.calls[0][0])).toContain('27');
    expect(await screen.findByText('Last taken')).toBeInTheDocument();
  });

  it('says so when it could not be taken', async () => {
    exportCompanyData.mockRejectedValue(new Error('permission denied'));
    render(<DataBackup currentCompany={COMPANY} />);
    fireEvent.click(screen.getByRole('button', { name: /Download backup/i }));

    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(String(notifyError.mock.calls[0][0])).toMatch(/permission denied/);
  });

  /*
   * The destination integrations do not exist, and a page that implies a
   * nightly copy is going to SharePoint when nothing is scheduled would be a
   * customer discovering the gap at the worst moment.
   */
  it('does not pretend a scheduled copy is running', () => {
    render(<DataBackup currentCompany={COMPANY} />);
    expect(screen.getByText(/not connected yet/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is scheduled and nothing is being sent/i)).toBeInTheDocument();
  });

  /* Restore is genuinely not built, and says why rather than being absent. */
  it('is honest that a restore is not offered', () => {
    render(<DataBackup currentCompany={COMPANY} />);
    expect(screen.getByText(/not offered yet/i)).toBeInTheDocument();
  });
});
