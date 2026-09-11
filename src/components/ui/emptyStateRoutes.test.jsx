import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './Primitives';

/*
 * The two cards under a blank list are part of the same centred block as the
 * heading and the sentence above them. They were laid out on a three-column
 * grid, so two routes filled columns one and two and the block read as
 * off-centre — the complaint that produced this file.
 */

const routes = [
  { label: 'Quote one now', description: 'Pick a customer, add lines.', onSelect: () => {} },
  { label: 'Start from an invoice', description: 'Quote what you have billed.', onSelect: () => {} },
];

const rowFor = (label) => screen.getByText(label).closest('button').parentElement;

describe('the routes under an empty list', () => {
  it('centres two cards rather than leaving a third column empty', () => {
    render(<EmptyState kind="new" title="No quotations yet" routes={routes} />);
    const row = rowFor('Quote one now');
    expect(row.className).toContain('justify-center');
    /* A fixed column count is what pushed two cards to the left. */
    expect(row.className).not.toMatch(/grid-cols-\d/);
  });

  it('centres one card and three cards the same way', () => {
    const { unmount } = render(<EmptyState kind="new" title="Nothing" routes={routes.slice(0, 1)} />);
    expect(rowFor('Quote one now').className).toContain('justify-center');
    unmount();

    render(
      <EmptyState
        kind="new"
        title="Nothing"
        routes={routes.concat({ label: 'Import a file', description: 'From a spreadsheet.', onSelect: () => {} })}
      />
    );
    expect(rowFor('Import a file').className).toContain('justify-center');
  });

  it('still renders every route it is given', () => {
    render(<EmptyState kind="new" title="No quotations yet" routes={routes} />);
    expect(screen.getByText('Quote one now')).toBeTruthy();
    expect(screen.getByText('Start from an invoice')).toBeTruthy();
  });
});
