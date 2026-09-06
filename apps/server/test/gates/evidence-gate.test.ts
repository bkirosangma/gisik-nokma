import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EVIDENCE_DRIVE_REFERENCE_REASON,
  RULE_EVIDENCE_DRIVE_REFERENCE,
  newUlid,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { RULE_EVIDENCE_UNKNOWN } from '../../src/gates/evidence-gate.js';
import { buildServerGates } from '../../src/gates/index.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { createProjectionRegistry } from '../../src/projections/registry.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedDriveReference } from '../helpers/drive-reference.js';

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
  /**
   * 9.223 — evidence gate: a transition carrying real evidence from this ticket commits.
   */
  it('a transition carrying real evidence from this ticket commits', async () => {
    const event = transition({ to: 'done', evidenceAttachmentId: EVIDENCE_ID });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'committed' });
    expect(await ledgerCount(event.id)).toBe(1);
  });

  /**
   * 9.224 — a transition without evidence at all is not this gate's business — `require-evidence` itself is Plan 2's rule-engine rule, and this gate only judges evidence that IS named.
   */
  it("a transition without evidence is not this gate's business (require-evidence is Plan 2's rule)", async () => {
    const [result] = await ingest.ingestBatch([transition({ to: 'done' })]);
    expect(result).toMatchObject({ status: 'committed' });
  });

  /**
   * 9.225 — fabricated evidence is refused `attachment.evidence-unknown` and leaves no trace.
   */
  it('fabricated evidence is refused attachment.evidence-unknown and leaves no trace', async () => {
    const event = transition({ to: 'done', evidenceAttachmentId: newUlid() });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_UNKNOWN });
    if (result?.status === 'refused') expect(result.reason).toContain('does not exist on this ticket');
    expect(await ledgerCount(event.id)).toBe(0);
  });

  /**
   * 9.226 — another ticket's real attachment as evidence is refused IDENTICALLY to fabricated evidence — no existence leak.
   */
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

  /**
   * 9.227 — planted defect: a Drive reference on THIS ticket named as evidence is refused `attachment.evidence-drive-reference`, with the reason BYTE-IDENTICAL to `EVIDENCE_DRIVE_REFERENCE_REASON` and no id leaked into it.
   */
  it('planted defect: a Drive reference on THIS ticket is refused as evidence, with the remedy named', async () => {
    const referenceId = newUlid();
    await seedDriveReference(db.pool, { workspaceId: WS, ticketId: TICKET, attachmentId: referenceId, actorId: ACTOR });
    const event = transition({ to: 'done', evidenceAttachmentId: referenceId });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_DRIVE_REFERENCE });
    if (result?.status === 'refused') {
      // Byte-identical to the single origin — the user and the test read the same sentence.
      expect(result.reason).toBe(EVIDENCE_DRIVE_REFERENCE_REASON);
      expect(result.reason).not.toContain(referenceId);
    }
    expect(await ledgerCount(event.id)).toBe(0);
  });

  /**
   * 9.228 — planted defect: a Drive reference on ANOTHER ticket refuses as `attachment.evidence-unknown`, identically to a fabricated id — the Drive-specific refusal never leaks that a reference exists elsewhere.
   */
  it('planted defect: a Drive reference on ANOTHER ticket refuses as unknown — the drive refusal never leaks existence elsewhere', async () => {
    const elsewhere = newUlid();
    await seedDriveReference(db.pool, { workspaceId: WS, ticketId: OTHER_TICKET, attachmentId: elsewhere, actorId: ACTOR });
    const [foreign] = await ingest.ingestBatch([transition({ to: 'done', evidenceAttachmentId: elsewhere })]);
    const fake = newUlid();
    const [fabricated] = await ingest.ingestBatch([transition({ to: 'done', evidenceAttachmentId: fake })]);
    expect(foreign).toMatchObject({ status: 'refused', rule: RULE_EVIDENCE_UNKNOWN });
    if (foreign?.status === 'refused' && fabricated?.status === 'refused') {
      expect(foreign.reason.replace(elsewhere, 'ID')).toBe(fabricated.reason.replace(fake, 'ID'));
    }
  });
});
