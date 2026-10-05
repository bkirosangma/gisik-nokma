import { z } from 'zod';
import type { Session } from '../session.js';
import { readFlow, toFlowAnswer } from './flow-answer.js';
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
    {
      name: 'get_flow',
      description:
        'Read the flow a ticket belongs to: the tickets connected to it by "leads to" arrows, in flow order, with the arrows. Per ticket: status, wait-for-all, estimate and rework estimate, round (how many times the flow reran it), ' +
        'a Decision\'s current outcome and every pass (with its revisions), a "Not taken" resolution, the alternate branches of a Decision it sits behind, its work periods (real time worked, one per pass), ' +
        'planned intervals (pruned ones are branches the Decision left), its actual start and end, the reason it is not on the timeline, and the notes attached to it. Arrows carry `loop` and, for a loop, `taken`: ' +
        'how many passes took it. `autoMoves` lists what the flow did by itself (moved to To do, reopened, closed Not taken). Only what you can see; your own drafts are included, other people\'s never are.',
      inputSchema: { workspaceId: id, ticketId: id },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id }).parse(args);
        return toFlowAnswer(await readFlow(session, a.workspaceId, a.ticketId));
      },
    },
  ];
}
