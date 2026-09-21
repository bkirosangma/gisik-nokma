import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance, InjectOptions } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { ticketTypesProjection } from '../../src/projections/ticket-types.js';
import { applyAll, seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * The sheet's breadcrumb data — `key` and `epic` — **served by the REAL route
 * against a REAL database**, which is the only evidence this repo accepts for a
 * wire field.
 *
 * ## Why this file exists rather than a case in the client's suite
 *
 * The client's sheet cases (`16.63`–`16.68`) drive the CRUMB and they drive it
 * through a fake data source. A fake is exactly the thing that *"excuses the
 * server from existing"* — this series' signature failure — and neither field
 * had a server-side consumer before 2026-09-20: `ticketNumber` was referenced
 * only by its own tests, and `epicAncestors` was private to the list route. So
 * the two facts the breadcrumb is BUILT on get their own door-proven cases here.
 *
 * ## What a mocked version of this file would have proved
 *
 * Nothing about the composition. `key` is three LEDGER reads joined by
 * `ticketKey`, and each of the three can be wrong independently: the workspace
 * prefix is a fold over `workspace.created`, the project prefix is resolved
 * against EVERY project in the workspace (uniqueness and derivation are
 * workspace-wide rules), and the number is the ticket's position among its
 * project's creations by `workspace_seq`. A fixture that stubbed any one of
 * them would pin the join and nothing else.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let phoneCounter = 0;

async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9198000${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

function get(url: string, headers?: Record<string, string>): Promise<{ statusCode: number; json: () => any }> {
  const options: InjectOptions = { method: 'GET', url, ...(headers ? { headers } : {}) };
  return app.inject(options) as never;
}

/**
 * A workspace with a founding claim, so `workspaceIdentityFromLedger` has a NAME
 * and a PREFIX to answer with.
 *
 * ⚠ **`projectPrefixesInWorkspace` resolves against every project in the
 * workspace**, not just this one — the uniqueness rule is workspace-wide and a
 * project that entered nothing still derives a prefix — so a case that wants to
 * pin the project half must control the whole set. One project per case here.
 */
async function seedFounding(workspaceId: string, prefix: string): Promise<void> {
  await appendTestEvent(
    db.pool,
    testEnvelope({
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.created',
      payload: { name: 'Convenience Corner', prefix },
      actorId: newUlid(),
    }),
  );
}

/**
 * A ticket TYPE — the row `proj_ticket_types` folds, and the thing the epic
 * walk resolves its rank against.
 *
 * ⚠ **`seedTicket` deliberately does not write this table** (its own docblock:
 * the founding sequence is not run by these fixtures), so a case that wants an
 * EPIC-rank ancestor must ask for one.
 *
 * ⚠⚠ **AND `applyAll` DOES NOT PROJECT IT.** My first version of this helper
 * called `applyAll` and wrote a comment claiming *"the projection is what
 * writes `proj_ticket_types`"* — which is true of `applyAll`'s four projections
 * and FALSE of this event type. That helper's own docblock says so in as many
 * words (*"FOUR of the registry's projections, and the name does not say so …
 * hand this a `workflow.defined` and it goes NOWHERE and reports nothing"*),
 * and the failure it produces is exactly the quiet one: the event is in the
 * ledger, no row is written, and the case reddens as *"the walk found no epic"*
 * — a green-looking fixture and a red assertion about the wrong thing.
 *
 * So this follows `seedWorkflowDef`'s recorded pattern: append the event AND
 * apply the ONE projection it needs, by hand.
 */
async function seedType(workspaceId: string, id: string, rank: number): Promise<void> {
  const event = testEnvelope({
    workspaceId,
    entity: { kind: 'ticket-type', id },
    type: 'ticket-type.defined',
    payload: { id, name: id, icon: 'flag', rank, workflowId: 'wf-seed', fields: [] },
    actorId: newUlid(),
  });
  await appendTestEvent(db.pool, event);
  const client = await db.pool.connect();
  try {
    await ticketTypesProjection.apply(event, client);
  } finally {
    client.release();
  }
}

describe('16.69 the detail route composes the ticket KEY from three ledger facts', () => {
  it('the bare key reaches the wire, and the NUMBER is the ticket’s position in its project', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedFounding(ws, 'CC');
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');

    const first = newUlid();
    const second = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: first });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: second });

    // BOTH read, in one case, because "the number" is a POSITION and a single
    // read cannot tell a correct position from a constant. A route answering
    // `1` for everything passes the first assertion alone.
    const firstRead = await get(`/v1/workspaces/${ws}/tickets/${first}`, headers);
    expect(firstRead.statusCode).toBe(200);
    expect(firstRead.json().key).toBe('CCSO-1');

    const secondRead = await get(`/v1/workspaces/${ws}/tickets/${second}`, headers);
    expect(secondRead.statusCode).toBe(200);
    expect(secondRead.json().key).toBe('CCSO-2');

    // The WORKSPACE half is the fold, not a constant: a second workspace with a
    // different founding prefix must not answer the same string.
    const otherWs = newUlid();
    const otherPrj = newUlid();
    const { userId: otherUser, headers: otherHeaders } = await signedIn();
    await seedMember(db.pool, otherWs, otherUser, 'member', [{ projectId: otherPrj }]);
    await seedFounding(otherWs, 'ZZ');
    await seedProject(db.pool, otherWs, otherPrj, 'Shop operations', undefined, 'SO');
    const otherTicket = newUlid();
    await seedTicket(db.pool, { workspaceId: otherWs, projectId: otherPrj, ticketId: otherTicket });

    const otherRead = await get(`/v1/workspaces/${otherWs}/tickets/${otherTicket}`, otherHeaders);
    expect(otherRead.json().key).toBe('ZZSO-1');
  });

  it('a workspace with NO founding claim answers key null, and the rest of the read still serves', async () => {
    // The absence half, and the reason it is a CASE rather than a comment:
    // `read/ticket-numbers.ts` rules that a key is not worth refusing a ticket
    // read over, so `null` must reach the wire WITHOUT taking the read down.
    // Asserted beside a field that IS served, so a route that 500'd, or one
    // that answered an empty body, cannot pass this by being empty.
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');
    const ticketId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId });

    const res = await get(`/v1/workspaces/${ws}/tickets/${ticketId}`, headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().key).toBeNull();
    expect(res.json().title).toBe(`Ticket ${ticketId}`);
  });
});

describe('P3 the PARENT ref carries the parent’s own key', () => {
  /**
   * P3 — the prototype labels its parent crumb `p.id + " " + p.title`
   * (`Gisik Nokma - Desktop.dc.html:3417`) and the product had no key on the
   * wire for an ancestor, so its crumb read the title alone and a ticket whose
   * epic and parent share a title drew two identical crumbs. The parent ref now
   * carries the key, composed by the SAME three facts the ticket's own uses.
   *
   * ⚠ THE NUMBER IS THE PARENT'S POSITION, NOT THE CHILD'S, and that is the one
   * thing this case can get wrong while looking right: both tickets are seeded
   * in one project, so a route that composed the parent's key from the CHILD's
   * number would answer `CCSO-2` for a parent whose own position is 1 — and a
   * single-ticket fixture could not tell the two apart.
   */
  it('17.027 / P3 the parent’s key is the parent’s own — its own POSITION, not the child’s', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedFounding(ws, 'CC');
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');

    const parentId = newUlid();
    const childId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parentId });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: childId, parentId });

    const childRead = await get(`/v1/workspaces/${ws}/tickets/${childId}`, headers);
    expect(childRead.statusCode).toBe(200);
    // The CHILD's own key is its own position — 2.
    expect(childRead.json().key).toBe('CCSO-2');
    // And the PARENT's key is the parent's position — 1. Different numbers, so
    // one composed from the other cannot pass.
    expect(childRead.json().parent).toMatchObject({ kind: 'ticket', id: parentId, key: 'CCSO-1' });
    expect(childRead.json().parent.key).not.toBe(childRead.json().key);

    // ⚠ THE GRANDPARENT CARRIES NO KEY, and that is the prototype's asymmetry
    // rather than an omission — its epic crumb is `e.title` alone, so serving
    // one would put a field on the wire for a crumb that does not read it. It is
    // a STRUCTURAL fact here (`AncestorRef` has no such field, and the type is
    // the witness), and the runtime arm is in 16.70, whose fixture has an epic
    // at all: this chain has none, so `epic` is null for that reason and an
    // assertion here would be about the absence of an ancestor, not a key.
    //
    // ⚠ AND THE `key: null` ARM IS NOT HERE, DELIBERATELY. It is the
    // ticket-number ruling's own absence — a number outside the snapshot the
    // number is derived from — and **this suite cannot produce a snapshot-bounded
    // read**: `seedTicket` always appends its `ticket.created`, so every ticket a
    // route test can build HAS a creation position. A case claiming to drive it
    // would need a mechanism invented for the test. The null arm is witnessed at
    // the CLIENT (a fixture with `key: null` renders the title alone) and by
    // 16.69's own no-founding-claim case, which drives the same three-way check
    // for the ticket's key; the parent's uses the identical expression.
    expect(childRead.json().parent.key).toBe('CCSO-1');
  });

});

describe('16.70 the grandparent is the nearest PROPER ancestor of EPIC rank', () => {
  it('resolves through an intermediate parent, and is null for the epic itself', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');
    await seedType(ws, 'epic', 1);
    await seedType(ws, 'story', 2);
    await seedType(ws, 'task', 3);

    const epicId = newUlid();
    const storyId = newUlid();
    const taskId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: epicId, typeId: 'epic' });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: storyId, typeId: 'story', parentId: epicId,
    });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: taskId, typeId: 'task', parentId: storyId,
    });

    // THE WALK IS TWO HOPS, which is the whole point: the task's immediate
    // parent is the STORY and must not be reported as the grandparent.
    const taskRead = await get(`/v1/workspaces/${ws}/tickets/${taskId}`, headers);
    expect(taskRead.statusCode).toBe(200);
    expect(taskRead.json().epic).toEqual({ kind: 'ticket', id: epicId, title: `Ticket ${epicId}` });
    expect(taskRead.json().parent).toMatchObject({ kind: 'ticket', id: storyId });

    // ⚠ THE PROPERTY THAT SEPARATES THIS FROM THE BOARD'S GROUPING. The list
    // route resolves the nearest epic-rank ancestor-OR-SELF, because a lane
    // legitimately holds an epic's own card. A CRUMB does not: the epic's own
    // sheet must not draw itself one level above itself. This assertion is what
    // fails on a version that reused `epicAncestorOf` unchanged.
    const epicRead = await get(`/v1/workspaces/${ws}/tickets/${epicId}`, headers);
    expect(epicRead.json().epic).toBeNull();

    // And the control for THAT: a task with no epic above it is also null, so
    // the assertion above is not passing merely because every epic is null.
    const rootTask = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: rootTask, typeId: 'task' });
    const rootRead = await get(`/v1/workspaces/${ws}/tickets/${rootTask}`, headers);
    expect(rootRead.json().epic).toBeNull();

    // ⚠ AND THE ARM THAT SEPARATES "THERE IS NO TICKET THERE" FROM "THERE IS
    // ONE YOU MAY NOT SEE" — the two answers `canSee` gives alike, and which an
    // earlier version of the walk COLLAPSED. A `parent_id` naming a ticket that
    // was never created must answer `null`; the collapsed version answered
    // `{kind:'restricted', id:<never created>}`, asserting the existence of a
    // ticket the system has no evidence for. Case 6.68 owns the property at the
    // PARENT field; this is the same question one hop further up, where the
    // walk — not the parent branch — was the thing asking.
    const neverCreated = newUlid();
    const dangling = newUlid();
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: dangling, typeId: 'task', parentId: neverCreated,
    });
    const danglingRead = await get(`/v1/workspaces/${ws}/tickets/${dangling}`, headers);
    expect(danglingRead.statusCode).toBe(200);
    expect(danglingRead.json().parent).toBeNull();
    expect(danglingRead.json().epic).toBeNull();
  });

  /**
   * E5-3 / E4-1 — THE ONE-HOP SHAPE: WHEN THE DIRECT PARENT **IS** THE EPIC,
   * THE TWO REFS NAME THE SAME TICKET.
   *
   * The walk above resolves through an intermediate parent and reports the epic
   * two hops up. This case is the shape it does NOT cover, and the one the
   * seeded project is made of: **23 of the 26 tickets have an epic as their
   * direct parent**, so `cursor = state.parentId` is already epic-rank on the
   * FIRST iteration and the walk returns `{kind:'ticket', id: cursor}` — the
   * same row the parent branch reports.
   *
   * **THIS CASE PINS A CONTRACT THE CLIENT DEPENDS ON, and that is why it is
   * here rather than in the sheet's suite.** `ticket-sheet.tsx` now compares
   * the two ids and drops the epic crumb when they agree, because the server
   * sends both. If a future change has the route NULL the epic when it equals
   * the parent — the other remedy the finding offered — this case reddens and
   * the client comparison has to be revisited in the same change rather than
   * quietly becoming dead code that still looks load-bearing.
   *
   * The dossier's own authority gives no guidance: the prototype never draws
   * this shape, because every `parentId` and every `epicId` in its fixtures come
   * from disjoint sets.
   */
  it('17.026 / E5-3 the direct parent IS the epic: both refs name the same ticket', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');
    await seedType(ws, 'epic', 1);
    await seedType(ws, 'task', 3);

    const epicId = newUlid();
    const taskId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: epicId, typeId: 'epic' });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: taskId, typeId: 'task', parentId: epicId,
    });

    const read = await get(`/v1/workspaces/${ws}/tickets/${taskId}`, headers);
    expect(read.statusCode).toBe(200);
    expect(read.json().epic).toEqual({ kind: 'ticket', id: epicId, title: `Ticket ${epicId}` });
    expect(read.json().parent).toMatchObject({ kind: 'ticket', id: epicId });

    // THE PROPERTY, stated apart from the two refs it holds of: they are the
    // SAME TICKET. This is the fact the sheet compares, and stating it here is
    // what makes the client's one-line guard a consequence of the wire rather
    // than a guess about it.
    expect(read.json().epic.id).toBe(read.json().parent.id);

    // CONTROL — the two-hop shape does NOT satisfy that, so the assertion above
    // is not passing merely because `epic` and `parent` are always equal. One
    // more ticket under a story is enough, and it is built here rather than
    // inherited from the case above so the two cannot drift apart.
    const storyId = newUlid();
    const deepTask = newUlid();
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: storyId, typeId: 'task', parentId: epicId,
    });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: deepTask, typeId: 'task', parentId: storyId,
    });
    const deepRead = await get(`/v1/workspaces/${ws}/tickets/${deepTask}`, headers);
    expect(deepRead.json().epic.id).toBe(epicId);
    expect(deepRead.json().parent.id).toBe(storyId);
    expect(deepRead.json().epic.id).not.toBe(deepRead.json().parent.id);
  });

  it('a grandparent the viewer may NOT see is restricted — existence and id, no title', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const { userId, headers } = await signedIn();
    await seedMember(db.pool, ws, userId, 'member', [{ projectId: prj }]);
    await seedProject(db.pool, ws, prj, 'Shop operations', undefined, 'SO');
    await seedType(ws, 'epic', 1);
    await seedType(ws, 'story', 2);
    await seedType(ws, 'task', 3);

    const epicId = newUlid();
    const storyId = newUlid();
    const taskId = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: epicId, typeId: 'epic' });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: storyId, typeId: 'story', parentId: epicId,
    });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: taskId, typeId: 'task', parentId: storyId,
    });
    // The EPIC alone is put out of reach, and the story is authored back to
    // `project` so the walk has one hop to take before it hits the restriction.
    // Both moves are asserted below rather than assumed.
    await applyAll(db.pool, [
      setVisibilityEnv(ws, epicId, 'explicit', [newUlid()]),
      setVisibilityEnv(ws, storyId, 'project'),
      setVisibilityEnv(ws, taskId, 'project'),
    ]);

    const epicDirect = await get(`/v1/workspaces/${ws}/tickets/${epicId}`, headers);
    expect(epicDirect.statusCode).toBe(404);

    const res = await get(`/v1/workspaces/${ws}/tickets/${taskId}`, headers);
    expect(res.statusCode).toBe(200);
    // EXACT, so a leaked title reddens. The arm structurally has no field for
    // one — `AncestorRef`'s restricted member carries `id` and nothing else.
    expect(res.json().epic).toEqual({ kind: 'restricted', id: epicId });
    expect(JSON.stringify(res.json())).not.toContain(`Ticket ${epicId}`);
    // And the parent is still VISIBLE in the same run, so "restricted" is a
    // contrast between two arms rather than the shape of every ancestor.
    expect(res.json().parent).toMatchObject({ kind: 'ticket', id: storyId });
  });
});
