import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, newUlid } from '@gisik-nokma/domain';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedGuest, seedMember, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * `POST /v1/sync/reconcile` — closure 5's NARROW half (ruling P37), the copy
 * nobody takes away.
 *
 * ## What this door has to get right, and why the obvious shape is wrong
 *
 * Case 6.104's residual is a member un-shared by a plain `visibility.set` who
 * keeps a stale copy for ever. The server cannot fix it by pushing a purge —
 * that names an entity to a device that may never have held it, which is what
 * struck the per-event walk (6.100, 6.101) and what P23 declines to reopen. So
 * the CLIENT presents and the server answers only about what was presented.
 *
 * The trap is that the safe-looking implementation reopens the hole through the
 * shape of its reply rather than its content. A handler that OMITTED ids it had
 * no row for, and marked only the known-but-invisible ones `restricted`, would
 * make presence-versus-absence an existence oracle — "cannot distinguish lost
 * from never-had" closed in the content and reopened in the envelope. 12.286 is
 * written against exactly that, and it is the case that would go green under
 * the wrong implementation of everything else.
 *
 * Every id here is a ULID and every membership and visibility row arrives
 * through real events and real projections — the discipline `bootstrap.test.ts`
 * sets, for its stated reason: `resolveEffectiveRole` reads
 * `request.currentUserId`, so a seed naming a made-up id grants the caller
 * under test nothing.
 */

let db: TestDatabase;
let app: FastifyInstance;
let ingest: IngestService;
let otp: import('../../src/auth/otp-sender.js').LogOtpSender;

const WS = newUlid();
const PROJECT = newUlid();
const WF = newUlid();
const TASK_TYPE = newUlid();
/** Stays visible to the member throughout — the positive control in every case below. */
const KEPT = newUlid();
/** Narrowed away from the member by a real `visibility.set`. This is 6.104's ticket. */
const LOST = newUlid();
/** Explicitly shared with the guest and kept — the guest-side positive control. */
const SHARED_TO_GUEST = newUlid();
/** Explicitly shared with the guest and then taken back. This is 6.102's ticket. */
const UNSHARED = newUlid();

let memberId = '';
let strangerId = '';
/** Closure 5b(c) — 6.102's guest side. Holds SHARED_TO_GUEST, loses UNSHARED. */
let guestHeaders: Record<string, string> = {};
let memberHeaders: Record<string, string> = {};
let strangerHeaders: Record<string, string> = {};

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  ingest = built.ingest;
  otp = built.otp;

  const member = await signInWithPhone(app, otp, '+913333333331');
  const stranger = await signInWithPhone(app, otp, '+913333333332');
  const owner = await signInWithPhone(app, otp, '+913333333333');
  const guest = await signInWithPhone(app, otp, '+913333333334');
  guestHeaders = { authorization: `Bearer ${guest.token}` };
  memberId = member.userId;
  strangerId = stranger.userId;
  memberHeaders = { authorization: `Bearer ${member.token}` };
  strangerHeaders = { authorization: `Bearer ${stranger.token}` };

  await seedMember(db.pool, WS, memberId, 'member', [{ projectId: PROJECT }]);
  await seedMember(db.pool, WS, owner.userId, 'owner', [{ projectId: PROJECT, projectAdmin: true }]);
  // A guest belongs to the workspace and to NO project; everything they reach
  // comes from an explicit `visibility.set` list.
  await seedGuest(db.pool, WS, guest.userId);
  // The stranger is deliberately given NO row in WS at all.
  expect(strangerId).not.toBe(memberId);

  const submit = (entity: { kind: 'workflow' | 'ticket-type' | 'ticket'; id: string }, type: string, payload: unknown) =>
    newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: owner.userId, origin: 'server' });

  const results = await ingest.ingestBatch([
    submit({ kind: 'workflow', id: WF }, 'workflow.defined', {
      id: WF,
      version: 1,
      name: 'Basic',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: '*', to: 'done', rules: [] }],
    }),
    submit({ kind: 'ticket-type', id: TASK_TYPE }, 'ticket-type.defined', {
      id: TASK_TYPE,
      name: 'Task',
      icon: 'check',
      rank: 3,
      workflowId: WF,
      fields: [],
    }),
    submit({ kind: 'ticket', id: KEPT }, 'ticket.created', {
      typeId: TASK_TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Still mine',
    }),
    submit({ kind: 'ticket', id: LOST }, 'ticket.created', {
      typeId: TASK_TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Taken away',
    }),
    submit({ kind: 'ticket', id: SHARED_TO_GUEST }, 'ticket.created', {
      typeId: TASK_TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Still shared with the guest',
    }),
    submit({ kind: 'ticket', id: UNSHARED }, 'ticket.created', {
      typeId: TASK_TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Was shared with the guest',
    }),
  ]);
  for (const r of results) {
    if (r.status !== 'committed') throw new Error(`seed failed: ${JSON.stringify(r)}`);
  }

  // THE NARROWING. `LOST` becomes explicit to the owner alone; the member keeps
  // the copy on their device and is told nothing, which IS case 6.104.
  await applyAll(db.pool, [
    setVisibilityEnv(WS, LOST, 'explicit', [owner.userId], owner.userId),
    // The guest's two tickets. Both were explicitly shared with them; then
    // UNSHARED is retargeted to the owner alone, which is 6.102 exactly — the
    // guest keeps the copy and is told nothing, because the `!isGuest` gate
    // that closes 6.100 closes this door too.
    setVisibilityEnv(WS, SHARED_TO_GUEST, 'explicit', [owner.userId, guest.userId], owner.userId),
    setVisibilityEnv(WS, UNSHARED, 'explicit', [owner.userId, guest.userId], owner.userId),
    setVisibilityEnv(WS, UNSHARED, 'explicit', [owner.userId], owner.userId),
  ]);
});

afterAll(async () => {
  await db.drop();
});

async function reconcile(
  headers: Record<string, string>,
  heldIds: string[],
  workspaceId: string = WS,
): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/sync/reconcile',
    headers,
    payload: { workspaceId, heldIds },
  });
  return { statusCode: res.statusCode, body: res.statusCode === 200 ? res.json() : res.json() };
}

describe('POST /v1/sync/reconcile — the copy nobody takes away (closure 5, ruling P37)', () => {
  it('12.284 answers "restricted" for the ticket that was narrowed away and says nothing about the one still held', async () => {
    const { statusCode, body } = await reconcile(memberHeaders, [KEPT, LOST]);
    expect(statusCode).toBe(200);
    // Exact: `KEPT` must not appear, and `LOST` must, and there must be nothing
    // else. A `toContainEqual` alone would pass on an answer that restricted
    // both — which is the answer that wipes a replica.
    expect(body).toEqual({
      workspaceId: WS,
      restricted: [{ kind: 'restricted', id: LOST }],
      restrictedNotes: [],
    });

    // A caller with no role in the workspace never reaches `canSee`, so this
    // door cannot be used as an id probe by someone outside. Same refusal
    // `/v1/sync/bootstrap` gives, and it is asserted with the SAME ids the
    // member just got a real answer for — so the 403 is about the caller, not
    // about the ids.
    const outsider = await reconcile(strangerHeaders, [KEPT, LOST]);
    expect(outsider.statusCode).toBe(403);
    expect(outsider.body).toEqual({ error: 'not_a_member' });
  });

  it('12.285 the answer can only name ids the caller presented — the workspace is never enumerated', async () => {
    // Present ONLY the lost one. `KEPT` exists, is in the same workspace, and is
    // visible; a handler that walked the workspace instead of the request would
    // have every opportunity to mention it, and an implementation that answered
    // "here is everything you may no longer see" would name every ticket
    // this member may not see (rule A, 2026-09-29: not "in every project they are
    // not on" — a member is on all of them; the explicit list is what hides one).
    const { statusCode, body } = await reconcile(memberHeaders, [LOST]);
    expect(statusCode).toBe(200);
    expect(body).toEqual({
      workspaceId: WS,
      restricted: [{ kind: 'restricted', id: LOST }],
      restrictedNotes: [],
    });
    // Not "the array is short" — the id must appear in NO field of the response.
    expect(JSON.stringify(body)).not.toContain(KEPT);

    // And presenting only the KEPT one yields an empty answer rather than an
    // opportunistic list. This is the positive control's mirror: an empty
    // `restricted` is a real answer, not a failure mode.
    const kept = await reconcile(memberHeaders, [KEPT]);
    expect(kept.body).toEqual({ workspaceId: WS, restricted: [], restrictedNotes: [] });
  });

  it('12.286 an id that never existed answers EXACTLY as a genuine loss — no existence oracle', async () => {
    const neverMinted = newUlid();
    const fabricated = await reconcile(memberHeaders, [neverMinted]);
    const genuine = await reconcile(memberHeaders, [LOST]);
    expect(fabricated.statusCode).toBe(genuine.statusCode);
    // The two answers differ ONLY in the id echoed back, which is the id the
    // caller typed. Substituting one for the other makes them identical — so
    // the response carries no bit distinguishing "you lost it" from "it never
    // was". `canSee` answers `false` for both by design and says so; this door
    // is the second reader depending on that sentence.
    expect(JSON.stringify(fabricated.body).split(neverMinted).join(LOST)).toBe(JSON.stringify(genuine.body));

    // Mixed in one request, the ordering is the caller's and both are named —
    // so a client cannot infer existence from position either.
    const mixed = await reconcile(memberHeaders, [neverMinted, KEPT, LOST]);
    expect(mixed.body).toEqual({
      workspaceId: WS,
      restricted: [
        { kind: 'restricted', id: neverMinted },
        { kind: 'restricted', id: LOST },
      ],
      restrictedNotes: [],
    });

    // A repeated id is answered once — repeating must not multiply the work,
    // and must not make the answer's LENGTH a second channel.
    const repeated = await reconcile(memberHeaders, [LOST, LOST, LOST]);
    expect(repeated.body).toEqual({
      workspaceId: WS,
      restricted: [{ kind: 'restricted', id: LOST }],
      restrictedNotes: [],
    });
  });

  it('12.304 CLOSURE 5b(c): the same door answers a GUEST, which is 6.102 and was never measured', async () => {
    // 6.102 is 6.104's guest-side sibling and closure 5 closed only the member
    // half — not because the guest half needed anything different, but because
    // nothing had ever asked. The primitive is role-independent by
    // construction: `reconcileHeldIds` asks `canSee` and nothing else, and
    // `canSee` resolves a guest through the explicit list the same way it
    // resolves a member through a project. So this is an APPLICATION of the
    // shipped rule rather than a new one, and it is closed by measuring it.
    //
    // Both ids in ONE request, and the assertion is exact. A guest presenting
    // only the lost id could be answered "restricted" by a door that restricted
    // everything a guest named — which is the shape that would wipe a guest's
    // whole device — and an exact `toEqual` over both is the only assertion
    // that can tell the two apart.
    const { statusCode, body } = await reconcile(guestHeaders, [SHARED_TO_GUEST, UNSHARED]);
    expect(statusCode).toBe(200);
    expect(body).toEqual({
      workspaceId: WS,
      restricted: [{ kind: 'restricted', id: UNSHARED }],
      restrictedNotes: [],
    });

    // The MEMBER's answer for the same two ids, in the same run. Neither is
    // shared with them and neither is in a mode they reach, so both come back
    // restricted — which is the control proving the guest's asymmetric answer
    // above is about the explicit list and not about the door being lenient.
    const asMember = await reconcile(memberHeaders, [SHARED_TO_GUEST, UNSHARED]);
    expect(asMember.body).toEqual({
      workspaceId: WS,
      restricted: [{ kind: 'restricted', id: SHARED_TO_GUEST }, { kind: 'restricted', id: UNSHARED }],
      restrictedNotes: [],
    });

    // And a guest is still refused nothing structurally: they are a member of
    // the workspace, so the 403 gate does not fire on them. Without this line
    // the case could pass against a door that refused guests outright, since a
    // 403 body would not equal the expected object either — but it would fail
    // for the wrong reason, and a reader would not know which.
    expect(statusCode).not.toBe(403);
  });
});
