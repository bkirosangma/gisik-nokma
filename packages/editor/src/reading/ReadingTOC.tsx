import { useEffect, useState } from 'react';
import type { ReadingMeta } from './reading-meta.js';

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
 * and it copies as a URL. The click handler still scrolls the CONTAINER (the
 * document's own scroller is not the one that moves) and still honours
 * `prefers-reduced-motion`, so nothing the source did is lost.
 */

/** Fewer than this many headings and there is nothing worth a rail. */
const MIN_HEADINGS = 3;

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
      { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 },
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
                const top = (target as HTMLElement).offsetTop - 16;
                root.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
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
