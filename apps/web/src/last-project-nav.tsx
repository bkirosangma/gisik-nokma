'use client';

import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { Chip } from '@gisik-nokma/ui';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ProjectRef } from '@gisik-nokma/app-core';
import {
  DEFAULT_PROJECT_TAB,
  readProjectTab,
  rememberProject,
  rememberProjectTab,
  useLastProject,
} from './use-last-project.js';
import { useWorkspaceProjects } from './use-workspace-projects.js';

/**
 * The nav's "last open project" item, and the dropdown of the others.
 *
 * Owner's request, verbatim: *"new nav item :right to the workspace name ->
 * last open project name. on click, open the project page (save the last open
 * tab as well). on hover, show the non archived projects as a dropdown, and
 * clicking them opens those projects. if there is no last opened project, then
 * this defaults to the first in the order that we display in the workspace
 * page."*
 *
 * ## It is mounted by `AppNav`, and it is a separate file for that reason
 *
 * Every other piece of this bar is its own component — `account-menu.tsx`,
 * `inbox-nav-link.tsx`, `legal-nav.tsx` — and this one is the largest of them.
 * `app-nav.tsx` renders `<LastProjectNav />` immediately right of the
 * workspace name, which is the position the owner named.
 *
 * **That split has a cost, and `app-nav.test.tsx`'s own docblock is the receipt
 * for it**: Task 14's review deleted an import AND its element from
 * `src/app-nav.tsx` and measured 125/125 green, because the component was
 * rendered only by its own test file. So this file's cases prove the component
 * WORKS, and `app-nav.test.tsx` carries a separate case proving `AppNav`
 * actually RENDERS it. Neither half is sufficient alone.
 *
 * ## What it renders, and the one thing it will not do
 *
 * The remembered project's NAME, resolved through the same served read
 * `/workspaces` renders (`useWorkspaceProjects`, `getMyWorkspaces`), so it can
 * never name something the viewer cannot reach. With nothing remembered, the
 * FIRST NON-ARCHIVED project in served order — that is `workspace.projects`
 * order with `archived` filtered, exactly what
 * `app/workspaces/page.tsx` renders, and NOT a sort this component invents.
 *
 * **With no reachable project it renders NOTHING.** That is Rounds 22 and 23's
 * rule, and the reason `AppNav`'s docblock keeps the Board item's obituary: the
 * nav does not offer a link that cannot resolve (owner: *"the board on the nav
 * bar doesn't work. lets remove it"*). **This item is what Board could never
 * be** — Board had no target that was not the current page, while a project id
 * is now something the nav actually has.
 *
 * Archiving the project you were last in therefore FALLS BACK rather than
 * disappearing, which is case 13.868: `archived` is served precisely so a
 * client can tell, and a remembered id resolved against all served projects
 * would name a project the workspaces page no longer lists.
 *
 * ## Focus opens it, and that is what makes Escape interesting
 *
 * The owner asked for hover AND focus/click, so this follows
 * `account-menu.tsx`'s menu pattern with one deliberate divergence, and the
 * divergence is load-bearing:
 *
 * **Focus is NOT pulled into the menu on open.** The account menu does move it,
 * and its docblock explains why — it opens on CLICK, so "Escape returns focus
 * to the trigger" would otherwise be trivially true and unmeasurable. This item
 * opens on FOCUS, so moving focus would make tabbing *through* the nav swallow
 * you into the menu every time you passed it.
 *
 * The consequence is that Escape and focus-open pull against each other:
 * Escape returns focus to the trigger, and focusing the trigger opens the menu.
 * A `suppressNextFocusOpen` ref breaks that loop — set for exactly the focus
 * call this component makes itself, and for nothing else. Without it Escape
 * appears not to work at all, which is what case 13.871 measures.
 */
export function LastProjectNav({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string | null;
}) {
  const pathname = usePathname();
  /**
   * THE ROUTE IS AUTHORITY HERE TOO, and this is not symmetry with
   * `useLastWorkspace` — it is the fix for a defect that a reviewer found and
   * this file originally carried (case 13.879).
   *
   * The first version passed `undefined` and left the write to the project
   * page, reasoning that the page has the project id and the nav does not. The
   * reasoning was sound and the result was wrong, because of WHERE this
   * component sits in the tree: `AppNav` is rendered inside the project page's
   * own JSX, so this effect is a DESCENDANT of the page's writer effect — and
   * **React commits passive effects CHILD-FIRST**. Measured, not read out of
   * the docs: a probe rendering a parent with one child logged
   * `["child","parent"]`.
   *
   * So on every arrival at a project page that is not through this item — a
   * card, a bookmark, a pasted link — the order was: this effect reads storage
   * and answers with the PREVIOUS project, then the page writes the new one.
   * Nothing re-ran this effect (its dependencies do not change), so the item
   * named the project you had left, and no in-page action corrected it. It
   * self-healed one navigation later, which is exactly what would have made it
   * survive a casual look.
   *
   * Taking the id from `useParams` makes the answer a function of the ROUTE
   * rather than of who wrote storage first, so the ordering stops mattering.
   * On a page with no project segment `useParams` yields `undefined` and the
   * memory is the only source, exactly as before.
   */
  const params = useParams<{ projectId?: string }>();
  const routeProjectId = typeof params.projectId === 'string' ? params.projectId : undefined;
  const projects = useWorkspaceProjects(workspaceId);
  const remembered = useLastProject(workspaceId, routeProjectId, userId);

  // `null` while the read is pending or refused — never `[]`, which would be a
  // claim that this workspace has no projects. See `useWorkspaceProjects`.
  const live = projects === null ? null : projects.filter((p) => !p.archived);
  const rememberedLive =
    remembered.status === 'remembered' && live !== null
      ? (live.find((p) => p.id === remembered.projectId) ?? null)
      : null;
  // The fallback is `live[0]`, which is the first non-archived project in
  // SERVED order — the order `/workspaces` renders. Not sorted, not re-derived.
  //
  // ⚠ **AND IT WAS A LIE ON AN ARCHIVED PROJECT'S OWN PAGE (E5-34, round-2
  // ruling, 2026-09-21).** `live` filters archived projects out, so on
  // `/w/…/p/<an archived id>` `find` missed and the fallback answered with the
  // FIRST LIVE project: the item named it, linked it, and carried no
  // `aria-current` (the pathname is not that href). The docblock above calls the
  // item "a function of the ROUTE"; that is true only of live routes, and the
  // one route this prop exists for is the project you are actually standing on.
  //
  // The route's own project is therefore resolved FIRST, archived or not — and
  // only then the memory, then the served-order fallback. The DROPDOWN stays
  // live-only (`live.map` below): it offers somewhere to GO, and an archived
  // project is not somewhere the workspaces page will show you.
  const routeProject =
    projects === null || routeProjectId === undefined
      ? null
      : (projects.find((p) => p.id === routeProjectId) ?? null);
  const shown: ProjectRef | null = routeProject ?? rememberedLive ?? live?.[0] ?? null;

  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLAnchorElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  /** See the docblock: breaks the Escape -> focus -> open loop. */
  const suppressNextFocusOpen = useRef(false);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) {
      suppressNextFocusOpen.current = true;
      triggerRef.current?.focus();
    }
  }, []);

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
      // spares a keyboard user a dead end at the last item.
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
  }, [open, close]);

  if (shown === null) return null;

  const projectHref = `/w/${workspaceId}/p/${shown.id}`;

  /**
   * Opening a project from this item, from EITHER the trigger or a dropdown
   * row. Both halves are written here rather than left to the destination page:
   * the page does write the same record when its route arrives, so the
   * navigation path is unchanged, but a click that lands on a page which then
   * fails to render would otherwise leave the memory pointing at the project
   * you were on before.
   *
   * The tab is SEEDED, not merely read: `readProjectTab(...) ?? DEFAULT` writes
   * the project's remembered tab back if it has one and the default if it does
   * not, so the destination always opens at a definite tab instead of at
   * whatever its own fallback happens to be. For a project with no memory that
   * is `board`, which is case 13.872's second assertion.
   */
  const openProject = (projectId: string): void => {
    rememberProject(workspaceId, projectId, userId);
    rememberProjectTab(projectId, readProjectTab(projectId, userId) ?? DEFAULT_PROJECT_TAB, userId);
  };

  return (
    <div
      ref={wrapperRef}
      className="gn-nav__project"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        // A pointer leaving must not close a menu a KEYBOARD user is inside:
        // hovering past an item you have focused is not a dismissal.
        if (wrapperRef.current?.contains(document.activeElement) === true) return;
        close(false);
      }}
      onBlur={(event) => {
        // React's `onBlur` is `focusout`, which bubbles, so this ONE handler
        // covers the trigger and every menuitem. `relatedTarget` is where focus
        // went; if that is outside the item, the menu closes.
        const next = event.relatedTarget as Node | null;
        if (next === null || wrapperRef.current?.contains(next) !== true) close(false);
      }}
    >
      <Link
        ref={triggerRef}
        href={projectHref}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-current={pathname === projectHref ? 'page' : undefined}
        /* ## The name says WHICH DOOR THIS IS, because the card's name is the
         * ## project's and this item's would otherwise be a second copy of it
         *
         * The home's card carries the archived half of this string for exactly
         * this state — one convention for "this project is archived", two
         * surfaces. **The trailing `projects menu` is not that convention and is
         * a different fix: it is what keeps the two doors distinguishable.**
         *
         * MEASURED on the deployed stack at the desktop viewport the stack suite
         * runs at (2026-09-22): on `/w/0TZSS5W6ATCTF2YBPMWGGP9JF5` there are
         * exactly TWO links to `/w/…/p/0XB92YA4CGEBF9S285AH4SDXR1` — this item
         * (`a.gn-nav__project`, 148×44) and the project card's door
         * (`a.gn-project-card__door`, 363×63) — and with no qualifier both carry
         * the accessible name `Shop operations`.
         * `getByRole('link', { name: 'Shop operations', exact: true }).count()`
         * reads **2** at 1280×720 and 1 at 390 (where this item is behind the
         * phone nav and out of the accessible tree). That count is why
         * `e2e-stack/helpers/board.ts`'s `openSeededBoard` refused with "found no
         * single project link".
         *
         * **The qualifier belongs HERE and not on the card.** The card door is
         * the project list's own subject: its name is the project's, it is what
         * `within(card).getByRole('link', …)` and every workspace-home case
         * address, and the exact-name query the stack suite builds is aimed at
         * it. This item is a SECOND, contextual door to the same project — the
         * only surface where the bar names one — so it is the one that has to say
         * which it is. The alternative was tried on paper and rejected: renaming
         * the card would leave `{ name: 'Shop operations', exact: true }` matching
         * THIS item, whose project is `routeProject ?? rememberedLive ?? live[0]`
         * — a POSITION, which is the silent wrong-board pick that helper's own
         * docblock exists to remove.
         *
         * The visible text is unchanged (`{shown.name}`, below): the owner asked
         * for the last open project's NAME in the bar, and WCAG 2.5.3 wants the
         * accessible name to contain the visible label, which this does. */
        aria-label={`${shown.name}${shown.archived ? ', archived' : ''}, projects menu`}
        onFocus={() => {
          // See the docblock: exactly the focus call `close(true)` makes is
          // ignored, so Escape does not immediately reopen the menu.
          if (suppressNextFocusOpen.current) {
            suppressNextFocusOpen.current = false;
            return;
          }
          setOpen(true);
        }}
        onClick={() => openProject(shown.id)}
      >
        {shown.name}
        {/* E5-34: named as archived in the item itself, the way the workspace
            home's card names it ("<name>, archived") — so the one route where
            the bar names an archived project says so rather than looking like
            every live one. The chip is the VISIBLE half; the name carries the
            state through `aria-label` below rather than through content
            concatenation, because the accessible-name algorithm inserts a
            synthetic separator between sibling nodes (`tri-state-choice.tsx`
            records that measurement) and a second visible string would be a
            second thing to keep in step. */}
        {shown.archived ? <Chip tone="neutral">Archived</Chip> : null}
      </Link>
      {open ? (
        <div ref={menuRef} id={menuId} role="menu" aria-label="Projects" className="gn-nav__menu">
          {live?.map((project) => {
            const href = `/w/${workspaceId}/p/${project.id}`;
            return (
              <Link
                key={project.id}
                href={href}
                role="menuitem"
                className="gn-nav__menu-item"
                aria-current={pathname === href ? 'page' : undefined}
                onClick={() => openProject(project.id)}
              >
                {project.name}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
