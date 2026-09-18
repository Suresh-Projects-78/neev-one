/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Features opens over the current screen, not instead of it.
 *
 * <main> is keyed on `active`, so any navigation remounts the screen and an
 * unsaved invoice is gone. The rail's Features entry therefore opens a panel
 * and leaves `active` alone. What this holds is that nothing in the shell
 * quietly goes back to `setActive('features')`.
 */

const APP = readFileSync('src/App.jsx', 'utf8');
const PANEL = readFileSync('src/features/features/FeaturesPanel.jsx', 'utf8');
const CSS = readFileSync('src/index.css', 'utf8');

describe('the rail', () => {
  it('opens the panel from the Features entry rather than navigating', () => {
    expect(APP).toMatch(/isFeatures \? openFeatures\(e\.currentTarget\) : setActive\(entry\.key\)/);
    expect(APP).toContain("aria-haspopup={isFeatures ? 'dialog' : undefined}");
  });

  it('shows Features as the one lit entry while the panel is open', () => {
    expect(APP).toContain('const isActive = featuresOpen ? isFeatures : isRoute;');
    expect(APP).toContain('data-active={(!featuresOpen && isGroupActive) || undefined}');
    expect(APP).toContain('data-active={!featuresOpen && isActive}');
  });

  it('sends the palette to the panel too', () => {
    const from = APP.indexOf('<CommandPalette');
    const site = APP.slice(from, APP.indexOf('<main', from));
    expect(site).toMatch(/if \(item\.key === 'features'\) \{\s*openFeatures\(\);\s*return;/);
  });
});

describe('the screen underneath', () => {
  it('keeps its key, so it is not remounted by the panel', () => {
    expect(APP).toMatch(/<main\s+id="main-content"\s+key=\{active\}\s+inert=\{featuresOpen \|\| undefined\}/);
  });

  it('is inert with the rail and the header while the panel is open', () => {
    expect((APP.match(/inert=\{featuresOpen \|\| undefined\}/g) || []).length).toBe(3);
  });

  it('closes the panel on any real navigation', () => {
    expect(APP).toMatch(/useEffect\(\(\) => \{\s*setFeaturesOpen\(false\);\s*\}, \[active\]\);/);
  });
});

describe('the legacy route', () => {
  it('still renders the same catalogue for a saved link', () => {
    expect(APP).toContain("case 'features':\n        return <FeaturesPage");
  });
});

describe('the panel', () => {
  it('is a drawer on the layer scale, not a number of its own', () => {
    expect(PANEL).toContain("zIndex: 'var(--z-drawer)'");
    expect(PANEL).toContain("zIndex: 'var(--z-drawer-panel)'");
    expect(PANEL).not.toMatch(/z-\[|zIndex: \d/);
    expect(PANEL).toContain('<OverlayLayerContext.Provider value="drawer">');
  });

  it('measures the content area rather than assuming the rail width', () => {
    expect(PANEL).toContain("document.getElementById('main-content')");
    expect(PANEL).toContain('new ResizeObserver(update)');
  });

  it('washes the content without blurring it', () => {
    const rule = CSS.slice(CSS.indexOf('.ui-feature-scrim {'), CSS.indexOf('.ui-feature-panel {'));
    expect(rule).not.toContain('backdrop-filter');
    expect(rule).toContain('rgb(24 24 27 / 0.24)');
    expect(rule).toContain(":root[data-theme='dark'] .ui-feature-scrim");
  });

  it('settles into place rather than sliding in from off screen', () => {
    expect(CSS).toMatch(/@keyframes ui-panel-in \{\s*from \{ transform: translate3d\(-12px, 0, 0\); opacity: 0; \}/);
    expect(CSS).toMatch(/\.ui-feature-panel \{[^}]*animation: ui-panel-in 180ms/);
    expect(CSS).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.ui-feature-panel \{ animation-name: ui-fade/);
  });
});
