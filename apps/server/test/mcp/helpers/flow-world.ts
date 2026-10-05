import { expect } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildDoorWorld, callTool, type Caller, type DoorWorld } from './door-matrix.js';

export { buildDoorWorld, callTool };
export type { Caller, DoorWorld };

/** One successful tool call: the parsed JSON answer. A refusal fails the test with the tool's own words. */
export async function ok(w: DoorWorld, who: Caller, tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await callTool(w.app, who.token, tool, args);
  expect(r.isError, `${tool}: ${r.text}`).toBe(false);
  return r.json as Record<string, unknown>;
}

/** A ticket in the world's project, made by MCP as `who`. Returns its id. */
export async function mk(w: DoorWorld, who: Caller, title: string, extra: Record<string, unknown> = {}): Promise<string> {
  const out = await ok(w, who, 'create_ticket', { workspaceId: w.workspaceId, projectId: w.projectId, typeId: 'task', title, ...extra });
  return out['ticketId'] as string;
}

/** Poll until `fn` answers non-null. The flow's cascade is filed AFTER the person's act (spec AP-5), so a test waits for it. */
export async function until<T>(what: string, fn: () => Promise<T | null>, ms = 8000): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = await fn();
    if (value !== null) return value;
    if (Date.now() - started > ms) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** Raw events through the event door as `who` (the session token), for probes that must not depend on a Part 5 tool. */
export async function rawEvents(w: DoorWorld, who: Caller, events: Array<{ entityId: string; type: string; payload: unknown }>) {
  const res = await w.app.inject({
    method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${who.sessionToken}` },
    payload: { events: events.map((e) => ({
      id: newUlid(), workspaceId: w.workspaceId, entity: { kind: 'ticket', id: e.entityId },
      type: e.type, version: 1, payload: e.payload, actorId: who.userId, origin: 'web', clientTime: new Date().toISOString(),
    })) },
  });
  return res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
}
