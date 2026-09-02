import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { RULE_EVIDENCE_UNKNOWN } from '../../src/gates/evidence-gate.js';
import { buildServerGates } from '../../src/gates/index.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { createProjectionRegistry } from '../../src/projections/registry.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const WS = '01J9GWKS000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const OTHER_TICKET = '01J9GTKB000000000000000000';
const EVIDENCE_ID = '01J9GATA000000000000000000';
const FOREIGN_ID = '01J9GATB000000000000000000';
/** Corrected from the plan's `01J9GUSM…`: `U` is not in Crockford base32. See image-embed-gate.test.ts. */
const ACTOR = '01J9GACT000000000000000000';

/**
 * `to`, not `toStateId`. The plan's test text says `toStateId`, but
 * `ticketTransitionedPayloadSchema` (packages/domain/src/workflow.ts) requires
 * `to` — an event carrying `toStateId` is answered `invalid` /
 * `invalid-payload` by `parseEvent` and never reaches a gate at all, so the
 * plan's version of this suite would have gone green on the refusals for
 * entirely the wrong reason and red on the committing case.
 */
function transition(payload: unknown): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    version: 1,
    payload,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T10:00:00.000Z',
  };
}

let db: TestDatabase;
let ingest: IngestService;

beforeAll(async () => {
  db = await createTestDatabase();
  await insertAttachment(db.pool, {
    id: EVIDENCE_ID,
    workspaceId: WS,
    ticketId: TICKET,
    uploaderId: ACTOR,
    filename: 'receipt.pdf',
    mime: 'application/pdf',
    size: 1,
    objectKey: `w/${WS}/a/${EVIDENCE_ID}`,
  });
  await insertAttachment(db.pool, {
    id: FOREIGN_ID,
    workspaceId: WS,
    ticketId: OTHER_TICKET,
    uploaderId: ACTOR,
    filename: 'other.pdf',
    mime: 'application/pdf',
    size: 1,
    objectKey: `w/${WS}/a/${FOREIGN_ID}`,
  });
  ingest = createIngestService({
    pool: db.pool,
    evaluate: async () => ({ refused: false as const }),
    projections: createProjectionRegistry(),
    gates: buildServerGates(),
  });
});

afterAll(async () => {
  await db.drop();
});

async function ledgerCount(eventId: string): Promise<number> {
  const result = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [eventId]);
  return (result.rows as Array<{ n: number }>)[0]!.n;
}

describe('evidence gate', () => {
  it('a transition carrying real evidence from this ticket commits', async () => {
    const event = transition({ to: 'done', evidenceAttachmentId: EVIDENCE_ID });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'committed' });
    expect(await ledgerCount(event.id)).toBe(1);
  });

  it("a transition without evidence is not this gate's business (require-evidence is Plan 2's rule)", async () => {
    const [result] = await ingest.ingestBatch([transition({ to: 'done' })]);
    expect(result).toMatchObject({ status: 'committed' });
  });

  it('fabricated evidence is refused attachment.evidence-unknown and leaves no trace', async () => {
    const event = transition({ to: 'done', evidenceAttachmentId: newUlid() });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_UNKNOWN });
    if (result?.status === 'refused') expect(result.reason).toContain('does not exist on this ticket');
    expect(await ledgerCount(event.id)).toBe(0);
  });

  it("another ticket's attachment as evidence is refused identically — no existence leak", async () => {
    // FOREIGN_ID is a real, existing row. The only thing wrong with it is whose
    // it is, so this reddens for a gate that looks an evidence id up by id
    // alone — and the fabricated case above does not.
    const foreignEvent = transition({ to: 'done', evidenceAttachmentId: FOREIGN_ID });
    const [foreign] = await ingest.ingestBatch([foreignEvent]);
    const fake = newUlid();
    const [fabricated] = await ingest.ingestBatch([transition({ to: 'done', evidenceAttachmentId: fake })]);
    expect(foreign).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_UNKNOWN });
    expect(fabricated).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_UNKNOWN });
    if (foreign?.status === 'refused' && fabricated?.status === 'refused') {
      expect(foreign.reason.replace(FOREIGN_ID, 'ID')).toBe(fabricated.reason.replace(fake, 'ID'));
    }
    expect(await ledgerCount(foreignEvent.id)).toBe(0);
  });
});
