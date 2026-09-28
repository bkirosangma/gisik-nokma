import {
  newSubmittedEvent,
  newUlid,
  plainTextToDoc,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';

/**
 * The trash series' Plan 3 world for the replica: one workspace, two projects,
 * one workflow and ticket type, and helpers that build envelopes the way the
 * server hands them over (`sync-engine.test.ts`'s `envelope`). Every case
 * builds a FRESH replica; the ids below are shared constants and never collide
 * across cases because no storage outlives its case.
 */
export const WS = newUlid();
export const P = newUlid();
export const P_OTHER = newUlid();
export const ME = newUlid();
export const OTHER = newUlid();
export const WF = newUlid();
export const TYPE = newUlid();
export const TIME = '2026-09-29T09:00:00.000Z';

let seq = 0;
let stream = 0;

export function envelope(
  entity: EventEnvelope['entity'],
  type: string,
  payload: unknown,
  opts: { actorId?: string; seq?: number } = {},
): LedgerEvent {
  seq += 1;
  stream += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: opts.actorId ?? OTHER,
      origin: 'server',
      now: () => new Date(TIME),
    }),
    serverTime: TIME,
    seq: opts.seq ?? seq,
    workspaceSeq: stream,
  };
}

export function bootstrap(): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: ME, workspaceRole: 'member', projectIds: [P, P_OTHER] },
    streamSeq: 1,
    definitions: [
      envelope(
        { kind: 'workflow', id: WF },
        'workflow.defined',
        {
          id: WF,
          version: 1,
          name: 'Basic',
          initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [
            { from: '*', to: 'done', rules: [] },
            { from: '*', to: 'todo', rules: [] },
          ],
        },
        { seq: 1 },
      ),
      envelope(
        { kind: 'ticket-type', id: TYPE },
        'ticket-type.defined',
        { id: TYPE, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
        { seq: 1 },
      ),
    ],
    tickets: [],
  };
}

export const ticketCreated = (id: string, projectId: string = P, parentId: string | null = null): LedgerEvent =>
  envelope(
    { kind: 'ticket', id },
    'ticket.created',
    { typeId: TYPE, projectId, parentId, title: `Ticket ${id.slice(-4)}` },
    { seq: 1 },
  );

export const commentOnTicket = (ticketId: string, body: unknown): LedgerEvent =>
  envelope({ kind: 'ticket', id: ticketId }, 'comment.added', { body });

/** `homeProjectId: ''` is a workspace note; anything else is homed in that project. */
export const noteCreated = (noteId: string, homeProjectId: string): LedgerEvent =>
  envelope(
    { kind: 'note', id: noteId },
    'note.created',
    { title: 'Minutes', homeProjectId, scope: homeProjectId === '' ? { mode: 'workspace' } : { mode: 'project' } },
    { seq: 1 },
  );

export const commentOnNote = (noteId: string, text: string): LedgerEvent =>
  envelope({ kind: 'note', id: noteId }, 'comment.added', { body: plainTextToDoc(text) });

/** A server-recorded contest on `ticketId` whose refused claim is `claimantId`'s. */
export function contestOn(ticketId: string, claimantId: string): LedgerEvent {
  const original = newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.transitioned',
    payload: { to: 'done' },
    actorId: claimantId,
    origin: 'desktop',
    now: () => new Date(TIME),
  });
  return envelope({ kind: 'ticket', id: ticketId }, 'claim.contested', {
    originalEvent: original,
    rule: 'workflow.transition-not-allowed',
    reason: 'Not from here.',
  });
}

export const ticketRefChip = (ticketId: string) => ({
  type: 'ticketRef',
  attrs: { ticketId, projectId: P, key: 'AB-1', title: 'The title its author saw' },
});

export const docWith = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });

export function claim(entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent {
  return newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: ME, origin: 'desktop' });
}

/** Queues a claim WITHOUT the local pre-check — these cases are about what leaves the outbox, not what enters it. */
export async function queue(storage: SyncStorage, event: SubmittedEvent): Promise<void> {
  await storage.run(
    'INSERT INTO outbox (event_id, workspace_id, entity_kind, entity_id, envelope) VALUES (?, ?, ?, ?, ?)',
    [event.id, event.workspaceId, event.entity.kind, event.entity.id, JSON.stringify(event)],
  );
}

export async function freshReplica(): Promise<{ storage: SyncStorage; replica: Replica }> {
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrap());
  return { storage, replica };
}

export async function apply(replica: Replica, events: readonly LedgerEvent[]): Promise<void> {
  for (const env of events) await replica.applyServerItem(env);
}

export async function count(storage: SyncStorage, sql: string, params: string[] = []): Promise<number> {
  const rows = await storage.all(sql, params);
  return Number(rows[0]?.['n'] ?? 0);
}
