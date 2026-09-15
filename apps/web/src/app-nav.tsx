"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, Button } from "@gisik-nokma/ui";
import { authClient } from "./auth-client.js";
import { InboxNavLink } from "./inbox-nav-link.js";
import { useCurrentUser } from "./providers.js";
import { useWorkspaceName } from "./use-workspace-name.js";

/**
 * `AppNav` — CONTEXTUAL (Round 19b, owner feedback item 2).
 *
 * Transcribed from the prototype's own RULE (`design-system/interactive/
 * desktop.dc.html`, `navDef` + its `navItems` filter), not only its picture:
 * a link renders only when its target exists. Without a workspace in the route
 * (`workspaceId` undefined — `/workspaces`, `/inbox`, `/help`, `/account`,
 * `/settings`, `/mcp/*`) only the five ALWAYS items render (Workspaces, Inbox,
 * Settings, Help, Account) plus a scope note. With one, the workspace's own
 * served name, My Work and Members join them.
 *
 * **`projectId` is a second, narrower scope this product has and the prototype
 * does not: one board per PROJECT, not one per workspace.** The prototype's
 * `always` filter — a link appears only when its target exists — is applied
 * one level down for Board: it renders only when the route carries a project
 * (`/w/[workspaceId]/p/[projectId]/**`), and points at that project's board.
 * A workspace with no project in scope has no true Board target.
 *
 * ## Settings LEFT the workspace-scoped group; Members did not (owner
 * feedback, 2026-09-09: "move members into settings and settings should
 * always be visible on the nav bar")
 *
 * Settings used to render only `!noWorkspace`, pointed at `/w/${workspaceId}/
 * settings/ticket-types`. The owner asked for it to sit at the SAME tier as
 * Inbox/Help/Account — always present, not conditional on a workspace being
 * in the route — which a workspace-typed href cannot do on its own: there is
 * no "current workspace" this component (or anything else in this shell)
 * remembers outside the URL's own `workspaceId` segment. So the link is
 * unconditional and its TARGET carries the workspace forward as a QUERY
 * PARAM instead of a path segment when one is in scope — `/settings` (new,
 * `app/settings/page.tsx`) is a real route either way, with or without
 * `?workspaceId=`; its own docblock explains what it renders in each case.
 * The owner's OWN reference (screenshots, same feedback round) keeps Members
 * as its own top-level link beside Settings rather than folded under it — an
 * earlier draft of this change removed Members entirely, which the reference
 * contradicts; it is restored here, unchanged from before. `inSettings`,
 * which used to widen the old workspace-scoped `Settings` link's
 * `aria-current` to any `/settings/*` sub-route, is gone: the nav's `Settings`
 * is one literal route (`/settings`, `usePathname()` ignores the query
 * string), and plain equality (`current`, below) is enough.
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
  const current = (target: string): "page" | undefined =>
    pathname === target ? "page" : undefined;

  return (
    <nav className="gn-nav">
      {/* `.gn-nav` itself is now full-bleed (globals.css); this inner div is
          what mirrors `.gn-shell`'s max-width/centring, so the bar's content
          still lines up with the page content beneath it. */}
      <div className="gn-nav__inner">
      {/* Everything that may need a second (or third) line at a narrow
          viewport — the destination links and the scope note. Sign-out is
          deliberately OUTSIDE this div: see `.gn-nav__signout`'s own
          docblock in globals.css for why it is pinned instead of sharing
          this group's wrap. */}
      <div className="gn-nav__links">
        <Link href="/workspaces" aria-current={current("/workspaces")}>
          Workspaces
        </Link>
        {/* The workspace's own served name — ONE source, `getMyWorkspaces`, never
            a second derivation. Omitted (not id, not a placeholder) until the
            name arrives or if the read fails; see `useWorkspaceName` above. */}
        {!noWorkspace && workspaceName !== null ? (
          <Link
            href={`/w/${workspaceId}`}
            aria-current={current(`/w/${workspaceId}`)}
          >
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
          <Link
            href={`/w/${workspaceId}/my-work`}
            aria-current={current(`/w/${workspaceId}/my-work`)}
          >
            My Work
          </Link>
        ) : null}
        {/* Beside the view links and BEFORE the spacer, because it is a
            destination like Workspaces and My Work. Unconditional on
            `workspaceId`: the inbox is a global route (`app/inbox/page.tsx`)
            and a reader can be told about a ticket in a workspace they are
            not currently looking at. The badge's own read is gated on a
            session inside `InboxNavLink`. */}
        <InboxNavLink active={pathname === "/inbox"} />
        {!noWorkspace ? (
          <Link
            href={`/w/${workspaceId}/members`}
            aria-current={current(`/w/${workspaceId}/members`)}
          >
            Members
          </Link>
        ) : null}
        {/* Settings — GLOBAL and unconditional (owner feedback, 2026-09-09),
            same tier as Inbox/Help/Account, carrying the workspace forward as
            a QUERY PARAM when one is in scope. See this component's own
            docblock for why Settings alone left the workspace-scoped group. */}
        <Link
          href={noWorkspace ? "/settings" : `/settings?workspaceId=${workspaceId}`}
          aria-current={current("/settings")}
        >
          Settings
        </Link>
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
        <Link href="/help" aria-current={current("/help")}>
          Help
        </Link>
        <Link href="/account" aria-current={current("/account")}>
          Account
        </Link>
        {/* The scope note reads `workspaceId` ALONE — never `workspaceName`, so a
            slow or failed name lookup cannot make this say "no workspace
            selected" while the route plainly carries one. */}
        {/* {noWorkspace ? (
          <span className="gn-nav__scope">
            No workspace selected — pick one to reach its board, members and settings.
          </span>
        ) : null} */}
        <span className="gn-nav__spacer" />
      </div>
      {user !== null ? (
        // The visible label shrinks to "Sign out"; the monogram beside it is
        // decoration. The ACCESSIBLE NAME keeps the full "Sign out {name}" this
        // button always carried, via `aria-label`, so the accessible-name floor
        // this shell ratchets does not fall when the visible text does.
        <Button
          className="gn-nav__signout"
          aria-label={`Sign out ${user.name}`}
          onClick={() =>
            void authClient.signOut().then(() => {
              router.push("/sign-in");
            })
          }
        >
          <Avatar size="small" name={user.name} />
          Sign out
        </Button>
      ) : null}
      </div>
    </nav>
  );
}
