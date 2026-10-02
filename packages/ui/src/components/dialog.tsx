import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { FocusScope } from '@react-aria/focus';

export type DialogProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * The control that takes the first focus instead of the panel (trash Plan 4,
   * case 19.201). ABSENT everywhere but a destructive confirm: P8's reason for
   * focusing the panel — the dialog's name is announced on arrival — still holds
   * when focus lands on a control INSIDE the panel, because entering a named
   * dialog announces it; what changes is where Enter goes, and for a destructive
   * confirm the safe answer is Cancel (spec §6.1).
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** `alertdialog` for a destructive confirm (19.202); `dialog` otherwise. */
  role?: 'dialog' | 'alertdialog';
  /** An element id inside the dialog, announced as its description (19.203). */
  describedBy?: string;
  /**
   * The dialog's actions (UX fixes T7, FD7, audit BRD-09), rendered AFTER the scrolling body as the panel's own
   * last child: the panel is a flex column capped at the viewport and only `.gn-dialog__body` scrolls, so a form
   * taller than the screen keeps its Create button in view. Absent, nothing is rendered and the dialog is what it
   * always was.
   */
  footer?: ReactNode;
};

/**
 * P8 — `aria-modal="true"` is a CLAIM that everything outside this panel is
 * inert, and this component made it while moving no focus, trapping none, and
 * restoring none. Three consequences, all measured:
 *
 *  - focus stayed on the button that opened the dialog (the reviewer painted
 *    `document.activeElement` still the *New ticket* button (now *Create ticket*) at 300 ms and at
 *    1 800 ms, with `closest('[role=dialog]')` → null);
 *  - a real Tab walked straight out of the open dialog into the page behind it —
 *    the escape `board.tsx:385-393` has to REFUSE a column action for, judging it
 *    to have arrived "behind a modal — a keyboard-focus escape" (case 13.793), so
 *    the product carries a workaround for this leak;
 *  - Escape closed the dialog and left focus on `<body>`.
 *
 * The standard was already in this repo, tested and two files away, on a LESS
 * used surface: the project page's filters sheet moves focus in on open and
 * returns it to the exact opening control on close, asserted by 13.445/13.446.
 * This brings the shared primitive up to it, with `@react-aria/focus`'s
 * `FocusScope` — already a dependency of this package, and the same primitive
 * `select.tsx` uses for E4-17 in this batch:
 *
 *  - `focus()` on the panel puts focus INTO the dialog. The panel itself, given
 *    `tabIndex={-1}`, rather than the first focusable inside it: focusing the
 *    dialog element is what makes a screen reader announce the dialog's own
 *    accessible name (`aria-label={title}`) on open, which is the fact the person
 *    arriving needs; landing them on the dismiss button and announcing *"Close
 *    dialog"* would announce the exit.
 *  - `contain` keeps Tab inside, which is the half that makes the `aria-modal`
 *    claim TRUE rather than merely stated.
 *  - `restoreFocus` returns focus to whatever had it when the scope mounted — the
 *    opener — and only once focus has actually been lost to `<body>`, so a close
 *    that left focus somewhere deliberate is not overridden.
 *
 * `FocusScope` renders no wrapper of its own (two `hidden` sentinel spans), so
 * the panel keeps its place as the scrim's own child and nothing here changes
 * layout.
 */
export function Dialog({ open, title, onClose, children, initialFocusRef, role = 'dialog', describedBy, footer }: DialogProps) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        /**
         * THE CONTRACT `Sheet` DOCUMENTS, WHICH THIS COMPONENT DID NOT HONOUR.
         *
         * `packages/ui/src/components/sheet.tsx` installs its own document
         * `keydown` that closes the sheet on Escape UNLESS
         * `event.defaultPrevented`, and its docblock says outright: *"A child
         * that handles Escape must call `preventDefault()` for this guard to
         * see it."* `Dialog` is that child whenever it is mounted inside a
         * sheet — every Move, Reopen and Bulk-close goes through it — and it
         * never called it, so ONE Escape closed both surfaces: the person who
         * meant to cancel a move landed back on the board with the sheet gone.
         *
         * ⚠ **THE `capture` ARGUMENT IS LOAD-BEARING, NOT STYLE.** Both
         * listeners are on `document`, and listeners on one node run in
         * REGISTRATION order — the sheet mounts first, so its listener is
         * registered first and would run first, reading `defaultPrevented` as
         * `false` before this line could ever set it. Preventing it from a
         * later bubble listener is too late; the sheet has already closed. A
         * CAPTURE-phase listener on `document` fires before every bubble-phase
         * listener on that same node, whatever the registration order, which is
         * what makes this one line sufficient. MEASURED, not reasoned: the
         * `preventDefault()` line ALONE, in the bubble phase, left the case RED
         * — `expected "spy" to not be called at all, but actually been called
         * 1 times` (`/tmp/ds1-T-E5-20-bubble2.log`) — and adding this argument
         * is what turned it green (`/tmp/ds1-T-E5-20-capture2.log`). The
         * measurement needs the `ui` package REBUILT first: `app-core` imports
         * `@gisik-nokma/ui` by name from `dist`, so the first two runs of this
         * experiment moved nothing at all.
         *
         * It does NOT `stopPropagation()`: the event must still reach the
         * target, or a field inside the sheet that handles Escape (the ticket
         * title's "abandon the draft") would stop working. This only states
         * that the escape was consumed.
         */
        event.preventDefault();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  // See the docblock above: focus enters the panel on open, so the dialog is
  // announced and Tab starts from inside it — or, when the caller named one,
  // enters on that control (19.201). Keyed on `open` alone — this must not
  // re-run and steal focus back every time a parent re-renders. The child's ref
  // is attached before this parent effect runs, so `.current` is the element.
  useEffect(() => {
    if (!open) return;
    (initialFocusRef?.current ?? panelRef.current)?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="gn-dialog__scrim" data-testid="dialog-scrim" onClick={onClose}>
      <FocusScope contain restoreFocus>
      <section
        ref={panelRef}
        tabIndex={-1}
        role={role}
        aria-modal="true"
        aria-label={title}
        aria-describedby={describedBy}
        className="gn-dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gn-dialog__header">
          <h2 className="gn-dialog__title">{title}</h2>
          {/* R4 (backlog/closed spec §8.3, 2026-09-18 second wave Task 9): the
              dismiss control's accessible name is "Close dialog", not "Close".

              Its VISIBLE text is `×`, so its accessible name is whatever this
              attribute says and nothing in a screenshot or a `getByText` can
              tell two spellings apart. "Close" is the least distinctive name
              available and collides with any dialog whose BODY puts a plain
              "Close" in it; `Sheet`'s counterpart has said "Close sheet" since
              Ruling 31 (2026-09-17), so this makes the pair consistent.

              NOT the reason, though it is the one usually given: the sibling
              collision Ruling 31 fixed was `Sheet`'s dismiss versus the ticket
              sheet's Close button — `TicketSheet` renders `Sheet`, not this
              component, so `Dialog` was never involved. Nor would a
              `Close N tickets` confirm collide with a dismiss named "Close":
              testing-library's `name:` is an EXACT string match, so "Close"
              never matched "Close N tickets". No shipped dialog body has a
              plain "Close" today, so this rename is preventive and
              consistency-driven rather than a fix for a live break — stated
              plainly because a right verdict carrying a wrong cause is how a
              real hole gets read as covered later. Case 13.643 pins it. */}
          <button
            type="button"
            className="gn-dialog__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="gn-dialog__body">{children}</div>
        {footer === undefined ? null : <div className="gn-dialog__footer">{footer}</div>}
      </section>
      </FocusScope>
    </div>
  );
}
