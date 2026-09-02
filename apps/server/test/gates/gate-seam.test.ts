import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent, type SubmittedEvent } from '@gisik-nokma/domain';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { RULE_EMBED_NOT_IMAGE } from '../../src/gates/image-embed-gate.js';
import { buildServerGates } from '../../src/gates/index.js';
import type { ServerGate } from '../../src/gates/server-gate.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { PERMISSION_ROLE_RULE } from '../../src/permissions/check-permission.js';
import { createProjectionRegistry } from '../../src/projections/registry.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember, seedProject, seedTicket } from '../helpers/seed.js';

/**
 * The SEAM, as distinct from the two gates that ride on it.
 *
 * `image-embed-gate.test.ts` and `evidence-gate.test.ts` prove what each gate
 * decides. This file proves the five things `ingest-service.ts` and `index.ts`
 * assert in prose about HOW a gate runs, each of which is invisible to those
 * suites because a gate that decided correctly through the wrong handle, fired
 * a listener it should not have, discarded its neighbours, or answered ahead of
 * its turn would pass every single one of them:
 *
 *  1. the gate is handed the TRANSACTION client, and a refusal takes its work
 *     back with it;
 *  2. a gate refusal rolls back THIS event and no other — the batch answer;
 *  3. no commit listener fires for a gate-refused event;
 *  4. `buildServerGates()` covers the event types it claims to, and the seam is
 *     inert (`gates` defaults to `[]`) for every caller that omits it;
 *  5. the loop's POSITION relative to its two upstream neighbours: it runs after
 *     the permission gate and after the rule engine. Exactly those two
 *     relations, deliberately — "last" would be a third claim and would be
 *     unpinnable, since moving the loop below `insertEvent` changes nothing
 *     observable (the ROLLBACK still leaves the ledger empty). Both relations
 *     that ARE claimed have a case here, because both relocations are silent:
 *     every other gated service in the repo pairs `buildServerGates()` with an
 *     accept-all engine AND a permitted actor, so an engine refusal and a gate
 *     refusal — or a permission refusal and a gate refusal — were never in
 *     flight together anywhere. Hoisting the loop past either neighbour turns
 *     the two embed refusals into an existence oracle answered to someone the
 *     earlier check had already refused.
 *
 * Plus the two facts the gates themselves depend on and cannot check: the gate
 * runs at the CLIENT door as well as the internal one, and `parseEvent`'s
 * entity-kind binding means `event.entity.id` really is a ticket id by the time
 * a gate reads it.
 */

const WS = '01J9GWKS000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const PNG_ID = '01J9GATA000000000000000000';
const PDF_ID = '01J9GATB000000000000000000';
/** Corrected from the plan's `01J9GUSM…`: `U` is not in Crockford base32. */
const ACTOR = '01J9GACT000000000000000000';

const MARKER_RULE = 'test.gate-marker';

function submitted(type: string, payload: unknown, entity: SubmittedEvent['entity'] = { kind: 'ticket', id: TICKET }): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity,
    type,
    version: 1,
    payload,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T10:00:00.000Z',
  };
}

function docEmbedding(attachmentId: string): unknown {
  return {
    type: 'doc',
    content: [{ type: 'image', attrs: { attachmentId, wrap: 'block', alt: '' } }],
  };
}

let db: TestDatabase;
let gated: IngestService;
let ungated: IngestService;

async function attach(id: string, ticketId: string, mime: string, workspaceId = WS): Promise<void> {
  await insertAttachment(db.pool, {
    id,
    workspaceId,
    ticketId,
    uploaderId: ACTOR,
    filename: 'f',
    mime,
    size: 1,
    objectKey: `w/${workspaceId}/a/${id}`,
  });
}

async function ledgerCount(eventId: string): Promise<number> {
  const result = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [eventId]);
  return (result.rows as Array<{ n: number }>)[0]!.n;
}

async function markerIds(): Promise<string[]> {
  const result = await db.pool.query('SELECT event_id FROM gate_marker ORDER BY event_id');
  return (result.rows as Array<{ event_id: string }>).map((row) => row.event_id);
}

/**
 * A gate that WRITES through the handle it was given before answering. The
 * write is the probe: it is the only way to tell a `PoolClient` inside the
 * ingest transaction from a `Pool` beside it, because reads through either one
 * return the same rows in these tests. Through the transaction client the row
 * dies with the ROLLBACK; through the pool it autocommits and survives.
 */
function markerGate(verdict: 'refuse' | 'accept'): ServerGate {
  return {
    eventType: 'comment.added',
    async check(event, handle) {
      await handle.query('INSERT INTO gate_marker (event_id) VALUES ($1)', [event.id]);
      return verdict === 'refuse' ? { rule: MARKER_RULE, reason: 'refused after writing a marker' } : null;
    },
  };
}

beforeAll(async () => {
  db = await createTestDatabase();
  await db.pool.query('CREATE TABLE gate_marker (event_id text PRIMARY KEY)');
  await attach(PNG_ID, TICKET, 'image/png');
  await attach(PDF_ID, TICKET, 'application/pdf');
  const deps = {
    pool: db.pool,
    // Accept-all engine and an empty projection registry, for the same reason
    // the gate suites use them: a refusal from anything but a gate would make
    // every green here mean something other than what it says.
    evaluate: async () => ({ refused: false as const }),
    projections: createProjectionRegistry(),
  };
  gated = createIngestService({ ...deps, gates: buildServerGates() });
  ungated = createIngestService(deps);
});

afterAll(async () => {
  await db.drop();
});

describe('the gate seam', () => {
  it('buildServerGates covers comment.added, ticket.field_set and ticket.transitioned — and nothing else', () => {
    // The event types themselves, not a count. A length assertion goes green
    // for a build that dropped the evidence gate and added a second embed gate,
    // and this is the ONLY place that says which doors are gated at all: a gate
    // absent from this array runs nowhere in the product.
    expect(buildServerGates().map((gate) => gate.eventType)).toEqual([
      'comment.added',
      'ticket.field_set',
      'ticket.transitioned',
    ]);
  });

  it('a gate reads and writes through the TRANSACTION client: a refusal takes the gate own writes back', async () => {
    const service = createIngestService({
      pool: db.pool,
      evaluate: async () => ({ refused: false as const }),
      projections: createProjectionRegistry(),
      gates: [markerGate('refuse')],
    });
    const event = submitted('comment.added', { body: { type: 'doc', content: [] } });

    const [result] = await service.ingestBatch([event]);

    expect(result).toMatchObject({ status: 'refused', rule: MARKER_RULE });
    // The marker is GONE. Handed `deps.pool` instead of the transaction's
    // client, the INSERT would have autocommitted on a different connection and
    // this row would still be here — which is the mutation this case exists for.
    expect(await markerIds()).toEqual([]);
    expect(await ledgerCount(event.id)).toBe(0);
  });

  it('POSITIVE CONTROL: the same gate write SURVIVES when the gate accepts, so the empty table above is a rollback and not a no-op', async () => {
    const service = createIngestService({
      pool: db.pool,
      evaluate: async () => ({ refused: false as const }),
      projections: createProjectionRegistry(),
      gates: [markerGate('accept')],
    });
    const event = submitted('comment.added', { body: { type: 'doc', content: [] } });

    const [result] = await service.ingestBatch([event]);

    expect(result).toMatchObject({ status: 'committed' });
    expect(await markerIds()).toEqual([event.id]);
    await db.pool.query('DELETE FROM gate_marker');
  });

  it('a gate refusal rolls back ITS OWN event and leaves its batch neighbours committed', async () => {
    // The batch answer, stated as a test because the alternative — one refusal
    // discarding the whole push — would make an offline client's legitimate
    // work vanish because one of its documents named a stale attachment.
    const first = submitted('comment.added', { body: docEmbedding(PNG_ID) });
    const middle = submitted('comment.added', { body: docEmbedding(PDF_ID) });
    const last = submitted('comment.added', { body: docEmbedding(PNG_ID) });

    const results = await gated.ingestBatch([first, middle, last]);

    expect(results.map((result) => result.status)).toEqual(['committed', 'refused', 'committed']);
    expect(results[1]).toMatchObject({ rule: RULE_EMBED_NOT_IMAGE });
    // The ledger itself, event by event — the statuses above would also be
    // produced by a service that answered honestly and appended nothing.
    expect([await ledgerCount(first.id), await ledgerCount(middle.id), await ledgerCount(last.id)]).toEqual([
      1, 0, 1,
    ]);
  });

  it('no commit listener fires for a gate-refused event, and one fires for its committing neighbour', async () => {
    const heard: string[] = [];
    const unsubscribe = gated.onEventCommitted((event: LedgerEvent) => heard.push(event.id));
    const refused = submitted('comment.added', { body: docEmbedding(PDF_ID) });
    const committedEvent = submitted('comment.added', { body: docEmbedding(PNG_ID) });

    await gated.ingestBatch([refused, committedEvent]);
    unsubscribe();

    // Ids, not a count: a listener that fired for BOTH events and a listener
    // that fired for neither are different defects, and `heard.length === 1`
    // cannot tell either of them from the truth.
    expect(heard).toEqual([committedEvent.id]);
  });

  it('the seam is inert when omitted: the same document commits through a service built with no gates', async () => {
    // `gates` defaults to `[]`, which is what leaves Plan 1's ingest suite, the
    // permission suites and the route suites unchanged by this task. It is also
    // the control for every refusal in this directory: the refusals are the
    // gates deciding, not the payload being rejected somewhere else.
    const event = submitted('comment.added', { body: docEmbedding(PDF_ID) });

    const [result] = await ungated.ingestBatch([event]);

    expect(result).toMatchObject({ status: 'committed' });
    expect(await ledgerCount(event.id)).toBe(1);
  });

  it('the gate loop runs AFTER the rule engine: an engine refusal wins over a gate refusal on the same event', async () => {
    // The seam's declared slot is "after the rule engine accepts and before the
    // append" (plan Task 11; `ingest-service.ts` says "the position is the whole
    // point of the seam"). Until this case, nothing executed that ordering:
    // every gated service in this repo pairs `buildServerGates()` with an
    // accept-all engine, so a loop hoisted above `deps.evaluate` left all 852
    // tests green. The mutation this case exists for is that hoist.
    //
    // It matters beyond tidiness. Hoisted, a gate answers events the engine was
    // about to refuse — so a workflow rule's refusal is replaced by
    // `attachment.embed-not-image`, which is a statement about which
    // attachments this ticket holds, addressed to somebody the engine had
    // already decided was not entitled to the answer.
    const engineFirst = createIngestService({
      pool: db.pool,
      evaluate: async () => ({
        refused: true as const,
        rule: 'test.engine-first',
        reason: 'the engine refused before any gate could look',
      }),
      projections: createProjectionRegistry(),
      gates: buildServerGates(),
    });
    const engineEvent = submitted('comment.added', { body: docEmbedding(PDF_ID) });
    const gateEvent = submitted('comment.added', { body: docEmbedding(PDF_ID) });

    const [engineResult] = await engineFirst.ingestBatch([engineEvent]);
    // POSITIVE CONTROL, and the reason this green is not vacuous: the SAME
    // payload through a service whose only difference is an accept-all engine
    // reaches the gate and is refused by it. Without this line, an
    // `engineFirst` whose gates silently never ran would look identical.
    const [gateResult] = await gated.ingestBatch([gateEvent]);

    expect(engineResult).toMatchObject({ status: 'refused', rule: 'test.engine-first' });
    expect(gateResult).toMatchObject({ status: 'refused', rule: RULE_EMBED_NOT_IMAGE });
    expect(await ledgerCount(engineEvent.id)).toBe(0);
  });

  it('an event whose entity is not a ticket never reaches a gate — parseEvent refuses the kind first', async () => {
    // `image-embed-gate.ts` records that the registry's `entityKind: 'ticket'`
    // binding is load-bearing: the gate compares `attachments.ticket_id`
    // against `event.entity.id`, which is only a ticket id because nothing else
    // gets this far. Prose in a comment cannot notice a re-registration; this
    // can.
    //
    // ALL THREE gated types, not just the first. The docblocks rest the same
    // weight on each — `image-embed-gate.ts` names `comment.added` and
    // `ticket.field_set`, `evidence-gate.ts` names `ticket.transitioned` — and
    // a re-registration of either of the other two would leave a single-type
    // case green while turning that gate's ticket predicate into a comparison
    // against something that is not a ticket id.
    const results = await gated.ingestBatch([
      submitted('comment.added', { body: docEmbedding(PNG_ID) }, { kind: 'project', id: newUlid() }),
      submitted(
        'ticket.field_set',
        { fieldId: 'description', value: docEmbedding(PNG_ID) },
        { kind: 'project', id: newUlid() },
      ),
      submitted(
        'ticket.transitioned',
        { toStateId: 'done', evidenceAttachmentId: PNG_ID },
        { kind: 'project', id: newUlid() },
      ),
    ]);

    expect(results).toMatchObject([
      { status: 'invalid', code: 'entity-kind-mismatch' },
      { status: 'invalid', code: 'entity-kind-mismatch' },
      { status: 'invalid', code: 'entity-kind-mismatch' },
    ]);
  });
});

describe('the gate seam at the CLIENT door', () => {
  /**
   * Gates are unconditional across doors, and this is the half that could
   * silently not be: `commitOne` is shared, but a future edit moving the loop
   * into the internal-door branch would leave every test above green while
   * ungating `POST /v1/events` and Plan 10's `POST /v1/sync` — the only two
   * doors a real client can reach.
   */
  const CLIENT_WS = newUlid();
  const PROJECT = newUlid();
  const CLIENT_TICKET = newUlid();
  const MEMBER = newUlid();
  const CLIENT_PNG = newUlid();
  const CLIENT_PDF = newUlid();

  let clientIngest: IngestService;

  beforeAll(async () => {
    await seedProject(db.pool, CLIENT_WS, PROJECT);
    await seedMember(db.pool, CLIENT_WS, MEMBER, 'member', [{ projectId: PROJECT }]);
    await seedTicket(db.pool, {
      workspaceId: CLIENT_WS,
      projectId: PROJECT,
      ticketId: CLIENT_TICKET,
      createdBy: MEMBER,
    });
    await attach(CLIENT_PNG, CLIENT_TICKET, 'image/png', CLIENT_WS);
    await attach(CLIENT_PDF, CLIENT_TICKET, 'application/pdf', CLIENT_WS);
    clientIngest = createIngestService({
      pool: db.pool,
      evaluate: async () => ({ refused: false as const }),
      projections: createProjectionRegistry(),
      gates: buildServerGates(),
    });
  });

  function clientComment(attachmentId: string, actorId = MEMBER): SubmittedEvent {
    return {
      id: newUlid(),
      workspaceId: CLIENT_WS,
      entity: { kind: 'ticket', id: CLIENT_TICKET },
      type: 'comment.added',
      version: 1,
      payload: { body: docEmbedding(attachmentId) },
      actorId,
      origin: 'web',
      clientTime: '2026-08-20T10:00:00.000Z',
    };
  }

  it('CONTROL: a permitted member embedding the ticket own png commits through ingestClientBatch', async () => {
    // Without this, the refusal below would be satisfied by a permission gate
    // refusing this member for reasons that have nothing to do with embedding.
    const event = clientComment(CLIENT_PNG);
    const [result] = await clientIngest.ingestClientBatch([event], MEMBER);
    expect(result).toMatchObject({ status: 'committed' });
  });

  it('the same permitted member embedding a pdf is refused attachment.embed-not-image at the client door', async () => {
    const event = clientComment(CLIENT_PDF);
    const [result] = await clientIngest.ingestClientBatch([event], MEMBER);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EMBED_NOT_IMAGE });
    expect(await ledgerCount(event.id)).toBe(0);
  });

  it('the gate loop runs AFTER the permission gate: a stranger embedding a pdf is told permission, never which attachment this ticket holds', async () => {
    // The other half of the position claim, and the half with teeth. Hoisted
    // above `checkPermission`, the gate answers a NON-MEMBER — who then learns
    // `attachment.embed-not-image` when the id names a pdf on this ticket and
    // `attachment.embed-unknown` when it names nothing here. That is the
    // P14-class existence oracle over every attachment id in the deployment,
    // and today it is held shut by nothing but the loop sitting last.
    //
    // The control for this green is the case directly above: the SAME workspace,
    // ticket and pdf, submitted by a PERMITTED member, is refused
    // `attachment.embed-not-image`. So a permission rule here means the
    // permission gate won the race, not that the gate declined to fire.
    //
    // The RULE is pinned, not the reason. Which permission refusal a stranger
    // earns is the permission module's own ordering (Plan 4's business); that it
    // is a permission refusal at all rather than a gate refusal is this seam's.
    const stranger = newUlid();
    const event = clientComment(CLIENT_PDF, stranger);

    const [result] = await clientIngest.ingestClientBatch([event], stranger);

    expect(result).toMatchObject({ status: 'refused', rule: PERMISSION_ROLE_RULE });
    // `.not` alone would also be satisfied by an `invalid` result or a silent
    // commit, so it rides behind the positive assertion rather than standing in
    // for it.
    expect((result as { rule?: string }).rule).not.toBe(RULE_EMBED_NOT_IMAGE);
    expect(await ledgerCount(event.id)).toBe(0);
  });
});
