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
}: {
  workspaceId: string;
  project: ProjectRef;
  countsWithheld: boolean;
  isAdmin: boolean;
  busy: boolean;
  onArchive: (project: ProjectRef) => void;
}) {
  return (
    <li data-testid={`project-row-${project.id}`}>
      <Card
        className={
          project.archived ? 'gn-project-card gn-project-card--archived' : 'gn-project-card'
        }
      >
        <Link
          href={`/w/${workspaceId}/p/${project.id}`}
          aria-label={project.archived ? `${project.name}, archived` : project.name}
          className="gn-project-card__door"
        >
          <span className="gn-project-card__head">
            <span className="gn-project-card__name">{project.name}</span>
            {project.archived ? <Chip tone="neutral">Archived</Chip> : null}
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
          <div className="gn-project-card__actions">
            <Button
              type="button"
              disabled={busy}
              // The accessible name carries the PROJECT, so a grid of projects
              // does not present a column of identically-named buttons — the
              // rule the archived disclosure and the invitation actions already
              // keep.
              aria-label={`${project.archived ? 'Restore' : 'Archive'} ${project.name}`}
              onClick={() => onArchive(project)}
            >
              {project.archived ? 'Restore' : 'Archive'}
            </Button>
          </div>
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

  const onRename = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = nameDraft.trim();
    // Refused HERE and not sent, for the reason the `submit` helper above gives:
    // `displayName`'s own refine refuses a blank name, so sending one would
    // spend a round trip to be told what this form already knows.
    if (name === '') return;
    onSubmit(
      () => [
        {
          workspaceId: workspace.id,
          entity: { kind: 'workspace', id: workspace.id },
          type: 'workspace.renamed',
          payload: { name },
        },
      ],
      () => setRenaming(false),
    );
  };

  return (
    <>
      <div className="gn-workspace-home__header">
        {/* Tint keyed on the workspace ID, never the name — Task 18's own
            survivor mutation, restated here rather than re-measured: a rename
            must not change a colour a person has learned. */}
        <Avatar size="large" name={workspace.name} tint={workspace.id} />
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
            <h1 className="gn-page-title" aria-labelledby={isAdmin ? RENAME_NAME_ID : undefined}>
              {isAdmin ? (
                <button
                  type="button"
                  className="gn-workspace-home__rename-trigger"
                  aria-label={`Rename ${workspace.name}`}
                  disabled={busy}
                  onClick={() => {
                    setNameDraft(workspace.name);
                    setRenaming(true);
                  }}
                >
                  <span id={RENAME_NAME_ID}>{workspace.name}</span>
                </button>
              ) : (
                workspace.name
              )}
            </h1>
          )}
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
            rather than deleted: it remains true of the two buttons it removed. */}
      </div>

      {/* Round 20: the heading and its toggle sit in a BARE row above the grid,
          not inside a card. The reference has no container around the projects
          section at all — each project is its own card, so an outer one would
          be a card holding cards. */}
      <div className="gn-workspace-home__projects-heading">
        <h2 className="gn-workspace-home__heading">Projects</h2>
        {/* Marked AND hidden, both — the `/workspaces` card's precedent. Per
            Task 18/19's own ruling the control renders only when there is
            something behind it: the prototype's "0 archived · show" is not
            adopted — a control that reveals nothing lies about the shape of the
            data.

            The VISIBLE text is the reference's ("1 archived · show" / "Hide
            archived"); the ACCESSIBLE NAME is deliberately not, and stays the
            sentence Round 19b gave it. The reference's collapsed label leads
            with a number and its expanded one names no workspace, so a screen
            reader on a page that will grow more disclosures would hear "1
            archived show" with nothing saying what is archived or where. The
            `aria-label` carries the workspace for the same reason the archive
            buttons carry the project. */}
        {archived.length > 0 ? (
          <Button
            type="button"
            aria-expanded={showArchived}
            aria-label={`${showArchived ? 'Hide' : 'Show'} archived projects in ${workspace.name}`}
            onClick={onToggleArchived}
          >
            {showArchived ? 'Hide archived' : `${archived.length} archived · show`}
          </Button>
        ) : null}
      </div>
      {shown.length === 0 ? (
        // True of THIS CALLER'S list, and said as such. A member outside every
        // project has an empty live list in a workspace full of them, and
        // "there are no projects" would be a claim about the workspace.
        <p className="gn-workspace-home__empty">No projects you can open are active here.</p>
      ) : (
        // ONE grid, not a live list plus a disclosed second one (Round 20) —
        // but the archived cards sort to its END (Round 21, owner ruling), dimmed
        // and badged rather than moved to a section of their own. See `shown`'s
        // own comment above for the order and what it costs.
        <ul className="gn-workspace-home__projects">
          {shown.map((project) => (
            <ProjectCard
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

      {/* Non-admins get the reference's refusal NOTE where the form would be,
          rather than nothing — the same rule the member sentence above keeps:
          a caller is told what they cannot do here, not left to wonder why the
          form is absent. ONE sentence for every non-admin role (member and
          guest alike); the prototype's guest-specific wording asserts a
          visibility rule ("you can only see tickets that name you") this round
          does not verify anywhere else, so it is not transcribed. */}
      {/*
        ⚠ THE SENTENCE NAMED ONE ROLE OF TWO, AND THAT WAS FALSE — not merely
        narrower than the gate. `isAdmin` above is `mayAdminister(role)`, which
        is `role === 'owner' || role === 'admin'` (`workspace-viewer.ts:90-92`),
        so an OWNER takes the form arm and can create a project in every
        workspace — while the sentence a member or guest reads says that only an
        admin can. `apps/server/src/permissions/check-permission.ts`'s own
        `ADMIN_ONLY_TYPES` agrees the two roles are one door, so the client and
        the server were never in dispute; only the copy was wrong.

        IT SURVIVED THREE REVIEW PASSES because "unreachable for owners" and
        "false for its readers" are compatible facts and each looked like the
        answer: the sentence renders only in the `!isAdmin` arm, so no owner
        ever reads it — and its audience is exactly the people for whom "ask an
        admin" is the right move, so nothing a user did ever surfaced it. The
        claim is about WHO MAY CREATE, though, not about who reads it, and the
        restriction as stated is wrong in every workspace.

        IT WAS TRANSCRIBED VERBATIM FROM THE PROTOTYPE —
        `design-system/interactive/desktop.dc.html:2694` and the mobile
        drawing's `addProjectRefusal` both say "an admin" — which is why it read
        as authoritative. A drawing is not a requirement: the roles exist in the
        shipped product and the drawing's wording did not keep up. Corrected
        here rather than in the drawing, which is the design authority and not
        this product's copy.

        The documents that QUOTE this sentence (`README.md`, `docs/manual.md`,
        `docs/faq.md`) each marked it "the app's own wording, which names only
        the admin"; they are corrected in the same change set, because a
        quotation of a string that no longer exists is a citation that still
        resolves and still misleads. */}
      {isAdmin ? (
        <NewProjectForm workspaceId={workspace.id} busy={busy} onSubmit={onSubmit} />
      ) : (
        <p className="gn-workspace-home__founding-refusal">
          Only an owner or an admin can create a project in this workspace.
        </p>
      )}

      {/* BELOW the projects and the founding form (Round 20), where the
          reference puts them — they were above both until now. The grid, the
          notes and every href are untouched by the move; 13.387 asserts the
          exact set of five inside this nav, and it is scoped by the nav's own
          accessible name rather than by position, so it holds either way. */}
      <WorkspaceLinks
        workspaceId={workspace.id}
        memberCount={workspace.memberCount}
        countsWithheld={viewer.countsWithheld}
      />
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
        ),
      () => {
        setName('');
        setDescription('');
        setPrefix('');
      },
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
      {/* The owner's ruling of 2026-09-19 — *"New-project form gains an optional
          description input"* — and it is the ONLY place a description is
          authored: the prototype's `addProject` takes a name and hard-codes
          `desc`, so without this control the column would be written only by
          events the product never sends.

          `New project` stays the row's primary label and this one says
          "(optional)": the name is required and the schema refuses a blank one,
          so a reader who did not know which box they could skip would find out
          by being refused.

          No `maxLength` here, matching the name input beside it: the domain
          schema owns the 500-character bound, and an attribute that silently
          stopped the typing would make that refusal unreachable from the form. */}
      <label
        className="gn-field gn-project-founding__field"
        htmlFor="gn-new-project-description"
      >
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
      <label className="gn-field gn-project-founding__field" htmlFor="gn-new-project-prefix">
        <span className="gn-field__label">Prefix (optional)</span>
        <input
          id="gn-new-project-prefix"
          className="gn-field__input"
          placeholder="e.g. SO"
          value={prefix}
          onChange={(event) => setPrefix(event.target.value.toUpperCase())}
        />
      </label>
      <Button variant="primary" type="submit" disabled={busy}>
        Create project
      </Button>
    </form>
  );
}
