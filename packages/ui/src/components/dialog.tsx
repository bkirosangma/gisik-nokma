import { useEffect, type ReactNode } from 'react';

export type DialogProps = { open: boolean; title: string; onClose: () => void; children: ReactNode };

export function Dialog({ open, title, onClose, children }: DialogProps) {
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

  if (!open) return null;
  return (
    <div className="gn-dialog__scrim" data-testid="dialog-scrim" onClick={onClose}>
      <section
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
    </div>
  );
}
