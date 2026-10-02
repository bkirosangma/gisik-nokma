'use client';

import { useEffect, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { HELP_PHONE_QUERY } from '@gisik-nokma/app-core';
import { useScrollEdges } from '@gisik-nokma/ui';
import type { ReadingMeta } from '@gisik-nokma/editor';

/**
 * The Notes phone layout, modelled on /help's (smoothness G-3, 25.342–25.346).
 *
 * /help turns its sidebar into a floating panel at phone width and opens it from a round button at the bottom
 * right. This file draws the SAME two objects for Notes with the SAME classes — `gn-toc-launcher__button
 * gn-help__launcher` for the button, `gn-help__sidebar` / `__sidebar-head` / `__nav` / `__group-items` /
 * `__nav-link` for the panel and its contents — so position, lift over the bottom bar, geometry, motion and the
 * contents list's look come from the one stylesheet (`packages/ui/src/ui.css`) instead of a second copy that
 * would drift. Nothing here sets a colour, a size or a position.
 *
 * The breakpoint is /help's own (`HELP_PHONE_QUERY`, exported by app-core), not a fresh number: the stylesheet's
 * `@media` arm for the launcher and the panel is that query, and a button drawn at one width over a panel
 * styled at another is the failure case 23.232 exists to catch.
 */

function subscribePhone(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const list = window.matchMedia(HELP_PHONE_QUERY);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function phoneSnapshot(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(HELP_PHONE_QUERY).matches
    : false;
}

/** Is Notes on a phone? `false` on the server and wherever `matchMedia` is missing (jsdom): the desktop layout. */
export function useNotesPhone(): boolean {
  return useSyncExternalStore(subscribePhone, phoneSnapshot, () => false);
}

/** The floating button. Same markup as /help's `Launcher`; only the accessible name and the panel it controls differ. */
export function NotesLauncher({
  open,
  onToggle,
  buttonRef,
}: {
  open: boolean;
  onToggle: () => void;
  buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="gn-toc-launcher__button gn-help__launcher"
      data-testid="notes-launcher"
      aria-label="Notes and contents"
      aria-expanded={open}
      aria-controls="gn-notes-panel"
      onClick={onToggle}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
        focusable="false"
      >
        {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 6h16M4 12h10M4 18h13" />}
      </svg>
    </button>
  );
}

/** The panel: a pinned head (search, then the Notes/Contents switch) over ONE scroller. */
export function NotesPanel({
  open,
  asideRef,
  head,
  children,
  onPick,
}: {
  open: boolean;
  asideRef: RefObject<HTMLElement | null>;
  head: ReactNode;
  children: ReactNode;
  onPick: (event: { target: EventTarget | null }) => void;
}) {
  const edgesRef = useScrollEdges<HTMLDivElement>('y');
  return (
    <aside
      id="gn-notes-panel"
      className="gn-help__sidebar"
      aria-label="Notes and contents"
      ref={asideRef}
      tabIndex={-1}
      data-testid="notes-panel"
      data-panel-open={open ? 'true' : 'false'}
    >
      <div className="gn-help__sidebar-head">{head}</div>
      <div className="gn-help__nav gn-scroll-fade gn-scroll-fade--y" ref={edgesRef} onClick={onPick}>
        {children}
      </div>
    </aside>
  );
}

/**
 * This note's headings, in document order, drawn with /help's contents classes. `query` is the panel's one search
 * box: it narrows the list by heading text. The links are the fragment anchors `ReadingTOC` uses (`#<id>`); the
 * editor gives each heading that id.
 */
export function NotesContents({ headings, query }: { headings: ReadingMeta['headings']; query: string }) {
  const needle = query.trim().toLowerCase();
  const shown = needle === '' ? headings : headings.filter((heading) => heading.text.toLowerCase().includes(needle));
  if (shown.length === 0) {
    return (
      <p className="gn-notes__hint" role="status">
        {headings.length === 0 ? 'This note has no headings.' : 'No headings match.'}
      </p>
    );
  }
  return (
    <ul className="gn-help__group-items" data-testid="notes-contents">
      {shown.map((heading) => (
        <li key={heading.id} data-heading-level={heading.level}>
          <a className="gn-help__nav-link" href={`#${heading.id}`}>
            {heading.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * While the panel is open: Escape and a tap outside close it (a tap inside a portalled Select popover is not
 * outside), and focus goes back to the button — /help's behaviour (23.234), minus the `/` shortcut, which Notes
 * has never had. On open the current note's row is scrolled into view INSIDE the list by its own `scrollTop`
 * (`scrollIntoView` would move the page too); the rows arrive after the workspaces read, so a short observer
 * waits for the row instead of assuming it is there.
 */
export function useNotesPanelBehaviour({
  active,
  open,
  setOpen,
  asideRef,
  launcherRef,
  revealKey,
}: {
  active: boolean;
  open: boolean;
  setOpen: (next: boolean) => void;
  asideRef: RefObject<HTMLElement | null>;
  launcherRef: RefObject<HTMLButtonElement | null>;
  /** Changes when what the list should reveal changes (the pane, the current note). */
  revealKey: string;
}): void {
  useEffect(() => {
    if (!active || !open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setOpen(false);
      launcherRef.current?.focus({ preventScroll: true });
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (asideRef.current?.contains(target) || launcherRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('.gn-select__panel, .gn-popover') !== null) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [active, open, setOpen, asideRef, launcherRef]);

  useEffect(() => {
    if (!active || !open) return;
    const aside = asideRef.current;
    const nav = aside?.querySelector<HTMLElement>('.gn-help__nav') ?? null;
    if (aside === null || nav === null) return;
    const reveal = (): boolean => {
      const current = nav.querySelector<HTMLElement>('[aria-current="page"], [aria-current="location"]');
      if (current === null) return false;
      const within = nav.getBoundingClientRect();
      const at = current.getBoundingClientRect();
      nav.scrollTop += at.top - within.top - (within.height - at.height) / 2;
      return true;
    };
    if (reveal()) return;
    const observer = new MutationObserver(() => {
      if (reveal()) observer.disconnect();
    });
    observer.observe(nav, { childList: true, subtree: true });
    const timer = setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [active, open, revealKey, asideRef]);
}
