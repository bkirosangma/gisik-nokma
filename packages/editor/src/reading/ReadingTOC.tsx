import { useEffect, useState } from 'react';
import type { ReadingMeta } from './reading-meta.js';
import { findScroller } from './scroller.js';

/**
 * The sticky table of contents for a long document (spec §8.2), ported from
 * the knowledge-base app's `ReadingTOC.tsx`.
 *
 * ## WHAT THE PORT DROPPED, AND IT IS THE SAME RULE `editor.css` CARRIES
 *
 * The source gates on `window.innerWidth >= 1100` and paints itself with
 * Tailwind classes. Both are the PAGE's business here: this package ships
 * structure, its stylesheet names no colour, and a width rule inside a
 * component is a second, hidden breakpoint that no stylesheet can override.
 * The plan says so — "the width rule is the page's, not the component's" — so
 * the port keeps the ONE visibility rule the spec states (fewer than three
 * headings → nothing) and leaves the rest to `editor.css` and the caller.
 *
 * ## THE ENTRIES ARE ANCHORS
 *
 * The source renders `<button>` and scrolls the container by hand. An `<a
 * href="#id">` is the same affordance with the semantics the platform already
 * has: it is a link, it is focusable, it appears in the document's link list,
 * and it copies as a URL. The click handler still honours
 * `prefers-reduced-motion`, so nothing the source did is lost.
 *
 * ## WHICH ELEMENT SCROLLS (KB-parity audit, 2026-09-29)
 *
 * The source scrolls `root.scrollTo(...)` and roots its observer at `root`.
 * On the note page `root` is `.gn-notes__editor`, which does not scroll — the
 * window does — so the click was a silent no-op (after `preventDefault`) and
 * the highlight was computed against a page-tall box. Both now ask
 * `findScroller` (`scroller.ts`) / use `scrollIntoView`, which work for a
 * scrolling pane and for the window alike.
 */

/**
 * Fewer than this many headings and there is nothing worth a rail. EXPORTED
 * (owner request 2026-09-23's floating table-of-contents button) so the
 * button that opens this rail's panel gates on the SAME threshold rather
 * than a copied literal that could drift from it.
 */
export const MIN_HEADINGS = 3;

export type ReadingTOCProps = {
  headings: ReadingMeta['headings'];
  /** The element the editor scrolls inside — the same one the reader scrolls. */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
};

export function ReadingTOC({ headings, scrollContainerRef }: ReadingTOCProps): React.JSX.Element | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Scrollspy, anchored to the container the reader is actually scrolling.
  // Re-bound whenever the heading set or the root changes, because switching
  // documents swaps both.
  useEffect(() => {
    if (headings.length < MIN_HEADINGS) return;
    const root = scrollContainerRef.current;
    if (root === null) return;
    // The IntersectionObserver root is the scroller ONLY when one element
    // scrolls; the window scrolls on the note page, and an observer rooted at
    // a non-scrolling, page-tall element would call every heading visible.
    const scroller = findScroller(root);
    const targets = headings
      .map((h) => root.querySelector(`#${CSS.escape(h.id)}`))
      .filter((el): el is Element => el !== null);
    if (targets.length === 0) return;
    // jsdom has no IntersectionObserver; a reader-facing rail on a surface
    // that cannot observe is not a failure, it is an unhighlighted list.
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;
        visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const id = visible[0]?.target.id;
        if (id !== undefined && id !== '') setActiveId(id);
      },
      // The top margin pulls the trigger zone down so the highlight moves as a
      // heading APPROACHES the top of the reading area, not only once it has
      // passed it.
      { root: scroller.kind === 'element' ? scroller.element : null, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [headings, scrollContainerRef]);

  if (headings.length < MIN_HEADINGS) return null;

  return (
    <nav className="reading-toc" aria-label="On this page">
      <ul className="reading-toc__list">
        {headings.map((heading) => (
          <li key={heading.id} className={`reading-toc__item reading-toc__item--h${heading.level}`}>
            <a
              className="reading-toc__link"
              href={`#${heading.id}`}
              aria-current={heading.id === activeId ? 'true' : undefined}
              title={heading.text}
              onClick={(event) => {
                const root = scrollContainerRef.current;
                if (root === null) return;
                const target = root.querySelector(`#${CSS.escape(heading.id)}`);
                if (target === null) return;
                event.preventDefault();
                const reduced =
                  typeof window !== 'undefined' &&
                  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
                // `scrollIntoView` moves whichever ancestor scrolls (the window
                // on the note page, where `root.scrollTo` was a silent no-op);
                // the breathing room above the heading is the SKIN's
                // `scroll-margin-top`, not a number in here.
                (target as HTMLElement).scrollIntoView?.({
                  block: 'start',
                  behavior: reduced ? 'auto' : 'smooth',
                });
                setActiveId(heading.id);
              }}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
