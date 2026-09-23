'use client';

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { MIN_HEADINGS, ReadingTOC, type ReadingMeta } from '@gisik-nokma/editor';

/**
 * The floating table-of-contents launcher (owner request 2026-09-23: "a
 * small floating icon at the left bottom of the screen which can open the
 * table of contents any time"). A small round button that toggles a panel
 * around the SAME `ReadingTOC` the product already ships — this wraps it
 * rather than reimplementing scrollspy or scroll-to-heading.
 *
 * `close(returnFocus)` / document-level Escape and outside-pointerdown
 * follow `account-menu.tsx`'s own established pattern rather than inventing
 * a second one: `returnFocus` is true only when the close was the reader's
 * own doing (Escape, or picking a heading) — a click elsewhere must not yank
 * focus out of wherever that click landed.
 *
 * The panel stays MOUNTED (`hidden` rather than unmounted) once the button
 * exists, so `aria-controls` always names a real element instead of a
 * dangling id that only exists while open.
 */
export function TocLauncher({
  headings,
  scrollContainerRef,
}: {
  headings: ReadingMeta['headings'];
  scrollContainerRef: RefObject<HTMLElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // A note swap that drops under MIN_HEADINGS must not leave an invisible
  // open panel behind it.
  useEffect(() => {
    if (headings.length < MIN_HEADINGS) setOpen(false);
  }, [headings.length]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close(true);
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (panelRef.current?.contains(target) === true) return;
      if (buttonRef.current?.contains(target) === true) return;
      close(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  if (headings.length < MIN_HEADINGS) return null;

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className="gn-toc-launcher__button"
        aria-label="On this page"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((was) => !was)}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false">
          <path d="M4 6h16M4 12h10M4 18h13" />
        </svg>
      </button>
      {/* Reuses `ReadingTOC`'s own scroll-to-heading and scrollspy — a click
          on one of its links bubbles here, where it is told apart from a
          click elsewhere in the panel by its class. */}
      <div
        id={panelId}
        ref={panelRef}
        className="gn-toc-launcher__panel"
        hidden={!open}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('.reading-toc__link') !== null) close(true);
        }}
      >
        <ReadingTOC headings={headings} scrollContainerRef={scrollContainerRef} />
      </div>
    </>
  );
}
