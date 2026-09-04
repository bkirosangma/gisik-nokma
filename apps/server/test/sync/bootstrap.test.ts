import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, newUlid } from '@gisik-nokma/domain';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedGuest, seedMember, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';

/**
 * `GET /v1/sync/bootstrap` — 12.94-12.97 (`test-cases/12-offline-sync-apps.md`).
 *
 * Everything here is seeded through REAL events and REAL projections, the same
 * discipline `contests-route.test.ts` uses: the memberships, visibility rows
 * and the ticket ledger itself arrive the way the product leaves them, and
 * session user ids are the ones the tokens actually resolve to (never a
 * literal like `'usr_member'`) — `resolveEffectiveRole` reads
 * `request.currentUserId`, so a seed naming a made-up id would grant nothing to
 * the caller under test.
 */

let db: TestDatabase;
let app: FastifyInstance;
let ingest: IngestService;
let otp: import('../../src/auth/otp-sender.js').LogOtpSender;

const WS = newUlid();
const PROJECT = newUlid();
const VISIBLE = newUlid();
const HIDDEN = newUlid();
const SHARED = newUlid();
// `entity.id` is `ulidString` for every kind, workflow/ticket-type included —
// `'wf_basic'`/`'task'` throw at the envelope parse (`malformed-envelope`).
const WF_BASIC = newUlid();
const TASK_TYPE = newUlid();
// A second workspace, seeded with its own definitions and nothing else
// (12.99, mirroring 12.93's `WS2` precedent in `snapshot-writer.test.ts`): a
// single-workspace fixture cannot catch the `definitions` query dropping its
// `workspace_id = $1` filter, because there is nothing foreign for a leak to
// carry. This gives WS a sibling with real `workflow.defined`/`ticket-type.defined`
// rows that must never appear in WS's own bootstrap.
const WS2 = newUlid();
const WS2_WF = newUlid();
const WS2_TYPE = newUlid();

let memberId = '';
let guestId = '';
let memberHeaders: Record<string, string> = {};
let guestHeaders: Record<string, string> = {};

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  ingest = built.ingest;
  otp = built.otp;

  const member = await signInWithPhone(app, otp, '+911111111111');
  const guest = await signInWithPhone(app, otp, '+912222222222');
  memberId = member.userId;
  guestId = guest.userId;
  memberHeaders = { authorization: `Bearer ${member.token}` };
  guestHeaders = { authorization: `Bearer ${guest.token}` };

  const submit = (entity: { kind: 'workflow' | 'ticket-type' | 'ticket'; id: string }, type: string, payload: unknown) =>
    newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: memberId, origin: 'server' });

  const seedResults = await ingest.ingestBatch([
    submit({ kind: 'workflow', id: WF_BASIC }, 'workflow.defined', {
      id: WF_BASIC,
      version: 1,
      name: 'Basic',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: '*', to: 'done', rules: [] },
        { from: '*', to: 'todo', rules: [] },
      ],
    }),
    submit({ kind: 'ticket-type', id: TASK_TYPE }, 'ticket-type.defined', {
      id: TASK_TYPE,
      name: 'Task',
      icon: 'check',
      rank: 3,
      workflowId: WF_BASIC,
      fields: [],
    }),
    submit({ kind: 'ticket', id: VISIBLE }, 'ticket.created', {
      typeId: TASK_TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Seen',
    }),
    submit({ kind: 'ticket', id: VISIBLE }, 'comment.added', { body: { type: 'doc', content: [] } }),
    submit({ kind: 'ticket', id: HIDDEN }, 'ticket.created', {
      typeId: TASK_TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Unseen',
    }),
    submit({ kind: 'ticket', id: SHARED }, 'ticket.created', {
      typeId: TASK_TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Shared with the guest',
    }),
  ]);
  for (const result of seedResults) {
    if (result.status !== 'committed') {
      // eslint-disable-next-line no-console
      console.error('seed result not committed:', JSON.stringify(result));
    }
    expect(result.status).toBe('committed');
  }

  // WS2's own definitions (12.99) — a workspace WS's bootstrap must never see.
  const ws2Results = await ingest.ingestBatch([
    newSubmittedEvent({
      workspaceId: WS2,
      entity: { kind: 'workflow', id: WS2_WF },
      type: 'workflow.defined',
      payload: {
        id: WS2_WF,
        version: 1,
        name: 'WS2 workflow',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: '*', to: 'done', rules: [] }],
      },
      actorId: memberId,
      origin: 'server',
    }),
    newSubmittedEvent({
      workspaceId: WS2,
      entity: { kind: 'ticket-type', id: WS2_TYPE },
      type: 'ticket-type.defined',
      payload: { id: WS2_TYPE, name: 'WS2 type', icon: 'check', rank: 1, workflowId: WS2_WF, fields: [] },
      actorId: memberId,
      origin: 'server',
    }),
  ]);
  for (const result of ws2Results) {
    expect(result.status).toBe('committed');
  }

  // 22 more field_sets so VISIBLE's snapshot lands (threshold 20): 1 created +
  // 1 comment + 22 field_sets = seq 24. `title` is a built-in every ticket type
  // carries — a custom field (e.g. `notes`) would need a declared field on the
  // ticket type, which `fields: []` above does not have, and would refuse
  // `field.unknown`.
  for (let i = 0; i < 22; i += 1) {
    const [result] = await ingest.ingestBatch([
      submit({ kind: 'ticket', id: VISIBLE }, 'ticket.field_set', { fieldId: 'title', value: `Seen v${i}` }),
    ]);
    expect(result).toMatchObject({ status: 'committed' });
  }

  // Assert the snapshot pass actually wrote what the tests below assume — a
  // pass that writes nothing would otherwise surface later as a bare
  // TypeError on `visible.snapshot.seq`, at a site that does not name the
  // cause.
  const { written } = await runSnapshotPass(db.pool, { minEvents: 20 });
  expect(written).toEqual([{ entityId: VISIBLE, seq: 24 }]);

  await seedMember(db.pool, WS, memberId, 'member', [{ projectId: PROJECT }]);
  await seedGuest(db.pool, WS, guestId);

  const otherUserId = newUlid();
  await applyAll(db.pool, [
    setVisibilityEnv(WS, VISIBLE, 'workspace'),
    setVisibilityEnv(WS, HIDDEN, 'explicit', [otherUserId]),
    setVisibilityEnv(WS, SHARED, 'explicit', [guestId]),
  ]);
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('GET /v1/sync/bootstrap', () => {
  it('12.94 hands a member the snapshot + tail for a visible ticket, definitions, me (real project ids, not tuples), and the stream cursor', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/sync/bootstrap?workspaceId=${WS}`,
      headers: memberHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workspaceId).toBe(WS);
    // Regression for the plan's own bug: `EffectiveRole.projects` is a
    // `Map<string, {projectAdmin}>`, so `[...eff.projects]` spreads
    // `[key, value]` TUPLES. `projectIds` must be `[PROJECT]`, not
    // `[[PROJECT, {projectAdmin:false}]]` — the tuple form fails this
    // assertion loudly rather than passing on an empty array.
    expect(body.me).toEqual({ userId: memberId, workspaceRole: 'member', projectIds: [PROJECT] });
    // The real cursor, not merely a positive number: `readStreamSeq` is called
    // directly (the same function the route calls) so a hardcoded stand-in —
    // e.g. `const streamSeq = 1` — fails this equality even though `1` also
    // satisfies `toBeGreaterThan(0)`. Read AFTER the request: the route's own
    // transaction is the only writer touching WS in this window, so the
    // post-request cursor and the one the route saw agree.
    expect(body.streamSeq).toBe(await readStreamSeq(db.pool, WS));
    expect(body.definitions.map((d: { type: string }) => d.type).sort()).toEqual([
      'ticket-type.defined',
      'workflow.defined',
    ]);

    expect(body.tickets).toHaveLength(1);
    const visible = body.tickets[0];
    expect(visible.ticketId).toBe(VISIBLE);
    expect(visible.snapshot.seq).toBe(24);
    expect(visible.snapshot.state.stateId).toBe('todo');
    // the comment predates the snapshot but still travels — content is not state
    expect(visible.events.some((e: { type: string }) => e.type === 'comment.added')).toBe(true);
    // and nothing in the tail predates the snapshot except the four backfill
    // types — hardcoded here (not imported from `BOOTSTRAP_BACKFILL_TYPES`) so
    // that shrinking the constant would shrink both sides of the check and
    // leave this green for the wrong reason.
    for (const e of visible.events) {
      const isBackfill = ['comment.added', 'attachment.added', 'claim.contested', 'claim.contested_resolved'].includes(
        e.type,
      );
      expect(e.seq > 24 || isBackfill).toBe(true);
    }
  });

  it('12.95 planted defect: an invisible ticket is absent — no id, no stub, nothing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/sync/bootstrap?workspaceId=${WS}`,
      headers: memberHeaders,
    });
    expect(res.statusCode).toBe(200);
    const raw = JSON.stringify(res.json());
    // Positive control, same run: a route that answered `tickets: []` to
    // everyone would also make HIDDEN "absent" for a reason unrelated to
    // visibility. VISIBLE must actually be present for the absence to mean
    // anything.
    expect(raw).toContain(VISIBLE);
    expect(raw).not.toContain(HIDDEN);
  });

  it('12.96 a guest gets definitions and exactly the ticket explicitly shared with them — not the workspace-mode one (positive control on the empty case)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/sync/bootstrap?workspaceId=${WS}`,
      headers: guestHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tickets.map((t: { ticketId: string }) => t.ticketId)).toEqual([SHARED]);
    expect(body.definitions).toHaveLength(2); // definitions go to everyone incl. guests (Plan 4 §5)

    // The un-snapshotted branch (`snapshot: null`, full history), never
    // exercised anywhere else in this file: SHARED has too few events to
    // snapshot (`ticket.created` only), so `bootstrapTicket`'s `snapshot?.seq
    // ?? 0` fallback is what decides its whole tail. A fallback of
    // `Number.MAX_SAFE_INTEGER` (which would silently empty `events` for
    // every un-snapshotted ticket) passes every OTHER assertion in this file
    // but fails these two.
    const shared = body.tickets[0];
    expect(shared.snapshot).toBeNull();
    expect(shared.events.some((e: { type: string }) => e.type === 'ticket.created')).toBe(true);
  });

  it('12.97 403s a non-member naming this workspace; 401s a request with no session at all', async () => {
    const stranger = await signInWithPhone(app, otp, '+913333333333');
    const forbidden = await app.inject({
      method: 'GET',
      url: `/v1/sync/bootstrap?workspaceId=${WS}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ error: 'not_a_member' });

    const anon = await app.inject({ method: 'GET', url: `/v1/sync/bootstrap?workspaceId=${WS}` });
    expect(anon.statusCode).toBe(401);
  });

  it('12.98 opens its transaction at REPEATABLE READ, not the default READ COMMITTED — the consistent-cut guarantee the route\'s own doc comment claims', async () => {
    // Neither `streamSeq`'s value nor any other field in the response body
    // can distinguish `BEGIN ISOLATION LEVEL REPEATABLE READ` from a plain
    // `BEGIN` in a single-request test with no concurrent writer — both
    // produce the same numbers. The isolation level is a transaction-setup
    // fact, not a value in the payload, so it is asserted directly: wrap
    // `db.pool.connect` to record every SQL string every connection this
    // request opens issues, and check the exact literal was one of them.
    const originalConnect = db.pool.connect.bind(db.pool);
    const queries: string[] = [];
    // pg's `connect` overloads (callback vs promise form) aren't worth
    // reproducing here — cast the replacement rather than fight the type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.pool as any).connect = async (...args: unknown[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = await (originalConnect as any)(...args);
      const originalQuery = client.query.bind(client);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.query = (...queryArgs: any[]) => {
        if (typeof queryArgs[0] === 'string') queries.push(queryArgs[0]);
        return originalQuery(...queryArgs);
      };
      return client;
    };
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/v1/sync/bootstrap?workspaceId=${WS}`,
        headers: memberHeaders,
      });
      expect(res.statusCode).toBe(200);
    } finally {
      db.pool.connect = originalConnect;
    }
    // `requireSession` and other machinery may issue their own `pool.connect`
    // calls on the same request (auth lookups, etc.) — this route's own
    // transaction-opener is asserted by content, not by position.
    expect(queries).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ');
  });

  it('12.99 the definitions query is scoped to the requested workspace — a sibling workspace\'s workflow/ticket-type definitions never leak in', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/sync/bootstrap?workspaceId=${WS}`,
      headers: memberHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // WS2 (seeded in beforeAll, mirroring 12.93's cross-workspace fixture) has
    // its own workflow.defined/ticket-type.defined rows. If the `definitions`
    // query's `workspace_id = $1` clause were dropped, WS2's rows would be
    // in this list too — this is the assertion 12.94's fixed-length check
    // only catches incidentally; here it is named directly.
    const defIds = body.definitions.map((d: { entity: { id: string } }) => d.entity.id);
    expect(defIds).not.toContain(WS2_WF);
    expect(defIds).not.toContain(WS2_TYPE);
    expect(defIds.sort()).toEqual([TASK_TYPE, WF_BASIC].sort());
  });
});
