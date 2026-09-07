import { z } from 'zod';
import { newSubmittedEvent, newUlid, plainTextToDoc, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/**
 * The single write path, for all four tools.
 *
 * `POST /v1/events` answers 200 for a refusal — refusals ride INSIDE
 * `results[]`, index-aligned with the request array, and only a malformed
 * BATCH is an HTTP error. So a caller that checked the status code alone would
 * report every refusal as a success. This function is the one place that
 * reads the result, and it throws the server's own words rather than a summary
 * of them.
 */
async function submitOne(session: Session, event: SubmittedEvent): Promise<unknown> {
  const body = (await session.postEvents([event])) as {
    results: (
      | { status: 'committed'; eventId: string; seq: number; serverTime: string }
      | { status: 'invalid'; eventId: string | null; code: string; message: string }
      | { status: 'refused'; eventId: string; rule: string; reason: string }
    )[];
  };
  const result = body.results[0];
  if (result === undefined) {
    throw new Error('gisik-nokma returned no result for the submitted event');
  }
  if (result.status === 'refused') {
    // VERBATIM. The rule's name and the reason's own sentence, because a
    // refusal is the product explaining itself to a person and a reworded
    // refusal is a different product.
    throw new Error(`refused by ${result.rule}: ${result.reason}`);
  }
  if (result.status === 'invalid') {
    throw new Error(`${result.code}: ${result.message}`);
  }
  return result;
}

function envelope(
  session: Session,
  workspaceId: string,
  entityId: string,
  type: string,
  payload: unknown,
): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId,
    entity: { kind: 'ticket', id: entityId },
    type,
    payload,
    // The session user, always. The permission gate's first question is
    // whether the actor is the person submitting, and it refuses any envelope
    // where they differ.
    actorId: session.userId(),
      // `'mcp'` — owner ruling 1. This was `'web'` while ORIGINS had no
      // fifth member; Task 0 adds one, and the whole reason it exists is
      // that a ledger which cannot distinguish a person's claim from their
      // assistant's is a ledger lying about who acted. `'server'` remains
      // refused at the client door.
    origin: 'mcp',
  });
}

export function writeTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'create_ticket',
      description:
        'Create a ticket in a project. `typeId` names a ticket type that already exists in the ' +
        'workspace; `parentId` is the epic or parent ticket, or null for a top-level ticket. The ' +
        'workflow, the initial state and every rule are the product\'s, not this tool\'s.',
      inputSchema: {
        workspaceId: z.string().min(1),
        projectId: z.string().min(1),
        typeId: z.string().min(1),
        title: z.string().min(1),
        parentId: z.string().min(1).nullable().optional(),
      },
      handler: async (args) => {
        const a = z
          .object({
            workspaceId: z.string().min(1),
            projectId: z.string().min(1),
            typeId: z.string().min(1),
            title: z.string().min(1),
            parentId: z.string().min(1).nullable().optional(),
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
