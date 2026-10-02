import { z } from 'zod';
import { newUlid } from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import {
  confirmName,
  readDeleted,
  readDirectory,
  type DirectoryProject,
  type DirectoryWorkspace,
} from './directory.js';
import type { ToolDefinition } from './read-tools.js';
import { envelopeFor, submitBatch, submitOne } from './submit.js';

/**
 * The project tools (MCP CRUD plan Task 7, owner rulings M1–M3 2026-10-01).
 *
 * Same contract as the workspace tools: the assistant gains no authority the
 * screen lacks — every act is the same event, judged by the same permission
 * gate, with origin `'mcp'`, and a refusal comes back in the product's own words
 * (`submitOne` / `submitBatch`). Every project act is an event on the project
 * entity (FD1); there is no REST door for any of them.
 *
 * Deletes are SOFT only — `project.deleted`, never `purge.marked` — and
 * `archive_*`/`delete_*` refuse unless `confirm_name` is the project's exact
 * CURRENT name, read from the directory at call time and never remembered: a
 * check against a name read earlier would let a delete through on an old name
 * (plan Review Focus 1). `update_project` has no `prefix` argument: the prefix
 * is changed by an owner or admin through `change_prefix` (member-admin-tools.ts), behind a confirmation.
 */
const NOT_FOUND = 'project not found or not visible to you';
const projectId = z.string().min(1);
const workspaceId = z.string().min(1);
const name = z.string().min(1);
const description = z.string().max(500);
const groupId = z.string().min(1).nullable();
const include = z.array(z.enum(['archived', 'deleted'])).optional();

type Found = { workspace: DirectoryWorkspace; project: DirectoryProject };

/** The project and its workspace, read from the directory NOW. Archived projects are in the directory; deleted ones are not. */
async function findProject(session: Session, id: string): Promise<Found> {
  for (const workspace of await readDirectory(session)) {
    const project = workspace.projects.find((p) => p.projectId === id);
    if (project !== undefined) return { workspace, project };
  }
  throw new Error(NOT_FOUND);
}

/** Only the workspace is needed to send a way-back event: a project may be archived (in the directory) or deleted (in Deleted items). */
async function workspaceIdOf(session: Session, id: string): Promise<string> {
  for (const workspace of await readDirectory(session)) {
    if (workspace.projects.some((p) => p.projectId === id)) return workspace.workspaceId;
  }
  const gone = (await readDeleted(session)).find((d) => d.kind === 'project' && d.id === id);
  if (gone === undefined) throw new Error(NOT_FOUND);
  return gone.workspaceId;
}

/** One lifecycle event against the project entity; every one of them has an empty strict payload. */
function lifecycle(session: Session, workspace: string, id: string, type: string): Promise<unknown> {
  return submitOne(session, envelopeFor(session, workspace, { kind: 'project', id }, type, {}));
}

export function projectTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_projects',
      description:
        'List the projects you can see inside one workspace. Reads the same workspace directory as ' +
        'list_workspaces — the server has no separate projects route — and returns an empty list for ' +
        'a workspace you cannot see. By default only LIVE projects are listed; pass ' +
        '`include: ["archived"]` to add archived ones (each carries `archived: true`) and/or ' +
        '`include: ["deleted"]` to add projects of that workspace in Deleted items (each carries ' +
        '`deleted: true`; undelete_project brings one back).',
      inputSchema: { workspaceId, include },
      handler: async (args) => {
        const a = z.object({ workspaceId, include }).parse(args);
        const also = a.include ?? [];
        const match = (await readDirectory(session)).find((w) => w.workspaceId === a.workspaceId);
        const projects: unknown[] = (match?.projects ?? []).filter((p) => !p.archived || also.includes('archived'));
        if (also.includes('deleted')) {
          for (const item of await readDeleted(session)) {
            // THAT workspace only: another workspace's deleted project is not this list's business.
            if (item.kind !== 'project' || item.workspaceId !== a.workspaceId) continue;
            projects.push({ projectId: item.id, name: item.label, deleted: true, deletedAt: item.deletedAt });
          }
        }
        return { workspaceId: a.workspaceId, projects };
      },
    },
    {
      name: 'get_project',
      description:
        'Read one project: its name, description, prefix, whether it is archived and how many tickets it ' +
        'has. For a project in Deleted items it says so and names undelete_project. Use this to read the ' +
        'exact current name before archive_project or delete_project.',
      inputSchema: { projectId },
      handler: async (args) => {
        const { projectId: id } = z.object({ projectId }).parse(args);
        const directory = await readDirectory(session);
        for (const workspace of directory) {
          const project = workspace.projects.find((p) => p.projectId === id);
          if (project === undefined) continue;
          return {
            projectId: project.projectId,
            workspaceId: workspace.workspaceId,
            name: project.name,
            description: project.description,
            prefix: project.prefix,
            archived: project.archived,
            ticketCount: project.ticketCount,
          };
        }
        const gone = (await readDeleted(session)).find((d) => d.kind === 'project' && d.id === id);
        if (gone === undefined) throw new Error(NOT_FOUND);
        return {
          projectId: id,
          workspaceId: gone.workspaceId,
          name: gone.label,
          deleted: true,
          deletedAt: gone.deletedAt,
          note: 'This project is in Deleted items. Call undelete_project to bring it back.',
        };
      },
    },
    {
      name: 'create_project',
      description:
        'Create a project in a workspace; you become its project admin. Only a workspace owner or admin ' +
        'can. `description` (optional, up to 500 characters) says what the project is for; `prefix` ' +
        '(optional, 1 to 3 capital letters) is the second half of every ticket key in it, and is derived ' +
        'from the name when left out. An owner or admin can change it later with change_prefix. Answers with the committed events; ' +
        'find the new project\'s id with list_projects.',
      inputSchema: {
        workspaceId,
        name,
        description: description.min(1).optional(),
        prefix: z.string().min(1).max(3).optional(),
      },
      handler: async (args) => {
        const a = z
          .object({ workspaceId, name, description: description.min(1).optional(), prefix: z.string().min(1).max(3).optional() })
          .parse(args);
        const id = newUlid();
        const entity = { kind: 'project' as const, id };
        // The keys are ABSENT when not given, never `undefined`: the payload schema is strict.
        const created = envelopeFor(session, a.workspaceId, entity, 'project.created', {
          name: a.name,
          ...(a.description === undefined ? {} : { description: a.description }),
          ...(a.prefix === undefined ? {} : { prefix: a.prefix }),
        });
        // The founder joins as project admin in the SAME batch (FD5): a project its founder is not on is
        // one its founder cannot see, so the pair lands together or not at all.
        const joined = envelopeFor(session, a.workspaceId, entity, 'project.member_added', {
          userId: session.userId(),
          projectAdmin: true,
        });
        const results = await submitBatch(session, [created, joined]);
        return { projectId: id, results };
      },
    },
    {
      name: 'update_project',
      description:
        'Change a project\'s name, description and/or group. Give at least one; a key you leave out is left ' +
        'alone, and `description: ""` clears the description. Only a workspace owner or admin can. ' +
        'To change its prefix use change_prefix; to file it in a group pass groupId (null takes it out of its group).',
      inputSchema: { projectId, name: name.optional(), description: description.optional(), groupId: groupId.optional() },
      handler: async (args) => {
        const a = z.object({ projectId, name: name.optional(), description: description.optional(), groupId: groupId.optional() }).parse(args);
        if (a.name === undefined && a.description === undefined && a.groupId === undefined) {
          throw new Error('update_project needs a new name, description or groupId');
        }
        const { workspace } = await findProject(session, a.projectId);
        const payload = {
          ...(a.name === undefined ? {} : { name: a.name }),
          // An empty description is how an assistant says "clear it"; the event spells that `null`.
          ...(a.description === undefined ? {} : { description: a.description === '' ? null : a.description }),
          ...(a.groupId === undefined ? {} : { groupId: a.groupId }),
        };
        return submitOne(
          session,
          envelopeFor(session, workspace.workspaceId, { kind: 'project', id: a.projectId }, 'project.updated', payload),
        );
      },
    },
    {
      name: 'archive_project',
      description:
        'Archive a project: it stays readable but stops counting as live work. Reversible with ' +
        'restore_project. Only a workspace owner or admin can. `confirm_name` is REQUIRED and must be the ' +
        'project\'s exact current name (read it with get_project first); otherwise nothing happens.',
      inputSchema: { projectId, confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ projectId, confirm_name: z.string().optional() }).parse(args);
        const { workspace, project } = await findProject(session, a.projectId);
        confirmName(project.name, a.confirm_name);
        const committed = await lifecycle(session, workspace.workspaceId, a.projectId, 'project.archived');
        return { ...(committed as object), note: 'Archived. restore_project brings it back.' };
      },
    },
    {
      name: 'restore_project',
      description: 'Bring an archived project back to live. Only a workspace owner or admin can. No confirmation needed.',
      inputSchema: { projectId },
      handler: async (args) => {
        const { projectId: id } = z.object({ projectId }).parse(args);
        return lifecycle(session, await workspaceIdOf(session, id), id, 'project.restored');
      },
    },
    {
      name: 'delete_project',
      description:
        'Move a project to Deleted items. It can be restored for 15 days with undelete_project — nothing ' +
        'is erased. Only a workspace owner or admin can. `confirm_name` is REQUIRED and must be the ' +
        'project\'s exact current name (read it with get_project first); otherwise nothing happens.',
      inputSchema: { projectId, confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ projectId, confirm_name: z.string().optional() }).parse(args);
        const { workspace, project } = await findProject(session, a.projectId);
        confirmName(project.name, a.confirm_name);
        const committed = await lifecycle(session, workspace.workspaceId, a.projectId, 'project.deleted');
        return {
          ...(committed as object),
          note: 'Moved to Deleted items. It can be restored there for 15 days, or with undelete_project.',
        };
      },
    },
    {
      name: 'undelete_project',
      description:
        'Bring a project back from Deleted items. Only a workspace owner or admin can. No confirmation needed.',
      inputSchema: { projectId },
      handler: async (args) => {
        const { projectId: id } = z.object({ projectId }).parse(args);
        return lifecycle(session, await workspaceIdOf(session, id), id, 'project.undeleted');
      },
    },
  ];
}
