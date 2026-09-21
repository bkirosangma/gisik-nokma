'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { IST_TIME_ZONE } from '@gisik-nokma/domain';
import { Avatar, Button, Card, Chip } from '@gisik-nokma/ui';
import { FoundingError, InvitationActionError, type PendingInvitation } from '@gisik-nokma/app-core/online';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { AppNav } from '../../src/app-nav.js';
import { ShellRefusal } from '../../src/shell-refusal.js';
import { useAppServices, useCurrentUser } from '../../src/providers.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../../src/expired-session.js';
import {
  projectCountLine,
  projectLine,
  restrictedLine,
  viewerOf,
  type CardViewer,
} from '../../src/workspace-viewer.js';

export default function WorkspacesPage() {
  const { dataSource } = useAppServices();
  const user = useCurrentUser();
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    dataSource.query.getMyWorkspaces().then(setWorkspaces, (cause: unknown) => {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    });
  }, [dataSource]);

  // A 401 is not a refusal to answer, it is “we do not know who you are” — and the
  // one place that has an answer is the sign-in page. The rule USED TO LIVE HERE,
  // inline and spelled `message.includes('401')`, and it lived here ALONE: the
  // other two data-reading pages rendered a refusal panel for an expired session
  // instead. It is now one exported function all three call, so the claim
  // `Features.md` makes about this shell is made by one piece of code.
  const expired = useSignInOnExpiredSession([failure]);
  // The failure is recorded either way and suppressed here rather than never
  // stored: a page that only stored what it was willing to show could not tell
  // “no failure” from “a failure I decided not to mention”.
  const error = expired ? null : failure;

  return (
    <main className="gn-shell">
      <AppNav />
      <div className="gn-workspaces">
        <div className="gn-workspaces__head">
          <h1 className="gn-page-title">Workspaces{user !== null ? ` — ${user.name}` : ''}</h1>
          {/* `workspaces !== null` FIRST, and it stays load-bearing: a REFUSED
              read is also `null` here, and short-circuiting on this term before
              `.length` is what keeps a refusal from throwing instead of merely
              changing copy — a summary rendered through a refusal would print
              "0 workspaces you belong to.", a number nobody counted, about a
              list nobody managed to read.
              `&& workspaces.length > 0` is a copy judgement, not a withholding
              one: a SUCCESSFUL empty read is a real, counted zero, and "0
              workspaces you belong to." sitting on top of the empty-state
              sentence below ("No workspaces yet. Ask an admin…") was
              redundant — that sentence already says it better.
              ONE interpolation, so the sentence is one text node. */}
          {workspaces !== null && workspaces.length > 0 ? (
            <p className="gn-workspaces__summary">
              {`${workspaces.length} ${workspaces.length === 1 ? 'workspace' : 'workspaces'} you belong to`}
            </p>
          ) : null}
        </div>
        {/* Error before data, everywhere in this shell. ⚠ CORRECTED 2026-09-20: this
            read "`getMyWorkspaces` is one of the refusing reads (four of them since
            ruling P25 clause 1; this is still one), so `workspaces === null` is its
            NORMAL resting state against the shipped server". It is NOT refusing —
            rulings P32/P38 served it and the register has been empty since
            2026-09-19 — and `workspaces === null` is now the ordinary LOADING state.
            The ORDERING is unchanged and still right: `error` is checked before
            `data`, because a read that FAILS must not render as a spinner. */}
        {expired ? (
          <ExpiredSessionNotice />
        ) : error !== null ? (
          <ShellRefusal what="Your workspaces" message={error} />
        ) : workspaces === null ? (
          <p>Loading…</p>
        ) : workspaces.length === 0 ? (
          // The second sentence this always needed (Plan 6 Task 15b, item 1). A
          // person with a session and no workspace used to be told only to wait
          // for somebody else, which was the last hole in the founding path.
          <p>No workspaces yet. Ask an admin for an invite link — or create your own.</p>
        ) : (
          <ul className="gn-workspace-list">
            {workspaces.map((workspace) => (
              <WorkspaceCard key={workspace.id} workspace={workspace} />
            ))}
          </ul>
        )}

        {/*
          OUTSIDE the list's three branches, and deliberately so. ⚠ CORRECTED
          2026-09-20: this read "`getMyWorkspaces` is one of the refusing reads —
          four of them since ruling P25 clause 1, and this is still one — so `error`
          is its NORMAL resting state against the shipped server — and a founding
          form nested inside the `workspaces.length === 0` arm would be a form
          nobody could ever reach." It no longer refuses (rulings P32/P38; the
          register has been empty since 2026-09-19), **so the empty arm IS reachable
          and the placement's stated reason has expired. The placement is NOT moved
          here** — relocating a form is a product decision, not a comment
          correction's: *owner, whoever next touches this page.*
          A person who cannot be told which workspaces they are in can still found
          one, and that is exactly the person who most needs to.
        */}
        {/*
          OUTSIDE the list's five branches too, and beside the founding form for
          the SAME reason it is. ⚠ CORRECTED 2026-09-20: this read "…for the SAME
          reason it is: `getMyWorkspaces` refusing is this page's normal resting
          state" — the refusal is gone (rulings P32/P38; register empty since
          2026-09-19), so the reason it names has expired; the PLACEMENT is kept
          and the owner is named above, at the founding form's block. A person with a pending invitation and no workspace
          yet is precisely the one the banner exists for — nesting it in the
          `length === 0` arm would hide it from everyone whose list failed to
          load, and nesting it inside the list would hide it from the person who
          has no list.
        */}
        <InvitationBanner />
        <FoundingForm />
      </div>
    </main>
  );
}

/**
 * Task 18's `viewerOf` and `restrictedLine` MOVED to `src/workspace-viewer.ts`
 * by Task 19, unchanged, because the workspace home became their second caller
 * and the reasoning they carry — one role value, two questions, withheld is not
 * zero — is precisely the kind that must not exist twice. The full argument
 * travelled with them; this page's behaviour did not change, and 13.380/13.381
 * still drive both through this card.
 */

/**
 * The two count chips, and the word "active".
 *
 * `ticketCount` is every ticket in this project this caller may see;
 * `blockedCount` is the subset standing in a state the workflow flags blocked.
 * Blocked is a subset of the total by construction — `visibleProjectCounts`
 * computes it as a `FILTER` on the same query — so `total − blocked` is exact
 * arithmetic over one set and not a third number nobody counted.
 *
 * **"active" here means NOT BLOCKED, and that is not `StateCategory.active`.**
 * The domain has a state category by that name (`open` / `active` / `terminal`)
 * and a ticket in an `open` state is unblocked without being category-active.
 * The two would need a server field to tell apart and this route serves none,
 * so nobody should later wire this chip to the category and call it a fix: the
 * label would go on being the same word and start being a different claim.
 */
function ChipRow({
  workspace,
  viewer,
  archivedCount,
}: {
  workspace: WorkspaceRef;
  viewer: CardViewer;
  archivedCount: number;
}) {
  if (viewer.countsWithheld) {
    // ONE chip, and no number anywhere in it. Printing `0` would be the claim
    // "nothing here you can see", which is exactly what the server declined to
    // say by omitting the key. `archivedCount` is deliberately not read on
    // this branch either, for the same reason: a guest gets no numbers at all,
    // not a subset of them.
    return (
      <div className="gn-workspace-card__chips">
        <Chip tone="restricted">Restricted</Chip>
      </div>
    );
  }
  const total = workspace.projects.reduce((sum, p) => sum + (p.ticketCount ?? 0), 0);
  const blocked = workspace.projects.reduce((sum, p) => sum + (p.blockedCount ?? 0), 0);
  return (
    <div className="gn-workspace-card__chips">
      {/* Summed over the projects THIS CARD NAMES, which is narrower than "work
          you can see in this workspace": a project whose name is withheld can
          still hold tickets this caller sees, and those are not in this total.
          The line below the list says how many such projects there are, which
          is what keeps the pair honest rather than either number alone. */}
      {workspace.memberCount !== null ? (
        <Chip tone="neutral">{`${workspace.memberCount} ${workspace.memberCount === 1 ? 'member' : 'members'}`}</Chip>
      ) : null}
      <Chip tone="active">{`${total - blocked} active`}</Chip>
      <Chip tone="blocked">{`${blocked} blocked`}</Chip>
      {/* Round 19c (owner: "everything else on the card should just be info,
          nothing clickable") replaced the disclosure toggle that used to
          reveal the archived rows with this count — the only remaining trace
          of "archived" on a card that no longer nests a `<button>` in it. */}
      {archivedCount > 0 ? <Chip tone="neutral">{`${archivedCount} archived`}</Chip> : null}
    </div>
  );
}

/**
 * One workspace, as the owner's `/workspaces` reference draws it (Task 18).
 *
 * ## What is derived and what is served
 *
 * Served: the name, the role, `memberCount`, `nameRestrictedProjectCount`, and
 * per project a name, `archived` and two counts. Derived HERE and nowhere else:
 * the monogram and its tint (from the name and the id — `Avatar`), the role
 * sentence, the two chip totals, and the archived split. Nothing on this card
 * is invented: every string traces to a value the route computed.
 *
 * ## The WHOLE card is a door to `/w/<id>` (Round 19c, owner feedback: "the
 * entire workspace card should be clickable ... everything else on the card
 * should just be info, nothing clickable")
 *
 * Round 19b made only the head (monogram + name) a `<Link>`, reasoning that an
 * anchor cannot validly nest a `<button>` or another `<a>` — which the
 * per-project links and the archived-disclosure toggle both were at the time.
 * Round 19c removes those nested controls instead of working around them: the
 * per-project name became plain text (a `ProjectRow` per live project), and the
 * archived toggle is gone, replaced by a count chip in `ChipRow`. With no
 * interactive descendant left, the single `<Link>` can wrap the card's entire
 * content — head, chips, project list and restricted line — and the
 * invalid-nesting constraint that used to cap the door at the head no longer
 * applies. **Task 7** goes one step further and removes `ProjectRow` itself:
 * the per-project rows become the prototype's one joined, truncated line
 * (`projectLine`, `src/workspace-viewer.ts`) — still plain text inside the
 * same door, so nothing here about nesting changes again.
 *
 * `aria-label={workspace.name}` on the `<Link>` still OVERRIDES the name a
 * browser would otherwise compute from its content (now the avatar's own
 * label, the heading text, the role sentence, the joined project line, and
 * the restricted line, all at once) — so the link's accessible name stays
 * exactly the workspace's name. The `<h2>` inside it keeps its own heading
 * role and text (`getByRole('heading', ...)` is unaffected by an ancestor's
 * `aria-label`), and the avatar keeps its own `aria-label` too — two elements
 * sharing one accessible name is not an error, only something `getByLabelText`
 * alone cannot disambiguate without its `selector` option.
 *
 * ## Nothing removed is unreachable
 *
 * `/w/<id>` — one click through the door — already carries a "My Work" link,
 * every project as its own card-shaped door to that project's board, and its
 * own admin archive/restore controls (`app/w/[workspaceId]/page.tsx`, Task 19
 * / Round 20; that page's per-project "Open board" button was REMOVED when the
 * owner ruled its project cards into doors too, so this bullet no longer names
 * a control that exists).
 * Stripping this card down to the door plus plain info is not a loss of
 * function, only of a second, redundant place to reach the same controls.
 *
 * ## Archived is a COUNT here, not a disclosure
 *
 * The toggle that used to reveal archived rows inline is gone along with the
 * rows themselves — this card renders `live` projects only. `archived.length`
 * survives as one more `Chip` in `ChipRow`, gated the same way the member and
 * ticket counts are (`viewer.countsWithheld`), so a guest sees no archived
 * count either, consistent with getting no numbers at all.
 */
function WorkspaceCard({ workspace }: { workspace: WorkspaceRef }) {
  const viewer = viewerOf(workspace.role);
  const live = workspace.projects.filter((project) => !project.archived);
  const archived = workspace.projects.filter((project) => project.archived);
  const restricted = restrictedLine(workspace.nameRestrictedProjectCount);
  // Bound once: read in both the render condition below and the body, and a
  // bare double call would be flagged.
  const meta = projectCountLine(live.length);
  // Same reason as `meta` above: `projects` is read in both the render
  // condition and the body below.
  const projects = projectLine(live.map((p) => p.name), viewer.countsWithheld);

  return (
    <li data-testid={`workspace-card-${workspace.id}`}>
      {/* `gn-workspace-card` (Round 22) exists only to carry `height: 100%`, so
          every card in a row is the tallest one's height — the owner asked for
          the same rule the project grid got. A DEDICATED class rather than a
          `.gn-workspace-list .gn-card` descendant rule: that exact selector is
          the one `neo-card-radius.test.ts` (case 13.355) asserts does not
          exist, because page-scoped overrides of the shared card class are what
          inverted a radius bump into a shrink once the radius became a token. */}
      <Card className="gn-workspace-card">
        <Link
          href={`/w/${workspace.id}`}
          aria-label={workspace.name}
          className="gn-workspace-card__door"
        >
          <div className="gn-workspace-card__head">
            {/* The tint key is the workspace ID, not its name: two workspaces
                called the same thing must still be told apart, and a rename
                must not change a colour a person has learned. */}
            <Avatar name={workspace.name} tint={workspace.id} size="workspace" />
            <div className="gn-workspace-card__titles">
              <h2>{workspace.name}</h2>
              {/* The prototype's meta line. It carries the PROJECT count only:
                  the members chip below already says the member count, and the
                  prototype's "5 members · 2 projects" would say it twice on one
                  card. Gated on `countsWithheld` because 13.380 is named "no
                  number anywhere" — a guest sees names, never counts. */}
              {!viewer.countsWithheld && meta !== null ? (
                <p className="gn-workspace-card__meta">{meta}</p>
              ) : null}
            </div>
          </div>

          <ChipRow workspace={workspace} viewer={viewer} archivedCount={archived.length} />

          {/* 13.357's role label, now a SENTENCE and now BELOW the chips, which is
              where the prototype puts it (`desktop.dc.html:205`). The raw enum was a
              database value on a card; `viewerOf` is the one place it becomes
              English, and the same object gates every number above. */}
          <p className="gn-workspace-list__role">{viewer.sentence}</p>

          {/* The prototype's single project line (`desktop.dc.html:206`), replacing
              the per-project rows. The chevron is decorative — the whole card is
              already one link named by the workspace, so the arrow names nothing a
              screen reader has not already been told. */}
          {projects !== null ? (
            <p className="gn-workspace-card__projects">
              {projects}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </p>
          ) : null}

          {restricted !== null ? (
            <p className="gn-workspace-card__restricted">{restricted}</p>
          ) : null}
        </Link>
      </Card>
    </li>
  );
}

/**
 * The date this invitation lapses, in the PRODUCT's timezone.
 *
 * `IST_TIME_ZONE` imported rather than the literal re-spelled — `packages/domain/
 * src/ist-day.ts` is the one declaration site and `reporting-scope-guard.test.ts`
 * scans for the literal. The zone is explicit and not the viewer's locale
 * default for the reason `/mcp/tokens` states at the same call: a ledger whose
 * owner decided on one timezone should not tell one person an invitation lapses
 * today and another that it lapsed yesterday.
 */
function onDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'an unknown date';
  return at.toLocaleDateString('en-IN', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * The role as a SENTENCE, never the raw enum.
 *
 * This string is the terms of a membership being offered to a person, and
 * `admin` on its own is a database value rather than an offer. The three are
 * spelled out rather than interpolated because `role` is a checked union of
 * exactly three — the door refuses `owner` on the way in — so a fourth would be
 * a type error here rather than a sentence with a hole in it.
 */
/**
 * A name the server sent, or `null` when it does not actually name anybody.
 *
 * `?? 'Someone'` is not enough and that was MEASURED against the dev stack
 * rather than imagined: the inviter's display name comes from better-auth's
 * `"user"."name"`, which is `NOT NULL` and has **no non-blank constraint at
 * all**, and the dev workspace's owner really does carry `''`. The banner
 * rendered *" invited you to Convenience Corner as a member."* — a sentence
 * with a hole in it, from a value that was neither null nor a name.
 *
 * Blank-is-not-a-name is the product's own rule elsewhere, argued at length
 * where an invitation's ADDRESS is validated: `'   '` names nothing while
 * looking like a name everywhere it is displayed. This applies it to the two
 * names this banner renders. `workspaceName` gets the same treatment for
 * symmetry rather than from a measurement — the founding door refuses a
 * whitespace workspace name, so a blank one should not be reachable, and a
 * reader deserves to know which of the two facts is which.
 */
function named(value: string | null): string | null {
  return value !== null && value.trim() !== '' ? value : null;
}

const ROLE_SENTENCE: Record<PendingInvitation['role'], string> = {
  admin: 'as an admin',
  member: 'as a member',
  guest: 'as a guest',
};

/**
 * *"One invitation is waiting"* — the invitations addressed to the signed-in
 * person's verified email, with Accept and Decline (Task 17).
 *
 * ## It renders NOTHING for an empty list, and that is the whole design
 *
 * A person with no invitation must not be told about invitations. So the empty
 * answer produces no heading, no empty state and no placeholder — the honest
 * rendering of "nothing is waiting" is nothing. The same is true while the read
 * is still in flight: a banner that flashed "Loading…" would announce a
 * possibility that usually is not there.
 *
 * ## A failed read does NOT take the page down
 *
 * `<ShellRefusal>` is deliberately not used here. This read is a small extra on
 * a page whose main job is the workspace list and the founding form, and turning
 * its failure into the page's refusal would mean a broken invitations query hid
 * the founding form from somebody who cannot see their workspaces either. The
 * failure is shown as one line, in the server's own words where it sent any,
 * because saying nothing would be a silent withholding: the person cannot tell
 * "you have no invitations" from "I could not find out".
 */
function InvitationBanner() {
  const router = useRouter();
  const { myInvitations } = useAppServices();
  const [invitations, setInvitations] = useState<PendingInvitation[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(() => {
    myInvitations.list().then(
      (rows) => {
        setInvitations(rows);
        setFailure(null);
      },
      (cause: unknown) => {
        setInvitations([]);
        setFailure(cause instanceof Error ? cause.message : String(cause));
      },
    );
  }, [myInvitations]);

  useEffect(() => reload(), [reload]);

  // The two actions differ in what follows them and in nothing else, so they
  // share one handler: a refusal is the server's sentence, and anything else is
  // this shell admitting it does not know why.
  const act = (invitation: PendingInvitation, action: 'accept' | 'decline'): void => {
    setBusy(invitation.inviteId);
    setRefusal(null);
    const done = (cause: unknown): void => {
      setBusy(null);
      setRefusal(
        cause instanceof InvitationActionError && cause.serverMessage !== null
          ? cause.serverMessage
          : 'The invitation could not be updated, and the server did not say why.',
      );
    };
    if (action === 'accept') {
      void myInvitations.accept(invitation.inviteId).then(
        ({ workspaceId }) => router.push(`/w/${workspaceId}/my-work`),
        done,
      );
      return;
    }
    void myInvitations.decline(invitation.inviteId).then(() => {
      setBusy(null);
      // The invitation vanishing is what the server's 204 means, and it is
      // observed by re-reading rather than by removing the row here — a client
      // that edited its own copy would be asserting an outcome instead of
      // reading one.
      reload();
    }, done);
  };

  // No `role="status"` on the line below, deliberately. `<ShellRefusal>` on this
  // same page already carries one, and this line renders at MOUNT rather than in
  // response to anything the person did — two live regions announcing at once is
  // worse for a screen reader than one, and the second would be reporting the
  // smaller failure over the top of the bigger one. It is ordinary visible text,
  // which is what a static description of a failed read is. (When only THIS read
  // fails the page has no live region at all, which is what its case asserts —
  // the point is that a page whose reads BOTH fail still has exactly one.)
  if (failure !== null) {
    return <p className="gn-invitations__failure">Your invitations could not be loaded: {failure}</p>;
  }
  if (invitations === null || invitations.length === 0) return null;

  return (
    <section className="gn-invitations" aria-labelledby="gn-invitations-heading">
      {/* Decorative: the heading already says an invitation is waiting, so an
          accessible name here would be the same sentence read twice. */}
      <svg
        className="gn-invitations__icon"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5" />
        <path d="M12 16h.01" />
      </svg>
      <div className="gn-invitations__body">
        <h2 className="gn-invitations__heading" id="gn-invitations-heading">
          {invitations.length === 1
            ? 'One invitation is waiting'
            : `${invitations.length} invitations are waiting`}
        </h2>
        <ul className="gn-invitations__list">
          {invitations.map((invitation) => {
            const workspace = named(invitation.workspaceName) ?? 'a workspace that has not been named yet';
            const inviter = named(invitation.invitedByName) ?? 'Someone';
            return (
              <li
                key={invitation.inviteId}
                className="gn-invitations__item"
                data-testid={`invitation-${invitation.inviteId}`}
              >
                <p className="gn-invitations__offer">
                  {`${inviter} invited you to ${workspace} ${ROLE_SENTENCE[invitation.role]}.`}
                </p>
                {/* ONE interpolation, not three. React renders each JSX
                    interpolation as its own text node, so a sentence assembled
                    out of them is split in the accessibility tree and in every
                    `getByText` that looks for it — the failure that caught this
                    the first time it was written. */}
                <p className="gn-invitations__when">
                  {`Invited ${onDay(invitation.invitedAt)} · lapses ${onDay(invitation.expiresAt)}`}
                </p>
                <div className="gn-invitations__actions">
                  {/* The accessible names carry the workspace, so two waiting
                      invitations do not present two identically-named buttons —
                      the accessible-name floor this shell ratchets is about
                      exactly that. */}
                  <Button
                    variant="primary"
                    type="button"
                    disabled={busy !== null}
                    aria-label={`Accept the invitation to ${workspace}`}
                    onClick={() => act(invitation, 'accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    disabled={busy !== null}
                    aria-label={`Decline the invitation to ${workspace}`}
                    onClick={() => act(invitation, 'decline')}
                  >
                    Decline
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        {refusal !== null ? (
          <p role="alert" className="gn-refusal gn-refusal--server">
            {refusal}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Founding a workspace — the client half of `POST /v1/workspaces`
 * (`apps/server/src/routes/workspaces.ts:74`, Plan 4 Task 13).
 *
 * The name is submitted AS TYPED. `FoundingGateway` does not trim it and
 * neither does this form: trimming would silently repair a claim the person
 * made, and it would make the door's own 400 unreachable for the one input it
 * exists to refuse — `minLength: 1` admits `'   '`, which names nothing while
 * looking like a name everywhere it is displayed.
 *
 * Both refusal shapes reach the screen in the DOOR's words: 400
 * `INVALID_NAME_BODY` for a whitespace name, and 422 carrying the ingest
 * layer's own `IngestResult`. `HttpError` carries the parsed body precisely so
 * that is possible; before it did, the most this could have shown was
 * `HTTP 422 for /v1/workspaces`.
 *
 * `.gn-workspace-founding` (Round 19b, owner feedback item 3), not the
 * `.gn-founding` this form shared with the home's new-project form until now:
 * the owner's reference draws the two differently — this one a bare column
 * beside the list, the home's a raised card with an inline field+button row —
 * and "shouldn't be that big" was said of exactly this one.
 */
function FoundingForm() {
  const router = useRouter();
  const { founding } = useAppServices();
  const [name, setName] = useState('');
  /**
   * The workspace prefix — `CC` in `CCSO-1183` (owner spec 2026-09-20): *"i can
   * enter up to 3 letters for the workspace"*. UPPER-CASED AS TYPED, because
   * `prefixSchema` REFUSES a lower-case one rather than normalising it, and the
   * keyboard is the one place that repair belongs.
   */
  const [prefix, setPrefix] = useState('');
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    setSending(true);
    setRefusal(null);
    void founding.foundWorkspace(name, prefix === '' ? undefined : prefix).then(
      /*
        THE WORKSPACE HOME, NOT MY WORK (F5). This pushed `/my-work`, and seconds
        after founding every one of My Work's four sections is empty — the
        founder met "Nothing assigned to you. / No claims in transit. / No
        contested claims. / Nothing has been shared with you." and nothing that
        said what to do next. The home carries the owner's **New project** form
        (`w/[workspaceId]/page.tsx`) and the project grid, which is where the
        manual already sends an owner for it (`docs/manual.md:174` — "an owner or
        admin gets a New project form inside the workspace, and that is the only
        control that creates one"). The prototype's own landing is the list with
        a confirmation; this is the cheaper of the two remedies the finding
        offers and the one that puts a working control in front of the person.
      */
      ({ workspaceId }) => router.push(`/w/${workspaceId}`),
      (cause: unknown) => {
        setSending(false);
        setRefusal(
          cause instanceof FoundingError && cause.serverMessage !== null
            ? cause.serverMessage
            : 'The workspace could not be created, and the server did not say why.',
        );
      },
    );
  };

  return (
    <form className="gn-workspace-founding" onSubmit={submit}>
      <h2 className="gn-workspace-founding__heading">New workspace</h2>
      <label className="gn-field" htmlFor="gn-founding-name">
        <span className="gn-field__label">Name</span>
        <input
          id="gn-founding-name"
          className="gn-field__input"
          placeholder="Garo Hills Logistics"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {/* The workspace's half of every ticket key (owner spec 2026-09-20).
          OPTIONAL, like the project form's box: a workspace founded without one
          still gets a prefix for its keys — derived from the name, which is why
          *this* owner's own three rows already read `CC`, `SO` and `GG` without
          anybody having entered anything. */}
      <label className="gn-field" htmlFor="gn-founding-prefix">
        <span className="gn-field__label">Prefix (optional)</span>
        <input
          id="gn-founding-prefix"
          className="gn-field__input"
          placeholder="e.g. CC"
          value={prefix}
          onChange={(event) => setPrefix(event.target.value.toUpperCase())}
        />
      </label>
      <Button
        className="gn-workspace-founding__submit"
        variant="primary"
        type="submit"
        disabled={sending}
      >
        Create workspace
      </Button>
      {refusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {refusal}
        </p>
      ) : null}
    </form>
  );
}
