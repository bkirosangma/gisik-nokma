import { useEffect, type ReactNode } from 'react';

export type SheetProps = { open: boolean; title: string; onClose: () => void; children: ReactNode };

/** A right-hand side panel with the same accessibility contract as Dialog. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
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
    <div className="gn-sheet__scrim" data-testid="sheet-scrim" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="gn-sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gn-sheet__header">
          <h2 className="gn-sheet__title">{title}</h2>
          <button type="button" className="gn-sheet__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="gn-sheet__body">{children}</div>
      </section>
    </div>
  );
}
