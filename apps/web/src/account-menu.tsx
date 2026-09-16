'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Avatar } from '@gisik-nokma/ui';
import { authClient } from './auth-client.js';
import { useCurrentUser } from './providers.js';

/**
 * `AccountMenu` — the nav's person-scoped corner (Round 24, owner: "make it
 * into a round profile pic like thing, that opens up a context menu on click.
 * signout option will be moved to the bottom of that menu. along with the help
 * and account item from the nav bar").
 *
 * ## This is NOT transcribed from the prototype, and that is worth saying
 *
 * Every other port on this branch could point at `desktop.dc.html` for its
 * shape. This one cannot: the prototype's nav is a flat list built from
 * `navDef` (`:2277`) and it has no account menu, no avatar button and no
 * popover anywhere. So the geometry below follows the prototype's CONTROL
 * metrics (the 44px control floor, `ctlBg`, `cardBg`/`cardShadow` for the
 * surface) while the BEHAVIOUR is this file's own. A later round that "restores
 * prototype fidelity" here would be restoring something that never existed.
 *
 * ## Why the identity moved into the menu rather than being dropped
 *
 * The control this replaces was `Sign out {name}` — its accessible name carried
 * WHO you were signed in as, on every page in the product, and the shell
 * ratchets an accessible-name floor partly on it. A monogram avatar says
 * nothing: two people with the same initial render identically. So the menu
 * opens with name + email (owner's choice, Round 24), which is where that
 * information now lives. Dropping it would have been a silent loss dressed as a
 * restyle.
 *
 * The email is `string | null` (`useCurrentUser`) and the line is OMITTED when
 * null rather than rendered blank — an empty row under a name reads as "this
 * person has no email", which is a claim, where an absent row claims nothing.
 *
 * ## The menu is a real menu, because a div that opens is not one
 *
 * `aria-haspopup="menu"` + `aria-expanded` on the trigger, `role="menu"` on the
 * surface and `role="menuitem"` on each entry. Opening MOVES FOCUS to the first
 * item, arrow keys walk the items, and Escape closes and returns focus to the
 * trigger. Pointer-down outside closes too.
 *
 * **Focus-on-open is what makes the focus-return real, and that was measured
 * rather than assumed.** The first cut of this component opened without moving
 * focus, on the reasoning that Escape would hand focus back to the trigger.
 * With focus never having left the trigger — clicking it focuses it, and the
 * menu took nothing — "returns focus to the trigger" was trivially true, and
 * the case asserting it PASSED with the focus-return line deleted. A check that
 * cannot fail. Moving focus into the menu on open is both the documented menu
 * pattern and the thing that gives that assertion something to measure.
 *
 * `next/link` is kept for Help and Account rather than `router.push` on a
 * button: they are destinations, and a middle-click or a copy-link on a real
 * anchor is behaviour people expect from nav items. They are anchors WITH
 * `role="menuitem"`, which is the documented pattern for a menu of links.
 */
export function AccountMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    // Only when the close was the USER's doing (Escape, or picking an item).
    // A close caused by clicking somewhere else must not yank focus back out
    // of wherever they just clicked.
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Focus the first item when the menu opens. See the docblock: without this,
  // focus never leaves the trigger and `close(true)`'s focus-return is
  // unmeasurable.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
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
      // Wraps at both ends, which is the menu pattern's own behaviour and
      // spares a keyboard user from a dead end at the last item.
      const at = items.indexOf(document.activeElement as HTMLElement);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = at === -1 ? 0 : (at + step + items.length) % items.length;
      // The page would otherwise scroll under the open menu.
      event.preventDefault();
      items[next]?.focus();
    };
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target === null) return;
      // The TRIGGER is excluded deliberately: without this, a click on it while
      // the menu is open would close here and reopen in the button's own
      // handler, and the menu would appear never to close.
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

  if (user === null) return null;

  return (
    <div className="gn-nav__account">
      <button
        ref={triggerRef}
        type="button"
        className="gn-nav__avatar-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        /* The accessible name names the PERSON, because the visible content is
           a monogram and a button called "Account menu" would tell a screen
           reader user less than the old `Sign out {name}` control did. */
        aria-label={`Account menu for ${user.name}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <Avatar size="small" name={user.name} />
      </button>
      {open ? (
        <div ref={menuRef} id={menuId} role="menu" className="gn-nav__menu">
          <div className="gn-nav__menu-header">
            <span className="gn-nav__menu-name">{user.name}</span>
            {/* Omitted, never blank — see the docblock. */}
            {user.email !== null ? (
              <span className="gn-nav__menu-email">{user.email}</span>
            ) : null}
          </div>
          {/* `aria-current` follows the items rather than being dropped with
              the bar links: "you are already here" is as true inside a menu as
              it was in the nav, and it is the only signal distinguishing the
              current page once the visible treatment is a hover state. */}
          <Link
            href="/help"
            role="menuitem"
            className="gn-nav__menu-item"
            aria-current={pathname === '/help' ? 'page' : undefined}
            onClick={() => close(false)}
          >
            Help
          </Link>
          <Link
            href="/account"
            role="menuitem"
            className="gn-nav__menu-item"
            aria-current={pathname === '/account' ? 'page' : undefined}
            onClick={() => close(false)}
          >
            Account
          </Link>
          {/* Sign out sits at the BOTTOM, behind a separator (owner, Round 24).
              Its accessible name keeps the full `Sign out {name}` sentence the
              old nav button carried — the shell's accessible-name floor is
              ratcheted on that string, and `apps/web/e2e-stack/
              passkey-registration.spec.ts` addresses the control by it. The
              control moved; the name did not. */}
          <button
            type="button"
            role="menuitem"
            className="gn-nav__menu-item gn-nav__menu-item--signout"
            aria-label={`Sign out ${user.name}`}
            onClick={() => {
              close(false);
              void authClient.signOut().then(() => {
                router.push('/sign-in');
              });
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
