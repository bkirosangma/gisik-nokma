import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import * as groupsModule from '../../src/help/groups.js';
import { HELP_GROUPS } from '../../src/help/groups.js';
import { HELP_PHONE_QUERY, HelpBrowser } from '../../src/help/help-browser.js';
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
 * tidiness: the document once rendered a `Next` pager per section whose link
 * carried the NEXT SECTION'S OWN TITLE, so an unscoped `getByRole('link', { name:
 * '§1 — Signing in' })` matched two elements — the sidebar row and the pager
 * above it. (AMENDED 2026-10-02, 23.230: the pager is gone; the scoping stays,
 * because a test that took the first match would still pass with the sidebar
 * deleted.)
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
    const elsewhere = '§6 — Jobs inside jobs';
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
        notify?.([{ isIntersecting: true, target: { id: 'manual-6-jobs-inside-jobs' } }]);
      });
      expect(current()).toEqual(['§6 — Jobs inside jobs']);

      // §5 joins the band while §6 is still in it — the earlier one takes over.
      act(() => {
        notify?.([
          { isIntersecting: true, target: { id: 'manual-5-adding-a-job-and-what-you-can-change-about-it' } },
        ]);
      });
      expect(current()).toEqual(['§5 — Adding a job, and what you can change about it']);

      // §5 leaves; §6 is alone in the band again.
      act(() => {
        notify?.([
          { isIntersecting: false, target: { id: 'manual-5-adding-a-job-and-what-you-can-change-about-it' } },
        ]);
      });
      expect(current()).toEqual(['§6 — Jobs inside jobs']);
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
    expect(within(section as HTMLElement).getByText('Manual · Getting started')).toBeInTheDocument();
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

/**
 * UX fixes T13 (23.230) — the per-section `Next` pager is REMOVED (owner, 2026-10-02: "Either remove this, or
 * put only one section at a time"; chosen: remove, one continuous page). Replaces 15.24, which asserted one pager
 * per section but the last.
 */
describe('23.230 HelpBrowser — no Next pager', () => {
  it('23.230 the document draws no pager, the helper and its CSS are gone, and a section still ends with its spacing', () => {
    const { container } = render(<HelpBrowser />);
    const body = container.querySelector('.gn-help__doc');
    expect(body).not.toBeNull();
    // CONTROL — the document still renders its sections, so an absent pager is not an absent document.
    expect(body!.querySelectorAll('section.gn-help__section').length).toBeGreaterThan(5);
    expect(container.querySelector('.gn-help__pager')).toBeNull();
    // 15.24 counted in-page `#manual-…` links inside the document body: there are none now.
    const fragments = within(body as HTMLElement)
      .queryAllByRole('link')
      .filter((link) => (link.getAttribute('href') ?? '').startsWith('#manual-'));
    expect(fragments).toEqual([]);
    expect('helpNextSection' in groupsModule).toBe(false);
    const css = readUiCss();
    expect(parseRules(css).filter((rule) => rule.selectors.some((x) => x.includes('gn-help__pager')))).toEqual([]);
    expect(valueOf(ruleExactly(css, '.gn-help__section'), 'margin-bottom')).toBe('2.5rem');
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
 * UX fixes T13 — the Help sidebar is a PINNED header (search, then the Manual/FAQ switch) over a scrolling topics
 * list on desktop (23.231, 23.239), and at phone width the same `<aside>` is a floating bottom-right panel opened
 * by a "Contents and search" button (23.232–23.237). Geometry (the boxes against the viewport and the bar) is
 * measured in a real browser and recorded in the catalogue; these cases pin the markup, the behaviour and the
 * rules that produce it.
 */
const PHONE = '@media (max-width: 47.9375rem)';

function mockPhone(on: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: on && query === HELP_PHONE_QUERY,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function asideOf(container: HTMLElement): HTMLElement {
  return container.querySelector('aside.gn-help__sidebar') as HTMLElement;
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
  window.history.replaceState(null, '', '#');
  vi.restoreAllMocks();
});

describe('23.231 Help — the desktop header is pinned; only the topics scroll', () => {
  it('23.231 the switch and the search sit outside the one scroller, and the rules let only the nav scroll', () => {
    const { container } = render(<HelpBrowser />);
    const aside = asideOf(container);
    const head = aside.querySelector(':scope > .gn-help__sidebar-head') as HTMLElement;
    expect(head).not.toBeNull();
    expect(within(head).getByRole('tablist', { name: 'Help documents' })).toBeInTheDocument();
    const nav = aside.querySelector(':scope > nav.gn-help__nav') as HTMLElement;
    expect(nav).not.toBeNull();
    expect(head.contains(nav)).toBe(false);
    // The fade lives on the scroller and not on the aside, or it would fade the pinned switch.
    expect(nav).toHaveClass('gn-scroll-fade', 'gn-scroll-fade--y');
    expect(aside).not.toHaveClass('gn-scroll-fade');

    const css = readUiCss();
    const sidebar = ruleExactly(css, '.gn-help__sidebar');
    expect(valueOf(sidebar, 'position')).toBe('sticky');
    // The aside itself never scrolls: an `overflow` here would carry the switch away with the list.
    expect(valueOf(sidebar, 'overflow-y')).toBeNull();
    expect(valueOf(sidebar, 'overflow')).toBeNull();
    expect(valueOf(ruleExactly(css, '.gn-help__sidebar-head'), 'flex')).toBe('none');
    const scroller = ruleExactly(css, ['.gn-help__nav', '.gn-help__panel-results']);
    expect(valueOf(scroller, 'overflow-y')).toBe('auto');
    expect(valueOf(scroller, 'min-height')).toBe('0');
  });
});

describe('23.232–23.237 Help — the floating menu on a phone', () => {
  it('23.232 a "Contents and search" button controls the panel, and the stylesheet lifts it over the bar inside the safe area', () => {
    mockPhone(true);
    const { container } = render(<HelpBrowser />);
    const aside = asideOf(container);
    const button = screen.getByRole('button', { name: 'Contents and search' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button.getAttribute('aria-controls')).toBe(aside.id);
    // The search MOVED: one field, in the panel, and none left at the top of the column.
    const boxes = screen.getAllByRole('searchbox');
    expect(boxes).toHaveLength(1);
    expect(aside.contains(boxes[0]!)).toBe(true);
    expect(container.querySelector('.gn-help__column input')).toBeNull();

    const css = readUiCss();
    // The breakpoint the script reads is the one the stylesheet switches at.
    expect(PHONE).toBe(`@media ${HELP_PHONE_QUERY}`);
    const launcher = ruleExactly(css, '.gn-help__launcher', PHONE);
    expect(valueOf(launcher, 'display')).toBe('flex');
    expect(valueOf(launcher, 'position')).toBe('fixed');
    expect(valueOf(launcher, 'bottom')).toBe(
      'calc(max(1rem, env(safe-area-inset-bottom, 0px)) + var(--gn-bar-lift, 0px))',
    );
    expect(valueOf(launcher, 'right')).toBe('max(1rem, env(safe-area-inset-right, 0px))');
    // At least 44×44, from the one shared button rule.
    const shared = ruleExactly(css, '.gn-toc-launcher__button');
    expect(valueOf(shared, 'width')).toBe('2.75rem');
    expect(valueOf(shared, 'height')).toBe('2.75rem');
    // CONTROL — above the breakpoint the button is not drawn.
    expect(valueOf(ruleExactly(css, '.gn-help__launcher'), 'display')).toBe('none');
  });

  it('23.233 opening shows search, then the switch, then the groups; focus moves in; the current section is marked and centred', async () => {
    mockPhone(true);
    window.history.replaceState(null, '', '#manual-1-signing-in');
    const user = userEvent.setup();
    const { container } = render(<HelpBrowser />);
    const aside = asideOf(container);
    const nav = aside.querySelector('nav.gn-help__nav') as HTMLElement;
    const current = nav.querySelector('[aria-current="location"]') as HTMLElement;
    expect(current).toHaveTextContent('§1 — Signing in');
    // Geometry the panel's own scroll is computed from (jsdom has none): list at 100/200, row at 500/30.
    let scrollTop = 0;
    Object.defineProperty(nav, 'scrollTop', { configurable: true, get: () => scrollTop, set: (v: number) => { scrollTop = v; } });
    vi.spyOn(nav, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 200 } as DOMRect);
    vi.spyOn(current, 'getBoundingClientRect').mockReturnValue({ top: 500, height: 30 } as DOMRect);

    const button = screen.getByRole('button', { name: 'Contents and search' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(aside).toHaveAttribute('data-panel-open', 'true');
    expect(aside).toHaveFocus();
    expect(scrollTop).toBe(500 - 100 - (200 - 30) / 2);

    const search = within(aside).getByRole('searchbox');
    const tablist = within(aside).getByRole('tablist');
    const firstGroup = within(aside).getAllByRole('button').find((b) => b.classList.contains('gn-help__group-toggle'))!;
    expect(search.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(tablist.compareDocumentPosition(firstGroup) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(firstGroup).toHaveTextContent(/Getting started\s*\d+/);

    // The stylesheet half: fixed bottom-right, above the lifted button, its height bounded by the bar and the
    // app bar so it scrolls inside itself and never covers either.
    const panel = ruleExactly(readUiCss(), '.gn-help__sidebar', PHONE);
    expect(valueOf(panel, 'position')).toBe('fixed');
    expect(valueOf(panel, 'bottom')).toBe(
      'calc(max(1rem, env(safe-area-inset-bottom, 0px)) + var(--gn-bar-lift, 0px) + 3.5rem)',
    );
    expect(panel).toMatch(/max-height:\s*calc\(100dvh - var\(--app-nav-offset, 0px\)[^;]*var\(--gn-bar-lift, 0px\)/);
  });

  it.each(['escape', 'outside', 'button', 'link'] as const)(
    '23.234 %s closes the panel and returns focus to the button',
    async (how) => {
      mockPhone(true);
      const user = userEvent.setup();
      const { container } = render(<HelpBrowser />);
      const aside = asideOf(container);
      const button = screen.getByRole('button', { name: 'Contents and search' });
      await user.click(button);
      expect(aside).toHaveAttribute('data-panel-open', 'true');
      if (how === 'escape') await user.keyboard('{Escape}');
      if (how === 'outside') await user.pointer({ keys: '[MouseLeft]', target: container.querySelector('.gn-help__title') as HTMLElement });
      if (how === 'button') await user.click(button);
      if (how === 'link') await user.click(within(aside.querySelector('nav') as HTMLElement).getAllByRole('link')[0]!);
      expect(aside).toHaveAttribute('data-panel-open', 'false');
      expect(button).toHaveAttribute('aria-expanded', 'false');
      await vi.waitFor(() => expect(button).toHaveFocus());
    },
  );

  it('23.234 a section lands clear of the app bar: the anchors carry the bar offset as scroll-margin-top', () => {
    const rule = parseRules(readUiCss()).find((r) => r.atRule === null && r.selectors.includes('.gn-help__section') && r.selectors.includes('.gn-help__entry'));
    expect(rule, 'no shared scroll-margin rule').toBeDefined();
    expect(valueOf(rule!.body, 'scroll-margin-top')).toBe('calc(var(--app-nav-offset, 0px) + 1rem)');
  });

  it('23.235 typing in the panel shows the results INSIDE the panel; picking one closes it; an empty query shows the topics', async () => {
    mockPhone(true);
    const user = userEvent.setup();
    const { container } = render(<HelpBrowser />);
    const aside = asideOf(container);
    const button = screen.getByRole('button', { name: 'Contents and search' });
    await user.click(button);
    const search = within(aside).getByRole('searchbox');
    const nav = aside.querySelector('nav.gn-help__nav') as HTMLElement;
    await user.type(search, 'invite');
    expect(within(aside).getByRole('status')).toHaveTextContent(/answers? for/);
    // Exactly one live region on the page, and the column holds no results (one home, never both).
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(container.querySelector('.gn-help__column .gn-help__results')).toBeNull();
    expect(nav.hidden).toBe(true);

    await user.click(within(aside).getAllByRole('link')[0]!);
    expect(aside).toHaveAttribute('data-panel-open', 'false');
    await vi.waitFor(() => expect(button).toHaveFocus());

    await user.click(button);
    await user.clear(search);
    expect(nav.hidden).toBe(false);
    expect(container.querySelector('.gn-help__results')).toBeNull();
  });

  it('23.235 CONTROL — on desktop the same query renders its results in the main column and not in the sidebar', async () => {
    const user = userEvent.setup();
    const { container } = render(<HelpBrowser />);
    await user.type(screen.getByRole('searchbox'), 'invite');
    expect(container.querySelector('.gn-help__column .gn-help__results')).not.toBeNull();
    expect(asideOf(container).querySelector('.gn-help__results')).toBeNull();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('23.236 the Manual/FAQ switch inside the panel swaps the topics and the document and keeps the panel open', async () => {
    mockPhone(true);
    const user = userEvent.setup();
    const { container } = render(<HelpBrowser />);
    const aside = asideOf(container);
    await user.click(screen.getByRole('button', { name: 'Contents and search' }));
    expect(within(aside).getAllByRole('button').some((b) => b.classList.contains('gn-help__group-toggle'))).toBe(true);
    await user.click(within(aside).getByRole('tab', { name: 'FAQ' }));
    expect(aside).toHaveAttribute('data-panel-open', 'true');
    expect(screen.getByRole('button', { name: 'Contents and search' })).toHaveAttribute('aria-expanded', 'true');
    // FAQ: a flat list of topics with no group toggles, and the document is the FAQ.
    expect(within(aside).queryAllByRole('button').some((b) => b.classList.contains('gn-help__group-toggle'))).toBe(false);
    expect(container.querySelector('.gn-help__section-eyebrow')?.textContent).toMatch(/^FAQ/);
  });

  it('23.237 with reduced motion the panel opens and closes without the slide', () => {
    const css = readUiCss();
    const reduced = parseRules(css).find(
      (r) => r.atRule === '@media (prefers-reduced-motion: reduce)' && r.selectors.includes(".gn-help__sidebar[data-panel-open='false']"),
    );
    expect(reduced, 'no reduced-motion rule for the panel').toBeDefined();
    expect(reduced!.selectors).toContain('.gn-help__sidebar');
    expect(valueOf(reduced!.body, 'transition')).toBe('none');
    // CONTROL — motion is there to remove: the full-motion rules do declare a transform transition.
    expect(valueOf(ruleExactly(css, '.gn-help__sidebar', PHONE), 'transition')).toMatch(/transform/);
    expect(valueOf(ruleExactly(css, ".gn-help__sidebar[data-panel-open='false']", PHONE), 'transition')).toMatch(/transform/);
  });

  it('23.174 (superseded) the in-flow "Contents" disclosure is gone: the phone arm is the floating menu', () => {
    mockPhone(true);
    const { container } = render(<HelpBrowser />);
    expect(screen.queryByRole('button', { name: 'Contents' })).toBeNull();
    expect(asideOf(container).hasAttribute('data-contents-open')).toBe(false);
    expect(readUiCss()).not.toMatch(/\.gn-help__contents-toggle\s*[{,:]/);
  });
});

describe('23.239 Help — desktop search lives in the pinned header', () => {
  it('23.239 search is FIRST in the header, above the switch; the column holds no field; the name and a short placeholder are kept', () => {
    const { container } = render(<HelpBrowser />);
    const head = container.querySelector('.gn-help__sidebar-head') as HTMLElement;
    const search = within(head).getByRole('searchbox', { name: 'Search the manual and FAQ' });
    const tablist = within(head).getByRole('tablist');
    expect(head.firstElementChild?.contains(search)).toBe(true);
    expect(search.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(search).toHaveAttribute('placeholder', 'Search help');
    expect(container.querySelector('.gn-help__column input')).toBeNull();
    expect(container.querySelector('.gn-help__column h1')).not.toBeNull();
  });

  it('23.239 clearing the query puts the document back where the reader was; following a result does not', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'scrollY');
    let y = 1200;
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y });
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    try {
      const user = userEvent.setup();
      render(<HelpBrowser />);
      const search = screen.getByRole('searchbox');
      await user.type(search, 'invite');
      y = 0; // the results pushed the page about
      await user.clear(search);
      expect(scrollTo).toHaveBeenCalledWith(0, 1200);

      // CONTROL — the reader followed a result (a hash change) meanwhile: clearing must not yank them back.
      scrollTo.mockClear();
      y = 700;
      await user.type(search, 'invite');
      act(() => {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      });
      y = 40;
      await user.clear(search);
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      if (original !== undefined) Object.defineProperty(window, 'scrollY', original);
      else Reflect.deleteProperty(window, 'scrollY');
    }
  });
});

describe('23.240 Help — the / shortcut focuses search', () => {
  it('23.240 the field advertises it: a / hint and aria-keyshortcuts, one search component', () => {
    const { container } = render(<HelpBrowser />);
    const search = screen.getByRole('searchbox');
    expect(search).toHaveAttribute('aria-keyshortcuts', '/');
    expect(container.querySelector('.gn-help__search-hint')?.textContent).toBe('/');
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
  });

  it('23.240 / from anywhere focuses the field (without typing a slash); Ctrl/Cmd+K is not a shortcut', async () => {
    const user = userEvent.setup();
    render(<HelpBrowser />);
    const search = screen.getByRole('searchbox');
    await user.keyboard('/');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');
    (search as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'k', metaKey: true });
    expect(search).not.toHaveFocus();
  });

  it('23.240 typing / in another field, or with a modifier held, is left alone', async () => {
    const user = userEvent.setup();
    render(
      <>
        <HelpBrowser />
        <input aria-label="other" />
        <textarea aria-label="notes" />
        <select aria-label="pick">
          <option>a</option>
        </select>
        <div contentEditable suppressContentEditableWarning aria-label="rich">
          <span>x</span>
        </div>
      </>,
    );
    const search = screen.getByRole('searchbox');
    const other = screen.getByLabelText('other');
    other.focus();
    await user.keyboard('/');
    expect(other).toHaveValue('/');
    expect(search).not.toHaveFocus();
    for (const target of [screen.getByLabelText('notes'), screen.getByLabelText('pick'), document.querySelector('[contenteditable] span') as HTMLElement]) {
      // `fireEvent` returns false when a handler called `preventDefault()`: the shortcut would have taken it.
      expect(fireEvent.keyDown(target, { key: '/' }), 'a / inside an editable target was taken').toBe(true);
    }
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      expect(fireEvent.keyDown(document.body, { key: '/', [modifier]: true }), `${modifier}+/ was taken`).toBe(true);
    }
    expect(search).not.toHaveFocus();
    // CONTROL — the same key from the body IS taken, so the guards above are what stopped it.
    expect(fireEvent.keyDown(document.body, { key: '/' })).toBe(false);
    expect(search).toHaveFocus();
  });

  it('23.240 Escape in the field clears it and gives focus back to what had it; to the body when nothing did', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">before</button>
        <HelpBrowser />
      </>,
    );
    const search = screen.getByRole('searchbox');
    const before = screen.getByRole('button', { name: 'before' });
    before.focus();
    await user.keyboard('/');
    expect(search).toHaveFocus();
    await user.keyboard('abc');
    expect(search).toHaveValue('abc');
    await user.keyboard('{Escape}');
    expect(search).toHaveValue('');
    expect(before).toHaveFocus();

    (document.activeElement as HTMLElement).blur();
    await user.keyboard('/');
    await user.keyboard('{Escape}');
    expect(document.body).toHaveFocus();
  });

  it('23.240 on a phone / opens the panel with the search focused', async () => {
    mockPhone(true);
    const user = userEvent.setup();
    const { container } = render(<HelpBrowser />);
    await user.keyboard('/');
    expect(asideOf(container)).toHaveAttribute('data-panel-open', 'true');
    expect(screen.getByRole('searchbox')).toHaveFocus();
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
  });
});
