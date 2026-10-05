import { z } from 'zod';
import { PRIORITIES, newUlid } from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';
import { MARKDOWN_SYNTAX_HELP, markdownBody, parentOf } from './markdown-io.js';
import { EMAIL_FIELDS, resolveAssignee, submitForAssignee, type LookedUpPerson } from './assignee-email.js';
import { readDirectory } from './directory.js';
import { envelopeFor, submitOne } from './submit.js';
import { readTicket } from './ticket-tools.js';

/** One ticket-entity envelope (the four write tools here all act on a ticket). */
const envelope = (session: Session, workspaceId: string, ticketId: string, type: string, payload: unknown) =>
  envelopeFor(session, workspaceId, { kind: 'ticket', id: ticketId }, type, payload);

/** The birth fields `create_ticket` takes beyond the original four (MCP-everything T9). */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a day in YYYY-MM-DD form');
const birthShape = {
  draft: z.boolean().optional(),
  markdown: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assigneeId: z.string().min(1).optional(),
  stateId: z.string().min(1).optional(),
  startDate: day.optional(),
  dueDate: day.optional(),
};

/** The domain's refusal for a draft born in focus (`ticket.created`'s refine), held here because the domain does not export the text; 28.131 pins the two to each other. */
const DRAFT_IN_BACKLOG = 'a draft is born in the backlog: send start: "backlog" and no stateId';

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
        'so do not combine it with start "backlog"), `startDate` / `dueDate` (YYYY-MM-DD). ' +
        '`draft: true` makes a private draft instead: it is born in the backlog, so pass no `stateId` and no start "focus". ' +
        'A draft is private to you until publish_draft. It has no key. ' +
        'To assign someone by their email address instead, pass assignee_email (and no assigneeId): the first call looks the address up and answers a PREVIEW naming the person and saying whether they are already in the workspace or WILL BE ADDED AS A GUEST (who would then see only this ticket) - no ticket is created; repeat the call with confirm_assignee set to that person\'s userId to create it. ' + MARKDOWN_SYNTAX_HELP,
      inputSchema: {
        workspaceId: z.string().min(1),
        projectId: z.string().min(1),
        typeId: z.string().min(1),
        title: z.string().min(1),
        parentId: z.string().min(1).nullable().optional(),
        start: z.enum(['backlog', 'focus']).optional(),
        ...birthShape,
        ...EMAIL_FIELDS,
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
            ...EMAIL_FIELDS,
          })
          .parse(args);
        if (a.draft === true && (a.stateId !== undefined || a.start === 'focus')) {
          throw new Error(DRAFT_IN_BACKLOG);
        }
        if (a.stateId !== undefined && a.start === 'backlog') {
          throw new Error('a backlog ticket has no starting status, so pass either start: "backlog" or a stateId, not both');
        }
        if (a.assigneeId !== undefined && a.assignee_email !== undefined) {
          throw new Error('create_ticket takes at most one of assigneeId and assignee_email');
        }
        if (a.confirm_assignee !== undefined && a.assignee_email === undefined) throw new Error('confirm_assignee only goes with assignee_email');
        let person: LookedUpPerson | undefined;
        if (a.assignee_email !== undefined) {
          // Nothing below is built (no id, no Markdown conversion) until the address has resolved AND been confirmed: call 1 must create nothing.
          const resolved = await resolveAssignee(session, a.workspaceId, a.assignee_email, a.confirm_assignee, async (found) => {
            const workspace = (await readDirectory(session)).find((w) => w.workspaceId === a.workspaceId);
            const project = workspace?.projects.find((p) => p.projectId === a.projectId);
            return `Creates "${a.title}" in ${project?.name ?? a.projectId} (${workspace?.name ?? a.workspaceId}) and assigns it to ${found.name} (${found.email}).`;
          }, a.draft === true);
          if ('preview' in resolved) return resolved.preview;
          person = resolved.person;
        }
        const assignee = person !== undefined ? person.userId : a.assigneeId === 'me' ? session.userId() : a.assigneeId;
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
          // A draft never reaches the `stateId` branch: the check above refused it.
          ...(a.draft === true ? { draft: true } : {}),
          ...(a.markdown === undefined || a.markdown.trim() === '' ? {} : { description: await markdownBody(session, a.workspaceId, a.markdown) }),
          ...(a.priority === undefined ? {} : { priority: a.priority }),
          ...(assignee === undefined ? {} : { assigneeId: assignee }),
          ...(a.stateId === undefined ? {} : { stateId: a.stateId }),
          ...(a.startDate === undefined ? {} : { startDate: { date: a.startDate } }),
          ...(a.dueDate === undefined ? {} : { dueDate: { date: a.dueDate } }),
        });
        const committed = person === undefined ? await submitOne(session, event) : await submitForAssignee(session, a.workspaceId, person, event);
        // A draft has no key until publish_draft: say so, so an assistant does not go looking for one.
        return a.draft === true ? { ticketId, ...(committed as object), draft: true, key: null } : { ticketId, ...(committed as object) };
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
        // `to`, not `toStateId` — packages/domain/src/workflow.ts:138.
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
      description:
        'Assign a ticket to somebody, or pass assigneeId null to leave it unassigned. To assign someone by their email address instead, pass assignee_email (and no assigneeId): ' +
        'the first call looks the address up and answers a PREVIEW naming the person and saying whether they are already in the workspace or WILL BE ADDED AS A GUEST (who would then see only this ticket); ' +
        'nothing changes. Repeat the call with confirm_assignee set to that person\'s userId from the preview to assign. The address must belong to a person with a verified account.',
      inputSchema: {
        workspaceId: z.string().min(1),
        ticketId: z.string().min(1),
        assigneeId: z.string().min(1).nullable().optional(),
        ...EMAIL_FIELDS,
      },
      handler: async (args) => {
        const a = z
          .object({ workspaceId: z.string().min(1), ticketId: z.string().min(1), assigneeId: z.string().min(1).nullable().optional(), ...EMAIL_FIELDS })
          .parse(args);
        if ((a.assigneeId !== undefined) === (a.assignee_email !== undefined)) {
          throw new Error('assign_ticket takes exactly one of assigneeId (a person\'s id, or null to unassign) and assignee_email (an address, confirmed in a second call)');
        }
        if (a.confirm_assignee !== undefined && a.assignee_email === undefined) throw new Error('confirm_assignee only goes with assignee_email');
        if (a.assignee_email === undefined) {
          return submitOne(session, envelope(session, a.workspaceId, a.ticketId, 'ticket.assigned', { assigneeId: a.assigneeId ?? null }));
        }
        // Call 1 reads the ticket FIRST, so a ticket the caller cannot see is answered before any lookup (AE-11). Call 2 reads it only to
        // name it in a fresh preview: the server's own refusal then covers a ticket that went away between the calls.
        let ticket = a.confirm_assignee === undefined ? await readTicket(session, a.workspaceId, a.ticketId) : undefined;
        // An existing draft takes nobody from outside (R8, planner ruling 2026-10-05 00:44): call 1's read says whether it is one.
        const resolved = await resolveAssignee(session, a.workspaceId, a.assignee_email, a.confirm_assignee, async (person) => {
          ticket ??= await readTicket(session, a.workspaceId, a.ticketId);
          return `Assigns ${ticket.key ?? a.ticketId} "${ticket.title}" to ${person.name} (${person.email}).`;
        }, ticket?.ticketState.draft !== undefined);
        if ('preview' in resolved) return resolved.preview;
        return submitForAssignee(session, a.workspaceId, resolved.person, envelope(session, a.workspaceId, a.ticketId, 'ticket.assigned', { assigneeId: resolved.person.userId }));
      },
    },
  ];
}
