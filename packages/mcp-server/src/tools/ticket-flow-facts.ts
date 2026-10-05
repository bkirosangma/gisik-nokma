import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';

type Obj = Record<string, unknown>;
const enc = encodeURIComponent;

/**
 * What `get_ticket` adds about the flow (spec §14, last paragraph). Part 2 folds `passes`, `rounds`, `periods` and a close
 * `cause` into `ticketState`; the Not-taken resolution is DERIVED from a `branch-not-taken` cause (Part 2 decision 2,
 * `resolutionOf`); some name OTHER tickets (a Not-taken ticket's Decision). So they are lifted to the top level in one
 * representation, the raw members leave `ticketState`, and the Decision is named only if the caller can read it (one read;
 * a hidden ticket answers 404). The id of a hidden Decision appears nowhere in the reply.
 */
export async function withFlowFacts(session: Session, workspaceId: string, state: Obj): Promise<{ state: Obj; facts: Obj }> {
  const { passes, rounds, periods, resolution, closed, ...rest } = state;
  const facts: Obj = {};
  if (Array.isArray(passes) && passes.length > 0) facts['passes'] = passes;
  const round = typeof rounds === 'number' ? rounds : 1;
  if (round >= 2) {
    facts['round'] = round;
    facts['periods'] = Array.isArray(periods) ? periods : [];
  }
  // Part 2 decision 2: no folded `resolution`; read it off the close cause exactly as `resolutionOf` does (a served `resolution` is accepted too, and wins).
  const cause = closed !== null && typeof closed === 'object' ? ((closed as Obj)['cause'] as Obj | null | undefined) : undefined;
  const fromCause = cause !== null && cause !== undefined && cause['kind'] === 'branch-not-taken'
    ? { kind: 'not-taken', decisionTicketId: cause['decisionTicketId'], outcome: cause['outcome'], pass: cause['pass'] }
    : null;
  const r = (resolution as Obj | null | undefined) ?? fromCause;
  if (r !== null && r !== undefined && r['kind'] === 'not-taken') {
    facts['resolution'] = { kind: 'not-taken', outcome: r['outcome'], pass: r['pass'], decision: await readableTicket(session, workspaceId, r['decisionTicketId']) };
  }
  const keptClosed = closed !== null && typeof closed === 'object' ? (({ cause: _cause, ...c }) => c)(closed as Obj) : closed;
  return { state: { ...rest, ...(closed === undefined ? {} : { closed: keptClosed }) }, facts };
}

/** The Decision as `{id, key, title}` when the caller can read it, `null` when its detail answers 404 (hidden or gone); any other failure fails the call. */
async function readableTicket(session: Session, workspaceId: string, id: unknown): Promise<{ id: string; key: string | null; title: string } | null> {
  if (typeof id !== 'string') return null;
  try {
    const d = (await session.get(`/v1/workspaces/${enc(workspaceId)}/tickets/${enc(id)}`)) as { key: string | null; title: string };
    return { id, key: d.key, title: d.title };
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}
