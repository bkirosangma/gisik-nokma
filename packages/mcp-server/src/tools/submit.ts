import { newSubmittedEvent, type EntityKind, type SubmittedEvent } from '@gisik-nokma/domain';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';

export type EventResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid'; eventId: string | null; code: string; message: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string };

/** The sentence an ingest result that did not commit is spelled with; `null` for a commit. One spelling for every reader below. */
export function resultError(result: EventResult): Error | null {
  // VERBATIM. The rule's name and the reason's own sentence, because a
  // refusal is the product explaining itself to a person and a reworded
  // refusal is a different product.
  if (result.status === 'refused') return new Error(`refused by ${result.rule}: ${result.reason}`);
  if (result.status === 'invalid') return new Error(`${result.code}: ${result.message}`);
  return null;
}

/**
 * The single-event write path, for every write tool.
 *
 * `POST /v1/events` answers 200 for a refusal — refusals ride INSIDE
 * `results[]`, index-aligned with the request array, and only a malformed
 * BATCH is an HTTP error. So a caller that checked the status code alone would
 * report every refusal as a success. This function reads the result through
 * `resultError` and throws the server's own words rather than a summary of them.
 */
export async function submitOne(session: Session, event: SubmittedEvent): Promise<unknown> {
  const body = (await session.postEvents([event])) as { results: EventResult[] };
  const result = body.results[0];
  if (result === undefined) {
    throw new Error('gisik-nokma returned no result for the submitted event');
  }
  const failure = resultError(result);
  if (failure !== null) throw failure;
  return result;
}

const KNOWN_STATUSES = new Set(['committed', 'invalid', 'refused']);
function isEventResult(value: unknown): value is EventResult {
  return typeof value === 'object' && value !== null && KNOWN_STATUSES.has((value as { status?: unknown }).status as string);
}

/**
 * Several events in ONE `POST /v1/events`, every outcome returned index-aligned and NONE thrown (MCP sweep 2 PL-2).
 * `POST /v1/events` commits each event in its own transaction, so a refusal in the middle leaves its neighbours
 * committed (`ingest/ingest-service.ts:368-378`); `submitBatch` throws at the first one and would report an error
 * for a batch that had in part succeeded. This throws only when the ANSWER cannot be trusted (a rejected call, a
 * short, long, holed or missing `results`), with `whenUnknown` in front: nothing may then be claimed either way.
 */
export async function submitBatchByIndex(session: Session, events: SubmittedEvent[], whenUnknown: string): Promise<EventResult[]> {
  let results: unknown;
  try {
    results = ((await session.postEvents(events)) as { results?: unknown } | null)?.results;
  } catch (error) {
    throw new Error(`${whenUnknown} (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!Array.isArray(results) || results.length !== events.length || !results.every(isEventResult)) {
    throw new Error(`${whenUnknown} (the answer did not carry one result for each of the ${events.length} events)`);
  }
  return results;
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
  entity: { kind: EntityKind; id: string },
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

/** A 400 or 422 from a non-event route in the server's own words; `null` for any other status (rethrown untouched). */
function wordsFor(error: HttpError): Error | null {
  if (error.status !== 400 && error.status !== 422) return null;
  const b = (error.body ?? {}) as Record<string, unknown>;
  if (b['status'] === 'refused') return new Error(`refused by ${String(b['rule'])}: ${String(b['reason'])}`);
  if (b['status'] === 'invalid') return new Error(`${String(b['code'])}: ${String(b['message'])}`);
  if (typeof b['message'] === 'string') {
    return new Error(typeof b['error'] === 'string' ? `${b['error']}: ${b['message']}` : b['message']);
  }
  return new Error(`gisik-nokma answered ${error.status}: ${JSON.stringify(error.body)}`);
}

async function withWords(call: () => Promise<unknown>): Promise<unknown> {
  try {
    return await call();
  } catch (error) {
    throw (error instanceof HttpError ? wordsFor(error) : null) ?? error;
  }
}

/**
 * `session.post` to a route that is not the event door, with a 400 or 422 turned
 * into the server's own words. `HttpError`'s message is only "answered 400" — the
 * body is what says why, and `registerTools` shows an assistant the message and
 * nothing else. A 422 body is an ingest result (`refused` / `invalid`), spelled
 * exactly as `submitOne` spells it; a 400 body is `{ error, message }`. Any
 * other status, and anything that is not an `HttpError`, is rethrown untouched.
 */
export function postJson(session: Session, path: string, body: unknown): Promise<unknown> {
  return withWords(() => session.post(path, body));
}

/** The same for `session.put`. */
export function putJson(session: Session, path: string, body: unknown): Promise<unknown> {
  return withWords(() => session.put(path, body));
}

/**
 * `POST /v1/workspaces/:id/assign-outsider { userId, event }` (`routes/people.ts:151-245`). The route nests its
 * ingest result under `result`, on 200 AND on a 422 refusal, so the refusal is returned here as an answer and never
 * thrown (as the app's gateway does, `packages/app-core/src/online/people.ts:48-63`): the caller spells it with
 * `resultError`. A 404 (the caller is not a member) is rethrown as it came.
 */
export async function postOutsider(session: Session, workspaceId: string, userId: string, event: SubmittedEvent): Promise<EventResult> {
  const path = `/v1/workspaces/${encodeURIComponent(workspaceId)}/assign-outsider`;
  let raw: unknown;
  try {
    raw = await session.post(path, { userId, event });
  } catch (error) {
    if (error instanceof HttpError && error.status === 422) {
      const wrapped = (error.body as { result?: unknown } | null)?.result;
      if (isEventResult(wrapped)) return wrapped;
    }
    throw (error instanceof HttpError ? wordsFor(error) : null) ?? error;
  }
  const result = (raw as { result?: unknown } | null)?.result;
  if (!isEventResult(result)) throw new Error('gisik-nokma answered the outsider assignment without a result');
  return result;
}

/** A 429 as a sentence an assistant can act on (the generic `HttpError` message is only "answered 429"); `null` for any other status. */
export function rateLimitedError(error: HttpError, what: string): Error | null {
  if (error.status !== 429) return null;
  const wait = (error.body as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
  const seconds = typeof wait === 'number' && wait > 0 ? Math.ceil(wait) : null;
  const when = seconds === null ? 'a minute' : `about ${seconds} second${seconds === 1 ? '' : 's'}`;
  return new Error(`${what} is rate limited right now. Wait ${when} and call this again; nothing was changed.`);
}
