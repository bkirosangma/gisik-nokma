'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { newUlid, type GroupRow, type IngestResult } from '@gisik-nokma/domain';
import { Avatar, Button, Card, Chip, Dialog, PencilIcon, PlusIcon, SegmentedControl } from '@gisik-nokma/ui';
import {
  ARCHIVE_LABEL,
  DELETE_TRIGGER_LABEL,
  DeleteDialog,
  RESTORE_LABEL,
  deletedNotice,
  makeSubmittedFactory,
  moreActionsFor,
  readProjectGrouping,
  rememberProjectGrouping,
  type EnvelopeSeed,
  type ProjectGrouping,
} from '@gisik-nokma/app-core';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { AppNav } from '../../../src/app-nav.js';
import { ShellRefusal } from '../../../src/shell-refusal.js';
import { useAppServices, useCurrentUser } from '../../../src/providers.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../../../src/expired-session.js';
import { mayAdminister, restrictedLine, viewerOf } from '../../../src/workspace-viewer.js';
import { DocumentTitle } from '../../../src/document-title.js';
import { ProjectEditForm, type EditRefusal, type ProjectEditValues } from '../../../src/project-edit-form.js';
import { fieldRefusalHandler, ProjectGroupField } from '../../../src/project-group-field.js';
import { groupSeeds, type GroupChoice } from '../../../src/group-picker-seeds.js';
import { useWorkspaceGroups } from '../../../src/use-workspace-groups.js';
import { useOptimisticName } from '../../../src/use-optimistic-name.js';
import { WorkspacePrefixEdit } from '../../../src/workspace-prefix-edit.js';
import { bumpProjectsVersion } from '../../../src/projects-version.js';
import { updateSeeds } from '../../../src/project-update-seeds.js';
import { GroupedProjects } from '../../../src/grouped-projects.js';
import { OverflowMenu } from '../../../src/overflow-menu.js';

// Exported from here beside `archiveSeeds` (the two project acts this page
// submits); the builder lives in `src/` because the project page's header
// submits the same claim.
export { updateSeeds };

/** The project card menu's Edit item (the inline Edit button it replaced was named `Edit <project>`). */
const EDIT_LABEL = 'Edit';

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
  description?: string,
  /**
   * The project prefix — `SO` in `CCSO-1183` (owner spec 2026-09-20). ABSENT when
   * the form's box was left untouched, spread in the same way `description` is,
   * so the key is genuinely missing rather than present-and-undefined and
   * `'prefix' in payload` answers the same question as `payload.prefix ===
   * undefined`. A project founded without one still gets a key: the half is
   * derived from the name.
   */
  prefix?: string,
  /**
   * The group the project is filed under (P-T13, 22.240). `project.created` carries NO `groupId` (its payload is name,
   * description, prefix), so a chosen group rides as a `project.updated {groupId}` AFTER the founder's grant: a refused
   * update then leaves a founded project its founder can still open, where the other order would leave one they cannot.
   * ABSENT (no group chosen) adds nothing: the founding stays the two events it always was.
   */
  groupId?: string,
): EnvelopeSeed[] {
  return [
    {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      payload: {
        name,
        // **ABSENT when there is none** — the key is spread in rather than
        // written as `description: undefined`, so the envelope the ledger
        // receives genuinely lacks it and a test can assert the absence with
        // `'description' in payload`. That is the contract `projectCreatedPayload`
        // states: an absent key is not-described, and there is deliberately no
        // `''` spelling, because `''` fails `min(1)` and the schema refuses a
        // description of only spaces.
        ...(description === undefined ? {} : { description }),
        ...(prefix === undefined ? {} : { prefix }),
      },
    },
    {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.member_added',
      payload: { userId: founderUserId, projectAdmin: true },
    },
    ...(groupId === undefined
      ? []
      : [
          {
            workspaceId,
            entity: { kind: 'project' as const, id: projectId },
            type: 'project.updated' as const,
            payload: { groupId },
          },
        ]),
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
 * *"N projects, name restricted"* line below discloses PART of this, and the
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
  /**
   * Whether the Create project dialog is open. LIFTED to the page because the page's own
   * refusal line sits behind a modal scrim: while the dialog is open the refusal is drawn
   * INSIDE it (so the person who just pressed Create reads it, with their typing intact)
   * and this page's copy is withheld, so one refusal is never announced twice.
   */
  const [createOpen, setCreateOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  /** The project the delete dialog is open on (trash Plan 4, spec §6.2). */
  const [deleting, setDeleting] = useState<ProjectRef | null>(null);
  /** "Deleted project “X”…" after a committed delete — where it went and how back. */
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Grouped or plain (prefixes and groups Task 7, case 22.122) — the person's own choice, kept on this
   * device per user and per workspace. Read in an EFFECT, not in the initialiser: the first render must
   * match the server's (plain), and the session may not have answered yet.
   */
  const [grouping, setGrouping] = useState<ProjectGrouping>('plain');
  /** The groups, read only once Grouped is chosen: `null` while loading, `'failed'` when the read refused. */
  const [groups, setGroups] = useState<GroupRow[] | 'failed' | null>(null);
  /** Bumped by every reload so a Grouped view re-reads the groups with the projects it sits beside. */
  const [loads, setLoads] = useState(0);
  const userId = user?.id ?? null;

  useEffect(() => {
    setGrouping(userId === null ? 'plain' : readProjectGrouping(userId, workspaceId));
  }, [userId, workspaceId]);

  const chooseGrouping = useCallback(
    (choice: ProjectGrouping): void => {
      setGrouping(choice);
      if (userId !== null) rememberProjectGrouping(userId, workspaceId, choice);
    },
    [userId, workspaceId],
  );

  const reload = useCallback(() => {
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        setWorkspaces(rows);
        setFailure(null);
        setLoads((count) => count + 1);
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
    (
      build: (actorId: string) => EnvelopeSeed[],
      whenDone: () => void,
      /** A form that shows a refusal under its own field claims it (returns true) so the page does not say it twice. */
      onRefused?: (rule: string, reason: string) => boolean,
      /** Called on EVERY arm that is not a commit — the optimistic rename takes its name back here (smoothness T7). */
      whenFailed?: () => void,
    ): void => {
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
        whenFailed?.();
        return;
      }
      const seeds = build(user.id);
      // A builder that answers `[]` (an Edit form saved with nothing changed)
      // is not a claim to send: the act is done as soon as it is asked, and the
      // `setRefusal(null)` above has already cleared any earlier refusal.
      if (seeds.length === 0) {
        whenDone();
        return;
      }
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
            whenFailed?.();
            reload();
            return;
          }
          const bad = results.find((result) => result.status !== 'committed');
          if (bad === undefined) {
            whenDone();
            // A committed batch may have renamed, redescribed, archived or
            // founded a project; tell the hooks that cache the served list
            // (the nav's project link, the project page's title) to re-ask.
            bumpProjectsVersion();
            // The outcome is OBSERVED by re-reading, never by editing this
            // page's own copy of the list — a client that moved the row itself
            // would be asserting an outcome instead of reading one.
            reload();
            return;
          }
          // The authority's own words, exactly as the mint, the Create workspace dialog
          // and the invitation banner carry them — unless the form that asked
          // shows them under its own field (22.181).
          if (!(bad.status === 'refused' && onRefused?.(bad.rule, bad.reason) === true)) {
            setRefusal(
              bad.status === 'refused'
                ? `${bad.rule}: ${bad.reason}`
                : `${bad.code}: ${bad.message}`,
            );
          }
          whenFailed?.();
          // Re-read on a refusal too: a partly-committed batch changed the
          // world, and a stale list beside a refusal shows two contradictory
          // things at once.
          reload();
        },
        (cause: unknown) => {
          setBusy(false);
          setRefusal(cause instanceof Error ? cause.message : String(cause));
          whenFailed?.();
        },
      );
    },
    [dataSource, reload, user],
  );

  const workspace =
    workspaces === null ? null : (workspaces.find((entry) => entry.id === workspaceId) ?? null);

  // The groups door answers members, admins and owners; a guest gets a 404 there, so a guest is never
  // offered the choice and never asked (the same gate the heading row's control reads).
  const mayGroup = workspace !== null && workspace.role !== 'guest';
  const wantGroups = grouping === 'grouped' && mayGroup;
  useEffect(() => {
    if (!wantGroups) return;
    let current = true;
    dataSource.query.getGroups(workspaceId).then(
      (rows) => {
        if (current) setGroups(rows);
      },
      () => {
        if (current) setGroups('failed');
      },
    );
    return () => {
      current = false;
    };
  }, [dataSource, workspaceId, wantGroups, loads]);

  return (
    <main id="gn-main" className="gn-shell">
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
          grouping={mayGroup ? grouping : null}
          groups={groups}
          onGrouping={chooseGrouping}
          onSubmit={submit}
          refusal={refusal}
          createOpen={createOpen}
          onCreateOpenChange={(open) => {
            // A new opening starts clean: an earlier archive's refusal is not this form's.
            if (open) setRefusal(null);
            setCreateOpen(open);
          }}
          onDelete={(project) => {
            setNotice(null);
            setDeleting(project);
          }}
        />
      )}
      {notice !== null ? (
        <p role="status" className="gn-trash-notice" data-testid="trash-notice">
          {notice}
        </p>
      ) : null}
      {deleting !== null && user !== null ? (
        <DeleteDialog
          open
          kind="project"
          name={deleting.name}
          workspaceId={workspaceId}
          entityId={deleting.id}
          dataSource={dataSource}
          make={makeSubmittedFactory({ actorId: user.id, origin: 'web' })}
          onCancel={() => setDeleting(null)}
          onDeleted={({ permanent }) => {
            setNotice(deletedNotice('project', deleting.name, permanent));
            setDeleting(null);
            // Observed by re-reading, never by editing this page's copy — the
            // rule `submit`'s own comment states.
            reload();
          }}
        />
      ) : null}
      {refusal !== null && !createOpen ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {refusal}
        </p>
      ) : null}
    </main>
  );
}

/**
 * One project, as its own raised card in the reference's grid: the name, the
 * counts this caller may be told, and — for an admin — the one control that
 * retires it or brings it back.
 *
 * ## THE CARD'S BODY IS THE DOOR (Round 20, owner ruling), replacing Round
 * ## 19b's separate "Open board" button
 *
 * Round 19b drew the name as plain text and "Open board" as its own button,
 * reasoning that two links to one target breaks 13.387's "assert the exact
 * set" discipline. The owner has now ruled the other way, for the reason
 * `/workspaces`' Round 19c card already follows: the informational body is one
 * `<Link>` and there is no second door beside it. That discipline is KEPT, not
 * abandoned — "Open board" is REMOVED rather than left alongside the new door,
 * because a card that was both a link and held an "Open board" button would be
 * the exact two-doors-to-one-target failure 19b named, arrived at from the
 * other side.
 *
 * ## Archive/Restore leaves the ANCHOR, not the card
 *
 * An `<a>` may not contain a `<button>`, so the admin control cannot live
 * inside the door. It sits as the door's SIBLING inside the same `<Card>`,
 * which is also where the prototype puts it (its own card nests an open-button
 * and an actions row as siblings). `/workspaces` could make its card clickable
 * edge to edge only because Round 19c had removed every control from it; this
 * card still has one, so the door covers the body and the actions strip below
 * it is not part of the link. That difference is the honest one: the click
 * target is exactly the region that navigates.
 *
 * ## The accessible name carries ARCHIVED, because `aria-label` hides the chip
 *
 * `aria-label` overrides everything inside the anchor, so the "Archived" chip —
 * visible text for a sighted reader — would otherwise be invisible to assistive
 * tech for every non-admin, who gets no Archive/Restore button to infer it
 * from. The name says so explicitly rather than leaving the state unannounced.
 *
 * **The label a live and an archived project get is otherwise the same, and
 * there is still no "read-only".** Archiving is a workspace decision, not a
 * permission (Task 16), and the board underneath stays writable — the
 * prototype's "Open read-only" would be a false claim about this product's own
 * rule, so it is not transcribed. Archive/Restore reads the SAME `isAdmin`
 * value 13.388's server gate answers independently; this function does not
 * derive a second opinion.
 */
function ProjectCard({
  workspaceId,
  project,
  countsWithheld,
  isAdmin,
  busy,
  onArchive,
  onEdit,
  onDelete,
  workspacePrefix,
}: {
  workspaceId: string;
  workspacePrefix: string;
  project: ProjectRef;
  countsWithheld: boolean;
  isAdmin: boolean;
  busy: boolean;
  onArchive: (project: ProjectRef) => void;
  onEdit: (
    project: ProjectRef,
    values: ProjectEditValues,
    groups: GroupRow[],
    whenDone: () => void,
    onRefused: (rule: string, reason: string) => boolean,
  ) => void;
  onDelete: (project: ProjectRef) => void;
}) {
  // MCP CRUD plan Task 2 (owner ruling M1): an owner/admin can rename and
  // redescribe a project from its card. The form replaces the actions strip
  // while it is open (the door above keeps showing the served name), and it is
  // gated by the SAME `isAdmin` as Archive — the server's `project.updated` bar
  // is the same as `project.archived`'s, and this control only tells a person
  // that before they type.
  const [editing, setEditing] = useState(false);
  const editTrigger = useRef<HTMLButtonElement | null>(null);
  /** The door's reason for a prefix or group refusal, shown by the form under that field (22.181, 22.187). */
  const [fieldRefusal, setFieldRefusal] = useState<EditRefusal | null>(null);
  const { groups, reread } = useWorkspaceGroups(workspaceId, isAdmin && editing);
  return (
    <li data-testid={`project-row-${project.id}`}>
      <Card
        className={
          project.archived ? 'gn-project-card gn-project-card--archived' : 'gn-project-card'
        }
      >
        <Link
          href={`/w/${workspaceId}/p/${project.id}`}
          aria-label={project.archived ? `Open ${project.name}, archived` : `Open ${project.name}`}
          className="gn-project-card__door"
        >
          <span className="gn-project-card__head">
            <span className="gn-project-card__name">{project.name}</span>
            {project.archived ? <Chip tone="neutral">Archived</Chip> : null}
            {/* The visible cue that the whole card opens the project (WS-03, case 22.147). Decorative:
                the link's own name says "Open …", and the card — not this glyph — is the target. */}
            <svg
              className="gn-project-card__chevron"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </span>
          {/* The prototype draws `p.desc` here — a 15px/20px muted line between
              the name row and the chips, inside the card's own click target
              (`desktop.dc.html:264`), and its data carries real prose
              (`{ name: "Delivery", desc: "Sprint work for the rollout" }`).

              **`undefined` renders NOTHING, not an empty line** — the rule
              `ProjectRef.description` states, and the reason this is an equality
              test against `undefined` rather than a truthiness check: `''` is
              not a value the domain schema can produce (it refuses a blank), so
              the only thing a falsy test would additionally catch is a bug it
              would then hide. The prototype's own hidden-project row carries
              `desc: "You are not named on this project"` as a PLACEHOLDER, and
              that is deliberately NOT transcribed: our `visibleProjects` filters
              ROWS, so a caller not on a project receives no row to draw at all —
              there is no card here for a placeholder to sit on. */}
          {project.description === undefined ? null : (
            <span className="gn-project-card__description">{project.description}</span>
          )}
          <span className="gn-project-card__chips">
            {/* The SAME gate the role sentence reads, and the SAME rule the card
                on `/workspaces` keeps: `null` is WITHHELD and it is not `0`. A
                `?? 0` on either line would turn "we did not count this for you"
                into "there is nothing here", which is the claim the server
                declined to make by omitting the key. */}
            {countsWithheld || project.ticketCount === null ? null : (
              <span className="gn-workspace-home__count">
                {`${project.ticketCount} ${project.ticketCount === 1 ? 'ticket' : 'tickets'}`}
              </span>
            )}
            {countsWithheld || project.blockedCount === null || project.blockedCount === 0 ? null : (
              <Chip tone="blocked">{`${project.blockedCount} blocked`}</Chip>
            )}
          </span>
        </Link>
        {isAdmin ? (
          // The overflow menu replaces the three inline buttons (WS-03, case 22.147): the card now holds
          // ONE link and ONE button, and Edit, Archive/Restore and Delete… are a menu away. It stays
          // mounted while the edit form is open so the form's focus return has a trigger to land on.
          <OverflowMenu
            className="gn-project-card__menu"
            triggerRef={editTrigger}
            triggerLabel={moreActionsFor(project.name)}
            menuLabel={`Actions for ${project.name}`}
            disabled={busy}
            items={[
              {
                label: EDIT_LABEL,
                onSelect: () => {
                  setFieldRefusal(null);
                  setEditing(true);
                },
              },
              { label: project.archived ? RESTORE_LABEL : ARCHIVE_LABEL, onSelect: () => onArchive(project) },
              { label: DELETE_TRIGGER_LABEL, onSelect: () => onDelete(project) },
            ]}
          />
        ) : null}
        {isAdmin && editing ? (
          <ProjectEditForm
            idPrefix={`gn-project-${project.id}`}
            initial={{
              name: project.name,
              description: project.description ?? null,
              prefix: project.prefix,
              groupId: project.groupId ?? null,
            }}
            workspacePrefix={workspacePrefix}
            groups={groups}
            refusal={fieldRefusal}
            busy={busy}
            onSave={(values) => {
              setFieldRefusal(null);
              // A `group.name-taken` re-reads the groups so the picker adopts the group someone else made
              // first (22.187); the form stays open and nothing is resubmitted.
              onEdit(project, values, groups ?? [], () => setEditing(false), fieldRefusalHandler(setFieldRefusal, reread));
            }}
            onCancel={() => setEditing(false)}
            returnFocusRef={editTrigger}
          />
        ) : null}
      </Card>
    </li>
  );
}

/**
 * The four doors out of this page — five until Round 21 moved MCP tokens to
 * `/account` (owner: "this should not be scoped to a workspace").
 *
 * **Two are workspace-scoped path segments and two are not**, and that
 * asymmetry is the whole reason these are four literal strings rather than a
 * mapped prefix: Ticket types and Workflows both target
 * `/settings?workspaceId=<id>&tab=…`, where the workspace rides as a QUERY
 * PARAM, so a uniform `/w/${workspaceId}/…` builder would emit
 * `/w/<id>/settings?…`, which resolves to nothing — and a test that built its
 * expectations the same way would agree with the bug. Case 13.387 asserts the
 * four paths as literals for exactly that reason.
 *
 * **The asymmetry has now survived two rounds of churn in both directions** —
 * Round 21 removed `/mcp/tokens`, the most obvious non-`/w/` door, and Round 22
 * made Workflows a second one — which is why the literals stay rather than
 * being folded into a builder each time the set looks briefly uniform.
 *
 * **Ticket types became a non-`/w/<id>/…` door in Round 19b** (owner feedback,
 * 2026-09-09: "the ticket type edit is opening in a separate route... repoint
 * it") — the SECOND such door then, and the only one since Round 21 sent
 * `/mcp/tokens` to `/account`. It used to point at
 * `/w/<id>/settings/ticket-types` — the bare, sidebar-less list page whose own
 * Edit button opened the ticket-type editor as a THIRD route, the exact
 * defect fixed on `/settings` itself (`app/settings/page.tsx`'s own
 * docblock). Fixing the editor there and leaving this link pointed at the
 * page it bypasses would leave the identical bug reachable a second way, so
 * it now targets `/settings?workspaceId=<id>&tab=ticket-types` — the real
 * shell, sidebar and inlined editor included. (The page header carried a
 * `Settings` button with the same stale href, repointed in the same round;
 * Round 21 removed that button outright — see the header's own comment — so
 * this link is now the only Ticket-types door on the page.)
 * **Workflows was repointed the same way in Round 22** (owner: "clicking
 * workflows from the project screen opens up a separate page. it should open
 * up the workflows tab in the settings page"), so all three workspace-scoped
 * sections now open inside a shell rather than on a bare page.
 *
 * Round 19e had left it alone on the reasoning that repointing it "would just
 * be cosmetic, and was not asked for": unlike ticket types, whose bare list
 * page's Edit button opened the EDITOR as a third route, Workflows' own editor
 * (the BUILDER) was never inlined into `/settings` either, so moving the list
 * closed no editor-left-the-shell gap. **That reasoning was about which DEFECT
 * the move fixed, and the owner has now asked for the move on its own merits —
 * the bare `/w/<id>/settings/workflows` page has no sidebar, so following this
 * card dropped you out of the settings shell and left you with no way back to
 * Ticket types except the browser's Back button.** The asymmetry it described
 * is unchanged and still stands: the builder still opens as its own full-width
 * route from inside the tab, which is what the prototype does too.
 *
 * The bare route still resolves, and `authoring-routes.test.tsx` (10.65–10.70)
 * still drives it — nothing that already linked there breaks.
 *
 * **NOTES, added Round 19b**, verbatim from the prototype's own `wsLinks` —
 * transcribed, not invented, except the one place the prototype's copy
 * assumes a number this route may not have: the Members note reads *"{N}
 * people: roles and pending invitations."* only when `memberCount` is
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
      : `${memberCount} ${memberCount === 1 ? 'person' : 'people'}: roles and pending invitations.`;
  return (
    <nav className="gn-workspace-home__links" aria-label="Workspace sections">
      <Link
        href={`/w/${workspaceId}/my-work`}
        className="gn-workspace-home__link"
        aria-label="My work"
        aria-describedby="gn-link-note-my-work"
      >
        <span className="gn-workspace-home__link-label">My work</span>
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
        href={`/settings?workspaceId=${workspaceId}&tab=workflows`}
        className="gn-workspace-home__link"
        aria-label="Workflows"
        aria-describedby="gn-link-note-workflows"
      >
        <span className="gn-workspace-home__link-label">Workflows</span>
        <span className="gn-workspace-home__link-note" id="gn-link-note-workflows">
          States, transitions and published versions.
        </span>
      </Link>
      {/* MCP tokens is NOT here (Round 21, owner: "move MCP tokens to the
          account page. as this should not be scoped to a workspace"). Round 19b
          listed it precisely because it was global — "this is where somebody
          goes looking for it" — and that reasoning is what the owner overruled:
          a global credential listed among four workspace sections reads as a
          workspace's own, and the card gave no hint otherwise. It now lives on
          `/account`, beside the sessions and passkeys it belongs with, and this
          nav holds only `/w/<id>/…` destinations plus the one `/settings` tab
          that is workspace-scoped by its query param. */}
    </nav>
  );
}

/**
 * The id of the element the header's `<h1>` takes its name FROM — exec4 E4-5.
 *
 * ## The defect, and why the heading had to be named without moving the control
 *
 * The owner's ruling (2026-09-19: *"have the rename be there right on the header.
 * THE CLICK TO RENAME."*) put a real `<button>` inside the `<h1>`, and the
 * button's `aria-label` is `Rename {name}` so a page of identically-named
 * controls can still be told apart. The consequence went unmeasured: in a REAL
 * browser the heading inherits that name, so `/w/<id>`'s level-1 heading
 * announced itself as `Rename Convenience Corner` — the heading named an ACTION
 * while every other route's heading names its page (`/workspaces` →
 * `Workspaces — …`, the board → `Shop operations`). Headings are the primary
 * navigation structure for a screen-reader user, so this was filed IMPORTANT.
 *
 * **MEASURED, both shapes, in Chrome (not jsdom — see below).**
 * `<h1><button aria-label="Rename X">X</button></h1>` renders as
 * `heading "Rename Convenience Corner" level="1"`, reproducing the finding's own
 * measurement. With `aria-labelledby` pointing at the `<span>` below, the same
 * markup renders as `heading "Convenience Corner" level="1"` with
 * `button "Rename Convenience Corner"` still its own node — the heading names
 * the page and the control keeps its purpose.
 *
 * ## Why `aria-labelledby` rather than the finding's own remedy
 *
 * The reviewer proposed `<h1>Convenience Corner</h1>` beside an ADJACENT rename
 * button. **That reverses a recorded owner ruling**, not just a comment: the
 * catalogue (`test-cases/13-neomorphism-and-workspace-screens.md:2125`) records
 * *"The separate `Rename` button is GONE … there is no longer a second control in
 * this header"*, and case `13.969` pins it, one of its arms asserting the
 * control's VISIBLE TEXT is the name. The reviewer's objection to naming the
 * heading directly was that `<h1 aria-label="…">` *"hides the button's purpose"*
 * — an objection `aria-labelledby` does not answer to, because it takes the
 * name from the visible text and leaves the BUTTON's `aria-label` untouched.
 * So this closes the measured defect and leaves the owner's shape standing; the
 * two-element remedy is flagged for the owner rather than taken.
 *
 * ## jsdom does not reproduce this, and the package suite must not pretend it does
 *
 * `@testing-library`'s accessible-name computation answers `Convenience Corner`
 * for the DEFECTIVE shape as well (measured; `dom-accessibility-api` diverges
 * from Chrome on a labelled descendant of a name-from-content element). So no
 * jsdom arm can witness this defect, and `workspace-home.test.tsx`'s case for it
 * asserts the MECHANISM — that the heading's name source resolves to the visible
 * workspace name — while the browser reading above is the outcome witness.
 */
const RENAME_NAME_ID = 'gn-workspace-home__name';

function WorkspaceHome({
  workspace,
  busy,
  showArchived,
  onToggleArchived,
  grouping,
  groups,
  onGrouping,
  onSubmit,
  refusal,
  createOpen,
  onCreateOpenChange,
  onDelete,
}: {
  workspace: WorkspaceRef;
  busy: boolean;
  showArchived: boolean;
  onToggleArchived: () => void;
  /** The Grouped/Plain choice, or `null` when this caller is not offered one (a guest). */
  grouping: ProjectGrouping | null;
  groups: GroupRow[] | 'failed' | null;
  onGrouping: (choice: ProjectGrouping) => void;
  onSubmit: (
    build: (actorId: string) => EnvelopeSeed[],
    whenDone: () => void,
    onRefused?: (rule: string, reason: string) => boolean,
    whenFailed?: () => void,
  ) => void;
  refusal: string | null;
  createOpen: boolean;
  onCreateOpenChange: (open: boolean) => void;
  onDelete: (project: ProjectRef) => void;
}) {
  const viewer = viewerOf(workspace.role);
  const isAdmin = mayAdminister(workspace.role);
  /** Whose collapsed groups the grouped view remembers (smoothness G-1, 25.303). */
  const viewerId = useCurrentUser()?.id;
  const live = workspace.projects.filter((project) => !project.archived);
  const archived = workspace.projects.filter((project) => project.archived);
  /**
   * The ONE list the grid renders, LIVE FIRST AND ARCHIVED LAST (Round 21,
   * owner: "always sort the archived projects to the end").
   *
   * Round 20 built this as a single `filter(p => showArchived || !p.archived)`
   * over `workspace.projects` and argued FOR the served order: concatenating
   * would sink an archived project to the end regardless of where the server
   * put it, so a project would move twice on one click — in, and down. The
   * owner has ruled the other way, and the cost is ACCEPTED rather than
   * forgotten: disclosure is a MODE CHANGE, not an insertion, and in the
   * disclosed mode the order is live-then-archived. A reader who opens the
   * disclosure is asking "what else is here", and the answer groups the
   * retired work at the end instead of interleaving it through the grid at
   * positions only the server's ordering explains.
   *
   * `live` and `archived` are the same two arrays the meta line and the toggle
   * already read (`live.length` is "N active projects", `archived.length` gates
   * the control), so the grid cannot disagree with either about which projects
   * are which — one partition, three consumers. Within each group the served
   * order is preserved; it is only the two GROUPS that are ordered here.
   */
  const shown = showArchived ? [...live, ...archived] : live;
  const restricted = restrictedLine(workspace.nameRestrictedProjectCount);
  const archive = (project: ProjectRef): void =>
    onSubmit(() => archiveSeeds(workspace.id, project), () => undefined);
  const edit = (
    project: ProjectRef,
    values: ProjectEditValues,
    groupRows: GroupRow[],
    whenDone: () => void,
    onRefused: (rule: string, reason: string) => boolean,
  ): void =>
    onSubmit(
      () =>
        updateSeeds(
          workspace.id,
          project.id,
          {
            name: project.name,
            description: project.description ?? null,
            prefix: project.prefix,
            groupId: project.groupId ?? null,
          },
          values,
          groupRows,
          newUlid,
        ),
      whenDone,
      onRefused,
    );
  const renderCard = (project: ProjectRef) => (
    <ProjectCard
      key={project.id}
      workspaceId={workspace.id}
      workspacePrefix={workspace.prefix}
      project={project}
      countsWithheld={viewer.countsWithheld}
      isAdmin={isAdmin}
      busy={busy}
      onArchive={archive}
      onEdit={edit}
      onDelete={onDelete}
    />
  );
  // Grouped is drawn only once the groups have ARRIVED. While they load the plain list stays up, and a
  // refused read says so beside it — a person who asked for Grouped is told it is not what they are
  // looking at (case 22.142), never shown a plain list under a Grouped tab as though it were the tree.
  const groupedView = grouping === 'grouped' && Array.isArray(groups);
  const groupsFailed = grouping === 'grouped' && groups === 'failed';
  // "N members, M active projects, you're an owner" — every number SERVED,
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
      : `${workspace.memberCount} ${workspace.memberCount === 1 ? 'member' : 'members'}, `;
  const meta = `${memberClause}${live.length} ${live.length === 1 ? 'active project' : 'active projects'}, you're ${viewer.clause}`;

  /**
   * The rename ruling, 2026-09-19.
   *
   * `workspace.renamed` has existed in the vocabulary since Plan 1 and has had
   * **no client UI at all** — and until the ruling the server asked nobody who
   * may emit it, so a workspace GUEST could rename the container they were
   * invited into. That absence is now closed server-side
   * (`check-permission.ts`'s `WORKSPACE_RENAME_REASON`), and this control agrees
   * with it **by construction rather than by transcription**: `mayAdminister` is
   * `role === 'owner' || role === 'admin'` and the server's `isWorkspaceAdmin`
   * is the same expression, so the two cannot drift apart without one of them
   * being edited.
   *
   * **The control is not the enforcement and must not be read as it.** A hidden
   * button stops nobody; what makes this honest is that the server refuses the
   * same act, and the control exists so a person learns that before typing a
   * name — the same relationship the Archive control below has with
   * `project.archived`.
   */
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  /** The name the page DRAWS: the one just typed while its write is open or unread, else the served one. */
  const shownName = useOptimisticName(workspace.name);

  const onRename = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = nameDraft.trim();
    // Refused HERE and not sent, for the reason the `submit` helper above gives:
    // `displayName`'s own refine refuses a blank name, so sending one would
    // spend a round trip to be told what this form already knows.
    if (name === '') return;
    // The new name is on the page NOW and the field closes; a refusal takes the name back and reopens the field
    // with what the person typed, beside the reason (smoothness T7, spec S5).
    if (name !== workspace.name) {
      shownName.begin(name);
      setRenaming(false);
    }
    onSubmit(
      () => [
        {
          workspaceId: workspace.id,
          entity: { kind: 'workspace', id: workspace.id },
          type: 'workspace.renamed',
          payload: { name },
        },
      ],
      () => {
        shownName.settle();
        setRenaming(false);
      },
      undefined,
      () => {
        shownName.drop();
        setNameDraft(name);
        setRenaming(true);
      },
    );
  };

  return (
    <>
      {/* The route's title, set HERE rather than at the page root because this
          is the component that holds the workspace's name — the page above it
          has only the id. exec1 P12: the browser tab, the window title, history
          and a screen reader's page announcement all read this. */}
      <DocumentTitle title={shownName.name} />
      <div className="gn-workspace-home__header">
        {/* Tint keyed on the workspace ID, never the name — Task 18's own
            survivor mutation, restated here rather than re-measured: a rename
            must not change a colour a person has learned. */}
        <Avatar size="large" name={shownName.name} tint={workspace.id} />
        <div className="gn-workspace-home__header-titles">
          {/**
           * THE NAME IS THE RENAME'S CONTROL (owner, 2026-09-19: *"have the
           * rename be there right on the header. THE CLICK TO RENAME."*).
           *
           * A `<button>` INSIDE the `<h1>` rather than a bare button, and the
           * reason is not cosmetic: this page's heading must survive. Replacing
           * the `h1` with a button would trade a name for a control and leave
           * the document without a first-level heading, which is a worse bargain
           * than the one the owner asked for.
           *
           * **It is a real `<button>` and NOT an `h1` carrying an `onClick`** —
           * the trap this shape invites. A heading with a click handler is
           * reachable by pointer only: it is not focusable, it does not appear
           * in the tab order, and it announces as a heading rather than as
           * something that does anything. The control that stood here before was
           * already focusable and already moved focus into the input; **that
           * property is preserved, not newly earned.**
           *
           * The BUTTON's accessible name still carries the WORKSPACE (`Rename
           * {name}`), for the reason the removed button's own comment gave: a
           * page of identically-named controls tells a screen-reader user
           * nothing about which one renames what. What the button SAYS visually
           * is the name itself, which is the point of the change.
           *
           * ⚠ **THE HEADING'S name is a DIFFERENT question and exec4 E4-5
           * answered it**: the button's label reaches the `h1` in a real browser,
           * so the page's level-1 heading announced itself as `Rename
           * Convenience Corner`. `aria-labelledby` on the `h1`, pointing at the
           * name span below, gives the heading the page's name while leaving the
           * button's own label alone. `RENAME_NAME_ID` above carries the
           * measurement and the reason the finding's own two-element remedy was
           * not taken.
           */}
          {isAdmin && renaming ? (
            /* THE INPUT REPLACES THE NAME, IN PLACE — the owner's own words:
               *"have the rename be there right on the header. THE CLICK TO
               RENAME."* Not a modal, not a relocation: the heading's own slot
               holds the field for as long as the edit lasts. */
            <form
              className="gn-workspace-home__rename"
              onSubmit={onRename}
              onKeyDown={(event) => {
                // ESCAPE CANCELS, and the handler is on the FORM rather than on
                // the input because focus may be on Save or Cancel by the time a
                // reader changes their mind. ENTER needs no handler: a form with
                // a submit button commits on Enter natively, which is what
                // `Save name` is for.
                if (event.key === 'Escape') setRenaming(false);
              }}
            >
              <label className="gn-field__label" htmlFor="workspace-rename">
                New workspace name
              </label>
              <input
                id="workspace-rename"
                className="gn-field__input"
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                autoFocus
              />
              <Button variant="primary" type="submit" disabled={busy || nameDraft.trim() === ''}>
                Save name
              </Button>
              <Button type="button" disabled={busy} onClick={() => setRenaming(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            /* THE VISIBLE RENAME CUE (UX fixes Task 10, case 23.177, audit WS-13). The name above stays the
               rename's control (13.969); a name that does the job but looks like plain text is not
               discoverable, so an admin also gets a pencil button BESIDE the heading — a sibling, never inside
               the `h1`, or the page's level-1 heading would announce itself as an action (13.995). Both open
               the same in-place field, and both are named `Rename <workspace>`. Non-admins get neither. */
            <div className="gn-workspace-home__title-row">
              <h1 className="gn-page-title" aria-labelledby={isAdmin ? RENAME_NAME_ID : undefined}>
                {isAdmin ? (
                  <button
                    type="button"
                    className="gn-workspace-home__rename-trigger"
                    aria-label={`Rename ${shownName.name}`}
                    disabled={busy}
                    onClick={() => {
                      setNameDraft(shownName.name);
                      setRenaming(true);
                    }}
                  >
                    <span id={RENAME_NAME_ID}>{shownName.name}</span>
                  </button>
                ) : (
                  shownName.name
                )}
              </h1>
              {isAdmin ? (
                <button
                  type="button"
                  className="gn-workspace-home__rename-icon"
                  aria-label={`Rename ${shownName.name}`}
                  disabled={busy}
                  onClick={() => {
                    setNameDraft(shownName.name);
                    setRenaming(true);
                  }}
                >
                  <PencilIcon />
                </button>
              ) : null}
            </div>
          )}
          {/* The workspace's half of every ticket key (prefixes and groups Task 10, 22.185): the same
              admin gate as the rename beside it. */}
          {isAdmin ? (
            <WorkspacePrefixEdit workspaceId={workspace.id} prefix={workspace.prefix} busy={busy} onSubmit={onSubmit} />
          ) : null}
          {/* `gn-workspace-list__role--pinned` (Task 7 fix round 1, ROUTED 3):
              a dedicated class, not a structural selector — see that class's
              rule in globals.css for why. */}
          <p className="gn-workspace-list__role gn-workspace-list__role--pinned">{meta}</p>
        </div>
        {/* NO Members/Settings buttons here (Round 21, owner: "remove the
            members and settings button, not the nav bar item, but the buttons
            on the right side of the workspace viewport"). Both destinations
            remain reachable and neither is orphaned: Members is one of the
            section cards below AND a nav item once a workspace is open, and
            Settings is the nav's own workspace-scoped item (Round 21 item 6).

            **THE HEADER HOLDS THE MONOGRAM, THE TITLES AND THE RENAME — and the
            NAME ITSELF is the rename's control** (owner, 2026-09-19: *"have the
            rename be there right on the header. THE CLICK TO RENAME."*).

            It still does not re-open this ruling, and the distinction is why it
            is a rename rather than one of those two buttons returning: Round 21
            removed two NAVIGATION affordances because each already had a
            destination elsewhere on the page; a rename has no other route in the
            product at all — `workspace.renamed` had no client UI before
            2026-09-19 — so there is nothing here for it to duplicate. **It is a
            workspace ACT, not a way to somewhere else.**

            **THIS PARAGRAPH DESCRIBED THE OLD SHAPE AND IS RE-AIMED RATHER THAN
            LEFT STANDING.** It used to say *"the `Rename` control **beside the
            titles**"*, which was true of a separate button standing next to the
            name — and by the time the name became the control that sentence
            named a thing the page no longer had. **The duplication it argues
            against is now removed in the strongest available form: there is no
            longer a second control in this header at all**, because the name
            does the job. What the sentence above used to say — *"the header is
            now the monogram and the titles, nothing else"* — stays amended
            rather than deleted: it remains true of the two buttons it removed.

            **AMENDED 2026-10-02 (UX fixes Task 10, case 23.177, audit WS-13).**
            "No second control in this header" is no longer true for an ADMIN: the
            name is still the rename's control, but a name that does the job and
            looks like plain text is not discoverable, so a pencil icon button
            (`Rename <workspace>`) now sits beside the heading, outside the `h1`.
            It is still a workspace ACT with no other route, not a navigation
            affordance, so it does not bring back Members/Settings. */}
      </div>

      {/* THE SECTION ROW IS ON TOP (prefixes and groups Task 7, case 22.120): Round 20 had moved it below the
          projects and the founding form, where the reference puts it; the owner has now ruled it back above
          the Projects heading. The grid, the notes and every href are untouched by the move. */}
      <WorkspaceLinks
        workspaceId={workspace.id}
        memberCount={workspace.memberCount}
        countsWithheld={viewer.countsWithheld}
      />

      {/* Round 20: the heading and its toggle sit in a BARE row above the grid,
          not inside a card. The reference has no container around the projects
          section at all — each project is its own card, so an outer one would
          be a card holding cards. */}
      <div className="gn-workspace-home__projects-heading">
        <h2 className="gn-workspace-home__heading">Projects</h2>
        {/* Marked AND hidden, both — the `/workspaces` card's precedent. Per
            Task 18/19's own ruling the control renders only when there is
            something behind it: the prototype's "Show 0 archived" is not
            adopted — a control that reveals nothing lies about the shape of the
            data.

            The VISIBLE text ("Show 1 archived" / "Hide archived") began as the
            reference's "1 archived · show" and lost the dot in the 23.191 copy pass; the ACCESSIBLE NAME is deliberately not, and stays the
            sentence Round 19b gave it. The reference's collapsed label leads
            with a number and its expanded one names no workspace, so a screen
            reader on a page that will grow more disclosures would hear "1
            archived show" with nothing saying what is archived or where. The
            `aria-label` carries the workspace for the same reason the archive
            buttons carry the project. */}
        {/* The heading row's controls (case 22.121), in order: the archived toggle, the Grouped/Plain
            choice, and the Projects section's Create project button (prefixes and groups Task 8, 22.152).
            The button is for an owner or admin only, the same people who may create a project. */}
        <div className="gn-workspace-home__projects-actions">
          {archived.length > 0 ? (
            <Button
              type="button"
              aria-expanded={showArchived}
              aria-label={`${showArchived ? 'Hide' : 'Show'} archived projects in ${workspace.name}`}
              onClick={onToggleArchived}
            >
              {showArchived ? 'Hide archived' : `Show ${archived.length} archived`}
            </Button>
          ) : null}
          {grouping === null ? null : (
            <SegmentedControl<ProjectGrouping>
              aria-label="Show projects"
              options={[
                { value: 'grouped', label: 'Grouped' },
                { value: 'plain', label: 'Plain' },
              ]}
              value={grouping}
              onChange={onGrouping}
            />
          )}
          {/* The Projects section's one primary (prefixes/groups Task 8, case 22.152): a
              verb + object with its icon, in the heading row it acts under. An owner or
              admin only — everyone else reads the refusal line below instead. */}
          {isAdmin ? (
            <CreateProjectButton
              workspaceId={workspace.id}
              busy={busy}
              onSubmit={onSubmit}
              refusal={refusal}
              open={createOpen}
              onOpenChange={onCreateOpenChange}
            />
          ) : null}
        </div>
      </div>
      {groupsFailed ? (
        <p role="status" className="gn-workspace-home__empty">
          The groups could not be loaded, so the projects are shown as a plain list.
        </p>
      ) : null}
      {shown.length === 0 ? (
        // True of THIS CALLER'S list, and said as such. A member outside every
        // project has an empty live list in a workspace full of them, and
        // "there are no projects" would be a claim about the workspace.
        //
        // ⚠ **AND IT WAS NOT TRUE OF EVERY CALLER (E5-23, round-2 ruling,
        // 2026-09-21).** The sentence presupposes projects the reader cannot
        // open — *"no projects YOU can open"* — which is exactly right for the
        // excluded member and exactly wrong for the person who founded this
        // workspace seconds ago and is looking at the Create project button in
        // the heading above, having created nothing yet. Two different facts reach this one arm and
        // `shown.length === 0` cannot tell them apart on its own; `isAdmin`
        // together with the SERVED count can. The founder's sentence names the
        // action rather than an absence, because the button is the way out and
        // it is already on screen.
        isAdmin && workspace.projects.length === 0 ? (
          <p className="gn-workspace-home__empty">
            No projects yet. Create the first one.
          </p>
        ) : (
          <p className="gn-workspace-home__empty">No projects you can open are active here.</p>
        )
      ) : (
        // ONE grid, not a live list plus a disclosed second one (Round 20) —
        // but the archived cards sort to its END (Round 21, owner ruling), dimmed
        // and badged rather than moved to a section of their own. See `shown`'s
        // own comment above for the order and what it costs.
        groupedView ? (
          <GroupedProjects groups={groups} projects={shown} renderCard={renderCard} userId={viewerId} workspaceId={workspace.id} />
        ) : (
          <ul className="gn-workspace-home__projects">{shown.map(renderCard)}</ul>
        )
      )}

      {/* `gn-workspace-home__restricted` (Task 7 review, ROUTED 2): this call
          site sits outside the /workspaces card's flex-gap door, so it needs
          its own scoped top offset — see that class's rule in globals.css for
          why a dedicated class rather than a sibling selector. Round 20 removed
          the `<Card>` that used to wrap it; the rule's premise is UNCHANGED,
          because `.gn-shell` is an ordinary block container (globals.css:101)
          exactly as `.gn-card` was, so this `<p>` still has no flex `gap`
          supplying its offset and still needs its own. */}
      {restricted !== null ? (
        <p className="gn-workspace-card__restricted gn-workspace-home__restricted">{restricted}</p>
      ) : null}

      {/* Non-admins get a refusal NOTE where the Create project button would be, rather than
          nothing: a caller is told what they cannot do here, not left to wonder why the
          control is absent. ONE sentence for every non-admin role (member and guest alike).
          It names BOTH roles that may create ("an owner or admin"): the sentence once named
          only the admin while an owner could create a project too, and `isAdmin` is
          `mayAdminister(role)` (`workspace-viewer.ts`), the same door
          `ADMIN_ONLY_TYPES` holds on the server. */}
      {isAdmin ? null : (
        <p className="gn-workspace-home__founding-refusal">
          Only an owner or admin can create a project.
        </p>
      )}

    </>
  );
}

/**
 * "Create project" — the Projects heading row's primary button and the dialog it
 * opens (prefixes/groups Task 8, case 22.152). It replaced the always-visible
 * "New project" row (`.gn-project-founding`, a raised card with an inline
 * field+button row): founding a project is an act the person chooses to begin, and
 * the form now has room for the group picker Task 9 puts in it.
 *
 * The form is mounted ONLY while the dialog is open, so each opening starts from
 * empty fields — the reset the old form did by hand on success. A refusal from the
 * door is drawn INSIDE the dialog (`refusal`, from the page), where the person who
 * just pressed Create is looking and their typing is still there to correct.
 */
function CreateProjectButton({
  workspaceId,
  busy,
  onSubmit,
  refusal,
  open,
  onOpenChange,
}: {
  workspaceId: string;
  busy: boolean;
  onSubmit: (
    build: (actorId: string) => EnvelopeSeed[],
    whenDone: () => void,
    onRefused?: (rule: string, reason: string) => boolean,
  ) => void;
  refusal: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Read while the dialog is open, exactly as a card's Edit form does: `null` until they arrive, so the
  // field is not offered against a list nobody checked.
  const { groups, reread } = useWorkspaceGroups(workspaceId, open);
  return (
    <>
      <Button variant="primary" onClick={() => onOpenChange(true)}>
        <PlusIcon />
        Create project
      </Button>
      {open ? (
        <Dialog open title="Create project" onClose={() => onOpenChange(false)}>
          <NewProjectForm
            workspaceId={workspaceId}
            busy={busy}
            onSubmit={onSubmit}
            refusal={refusal}
            groups={groups}
            reread={reread}
            onCancel={() => onOpenChange(false)}
            onDone={() => onOpenChange(false)}
          />
        </Dialog>
      ) : null}
    </>
  );
}

function NewProjectForm({
  workspaceId,
  busy,
  onSubmit,
  refusal,
  groups,
  reread,
  onCancel,
  onDone,
}: {
  workspaceId: string;
  busy: boolean;
  onSubmit: (
    build: (actorId: string) => EnvelopeSeed[],
    whenDone: () => void,
    onRefused?: (rule: string, reason: string) => boolean,
  ) => void;
  refusal: string | null;
  /** The workspace's groups for the picker; `null` while they load or when the read refused (no field then). */
  groups: GroupRow[] | null;
  reread: () => void;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  /**
   * The project prefix — `SO` in `CCSO-1183` (owner spec 2026-09-20).
   *
   * **UPPER-CASED AS THE OWNER TYPES, and that is not cosmetic.** `prefixSchema`
   * REFUSES a lower-case prefix rather than normalising it (the ledger stores a
   * claim as it was made), so a form that sent `so` would earn a refusal whose
   * remedy is "type it again in capitals". Correcting the case at the keyboard is
   * the one place that repair belongs, and it is what `prefixSchema`'s own
   * docblock says these forms do.
   */
  const [prefix, setPrefix] = useState('');
  const [group, setGroup] = useState<GroupChoice>({ groupId: null, pendingNames: [] });
  /** A refusal ABOUT the group (22.241), kept here and drawn under the picker; any other rule is the page's line. */
  const [fieldRefusal, setFieldRefusal] = useState<EditRefusal | null>(null);

  const send = (event: FormEvent): void => {
    event.preventDefault();
    // No session read of its own. The page's `submit` already refuses a
    // signed-out caller with its own sentence and hands the founder's id to the
    // builder, so this form cannot disagree with it about who is acting — which
    // is the whole reason the id arrives as an argument.
    //
    // The name goes AS TYPED. `displayName` refuses a blank one at the domain
    // schema, and trimming here would silently repair a claim the admin made
    // while making that refusal unreachable — the Create workspace dialog on
    // `/workspaces` states the same choice about the same door.
    //
    // TWO CALLS, groups first (P-T13 fix 1, 22.246 / 22.247). The door is NOT atomic (`ingest-service.ts`
    // `ingestAll` commits each event on its own and goes on after a refusal), so a `group.created` refused
    // `group.name-taken` inside the founding batch would leave `project.created` and `member_added` committed
    // with no group, and the retry would mint a SECOND project. So the new groups' `group.created` events go in
    // their own call, before any project event exists: a refusal there founds nothing and the picker adopts the
    // existing group (22.241). Only when they all commit is the founding batch sent, filed under the deepest id.
    // With no new group wanted the first builder answers no seeds, and the page's `submit` treats an empty batch
    // as done at once, so a project with no new group is still ONE call.
    //
    // The ULIDs are minted per SUBMISSION, inside the builders. The project's own id is minted in the founding
    // builder only, which runs once the groups are settled, so no refusal of a group can have committed a project
    // under an id the retry forgets. A refusal of the founding batch itself is still a new attempt with a new id.
    const onGroupRefused = fieldRefusalHandler(setFieldRefusal, reread, ['group']);
    setFieldRefusal(null);
    let filedUnder: string | null = group.groupId;
    onSubmit(
      () => {
        if (group.pendingNames.length === 0) return [];
        const chosen = groupSeeds(workspaceId, groups ?? [], group, newUlid);
        filedUnder = chosen.groupId;
        return chosen.seeds;
      },
      () => {
        // The new groups are committed (or none were wanted): hold them as EXISTING picks, so a founding refusal
        // followed by a retry sends no second `group.created` (22.247), and re-read so the picker can draw them.
        if (group.pendingNames.length > 0) {
          setGroup({ groupId: filedUnder, pendingNames: [] });
          reread();
        }
        onSubmit(
          (actorId) =>
            foundingSeeds(
              workspaceId,
              newUlid(),
              name,
              actorId,
              // `''` is the input UNTOUCHED, and an optional field left untouched
              // makes no claim — so it is passed as `undefined`, which
              // `foundingSeeds` turns into an ABSENT key rather than an empty
              // string. Anything else goes AS TYPED, exactly as the name does and
              // for the same reason: a whitespace-only description reaches the
              // domain schema and is refused there with its own sentence, rather
              // than being silently repaired here into "no description" — which
              // would make that refusal unreachable from the one form that can
              // produce a description at all.
              description === '' ? undefined : description,
              // Same `''` rule one line up, for the same reason: an untouched
              // optional box makes no claim, so it becomes an ABSENT key rather
              // than an empty string — and a prefix left off is not "no key", it
              // is a key whose half is derived from the name.
              prefix === '' ? undefined : prefix,
              // No group chosen: no `groupId`, so `foundingSeeds` adds no `project.updated` (22.240's control).
              filedUnder ?? undefined,
            ),
          // The dialog closes on a COMMITTED answer only; the form unmounts with it, so
          // there is nothing to clear by hand.
          onDone,
          // The founding batch's last event files the group, so a refusal of THAT is about the field (22.241); a
          // `project.prefix-taken` is not (`owns` is `group` only) and stays the dialog's own alert line (22.156).
          onGroupRefused,
        );
      },
      // A refusal about the group stays in the dialog under the picker; `group.name-taken` re-reads the groups
      // so the picker adopts the existing one (22.241, as 22.187 on the Edit form). Nothing is resubmitted.
      onGroupRefused,
    );
  };

  return (
    <form className="gn-project-create" onSubmit={send}>
      <label className="gn-field" htmlFor="gn-new-project-name">
        <span className="gn-field__label">Name</span>
        <input
          id="gn-new-project-name"
          className="gn-field__input"
          placeholder="e.g. Phase 2 rollout"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {/* The owner's ruling of 2026-09-19 — *"New-project form gains an optional
          description input"* (the form is the Create project dialog since Task 8) — and it is the ONLY place a description is
          authored: the prototype's `addProject` takes a name and hard-codes
          `desc`, so without this control the column would be written only by
          events the product never sends.

          `Name` is the dialog's first label and this one says
          "(optional)": the name is required and the schema refuses a blank one,
          so a reader who did not know which box they could skip would find out
          by being refused.

          No `maxLength` here, matching the name input beside it: the domain
          schema owns the 500-character bound, and an attribute that silently
          stopped the typing would make that refusal unreachable from the form. */}
      <label className="gn-field" htmlFor="gn-new-project-description">
        <span className="gn-field__label">Description (optional)</span>
        <input
          id="gn-new-project-description"
          className="gn-field__input"
          placeholder="e.g. Sprint work for the rollout"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      {/* The owner's spec, verbatim: *"during project creation up to 3 letters
          for it"* — `SO` in `CCSO-1183`. OPTIONAL, like the description above:
          a project founded without one still gets a key, because the half is
          derived from the name (`packages/domain/src/prefix.ts`), and requiring
          it here would make a key a precondition of founding a project rather
          than a consequence of it.

          No `maxLength`, matching the two inputs above: the domain schema owns
          the bound, and an attribute that silently stopped the typing would
          make that refusal unreachable from the form that can produce it. */}
      <label className="gn-field" htmlFor="gn-new-project-prefix">
        <span className="gn-field__label">Prefix (optional)</span>
        <input
          id="gn-new-project-prefix"
          className="gn-field__input"
          placeholder="e.g. SO"
          value={prefix}
          onChange={(event) => setPrefix(event.target.value.toUpperCase())}
        />
      </label>
      {/* The four-level group picker (R6), the SAME field the Edit form renders (22.240). Offered once the
          groups have been read, as there: a project is never filed under a group nobody checked. */}
      {groups !== null ? (
        <ProjectGroupField
          groups={groups}
          value={group}
          onChange={setGroup}
          disabled={busy}
          idPrefix="gn-new-project"
          refusal={fieldRefusal}
        />
      ) : null}
      {refusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {refusal}
        </p>
      ) : null}
      <div className="gn-project-create__actions">
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={busy}>
          Create project
        </Button>
      </div>
    </form>
  );
}
