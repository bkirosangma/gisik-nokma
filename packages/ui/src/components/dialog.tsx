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
          <button type="button" className="gn-dialog__close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="gn-dialog__body">{children}</div>
      </section>
    </div>
  );
}
