import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LedgerEvent } from '@gisik-nokma/domain';
import { newUlid } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { projVisibility } from '../src/projections/proj-visibility.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { verifyProjections } from '../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { testEnvelope } from './helpers/envelope.js';

let db: TestDatabase;

/**
 * The workflow and the ticket type every `created()` below depends on, planted
 * ONCE at the head of this file's ledger.
 *
 * They are not scenery. `events` is append-only across the whole file, and the
 * verify case at the bottom rebuilds EVERY registered projection over the whole
 * ledger — including Plan 3 Task 10's proj_tickets, which folds `ticket.created`
 * through the shared reducer and throws when the ticket's type, or that type's
 * workflow, is not defined. The engine refuses `ticket.unknown-type` at the
 * door, so a ledger holding a creation whose type was never defined is one the
 * product could not have written, and re-deriving it SHOULD fail.
 *
 * In `beforeAll` rather than inside that case, because the definitions have to
 * carry the LOWEST workspace stream positions in the file: proj_tickets resolves
 * a workflow AS OF the applying event's position, so a definition published
 * after a creation is not in force for it. `resetTestSequences()` is not called
 * here (see below), so the counter climbs monotonically and "first written" is
 * "lowest position".
 */
const WORKFLOW = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  const client = await db.pool.connect();
  try {
    await insertEvent(
      client,
      testEnvelope({
        workspaceId: WORKSPACE,
        entity: { kind: 'workflow', id: WORKFLOW },
        type: 'workflow.defined',
        payload: {
          id: WORKFLOW,
          version: 1,
          name: 'Basic',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [{ from: 'todo', to: 'done', rules: [] }],
        },
        actorId: ACTOR,
      }),
    );
    await insertEvent(
      client,
      testEnvelope({
        workspaceId: WORKSPACE,
        // A fresh entity ULID with the payload's `id` carrying the type key —
        // foundingSequence's shape, and the only one the envelope schema
        // permits. TYPE_ID is what `created()` names.
        entity: { kind: 'ticket-type', id: newUlid() },
        type: 'ticket-type.defined',
        payload: {
          id: TYPE_ID,
          name: 'Task',
          icon: 'check',
          rank: 3,
          workflowId: WORKFLOW,
          fields: [],
        },
        actorId: ACTOR,
      }),
    );
  } finally {
    client.release();
  }
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('TRUNCATE proj_visibility');
});

/**
 * The ledger is NOT emptied between tests, and cannot be — `events` is
 * append-only and the migration's trigger refuses a TRUNCATE outright. So a
 * rebuild in any one test replays every event every earlier test seeded, while
 * the live table has just been truncated back to that test's own rows. Every
 * live-versus-rebuild comparison below is therefore SCOPED to the ticket ids
 * the case created; the tickets are fresh ULIDs per test, so the scopes are
 * disjoint and nothing is hidden by the filter.
 */

/**
 * `resetTestSequences()` is deliberately NOT called here. Several tests below
 * seed the real ledger, whose UNIQUE (workspace_id, workspace_seq) would be
 * violated by a second test reusing a workspace stream position — the same
 * reason proj-memberships.test.ts gives. No assertion here depends on an
 * absolute counter value.
 */

/**
 * Real ULIDs, not `tkt_root`. ticketCreatedPayload types projectId and parentId
 * as `ulidString` and visibilitySetPayload types ticketId the same way, and this
 * projection parses its payloads with those door schemas — so the plan text's
 * `tkt_p` fixtures describe events the door refuses and would throw here rather
 * than quietly storing nonsense.
 */
const WORKSPACE = newUlid();
const PROJECT = newUlid();
const ACTOR = newUlid();
const TYPE_ID = newUlid();
const OTHER_USER = newUlid();

function created(ticketId: string, parentId: string | null = null): LedgerEvent {
  return testEnvelope({
    workspaceId: WORKSPACE,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    // parentId is a REQUIRED nullable key in ticketCreatedPayload, and typeId is
    // required too. The plan's fixture omitted both.
    payload: { typeId: TYPE_ID, projectId: PROJECT, parentId, title: 'Restock the chiller' },
    actorId: ACTOR,
  });
}

function setVis(
  ticketId: string,
  mode: 'workspace' | 'project' | 'explicit' | 'inherit',
  userIds?: string[],
): LedgerEvent {
  return testEnvelope({
    workspaceId: WORKSPACE,
    entity: { kind: 'ticket', id: ticketId },
    type: 'visibility.set',
    payload: { ticketId, mode, ...(userIds === undefined ? {} : { userIds }) },
    actorId: ACTOR,
  });
}

function reparented(ticketId: string, newParentId: string | null): LedgerEvent {
  return testEnvelope({
    workspaceId: WORKSPACE,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.reparented',
    // `newParentId`, not `parentId`. The plan text and its own fixture are
    // self-consistently wrong here, which is why its reparent tests passed while
    // a real Plan 3 event would have left parent_id unchanged for ever.
    payload: { newParentId },
    actorId: ACTOR,
  });
}

type Resolution = {
  own_mode: string;
  resolved_mode: string;
  resolved_user_ids: string[];
  resolved_from: string;
};

async function resolution(ticketId: string): Promise<Resolution | undefined> {
  const result = await db.pool.query<Resolution>(
    `SELECT own_mode, resolved_mode, resolved_user_ids, resolved_from
     FROM proj_visibility WHERE ticket_id = $1`,
    [ticketId],
  );
  return result.rows[0];
}

async function applyLive(events: readonly LedgerEvent[]): Promise<void> {
  const client = await db.pool.connect();
  try {
    for (const event of events) {
      await projVisibility.apply(event, client);
    }
  } finally {
    client.release();
  }
}

/**
 * Three ticket ids in a KNOWN lexicographic order, so a test can choose which
 * ticket canonical replay visits first. `readLedger` orders by
 * (entity_kind, entity_id, seq) and every event this projection reads is filed
 * against kind 'ticket', so entity-id order IS replay order here.
 *
 * ULIDs are Crockford base32, so their string order is their sort order. The
 * tests that depend on this ASSERT it rather than assume it — a canonical-order
 * test whose fixture happened to match arrival order would be the tautology this
 * repo keeps finding.
 */
function sortedTicketIds(count: number): string[] {
  return Array.from({ length: count }, () => newUlid()).sort();
}

describe('proj_visibility resolves an authored mode', () => {
  it("a root with no authored mode resolves to the project default, authored by nobody", async () => {
    const root = newUlid();
    await applyLive([created(root)]);
    expect(await resolution(root)).toEqual({
      own_mode: 'inherit',
      resolved_mode: 'project',
      resolved_user_ids: [],
      resolved_from: '',
    });
  });

  it("a ticket's own authored mode wins over everything above it, and names itself as the author", async () => {
    const [parent, child] = sortedTicketIds(2) as [string, string];
    await applyLive([
      created(parent),
      setVis(parent, 'workspace'),
      created(child, parent),
      setVis(child, 'explicit', [ACTOR]),
    ]);
    expect(await resolution(child)).toEqual({
      own_mode: 'explicit',
      resolved_mode: 'explicit',
      resolved_user_ids: [ACTOR],
      resolved_from: child,
    });
  });

  it('an explicit list is carried through; a standing-audience mode carries no list', async () => {
    const listed = newUlid();
    const wide = newUlid();
    await applyLive([
      created(listed),
      setVis(listed, 'explicit', [ACTOR, OTHER_USER]),
      created(wide),
      setVis(wide, 'workspace'),
    ]);
    expect(await resolution(listed)).toMatchObject({
      resolved_mode: 'explicit',
      resolved_user_ids: [ACTOR, OTHER_USER],
    });
    // Not [] by accident: visibilitySetPayload REFUSES userIds on a non-explicit
    // mode, so the only way a 'workspace' row could carry a list is if this
    // projection invented one.
    expect(await resolution(wide)).toMatchObject({
      resolved_mode: 'workspace',
      resolved_user_ids: [],
    });
  });

  it('a chain walks to the nearest authored ancestor — resolved_from is the AUTHOR, not the parent', async () => {
    const [grandparent, parent, child] = sortedTicketIds(3) as [string, string, string];
    await applyLive([
      created(grandparent),
      setVis(grandparent, 'explicit', [ACTOR]),
      created(parent, grandparent),
      created(child, parent),
    ]);
    // The middle ticket authored nothing, so it is NOT the answer to "who
    // decided this" — the discriminator between copying parent.resolved_from
    // and copying parent.ticket_id.
    expect(await resolution(child)).toEqual({
      own_mode: 'inherit',
      resolved_mode: 'explicit',
      resolved_user_ids: [ACTOR],
      resolved_from: grandparent,
    });
    expect(await resolution(parent)).toMatchObject({ resolved_from: grandparent });
  });

  it('a ticket whose parent row does not exist is treated as a root rather than dropped', async () => {
    const orphan = newUlid();
    await applyLive([created(orphan, newUlid())]);
    expect(await resolution(orphan)).toMatchObject({ resolved_mode: 'project', resolved_from: '' });
  });
});

describe('proj_visibility re-resolves on the three events that can change an audience', () => {
  it('an ancestor visibility change reaches every inheriting descendant', async () => {
    const [grandparent, parent, child] = sortedTicketIds(3) as [string, string, string];
    await applyLive([created(grandparent), created(parent, grandparent), created(child, parent)]);
    expect(await resolution(child)).toMatchObject({ resolved_mode: 'project' });

    await applyLive([setVis(grandparent, 'workspace')]);
    expect(await resolution(parent)).toMatchObject({
      resolved_mode: 'workspace',
      resolved_from: grandparent,
    });
    expect(await resolution(child)).toMatchObject({
      resolved_mode: 'workspace',
      resolved_from: grandparent,
    });
  });

  it('re-resolution stops dead at an authored descendant, and at everything under it', async () => {
    const [grandparent, parent, child] = sortedTicketIds(3) as [string, string, string];
    await applyLive([
      created(grandparent),
      created(parent, grandparent),
      created(child, parent),
      setVis(parent, 'explicit', [ACTOR]),
      setVis(grandparent, 'workspace'),
    ]);
    // The authored node keeps its own claim...
    expect(await resolution(parent)).toMatchObject({
      resolved_mode: 'explicit',
      resolved_user_ids: [ACTOR],
      resolved_from: parent,
    });
    // ...and so does everything below it. The discriminating mutation is in
    // resolveOne's own-mode branch, NOT the `own_mode === 'inherit'` prune in
    // reResolveSubtree: deleting the prune was mutated and left every test
    // green, because re-resolving an authored node re-derives the value it
    // already held. The prune buys work, not truth. Make resolveOne take the
    // parent's resolution for an authored node and these two go 'workspace'.
    expect(await resolution(child)).toMatchObject({
      resolved_mode: 'explicit',
      resolved_user_ids: [ACTOR],
      resolved_from: parent,
    });
  });

  it('reparenting moves the subtree onto its new chain', async () => {
    const [a, b, child] = sortedTicketIds(3) as [string, string, string];
    const grandchild = newUlid();
    await applyLive([
      created(a),
      setVis(a, 'workspace'),
      created(b),
      setVis(b, 'explicit', [ACTOR]),
      created(child, a),
      created(grandchild, child),
    ]);
    expect(await resolution(child)).toMatchObject({ resolved_mode: 'workspace', resolved_from: a });
    expect(await resolution(grandchild)).toMatchObject({ resolved_mode: 'workspace' });

    await applyLive([reparented(child, b)]);
    // Both the moved ticket and what hangs off it. Read `parentId` from the
    // payload instead of `newParentId` and parent_id stays `a`, so both of these
    // stay 'workspace'.
    expect(await resolution(child)).toMatchObject({
      resolved_mode: 'explicit',
      resolved_user_ids: [ACTOR],
      resolved_from: b,
    });
    expect(await resolution(grandchild)).toMatchObject({
      resolved_mode: 'explicit',
      resolved_from: b,
    });
  });

  it('reparenting to root falls back to the project default', async () => {
    const [a, child] = sortedTicketIds(2) as [string, string];
    await applyLive([created(a), setVis(a, 'workspace'), created(child, a)]);
    await applyLive([reparented(child, null)]);
    expect(await resolution(child)).toMatchObject({ resolved_mode: 'project', resolved_from: '' });
  });

  it("setting a ticket back to 'inherit' re-attaches it and its subtree to the chain", async () => {
    const [parent, child] = sortedTicketIds(2) as [string, string];
    const grandchild = newUlid();
    await applyLive([
      created(parent),
      setVis(parent, 'workspace'),
      created(child, parent),
      created(grandchild, child),
      setVis(child, 'explicit', [ACTOR]),
    ]);
    expect(await resolution(child)).toMatchObject({ resolved_mode: 'explicit' });
    expect(await resolution(grandchild)).toMatchObject({ resolved_mode: 'explicit' });

    await applyLive([setVis(child, 'inherit')]);
    expect(await resolution(child)).toMatchObject({
      own_mode: 'inherit',
      resolved_mode: 'workspace',
      resolved_from: parent,
    });
    expect(await resolution(grandchild)).toMatchObject({
      resolved_mode: 'workspace',
      resolved_from: parent,
    });
  });
});

describe('proj_visibility keys every write on the entity the event was filed against', () => {
  /**
   * `visibility.set` restates its ticket in the payload, and Task 9 — which has
   * not run — is what refuses the two disagreeing. Until it does, keying the
   * write on `payload.ticketId` would let ticket A's event stream write ticket
   * B's row: the cross-entity write that makes live application and canonical
   * replay disagree, on a table nobody corrupted.
   *
   * So the projection keys on `event.entity.id`. This is not a claim that the
   * disagreement is legal — it is a claim about which row a disagreeing event
   * may touch, which is exactly one.
   */
  it('a visibility.set whose payload names another ticket writes only the ticket it was filed against', async () => {
    const filedAgainst = newUlid();
    const named = newUlid();
    await applyLive([created(filedAgainst), created(named)]);

    await applyLive([
      testEnvelope({
        workspaceId: WORKSPACE,
        entity: { kind: 'ticket', id: filedAgainst },
        type: 'visibility.set',
        payload: { ticketId: named, mode: 'workspace' },
        actorId: ACTOR,
      }),
    ]);

    expect(await resolution(filedAgainst)).toMatchObject({
      own_mode: 'workspace',
      resolved_mode: 'workspace',
    });
    // The positive control for the assertion above: the OTHER row is untouched,
    // so "wrote the filed-against row" is not "wrote both".
    expect(await resolution(named)).toMatchObject({
      own_mode: 'inherit',
      resolved_mode: 'project',
    });
  });

  it('records the per-entity seq of the ticket stream that authored the row, not the workspace cursor', async () => {
    const ticket = newUlid();
    const create = created(ticket);
    const set = setVis(ticket, 'workspace');
    await applyLive([create, set]);

    const result = await db.pool.query<{ seq: number }>(
      'SELECT seq FROM proj_visibility WHERE ticket_id = $1',
      [ticket],
    );
    expect(result.rows[0]?.seq).toBe(set.seq);
    // helpers/envelope.ts gives the two counters different values on purpose, so
    // storing the wrong one fails here instead of passing by coincidence.
    expect(set.seq).not.toBe(set.workspaceSeq);
    expect(create.seq).not.toBe(set.seq);

    // The creating handler writes seq too, and on a ticket that has only ever
    // been created that is the ONLY write — so it is checked separately. The
    // assertion above cannot see it: the later visibility.set overwrites the
    // column, so the create handler could store anything at all and pass.
    const untouched = newUlid();
    const onlyCreated = created(untouched);
    await applyLive([onlyCreated]);
    const bare = await db.pool.query<{ seq: number }>(
      'SELECT seq FROM proj_visibility WHERE ticket_id = $1',
      [untouched],
    );
    expect(bare.rows[0]?.seq).toBe(onlyCreated.seq);
    expect(onlyCreated.seq).not.toBe(onlyCreated.workspaceSeq);
  });

  /**
   * The one place this file writes the table by hand, deliberately, and for the
   * reason proj-memberships.test.ts gives for its own: the row being asserted
   * about is one NO event can produce. `visibilitySetPayload` refuses `userIds`
   * on any mode but `explicit`, so `own_user_ids` is always empty on a
   * `workspace` or `project` row and the guard that drops the list when the mode
   * is not `explicit` can never be exercised through the door — mutated to carry
   * the list unconditionally, every test stayed green.
   *
   * It is worth keeping rather than deleting: a backfill, a migration or a later
   * relaxation of that schema would reach this code with a list attached, and
   * `resolved_user_ids` is what Task 7's canSee reads. So the guard is made
   * falsifiable here instead of left decorative. `ticket.reparented` is the lever
   * — it re-resolves the ticket it names without rewriting its authored columns,
   * which is the only way to run resolveOne over a row this test planted.
   */
  it('an authored mode that is not explicit resolves to no list, even if the row carries one', async () => {
    const parent = newUlid();
    const planted = newUlid();
    await applyLive([created(parent)]);
    await db.pool.query(
      `INSERT INTO proj_visibility
         (ticket_id, workspace_id, project_id, parent_id, own_mode, own_user_ids,
          resolved_mode, resolved_user_ids, resolved_from, seq)
       VALUES ($1, $2, $3, $4, 'workspace', $5, 'workspace', $5, $1, 1)`,
      [planted, WORKSPACE, PROJECT, parent, [ACTOR]],
    );

    await applyLive([reparented(planted, parent)]);

    expect(await resolution(planted)).toEqual({
      own_mode: 'workspace',
      resolved_mode: 'workspace',
      // Not the planted list. A standing audience is the whole workspace; a
      // list beside it would be a permanent, untrue record of a hand-picked one.
      resolved_user_ids: [],
      resolved_from: planted,
    });
  });

  it('refuses a payload it cannot honestly store rather than writing undefined', async () => {
    const client = await db.pool.connect();
    try {
      // visibilitySetPayload refuses 'explicit' with nobody named — an audience
      // of nobody reads as a restriction hiding the ticket from everyone,
      // when what was meant was a list somebody forgot to attach. Casting the
      // payload instead of parsing it would write own_mode 'explicit' with an
      // empty list and hide the ticket for real.
      await expect(
        projVisibility.apply(setVis(newUlid(), 'explicit', []), client),
      ).rejects.toThrowError(/explicit mode requires a non-empty userIds list/);
    } finally {
      client.release();
    }
  });

  it('ignores an event type it does not read', async () => {
    await applyLive([
      testEnvelope({
        workspaceId: WORKSPACE,
        entity: { kind: 'workspace', id: WORKSPACE },
        type: 'workspace.created',
        payload: { name: 'Convenience Corner' },
        actorId: ACTOR,
      }),
    ]);
    const result = await db.pool.query('SELECT ticket_id FROM proj_visibility');
    expect(result.rows).toEqual([]);
  });

  it('reset empties the table it declares', async () => {
    await applyLive([created(newUlid()), created(newUlid())]);
    const before = await db.pool.query('SELECT ticket_id FROM proj_visibility');
    expect(before.rows).toHaveLength(2);

    const client = await db.pool.connect();
    try {
      await projVisibility.reset(client);
    } finally {
      client.release();
    }
    const after = await db.pool.query('SELECT ticket_id FROM proj_visibility');
    expect(after.rows).toEqual([]);
  });
});

/**
 * The registry contract's second clause, applied to the projection whose rows
 * are written ACROSS entities by design:
 *
 *   "Table contents must be a pure function of the ledger's rows — never of
 *    cross-entity arrival interleaving. Replay delivers canonical order
 *    (entity_kind, entity_id, seq): per-entity causality only."
 *
 * Every event here is filed against a ticket, so canonical order is TICKET-ID
 * order: on a rebuild, all of one ticket's events are applied before any of the
 * next ticket's. A parent is therefore routinely created after its own children
 * are already in the table — which the plan text's `ticket.created` handler
 * ("a fresh ticket has no children, so no recursion") does not survive.
 *
 * The plan's own determinism test cannot see this. It replays the SAME arrival
 * order it applied, so it asserts only that `apply` is a function. Each case
 * below therefore (a) asserts that arrival order and canonical order really do
 * differ for its fixture, and (b) compares live against a REBUILD, which reads
 * the ledger in canonical order.
 *
 * This is a PROPERTY, so the cases enumerate the shapes that can diverge rather
 * than mutating one fixture: a child created before its parent's row exists; a
 * parent created before its ancestor's authoring event has been replayed; an
 * authored node pruning mid-chain; a reparent moving a subtree; and a
 * set-back-to-inherit re-attaching one.
 *
 * THE PRECONDITION IS IN THE TITLE ON PURPOSE. The invariant argument in
 * proj-visibility.ts determines a unique resolution only for an ACYCLIC parent
 * graph; once `parent_id` closes a loop the invariant has several fixpoints and
 * which one the table lands in is a function of arrival order. That is a real,
 * reachable defect — no door on this branch refuses a cycle-creating reparent —
 * measured and recorded as case 6.58 with its owner, not fixed here. The next
 * describe pins only what this projection genuinely provides about a cycle,
 * which is termination.
 */
describe('proj_visibility is a pure function of the ledger, not of arrival order — while the parent graph is acyclic', () => {
  type Row = {
    ticket_id: string;
    parent_id: string | null;
    own_mode: string;
    own_user_ids: string[];
    resolved_mode: string;
    resolved_user_ids: string[];
    resolved_from: string;
  };

  async function rowsFor(ticketIds: readonly string[]): Promise<Row[]> {
    const result = await db.pool.query<Row>(
      `SELECT ticket_id, parent_id, own_mode, own_user_ids,
              resolved_mode, resolved_user_ids, resolved_from
       FROM proj_visibility WHERE ticket_id = ANY($1) ORDER BY ticket_id`,
      [[...ticketIds]],
    );
    return result.rows;
  }

  function canonical(events: readonly LedgerEvent[]): LedgerEvent[] {
    return [...events].sort(
      (a, b) =>
        a.entity.kind.localeCompare(b.entity.kind) ||
        a.entity.id.localeCompare(b.entity.id) ||
        a.seq - b.seq,
    );
  }

  /**
   * Seeds the ledger, applies live in arrival order, rebuilds from the ledger
   * in canonical order, and returns both pictures — plus the premise, asserted
   * rather than assumed, that the two orders are genuinely different.
   */
  async function liveVersusRebuild(
    events: readonly LedgerEvent[],
  ): Promise<{ live: Row[]; rebuilt: Row[] }> {
    // The premise, asserted rather than assumed: canonical replay order really
    // is different from arrival order for this fixture. Without this the whole
    // comparison could pass vacuously the day ULID generation changed.
    expect(canonical(events).map((event) => event.id)).not.toEqual(
      events.map((event) => event.id),
    );
    const scope = [...new Set(events.map((event) => event.entity.id))];

    const client = await db.pool.connect();
    try {
      for (const event of events) {
        await insertEvent(client, event);
      }
    } finally {
      client.release();
    }

    await applyLive(events);
    const live = await rowsFor(scope);
    expect(live).toHaveLength(scope.length);

    await rebuildProjection('proj_visibility', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
    return { live, rebuilt: await rowsFor(scope) };
  }

  it('a child created before its parent exists in replay order still inherits the parent chain', async () => {
    // C sorts first, so canonical replay applies C's creation while P and G are
    // absent; G authors; then P is created and must reach back down to C.
    const [child, grandparent, parent] = sortedTicketIds(3) as [string, string, string];
    expect(child < grandparent).toBe(true);
    expect(grandparent < parent).toBe(true);

    const events = [
      created(grandparent),
      setVis(grandparent, 'workspace'),
      created(parent, grandparent),
      created(child, parent),
    ];
    const { live, rebuilt } = await liveVersusRebuild(events);

    expect(rebuilt).toEqual(live);
    // Named, so the agreement above cannot be an agreement on the WRONG answer:
    // replace reResolveSubtree with resolveOne in the ticket.created handler and
    // the rebuild leaves this row at 'project' / '' while live says 'workspace'.
    expect(live.find((row) => row.ticket_id === child)).toMatchObject({
      resolved_mode: 'workspace',
      resolved_from: grandparent,
    });
  });

  it('an authored node still prunes its subtree when replay visits the tickets out of arrival order', async () => {
    const [child, parent, grandparent] = sortedTicketIds(3) as [string, string, string];
    expect(child < parent).toBe(true);
    expect(parent < grandparent).toBe(true);

    const events = [
      created(grandparent),
      created(parent, grandparent),
      created(child, parent),
      setVis(parent, 'explicit', [ACTOR]),
      setVis(grandparent, 'workspace'),
    ];
    const { live, rebuilt } = await liveVersusRebuild(events);

    expect(rebuilt).toEqual(live);
    expect(live.find((row) => row.ticket_id === child)).toMatchObject({
      resolved_mode: 'explicit',
      resolved_user_ids: [ACTOR],
      resolved_from: parent,
    });
  });

  it('a reparent and a set-back-to-inherit rebuild to the same rows they applied to', async () => {
    const [moved, target, origin] = sortedTicketIds(3) as [string, string, string];
    const leaf = newUlid();
    expect(moved < target).toBe(true);
    expect(target < origin).toBe(true);

    const events = [
      created(origin),
      setVis(origin, 'workspace'),
      created(target),
      setVis(target, 'explicit', [ACTOR]),
      created(moved, origin),
      created(leaf, moved),
      setVis(moved, 'project'),
      reparented(moved, target),
      setVis(moved, 'inherit'),
    ];
    const { live, rebuilt } = await liveVersusRebuild(events);

    expect(rebuilt).toEqual(live);
    // The moved subtree ends up on the target's chain with its own claim
    // withdrawn — so neither the reparent nor the withdrawal is a no-op that
    // the equality above would happily agree about.
    expect(live.find((row) => row.ticket_id === moved)).toMatchObject({
      own_mode: 'inherit',
      resolved_mode: 'explicit',
      resolved_from: target,
    });
    expect(live.find((row) => row.ticket_id === leaf)).toMatchObject({
      resolved_mode: 'explicit',
      resolved_from: target,
    });
  });
});

/**
 * A `parent_id` cycle. The command side is expected to refuse one and, on this
 * branch, nothing does: Plan 3's reparent command does not exist yet and the
 * permission gate does not look at ancestry. A projection replays whatever the
 * ledger holds, so the question is what it does when a cycle arrives.
 *
 * What it provides is TERMINATION, and this case claims nothing more. Removing
 * the `visited` set in reResolveSubtree reddens exactly this case and no other
 * — checked, rather than assumed: the first version of this comment said the
 * unguarded walk would hang instead of failing, and it does not.
 *
 * It deliberately does NOT assert determinism, because determinism is FALSE
 * here and asserting it would be the check that passes for the wrong reason.
 * Measured on this branch, `created(G), set(G,'workspace'), created(A,G),
 * created(B,A), reparented(A,B)` leaves live at `workspace`/G for both A and B
 * and a rebuild at `project`/'' for both — recorded as case 6.58.
 */
describe('proj_visibility terminates on a parent_id cycle', () => {
  it('a reparent that closes a loop settles instead of recursing for ever', async () => {
    const parent = newUlid();
    const child = newUlid();
    await applyLive([created(parent), created(child, parent)]);

    // parent now points at its own descendant: parent -> child -> parent.
    await applyLive([reparented(parent, child)]);

    const result = await db.pool.query<{ ticket_id: string; resolved_mode: string }>(
      `SELECT ticket_id, resolved_mode FROM proj_visibility
       WHERE ticket_id = ANY($1) ORDER BY ticket_id`,
      [[parent, child].sort()],
    );
    expect(result.rows).toHaveLength(2);
    // Every row still carries a legal resolved mode — the walk finished and
    // left the table consistent with its own CHECK constraint. WHICH mode is
    // deliberately not asserted; see the docblock.
    for (const row of result.rows) {
      expect(['workspace', 'project', 'explicit']).toContain(row.resolved_mode);
    }
  });
});

/**
 * The projection contract's shadow-schema fence, exercised on this table.
 *
 * Asserting "verify is clean" would catch neither way of falling off it — with
 * no shadow table the verifier skips the diff, and a rebuild into live agrees
 * with itself. So the assertion is that a PLANTED defect in the live table is
 * REPORTED, which only happens if a shadow copy exists to disagree with it.
 */
describe('proj_visibility under verify-projections', () => {
  it('a corrupted live row is reported against the ledger rebuild, and live is left alone', async () => {
    const parent = newUlid();
    const child = newUlid();
    const events = [created(parent), setVis(parent, 'workspace'), created(child, parent)];

    const client = await db.pool.connect();
    try {
      for (const event of events) {
        await insertEvent(client, event);
      }
    } finally {
      client.release();
    }

    // Bring every live projection into agreement with the whole ledger first, so
    // the only drift the verifier can find is the one planted below.
    const projections = buildProjectionRegistry();
    for (const projection of projections.all()) {
      await rebuildProjection(projection.name, { pool: db.pool, projections });
    }
    // proj_tickets is NON-EMPTY before the verdict below is trusted. This case
    // is where that table meets the real verifier: the definitions planted in
    // beforeAll make every ticket.created in this file's ledger fold into
    // proj_tickets, so the EXCEPT diff compares its three jsonb columns live
    // against a shadow-schema rebuild, in both directions. A clean verdict over
    // an empty table is the check that cannot fail, and this series has iterated
    // one twice; drop the beforeAll definitions or stop folding creations and
    // the verdict would stay clean while proving nothing about this table.
    const { rows } = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM proj_tickets',
    );
    expect(
      rows[0]?.n,
      'proj_tickets is empty — the clean verdict below proves nothing about it',
    ).toBeGreaterThan(0);
    // proj_rollups (Plan 3 Chain B Task 11) rides in on the same ledger and
    // needs its own witness for the same reason: this file's `created(child,
    // parent)` gives at least one ticket a parent, so the table has rows, and a
    // clean verdict over it means something. It is also the one place the
    // VERIFIER — rather than `rebuildProjection` — exercises this projection's
    // dependency on registration order: under `search_path = verify_shadow,
    // public` the ticket table it counts is `verify_shadow.proj_tickets`, which
    // is complete only because proj_tickets is replayed into the shadow first.
    const rollups = await db.pool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM proj_rollups',
    );
    expect(
      rollups.rows[0]?.n,
      'proj_rollups is empty — the clean verdict below proves nothing about it',
    ).toBeGreaterThan(0);

    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({
      clean: true,
      diffs: [],
    });

    // Widen one ticket's audience behind the ledger's back — the shape of the
    // corruption this table exists to make detectable.
    await db.pool.query(
      `UPDATE proj_visibility SET resolved_mode = 'workspace', resolved_from = $1
       WHERE ticket_id = $2`,
      [child, child],
    );

    const report = await verifyProjections({ pool: db.pool, projections });
    expect(report.clean).toBe(false);
    expect(report.diffs.map((diff) => diff.table)).toEqual(['proj_visibility']);
    expect(report.diffs[0]).toMatchObject({ missingFromLive: 1, extraInLive: 1 });

    // The verify wrote nothing live: the planted corruption is still there,
    // which it would not be if the rebuild had escaped into the public schema.
    expect(await resolution(child)).toMatchObject({
      resolved_mode: 'workspace',
      resolved_from: child,
    });
  });
});
