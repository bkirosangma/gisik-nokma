import { z } from 'zod';
import type { Session } from '../session.js';
import {
  confirmName,
  readDeleted,
  readDirectory,
  type DirectoryWorkspace,
} from './directory.js';
import type { ToolDefinition } from './read-tools.js';
import { envelopeFor, postJson, submitOne } from './submit.js';

/**
 * The workspace tools (MCP CRUD plan Task 6, owner rulings M2/M3 2026-10-01).
 *
 * The assistant gains no authority the screen lacks: every act is the same
 * event, judged by the same permission gate, with origin `'mcp'`, and a refusal
 * comes back in the product's own words (`submitOne`). Only FOUNDING a workspace
 * has a REST door (`POST /v1/workspaces`, FD1); every other act is an event on
 * the workspace entity.
 *
 * Deletes are SOFT only — `workspace.deleted`, never `purge.marked` — so nothing
 * here is permanent, and `archive_*`/`delete_*` refuse unless `confirm_name` is
 * the workspace's exact CURRENT name, read from the directory at call time.
 */
const NOT_FOUND = 'workspace not found or not visible to you';
const workspaceId = z.string().min(1);
const include = z.array(z.enum(['archived', 'deleted'])).optional();

async function findWorkspace(session: Session, id: string): Promise<DirectoryWorkspace> {
  const found = (await readDirectory(session)).find((w) => w.workspaceId === id);
  if (found === undefined) throw new Error(NOT_FOUND);
  return found;
}

/** Send one lifecycle event against the workspace entity; every one of them has an empty strict payload. */
function lifecycle(session: Session, id: string, type: string): Promise<unknown> {
  return submitOne(session, envelopeFor(session, id, { kind: 'workspace', id }, type, {}));
}

export function workspaceTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_workspaces',
      description:
        'List the gisik-nokma workspaces you belong to, with your role in each and the projects ' +
        'you can see inside them. The project list is deliberately partial: a project you are not ' +
        'a member of is absent rather than named. By default only LIVE workspaces are listed; ' +
        'pass `include: ["archived"]` to add archived ones (each carries `archived: true`) and/or ' +
        '`include: ["deleted"]` to add workspaces in Deleted items (each carries `deleted: true`; ' +
        'only an owner sees those, and undelete_workspace brings one back).',
      inputSchema: { include },
      handler: async (args) => {
        const { include: also = [] } = z.object({ include }).parse(args);
        const live = await readDirectory(session);
        const workspaces: unknown[] = live.filter((w) => !w.archived || also.includes('archived'));
        if (also.includes('deleted')) {
          for (const item of await readDeleted(session)) {
            if (item.kind !== 'workspace') continue;
            workspaces.push({ workspaceId: item.id, name: item.label, deleted: true, deletedAt: item.deletedAt });
          }
        }
        return { workspaces };
      },
    },
    {
      name: 'get_workspace',
      description:
        'Read one workspace: its name, prefix, your role, whether it is archived and how many projects ' +
        'you can see in it. It also carries "home": the numbers on the workspace\'s Home page (tickets, open, ' +
        'past due, due soon, members, notes) as you may see them. ' +
        'For a workspace in Deleted items it says so and names undelete_workspace. ' +
        'Use this to read the exact current name before archive_workspace or delete_workspace.',
      inputSchema: { workspaceId },
      handler: async (args) => {
        const { workspaceId: id } = z.object({ workspaceId }).parse(args);
        const found = (await readDirectory(session)).find((w) => w.workspaceId === id);
        if (found !== undefined) {
          const { projects, ...rest } = found;
          const home = (await session.get(`/v1/workspaces/${encodeURIComponent(id)}/home`)) as {
            counts: unknown;
            dueSoonDays: unknown;
          };
          return {
            workspaceId: rest.workspaceId,
            name: rest.name,
            prefix: rest.prefix,
            role: rest.role,
            archived: rest.archived,
            projectCount: projects.filter((p) => !p.archived).length,
            archivedProjectCount: projects.filter((p) => p.archived).length,
            // Home's numbers (spec E §2.4), read only. Counts, not ids: list_tickets / list_notes name items (D-E9).
            home: { counts: home.counts, dueSoonDays: home.dueSoonDays },
          };
        }
        const gone = (await readDeleted(session)).find((d) => d.kind === 'workspace' && d.id === id);
        if (gone === undefined) throw new Error(NOT_FOUND);
        return {
          workspaceId: id,
          name: gone.label,
          deleted: true,
          deletedAt: gone.deletedAt,
          note: 'This workspace is in Deleted items. Call undelete_workspace to bring it back.',
        };
      },
    },
    {
      name: 'create_workspace',
      description:
        'Create a new workspace; you become its owner. `prefix` (optional, up to three capital letters) ' +
        'is the first half of every ticket key in it; leave it out and one is derived from the name. ' +
        'Answers with the new `workspaceId`.',
      inputSchema: { name: z.string().min(1), prefix: z.string().min(1).max(3).optional() },
      handler: async (args) => {
        const a = z.object({ name: z.string().min(1), prefix: z.string().min(1).max(3).optional() }).parse(args);
        // The key is ABSENT, never `prefix: undefined` — see the founding route's own docblock.
        return postJson(session, '/v1/workspaces', { name: a.name, ...(a.prefix === undefined ? {} : { prefix: a.prefix }) });
      },
    },
    {
      name: 'rename_workspace',
      description: 'Rename a workspace. Only the workspace owner or an admin can; the prefix never changes.',
      inputSchema: { workspaceId, name: z.string().min(1) },
      handler: async (args) => {
        const a = z.object({ workspaceId, name: z.string().min(1) }).parse(args);
        return submitOne(
          session,
          envelopeFor(session, a.workspaceId, { kind: 'workspace', id: a.workspaceId }, 'workspace.renamed', { name: a.name }),
        );
      },
    },
    {
      name: 'archive_workspace',
      description:
        'Archive a workspace: it stays readable but stops counting as live work. Reversible with ' +
        'restore_workspace. Only the workspace owner can do this. `confirm_name` is REQUIRED and must be ' +
        'the workspace\'s exact current name (read it with get_workspace first); otherwise nothing happens.',
      inputSchema: { workspaceId, confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId, confirm_name: z.string().optional() }).parse(args);
        confirmName((await findWorkspace(session, a.workspaceId)).name, a.confirm_name);
        const committed = await lifecycle(session, a.workspaceId, 'workspace.archived');
        return { ...(committed as object), note: 'Archived. restore_workspace brings it back.' };
      },
    },
    {
      name: 'restore_workspace',
      description: 'Bring an archived workspace back to live. Only the workspace owner can. No confirmation needed.',
      inputSchema: { workspaceId },
      handler: async (args) => lifecycle(session, z.object({ workspaceId }).parse(args).workspaceId, 'workspace.restored'),
    },
    {
      name: 'delete_workspace',
      description:
        'Move a workspace to Deleted items. It can be restored for 15 days with undelete_workspace — ' +
        'nothing is erased. Only the workspace owner can do this. `confirm_name` is REQUIRED and must be ' +
        'the workspace\'s exact current name (read it with get_workspace first); otherwise nothing happens.',
      inputSchema: { workspaceId, confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId, confirm_name: z.string().optional() }).parse(args);
        confirmName((await findWorkspace(session, a.workspaceId)).name, a.confirm_name);
        const committed = await lifecycle(session, a.workspaceId, 'workspace.deleted');
        return {
          ...(committed as object),
          note: 'Moved to Deleted items. It can be restored there for 15 days, or with undelete_workspace.',
        };
      },
    },
    {
      name: 'undelete_workspace',
      description:
        'Bring a workspace back from Deleted items. Only the workspace owner can. No confirmation needed.',
      inputSchema: { workspaceId },
      handler: async (args) => lifecycle(session, z.object({ workspaceId }).parse(args).workspaceId, 'workspace.undeleted'),
    },
  ];
}
