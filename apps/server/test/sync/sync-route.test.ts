import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  ENTITY_WORKSPACE_MISMATCH_RULE,
  membershipId,
  newSubmittedEvent,
  newUlid,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { IngestService } from '../../src/ingest/ingest-service.js';
import {
  PERMISSION_ROLE_RULE,
  PERMISSION_VISIBILITY_RULE,
  SERVER_ORIGIN_REASON,
  TICKET_NOT_VISIBLE_REASON,
  WORKSPACE_MEMBERSHIP_REASON,
} from '../../src/permissions/check-permission.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedMember, seedProject, setVisibilityEnv } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * `POST /v1/sync` — 12.100-12.112 (`test-cases/12-offline-sync-apps.md`), and
 * the door enumeration 12.77 asked for.
 *
 * ## THE PROPERTY THIS FILE EXISTS TO PIN
 *
 * The client's offline claim must go through the GATED ingest door
 * (`ingestClientBatch`). Plan 10's own snippet for this route calls
 * `ingestBatch` — the internal, ungated door — for that very event, which would
 * skip `checkPermission` for every offline-originated event in the product.
 *
 * Two cases here fail if that call is swapped, and they fail for two DIFFERENT
 * gate checks so neither is load-bearing alone: **12.102** (envelope-origin
 * forgery, `checkRolePermission`) and **12.103** (a ticket the caller cannot
 * see, `checkVisibilityPermission`). Both were driven: with
 * `ingest.ingestClientBatch([event], userId)` replaced by
 * `serverAppend([event])` the two cases go red with the claim COMMITTING
 * instead of being contested. Every other refusal case in this file — the
 * `restrict-to` transition especially — is an ENGINE refusal, which fires on
 * both doors and therefore proves nothing about which door was used.
 *
 * ## "envelope-origin", not HTTP-Origin
 *
 * `origin` throughout is `EventEnvelope.origin`, the provenance enum
 * `'web' | 'mobile' | 'desktop' | 'server'`. Nothing in this file concerns the
 * browser `Origin` header or CSRF. `POST /v1/sync` is bearer-authenticated like
 * every other product route here.
 *
 * ## The fixture is seeded through REAL events and REAL projections
 *
 * Same discipline as `bootstrap.test.ts` and `contests-route.test.ts`: the
 * definitions and the tickets arrive through the internal ingest door, the
 * membership and visibility rows through the projections that maintain them,
 * and the session user ids are the ones the tokens actually resolve to. A seed
 * naming a made-up id would grant the caller under test nothing, and every
 * refusal below would fire for the wrong reason.
 */

let db: TestDatabase;
let app: FastifyInstance;
let ingest: IngestService;

const WS = newUlid();
const PROJECT = newUlid();
/** Visible to the member, workspace-mode. The claims under test ride on it. */
const TICKET = newUlid();
/** Explicit to somebody else — the member cannot see it (12.103). */
const HIDDEN = newUlid();
/** Visible until 12.113 takes it away mid-test. Nothing else touches it. */
const REVOKED = newUlid();
const WF = newUlid();
const TYPE = newUlid();
/** The ticket's assignee, and never a session user: `restrict-to` must refuse. */
const OTHER = newUlid();

/**
 * A SECOND workspace, and a ticket that lives in it (12.114). The claim under
 * test stamps `WS` on `TICKET_IN_B`, which is the shape a workspace-scoped
 * replica produces after a workspace switch on a shared device.
 *
 * The member is deliberately NOT seeded into `WS_B`, and that is not an
 * oversight: the entity↔workspace guard runs INSIDE `commitOne` before
 * `checkPermission` (`ingest-service.ts`, the `readEntityHead` block sits above
 * the gate), which is exactly why this refusal reaches `contest()` at all.
 */
const WS_B = newUlid();
const WF_B = newUlid();
const TYPE_B = newUlid();
const PROJECT_B = newUlid();
const TICKET_IN_B = newUlid();

let memberId = '';
let memberHeaders: Record<string, string> = {};

function syncPost(headers: Record<string, string>, events: unknown[]) {
  return app.inject({ method: 'POST', url: '/v1/sync', headers, payload: { events } });
}

function eventsPost(headers: Record<string, string>, events: unknown[]) {
  return app.inject({ method: 'POST', url: '/v1/events', headers, payload: { events } });
}

/** A claim made while the device was offline: the member's own, envelope-origin `mobile`. */
function offline(type: string, payload: unknown, ticketId: string = TICKET): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
    actorId: memberId,
    origin: 'mobile',
  });
}

/** A legal offline claim — `title` is a built-in every ticket type carries. */
function offlineField(value = 'offline note'): SubmittedEvent {
  return offline('ticket.field_set', { fieldId: 'title', value });
}

/** An offline claim the ENGINE refuses: the `todo -> done` edge is assignee-only. */
function offlineTransition(): SubmittedEvent {
  return offline('ticket.transitioned', { to: 'done' });
}

async function ledgerCount(): Promise<number> {
  const { rows } = await db.pool.query('SELECT count(*)::int AS n FROM events');
  return rows[0].n as number;
}

async function contestRows(originalEventId: string) {
  const { rows } = await db.pool.query(
    'SELECT * FROM proj_contested WHERE original_event_id = $1',
    [originalEventId],
  );
  return rows;
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  ingest = built.ingest;

  const member = await signInWithPhone(built.app, built.otp, '+911111111111');
  memberId = member.userId;
  memberHeaders = { authorization: `Bearer ${member.token}` };

  const submit = (entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent =>
    newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: memberId, origin: 'server' });

  const seeded = await ingest.ingestBatch([
    submit({ kind: 'workflow', id: WF }, 'workflow.defined', {
      id: WF,
      version: 1,
      name: 'Restricted',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      // `restrict-to assignee` is the guard the contest cases need. The
      // `* -> todo` edge keeps the definition publishable and gives the
      // reducer somewhere to start.
      transitions: [
        { from: '*', to: 'todo', rules: [] },
        { from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
      ],
    }),
    submit({ kind: 'ticket-type', id: TYPE }, 'ticket-type.defined', {
      id: TYPE,
      name: 'Task',
      icon: 'check',
      rank: 3,
      workflowId: WF,
      fields: [],
    }),
    submit({ kind: 'ticket', id: TICKET }, 'ticket.created', {
      typeId: TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Sync target',
    }),
    // Assigned to somebody who is never a session user here, so the member's
    // own transition meets `restrict-to` rather than satisfying it.
    submit({ kind: 'ticket', id: TICKET }, 'ticket.assigned', { assigneeId: OTHER }),
    submit({ kind: 'ticket', id: HIDDEN }, 'ticket.created', {
      typeId: TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Not for the member',
    }),
    submit({ kind: 'ticket', id: REVOKED }, 'ticket.created', {
      typeId: TYPE,
      projectId: PROJECT,
      parentId: null,
      title: 'Visible until 12.113 says otherwise',
    }),
  ]);
  for (const result of seeded) {
    if (result.status !== 'committed') {
      // eslint-disable-next-line no-console
      console.error('seed result not committed:', JSON.stringify(result));
    }
    expect(result.status).toBe('committed');
  }

  // `checkProjectExists` refuses any event naming a project `proj_projects` has
  // no row for, so a fixture whose project was never founded would answer
  // `project.unknown` for every claim under test.
  await seedProject(db.pool, WS, PROJECT);
  await seedMember(db.pool, WS, memberId, 'member', [{ projectId: PROJECT }]);
  await applyAll(db.pool, [
    setVisibilityEnv(WS, TICKET, 'workspace'),
    setVisibilityEnv(WS, HIDDEN, 'explicit', [OTHER]),
    setVisibilityEnv(WS, REVOKED, 'workspace'),
  ]);

  // The second workspace (12.114). Its own definitions, because definitions
  // are workspace-scoped: a ticket in `WS_B` naming `WS`'s ticket-type would
  // not resolve, and `ticket.created` would answer `invalid`/refused instead of
  // committing — which would leave `proj_entity_heads` with no row for
  // `TICKET_IN_B`, `readEntityHead` answering null, and 12.114 passing on some
  // OTHER refusal entirely. The committed-assertion below is what makes that
  // fail here, loudly, instead of there, quietly.
  await seedProject(db.pool, WS_B, PROJECT_B);
  const submitB = (entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent =>
    newSubmittedEvent({ workspaceId: WS_B, entity, type, payload, actorId: memberId, origin: 'server' });
  const seededB = await ingest.ingestBatch([
    submitB({ kind: 'workflow', id: WF_B }, 'workflow.defined', {
      id: WF_B,
      version: 1,
      name: 'Other workspace',
      initialStateId: 'todo',
      // A terminal state is REQUIRED — `workflow-structure` refuses a
      // definition with none ("no ticket could ever finish"), and it was the
      // committed-assertion above that said so rather than 12.114 failing on a
      // refusal that named some other rule.
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: '*', to: 'todo', rules: [] },
        { from: 'todo', to: 'done', rules: [] },
      ],
    }),
    submitB({ kind: 'ticket-type', id: TYPE_B }, 'ticket-type.defined', {
      id: TYPE_B,
      name: 'Task',
      icon: 'check',
      rank: 3,
      workflowId: WF_B,
      fields: [],
    }),
    submitB({ kind: 'ticket', id: TICKET_IN_B }, 'ticket.created', {
      typeId: TYPE_B,
      projectId: PROJECT_B,
      parentId: null,
      title: 'Lives in the other workspace',
    }),
  ]);
  for (const result of seededB) {
    if (result.status !== 'committed') {
      // eslint-disable-next-line no-console
      console.error('WS_B seed result not committed:', JSON.stringify(result));
    }
    expect(result.status).toBe('committed');
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('POST /v1/sync — the sync ingress', () => {
  it('12.100 commits a legal offline claim and answers the REAL workspace stream position', async () => {
    const e = offlineField('committed by sync');
    const res = await syncPost(memberHeaders, [e]);
    expect(res.statusCode).toBe(200);
    const [result] = res.json().results;
    expect(result).toMatchObject({ status: 'committed', eventId: e.id });

    // §18: the committed answer carries the stream position so the replica
    // stores what arrived instead of inventing an order for it. Checked against
    // the row ingest actually wrote, not merely `typeof === 'number'` — a
    // hardcoded constant satisfies the weaker assertion.
    const { rows } = await db.pool.query(
      'SELECT seq, workspace_seq, server_time FROM events WHERE id = $1',
      [e.id],
    );
    expect(rows).toHaveLength(1);
    expect(result.seq).toBe(rows[0].seq);
    expect(result.workspaceSeq).toBe(rows[0].workspace_seq);
    expect(Date.parse(result.serverTime)).toBe((rows[0].server_time as Date).getTime());
  });

  /**
   * 12.7 — a refused offline claim's ledger row is type claim.contested and carries the exact refusing rule ('restrict-to') in its payload.
   */
  it('12.101 an engine refusal becomes a claim.contested ledger event, and the contest is COHERENT by construction', async () => {
    const e = offlineTransition();
    const res = await syncPost(memberHeaders, [e]);
    const [result] = res.json().results;
    expect(result).toMatchObject({ status: 'contested', eventId: e.id, rule: 'restrict-to' });

    const rows = await contestRows(e.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].contested_event_id).toBe(result.contestEventId);
    // `claimant_id` is the REFUSED claim's actor, which on this door is the
    // session user — the half of 12.82 this route closes: nothing here can
    // relay somebody else's claim, so no contest filed through this door can
    // name a person who did not submit it.
    expect(rows[0].claimant_id).toBe(memberId);

    const ledger = await db.pool.query('SELECT type, origin, payload FROM events WHERE id = $1', [
      result.contestEventId,
    ]);
    expect(ledger.rows).toHaveLength(1); // the contest IS history
    expect(ledger.rows[0].type).toBe('claim.contested');
    // envelope-origin, not the HTTP header: `contest.server-only` requires it,
    // which is exactly why this append cannot go through the client door.
    expect(ledger.rows[0].origin).toBe('server');
    // Coherence is STRUCTURAL here (`buildContestedClaim` reads both off the
    // refused claim), not merely un-refused by `checkContestCoherence`.
    const payload = ledger.rows[0].payload as { originalEvent: SubmittedEvent; rule: string };
    expect(payload.originalEvent.id).toBe(e.id);
    expect(payload.originalEvent.workspaceId).toBe(WS);
    expect(payload.originalEvent.entity).toEqual({ kind: 'ticket', id: TICKET });
    expect(payload.rule).toBe('restrict-to');
  });

  it('12.102 DOOR TEST: an offline claim wearing envelope-origin `server` is still refused by the permission gate', async () => {
    // The whole point of routing this event through `ingestClientBatch`. No
    // engine rule refuses a `ticket.field_set` for its provenance — only
    // `checkRolePermission` does — so through the internal door this claim
    // COMMITS and a client wears the server's own provenance in the ledger.
    //
    // Confirmed red by swapping the call in `sync-service.ts` to
    // `deps.serverAppend([event])`: `expected { status: 'committed', … } to
    // match object { status: 'contested', rule: 'permission.role' }`.
    const forged = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.field_set',
      payload: { fieldId: 'title', value: 'wearing the server’s provenance' },
      actorId: memberId,
      origin: 'server',
    });
    const res = await syncPost(memberHeaders, [forged]);
    const [result] = res.json().results;
    expect(result).toMatchObject({
      status: 'contested',
      eventId: forged.id,
      rule: PERMISSION_ROLE_RULE,
      reason: SERVER_ORIGIN_REASON,
    });
    // The forged claim itself never reached the ledger; only the contest did.
    const forgedRow = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [
      forged.id,
    ]);
    expect(forgedRow.rows[0].n).toBe(0);
    expect(await contestRows(forged.id)).toHaveLength(1);
  });

  /**
   * 12.11 — re-filed as 12.103: an offline claim on a ticket the caller cannot see is contested with the permission.visibility rule, at the sync door specifically (there is deliberately no local visibility pre-check).
   */
  it('12.103 DOOR TEST: a claim on a ticket the caller cannot see is contested permission.visibility', async () => {
    // The second discriminator, and a different gate check from 12.102's:
    // `checkVisibilityPermission`. There is deliberately no local visibility
    // pre-check in `sync-service.ts` (the plan's step 6) — the gate is the only
    // thing answering this, which is what makes the case a door test rather
    // than a test of a duplicate.
    //
    // Confirmed red by the same `serverAppend([event])` swap: the claim commits
    // on a ticket the caller cannot see.
    const e = offlineField('reaching a ticket I cannot see');
    const blind = { ...e, entity: { kind: 'ticket' as const, id: HIDDEN } };
    const res = await syncPost(memberHeaders, [blind]);
    const [result] = res.json().results;
    expect(result).toMatchObject({
      status: 'contested',
      eventId: blind.id,
      rule: PERMISSION_VISIBILITY_RULE,
      reason: TICKET_NOT_VISIBLE_REASON,
    });
    const blindRow = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [
      blind.id,
    ]);
    expect(blindRow.rows[0].n).toBe(0);
  });

  /**
   * 12.8 — re-filed as 12.104 (the retried-committed-claim half: same instant/seq/cursor, no second ledger row) with the contest half attributed to 12.105 and the batch-neighbour half to 12.106; this test proves only the committed-retry clause, per the catalogue's own note that 12.104 carries no contest assertion.
   * 12.44 — a sync retry re-answers the same parsed instant (via Date.parse, not string equality), the same seq and workspaceSeq as the first answer, and the stored timestamptz agrees with both.
   */
  it('12.104 a retried committed claim re-answers the SAME instant, seq and cursor, with no second event', async () => {
    const e = offlineField('retried');
    const first = await syncPost(memberHeaders, [e]);
    const countAfterFirst = await ledgerCount();
    const second = await syncPost(memberHeaders, [e]);

    const a = first.json().results[0];
    const b = second.json().results[0];
    expect(b.status).toBe('committed');
    // INSTANTS, not strings. Both sides Z-normalise today, so a raw string
    // comparison would pass — and would turn a harmless change in how either
    // side spells an instant into a phantom idempotency failure.
    expect(Date.parse(b.serverTime)).toBe(Date.parse(a.serverTime));
    expect(b.seq).toBe(a.seq);
    expect(b.workspaceSeq).toBe(a.workspaceSeq);
    expect(await ledgerCount()).toBe(countAfterFirst); // not one event more
    // And the stored row agrees: one instant, read back Z-normalised.
    const { rows } = await db.pool.query('SELECT server_time FROM events WHERE id = $1', [e.id]);
    expect((rows[0].server_time as Date).getTime()).toBe(Date.parse(a.serverTime));
  });

  it('12.105 a retried CONTESTED claim answers the one recorded contest, never a second', async () => {
    // Case 12.83's sequential half. `proj_contested.original_event_id` is
    // UNIQUE and, until this task, nothing looked it up: the second contest's
    // INSERT raised 23505 on `proj_contested_original_idx`, which
    // `isUniqueViolation` does not match (it matches `events_pkey` only), so
    // the exception left `commitOne` and rejected the whole call.
    const e = offlineTransition();
    const first = await syncPost(memberHeaders, [e]);
    const countAfterFirst = await ledgerCount();
    const second = await syncPost(memberHeaders, [e]);
    expect(second.statusCode).toBe(200); // not a 500 taking the batch with it

    const a = first.json().results[0];
    const b = second.json().results[0];
    expect(a.status).toBe('contested');
    expect(b).toEqual(a); // same contest event id, same rule, same reason
    expect(await contestRows(e.id)).toHaveLength(1);
    expect(await ledgerCount()).toBe(countAfterFirst); // no second claim.contested
  });

  it('12.106 the SAME refused claim twice in one batch answers twice and still commits the batch’s third event', async () => {
    // The failure this pins is not the duplicate contest, it is what the
    // duplicate used to do to its NEIGHBOURS: the throw left `processBatch`
    // entirely, so the answers already decided for the batch never reached the
    // client and a legal third event was never appended. It works because
    // `processBatch` is strictly sequential and each iteration's transaction
    // has committed before the next one reads `proj_contested`.
    const refused = offlineTransition();
    const legal = offlineField('third in the batch');
    const res = await syncPost(memberHeaders, [refused, refused, legal]);
    expect(res.statusCode).toBe(200);
    const results = res.json().results;
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ status: 'contested', rule: 'restrict-to' });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toMatchObject({ status: 'committed', eventId: legal.id });
    expect(await contestRows(refused.id)).toHaveLength(1);
    const committed = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [
      legal.id,
    ]);
    expect(committed.rows[0].n).toBe(1);
  });

  /**
   * 12.10 — re-filed: the actor-mismatch half is 12.107 (a claim whose actorId does not match the signed-in user is refused invalid/actor-mismatch, no contest row); the client-supplied claim.contested half is 12.108 (refused invalid/reserved-type before the coherence check runs).
   */
  it('12.107 refuses to relay another actor’s claim — a synced claim is still the signed-in user’s', async () => {
    const forged = { ...offlineField(), id: newUlid(), actorId: OTHER };
    const res = await syncPost(memberHeaders, [forged]);
    expect(res.json().results[0]).toMatchObject({
      status: 'invalid',
      eventId: forged.id,
      code: 'actor-mismatch',
    });
    expect(await contestRows(forged.id)).toHaveLength(0);
  });

  it('12.108 refuses a client-supplied claim.contested as reserved-type — BEFORE the coherence check could answer', async () => {
    // 12.84's door question, answered rather than left open: the entity-kind
    // arm of `checkContestCoherence` is UNREACHABLE through this route. The
    // embedded claim below names a different ticket AND a different entity
    // kind, either of which `checkContestCoherence` would refuse
    // `contest.incoherent-original` — and the answer is `reserved-type`,
    // because step 3 of the pipeline is upstream of the ingest door entirely.
    const forged = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: TICKET },
      type: 'claim.contested',
      payload: {
        originalEvent: newSubmittedEvent({
          workspaceId: WS,
          entity: { kind: 'workflow', id: WF },
          type: 'ticket.field_set',
          payload: { fieldId: 'title', value: 'fabricated' },
          actorId: memberId,
          origin: 'mobile',
        }),
        rule: 'restrict-to',
        reason: 'fabricated',
      },
      actorId: memberId,
      origin: 'mobile',
    });
    const res = await syncPost(memberHeaders, [forged]);
    const [result] = res.json().results;
    expect(result).toMatchObject({ status: 'invalid', eventId: forged.id, code: 'reserved-type' });
    expect(result.code).not.toBe('contest.incoherent-original');
    const row = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [forged.id]);
    expect(row.rows[0].n).toBe(0);
  });

  it('12.109 an envelope error answers invalid and records NO contest — a malformed claim is not a claim', async () => {
    const before = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    const res = await syncPost(memberHeaders, [{ ...offlineField(), type: 'ticket.not_a_real_type' }]);
    const [result] = res.json().results;
    expect(result).toMatchObject({ status: 'invalid', code: 'unknown-event-type' });
    const after = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  /**
   * 12.362 — THE SYNC DOOR'S ENVELOPE REFUSAL, AS A VALUE ON THE WIRE.
   *
   * 12.109 pins `unknown-event-type` and 12.107 pins `actor-mismatch`, so two of
   * the door's `invalid` codes were already values here. `malformed-envelope`
   * was not — it appeared in this suite only in prose — and it is the one a
   * `sync-client` fixture had drifted from, asserting `'bad-envelope'`, a code
   * no server emits (12.327). A vocabulary with no assertion against the running
   * door is a vocabulary a client can imitate wrongly for ever.
   *
   * The malformation is a non-ULID `actorId`, which `submittedEventSchema`
   * refuses BEFORE the actor-mismatch check the session would otherwise make —
   * so this reaches `parseEvent`'s envelope arm and not `actor-mismatch`, and
   * the `.not.toBe('actor-mismatch')` says so rather than leaving it to the
   * reader. `eventId` is asserted non-null because `extractClaimedId` reads the
   * id off an envelope it could not otherwise parse, and that is the property
   * that lets a client match the verdict to the claim it sent.
   *
   * *Mutation: change `'malformed-envelope'` in `packages/domain/src/parse-event.ts`
   * → red here. It reddens siblings too and that is reported rather than
   * assertion-loosened: the code is one shared string with many consumers, so
   * this case constrains the DOOR'S ANSWER, not that string's uniqueness.*
   */
  it('12.362 a malformed envelope answers invalid with malformed-envelope, and the claimed id survives', async () => {
    const before = await ledgerCount();
    const claim = { ...offlineField(), actorId: 'not-a-ulid' };
    const res = await syncPost(memberHeaders, [claim]);
    const [result] = res.json().results;
    expect(result).toMatchObject({ status: 'invalid', eventId: claim.id, code: 'malformed-envelope' });
    expect(result.code).not.toBe('actor-mismatch'); // the schema refuses before the session comparison
    expect(await ledgerCount()).toBe(before); // a malformed claim is not a claim
  });

  /**
   * 12.9 — re-filed as 12.110: the interactive `/v1/events` door refuses the same claim and leaves `proj_contested` unchanged, proven side by side against the sync door which records exactly one contest for the identical refusal.
   */
  it('12.110 the interactive door NEVER records a contest for the same refusal — proven side by side', async () => {
    const e = offlineTransition();
    const before = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    const res = await eventsPost(memberHeaders, [{ ...e, origin: 'web' as const }]);
    expect(res.json().results[0]).toMatchObject({ status: 'refused', rule: 'restrict-to' });
    const after = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    expect(after.rows[0].n).toBe(before.rows[0].n);
    const ledger = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [e.id]);
    expect(ledger.rows[0].n).toBe(0); // refusals leave no trace on the interactive path

    // The control that makes the two halves comparable: the SAME refusal, on
    // the sync door, does record one.
    const synced = offlineTransition();
    const contested = await syncPost(memberHeaders, [synced]);
    expect(contested.json().results[0]).toMatchObject({ status: 'contested', rule: 'restrict-to' });
    expect(await contestRows(synced.id)).toHaveLength(1);
  });

  it('12.111 a refusal on a NON-ticket entity answers refused, with nothing to attach a contest to', async () => {
    // Workspace-membership management is owner/admin only; the caller is a
    // member. The entity is a `membership`, so there is no ticket to file a
    // contest on and the client surfaces it as a failed outbox item instead.
    //
    // THE FIXTURE'S `'member'` ROLE IS LOAD-BEARING HERE and nowhere else in
    // this file: seed the caller as an owner or admin for some unrelated
    // reason and this `membership.granted` COMMITS, so the case stops
    // exercising the non-ticket refusal path and goes red for a reason that
    // does not name itself. The reason is asserted, not just the status, so
    // the failure at least says which refusal went missing.
    const e = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'membership', id: membershipId(WS, OTHER) },
      type: 'membership.granted',
      payload: { userId: OTHER, role: 'admin' },
      actorId: memberId,
      origin: 'mobile',
    });
    const before = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    const res = await syncPost(memberHeaders, [e]);
    expect(res.json().results[0]).toMatchObject({
      status: 'refused',
      eventId: e.id,
      rule: PERMISSION_ROLE_RULE,
      reason: WORKSPACE_MEMBERSHIP_REASON,
    });
    const after = await db.pool.query('SELECT count(*)::int AS n FROM proj_contested');
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });


  it('12.113 a retry of an ALREADY-COMMITTED claim is answered from the ledger even after the caller loses the ticket', async () => {
    // What decides that the ledger lookup must come BEFORE ingest rather than
    // after it. Both placements answer identically while the caller can still
    // see the ticket, so 12.104 cannot tell them apart: the `duplicate-event-id`
    // fallback inside the `invalid` branch produces the same result object.
    // They stop agreeing the moment the world moves under a retry — which is
    // the whole situation this door exists for. Placed after ingest, the retry
    // is re-judged by the gate, refused `permission.visibility`, and CONTESTED:
    // the client is told its already-committed claim was rejected, and the
    // ledger grows a contest for an event that is sitting in it.
    //
    // *Mutation: `const stored: LedgerEvent | null = null;` in place of the
    // step-4 lookup → red here, `expected { status: 'contested', … } to match
    // object { status: 'committed', … }`, while all twelve other cases stay
    // green.*
    const e = offline('ticket.field_set', { fieldId: 'title', value: 'claimed while visible' }, REVOKED);
    const first = await syncPost(memberHeaders, [e]);
    expect(first.json().results[0]).toMatchObject({ status: 'committed', eventId: e.id });

    // The ticket is taken away between the first attempt and the retry.
    await applyAll(db.pool, [setVisibilityEnv(WS, REVOKED, 'explicit', [OTHER])]);
    // The control: a FRESH claim on the same ticket is now refused, so the
    // idempotent answer below is not merely a gate that stopped working.
    const fresh = await syncPost(memberHeaders, [
      offline('ticket.field_set', { fieldId: 'title', value: 'no longer mine' }, REVOKED),
    ]);
    expect(fresh.json().results[0]).toMatchObject({
      status: 'contested',
      rule: PERMISSION_VISIBILITY_RULE,
    });

    const retry = await syncPost(memberHeaders, [e]);
    expect(retry.json().results[0]).toEqual(first.json().results[0]);
    expect(await contestRows(e.id)).toHaveLength(0);
  });

  it('12.114 a claim on a ticket bound to ANOTHER workspace is answered inside results — the throw no longer takes the batch, or the outbox, with it', async () => {
    // The reachable half of the class case 12.83 named, which the first round
    // scoped away to `isUniqueViolation`/`events_pkey` alone. There is no
    // unique violation anywhere on this path.
    //
    // `commitOne` refuses `entity-workspace-mismatch` for a ticket bound
    // elsewhere; the `refused` arm sends any TICKET refusal to `contest()`;
    // `buildContestedClaim` copies the refused claim's `workspaceId` and
    // `entity` verbatim, so the contest is the same mis-filing and meets the
    // same guard. `contest()` used to throw on that, rejecting `processBatch`
    // entirely.
    //
    // *Mutation: restore `if (appended?.status !== 'committed') { throw … }` in
    // `sync-service.ts` in place of the `refused` arm → red here with
    // `expected 500 to be 200`, and only here; all thirteen other cases in this
    // file stay green, which is the point — nothing else in the suite could see
    // this.*
    //
    // The batch shape is the case, not the solo claim. The solo claim only
    // shows the 500 is gone; the batch shows what the 500 COST: the answers
    // already decided for committed neighbours were lost, and every event
    // queued behind the bad one never ran, with no retry that could clear it.
    const legal1 = offlineField('queued ahead of the bad claim');
    const bad = offline(
      'ticket.field_set',
      { fieldId: 'title', value: 'stamped with the wrong workspace' },
      TICKET_IN_B,
    );
    const legal2 = offlineField('queued behind the bad claim');

    const res = await syncPost(memberHeaders, [legal1, bad, legal2]);
    expect(res.statusCode).toBe(200); // was 500
    const results = res.json().results;
    expect(results).toHaveLength(3); // index-aligned, as the route's contract says
    expect(results[0]).toMatchObject({ status: 'committed', eventId: legal1.id });
    expect(results[1]).toMatchObject({
      status: 'refused',
      eventId: bad.id,
      rule: ENTITY_WORKSPACE_MISMATCH_RULE,
    });
    // The rule id alone would also be satisfied by a refusal about some other
    // pair of workspaces; the reason names both, so this asserts it is THIS
    // mis-filing.
    expect(results[1].reason).toContain(WS_B);
    expect(results[1].reason).toContain(WS);
    expect(results[2]).toMatchObject({ status: 'committed', eventId: legal2.id });

    // The event queued BEHIND the bad one actually ran. This is the assertion
    // the finding turns on: under the throw, `legal2` was never processed.
    const behind = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [
      legal2.id,
    ]);
    expect(behind.rows[0].n).toBe(1);
    // And nothing was recorded for the bad claim — no ledger row, no contest.
    // A contest here would be a permanent cross-workspace row, which is the
    // thing the guard exists to prevent.
    expect(await contestRows(bad.id)).toHaveLength(0);
    const badRow = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [
      bad.id,
    ]);
    expect(badRow.rows[0].n).toBe(0);

    // Retrying answers identically instead of 500ing forever, so an outbox
    // holding this item drains rather than wedges.
    const retry = await syncPost(memberHeaders, [bad]);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().results[0]).toEqual(results[1]);

    // POSITIVE CONTROL 1, from this same run: the interactive door gives the
    // identical answer for the identical claim. That side-by-side comparison is
    // what `packages/sync-client` (Tasks 10/11) is written against.
    const interactive = await eventsPost(memberHeaders, [
      { ...bad, id: newUlid(), origin: 'web' as const },
    ]);
    expect(interactive.statusCode).toBe(200);
    expect(interactive.json().results[0]).toMatchObject({
      status: 'refused',
      rule: ENTITY_WORKSPACE_MISMATCH_RULE,
      reason: results[1].reason,
    });

    // POSITIVE CONTROL 2, from this same run: a ticket refusal in THIS
    // workspace still becomes recorded history. Without it, a fixture whose
    // membership or visibility seeds had quietly stopped working would refuse
    // everything and this case would pass for the wrong reason — and the
    // degraded `refused` arm would be indistinguishable from having turned the
    // sync door back into the interactive one.
    const inWorkspace = await syncPost(memberHeaders, [offlineTransition()]);
    const contested = inWorkspace.json().results[0];
    expect(contested).toMatchObject({ status: 'contested', rule: 'restrict-to' });
    // `eventId` on a `contested` answer is the REFUSED CLAIM's id, which is what
    // `contestRows` keys on (`original_event_id`) — not `contestEventId`, which
    // is the contest's own. Every other call site in this file passes the claim
    // id for the same reason.
    expect(await contestRows(contested.eventId)).toHaveLength(1);
  });

  it('12.112 answers 401 without a session and 400 for a body that is not a batch', async () => {
    const anonymous = await app.inject({
      method: 'POST',
      url: '/v1/sync',
      payload: { events: [offlineField()] },
    });
    expect(anonymous.statusCode).toBe(401);

    const empty = await syncPost(memberHeaders, []);
    expect(empty.statusCode).toBe(400);
  });
});
