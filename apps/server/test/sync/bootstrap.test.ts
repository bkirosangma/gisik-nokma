import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import { buildContestedClaim } from '../../src/sync/contest-coherence.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedGuest, seedMember, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';

/**
 * `GET /v1/sync/bootstrap` — 12.94-12.99 and 12.115-12.118
 * (`test-cases/12-offline-sync-apps.md`). *This line said `12.94-12.97` from the
 * round that added 12.98-12.99 until the round that added 12.115-12.118 —
 * exactly the stale-enumeration bug that round was fixing in two other places.
 * A range in prose is a fact about a moment; recount it from the `it(` blocks.*
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

/**
 * A THIRD workspace, and its own member — the fixture for 12.115-12.117.
 *
 * Deliberately not `WS`: every one of 12.94-12.99's assertions is an exact
 * equality over what `WS` contains (`written` is one entry, `tickets` has
 * length 1, `definitions` is exactly two types, the tail's boundary is
 * literally seq 24). Adding a ticket or a definition to `WS` to exercise a new
 * property would redden four unrelated cases for a reason none of them names.
 * `WS2` will not do either: it has definitions but no member, so nothing can
 * bootstrap it.
 *
 * What `WS3` carries that `WS` cannot: a ticket whose stream holds a REAL
 * `visibility.set` ledger row, a real `claim.contested` and its resolution, all
 * three BELOW a snapshot — and one ticket-type key defined TWICE on different
 * entity streams, the winner given the smaller ULID (12.92's construction).
 */
const WS3 = newUlid();
const WS3_PROJECT = newUlid();
const AUDIT = newUlid();
/** The attachment 12.363 follows from the ledger into the bootstrap payload. */
const AUDIT_ATTACHMENT = newUlid();
const WS3_WF_OLD = newUlid();
const WS3_WF_NEW = newUlid();
/**
 * The ticket-type KEY (`payload.id`), which is not any entity id: the whole
 * point of 12.117 is that one key's definitions live on two different entity
 * streams. Nothing ties `payload.id` to `entity.id` — `bootstrap-workspace.ts`
 * mints a fresh ULID for the entity and carries the key in the payload.
 */
const WS3_TYPE_KEY = newUlid();
// Ordered BY CONSTRUCTION, not by mint order: `newUlid()` is not monotonic
// within a millisecond (12.92 caught exactly that on its first run). The
// WINNING definition — the later one on the workspace stream — is put on the
// SMALLER entity id, so an `ORDER BY entity_kind, entity_id, seq` hands the
// replica the LOSER first and naive last-write-wins picks it.
const typeEntityA = newUlid();
const typeEntityB = newUlid();
const WS3_TYPE_WINNER_ENTITY = typeEntityA < typeEntityB ? typeEntityA : typeEntityB;
const WS3_TYPE_LOSER_ENTITY = typeEntityA < typeEntityB ? typeEntityB : typeEntityA;

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

  // ---- WS3 (12.115-12.117) --------------------------------------------
  // The premise 12.117 rests on, asserted before anything relies on it, and
  // asserted STRICTLY so the degenerate case the construction cannot rule out
  // — two equal ids, which would put both definitions on one entity stream and
  // make the discrimination vanish while every assertion below still passed —
  // fails here instead of passing silently.
  expect(WS3_TYPE_WINNER_ENTITY < WS3_TYPE_LOSER_ENTITY).toBe(true);

  const ws3Workflow = (id: string, name: string) => ({
    id,
    version: 1,
    name,
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: '*', to: 'done', rules: [] },
      { from: '*', to: 'todo', rules: [] },
    ],
  });
  const ws3Submit = (
    entity: { kind: 'workflow' | 'ticket-type' | 'ticket'; id: string },
    type: string,
    payload: unknown,
  ) =>
    newSubmittedEvent({ workspaceId: WS3, entity, type, payload, actorId: memberId, origin: 'server' });

  const ws3Defs = await ingest.ingestBatch([
    ws3Submit({ kind: 'workflow', id: WS3_WF_OLD }, 'workflow.defined', ws3Workflow(WS3_WF_OLD, 'Old')),
    ws3Submit({ kind: 'workflow', id: WS3_WF_NEW }, 'workflow.defined', ws3Workflow(WS3_WF_NEW, 'New')),
    // The LOSING definition, published FIRST and on the LATER-sorting entity id.
    ws3Submit({ kind: 'ticket-type', id: WS3_TYPE_LOSER_ENTITY }, 'ticket-type.defined', {
      id: WS3_TYPE_KEY,
      name: 'Audit (superseded)',
      icon: 'check',
      rank: 3,
      workflowId: WS3_WF_OLD,
      fields: [],
    }),
    // The WINNING definition: later on the workspace stream, earlier by entity id.
    ws3Submit({ kind: 'ticket-type', id: WS3_TYPE_WINNER_ENTITY }, 'ticket-type.defined', {
      id: WS3_TYPE_KEY,
      name: 'Audit (rebound)',
      icon: 'check',
      rank: 3,
      workflowId: WS3_WF_NEW,
      fields: [],
    }),
  ]);
  for (const result of ws3Defs) expect(result.status).toBe('committed');

  // AUDIT's stream: created, a REAL `visibility.set` ledger row, a comment, a
  // contest and its resolution — then 22 field_sets to push the snapshot above
  // all five. The three non-folded types are the point: the snapshot writer
  // skips them while still advancing `seq` past them, so they exist ONLY in the
  // backfill or nowhere.
  const ws3Ticket = await ingest.ingestBatch([
    ws3Submit({ kind: 'ticket', id: AUDIT }, 'ticket.created', {
      typeId: WS3_TYPE_KEY,
      projectId: WS3_PROJECT,
      parentId: null,
      title: 'Audited',
    }),
    // Seeded as a real EVENT, not through `setVisibilityEnv`: `applyAll` runs
    // the projections only (`test/helpers/seed.ts`) and writes no `events`
    // row, so the rest of this fixture contains zero `visibility.set` ledger
    // rows and no case built on it could ever see the backfill gap.
    ws3Submit({ kind: 'ticket', id: AUDIT }, 'visibility.set', {
      ticketId: AUDIT,
      mode: 'workspace',
    }),
    ws3Submit({ kind: 'ticket', id: AUDIT }, 'comment.added', { body: { type: 'doc', content: [] } }),
    // For 12.363. Seeded here with the comment and the `visibility.set`, so it
    // lands BELOW the snapshot cut the 22 field_sets push up — the only
    // position from which the backfill clause is what carries it. The reducer
    // does not fold `attachment.added` into `TicketState`, so a snapshot never
    // holds it and "it arrived" can only mean the backfill list named it.
    ws3Submit({ kind: 'ticket', id: AUDIT }, 'attachment.added', {
      kind: 'upload',
      attachmentId: AUDIT_ATTACHMENT,
      filename: 'audit-trail.pdf',
      mime: 'application/pdf',
      size: 4096,
      sha256: 'b'.repeat(64),
    }),
  ]);
  for (const result of ws3Ticket) expect(result.status).toBe('committed');

  const auditRefusal: SubmittedEvent = {
    id: newUlid(),
    workspaceId: WS3,
    entity: { kind: 'ticket', id: AUDIT },
    type: 'ticket.transitioned',
    version: 1,
    payload: { toStateId: 'done' },
    actorId: memberId,
    origin: 'mobile',
    clientTime: '2026-08-20T09:00:00.000Z',
  };
  const auditContest = buildContestedClaim({
    originalEvent: auditRefusal,
    rule: 'require-field',
    reason: 'A due date is required before this move.',
    actorId: newUlid(),
  });
  const [contestResult] = await ingest.ingestBatch([auditContest]);
  expect(contestResult).toMatchObject({ status: 'committed' });
  // A separate batch, as `contests-route.test.ts` does it: the resolution's
  // evaluator reads `proj_contested`, so the contest has to have landed.
  const [resolutionResult] = await ingest.ingestBatch([
    {
      id: newUlid(),
      workspaceId: WS3,
      entity: { kind: 'ticket', id: AUDIT },
      type: 'claim.contested_resolved',
      version: 1,
      payload: { contestedEventId: auditContest.id, resolution: 'discarded', note: 'stale' },
      actorId: memberId,
      origin: 'web',
      clientTime: '2026-08-20T11:00:00.000Z',
    },
  ]);
  expect(resolutionResult).toMatchObject({ status: 'committed' });

  for (let i = 0; i < 22; i += 1) {
    const [result] = await ingest.ingestBatch([
      ws3Submit({ kind: 'ticket', id: AUDIT }, 'ticket.field_set', { fieldId: 'title', value: `Audited v${i}` }),
    ]);
    expect(result).toMatchObject({ status: 'committed' });
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
  // Sorted by entity id rather than compared in pass order: `runSnapshotPass`
  // sweeps every workspace, so WS3's AUDIT is due in the same pass and the due
  // query's ordering is not this test's business. The seqs stay exact —
  // AUDIT's 28 is what places its `visibility.set` (seq 2), comment (3),
  // attachment (4), contest (5) and resolution (6) BELOW the snapshot, which
  // is the whole premise of 12.115, 12.116 and 12.363.
  //
  // It was 27 until 12.363 seeded the attachment, and this line is why that
  // edit could not land silently: an exact premise is what turns "one more
  // event in the fixture" into a failure HERE, naming the seed, instead of a
  // vacuous pass three cases below where the attachment would have sat above
  // the cut and travelled for a reason that has nothing to do with the
  // backfill list. The number is not the property; being forced to restate it
  // deliberately is.
  const { written } = await runSnapshotPass(db.pool, { minEvents: 20 });
  expect([...written].sort((a, b) => a.entityId.localeCompare(b.entityId))).toEqual(
    [
      { entityId: VISIBLE, seq: 24 },
      { entityId: AUDIT, seq: 28 },
    ].sort((a, b) => a.entityId.localeCompare(b.entityId)),
  );

  await seedMember(db.pool, WS, memberId, 'member', [{ projectId: PROJECT }]);
  await seedGuest(db.pool, WS, guestId);
  await seedMember(db.pool, WS3, memberId, 'member', [{ projectId: WS3_PROJECT }]);

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
    // and nothing in the tail predates the snapshot except the five backfill
    // types — hardcoded here (not imported from `BOOTSTRAP_BACKFILL_TYPES`) so
    // that shrinking the constant would shrink both sides of the check and
    // leave this green for the wrong reason. This ticket's stream carries only
    // one of the five, so this loop is a boundary check, not a backfill check:
    // 12.115 and 12.116 are where each type is made to travel.
    for (const e of visible.events) {
      const isBackfill = [
        'comment.added',
        'attachment.added',
        'visibility.set',
        'claim.contested',
        'claim.contested_resolved',
      ].includes(e.type);
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

  /** WS3's bootstrap, fetched once per case — the fixture is read-only. */
  async function bootstrapWs3(): Promise<{
    definitions: { type: string; workspaceSeq: number; entity: { id: string }; payload: Record<string, unknown> }[];
    tickets: {
      ticketId: string;
      snapshot: { seq: number } | null;
      events: { type: string; seq: number; payload: Record<string, unknown> }[];
    }[];
  }> {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/sync/bootstrap?workspaceId=${WS3}`,
      headers: memberHeaders,
    });
    expect(res.statusCode).toBe(200);
    return res.json();
  }

  it('12.115 a `visibility.set` filed BELOW a ticket\'s snapshot seq still reaches the replica — the reducer never folded it, so a snapshot does not carry it', async () => {
    const body = await bootstrapWs3();
    const audit = body.tickets.find((t) => t.ticketId === AUDIT);
    expect(audit).toBeDefined();
    // The premise, asserted rather than assumed: this ticket HAS a snapshot and
    // the event under test really sits at or below it. Without this the case
    // would pass vacuously the day the fixture's seq arithmetic shifted and
    // `visibility.set` landed above the cut, where it travels for a reason that
    // has nothing to do with the backfill list.
    //
    // Stated RELATIVE to the snapshot seq the response carries, not against the
    // literal 27: the numbers are a fact about today's seed order, and this
    // file has one shared `beforeAll` that later rounds will add to. A literal
    // would redden this case for a fixture edit that changed nothing it is
    // about. "Below the cut" is the property; the number is not.
    const snapSeq = audit?.snapshot?.seq;
    expect(typeof snapSeq).toBe('number');
    expect(snapSeq).toBeGreaterThan(0);
    const visibilityEvents = audit?.events.filter((e) => e.type === 'visibility.set') ?? [];
    // Exactly one, and not merely "at least one": a filter that returned the
    // whole tail would satisfy a `some()` check here for no reason.
    expect(visibilityEvents).toHaveLength(1);
    const [visibilitySet] = visibilityEvents;
    expect(visibilitySet).toBeDefined();
    expect(visibilitySet?.seq).toBeLessThan(snapSeq ?? 0);
    // Whole, not merely present: a replica reapplying an audience change needs
    // the mode it names.
    expect(visibilitySet?.payload).toMatchObject({ ticketId: AUDIT, mode: 'workspace' });
  });

  it('12.116 a `claim.contested` and its resolution filed BELOW the snapshot seq travel in full — the case that makes the two contest entries in BOOTSTRAP_BACKFILL_TYPES load-bearing', async () => {
    const body = await bootstrapWs3();
    const audit = body.tickets.find((t) => t.ticketId === AUDIT);
    const snapSeq = audit?.snapshot?.seq;
    expect(typeof snapSeq).toBe('number');
    expect(snapSeq).toBeGreaterThan(0);
    const contest = audit?.events.find((e) => e.type === 'claim.contested');
    const resolved = audit?.events.find((e) => e.type === 'claim.contested_resolved');
    expect(contest).toBeDefined();
    expect(resolved).toBeDefined();
    // Below the cut, so their presence is the backfill clause and not the
    // ordinary tail. Before this case, deleting BOTH contest entries from
    // `BOOTSTRAP_BACKFILL_TYPES` left the whole server suite green: 12.94's
    // "drop the backfill clause" mutation exercises the CLAUSE, and only
    // through `comment.added`. Relative to the snapshot seq rather than to
    // literals, for the reason 12.115 gives.
    expect(contest?.seq).toBeLessThan(snapSeq ?? 0);
    expect(resolved?.seq).toBeLessThan(snapSeq ?? 0);
    // The refused claim rides whole inside the contest — a contest stripped of
    // it is not a record of anything.
    expect((contest?.payload.originalEvent as { entity: { id: string } }).entity.id).toBe(AUDIT);
    expect(contest?.payload.rule).toBe('require-field');
  });

  /**
   * 12.363 — THE ATTACHMENTS CLAUSE OF 12.13, WHICH HAD NO WITNESS.
   *
   * `attachment.added` is a live member of `BOOTSTRAP_BACKFILL_TYPES`
   * (`sync-routes.ts:59`) and **deleting it from that constant left the WHOLE
   * server suite green.** 12.94's loop hardcodes the five names rather than
   * importing them, deliberately — so shrinking the constant shrinks only one
   * side — but that loop is a boundary check driven by `comment.added` alone,
   * and 12.115/12.116 cover `visibility.set` and the two contest entries. The
   * attachment was the one member of the five that nothing made travel.
   *
   * Same shape as 12.115, for the same reasons: the premise (a snapshot exists,
   * and this event really is below it) is asserted rather than assumed, so the
   * case cannot pass vacuously the day the seed order shifts and the attachment
   * lands above the cut, where it would travel for a reason unrelated to the
   * backfill list. And it is stated RELATIVE to the seq the response carries,
   * never against a literal, because the numbers are a fact about today's seed
   * order and this file has one shared `beforeAll` that later rounds add to.
   *
   * `toHaveLength(1)` rather than `some()`: a filter that returned the whole
   * tail would satisfy a `some()` here for no reason at all.
   *
   * *Mutation: delete `'attachment.added'` from `BOOTSTRAP_BACKFILL_TYPES` →
   * red here. The sibling count is measured and reported at the case in
   * `test-cases/12`, not asserted to be one.*
   */
  it('12.363 an `attachment.added` filed BELOW the snapshot seq reaches the replica — the attachments clause of 12.13', async () => {
    const body = await bootstrapWs3();
    const audit = body.tickets.find((t) => t.ticketId === AUDIT);
    expect(audit).toBeDefined();
    const snapSeq = audit?.snapshot?.seq;
    expect(typeof snapSeq).toBe('number');
    expect(snapSeq).toBeGreaterThan(0);
    const attachments = audit?.events.filter((e) => e.type === 'attachment.added') ?? [];
    expect(attachments).toHaveLength(1);
    const [attachment] = attachments;
    expect(attachment?.seq).toBeLessThan(snapSeq ?? 0);
    // Whole, not merely present: a replica that has to render or re-fetch the
    // file needs the id and the digest, not the fact that a row existed.
    expect(attachment?.payload).toMatchObject({
      kind: 'upload',
      attachmentId: AUDIT_ATTACHMENT,
      filename: 'audit-trail.pdf',
      sha256: 'b'.repeat(64),
    });
  });

  it('12.117 `definitions` arrives in workspace-stream order, so a replica folding it in the order received resolves the same definition the server does', async () => {
    const body = await bootstrapWs3();
    const typeDefs = body.definitions.filter((d) => d.type === 'ticket-type.defined');
    expect(typeDefs).toHaveLength(2);
    // The premise: both definitions carry the SAME key, on DIFFERENT entity
    // streams — so per-entity `seq` is 1 for both and cannot order them, and
    // the winner sits on the SMALLER entity id (12.92's construction). Without
    // this the ordering assertion below could be satisfied by a fixture where
    // the two orderings happen to agree.
    // The premises are stated ORDER-INSENSITIVELY on purpose, so that the
    // ordering mutation fails on the CONSEQUENCE below and not on a premise —
    // a red premise would say "the fixture changed", which is not the finding.
    expect(typeDefs.map((d) => d.payload.id)).toEqual([WS3_TYPE_KEY, WS3_TYPE_KEY]);
    expect([...typeDefs.map((d) => d.entity.id)].sort()).toEqual(
      [WS3_TYPE_WINNER_ENTITY, WS3_TYPE_LOSER_ENTITY].sort(),
    );
    expect(WS3_TYPE_WINNER_ENTITY < WS3_TYPE_LOSER_ENTITY).toBe(true);

    // The consequence, and what a replica actually does: fold in the order
    // received, last write wins. `workflowId` and not `name` — the binding is
    // the field with a consequence, it is what `applyTicketEvent` looks a
    // workflow up by. Under `ORDER BY entity_kind, entity_id, seq` this
    // resolves WS3_WF_OLD: the winner sorts FIRST by ULID and is overwritten by
    // the loser.
    const resolved = new Map<string, unknown>();
    for (const def of typeDefs) resolved.set(def.payload.id as string, def.payload.workflowId);
    expect(resolved.get(WS3_TYPE_KEY)).toBe(WS3_WF_NEW);
    // The loser named explicitly, so "the winner is WS3_WF_NEW" cannot be
    // satisfied by a payload that only ever carried one definition.
    expect(resolved.get(WS3_TYPE_KEY)).not.toBe(WS3_WF_OLD);
    // And it agrees with the server's own fold, which is the claim Features.md
    // §12 makes: `buildLedgerDeps` reads the same rows in the same order.
    const serverDeps = await buildLedgerDeps(db.pool, WS3);
    expect(serverDeps.getTicketType(WS3_TYPE_KEY)?.workflowId).toBe(resolved.get(WS3_TYPE_KEY));

    // And the order is ascending on the workspace stream over the WHOLE list,
    // workflows included — not merely between the two competing types.
    const seqs = body.definitions.map((d) => d.workspaceSeq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('12.118 the stream cursor is read BEFORE the per-ticket reads, not merely inside the same transaction — the ordering half of the consistent-cut claim', async () => {
    // 12.98 checks the isolation level by MEMBERSHIP, which by construction
    // cannot see where in the transaction anything sits. Moving the
    // `readStreamSeq` call to immediately before `COMMIT` — the arrangement the
    // route's own docblock warns against, because a ticket read before the
    // cursor could carry an event past it — left all six bootstrap cases green
    // before this one existed.
    const originalConnect = db.pool.connect.bind(db.pool);
    const queries: string[] = [];
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
    // Both literals copied from the functions that issue them —
    // `readStreamSeq` (`stream-seq.ts`) and `readEntityEvents`
    // (`event-store.ts`). Both are passed to `client.query` as plain STRINGS,
    // which is what the recorder above can see; a query passed as a
    // `{text, values}` config object would record nothing and `indexOf` would
    // answer -1 for both, making the comparison below true for the wrong
    // reason. So each index is asserted found before they are compared.
    const cursorIndex = queries.indexOf(
      'SELECT coalesce(max(workspace_seq), 0)::bigint AS stream_seq FROM events WHERE workspace_id = $1',
    );
    const tailIndex = queries.indexOf(
      'SELECT * FROM events WHERE entity_kind = $1 AND entity_id = $2 AND seq > $3 ORDER BY seq',
    );
    expect(cursorIndex).toBeGreaterThanOrEqual(0);
    expect(tailIndex).toBeGreaterThanOrEqual(0);
    expect(cursorIndex).toBeLessThan(tailIndex);
  });
});
