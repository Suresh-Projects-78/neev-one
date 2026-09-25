import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import PopupSelect from './PopupSelect';

/**
 * The head of an invoice, in miniature: three selections in a row, which is
 * the arrangement every report of a lost keystroke has come from.
 */
const Head = () => {
  const [branch, setBranch] = useState('');
  const [warehouse, setWarehouse] = useState('');
  return (
    <form>
      <PopupSelect
        label="Branch"
        value={branch}
        onChange={setBranch}
        options={[
          { value: 'ho', label: 'Head Office' },
          { value: 'blr', label: 'Bengaluru' },
        ]}
        placeholder="Select Branch"
      />
      <PopupSelect
        label="Warehouse"
        value={warehouse}
        onChange={setWarehouse}
        options={[
          { value: 'hw', label: 'Head Warehouse' },
          { value: 'ms', label: 'Main Store' },
        ]}
        placeholder="Select Warehouse"
      />
      <button type="button">Customer</button>
    </form>
  );
};

const triggers = () => screen.getAllByRole('combobox');

describe('PopupSelect keyboard', () => {
  it('opens on ArrowDown and keeps the caret on its trigger', async () => {
    const user = userEvent.setup();
    render(<Head />);
    const [branch] = triggers();
    await user.click(branch);
    await user.keyboard('{Escape}');
    branch.focus();

    await user.keyboard('{ArrowDown}');
    expect(branch).toHaveAttribute('aria-expanded', 'true');
    // The combobox pattern: focus never leaves the trigger.
    expect(document.activeElement).toBe(branch);
  });

  it('moves the highlight with the arrows', async () => {
    const user = userEvent.setup();
    render(<Head />);
    const [branch] = triggers();
    branch.focus();
    await user.keyboard('{ArrowDown}');
    const first = branch.getAttribute('aria-activedescendant');
    await user.keyboard('{ArrowDown}');
    expect(branch.getAttribute('aria-activedescendant')).not.toBe(first);
  });

  it('Enter commits the highlighted row', async () => {
    const user = userEvent.setup();
    render(<Head />);
    const [branch] = triggers();
    branch.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(branch).toHaveTextContent('Bengaluru');
  });

  it('Tab commits and lands on the NEXT field, not the one after it', async () => {
    const user = userEvent.setup();
    render(<Head />);
    const [branch, warehouse] = triggers();
    branch.focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.keyboard('{Tab}');
    expect(branch).toHaveTextContent('Bengaluru');
    await waitFor(() => expect(document.activeElement).toBe(warehouse));
  });

  it('Tab on an untouched list changes nothing and still advances', async () => {
    const user = userEvent.setup();
    render(<Head />);
    const [branch, warehouse] = triggers();
    branch.focus();
    await user.keyboard('{ArrowDown}');   // opens; no cursor movement yet
    await user.keyboard('{Tab}');
    expect(branch).toHaveTextContent('Select Branch');
    await waitFor(() => expect(document.activeElement).toBe(warehouse));
  });

  it('a plain Tab through a closed field reaches the next field', async () => {
    const user = userEvent.setup();
    render(<Head />);
    const [branch, warehouse] = triggers();
    branch.focus();
    await user.tab();
    expect(document.activeElement).toBe(warehouse);
  });
});
