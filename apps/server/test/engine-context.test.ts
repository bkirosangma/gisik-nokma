import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createEngineContext } from '../src/engine-context.js';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

/**
 * The seam the coordination doc's Plan 1 consequences §9 named, and the commit
 * that closes it. Registering `ticket.transitioned` made transitions ingestible
 * ten tasks before the server had entity state to judge them against; until
 * Plan 3 Chain B Task 12 the honest answer was null, and the assertions here
 * were what made "honestly" falsifiable.
 *
 * Task 12 gives `getEntityState('ticket')`, `getChildrenStates` and
 * `getTicketTypeDef` real bodies over proj_tickets and proj_ticket_types — in
 * ONE change set, because a context that resolves a parent and then reports it
 * childless refuses nothing while looking like it has checked. The assertions
 * that pinned the nulls are INVERTED here rather than deleted, so the file still
 * reads as the history of what this server could answer and when.
 *
 * Against the body two commits ago (`readEntityHead(...) as unknown as
 * EntityState | null`), every assertion below still fails: the head POINTER
 * comes back for every kind, so a ticket looks like a TicketState with no
 * `workflowId` and a membership looks like a MembershipState with no `role`.
 *
 * `'membership'` was the last kind still answering null, and the step-10
 * integration checkpoint closes it — controller ruling P18, a wiring no task in
 * Plan 4 owned. `getEntityState('membership')` now reads `proj_memberships`
 * through `resolveEffectiveRole`, so `restrict-to`'s role criterion decides
 * something on the server path for the first time; before it, every role-gated
 * edge in the product was refused for everyone, always, because the context
 * could not say that anybody held any role. The membership assertion below is
 * INVERTED, following this file's own rule, and the role-gated transition at
 * the foot grows from one refusal into the refuse/refuse/commit triple that is
 * the only thing which distinguishes a wired role gate from a broken one:
 * a stranger refused, a `member` refused, an `admin` through.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const WORKSPACE = newUlid();
const WORKFLOW = newUlid();
const TICKET = newUlid();
const PROJECT = newUlid();
/**
 * The actor every envelope in this file is filed by, and the one person who is
 * deliberately NEVER granted a membership. Two things rest on that absence: the
 * negative control in the membership case below, and the `restrict-to` refusal
 * at the foot of the file, which is unchanged by ruling P18's wiring precisely
 * because this actor holds no row for the new reader to find. Grant ACTOR a
 * role and both stop measuring anything.
 */
const ACTOR = newUlid();
/** Granted `admin` at the ledger — the role `roleGatedWorkflow`'s only edge names. */
const ADMIN_USER = newUlid();
/** Granted `member` at the ledger — a real membership that the same edge must still refuse. */
const MEMBER_USER = newUlid();
/**
 * Granted `member`, put on a project's roster, then REVOKED — the one person in
 * this file who is not a member and has a `proj_memberships` row standing behind
 * them anyway.
 *
 * That pair is not a curiosity, it is the reason `readMembershipState` goes
 * through `resolveEffectiveRole` instead of selecting the table itself:
 * `membership.revoked` deletes the workspace-scope row ALONE, on purpose, because
 * the roster rows belong to the project entity's stream and a cross-entity delete
 * would make the table depend on arrival interleaving (`projections/proj-memberships.ts`).
 * The guarantee that delete was meant to give lives in `resolveEffectiveRole`'s
 * early return. So this user is the input under which the audited reader and a
 * bare `WHERE workspace_id = $1 AND user_id = $2` disagree — and the disagreement
 * is a revoked person walking a role gate.
 */
const REVOKED_USER = newUlid();
/**
 * The project REVOKED_USER's surviving roster row names. Deliberately NOT
 * `PROJECT`: a `project.member_added` writes that entity a head row, and the
 * identity-only case below asserts `getEntityState('project', PROJECT)` is null
 * on the strength of PROJECT having none.
 */
const ROSTER_PROJECT = newUlid();

function service() {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
}

function submitted(partial: Pick<SubmittedEvent, 'entity' | 'type' | 'payload'>): SubmittedEvent {
  return submittedIn(WORKSPACE, partial);
}

/**
 * The same envelope in a NAMED workspace. Every tenancy case below needs two
 * workspaces, and `submitted`'s closed-over `WORKSPACE` is exactly the thing a
 * cross-tenant assertion must not be able to fall back on.
 */
function submittedIn(
  workspaceId: string,
  partial: Pick<SubmittedEvent, 'entity' | 'type' | 'payload'>,
): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId,
    version: 1,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    ...partial,
  };
}

/**
 * A workspace-scope membership, made the way the product makes one: a real
 * `membership.granted` through the ingest service, which writes
 * `proj_memberships` through its own projection and the membership entity's head
 * row alongside it.
 *
 * Never an `INSERT INTO proj_memberships`. The table is written by two entity
 * streams under disjoint key ownership (`projections/proj-memberships.ts`), the
 * payload is parsed by the door's own schema, and `granted_at`/`workspace_seq`
 * come off the stored event — a hand-written row can satisfy the reader while
 * describing a grant the ledger never carried, which is the shape that lets a
 * test pass against a projection that does not work.
 */
function granted(userId: string, role: 'owner' | 'admin' | 'member' | 'guest'): SubmittedEvent {
  return submitted({
    entity: { kind: 'membership', id: membershipId(WORKSPACE, userId) },
    type: 'membership.granted',
    payload: { userId, role },
  });
}

/**
 * The other half of the revocation fixture, and it is filed against the PROJECT
 * entity rather than the membership — which is the whole reason the surviving
 * row survives. Two streams write `proj_memberships` under disjoint key
 * ownership, and this is the one that writes `scope_kind='project'` with role
 * `'member'` hardcoded (`projections/proj-memberships.ts`); nothing a membership
 * event does will remove it.
 */
function addedToProject(projectId: string, userId: string, projectAdmin: boolean): SubmittedEvent {
  return submitted({
    entity: { kind: 'project', id: projectId },
    type: 'project.member_added',
    payload: { userId, projectAdmin },
  });
}

/** A workspace-scope revocation, through the ledger like everything else here. */
function revoked(userId: string): SubmittedEvent {
  return submitted({
    entity: { kind: 'membership', id: membershipId(WORKSPACE, userId) },
    type: 'membership.revoked',
    payload: { userId },
  });
}

/** A two-state workflow with no rules on any edge, so a transition tests the invariant and not a gate. */
function openWorkflow(id: string): SubmittedEvent['payload'] {
  return {
    id,
    version: 1,
    name: 'Plain',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'shipped', name: 'Shipped', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'shipped', rules: [] },
      { from: 'shipped', to: 'todo', rules: [] },
    ],
  };
}

function typeDefinedIn(
  workspaceId: string,
  def: { id: string; rank: number; workflowId: string },
): SubmittedEvent {
  return submittedIn(workspaceId, {
    entity: { kind: 'ticket-type', id: newUlid() },
    type: 'ticket-type.defined',
    payload: {
      id: def.id,
      name: def.id[0]?.toUpperCase() + def.id.slice(1),
      icon: 'check',
      rank: def.rank,
      workflowId: def.workflowId,
      fields: [],
    },
  });
}

function createdIn(
  workspaceId: string,
  ticketId: string,
  typeId: string,
  parentId: string | null,
  projectId: string,
): SubmittedEvent {
  return submittedIn(workspaceId, {
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId, projectId, parentId, title: `Ticket ${typeId}` },
  });
}

/** A workflow whose only move is guarded by a role — §9's exact scenario. */
const roleGatedWorkflow = submitted({
  entity: { kind: 'workflow', id: WORKFLOW },
  type: 'workflow.defined',
  payload: {
    id: WORKFLOW,
    version: 1,
    name: 'Approvals',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [{ from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', roles: ['admin'] }] }],
  },
});

/**
 * Revert step 1 of the four this file's previous version listed for Task 12.
 * **Rank 3**, the built-in `task` rank: at `DEEPEST_RANK` (4) or below it the
 * create below is refused `hierarchy.deepest-rank-parent-required` for having no
 * parent, and the debugging would be of a type lookup that was working.
 */
const taskTypeDefined = submitted({
  // A FRESH ENTITY ULID, not the type key: the envelope schema requires a ULID
  // entity id, and a ticket type's projection key is its PAYLOAD's `id`. The two
  // are deliberately different things — `test/proj-ticket-types.test.ts` turns
  // that decoupling into its own case — which is also what lets two workspaces
  // define the same type key, the scenario the tenancy tests below rest on.
  entity: { kind: 'ticket-type', id: newUlid() },
  type: 'ticket-type.defined',
  payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: WORKFLOW, fields: [] },
});

const ticketCreated = submitted({
  entity: { kind: 'ticket', id: TICKET },
  type: 'ticket.created',
  payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'File the GST return' },
});

beforeAll(async () => {
  const results = await service().ingestBatch([roleGatedWorkflow, taskTypeDefined, ticketCreated]);
  // ALL THREE COMMIT, and that is Task 12's four-step revert carried out in
  // full — the previous version of this file listed the steps so they would be
  // mechanical rather than inferential, and here they are:
  //
  //   1. a `ticket-type.defined` for `task` was ADDED ahead of the create.
  //      Without one, proj_ticket_types has no row to serve and the create is
  //      still refused `ticket.unknown-type` for a reason that has nothing to do
  //      with the wiring — a context that can read the table is not the same
  //      thing as a table with the type in it.
  //   2. this expectation became three commits.
  //   3. the refusal-object assertion that stood here was DELETED.
  //   4. the ticket head row planted below it was DELETED; the create writes it,
  //      and it writes the proj_tickets row the head used to stand in for.
  //
  // The create committing is itself the discriminator: it resolves `task`
  // through `getTicketTypeDef`, and that method answered null unconditionally
  // until this task.
  expect(results.map((result) => result.status)).toEqual(['committed', 'committed', 'committed']);

  // §9's hazard needs a membership entity that HAS a head and no membership
  // state behind it — "if the membership entity has any committed event the
  // guard passes `!== null`" is the whole sentence. The head is still PLANTED
  // rather than granted, and after ruling P18 that is the point rather than a
  // leftover: a real grant for ACTOR would write a `proj_memberships` row too,
  // and the hazard is exactly the pair "head yes, membership no". This is the
  // one row in this file written by hand, and it is written into
  // proj_entity_heads — never into proj_memberships, which is seeded through
  // the ledger below.
  await db.pool.query(
    `INSERT INTO proj_entity_heads
       (entity_kind, entity_id, workspace_id, head_seq, head_event_id, head_event_type, head_server_time)
     VALUES ('membership', $1, $2, 1, $3, 'membership.granted', '2026-08-20T09:00:01.000Z')`,
    [membershipId(WORKSPACE, ACTOR), WORKSPACE, newUlid()],
  );

  // Ruling P18's fixtures, in their own batch rather than appended to the three
  // above: that array and the essay over it enumerate Task 12's four-step
  // revert, and a fourth and fifth element would falsify the enumeration.
  //
  // Two roles, granted at the ledger, so the role-gated cases below can differ
  // in the ROLE and in nothing else. Asserting the commits is not ceremony — a
  // grant that failed to land would leave the admin transition refused, which is
  // the pre-P18 answer, and the file would read as if it had proved the gap was
  // still open.
  const grants = await service().ingestBatch([
    granted(ADMIN_USER, 'admin'),
    granted(MEMBER_USER, 'member'),
  ]);
  expect(grants.map((result) => result.status)).toEqual(['committed', 'committed']);

  // The revocation fixture, in a batch of its own again, for the same reason:
  // the essay over the two grants says "Two roles", and a third element would
  // make that sentence false.
  //
  // Three events, in this order, because the state they build cannot be reached
  // any other way — grant, put on a project's roster, revoke. What is left
  // behind is a person who belongs to no workspace and still has a
  // `proj_memberships` row, which is the ONE input under which
  // `resolveEffectiveRole` and a bare SELECT of that table give different
  // answers. The order is not decoration: `project.member_added` before the
  // grant would still write the roster row, but the fixture would then be
  // asserting something the product never does, and the revoke must come last
  // or there is nothing to survive it.
  //
  // Every status is asserted, not just the last. A `project.member_added` that
  // was refused would leave REVOKED_USER a plain non-member, and the null below
  // would pass for the ordinary reason instead of the one it is named for.
  const revocation = await service().ingestBatch([
    granted(REVOKED_USER, 'member'),
    addedToProject(ROSTER_PROJECT, REVOKED_USER, true),
    revoked(REVOKED_USER),
  ]);
  expect(revocation.map((result) => result.status)).toEqual([
    'committed',
    'committed',
    'committed',
  ]);
});

/**
 * 5.37 — cited on the block: the server’s `EngineContext` answers HONESTLY about what it can serve while ticket state does not exist yet — `null` for a ticket nothing created, and `null` for a membership that HAS a head but no grant. Each clause is a test in this block.
 */
describe('createEngineContext.getEntityState — what the server can honestly serve', () => {
  it('serves the WHOLE TicketState for a ticket the projections hold — inverted by Task 12', async () => {
    // THE FIRST OF THE TWO ASSERTIONS THIS TASK INVERTS. It read
    // `.toBeNull()`, under a name saying ticket state "does not exist until
    // Plan 3 Task 12". It exists now.
    //
    // Asserted field by field rather than `not.toBeNull()`: the defect this
    // file was written against returned a head POINTER that is not null either,
    // and `workflowId`/`stateCategory` are exactly the fields it lacked. The
    // pair `kind` and `workspaceId` is the total-outage trap `rowToTicketState`
    // documents — `undefined !== env.workspaceId` is always true, so a mapper
    // dropping either refuses every parented create while sounding like a
    // tenancy refusal.
    const client = await db.pool.connect();
    try {
      const ticket = await createEngineContext(client).getEntityState('ticket', TICKET);
      expect(ticket).toMatchObject({
        kind: 'ticket',
        id: TICKET,
        workspaceId: WORKSPACE,
        projectId: PROJECT,
        typeId: 'task',
        parentId: null,
        workflowId: WORKFLOW,
        stateId: 'todo',
        stateCategory: 'open',
      });
    } finally {
      client.release();
    }
  });

  it('answers null for a ticket id nothing ever created — the control that keeps the answer above about THIS ticket', async () => {
    const client = await db.pool.connect();
    try {
      expect(await createEngineContext(client).getEntityState('ticket', newUlid())).toBeNull();
    } finally {
      client.release();
    }
  });

  /**
   * 6.132 — `getEntityState('membership')` serves the WHOLE `MembershipState` for EACH granted role, and every way of not being a member answers null: a head with no grant, and a revoked person.
   */
  it('serves the WHOLE MembershipState for each granted role, and null for a head with no grant and for a revoked person whose roster row survives — inverted by ruling P18', async () => {
    // THE ASSERTION RULING P18 INVERTS. It read `.toBeNull()` under the name
    // "answers null for a membership that HAS a head row — the §9 hazard,
    // planted", and the null was honest at the time: proj_memberships existed
    // and nothing read it through the engine.
    //
    // The answers are asserted in ONE case because none of them is worth
    // anything alone. The two grants prove the reader resolves a role and
    // resolves the RIGHT one; the planted head with no grant behind it is the
    // control that keeps those answers about proj_memberships rather than about
    // a reader that says yes to anything — and it is the SAME shape the §9
    // hazard always was, which is why the head row survives the inversion
    // instead of being deleted with it. The revoked user at the foot is the only
    // input that distinguishes the audited reader from a bare SELECT of the
    // table, and it needs the grants above it in the same run to mean anything.
    //
    // `toEqual` on the whole object, not `toMatchObject`: the defect this file
    // was written against returned a head POINTER that satisfied every partial
    // matcher anyone would have written, and `role` is precisely the field it
    // lacked.
    const client = await db.pool.connect();
    try {
      const ctx = createEngineContext(client);

      expect(await ctx.getEntityState('membership', membershipId(WORKSPACE, ADMIN_USER))).toEqual({
        kind: 'membership',
        id: membershipId(WORKSPACE, ADMIN_USER),
        workspaceId: WORKSPACE,
        userId: ADMIN_USER,
        role: 'admin',
      });

      // BOTH granted roles are read directly, and the second is not a
      // duplicate of the first. `role` is the only field of a MembershipState
      // the engine consults, and until this line `'admin'` was the only role
      // ever DIRECTLY witnessed anywhere in the repo — so a reader that
      // collapsed every other role onto one wrong value passed the whole suite.
      //
      // The direction the earlier sweep's M4 does NOT cover, stated exactly
      // rather than assumed to be covered: a constant `'admin'` IS caught,
      // because the `member` case at the foot of this file then commits a move
      // the edge should have refused. The reverse is invisible there. That case
      // reaches `role` only through a refusal, and a refusal passes for every
      // role the edge does not name, so `'member' → 'guest'` reddens nothing —
      // and what such a collapse WOULD be is ruling P18's own defect wearing a
      // different hat: an OWNER hitting a `restrict-to {roles:['owner']}` edge,
      // refused naming a role they hold.
      //
      // Mutation that reddens this line, naming its own site: return
      // `role: eff.workspaceRole === 'admin' ? 'admin' : 'guest'` from
      // `readMembershipState`.
      expect(await ctx.getEntityState('membership', membershipId(WORKSPACE, MEMBER_USER))).toEqual({
        kind: 'membership',
        id: membershipId(WORKSPACE, MEMBER_USER),
        workspaceId: WORKSPACE,
        userId: MEMBER_USER,
        role: 'member',
      });

      // ACTOR has the planted head row and no `membership.granted` anywhere in
      // the ledger. Mutation that reddens this line, naming its own site: drop
      // the `eff.workspaceRole === null` early return in `readMembershipState`
      // and return the state regardless — the answer becomes a membership with
      // `role: null` for somebody who is not a member of anything.
      expect(await ctx.getEntityState('membership', membershipId(WORKSPACE, ACTOR))).toBeNull();

      // Nobody at all: no head row, no grant. Under the SHIPPED body this is the
      // SAME traversal as the line above — the membership branch answers before
      // `readEntityHead`, so no head is read on this path — and calling the two
      // "different absences" would be exactly the drift this file exists to
      // catch. They are kept for two different reasons instead. This one stops
      // the null above being a reader that says null the second time it is
      // asked; the ACTOR line is a REGRESSION PIN — an input under which the
      // `as unknown as EntityState` cast this file was written against answers
      // something rather than null, because the head row is there for the cast
      // to return. It was the ONLY such input until this round; the revoked user
      // below is now a second, reached through the ledger rather than planted.
      // ACTOR is kept anyway, because the §9 hazard is its own shape and this
      // file records what could be answered and when.
      //
      // NAMING WHAT THAT PIN DOES NOT COVER, since an earlier draft of this
      // comment claimed it and the claim was false: it does not distinguish a
      // head-GATED body — one that read `readEntityHead` first and answered null
      // when there was none — from the shipped one that answers above the head
      // read. Nothing in this suite does. ACTOR has a head and no grant, so a
      // head-gated body reaches the same null by a longer route; and every other
      // membership here was granted through the ledger, which writes the head row
      // in the same transaction as the `proj_memberships` row, so the gate would
      // never be the thing that decided. The pair "membership row, no head row"
      // is what would tell them apart and it is not reachable through the ledger
      // at all — it would have to be manufactured by deleting a head row by hand,
      // which is a fixture describing a database no ingest can produce. The
      // ordering therefore rests on the argument in `engine-context.ts`, which is
      // where it is written down, and not on a case here.
      expect(await ctx.getEntityState('membership', membershipId(WORKSPACE, newUlid()))).toBeNull();

      // THE REVOCATION, and the only assertion in the suite that can tell
      // `resolveEffectiveRole` apart from the `SELECT role FROM proj_memberships
      // WHERE workspace_id = $1 AND user_id = $2` that `readMembershipState`'s
      // docblock warns the next person off writing. Until this line the warning
      // was prose with nothing behind it: that SELECT passes every other case in
      // this file, because everyone else's workspace-scope row either exists or
      // does not.
      //
      // REVOKED_USER's does not, and their project-scope roster row does — by
      // design, not by accident (`membership.revoked` deletes the workspace row
      // alone; see the fixture above). The row is asserted to be there first,
      // because a null that came back from an empty table would be this house's
      // favourite kind of lie.
      const surviving = await db.pool.query(
        `SELECT scope_kind, project_id, role FROM proj_memberships
         WHERE workspace_id = $1 AND user_id = $2`,
        [WORKSPACE, REVOKED_USER],
      );
      expect(surviving.rows).toEqual([
        { scope_kind: 'project', project_id: ROSTER_PROJECT, role: 'member' },
      ]);

      // So: a row exists, and the honest answer is still null, because the row
      // is not evidence of membership. Under the bare SELECT it comes back as
      // `role: 'member'` and a revoked person walks a `restrict-to
      // {roles:['member']}` edge. The ADMIN_USER `toEqual` at the top of this
      // case is the same-run positive control that keeps this null about the
      // reader rather than about a table nothing wrote.
      expect(
        await ctx.getEntityState('membership', membershipId(WORKSPACE, REVOKED_USER)),
      ).toBeNull();
    } finally {
      client.release();
    }
  });

  /**
   * 6.133 — the membership id is decoded FAIL-CLOSED, and the decode is checked by RE-ENCODING it: only an id that re-encodes to itself is served.
   */
  it('serves a membership only for an id that re-encodes to itself — the fail-closed decode', async () => {
    // `membershipId` is `${workspaceId}:${userId}`, and this method is handed
    // the id as a string, so the pair has to be recovered from it. The decode is
    // checked by re-encoding the halves and comparing to the input rather than
    // by reasoning about what can appear inside a ULID.
    //
    // BOTH malformed ids are built from ADMIN_USER, who genuinely resolves —
    // that is the whole design of this case. Built from ACTOR they would answer
    // null with the guard deleted too, and the mutation would survive against a
    // fixture that had nothing to find.
    //
    // Mutation that reddens it, naming its own site: delete the
    // `membershipId(workspaceId, userId) !== id` comparison in
    // `readMembershipState` and the extra-segment id resolves ADMIN_USER's whole
    // state for an id nothing ever minted.
    //
    // The colon-free line is a different branch and is retained on a weaker
    // claim, said plainly rather than dressed up: NO single-clause deletion
    // reddens it. Dropping the `userId === undefined` guard does not compile,
    // and every decode that does compile — `indexOf` and slice, `split` with
    // defaults — hands the round-trip a pair that fails to re-encode, so the
    // answer stays null through all of them. What it can still catch is a decode
    // that THROWS on an id with no separator rather than answering, which is the
    // ordinary way this kind of parser goes wrong, and a throw here would reach
    // the engine as a 500 on an ingest rather than a refusal.
    const client = await db.pool.connect();
    try {
      const ctx = createEngineContext(client);
      const wellFormed = membershipId(WORKSPACE, ADMIN_USER);

      // The positive control, in the same run, so "null" below is the guard and
      // not an empty table.
      expect(await ctx.getEntityState('membership', wellFormed)).toEqual({
        kind: 'membership',
        id: wellFormed,
        workspaceId: WORKSPACE,
        userId: ADMIN_USER,
        role: 'admin',
      });

      expect(await ctx.getEntityState('membership', `${wellFormed}:extra`)).toBeNull();
      expect(await ctx.getEntityState('membership', WORKSPACE)).toBeNull();

      // WHAT THE ROUND TRIP DOES NOT CHECK, named here so nobody reads it as
      // validation: it is a SHAPE test, not a validity test. `':'`, `'<ws>:'` and
      // `':<user>'` all re-encode to themselves, so they pass the guard and reach
      // `resolveEffectiveRole` with an empty string for one half or both. That is
      // harmless and was driven rather than assumed — the query is parameterised,
      // no row matches an empty id, all three answer null and none throws — and
      // no assertion is written for them on purpose: they answer null under the
      // shipped body and under every mutation of it, so a case would be one of
      // the checks that cannot fail. The reason the guard is enough anyway is
      // that these ids are unreachable: the door admits only `^<ULID>:<ULID>$`
      // for a membership entity (`packages/domain/src/events/membership.ts`), and
      // `restrict-to` builds the id from `env.workspaceId` and `env.actorId`.
    } finally {
      client.release();
    }
  });

  it('answers the whole state for kinds whose state IS {kind, id} — existence, and nothing invented', async () => {
    // workspace/project/workflow/ticket-type states are exactly `{kind, id}`
    // today (`OtherEntityState`), so a head row is enough to serve them in
    // full. No cast is involved: the object structurally IS the type, which is
    // what makes the compiler an ally here again.
    const client = await db.pool.connect();
    try {
      const ctx = createEngineContext(client);
      // WORKFLOW has a head row; PROJECT has none. Both answers are about
      // existence and say nothing more, which is the whole of what these
      // states claim — so the pair pins that this is existence and not a
      // constant.
      expect(await ctx.getEntityState('workflow', WORKFLOW)).toEqual({ kind: 'workflow', id: WORKFLOW });
      expect(await ctx.getEntityState('project', PROJECT)).toBeNull();
    } finally {
      client.release();
    }
  });
});

/**
 * `getContest` (Plan 10 Task 4). Asserted through the ENGINE rather than by
 * calling the method: the evaluator is the only consumer, and the three
 * refusals below are the whole reason the method exists. A direct call would
 * prove the SQL runs and nothing about the wiring — and the wiring is what was
 * missing, loudly, until this task (`evaluateClaimContestedResolved` threw
 * "EngineContext.getContest is required" against a context that had none).
 */
describe('createEngineContext.getContest — the contest lookup the engine cannot work without', () => {
  const CONTEST_TICKET = newUlid();
  const OTHER_TICKET = newUlid();

  function contestOn(ticketId: string): SubmittedEvent {
    return submitted({
      entity: { kind: 'ticket', id: ticketId },
      type: 'claim.contested',
      payload: {
        originalEvent: submitted({
          entity: { kind: 'ticket', id: ticketId },
          type: 'ticket.transitioned',
          payload: { toStateId: 'done' },
        }),
        rule: 'restrict-to',
        reason: 'Only the assignee may do this.',
      },
    });
  }

  function resolutionOf(ticketId: string, contestedEventId: string): SubmittedEvent {
    return submitted({
      entity: { kind: 'ticket', id: ticketId },
      type: 'claim.contested_resolved',
      payload: { contestedEventId, resolution: 'discarded', note: 'stale' },
    });
  }

  it('a resolution commits only because the context can READ the contest it names', async () => {
    // Mutation that reddens it, naming its own site: make getContest return
    // null unconditionally in src/engine-context.ts — the evaluator then
    // refuses `contest.unknown` and this commit becomes a refusal.
    const contest = { ...contestOn(CONTEST_TICKET), origin: 'server' as const };
    const [opened] = await service().ingestBatch([contest]);
    expect(opened).toMatchObject({ status: 'committed' });

    const [resolved] = await service().ingestBatch([resolutionOf(CONTEST_TICKET, contest.id)]);
    expect(resolved).toMatchObject({ status: 'committed' });
  });

  it('a resolution naming no recorded contest is refused contest.unknown — null means "never recorded"', async () => {
    const [result] = await service().ingestBatch([resolutionOf(CONTEST_TICKET, newUlid())]);
    expect(result).toMatchObject({ status: 'refused', rule: 'contest.unknown' });
  });

  it('a resolution aimed at a contest on ANOTHER ticket is refused contest.wrong-ticket', async () => {
    // This is what makes the returned `ticketId` load-bearing rather than
    // decorative. Mutation that reddens it: return `env.entity.id` from
    // getContest instead of the projection's `ticket_id`.
    const contest = { ...contestOn(OTHER_TICKET), origin: 'server' as const };
    const [opened] = await service().ingestBatch([contest]);
    expect(opened).toMatchObject({ status: 'committed' });

    const [result] = await service().ingestBatch([resolutionOf(CONTEST_TICKET, contest.id)]);
    expect(result).toMatchObject({ status: 'refused', rule: 'contest.wrong-ticket' });
  });

  it('a second resolution of the same contest is refused contest.already-resolved — the `resolved` column read back', async () => {
    // Mutation that reddens it: return a hard-coded `resolved: false` from
    // getContest. The first resolution still commits; the second one stops
    // being refused, and history gets rewritten.
    const ticket = newUlid();
    const contest = { ...contestOn(ticket), origin: 'server' as const };
    await service().ingestBatch([contest]);
    const [first] = await service().ingestBatch([resolutionOf(ticket, contest.id)]);
    expect(first).toMatchObject({ status: 'committed' });
    const [second] = await service().ingestBatch([resolutionOf(ticket, contest.id)]);
    expect(second).toMatchObject({ status: 'refused', rule: 'contest.already-resolved' });
  });
});

/**
 * 6.134 — cited on the block: the role gate discriminates on the ROLE, not on having one — refuse, refuse, commit, across one ticket and one edge.
 */
describe('a role-gated transition through the shipped server context', () => {
  it('now reaches the role gate and is refused BY IT — §9 observed where §9 predicted', async () => {
    const results = await service().ingestBatch([
      submitted({ entity: { kind: 'ticket', id: TICKET }, type: 'ticket.transitioned', payload: { to: 'done' } }),
    ]);

    // THE SECOND OF THE TWO ASSERTIONS THIS TASK INVERTS, and the refusal moved
    // one layer DOWN rather than away.
    //
    // It used to expect `unknown-ticket` — "no such ticket is known" — which was
    // true of a server whose `getEntityState('ticket')` answered null, and which
    // meant the role gate at the end of this transition was never reached. The
    // ticket resolves now, its workflow resolves, the `todo -> done` edge is
    // found, and `restrict-to` asks the question §9 was always about: is the
    // actor an admin here? ACTOR is a member of nothing, so the answer is no and
    // the move is refused naming the role it wanted.
    //
    // RULING P18 LEAVES THIS CASE WORD FOR WORD UNCHANGED, and that is the
    // reason it cannot stand alone. It passed against a context that answered
    // null for every membership in the world, and it passes against one that
    // reads proj_memberships, because ACTOR holds no row either way — so on its
    // own it is evidence about the refusal and none at all about the wiring. The
    // two cases below are what make it a discriminator: the same edge, the same
    // ticket, differing in the actor's ROLE and in nothing else.
    //
    // Against the `as unknown as EntityState` cast two commits ago, the same
    // batch was refused `unknown-workflow`, reasoning "Ticket <id> uses workflow
    // undefined, but no published definition of that workflow is known." — a
    // sentence naming a workflow called `undefined` and blaming it for a defect
    // in the context.
    expect(results[0]).toEqual({
      status: 'refused',
      eventId: expect.any(String),
      rule: 'restrict-to',
      reason: `Only anyone with the role admin may make this move, and ${ACTOR} is not among them.`,
    });
  });

  it('refuses the SAME move to a real member — the gate discriminates on the role, not on having one', async () => {
    // The case that separates a working role gate from a reader that says yes to
    // anyone it finds a row for, which is the likeliest silent defect in this
    // wiring. MEMBER_USER holds a genuine workspace-scope `proj_memberships` row
    // granted at the ledger; the edge names `admin`; the answer must still be a
    // refusal, and the refusal must name MEMBER_USER rather than ACTOR, so it is
    // this actor's question that was asked.
    //
    // Mutation that reddens it, naming its own site: return
    // `{ ...state, role: 'admin' }` from `readMembershipState`, or drop
    // `eff.workspaceRole` in favour of a constant — this commits and the product
    // has a role gate that only checks attendance.
    const results = await service().ingestBatch([
      {
        ...submitted({
          entity: { kind: 'ticket', id: TICKET },
          type: 'ticket.transitioned',
          payload: { to: 'done' },
        }),
        actorId: MEMBER_USER,
      },
    ]);

    expect(results[0]).toEqual({
      status: 'refused',
      eventId: expect.any(String),
      rule: 'restrict-to',
      reason: `Only anyone with the role admin may make this move, and ${MEMBER_USER} is not among them.`,
    });
  });

  /**
   * 6.50 — closed by the step-10 integration checkpoint: the same move COMMITS for an actor who genuinely holds admin, ruling P18 end to end.
   */
  it('COMMITS the same move for an actor who genuinely holds admin — ruling P18, end to end', async () => {
    // THE INVERSION, and the half the two refusals above are worthless without.
    // Nothing differs from them but the actor's role: same ticket, same edge,
    // same envelope shape, same `restrict-to` rule naming `admin`. Against the
    // shipped server before this task it was refused, exactly like the other
    // two, and so was every role-gated move any workspace could ever define.
    //
    // Mutation that reddens it, naming its own site: restore the old body —
    // `return null` for `kind === 'membership'` in `createEngineContext.getEntityState`
    // — and this commit becomes the refusal above with ADMIN_USER's id in it.
    //
    // THE ORDER OF THE THREE CASES IS LOAD-BEARING and this is the place it
    // matters: `roleGatedWorkflow` has exactly one edge, `todo -> done`, so the
    // commit here puts TICKET in a terminal state with no way out. Run before
    // either refusal, the two refusals would come back `illegal-transition` —
    // passing as refusals, naming a different rule, proving nothing about roles.
    // Refuse, refuse, then commit.
    //
    // That is OBSERVED and not reasoned: the mutation sweep's M4 (a constant
    // `role: 'admin'`) lets the `member` case commit, and this case then fails
    // with `illegal-transition` — "The workflow "Approvals" does not allow moving
    // from "Done" to "Done"." — which is the hazard sentence itself, printed by
    // the suite.
    const results = await service().ingestBatch([
      {
        ...submitted({
          entity: { kind: 'ticket', id: TICKET },
          type: 'ticket.transitioned',
          payload: { to: 'done' },
        }),
        actorId: ADMIN_USER,
      },
    ]);

    expect(results[0]).toEqual({
      status: 'committed',
      eventId: expect.any(String),
      seq: expect.any(Number),
      serverTime: expect.any(String),
    });
  });
});

/**
 * CONTROLLER RULING P14, and its test home — the handoff says so, because no
 * unit test in `@gisik-nokma/rule-engine` can pin it: `buildMemoryContext` and
 * the fixture harness are each built from ONE workspace's events and have no
 * second tenancy to confuse. The hole is a property of a SHARED STORE keyed
 * globally, so it is only reachable where the store is.
 *
 * The shape, in one sentence: two of the four context reads resolve an id the
 * ACTOR supplied, and neither answer carries a workspace for a check to compare
 * against afterwards. `proj_workflows`' key is `(workflow_id, version)` and a
 * ticket type's key is a slug an admin chose, so before the predicates a foreign
 * id RESOLVED and the check that followed ran against another workspace's state
 * graph.
 *
 * Latent until this task and live in the same commit that closes it: both holes
 * are only reachable once `getEntityState('ticket')` and `getTicketTypeDef`
 * answer, which is Task 12.
 *
 * Every case here goes through `service().ingestBatch` — the INTERNAL door. The
 * client door would refuse `ticket.workflow_rebound` at `permission.role` before
 * the engine ever ran (it is in `ADMIN_ONLY_TYPES`), and a refusal for the wrong
 * reason is not evidence about a predicate. What these cases prove is the
 * PREDICATE, not the gate.
 */
describe('createEngineContext — the tenancy predicate on the two ACTOR-supplied lookups (ruling P14)', () => {
  const OTHER_WS = newUlid();
  const OTHER_WORKFLOW = newUlid();
  const HOME_WORKFLOW_2 = newUlid();
  const OTHER_PROJECT = newUlid();
  const REBIND_TICKET = newUlid();

  beforeAll(async () => {
    const results = await service().ingestBatch([
      submittedIn(OTHER_WS, {
        entity: { kind: 'workflow', id: OTHER_WORKFLOW },
        type: 'workflow.defined',
        payload: openWorkflow(OTHER_WORKFLOW),
      }),
      submittedIn(WORKSPACE, {
        entity: { kind: 'workflow', id: HOME_WORKFLOW_2 },
        type: 'workflow.defined',
        payload: openWorkflow(HOME_WORKFLOW_2),
      }),
      // The SAME type key defined in each workspace, which is what makes the
      // create-path case below about tenancy and not about a missing type. It is
      // possible because a ticket type's entity id is a fresh ULID while its
      // projection key is the payload's `id`.
      typeDefinedIn(OTHER_WS, { id: 'gadget', rank: 3, workflowId: OTHER_WORKFLOW }),
      createdIn(WORKSPACE, REBIND_TICKET, 'task', null, PROJECT),
    ]);
    expect(results.map((result) => result.status)).toEqual([
      'committed',
      'committed',
      'committed',
      'committed',
    ]);
  });

  /**
   * 5.65 — ruling P14 on the WORKFLOW lookup: `ctx.getWorkflowDef` resolves an id inside the workspace the EVENT names, never inside the one that owns the workflow.
   */
  it('resolves a workflow id inside the ASKING workspace, never inside the one that owns it', async () => {
    // Three ways, mirroring case 5.16's control shape: found in the workspace
    // that holds it, NOT found from another, and not found anywhere for an id
    // nobody defined. Without the first, a reader that always answered null
    // would pass; without the third, one that answered null only for this
    // particular id would.
    const client = await db.pool.connect();
    try {
      const ctx = createEngineContext(client);
      expect(await ctx.getWorkflowDef({ workspaceId: OTHER_WS }, OTHER_WORKFLOW)).not.toBeNull();
      expect(await ctx.getWorkflowDef({ workspaceId: WORKSPACE }, OTHER_WORKFLOW)).toBeNull();
      expect(await ctx.getWorkflowDef({ workspaceId: OTHER_WS }, newUlid())).toBeNull();
    } finally {
      client.release();
    }
  });

  it("a rebind naming ANOTHER workspace's workflow is refused, and the same event onto a workflow of its own commits", async () => {
    // THE HOLE, end to end. `ctx.getWorkflowDef(p.toWorkflowId)` resolves an id
    // straight off the payload. Without the predicate `OTHER_WORKFLOW` resolves,
    // `shipped` is one of its states, and the rebind is ACCEPTED — a live ticket
    // in WORKSPACE bound to a workflow WORKSPACE cannot see, its board column and
    // its transition rules now another tenant's.
    //
    // Mutation that reddens it, naming its own site: drop `workspace_id` from
    // the first selector branch of `getWorkflowDefFromProjection`.
    const [foreign] = await service().ingestBatch([
      submittedIn(WORKSPACE, {
        entity: { kind: 'ticket', id: REBIND_TICKET },
        type: 'ticket.workflow_rebound',
        payload: { toWorkflowId: OTHER_WORKFLOW, toStateId: 'shipped' },
      }),
    ]);
    expect(foreign).toMatchObject({ status: 'refused', rule: 'ticket.rebound-unknown-workflow' });

    // The positive control, and it is the same event differing only in WHOSE
    // workflow it names. Without it this file would prove that rebinds are
    // refused, which is not the property.
    const [own] = await service().ingestBatch([
      submittedIn(WORKSPACE, {
        entity: { kind: 'ticket', id: REBIND_TICKET },
        type: 'ticket.workflow_rebound',
        payload: { toWorkflowId: HOME_WORKFLOW_2, toStateId: 'shipped' },
      }),
    ]);
    expect(own).toMatchObject({ status: 'committed' });
  });

  /**
   * 5.66 — ruling P14 on the TICKET-TYPE lookup, the create path’s instance of the same shape: a `ticket.created` naming a type key another workspace defined is refused, and the same key commits where it was defined.
   */
  it('a create naming a type key ANOTHER workspace defined is refused, and the same key commits where it was defined', async () => {
    // The create path's instance of the same shape — `getTicketTypeDef(ctx, p.typeId)`
    // resolving an actor-chosen slug. `gadget` exists in OTHER_WS and nowhere
    // else. Unscoped, WORKSPACE would receive OTHER_WS's rank, workflow binding
    // and field list, and the ticket would be created onto a workflow its own
    // workspace has never published.
    //
    // Mutation that reddens it: pass a literal workspace id, or the row's own,
    // to `getTicketTypeFromDb` in `createEngineContext.getTicketTypeDef`.
    const [foreign] = await service().ingestBatch([
      createdIn(WORKSPACE, newUlid(), 'gadget', null, PROJECT),
    ]);
    expect(foreign).toMatchObject({ status: 'refused', rule: 'ticket.unknown-type' });

    const [athome] = await service().ingestBatch([
      createdIn(OTHER_WS, newUlid(), 'gadget', null, OTHER_PROJECT),
    ]);
    expect(athome).toMatchObject({ status: 'committed' });

    // And a key nothing defined anywhere, so "refused" above is the workspace
    // clause rather than a reader that always says null.
    const [nowhere] = await service().ingestBatch([
      createdIn(OTHER_WS, newUlid(), 'nonesuch', null, OTHER_PROJECT),
    ]);
    expect(nowhere).toMatchObject({ status: 'refused', rule: 'ticket.unknown-type' });
  });

  /**
   * 5.67 — the server’s ticket lookup is GLOBAL on purpose: a parent in another workspace RESOLVES, and ruling P12’s guard is what refuses it — which is why the lookup stays global rather than being narrowed.
   */
  it("a parent in another workspace RESOLVES, and P12's guard is what refuses it — which is why the ticket lookup stays global", async () => {
    // The other side of the same ruling, and the reason `getEntityState` takes
    // no scope. The foreign parent is FOUND here — that is the point — and
    // `checkTicketCreated` refuses it by comparing `parent.workspaceId` to
    // `env.workspaceId`. Scope the reader and this guard becomes a branch no
    // input can take: it would go on passing with `workspaceId` dropped from
    // `rowToTicketState`, which is the total-outage trap.
    const foreignParent = newUlid();
    const [seeded] = await service().ingestBatch([
      createdIn(OTHER_WS, foreignParent, 'gadget', null, OTHER_PROJECT),
    ]);
    expect(seeded).toMatchObject({ status: 'committed' });

    // Asserted directly as well as through the check: the context really does
    // serve a ticket from a workspace other than the asking one. If it did not,
    // the refusal below would be the SAME refusal for the opposite reason.
    const client = await db.pool.connect();
    try {
      const state = await createEngineContext(client).getEntityState('ticket', foreignParent);
      expect(state).toMatchObject({ kind: 'ticket', id: foreignParent, workspaceId: OTHER_WS });
    } finally {
      client.release();
    }

    const [crossTenant] = await service().ingestBatch([
      createdIn(WORKSPACE, newUlid(), 'task', foreignParent, PROJECT),
    ]);
    expect(crossTenant).toMatchObject({ status: 'refused', rule: 'hierarchy.unknown-parent' });

    // The second way of not existing, one refusal (ruling P12): a parent id
    // nothing ever created is refused with the same rule and never with a
    // sentence that confirms the id exists somewhere.
    const [absentParent] = await service().ingestBatch([
      createdIn(WORKSPACE, newUlid(), 'task', newUlid(), PROJECT),
    ]);
    expect(absentParent).toMatchObject({ status: 'refused', rule: 'hierarchy.unknown-parent' });
  });
});

/**
 * INVARIANT 3 AGAINST POSTGRES — case 5.13's second half, and case 5.18.
 *
 * The fixture suite already proves the parent-terminal refusal against
 * `buildInMemoryContext`. What it cannot prove is that the SERVER answers the
 * same question the same way, because the server's answer comes from two SQL
 * reads that did not exist until this task. `getChildrenStates` returned `[]`
 * unconditionally, so this invariant refused nothing on this server while every
 * fixture went on passing.
 *
 * Its own workflow, with no rule on any edge: `roleGatedWorkflow` above guards
 * `todo -> done` with `restrict-to`, and a child that cannot move for a
 * PERMISSION reason would make every assertion here pass without the invariant
 * ever being consulted.
 */
describe('createEngineContext — direct children and the parent-terminal invariant, against Postgres', () => {
  const FAMILY_WF = newUlid();
  const FAMILY_PROJECT = newUlid();
  const PARENT = newUlid();
  const CHILD_A = newUlid();
  const CHILD_B = newUlid();
  const GRANDCHILD = newUlid();

  beforeAll(async () => {
    const results = await service().ingestBatch([
      submitted({
        entity: { kind: 'workflow', id: FAMILY_WF },
        type: 'workflow.defined',
        payload: openWorkflow(FAMILY_WF),
      }),
      typeDefinedIn(WORKSPACE, { id: 'saga', rank: 2, workflowId: FAMILY_WF }),
      typeDefinedIn(WORKSPACE, { id: 'chore', rank: 3, workflowId: FAMILY_WF }),
      typeDefinedIn(WORKSPACE, { id: 'errand', rank: 4, workflowId: FAMILY_WF }),
      createdIn(WORKSPACE, PARENT, 'saga', null, FAMILY_PROJECT),
      createdIn(WORKSPACE, CHILD_A, 'chore', PARENT, FAMILY_PROJECT),
      createdIn(WORKSPACE, CHILD_B, 'chore', PARENT, FAMILY_PROJECT),
      createdIn(WORKSPACE, GRANDCHILD, 'errand', CHILD_A, FAMILY_PROJECT),
    ]);
    // Every one of these has to commit, and asserting it is not ceremony: a
    // family that failed to assemble would leave the invariant below with
    // nothing to refuse, and the refusal-then-acceptance sequence would still
    // read as if it had worked.
    expect(results.map((result) => result.status)).toEqual(Array(8).fill('committed'));
  });

  it('serves DIRECT children only — the grandchild exists, is a descendant, and is not counted', async () => {
    const client = await db.pool.connect();
    try {
      const children = await createEngineContext(client).getChildrenStates(PARENT);
      expect(children.map((child) => child.id).sort()).toEqual([CHILD_A, CHILD_B].sort());
      expect(children.map((child) => child.stateCategory)).toEqual(['open', 'open']);
      // The grandchild is real and reachable through its own parent, so "direct"
      // is a claim about the query and not about an empty subtree.
      expect((await createEngineContext(client).getChildrenStates(CHILD_A)).map((c) => c.id)).toEqual([
        GRANDCHILD,
      ]);
    } finally {
      client.release();
    }
  });

  it('refuses the parent going terminal while a child is open, and accepts once every child is settled', async () => {
    const shipped = (id: string): SubmittedEvent =>
      submitted({ entity: { kind: 'ticket', id }, type: 'ticket.transitioned', payload: { to: 'shipped' } });

    // Settle the grandchild first: CHILD_A is itself a parent, and the same
    // invariant would refuse its move for its own open child. That is the
    // invariant holding at two levels, which is what makes DIRECT children
    // sufficient by induction.
    expect(await service().ingestBatch([shipped(GRANDCHILD)])).toMatchObject([{ status: 'committed' }]);
    expect(await service().ingestBatch([shipped(CHILD_A)])).toMatchObject([{ status: 'committed' }]);

    // CHILD_B is still open. Mutation that reddens this line, naming its own
    // site: return `[]` from `createEngineContext.getChildrenStates` — the shape
    // this method had until this task — and the refusal becomes a commit.
    expect(await service().ingestBatch([shipped(PARENT)])).toMatchObject([
      { status: 'refused', rule: 'parent-terminal-with-open-children' },
    ]);

    expect(await service().ingestBatch([shipped(CHILD_B)])).toMatchObject([{ status: 'committed' }]);

    // The accepting twin, and the reason the refusal above is about open
    // children rather than about parents: nothing else changed.
    expect(await service().ingestBatch([shipped(PARENT)])).toMatchObject([{ status: 'committed' }]);
  });
});
