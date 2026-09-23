import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandMark } from '../src/brand-mark.js';

/**
 * 13.1472 / 13.1473 — the favicon (owner request 2026-09-23: "the icon we
 * have on the signin page. make it the favico[n]"). `app/layout.tsx`'s
 * `metadata` names `app/public/favicon.svg`, which draws the SAME glyph
 * `BrandMark` draws — on the product's one fixed brand hue rather than a
 * theme-varying token, since a static favicon carries no `data-theme`.
 */
const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT_PATH = resolve(WEB_ROOT, 'app/layout.tsx');
const FAVICON_PATH = resolve(WEB_ROOT, 'public/favicon.svg');

describe('the favicon', () => {
  /** MUTATION TARGET: drop the `icons` key from `metadata`. */
  it('13.1472 app/layout.tsx names /favicon.svg as the icon', () => {
    const source = readFileSync(LAYOUT_PATH, 'utf8');
    expect(source).toMatch(
      /export\s+const\s+metadata\s*=\s*\{[^}]*icons:\s*\{\s*icon:\s*['"]\/favicon\.svg['"]/,
    );
  });

  /**
   * PARITY, read the honest way: the ORDERED array of every `d` string in
   * each file, length asserted before the comparison so a regex that
   * matches nothing cannot pass two empty arrays against each other.
   * MUTATION TARGET: edit one coordinate in favicon.svg.
   */
  it('13.1473 favicon.svg draws the SAME glyph BrandMark draws, path for path', () => {
    const svgSource = readFileSync(FAVICON_PATH, 'utf8');
    const faviconPaths = [...svgSource.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
    expect(faviconPaths, 'favicon.svg path count').toHaveLength(3);

    const { container } = render(<BrandMark size={24} />);
    const brandMarkPaths = [...container.querySelectorAll('path')].map((path) => path.getAttribute('d'));
    expect(brandMarkPaths, 'BrandMark path count').toHaveLength(3);

    expect(faviconPaths).toEqual(brandMarkPaths);

    // The tile: the product's one fixed brand hue (packages/ui/src/tokens.ts
    // `brandOrange` #ee7733) behind the dark stroke (`onColorWarmDark` #141a2e).
    expect(svgSource).toMatch(/fill="#ee7733"/);
    expect(svgSource).toMatch(/stroke="#141a2e"/);
  });
});
