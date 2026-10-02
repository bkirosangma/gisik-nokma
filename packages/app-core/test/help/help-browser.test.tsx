import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import { HELP_GROUPS } from '../../src/help/groups.js';
import { HelpBrowser } from '../../src/help/help-browser.js';
import { parseRules, ruleExactly, valueOf, readUiCss } from '../../../ui/test/helpers/css-rules.js';

/**
 * The first render test for `HelpBrowser`. Until now this directory held only
 * `search.test.ts`, which drives `searchHelp` as a pure function — so nothing
 * in the tree asserted anything about what the component actually PUTS ON THE
 * PAGE, and the missing `h1` below went unnoticed through the whole Help
 * restyle.
 *
 * Deliberately narrow: it pins the page's heading STRUCTURE, not its content.
 * The manual and FAQ are generated from `docs/manual.md` / `docs/faq.md` by
 * `scripts/help-content.mjs`, and a test that asserted their prose would fight
 * every edit to those documents — which is exactly the coupling the generator
 * exists to avoid.
 */
describe('15.18 HelpBrowser — heading structure', () => {
  /**
   * `/help` rendered NO `h1` before 2026-09-15, so the first heading on the
   * page was an `h2` from the document body and the hierarchy started at
   * level 2. Asserted at `level: 1` rather than by text alone, because the
   * defect this guards is a heading at the WRONG LEVEL, which a text-only
   * query cannot see. Mutation: render the title as an `h2` → RED.
   */
  it('renders one level-1 heading, so the hierarchy does not start at h2', () => {
    render(<HelpBrowser />);
    expect(screen.getByRole('heading', { level: 1, name: 'Help' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  /**
   * The positive control for the case above: the document body really does
   * contribute level-2 headings, so "the hierarchy started at level 2" was a
   * statement about this page and not about an empty render. Without this, the
   * case above would pass just as happily against a component that rendered a
   * title and nothing else.
   */
  it('still renders the document body beneath it, at level 2', () => {
    render(<HelpBrowser />);
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0);
  });
});

/**
 * The topic sidebar, added 2026-09-15 with the rest of the newer desktop
 * prototype's Help design.
 *
 * Every query below is scoped through `getByRole('navigation', { name:
 * 'Topics' })` rather than run against the whole page, and that is not
 * tidiness: the document renders a `Next` pager per section whose link carries
 * the NEXT SECTION'S OWN TITLE, so an unscoped `getByRole('link', { name: '§1
 * — Signing in' })` matches two elements — the sidebar row and the pager above
 * it. A test that resolved the ambiguity by taking the first match would pass
 * with the sidebar deleted.
 */
describe('15.22 HelpBrowser — the topic sidebar', () => {
  function topics(): HTMLElement {
    return screen.getByRole('navigation', { name: 'Topics' });
  }

  /**
   * One toggle per declared group, named with its own count. The count is
   * asserted as part of the accessible name rather than by a class query
   * because it is text a reader hears, and because a wrong count is the first
   * symptom of a group that lost a section.
   */
  it('15.22 renders one toggle per declared group, each naming its own count', () => {
    render(<HelpBrowser />);
    const groups = HELP_GROUPS.manual ?? [];
    expect(groups.length).toBeGreaterThan(0);
    for (const group of groups) {
      expect(
        within(topics()).getByRole('button', {
          name: `${group.title} ${String(group.sectionIds.length)}`,
        }),
      ).toHaveAttribute('aria-expanded', 'true');
    }
  });

  /**
   * Groups open by default and collapse on click. Both halves asserted: a test
   * of the click alone would pass against a sidebar that started collapsed,
   * which is the state this component deliberately does NOT have — every
   * section behind a click would make it a worse index than the flat row of
   * links it replaces.
   */
  it('15.22 groups start open and collapse on click, hiding only their own links', () => {
    const user = userEvent.setup();
    render(<HelpBrowser />);
    const toggle = within(topics()).getByRole('button', { name: 'Getting started 4' });
    expect(within(topics()).getByRole('link', { name: '§1 — Signing in' })).toBeInTheDocument();
    const elsewhere = '§6 — Tickets inside tickets';
    expect(within(topics()).getByRole('link', { name: elsewhere })).toBeInTheDocument();

    return user.click(toggle).then(() => {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(within(topics()).queryByRole('link', { name: '§1 — Signing in' })).toBeNull();
      expect(within(topics()).getByRole('link', { name: elsewhere })).toBeInTheDocument();
    });
  });

  /**
   * The document switch: the shared `SegmentedControl`, in the sidebar, under
   * the reference's own short labels.
   *
   * This case REPLACES one asserting the opposite — that the tabs carried the
   * documents' full titles ("Gisik Nokma — instruction manual"), which the copy
   * rule required while it applied. The owner lifted that ruling for this
   * control on 2026-09-15, so the assertion is inverted on purpose rather than
   * relaxed: the long titles must be ABSENT from the switch, because a test
   * that only checked for "Manual" would pass against a control showing both.
   *
   * Asserted through `role: 'tab'` inside `role: 'tablist'`, which is what
   * `SegmentedControl` renders — so this also pins that the switch is the
   * shared component and not a fifth hand-rolled segmented row.
   */
  it('15.22 the document switch is a segmented control labelled Manual and FAQ', () => {
    render(<HelpBrowser />);
    const tablist = screen.getByRole('tablist', { name: 'Help documents' });
    const tabs = within(tablist).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Manual', 'FAQ']);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
    for (const doc of HELP_CONTENT) {
      expect(within(tablist).queryByText(doc.title)).toBeNull();
    }
  });

  /**
   * One tab per document, derived from `HELP_CONTENT` rather than hardcoded, so
   * a third document would appear in the switch instead of being unreachable.
   * Separate from the case above because that one pins the LABELS and this one
   * pins the COUNT — and a control with the right two labels and a missing
   * third is exactly the defect the labels case cannot see.
   */
  it('15.22 renders one tab per document in HELP_CONTENT', () => {
    render(<HelpBrowser />);
    const tablist = screen.getByRole('tablist', { name: 'Help documents' });
    expect(within(tablist).getAllByRole('tab')).toHaveLength(HELP_CONTENT.length);
  });

  /**
   * The FAQ's sections are already topic names, so its sidebar is a flat list
   * with no toggles at all. Asserted by the ABSENCE of buttons in the topic nav
   * plus the PRESENCE of its section links, because absence alone would also be
   * satisfied by an empty sidebar.
   */
  it('15.22 the FAQ tab shows a flat list of sections and no group toggles', () => {
    const user = userEvent.setup();
    render(<HelpBrowser />);
    const faq = HELP_CONTENT.find((doc) => doc.id === 'faq');
    expect(faq).toBeDefined();
    return user
      .click(screen.getByRole('tab', { name: 'FAQ' }))
      .then(() => {
        expect(within(topics()).queryAllByRole('button')).toHaveLength(0);
        expect(within(topics()).getByRole('link', { name: 'Privacy' })).toBeInTheDocument();
        expect(within(topics()).getAllByRole('link')).toHaveLength(faq?.sections.length ?? 0);
      });
  });
});

/**
 * The active-row highlight, added 2026-09-15 on the owner's instruction: "since
 * it's a single page document, highlight the section that is currently
 * displayed in the reading pane on the content section."
 *
 * Two mechanisms answer that, and both are covered here:
 *
 * - a scroll spy over the rendered sections, which is the real answer; and
 * - the URL fragment, which covers the frame before the spy's first callback
 *   and any environment with no `IntersectionObserver`.
 *
 * jsdom is the second of those environments, so the fragment half runs as
 * itself. The spy half runs against a STUBBED observer — which is not a
 * compromise: what could be wrong in that code is the SELECTION RULE (which
 * section wins when two share the band), and a stub drives that rule directly.
 * The `rootMargin` geometry cannot be tested here and is not claimed to be; it
 * was verified by scrolling a real browser.
 */
describe('15.25 HelpBrowser — the active row follows the reader', () => {
  /**
   * `aria-current='location'`, not `'page'`: the target is a place within this
   * page. Asserted on the ATTRIBUTE rather than a class, because the attribute
   * is the half a screen reader gets.
   */
  it('15.25 marks the fragment’s own section when no scroll spy is available', () => {
    window.location.hash = '#manual-3-workspaces-and-the-project-problem';
    render(<HelpBrowser />);
    const topics = screen.getByRole('navigation', { name: 'Topics' });
    const marked = within(topics)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'location');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAccessibleName('§3 — Workspaces, and the project problem');
    window.location.hash = '';
  });

  /**
   * A search result links to an ENTRY, not a section. Without resolving entry →
   * owning section, using the search would leave the sidebar marking nothing
   * while the reader sat in the middle of a section it could have named — so
   * this is the case that makes the search and the sidebar agree.
   */
  it('15.25 resolves an entry fragment to the section that owns it', () => {
    const manual = HELP_CONTENT.find((doc) => doc.id === 'manual');
    const section = manual?.sections.find((s) => s.entries.length > 0);
    const entry = section?.entries[0];
    expect(entry).toBeDefined();
    window.location.hash = `#manual-${entry?.id ?? ''}`;
    render(<HelpBrowser />);
    const topics = screen.getByRole('navigation', { name: 'Topics' });
    const marked = within(topics)
      .getAllByRole('link')
      .filter((link) => link.getAttribute('aria-current') === 'location');
    expect(marked).toHaveLength(1);
    expect(marked[0]).toHaveAccessibleName(section?.title ?? '');
    window.location.hash = '';
  });

  /**
   * The spy's selection rule, driven through a stubbed `IntersectionObserver`.
   *
   * Two assertions, and the second is the one worth having: when two sections
   * share the detection band the EARLIEST in document order wins, so the
   * highlight advances only once the outgoing section's tail has left the band.
   * A rule that picked the last would flicker back and forth across every
   * boundary, and both rules look identical in a single-section test.
   */
  it('15.25 highlights the section in the reading pane, earliest wins when two overlap', () => {
    const fired: ((entries: { isIntersecting: boolean; target: { id: string } }[]) => void)[] = [];
    const observed: string[] = [];
    class StubObserver {
      constructor(callback: (entries: { isIntersecting: boolean; target: { id: string } }[]) => void) {
        fired.push(callback);
      }
      observe(element: Element) {
        observed.push(element.id);
      }
      disconnect() {}
      unobserve() {}
    }
    const original = (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = StubObserver;
    try {
      render(<HelpBrowser />);
      // The positive control: it observed the real sections, so an empty
      // highlight below would mean the RULE said nothing, not that the wiring
      // never ran.
      expect(observed).toContain('manual-1-signing-in');
      expect(fired).toHaveLength(1);
      const notify = fired[0];
      expect(notify).toBeDefined();

      const current = () => {
        const topics = screen.getByRole('navigation', { name: 'Topics' });
        return within(topics)
          .getAllByRole('link')
          .filter((link) => link.getAttribute('aria-current') === 'location')
          .map((link) => link.textContent);
      };

      act(() => {
        notify?.([{ isIntersecting: true, target: { id: 'manual-6-tickets-inside-tickets' } }]);
      });
      expect(current()).toEqual(['§6 — Tickets inside tickets']);

      // §5 joins the band while §6 is still in it — the earlier one takes over.
      act(() => {
        notify?.([
          { isIntersecting: true, target: { id: 'manual-5-adding-a-ticket-and-what-you-can-change-about-it' } },
        ]);
      });
      expect(current()).toEqual(['§5 — Adding a ticket, and what you can change about it']);

      // §5 leaves; §6 is alone in the band again.
      act(() => {
        notify?.([
          { isIntersecting: false, target: { id: 'manual-5-adding-a-ticket-and-what-you-can-change-about-it' } },
        ]);
      });
      expect(current()).toEqual(['§6 — Tickets inside tickets']);
    } finally {
      (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = original;
    }
  });
});

describe('15.23 HelpBrowser — the section eyebrow', () => {
  /**
   * `MANUAL · GETTING STARTED`, rendered per section. Queried by its
   * sentence-case text because the uppercasing is `text-transform` in CSS —
   * which is the point of doing it there: the DOM keeps a string a screen
   * reader reads as a word rather than as initials.
   */
  it('15.23 names the document and the group above each grouped section', () => {
    const { container } = render(<HelpBrowser />);
    const section = container.querySelector('#manual-1-signing-in');
    expect(section).not.toBeNull();
    expect(within(section as HTMLElement).getByText('Manual, Getting started')).toBeInTheDocument();
  });

  /**
   * An ungrouped document shows the label alone — not "FAQ · " with an empty
   * half, which is what a naive template would render and what a test asserting
   * only "contains FAQ" would let through.
   */
  it('15.23 shows the document label alone where no group is declared', () => {
    const user = userEvent.setup();
    const { container } = render(<HelpBrowser />);
    const faq = HELP_CONTENT.find((doc) => doc.id === 'faq');
    return user.click(screen.getByRole('tab', { name: 'FAQ' })).then(() => {
      const section = container.querySelector('#faq-privacy');
      expect(section).not.toBeNull();
      expect(within(section as HTMLElement).getByText('FAQ')).toBeInTheDocument();
    });
  });
});

describe('15.24 HelpBrowser — the Next pager', () => {
  /**
   * One pager per section EXCEPT THE LAST, asserted as a count against the real
   * document rather than by finding one pager and calling it proved. The
   * off-by-one is the whole defect class here: a pager on the last section
   * would point nowhere, and a missing one on a middle section would strand a
   * reader mid-document.
   *
   * Counted as links inside `.gn-help__doc` whose `href` is an in-page fragment
   * — the only other links in the document body are `https://` documentation
   * links, and the sidebar is outside this element.
   */
  it('15.24 draws one pager per section but the last, pointing at the next anchor', () => {
    const { container } = render(<HelpBrowser />);
    const manual = HELP_CONTENT.find((doc) => doc.id === 'manual');
    expect(manual).toBeDefined();
    const body = container.querySelector('.gn-help__doc');
    expect(body).not.toBeNull();
    const fragments = within(body as HTMLElement)
      .getAllByRole('link')
      .filter((link) => (link.getAttribute('href') ?? '').startsWith('#manual-'));
    expect(fragments).toHaveLength((manual?.sections.length ?? 0) - 1);

    const first = manual?.sections[1];
    expect(fragments[0]).toHaveAttribute('href', `#manual-${first?.id ?? ''}`);
    expect(fragments[0]).toHaveAccessibleName(first?.title ?? '');
  });
});

/**
 * T-E4-36 — the help search announces how many answers it found, not only when
 * it found none.
 *
 * **The no-match arm has carried `role="status"` all along** (`gn-help__none`,
 * thirty lines below the count), so a screen-reader user was told *"Nothing in
 * the manual or FAQ matches …"* and told **nothing at all** when the search
 * returned nine things. Measured on `/help` at 1512, owner: after typing
 * `invite` into the search (`aria-label="Search the manual and FAQ"`, driven
 * through the input's value setter + an `input` event), `document
 * .querySelectorAll('[role=status],[aria-live]')` → **none**, while the count
 * paragraph rendered `9 answers for “invite”`.
 *
 * **The count is the answer to the question the reader just asked by typing** —
 * it is the one thing on the screen that changed — so a polite live region is
 * what this sentence was missing, not a different string. `role="status"` and
 * not a bare `aria-live`: that role IS `aria-live="polite"` with a name, and it
 * is the idiom the sibling arm already uses.
 */
describe('T-E4-36 the help search count is announced', () => {
  async function searchFor(text: string): Promise<void> {
    render(<HelpBrowser />);
    const box = screen.getByRole('searchbox', { name: 'Search the manual and FAQ' });
    await userEvent.clear(box);
    await userEvent.type(box, text);
  }

  it('T-E4-36 a search that finds something puts the count in a live region', async () => {
    await searchFor('the');
    // A query that matches: the count must exist AND be announced.
    const count = screen.getByRole('status');
    expect(count.className).toContain('gn-help__results-count');
    expect(count.textContent, `count read: ${String(count.textContent)}`).toMatch(
      /^\d+ answers? for /,
    );
  });

  it('T-E4-36 and the count is NOT a live region before there is anything to announce', async () => {
    // The negative half, so the first assertion cannot be satisfied by a page
    // that renders a status element unconditionally: an empty search box draws
    // no result count at all, and therefore no status.
    render(<HelpBrowser />);
    const statuses = screen.queryAllByRole('status');
    expect(
      statuses.filter((el) => el.className.includes('gn-help__results-count')),
      'the results count rendered before a query was typed',
    ).toHaveLength(0);
  });

  it('T-E4-36 the result link meets the 24px in-list floor', () => {
    // The finding's second half, read out of the stylesheet the way the other
    // cross-package cases in this repo do: the property is a declaration, and
    // ui.css is the authority on it.
    const css = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../../ui/src/ui.css'),
      'utf8',
    );
    const body = /\.gn-help__result-title\s*\{([^}]*)\}/.exec(css.replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(body, 'no rule for .gn-help__result-title').not.toBeNull();
    expect(body?.[1]).toMatch(/min-height:\s*1\.5rem/);
    // The load-bearing half: an inline element's height is its line box, so a
    // `min-height` needs a box that honours it.
    expect(body?.[1]).toMatch(/display:\s*inline-flex/);
  });
});

/**
 * UX fixes T10 (HLP, 23.174) — at phone width the topic tree is behind a "Contents" disclosure, so the article
 * starts within the first screen; at desktop width nothing changes.
 */
describe('23.174 Help — Contents on a phone', () => {
  const PHONE = '@media (max-width: 47.9375rem)';
  it('23.174 a "Contents" disclosure controls the topic nav (closed to start); the phone arm hides the tree until it is open, and desktop draws no toggle', async () => {
    const user = userEvent.setup();
    const { container } = render(<HelpBrowser />);
    const toggle = screen.getByRole('button', { name: 'Contents' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const nav = container.querySelector('nav.gn-help__nav')!;
    expect(toggle.getAttribute('aria-controls')).toBe(nav.id);
    expect(container.querySelector('aside.gn-help__sidebar')).toHaveAttribute('data-contents-open', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('aside.gn-help__sidebar')).toHaveAttribute('data-contents-open', 'true');
    // Picking a topic closes it again, so the article it jumped to is what the reader sees.
    await user.click(within(nav as HTMLElement).getAllByRole('link')[0]!);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    // The stylesheet half: the tree is hidden only in the phone arm, and only while closed…
    const css = readUiCss();
    const hide = parseRules(css).find(
      (r) => r.atRule === PHONE && r.selectors.includes(".gn-help__sidebar[data-contents-open='false'] .gn-help__nav"),
    );
    expect(hide, 'no phone rule hides the closed tree').toBeDefined();
    expect(valueOf(hide!.body, 'display')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-help__contents-toggle', PHONE), 'min-height')).toBe('2.75rem');
    // CONTROL — on desktop the toggle is not drawn and the tree is never hidden: the base rule hides the toggle,
    // and no rule outside the arm hides the nav.
    expect(valueOf(ruleExactly(css, '.gn-help__contents-toggle'), 'display')).toBe('none');
    expect(parseRules(css).filter((r) => r.atRule === null && r.selectors.some((x) => x.includes('data-contents-open')))).toEqual([]);
  });
});
