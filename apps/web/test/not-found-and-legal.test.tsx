import { render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

/**
 * The legal pages are server components, but the top bar they now carry is a
 * client one — `legal-nav.tsx` imports `AccountMenu`, which reads
 * `usePathname` and `useRouter` — so the module graph still reaches
 * `next/navigation` and still needs it stubbed.
 *
 * The stub is deliberately inert. It used to capture `back` and `push` because
 * 13.322/13.323 asserted WHICH of the two a `BackButton` called; those cases
 * are SUPERSEDED (see the note below) and nothing here branches on navigation
 * any more. It stays because the import is real, not because a case reads it —
 * and if it were removed the module graph would fail to load rather than fail
 * an assertion, which is the louder of the two failures and the reason it is
 * left in its plain form rather than deleted with its old comment.
 */
const nav = { back: vi.fn(), push: vi.fn() };
// `useParams` is required by `LastProjectNav` (via `AppNav`), which reads the
// route's project id. A partial mock of a module a component calls is an
// import-time throw, and this file mounts the nav through the legal chrome.
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => nav,
  useParams: () => ({}),
}));

import NotFound from '../app/not-found.js';
import PrivacyPolicy from '../app/privacy/page.js';
import Terms from '../app/terms/page.js';

/**
 * Pre-launch checklist items 1–3: the custom 404, the privacy policy and the
 * terms page.
 *
 * The 404 cases are about a claim the page makes; the legal cases are about a
 * claim it must NOT make. The second kind is the reason this file exists at all
 * — see `13.252`.
 */

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('the 404, which says WHICH KIND of not-found it cannot rule out', () => {
  it('13.249 names all three causes and refuses to say which one happened', () => {
    render(<NotFound />);

    // The three causes, present together. Asserting one would pass against a
    // page that named only that one — which is the generic 404 this replaces.
    expect(screen.getByText(/address is mistyped/i)).toBeInTheDocument();
    expect(screen.getByText(/page moved/i)).toBeInTheDocument();
    expect(screen.getByText(/exists and is not yours to see/i)).toBeInTheDocument();

    // And the refusal itself, which is the whole point: the server answers the
    // same 404 for "no such thing" and "not yours" so that nobody can probe for
    // which records exist. A page that guessed would undo that.
    expect(screen.getByText(/will not tell you which of the three/i)).toBeInTheDocument();
    expect(screen.getByText(/would let anyone discover which\s+records exist/i)).toBeInTheDocument();
  });

  it('13.250 offers a way out, because an error without a recovery path is half a message', () => {
    render(<NotFound />);
    expect(screen.getByRole('link', { name: /workspaces/i })).toHaveAttribute('href', '/workspaces');
    expect(screen.getByRole('link', { name: /inbox/i })).toHaveAttribute('href', '/inbox');
  });
});

describe('the legal pages', () => {
  /**
   * 13.251 — every slot that must be a placeholder still IS one, asserted by
   * COUNT and not by presence.
   *
   * The first version of this case used `toContain` per placeholder, and a
   * mutation walked straight through it: replacing `[JURISDICTION]` with an
   * invented "Karnataka, India" in the Disputes clause left three other
   * `[JURISDICTION]`s standing, so `toContain` was still satisfied and the suite
   * stayed green. **`toContain` asks whether a placeholder survives ANYWHERE;
   * the property that matters is that NONE of them was filled in.** On a legal
   * page those are very different questions — a real-looking jurisdiction in the
   * clause that decides which court hears a dispute is exactly the sentence
   * somebody would rely on.
   *
   * Counts are the cheap way to ask the real question. They are deliberately
   * brittle: filling a placeholder in reddens this test, and that is correct,
   * because the moment these stop being placeholders is the moment a lawyer must
   * already have reviewed the page. Updating the number is how that gets
   * recorded rather than slipped in.
   */
  it('13.251 carry bracketed placeholders in EVERY slot, counted, not merely present somewhere', () => {
    const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

    // Every placeholder in each page, with the count MEASURED from the rendered
    // output rather than guessed. (The first draft of these numbers was guessed
    // and one was wrong, which this suite caught immediately — an expectation is
    // not a reading.)
    const expected: Array<[string, Record<string, number>]> = [
      [
        'privacy',
        {
          '[ENTITY NAME]': 3,
          '[JURISDICTION]': 1,
          '[CONTACT EMAIL]': 2,
          '[REGISTERED ADDRESS]': 1,
          '[DATE]': 1,
          '[RESPONSE PERIOD]': 1,
          '[SUPERVISORY AUTHORITY]': 1,
        },
      ],
      [
        'terms',
        {
          '[ENTITY NAME]': 3,
          '[JURISDICTION]': 2,
          '[CONTACT EMAIL]': 1,
          '[DATE]': 1,
          '[MINIMUM AGE]': 1,
          '[LIABILITY CAP]': 1,
          '[COURTS/VENUE]': 1,
        },
      ],
    ];

    const rendered: Record<string, string> = {
      privacy: render(<PrivacyPolicy />).container.textContent ?? '',
      terms: render(<Terms />).container.textContent ?? '',
    };

    for (const [page, placeholders] of expected) {
      const text = rendered[page] ?? '';
      for (const [placeholder, n] of Object.entries(placeholders)) {
        expect(count(text, placeholder), `${page}: ${placeholder}`).toBe(n);
      }
      // A control on the method: a bracket-shaped string that is NOT one of ours
      // must count zero, or these numbers are measuring the wrong thing.
      expect(count(text, '[NOT A REAL PLACEHOLDER]'), `${page}: control`).toBe(0);
    }
  });

  /**
   * 13.252 — **the boilerplate warning lives in the source and MUST NOT reach a
   * reader.**
   *
   * The owner's instruction was precise: mark these pages as unreviewed
   * boilerplate *in a code comment, not on the live page*. Both halves matter and
   * they pull in opposite directions, which is exactly the kind of pair that
   * drifts. A live page announcing its own unreliability is worse than useless
   * to somebody trying to read a policy; a file with no marker at all is how an
   * unreviewed policy ships as though a lawyer had seen it.
   *
   * So this asserts BOTH ends against BOTH files: the marker is in the source,
   * and none of its text is in the render. Asserting only the render would pass
   * against a file whose warning somebody deleted; asserting only the source
   * would pass against a page that printed it.
   *
   * ⚠ A THIRD end was added by E5-38 (round-2 ruling, 2026-09-21), and it points
   * the other way: a reader-facing DRAFT NOTICE must be IN the render. The
   * owner's instruction above governs the MARKER — the words `BOILERPLATE`,
   * `NOT REVIEWED BY A LAWYER` and `NOT LEGAL ADVICE` — and that half is
   * unchanged. The ruling drew a narrower line: the sign-in screen binds a
   * person's agreement to both documents while they still print bracketed
   * placeholders, so the pages owe the reader a sentence saying so. Without the
   * third assertion this test would pass against a page that told a reader
   * nothing at all about its own draft state.
   */
  it('13.252 keep the "not reviewed by a lawyer" marker in the SOURCE and out of the RENDER', () => {
    const pages = [
      { file: 'app/privacy/page.tsx', node: <PrivacyPolicy /> },
      { file: 'app/terms/page.tsx', node: <Terms /> },
    ];

    for (const { file, node } of pages) {
      const source = readFileSync(join(WEB_ROOT, file), 'utf8');
      expect(source, `${file} lost its boilerplate marker`).toContain(
        'NOT REVIEWED BY A LAWYER',
      );
      expect(source, `${file} must name what has to happen before real data`).toContain(
        '[JURISDICTION]',
      );

      const { container } = render(node);
      const rendered = container.textContent ?? '';
      expect(rendered, `${file} leaked its internal marker onto the page`).not.toContain(
        'NOT REVIEWED BY A LAWYER',
      );
      expect(rendered).not.toContain('BOILERPLATE');
      expect(rendered).not.toContain('NOT LEGAL ADVICE');

      // E5-38 — the boundary has a SECOND half, and it is the opposite one. The
      // internal marker stays in the comment; a reader-facing DRAFT NOTICE must
      // reach the page, because the sign-in screen binds a person's agreement to
      // this document while it still prints bracketed placeholders. Asserting
      // only the three `not.toContain`s above would pass against a page that
      // said nothing at all to a reader about its own draft state.
      expect(rendered, `${file} must tell the reader it is a draft`).toContain('Draft notice.');
      expect(rendered).toContain('The bracketed details below are not yet filled in.');
    }
  });

  it('13.253 state the four things the product does not promise, in the terms themselves', () => {
    render(<Terms />);
    // These are true of the shipped build and are the honest disclosure a user
    // needs. They are asserted here so that a later legal cleanup cannot quietly
    // remove them without a test going red.
    expect(screen.getByText(/does not notify you outside the app/i)).toBeInTheDocument();
    expect(screen.getByText(/does not know whether a linked Google Drive file/i)).toBeInTheDocument();
    expect(screen.getByText(/day is India/i)).toBeInTheDocument();
    expect(screen.getByText(/Parts of it are not built yet/i)).toBeInTheDocument();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 13.682–13.689 — the refreshed export's port to the legal pair and the 404
 * (2026-09-18).
 *
 * ## 13.322 / 13.323 ARE SUPERSEDED, AND THE REASON IS NOT THAT THEY WERE WRONG
 *
 * They asserted a `Back` control on each legal page, because both pages linked
 * only to EACH OTHER and a reader arriving from the sign-in card could cross
 * between them forever and never get back (owner feedback, 2026-09-08). The
 * control worked and the two cases witnessed both of its branches.
 *
 * The refreshed export's `isLegal` block draws a top bar with a brand tile, the
 * wordmark and a `Sign in` link (`desktop.dc.html@6d7b67c0a52c:1722-1729`) —
 * **and no back affordance anywhere in `:1720-1755`**, which is the condition
 * the dispatch put on replacing the control rather than keeping both. So the
 * control is gone and its two cases have no subject. They are recorded as
 * SUPERSEDED in `test-cases/13-deployment-dogfooding.md` rather than deleted,
 * because the ruling they pinned was real and the reason it stopped applying is
 * the part worth keeping.
 *
 * **What survives, and what does not, stated so the trade is on the record.**
 * `BackButton`'s fallback for a reader with no history was `/sign-in` — these
 * pages are reached from the sign-in card, so the route the reader came from is
 * the route back. (The component itself is gone, Step 2c-2 `17c8345c`.)
 * The bar's `Sign in` link points at the same route, so a reader who landed
 * with no history still has a real destination. What is genuinely LOST is the
 * one-press return for a reader who does have history — the export leaves them
 * the browser's chrome and nothing more. 13.682 witnesses the replacement
 * (the link exists and the old control does not); no case claims the press
 * count is the same, because it is not.
 */

/** Both legal pages, with the labels the cases below are parameterised on. */
const LEGAL_PAGES = [
  { id: '13.682', label: 'privacy', slug: 'privacy', node: <PrivacyPolicy />, path: '/privacy' },
  { id: '13.682', label: 'terms', slug: 'terms', node: <Terms />, path: '/terms' },
] as const;

describe('the legal pages’ top bar', () => {
  /**
   * 13.682 — the export's bar replaced the Back control.
   *
   * Two halves, and the SECOND is the load-bearing one: asserting the `Sign in`
   * link exists would pass just as well against a page that kept `BackButton`
   * beside it, which is the shape the dispatch explicitly rejected. So the
   * absence of the old control is asserted by its accessible name — the same
   * string 13.322 and 13.323 queried — and deleting the bar reddens the first
   * half while re-adding the button reddens the second.
   */
  for (const { label, node } of LEGAL_PAGES) {
    it(`13.682 ${label} carries the export's bar, and the Back control it replaced is gone`, () => {
      render(node);

      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
      expect(screen.getByText('Gisik Nokma')).toBeInTheDocument();

      // The old control, by the name 13.322/13.323 used to find it.
      expect(
        screen.queryByRole('button', { name: 'Back to the previous page' }),
      ).not.toBeInTheDocument();
    });
  }

  /**
   * 13.683 — **the anchor row is built from the page's own headings.**
   *
   * This is the property the dispatch asked for in those words ("built from the
   * pages' existing headings — not a hand-typed list"), and the two assertions
   * below are what makes it checkable rather than merely intended: every anchor
   * label equals its heading's text, in order, and every anchor's `href` equals
   * that heading's own `id` with a `#` in front. A second, independently typed
   * list of section names can satisfy neither the moment a heading is added,
   * renamed or reordered — which is the only way this drifts in practice.
   *
   * **Its boundary, stated rather than implied:** the equality is against the
   * RENDERED headings, not against the section array, so a hand-typed row that
   * happens to match today's headings passes. What it cannot do is keep passing
   * after the next edit to either side, and that is the failure it is here for.
   * The count assertion is the positive control — the mutation that deletes the
   * mapping and hardcodes two anchors leaves 8 and 9 headings respectively.
   */
  for (const { label, node } of LEGAL_PAGES) {
    it(`13.683 ${label}'s anchor row IS its headings, label for label and anchor for anchor`, () => {
      const { container } = render(node);

      // Found by CLASS, not by `getByRole('navigation', { name: 'On this
      // page' })`. The role query would work, and it made this case fail for a
      // reason that is not its own: renaming the label reddened 13.683 as well
      // as 13.685, so one mutation pointed at two sites and neither case named
      // its own. The property here is the row's CONTENT, and the row is
      // identified by the class that content lives under.
      const toc = container.querySelector('.gn-legal__toc');
      expect(toc, `${label} has no anchor row`).not.toBeNull();
      const anchors = within(toc as HTMLElement).getAllByRole('link');
      const headings = Array.from(container.querySelectorAll('section.gn-legal__section > h2'));

      expect(headings.length, `${label} rendered no headings to build a row from`).toBeGreaterThan(
        2,
      );
      expect(anchors.map((a) => a.textContent)).toEqual(headings.map((h) => h.textContent));
      expect(anchors.map((a) => a.getAttribute('href'))).toEqual(
        headings.map((h) => `#${h.id}`),
      );
    });
  }

  /**
   * 13.684 — the tab pair.
   *
   * Exactly two, pointing at the two legal routes, with `aria-current="page"`
   * on the page's OWN route and absent from the other. The "exactly one" half
   * is a real mutation target: a control that marks both current, or the wrong
   * one, is the failure a current-page indicator exists to prevent, and
   * `aria-current` on an `<a>` is what a screen reader announces as "current
   * page" rather than as an ordinary link.
   *
   * The class assertion is not cosmetic either: these segments ride the SHARED
   * `.gn-segmented` control, and that inheritance is what brings the 2.75rem
   * tap-target floor and `--gn-text`'s contrast pair with them. A bespoke class
   * would look identical and hold neither.
   */
  for (const { label, node, path } of LEGAL_PAGES) {
    it(`13.684 ${label}'s tab pair links the two legal routes and marks only its own current`, () => {
      render(node);

      const tabs = screen.getAllByRole('link', { name: /^(Privacy|Terms)$/ });
      expect(tabs.map((t) => t.getAttribute('href'))).toEqual(['/privacy', '/terms']);
      expect(tabs.every((t) => t.className.includes('gn-segmented__item'))).toBe(true);

      const current = tabs.filter((t) => t.getAttribute('aria-current') === 'page');
      expect(current).toHaveLength(1);
      expect(current[0]).toHaveAttribute('href', path);
    });
  }

  /**
   * 13.685 — **the anchor row's accessible name, by string.**
   *
   * The dispatch asked for the new accessible names to be asserted as strings
   * and not only through the sweep, because `accessible-names.ts` counts
   * ATTRIBUTES — it cannot tell "On this page" from any other label, and a
   * rename would keep its count at 1 while the name a screen reader announces
   * changed under it.
   *
   * The label is load-bearing twice. It distinguishes this page's two `<nav>`
   * landmarks (the bar and this row) from each other, which ARIA requires; and
   * it is what holds these two routes at `ariaLabel: 1` in
   * `accessible-names-baseline.json` after `BackButton`'s label left with the
   * control. **That swap is exactly what the ratchet cannot judge** — its own
   * docblock says a swap of equal count "is not this gate's business ... that is
   * the copy rule, reviewed by a person" — so it is pinned here instead of
   * being absorbed by a number that happened not to move.
   *
   * `toBe(1)` rather than "at least 1": a second label appearing on this page
   * silently would make the live sweep's number rise, and a rise is the
   * direction nothing checks.
   */
  for (const { label, node } of LEGAL_PAGES) {
    it(`13.685 ${label}'s anchor row is named "On this page" and it is the page's only label`, () => {
      const { container } = render(node);

      expect(screen.getByRole('navigation', { name: 'On this page' })).toBeInTheDocument();
      const labelled = container.querySelectorAll('[aria-label]');
      // ⚠ CHANGED BY exec1 P31 (2026-09-21), and the reason is recorded rather
      // than the expectation quietly widened. This arm used to read
      // `['On this page']` — ONE label on the page — and the finding is that the
      // chrome bar above it was a second, UNNAMED landmark on these very routes.
      // Naming it is the fix, so the page now carries two, and the assertion
      // below is a two-element list rather than a `.toContain`. The property
      // this case actually guards is UNCHANGED and still asserted: the TOC's own
      // label is present and is exactly `On this page`. What is gone is the
      // incidental "and nothing else on this page is labelled", which was never
      // about the TOC.
      //
      // The live accessible-names ratchet RISES on these two routes (1 → 2), and
      // a rise is the direction nothing checks — recorded in the PR body, the
      // same way `legal-chrome.tsx`'s own note records the swap that kept the
      // count at 1 when `BackButton` left.
      expect(Array.from(labelled).map((el) => el.getAttribute('aria-label'))).toEqual([
        'Legal',
        'On this page',
      ]);
    });

    /**
     * 13.1053 — exec1 P31 — **the legal chrome is a NAMED landmark.**
     *
     * `LegalNav` rendered `<nav className="gn-nav">` with no accessible name, and
     * it co-renders with the TOC above — so a screen-reader user opening the
     * landmark list met two `navigation` regions and only one of them said what
     * it was. The declaration is swept product-wide in
     * `nav-landmark-name.test.tsx`; THIS reads the name off the rendered element,
     * so a label declared but never reaching the DOM reddens here. Queried by
     * role AND name: `getByRole('navigation')` alone would be ambiguous on this
     * page and would stay green against an unnamed bar.
     */
    it(`13.1053 ${label}'s chrome is a named "Legal" landmark, reached by role and name`, () => {
      render(node);
      // THE WITNESS — before the fix this threw with `Unable to find an
      // accessible element with the role "navigation" and name "Legal"`.
      expect(screen.getByRole('navigation', { name: 'Legal' })).toBeInTheDocument();
    });
  }
});

/**
 * 13.686–13.689 — the 404.
 *
 * The audit's verdict governs every case here: **the export is THINNER than
 * this page, not ahead of it** (`docs/design/prototype-delta-2026-09-18.md`).
 * Three things are portable — a 72px icon tile, a third action link, and the
 * heading's scale and measure — and the COPY IS NOT ONE OF THEM. The cases
 * below are split along exactly that line, so a future round that "finishes the
 * port" by adopting the export's wording reddens 13.689 rather than shipping.
 */
describe('the 404, ported from the export without taking its copy', () => {
  /**
   * 13.686 — the icon tile.
   *
   * Three properties, each with its own reason. `aria-hidden` because the tile
   * repeats what the `h1` says and a screen reader reading it twice is a
   * regression, not a decoration; the 72px and the glyph paths because the
   * export draws exactly those (`:1847`) and the tile is otherwise the kind of
   * element that gets quietly resized by the next spacing pass.
   *
   * The paths are asserted by COUNT and by their distinguishing commands rather
   * than by a full string compare: the folder outline is shared with the bar's
   * 30px tile in `legal-nav.tsx`, and the two cross strokes are what make this
   * glyph the 404's rather than the brand's.
   */
  it('13.686 the 404 leads with the export’s 72px tile, and it is hidden from assistive tech', () => {
    const { container } = render(<NotFound />);

    const tile = container.querySelector('.gn-notfound__tile');
    expect(tile, 'the icon tile is gone').not.toBeNull();
    expect(tile).toHaveAttribute('aria-hidden', 'true');

    const paths = tile?.querySelectorAll('svg path') ?? [];
    expect(paths).toHaveLength(3);
    // The two cross strokes, which are this glyph's own.
    expect(Array.from(paths).map((p) => p.getAttribute('d'))).toEqual(
      expect.arrayContaining(['m9.5 11.5 5 5', 'm14.5 11.5-5 5']),
    );
    // The svg is the export's 34px box inside the 72px tile — the geometry
    // lives in CSS, so assert the attribute the markup owns rather than the
    // computed size a jsdom render cannot resolve.
    expect(tile?.querySelector('svg')?.getAttribute('width')).toBe('34');
  });

  /**
   * 13.687 — the third action link, and the ORDER.
   *
   * The order is asserted, not just the set, because it is the export's
   * (`:1855-1857`: workspaces, manual, inbox) and this page's two existing
   * links already agreed with it — inserting the manual anywhere else would
   * have looked arbitrary against both. "Search the manual" is the export's own
   * label and is asserted BY STRING: it is one of the two new accessible names
   * the dispatch requires, and the sweep next door counts attributes only.
   *
   * A positive control on the target: `/help` is asserted to be a real route on
   * disk, because "the route exists" was the audit's own reason for calling
   * this a bounded addition rather than a wire gap. If that page is ever
   * removed, this case reddens here rather than shipping a link into a 404.
   */
  it('13.687 the 404 offers the manual as a third action, in the export’s order, into a real route', () => {
    render(<NotFound />);

    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['/workspaces', '/help', '/inbox']);
    expect(screen.getByRole('link', { name: 'Search the manual' })).toHaveAttribute(
      'href',
      '/help',
    );

    expect(
      existsSync(join(WEB_ROOT, 'app/help/page.tsx')),
      'the third link points at /help, which no longer exists',
    ).toBe(true);
  });

  /**
   * 13.688 — the heading's scale and measure, and the 404's column.
   *
   * Read from the CSS SOURCE, which is where these four numbers live; jsdom
   * resolves neither an external stylesheet nor `ch`, so a computed-style
   * assertion here would measure nothing and pass. The positive control is the
   * old value: `.gn-legal__title`'s retired `1.6rem` must be gone from the
   * rule, or the assertions above are describing a declaration that is still
   * being overridden further down the file.
   */
  it('13.688 both headings take the export’s 34/41/700/-0.4px at 72ch, and the 404 is a centred 520px column', () => {
    const css = readFileSync(join(WEB_ROOT, 'app/globals.css'), 'utf8');

    const heading = /\.gn-notfound__title,\s*\.gn-legal__title \{([^}]*)\}/.exec(css);
    expect(heading, 'the shared heading rule is gone').not.toBeNull();
    const block = heading?.[1] ?? '';
    for (const decl of [
      'max-width: 72ch',
      'font-size: var(--gn-title-page)', // 34px: the page-title token (AMENDED 2026-10-02, UX fixes Task 5, case 23.070)
      'line-height: 41px',
      'font-weight: 700',
      'letter-spacing: -0.4px',
    ]) {
      expect(block.replace(/\s+/g, ' '), `heading rule lost "${decl}"`).toContain(decl);
    }
    expect(block).not.toContain('1.6rem');

    expect(css.replace(/\s+/g, ' ')).toContain('.gn-notfound { max-width: 520px; margin-inline: auto; }');

    // The phone rule, which the export's fixed 41px leading would otherwise have
    // broken: a FIXED line-height does not scale, so the 21.6px title this
    // block sets at ≤40rem would have inherited 41px of leading — a ratio of
    // 1.9 — had the block not restated it. Asserted here so that deleting the
    // restatement is a red rather than something only a phone screenshot would
    // show, and asserted as the PAIR so a bare `font-size` edit cannot satisfy
    // it by accident.
    expect(css.replace(/\s+/g, ' ')).toContain(
      '.gn-notfound__title, .gn-legal__title { font-size: var(--gn-title-page-phone); line-height: 1.25; }' // 22px, was 1.35rem (AMENDED 2026-10-02, UX fixes Task 5, case 23.070),
    );
  });

  /**
   * 13.689 — **the copy rule: nothing the product said was replaced.**
   *
   * The one case here that is about what did NOT change, and the reason the
   * reviewer's brief names it. The export's 404 says "This page isn't here" and
   * "Nothing was deleted."; adopting either would answer a question this page
   * exists to refuse — the API returns the same 404 for a thing that is absent
   * and a thing that is not yours, so a lead asserting nothing was deleted is
   * false in one of the two cases and quietly so.
   *
   * Both directions are asserted, because either alone has a way to pass while
   * being wrong: only the absences would pass against a page somebody emptied,
   * and only the presences would pass against one that added the export's
   * wording underneath. The `Last updated 8 September 2026` line is the third
   * absent string — the export's illustrative date, which the audit measured at
   * zero product hits and which must not replace the `[DATE]` placeholder the
   * legal pair carries and 13.251 counts.
   */
  it('13.689 the export’s 404 wording is absent, and the product’s own three causes are intact', () => {
    const { container } = render(<NotFound />);
    const text = container.textContent ?? '';

    for (const exportCopy of [
      'This page isn’t here',
      'This page isn\'t here',
      'Nothing was deleted',
      'Last updated 8 September 2026',
    ]) {
      expect(text, `the export's copy "${exportCopy}" reached the page`).not.toContain(exportCopy);
    }

    expect(text).toContain('This address does not match a page.');
    expect(text).toContain('will not tell you which of the three');
  });
});
