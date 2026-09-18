'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type InfoTipProps = {
  /**
   * The disclosure button's accessible name. Required rather than derived: an
   * icon-only button has no text to fall back on, so a caller that forgets this
   * ships a button announced as "button". Convention at the two current call
   * sites is `About <the thing the tip explains>`, which is also what keeps
   * these buttons distinguishable from each other in a query.
   */
  label: string;
  /** The explanation itself. */
  children: ReactNode;
  className?: string;
};

/**
 * An ⓘ beside a field, disclosing a short explanation on **hover, focus and
 * click** — the interaction the owner asked for on both this screen and the
 * projects nav item (2026-09-18).
 *
 * ## The mechanism is `last-project-nav.tsx`'s, not a new one
 *
 * The repo already has one disclosure pattern: a wrapper that opens on
 * mouse-enter and on focus, a trigger carrying
 * `aria-expanded`/`aria-controls`, the panel conditionally rendered, a
 * `pointerdown` outside closing it, and Escape closing it. This is that pattern
 * reduced to a single non-menu panel. **It is deliberately NOT a `title=`
 * attribute** — `ui.css:322` records the product's ruling against
 * `title=` tooltips (they are unreachable by keyboard and unstyleable), and a
 * `title` would also be a second mechanism for the same job.
 *
 * ## Three deliberate divergences from the nav item, each with its reason
 *
 * 1. **No `suppressNextFocusOpen` ref.** The nav item needs one because Escape
 *    returns focus to its trigger, and focusing that trigger opens it — so
 *    Escape appears not to work. Here Escape closes and does NOT move focus: the
 *    keyboard user is already on the trigger, and the state they want is
 *    "closed", so re-focusing would be the bug rather than the fix.
 * 2. **No focus trap and no `role="menu"`.** This is one paragraph of prose,
 *    not a set of choices. Arrow-key navigation would announce a menu with one
 *    item in it.
 * 3. **It does not take focus on open.** Same reason the nav item does not: this
 *    opens on FOCUS, so pulling focus inward would swallow anyone tabbing
 *    through the form.
 *
 * ## What it is NOT claimed to be
 *
 * The panel is in the DOM only while open, so it is a DISCLOSURE, not a
 * description: the input it explains does **not** carry `aria-describedby`
 * pointing at it.
 *
 * **And the parity between a screen-reader user and a sighted keyboard user
 * stops at the button** — this paragraph claimed they "reach the explanation"
 * alike until the review measured it, and that was an overstatement.
 * Activating the button only INSERTS a `role="note"` node: nothing moves focus
 * into it and there is no live region, so it is never announced. The sighted
 * user watches the text appear; the screen-reader user must go looking for it.
 * Making the explanation a permanent description of the field would be better
 * for that user, and would need the panel to be always-present text — recorded
 * here as the honest limit of what shipped rather than implied away.
 */
export function InfoTip({ label, children, className }: InfoTipProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement | null>(null);
  const panelId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      close();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target === null) return;
      // The whole wrapper is excluded, trigger and panel alike — the same
      // exclusion (and the same reason) the nav item's own handler carries.
      if (wrapperRef.current?.contains(target) === true) return;
      close();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  return (
    <span
      ref={wrapperRef}
      className={['gn-infotip', className].filter(Boolean).join(' ')}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        // A pointer leaving must not close a panel a KEYBOARD user is inside.
        if (wrapperRef.current?.contains(document.activeElement) === true) return;
        close();
      }}
      onBlur={(event) => {
        // React's `onBlur` is `focusout`, which bubbles, so this ONE handler
        // covers the trigger and anything focusable later added to the panel.
        const next = event.relatedTarget as Node | null;
        if (next === null || wrapperRef.current?.contains(next) !== true) close();
      }}
    >
      <button
        type="button"
        className="gn-infotip__trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // `onFocus` rather than a click-only open, because the owner asked for
        // focus as one of the three ways in.
        onFocus={() => setOpen(true)}
        // OPEN, never TOGGLE — and the reason is a race that a toggle would
        // lose. A click on a button focuses it first, so React runs `onFocus`
        // (open) and then `onClick`; a toggling `onClick` would read the state
        // it had just been given and close the panel again, leaving a click
        // that appears to do nothing at all.
        //
        // The interaction the owner asked for is that all three of hover,
        // focus and click OPEN it, so an idempotent open is the honest
        // spelling of the requirement rather than a workaround for it.
        // Dismissal is Escape, blur, pointer-leave or a click outside — the
        // four the wrapper already handles.
        onClick={() => setOpen(true)}
      >
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <path d="M12 7.6h.01" />
        </svg>
      </button>
      {open ? (
        <span role="note" id={panelId} className="gn-infotip__panel">
          {children}
        </span>
      ) : null}
    </span>
  );
}
