import { newUlid } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';

/**
 * Seed a committed `attachment.added` Drive reference straight into the
 * ledger. A reference has no bytes, so it has no `attachments` row — the
 * ledger IS its record. Writing the row directly (rather than through
 * ingest) keeps these gate tests independent of the pending Plan 3 payload
 * amendment: the REGISTRATION is proven in Plan 3's own suite, and the
 * gate's input is a committed row either way.
 *
 * DEVIATION FROM THE PLAN TEXT: the plan's version of this helper assigns
 * `seq`/`workspace_seq` from a module-level counter starting at 9000. That
 * collides here. `nextWorkspaceSeq`/`nextSeq` (`src/ledger/event-store.ts`)
 * assign both as `coalesce(max(...), 0) + 1` per workspace / per entity, and
 * this file's suite interleaves seeded rows with `ingest.ingestBatch(...)`
 * calls against the SAME test database (one `beforeAll` for the whole file).
 * A fixed counter would work for exactly one seed call before a real
 * `workspace_seq` minted by ingest caught up to it and the next seed's fixed
 * value collided with `events_workspace_seq_unique`. Deriving both values the
 * same way ingest does — `max + 1`, read fresh on every call — is correct
 * regardless of how many other rows (seeded or ingested) already exist for
 * this workspace or this ticket, which also keeps the helper safe for
 * whatever order Task 12c's suite calls it in.
 *
 * No advisory lock is taken (contrast `lockWorkspace`/`lockEntity`): these
 * calls run sequentially, awaited one at a time, inside single-threaded test
 * setup — there is no concurrent writer for a lock to serialise against.
 *
 * EXTENSION (Task 12c): `mimeType` is optional and defaults to this file's
 * original `application/pdf`, so both existing callers (evidence-gate.test.ts)
 * are untouched. Task 12c's own case needs the opposite: a Drive reference
 * whose claimed mime IS an image, because the property under test —
 * "a reference is refused however it disguises itself" — only distinguishes
 * itself from a bare mime check when the seeded mime is one a mime check
 * would have let through. Seeded with the PDF default, layer 3's refusal
 * would look identical whether the gate reasons from `attachments` existence
 * or from mimeType, which proves nothing about which one it actually does.
 */
export async function seedDriveReference(
  db: Queryable,
  params: { workspaceId: string; ticketId: string; attachmentId: string; actorId: string; mimeType?: string },
): Promise<void> {
  const workspaceSeqResult = await db.query<{ head: string }>(
    'SELECT coalesce(max(workspace_seq), 0)::bigint AS head FROM events WHERE workspace_id = $1',
    [params.workspaceId],
  );
  const workspaceSeq = Number(workspaceSeqResult.rows[0]?.head ?? 0) + 1;

  const seqResult = await db.query<{ head: string }>(
    "SELECT coalesce(max(seq), 0)::bigint AS head FROM events WHERE entity_kind = 'ticket' AND entity_id = $1",
    [params.ticketId],
  );
  const seq = Number(seqResult.rows[0]?.head ?? 0) + 1;

  await db.query(
    `INSERT INTO events (id, workspace_id, entity_kind, entity_id, type, version, payload,
                         actor_id, origin, client_time, server_time, seq, workspace_seq)
     VALUES ($1, $2, 'ticket', $3, 'attachment.added', 1, $4::jsonb, $5, 'web', $6, now(), $7, $8)`,
    [
      newUlid(),
      params.workspaceId,
      params.ticketId,
      JSON.stringify({
        kind: 'drive-reference',
        attachmentId: params.attachmentId,
        driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
        name: 'GST filing Aug 2026.pdf',
        mimeType: params.mimeType ?? 'application/pdf',
        webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
        capturedAt: '2026-08-20T10:00:00.000Z',
      }),
      params.actorId,
      '2026-08-20T10:00:00.000Z',
      seq,
      workspaceSeq,
    ],
  );
}
