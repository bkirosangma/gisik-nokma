import { useRef } from 'react';
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
 */
export function Popover(props: PopoverProps): ReactElement | null {
  if (!props.open) return null;
  return <OpenPopover {...props} />;
}

function OpenPopover({ triggerRef, onClose, 'aria-label': ariaLabel, children }: PopoverProps): ReactElement {
  const overlayRef = useRef<HTMLDivElement>(null);
  const { overlayProps: positionProps, placement } = useOverlayPosition({
    targetRef: triggerRef,
    overlayRef,
    placement: 'bottom end',
    offset: 6,
    isOpen: true,
    onClose,
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
