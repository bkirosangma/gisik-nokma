import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { RULE_EMBED_NOT_IMAGE, RULE_EMBED_UNKNOWN } from '../../src/gates/image-embed-gate.js';
import { buildServerGates } from '../../src/gates/index.js';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { createProjectionRegistry } from '../../src/projections/registry.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const WS = '01J9GWKS000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const OTHER_TICKET = '01J9GTKB000000000000000000';
const PNG_ID = '01J9GATA000000000000000000';
const PDF_ID = '01J9GATB000000000000000000';
const FOREIGN_PNG_ID = '01J9GATC000000000000000000';
/**
 * The plan text spelled this actor `01J9GUSM000000000000000000`. `U` is one of
 * the four letters Crockford base32 leaves out (I, L, O, U), so `parseEvent`
 * answers `malformed-envelope` / "actorId: must be a ULID" and the event never
 * reaches a gate at all — every one of this file's cases failed for a reason
 * that had nothing to do with gates. Recorded as a plan-text defect rather than
 * silently corrected: the same literal appears in the plan's evidence-gate
 * suite and would have poisoned that one identically.
 */
const ACTOR = '01J9GACT000000000000000000';

/**
 * The event is built HERE, by hand, and never by driving the editor. That is
 * the point of this suite: layers 1 and 2 of image-only embedding live in the
 * client (`insertTicketImage`, paste/drop routing) and a client that posts
 * straight to `/v1/events` executes neither. A test that reached the gate
 * through the editor would prove only that the editor behaves, which is a
 * different claim from the one this gate makes.
 */
function submitted(type: string, payload: unknown, entityId = TICKET): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'ticket', id: entityId },
    type,
    version: 1,
    payload,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T10:00:00.000Z',
  };
}

function docEmbedding(...attachmentIds: string[]): unknown {
  return {
    type: 'doc',
    content: attachmentIds.map((attachmentId) => ({
      type: 'image',
      attrs: { attachmentId, wrap: 'block', alt: '' },
    })),
  };
}

let db: TestDatabase;
let ingest: IngestService;

beforeAll(async () => {
  db = await createTestDatabase();
  const attach = (id: string, ticketId: string, mime: string) =>
    insertAttachment(db.pool, {
      id,
      workspaceId: WS,
      ticketId,
      uploaderId: ACTOR,
      filename: 'f',
      mime,
      size: 1,
      objectKey: `w/${WS}/a/${id}`,
    });
  await attach(PNG_ID, TICKET, 'image/png');
  await attach(PDF_ID, TICKET, 'application/pdf');
  await attach(FOREIGN_PNG_ID, OTHER_TICKET, 'image/png');
  ingest = createIngestService({
    pool: db.pool,
    // Accept-all engine stub: these tests isolate GATE behaviour; the rule
    // engine's own refusals are Plan 2's planted-defect ground. An empty
    // projection registry for the same reason — a projection refusing this
    // ticket for its own reasons would make a green here mean nothing.
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

describe('image-embed gate (layer 3)', () => {
  it("a comment embedding the ticket's own png commits", async () => {
    const event = submitted('comment.added', { body: docEmbedding(PNG_ID) });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'committed' });
    expect(await ledgerCount(event.id)).toBe(1);
  });

  it('a comment embedding a pdf is refused attachment.embed-not-image and leaves no trace', async () => {
    const event = submitted('comment.added', { body: docEmbedding(PDF_ID) });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EMBED_NOT_IMAGE });
    if (result?.status === 'refused') {
      expect(result.reason).toContain('Only images may be embedded inline');
      expect(result.reason).toContain(PDF_ID);
    }
    expect(await ledgerCount(event.id)).toBe(0);
  });

  it('a fabricated embed id is refused attachment.embed-unknown and leaves no trace', async () => {
    const event = submitted('comment.added', { body: docEmbedding(newUlid()) });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EMBED_UNKNOWN });
    expect(await ledgerCount(event.id)).toBe(0);
  });

  it("another ticket's image is refused with the SAME rule and reason shape — no existence leak", async () => {
    const [foreignResult] = await ingest.ingestBatch([
      submitted('comment.added', { body: docEmbedding(FOREIGN_PNG_ID) }),
    ]);
    const fake = newUlid();
    const [fakeResult] = await ingest.ingestBatch([submitted('comment.added', { body: docEmbedding(fake) })]);
    expect(foreignResult).toMatchObject({ status: 'refused', rule: RULE_EMBED_UNKNOWN });
    expect(fakeResult).toMatchObject({ status: 'refused', rule: RULE_EMBED_UNKNOWN });
    if (foreignResult?.status === 'refused' && fakeResult?.status === 'refused') {
      // Byte-identical once the id itself is masked. If the two refusals could
      // be told apart, one transition at a time would enumerate every
      // attachment id in the deployment.
      expect(foreignResult.reason.replace(FOREIGN_PNG_ID, 'ID')).toBe(fakeResult.reason.replace(fake, 'ID'));
    }
  });

  it("a foreign image is refused even though it IS an image — the ticket predicate, not the mime, is what refuses it", async () => {
    // FOREIGN_PNG_ID is image/png. The only thing wrong with it is whose it is,
    // so this reddens for a gate that resolves an actor-supplied attachment id
    // with no ticket predicate — and the fabricated-id case above does not.
    const event = submitted('comment.added', { body: docEmbedding(FOREIGN_PNG_ID) });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EMBED_UNKNOWN });
    expect(await ledgerCount(event.id)).toBe(0);
  });

  it('every embed in the document is judged, not just the first', async () => {
    // The ticket's own png FIRST, the pdf SECOND. A gate that inspected only
    // ids[0] commits this and passes every other test in the file.
    const event = submitted('comment.added', { body: docEmbedding(PNG_ID, PDF_ID) });
    const [result] = await ingest.ingestBatch([event]);
    expect(result).toMatchObject({ status: 'refused', rule: RULE_EMBED_NOT_IMAGE });
    if (result?.status === 'refused') expect(result.reason).toContain(PDF_ID);
    expect(await ledgerCount(event.id)).toBe(0);
  });

  it('a description field_set embedding a pdf is refused; other fields are not inspected', async () => {
    const [descResult] = await ingest.ingestBatch([
      submitted('ticket.field_set', { fieldId: 'description', value: docEmbedding(PDF_ID) }),
    ]);
    expect(descResult).toMatchObject({ status: 'refused', rule: RULE_EMBED_NOT_IMAGE });

    const [otherResult] = await ingest.ingestBatch([
      submitted('ticket.field_set', { fieldId: 'notes', value: docEmbedding(PDF_ID) }),
    ]);
    expect(otherResult).toMatchObject({ status: 'committed' });
  });

  it('a doc with no images passes through untouched', async () => {
    const [result] = await ingest.ingestBatch([
      submitted('comment.added', { body: { type: 'doc', content: [{ type: 'paragraph' }] } }),
    ]);
    expect(result).toMatchObject({ status: 'committed' });
  });
});
