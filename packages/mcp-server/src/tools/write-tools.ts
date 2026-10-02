import { z } from 'zod';
import { PRIORITIES, newUlid } from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';
import { MARKDOWN_SYNTAX_HELP, markdownBody, parentOf } from './markdown-io.js';
import { envelopeFor, submitOne } from './submit.js';

/** One ticket-entity envelope (the four write tools here all act on a ticket). */
const envelope = (session: Session, workspaceId: string, ticketId: string, type: string, payload: unknown) =>
  envelopeFor(session, workspaceId, { kind: 'ticket', id: ticketId }, type, payload);

/** The birth fields `create_ticket` takes beyond the original four (MCP-everything T9). */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a day in YYYY-MM-DD form');
const birthShape = {
  markdown: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().min(1).optional(),
  stateId: z.string().min(1).optional(),
  startDate: day.optional(),
  dueDate: day.optional(),
};

export function writeTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'create_ticket',
      description:
        'Create a ticket in a project. `typeId` names a ticket type that already exists in the ' +
        'workspace; `parentId` is the epic or parent ticket, or null for a top-level ticket. The ' +
        'workflow, the initial state and every rule are the product\'s, not this tool\'s. `start` ' +
        'chooses where it is born: `\'backlog\'` (the default) or `\'focus\'`. Optional: `markdown` (the description), ' +
        '`priority` (P1–P3), `assigneeId` ("me" is you), `stateId` (the status it starts in; the ticket then starts in focus, ' +
        'so do not combine it with start "backlog"), `startDate` / `dueDate` (YYYY-MM-DD). ' + MARKDOWN_SYNTAX_HELP,
      inputSchema: {
        workspaceId: z.string().min(1),
        projectId: z.string().min(1),
        typeId: z.string().min(1),
        title: z.string().min(1),
        parentId: z.string().min(1).nullable().optional(),
        start: z.enum(['backlog', 'focus']).optional(),
        ...birthShape,
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
            ...birthShape,
          })
          .parse(args);
        if (a.stateId !== undefined && a.start === 'backlog') {
          throw new Error('a backlog ticket has no starting status, so pass either start: "backlog" or a stateId, not both');
        }
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
          // A `stateId` means the ticket is BORN in that state, which a backlog ticket has not got (domain refusal): it starts in focus.
          start: a.stateId !== undefined ? 'focus' : (a.start ?? 'backlog'),
          ...(a.markdown === undefined || a.markdown.trim() === '' ? {} : { description: await markdownBody(session, a.workspaceId, a.markdown) }),
          ...(a.priority === undefined ? {} : { priority: a.priority }),
          ...(a.assigneeId === undefined ? {} : { assigneeId: a.assigneeId === 'me' ? session.userId() : a.assigneeId }),
          ...(a.stateId === undefined ? {} : { stateId: a.stateId }),
          ...(a.startDate === undefined ? {} : { startDate: { date: a.startDate } }),
          ...(a.dueDate === undefined ? {} : { dueDate: { date: a.dueDate } }),
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
      description: `Add a comment to a ticket (ticketId) or a note (noteId), attributed to you. ${MARKDOWN_SYNTAX_HELP} (\`text\` is the old name of \`markdown\` and is read the same way.)`,
      inputSchema: { workspaceId: z.string().min(1), ticketId: z.string().min(1).optional(), noteId: z.string().min(1).optional(), markdown: z.string().min(1).optional(), text: z.string().min(1).optional() },
      handler: async (args) => {
        const a = z
          .object({ workspaceId: z.string().min(1), ticketId: z.string().min(1).optional(), noteId: z.string().min(1).optional(), markdown: z.string().min(1).optional(), text: z.string().min(1).optional() })
          .parse(args);
        const parent = parentOf(a, 'add_comment');
        if ((a.markdown === undefined) === (a.text === undefined)) throw new Error('add_comment takes exactly one of markdown or text');
        // MARKDOWN, not `plainTextToDoc` (the 13:37 defect): the converter stores headings, lists and mentions as the editor would.
        const body = await markdownBody(session, a.workspaceId, (a.markdown ?? a.text) as string);
        return submitOne(session, envelopeFor(session, a.workspaceId, parent, 'comment.added', { body }));
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
