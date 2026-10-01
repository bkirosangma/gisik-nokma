import { z } from 'zod';
import { newUlid, plainTextToDoc } from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';
import { envelopeFor, submitOne } from './submit.js';

/** One ticket-entity envelope (the four write tools here all act on a ticket). */
const envelope = (session: Session, workspaceId: string, ticketId: string, type: string, payload: unknown) =>
  envelopeFor(session, workspaceId, { kind: 'ticket', id: ticketId }, type, payload);

export function writeTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'create_ticket',
      description:
        'Create a ticket in a project. `typeId` names a ticket type that already exists in the ' +
        'workspace; `parentId` is the epic or parent ticket, or null for a top-level ticket. The ' +
        'workflow, the initial state and every rule are the product\'s, not this tool\'s. `start` ' +
        'chooses where it is born: `\'backlog\'` (the default) or `\'focus\'`.',
      inputSchema: {
        workspaceId: z.string().min(1),
        projectId: z.string().min(1),
        typeId: z.string().min(1),
        title: z.string().min(1),
        parentId: z.string().min(1).nullable().optional(),
        start: z.enum(['backlog', 'focus']).optional(),
      },
      handler: async (args) => {
        const a = z
          .object({
            workspaceId: z.string().min(1),
            projectId: z.string().min(1),
            typeId: z.string().min(1),
            title: z.string().min(1),
            parentId: z.string().min(1).nullable().optional(),
            start: z.enum(['backlog', 'focus']).optional(),
          })
          .parse(args);
        const ticketId = newUlid();
        const event = envelope(session, a.workspaceId, ticketId, 'ticket.created', {
          typeId: a.typeId,
          projectId: a.projectId,
          // Explicit null, never an absent key: the domain schema is
          // `.nullable()`, not `.optional()`.
          parentId: a.parentId ?? null,
          title: a.title,
          // Backlog/closed spec §1.3 (amended 2026-09-17, see Amendments —
          // Ruling 51): `ticket.created`'s own field is OPTIONAL, absence
          // meaning focus — that is what every v1 event meant, and this is
          // the additive-field rule the domain schema already enforces. But
          // this tool is the SECOND production producer of the event (Finding
          // 4, final whole-branch review), and its own default must not be
          // the domain schema's: MCP creates land in the backlog exactly like
          // the dialog's own default (spec §1.3, "backlog by default is the
          // CLIENT's rule"), unless the caller names `'focus'` explicitly. An
          // absent `a.start` here therefore still sends an explicit
          // `'backlog'` on the wire — never an absent key — so a reader of
          // the ledger cannot mistake "no argument was given" for "this
          // event predates the field".
          start: a.start ?? 'backlog',
        });
        const committed = await submitOne(session, event);
        return { ticketId, ...(committed as object) };
      },
    },
    {
      name: 'transition_ticket',
      description:
        'Move a ticket to another state in its workflow. The rule engine decides whether the move is ' +
        'allowed; if it refuses, this tool reports the rule and the reason exactly as the server ' +
        'wrote them. Some transitions require a comment — pass one.',
      inputSchema: {
        workspaceId: z.string().min(1),
        ticketId: z.string().min(1),
        to: z.string().min(1),
        comment: z.string().min(1).optional(),
      },
      handler: async (args) => {
        const a = z
          .object({
            workspaceId: z.string().min(1),
            ticketId: z.string().min(1),
            to: z.string().min(1),
            comment: z.string().min(1).optional(),
          })
          .parse(args);
        // `to`, not `toStateId` — packages/domain/src/workflow.ts:137.
        const payload: { to: string; comment?: { text: string } } = { to: a.to };
        if (a.comment !== undefined) payload.comment = { text: a.comment };
        return submitOne(session, envelope(session, a.workspaceId, a.ticketId, 'ticket.transitioned', payload));
      },
    },
    {
      name: 'add_comment',
      description: 'Add a comment to a ticket, attributed to you.',
      inputSchema: {
        workspaceId: z.string().min(1),
        ticketId: z.string().min(1),
        text: z.string().min(1),
      },
      handler: async (args) => {
        const a = z
          .object({ workspaceId: z.string().min(1), ticketId: z.string().min(1), text: z.string().min(1) })
          .parse(args);
        // A document object, not a string — `commentAddedPayload.body` is
        // `z.record(z.string(), z.unknown())`.
        return submitOne(
          session,
          envelope(session, a.workspaceId, a.ticketId, 'comment.added', { body: plainTextToDoc(a.text) }),
        );
      },
    },
    {
      name: 'assign_ticket',
      description: 'Assign a ticket to somebody, or pass null to leave it unassigned.',
      inputSchema: {
        workspaceId: z.string().min(1),
        ticketId: z.string().min(1),
        assigneeId: z.string().min(1).nullable(),
      },
      handler: async (args) => {
        const a = z
          .object({
            workspaceId: z.string().min(1),
            ticketId: z.string().min(1),
            assigneeId: z.string().min(1).nullable(),
          })
          .parse(args);
        return submitOne(
          session,
          envelope(session, a.workspaceId, a.ticketId, 'ticket.assigned', { assigneeId: a.assigneeId }),
        );
      },
    },
  ];
}
