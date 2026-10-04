import { expect } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { TestDatabase } from '../../helpers/db.js';

/** Anyone with a session token: a `Caller` of `door-matrix.ts`, or an email account of `email-world.ts`. */
export type Actor = { userId: string; sessionToken: string };
type Result = { status: string; reason?: string; rule?: string };

/** One event as the app's own clients send it (`origin: 'web'`), as `buildDoorWorld` builds them (`door-matrix.ts:55-56`). */
export function event(workspaceId: string, actor: Actor, entity: SubmittedEvent['entity'], type: string, payload: unknown, id: string = newUlid()): SubmittedEvent {
  return { id, workspaceId, entity, type, version: 1, payload, actorId: actor.userId, origin: 'web', clientTime: new Date().toISOString() };
}

/** `POST /v1/events` as `actor`, through the session token (not the hosted door): the results, index-aligned. */
export async function submitAs(app: FastifyInstance, actor: Actor, events: SubmittedEvent[]): Promise<Result[]> {
  const res = await app.inject({ method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${actor.sessionToken}` }, payload: { events } });
  return (res.json() as { results: Result[] }).results;
}

/** `submitAs`, asserting every event committed (a setup step that fails here fails with the server's own reason). */
export async function mustCommit(app: FastifyInstance, actor: Actor, events: SubmittedEvent[]): Promise<void> {
  for (const r of await submitAs(app, actor, events)) expect(r.status, `${r.rule ?? ''} ${r.reason ?? ''}`).toBe('committed');
}

/** Change someone's workspace role the way `manage_members change_role` does (`member-admin-tools.ts:125`): `membership.granted` with the new role. */
export function grantRole(app: FastifyInstance, owner: Actor, workspaceId: string, userId: string, role: 'admin' | 'member' | 'guest'): Promise<void> {
  return mustCommit(app, owner, [event(workspaceId, owner, { kind: 'membership', id: `${workspaceId}:${userId}` }, 'membership.granted', { userId, role })]);
}

/** The number of ledger events on one entity (optionally of one type). */
export async function eventCount(db: TestDatabase, entityId: string, type?: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM events WHERE entity_id = $1 AND ($2::text IS NULL OR type = $2)`, [entityId, type ?? null]);
  return rows[0]!.n;
}

/** A note's projected body (`proj_notes.body`, jsonb). */
export async function noteBody(db: TestDatabase, noteId: string): Promise<unknown> {
  const { rows } = await db.pool.query<{ body: unknown }>(`SELECT body FROM proj_notes WHERE note_id = $1`, [noteId]);
  return rows[0]?.body;
}
