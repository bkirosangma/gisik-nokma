import { useEffect, useRef, type ReactNode } from 'react';
import { FocusScope } from '@react-aria/focus';

export type DialogProps = { open: boolean; title: string; onClose: () => void; children: ReactNode };

/**
 * P8 — `aria-modal="true"` is a CLAIM that everything outside this panel is
 * inert, and this component made it while moving no focus, trapping none, and
 * restoring none. Three consequences, all measured:
 *
 *  - focus stayed on the button that opened the dialog (the reviewer painted
 *    `document.activeElement` still the *New ticket* button at 300 ms and at
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
export function Dialog({ open, title, onClose, children }: DialogProps) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // See the docblock above: focus enters the panel on open, so the dialog is
  // announced and Tab starts from inside it. Keyed on `open` alone — this must
  // not re-run and steal focus back every time a parent re-renders.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="gn-dialog__scrim" data-testid="dialog-scrim" onClick={onClose}>
      <FocusScope contain restoreFocus>
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
      </section>
      </FocusScope>
    </div>
  );
}
