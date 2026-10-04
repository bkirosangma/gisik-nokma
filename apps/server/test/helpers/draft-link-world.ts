import { expect } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { TestDatabase } from './db.js';
import type { ReadRole, ReadWorld } from './read-app.js';
import { SCENARIO_NOW } from './read-scenario.js';

/** The HTTP door over the seeded read world, for the draft-link suites (drafts T6). Every helper goes through the app. */
export function linkWorld(read: ReadWorld, db: TestDatabase) {
  const WS = (): string => read.world.workspaceId;
  const PROJECT = (): string => read.world.projectId;

  async function send(role: ReadRole, type: string, id: string, payload: unknown): Promise<Record<string, unknown>> {
    const res = await read.app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: read.authOf(role),
      payload: {
        events: [{
          id: newUlid(), workspaceId: WS(), entity: { kind: 'ticket', id }, type, version: 1, payload,
          actorId: read.userIds[role], origin: 'web', clientTime: SCENARIO_NOW.toISOString(),
        }],
      },
    });
    expect(res.statusCode).toBe(200);
    return (res.json() as { results: Array<Record<string, unknown>> }).results[0] ?? {};
  }
  const committed = { status: 'committed' };
  async function draft(id: string, role: ReadRole = 'member'): Promise<void> {
    expect(
      await send(role, 'ticket.created', id, {
        typeId: 'task', projectId: PROJECT(), parentId: null, title: `Quokka ${id.slice(-4)}`, start: 'backlog', draft: true,
      }),
    ).toMatchObject(committed);
  }
  async function published(id: string, role: ReadRole = 'owner'): Promise<void> {
    expect(
      await send(role, 'ticket.created', id, { typeId: 'task', projectId: PROJECT(), parentId: null, title: `Real ${id.slice(-4)}` }),
    ).toMatchObject(committed);
  }
  /**
   * "source `kind` draft", filed on the DRAFT's stream. `label` (a `leads_to` branch, wtg2 T2) is sent only when
   * given, so every existing call files exactly the payload it filed before.
   */
  const fromLink = (draftId: string, sourceId: string, kind = 'blocks', role: ReadRole = 'member', label?: string) =>
    send(role, 'ticket.link_added', draftId, { kind, targetId: draftId, from: sourceId, ...(label === undefined ? {} : { label }) });
  const publishSet = (role: ReadRole, ticketIds: string[]) =>
    read.app.inject({ method: 'POST', url: `/v1/workspaces/${WS()}/drafts/publish`, headers: read.authOf(role), payload: { ticketIds } });
  const get = (role: ReadRole, path: string) =>
    read.app.inject({ method: 'GET', url: `/v1/workspaces/${WS()}${path}`, headers: read.authOf(role) });
  const detail = (role: ReadRole, id: string) => get(role, `/tickets/${id}`);
  const links = (role: ReadRole, id: string) => get(role, `/tickets/${id}/links`);
  const keyNumber = (key: string | null): number => Number(/-(\d+)$/.exec(key ?? '')?.[1]);
  const stateOf = async (role: ReadRole, id: string) =>
    (await detail(role, id)).json() as { key: string | null; ticketState: { links?: unknown[]; draft?: unknown } };
  const linkEventsOn = async (id: string) =>
    (await db.pool.query(
      `SELECT type, payload, actor_id, origin, workspace_seq::int AS seq FROM events
        WHERE entity_id = $1 AND type IN ('ticket.link_added', 'ticket.link_removed') ORDER BY workspace_seq`,
      [id],
    )).rows as Array<{ type: string; payload: unknown; actor_id: string; origin: string; seq: number }>;
  const linkRows = async (...ids: string[]) =>
    (await db.pool.query(
      'SELECT source_id, target_id, kind, created_by, seq::int AS seq FROM proj_ticket_links WHERE source_id = ANY($1) OR target_id = ANY($1) ORDER BY seq',
      [ids],
    )).rows as Array<{ source_id: string; target_id: string; kind: string; created_by: string; seq: number }>;
  const publishedRows = async (ids: string[]): Promise<number> =>
    (await db.pool.query(`SELECT 1 FROM events WHERE type = 'ticket.published' AND entity_id = ANY($1)`, [ids])).rows.length;
  const stillDrafts = async (ids: string[]): Promise<number> =>
    (await db.pool.query('SELECT 1 FROM proj_tickets WHERE ticket_id = ANY($1) AND draft_author_id IS NOT NULL', [ids])).rows.length;

  return { WS, PROJECT, send, draft, published, fromLink, publishSet, get, detail, links, keyNumber, stateOf, linkEventsOn, linkRows, publishedRows, stillDrafts };
}
