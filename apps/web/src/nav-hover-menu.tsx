'use client';

import Link from 'next/link';
import { NavPending } from './nav-pending.js';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * How long a menu stays open after the pointer leaves the item (U-T14, case 23.251/23.252).
 *
 * Long enough that a slightly diagonal path from the trigger to the list is forgiving, short enough that a pointer
 * moving AWAY closes it well inside 300 ms. It is a constant and not a prop so the two menus that use this component
 * cannot drift apart on it.
 */
export const NAV_MENU_CLOSE_DELAY_MS = 200;

export type NavHoverMenuItem = {
  id: string;
  href: string;
  label: string;
  /** Marks the row `aria-current="page"` (the route this row points at). */
  current: boolean;
  /** Runs on a click of the row, before the navigation (Last project remembers the project here). */
  onSelect?: () => void;
};

export type NavHoverMenuTrigger = {
  href: string;
  className?: string;
  ariaLabel?: string;
  current: boolean;
  /** Runs on a click of the trigger itself. */
  onClick?: () => void;
  children: ReactNode;
};

/**
 * The nav's hover-dropdown, ONE component for both of its users: the workspace name's list of the other workspaces
 * and the Last project item's list of the workspace's other projects (U-T14, owner 2026-10-02: *"have the same
 * dropdown for workspace selection as well"*). A fix to the behaviour here is a fix to both, which is the reason it
 * was extracted rather than copied.
 *
 * It owns EVERYTHING about how the list opens and closes: hover, focus, Escape, the outside press, the blur close, the
 * hover bridge's close delay, the Arrow-key walk, and the focus guard below. Its callers own only WHAT is listed and
 * what a click remembers.
 *
 * ## The pointer: a delay, and a bridge in the CSS
 *
 * Opening is immediate on `mouseenter`. Closing is `NAV_MENU_CLOSE_DELAY_MS` after `mouseleave`, cancelled by entering
 * the item again (the list is a child of the wrapper, so entering the list is entering the wrapper). The delay alone is
 * not the fix: the list hangs 0.5rem below the trigger, and that strip belonged to neither box, so the pointer crossing
 * it left the wrapper. `.gn-nav__menu--hover` in `globals.css` makes the strip part of the list (its own padding-top,
 * transparent), so the pointer never leaves. The list is also CAPPED and scrolls inside (`.gn-nav__menu-panel`); a
 * scrollbar or wheel inside it is inside the wrapper, so scrolling never closes it.
 *
 * ## Focus opens it, and that is what makes Escape interesting
 *
 * **Focus is NOT pulled into the list on open.** The account menu does move it; it opens on CLICK, so "Escape returns
 * focus to the trigger" would otherwise be trivially true. This item opens on FOCUS, so moving focus would make tabbing
 * *through* the nav swallow you into the list every time you passed it.
 *
 * The consequence is that Escape and focus-open pull against each other: Escape returns focus to the trigger, and
 * focusing the trigger opens the list. `suppressNextFocusOpen` breaks that loop — set for exactly the focus call
 * `close(true)` makes, and for nothing else. Without it Escape appears not to work at all (case 13.871).
 *
 * A pointer leaving never closes a list a KEYBOARD user is inside: hovering past an item you have focused is not a
 * dismissal, and the timer re-checks focus when it fires.
 */
export function NavHoverMenu({
  className,
  before,
  trigger,
  menuLabel,
  items,
  enabled = true,
}: {
  /** The wrapper's own class: it is what the bar's layout CSS addresses. */
  className: string;
  /** Visible text before the trigger (Last project's label). It is a sibling, outside the link. */
  before?: ReactNode;
  trigger: NavHoverMenuTrigger;
  /** The list's accessible name. */
  menuLabel: string;
  items: readonly NavHoverMenuItem[];
  /**
   * `false` renders the trigger as a plain link: no list, no `aria-haspopup`, no hover or focus behaviour. The
   * workspace name uses it while the viewer has no OTHER workspace to go to.
   */
  enabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLAnchorElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();
  /** See the docblock: breaks the Escape -> focus -> open loop. */
  const suppressNextFocusOpen = useRef(false);

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(
    (returnFocus: boolean) => {
      cancelClose();
      setOpen(false);
      if (returnFocus) {
        suppressNextFocusOpen.current = true;
        triggerRef.current?.focus();
      }
    },
    [cancelClose],
  );

  const openMenu = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  // A timer left running past unmount would set state on a component that is gone.
  useEffect(() => cancelClose, [cancelClose]);

  const shown = enabled && open;

  useEffect(() => {
    if (!shown) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(true);
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

      const rows = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
      if (rows.length === 0) return;
      // Wraps at both ends, which is the menu pattern's own behaviour and
      // spares a keyboard user a dead end at the last item.
      const at = rows.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = at === -1 ? 0 : (at + step + rows.length) % rows.length;
      // The page would otherwise scroll under the open menu.
      event.preventDefault();
      // `focus()` scrolls the row into view inside the capped, scrolling panel (23.253).
      rows[next]?.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target === null) return;
      // The whole WRAPPER is excluded, trigger and menu alike: without this a
      // click on the trigger would close here and reopen in its own handler,
      // and the menu would appear never to close.
      if (wrapperRef.current?.contains(target) === true) return;
      close(false);
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [shown, close]);

  const focusInside = (): boolean => wrapperRef.current?.contains(document.activeElement) === true;

  return (
    <div
      ref={wrapperRef}
      className={className}
      onMouseEnter={enabled ? openMenu : undefined}
      onMouseLeave={
        enabled
          ? () => {
              // A pointer leaving must not close a menu a KEYBOARD user is inside.
              if (focusInside()) return;
              cancelClose();
              closeTimer.current = setTimeout(() => {
                closeTimer.current = null;
                if (!focusInside()) close(false);
              }, NAV_MENU_CLOSE_DELAY_MS);
            }
          : undefined
      }
      onBlur={
        enabled
          ? (event) => {
              // React's `onBlur` is `focusout`, which bubbles, so this ONE handler
              // covers the trigger and every menuitem. `relatedTarget` is where focus
              // went; if that is outside the item, the menu closes.
              const next = event.relatedTarget as Node | null;
              if (next === null || wrapperRef.current?.contains(next) !== true) close(false);
            }
          : undefined
      }
    >
      {before}
      <Link
        ref={triggerRef}
        href={trigger.href}
        className={trigger.className}
        aria-label={trigger.ariaLabel}
        aria-haspopup={enabled ? 'menu' : undefined}
        aria-expanded={enabled ? open : undefined}
        aria-controls={shown ? menuId : undefined}
        aria-current={trigger.current ? 'page' : undefined}
        onFocus={
          enabled
            ? () => {
                // Exactly the focus call `close(true)` makes is ignored, so Escape does not immediately reopen the menu.
                if (suppressNextFocusOpen.current) {
                  suppressNextFocusOpen.current = false;
                  return;
                }
                openMenu();
              }
            : undefined
        }
        onClick={() => {
          cancelClose();
          trigger.onClick?.();
        }}
      >
        <NavPending>{trigger.children}</NavPending>
      </Link>
      {shown ? (
        <div ref={menuRef} id={menuId} role="menu" aria-label={menuLabel} className="gn-nav__menu gn-nav__menu--hover">
          <div className="gn-nav__menu-panel">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                role="menuitem"
                className="gn-nav__menu-item"
                aria-current={item.current ? 'page' : undefined}
                onClick={() => item.onSelect?.()}
              >
                <NavPending>{item.label}</NavPending>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
