import type { SqlRow, SyncStorage } from '../storage/storage.js';

/**
 * A claim this device REMOVED from its outbox (trash series Plan 3, D2/D6):
 * the item it was about was permanently erased, so it can never commit, and
 * spec §5.7 forbids dropping it silently. Content-free: `noticeId` is the
 * removed claim's event id; the payload — content of an erased item — is not
 * kept.
 */
export type SyncNotice = {
  noticeId: string;
  workspaceId: string;
  kind: 'purged';
  entityKind: string;
  entityId: string;
  eventType: string;
  recordedAt: string;
};

/** Each row becomes a notice, then leaves the outbox. `rows` are `SELECT * FROM outbox` rows. */
export async function dropOutboxRowsAsNotices(
  tx: SyncStorage,
  rows: readonly SqlRow[],
  recordedAt: string,
): Promise<void> {
  for (const row of rows) {
    const envelope = JSON.parse(row['envelope'] as string) as { type?: unknown };
    await tx.run(
      `INSERT INTO sync_notices (notice_id, workspace_id, kind, entity_kind, entity_id, event_type, recorded_at)
       VALUES (?, ?, 'purged', ?, ?, ?, ?)
       ON CONFLICT(notice_id) DO NOTHING`,
      [
        row['event_id'] as string,
        row['workspace_id'] as string,
        row['entity_kind'] as string,
        row['entity_id'] as string,
        typeof envelope.type === 'string' ? envelope.type : 'unknown',
        recordedAt,
      ],
    );
    await tx.run('DELETE FROM outbox WHERE event_id = ?', [row['event_id'] as string]);
  }
}

function rowToNotice(row: SqlRow): SyncNotice {
  return {
    noticeId: row['notice_id'] as string,
    workspaceId: row['workspace_id'] as string,
    kind: 'purged',
    entityKind: row['entity_kind'] as string,
    entityId: row['entity_id'] as string,
    eventType: row['event_type'] as string,
    recordedAt: row['recorded_at'] as string,
  };
}

export async function listNotices(storage: SyncStorage, workspaceId: string): Promise<SyncNotice[]> {
  const rows = await storage.all(
    'SELECT * FROM sync_notices WHERE workspace_id = ? ORDER BY recorded_at, notice_id',
    [workspaceId],
  );
  return rows.map(rowToNotice);
}

export async function deleteNotice(storage: SyncStorage, noticeId: string): Promise<void> {
  await storage.run('DELETE FROM sync_notices WHERE notice_id = ?', [noticeId]);
}
