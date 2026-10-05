import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { HttpError, createOnlineDataSource, type FetchLike } from '@gisik-nokma/app-core/online';
// TYPE-ONLY, and deliberately from the package ROOT rather than `/online`: the
// root's value surface reaches React (`views/`), and this file runs in Node
// under `apps/server` with no DOM. `import type` is erased at compile time, so
// `DataSourceQuery` costs nothing at runtime and the walk below is typed against
// the SAME declaration the client implements rather than a copy of it.
import type { DataSourceQuery } from '@gisik-nokma/app-core';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * **THE SOFT-DELETE INVARIANT, ARM 1: the CLIENT READ SURFACE, walked by TYPE.**
 *
 * Catalogue entry: **case 16.88** (`test-cases/16-remaining-doors.md`). Arm 2 is
 * **case 16.89**, and the attachments leak this arm cannot see is **case 16.90**.
 *
 * ## The problem this file exists for, stated as a measurement
 *
 * The DELETE delivered by `#591` is a soft delete: `ticket.deleted` sets
 * `proj_tickets.deleted_at` and every view reader is supposed to AND
 * `LIVE_TICKET_WHERE` (`read/visible-where.ts`) into its SELECT. Nothing
 * enforces that. `#591`'s own reviewer measured the shape of the gap: mutating a
 * site to `AND TRUE` left the whole server and app-core suites **green** —
 * *executed but UNCONSTRAINED* paths, not mutations that never ran. The filter is
 * therefore held by convention, and **a later edit can un-filter a tombstone
 * with nothing anywhere to say so.**
 *
 * ## Why the guard is a TYPE and not a list of surfaces
 *
 * A hand-written list of the surfaces to check goes stale exactly one way: a new
 * read method is added and the list is not. That is not hypothetical in this
 * repo — the fourth empty-state site of cycle 25 was missed by a named
 * enumeration whose completeness nobody had claimed.
 *
 * So the enumeration here is **self-maintaining**. `absenceTripwire` returns its
 * argument typed as `AbsenceDecision`; `keyof DataSourceQuery` widening past
 * those twenty-three members makes that return unassignable and `tsc` refuses it with
 * TS2322. The device is not new — it is `paginationTripwire`
 * (`packages/app-core/test/views/list-model.test.ts:68`), which this file copies
 * in shape for the same reason: its docblock records that a widened
 * `TicketListView` fails the typecheck rather than a test.
 *
 * ⚠ **The tripwire is only as strong as `app-core` having been REBUILT, and an
 * independent reviewer measured the weak direction rather than assuming it.**
 * The type resolves through `packages/app-core/dist/index.d.ts`, not through
 * `src` — so widening `DataSourceQuery` and running the typecheck against a
 * STALE `dist` compiles **GREEN**. The guard fires on the day it matters, because
 * a real widening has to be built for anything to consume it; but a reader who
 * mutates `src` alone and sees green has learned nothing. Measured both ways.
 *
 * ⚠ **The tripwire is the load-bearing half. A method that is never visited is a
 * surface nobody checked, and a green suite cannot say whether it was skipped or
 * passed.** Two tables below are `Record<AbsenceDecision, …>` — `DECIDED` and
 * `callers` — and the tripwire itself is the third obligation. A new member is
 * therefore a compile error on all three counts at once: it must be *visited*,
 * it must be *decided*, and it must *state whether the marker can reach it at
 * all*. (⚠ This paragraph read "Three tables … are all `Record<…>`", and
 * **there are two Records and one function.** Corrected at the line rather than
 * left standing, because the sentence's whole job is to say how many independent
 * things have to fail before a new method can slip through.)
 *
 * ## ⛔ WHAT THIS FILE DELIBERATELY IS NOT
 *
 * **It does not scan the source for `LIVE_TICKET_WHERE`.** A scan is defeated by
 * a rename, it can only ever MISS (the safe direction, and the silent one), and
 * this repo has recorded the class precisely — *"the file contained its own
 * scanner; a regex over its own characters cannot tell code from the text that
 * describes it."* This is a BEHAVIOURAL invariant: a ticket is deleted through
 * the real door and the shipped client is asked every question it can ask.
 *
 * ## The world is built through the doors, and the delete is one of them
 *
 * `POST /v1/workspaces` founds the workspace, `POST /v1/events` creates the
 * project, the parent, the child and finally the `ticket.deleted`. No
 * `applyCommitted`, no INSERT into a `proj_*` table. The client under test is the
 * real `createOnlineDataSource` over the real `createHttpClient`, whose
 * transport is `app.inject` — so the 404-to-null rule, `HttpError` and
 * `JSON.stringify` are all the shipped ones.
 *
 * ## ⚠ THE SCOPE, PUBLISHED RATHER THAN IMPLIED
 *
 * **Arm 1 gets its completeness from the type system. Arm 2
 * (`test/read/soft-delete-background-paths.test.ts`) does not, and nothing
 * gives it.** The full enumeration of the seventeen SQL statements that carry the
 * rule — plus the one TypeScript application and the three attachment doors that
 * no arm constrains —
 * which arm constrains each, and which are constrained by NEITHER — including
 * one measured leak with a named owner — is in Arm 2's docblock, because that
 * is the file whose coverage is a list rather than an inheritance.
 *
 * ## The ORDER of this file is structural, not incidental
 *
 * The delete happens **exactly once**, in the second `describe`'s `beforeAll`.
 * The first `describe` asserts the marker is PRESENT; the second asserts what
 * the delete did to it. Baselines a later case compares against are captured in
 * the outer `beforeAll`, before either `describe` runs — so no case depends on
 * a sibling having run first.
 *
 * ## The marker, and the control that keeps absence from being emptiness
 *
 * Every assertion below is about a unique marker planted in the CHILD's title.
 * **⚠ CORRECTED 2026-09-21: this read "and carried into nothing else", and that
 * expired when the comment read joined this walk.** The marker is now in exactly
 * two places, both on the ticket the delete removes: the child's TITLE, and the
 * body of one `comment.added` on that child. The second is load-bearing rather
 * than incidental — a comment's content is the only child-read surface a fixture
 * can PUT the marker into (an attachment row carries a filename, not text), so
 * without it the `getTicketComments` row would be a `carries: false` row that
 * constrains nothing while looking like coverage. Absence assertions are the weakest kind — a
 * reader that returned NOTHING satisfies all of them — so the file asserts the
 * marker's PRESENCE through the same call, in the same run, before the delete.
 * `carries: true` rows are exactly that promise, and a row that lied about it
 * would redden in the positive pass rather than passing quietly in the negative
 * one.
 */

/**
 * The marker. ⚠ **CORRECTED 2026-09-21 — this read "planted in the child's title
 * and in nothing else", and it is now in TWO places**, both on the ticket the
 * delete removes: the child's title, and the body of one `comment.added` on that
 * child (see the fixture's own note). The docblock above was corrected first and
 * this copy was missed — a correction that fixes one of two copies is the shape
 * this repo has recorded before, which is why the fixture now says where its
 * marker lives in one place and this constant points at it.
 */
const MARKER = 'SOLARIS';

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let me: { userId: string; headers: { authorization: string } };
let workspaceId: string;
let projectId: string;
/** The ticket that is deleted. Its title carries {@link MARKER}. */
let childId: string;
/** The child's parent, which survives — the carrier for the ROLLUP assertion. */
let parentId: string;
/**
 * Two more tickets, EXPLICITLY shared with the viewer by name.
 *
 * ⚠ **These exist because a mutation SURVIVED without them.** `getMyWork` reads
 * through TWO statements with the delete predicate in each — `routes/my-work.ts`
 * `:141` (the assigned half) and `:252` (`sharedWithMeRows`). The first version
 * of this fixture assigned every ticket and never shared one, so un-filtering
 * `:252` to `'TRUE'` left this whole suite GREEN: the `shared` bucket was never
 * populated by anything, so there was nothing for the missing predicate to
 * fail to exclude. A survivor with no explanation is either an unconstrained
 * path or a mutation that never ran, and this one was the first.
 */
let sharedLiveId: string;
let sharedDeadId: string;
/**
 * A SECOND parent, with one child that survives and one that is deleted.
 *
 * ⚠ **This exists because a mutation SURVIVED without it.**
 * `projections/rollups.ts:221`'s recompute and `:320`'s stale-row DELETE are
 * MUTUALLY MASKING on the single-child parent above: un-filter the recompute and
 * it writes a row for the tombstoned child, and the DELETE then removes that row
 * anyway because the parent has no live children at all — so the observable is
 * identical and the mutation is invisible.
 *
 * The reachable shape is a parent that KEEPS a row: one live child plus one
 * deleted one. There the recompute's predicate is the only thing standing
 * between `total_children: 1` and `total_children: 2` — the "5 of 8" this whole
 * family of counts exists to keep honest.
 */
let parent2Id: string;
let live2Id: string;
let dead2Id: string;
/**
 * Two NOTES attached to {@link childId} — one live, one soft-deleted.
 *
 * ⚠ **These exist because the notes series' four `carries: true` rows would
 * otherwise be vacuous.** `NoteSummary.attachedTickets` carries the attached
 * ticket's title, which is where {@link MARKER} reaches the note reads; without
 * a note attached to the child, four rows would claim coverage and constrain
 * nothing. The DELETED one is what makes `getDeletedNotes` a carrier as well:
 * that read lists only deleted notes, so a live note cannot reach it.
 */
let noteId: string;
let deletedNoteId: string;

/** Every ticket this file deletes. The count assertions are derived from it. */
const TOMBSTONES: string[] = [];

/** Baselines captured BEFORE any delete, so no case depends on run order. */
let baselineProjectTicketCount: number;
let baselineRowCount: number;
let baselineParentRollup: number | null;
/** Rows in `proj_rollups` for the parent — the PROJECTION half of the same fact. */
let baselineRollupRow: number;

/** Exactly the three members `online/http.ts`'s `send` reads, and no more. */
function injectFetch(headers: { authorization: string }): FetchLike {
  return (async (input: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET') as 'GET' | 'POST' | 'PUT';
    const rawBody = init?.body;
    const res =
      typeof rawBody === 'string'
        ? await app.inject({
            method,
            url: input,
            headers: { ...headers, 'content-type': 'application/json' },
            payload: rawBody,
          })
        : await app.inject({ method, url: input, headers });
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      json: async () => res.json() as unknown,
    } as Response;
  }) as FetchLike;
}

/** One event through the product's own door, asserting it COMMITTED. */
async function post(
  event: Omit<SubmittedEvent, 'id' | 'version' | 'origin' | 'clientTime' | 'actorId'>,
): Promise<void> {
  const submitted: SubmittedEvent = {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime: new Date().toISOString(),
    actorId: me.userId,
    ...event,
  };
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: me.headers,
    payload: { events: [submitted] },
  });
  const body = res.json() as { results?: Array<Record<string, unknown>> };
  expect(res.statusCode, JSON.stringify(body)).toBe(200);
  expect(body.results?.[0]?.['status'], JSON.stringify(body)).toBe('committed');
}

const query = (): DataSourceQuery =>
  createOnlineDataSource({ baseUrl: '', fetchImpl: injectFetch(me.headers) }).query;

/** The founded project's countable work, as the workspaces directory reports it. */
async function directoryTicketCount(): Promise<number> {
  const workspaces = await query().getMyWorkspaces();
  const workspace = workspaces.find((w) => w.id === workspaceId);
  const project = workspace?.projects.find((p) => p.id === projectId);
  expect(project, 'the founded project must appear on the directory').toBeDefined();
  expect(project?.ticketCount, 'an owner is never withheld this count').not.toBeNull();
  return project?.ticketCount as number;
}

/**
 * The parent's child progress, read from the LIST.
 *
 * ⚠ **Not from the board, and that is the owner's ruling rather than a
 * preference.** Cycle 25 ruled that an EPIC is excluded as a ROW from Board,
 * Calendar, Timeline and Backlog — *"only in the list view"* — and the only
 * valid parent of a `task` under the engine's `hierarchy.rank` rule is a bigger
 * kind of work, which in this workspace's seeded types is the epic. So the
 * parent's rollup is reachable on exactly one client surface, and this reads
 * that one. (`ListRow.rollup` — `view-types.ts:306`.)
 */
async function parentRollup(): Promise<number | null> {
  const list = (await query().getTickets(projectId, {}, 'status')) as unknown;
  const row = findCard(list, parentId);
  expect(row, 'the parent epic must be a row in the list').not.toBeNull();
  // `?? null` is the MEASURED answer, not a fallback: `read/ticket-cards.ts:126`
  // defines `rollup: null` as *"a real fact: no children at all"*, so a parent
  // whose every child is gone answers `null` rather than `{totalChildren: 0}`.
  return row?.rollup?.totalChildren ?? null;
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();

  const user = await signInWithPhone(app, otp, '+919000900011');
  me = { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };

  const founded = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: me.headers,
    payload: { name: 'Client surface' },
  });
  expect(founded.statusCode).toBe(201);
  workspaceId = (founded.json() as { workspaceId: string }).workspaceId;

  projectId = newUlid();
  await post({
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload: { name: 'Client surface project' },
  });
  await post({
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId: me.userId, projectAdmin: true },
  });

  // The PARENT exists so the child has a rollup to leave: `visibility/rollup.ts`'s
  // predicate is reached through a parent's child count, and a parentless child
  // would leave that site unconstrained however many surfaces were walked.
  parentId = newUlid();
  await post({
    workspaceId,
    entity: { kind: 'ticket', id: parentId },
    type: 'ticket.created',
    payload: { typeId: 'epic', projectId, parentId: null, title: 'Surface parent' },
  });

  childId = newUlid();
  await post({
    workspaceId,
    entity: { kind: 'ticket', id: childId },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId, parentId, title: `Surface ${MARKER} child` },
  });
  // Assigned and due-soon, so the child QUALIFIES for My Work's assignee
  // conjunct and the attention strip's due-soon bucket. Without both, absence
  // from those two surfaces would be a fact about the fixture and not about the
  // delete — the failure the positive pass below exists to forbid.
  await post({
    workspaceId,
    entity: { kind: 'ticket', id: childId },
    type: 'ticket.assigned',
    payload: { assigneeId: me.userId },
  });
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await post({
    workspaceId,
    entity: { kind: 'ticket', id: childId },
    type: 'ticket.field_set',
    payload: { fieldId: 'dueDate', value: { date: tomorrow } },
  });
  // A typed link from the PARENT to the child (typed-links T4), so the parent's
  // Links read carries the child's title as its other end: without it,
  // `getTicketLinks` would be a non-carrier and its row vacuous.
  await post({
    workspaceId,
    entity: { kind: 'ticket', id: parentId },
    type: 'ticket.link_added',
    payload: { kind: 'relates', targetId: childId },
  });

  // THE SECOND PARENT PAIR — see `parent2Id`. A parent that keeps a row.
  parent2Id = newUlid();
  await post({
    workspaceId,
    entity: { kind: 'ticket', id: parent2Id },
    type: 'ticket.created',
    payload: { typeId: 'epic', projectId, parentId: null, title: 'Surface parent two' },
  });
  live2Id = newUlid();
  dead2Id = newUlid();
  for (const [id, title] of [
    [live2Id, 'Surface two live'],
    [dead2Id, 'Surface two dead'],
  ] as const) {
    await post({
      workspaceId,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: parent2Id, title },
    });
  }

  // THE `shared` HALF OF MY WORK. Roots, so they never touch the parent's
  // rollup; explicit by NAME, so they land in `sharedWithMeRows` and nowhere
  // else. SHARED_LIVE is the control that proves the bucket is reachable at all.
  sharedLiveId = newUlid();
  sharedDeadId = newUlid();
  for (const [id, title] of [
    [sharedLiveId, 'Surface shared live'],
    [sharedDeadId, `Surface shared ${MARKER}`],
  ] as const) {
    await post({
      workspaceId,
      entity: { kind: 'ticket', id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title },
    });
    await post({
      workspaceId,
      entity: { kind: 'ticket', id },
      type: 'visibility.set',
      payload: { ticketId: id, mode: 'explicit', userIds: [me.userId] },
    });
  }

  // ⚠ A COMMENT CARRYING THE MARKER, on the ticket that will be deleted, and it
  // is here because WITHOUT it this file's `getTicketComments` row would be a
  // `carries: false` row — vacuous in both passes, exactly like the attachments
  // row beside it, and it would look like coverage while constraining nothing.
  // A comment BODY is the one child-read surface whose content the fixture can
  // choose, so the marker reaches it and the after-delete pass is a real
  // assertion rather than an empty one.
  await post({
    workspaceId,
    entity: { kind: 'ticket', id: childId },
    type: 'comment.added',
    payload: {
      body: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: `Boundary note ${MARKER}` }] }],
      },
    },
  });

  // ⚠ TWO NOTES, and they are here for the same reason the comment above is:
  // WITHOUT them the four note rows in `DECIDED` would be `carries: true` rows
  // that construe nothing. `NoteSummary.attachedTickets` carries each attached
  // ticket's key AND title, so a note attached to the child carries the marker —
  // and the deleted note is what makes `getDeletedNotes` a carrier too, since a
  // read that lists only deleted notes cannot carry anything from a note that is
  // still live.
  noteId = newUlid();
  await post({
    workspaceId,
    entity: { kind: 'note', id: noteId },
    type: 'note.created',
    payload: {
      title: 'Boundary note live',
      homeProjectId: projectId,
      scope: { mode: 'workspace' },
      attachTicketId: childId,
    },
  });
  deletedNoteId = newUlid();
  await post({
    workspaceId,
    entity: { kind: 'note', id: deletedNoteId },
    type: 'note.created',
    payload: {
      title: 'Boundary note deleted',
      homeProjectId: projectId,
      scope: { mode: 'workspace' },
      attachTicketId: childId,
    },
  });
  await post({ workspaceId, entity: { kind: 'note', id: deletedNoteId }, type: 'note.deleted', payload: {} });

  // ⚠ A COMMENT ON THE CHILD THAT LINKS THE LIVE NOTE, carrying the marker (Knowledge Graph B, 27.142):
  // without it the `getLinkedFrom` row below would be a `carries: true` row that construes nothing.
  await post({
    workspaceId,
    entity: { kind: 'ticket', id: childId },
    type: 'comment.added',
    payload: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: `Linked ${MARKER} ` }, { type: 'wikiLink', attrs: { noteId, title: 'Boundary note live' } }] }] } },
  });

  TOMBSTONES.push(childId, sharedDeadId, dead2Id);
  baselineProjectTicketCount = await directoryTicketCount();
  baselineParentRollup = await parentRollup();
  baselineRollupRow = await rollupRowCount();
  const { rows } = await db.pool.query<{ n: string }>(
    'SELECT count(*) AS n FROM proj_tickets WHERE project_id = $1 AND deleted_at IS NULL',
    [projectId],
  );
  baselineRowCount = Number(rows[0]?.n);
}, 120_000);

afterAll(async () => {
  await db.drop();
});

/**
 * THE MEMBERS OF `DataSourceQuery`, spelled once (the count is pinned below, with its history).
 *
 * This union is not documentation — it is the tripwire's other half. See the
 * file docblock: `absenceTripwire` cannot return a `keyof DataSourceQuery` that
 * falls outside it.
 */
type AbsenceDecision =
  | 'getMyWorkspaces'
  | 'getMembers'
  | 'getActorNames'
  // Prefixes and groups Task 6/7 (22.123): the workspace's group tree, one flat row per group.
  | 'getGroups'
  | 'getBoard'
  | 'getTickets'
  | 'getTicket'
  | 'getTicketHistory'
  | 'getTicketAttachments'
  | 'getTicketComments'
  | 'getWorkflowDef'
  | 'getTicketTypes'
  | 'search'
  | 'getMyWork'
  | 'getAttention'
  | 'getWorkspaceSettings'
  | 'getPreferences'
  | 'putPreferences'
  // The notes series, Plan 1 of 6. The four SUMMARY reads are carriers and the
  // three single-document reads are not — see their rows in `DECIDED` for why,
  // which is the decision this tripwire exists to force.
  | 'getNotes'
  | 'getDeletedNotes'
  | 'getNote'
  | 'getNotesForTicket'
  // Typed links T4. A carrier: the parent's Links read names the child as its
  // other end, so a deleted child must drop out of it.
  | 'getTicketLinks'
  | 'getNoteComments'
  | 'getNoteHistory'
  | 'getNoteVersion'
  // The notes series, Plan 3 of 6 (search). A carrier: a deleted note must not
  // come back through search, in EITHER mode, and 18.148 is the case that
  // holds the queries to it — so this row is `carries: true` and the verdict
  // is the one that matters here.
  | 'searchNotes'
  // The trash series, Plan 1. `getDeletedItems` is the ONE read whose entire
  // job is to name what was deleted — see its own row below for why its
  // verdict is the exception to every other row's `'excluded'`.
  | 'getDeletedItems'
  | 'purgedAmong'
  // Knowledge Graph B (27.142). A carrier: a comment on the child links the live
  // note and its snippet quotes the marker.
  | 'getLinkedFrom';

/**
 * The compile-time tripwire. Widening `keyof DataSourceQuery` past
 * `AbsenceDecision` fails `tsc` HERE with TS2322 — not a red test, a build —
 * which is the same kill `paginationTripwire` documents at
 * `packages/app-core/test/views/list-model.test.ts:68`.
 */
function absenceTripwire(key: keyof DataSourceQuery): AbsenceDecision {
  return key;
}

type Decision = {
  /** What a deleted ticket's content may do on this surface. */
  verdict: 'excluded' | 'retained';
  /**
   * Whether this surface carries TICKET CONTENT at all. `false` is a claim that
   * the marker could not reach it even before the delete — and the positive
   * pass holds every `true` row to it.
   */
  carries: boolean;
  /** Present where the verdict is not the obvious one. */
  why?: string;
};

/**
 * THE DECISION TABLE — total by TYPE, not by inspection.
 *
 * `Record<AbsenceDecision, Decision>` makes a missing row a compile error and a
 * stray row a compile error, so this cannot silently fall behind the union
 * above.
 */
const DECIDED: Record<AbsenceDecision, Decision> = {
  getMyWorkspaces: {
    verdict: 'excluded',
    // The marker is a ticket TITLE; the directory carries counts, not titles.
    // The count half is asserted by its own case below, which is what actually
    // constrains `read/workspace-counts.ts`.
    carries: false,
  },
  getMembers: { verdict: 'excluded', carries: false },
  // A names-only read: `{userId, displayName}` per workspace member, from
  // `proj_memberships` joined to `user`. It never touches `proj_tickets`, so the
  // marker (a ticket TITLE) cannot reach it even before the delete.
  getActorNames: { verdict: 'excluded', carries: false },
  // A group row is `{id, parentId, level, name, rank, projectCount, childCount}` (`routes/groups.ts`,
  // `mapGroupRows`): a group's NAME and two counts, from `proj_groups` and a `count(*)` over
  // `proj_projects` / `proj_groups`. It never reads `proj_tickets`, so the marker (a ticket TITLE)
  // cannot reach it even before the delete.
  getGroups: { verdict: 'excluded', carries: false },
  getBoard: { verdict: 'excluded', carries: true },
  getTickets: { verdict: 'excluded', carries: true },
  getTicket: {
    verdict: 'excluded',
    carries: true,
    why: 'Guarded at the ROUTE by a DIFFERENT mechanism — `routes/tickets.ts:366` reads the domain state and 404s on `deleted`, NOT by `LIVE_TICKET_WHERE`. Constrained here; not by the constant.',
  },
  getTicketHistory: {
    verdict: 'retained',
    carries: true,
    why: 'DELIBERATE, and the FAQ says so: *"Its history is retained, because other events cite it."* `read/visible-where.ts:137-139` states the same — a deleted ticket is still VISIBLE in the `canSee` sense. Asserting absence here would be asserting a lie.',
  },
  getTicketAttachments: {
    verdict: 'excluded',
    // The marker cannot reach this surface — it does not carry the ticket's
    // TITLE, so this row is vacuous in both passes and constrains nothing. Said
    // plainly rather than dressed up as coverage.
    //
    // ⚠ **CORRECTED 2026-09-21, and the correction is another lane's merge.**
    // This row used to read *"The surface has a REAL leak — a deleted ticket's
    // FILES are still served — which this invariant cannot see"*, with a named
    // owner and a pointer to Arm 2's enumeration. **That leak is CLOSED:**
    // executor 1's `#610` (`ea56020a`) put the third guard at all three
    // attachment doors (`routes/tickets.ts:671`, `routes/attachments.ts:388`
    // and `:545`, each through `read/live-ticket.ts`'s `ticketIsLive`), and
    // `test/integration/soft-deleted-attachments.test.ts` is its witness. The
    // row is corrected rather than left standing because a "REAL leak" sentence
    // outliving its fix is the failure this repo names most often — **a stale
    // known gap is pre-authorised work that no longer needs doing** — and the
    // fix landed in the same fold that brought this file into conflict.
    carries: false,
  },
  getTicketComments: {
    verdict: 'excluded',
    // ✅ THE ONE CHILD-READ SURFACE WHOSE MARKER IS REAL, and the difference
    // from the attachments row directly above is the whole reason this row is
    // written this way. A comment BODY is authored text, so the fixture can put
    // the marker in one — where an attachment's row carries only a filename.
    // And the read REFUSES a deleted ticket rather than filtering it, so after
    // the delete the call THROWS (`refused` below) and the marker is absent for
    // a reason this walk can observe.
    carries: true,
    why: 'Guarded at the ROUTE by the shared third guard — `read/live-ticket.ts`’s `ticketIsLive`, which is `LIVE_TICKET_WHERE` asked at a route, applied at `routes/tickets.ts` after the two visibility guards. NOT a predicate inside the read’s SELECT: the constant FILTERS ROWS, and a route must REFUSE — a deleted ticket owes the same 404 an invisible one gets, and an empty thread would be a claim about the ticket instead. Removing the guard makes the deleted ticket’s thread answer 200 with the marker in it, which reddens this case — re-measured 2026-09-21 after the fold replaced the hand-rolled flag read with `ticketIsLive`: with `if (!(await ticketIsLive(...)))` rewritten to `if (false)`, this file fails on `getTicketComments must not serve a deleted ticket`.',
  },
  getWorkflowDef: { verdict: 'excluded', carries: false },
  getTicketTypes: { verdict: 'excluded', carries: false },
  search: { verdict: 'excluded', carries: true },
  searchNotes: {
    verdict: 'excluded',
    // `false`, and the reason is a property of the ANSWER rather than a gap in
    // the read. A note's search hit shows the NOTE's own fields — its raw title,
    // a snippet cut from its body, and the KEYS (not the titles) of its attached
    // tickets — so the deleted ticket's title reaches this surface only as a
    // MATCH, through `proj_note_search.ticket_text`, and never as text a caller
    // reads. `carries: true` would be the claim that the marker appears in the
    // answer, which it does not: `attachedTicketKeys` holds `CCSO-7`, a key
    // composed from a project's prefix, and the fixture's ticket title is
    // nowhere in the row.
    //
    // The delete still reaches it, which is what `excluded` says and what the
    // after-pass measures: `ticket.deleted` re-derives the note's row, the line
    // for that ticket leaves `ticket_text`, and a query on the deleted ticket's
    // OWN WORD stops finding the note. That is the exclusion — a filter on the
    // match rather than a removal from the text.
    //
    // (`n.deleted = FALSE` is the other half and it is 18.148's: a note that is
    // itself deleted is in neither mode, in the meaning one especially, where
    // the chunk rows outlive the note until the worker catches up.)
    carries: false,
    why: 'a note hit shows the note’s own text and its tickets’ KEYS; the deleted ticket’s title reaches it as a match, not as content',
  },
  getDeletedItems: {
    verdict: 'retained',
    // `false`, and it is a claim about the BEFORE half specifically, not
    // about whether ticket content ever reaches this surface — it does (see
    // `why`). `carries` gates the positive control's pre-delete pass, and
    // this read is EMPTY of the fixture's own tombstones until the AFTER
    // block's `beforeAll` deletes them — a live, undeleted marker cannot
    // appear in a list whose entire membership is "already deleted", so
    // there is no "before" reading to carry the marker in the first place.
    // `verdict: 'retained'` is still checked, unconditionally, in the AFTER
    // pass below — the marker's title DOES surface there, once it is real.
    carries: false,
    why: 'the ONE surface whose entire job is naming what was deleted (`packages/domain/src/read-models.ts`’s `DeletedItem.label`, documented as "ticket `KEY title`, note title" for those two kinds) — a deleted ticket’s title is not a leak here, it is the answer a person needs to recognise what they are about to restore. Every other `excluded` row exists because a delete must not echo through a read that was never about the deleted thing; this read is about nothing else, which is why its verdict is this table’s one exception.',
  },
  purgedAmong: {
    verdict: 'excluded',
    carries: false,
    why: 'trash Plan 3: answers kinds and ids from purged_entities and nothing else — no title, key or body can travel through it, and a soft delete is not a purge',
  },
  getMyWork: { verdict: 'excluded', carries: true },
  getAttention: { verdict: 'excluded', carries: true },
  getWorkspaceSettings: { verdict: 'excluded', carries: false },
  getPreferences: { verdict: 'excluded', carries: false },
  putPreferences: {
    verdict: 'excluded',
    carries: false,
    why: 'A WRITE, declared rather than skipped so the table stays total over the union. It is called with the document `getPreferences` just returned, so it cannot fail on a shape this file invented.',
  },
  /**
   * THE NOTES SERIES' FOUR CARRIERS, and they are carriers for a reason worth
   * reading before anyone "simplifies" them to `false`.
   *
   * `NoteSummary.attachedTickets` carries each attached ticket's `key` AND
   * `title`, so a note attached to a ticket carries that ticket's title — the
   * marker — on every summary-returning read. All four are `excluded`, and the
   * guard is ONE line rather than four: `attachedTicketsByNote`
   * (`read/notes.ts`) joins `proj_tickets` with `LIVE_TICKET_WHERE`, so a
   * tombstoned ticket's title is dropped from the attachment list while the note
   * itself stays readable. Delete that constant from the join and the marker
   * reappears here — which is precisely the leak this arm exists to catch, and
   * the reason these rows are not vacuous.
   *
   * The fixture PLANTS the marker's route into them: two notes attached to the
   * child, one live and one deleted, so `getNotes`/`getNote`/`getNotesForTicket`
   * carry it through the live one and `getDeletedNotes` through the deleted one.
   * Without that seeding, all four rows would be `carries: true` rows that
   * construe nothing — the shape this file's own docblock names as worse than no
   * row at all.
   */
  getNotes: {
    verdict: 'excluded',
    carries: true,
    why: 'Guarded by `LIVE_TICKET_WHERE` inside `read/notes.ts`’s `attachedTicketsByNote` — the attachment join FILTERS the tombstoned ticket out of `attachedTickets`, so the note is still listed and the deleted ticket’s title is not in it. NOT a route guard: this read has nothing to 404 over, because the note it returns is not the deleted thing.',
  },
  getDeletedNotes: {
    verdict: 'excluded',
    carries: true,
    why: 'The same `attachedTicketsByNote` guard, reached through the `?deleted=1` branch. It is its own member rather than a flag on `getNotes` because the two are gated differently (only the author, an admin or the owner may look at deleted notes, spec §4.1) — and it is a carrier for the same reason `getNotes` is, which the fixture proves by deleting one of its two seeded notes.',
  },
  getNote: {
    verdict: 'excluded',
    carries: true,
    why: 'The same `attachedTicketsByNote` guard. It returns `null` rather than throwing for an unreadable or absent note, so it always ANSWERS — the `getTicket` shape, not the `getTicketAttachments` one — and a `REFUSED` from it would be a client change rather than a server one.',
  },
  getNotesForTicket: {
    verdict: 'excluded',
    carries: true,
    why: 'The same `attachedTicketsByNote` guard. Worth naming what it does NOT do: it does not refuse a tombstoned ticket, and does not need to — it lists NOTES attached to that ticket, and what it must not do is hand back the deleted ticket’s own key and title, which the attachment filter is what prevents.',
  },
  /**
   * The three NON-carriers, declared rather than skipped so the table stays
   * total. Each is a note surface whose every field is the NOTE's own — a
   * comment body, a version pointer, a document — so the deleted ticket's title
   * cannot reach it at all, in either pass. Vacuous in both directions, and said
   * plainly rather than dressed up: the same honesty `getTicketAttachments`'
   * row uses.
   */
  getTicketLinks: {
    verdict: 'excluded',
    carries: true,
    why: 'Read on the PARENT, whose link names the child: `read/ticket-links.ts` joins the OTHER end through `LIVE_TICKET_WHERE`, so a trashed end drops the row (27.051) while the link itself stays stored.',
  },
  getNoteComments: { verdict: 'excluded', carries: false },
  getNoteHistory: { verdict: 'excluded', carries: false },
  getNoteVersion: { verdict: 'excluded', carries: false },
  getLinkedFrom: {
    verdict: 'excluded',
    carries: true,
    why: 'Knowledge Graph B: the live note is linked from a comment on the child, and the snippet quotes the marker. The read hides a source whose parent ticket is tombstoned (`LIVE_TICKET_WHERE` in `read/linked-from.ts`’s ticket arm), so after the delete the row, its snippet and its count are gone.',
  },
};

/**
 * One call per member, keyed by the same union. A member with no caller is a
 * compile error, which is what stops a new method from being "visited" by
 * nothing.
 *
 * `putPreferences` needs a value, so it round-trips `getPreferences`'s own
 * answer rather than a hand-built document.
 */
function callers(ds: DataSourceQuery): Record<AbsenceDecision, () => Promise<unknown>> {
  return {
    getMyWorkspaces: () => ds.getMyWorkspaces(),
    getMembers: () => ds.getMembers(workspaceId),
    getActorNames: () => ds.getActorNames(workspaceId),
    getGroups: () => ds.getGroups(workspaceId),
    getBoard: () => ds.getBoard(projectId),
    getTickets: () => ds.getTickets(projectId, {}, 'status'),
    getTicket: () => ds.getTicket(workspaceId, childId),
    getTicketHistory: () => ds.getTicketHistory(childId),
    getTicketAttachments: () => ds.getTicketAttachments(workspaceId, childId),
    // The ONLY caller here that can THROW, and the catch is the measurement
    // rather than a convenience: this read refuses a deleted ticket by
    // rejecting with a 404, so "the marker is absent" and "the call refused"
    // are the same reading for it. Coerced to a string so the walk compares
    // like with like — and `'refused'` can never contain the marker, so the
    // after-delete assertion is a real one.
    getTicketComments: async () => {
      try {
        return await ds.getTicketComments(workspaceId, childId);
      } catch {
        return 'refused';
      }
    },
    getWorkflowDef: async () => {
      // The workflow id is the one the FOUNDING sequence minted; this file never
      // types one. It is read off the type definitions, which carry it, rather
      // than invented — an invented id would answer `null` and make an absence
      // assertion pass for the wrong reason.
      const defs = await ds.getTicketTypes(workspaceId);
      const workflowId = defs[0]?.workflowId;
      if (workflowId === undefined) {
        throw new Error('no ticket type on this workspace carries a workflowId');
      }
      return ds.getWorkflowDef(workspaceId, workflowId);
    },
    getTicketTypes: () => ds.getTicketTypes(workspaceId),
    search: () => ds.search(workspaceId, MARKER),
    getMyWork: () => ds.getMyWork(workspaceId),
    getAttention: () => ds.getAttention(workspaceId),
    getWorkspaceSettings: () => ds.getWorkspaceSettings(workspaceId),
    getPreferences: () => ds.getPreferences(workspaceId),
    putPreferences: async () => ds.putPreferences(workspaceId, await ds.getPreferences(workspaceId)),
    // The seven note reads. `noteId` is the LIVE note the fixture attached to
    // the child; `getNoteVersion` is handed a fresh ULID DELIBERATELY — it is a
    // `carries: false` row, so a version that does not exist exercises the same
    // thing a real one would, and reaching for a real event id would make the
    // call a second read of `getNoteHistory` rather than a visit to its own door.
    getNotes: () => ds.getNotes(workspaceId),
    getDeletedNotes: () => ds.getDeletedNotes(workspaceId),
    getNote: () => ds.getNote(workspaceId, noteId),
    getNotesForTicket: () => ds.getNotesForTicket(workspaceId, childId),
    getTicketLinks: () => ds.getTicketLinks(workspaceId, parentId),
    getNoteComments: () => ds.getNoteComments(workspaceId, noteId),
    getNoteHistory: () => ds.getNoteHistory(workspaceId, noteId),
    getNoteVersion: () => ds.getNoteVersion(workspaceId, noteId, newUlid()),
    // The notes search reads, both modes. `MARKER` is this file's text term, so
    // the call visits the same door every other `carries: true` row walks.
    searchNotes: () => ds.searchNotes(workspaceId, MARKER, { mode: 'lexical' }),
    // Takes no workspace id — `getDeletedItems` is scoped to the caller's own
    // membership, not one workspace.
    getDeletedItems: () => ds.getDeletedItems(),
    purgedAmong: () => ds.purgedAmong([childId]),
    getLinkedFrom: () => ds.getLinkedFrom(workspaceId, { kind: 'note', id: noteId }),
  };
}

/** Every member's answer, flattened to one string, in union order. */
async function walkAll(): Promise<Map<AbsenceDecision, string>> {
  const call = callers(query());
  const answers = new Map<AbsenceDecision, string>();
  // Sequential, deliberately: this runs against ONE Postgres, and a parallel
  // gather would make a failure's neighbours ambiguous for no gain.
  //
  // ⚠ ADDED 2026-09-20, and it is a CONSEQUENCE of a server change rather than a
  // tightening here. Until then every read on the tombstone RESOLVED — `getTicket`
  // folds a 404 to `null`, `getTicketHistory` to `[]` — so this walk could assume
  // an answer. Then the attachments LIST door learned to refuse a tombstoned
  // ticket (`routes/tickets.ts`, the same third guard the detail route carries),
  // and `getTicketAttachments` is the one client method that RE-RAISES a 404 by
  // its own argued decision (`online-data-source.ts`: folding it into `[]` would
  // draw the same nothing for "this ticket has no files" and "we could not read
  // them"). The throw killed this `beforeAll`, and the four cases below it
  // reported as SKIPPED — a green-looking suite that says nothing, which is the
  // failure this file's own docblock warns about.
  //
  // A refusal is not a leak: it is the strongest form of absence, so it is
  // RECORDED as its own reading rather than crashing the hook. The tolerance is
  // deliberately NARROW — only an `HttpError` whose status is 404; anything else
  // still propagates, so a broken read cannot hide behind this — and it is
  // PINNED, not open: the invariant test below asserts the exact set of members
  // that may refuse, so a surface that starts refusing without that list moving
  // reddens there rather than passing quietly.
  for (const key of Object.keys(call) as AbsenceDecision[]) {
    // `?? 'undefined'` because `putPreferences` answers `void`: `JSON.stringify`
    // returns the VALUE `undefined` for it, not the string, and an assertion
    // against `undefined` is a type error rather than a red. Coerced here so
    // every row is a string and absence is a real reading rather than a crash.
    try {
      answers.set(key, JSON.stringify(await call[key]()) ?? 'undefined');
    } catch (err) {
      if (!(err instanceof HttpError) || err.status !== 404) throw err;
      answers.set(key, `${REFUSED_PREFIX}404`);
    }
  }
  return answers;
}

/** The reading a refused read leaves, so a refusal is never mistaken for an answer. */
const REFUSED_PREFIX = 'REFUSED ';

/**
 * The ONLY members allowed to answer `REFUSED`, and the set is asserted rather
 * than assumed — see `walkAll`'s note. `getTicket` is deliberately NOT here even
 * though its door refuses a tombstone too: its client method folds that 404 to
 * `null`, so it still answers, and a `REFUSED` from it would be a change in the
 * client rather than the server.
 */
const MAY_REFUSE: AbsenceDecision[] = ['getTicketAttachments'];

const MEMBERS = Object.keys(DECIDED) as AbsenceDecision[];
const CARRIERS = MEMBERS.filter((key) => DECIDED[key].carries);

it('TYPE TRIPWIRE: every member of DataSourceQuery is enumerated, or tsc refuses', () => {
  // The calls are what make the guard live in the test file rather than only in
  // the type. If `DataSourceQuery` grew a member this union lacks, the return of
  // `absenceTripwire` would stop being assignable to `AbsenceDecision` and the
  // three `Record`s below would stop being total.
  expect(absenceTripwire('getBoard')).toBe('getBoard');
  expect(absenceTripwire('getTicketHistory')).toBe('getTicketHistory');
  // 16 until the notes series (Plan 1 of 6) added its seven reads; 23 until
  // Plan 3 of 6 added `searchNotes`; 24 until the trash series (Plan 1) added
  // `getDeletedItems`; 25 until trash Plan 3 added `purgedAmong`; 26 until
  // `fix/names-nav-focus` added `getActorNames`; 27 until prefixes and groups
  // Task 7 (22.123) added `getGroups`; 28 until typed links T4 added
  // `getTicketLinks`; 29 until Knowledge Graph B Task 3 added `getLinkedFrom`.
  expect(MEMBERS).toHaveLength(30);
  // A control on the control: a table where nothing carries would make the
  // positive pass below vacuous and the negative pass unfalsifiable.
  expect(CARRIERS.length).toBeGreaterThanOrEqual(7);
});

describe('BEFORE the delete — the positive control', () => {
  it('every carrier really carries the marker, so a later absence is a filter and not an empty world', async () => {
    const answers = await walkAll();
    for (const key of CARRIERS) {
      expect(answers.get(key), `${key} is declared a carrier`).toContain(MARKER);
    }
  });
});

describe('AFTER the delete — the invariant', () => {
  let answers: Map<AbsenceDecision, string>;

  beforeAll(async () => {
    // THE DELETE, through the product's own door, exactly once — for BOTH
    // tombstones this fixture plants.
    for (const id of TOMBSTONES) {
      await post({
        workspaceId,
        entity: { kind: 'ticket', id },
        type: 'ticket.deleted',
        payload: {},
      });
    }
    // The row is still THERE — the delete is a flag, not a removal — so the
    // negative pass below is a fact about the readers and not about a fixture
    // that lost its row.
    const { rows } = await db.pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM proj_tickets WHERE ticket_id = $1',
      [childId],
    );
    expect(Number(rows[0]?.n)).toBe(1);
    answers = await walkAll();
  }, 120_000);

  it('the marker is absent from every excluding surface, and still present on the retained one', () => {
    // WHICH members refused, asserted before the marker loop so the tolerance in
    // `walkAll` is a witnessed decision rather than an open catch: a surface
    // that starts refusing a tombstone without joining `MAY_REFUSE` reddens
    // here, and one that STOPS refusing reddens here too, because the equality
    // is two-directional.
    expect(
      MEMBERS.filter((key) => answers.get(key)?.startsWith(REFUSED_PREFIX) === true),
    ).toEqual(MAY_REFUSE);

    for (const key of MEMBERS) {
      const { verdict, why } = DECIDED[key];
      const detail = why === undefined ? '' : ` — ${why}`;
      if (verdict === 'excluded') {
        expect(answers.get(key), `${key} must not serve a deleted ticket${detail}`).not.toContain(MARKER);
      } else {
        // The retained row is asserted in the SAME loop rather than skipped, so
        // a table that flipped a real carrier to `retained` to dodge a red would
        // still have to keep the marker present — which it cannot once the
        // surface is genuinely fixed.
        expect(answers.get(key), `${key} is declared retained${detail}`).toContain(MARKER);
      }
    }
  });

  it('the workspaces directory’s per-project ticketCount drops by exactly the child', async () => {
    // The drop is derived from the list of tombstones actually planted, not
    // from a number in this comment: `TOMBSTONES.length` is 3 and both counts
    // must fall by exactly that. A magnitude written here would go stale the
    // next time the fixture grows — which it did, twice, in this task.
    expect(TOMBSTONES.length).toBe(3);
    expect(baselineRowCount).toBeGreaterThan(0);
    expect(await directoryTicketCount()).toBe(baselineProjectTicketCount - TOMBSTONES.length);
    const { rows } = await db.pool.query<{ n: string }>(
      'SELECT count(*) AS n FROM proj_tickets WHERE project_id = $1 AND deleted_at IS NULL',
      [projectId],
    );
    expect(Number(rows[0]?.n)).toBe(baselineRowCount - TOMBSTONES.length);
  });

  /**
   * THE `shared` BUCKET — `routes/my-work.ts:252`, and the case that exists
   * because a mutation SURVIVED without it.
   *
   * `getMyWork` reads through TWO statements, each carrying the delete
   * predicate: the assigned half and `sharedWithMeRows`. The marker walk above
   * constrains the assigned half through the child; it was structurally BLIND to
   * the shared half, because nothing in this fixture had ever been shared by
   * name. Un-filtering `:252` left every test green.
   *
   * Both ids are asserted in one run — the live one because a bucket that had
   * stopped being populated would otherwise satisfy the absence assertion by
   * being empty, and the tombstone because that is the property.
   */
  it('the EXPLICIT `shared` bucket serves the live ticket and not its deleted twin', async () => {
    const text = JSON.stringify(await query().getMyWork(workspaceId));
    expect(text, 'the shared bucket must be reachable — SHARED_LIVE is in it').toContain(sharedLiveId);
    expect(text, 'a deleted explicitly-shared ticket must leave the bucket').not.toContain(sharedDeadId);
  });

  it('a deleted child leaves its parent’s rollup — on the list row AND in proj_rollups', async () => {
    // MEASURED, both halves, in one run: the parent's rollup is
    // `{totalChildren: 1}` before and `null` after — not `{totalChildren: 0}`.
    // `read/ticket-cards.ts:126` is where that spelling comes from: *"`rollup:
    // null` → a real fact: no children at all"*, which is what a parent whose
    // only child is a tombstone now has.
    expect(baselineParentRollup).toBe(1);
    // A rollup that still counted the tombstone is the "5 of 8" this count
    // exists to keep honest reading about a ticket nobody can reach.
    expect(await parentRollup()).toBeNull();

    // THE PROJECTION HALF — sites 16 and 17 (`projections/rollups.ts:221`, the
    // recompute's `HAVING count(*) > 0`, and `:320`, the DELETE that removes a
    // parent whose children are all tombstoned). One row before, NONE after:
    // `rollups.ts`'s own docblock says a childless parent is ABSENT from
    // `proj_rollups`, never zeroed. Both mutations redden this line.
    expect(baselineRollupRow).toBe(1);
    expect(await rollupRowCount()).toBe(0);

    // THE REACHABLE SHAPE FOR THE RECOMPUTE — see `parent2Id`. A parent that
    // KEEPS its row because one child survives, so the stale-row DELETE cannot
    // mask the recompute's own predicate. 2 -> 1, and a recompute that counted
    // the tombstone reads 2.
    const two = await db.pool.query<{ total_children: number }>(
      'SELECT total_children FROM proj_rollups WHERE parent_ticket_id = $1',
      [parent2Id],
    );
    expect(two.rows).toHaveLength(1);
    expect(two.rows[0]?.total_children).toBe(1);

    // ...AND THE SAME FACT ON THE CLIENT SURFACE, so the two ends of one number
    // are asserted in one run rather than believed to agree.
    const list = (await query().getTickets(projectId, {}, 'status')) as unknown;
    const card = findCard(list, parent2Id);
    expect(card?.rollup?.totalChildren).toBe(1);
  });
});

/**
 * `proj_rollups` rows for the parent — the projection half of the same fact.
 *
 * ⚠ **This assertion exists because an independent reviewer found TWO SITES the
 * first enumeration missed**, both longhand predicates in
 * `projections/rollups.ts` (`:221` the recompute, `:320` the stale-row DELETE).
 * The sweep this work published searched for the CONSTANT, and "the constant" is
 * not "the rule" — *the universe is the bug*. Both were measured SURVIVORS
 * against 89 tests across 7 files before this existed.
 *
 * Arm 2 is the arm for paths a client query cannot reach, but this fixture is
 * the one that has a parent whose only child is deleted, and re-deriving Arm 2's
 * counts to move the pair there is exactly the kind of arithmetic that has
 * already been wrong twice in this task. So it is asserted HERE, and the case's
 * title says so.
 */
async function rollupRowCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>(
    'SELECT count(*) AS n FROM proj_rollups WHERE parent_ticket_id = $1',
    [parentId],
  );
  return Number(rows[0]?.n);
}

/** A shape-tolerant search for one card, so a board regrouping does not break this. */
function findCard(
  node: unknown,
  ticketId: string,
): { ticketId: string; rollup: { totalChildren: number } | null } | null {
  if (node === null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findCard(item, ticketId);
      if (hit !== null) return hit;
    }
    return null;
  }
  const record = node as Record<string, unknown>;
  if (record['ticketId'] === ticketId) {
    return record as { ticketId: string; rollup: { totalChildren: number } | null };
  }
  for (const value of Object.values(record)) {
    const hit = findCard(value, ticketId);
    if (hit !== null) return hit;
  }
  return null;
}
