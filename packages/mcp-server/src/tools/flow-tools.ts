import { z } from 'zod';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';
import { envelopeFor, submitOne } from './submit.js';

const id = z.string().min(1);
const waitShape = { workspaceId: id, ticketId: id, value: z.boolean() };

/**
 * The Workflow / Timeline graph tools (Graph Part 5). One module, five tools, appended one per task:
 * set_wait_for_all (T1), get_flow (T2), get_timeline (T3), resolve_decision (T4), publish_flow (T5).
 * Every write is a visible, attributed (`origin: 'mcp'`) and removable act (rule D2).
 */
export function flowTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'set_wait_for_all',
      description:
        'Turn "wait for all incoming" on or off for a ticket in a flow. Off (the default): the ticket moves from Backlog to its first status as soon as ANY ticket that leads to it ' +
        'is done. On: it waits until ALL of them are done (a branch a Decision did not take does not count). Turn it off again with value false. update_ticket cannot set it.',
      inputSchema: waitShape,
      handler: async (args) => {
        const a = z.object(waitShape).parse(args);
        // Off clears the field (`null`), never `false`: the domain takes `true` or a clear (`waitForAllValueSchema`, Part 2 T4).
        const event = envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.field_set', { fieldId: 'waitForAll', value: a.value ? true : null });
        return { result: await submitOne(session, event) };
      },
    },
  ];
}
