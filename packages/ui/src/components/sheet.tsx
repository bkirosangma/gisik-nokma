import { useEffect, type ReactNode } from 'react';

export type SheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /**
   * Controls rendered in the header BESIDE the close button — the ticket sheet's
   * `Full screen` toggle is the only one today.
   *
   * Optional so that no existing caller changes: `Sheet` has exactly ONE product
   * caller (`ticket-sheet.tsx`, three renders) plus one test, measured rather
   * than assumed before adding a prop to a shared component.
   */
  headerActions?: ReactNode;
  /**
   * Fills the viewport instead of standing as the right-hand panel.
   *
   * Transcribed from the prototype's own three-part treatment
   * (`desktop.dc.html:3396-3400`), because doing half of it is what makes a
   * "full screen" that is not: the SCRIM goes opaque (`--surface`, so the page
   * is covered rather than dimmed), the PANEL fills the viewport with no radius
   * and no slide, and the BODY becomes a centred column. The body's cap is the
   * prototype's own 860px.
   */
  full?: boolean;
};

/** A right-hand side panel with the same accessibility contract as Dialog. */
export function Sheet({ open, title, onClose, children, headerActions, full = false }: SheetProps) {
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
    <div
      className={full ? 'gn-sheet__scrim gn-sheet__scrim--full' : 'gn-sheet__scrim'}
      data-testid="sheet-scrim"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={full ? 'gn-sheet gn-sheet--full' : 'gn-sheet'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gn-sheet__header">
          <h2 className="gn-sheet__title">{title}</h2>
          {headerActions}
          <button type="button" className="gn-sheet__close" aria-label="Close sheet" onClick={onClose}>
            ×
          </button>
        </header>
        <div className={full ? 'gn-sheet__body gn-sheet__body--full' : 'gn-sheet__body'}>{children}</div>
      </section>
    </div>
  );
}
