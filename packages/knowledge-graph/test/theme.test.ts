import { describe, expect, it } from 'vitest';
import { cssVariableName } from '@gisik-nokma/ui/tokens';
import { PALETTE_ROLES } from '../src/render/palette.js';
import { readThemePalette, watchTheme } from '../src/theme/read-palette.js';

describe('the palette is read from the app\'s tokens (spec §3.7)', () => {
  it('27.263 every palette role is read from its --gn-* variable, and dark is read from the painted card fill\'s luminance; a data-theme change notifies; control: an unset variable reads as empty, not a fallback colour', async () => {
    const root = document.documentElement;
    const raised = cssVariableName('surfaceRaised');
    for (const role of PALETTE_ROLES) root.style.setProperty(cssVariableName(role), role === 'edgeBlocks' ? '#d70015' : '#010203');
    const p = readThemePalette(root);
    expect(p.edgeBlocks).toBe('#d70015');
    expect(p.fogDot).toBe('#010203'); // every OTHER role reads its own variable too (a reader keyed on one name fails here or above)
    expect(p.dark).toBe(true); // a near-black card fill
    root.style.setProperty(raised, '#fbf7f3'); // the light card fill; every other role (edgeBlocks included) stays as it was
    expect(readThemePalette(root).dark).toBe(false); // `dark` is READ from the card fill, not a constant and not another role
    // the bound: luminance 0.497 is dark, 0.502 is light (DARK_LUMINANCE = 0.5)
    root.style.setProperty(raised, '#bbbbbb');
    expect(readThemePalette(root).dark).toBe(true);
    root.style.setProperty(raised, '#bcbcbc');
    expect(readThemePalette(root).dark).toBe(false);
    root.style.setProperty(raised, '#20294a80'); // the alpha byte is ignored: hig's dark card fill
    expect(readThemePalette(root).dark).toBe(true);
    // `color-scheme` decides nothing (the mockup read it; no app stylesheet sets it)
    root.style.setProperty('color-scheme', 'dark');
    root.style.setProperty(raised, '#fbf7f3');
    expect(readThemePalette(root).dark).toBe(false);
    root.style.removeProperty('color-scheme');
    let calls = 0;
    const stop = watchTheme(() => (calls += 1));
    root.setAttribute('data-theme', 'dark');
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(1);
    root.setAttribute('data-style', 'neo'); // the docblock's other attribute
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
    stop();
    root.setAttribute('data-theme', 'light');
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2); // stopped means stopped
    root.removeAttribute('data-theme');
    root.removeAttribute('data-style');
    root.style.removeProperty(cssVariableName('fogDot'));
    expect(readThemePalette(root).fogDot).toBe('');
    root.style.removeProperty(raised);
    expect(readThemePalette(root).dark).toBe(false); // no card fill reads as light
  });
});
