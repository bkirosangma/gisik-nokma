import { cleanup, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ruleFor } from './helpers/css-rule-scan.js';
import { NavBrand } from '../src/nav-brand.js';
import { LegalNav } from '../src/legal-nav.js';
import { AppNavSkeleton } from '../src/skeletons/app-nav-skeleton.js';

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
 * docblock), so "the 40rem block" is found by a needle unique to it
 * (`.gn-nav__wordmark`). The disclosure moved to its own 70rem block on
 * 2026-09-29 (`nav-phone-disclosure.test.ts`); the wordmark is a WIDTH budget
 * of the PHONE row alone and stays at 40rem.
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

  it('the phone 40rem block hides the wordmark and leaves the tile alone', () => {
    const phone = fortyRemBlockNaming(css, '.gn-nav__wordmark');
    expect(phone, 'no 40rem block names .gn-nav__wordmark').toBeDefined();
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
    const phone = fortyRemBlockNaming(mutant, '.gn-nav__brand-tile { display: none; }');
    expect(phone).not.toContain('.gn-nav__wordmark { display: none; }');
    expect(phone).toContain('.gn-nav__brand-tile { display: none; }');
  });
});

/**
 * 27.621–27.624 (Knowledge Graph spec E §2.1, decisions D-E5/D-E6/D-E7): the brand is a LINK to `/`.
 * 27.620 (the mount in `AppNav`) lives in `app-nav.test.tsx`, where 13.1475 used to be.
 */
describe('27.621 the phone name: a visually-hidden label, not the wordmark', () => {
  it('aria-labelledby names a gn-visually-hidden span reading "Gisik Nokma, Home"; the wordmark stays display:none below 40rem and does not carry the name', () => {
    const { container } = render(<NavBrand />);
    const link = container.querySelector('a.gn-nav__brand');
    expect(link).not.toBeNull();
    const nameId = link?.getAttribute('aria-labelledby') ?? '';
    expect(nameId).not.toBe('');
    const named = container.querySelector(`[id="${nameId}"]`);
    expect(named).not.toBeNull();
    expect(named?.classList.contains('gn-nav__wordmark')).toBe(false);
    expect(named?.classList.contains('gn-visually-hidden')).toBe(true);
    expect(named?.textContent).toBe('Gisik Nokma, Home');
    // The CSS half: the phone block still hides the wordmark (13.1494's needle) and does not name the hidden label.
    const phone = ((): string | undefined => {
      const start = css.indexOf('@media (max-width: 40rem) {\n  /* The wordmark');
      return start === -1 ? undefined : css.slice(start, css.indexOf('\n}', start) + 2);
    })();
    expect(phone, 'no 40rem block opens with the wordmark note').toBeDefined();
    expect(phone).toContain('.gn-nav__wordmark { display: none; }');
    expect(phone).not.toContain('gn-visually-hidden');
    // control, same it: with the wordmark gone from the DOM the link is still resolvable by its name
    container.querySelector('.gn-nav__wordmark')?.remove();
    expect(screen.getByRole('link', { name: 'Gisik Nokma, Home' })).toBeInTheDocument();
  });
});

describe('27.622 the brand link keeps the brand\'s own look', () => {
  it('(0,2,1) rule: text ink, 0.25rem inline padding, 0.5rem gap; a visible focus ring; the bare .gn-nav__brand rule is still single (13.1493)', () => {
    const rule = ruleFor(css, /^\.gn-nav a\.gn-nav__brand\s*\{/);
    expect(rule, 'no .gn-nav a.gn-nav__brand rule').toBeDefined();
    expect(rule).toMatch(/color:\s*var\(--gn-text\)\s*;/);
    expect(rule).toMatch(/padding-inline:\s*0\.25rem\s*;/);
    expect(rule).toMatch(/gap:\s*0\.5rem\s*;/);
    const focus = ruleFor(css, /^\.gn-nav a\.gn-nav__brand:focus-visible\s*\{/);
    expect(focus, 'no :focus-visible rule for the brand link').toBeDefined();
    expect(focus).toMatch(/outline:\s*2px solid var\(--gn-focus-ring\)\s*;/);
    // control, same it: the bare selector is still declared exactly once (13.1493's count)
    expect((css.match(/^\.gn-nav__brand\s*\{/gm) ?? []).length).toBe(1);
  });
});

describe('27.623 the skeleton\'s brand is not a link', () => {
  it('<NavBrand link={false} /> holds no a, button or [tabindex] and keeps the tile and the wordmark; control: the default brand holds exactly one a', () => {
    const { container } = render(<NavBrand link={false} />);
    expect(container.querySelector('a, button, [tabindex]')).toBeNull();
    expect(container.querySelector('.gn-nav__brand-tile svg')).not.toBeNull();
    expect(container.querySelector('.gn-nav__wordmark')?.textContent).toBe('Gisik Nokma');
    // the mount: the nav skeleton's brand is that non-link brand (25.057 asserts the whole skeleton holds no `a`)
    cleanup();
    const { container: skeleton } = render(<AppNavSkeleton />);
    expect(skeleton.querySelector('.gn-nav__brand')).not.toBeNull();
    expect(skeleton.querySelector('.gn-nav__brand a')).toBeNull();
    expect(skeleton.querySelector('.gn-nav__brand')?.tagName).toBe('SPAN');
    cleanup();
    const { container: linked } = render(<NavBrand />);
    expect(linked.querySelectorAll('a')).toHaveLength(1);
  });
});

describe('27.624 LegalNav\'s brand is the same link', () => {
  it('a link named "Gisik Nokma, Home" to / inside the Legal navigation; control: the bar\'s Sign in link is unchanged', () => {
    render(<LegalNav />);
    const nav = screen.getByRole('navigation', { name: 'Legal' });
    const brand = within(nav).getByRole('link', { name: 'Gisik Nokma, Home' });
    expect(brand).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
  });
});
