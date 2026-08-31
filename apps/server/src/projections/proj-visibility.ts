import {
  ticketCreatedPayload,
  ticketReparentedPayload,
  visibilitySetPayload,
} from '@gisik-nokma/domain';
import type { PoolClient } from 'pg';
import type { Projection } from './registry.js';

/**
 * Projects every ticket's resolved audience (Plan 4 Task 6) into
 * `proj_visibility`: one row per ticket, carrying what that ticket itself
 * claimed (`own_*`) and the audience that actually applies once inherit chains
 * have been walked (`resolved_*`, never `'inherit'`).
 *
 * ## The resolution rule
 *
 *   resolve(t) = (own_mode(t), own_user_ids(t)), from = t   if own_mode ≠ 'inherit'
 *              = resolve(parent(t))                          if t has a parent row
 *              = ('project', []), from = ''                  otherwise
 *
 * `resolved_from` is the AUTHORING ancestor, not the immediate parent: it is
 * copied from the parent's `resolved_from`, so a grandchild inheriting through
 * an unauthored parent names the grandparent. That is what makes the column
 * worth storing — "who decided this" is the question a UI asks, and the
 * immediate parent is usually not the answer.
 *
 * ## Why `ticket.created` re-resolves a subtree, though a new ticket has no children
 *
 * This is the correction the plan text needs, and it is not cosmetic.
 *
 * The registry contract's second clause binds: "Table contents must be a pure
 * function of the ledger's rows — never of cross-entity arrival interleaving.
 * Replay delivers canonical order (entity_kind, entity_id, seq)." Every event
 * this projection reads is filed against a TICKET, so canonical order is
 * ticket-id order: on a rebuild, ALL of one ticket's events are applied before
 * ANY of the next ticket's, whatever order they arrived in.
 *
 * A ticket's row is therefore routinely created when its parent's row does not
 * exist yet, and just as routinely a parent's row is created when its children's
 * rows are already sitting in the table. The plan text's handler resolved only
 * the new ticket ("a fresh ticket has no children, so no recursion"), which is
 * true of arrival order and false of replay. Take a grandparent G that authors
 * `workspace`, its child P which authors nothing, and P's child C, with ULIDs
 * sorting C < G < P:
 *
 *   live     created(G), set(G,'workspace'), created(P under G), created(C under P)
 *            -> C resolves through P to G: workspace / from G
 *   replay   created(C under P)   — P absent, so C defaults to project / from ''
 *            created(G); set(G,'workspace') — G has no children in the table yet
 *            created(P under G)  — P resolves to workspace, and C IS NOT VISITED
 *            -> C left at project / from ''
 *
 * A set difference on a table nobody corrupted, which is exactly what
 * `verify-projections`' EXCEPT diff reports as drift — and a `rebuildProjection`
 * run would "repair" live into the wrong one. The plan's own determinism test
 * cannot see it: it replays the SAME arrival order it applied, so it asserts
 * that `apply` is a function, which it always was.
 *
 * The fix is to make every handler restore one table-wide INVARIANT rather than
 * apply a delta:
 *
 *   for every row r:  r.resolved_* = resolve(r), evaluated against the rows
 *                     currently in the table
 *
 * `reResolveSubtree` restores it for the row that changed and everything below
 * it that inherits, pruning at authored descendants (nothing above an authored
 * node can change what its subtree resolves to). Applied on all three handlers
 * — creation included — the invariant holds after every event, and an invariant
 * that holds plus an acyclic (own_mode, own_user_ids, parent_id) graph
 * determines every resolved row uniquely, by induction on ancestor-chain depth.
 * So the final table is a function of the ledger's rows and not of their order.
 *
 * ## Which entity owns which key
 *
 * The rule Task 4 earned: a handler may only write keys its own entity totally
 * orders. `ticket.created`, `ticket.reparented` and `visibility.set` are all
 * filed against the ticket (`../../../packages/domain/src/vocabulary.ts`), so
 * each row's AUTHORED columns have exactly one writer.
 *
 * `visibility.set` is keyed on `event.entity.id`, NOT on `payload.ticketId`,
 * though the payload restates it. The two agreeing is Task 9's refusal to
 * enforce and Task 9 has not run: until it does, an event filed against ticket A
 * whose payload names ticket B would have ticket A's stream writing ticket B's
 * row — the cross-entity write that makes live and replay disagree. Keyed on the
 * entity, a disagreeing payload is merely a claim about the wrong ticket that
 * lands on the ticket it was filed against; keyed on the payload, it is drift.
 * The payload is still PARSED with the domain's own schema (the
 * `membershipsProjection` precedent), because `mode` and `userIds` must be
 * validated — a shape this projection cannot honestly store throws here rather
 * than being silently written as `undefined`.
 *
 * The RESOLVED columns are written across entities by design — that is what
 * inheritance means — and the invariant above is the whole of why that is safe.
 *
 * ## Determinism
 *
 * Nothing here reads a clock or a random source. `seq` is the event's stored
 * per-entity sequence, and only the row's own ticket stream writes it.
 */

/** The audience an unauthored root falls back to (spec §6: the workspace default). */
const ROOT_DEFAULT_MODE = 'project';

type OwnMode = 'workspace' | 'project' | 'explicit' | 'inherit';
type ResolvedMode = 'workspace' | 'project' | 'explicit';

type VisibilityRow = {
  ticket_id: string;
  parent_id: string | null;
  own_mode: OwnMode;
  own_user_ids: string[];
  resolved_mode: ResolvedMode;
  resolved_user_ids: string[];
  resolved_from: string;
};

async function readRow(tx: PoolClient, ticketId: string): Promise<VisibilityRow | null> {
  const result = await tx.query<VisibilityRow>(
    `SELECT ticket_id, parent_id, own_mode, own_user_ids, resolved_mode, resolved_user_ids, resolved_from
     FROM proj_visibility WHERE ticket_id = $1`,
    [ticketId],
  );
  return result.rows[0] ?? null;
}

/**
 * Restores the invariant for ONE row: own mode wins, else the parent's already
 * restored resolution, else the root default. A missing parent row is treated
 * as absent rather than as an error — under canonical replay a child is
 * routinely applied before its parent exists, and the parent's own creation
 * re-resolves it.
 */
async function resolveOne(tx: PoolClient, ticketId: string): Promise<void> {
  const row = await readRow(tx, ticketId);
  if (row === null) {
    return;
  }

  let resolvedMode: ResolvedMode;
  let resolvedUserIds: string[];
  let resolvedFrom: string;

  if (row.own_mode !== 'inherit') {
    resolvedMode = row.own_mode;
    // Only 'explicit' names people; the domain schema refuses userIds on the
    // other modes, so anything else here would be a list nothing ever reads.
    resolvedUserIds = row.own_mode === 'explicit' ? row.own_user_ids : [];
    resolvedFrom = row.ticket_id;
  } else {
    const parent = row.parent_id === null ? null : await readRow(tx, row.parent_id);
    if (parent === null) {
      resolvedMode = ROOT_DEFAULT_MODE;
      resolvedUserIds = [];
      resolvedFrom = '';
    } else {
      resolvedMode = parent.resolved_mode;
      resolvedUserIds = parent.resolved_user_ids;
      // The parent's AUTHOR, not the parent: inheritance names whoever decided.
      resolvedFrom = parent.resolved_from;
    }
  }

  await tx.query(
    `UPDATE proj_visibility
     SET resolved_mode = $2, resolved_user_ids = $3, resolved_from = $4
     WHERE ticket_id = $1`,
    [ticketId, resolvedMode, resolvedUserIds, resolvedFrom],
  );
}

/**
 * Restores the invariant for `ticketId` and every descendant that inherits,
 * pruning at any child with an authored mode: an authored subtree resolves from
 * its own claim, so nothing above it can change what it sees.
 *
 * The prune is an OPTIMISATION, and saying otherwise would be a lie a reader
 * could act on. Deleting it changes no row: `resolveOne` on an authored node
 * re-derives that node from its own mode, which is what it already held, and its
 * descendants then inherit the same unchanged value. Mutating the prune away
 * leaves all 26 tests green, and that is correct rather than a gap — what the
 * prune buys is work, not truth. The PROPERTY "an authored subtree cannot be
 * reached from above" lives in `resolveOne`'s own-mode branch, and mutating THAT
 * away reddens eleven tests.
 *
 * `visited` is a per-call local, never module state: a `parent_id` cycle would
 * otherwise recurse forever. The command side is expected to refuse a cycle;
 * this projection replays whatever the ledger holds, so it terminates on one
 * rather than trusting that it cannot arrive.
 *
 * Termination is ALL it provides, and the difference matters. A cycle gives the
 * invariant above several fixpoints, and which one the table settles in depends
 * on arrival order — so order-independence, argued and tested here for an
 * acyclic parent graph, is genuinely FALSE once a loop exists. Measured on this
 * branch: `created(G), set(G,'workspace'), created(A,G), created(B,A),
 * reparented(A,B)` leaves live at `workspace`/G for both A and B and a rebuild
 * at `project`/'' for both. Nothing on this branch refuses the cycle-creating
 * reparent — Plan 3's command does not exist and the gate does not look at
 * ancestry. Recorded as case 6.58 with its owner rather than fixed here; the
 * shape of the fix is for `resolveOne` to walk up to the nearest authored
 * ancestor instead of reading the parent's stored resolution, which makes the
 * answer a function of the current graph whether or not it has a loop.
 */
export async function reResolveSubtree(
  tx: PoolClient,
  ticketId: string,
  visited: Set<string> = new Set(),
): Promise<void> {
  if (visited.has(ticketId)) {
    return;
  }
  visited.add(ticketId);

  await resolveOne(tx, ticketId);

  const children = await tx.query<{ ticket_id: string; own_mode: OwnMode }>(
    'SELECT ticket_id, own_mode FROM proj_visibility WHERE parent_id = $1 ORDER BY ticket_id',
    [ticketId],
  );
  for (const child of children.rows) {
    if (child.own_mode === 'inherit') {
      await reResolveSubtree(tx, child.ticket_id, visited);
    }
  }
}

/**
 * Named `projVisibility` rather than `visibilityProjection`, which is what the
 * three siblings in this directory would suggest: the plan's Interfaces section
 * publishes this exact identifier as the cross-task contract Task 7's seed
 * helpers import. One name, not two — an alias would leave a reader asking
 * which of them is the real one.
 */
export const projVisibility: Projection = {
  name: 'proj_visibility',
  tables: ['proj_visibility'],

  async apply(event, tx) {
    switch (event.type) {
      case 'ticket.created': {
        const payload = ticketCreatedPayload.parse(event.payload);
        await tx.query(
          `INSERT INTO proj_visibility
             (ticket_id, workspace_id, project_id, parent_id, own_mode, own_user_ids,
              resolved_mode, resolved_user_ids, resolved_from, seq)
           VALUES ($1, $2, $3, $4, 'inherit', '{}', $6, '{}', '', $5)
           ON CONFLICT (ticket_id) DO NOTHING`,
          [
            event.entity.id,
            event.workspaceId,
            payload.projectId,
            payload.parentId,
            event.seq,
            // A placeholder the re-resolution below overwrites; resolved_mode is
            // NOT NULL and has no default, so the insert must name something.
            ROOT_DEFAULT_MODE,
          ],
        );
        // NOT resolveOne. Under canonical replay this ticket's children may
        // already be in the table, resolved against a parent that did not yet
        // exist — see the docblock. They are visited here or never.
        await reResolveSubtree(tx, event.entity.id);
        return;
      }

      case 'ticket.reparented': {
        // The field is `newParentId`. The plan text says `parentId`, and its own
        // fixture is wrong the same way, so the tests would have passed while a
        // real Plan 3 event left parent_id unchanged for ever.
        const payload = ticketReparentedPayload.parse(event.payload);
        await tx.query(
          'UPDATE proj_visibility SET parent_id = $2, seq = $3 WHERE ticket_id = $1',
          [event.entity.id, payload.newParentId, event.seq],
        );
        // The ticket now inherits from a different chain, and everything
        // inheriting FROM it follows.
        await reResolveSubtree(tx, event.entity.id);
        return;
      }

      case 'visibility.set': {
        const payload = visibilitySetPayload.parse(event.payload);
        await tx.query(
          'UPDATE proj_visibility SET own_mode = $2, own_user_ids = $3, seq = $4 WHERE ticket_id = $1',
          // event.entity.id, never payload.ticketId — see the docblock.
          [event.entity.id, payload.mode, payload.userIds ?? [], event.seq],
        );
        await reResolveSubtree(tx, event.entity.id);
        return;
      }

      default:
        // Not a visibility event — a projection ignores what it does not read.
        return;
    }
  },

  async reset(tx) {
    await tx.query('TRUNCATE proj_visibility');
  },
};
