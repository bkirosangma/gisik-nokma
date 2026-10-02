"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./account-menu.js";
import { InboxNavLink } from "./inbox-nav-link.js";
import { useTabletBar } from "./use-tablet-bar.js";
import { NavBrand } from "./nav-brand.js";
import { NotesNavLink } from "./notes-nav-link.js";
import { BottomBar } from "./bottom-bar.js";
import { PhoneSwitcher } from "./phone-switcher.js";
import { useSessionStatus } from "./providers.js";
import { SessionNotice } from "./session-notice.js";
import { LastProjectNav } from "./last-project-nav.js";
import { NavHoverMenu } from "./nav-hover-menu.js";
import { isWithin } from "./path-within.js";
import { useLastWorkspace } from "./use-last-workspace.js";
import { useWorkspaceLookup } from "./use-workspace-name.js";

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
 * settings", and that is still TRUE** (it stays in the DOM at every width; at
 * ≤40rem the stylesheet hides it and `PhoneSwitcher`'s "Choose a workspace"
 * carries the same fact — mobile-web plan FD2) — checked rather than assumed, because
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
 * `inSettings`, which widened the pre-19c workspace-scoped link's
 * `aria-current` to any `/settings/*` sub-route, was gone for a while and came back as
 * `currentSection` (UX fixes Task 3, case 23.044): the link's target is the literal route
 * `/settings` (`usePathname()` ignores the query string) but the editors live under
 * `/w/<id>/settings/…`, so Settings is lit on a segment-bounded prefix of either root.
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
 *
 * ## Round 27 — the project you were last in, and the dropdown over it
 *
 * Owner: *"new nav item :right to the workspace name -> last open project name.
 * on click, open the project page (save the last open tab as well). on hover,
 * show the non archived projects as a dropdown, and clicking them opens those
 * projects. if there is no last opened project, then this defaults to the first
 * in the order that we display in the workspace page."*
 *
 * It is mounted immediately right of the workspace name, and it is its own
 * component (`src/last-project-nav.tsx`) for the reason every other piece of
 * this bar is: `account-menu.tsx`, `inbox-nav-link.tsx`, `legal-nav.tsx`. That
 * component's docblock carries the behaviour; three things belong HERE, because
 * they are about this bar rather than about it.
 *
 * **1. It is NOT the Board item returning.** Board was removed because one
 * board per PROJECT meant its only reachable target was the route you were
 * already standing on — "an item that resolves only to where you are is not a
 * destination". A project id is now something this bar actually has (Round 25's
 * remembered workspace resolves to one), so this is the first project-scoped
 * destination that can point somewhere else. The rule that killed Board is the
 * rule that shapes this: **it renders nothing at all when the workspace has no
 * reachable project**, rather than falling back to something plausible.
 *
 * **2. The workspace it is about is `effectiveWorkspaceId`**, the same value My
 * Work, Members and Settings read, and it is gated on `!noWorkspace` exactly as
 * they are. That is deliberate rather than incidental: a second answer to
 * "which workspace is this bar about" is how the remembered-workspace work
 * would come undone.
 *
 * **3. `user?.id ?? null` is passed down, not re-read.** The component needs the
 * user to key its storage record by; `AppNav` already holds the resolved
 * session for `AccountMenu` and for the remembered workspace, and a second
 * `useCurrentUser` call one level down would be a second subscription to the
 * same question.
 *
 * **One consequence worth stating for whoever maintains this file:** case
 * `11.185`'s closed-set arms did NOT change. Every arm's workspace fixture has
 * `projects: []`, so before this round the new item rendered nothing in any of
 * them and after it renders nothing still. A new arm was ADDED for the shape
 * that has projects, because a closed-set tripwire that cannot see the newest
 * member of the set is exactly the check that cannot fail.
 */
/** `/w/<workspace>/p/<project>[/…]` → the project id, else `undefined` — the phone switcher's one route read. */
function projectIdOf(pathname: string): string | undefined {
  return /^\/w\/[^/]+\/p\/([^/?#]+)/.exec(pathname)?.[1];
}

export function AppNav({ workspaceId }: { workspaceId?: string }) {
  const pathname = usePathname();
  // The sign-out CALL moved into `AccountMenu` with the control that used it
  // (Round 24). The session read stayed, for two branches: whether this bar
  // shows the menu or the signed-out Help/Account fallback below, and which
  // user the remembered workspace must belong to.
  // The session through `useSessionStatus`, the one reading every page's
  // "Sign in to …" fallback uses (SYS-01): `useCurrentUser` answered null for
  // loading, error AND signed-out alike, and this bar swapped to "Sign in" on
  // all three. Now only a genuine `signed-out` draws the door; a failed read
  // keeps the last known user's chrome and `SessionNotice` says what happened.
  const session = useSessionStatus();
  const user = session.kind === "signed-in" ? session.user : null;
  const signedOut = session.kind === "signed-out";
  const hasBottomBar = useTabletBar();
  const remembered = useLastWorkspace(workspaceId, user?.id ?? null);

  // The workspace this bar is ABOUT, which is no longer only the one in the
  // route (Round 25).
  const effectiveWorkspaceId =
    workspaceId ?? (remembered.status === "remembered" ? remembered.workspaceId : undefined);
  const fromMemory = workspaceId === undefined && remembered.status === "remembered";

  // ONE read feeds both the name and the dropdown's rows (U-T14, case 23.254).
  const { name: workspaceName, others: otherWorkspaces } = useWorkspaceLookup(effectiveWorkspaceId);

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
   * So the proof is `workspaceName !== null`, which `useWorkspaceLookup` (`useWorkspaceName` is its `name`) derives
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
  /**
   * "Where am I" for a SECTION (UX fixes Task 3, case 23.044, audit SYS-20, NP-26, WS-08): lit on the route itself and on
   * every route under it, bounded at a path SEGMENT (`/settingsx` is not under `/settings`). Settings, My Work and
   * Members use it — the same rule the phone bottom bar applies to its workspace destinations, so the two surfaces
   * light the same item on the same page. Settings needs it most: its link points at `/settings?workspaceId=…` but the
   * workflow and ticket-type editors live at `/w/<id>/settings/…`, so an exact match left the bar dark on the very
   * pages that are Settings. The workspace link stays exact (`current`): `/w/<id>` is not "inside"
   * `/w/<id>/members` (case 13.393).
   */
  const currentSection = (...roots: string[]): "page" | undefined =>
    roots.some((root) => isWithin(pathname, root)) ? "page" : undefined;

  /**
   * **There is no Menu disclosure any more (UX fixes Task 4, case 23.042; it was E4-11).** At phone width the five wrapped
   * link rows measured 390×310 and the links moved behind a `Menu` toggle (`data-open` on `.gn-nav__more`). Task 4 retired it:
   * from 64rem DOWN the bottom bar (`bottom-bar.tsx`) carries those routes, and above 64rem the one-line link row is
   * painted directly by `.gn-nav__more`'s `display: contents`. A third affordance between the two — a toggle that opens
   * links the bar already offers — was the tablet band's duplicate navigation, and at exactly 1024px it showed beside the bar.
   * The links are still always in the document: `.gn-nav__more` is `display: none` at ≤64rem, and the routes are the bar's
   * slots or its More sheet (`bottom-bar.tsx`), so a painted-away link is reachable through its replacement.
   */

  return (
    <>
    <nav
      className="gn-nav"
      /* exec1 P31: this bar rendered `<nav className="gn-nav">` with NO
         accessible name, and it co-renders with a SECOND, already-labelled
         `<nav>` on several routes — so a screen-reader user opening the
         landmark list met two `navigation` regions and only one of them said
         what it was. "Main" is this bar's own name for itself: it is the
         product's primary navigation, which is what the landmark list should
         call it. */
      aria-label="Main"
    >
      {/* `.gn-nav` itself is now full-bleed (globals.css); this inner div is
          what mirrors `.gn-shell`'s max-width/centring, so the bar's content
          still lines up with the page content beneath it. */}
      <div className="gn-nav__inner">
      {/* The brand group (owner request 2026-09-23, widened 2026-09-24 to a
          tile + wordmark — `NavBrand`, shared with `LegalNav`): decorative
          furniture, NOT a control — no link, no button, no tabindex —
          rendered whether or not a session exists, which is why it sits
          here rather than inside `.gn-nav__links` (gated content below). */}
      <NavBrand />
      {/* Everything that may need a second (or third) line at a narrow
          viewport — the destination links and the scope note. Sign-out is
          deliberately OUTSIDE this div: see `.gn-nav__signout`'s own
          docblock in globals.css for why it is pinned instead of sharing
          this group's wrap. */}
      <div className={user !== null ? "gn-nav__links gn-nav__links--member" : "gn-nav__links"}>
        {/* E5-31: gated on the session, because signed out there is nothing
            behind it. The bar used to offer Workspaces, an inbox icon, an
            account menu and a scope note to a visitor who could use none of
            them — pressing Workspaces landed on `/sign-in` by a 401 bounce,
            with no `next=` and no Sign in control anywhere on the page. The
            house rule this restores is the one Rounds 22–23 set for the Board
            item: the bar does not offer a link that cannot resolve. */}
        {user !== null ? (
          <Link href="/workspaces" aria-current={current("/workspaces")}>
            Workspaces
          </Link>
        ) : null}
        <div className="gn-nav__more">
        {/* The workspace's own served name — ONE source, `getMyWorkspaces`, never
            a second derivation. Omitted (not id, not a placeholder) until the
            name arrives or if the read fails; see `useWorkspaceLookup` above. */}
        {!noWorkspace && workspaceName !== null ? (
          /* A click goes to the workspace home, as it always did. Hover or focus (U-T14, owner 2026-10-02) opens the list
             of the viewer's OTHER workspaces through the same `NavHoverMenu` Last project uses; with none, `enabled` is
             false and this is the plain link it was (no `aria-haspopup`). The separate Workspaces link is untouched. */
          <NavHoverMenu
            className="gn-nav__workspace-group"
            menuLabel="Workspaces"
            enabled={otherWorkspaces.length > 0}
            items={otherWorkspaces.map((workspace) => ({
              id: workspace.id,
              href: `/w/${workspace.id}`,
              label: workspace.name,
              current: pathname === `/w/${workspace.id}`,
            }))}
            trigger={{
              href: `/w/${effectiveWorkspaceId}`,
              className: "gn-nav__workspace",
              current: current(`/w/${effectiveWorkspaceId}`) === "page",
              children: <span className="gn-nav__label">{workspaceName}</span>,
            }}
          />
        ) : null}
        {/* IMMEDIATELY RIGHT OF THE WORKSPACE NAME (owner, 2026-09-18) — the
            project you were last in, opening on hover into a dropdown of the
            workspace's other non-archived projects.

            It is gated on `!noWorkspace` exactly as My Work, Members and
            Settings are, and `effectiveWorkspaceId` is the same value they
            read, so there is one answer to "which workspace is this bar about".
            The component renders NOTHING of its own when the workspace has no
            reachable project, which is the rule Rounds 22 and 23 established:
            the nav does not offer a link that cannot resolve. Its own docblock
            carries the rest, including why this is what Board could never be. */}
        {!noWorkspace && effectiveWorkspaceId !== undefined ? (
          <LastProjectNav workspaceId={effectiveWorkspaceId} userId={user?.id ?? null} />
        ) : null}
        {/* NO Board item (Round 23, owner: "the board on the nav bar doesn't
            work. lets remove it"). See the docblock above for why it could
            never have worked. */}
        {!noWorkspace ? (
          <Link
            href={`/w/${effectiveWorkspaceId}/my-work`}
            aria-current={currentSection(`/w/${effectiveWorkspaceId}/my-work`)}
          >
            My Work
          </Link>
        ) : null}
        {!noWorkspace ? (
          <Link
            href={`/w/${effectiveWorkspaceId}/members`}
            aria-current={currentSection(`/w/${effectiveWorkspaceId}/members`)}
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
            aria-current={currentSection("/settings", `/w/${effectiveWorkspaceId}/settings`)}
          >
            Settings
          </Link>
        ) : null}
        </div>
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
        {signedOut ? (
          <>
            <Link href="/help" aria-current={current("/help")}>
              Help
            </Link>
            {/* E5-31: the arm `legal-nav.tsx:96-99` already had and this bar
                did not. `/account` is withheld with `Workspaces` above — it is
                the signed-in person's own page and answers a 401 bounce for
                anyone else — and the one destination a visitor with no session
                needs is the door IN, carrying where they were headed so
                signing in returns them to it (the same `next=` shape the
                invite, consent and settings shells use). */}
            <Link
              className="gn-nav__signin"
              href={`/sign-in?next=${encodeURIComponent(pathname)}`}
            >
              Sign in
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
            deleted, or `getMyWorkspaces` failed), neither the scoped links nor
            this note render. That is deliberate. The alternative is to clear the
            memory when the name fails, which would throw away a valid workspace
            on a TRANSIENT read failure — destroying state on a network blip, to
            recover a hint. The note is a hint; `Workspaces` is still one click
            away and is the real route out. */}
        {/* E5-31: also withheld signed out, and the sentence is why — "pick
            one to reach its board, members and settings" tells a person to do
            something the bar is no longer offering them, and none of the three
            nouns is reachable without a session. `showScopeNote` already
            requires storage to have been read and to hold nothing; this adds
            the positive session that the sentence presupposes. */}
        {showScopeNote && user !== null ? (
          <span className="gn-nav__scope">
            No workspace selected — pick one to reach its board, members and settings.
          </span>
        ) : null}
        <span className="gn-nav__spacer" />
      </div>
      {/* PHONE-ONLY (mobile-web plan Task 2, cases 21.010–21.011). `display: none`
          above 40rem (`.gn-phone-switcher`, globals.css); at ≤40rem it takes the
          place of the link row and the scope note above, which the same arm
          hides. It sits AFTER the link row in the DOM, not beside the brand, so the
          brand's next sibling stays `.gn-nav__links` (case 13.1474, unmodified);
          with the row `display: none` it is visually second all the same. Signed-in only, for the reason that row's own signed-out arm is
          kept: a visitor with no session needs the way IN, and `Help`/`Sign in`
          stay painted for them at every width. The workspace passed is the bar's
          EFFECTIVE one — `undefined` while `noWorkspace` — so a remembered
          workspace that never resolves reads "Choose a workspace" and cannot name
          something the person cannot open (Rounds 22–25, plan FD5). The project
          comes from the route, the one place a bar can know it is in one. */}
      {user !== null ? (
        <PhoneSwitcher
          workspaceId={noWorkspace ? undefined : effectiveWorkspaceId}
          workspaceName={workspaceName}
          projectId={projectIdOf(pathname)}
        />
      ) : null}
      {/* The inbox icon sits immediately LEFT of the avatar (Round 24, owner),
          both outside `.gn-nav__links` so they stay pinned as a pair at the
          bar's end rather than wrapping into the destination group. (At phone
          width — `hasBottomBar`, ≤64rem — Notes and Inbox are the bottom bar's and the corner
          is the avatar alone.) */}
      {/* E5-31: the whole corner is signed-in only. `AccountMenu` already
          rendered nothing without a session, but `InboxNavLink` did — an
          unlabelled icon pointing at a session-gated route, which is the
          third of the dead controls this ruling names. */}
      {user !== null ? (
        <div className="gn-nav__corner">
          {/* THE FIRST PREFIX MATCH IN THIS BAR (notes series Plan 5, spec §9.1; Settings, My Work and Members joined it in UX fixes Task 3).
              The workspace link is measured by `current()` above, which is exact
              equality — and that is right for it: `/w/<id>` is not "inside"
              `/w/<id>/members`. (The sections are `currentSection()`.) A note is different in kind. `/notes/<id>` is
              the SAME view as `/notes`, with a note open, so exact equality
              would leave the link dark on the page the reader is actually on.
              Case 18.182 walks both spellings and the control. */}
          {!hasBottomBar ? (
            <>
              <NotesNavLink active={pathname === "/notes" || pathname.startsWith("/notes/")} />
              <InboxNavLink active={pathname === "/inbox"} />
            </>
          ) : null}
          <AccountMenu />
        </div>
      ) : null}
      </div>
    </nav>
    {/* The ONE shell notice for a failed session read (SYS-01) — renders nothing while the read is healthy. */}
    <SessionNotice />
    {/* THE BOTTOM BAR (mobile-web plan Task 3, cases 21.020–21.032; the tablet band's too since UX fixes Task 4, case 23.050).
        Rendered only at ≤64rem, by script (`useTabletBar`, the stylesheet's own tablet arm — NOT `useIsPhone`, FD3), and INSTEAD of the corner's Notes and Inbox links above — a
        second set of the same links would be a second unread poller and a duplicate for anything that
        reads the DOM rather than the page. It is a sibling of the bar, not a child: a `nav` inside a
        `nav` is a landmark inside a landmark, and the bar's own sticky stacking context is not the
        place for a `position: fixed` thing. The workspace is the EFFECTIVE one (`undefined` while
        `noWorkspace`), so a remembered id that never resolves gets no scoped slot (plan FD5). */}
    {user !== null && hasBottomBar ? (
      <BottomBar
        workspaceId={noWorkspace ? undefined : effectiveWorkspaceId}
        projectId={projectIdOf(pathname)}
        userId={user.id}
        pathname={pathname}
      />
    ) : null}
    </>
  );
}
