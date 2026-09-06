import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, newUlid } from '@gisik-nokma/domain';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedMember, setVisibilityEnv } from '../helpers/seed.js';
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

let memberId = '';
let strangerId = '';
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
  memberId = member.userId;
  strangerId = stranger.userId;
  memberHeaders = { authorization: `Bearer ${member.token}` };
  strangerHeaders = { authorization: `Bearer ${stranger.token}` };

  await seedMember(db.pool, WS, memberId, 'member', [{ projectId: PROJECT }]);
  await seedMember(db.pool, WS, owner.userId, 'owner', [{ projectId: PROJECT, projectAdmin: true }]);
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
  ]);
  for (const r of results) {
    if (r.status !== 'committed') throw new Error(`seed failed: ${JSON.stringify(r)}`);
  }

  // THE NARROWING. `LOST` becomes explicit to the owner alone; the member keeps
  // the copy on their device and is told nothing, which IS case 6.104.
  await applyAll(db.pool, [setVisibilityEnv(WS, LOST, 'explicit', [owner.userId], owner.userId)]);
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
    expect(body).toEqual({ workspaceId: WS, restricted: [{ kind: 'restricted', id: LOST }] });

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
    // "here is everything you may no longer see" would name every ticket in
    // every project this member is not on.
    const { statusCode, body } = await reconcile(memberHeaders, [LOST]);
    expect(statusCode).toBe(200);
    expect(body).toEqual({ workspaceId: WS, restricted: [{ kind: 'restricted', id: LOST }] });
    // Not "the array is short" — the id must appear in NO field of the response.
    expect(JSON.stringify(body)).not.toContain(KEPT);

    // And presenting only the KEPT one yields an empty answer rather than an
    // opportunistic list. This is the positive control's mirror: an empty
    // `restricted` is a real answer, not a failure mode.
    const kept = await reconcile(memberHeaders, [KEPT]);
    expect(kept.body).toEqual({ workspaceId: WS, restricted: [] });
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
    });

    // A repeated id is answered once — repeating must not multiply the work,
    // and must not make the answer's LENGTH a second channel.
    const repeated = await reconcile(memberHeaders, [LOST, LOST, LOST]);
    expect(repeated.body).toEqual({ workspaceId: WS, restricted: [{ kind: 'restricted', id: LOST }] });
  });
});
