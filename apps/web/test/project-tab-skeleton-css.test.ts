import { describe, expect, it } from 'vitest';
import { ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * Smoothness T6 (spec S1; amendment S-R1) — the one CSS rule the project page's tab skeleton adds. Case 25.087. The wrappers
 * hold the shape of the real board / list inside them and must add no box of their own: jsdom does no layout, so the rule
 * itself is what is read (the shape of `screen-skeletons-css.test.ts`, T8's twin).
 */
const css = readGlobalsCss();

describe('25.087 the T6 tab-skeleton wrappers add no box and paint nothing', () => {
  it('25.087 `.gn-project__tab-skeleton, .gn-project__tab-skeleton-body` is `display: contents` and names no fill, border, shadow or colour (control: the T8 sign-in slot rule DOES carry a min-height)', () => {
    const wrappers = ruleExactly(css, ['.gn-project__tab-skeleton', '.gn-project__tab-skeleton-body']);
    expect(valueOf(wrappers, 'display')).toBe('contents');
    for (const property of ['background', 'background-color', 'border', 'box-shadow', 'color', 'fill', 'min-height', 'padding', 'margin']) {
      expect(valueOf(wrappers, property), property).toBeNull();
    }
    const slot = ruleExactly(css, '.gn-sign-in__methods-slot[data-state="pending"]');
    expect(valueOf(slot, 'min-height')).not.toBeNull();
  });
});
