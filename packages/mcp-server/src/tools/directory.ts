import type { Session } from '../session.js';

/**
 * Reads over the two routes that already answer "what do I have?" — no new
 * server route (MCP CRUD plan FD8): `GET /v1/me/workspaces` serves each
 * workspace's name, prefix, role and `archived`, and each project the caller
 * can see (name, description, prefix, `archived`, ticket counts), and
 * `GET /v1/me/deleted-items` lists what the caller may currently restore.
 *
 * Both are read AT CALL TIME and nothing here remembers an answer: a
 * `confirm_name` check against a name read earlier would let a delete through
 * on an old name (plan Review Focus 1).
 */
export type DirectoryProject = {
  projectId: string;
  name: string;
  description: string | null;
  prefix: string;
  archived: boolean;
  ticketCount?: number;
};
export type DirectoryWorkspace = {
  workspaceId: string;
  name: string;
  prefix: string;
  role: string;
  archived: boolean;
  projects: DirectoryProject[];
};
export type DeletedEntry = { kind: string; id: string; workspaceId: string; label: string; deletedAt: string };

export async function readDirectory(session: Session): Promise<DirectoryWorkspace[]> {
  return ((await session.get('/v1/me/workspaces')) as { workspaces: DirectoryWorkspace[] }).workspaces;
}

export async function readDeleted(session: Session): Promise<DeletedEntry[]> {
  return ((await session.get('/v1/me/deleted-items')) as { items: DeletedEntry[] }).items;
}

/** Exact, case- and whitespace-sensitive — owner ruling M2 (2026-10-01): a misread instruction must not hit the wrong item. */
export function confirmName(expected: string, given: string | undefined): void {
  if (given !== expected) throw new Error(`confirm_name must be "${expected}"`);
}
