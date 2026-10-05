import {
  TICKET_EVENT_TYPES,
  foldTicketEvent,
  keepConfirmedPeriods,
  membershipId,
  type EventEnvelope,
  type PublishedWorkflowDef,
  type SubmittedEvent,
  type TicketState,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import { buildMemoryContext, type EngineContext } from '@gisik-nokma/rule-engine';
import type { SyncStorage } from '../storage/storage.js';
import type { Replica } from '../replica/replica.js';

export type LocalContextDeps = { storage: SyncStorage; replica: Replica };

/** What the reducer folds. The other three ticket-entity types throw in it — see `buildPendingOverlay`. */
const FOLDING_TICKET_TYPES: readonly string[] = TICKET_EVENT_TYPES;

/**
 * Confirmed ticket state with this device's own queued claims folded on top:
 * the world as the replica honestly believes it will be once the outbox lands.
 *
 * THREE MAPS RATHER THAN ONE, because the pre-check and the UI ask different
 * questions of the same fold and neither may be answered with the other's data:
 *
 * - `states` — what a RULE reads. Confirmed, overlaid.
 * - `queuedEventIds` — which claims are still in transit, per ticket, in
 *   position order. Present for EVERY queued ticket-entity event, including the
 *   three the reducer does not fold: "nothing is in transit for this ticket" and
 *   "nothing in transit changed its state" are different sentences.
 * - `confirmed` — the ids that exist as SETTLED fact. This is the set the
 *   honesty pin rests on: a ticket in `states` but not in `confirmed` exists
 *   only as a claim, and no settled surface may list it.
 * - `unfoldable` — tickets whose queued claims the reducer could NOT fold. See
 *   `buildPendingOverlay`; their entry in `states`, if any, is confirmed state
 *   or a partial fold, and must not be shown as a completed pending reading.
 */
export type PendingOverlay = {
  states: Map<string, TicketState>;
  queuedEventIds: Map<string, string[]>;
  confirmed: Set<string>;
  unfoldable: Set<string>;
};

/**
 * The provisional `seq` a queued claim folds under.
 *
 * `applyTicketEvent` writes `env.seq` in exactly ONE place — the transitions log
 * entry a `ticket.transitioned` appends (`domain/src/ticket-state.ts:186`) — and
 * require-different-user sorts a COPY of that log by ascending `seq` at the
 * point of use rather than trusting array order. So the only property a
 * provisional position must hold is that it sits above every seq the confirmed
 * log already carries; the highest entry in the state itself is therefore the
 * base, and no read of `events` or `snapshots` is needed to compute it.
 *
 * These numbers are NOT ledger positions and are never written to `events`: the
 * server assigns the real ones when the claim commits, and the replica then
 * refolds from the arriving envelope.
 */
function provisionalSeqBase(state: TicketState | undefined): number {
  if (state === undefined) return 0;
  return state.transitions.reduce((highest, entry) => Math.max(highest, entry.seq), 0);
}

/**
 * ONE overlay fold, TWO consumers — the pre-check context below and the outbox's
 * `pendingFor` / `pendingCreatedTickets`. They must not have separate folds: a
 * pre-check that judged a claim against a different pending world than the one
 * the board renders would teach the user to trust a preview of a state nobody
 * is in.
 *
 * FILTER BEFORE FOLDING, for the reason `replica.ts`'s `refoldTicket` states at
 * length: thirteen event types bind to `entityKind: 'ticket'` and
 * `applyTicketEvent` folds ten, throwing on the rest. A client cannot MINT the
 * other three (`claim.contested`, `claim.contested_resolved` are server-filed
 * and `visibility.set` is not a ticket claim), so today the filter is a guard
 * rather than a live path here — unlike in the replica, where bootstrap
 * backfills `claim.contested` unconditionally. It is stated as a guard on
 * purpose: the outbox stores whatever it is handed, and the day a client is
 * allowed to queue one of the three, the alternative to this line is a throw
 * inside a pre-check.
 *
 * AND THE REDUCER CAN STILL THROW ON A TYPE IT DOES FOLD, which is why the fold
 * below is wrapped. `applyTicketEvent` throws by design on an unknown ticket
 * type or an unresolvable workflow — *"reaching one of those in replay means
 * ledger integrity is broken"* — and a replica can reach exactly that state
 * honestly: `revokeScope` empties `workflows` and `ticket_types` while
 * **outbox rows deliberately stay** (`replica.ts`: *"they are the user's claims
 * in transit and must go up, contest, and surface — nothing silently
 * vanishes"*). Unwrapped, the first `enqueue` after a scope revocation throws
 * out of every pre-check on the device, offline, with no way back.
 *
 * THE OTHER DOOR THAT FOLDS THIS REDUCER DOES **NOT** WRAP IT, and the asymmetry
 * is deliberate rather than an oversight — named here because it was found by
 * reading these two docblocks side by side and finding only one of them written.
 * `replica.ts`'s `refoldTicket` folds the same reducer against the same
 * `buildLocalDeps` object with no catch, so the same revocation race takes the
 * whole arrival down (case 12.155, `test/recorded-hazards.test.ts`). That door
 * is machine-driven and its contract is per-arrival rollback; this one is a
 * user's offline action and must not brick the device. `refoldTicket`'s own
 * docblock carries the full statement and the owner.
 *
 * So a claim that cannot be folded stops that ticket's fold and names the
 * ticket in `unfoldable`. The LAST GOOD state stays in `states` — confirmed, or
 * as far as the fold got — because the rules must still see the ticket that
 * really exists; answering `null` for a confirmed ticket would manufacture
 * `hierarchy.unknown-parent` refusals for parents that are plainly there. What
 * `unfoldable` buys is the other half: `pendingFor` refuses to present a
 * partial fold as the pending reading, so the overlay never claims to have
 * applied a claim it could not apply.
 */
export async function buildPendingOverlay(deps: LocalContextDeps): Promise<PendingOverlay> {
  const { storage, replica } = deps;

  const states = new Map<string, TicketState>();
  const confirmed = new Set<string>();
  for (const row of await storage.all('SELECT ticket_id, state FROM tickets')) {
    const ticketId = row.ticket_id as string;
    states.set(ticketId, JSON.parse(row.state as string) as TicketState);
    confirmed.add(ticketId);
  }

  const queuedEventIds = new Map<string, string[]>();
  const rows = await storage.all(
    "SELECT entity_id, envelope FROM outbox WHERE entity_kind = 'ticket' AND status = 'queued' ORDER BY position",
  );
  // ONE deps read for the whole fold, and it is the replica's own
  // (`buildLocalDeps` over the `workflows` / `ticket_types` tables) — the same
  // object `refoldTicket` reduces confirmed state with. A second definition
  // source here is how a pending fold starts disagreeing with the confirmed one.
  const localDeps = await replica.buildDeps();
  const nextSeq = new Map<string, number>();
  const unfoldable = new Set<string>();

  for (const row of rows) {
    const ticketId = row.entity_id as string;
    const submitted = JSON.parse(row.envelope as string) as SubmittedEvent;
    queuedEventIds.set(ticketId, [...(queuedEventIds.get(ticketId) ?? []), submitted.id]);
    if (!FOLDING_TICKET_TYPES.includes(submitted.type)) continue;
    if (unfoldable.has(ticketId)) continue;

    const seq = (nextSeq.get(ticketId) ?? provisionalSeqBase(states.get(ticketId))) + 1;
    nextSeq.set(ticketId, seq);
    // `serverTime: clientTime` — the claim has no server clock yet and inventing
    // one would put a time on the ticket that no server ever stamped. The device
    // clock is what this claim honestly has, and the field claims it writes carry
    // both clocks, so the provenance stays readable as "this device said so".
    const env: EventEnvelope = { ...submitted, serverTime: submitted.clientTime, seq };
    try {
      const before = states.get(ticketId);
      const next = foldTicketEvent(before, env, localDeps);
      // A purged ticket's redacted creation folds to nothing (trash Plan 2 D7):
      // no state, and — unlike a throw — not "unfoldable" either. The periods
      // stay the confirmed ones (wtg2 T9, ES-4): the device clock above would
      // otherwise open or close a work period no server stamped.
      if (next !== undefined) states.set(ticketId, keepConfirmedPeriods(before, next));
    } catch {
      unfoldable.add(ticketId);
    }
  }

  return { states, queuedEventIds, confirmed, unfoldable };
}

/**
 * The shared rule engine, pointed at this replica: the same `evaluateEvent`, the
 * same rules, the same reasons, answered offline and instantly (spec §5).
 *
 * ## It is `buildMemoryContext`, seeded — not a third context
 *
 * `packages/rule-engine/src/memory-context.ts` exists for exactly this job and
 * says so in its own docblock: *"Every ticket event here goes through
 * `applyTicketEvent`, the same function `proj_tickets` and Plan 10's offline
 * replica fold with, so a rule cannot answer one way in a unit test and another
 * on the server."* Hand-rolling a fourth `EngineContext` here — which is what
 * the plan's snippet does — would be a pre-check that CAN disagree with the
 * server, and a wrong instant answer is worse than no instant answer, because it
 * teaches the user to trust a verdict the server will overturn.
 *
 * (It is also not the fixture harness. That one imports `node:fs` at module top
 * level and ships behind `@gisik-nokma/rule-engine/fixtures`; reaching for it
 * here would pull `node:fs` into the Expo and Tauri bundles. The two in-memory
 * contexts stay separate — `memory-context.ts` records why.)
 *
 * ## Every map is seeded from the replica's TABLES, never re-derived from `events`
 *
 * The invariant is worth stating because the tidier-looking call is wrong.
 * `revokeScope` on a whole workspace does `DELETE FROM workflows` and
 * `DELETE FROM ticket_types` but leaves the `workflow.defined` /
 * `ticket-type.defined` rows standing in `events` (they are deleted by entity
 * id, and only ticket ids are walked). So a context that rebuilt definitions by
 * replaying the event log would resurrect exactly the definitions the replica
 * deliberately purged — and answer for a workspace this device is no longer in.
 * Sourcing from `workflows` / `ticket_types` is also what makes this context and
 * `buildLocalDeps` read the same rows, so the engine and the reducer cannot
 * disagree about what a workflow means.
 *
 * The same reasoning is why `buildMemoryContext` is called with NO events: the
 * replica has already folded refresh-on-publish through
 * `foldTicketsOntoVersion` / `foldSnapshotForward`, and feeding it
 * `workflow.defined` events would install a SECOND fold authority over the same
 * tickets. Its input is empty today; it would stop being empty the first time
 * someone reordered the seeding, and the disagreement would be silent.
 *
 * Ticket state cannot be replayed from `events` for a second reason that is
 * fatal rather than tidy: a bootstrapped ticket's history is TRUNCATED by its
 * snapshot, so a from-scratch replay of what this device holds either throws (no
 * `ticket.created` at the head) or folds a partial ticket. The confirmed states
 * in the `tickets` table are already `applyTicketEvent`'s own output over
 * snapshot-plus-tail; this context stands on them.
 *
 * ## A SNAPSHOT context — build one per evaluation, never hold one
 *
 * Everything above is read once, here, so one verdict reads one world rather
 * than 2–6 independently-timed reads. The consequence is the contract: a context
 * held across an `enqueue` answers from a world that has since moved, and the
 * ordered pair (queue the parent's reopen, then create the child under it) would
 * fail because the second evaluation could not see the first claim. `enqueue`
 * therefore builds a fresh one every time. This is why the signature is `async`
 * where the plan's is not — recorded as a deviation.
 */
export async function buildLocalEngineContext(deps: LocalContextDeps): Promise<EngineContext> {
  const { storage, replica } = deps;

  // EVERY version, ascending — `getWorkflowDef(scope, id, version)` answers an
  // exact version when a forward walk asks for one, and the latest otherwise.
  // A store that kept only the latest could not answer the first question at
  // all; `local-deps.ts` says the same thing about the same table.
  const workflows = (await storage.all('SELECT def FROM workflows ORDER BY workflow_id, version')).map(
    (row) => JSON.parse(row.def as string) as PublishedWorkflowDef,
  );
  const memory = buildMemoryContext(workflows, []);

  for (const row of await storage.all('SELECT def FROM ticket_types')) {
    const def = JSON.parse(row.def as string) as TicketTypeDef;
    memory.ticketTypes.set(def.id, def);
  }

  // Seeding the maps the returned closures read, rather than passing events:
  // `MemoryContext` exposes `tickets` / `ticketTypes` as its public surface and
  // its `getEntityState` / `getChildrenStates` read those very Map objects, so a
  // post-construction `set` is visible to them. That is what this rests on, and
  // it is stated because it is the one non-obvious step in the file.
  const overlay = await buildPendingOverlay(deps);
  for (const [ticketId, state] of overlay.states) memory.tickets.set(ticketId, state);

  const me = await replica.getMe();

  return {
    /**
     * Tickets and ticket-types delegate. `membership` is answered here because
     * `buildMemoryContext` has no membership store at all and a bare `null` from
     * it would MANUFACTURE a refusal: `restrict-to` with `roles` reads exactly
     * this door, and an absent membership makes an admin look like a stranger.
     *
     * Only the actor's own membership, and only from bootstrap's `me`: it is the
     * one membership a replica holds, and it is the only one any rule asks for —
     * `restrict-to` looks up `membershipId(env.workspaceId, env.actorId)` and
     * nothing else. Somebody else's id answers `null`, which is the honest
     * answer: this device does not know their role. A guess there would be a
     * refusal, or an accept, invented out of an absence.
     */
    async getEntityState(kind, id) {
      if (kind !== 'membership') return memory.getEntityState(kind, id);
      if (me === null) return null;
      // `${workspaceId}:${userId}` (coordination decision 5). Split on the LAST
      // colon so a workspace id that ever grows one does not silently re-cut the
      // pair; both halves are ULIDs today and neither contains a colon.
      const cut = id.lastIndexOf(':');
      if (cut < 0) return null;
      const workspaceId = id.slice(0, cut);
      const userId = id.slice(cut + 1);
      if (userId !== me.userId) return null;
      return { kind: 'membership', id: membershipId(workspaceId, userId), workspaceId, userId, role: me.workspaceRole };
    },

    // Direct children, INCLUDING children that exist only as queued
    // `ticket.created` claims — they are in `memory.tickets` because the overlay
    // put them there, so the parent-terminal invariant counts a child this
    // device has claimed but not yet sent. It has to: the alternative is
    // pre-checking a terminal move as legal and watching the server refuse it
    // the moment the outbox drains.
    getChildrenStates: memory.getChildrenStates,
    getWorkflowDef: memory.getWorkflowDef,
    getTicketTypeDef: memory.getTicketTypeDef,

    /**
     * The local `contests` table. `getContest` is OPTIONAL on `EngineContext`
     * precisely so contexts that predate contests still typecheck, and the
     * contest evaluators THROW rather than refuse when it is absent — a context
     * that cannot see contests has answered nothing about the world. The replica
     * has a contests table, so this one answers.
     */
    async getContest(contestedEventId) {
      const rows = await storage.all('SELECT ticket_id, resolved FROM contests WHERE contested_event_id = ?', [
        contestedEventId,
      ]);
      if (rows.length === 0) return null;
      return { ticketId: rows[0]!.ticket_id as string, resolved: Number(rows[0]!.resolved) === 1 };
    },
  };
}
