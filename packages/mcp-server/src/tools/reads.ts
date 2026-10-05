import { z } from 'zod';
import { linkedFromSourceTitle, type LinkedFromPage, type LinkedFromTarget } from '@gisik-nokma/domain';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';

/** A GET whose 404 is the product's "you may not know whether this exists" — answered in ONE sentence shape (spec §4). */
export async function readOrNotFound(session: Session, path: string, thing: string): Promise<unknown> {
  try {
    return await session.get(path);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(`${thing} not found or not visible to you`);
    throw error;
  }
}

/** Spec B §4: the first 20 visible sources, as an assistant reads them. `total` counts visible sources only. */
export type LinkedFromAnswer = { total: number; items: Array<{ sourceKind: string; sourceId: string; title: string; snippet: string }> };

/** A 404 here is the route's "you cannot see the target", which the caller has just been allowed to read: it reads as nothing links. Any other failure throws. */
export async function readLinkedFrom(session: Session, workspaceId: string, target: LinkedFromTarget): Promise<LinkedFromAnswer> {
  // Named `linked`, not `page`: this file already exports a function `page`, which a local `page` would shadow.
  let linked: LinkedFromPage;
  try {
    const q = new URLSearchParams({ target: `${target.kind}:${target.id}` });
    linked = (await session.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/references?${q.toString()}`)) as LinkedFromPage;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return { total: 0, items: [] };
    throw error;
  }
  return {
    total: linked.total,
    items: linked.items.map((row) => ({ sourceKind: row.sourceKind, sourceId: row.sourceId, title: linkedFromSourceTitle(row), snippet: row.snippet })),
  };
}

/** Every list tool's paging arguments (spec §4: cursor and limit, default 50, max 200). */
export const pageArgs = { cursor: z.string().regex(/^\d+$/).optional(), limit: z.number().int().min(1).max(200).optional() };

/** Pages a list the route answered whole. The cursor is an offset, opaque to the caller. */
export function page<T>(items: readonly T[], cursor: string | undefined, limit: number | undefined): { items: T[]; nextCursor: string | null } {
  const from = cursor === undefined ? 0 : Number(cursor);
  if (cursor !== undefined && (!/^\d+$/.test(cursor) || from > items.length)) throw new Error('cursor is not one this tool gave out');
  const size = Math.min(Math.max(limit ?? 50, 1), 200);
  return { items: items.slice(from, from + size), nextCursor: from + size < items.length ? String(from + size) : null };
}

/** `page` over the array a route answers under `key`, keeping the rest of the body. */
export function pageField(body: Record<string, unknown>, key: string, cursor: string | undefined, limit: number | undefined): Record<string, unknown> {
  const list = body[key];
  if (!Array.isArray(list)) return body;
  const { items, nextCursor } = page(list, cursor, limit);
  return { ...body, [key]: items, nextCursor };
}
