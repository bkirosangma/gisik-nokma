'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { newUlid, type IngestResult } from '@gisik-nokma/domain';
import { Avatar, Button, Card, Chip } from '@gisik-nokma/ui';
import { makeSubmittedFactory, type EnvelopeSeed } from '@gisik-nokma/app-core';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { AppNav } from '../../../src/app-nav.js';
import { ShellRefusal } from '../../../src/shell-refusal.js';
import { useAppServices, useCurrentUser } from '../../../src/providers.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../../../src/expired-session.js';
import { mayAdminister, restrictedLine, viewerOf } from '../../../src/workspace-viewer.js';

/**
 * Archiving and restoring are ONE control and one symmetric event pair, chosen
 * by the flag the server already served.
 *
 * Both are filed against the PROJECT with an empty payload
 * (`packages/domain/src/events/membership.ts` argues why a pair and not one
 * event carrying a boolean), and `parse-event.ts` refuses an entity id that
 * disagrees with the claim — so there is no id to restate in a payload.
 *
 * Pure, and exported, so a test can read the SHAPE this page submits without
 * mounting it and without a session in the picture.
 */
export function archiveSeeds(workspaceId: string, project: ProjectRef): EnvelopeSeed[] {
  return [
    {
      workspaceId,
      entity: { kind: 'project', id: project.id },
      type: project.archived ? 'project.restored' : 'project.archived',
      payload: {},
    },
  ];
}

/**
 * FOUNDING A PROJECT IS TWO EVENTS, AND THE SECOND IS NOT OPTIONAL.
 *
 * `project.created` alone makes a row in `proj_projects` that its founder
 * cannot use and — unless they are the workspace OWNER — cannot even see:
 *
 * - `visibleProjects` returns every project to an `owner` and filters everyone
 *   else, **a workspace `admin` included**, to `eff.projects`, which is built
 *   from `project.member_added` and nothing else. An admin who founded a
 *   project with one event would watch it vanish from this very list on the
 *   re-read that follows the creation.
 * - `checkVisibilityPermission` refuses `ticket.created` from anyone who is not
 *   on the target project, so the project would also hold no work, ever.
 *
 * The sequence is READ FROM THE PRODUCT rather than invented for this form:
 * `apps/server/src/seed/seed-dev-workspace.ts` appends exactly this pair, and
 * its own comment records that the second was added after every ticket in a
 * sibling seed was refused without it — measured, not inferred.
 *
 * They travel in ONE batch because the door processes a batch in order and
 * commits each event independently (`ingest-service.ts`), so
 * `checkProjectExists` sees the project the previous element just made. Two
 * separate calls would also work and would be strictly worse: a half-failed
 * founding would then be two round trips apart, with a window in which the
 * project exists and belongs to nobody. Case 13.388 drives the pair through the
 * real door in ONE call, which is the only shape that witnesses the ordering.
 *
 * `projectAdmin: true` matches the seed's own founding grant. It gives the
 * founder their project's roster and their tickets' visibility; it does NOT
 * widen the archive gate, which is a workspace question either way
 * (`ADMIN_ONLY_TYPES`, deliberately not `hasProjectAdminRights`).
 */
export function foundingSeeds(
  workspaceId: string,
  projectId: string,
  name: string,
  founderUserId: string,
): EnvelopeSeed[] {
  return [
    {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      payload: { name },
    },
    {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.member_added',
      payload: { userId: founderUserId, projectAdmin: true },
    },
  ];
}

/**
 * `/w/[workspaceId]` — the workspace HOME (Task 19).
 *
 * Until this route existed a workspace was reachable only through a project
 * link: `/workspaces` sent you to `/w/<id>/my-work`, and every other
 * workspace-scoped screen had to be typed. This is the page a workspace's own
 * name should land on — its projects, and the doors into it.
 *
 * ## The read is `GET /v1/me/workspaces`, and nothing new
 *
 * Every number here was computed and served by Task 16, and the withholding
 * rules that come with it are Task 16's too. A second, workspace-scoped read
 * would have had to re-derive `ticketCount`, `blockedCount`, `archived` and the
 * restricted count — four chances to disagree with the card on `/workspaces`
 * about the same workspace, on a page a person reaches BY clicking that card.
 * So this route re-reads the directory and selects one entry out of it.
 *
 * The cost is real and worth stating plainly: the directory answers for EVERY
 * workspace the caller belongs to, so this page pays for workspaces it will not
 * render. What it buys is that exactly one query in the product decides what a
 * caller may be told about a project, and both screens are downstream of it.
 *
 * **A workspace that is not in the answer is not rendered as empty.** It gets
 * its own branch and its own sentence, because "you are not in this workspace"
 * and "this workspace has no projects" are different facts and the second is a
 * claim. The sentence deliberately does NOT say the workspace does not exist:
 * this read cannot distinguish a workspace that is not yours from an id that
 * names nothing, and asserting the stronger of the two would invent a fact —
 * the same reason `visibleProjects` serves a NAME restriction and not an
 * existence one.
 *
 * ## THE PROJECT LIST IS THE CALLER'S, AND FOR AN ADMIN IT CAN BE NARROWER
 * ## THAN WHAT THEY MAY ARCHIVE
 *
 * `visibleProjects` returns every project only to an `owner`; every other role,
 * **workspace `admin` included**, is filtered to `eff.projects` — the projects
 * they are actually on (rulings P32/P38, argued at that function). The archive
 * pair meanwhile is gated on being a workspace owner or admin
 * (`ADMIN_ONLY_TYPES`) with no project-membership condition at all.
 *
 * The two surfaces genuinely disagree, and the absences are ENUMERATED rather
 * than summarised as "the list is partial":
 *
 * - a workspace admin who is not a member of project X **is not told X's name
 *   here**, so X does not appear in this list, so X cannot be opened, archived
 *   or restored through this screen —
 * - even though the server would accept that same admin's `project.archived`
 *   for X if it arrived by any other route.
 *
 * That is not repaired here, and repairing it by widening the read is out of
 * scope on purpose: it would be a new visibility rule over project names, which
 * is the exact question rulings P32 and P38 already answered. Widening later is
 * reversible and discloses one more name; serving a name and retracting it is
 * not. **Owner: whoever next revisits P32/P38 for the admin role.** The
 * *"N projects · name restricted"* line below discloses PART of this, and the
 * difference matters: that count is the owner's option 2 — the projects the
 * caller already holds a ticket id in — so a project an admin can neither name
 * nor see any ticket in is in NEITHER the list nor the count.
 *
 * ## Hiding a control is not enforcement
 *
 * Every admin affordance here is hidden by `mayAdminister`, and that function
 * is a DISPLAY decision. The refusal that binds is the door's:
 * `checkRolePermission` resolves the caller through `resolveEffectiveRole` and
 * refuses `project.created`, `project.archived` and `project.restored` from
 * anyone who is not a workspace owner or admin, whatever this page rendered.
 * Case 13.388 drives all three at the real door with no UI in the picture, so
 * the enforcement claim never rests on this file.
 *
 * ## Every mutation READS THE ANSWER
 *
 * `/v1/events` answers per event, and a refusal arrives as a 200 carrying
 * `status: 'refused'` in the results array — not as a rejected promise. A
 * `.then()` that reloaded unconditionally would re-fetch the list, redraw the
 * same rows and say nothing, showing a member a screen indistinguishable from
 * success on the surface whose whole subject is who may do what.
 */
export default function WorkspaceHomePage() {
  const params = useParams<{ workspaceId: string }>();
  const { workspaceId } = params;
  const { dataSource } = useAppServices();
  const user = useCurrentUser();

  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const reload = useCallback(() => {
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        setWorkspaces(rows);
        setFailure(null);
      },
      (cause: unknown) => {
        setFailure(cause instanceof Error ? cause.message : String(cause));
      },
    );
  }, [dataSource]);

  useEffect(() => reload(), [reload]);

  // Same rule as `/workspaces`: a 401 is not a refusal to answer, and the one
  // page with an answer for it is sign-in.
  const expired = useSignInOnExpiredSession([failure]);
  const error = expired ? null : failure;

  /**
   * One batch through the ordinary ingest door, with the door's own answer read
   * back for EVERY event in it.
   *
   * The founding path submits two events and the archive pair submits one, so
   * the results are checked as a LIST and not at index 0. That is not
   * defensive padding: `project.created` can commit while `project.member_added`
   * is refused, and a check reading only the first result would report a
   * founding as wholly successful while the founder was left off the project
   * they had just made — visible to them only as a project that vanished.
   */
  const submit = useCallback(
    (build: (actorId: string) => EnvelopeSeed[], whenDone: () => void): void => {
      setRefusal(null);
      // Refused HERE and not sent, for the same reason the members page refuses
      // a signed-out revoke: `actorId: ''` is turned away by the door's
      // actor-identity check — the FIRST thing `checkRolePermission` asks — and
      // the refusal would then be about this code rather than about the act.
      //
      // The seeds are BUILT from the id rather than handed in already built, so
      // the founding grant's `userId` and the envelope's `actorId` cannot come
      // from two different reads of the session. One check, one id, one place.
      if (user === null) {
        setRefusal('You are not signed in, so nothing was sent.');
        return;
      }
      const seeds = build(user.id);
      const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' });
      setBusy(true);
      void dataSource.ingest(seeds.map(make)).then(
        (results: IngestResult[]) => {
          setBusy(false);
          // Fewer answers than claims is not success. The door promises
          // `result[i]` answers `events[i]`, so a short array means something
          // gave up mid-batch and the screen must not imply otherwise.
          if (results.length !== seeds.length) {
            setRefusal(
              `The server answered ${results.length} of ${seeds.length} claims, so what happened is not known.`,
            );
            reload();
            return;
          }
          const bad = results.find((result) => result.status !== 'committed');
          if (bad === undefined) {
            whenDone();
            // The outcome is OBSERVED by re-reading, never by editing this
            // page's own copy of the list — a client that moved the row itself
            // would be asserting an outcome instead of reading one.
            reload();
            return;
          }
          // The authority's own words, exactly as the mint, the founding form
          // and the invitation banner carry them.
          setRefusal(
            bad.status === 'refused'
              ? `${bad.rule}: ${bad.reason}`
              : `${bad.code}: ${bad.message}`,
          );
          // Re-read on a refusal too: a partly-committed batch changed the
          // world, and a stale list beside a refusal shows two contradictory
          // things at once.
          reload();
        },
        (cause: unknown) => {
          setBusy(false);
          setRefusal(cause instanceof Error ? cause.message : String(cause));
        },
      );
    },
    [dataSource, reload, user],
  );

  const workspace =
    workspaces === null ? null : (workspaces.find((entry) => entry.id === workspaceId) ?? null);

  return (
    <main className="gn-shell">
      <AppNav workspaceId={workspaceId} />
      {expired ? (
        <ExpiredSessionNotice />
      ) : error !== null ? (
        <>
          <h1 className="gn-page-title">Workspace</h1>
          <ShellRefusal what="This workspace" message={error} />
        </>
      ) : workspaces === null ? (
        <>
          <h1 className="gn-page-title">Workspace</h1>
          <p>Loading…</p>
        </>
      ) : workspace === null ? (
        <>
          <h1 className="gn-page-title">Workspace</h1>
          {/* Not "no projects", and not "no such workspace" — see the docblock.
              The one thing this read establishes is that the directory of the
              caller's OWN workspaces does not name this one. */}
          <p className="gn-workspace-home__stranger">
            This is not one of your workspaces, so there is nothing here to show you. If you were
            expecting to find it, ask an admin for an invitation.
          </p>
        </>
      ) : (
        <WorkspaceHome
          workspace={workspace}
          busy={busy}
          showArchived={showArchived}
          onToggleArchived={() => setShowArchived((open) => !open)}
          onSubmit={submit}
        />
      )}
      {refusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {refusal}
        </p>
      ) : null}
    </main>
  );
}

/**
 * One project row: its name, the counts this caller may be told, an explicit
 * door to its board, and — for an admin — the one control that retires it or
 * brings it back.
 *
 * ## "Open board" replaces the name-as-link (Round 19b)
 *
 * The reference draws the project's name as plain text and "Open board" as
 * its own accent-fill button — not the name doubling as the door. Two links to
 * one target is the failure this avoids: 13.387's "assert the exact set"
 * discipline only means something if a row offers ONE way to each destination.
 *
 * **"Open board" for an archived project too, labelled the same as a live
 * one's.** Archiving is a workspace decision, not a permission (Task 16), and
 * the board underneath stays writable — the prototype's "Open read-only"
 * would be a false claim about this product's own rule, so it is not
 * transcribed. Archive/Restore reads the SAME `isAdmin` value 13.388's server
 * gate answers independently; this function does not derive a second opinion.
 */
function ProjectRow({
  workspaceId,
  project,
  countsWithheld,
  isAdmin,
  busy,
  onArchive,
}: {
  workspaceId: string;
  project: ProjectRef;
  countsWithheld: boolean;
  isAdmin: boolean;
  busy: boolean;
  onArchive: (project: ProjectRef) => void;
}) {
  return (
    <li className="gn-workspace-home__project" data-testid={`project-row-${project.id}`}>
      <div className="gn-workspace-home__project-head">
        <span className="gn-workspace-home__project-name">{project.name}</span>
        {project.archived ? <Chip tone="neutral">Archived</Chip> : null}
      </div>
      <div className="gn-workspace-home__project-chips">
        {/* The SAME gate the role sentence reads, and the SAME rule the card on
            `/workspaces` keeps: `null` is WITHHELD and it is not `0`. A `?? 0`
            on either line would turn "we did not count this for you" into
            "there is nothing here", which is the claim the server declined to
            make by omitting the key. */}
        {countsWithheld || project.ticketCount === null ? null : (
          <span className="gn-workspace-home__count">
            {`${project.ticketCount} ${project.ticketCount === 1 ? 'ticket' : 'tickets'}`}
          </span>
        )}
        {countsWithheld || project.blockedCount === null || project.blockedCount === 0 ? null : (
          <Chip tone="blocked">{`${project.blockedCount} blocked`}</Chip>
        )}
      </div>
      <div className="gn-workspace-home__project-actions">
        <Link
          href={`/w/${workspaceId}/p/${project.id}`}
          className="gn-button gn-button--primary"
        >
          Open board
        </Link>
        {isAdmin ? (
          <Button
            type="button"
            disabled={busy}
            // The accessible name carries the PROJECT, so a list of projects does
            // not present a column of identically-named buttons — the rule the
            // archived disclosure and the invitation actions already keep.
            aria-label={`${project.archived ? 'Restore' : 'Archive'} ${project.name}`}
            onClick={() => onArchive(project)}
          >
            {project.archived ? 'Restore' : 'Archive'}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * The five doors out of this page.
 *
 * **Three are workspace-scoped path segments and two are not**, and that
 * asymmetry is the whole reason these are five literal strings rather than a
 * mapped prefix. `/mcp/tokens` is a GLOBAL route (`app/mcp/tokens/page.tsx`
 * takes no `workspaceId` and reads none), so a uniform `/w/${workspaceId}/…`
 * builder would emit `/w/<id>/mcp/tokens`, which resolves to nothing — and a
 * test that built its expectations the same way would agree with the bug.
 * Case 13.387 asserts the five paths as literals for exactly that reason.
 * TARGETS are unchanged by Round 19b.
 *
 * **Ticket types joined `/mcp/tokens` as the second non-`/w/<id>/…` door
 * (owner feedback, 2026-09-09: "the ticket type edit is opening in a separate
 * route... repoint it").** It used to point at
 * `/w/<id>/settings/ticket-types` — the bare, sidebar-less list page whose own
 * Edit button opened the ticket-type editor as a THIRD route, the exact
 * defect fixed on `/settings` itself (`app/settings/page.tsx`'s own
 * docblock). Fixing the editor there and leaving this link pointed at the
 * page it bypasses would leave the identical bug reachable a second way, so
 * it now targets `/settings?workspaceId=<id>&tab=ticket-types` — the real
 * shell, sidebar and inlined editor included. The header's own `Settings`
 * button (below) carried the same stale href and is repointed the same way,
 * to `/settings?workspaceId=<id>` with no tab (the shell's own default).
 * **Workflows is deliberately UNCHANGED** — `/w/<id>/settings/workflows`
 * still has no sidebar, but unlike ticket types its own editor (the
 * workflow BUILDER) was never inlined into `/settings` either, on purpose
 * (`app/settings/page.tsx`'s own docblock), so repointing the list here
 * would not close any editor-left-the-shell gap the way it did for ticket
 * types — it would just be cosmetic, and was not asked for.
 *
 * **NOTES, added Round 19b**, verbatim from the prototype's own `wsLinks` —
 * transcribed, not invented, except the one place the prototype's copy
 * assumes a number this route may not have: the Members note reads *"{N}
 * people · roles and pending invitations."* only when `memberCount` is
 * served; a guest (withheld, `null`) gets the same sentence with no number
 * prefix, the same "omit rather than leave a dangling clause" rule the
 * header's meta line keeps.
 *
 * **Each link's ACCESSIBLE NAME stays exactly its label — `aria-label` pins
 * it — and the note is linked as a DESCRIPTION via `aria-describedby`,
 * measured rather than assumed.** The first draft let the note join the
 * name by ordinary content concatenation, and `e2e-stack/viewport.spec.ts`'s
 * MUST_NAME sweep (13.389's own witness) caught it within the hour: that
 * route's floor names a link `/^Ticket types$/`, exactly, and a name that
 * became "Ticket types Fields and the workflow each type follows." no
 * longer matched — the accessible-name floor this shell ratchets falling is
 * exactly the failure that check exists to catch. `aria-describedby` is the
 * correct ARIA shape for "a control with a name and a supplementary
 * description" in the first place: most assistive tech still announces the
 * note, as a description read after the name, rather than folded into it.
 *
 * **The Members note gates on `countsWithheld`, NOT on `memberCount ===
 * null`, the second source `src/workspace-viewer.ts`'s own docblock names
 * and rejects.** A review caught the first draft doing exactly that — the
 * anti-pattern case 13.381 exists on the sibling `/workspaces` card
 * specifically to forbid, reproduced here with the same discriminating body
 * that case uses (`role: 'guest'` served WITH a `memberCount`, which the
 * shipped server never sends but which a looser gate would print anyway).
 * `viewerOf(role)` is the one place "may this caller be told a count"
 * gets decided; a second read of `memberCount` is a second opinion the
 * `/workspaces` card and this page could disagree about for the same
 * person.
 */
function WorkspaceLinks({
  workspaceId,
  memberCount,
  countsWithheld,
}: {
  workspaceId: string;
  memberCount: number | null;
  countsWithheld: boolean;
}) {
  const membersNote =
    countsWithheld || memberCount === null
      ? 'roles and pending invitations.'
      : `${memberCount} ${memberCount === 1 ? 'person' : 'people'} · roles and pending invitations.`;
  return (
    <nav className="gn-workspace-home__links" aria-label="Workspace sections">
      <Link
        href={`/w/${workspaceId}/my-work`}
        className="gn-workspace-home__link"
        aria-label="My Work"
        aria-describedby="gn-link-note-my-work"
      >
        <span className="gn-workspace-home__link-label">My Work</span>
        <span className="gn-workspace-home__link-note" id="gn-link-note-my-work">
          Everything assigned to you across this workspace.
        </span>
      </Link>
      <Link
        href={`/w/${workspaceId}/members`}
        className="gn-workspace-home__link"
        aria-label="Members"
        aria-describedby="gn-link-note-members"
      >
        <span className="gn-workspace-home__link-label">Members</span>
        <span className="gn-workspace-home__link-note" id="gn-link-note-members">
          {membersNote}
        </span>
      </Link>
      <Link
        href={`/settings?workspaceId=${workspaceId}&tab=ticket-types`}
        className="gn-workspace-home__link"
        aria-label="Ticket types"
        aria-describedby="gn-link-note-ticket-types"
      >
        <span className="gn-workspace-home__link-label">Ticket types</span>
        <span className="gn-workspace-home__link-note" id="gn-link-note-ticket-types">
          Fields and the workflow each type follows.
        </span>
      </Link>
      <Link
        href={`/w/${workspaceId}/settings/workflows`}
        className="gn-workspace-home__link"
        aria-label="Workflows"
        aria-describedby="gn-link-note-workflows"
      >
        <span className="gn-workspace-home__link-label">Workflows</span>
        <span className="gn-workspace-home__link-note" id="gn-link-note-workflows">
          States, transitions and published versions.
        </span>
      </Link>
      {/* Global, deliberately: an MCP token belongs to a person rather than to a
          workspace. It is listed here because this is where somebody goes
          looking for it, not because this page owns it. */}
      <Link
        href="/mcp/tokens"
        className="gn-workspace-home__link"
        aria-label="MCP tokens"
        aria-describedby="gn-link-note-mcp-tokens"
      >
        <span className="gn-workspace-home__link-label">MCP tokens</span>
        <span className="gn-workspace-home__link-note" id="gn-link-note-mcp-tokens">
          Let an assistant act as you, with your permissions.
        </span>
      </Link>
    </nav>
  );
}

function WorkspaceHome({
  workspace,
  busy,
  showArchived,
  onToggleArchived,
  onSubmit,
}: {
  workspace: WorkspaceRef;
  busy: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
  onSubmit: (build: (actorId: string) => EnvelopeSeed[], whenDone: () => void) => void;
}) {
  const viewer = viewerOf(workspace.role);
  const isAdmin = mayAdminister(workspace.role);
  const live = workspace.projects.filter((project) => !project.archived);
  const archived = workspace.projects.filter((project) => project.archived);
  const restricted = restrictedLine(workspace.nameRestrictedProjectCount);
  const archive = (project: ProjectRef): void =>
    onSubmit(() => archiveSeeds(workspace.id, project), () => undefined);
  // "N members · M active projects · you're an owner" — every number SERVED,
  // never derived a second way. The member-count gate is `viewer.
  // countsWithheld`, NOT `workspace.memberCount === null` — a review caught
  // the first draft reading the second, the exact anti-pattern case 13.381
  // exists on the sibling `/workspaces` card to forbid: `memberCount ===
  // null` agrees with the role gate on every body the shipped server
  // actually sends and disagrees on the one a malformed or unrecognised
  // role could carry, which is precisely the divergence `viewerOf` exists
  // to settle once. `live.length` is this caller's own non-archived named
  // projects, the same array the list below renders; the role clause is
  // `viewer.clause` — the SAME `viewerOf` call the card's sentence reads, so
  // the two cannot disagree about the same person.
  const memberClause =
    viewer.countsWithheld || workspace.memberCount === null
      ? ''
      : `${workspace.memberCount} ${workspace.memberCount === 1 ? 'member' : 'members'} · `;
  const meta = `${memberClause}${live.length} ${live.length === 1 ? 'active project' : 'active projects'} · you're ${viewer.clause}`;

  return (
    <>
      <div className="gn-workspace-home__header">
        {/* Tint keyed on the workspace ID, never the name — Task 18's own
            survivor mutation, restated here rather than re-measured: a rename
            must not change a colour a person has learned. */}
        <Avatar size="large" name={workspace.name} tint={workspace.id} />
        <div className="gn-workspace-home__header-titles">
          <h1 className="gn-page-title">{workspace.name}</h1>
          <p className="gn-workspace-list__role">{meta}</p>
        </div>
        <div className="gn-workspace-home__header-actions">
          <Link href={`/w/${workspace.id}/members`} className="gn-button">
            Members
          </Link>
          <Link href={`/settings?workspaceId=${workspace.id}`} className="gn-button">
            Settings
          </Link>
        </div>
      </div>

      <WorkspaceLinks
        workspaceId={workspace.id}
        memberCount={workspace.memberCount}
        countsWithheld={viewer.countsWithheld}
      />

      <Card>
        <div className="gn-workspace-home__projects-heading">
          <h2 className="gn-workspace-home__heading">Projects</h2>
          {/* Marked AND hidden, both — the `/workspaces` card's precedent. The
              toggle sits at THIS ROW's end (Round 19b, transcribing the
              reference's layout) and, per Task 18/19's own ruling, renders only
              when there is something behind it: the prototype's "0 archived ·
              show" is not adopted — a control that reveals nothing lies about
              the shape of the data. */}
          {archived.length > 0 ? (
            <Button
              type="button"
              aria-expanded={showArchived}
              aria-label={`${showArchived ? 'Hide' : 'Show'} archived projects in ${workspace.name}`}
              onClick={onToggleArchived}
            >
              {`${showArchived ? 'Hide' : 'Show'} ${archived.length} archived`}
            </Button>
          ) : null}
        </div>
        {live.length === 0 ? (
          // True of THIS CALLER'S list, and said as such. A member outside every
          // project has an empty live list in a workspace full of them, and
          // "there are no projects" would be a claim about the workspace.
          <p className="gn-workspace-home__empty">No projects you can open are active here.</p>
        ) : (
          <ul className="gn-workspace-home__projects">
            {live.map((project) => (
              <ProjectRow
                key={project.id}
                workspaceId={workspace.id}
                project={project}
                countsWithheld={viewer.countsWithheld}
                isAdmin={isAdmin}
                busy={busy}
                onArchive={archive}
              />
            ))}
          </ul>
        )}

        {/* The toggle itself now lives in the heading row above; only the
            disclosed list is here. */}
        {archived.length > 0 && showArchived ? (
          <ul className="gn-workspace-home__projects gn-workspace-home__projects--archived">
            {archived.map((project) => (
              <ProjectRow
                key={project.id}
                workspaceId={workspace.id}
                project={project}
                countsWithheld={viewer.countsWithheld}
                isAdmin={isAdmin}
                busy={busy}
                onArchive={archive}
              />
            ))}
          </ul>
        ) : null}

        {restricted !== null ? (
          <p className="gn-workspace-card__restricted">{restricted}</p>
        ) : null}
      </Card>

      {/* Non-admins get the reference's refusal NOTE where the form would be,
          rather than nothing — the same rule the member sentence above keeps:
          a caller is told what they cannot do here, not left to wonder why the
          form is absent. ONE sentence for every non-admin role (member and
          guest alike); the prototype's guest-specific wording asserts a
          visibility rule ("you can only see tickets that name you") this round
          does not verify anywhere else, so it is not transcribed. */}
      {isAdmin ? (
        <NewProjectForm workspaceId={workspace.id} busy={busy} onSubmit={onSubmit} />
      ) : (
        <p className="gn-workspace-home__founding-refusal">
          Only an admin can create a project in this workspace.
        </p>
      )}
    </>
  );
}

/**
 * No `<h2>` heading here, unlike `/workspaces`' "New workspace" form
 * (`FoundingForm`, which keeps both a heading AND a "Name" label) —
 * transcribed asymmetry, not a dropped one. The prototype's own two blocks
 * differ the same way: the workspace-list block carries a separate `<h2>New
 * workspace</h2>` above a field labelled "Name"; this row's field label IS
 * "New project", with nothing above it. Flagged by review as unexplained;
 * this comment is the explanation.
 */
function NewProjectForm({
  workspaceId,
  busy,
  onSubmit,
}: {
  workspaceId: string;
  busy: boolean;
  onSubmit: (build: (actorId: string) => EnvelopeSeed[], whenDone: () => void) => void;
}) {
  const [name, setName] = useState('');

  const send = (event: FormEvent): void => {
    event.preventDefault();
    // No session read of its own. The page's `submit` already refuses a
    // signed-out caller with its own sentence and hands the founder's id to the
    // builder, so this form cannot disagree with it about who is acting — which
    // is the whole reason the id arrives as an argument.
    //
    // The name goes AS TYPED. `displayName` refuses a blank one at the domain
    // schema, and trimming here would silently repair a claim the admin made
    // while making that refusal unreachable — the founding form on
    // `/workspaces` states the same choice about the same door.
    //
    // The ULID is minted per SUBMISSION, inside the builder: a retry after a
    // refusal is a new project, not a second attempt at an id the ledger may
    // already hold.
    onSubmit(
      (actorId) => foundingSeeds(workspaceId, newUlid(), name, actorId),
      () => setName(''),
    );
  };

  return (
    <form className="gn-project-founding" onSubmit={send}>
      <label className="gn-field gn-project-founding__field" htmlFor="gn-new-project-name">
        <span className="gn-field__label">New project</span>
        <input
          id="gn-new-project-name"
          className="gn-field__input"
          placeholder="e.g. Phase 2 rollout"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <Button variant="primary" type="submit" disabled={busy}>
        Create project
      </Button>
    </form>
  );
}
