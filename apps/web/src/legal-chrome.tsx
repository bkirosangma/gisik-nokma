import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The two pieces of navigation the refreshed export added to `/privacy` and
 * `/terms` — the segmented tab pair (`desktop.dc.html` `isLegal`, `:1730-1735`)
 * and the anchor row (`:1738-1742`) — rendered from ONE source per page.
 *
 * ## Why the TOC takes the page's sections instead of its own list
 *
 * The dispatch's words were "built from the pages' existing headings — not a
 * hand-typed list", and that is a property, not a preference: a second list of
 * section names is free to drift from the `<h2>`s it claims to describe, and it
 * drifts in the direction that reads as correct (the page still renders, the
 * anchors still resolve, and the one section somebody added is simply missing
 * from the row until a reader notices). So each page declares its sections once
 * — `{ id, title }` beside the prose that section renders — and hands that same
 * array to both `LegalToc` here and its own `<h2>`s. A section cannot be in one
 * and not the other, because there is no second thing to update.
 *
 * The witness for that property is a unit case, not this comment: the rendered
 * TOC's labels and anchors are compared against the rendered `<h2>`s' own text
 * and ids (`legal-screens.test.tsx`). Deleting the `<h2>` mapping reddens it.
 *
 * ## The tab pair
 *
 * Two `<Link>`s carrying `aria-current="page"` on the active one, not the
 * product's `SegmentedControl`. The export draws a segmented control, and the
 * look is transcribed in CSS — but a `SegmentedControl` is a set of
 * `role="tab"` buttons driven by an `onSelect` callback, and these two are
 * NAVIGATION between two real routes. Rendered as buttons they would lose
 * middle-click, "open in new tab", the browser's own link affordances and the
 * `page` semantics that make `aria-current` the right attribute; the visual
 * result would have been identical and the control strictly worse. The
 * dispatch asked for "the segmented `legalTabs` control", which is the look
 * and the two destinations, and both are here.
 *
 * ## The TOC's `aria-label`, and a count that did not fall
 *
 * The label is load-bearing twice, and the second reason is worth stating
 * plainly rather than leaving as a lucky side effect.
 *
 * First, the honest one: this page now renders TWO `<nav>` landmarks — the top
 * bar and this row — and ARIA's own guidance is that multiple navigation
 * landmarks must be distinguishable. "On this page" says which is which.
 *
 * Second: `e2e-viewport`'s accessible-names ratchet records `ariaLabel: 1` for
 * `/privacy` and `/terms`, and that 1 was `BackButton`'s
 * (`accessible-names-baseline.json`). Removing that control removes the
 * attribute, which would have taken both routes to 0 — a FALL, which 13.285
 * exists to catch. This label keeps the count at 1 by trading one labelled
 * control for one labelled landmark. **That trade is exactly what the ratchet
 * cannot judge and does not claim to**: its docblock says "a restyle that swaps
 * one accessible name for another of equal count is not this gate's business —
 * that is the copy rule, reviewed by a person". So the swap is recorded here,
 * in the PR body, and by a unit case asserting the label by string, rather than
 * being absorbed silently by a number that stayed put.
 */
export type LegalSection = { readonly title: string; readonly body: ReactNode };

/**
 * The anchor a section answers to, COMPUTED from its heading.
 *
 * Computed rather than declared, because a hand-written `id` beside a
 * hand-written `title` is the same two-lists-that-can-drift shape the TOC note
 * above rejects — one rename leaves a heading whose anchor no longer matches
 * the link pointing at it, and nothing reddens. Deriving it means the only way
 * to change an anchor is to change the heading.
 *
 * Deliberately plain: lowercase, runs of non-alphanumerics collapsed to `-`,
 * ends trimmed. No accent folding and no Unicode normalisation, because both
 * would be untested machinery for inputs this file has never seen — these are
 * headings written here, in English, and a slugifier that cannot be exercised
 * is worse than one that is obviously simple.
 */
export function sectionId(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const TABS: ReadonlyArray<{ slug: LegalSlug; href: string; label: string }> = [
  { slug: 'privacy', href: '/privacy', label: 'Privacy' },
  { slug: 'terms', href: '/terms', label: 'Terms' },
];

export type LegalSlug = 'privacy' | 'terms';

/** Privacy / Terms, as a segmented pair. See the docblock for why links. */
export function LegalTabs({ active }: { active: LegalSlug }) {
  return (
    <div className="gn-segmented gn-legal__tabs">
      {TABS.map((tab) => (
        <Link
          key={tab.slug}
          href={tab.href}
          className={
            tab.slug === active
              ? 'gn-segmented__item gn-segmented__item--on'
              : 'gn-segmented__item'
          }
          aria-current={tab.slug === active ? 'page' : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

/** The page's own section headings, as anchors. See the docblock. */
export function LegalToc({ sections }: { sections: readonly LegalSection[] }) {
  return (
    <nav className="gn-legal__toc" aria-label="On this page">
      {sections.map((section) => (
        <a key={section.title} href={`#${sectionId(section.title)}`}>
          {section.title}
        </a>
      ))}
    </nav>
  );
}
