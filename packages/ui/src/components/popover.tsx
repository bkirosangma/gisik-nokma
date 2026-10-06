import { useLayoutEffect, useRef } from 'react';
import type { ReactElement, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { FocusScope } from '@react-aria/focus';
import { DismissButton, useOverlay, useOverlayPosition } from '@react-aria/overlays';

export type PopoverProps = {
  triggerRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** Names the dialog for assistive tech. Required, so it cannot be forgotten. */
  'aria-label': string;
  children: ReactNode;
};

/**
 * A small anchored dialog — the product's first popover (the visibility menu,
 * spec 2026-09-22). Built from the same react-aria pieces `select.tsx` uses,
 * for the same reasons: `FocusScope restoreFocus` returns focus to the
 * trigger when the portal unmounts, `useOverlay` closes on Escape and
 * outside interaction, `DismissButton` gives screen-reader users a way out.
 * `role="dialog"` and not `menu`: the content is a fieldset with radios and
 * a button, not a list of commands.
 *
 * The hooks live in `OpenPopover`, mounted only while open (case 18.256a).
 * `useOverlayPosition` re-positions when the overlay changes size, through a
 * ResizeObserver that it attaches once, when the hook mounts, and only if the
 * overlay element exists at that moment. Mounted closed, the overlay never got
 * observed, so content that grew after opening (the visibility menu's people
 * list) was never re-positioned: the popover stayed below the trigger with Apply
 * past the fold, and the scroll that reached Apply closed the popover.
 *
 * Close-on-scroll (react-aria's `useCloseOnScroll`, which `useOverlayPosition`
 * runs with its `onClose`) closes on ANY scroll event from an ancestor of the
 * trigger, and a browser dispatches a scroll event at the next frame after the
 * scroll. So the event for a scroll made just before the popover opened (Add
 * link brought into view, then Enter) arrives after it opened and closed it at
 * once: the release walk's "first key ignored" (row 5). Only a scroll that
 * MOVED the trigger closes it now; the trigger's place is read when it opens.
 */
export function Popover(props: PopoverProps): ReactElement | null {
  if (!props.open) return null;
  return <OpenPopover {...props} />;
}

function OpenPopover({ triggerRef, onClose, 'aria-label': ariaLabel, children }: PopoverProps): ReactElement {
  const overlayRef = useRef<HTMLDivElement>(null);
  const openedAt = useRef<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = triggerRef.current?.getBoundingClientRect();
    openedAt.current = r === undefined ? null : { top: r.top, left: r.left };
  }, [triggerRef]);
  const closeOnScroll = () => {
    const at = openedAt.current;
    const r = triggerRef.current?.getBoundingClientRect();
    if (at !== null && r !== undefined && Math.abs(r.top - at.top) < 0.5 && Math.abs(r.left - at.left) < 0.5) return; // nothing moved
    onClose();
  };
  const { overlayProps: positionProps, placement } = useOverlayPosition({
    targetRef: triggerRef,
    overlayRef,
    placement: 'bottom end',
    offset: 6,
    isOpen: true,
    onClose: closeOnScroll,
  });
  const { overlayProps: dismissProps } = useOverlay(
    { isOpen: true, onClose, isDismissable: true, shouldCloseOnBlur: false },
    overlayRef,
  );
  return createPortal(
    <div
      {...positionProps}
      {...dismissProps}
      ref={overlayRef}
      role="dialog"
      aria-label={ariaLabel}
      className="gn-popover"
      data-placement={placement}
    >
      <FocusScope contain restoreFocus autoFocus>
        <DismissButton onDismiss={onClose} />
        {children}
        <DismissButton onDismiss={onClose} />
      </FocusScope>
    </div>,
    document.body,
  );
}
