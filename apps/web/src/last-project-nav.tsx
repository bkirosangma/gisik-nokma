'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  const projects = useWorkspaceProjects(workspaceId);
  // `routeProjectId` is undefined HERE, and that is the design rather than an
  // omission: this component is the memory's READER. The project PAGE passes
  // its own id and is the writer, exactly as `useLastWorkspace` treats the
  // route as authority one level up.
  const remembered = useLastProject(workspaceId, undefined, userId);

  // `null` while the read is pending or refused — never `[]`, which would be a
  // claim that this workspace has no projects. See `useWorkspaceProjects`.
  const live = projects === null ? null : projects.filter((p) => !p.archived);
  const rememberedLive =
    remembered.status === 'remembered' && live !== null
      ? (live.find((p) => p.id === remembered.projectId) ?? null)
      : null;
  // The fallback is `live[0]`, which is the first non-archived project in
  // SERVED order — the order `/workspaces` renders. Not sorted, not re-derived.
  const shown: ProjectRef | null = rememberedLive ?? live?.[0] ?? null;

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
