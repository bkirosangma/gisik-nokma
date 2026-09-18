import { useEffect, type ReactNode } from 'react';

export type DialogProps = { open: boolean; title: string; onClose: () => void; children: ReactNode };

export function Dialog({ open, title, onClose, children }: DialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
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
