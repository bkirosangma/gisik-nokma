'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactElement, type RefObject } from 'react';

export type OverflowItem = { label: string; onSelect: () => void };

/**
 * A "⋯" trigger and its `role="menu"` — the product's ONE overflow menu, lifted out of
 * `WorkspaceCardMenu` (trash Plan 4, spec §6.2) so the note byline's phone menu (mobile-web plan
 * Task 9, case 21.131) is the same control and not a second copy of it. The DOM, the classes
 * (`.gn-card-menu*`) and the behaviour are the card menu's, unchanged: `aria-haspopup` /
 * `aria-expanded` / `aria-controls` on the trigger, a NAMED menu (case 13.1059), the first item
 * focused on open, ArrowUp/ArrowDown cycling, Escape closing and returning focus to the trigger,
 * and a pointer-down outside closing it. Each item closes the menu, returns focus, then runs.
 *
 * `className` adds a modifier to the wrapper: the card menu is absolutely placed in its card's
 * corner; the byline's sits in a flex row (`.gn-card-menu--inline`). `triggerRef`, when given, is
 * pointed at the trigger button, so a caller whose item opens something in place (the project card's
 * Edit form) can send focus back to it when that closes.
 */
export function OverflowMenu({
  triggerLabel,
  menuLabel,
  items,
  disabled = false,
  className,
  triggerRef: outerTriggerRef,
}: {
  triggerLabel: string;
  menuLabel: string;
  items: readonly OverflowItem[];
  disabled?: boolean;
  className?: string;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      if (items.length === 0) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = at === -1 ? 0 : (at + step + items.length) % items.length;
      event.preventDefault();
      items[next]?.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target === null) return;
      if (menuRef.current?.contains(target) === true) return;
      if (triggerRef.current?.contains(target) === true) return;
      close(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, close]);

  return (
    <div className={className === undefined ? 'gn-card-menu' : `gn-card-menu ${className}`}>
      <button
        ref={(node) => {
          triggerRef.current = node;
          if (outerTriggerRef !== undefined) (outerTriggerRef as { current: HTMLButtonElement | null }).current = node;
        }}
        type="button"
        className="gn-card-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={triggerLabel}
        disabled={disabled}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        {/* Decorative: the accessible name above says what this is. */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="1.75" />
          <circle cx="12" cy="12" r="1.75" />
          <circle cx="19" cy="12" r="1.75" />
        </svg>
      </button>
      {open ? (
        <div ref={menuRef} id={menuId} role="menu" aria-label={menuLabel} className="gn-card-menu__list">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="gn-card-menu__item"
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
