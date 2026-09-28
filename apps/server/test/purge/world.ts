import type { Pool } from 'pg';
import { membershipId, newUlid, purgeDueAt, type EntityKind, type LedgerEvent } from '@gisik-nokma/domain';
import { buildContestedClaim } from '../../src/sync/contest-coherence.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';

/**
 * Worlds for the purge suites (trash series Plan 2). Every world mints its own
 * workspace and ids, so worlds share a database without reading each other's
 * rows — `events` is append-only and no suite here truncates it. Events are
 * applied with `applyCommitted` (insert + every registered projection, no
 * engine), which is how every projection suite in this repo seeds.
 */

export const TYPE_ID = 'purge-task';

export type Base = { WS: string; OWNER: string; workflowId: string };

export function ev(
  base: Pick<Base, 'WS' | 'OWNER'>,
  kind: EntityKind,
  id: string,
  type: string,
  payload: unknown,
  actorId: string = base.OWNER,
): LedgerEvent {
  return makeCommitted({ workspaceId: base.WS, entity: { kind, id }, type, payload, actorId });
}

/** A workspace with one workflow, one ticket type and its owner's membership. */
export async function seedWorkspace(pool: Pool, owner: string = newUlid()): Promise<Base> {
  const WS = newUlid();
  const workflowId = newUlid();
  const base: Base = { WS, OWNER: owner, workflowId };
  await applyCommitted(pool, [
    ev(base, 'workspace', WS, 'workspace.created', { name: 'Purge world' }),
    ev(base, 'workflow', workflowId, 'workflow.defined', {
      id: workflowId,
      version: 1,
      name: 'Basic',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: 'todo', to: 'done', rules: [] }],
    }),
    ev(base, 'ticket-type', newUlid(), 'ticket-type.defined', {
      id: TYPE_ID,
      name: 'Task',
      icon: 'check',
      rank: 1,
      workflowId,
      fields: [],
    }),
    ev(base, 'membership', membershipId(WS, owner), 'membership.granted', { userId: owner, role: 'owner' }),
  ]);
  return base;
}

export function projectCreated(base: Base, projectId: string, name: string, prefix: string): LedgerEvent {
  return ev(base, 'project', projectId, 'project.created', { name, prefix });
}

export function ticketCreated(
  base: Base,
  ticketId: string,
  projectId: string,
  title: string,
  parentId: string | null = null,
): LedgerEvent {
  return ev(base, 'ticket', ticketId, 'ticket.created', { typeId: TYPE_ID, projectId, parentId, title });
}

export function noteCreated(base: Base, noteId: string, payload: Record<string, unknown>): LedgerEvent {
  return ev(base, 'note', noteId, 'note.created', payload);
}

export const text = (value: string) => ({ type: 'text', text: value });

export const doc = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });

/** A `ticketRef` chip exactly as `packages/editor/src/extensions/ticket-ref.ts:64-86` stores it. */
export const ticketRef = (ticketId: string, projectId: string, key: string, title: string) => ({
  type: 'ticketRef',
  attrs: { ticketId, projectId, key, title },
});

/** A lower-case unique marker: `'simple'` tsvectors lower-case every token, and ILIKE does not care. */
export function newMarker(): string {
  return `zqx${newUlid().toLowerCase()}`;
}

export function uploadPayload(attachmentId: string, filename: string) {
  return { kind: 'upload', attachmentId, filename, mime: 'application/pdf', size: 3, sha256: 'ab'.repeat(32) };
}

/** An `attachments` row as the upload route writes it (`apps/server/migrations/1788356858695_attachments.sql:3-13`). */
export async function insertAttachment(
  pool: Pool,
  base: Base,
  attachmentId: string,
  owner: { ticketId?: string; noteId?: string },
  filename: string,
  objectKey: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO attachments (id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', 3, $7)`,
    [attachmentId, base.WS, owner.ticketId ?? null, owner.noteId ?? null, base.OWNER, filename, objectKey],
  );
}

/** An assignment notification: its payload names the ticket and quotes its title (`packages/domain/src/notifications.ts:51-60`). */
export async function insertNotification(
  pool: Pool,
  base: Pick<Base, 'WS' | 'OWNER'>,
  userId: string,
  ticketId: string,
  ticketTitle: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload)
     VALUES ($1, $2, $3, 'assignment', $4, $5)`,
    [
      newUlid(),
      userId,
      base.WS,
      `assignment:${ticketId}:${newUlid()}`,
      JSON.stringify({
        ticketId,
        ticketTitle,
        assignedBy: base.OWNER,
        eventId: newUlid(),
        clientTime: '2026-08-20T09:00:00.000Z',
        serverTime: '2026-08-20T09:00:01.000Z',
      }),
    ],
  );
}

export async function insertSnapshot(pool: Pool, ticketId: string, state: unknown): Promise<void> {
  await pool.query(`INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', $1, 1, $2)`, [
    ticketId,
    JSON.stringify(state),
  ]);
}

/** A server-origin contest on `ticketId`, built by the one builder the sync door uses. */
export function contestOn(base: Base, ticketId: string): LedgerEvent {
  const contest = buildContestedClaim({
    originalEvent: {
      id: newUlid(),
      workspaceId: base.WS,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.field_set',
      version: 1,
      payload: { fieldId: 'priority', value: 'P1' },
      actorId: base.OWNER,
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    },
    rule: 'workflow.transition-not-allowed',
    reason: 'That move is not allowed from here.',
    actorId: base.OWNER,
  });
  return makeCommitted({
    workspaceId: contest.workspaceId,
    entity: contest.entity,
    type: contest.type,
    payload: contest.payload,
    actorId: contest.actorId,
    origin: 'server',
  });
}

const LIFECYCLE_ROW = {
  workspace: ['proj_workspaces', 'workspace_id'],
  project: ['proj_projects', 'project_id'],
  ticket: ['proj_tickets', 'ticket_id'],
  note: ['proj_notes', 'note_id'],
} as const;

/** The instant the item's mark falls due, from its lifecycle row — never computed from a literal. */
export async function dueAt(pool: Pool, kind: keyof typeof LIFECYCLE_ROW, id: string): Promise<Date> {
  const [table, key] = LIFECYCLE_ROW[kind];
  const { rows } = await pool.query<{ purge_marked_at: Date | null }>(
    `SELECT purge_marked_at FROM ${table} WHERE ${key} = $1`,
    [id],
  );
  const markedAt = rows[0]?.purge_marked_at;
  if (markedAt === undefined || markedAt === null) throw new Error(`dueAt: ${kind} ${id} is not marked`);
  return new Date(purgeDueAt(markedAt.toISOString()));
}

/** An object store that records deletes; a key in `failing` throws. */
export function recordingStore(failing: ReadonlySet<string> = new Set()) {
  const deleted: string[] = [];
  return {
    deleted,
    async delete(key: string): Promise<void> {
      if (failing.has(key)) throw new Error(`boom: ${key}`);
      deleted.push(key);
    },
  };
}

export type TicketWorld = Base & {
  P: string;
  T: string;
  C: string;
  S1: string;
  S2: string;
  keyT: string;
  keyS1: string;
  marker: string;
};

/**
 * A project with T (to be purged: deleted, then marked — the mark is the LAST
 * event of the workspace, which 19.113's seq-capture case depends on), T's child
 * C, a sibling S1 and a later ticket S2. T's content carries `marker` in its
 * title, description, comment, attachment filename, notification and snapshot;
 * S1 has the same shapes without it.
 */
export async function buildTicketWorld(pool: Pool): Promise<TicketWorld> {
  const base = await seedWorkspace(pool);
  const marker = newMarker();
  const P = newUlid();
  const T = newUlid();
  const C = newUlid();
  const S1 = newUlid();
  const S2 = newUlid();
  const attT = newUlid();
  const attS1 = newUlid();
  const keyT = `w/${base.WS}/a/${attT}`;
  const keyS1 = `w/${base.WS}/a/${attS1}`;
  await applyCommitted(pool, [
    projectCreated(base, P, 'Purge', 'PG'),
    ticketCreated(base, T, P, `Invoice ${marker}`),
    ticketCreated(base, C, P, 'Child of the purged', T),
    ticketCreated(base, S1, P, 'Sibling that survives'),
    ticketCreated(base, S2, P, 'A later ticket'),
    ev(base, 'ticket', T, 'ticket.field_set', { fieldId: 'description', value: doc(text(`the ${marker} contract`)) }),
    ev(base, 'ticket', T, 'comment.added', { body: doc(text(`remember ${marker}`)) }),
    ev(base, 'ticket', T, 'attachment.added', uploadPayload(attT, `${marker}.pdf`)),
    ev(base, 'ticket', S1, 'attachment.added', uploadPayload(attS1, 'survivor.pdf')),
    contestOn(base, T),
    contestOn(base, S1),
  ]);
  await insertAttachment(pool, base, attT, { ticketId: T }, `${marker}.pdf`, keyT);
  await insertAttachment(pool, base, attS1, { ticketId: S1 }, 'survivor.pdf', keyS1);
  await insertNotification(pool, base, base.OWNER, T, `Invoice ${marker}`);
  await insertNotification(pool, base, base.OWNER, S1, 'Sibling that survives');
  await insertSnapshot(pool, T, { title: `Invoice ${marker}` });
  await insertSnapshot(pool, S1, { title: 'Sibling that survives' });
  await applyCommitted(pool, [
    ev(base, 'ticket', T, 'ticket.deleted', {}),
    ev(base, 'ticket', T, 'purge.marked', {}),
  ]);
  return { ...base, P, T, C, S1, S2, keyT, keyS1, marker };
}
