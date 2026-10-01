import { newSubmittedEvent, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Session } from '../session.js';

type EventResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid'; eventId: string | null; code: string; message: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string };

/**
 * The single write path, for every write tool.
 *
 * `POST /v1/events` answers 200 for a refusal — refusals ride INSIDE
 * `results[]`, index-aligned with the request array, and only a malformed
 * BATCH is an HTTP error. So a caller that checked the status code alone would
 * report every refusal as a success. This function is the one place that
 * reads the result, and it throws the server's own words rather than a summary
 * of them.
 */
export async function submitOne(session: Session, event: SubmittedEvent): Promise<unknown> {
  const body = (await session.postEvents([event])) as { results: EventResult[] };
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

/**
 * Several events in ONE `POST /v1/events` batch (founding a project is
 * `project.created` + `project.member_added`; the pair must land together or
 * the founder cannot see the project). Returns every committed result,
 * index-aligned with `events`. The FIRST refused or invalid result is thrown in
 * its own words, naming its index — `event <i> refused by <rule>: <reason>` /
 * `event <i> <code>: <message>` — because a batch has no single event to name.
 */
export async function submitBatch(session: Session, events: SubmittedEvent[]): Promise<unknown[]> {
  const body = (await session.postEvents(events)) as { results: EventResult[] };
  body.results.forEach((result, index) => {
    if (result.status === 'refused') throw new Error(`event ${index} refused by ${result.rule}: ${result.reason}`);
    if (result.status === 'invalid') throw new Error(`event ${index} ${result.code}: ${result.message}`);
  });
  if (body.results.length !== events.length) {
    throw new Error('gisik-nokma answered a different number of results than events sent');
  }
  return body.results;
}

/**
 * An envelope for ONE event of a tool call: the session user as `actorId` and
 * origin `'mcp'`, against whichever entity the event is about.
 */
export function envelopeFor(
  session: Session,
  workspaceId: string,
  entity: { kind: 'workspace' | 'project' | 'ticket'; id: string },
  type: string,
  payload: unknown,
): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId,
    entity,
    type,
    payload,
    // The session user, always. The permission gate's first question is
    // whether the actor is the person submitting, and it refuses any envelope
    // where they differ.
    actorId: session.userId(),
    // `'mcp'` — owner ruling 1: a ledger which cannot distinguish a person's
    // claim from their assistant's is a ledger lying about who acted.
    // `'server'` remains refused at the client door.
    origin: 'mcp',
  });
}
