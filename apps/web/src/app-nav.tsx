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
 * `/settings`, `/mcp/*`) only the four ALWAYS items render (Workspaces, Inbox,
 * Help, Account) plus a scope note. With one, the workspace's own served name,
 * My Work, Members and Settings join them.
 *
 * ## There is NO Board item, and the `projectId` prop went with it (Round 23,
 * ## owner: "the board on the nav bar doesn't work. lets remove it")
 *
 * **It could not have worked, and the shape is worth keeping on record because
 * the prototype will keep suggesting it.** This product has one board per
 * PROJECT, not one per workspace, so Board's only possible target was
 * `/w/<id>/p/<pid>` — which meant it could render only when the route already
 * carried a project. That is precisely when you are already standing on that
 * board. The item was therefore a link to the current page, and never anything
 * else: `aria-current` resolved to `"page"` every single time it appeared. It
 * was not broken by a regression; it had no reachable state in which it was
 * useful.
 *
 * The day before, the owner was asked whether to make it unconditional and
 * declined (`test-cases/13`, Round 22), keeping "the nav does not offer a link
 * that cannot resolve". Removing it is that same rule applied once more: an
 * item that resolves only to where you are is not a destination. The two
 * options declined then — a `/w/<id>/board` picker route, or pointing Board at
 * `/w/<id>` — remain the only ways it could come back, and both need a decision
 * this round did not take.
 *
 * `projectId` was this component's ONLY use for that prop, so it is gone from
 * the signature rather than left as a parameter nothing reads; the board page
 * (its one caller) stopped passing it in the same change.
 *
 * **The scope note below still says "pick one to reach its board, members and
 * settings", and that is still TRUE** — checked rather than assumed, because
 * case 13.391 was made green last round on exactly that sentence's accuracy.
 * It describes what picking a workspace gets you, not what this bar renders: a
 * board is one click from the workspace home's project grid. Members and
 * Settings happen to also be nav items; a board never was.
 *
 * ## Settings REJOINED the workspace-scoped group (Round 21, owner: "move back
 * ## the nav bar settings to only be visible once a workspace is opened")
 *
 * Round 19c had moved it out, on the owner's earlier instruction that it "should
 * always be visible on the nav bar", and that move is now reversed. **Only the
 * VISIBILITY rule reverted; the TARGET did not.** The link renders under
 * `!noWorkspace` again, exactly as it did before 19c, but still points at
 * `/settings?workspaceId=<id>` rather than the pre-19c
 * `/w/<id>/settings/ticket-types`: that bare path is the sidebar-less list page
 * whose own Edit button opened the ticket-type editor as a third route, and
 * `/settings` is the shell built to replace it (`app/settings/page.tsx`'s own
 * docblock). Reverting the href as well would have re-opened a defect the
 * owner asked to have closed, in the name of a ruling that said nothing about
 * where the link points.
 *
 * Two consequences, both deliberate:
 *
 * - **The scope note renders again.** It reads "pick one to reach its board,
 *   members and settings", which was FALSE from 19c onward — hence its being
 *   commented out in `762b1c8d`, leaving case 13.391 red — and is true again
 *   now that all three of those nouns are workspace-conditional.
 * - **`/settings` with no `?workspaceId=` is no longer reachable from the
 *   nav.** It still resolves, and typing it still works; nothing about that
 *   route changed. But it is no longer a destination this bar offers, which is
 *   what makes it safe for MCP tokens to have left its sidebar for `/account`
 *   in the same round — see `app/settings/page.tsx`.
 *
 * `inSettings`, which used to widen the pre-19c workspace-scoped link's
 * `aria-current` to any `/settings/*` sub-route, stays gone: the nav's
 * `Settings` is one literal route (`/settings`, `usePathname()` ignores the
 * query string), and plain equality (`current`, below) is enough.
 *
 * Members was never part of this and is unchanged: the owner's own reference
 * (screenshots, 2026-09-09) keeps it as its own top-level link beside Settings
 * rather than folded under it.
 *
 * ## Inbox sits with the global links, not the workspace ones (Round 21)
 *
 * It was beside My Work from Round 19b; the owner moved it to just before Help.
 * It stays unconditional — the inbox is global and always has been — so this is
 * a position change only, and it puts the three person-scoped destinations
 * (Inbox, Help, Account) together at the bar's end.
 */
export function AppNav({ workspaceId }: { workspaceId?: string }) {
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
        {/* NO Board item (Round 23, owner: "the board on the nav bar doesn't
            work. lets remove it"). See the docblock above for why it could
            never have worked. */}
        {!noWorkspace ? (
          <Link
            href={`/w/${workspaceId}/my-work`}
            aria-current={current(`/w/${workspaceId}/my-work`)}
          >
            My Work
          </Link>
        ) : null}
        {!noWorkspace ? (
          <Link
            href={`/w/${workspaceId}/members`}
            aria-current={current(`/w/${workspaceId}/members`)}
          >
            Members
          </Link>
        ) : null}
        {/* Settings — WORKSPACE-SCOPED again (Round 21, owner: "move back the
            nav bar settings to only be visible once a workspace is opened").
            The TARGET keeps Round 19c's query-param shape rather than reverting
            to the old `/w/<id>/settings/ticket-types` path: `/settings` is the
            real shell with the sidebar and the inlined editor, and the bare
            path is the sidebar-less page that shell was built to replace. So
            this reverts the VISIBILITY rule and keeps the destination. */}
        {!noWorkspace ? (
          <Link
            href={`/settings?workspaceId=${workspaceId}`}
            aria-current={current("/settings")}
          >
            Settings
          </Link>
        ) : null}
        {/* Inbox sits JUST BEFORE Help (Round 21, owner ruling), at the end of
            the bar with the other global destinations, rather than among the
            workspace-scoped view links where Round 19b put it. Still
            unconditional on `workspaceId`: the inbox is a global route
            (`app/inbox/page.tsx`) and a reader can be told about a ticket in a
            workspace they are not currently looking at — the move groups it
            with the other links that are true of the PERSON, which is what it
            always was. The badge's own read is gated on a session inside
            `InboxNavLink`. */}
        <InboxNavLink active={pathname === "/inbox"} />
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
            selected" while the route plainly carries one.

            RESTORED in Round 21, having been commented out (not deleted) when
            Settings went global in `762b1c8d` — at which point the sentence
            named "settings" as workspace-scoped while the bar plainly showed a
            Settings link, so it was FALSE and commenting it out was right. The
            same ruling that put Settings back behind a workspace makes it true
            again, so it renders again. Members and Settings are verified against
            the code above rather than assumed: both need `!noWorkspace`. Case
            13.391 had been red since `762b1c8d`; it went green there because the
            claim it asserts became true, not because the assertion was relaxed
            to fit the code.

            "its board" is the one noun this bar does NOT render a link for, and
            it was re-checked when Board was removed in Round 23 rather than left
            to drift: the sentence describes what picking a workspace gets you,
            and a board is one click from the workspace home's project grid. It
            would only become false if boards stopped being reachable from a
            workspace at all. */}
        {noWorkspace ? (
          <span className="gn-nav__scope">
            No workspace selected — pick one to reach its board, members and settings.
          </span>
        ) : null}
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
