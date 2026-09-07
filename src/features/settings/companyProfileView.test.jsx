import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsView } from '../../App';

/**
 * Settings → Organisation → Company Profile, read then edit.
 *
 * Branches and Warehouses — the two entries directly below it — each show the
 * record and open a form only when asked. Company Profile opened straight into
 * a form with every field live and a Save button, so there was no screen that
 * simply said what the company *is*, and the fields were one stray keystroke
 * away from being changed by someone who only meant to look.
 */

const company = {
  id: 'c1',
  name: 'Sunrise Traders',
  gstin: '29AABCU9603R1ZJ',
  profile: {
    companySettings: {
      legalName: 'Sunrise Traders Pvt Ltd',
      entityType: 'Pvt Ltd',
      officialEmail: 'hello@sunrise.example',
      regAddress1: '12 MG Road',
      regCity: 'Bengaluru',
      regStateCode: 'Karnataka',
      regPincode: '560001',
    },
  },
};

const renderScreen = () =>
  render(
    <SettingsView db={{ companies: [company] }} setDb={() => {}} currentCompany={company} initialTab="company" showSidebar={false} />
  );

describe('Company Profile', () => {
  it('opens on the record, not on a form', () => {
    renderScreen();

    // The values are stated…
    expect(screen.getByText('Sunrise Traders Pvt Ltd')).toBeInTheDocument();
    expect(screen.getByText('29AABCU9603R1ZJ')).toBeInTheDocument();

    // …and nothing is editable until asked.
    expect(screen.queryByLabelText(/Legal Company Name/i)).toBeNull();
    expect(document.querySelectorAll('input').length).toBe(0);
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull();
  });

  it('opens the form on Edit, carrying the stored values in', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: /edit/i }));

    const inputs = [...document.querySelectorAll('input')];
    expect(inputs.length).toBeGreaterThan(0);
    expect(inputs.some((i) => i.value === 'Sunrise Traders Pvt Ltd')).toBe(true);
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
  });

  /*
   * Cancel is the whole point of a read view: a look that changed nothing has
   * to be leaveable without a save.
   */
  it('returns to the record on Cancel, leaving nothing editable', async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole('button', { name: /edit/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(document.querySelectorAll('input').length).toBe(0);
    expect(screen.getByText('Sunrise Traders Pvt Ltd')).toBeInTheDocument();
  });
});

/**
 * With more than one company in the book, this screen still shows exactly one:
 * the active company. That is fine — but a page headed "Company" gave no way to
 * tell whose record was on screen, and no way to reach the other one.
 */
describe('Company Profile with several companies', () => {
  const second = { id: 'c2', name: 'Moonrise Exports', profile: {} };

  it('names the company it is showing', () => {
    render(
      <SettingsView
        db={{ companies: [company, second] }}
        setDb={() => {}}
        currentCompany={company}
        initialTab="company"
        showSidebar={false}
      />
    );
    expect(screen.getByText('Sunrise Traders')).toBeInTheDocument();
    expect(screen.getByText(/Active company · 2 in this book/)).toBeInTheDocument();
  });

  it('offers a way to the other company, and does not when there is only one', async () => {
    const user = userEvent.setup();
    const opened = [];
    const { unmount } = render(
      <SettingsView
        db={{ companies: [company, second] }}
        setDb={() => {}}
        currentCompany={company}
        initialTab="company"
        showSidebar={false}
        onOpenCompanyList={() => opened.push('companies')}
      />
    );
    await user.click(screen.getByRole('button', { name: /switch company/i }));
    expect(opened).toEqual(['companies']);
    unmount();

    // One company: nothing to switch to, so no control offering it.
    render(
      <SettingsView
        db={{ companies: [company] }}
        setDb={() => {}}
        currentCompany={company}
        initialTab="company"
        showSidebar={false}
        onOpenCompanyList={() => opened.push('companies')}
      />
    );
    expect(screen.queryByRole('button', { name: /switch company/i })).toBeNull();
  });
});
