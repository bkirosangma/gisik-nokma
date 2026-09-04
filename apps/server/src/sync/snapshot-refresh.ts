import type { PoolClient } from 'pg';
import {
  foldTicketToWorkflowVersion,
  workflowDefinedPayloadSchema,
  type LedgerEvent,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import { overwriteSnapshot } from '../ledger/snapshot-store.js';
import { buildLedgerDeps, readWorkflowVersions } from './ledger-deps.js';
import { foldTicketHead } from './snapshot-writer.js';

/**
 * What one refresh did, per ticket. Returned rather than logged because a
 * SKIP is the interesting half and there is no logger in the ingest
 * transaction to put it in — see the wiring note in `ingest-service.ts`.
 */
export type SnapshotRefreshOutcome = {
  /** Tickets whose head snapshot now stands at the published version. */
  rewritten: Array<{ ticketId: string; seq: number }>;
  /** Tickets left with the snapshot they had, and the fold error that left them there. */
  skipped: Array<{ ticketId: string; reason: string }>;
};

const EMPTY: SnapshotRefreshOutcome = { rewritten: [], skipped: [] };

/**
 * REFRESH ON PUBLISH, SNAPSHOT DOOR. A `workflow.defined` re-snapshots every
 * ticket standing on an older version of that workflow, at the ticket's own
 * stream head, holding the state folded forward onto the version just
 * published.
 *
 * ## Why re-snapshot at the head, and why the two obvious repairs are worse
 *
 * A snapshot's `state` is a `TicketState` folded under whatever workflow
 * version was current when the snapshot pass ran, and until this module nothing
 * invalidated it when a new version was published. The damage is NOT mainly the
 * stale snapshot: it is the TAIL. `GET /v1/sync/bootstrap` serves the snapshot
 * plus every event above its seq, and one of those can be a `ticket.transitioned`
 * INTO a state the new version dropped — history, legal when it was written.
 * A replica replays that tail against the definitions it now holds and
 * `applyTicketEvent` throws `workflow "…" has no state "doing"`, taking the
 * whole `loadBootstrap` transaction with it. The server's own background pass
 * throws on the same event for the same reason.
 *
 * - **Deleting the superseded snapshot** makes bootstrap serve the ticket's
 *   FULL history, which contains that same transition EARLIER. The throw is
 *   identical and a full replay has been paid for it.
 * - **Version-stamping the row and refusing to serve a stale one** degenerates
 *   to the same path: refusing to serve it is serving full history.
 * - **Folding the snapshot forward at the serving end** — which the replica
 *   already does, `packages/sync-client/src/replica/replica.ts` — repairs the
 *   snapshot and leaves the tail event untouched. That file records the
 *   conclusion in its own words: *"No client-side fold can repair it, because
 *   the fix is a snapshot ABOVE the offending event."*
 *
 * Writing the folded state at the PREVIOUS snapshot's seq is not a shortcut
 * past the replay either: it leaves the offending event above the snapshot, so
 * it fixes nothing. The state has to be at the head, and getting it there means
 * folding the tail.
 *
 * ## One fold, not two
 *
 * The resume-and-replay is `foldTicketHead` in `snapshot-writer.ts`, shared
 * with the background pass; the version walk is `foldTicketToWorkflowVersion`
 * in `@gisik-nokma/domain`, THE one version walk, shared with `proj_tickets`'s
 * refresh-on-publish, the rule engine and the offline replica. Nothing here
 * re-implements either. Two mechanisms that must agree about the same fold is
 * the shape this repo keeps being bitten by.
 *
 * ## The deps are as-of, and that is load-bearing
 *
 * `buildLedgerDeps(..., { belowWorkspaceSeq: event.workspaceSeq })` — the
 * definitions as they stood immediately BEFORE this publish. With the newest
 * definitions instead, folding the tail hits the very throw this module exists
 * to remove, on the very tickets it exists to repair.
 *
 * That bound is sufficient rather than merely convenient, by induction: this
 * runs on EVERY version-raising publish, so after the first one a ticket's
 * snapshot already sits at or above the previous publish and the tail it
 * resumes over cannot span a version boundary at all. The base case — a
 * database that already holds a tail spanning an older publish when this ships
 * — is the SKIP path below.
 *
 * ## Why this is NOT a projection
 *
 * `proj_tickets` does the analogous fold for its own table from inside
 * `ticketsProjection.apply`, and putting this beside it would be the obvious
 * placement. It is forbidden: `snapshots` is not a `proj_` table, so
 * `verify-projections.ts` makes no shadow copy of it, and with
 * `search_path = verify_shadow, public` an unqualified `snapshots` write from
 * inside a projection resolves to **public.snapshots and writes LIVE during a
 * verify** — the exact escape that file's own comment warns about. Hence the
 * ingest wiring instead.
 *
 * ## Ordering: this runs BEFORE the projection loop, and that is not arbitrary
 *
 * The candidate query is `workflow_version < target.version` against
 * `proj_tickets` — the same row set `refreshTicketsForWorkflow` selects. That
 * projection runs in the same transaction and sets those rows TO
 * `target.version`. Run after it, this query matches zero rows and the whole
 * module is a silent no-op.
 *
 * Silent, but NOT unobserved. This sentence used to end "…a silent no-op that
 * every test still passes", and that second half was false the day it was
 * written — the test file added in the same commit as this module pins the
 * ordering. *Measured 2026-09-04: the `refreshSnapshotsForWorkflowPublish` call
 * in `ingest-service.ts` moved to sit AFTER the projection loop and nothing else
 * changed — `Test Files 2 failed (2)`, `Tests 4 failed (4)`; 12.156, 12.157 and
 * 12.159 all on `applyTicketEvent: workflow "…" has no state "doing"` and 12.158
 * on the row list.* Every case that pins this module reds, which is what a
 * no-op means here. What a reader must not carry away is that the ordering is
 * unguarded; what stays true is that getting it wrong is a silence rather than
 * an error, which is why the guard has to be a test and cannot be a throw.
 *
 * `ingest-service.ts` calls this immediately after `insertEvent` and before the
 * projections; the ledger read this needs is already satisfied there, because
 * `insertEvent` has landed the new version and `belowWorkspaceSeq` excludes it
 * again on purpose.
 *
 * `proj_tickets` supplies the ticket IDS only. The `state` is folded from the
 * ledger through `foldTicketHead`, never read from that table — the
 * equivalence `ledger-deps.ts` exists to protect.
 *
 * ## What this does NOT do, enumerated
 *
 * - **It does not fail the publish.** Each ticket is folded inside a SAVEPOINT
 *   and a throw rolls back that ticket alone. A fold can genuinely throw on
 *   real data — a hole in the version chain, or a tail that already spans an
 *   older state-dropping publish from before this module shipped — and letting
 *   it escape would turn publishing a workflow version into a 500 with the
 *   ledger append rolled back. That trades a broken bootstrap for a broken
 *   publish. The ticket keeps its stale snapshot and appears in `skipped`.
 * - **A skip is silent on the live path.** `commitOne` has no logger and
 *   discards this result. The outcome is returned so a caller and the tests can
 *   see it; wiring it to a log is whoever adds logging to ingest.
 * - **It does not repair a ticket it never sees.** Candidates come from
 *   `proj_tickets`, so a workspace whose projections have been reset but not
 *   rebuilt refreshes nothing.
 * - **It does not touch other entity kinds.** `snapshots` is keyed by
 *   `entity_kind` and only `'ticket'` is ever written; no other reducer exists.
 * - **It does not re-snapshot a ticket already at the published version.** The
 *   SQL guard is `workflow_version < target.version`, the monotone guard
 *   `foldTicketToWorkflowVersion` holds independently. A ticket at or above the
 *   target has nothing to fold.
 * - **It folds a ticket with NO prior snapshot from event 1, not from a tail.**
 *   `foldTicketHead` reads `readLatestSnapshot` first and binds its tail read
 *   `afterSeq = previous?.seq ?? 0`, so where there is no row the "tail" IS the
 *   ticket's whole stream. `SNAPSHOT_MIN_EVENTS` is 20 and the background pass
 *   writes nothing below it, so any ticket under twenty events that has not yet
 *   met a version-raising publish is in this case. It is a FIRST-publish cost per
 *   ticket rather than a standing one: this door leaves a row at that ticket's
 *   head, so its next publish resumes from there — the same induction the
 *   `belowWorkspaceSeq` section above runs, with 12.159's fixture as its base
 *   case. The cost is deliberate, and the saving that suggests itself is a
 *   regression: a ticket with no snapshot is served its FULL history by
 *   bootstrap, and that history holds the offending `ticket.transitioned` too —
 *   it needs a snapshot above that event MORE than a ticket that already has
 *   one, not less. It is the same argument this docblock makes above against
 *   DELETING a superseded snapshot, reached from the other end. *Measured
 *   2026-09-04 with `AND EXISTS (SELECT 1 FROM snapshots …)` added to the
 *   candidate query below — the narrowing an outside review proposed — `Tests 1
 *   failed | 3 passed (4)`: 12.159 throwing `applyTicketEvent: workflow "…" has
 *   no state "doing"` while 12.156–12.158, every one of which uses a ticket that
 *   HAS a snapshot, stayed green.*
 * - **It therefore writes rows the background pass would not.** Measured in
 *   12.159: a ticket holding two events comes out of a publish with a snapshot
 *   at seq 2, eighteen events below the threshold whose whole purpose is to keep
 *   such rows out of the table. That is a CONSEQUENCE of the bullet above rather
 *   than a second decision — the row is the repair — and a `minEvents` guard
 *   bolted onto this door to spare the writes would reopen the same throw by a
 *   second road.
 * - **It is unbounded in the number of tickets.** One fold and one row write per
 *   affected ticket, inside the publish's transaction. That is the same row set
 *   `refreshTicketsForWorkflow` already updates there, but each row costs a
 *   replay rather than an UPDATE — a FULL replay wherever the ticket had no
 *   snapshot to resume from. Nothing here batches or yields.
 */
export async function refreshSnapshotsForWorkflowPublish(
  client: PoolClient,
  event: LedgerEvent,
): Promise<SnapshotRefreshOutcome> {
  if (event.type !== 'workflow.defined') return EMPTY;
  const target = workflowDefinedPayloadSchema.parse(event.payload);

  const { rows } = await client.query<{ ticket_id: string }>(
    `SELECT ticket_id FROM proj_tickets
      WHERE workspace_id = $1 AND workflow_id = $2 AND workflow_version < $3
      ORDER BY ticket_id`,
    [event.workspaceId, target.id, target.version],
  );
  if (rows.length === 0) return EMPTY;

  const deps = await buildLedgerDeps(client, event.workspaceId, {
    belowWorkspaceSeq: event.workspaceSeq,
  });
  // Intermediate versions once for the whole batch, never once per ticket, and
  // `null` rather than `undefined` for one the ladder cannot supply: that is
  // `foldStateIdForward`'s contract, and it is what makes a HOLE in the version
  // chain report as a hole instead of as an unmapped drop.
  const ladder = await readWorkflowVersions(client, event.workspaceId, target.id);
  const getVersion = (version: number): WorkflowDef | null => ladder.get(version) ?? null;

  const outcome: SnapshotRefreshOutcome = { rewritten: [], skipped: [] };
  for (const row of rows) {
    // A SAVEPOINT and not a bare try/catch. A JS throw out of the reducer
    // leaves the transaction healthy, but a SQL error does not — Postgres
    // aborts the whole transaction and every later statement fails with
    // "current transaction is aborted", so a catch-and-continue without this
    // would turn one bad ticket into a failed publish anyway, by a road nobody
    // would find.
    await client.query('SAVEPOINT snapshot_refresh');
    try {
      const head = await foldTicketHead(client, row.ticket_id, deps);
      if (head === null) {
        await client.query('RELEASE SAVEPOINT snapshot_refresh');
        continue;
      }
      // The rebound case: `proj_tickets` says this ticket is on `target.id`,
      // the ledger fold says otherwise. Fold nothing — its head state is
      // already correct in its own workflow — but still snapshot it at head,
      // which is what keeps the tail clean.
      const folded =
        head.state.workflowId === target.id
          ? foldTicketToWorkflowVersion(head.state, target, getVersion)
          : head.state;
      await overwriteSnapshot(client, {
        entityKind: 'ticket',
        entityId: row.ticket_id,
        seq: head.seq,
        // Round-tripped through JSON so what is stored is byte-for-byte what a
        // client reads back, matching the background pass exactly.
        state: JSON.parse(JSON.stringify(folded)) as Record<string, unknown>,
      });
      await client.query('RELEASE SAVEPOINT snapshot_refresh');
      outcome.rewritten.push({ ticketId: row.ticket_id, seq: head.seq });
    } catch (error) {
      await client.query('ROLLBACK TO SAVEPOINT snapshot_refresh');
      await client.query('RELEASE SAVEPOINT snapshot_refresh');
      outcome.skipped.push({ ticketId: row.ticket_id, reason: String(error) });
    }
  }
  return outcome;
}
