import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import {
  visibleEventsFor,
  type ReachGrantedInstruction,
  type SyncItem,
} from '../../src/visibility/visible-events-for.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { GRANT_BACKFILL_MAX_TICKETS } from '../../src/visibility/grant-backfill.js';

/**
 * Closure 5's GRANT half — ruling P37, RESHAPED into a PULL by ruling P37.1 —
 * at the filter, where the decision is made.
 *
 * ## What these cases observe changed with the shape; the properties did not
 *
 * Under P37 a widening reaching a reader YIELDED the pre-cursor history of the
 * trigger ticket and of every inheriting descendant, then the trigger event
 * last. That burst is what wedged a slow consumer permanently (case 12.290).
 * Under P37.1 the same trigger yields ONE bounded `reach-granted` NOTICE — the
 * ticket ids and nothing else — BEFORE its trigger event, and the client pulls
 * whatever it lacks through `GET /v1/sync/bootstrap/ticket`.
 * `grant-backfill.ts`'s docblock carries the whole argument, including why a
 * notice is not case 6.101's purge walk arriving from the other direction.
 *
 * So every case below keeps its id and its property and changes only its
 * OBSERVATION: from "which history envelopes came back" to "which ids the
 * notice named". Several cases now assert an EXACT envelope list as well, and
 * that exactness is not tidiness — it is the thing that would catch the burst
 * coming back.
 *
 * The replica-facing half of this property lives on the dual-client rig
 * (`test/dual-client/grant-backfill.test.ts`, cases 12.275–12.276): that is
 * where "the two replicas converge" and "replay is idempotent" can be MEASURED
 * against a real replica rather than asserted about a generator. This file
 * carries what only the generator can answer — who is excluded, which tickets
 * the walk reaches, and which of the two guards holds which property.
 *
 * ## Every exclusion here carries a positive control in the same test, and the
 * ## control is the NOTICE, never a stringified dump
 *
 * The house rule of `visible-events-for.test.ts`, and it bites harder here: a
 * notice that names NOTHING passes every `not.toContain` in this file. So each
 * exclusion sits beside an inclusion drawn from the same `collect` call.
 *
 * And the inclusion is asserted against the notice's own `ticketIds`. The other
 * spelling — `JSON.stringify(delivered).toContain(ticketId)` — is VACUOUS here,
 * and 12.277 shipped it once: the trigger event travels beside the notice and
 * carries the ticket in `entity.id` AND in `payload.ticketId`, so the substring
 * is present whether or not a single id was ever named. Under the notice shape
 * that trap is WORSE than it was under the push shape, because the ids ARE the
 * payload now — a stringify check cannot tell a full notice from an empty one.
 * `not.toContain` on a dump is still useful as a SUBORDINATE check ("this id
 * appears in no field of no item"); it is never the positive half.
 *
 * ## The two mutable sites, and which case kills which
 *
 * `grant-backfill.ts` deliberately carries two independently-mutable sites, and
 * a guard no mutation can kill is unmeasured code a later reader trusts —
 * `stream/hub.ts` paid four masked `sub.ended` guards to learn that.
 *
 * - `GRANT_BACKFILL_TRIGGERS` → emptied: **all seven should redden**, 12.277
 *   included.
 *
 *   The figure this docblock carried — `5 failed | 1 passed`, with 12.277 as the
 *   informative survivor — was STALE when the reshape found it, and the way it
 *   went stale is worth more than the number. It was the measurement from before
 *   the review round; that round re-aimed 12.277's positive control from
 *   `JSON.stringify(forInsider).toContain(ticket)` at `preCursor.id` precisely
 *   because the stringify form could not fail, and the re-measurement was
 *   `6 failed (6)` — every case in the file. The catalogue
 *   (`test-cases/12-offline-sync-apps.md`, closure 5's mutation table) was
 *   updated and THIS HEADER WAS NOT, so the file's own docblock went on
 *   describing a survivor that had already stopped surviving.
 *
 *   Under the notice shape the survivor is gone for a second, independent
 *   reason: 12.277's control is now the insider's NOTICE, which only the trigger
 *   list can produce. With 12.291 that is seven cases, not six.
 *   *REASONED, not measured — the gate lock was held by another process when
 *   this rewrite was written, and an unmeasured expectation is exactly what the
 *   paragraph above is about. Re-run the mutation and replace this sentence with
 *   the number.*
 * - `grantNoticeFor`'s own `canSee` → mutated to permit, **12.280** reddens
 *   ALONE — `1 failed | 5 passed` under the push shape, and expected to be
 *   `1 failed | 6 passed` here for the same reason (also unmeasured). That case
 *   exists for exactly this reason: the guard is redundant for every ORDINARY
 *   descendant (an inheriting child copies the authoring ancestor's
 *   `resolved_mode` and `resolved_user_ids`, so `canSee` returns the same answer
 *   the caller already had) and is load-bearing only where the inherited mode is
 *   `'project'` and the child's OWN `project_id` differs from the ancestor's —
 *   because `canSeeResolved` asks `eff.projects.has(v.projectId)` against the
 *   CHILD's row. It is now also the ONLY thing standing between a subtree walk
 *   and a notice that names ids the reader may not see: the ids are the wire.
 *   Without 12.280 the guard would be unkillable and this file would have to
 *   drop it. It stays alone because no other case's fixture has a candidate the
 *   viewer cannot see — 12.277's viewer never reaches the notice block at all
 *   (the caller's `canSee` on the trigger is false), and in 12.278, 12.281,
 *   12.282 and 12.291 every candidate is visible to the viewer anyway.
 *
 * ## One mutation this file could kill under P37 and cannot under P37.1
 *
 * This docblock claimed that hoisting the backfill call out of
 * `visibleEventsFor`'s own `if (await canSee(...))` reddens 12.277, and under
 * the push shape the mechanism was there to believe: `grantBackfillFor` yielded
 * the TRIGGER EVENT itself last, so a hoisted call handed the narrowing to the
 * very viewer it narrowed away and the `not.toContain(ticket)` line caught it.
 * (The claim carried no measurement, unlike the two above it.)
 *
 * Under P37.1 it is false. Hoisting the notice block out of that guard reddens
 * NOTHING here: `grantNoticeFor` asks its OWN `canSee` about the trigger ticket
 * too, answers false for the narrowed-away viewer, returns an empty list, and
 * `ticketIds.length > 0` suppresses the yield — while the trigger envelope stays
 * behind under the caller's guard, where the ordinary filter's own cases
 * (`visible-events-for.test.ts`, 6.16) hold it. The defence in depth is
 * deliberate and correct; the consequence is that the caller's guard is no
 * longer measured from this file, and that is a lost kill rather than a tidier
 * design.
 *
 * What WOULD measure it is a fixture where the trigger ticket is invisible to
 * the reader while an inheriting descendant is visible — the cross-project shape
 * of 12.280 run in the opposite direction. It is not added, because it needs a
 * case id and §12's ids are controller-ALLOCATED rather than derived (12.290–
 * 12.308 in use on this branch; the next block is issued on request), and it is
 * not bolted onto
 * 12.280 because that case's whole value is reddening ALONE for the `canSee`
 * mutation. *Recorded rather than closed. Owner: unassigned.*
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('TRUNCATE proj_visibility');
  await db.pool.query('TRUNCATE proj_memberships');
  await db.pool.query('TRUNCATE proj_projects');
});

/** Ledger AND projections, the way ingest does — a real event, not a projection nudge. */
async function record(env: LedgerEvent): Promise<LedgerEvent> {
  await appendTestEvent(db.pool, env);
  await applyAll(db.pool, [env]);
  return env;
}

async function collect(userId: string, workspaceId: string, afterSeq = 0): Promise<SyncItem[]> {
  const items: SyncItem[] = [];
  for await (const item of visibleEventsFor(db.pool, userId, workspaceId, afterSeq)) {
    items.push(item);
  }
  return items;
}

function envelopeIds(items: readonly SyncItem[]): string[] {
  return items.filter((i): i is LedgerEvent => !('kind' in i)).map((i) => i.id);
}

/**
 * The whole drain rendered in order, instructions included — the spelling
 * `visible-events-for.test.ts` and `helpers/stream-socket.ts` already use.
 *
 * A notice renders as its IDS, never as a count: `reach-granted:3` would make
 * two notices naming different tickets compare equal, which is the one thing a
 * test of this module must never do.
 */
function idsOf(items: readonly SyncItem[]): string[] {
  return items.map((item) =>
    'kind' in item
      ? item.kind === 'purge'
        ? `purge:${item.entityId}`
        : item.kind === 'reach-granted'
          ? `reach-granted:${item.ticketIds.join(',')}`
          : `scope-revoked:${item.projectId ?? item.workspaceId}`
      : item.id,
  );
}

/** Every `reach-granted` notice in a drain, in the order it was yielded. */
function noticesOf(items: readonly SyncItem[]): ReachGrantedInstruction[] {
  return items.filter(
    (i): i is ReachGrantedInstruction => 'kind' in i && i.kind === 'reach-granted',
  );
}

/**
 * The single notice a drain carries.
 *
 * It ASSERTS the count as well as returning the notice, so a case that reads
 * `soleNotice(items).ticketIds` is also saying "and there was exactly one" — a
 * second notice for the same widening would be a per-drain ledger that stopped
 * working. 12.282 owns that property and states the count at the case site
 * rather than inheriting it from here.
 */
function soleNotice(items: readonly SyncItem[]): ReachGrantedInstruction {
  const found = noticesOf(items);
  expect(found).toHaveLength(1);
  const only = found[0];
  // UNREACHABLE, and kept: the `expect` above has already thrown by the time an
  // empty list could get here. It exists because `noUncheckedIndexedAccess`
  // types `found[0]` as possibly-undefined and this is the narrowing that does
  // not weaken the assertion. Deleting either line breaks the other.
  if (only === undefined) throw new Error('no reach-granted notice in this drain');
  return only;
}

function ticketEvent(
  workspaceId: string,
  type: string,
  ticketId: string,
  payload: unknown,
  actorId: string,
): LedgerEvent {
  return testEnvelope({ workspaceId, entity: { kind: 'ticket', id: ticketId }, type, payload, actorId });
}

/** The workspace stream head, which is what a client's cursor stands at when it is current. */
async function head(workspaceId: string): Promise<number> {
  const { rows } = await db.pool.query<{ max: string | null }>(
    'SELECT MAX(workspace_seq)::text AS max FROM events WHERE workspace_id = $1',
    [workspaceId],
  );
  return rows[0]?.max === null || rows[0]?.max === undefined ? 0 : Number(rows[0].max);
}

describe('grant notice — the copy nobody gives back (closure 5, rulings P37 and P37.1)', () => {
  it('12.277 a viewer OUTSIDE the new audience is named nothing — the narrowing is not a trigger for the person it narrowed away', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const insider = newUlid();
    const ticket = newUlid();
    const other = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, insider, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: other });
    // Pre-cursor history on the ticket, while the viewer could still see it. It
    // is no longer DELIVERED to anyone by this module — see the insider's
    // assertion below, which is where the reshape is visible.
    const preCursor = await record(ticketEvent(ws, 'comment.added', ticket, { body: 'while shared' }, insider));

    const cursor = await head(ws);
    // The narrowing: explicit to the insider alone. For the VIEWER this is a
    // loss, and a loss must never look like a grant.
    const narrow = await record(setVisibilityEnv(ws, ticket, 'explicit', [insider], insider));
    // A positive control that is not about this ticket at all: without it, a
    // filter that yielded nothing would pass every assertion below.
    const control = await record(ticketEvent(ws, 'comment.added', other, { body: 'still mine' }, insider));

    const items = await collect(viewer, ws, cursor);
    // The whole drain, instructions included: the control envelope and NOTHING
    // else. `idsOf` renders a notice as its ids, so a `reach-granted` naming
    // this ticket — or naming anything at all — fails right here.
    expect(idsOf(items)).toEqual([control.id]);
    // Subordinate, and deliberately blunter than the line above: the ticket's ID
    // must not appear in ANY field of ANY yielded item.
    expect(JSON.stringify(items)).not.toContain(ticket);

    // And the insider, who IS in the new audience, is named it: the same call
    // from the same cursor carries a notice whose `ticketIds` is exactly
    // `[ticket]`.
    //
    // AGAINST THE NOTICE, and not `JSON.stringify(...).toContain(ticket)`, which
    // is what this assertion said until the branch review caught it. That form
    // is VACUOUS: the insider is in the new audience, so the narrowing
    // `visibility.set` is yielded to them by the ordinary range, and its
    // `entity.id` and its `payload.ticketId` both carry the ticket — the
    // substring was present whether or not a single id was ever named. The trap
    // survived the reshape and got worse with it, because under P37.1 the ids
    // are the entire payload.
    const forInsider = await collect(insider, ws, cursor);
    expect(idsOf(forInsider)).toEqual([`reach-granted:${ticket}`, narrow.id, control.id]);
    // What P37.1 changed, stated where a later reader will look for it: under the
    // push shape this pre-cursor comment came back to the insider as an envelope.
    // It does not now — the notice names the ticket and the client pulls it.
    expect(envelopeIds(forInsider)).not.toContain(preCursor.id);
  });

  it('12.278 a widening names the ticket AND every inheriting descendant', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const author = newUlid();
    const parent = newUlid();
    const child = newUlid();
    const grandchild = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, author, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: child, parentId: parent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: grandchild, parentId: child });
    // Hidden from the viewer: the parent authors an explicit list without them,
    // and both descendants author nothing, so they inherit the exclusion.
    await record(setVisibilityEnv(ws, parent, 'explicit', [author], author));

    const hiddenOnParent = await record(ticketEvent(ws, 'comment.added', parent, { body: 'p' }, author));
    await record(ticketEvent(ws, 'comment.added', child, { body: 'c' }, author));
    await record(ticketEvent(ws, 'comment.added', grandchild, { body: 'g' }, author));

    // The viewer is CURRENT at the head — this is the 12.274 shape: their cursor
    // has already run past everything above, so nothing below is re-sent by the
    // ordinary range and only the notice can tell them the tickets are theirs to
    // read.
    const cursor = await head(ws);
    expect(idsOf(await collect(viewer, ws, cursor))).toEqual([]);

    const widen = await record(setVisibilityEnv(ws, parent, 'workspace', undefined, author));

    const items = await collect(viewer, ws, cursor);
    // One exact assertion carrying three properties at once, which is why it is
    // spelled as a sequence rather than as three `toContain`s:
    //
    // 1. The notice names all three tickets — the trigger and both inheriting
    //    descendants — and names nothing else.
    // 2. It is yielded BEFORE its trigger. That ordering is load-bearing, not
    //    cosmetic: a client must have pulled a ticket before a FOLDED
    //    `ticket.reparented` for it arrives, or `applyTicketEvent` replays a
    //    transition with no `ticket.created` and stalls the engine terminally.
    // 3. The only envelope in the drain is the trigger. Under the push shape
    //    this same fixture delivered EIGHT envelopes (3 creations + 3 comments +
    //    the narrowing + the widening); the six pre-cursor ones are exactly the
    //    burst P37.1 removed, and an exact list is what would notice them back.
    //
    // The id order inside the notice is the WALK's order, breadth-first from the
    // seed — not sorted. That order is a contract this file already depends on
    // twice: 12.291 asserts the trigger survives the cap because it is the seed,
    // and the cap keeps the shallowest descendants for the same reason. Sorting
    // the expectation here would hide a walk that had stopped being
    // breadth-first.
    expect(idsOf(items)).toEqual([`reach-granted:${parent},${child},${grandchild}`, widen.id]);
    // The per-drain ledger holds even though the walk reaches the parent as the
    // trigger and could reach it again as its own dependent.
    const named = soleNotice(items).ticketIds;
    expect(new Set(named).size).toBe(named.length);
    // Pinned by id rather than by count: `hiddenOnParent` is the pre-cursor row
    // the push shape handed back, and the one a reader is most likely to expect
    // to find here.
    expect(envelopeIds(items)).not.toContain(hiddenOnParent.id);
  });

  it('12.279 a descendant that AUTHORED its own audience is PRUNED — the ancestor’s widening does not name it', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const author = newUlid();
    const parent = newUlid();
    const authored = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, author, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: authored, parentId: parent });
    await record(setVisibilityEnv(ws, parent, 'explicit', [author], author));
    // The child makes its OWN claim, and it excludes the viewer. Nothing above
    // it can change what it shows — `proj-visibility.ts`'s prune, and the same
    // prune `audienceDependents` applies.
    await record(setVisibilityEnv(ws, authored, 'explicit', [author], author));

    await record(ticketEvent(ws, 'comment.added', parent, { body: 'p' }, author));
    await record(ticketEvent(ws, 'comment.added', authored, { body: 'never yours' }, author));

    const cursor = await head(ws);
    await record(setVisibilityEnv(ws, parent, 'workspace', undefined, author));

    const items = await collect(viewer, ws, cursor);
    // Exclusion and positive control in ONE assertion, from the same drain: the
    // notice names the parent (so the mechanism ran) and names nothing else (so
    // the authored child was pruned). `toContain(parent)` plus
    // `not.toContain(authored)` would be the weaker pair — it passes against a
    // walk that named the whole workspace minus one ticket.
    expect(soleNotice(items).ticketIds).toEqual([parent]);
    // Subordinate: the pruned child's id appears in no field of no item, which
    // covers the envelope half as well as the notice.
    expect(JSON.stringify(items)).not.toContain(authored);
  });

  it('12.280 an inheriting child in ANOTHER project is refused by grantNoticeFor’s own canSee — the guard that is not redundant', async () => {
    const ws = newUlid();
    const mine = newUlid();
    const theirs = newUlid();
    const viewer = newUlid();
    const author = newUlid();
    const parent = newUlid();
    const crossProject = newUlid();
    // The viewer is on `mine` and NOT on `theirs`.
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: mine }]);
    await seedMember(db.pool, ws, author, 'member', [{ projectId: mine }, { projectId: theirs }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: mine, ticketId: parent });
    // A child that inherits its MODE from the parent but carries its own
    // `project_id`. `canSeeResolved` asks `eff.projects.has(v.projectId)` against
    // the CHILD's row, so the inherited `'project'` mode resolves differently for
    // the two tickets — which is the whole reason this guard cannot be dropped.
    await seedTicket(db.pool, { workspaceId: ws, projectId: theirs, ticketId: crossProject, parentId: parent });
    await record(setVisibilityEnv(ws, parent, 'explicit', [author], author));

    await record(ticketEvent(ws, 'comment.added', parent, { body: 'p' }, author));
    await record(ticketEvent(ws, 'comment.added', crossProject, { body: 'other project' }, author));

    const cursor = await head(ws);
    // Widen to PROJECT mode, not workspace: project mode is the one whose answer
    // depends on the row's own `project_id`.
    await record(setVisibilityEnv(ws, parent, 'project', undefined, author));

    const items = await collect(viewer, ws, cursor);
    // The cross-project child IS in the walk — it inherits, so the prune does not
    // stop it — and `grantNoticeFor`'s own `canSee` is the only thing that keeps
    // it off the wire. Under the notice shape that is a disclosure boundary and
    // not merely a filter: mutate that `canSee` to permit and this exact list
    // becomes `[parent, crossProject]`, handing the viewer the id of a ticket in
    // a project they are not on. The parent in the same list is the positive
    // control — an empty notice fails this assertion too.
    expect(soleNotice(items).ticketIds).toEqual([parent]);
    // Subordinate: and the id is in no other field of no other item either.
    expect(JSON.stringify(items)).not.toContain(crossProject);
  });

  it('12.281 ticket.reparented is a trigger too: moving under a visible parent names the moved ticket', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const author = newUlid();
    const hiddenParent = newUlid();
    const openParent = newUlid();
    const moved = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, author, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: hiddenParent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: openParent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: moved, parentId: hiddenParent });
    await record(setVisibilityEnv(ws, hiddenParent, 'explicit', [author], author));
    await record(setVisibilityEnv(ws, openParent, 'workspace', undefined, author));

    const hidden = await record(ticketEvent(ws, 'comment.added', moved, { body: 'written while hidden' }, author));

    const cursor = await head(ws);
    expect(idsOf(await collect(viewer, ws, cursor))).toEqual([]);

    // The field is `newParentId` — `parentId` is the plan text's spelling and
    // leaves `parent_id` unchanged for ever (`proj-visibility.ts` says so).
    const reparent = await record(
      ticketEvent(ws, 'ticket.reparented', moved, { newParentId: openParent }, author),
    );

    const items = await collect(viewer, ws, cursor);
    // The notice names the moved ticket and precedes its trigger. This is the
    // event that made the P37 ordering unsafe and makes the P37.1 ordering
    // REQUIRED: `ticket.reparented` is FOLDED, so a client that never held
    // `moved` and applies it without bootstrapping first replays a transition
    // with no `ticket.created` and stalls terminally. The notice arriving first
    // is what gives it somewhere to go.
    expect(idsOf(items)).toEqual([`reach-granted:${moved}`, reparent.id]);
    // Under the push shape this comment came back as an envelope and this case
    // asserted so. It is pre-cursor history, which is now the client's to pull.
    expect(envelopeIds(items)).not.toContain(hidden.id);
  });

  it(`12.291 the walk is capped at GRANT_BACKFILL_MAX_TICKETS (${String(GRANT_BACKFILL_MAX_TICKETS)}) — ruling P37.1's bound on the walk and on the client's fan-out`, async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const author = newUlid();
    const parent = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, author, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
    // OVER the cap by two, so the fixture cannot pass by being exactly at it.
    // All direct children of one parent, so the whole excess sits in a single
    // breadth-first frontier — the shape the cap actually has to survive.
    const children: string[] = [];
    for (let i = 0; i < GRANT_BACKFILL_MAX_TICKETS + 1; i += 1) {
      const child = newUlid();
      children.push(child);
      await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: child, parentId: parent });
    }
    await record(setVisibilityEnv(ws, parent, 'explicit', [author], author));

    const cursor = await head(ws);
    expect(idsOf(await collect(viewer, ws, cursor))).toEqual([]);
    const widen = await record(setVisibilityEnv(ws, parent, 'workspace', undefined, author));

    const items = await collect(viewer, ws, cursor);
    const named = soleNotice(items).ticketIds;
    // EXACTLY the cap, not merely "at most" — a `toBeLessThanOrEqual` would also
    // pass against a notice that named nothing at all, and the whole family of
    // defects here is a check that passes for the wrong reason. Every one of the
    // 202 candidates is visible to the viewer once the parent is workspace-mode,
    // so the cap is the ONLY thing that can produce this number.
    expect(named).toHaveLength(GRANT_BACKFILL_MAX_TICKETS);
    // And no id is named twice, which is the other way a length could be right
    // for the wrong reason.
    expect(new Set(named).size).toBe(named.length);
    // The trigger ticket is never the one dropped, and it is FIRST: it is the
    // walk's seed and the cap is checked before each pop. `toContain(parent)`
    // would pass against a walk that had lost its breadth-first order and kept
    // the trigger by luck.
    expect(named[0]).toBe(parent);
    // The excess really is excess — two children got nothing. Spelled as the
    // arithmetic (201 seeded, 199 named beside the parent) rather than as `2`, so
    // that a changed cap or a changed fixture moves both halves together.
    const namedSet = new Set(named);
    const missing = children.filter((c) => !namedSet.has(c));
    expect(missing).toHaveLength(children.length - (GRANT_BACKFILL_MAX_TICKETS - 1));
    // The FIXTURE guard, and it is about `children`, not about `missing`: a
    // `expect(missing.length).toBeGreaterThanOrEqual(2)` here would be a check
    // that CANNOT FAIL — the exact line above already pins the number, so the
    // floor could only be violated by a run that had already gone red. What the
    // over-cap claim actually rests on is that more children were seeded than the
    // cap can hold, and shrinking the loop is the edit that would break it.
    expect(children.length).toBeGreaterThan(GRANT_BACKFILL_MAX_TICKETS);
    // The drain carries the trigger and nothing else. Under the push shape this
    // fixture streamed the whole history of 200 tickets in one atomic burst —
    // case 12.290's wedge — and this single line is what would catch its return.
    expect(envelopeIds(items)).toEqual([widen.id]);
    // Removing the cap from `audienceDependents` names all 202 and reddens this
    // case alone — that mutation is recorded in the branch's case table.
  });

  it('12.282 the per-drain ledger names a ticket ONCE however many triggers hit it, and a LATER drain seeing a new widening is owed the notice again', async () => {
    // ## Half of this case died with the push shape, and it is named rather than
    // ## quietly dropped
    //
    // Under P37 this case also asserted that the backfill was bounded to
    // PRE-cursor rows: a comment filed ABOVE the cursor arrived once, from the
    // ordinary range, and must not ALSO arrive as backfill. That property has no
    // subject any more. A notice carries no rows at all, so there is nothing to
    // bound against `afterSeq` and no envelope the backfill could duplicate —
    // the drain's envelopes are the ordinary range and nothing else, which
    // 12.278, 12.281 and 12.291 each pin with an exact list.
    //
    // What survives is the `backfilled` Set, and it is worth more under the
    // notice shape than it was under the push one: it is per-DRAIN, deliberately
    // not per-subscriber, because `visibleEventsFor` has no per-subscriber state
    // and must not invent any. Both directions of that are asserted below.
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const author = newUlid();
    const ticket = newUlid();
    const openParent = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, author, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: openParent });
    await record(setVisibilityEnv(ws, openParent, 'workspace', undefined, author));
    await record(setVisibilityEnv(ws, ticket, 'explicit', [author], author));
    const hidden = await record(ticketEvent(ws, 'comment.added', ticket, { body: 'hidden' }, author));

    const cursor = await head(ws);
    expect(idsOf(await collect(viewer, ws, cursor))).toEqual([]);

    // TWO triggers on the SAME ticket inside ONE range, and deliberately one of
    // each KIND rather than two `visibility.set`s: `isGrantBackfillTrigger` keys
    // on the event TYPE alone, so a pair drawn from both ends of
    // `GRANT_BACKFILL_TRIGGERS` says the ledger is what suppresses the second
    // notice, not some same-value short-circuit in the projection (there is
    // none — `proj-visibility.ts`'s `visibility.set` arm UPDATEs
    // unconditionally). The reparent leaves the ticket visible: its own_mode is
    // `'workspace'` by then, so it resolves from its own claim and not from
    // wherever it was moved.
    const widen = await record(setVisibilityEnv(ws, ticket, 'workspace', undefined, author));
    const reparent = await record(
      ticketEvent(ws, 'ticket.reparented', ticket, { newParentId: openParent }, author),
    );

    const first = await collect(viewer, ws, cursor);
    // The count stated HERE rather than inherited from `soleNotice`, because in
    // this case the count IS the property: two triggers, one notice.
    expect(noticesOf(first).map((n) => n.ticketIds)).toEqual([[ticket]]);
    // And it sits before the FIRST of the two triggers, with both triggers
    // delivered — the positive control that the drain is not simply empty.
    expect(idsOf(first)).toEqual([`reach-granted:${ticket}`, widen.id, reparent.id]);
    // The pre-cursor comment is the client's to pull; see the note above about
    // which half of this case died.
    expect(envelopeIds(first)).not.toContain(hidden.id);

    // The other direction. A consumer advances past DELIVERED envelopes, so the
    // next drain starts above both triggers — and a NEW widening inside it is
    // owed the notice again, from a `backfilled` Set that starts empty. A
    // re-issued `visibility.set` naming the mode the ticket already has is
    // exactly the shape `check-permission.ts` does not refuse, and it is free
    // for a holding client under the notice shape: it is told an id it already
    // has and fetches nothing.
    const mid = await head(ws);
    const again = await record(setVisibilityEnv(ws, ticket, 'workspace', undefined, author));
    expect(idsOf(await collect(viewer, ws, mid))).toEqual([`reach-granted:${ticket}`, again.id]);
  });
});
