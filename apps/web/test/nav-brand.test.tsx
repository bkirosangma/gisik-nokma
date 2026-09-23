import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleFor } from './helpers/css-rule-scan.js';
import { NavBrand } from '../src/nav-brand.js';
import { LegalNav } from '../src/legal-nav.js';

/**
 * `legal-nav.tsx` imports `AccountMenu`, which reads `usePathname`/`useRouter`
 * — the same reason `not-found-and-legal.test.tsx` mocks this module to render
 * `LegalNav` at all. No `auth-client` mock: `useCurrentUser()` resolves to
 * `null` (signed out) with none, the same default that file's `Terms`/
 * `PrivacyPolicy` renders rely on, and the signed-out branch is what this
 * file needs — `LegalNav`'s own `Sign in` link, not `AccountMenu`'s.
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/privacy',
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useParams: () => ({}),
}));

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const GLOBALS_CSS_PATH = resolve(TEST_DIR, '../app/globals.css');
const css = readFileSync(GLOBALS_CSS_PATH, 'utf8');

/**
 * 13.1491 — owner ruling 2026-09-24 ("one component ... used by app-nav AND
 * legal-nav"): `NavBrand` is the ONE place the tile + wordmark are drawn, and
 * this proves it actually reaches both mounts rather than only existing as an
 * unused component — the same "witness the mount, not just the component"
 * discipline `app-nav.test.tsx`'s own top docblock explains, and the reason
 * a THIRD case renders `LegalNav` rather than trusting `NavBrand`'s own
 * isolated render to stand in for it.
 */
describe('13.1491 NavBrand — the tile + wordmark, shared by AppNav and LegalNav', () => {
  it('in isolation: a tile (aria-hidden) and a VISIBLE wordmark reading "Gisik Nokma"', () => {
    const { container } = render(<NavBrand />);
    const group = container.querySelector('.gn-nav__brand');
    expect(group).not.toBeNull();
    // The GROUP is not aria-hidden — only the tile is (the wordmark beside it
    // must stay in the accessibility tree, since it is plain visible text).
    expect(group?.hasAttribute('aria-hidden')).toBe(false);

    const tile = group?.querySelector('.gn-nav__brand-tile');
    expect(tile).not.toBeNull();
    expect(tile?.getAttribute('aria-hidden')).toBe('true');
    expect(tile?.querySelector('svg')).not.toBeNull();

    const wordmark = group?.querySelector('.gn-nav__wordmark');
    expect(wordmark).not.toBeNull();
    expect(wordmark?.hasAttribute('aria-hidden')).toBe(false);
    expect(wordmark?.textContent).toBe('Gisik Nokma');
  });

  it('LegalNav renders the SAME group — a real mount, not just the component existing', () => {
    render(<LegalNav />);
    // `getByText` reads the accessibility tree; it can only find the wordmark
    // because the wordmark is NOT aria-hidden (13.1491's own isolated case
    // above proves that in general — this proves LEGAL-NAV's actual mount
    // does not, say, wrap it in the old `.gn-nav__brand-tile` `--gn-accent`
    // span that used to carry the whole pair aria-hidden).
    expect(screen.getByText('Gisik Nokma')).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Legal' });
    const tile = nav.querySelector('.gn-nav__brand-tile svg');
    expect(tile).not.toBeNull();
  });

  it('MUTATION WITNESS: dropping the wordmark from LegalNav is visible to this suite', () => {
    // The brief's own mutation target — "drop the wordmark from legal-nav" —
    // simulated by rendering the component with the wordmark's own child
    // removed after mount, the DOM-level equivalent of the regression this
    // case exists to catch (the wordmark silently missing from ONE of the
    // two bars while the other still carries it).
    const { container } = render(<LegalNav />);
    const wordmark = container.querySelector('.gn-nav__wordmark');
    expect(wordmark, 'LegalNav does not render a wordmark at all').not.toBeNull();
    wordmark?.remove();
    expect(container.querySelector('.gn-nav__wordmark')).toBeNull();
    expect(screen.queryByText('Gisik Nokma')).not.toBeInTheDocument();
  });
});

/**
 * 13.1492 — "bold heavy text" (owner ruling 2026-09-24). A CSS-binding gate:
 * this proves the RULE carries `font-weight: 800`, never that a real browser
 * renders it that heavy for a font the OS may not ship every weight of —
 * 13.1495's hand reading is what a real browser answers.
 */
describe('13.1492 the wordmark is bold heavy — font-weight: 800', () => {
  it('.gn-nav__wordmark declares font-weight: 800', () => {
    const rule = ruleFor(css, /^\.gn-nav__wordmark\s*\{/);
    expect(rule, '.gn-nav__wordmark has no rule').toBeDefined();
    expect(rule).toMatch(/font-weight:\s*800\s*;/);
  });

  it('MUTATION WITNESS: the pre-ruling weight (600, the legal bar\'s own old value) reddens', () => {
    const mutant = css.replace('.gn-nav__wordmark { font-size: 17px; line-height: 22px; font-weight: 800; }', '.gn-nav__wordmark { font-size: 17px; line-height: 22px; font-weight: 600; }');
    expect(mutant, 'the planted text matched nothing — the witness is inert').not.toBe(css);
    const rule = ruleFor(mutant, /^\.gn-nav__wordmark\s*\{/);
    expect(rule).not.toMatch(/font-weight:\s*800\s*;/);
    expect(rule).toMatch(/font-weight:\s*600\s*;/);
  });
});

/**
 * 13.1493 — the class-collision fix itself (owner ruling 2026-09-24): before
 * this, `.gn-nav__brand` was declared TWICE in `globals.css` — a tile-only
 * rule here and a second, `--gn-accent`-tinted pair for `LegalNav`'s own old
 * markup, the later one silently overriding parts of the earlier at equal
 * specificity (the same class-collision shape `13.887`'s own docblock names
 * for `.gn-members__row`, one file over). A COUNT over the whole stylesheet,
 * not `ruleFor`'s first-match — a second definition further down the file
 * would pass a first-match check while still winning the cascade by source
 * order, exactly as the original bug did.
 */
describe('13.1493 .gn-nav__brand is defined exactly once in globals.css', () => {
  function occurrences(source: string): number {
    return (source.match(/^\.gn-nav__brand\s*\{/gm) ?? []).length;
  }

  it('exactly one declaration of the bare selector', () => {
    expect(occurrences(css)).toBe(1);
  });

  it('MUTATION WITNESS: re-adding the deleted second definition reddens this case', () => {
    const mutant = `${css}\n.gn-nav__brand { display: inline-flex; align-items: center; gap: 0.6rem; flex: none; }\n`;
    expect(mutant, 'the planted text matched nothing — the witness is inert').not.toBe(css);
    expect(occurrences(mutant)).toBe(2);
  });
});

/**
 * 13.1494 — the phone arm of the 390px width budget (owner ruling 2026-09-24:
 * "hide the WORDMARK (not the tile)"). `globals.css` holds FOUR
 * `@media (max-width: 40rem)` blocks (`nav-phone-disclosure.test.ts`'s own
 * docblock), so "the 40rem block" is found by a needle unique to the phone
 * DISCLOSURE one (`.gn-nav__more-toggle`), the same block E4-11's own cases
 * already read — this rule was added to THAT block, not a new one, so the
 * two families cannot drift into two different phone breakpoints for the
 * same bar.
 */
describe('13.1494 below 40rem the wordmark is hidden, the tile is not', () => {
  /** Brace-matched, single needle — same shape as `nav-phone-disclosure.test.ts`'s `blockContaining`. */
  function fortyRemBlockNaming(source: string, needle: string): string | undefined {
    const marker = '@media (max-width: 40rem) {';
    let i = 0;
    for (;;) {
      const start = source.indexOf(marker, i);
      if (start === -1) return undefined;
      let depth = 0;
      let end = source.length - 1;
      for (let j = source.indexOf('{', start); j < source.length; j += 1) {
        if (source[j] === '{') depth += 1;
        else if (source[j] === '}') {
          depth -= 1;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      const block = source.slice(start, end + 1);
      if (block.includes(needle)) return block;
      i = end + 1;
    }
  }

  it('the disclosure\'s own 40rem block hides the wordmark and leaves the tile alone', () => {
    const phone = fortyRemBlockNaming(css, '.gn-nav__more-toggle');
    expect(phone, 'no 40rem block names .gn-nav__more-toggle').toBeDefined();
    expect(phone).toContain('.gn-nav__wordmark { display: none; }');
    // The tile must NOT be hidden — a mutation swapping the class would pass
    // a bare-substring check for "something is hidden below 40rem" while
    // hiding the WRONG piece, which is exactly the ruling's own distinction.
    expect(phone).not.toContain('.gn-nav__brand-tile { display: none; }');
  });

  it('MUTATION WITNESS: hiding the tile instead of the wordmark is a DIFFERENT declaration this case would catch', () => {
    const mutant = css.replace(
      '.gn-nav__wordmark { display: none; }',
      '.gn-nav__brand-tile { display: none; }',
    );
    expect(mutant, 'the planted text matched nothing — the witness is inert').not.toBe(css);
    const phone = fortyRemBlockNaming(mutant, '.gn-nav__more-toggle');
    expect(phone).not.toContain('.gn-nav__wordmark { display: none; }');
    expect(phone).toContain('.gn-nav__brand-tile { display: none; }');
  });
});
