import { useEffect, useRef, type ReactNode } from 'react';
import { FocusScope } from '@react-aria/focus';

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
  /**
   * Replaces the `<h2>` heading with a caller-supplied node — the ticket
   * sheet's editable title and the location breadcrumb above it.
   *
   * **`title` is still REQUIRED when this is passed, and it is still what names
   * the dialog.** `aria-label={title}` is the sheet's accessible name, and it is
   * deliberately NOT `titleSlot`: a control whose value is mid-edit, or empty
   * because somebody cleared it, is not a name. The string is the ticket's
   * current title as the server last served it; the slot is the control that
   * proposes the next one.
   *
   * Optional so that no existing caller changes — `Sheet` has one product
   * caller (`ticket-sheet.tsx`) plus tests, measured rather than assumed before
   * adding a prop to a shared component.
   */
  titleSlot?: ReactNode;
};

/**
 * A right-hand side panel with the same accessibility contract as Dialog —
 * including, since P8, the containment half of it: `dialog.tsx`'s docblock
 * carries the full reasoning (the measured leaks, the three-part remedy, and why
 * focus lands on the panel rather than on its first focusable child), and this
 * component applies the identical `FocusScope contain restoreFocus` plus the
 * `focus()`-on-open effect. Read that docblock; this one records only what
 * differs.
 *
 * What differs is the Escape guard below, and it does not interact with
 * containment: a child that has already handled Escape keeps it
 * (`event.defaultPrevented`), which is about WHO closes the sheet, not about
 * where focus is when it does. The restore is the same either way, because
 * `FocusScope` restores on unmount and both exits unmount the same subtree.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  headerActions,
  titleSlot,
  full = false,
}: SheetProps) {
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      /**
       * ⚠ A child that has ALREADY handled this Escape keeps it.
       *
       * Without this line the sheet closes on ANY Escape, including one a
       * control inside it consumed. The ticket sheet's title field is where that
       * bites: its Escape branch abandons the draft, and while this line was
       * absent the sheet ALSO closed, so the field's documented behaviour —
       * *"Escape abandons the draft"* — was true of an input that was being
       * unmounted. An independent reviewer measured `onClose` called once.
       * **The branch's own case could not see it**: its `renderSheet` passes an
       * `onClose` spy that never unmounts, so the sheet stayed on screen and the
       * assertion held for a reason unrelated to what ships.
       *
       * ⚠ **THIS FIX IS ONLY HALF, AND THE OTHER HALF IS AT THE CALLER.** The
       * reviewer's finding also said the title field's branch *"calls
       * `preventDefault()`"* — **it did not**, and an earlier version of this
       * docblock repeated that as fact without reading the line. A child that
       * handles Escape must call `preventDefault()` for this guard to see it; the
       * caller was changed in the same round, and the case that proves both
       * halves is the ticket sheet's `Escape … does not close the sheet`, which
       * stayed RED until the caller's half landed. **A peer's finding is a
       * claim.**
       *
       * The React handler at the root container runs before this document-level
       * native listener, so `defaultPrevented` is already set by the time this
       * reads it. This is the standard escape-hatch contract, and the editor
       * toolbar's own link field relies on the same one.
       */
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  // See `dialog.tsx`: focus enters the panel on open, keyed on `open` alone.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div
      className={full ? 'gn-sheet__scrim gn-sheet__scrim--full' : 'gn-sheet__scrim'}
      data-testid="sheet-scrim"
      onClick={onClose}
    >
      <FocusScope contain restoreFocus>
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={full ? 'gn-sheet gn-sheet--full' : 'gn-sheet'}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="gn-sheet__header">
          {titleSlot ?? <h2 className="gn-sheet__title">{title}</h2>}
          {headerActions}
          <button type="button" className="gn-sheet__close" aria-label="Close sheet" onClick={onClose}>
            ×
          </button>
        </header>
        <div className={full ? 'gn-sheet__body gn-sheet__body--full' : 'gn-sheet__body'}>{children}</div>
      </section>
      </FocusScope>
    </div>
  );
}
