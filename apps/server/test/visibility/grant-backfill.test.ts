import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { visibleEventsFor, type SyncItem } from '../../src/visibility/visible-events-for.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed.js';

/**
 * Closure 5's GRANT half (ruling P37) — backfill on newly granted visibility,
 * at the filter, where the decision is made.
 *
 * The replica-facing half of this property lives on the dual-client rig
 * (`test/dual-client/grant-backfill.test.ts`, cases 12.275–12.276): that is
 * where "the two replicas converge" and "replay is idempotent" can be MEASURED
 * against a real replica rather than asserted about a generator. This file
 * carries what only the generator can answer — who is excluded, which tickets
 * the walk reaches, and which of the two guards holds which property.
 *
 * ## Every exclusion here carries a positive control in the same test
 *
 * The house rule of `visible-events-for.test.ts`, and it bites harder here: a
 * backfill that yields NOTHING passes every `not.toContain` in this file. So
 * each exclusion sits beside an inclusion drawn from the same `collect` call.
 *
 * ## The two mutable sites, and which case kills which
 *
 * `grant-backfill.ts` deliberately carries two independently-mutable sites, and
 * a guard no mutation can kill is unmeasured code a later reader trusts —
 * `stream/hub.ts` paid four masked `sub.ended` guards to learn that. Both are
 * killed here, each alone:
 *
 * - `GRANT_BACKFILL_TRIGGERS` → emptied: **five of the six redden** — 12.278,
 *   12.279, 12.280, 12.281, 12.282 (`5 failed | 1 passed`, measured). Not
 *   "alone", and it should not be: emptying it removes the whole mechanism, so
 *   every case whose positive control is a backfilled row goes with it. The one
 *   SURVIVOR is 12.277, and that is the informative half of the measurement —
 *   12.277's property is exclusion, and exclusion is held by `visibleEventsFor`'s
 *   own `canSee` on the trigger event, not by this list. A narrowing is invisible
 *   to the person it narrowed away, so it never becomes a trigger for them.
 * - `grantBackfillFor`'s own `canSee` → mutated to permit, **12.280** reddens
 *   ALONE. That case exists for exactly this reason: the guard is redundant for
 *   every ORDINARY descendant (an inheriting child copies the authoring
 *   ancestor's `resolved_mode` and `resolved_user_ids`, so `canSee` returns the
 *   same answer the caller already had) and is load-bearing only where the
 *   inherited mode is `'project'` and the child's OWN `project_id` differs from
 *   the ancestor's — because `canSeeResolved` asks `eff.projects.has(v.projectId)`
 *   against the CHILD's row. Without 12.280 the guard would be unkillable and
 *   this file would have to drop it.
 *
 * Hoisting the `grantBackfillFor` call out of `visibleEventsFor`'s own
 * `if (await canSee(...))` reddens **12.277** — the excluding fixture P37 names.
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

describe('grant backfill — the copy nobody gives back (closure 5, ruling P37)', () => {
  it('12.277 a viewer OUTSIDE the new audience receives nothing — the narrowing is not a trigger for the person it narrowed away', async () => {
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
    // Pre-cursor history on the ticket, while the viewer could still see it.
    await record(ticketEvent(ws, 'comment.added', ticket, { body: 'while shared' }, insider));

    const cursor = await head(ws);
    // The narrowing: explicit to the insider alone. For the VIEWER this is a
    // loss, and a loss must never look like a grant.
    await record(setVisibilityEnv(ws, ticket, 'explicit', [insider], insider));
    // A positive control that is not about this ticket at all: without it, a
    // filter that yielded nothing would pass every assertion below.
    const control = await record(ticketEvent(ws, 'comment.added', other, { body: 'still mine' }, insider));

    const items = await collect(viewer, ws, cursor);
    expect(envelopeIds(items)).toEqual([control.id]);
    // Not "the payload is absent" — the ticket's ID must not appear in ANY
    // field of ANY yielded item, backfilled or otherwise.
    expect(JSON.stringify(items)).not.toContain(ticket);

    // And the insider, who IS in the new audience, gets the backfill: the same
    // call from the same cursor hands back the pre-cursor comment.
    const forInsider = await collect(insider, ws, cursor);
    expect(JSON.stringify(forInsider)).toContain(ticket);
  });

  it('12.278 a widening hands back the ticket’s pre-cursor history AND every inheriting descendant’s', async () => {
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
    const hiddenOnChild = await record(ticketEvent(ws, 'comment.added', child, { body: 'c' }, author));
    const hiddenOnGrandchild = await record(ticketEvent(ws, 'comment.added', grandchild, { body: 'g' }, author));

    // The viewer is CURRENT at the head — this is the 12.274 shape: their cursor
    // has already run past everything above, so nothing below is re-sent by the
    // ordinary range and only the backfill can deliver it.
    const cursor = await head(ws);
    expect(envelopeIds(await collect(viewer, ws, cursor))).toEqual([]);

    const widen = await record(setVisibilityEnv(ws, parent, 'workspace', undefined, author));

    const ids = envelopeIds(await collect(viewer, ws, cursor));
    // Every pre-cursor row of all three tickets, plus the widening itself. The
    // three `ticket.created`s came from `seedTicket`; the comments from above.
    expect(ids).toContain(hiddenOnParent.id);
    expect(ids).toContain(hiddenOnChild.id);
    expect(ids).toContain(hiddenOnGrandchild.id);
    expect(ids).toContain(widen.id);
    // Delivered ONCE — the per-drain ledger holds even though the walk reaches
    // the parent as the trigger and could reach it again as its own dependent.
    expect(new Set(ids).size).toBe(ids.length);
    // 3 creations + 3 comments + the narrowing + the widening = 8.
    expect(ids).toHaveLength(8);
  });

  it('12.279 a descendant that AUTHORED its own audience is pruned — the ancestor’s widening does not reach it', async () => {
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

    const onParent = await record(ticketEvent(ws, 'comment.added', parent, { body: 'p' }, author));
    await record(ticketEvent(ws, 'comment.added', authored, { body: 'never yours' }, author));

    const cursor = await head(ws);
    await record(setVisibilityEnv(ws, parent, 'workspace', undefined, author));

    const items = await collect(viewer, ws, cursor);
    // Positive control on the same call: the parent's history DID come back.
    expect(envelopeIds(items)).toContain(onParent.id);
    // The authored child's id appears nowhere at all.
    expect(JSON.stringify(items)).not.toContain(authored);
  });

  it('12.280 an inheriting child in ANOTHER project is refused by the backfill’s own canSee — the guard that is not redundant', async () => {
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

    const onParent = await record(ticketEvent(ws, 'comment.added', parent, { body: 'p' }, author));
    await record(ticketEvent(ws, 'comment.added', crossProject, { body: 'other project' }, author));

    const cursor = await head(ws);
    // Widen to PROJECT mode, not workspace: project mode is the one whose answer
    // depends on the row's own `project_id`.
    await record(setVisibilityEnv(ws, parent, 'project', undefined, author));

    const items = await collect(viewer, ws, cursor);
    // Positive control: the parent, in the viewer's project, came back.
    expect(envelopeIds(items)).toContain(onParent.id);
    // The cross-project child is in the WALK — it inherits, so the prune does not
    // stop it — and is excluded only by `canSee`.
    expect(JSON.stringify(items)).not.toContain(crossProject);
  });

  it('12.281 ticket.reparented is a trigger too: moving under a visible parent hands back the moved ticket’s history', async () => {
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
    expect(envelopeIds(await collect(viewer, ws, cursor))).toEqual([]);

    // The field is `newParentId` — `parentId` is the plan text's spelling and
    // leaves `parent_id` unchanged for ever (`proj-visibility.ts` says so).
    const reparent = await record(
      ticketEvent(ws, 'ticket.reparented', moved, { newParentId: openParent }, author),
    );

    const ids = envelopeIds(await collect(viewer, ws, cursor));
    expect(ids).toContain(hidden.id);
    expect(ids).toContain(reparent.id);
  });

  it('12.282 the backfill is bounded to PRE-cursor rows, and re-drains do not repeat it once the cursor has passed the trigger', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    const author = newUlid();
    const ticket = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, author, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: ticket });
    await record(setVisibilityEnv(ws, ticket, 'explicit', [author], author));
    const hidden = await record(ticketEvent(ws, 'comment.added', ticket, { body: 'hidden' }, author));

    const cursor = await head(ws);
    const widen = await record(setVisibilityEnv(ws, ticket, 'workspace', undefined, author));
    const after = await record(ticketEvent(ws, 'comment.added', ticket, { body: 'after' }, author));

    const first = envelopeIds(await collect(viewer, ws, cursor));
    expect(first).toContain(hidden.id);
    expect(first).toContain(widen.id);
    expect(first).toContain(after.id);
    // `after` sits ABOVE the cursor, so the ordinary range yields it. It must not
    // ALSO arrive as backfill — the backfill's bound is `workspaceSeq <= afterSeq`
    // and this is what holds it.
    expect(first.filter((id) => id === after.id)).toHaveLength(1);

    // A consumer advances only past DELIVERED envelopes, and the trigger is one
    // of them. From the new cursor the trigger is out of range, so the backfill
    // does not fire again: bounded to once per subscriber per widening.
    const second = envelopeIds(await collect(viewer, ws, await head(ws)));
    expect(second).toEqual([]);
  });
});
