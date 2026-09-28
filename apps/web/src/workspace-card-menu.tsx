'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react';
import {
  ARCHIVE_LABEL,
  DELETE_TRIGGER_LABEL,
  RESTORE_LABEL,
  WORKSPACE_MENU_LABEL,
  moreActionsFor,
} from '@gisik-nokma/app-core';

/**
 * The workspace card's overflow menu (trash Plan 4, spec §6.2): **Archive** /
 * **Restore** and **Delete…**, for the workspace OWNER only — the caller does
 * not render it for anyone else (D4; spec §4: workspace acts are owner-only).
 *
 * ## AccountMenu's recipe, not a new one
 *
 * `account-menu.tsx` is the product's menu: a trigger with `aria-haspopup` and
 * `aria-expanded`, a NAMED `role="menu"` (case 13.1059's sweep reads the
 * opening tag), the first item focused on open, ArrowUp/ArrowDown cycling,
 * Escape closing and returning focus to the trigger, and a pointer-down outside
 * closing it. This is that recipe for a card.
 *
 * ## It is a SIBLING of the card's door, never inside it (D5)
 *
 * The card body is one `<Link>` (Round 19c); a button nested in a link is
 * invalid interactive content and would be announced as part of the door. The
 * caller renders this beside the link, inside the same `Card`.
 *
 * ## The menu closes, returning focus to the trigger, BEFORE either act
 *
 * Delete… opens `DeleteDialog`, whose `FocusScope restoreFocus` returns focus
 * to whatever held it when the dialog mounted. That must be this trigger — an
 * unmounted menu item would leave focus on `<body>`.
 */
export function WorkspaceCardMenu({
  name,
  archived,
  disabled,
  onArchiveToggle,
  onDelete,
}: {
  name: string;
  archived: boolean;
  disabled: boolean;
  onArchiveToggle: () => void;
  onDelete: () => void;
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
    <div className="gn-card-menu">
      <button
        ref={triggerRef}
        type="button"
        className="gn-card-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={moreActionsFor(name)}
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
        <div ref={menuRef} id={menuId} role="menu" aria-label={WORKSPACE_MENU_LABEL} className="gn-card-menu__list">
          <button
            type="button"
            role="menuitem"
            className="gn-card-menu__item"
            onClick={() => {
              close(true);
              onArchiveToggle();
            }}
          >
            {archived ? RESTORE_LABEL : ARCHIVE_LABEL}
          </button>
          <button
            type="button"
            role="menuitem"
            className="gn-card-menu__item"
            onClick={() => {
              close(true);
              onDelete();
            }}
          >
            {DELETE_TRIGGER_LABEL}
          </button>
        </div>
      ) : null}
    </div>
  );
}
