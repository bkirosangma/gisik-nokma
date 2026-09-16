"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./account-menu.js";
import { InboxNavLink } from "./inbox-nav-link.js";
import { useCurrentUser } from "./providers.js";
import { useLastWorkspace } from "./use-last-workspace.js";
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
 *
 * ## Round 24 SUPERSEDES the arrangement above, and keeps its principle
 *
 * Owner: "Current Signout button: make it into a round profile pic like thing,
 * that opens up a context menu on click. signout option will be moved to the
 * bottom of that menu. along with the help and account item from the nav bar" —
 * and "make inbox an icon. with an indicator (green dot?) if there is an unread
 * event. place it on the left of the round profile pic like thing."
 *
 * So the three person-scoped destinations are still together at the bar's end;
 * they are just no longer three top-level links. Help and Account are now items
 * inside `AccountMenu`, and Inbox is an icon beside its trigger. **Case 13.414
 * ("renders Inbox immediately before Help") loses its subject** — Help is not in
 * this bar to be after anything — and is recorded as SUPERSEDED in
 * `test-cases/13-deployment-dogfooding.md` rather than deleted, because the
 * ruling it pinned was a real one and the reason it stopped applying is the
 * part worth keeping.
 *
 * What did NOT change, and was checked rather than assumed: both routes are
 * still reachable, still unconditional on `workspaceId`, and `13.392`'s
 * "every nav target resolves to a real page.tsx" still holds — the targets moved
 * one level down, they did not stop existing.
 *
 * ## Round 25 — the bar is contextual on the LAST workspace, not only the route
 *
 * Owner: "keep the last opened workspace in local storage, and based on that,
 * the workspace scoped navbar items should be made visible. so that just moving
 * to a separate page (inbox, help, account, etc) does not automatically hide
 * them."
 *
 * The rule at the top of this docblock — "a link renders only when its target
 * exists" — is unchanged. What changed is where the workspace comes from: the
 * route when it carries one, otherwise the remembered one
 * (`use-last-workspace.ts`), which is keyed by USER so it cannot show the
 * previous viewer's workspace to the next one.
 *
 * **The asymmetry below is the load-bearing part.** A ROUTED workspace renders
 * its links immediately — standing on `/w/<id>/members` is proof the workspace
 * is there. A REMEMBERED one renders them only once `useWorkspaceName` resolves
 * a name for it, because a remembered id is a guess about the past and may name
 * a workspace you have since been removed from. Rounds 22 and 23 are the
 * precedent: the Board item was removed for offering a link that could not
 * resolve, and a remembered workspace is the same hazard from a different
 * direction.
 */
export function AppNav({ workspaceId }: { workspaceId?: string }) {
  const pathname = usePathname();
  // The sign-out CALL moved into `AccountMenu` with the control that used it
  // (Round 24). `useCurrentUser` stayed, for two branches: whether this bar
  // shows the menu or the signed-out Help/Account fallback below, and which
  // user the remembered workspace must belong to.
  const user = useCurrentUser();
  const remembered = useLastWorkspace(workspaceId, user?.id ?? null);

  // The workspace this bar is ABOUT, which is no longer only the one in the
  // route (Round 25).
  const effectiveWorkspaceId =
    workspaceId ?? (remembered.status === "remembered" ? remembered.workspaceId : undefined);
  const fromMemory = workspaceId === undefined && remembered.status === "remembered";

  const workspaceName = useWorkspaceName(effectiveWorkspaceId);

  /**
   * **A REMEMBERED workspace must prove itself; a ROUTED one need not.**
   *
   * The route is authority: standing on `/w/<id>/members` means the workspace
   * is there, and today's behaviour renders the scoped links immediately. A
   * remembered id has no such standing — it may name a workspace you have since
   * been removed from, or one that was deleted — and `app-nav.tsx` already
   * holds the rule this runs into, from Rounds 22 and 23: the nav does not
   * offer a link that cannot resolve. That is the whole reason the Board item
   * was removed.
   *
   * So the proof is `workspaceName !== null`, which `useWorkspaceName` derives
   * from `getMyWorkspaces()` — the ONE shared read this bar already makes. No
   * second request, and no second definition of "reachable" to drift from the
   * first.
   */
  const showWorkspaceItems = !fromMemory ? workspaceId !== undefined : workspaceName !== null;
  const noWorkspace = !showWorkspaceItems;

  /**
   * Deliberately NOT `!showWorkspaceItems`. See the note's own comment below:
   * this requires a POSITIVE "storage was read and held nothing for this
   * person", so the sentence cannot appear during the window before storage has
   * been read — which is every first paint, and would otherwise flash a false
   * claim at anyone who has a remembered workspace.
   */
  const showScopeNote = workspaceId === undefined && remembered.status === "none";
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
            href={`/w/${effectiveWorkspaceId}`}
            aria-current={current(`/w/${effectiveWorkspaceId}`)}
          >
            {workspaceName}
          </Link>
        ) : null}
        {/* NO Board item (Round 23, owner: "the board on the nav bar doesn't
            work. lets remove it"). See the docblock above for why it could
            never have worked. */}
        {!noWorkspace ? (
          <Link
            href={`/w/${effectiveWorkspaceId}/my-work`}
            aria-current={current(`/w/${effectiveWorkspaceId}/my-work`)}
          >
            My Work
          </Link>
        ) : null}
        {!noWorkspace ? (
          <Link
            href={`/w/${effectiveWorkspaceId}/members`}
            aria-current={current(`/w/${effectiveWorkspaceId}/members`)}
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
            href={`/settings?workspaceId=${effectiveWorkspaceId}`}
            aria-current={current("/settings")}
          >
            Settings
          </Link>
        ) : null}
        {/* Inbox LEFT this group in Round 24 — it now renders in
            `.gn-nav__corner` below, immediately left of the avatar. It is still
            unconditional on `workspaceId` for the reason it always was: the
            inbox is a global route (`app/inbox/page.tsx`) and a reader can be
            told about a ticket in a workspace they are not currently looking
            at. The unread read is still gated on a session inside
            `InboxNavLink`. */}
        {/* Help and Account (Task 18) are both GLOBAL routes, unconditional on
            `workspaceId` for the reason the inbox is: neither is a fact about
            the workspace you are currently looking at. Account is the PERSON's
            settings — profile, notifications, sessions — and not a workspace's,
            which live at `/w/[workspaceId]/settings/*`; anyone who conflates
            the two will put a workspace control on a global page.

            ROUND 24 MOVED BOTH INTO THE ACCOUNT MENU — but only for a viewer
            who HAS one.

            Signed out there is no menu: `AccountMenu` needs a name, an email
            and a sign-out target, and none of the three exists. Folding these
            two links into it unconditionally would therefore have deleted the
            only route to `/help` from the signed-out shell — on a page that is
            explicitly reachable signed out, which is what the case below
            ("renders its always-items with NO session at all") pins. So they
            fall back to being bar links exactly as they were before Round 24.

            This is a real branch, not defensive padding: `/help` renders for a
            signed-out reader by design, and it is the route most likely to be
            wanted by someone who cannot get in. */}
        {user === null ? (
          <>
            <Link href="/help" aria-current={current("/help")}>
              Help
            </Link>
            <Link href="/account" aria-current={current("/account")}>
              Account
            </Link>
          </>
        ) : null}
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
            workspace at all.

            ROUND 25 — it is gated on `showScopeNote`, NOT on `noWorkspace`, and
            the two differ in exactly the window that matters. `noWorkspace` is
            true before storage has been read, so gating on it would flash "No
            workspace selected" at someone who has one, every time they open a
            global page. The note now requires a POSITIVE `none` — storage read,
            nothing remembered for this person.

            The cost, stated rather than hidden: when a workspace IS remembered
            but its name never resolves (you were removed from it, it was
            deleted, or `getMyWorkspaces` refused), neither the scoped links nor
            this note render. That is deliberate. The alternative is to clear the
            memory when the name fails, which would throw away a valid workspace
            on a TRANSIENT read failure — destroying state on a network blip, to
            recover a hint. The note is a hint; `Workspaces` is still one click
            away and is the real route out. */}
        {showScopeNote ? (
          <span className="gn-nav__scope">
            No workspace selected — pick one to reach its board, members and settings.
          </span>
        ) : null}
        <span className="gn-nav__spacer" />
      </div>
      {/* The inbox icon sits immediately LEFT of the avatar (Round 24, owner),
          both outside `.gn-nav__links` so they stay pinned as a pair at the
          bar's end rather than wrapping into the destination group. */}
      <div className="gn-nav__corner">
        <InboxNavLink active={pathname === "/inbox"} />
        <AccountMenu />
      </div>
      </div>
    </nav>
  );
}
