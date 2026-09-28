import type { Pool } from 'pg';
import { membershipId, newUlid, type EntityKind, type LedgerEvent } from '@gisik-nokma/domain';
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
