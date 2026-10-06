import type { Pool } from 'pg';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { DECISION_TYPE_ID, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildServerGates } from '../../src/gates/index.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';

/**
 * The world every flow task's server test uses (wtg2 T13; T14 and T16 import it): one workspace, four ticket types
 * on three workflows, and helpers that put events in through `applyCommitted` (the ledger and every projection, no
 * engine and no listener), so nothing promotes unless the test hands an event to the code under test.
 *
 * - `flow-task` and `decision` -> `wf-flow` (To do, Doing, Done; `doing -> todo` declared, so a stale promotion out
 *   of Doing would ride a DECLARED edge).
 * - `kickoff-task` -> `wf-kickoff`, whose first state is Kickoff: a promotion must read the workflow's initial state,
 *   never the string `todo`.
 * - `shipped-task` -> `wf-shipped`, whose only state is terminal (AP-1: such a target is skipped).
 *
 * ## Why `step` reads its seqs from the database
 *
 * `makeCommitted` numbers events from a process-local map (`helpers/apply.ts`), while the real ingest a promoter files
 * through numbers them `max + 1` over the ledger. Once a promotion has committed, a map-numbered event for the same
 * ticket (or the same workspace) would reuse a stored seq and the insert would fail. So `step` asks the ledger for
 * both heads and passes them explicitly, and a test may interleave `step` with real promotions in any order.
 *
 * All ids match `ULID_REGEX` (no `I`, `L`, `O` or `U`) because they pass through `parseEvent` at the real door.
 */

export const WS = '01J9GWS0000000000000000000';
export const PROJECT = '01J9GPRJ000000000000000000';
export const PERSON = '01J9GPRS000000000000000000';
export const ASSIGNEE = '01J9GASN000000000000000000';
export const TASK = 'flow-task';
export const KICKOFF_TASK = 'kickoff-task';
export const SHIPPED_TASK = 'shipped-task';

type Def = { id: string; initial: string; states: Array<[string, string, 'open' | 'active' | 'terminal']>; edges: Array<[string, string]> };
const FLOW: Def = { id: 'wf-flow', initial: 'todo', states: [['todo', 'To do', 'open'], ['doing', 'Doing', 'active'], ['done', 'Done', 'terminal']],
  edges: [['todo', 'doing'], ['doing', 'done'], ['done', 'doing'], ['doing', 'todo']] };
const KICKOFF: Def = { id: 'wf-kickoff', initial: 'kickoff', states: [['kickoff', 'Kickoff', 'open'], ['working', 'Working', 'active'], ['finished', 'Finished', 'terminal']],
  edges: [['kickoff', 'working'], ['working', 'finished']] };
const SHIPPED: Def = { id: 'wf-shipped', initial: 'shipped', states: [['shipped', 'Shipped', 'terminal']], edges: [] };

export async function seedFlowWorld(pool: Pool): Promise<void> {
  const events: LedgerEvent[] = [];
  for (const [def, typeId, rank] of [[FLOW, TASK, 3], [FLOW, DECISION_TYPE_ID, 3], [KICKOFF, KICKOFF_TASK, 3], [SHIPPED, SHIPPED_TASK, 3]] as const) {
    if (!events.some((e) => e.entity.id === def.id)) {
      events.push(makeCommitted({ workspaceId: WS, actorId: PERSON, entity: { kind: 'workflow', id: def.id }, type: 'workflow.defined',
        payload: { id: def.id, version: 1, name: def.id, initialStateId: def.initial,
          states: def.states.map(([id, name, category]) => ({ id, name, category })),
          transitions: def.edges.map(([from, to]) => ({ from, to, rules: [] })) } }));
    }
    events.push(makeCommitted({ workspaceId: WS, actorId: PERSON, entity: { kind: 'ticket-type', id: typeId }, type: 'ticket-type.defined',
      payload: { id: typeId, name: typeId, icon: 'check', rank, workflowId: def.id, fields: [] } }));
  }
  await applyCommitted(pool, events);
}

export const realIngest = (pool: Pool) => createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
/** The real door with the production server gates armed (wtg2 T16), as `src/index.ts` builds it. */
export const gatedIngest = (pool: Pool, gates = buildServerGates()) =>
  createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry(), gates });

/** One ticket event, numbered after what the LEDGER holds (see the docblock), applied with no engine and no listener. */
export async function step(
  pool: Pool, ticketId: string, type: string, payload: Record<string, unknown>, actorId = PERSON, workspaceId = WS,
): Promise<LedgerEvent> {
  const { rows } = await pool.query<{ seq: number; ws: number }>(
    `SELECT (SELECT coalesce(max(seq), 0)::int FROM events WHERE entity_kind = 'ticket' AND entity_id = $1) AS seq,
            (SELECT coalesce(max(workspace_seq), 0)::int FROM events WHERE workspace_id = $2) AS ws`,
    [ticketId, workspaceId],
  );
  const event = makeCommitted({ workspaceId, actorId, entity: { kind: 'ticket', id: ticketId }, type, payload,
    seq: rows[0]!.seq + 1, workspaceSeq: rows[0]!.ws + 1 });
  await applyCommitted(pool, [event]);
  return event;
}

/** Many ticket events in one `applyCommitted`, numbered after the ledger's heads like `step` (a large flow without a seq query per event). */
export async function stepMany(
  pool: Pool, specs: ReadonlyArray<{ ticketId: string; type: string; payload: Record<string, unknown>; actorId?: string }>, workspaceId = WS,
): Promise<LedgerEvent[]> {
  const ids = [...new Set(specs.map((s) => s.ticketId))];
  const { rows } = await pool.query<{ entity_id: string; seq: number }>(
    "SELECT entity_id, max(seq)::int AS seq FROM events WHERE entity_kind = 'ticket' AND entity_id = ANY ($1::text[]) GROUP BY entity_id", [ids]);
  const heads = new Map(rows.map((r) => [r.entity_id, r.seq] as const));
  const { rows: ws } = await pool.query<{ ws: number }>(
    'SELECT coalesce(max(workspace_seq), 0)::int AS ws FROM events WHERE workspace_id = $1', [workspaceId]);
  let workspaceSeq = ws[0]!.ws;
  const events = specs.map((s) => {
    const seq = (heads.get(s.ticketId) ?? 0) + 1;
    heads.set(s.ticketId, seq);
    workspaceSeq += 1;
    return makeCommitted({ workspaceId, actorId: s.actorId ?? PERSON, entity: { kind: 'ticket', id: s.ticketId }, type: s.type, payload: s.payload, seq, workspaceSeq });
  });
  await applyCommitted(pool, events);
  return events;
}

/** `start: 'backlog'` by default; `start: 'focus'` + `moves` walks it through the workflow's states; `draft` is born in the backlog. */
export async function addTicket(
  pool: Pool, o: { typeId?: string; start?: 'backlog' | 'focus'; moves?: string[]; assigneeId?: string; draft?: boolean; title?: string } = {},
): Promise<string> {
  const id = newUlid();
  await step(pool, id, 'ticket.created', { typeId: o.typeId ?? TASK, projectId: PROJECT, parentId: null, title: o.title ?? `T ${id.slice(-4)}`,
    start: o.start ?? 'backlog', ...(o.assigneeId === undefined ? {} : { assigneeId: o.assigneeId }), ...(o.draft === true ? { draft: true } : {}) });
  for (const to of o.moves ?? []) await step(pool, id, 'ticket.transitioned', { to });
  return id;
}

export const lead = (pool: Pool, source: string, target: string, label?: string) =>
  step(pool, source, 'ticket.link_added', { kind: 'leads_to', targetId: target, ...(label === undefined ? {} : { label }) });
export const unlink = (pool: Pool, source: string, target: string) => step(pool, source, 'ticket.link_removed', { kind: 'leads_to', targetId: target });
export const decide = (pool: Pool, decisionId: string, outcome: string | null, extra: Record<string, unknown> = {}) =>
  step(pool, decisionId, 'ticket.decided', { outcome, ...extra });

/**
 * The Decision loop of PS-4 (wtg2 T16): `s(done) -> a(done) -> d(Decision) ; d -[Redo]-> a` is a back edge, `d -[Ship]-> z`
 * (z in the Backlog). `d` is finished last, by a person, unless `finished: false` leaves it in Doing; `finishing` is that
 * transition's envelope (null when it was not filed).
 */
export async function loopWorld(pool: Pool, o: { finished?: boolean } = {}) {
  const s = await addTicket(pool, { start: 'focus', moves: ['doing', 'done'] });
  const a = await addTicket(pool, { start: 'focus', moves: ['doing', 'done'] });
  const d = await addTicket(pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing'] });
  const z = await addTicket(pool);
  await lead(pool, s, a);
  await lead(pool, a, d);
  await lead(pool, d, a, 'Redo');
  await lead(pool, d, z, 'Ship');
  const finishing = o.finished === false ? null : await step(pool, d, 'ticket.transitioned', { to: 'done' });
  return { s, a, d, z, finishing };
}

export async function stateOf(pool: Pool, ticketId: string): Promise<string> {
  const { rows } = await pool.query<{ state_id: string }>('SELECT state_id FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
  return rows[0]!.state_id;
}
/** The ledger rows of one type on one ticket, oldest first. */
export async function ledger(pool: Pool, ticketId: string, type: string) {
  const { rows } = await pool.query<{ actor_id: string; origin: string; payload: Record<string, unknown> }>(
    "SELECT actor_id, origin, payload FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = $2 ORDER BY seq", [ticketId, type]);
  return rows;
}
