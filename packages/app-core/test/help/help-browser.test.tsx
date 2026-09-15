import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
