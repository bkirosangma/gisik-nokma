'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, Button } from '@gisik-nokma/ui';
import { authClient } from './auth-client.js';
import { InboxNavLink } from './inbox-nav-link.js';
import { useAppServices, useCurrentUser, useSessionStatus } from './providers.js';
import { StyleToggle } from './style-toggle.js';
import { ThemeToggle } from './theme-toggle.js';

/**
 * The current workspace's own SERVED name (Round 19b, owner feedback item 2).
 *
 * `GET /v1/me/workspaces` again — the ONE shared read this round adds, called
 * from inside `AppNav` rather than threaded as a prop through the twelve pages
 * that mount it. The alternative was editing every one of those pages to fetch
 * and pass a `workspaceName`, which is eight more places free to disagree about
 * the same workspace than this file already has reason to avoid (see
 * `src/workspace-viewer.ts`'s docblock on the same shape of duplication). This
 * is the SAME route Task 16's card and Task 19's home already call; nothing new
 * is served.
 *
 * Gated on a session exactly like `InboxNavLink`'s poll, and for the same
 * reason: a signed-out viewer transiently on a workspace-scoped route must not
 * fire a request that cannot succeed.
 *
 * **Fails silently, and the failure is OMISSION, never the id.** `getMyWorkspaces`
 * is one of the refusing reads elsewhere in this product, and while it is
 * pending or refused this hook holds `null` — the nav simply does not render a
 * workspace-name item rather than rendering the raw id or a stale guess. The
 * scope note below reads `workspaceId`, never this value, so a slow or failed
 * name lookup cannot make the note say "no workspace selected" while one is
 * plainly in the route.
 */
function useWorkspaceName(workspaceId: string | undefined): string | null {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const signedIn = session.kind === 'signed-in';
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceId === undefined || !signedIn) {
      setName(null);
      return;
    }
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        if (cancelled) return;
        setName(rows.find((row) => row.id === workspaceId)?.name ?? null);
      },
      () => {
        if (!cancelled) setName(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, workspaceId, signedIn]);

  return name;
}

/**
 * `AppNav` — CONTEXTUAL (Round 19b, owner feedback item 2).
 *
 * Transcribed from the prototype's own RULE (`design-system/interactive/
 * desktop.dc.html`, `navDef` + its `navItems` filter), not only its picture:
 * a link renders only when its target exists. Without a workspace in the route
 * (`workspaceId` undefined — `/workspaces`, `/inbox`, `/help`, `/account`,
 * `/mcp/*`) only the four ALWAYS items render (Workspaces, Inbox, Help,
 * Account) plus a scope note. With one, the workspace's own served name,
 * My Work, Members and Settings join them.
 *
 * **`projectId` is a second, narrower scope this product has and the prototype
 * does not: one board per PROJECT, not one per workspace.** The prototype's
 * `always` filter — a link appears only when its target exists — is applied
 * one level down for Board: it renders only when the route carries a project
 * (`/w/[workspaceId]/p/[projectId]/**`), and points at that project's board.
 * A workspace with no project in scope has no true Board target.
 */
export function AppNav({
  workspaceId,
  projectId,
}: {
  workspaceId?: string;
  projectId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useCurrentUser();
  const workspaceName = useWorkspaceName(workspaceId);
  const noWorkspace = workspaceId === undefined;
  const inSettings = workspaceId !== undefined && pathname.startsWith(`/w/${workspaceId}/settings/`);
  const current = (target: string): 'page' | undefined => (pathname === target ? 'page' : undefined);

  return (
    <nav className="gn-nav">
      <Link href="/workspaces" aria-current={current('/workspaces')}>
        Workspaces
      </Link>
      {/* The workspace's own served name — ONE source, `getMyWorkspaces`, never
          a second derivation. Omitted (not id, not a placeholder) until the
          name arrives or if the read fails; see `useWorkspaceName` above. */}
      {!noWorkspace && workspaceName !== null ? (
        <Link href={`/w/${workspaceId}`} aria-current={current(`/w/${workspaceId}`)}>
          {workspaceName}
        </Link>
      ) : null}
      {/* Board: only with a PROJECT in the route (see the docblock above). */}
      {!noWorkspace && projectId !== undefined ? (
        <Link
          href={`/w/${workspaceId}/p/${projectId}`}
          aria-current={current(`/w/${workspaceId}/p/${projectId}`)}
        >
          Board
        </Link>
      ) : null}
      {!noWorkspace ? (
        <Link href={`/w/${workspaceId}/my-work`} aria-current={current(`/w/${workspaceId}/my-work`)}>
          My Work
        </Link>
      ) : null}
      {/* Beside the view links and BEFORE the spacer, because it is a
          destination like Workspaces and My Work rather than a control like the
          theme toggle. Unconditional on `workspaceId`: the inbox is a global
          route (`app/inbox/page.tsx`) and a reader can be told about a ticket in
          a workspace they are not currently looking at. The badge's own read is
          gated on a session inside `InboxNavLink`. */}
      <InboxNavLink active={pathname === '/inbox'} />
      {!noWorkspace ? (
        <>
          <Link href={`/w/${workspaceId}/members`} aria-current={current(`/w/${workspaceId}/members`)}>
            Members
          </Link>
          {/* The prototype's DEFAULT `settingsTab` (`"types"`) is the target —
              there is no settings index route and this round does not build
              one. `aria-current` reads "am I anywhere under this workspace's
              settings", not the one literal path, so the workflows editor and
              the ticket-type editor still light the same nav item. */}
          <Link
            href={`/w/${workspaceId}/settings/ticket-types`}
            aria-current={inSettings ? 'page' : undefined}
          >
            Settings
          </Link>
        </>
      ) : null}
      {/* Help and Account (Task 18), both GLOBAL routes and both unconditional
          on `workspaceId` for the reason the inbox link above is: neither is a
          fact about the workspace you are currently looking at. `/help` already
          existed and needed only the link; `/account` ships in the same change
          set as a stub that enumerates what it does not do, because a nav entry
          pointing at a 404 is a defect and the alternative was to edit this nav
          again from a task about passkeys.

          Account is the person's own settings — profile, notifications,
          sessions — and NOT a workspace's, which live at
          `/w/[workspaceId]/settings/*`. Anyone who conflates the two will put a
          workspace control on a global page. */}
      <Link href="/help" aria-current={current('/help')}>
        Help
      </Link>
      <Link href="/account" aria-current={current('/account')}>
        Account
      </Link>
      {/* The scope note reads `workspaceId` ALONE — never `workspaceName`, so a
          slow or failed name lookup cannot make this say "no workspace
          selected" while the route plainly carries one. */}
      {noWorkspace ? (
        <span className="gn-nav__scope">
          No workspace selected — pick one to reach its board, members and settings.
        </span>
      ) : null}
      <span className="gn-nav__spacer" />
      <StyleToggle />
      <ThemeToggle />
      {user !== null ? (
        // The visible label shrinks to "Sign out"; the monogram beside it is
        // decoration. The ACCESSIBLE NAME keeps the full "Sign out {name}" this
        // button always carried, via `aria-label`, so the accessible-name floor
        // this shell ratchets does not fall when the visible text does.
        <Button
          aria-label={`Sign out ${user.name}`}
          onClick={() =>
            void authClient.signOut().then(() => {
              router.push('/sign-in');
            })
          }
        >
          <Avatar size="small" name={user.name} />
          Sign out
        </Button>
      ) : null}
    </nav>
  );
}
