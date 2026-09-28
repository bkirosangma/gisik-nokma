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

/** A chunk row as the embed worker writes one (`apps/server/src/search/embed-worker.ts:152-170`); the vector is irrelevant here. */
export async function insertChunk(pool: Pool, base: Pick<Base, 'WS'>, noteId: string, chunkText: string): Promise<void> {
  await pool.query(
    `INSERT INTO search_note_chunks (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
     VALUES ($1, 0, $2, '', $3, 'test-model@1', 1, $4)`,
    [noteId, base.WS, chunkText, `[${new Array(512).fill(0).join(',')}]`],
  );
}

export type NoteWorld = Base & { P: string; X: string; N: string; keyN: string; marker: string };

/** A private workspace-level note N, attached to ticket X, deleted and then marked. */
export async function buildNoteWorld(pool: Pool): Promise<NoteWorld> {
  const base = await seedWorkspace(pool);
  const marker = newMarker();
  const P = newUlid();
  const X = newUlid();
  const N = newUlid();
  const attN = newUlid();
  const keyN = `w/${base.WS}/a/${attN}`;
  await applyCommitted(pool, [
    projectCreated(base, P, 'Notes', 'NT'),
    ticketCreated(base, X, P, 'A ticket the note hangs on'),
    noteCreated(base, N, {
      title: `Minutes ${marker}`,
      homeProjectId: '',
      scope: { mode: 'private' },
      body: doc(text(`we agreed ${marker}`)),
    }),
    ev(base, 'note', N, 'comment.added', { body: doc(text(`noted ${marker}`)) }),
    ev(base, 'note', N, 'note.attached', { ticketId: X }),
  ]);
  await insertAttachment(pool, base, attN, { noteId: N }, `${marker}.pdf`, keyN);
  await insertChunk(pool, base, N, `we agreed ${marker}`);
  await applyCommitted(pool, [ev(base, 'note', N, 'note.deleted', {}), ev(base, 'note', N, 'purge.marked', {})]);
  return { ...base, P, X, N, keyN, marker };
}

export type ProjectWorld = Base & {
  P2: string;
  Q: string;
  A: string;
  A1: string;
  B: string;
  B2: string;
  NP: string;
  NW: string;
  Q1: string;
  marker: string;
};

/**
 * Project P2 (to be purged) beside project Q (kept). P2 holds A and its child
 * A1, B (deleted), B2 (deleted AND marked — purged individually by the test
 * before the project, D11), a project note NP and a project membership. The
 * owner's preferences are keyed by both projects. NW is a workspace-level note.
 */
export async function buildProjectWorld(pool: Pool): Promise<ProjectWorld> {
  const base = await seedWorkspace(pool);
  const marker = newMarker();
  const [P2, Q, A, A1, B, B2, NP, NW, Q1] = Array.from({ length: 9 }, () => newUlid()) as [
    string, string, string, string, string, string, string, string, string,
  ];
  await applyCommitted(pool, [
    projectCreated(base, P2, 'Doomed', 'DM'),
    projectCreated(base, Q, 'Kept', 'KP'),
    ticketCreated(base, A, P2, `Doomed ${marker}`),
    ticketCreated(base, A1, P2, 'Its child', A),
    ticketCreated(base, B, P2, 'Deleted on its own'),
    ev(base, 'ticket', B, 'ticket.deleted', {}),
    ticketCreated(base, B2, P2, 'Purged on its own'),
    ev(base, 'ticket', B2, 'ticket.deleted', {}),
    ev(base, 'ticket', B2, 'purge.marked', {}),
    ticketCreated(base, Q1, Q, 'Kept ticket'),
    noteCreated(base, NP, { title: `Plan ${marker}`, homeProjectId: P2, scope: { mode: 'project' } }),
    noteCreated(base, NW, { title: 'Workspace note', homeProjectId: '', scope: { mode: 'workspace' } }),
    ev(base, 'project', P2, 'project.member_added', { userId: base.OWNER, projectAdmin: true }),
  ]);
  await pool.query(
    `INSERT INTO user_preferences (user_id, workspace_id, doc, updated_at) VALUES ($1, $2, $3, now())`,
    [
      base.OWNER,
      base.WS,
      JSON.stringify({
        savedFilters: [],
        listColumns: { [P2]: ['title'], [Q]: ['title'] },
        grouping: { [P2]: 'status', [Q]: 'epic' },
      }),
    ],
  );
  await applyCommitted(pool, [
    ev(base, 'project', P2, 'project.deleted', {}),
    ev(base, 'project', P2, 'purge.marked', {}),
  ]);
  return { ...base, P2, Q, A, A1, B, B2, NP, NW, Q1, marker };
}

export type WorkspacePair = {
  U: string;
  W1: Base;
  W2: Base;
  P1: string;
  T1: string;
  N1: string;
  INV: string;
  marker: string;
};

/** User U owns W1 (to be purged) and W2 (kept); both hold preferences and notifications for U. */
export async function buildWorkspacePair(pool: Pool): Promise<WorkspacePair> {
  const U = newUlid();
  const W1 = await seedWorkspace(pool, U);
  const W2 = await seedWorkspace(pool, U);
  const marker = newMarker();
  const [P1, T1, N1, INV, att1, PW2, TW2] = Array.from({ length: 7 }, () => newUlid()) as [
    string, string, string, string, string, string, string,
  ];
  await applyCommitted(pool, [
    projectCreated(W1, P1, 'Gone', 'GN'),
    ticketCreated(W1, T1, P1, `Doomed ${marker}`),
    noteCreated(W1, N1, { title: `Minutes ${marker}`, homeProjectId: '', scope: { mode: 'workspace' } }),
    ev(W1, 'invite', INV, 'invite.sent', {
      inviteId: INV,
      address: 'guest@example.com',
      channel: 'email',
      role: 'member',
      projectIds: [P1],
    }),
    projectCreated(W2, PW2, 'Stays', 'ST'),
    ticketCreated(W2, TW2, PW2, 'Survivor'),
  ]);
  await pool.query(
    `INSERT INTO invite_tokens (invite_id, token_hash, created_at, expires_at) VALUES ($1, $2, now(), now() + interval '7 days')`,
    [INV, `hash-${newUlid()}`],
  );
  await insertAttachment(pool, W1, att1, { ticketId: T1 }, `${marker}.pdf`, `w/${W1.WS}/a/${att1}`);
  await insertNotification(pool, W1, U, T1, `Doomed ${marker}`);
  await insertNotification(pool, W2, U, TW2, 'Survivor');
  for (const ws of [W1.WS, W2.WS]) {
    await pool.query(
      `INSERT INTO user_preferences (user_id, workspace_id, doc, updated_at) VALUES ($1, $2, $3, now())`,
      [U, ws, JSON.stringify({ savedFilters: [], listColumns: {}, grouping: {} })],
    );
  }
  await applyCommitted(pool, [
    ev(W1, 'workspace', W1.WS, 'workspace.deleted', {}),
    ev(W1, 'workspace', W1.WS, 'purge.marked', {}),
  ]);
  return { U, W1, W2, P1, T1, N1, INV, marker };
}
