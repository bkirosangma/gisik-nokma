import { z } from 'zod';
import {
  isUlid,
  newUlid,
  stateMappingSchema,
  ticketTypeDefSchema,
  VISIBILITY_MODES,
  workflowDefSchema,
  workspaceSettingsSetPayloadSchema,
} from '@gisik-nokma/domain';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { readDirectory } from './directory.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { readOrNotFound } from './reads.js';
import { envelopeFor, postJson, submitOne } from './submit.js';

const id = z.string().min(1);
const enc = encodeURIComponent;
const confirm = { confirm_name: z.string().optional() };

/** The workspace's current name, read at call time; a workspace the caller cannot see is the uniform not-found. */
async function workspaceName(session: Session, workspaceId: string): Promise<string> {
  const ws = (await readDirectory(session)).find((w) => w.workspaceId === workspaceId);
  if (ws === undefined) throw new Error('workspace not found or not visible to you');
  return ws.name;
}

/** A GET whose 404 means "not there, or not yours to read" and is answered with `null` (the admin-only reads answer 404 to a member). */
async function maybe<T>(read: () => Promise<unknown>): Promise<T | null> {
  try {
    return (await read()) as T;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

/** The product's own schema, with its refusals spelled path by path — the zod path is what tells an assistant which field to fix. */
function parsed<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new Error(`${what} is not valid: ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
  }
  return r.data;
}

/** `adminOnlyReason` (apps/server permissions), which this package cannot import. */
const adminOnly = (role: string): string => `refused by permission.role: Only a workspace owner or admin can do this. Your role is ${role}.`;

type TicketTypeRow = { id: string; name: string };

async function readTypes(session: Session, workspaceId: string): Promise<TicketTypeRow[]> {
  const body = (await readOrNotFound(session, `/v1/workspaces/${enc(workspaceId)}/ticket-types`, 'workspace')) as { ticketTypes: TicketTypeRow[] };
  return body.ticketTypes;
}

export function definitionAdminTools(session: Session): ToolDefinition[] {
  const defineWorkflow = { workspaceId: id, definition: z.record(z.unknown()), stateMapping: z.record(z.string()).optional(), ...confirm };
  const defineType = { workspaceId: id, definition: z.record(z.unknown()), ...confirm };
  const migrate = { workspaceId: id, typeId: id, fromWorkflowId: id, toWorkflowId: id, stateMap: z.record(id), ...confirm };
  const visibility = { workspaceId: id, ticketId: id, mode: z.enum(VISIBILITY_MODES), userIds: z.array(id).optional(), ...confirm };
  const settings = {
    workspaceId: id,
    staleDays: z.number().int().optional(),
    dueSoonDays: z.number().int().optional(),
    autoCloseAfterDays: z.number().int().nullable().optional(),
    ...confirm,
  };

  return [
    {
      name: 'define_workflow',
      description:
        "Publish a workflow definition — new, or the next version of an existing one (same id, version + 1, with stateMapping for the states you removed). The definition is validated with the product's own schema before anything is sent. confirm_name is the workflow's current name (the workspace's name for a new workflow); without it you get a preview with the tickets in the workflow and nothing changes. Owner or admin only.",
      inputSchema: defineWorkflow,
      handler: async (args) => {
        const a = z.object(defineWorkflow).parse(args);
        const def = parsed(workflowDefSchema, a.definition, 'definition');
        // The event door files a workflow under its own id, and every entity id is a ULID: say so here, not as a door error.
        if (!isUlid(def.id)) throw new Error(`definition.id: a workflow id must be a ULID ("${def.id}" is not); a new workflow takes a fresh one`);
        const mapping = a.stateMapping === undefined ? undefined : parsed(stateMappingSchema, a.stateMapping, 'stateMapping');
        const base = `/v1/workspaces/${enc(a.workspaceId)}/workflows/${enc(def.id)}`;
        const current = await maybe<{ workflow?: { name?: string } }>(() => session.get(base));
        const currentName = current?.workflow?.name ?? null;
        const occupancy = currentName === null ? null : await maybe<{ counts?: Record<string, number> }>(() => session.get(`${base}/state-occupancy`));
        const inIt = Object.values(occupancy?.counts ?? {}).reduce((n, c) => n + c, 0);
        const preview = await confirmOrPreview(currentName ?? (await workspaceName(session, a.workspaceId)), a.confirm_name, async () => ({
          sentence: `Publishes version ${def.version} of workflow "${def.name}" (${def.states.length} states, ${def.transitions.length} moves).`,
          counts: { ticketsInWorkflow: inIt },
        }));
        if (preview !== null) return preview;
        return submitOne(
          session,
          envelopeFor(session, a.workspaceId, { kind: 'workflow', id: def.id }, 'workflow.defined', mapping === undefined ? def : { ...def, stateMapping: mapping }),
        );
      },
    },
    {
      name: 'define_ticket_type',
      description:
        "Create or change a ticket type (id, name, icon, rank, workflowId, fields). Validated with the product's own schema before anything is sent. confirm_name is the type's current name (the workspace's name for a new type); without it you get a preview with how many tickets have that type and nothing changes. Owner or admin only.",
      inputSchema: defineType,
      handler: async (args) => {
        const a = z.object(defineType).parse(args);
        const def = parsed(ticketTypeDefSchema, a.definition, 'definition');
        const existing = (await readTypes(session, a.workspaceId)).find((t) => t.id === def.id);
        const counts =
          (await maybe<{ counts?: Record<string, number> }>(() => session.get(`/v1/workspaces/${enc(a.workspaceId)}/ticket-counts-by-type`)))?.counts ?? {};
        const preview = await confirmOrPreview(existing?.name ?? (await workspaceName(session, a.workspaceId)), a.confirm_name, async () => ({
          sentence: existing === undefined ? `Creates the ticket type "${def.name}".` : `Changes the ticket type "${existing.name}".`,
          counts: { ticketsOfType: counts[def.id] ?? 0 },
        }));
        if (preview !== null) return preview;
        // A FRESH entity id per submission: the projection folds by the payload's id, and the app does the same
        // (app-core workflow-builder/events.ts). Reusing the type id as the entity id would make a second edit of the
        // type collide with the first one's entity.
        return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'ticket-type', id: newUlid() }, 'ticket-type.defined', def));
      },
    },
    {
      name: 'migrate_ticket_type',
      description:
        "Move every ticket of a type from one workflow to another, mapping each occupied state (stateMap: { fromStateId: toStateId }). The server checks the whole migration before it moves anything and refuses it whole. confirm_name is the type's exact name; without it you get a preview counting the tickets that would move and nothing changes. Owner or admin only.",
      inputSchema: migrate,
      handler: async (args) => {
        const a = z.object(migrate).parse(args);
        const type = (await readTypes(session, a.workspaceId)).find((t) => t.id === a.typeId);
        if (type === undefined) throw new Error('ticket type not found or not visible to you');
        const population =
          (
            await maybe<{ count?: number }>(() =>
              session.get(`/v1/workspaces/${enc(a.workspaceId)}/ticket-types/${enc(a.typeId)}/population?workflowId=${enc(a.fromWorkflowId)}`),
            )
          )?.count ?? 0;
        const preview = await confirmOrPreview(type.name, a.confirm_name, async () => ({
          sentence: `Moves every "${type.name}" ticket from workflow ${a.fromWorkflowId} to workflow ${a.toWorkflowId}.`,
          counts: { ticketsMoved: population },
        }));
        if (preview !== null) return preview;
        try {
          return await postJson(session, `/v1/workspaces/${enc(a.workspaceId)}/ticket-types/${enc(a.typeId)}/migrate`, {
            fromWorkflowId: a.fromWorkflowId,
            toWorkflowId: a.toWorkflowId,
            stateMap: a.stateMap,
          });
        } catch (error) {
          // The route answers a non-admin 404 (it leaks less than a 403). This caller already read the workspace and the type,
          // so a 404 here is the admin gate: say so in the gate's own sentence, with the caller's role.
          if (error instanceof HttpError && error.status === 404) {
            const role = (await readDirectory(session)).find((w) => w.workspaceId === a.workspaceId)?.role;
            if (role !== undefined && role !== 'owner' && role !== 'admin') throw new Error(adminOnly(role));
          }
          throw error;
        }
      },
    },
    {
      name: 'set_visibility',
      description:
        'Change who can see a ticket: mode workspace, project, inherit (from its parent) or explicit (with userIds, at least one). confirm_name is the ticket KEY (e.g. "CC-4"); without it you get a preview and nothing changes.',
      inputSchema: visibility,
      handler: async (args) => {
        const a = z.object(visibility).parse(args);
        if (a.mode === 'explicit' && (a.userIds === undefined || a.userIds.length === 0)) throw new Error('mode "explicit" needs userIds (at least one person)');
        if (a.mode !== 'explicit' && a.userIds !== undefined) throw new Error('userIds go only with mode "explicit"');
        const detail = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/tickets/${enc(a.ticketId)}`, 'ticket')) as {
          key: string | null;
          ticket?: { resolved_mode?: string };
        };
        const key = detail.key ?? a.ticketId;
        const preview = await confirmOrPreview(key, a.confirm_name, async () => ({
          sentence: `Changes who can see ${key} from ${detail.ticket?.resolved_mode ?? 'its current audience'} to ${a.mode}${a.mode === 'explicit' ? ` (${a.userIds?.length ?? 0} people)` : ''}.`,
        }));
        if (preview !== null) return preview;
        return submitOne(
          session,
          envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'visibility.set', {
            ticketId: a.ticketId,
            mode: a.mode,
            // `userIds` is refused by the domain on any mode but `explicit`: the key is absent, not undefined.
            ...(a.mode === 'explicit' ? { userIds: a.userIds } : {}),
          }),
        );
      },
    },
    {
      name: 'update_workspace_settings',
      description:
        'Change workspace settings: staleDays (1–365), dueSoonDays (0–365), autoCloseAfterDays (1–365, or null to turn auto-close off). Give only the ones to change. confirm_name is the workspace name; without it you get a preview and nothing changes. Owner or admin only.',
      inputSchema: settings,
      handler: async (args) => {
        const a = z.object(settings).parse(args);
        const payload = parsed(
          workspaceSettingsSetPayloadSchema,
          {
            ...(a.staleDays === undefined ? {} : { staleDays: a.staleDays }),
            ...(a.dueSoonDays === undefined ? {} : { dueSoonDays: a.dueSoonDays }),
            ...(a.autoCloseAfterDays === undefined ? {} : { autoCloseAfterDays: a.autoCloseAfterDays }),
          },
          'settings',
        );
        const name = await workspaceName(session, a.workspaceId);
        const preview = await confirmOrPreview(name, a.confirm_name, async () => ({
          sentence: `Changes ${Object.keys(payload).join(', ')} for workspace "${name}".`,
        }));
        if (preview !== null) return preview;
        return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'workspace', id: a.workspaceId }, 'workspace.settings_set', payload));
      },
    },
  ];
}
