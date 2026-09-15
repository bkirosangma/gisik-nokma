import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { HELP_CONTENT } from '../../src/help/content.generated.js';
import { HELP_GROUPS } from '../../src/help/groups.js';
import { HelpBrowser } from '../../src/help/help-browser.js';

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
