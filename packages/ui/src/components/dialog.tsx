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
              Its VISIBLE text is `×`, so no screenshot and no `getByText` can
              tell the two spellings apart — and the shorter one collides with
              every feature that puts a plain "Close" button in a dialog's body
              (spec §5.3's ticket-sheet Close is the first). `Sheet`'s own
              dismiss already says "Close sheet"; this makes the pair
              consistent and each name unique inside its own dialog. */}
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
