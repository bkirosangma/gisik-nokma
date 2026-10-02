import { z } from 'zod';
import { INVITE_CHANNELS, INVITE_ROLES, newUlid, rankBetween, WORKSPACE_ROLES } from '@gisik-nokma/domain';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { readDirectory } from './directory.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs, readOrNotFound } from './reads.js';
import { envelopeFor, postJson, submitOne } from './submit.js';

/**
 * MCP-everything T11 (plan Task 11, spec §5.1): workspace people, key prefixes and project groups. Every write
 * answers a PREVIEW unless `confirm_name` is exactly the name `confirmOrPreview` is given; the product's role
 * rules still decide who may act, so a refusal comes back in the gate's own words and this file adds no authority.
 */
const id = z.string().min(1);
const enc = encodeURIComponent;
type Member = { userId: string; displayName: string; role: string };
type Group = { id: string; parentId: string | null; level: number; name: string; rank: string; projectCount: number; childCount: number };

async function workspaceOf(session: Session, workspaceId: string) {
  const ws = (await readDirectory(session)).find((w) => w.workspaceId === workspaceId);
  if (ws === undefined) throw new Error('workspace not found or not visible to you');
  return ws;
}
async function memberOf(session: Session, workspaceId: string, userId: string): Promise<Member> {
  const { members } = (await readOrNotFound(session, `/v1/workspaces/${enc(workspaceId)}/members`, 'workspace')) as { members: Member[] };
  const m = members.find((x) => x.userId === userId);
  if (m === undefined) throw new Error('person not found in this workspace');
  return m;
}
async function groupsOf(session: Session, workspaceId: string): Promise<Group[]> {
  // The groups route 404s a GUEST as well as a stranger (`routes/groups.ts`): one sentence for both.
  return ((await readOrNotFound(session, `/v1/workspaces/${enc(workspaceId)}/groups`, 'workspace')) as { groups: Group[] }).groups;
}
/** The pending invitations. The route answers a non-admin 403 with the product's sentence; pass it on as a refusal. */
async function invitesOf(session: Session, workspaceId: string): Promise<Array<{ inviteId: string; address: string }>> {
  try {
    return ((await readOrNotFound(session, `/v1/workspaces/${enc(workspaceId)}/invites`, 'workspace')) as { invites: Array<{ inviteId: string; address: string }> }).invites;
  } catch (error) {
    const body = error instanceof HttpError && error.status === 403 ? (error.body as { rule?: string; message?: string } | null) : null;
    if (body?.rule !== undefined && body.message !== undefined) throw new Error(`refused by ${body.rule}: ${body.message}`);
    throw error;
  }
}

/**
 * The rank that puts `group` exactly where `before` / `after` say, as the app's `placeAt` does
 * (`apps/web/src/settings/groups-tree.tsx`): the siblings, sorted, WITHOUT the group itself; the neighbour not
 * given is the sibling next to the one that was (a missing neighbour is NOT "the end"). At least one is required,
 * and two must already be adjacent — otherwise there is no one place to put the group, and we do not guess.
 */
function reorderRank(groups: Group[], group: Group, before: string | undefined, after: string | undefined): string {
  if (before === undefined && after === undefined) throw new Error('reorder needs before or after');
  if (before === group.id || after === group.id) throw new Error('before and after must be other groups than the one being moved');
  const siblings = groups.filter((x) => x.parentId === group.parentId && x.id !== group.id).sort((x, y) => (x.rank < y.rank ? -1 : 1));
  const indexOf = (gid: string): number => {
    const found = siblings.findIndex((x) => x.id === gid);
    if (found === -1) throw new Error('before and after must be siblings of the group');
    return found;
  };
  const iBefore = before === undefined ? undefined : indexOf(before);
  const iAfter = after === undefined ? undefined : indexOf(after);
  if (iBefore !== undefined && iAfter !== undefined && iAfter !== iBefore + 1) throw new Error('before and after are not next to each other, so there is no one place between them');
  const lower = iBefore !== undefined ? iBefore : iAfter! - 1;
  const upper = iBefore !== undefined ? iBefore + 1 : iAfter!;
  return rankBetween(siblings[lower]?.rank ?? null, siblings[upper]?.rank ?? null);
}

const membersShape = {
  workspaceId: id,
  action: z.enum(['invite', 'revoke_invite', 'change_role', 'remove', 'add_to_project', 'remove_from_project']),
  userId: id.optional(), role: z.enum(WORKSPACE_ROLES).optional(), projectId: id.optional(), projectAdmin: z.boolean().optional(),
  address: z.string().min(1).optional(), channel: z.enum(INVITE_CHANNELS).optional(), inviteRole: z.enum(INVITE_ROLES).optional(),
  projectIds: z.array(id).optional(), inviteId: id.optional(), confirm_name: z.string().optional(),
};
const prefixShape = { workspaceId: id.optional(), projectId: id.optional(), prefix: z.string().regex(/^[A-Z]{1,3}$/), confirm_name: z.string().optional() };
const groupsShape = {
  workspaceId: id, action: z.enum(['list', 'create', 'rename', 'reorder', 'delete', 'file_project']), groupId: id.nullable().optional(),
  parentId: id.optional(), name: z.string().min(1).optional(), before: id.optional(), after: id.optional(), projectId: id.optional(), confirm_name: z.string().optional(),
  ...pageArgs,
};

export function memberAdminTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'manage_members',
      description:
        'Workspace people, behind a confirmation: invite (address, channel email|phone, inviteRole admin|member|guest, projectIds?), revoke_invite (inviteId), ' +
        'change_role (userId, role), remove (userId), add_to_project / remove_from_project (userId, projectId, projectAdmin?). Without confirm_name — the ' +
        "invited address, or the person's exact name from list_members — you get a preview of what would change and nothing happens. Your role decides what is allowed.",
      inputSchema: membersShape,
      handler: async (args) => {
        const a = z.object(membersShape).parse(args);
        const need = <T>(value: T | undefined, name: string): T => {
          if (value === undefined) throw new Error(`${a.action} needs ${name}`);
          return value;
        };
        // One sentence for a workspace the caller cannot see, whichever act and whichever read would have found out.
        await workspaceOf(session, a.workspaceId);
        if (a.action === 'invite') {
          const address = need(a.address, 'address');
          const role = need(a.inviteRole, 'inviteRole');
          const channel = need(a.channel, 'channel');
          const preview = await confirmOrPreview(address, a.confirm_name, async () => ({ sentence: `Sends an invitation to ${address} to join as ${role}.` }));
          if (preview !== null) return preview;
          return postJson(session, `/v1/workspaces/${enc(a.workspaceId)}/invites`, {
            address, channel, role, ...(a.projectIds === undefined ? {} : { projectIds: a.projectIds }),
          });
        }
        if (a.action === 'revoke_invite') {
          const inviteId = need(a.inviteId, 'inviteId');
          const invite = (await invitesOf(session, a.workspaceId)).find((i) => i.inviteId === inviteId);
          if (invite === undefined) throw new Error('invitation not found or not visible to you');
          const preview = await confirmOrPreview(invite.address, a.confirm_name, async () => ({ sentence: `Withdraws the invitation to ${invite.address}.` }));
          if (preview !== null) return preview;
          return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'invite', id: inviteId }, 'invite.revoked', { inviteId }));
        }
        const person = await memberOf(session, a.workspaceId, need(a.userId, 'userId'));
        const confirm = (sentence: string) => confirmOrPreview(person.displayName, a.confirm_name, async () => ({ sentence }));
        if (a.action === 'change_role') {
          const role = need(a.role, 'role');
          const preview = await confirm(`Changes ${person.displayName} from ${person.role} to ${role}.`);
          if (preview !== null) return preview;
          return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'membership', id: `${a.workspaceId}:${person.userId}` }, 'membership.granted', { userId: person.userId, role }));
        }
        if (a.action === 'remove') {
          const preview = await confirm(`Removes ${person.displayName} from the workspace and every project in it.`);
          if (preview !== null) return preview;
          return postJson(session, `/v1/workspaces/${enc(a.workspaceId)}/members/${enc(person.userId)}/remove`, {});
        }
        const projectId = need(a.projectId, 'projectId');
        const adding = a.action === 'add_to_project';
        const preview = await confirm(`${adding ? 'Adds' : 'Removes'} ${person.displayName} ${adding ? 'to' : 'from'} the project.`);
        if (preview !== null) return preview;
        return submitOne(
          session,
          envelopeFor(session, a.workspaceId, { kind: 'project', id: projectId }, adding ? 'project.member_added' : 'project.member_removed',
            adding ? { userId: person.userId, projectAdmin: a.projectAdmin ?? false } : { userId: person.userId }),
        );
      },
    },
    {
      name: 'change_prefix',
      description: "Change a workspace's (workspaceId) or a project's (projectId) key prefix — every ticket key under it changes (old keys still find the ticket). confirm_name is its exact current name; without it you get a preview counting the keys that change.",
      inputSchema: prefixShape,
      handler: async (args) => {
        const a = z.object(prefixShape).parse(args);
        if ((a.workspaceId === undefined) === (a.projectId === undefined)) throw new Error('change_prefix takes exactly one of workspaceId or projectId');
        const directory = await readDirectory(session);
        if (a.workspaceId !== undefined) {
          const ws = directory.find((w) => w.workspaceId === a.workspaceId);
          if (ws === undefined) throw new Error('workspace not found or not visible to you');
          const keys = ws.projects.reduce((n, p) => n + (p.ticketCount ?? 0), 0);
          const preview = await confirmOrPreview(ws.name, a.confirm_name, async () => ({
            sentence: `Changes the workspace prefix from ${ws.prefix} to ${a.prefix}; every ticket key in it changes.`, counts: { ticketKeys: keys },
          }));
          if (preview !== null) return preview;
          return submitOne(session, envelopeFor(session, ws.workspaceId, { kind: 'workspace', id: ws.workspaceId }, 'workspace.prefix_changed', { prefix: a.prefix }));
        }
        for (const ws of directory) {
          const project = ws.projects.find((p) => p.projectId === a.projectId);
          if (project === undefined) continue;
          const preview = await confirmOrPreview(project.name, a.confirm_name, async () => ({
            sentence: `Changes the project prefix from ${project.prefix} to ${a.prefix}; its ticket keys change.`, counts: { ticketKeys: project.ticketCount ?? 0 },
          }));
          if (preview !== null) return preview;
          return submitOne(session, envelopeFor(session, ws.workspaceId, { kind: 'project', id: project.projectId }, 'project.updated', { prefix: a.prefix }));
        }
        throw new Error('project not found or not visible to you');
      },
    },
    {
      name: 'manage_groups',
      description:
        'Project groups (up to 4 levels): list; create (name, parentId?); rename (groupId, name); reorder (groupId, and before = the sibling that will sit just before it and/or after = the one just after; at least one); delete (groupId); ' +
        "file_project (projectId, groupId or null to ungroup). Every change but list needs confirm_name — the group's exact name (the workspace's for create, the project's for file_project); without it you get a preview.",
      inputSchema: groupsShape,
      handler: async (args) => {
        const a = z.object(groupsShape).parse(args);
        const groups = await groupsOf(session, a.workspaceId);
        if (a.action === 'list') {
          const { items, nextCursor } = page(groups, a.cursor, a.limit);
          return { groups: items, nextCursor };
        }
        const g = (gid: string | null | undefined): Group => {
          const found = groups.find((x) => x.id === gid);
          if (found === undefined) throw new Error('group not found or not visible to you');
          return found;
        };
        const ev = (entity: { kind: 'group' | 'project'; id: string }, type: string, payload: unknown) => submitOne(session, envelopeFor(session, a.workspaceId, entity, type, payload));
        if (a.action === 'create') {
          const name = a.name;
          if (name === undefined) throw new Error('create needs name');
          const parent = a.parentId === undefined ? null : g(a.parentId);
          const siblings = groups.filter((x) => x.parentId === (parent?.id ?? null)).sort((x, y) => (x.rank < y.rank ? -1 : 1));
          const ws = await workspaceOf(session, a.workspaceId);
          const preview = await confirmOrPreview(ws.name, a.confirm_name, async () => ({ sentence: `Creates the group "${name}"${parent === null ? '' : ` inside "${parent.name}"`}.` }));
          if (preview !== null) return preview;
          return ev({ kind: 'group', id: newUlid() }, 'group.created', {
            parentId: parent?.id ?? null, level: parent === null ? 1 : parent.level + 1, name, rank: rankBetween(siblings.at(-1)?.rank ?? null, null),
          });
        }
        if (a.action === 'file_project') {
          const ws = await workspaceOf(session, a.workspaceId);
          const project = ws.projects.find((p) => p.projectId === a.projectId);
          if (project === undefined) throw new Error('project not found or not visible to you');
          const target = a.groupId === null || a.groupId === undefined ? null : g(a.groupId);
          const preview = await confirmOrPreview(project.name, a.confirm_name, async () => ({ sentence: target === null ? `Takes "${project.name}" out of its group.` : `Files "${project.name}" under "${target.name}".` }));
          if (preview !== null) return preview;
          return ev({ kind: 'project', id: project.projectId }, 'project.updated', { groupId: target?.id ?? null });
        }
        const group = g(a.groupId);
        if (a.action === 'rename' && a.name === undefined) throw new Error('rename needs name');
        const rank = a.action === 'reorder' ? reorderRank(groups, group, a.before, a.after) : null;
        const sentences = { rename: `Renames "${group.name}" to "${a.name ?? ''}".`, reorder: `Moves "${group.name}" among its siblings.`, delete: `Deletes the group "${group.name}".` } as const;
        const preview = await confirmOrPreview(group.name, a.confirm_name, async () => ({
          sentence: sentences[a.action as 'rename' | 'reorder' | 'delete'],
          ...(a.action === 'delete' ? { counts: { projects: group.projectCount } } : {}),
        }));
        if (preview !== null) return preview;
        if (a.action === 'rename') return ev({ kind: 'group', id: group.id }, 'group.renamed', { name: a.name });
        if (a.action === 'delete') return ev({ kind: 'group', id: group.id }, 'group.deleted', {});
        return ev({ kind: 'group', id: group.id }, 'group.reordered', { rank });
      },
    },
  ];
}
