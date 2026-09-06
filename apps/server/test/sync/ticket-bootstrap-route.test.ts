import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newSubmittedEvent, newUlid } from '@gisik-nokma/domain';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedMember, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * `GET /v1/sync/bootstrap/ticket` — closure 5b(d)(iii), ruling P37.1.
 * Cases 12.299–12.301, 12.303.
 *
 * ## What this door is for
 *
 * The grant side used to PUSH a widened ticket's whole pre-cursor history, and
 * because every such envelope sits at or below the client's cursor, none of
 * them moved it — so a slow-consumer close mid-burst left the client to be
 * handed the identical burst forever (case 12.290). P37.1 inverts it: the
 * server names ids, the client pulls what it lacks. This is the door.
 *
 * ## The one thing that would be easy to get wrong and hard to see
 *
 * A fetch-one-thing route naturally wants to say "no such thing" — 404 for a
 * ticket that does not exist, 403 for one you may not see. That split is an
 * existence oracle, and it is exactly what `reconcile-route.ts` refuses in its
 * own words and `can-see.ts` refuses one layer down (*"unknown and invisible
 * are the same answer"*). 12.300 presents a never-minted ULID and a real
 * invisible ticket in the same case and requires the two answers to be
 * INDISTINGUISHABLE, byte for byte.
 *
 * Every id is a ULID and every membership and visibility row arrives through
 * real events and real projections, for `reconcile-route.test.ts`'s stated
 * reason: `resolveEffectiveRole` reads `request.currentUserId`, so a seed
 * naming a made-up id grants the caller under test nothing.
 */

let db: TestDatabase;
let app: FastifyInstance;
let ingest: IngestService;
let otp: import('../../src/auth/otp-sender.js').LogOtpSender;

const WS = newUlid();
const PROJECT = newUlid();
const WF = newUlid();
const TASK_TYPE = newUlid();
/** Visible to the member throughout — the positive control. */
const VISIBLE = newUlid();
/** Real, in the same workspace and project, narrowed to the owner alone. */
const HIDDEN = newUlid();
/** Never minted. Its answer must equal HIDDEN's exactly. */
const PHANTOM = newUlid();

let ownerId = '';
let memberHeaders: Record<string, string> = {};
let strangerHeaders: Record<string, string> = {};

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  ingest = built.ingest;
  otp = built.otp;

  const member = await signInWithPhone(app, otp, '+913333334441');
  const stranger = await signInWithPhone(app, otp, '+913333334442');
  const owner = await signInWithPhone(app, otp, '+913333334443');
  ownerId = owner.userId;
  memberHeaders = { authorization: `Bearer ${member.token}` };
  strangerHeaders = { authorization: `Bearer ${stranger.token}` };

  await seedMember(db.pool, WS, member.userId, 'member', [{ projectId: PROJECT }]);
  await seedMember(db.pool, WS, ownerId, 'owner', [{ projectId: PROJECT, projectAdmin: true }]);
  // The stranger deliberately gets no row in WS at all.

  const submit = (entity: { kind: 'workflow' | 'ticket-type' | 'ticket'; id: string }, type: string, payload: unknown) =>
    newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: ownerId, origin: 'server' });

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
    submit({ kind: 'ticket', id: VISIBLE }, 'ticket.created', {
      typeId: TASK_TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Pullable',
    }),
    submit({ kind: 'ticket', id: HIDDEN }, 'ticket.created', {
      typeId: TASK_TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Not for the member',
    }),
    // A second event on the visible ticket, so its `events` tail is not empty
    // and "the payload is a real payload" is a fact about the response rather
    // than about an empty array.
    submit({ kind: 'ticket', id: VISIBLE }, 'ticket.transitioned', { to: 'done' }),
  ]);
  for (const r of results) {
    if (r.status !== 'committed') throw new Error(`seed failed: ${JSON.stringify(r)}`);
  }

  await applyAll(db.pool, [setVisibilityEnv(WS, HIDDEN, 'explicit', [ownerId], ownerId)]);
});

afterAll(async () => {
  await db.drop();
});

async function pull(
  headers: Record<string, string>,
  ticketId: string,
  workspaceId: string = WS,
): Promise<{ statusCode: number; body: unknown }> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/sync/bootstrap/ticket?workspaceId=${workspaceId}&ticketId=${ticketId}`,
    headers,
  });
  return { statusCode: res.statusCode, body: res.json() };
}

describe('GET /v1/sync/bootstrap/ticket — the door the client pulls through (closure 5b(d))', () => {
  it('12.299 serves one ticket the caller may see: its tail, its definitions, and NO stream cursor', async () => {
    const { statusCode, body } = await pull(memberHeaders, VISIBLE);
    expect(statusCode).toBe(200);
    const payload = body as { workspaceId: string; definitions: unknown[]; ticket: { ticketId: string; events: unknown[] } };
    expect(payload.workspaceId).toBe(WS);
    expect(payload.ticket.ticketId).toBe(VISIBLE);
    // A real tail, not an empty array that would satisfy every other assertion.
    expect(payload.ticket.events.length).toBeGreaterThan(0);
    // Definitions travel, or a client whose stream cursor lags cannot fold a
    // ticket on a workflow it has not reached yet.
    expect(payload.definitions.length).toBeGreaterThan(0);

    // THE OMISSION IS THE PROPERTY. `BootstrapResponse` carries `streamSeq` and
    // `Replica.loadBootstrap` writes it straight to `cursor:<workspaceId>`; a
    // per-ticket response that carried one would let a device at cursor 40
    // jump to the server's head and skip everything between for every other
    // ticket. Asserted as an exact key set rather than `toBeUndefined`, which
    // would also pass on a response that had grown some other cursor-shaped
    // field under a different name.
    expect(Object.keys(payload).sort()).toEqual(['definitions', 'ticket', 'workspaceId']);
  });

  it('12.300 a ticket the caller may not see and a ticket that never existed answer IDENTICALLY', async () => {
    const hidden = await pull(memberHeaders, HIDDEN);
    const phantom = await pull(memberHeaders, PHANTOM);

    expect(hidden.statusCode).toBe(404);
    // Not "both are 4xx" — byte-identical, because any difference at all is the
    // oracle. A route that answered 404 `not_found` for the phantom and 403
    // `forbidden` for the hidden one would tell a caller which ids are real.
    expect(phantom.statusCode).toBe(hidden.statusCode);
    expect(phantom.body).toEqual(hidden.body);
    expect(hidden.body).toEqual({ error: 'not_found' });

    // The positive control, in the same case and the same run: this member CAN
    // pull, so the 404s above are about these two ids and not about the caller
    // being refused everything.
    expect((await pull(memberHeaders, VISIBLE)).statusCode).toBe(200);
  });

  it('12.301 a stranger is refused for being a stranger, before any ticket is consulted', async () => {
    // The SAME id the member just pulled successfully, so the 403 is about the
    // caller rather than the ticket. `resolveEffectiveRole` answers about the
    // caller alone, so this leaks nothing about which ids exist — which is why
    // a membership 403 is not an exception to 12.300's rule.
    const outsider = await pull(strangerHeaders, VISIBLE);
    expect(outsider.statusCode).toBe(403);
    expect(outsider.body).toEqual({ error: 'not_a_member' });

    // And a stranger asking about a phantom gets the membership answer too —
    // never the ticket answer. If these diverged, the 403/404 split would
    // itself become the probe.
    expect((await pull(strangerHeaders, PHANTOM)).statusCode).toBe(403);
  });

  it('12.303 the ticket it serves is the ticket asked for, and no other travels with it', async () => {
    const { body } = await pull(memberHeaders, VISIBLE);
    // `HIDDEN` is in the same workspace and the same project. A handler that
    // reached for `listVisibleTickets` (the workspace route's own helper, one
    // import away) instead of the single id would have every opportunity to
    // include it — and for the owner it WOULD be visible, so the mistake would
    // not even look like a leak in a single-user fixture.
    expect(JSON.stringify(body)).not.toContain(HIDDEN);
    expect(JSON.stringify(body)).not.toContain(PHANTOM);
  });
});
