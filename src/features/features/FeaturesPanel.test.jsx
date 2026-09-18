import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import FeaturesPanel from './FeaturesPanel';
import { panelWidthFor } from './featurePanelGeometry';

/**
 * Features opens over the screen rather than instead of it.
 *
 * The panel is a dialog by contract: it takes focus, keeps Tab, gives focus
 * back, and answers Escape only when nothing closer has. What this runs is
 * the part that cannot be read off the source — focus and event order.
 */

vi.mock('../../api/features', () => ({
  getFeatureCatalog: vi.fn(async () => ({
    features: [
      { key: 'salesOrders', label: 'Sales Orders', enabled: true },
      { key: 'quotations', label: 'Quotations', enabled: false },
    ],
  })),
  setFeatures: vi.fn(async (v) => ({ features: v })),
}));
vi.mock('../../permissions/useFeatures', () => ({
  useFeatures: () => ({ reload: () => {} }),
}));
vi.mock('../settings/featureRegistry', () => ({
  FEATURE_GROUPS: [{ key: 'sales', label: 'Sales' }],
  TAX_FEATURES: [],
  groupForFeature: () => 'sales',
  iconForFeature: () => null,
  settingsLinkFor: (k) => (k === 'salesOrders' ? { key: 'settingsSalesOrders', label: 'Configure' } : null),
}));

/* A screen with the panel over it, the way the shell composes them. */
const Shell = ({ onNavigate = () => {} }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Features
      </button>
      <main id="main-content">
        <input aria-label="Narration" defaultValue="" />
      </main>
      <FeaturesPanel open={open} onClose={() => setOpen(false)} onNavigate={onNavigate} />
    </div>
  );
};

const openPanel = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Features' }));
  return screen.findByRole('dialog');
};

describe('FeaturesPanel', () => {
  it('is a labelled modal dialog that takes focus on open', async () => {
    render(<Shell />);
    const dialog = await openPanel();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelledBy = dialog.getAttribute('aria-labelledby');
    expect(document.getElementById(labelledBy)).toHaveTextContent('Features');
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search features' }));
    expect(screen.getByRole('button', { name: 'Close Features' })).toBeInTheDocument();
  });

  it('leaves the screen underneath mounted, with its typed value', async () => {
    render(<Shell />);
    const narration = screen.getByLabelText('Narration');
    fireEvent.change(narration, { target: { value: 'kept' } });
    await openPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Close Features' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByLabelText('Narration')).toBe(narration);
    expect(narration.value).toBe('kept');
  });

  it('closes on Escape and gives focus back to what opened it', async () => {
    render(<Shell />);
    const trigger = screen.getByRole('button', { name: 'Features' });
    trigger.focus();
    await openPanel();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('lets Escape clear a search with text before it closes the panel', async () => {
    render(<Shell />);
    await openPanel();
    const search = screen.getByRole('searchbox', { name: 'Search features' });
    fireEvent.change(search, { target: { value: 'sales' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    /* The browser empties a type=search on Escape; jsdom does not, so the
       clear is stood in for and the second Escape is what closes. */
    fireEvent.change(search, { target: { value: '' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('yields Escape to an overlay that already claimed it', async () => {
    render(<Shell />);
    await openPanel();
    /* Stand-in for the command palette, which prevents default on its own
       Escape. It listens on document, so it is reached before the panel's
       window listener — and the panel must then leave the key alone. */
    const claim = (e) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    document.addEventListener('keydown', claim);
    try {
      act(() => {
        document.body.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 160));
      });
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    } finally {
      document.removeEventListener('keydown', claim);
    }
  });

  it('closes on the scrim, not on a click inside', async () => {
    render(<Shell />);
    const dialog = await openPanel();
    fireEvent.mouseDown(dialog);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.mouseDown(document.querySelector('.ui-feature-scrim'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps Tab inside the panel', async () => {
    render(<Shell />);
    const dialog = await openPanel();
    await screen.findByText('Sales Orders');
    const focusables = dialog.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('keeps the close button inside the panel when the panel is narrow', async () => {
    /* At 375px the title, Revert, Save and the close button do not fit on one
       line. Before the header wrapped, the close button was laid out past the
       panel's right edge — off screen, on the one layout with no Escape key. */
    render(<Shell />);
    const dialog = await openPanel();
    const close = screen.getByRole('button', { name: 'Close Features' });
    const titleRow = dialog.firstElementChild.firstElementChild;
    expect(titleRow.contains(close)).toBe(true);
    expect(titleRow.className).toContain('flex-wrap');
    /* The actions group wraps as a unit; the button itself never shrinks. */
    expect(close.parentElement.className).toContain('flex-wrap');
    expect(close.className).toContain('shrink-0');
  });

  it('hands Configure to the shell and does not navigate itself', async () => {
    const onNavigate = vi.fn();
    render(<Shell onNavigate={onNavigate} />);
    await openPanel();
    fireEvent.click(await screen.findByRole('button', { name: /Configure/ }));
    expect(onNavigate).toHaveBeenCalledWith('settingsSalesOrders');
  });

  it('sits on the drawer layer and owns the popovers opened inside it', async () => {
    render(<Shell />);
    const dialog = await openPanel();
    expect(dialog.style.zIndex).toBe('var(--z-drawer-panel)');
    expect(document.querySelector('.ui-feature-scrim').style.zIndex).toBe('var(--z-drawer)');
  });
});

describe('panelWidthFor', () => {
  it('is three quarters of the content, capped, with a floor the content can give', () => {
    expect(panelWidthFor(2300)).toBe(1160); // 2560 screen: capped, not a hall
    expect(panelWidthFor(1680)).toBe(1160); // 1920: 1277 → capped
    expect(panelWidthFor(1296)).toBe(985); // 1536: 76%
    expect(panelWidthFor(1126)).toBe(880); // 1366: the floor, not 856
    expect(panelWidthFor(700)).toBe(700); // tablet: all of it
    expect(panelWidthFor(375)).toBe(375); // phone: all of it
  });
});
