import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, newUlid } from '@gisik-nokma/domain';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedGuest, seedMember, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';

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
    expect(body.streamSeq).toBeGreaterThan(0);
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
    const raw = JSON.stringify(res.json());
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
});
