import { ticketTypeDefSchema, type TicketTypeDef } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { Projection } from './registry.js';

/**
 * The workspace's ticket-type ladder, projected from `ticket-type.defined`
 * (Plan 3 Chain B Task 9; §8 position 3, which is why registering it INSERTS
 * into `./index.ts` rather than appending).
 *
 * ## Last definition wins — resolved on the stream position, not on arrival
 *
 * `ticket-type.defined` is last-definition-wins by design, and the naive way to
 * write that is a bare `ON CONFLICT … DO UPDATE`: whoever applies last, wins.
 * That is wrong HERE, and the reason is a property of this table's key rather
 * than of upserts.
 *
 * A ticket type's stable key is its PAYLOAD's `id`. It is not the entity id and
 * cannot be: `foundingSequence` files each definition at a fresh entity ULID
 * (`src/workspaces/bootstrap-workspace.ts`), and the envelope schema requires a
 * non-membership `entity.id` to match `ULID_REGEX`, so `epic` could never be
 * one. Two definitions of one type therefore sit on two DIFFERENT entity
 * streams.
 *
 * The registry contract says table contents must be a pure function of the
 * ledger's rows and never of cross-entity arrival interleaving — and a rebuild
 * or a verify replays with `ORDER BY entity_kind, entity_id, seq`
 * (`readLedger`). For a key one entity stream owns, that order and arrival order
 * agree. For this key they need not: canonical replay sorts two re-definitions
 * by a random-suffixed ULID, live sorted them by when they arrived. Bare
 * last-writer-wins would leave a different row after a rebuild than live holds,
 * which `tools/verify-projections.ts` reports as drift and nothing else catches.
 *
 * So the winner is the definition with the greatest `defined_workspace_seq` —
 * the event's own stored stream position, written once under
 * `UNIQUE (workspace_id, workspace_seq)` and therefore identical under both
 * orders. The `WHERE` on the `DO UPDATE` is that rule; strictly `>`, so a
 * re-delivered event is inert rather than a rewrite of itself.
 *
 * The rejected alternative was proj_workflows' shape: one row per definition
 * event, the reader taking `ORDER BY defined_workspace_seq DESC LIMIT 1`. It is
 * equally deterministic, but the consumer this table exists for is a
 * point-lookup inside the ingest transaction (`getTicketTypeDef` on the engine
 * context, wired by Task 12), and
 * proj_workflows keeps every version because the engine's version WALK needs the
 * intermediates. Nothing needs a superseded type definition, so the history
 * would be rows kept for no reader.
 */
export const ticketTypesProjection: Projection = {
  name: 'proj_ticket_types',
  tables: ['proj_ticket_types'],

  async apply(event, tx) {
    if (event.type !== 'ticket-type.defined') {
      return;
    }
    const def = ticketTypeDefSchema.parse(event.payload);
    await tx.query(
      `INSERT INTO proj_ticket_types
         (workspace_id, type_id, name, icon, rank, workflow_id, fields,
          defined_by, defined_at, defined_workspace_seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (workspace_id, type_id) DO UPDATE SET
         name = EXCLUDED.name,
         icon = EXCLUDED.icon,
         rank = EXCLUDED.rank,
         workflow_id = EXCLUDED.workflow_id,
         fields = EXCLUDED.fields,
         defined_by = EXCLUDED.defined_by,
         defined_at = EXCLUDED.defined_at,
         defined_workspace_seq = EXCLUDED.defined_workspace_seq
       WHERE EXCLUDED.defined_workspace_seq > proj_ticket_types.defined_workspace_seq`,
      [
        event.workspaceId,
        def.id,
        def.name,
        def.icon,
        def.rank,
        def.workflowId,
        JSON.stringify(def.fields),
        event.actorId,
        event.serverTime,
        event.workspaceSeq,
      ],
    );
  },

  async reset(tx) {
    await tx.query('TRUNCATE proj_ticket_types');
  },
};

/**
 * The type this workspace currently defines under this key, or null.
 *
 * The workspace clause is not decoration. A type key is an actor-chosen slug,
 * so `epic`, `task` and `bug` exist in most workspaces at once; an unscoped
 * lookup would answer with whichever workspace happened to define it and hand
 * one tenancy another's rank, workflow binding and field list. Controller ruling
 * P14 names the general shape — an id the ACTOR supplies, resolved through a
 * lookup with no tenancy predicate — and names `getTicketTypeDef(ctx, p.typeId)`
 * on the create path as an instance of it. The predicate lives here so the
 * caller cannot forget it, and Plan 3 Chain B Task 12 wired
 * `createEngineContext.getTicketTypeDef` onto it — which is what turned the
 * predicate from a precaution into the thing that refuses. The sentence this
 * replaces said the wiring was still owed and that the context "still answers
 * null for reasons of its own"; both stopped being true at that task, and the
 * cross-tenant case that proves it is in `test/engine-context.test.ts`.
 */
export async function getTicketTypeFromDb(
  db: Queryable,
  workspaceId: string,
  typeId: string,
): Promise<TicketTypeDef | null> {
  const { rows } = await db.query<{
    type_id: string;
    name: string;
    icon: string;
    rank: number;
    workflow_id: string;
    fields: unknown;
  }>(
    `SELECT type_id, name, icon, rank, workflow_id, fields
       FROM proj_ticket_types
      WHERE workspace_id = $1 AND type_id = $2`,
    [workspaceId, typeId],
  );
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  // Parsed rather than cast, as getWorkflowDefFromProjection parses its stored
  // definition: `fields` comes back from jsonb as plain JSON, and a row written
  // before a schema change should fail loudly here rather than reach a rule
  // check shaped like a TicketTypeDef and not being one.
  return ticketTypeDefSchema.parse({
    id: row.type_id,
    name: row.name,
    icon: row.icon,
    rank: row.rank,
    workflowId: row.workflow_id,
    fields: row.fields,
  });
}

/**
 * A BY-ID lookup over this workspace's whole type ladder — the plural of
 * `getTicketTypeFromDb`, asked once instead of once per key.
 *
 * Same shape and same reason as `getWorkflowDefsInForce`
 * (`./workflows.ts`): `TicketStateDeps.getTicketType(typeId)` is a by-id
 * lookup, and the reducer is the only thing that knows which id an event needs.
 * The `ticket.created` branch asks for the payload's own `typeId` TODAY, so a
 * point lookup would answer it — but "today" is a scope word, and a loader
 * that pre-selects one id answers `undefined` for any other, at which point the
 * reducer throws `unknown ticket type "…" — the engine must refuse
 * ticket.created before it reaches a projection`, blaming the door for the
 * loader's omission. A ladder is the built-ins plus a workspace's custom
 * types; handing the reducer all of it removes the question.
 *
 * Parsing is LAZY and memoized: only the types actually asked for pay
 * `ticketTypeDefSchema`.
 *
 * Workspace-scoped for the reason its singular sibling is — a type key is an
 * actor-chosen slug, so `invoice` exists in many workspaces at once.
 *
 * ## AS OF `asOfWorkspaceSeq`, and where the history comes from when this
 * table has none (E6-13, 2026-09-21)
 *
 * This table is last-definition-wins with one row per type, so on its own it
 * can only answer "what does the type say NOW". The row's
 * `defined_workspace_seq` is the stream position of the definition it holds,
 * and that number is what makes an as-of answer possible without giving the
 * table history: a row whose `defined_workspace_seq` is GREATER than the
 * event being applied is a definition that landed AFTER that event, so what
 * the table holds is provably not what the live path saw when it applied the
 * event. For exactly those types — and only those — the definition in force
 * at `asOfWorkspaceSeq` is read back from the ledger itself: the newest
 * `ticket-type.defined` for that key at or before that position, parsed by
 * the same schema this projection applied it with. A type the ledger has NO
 * definition for at that position is DROPPED from the ladder rather than left
 * at its final state, so a `ticket.created` of a type that did not yet exist
 * meets the reducer's `unknown ticket type` throw (a broken ledger, reported
 * loudly) and not a silently newer binding.
 *
 * **On the live path the ledger branch cannot run.** Ingest assigns
 * `workspace_seq` under `pg_advisory_xact_lock` per workspace and applies
 * every projection inside the event's own transaction
 * (`ledger/event-store.ts`, `lockWorkspace` and `nextWorkspaceSeq`), and this
 * projection is registered BEFORE `proj_tickets`, so when a ticket event at
 * position N is applied every row here was written by an event at a position
 * below N. The branch is reachable only by a REPLAY of an event that a later
 * redefinition post-dates — `tools/verify-projections.ts`' shadow rebuild and
 * `rebuildProjection` — which is where the answer was wrong before: the
 * rebuild resolved the NEW binding for a ticket the live path bound to the old
 * one (`DRIFT DETECTED` on a correct database) and, when the new workflow was
 * published after the ticket, threw `workflow "…" is not defined` from inside
 * the reducer, because a workflow not yet in force at the ticket's position
 * was being asked for. Both are measured in `test/verify-projections.test.ts`.
 * The verifier's `search_path` trick is what lets `events` be named
 * unqualified here: that table has no shadow copy, so it resolves to
 * `public.events` under a shadow rebuild exactly as it does live.
 *
 * Cost, stated rather than claimed away: in a replay, every ticket event that
 * precedes some later redefinition pays one extra query over the workspace's
 * ticket-type events — bounded by `events_workspace_seq_unique` (a range scan
 * of the workspace's stream up to the event's position) and by the count of
 * `ticket-type` rows, whichever the planner picks. A workspace that has never
 * redefined a type after creating a ticket pays nothing on either path.
 *
 * What this does NOT change: `proj_ticket_types` still keeps no history, its
 * primary key is untouched, and `getTicketTypeFromDb` (the engine context's
 * point lookup, whose readers are the reason the handoff priced a key change
 * as out of scope) is untouched. The plan's Open question 11 asked for a
 * history-bearing table; the ledger IS the history, and reading it only when
 * the table's row post-dates the event is what keeps this a replay-only cost.
 */
export type TicketTypeLookup = {
  get(typeId: string): TicketTypeDef | undefined;
};

type TicketTypeRow = {
  type_id: string;
  name: string;
  icon: string;
  rank: number;
  workflow_id: string;
  fields: unknown;
};

export async function getTicketTypeLadderFromDb(
  db: Queryable,
  workspaceId: string,
  asOfWorkspaceSeq: number,
): Promise<TicketTypeLookup> {
  const { rows } = await db.query<TicketTypeRow & { defined_workspace_seq: number }>(
    `SELECT type_id, name, icon, rank, workflow_id, fields, defined_workspace_seq
       FROM proj_ticket_types
      WHERE workspace_id = $1`,
    [workspaceId],
  );
  const raw = new Map<string, TicketTypeRow>();
  const parsed = new Map<string, TicketTypeDef>();
  const redefinedAfter: string[] = [];
  for (const row of rows) {
    if (row.defined_workspace_seq > asOfWorkspaceSeq) {
      redefinedAfter.push(row.type_id);
    } else {
      raw.set(row.type_id, row);
    }
  }
  if (redefinedAfter.length > 0) {
    // The definition in force at the event's position, straight from the
    // ledger, for the types whose table row post-dates the event (see the
    // docblock). Parsed EAGERLY: this branch runs only in a replay of a
    // ticket event that a later redefinition post-dates, and a payload that
    // fails the schema here is a ledger row this projection could never have
    // applied — the loud answer is the right one.
    const asOf = await db.query<{ payload: unknown }>(
      `SELECT DISTINCT ON (payload->>'id') payload
         FROM events
        WHERE workspace_id = $1
          AND entity_kind = 'ticket-type'
          AND type = 'ticket-type.defined'
          AND workspace_seq <= $2
          AND payload->>'id' = ANY($3::text[])
        ORDER BY payload->>'id', workspace_seq DESC`,
      [workspaceId, asOfWorkspaceSeq, redefinedAfter],
    );
    for (const row of asOf.rows) {
      const def = ticketTypeDefSchema.parse(row.payload);
      parsed.set(def.id, def);
    }
  }
  return {
    get(typeId) {
      const already = parsed.get(typeId);
      if (already !== undefined) {
        return already;
      }
      const row = raw.get(typeId);
      if (row === undefined) {
        return undefined;
      }
      const def = ticketTypeDefSchema.parse({
        id: row.type_id,
        name: row.name,
        icon: row.icon,
        rank: row.rank,
        workflowId: row.workflow_id,
        fields: row.fields,
      });
      parsed.set(typeId, def);
      return def;
    },
  };
}
