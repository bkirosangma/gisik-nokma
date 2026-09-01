import type { Pool } from 'pg';
import { newUlid, type EventEnvelope, type LedgerEvent } from '@gisik-nokma/domain';
import { insertEvent } from '../../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';

/**
 * The shared seeding helpers for Plan 5's read-model tasks (Tasks 4–15): build
 * a committed event the way ingest numbers one, and put a list of them into the
 * database the way ingest puts them there.
 *
 * ## Why this exists beside `testEnvelope`
 *
 * `./envelope.ts`'s `testEnvelope` and this builder are not two copies of one
 * policy; they differ on the one field that matters and they differ on purpose.
 *
 * - `testEnvelope` mints a GLOBALLY monotonic `workspaceSeq` (from 1000), so
 *   `seq` and `workspaceSeq` are never equal in any fixture. That is an
 *   anti-masking device: a test asserting a stored stream position would
 *   otherwise pass whether the code stored `event.seq` or `event.workspaceSeq`.
 *   Use it when a test asserts WHICH counter a projection wrote.
 * - `makeCommitted` mints `workspaceSeq` PER WORKSPACE, from 1, because that is
 *   what `nextWorkspaceSeq` actually assigns (`max(workspace_seq) + 1` scoped to
 *   the workspace). Use it when a test needs a ledger that a real ingest could
 *   have produced — which is what every read model in Plan 5 is reading.
 *
 * For a WORKSPACE entity the two counters then coincide, and that coincidence is
 * REALITY rather than the masking `testEnvelope` avoids: `./events.ts`'s
 * `committed()` already records the same fact ("these fixtures are workspace
 * entities, so the per-entity and per-workspace counters coincide"). A test
 * that must tell the two apart uses a non-workspace entity, or passes both
 * numbers explicitly — both are supported below.
 *
 * `LedgerEvent` is imported from `@gisik-nokma/domain`, where it is defined; the
 * plan text imported it from `../../src/ledger/event-store.js`, which only
 * imports the type and never re-exports it, so that import does not compile.
 * `./ledger.ts` ruled on the same plan-text bug already.
 */

const seqs = new Map<string, number>();
const workspaceSeqs = new Map<string, number>();
let clockTicks = 0;

/** 2026-08-20T09:00:00.000Z — the fixture epoch the rest of the suite writes by hand. */
const CLIENT_TIME_EPOCH_MS = Date.UTC(2026, 7, 20, 9, 0, 0);
/** A minute per event: far enough apart that no two stamps in one test collide. */
const TICK_MS = 60_000;
/** Claimed a second before it was received — the ordinary case. */
const RECEIPT_LAG_MS = 1_000;

/** Reset between test suites when exact seq numbers matter. */
export function resetEntitySeqs(): void {
  seqs.clear();
  workspaceSeqs.clear();
  clockTicks = 0;
}

/**
 * Builds a full committed envelope with an honest PER-ENTITY seq: each entity's
 * sequence starts at 1, exactly as Plan 1's ledger assigns them. A
 * process-monotonic counter here would still be unique and would still satisfy
 * both of the ledger's unique constraints, so the lie would be invisible — and
 * it would mask any defect that confuses the entity's own history with the
 * workspace's stream. Do not "simplify" this back. `./apply.test.ts` pins it.
 *
 * The per-workspace stream cursor sits beside it (coordination §18) and is the
 * other half of the same honesty: one counter per workspace, so a seeded ledger
 * orders exactly as ingest would order it.
 *
 * Both clocks DEFAULT to a fresh instant per call rather than to one shared
 * constant the plan text named. A single shared instant is the masking hazard
 * `testEnvelope` already rules on: an assertion about which claim last wrote a
 * row passes whichever claim actually wrote it. The first call still lands on
 * the fixture epoch, so a seeded history reads like a hand-built one; every
 * later call is a minute on. The ticks come from a CALL counter, not from
 * `workspaceSeq`, because `workspaceSeq` restarts per workspace and two
 * workspaces would otherwise share stamps — which is exactly the collision an
 * interleaved two-workspace test needs to be free of.
 */
export function makeCommitted(
  partial: Pick<EventEnvelope, 'workspaceId' | 'entity' | 'type' | 'payload' | 'actorId'> &
    Partial<LedgerEvent>,
): LedgerEvent {
  const key = `${partial.entity.kind}:${partial.entity.id}`;
  const seq = partial.seq ?? (seqs.get(key) ?? 0) + 1;
  seqs.set(key, Math.max(seq, seqs.get(key) ?? 0));
  const workspaceSeq =
    partial.workspaceSeq ?? (workspaceSeqs.get(partial.workspaceId) ?? 0) + 1;
  workspaceSeqs.set(
    partial.workspaceId,
    Math.max(workspaceSeq, workspaceSeqs.get(partial.workspaceId) ?? 0),
  );
  const clientTimeMs = CLIENT_TIME_EPOCH_MS + clockTicks * TICK_MS;
  clockTicks += 1;
  return {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime: new Date(clientTimeMs).toISOString(),
    serverTime: new Date(clientTimeMs + RECEIPT_LAG_MS).toISOString(),
    ...partial,
    seq,
    workspaceSeq,
  };
}

/**
 * Seeds envelopes into the ledger AND through every registered projection, one
 * transaction per event, in registry order.
 *
 * One transaction per event rather than one for the batch, because that is the
 * unit ingest commits in and it is the unit a projection's cross-table read
 * sees. A batch transaction would let a projection read rows a LATER event
 * wrote, which no live ingest can do.
 *
 * ## What this does NOT do, enumerated — it is not "ingest in miniature"
 *
 * This helper reproduces ingest's LEDGER-AND-PROJECTION half and nothing else.
 * Every read model in Tasks 5–15 is tested against a world seeded here, so the
 * absences below are the exact shape of what those tests CANNOT catch. They are
 * listed rather than summarised as "simplified", because a partial
 * implementation has to name its absences to be safely relied on:
 *
 * - **No `lockWorkspace` / `lockEntity`.** Ingest takes both before numbering
 *   (`ingest-service.ts:157-158`). Nothing here is concurrency-safe, and no
 *   test built on it can observe a race the locks exist to prevent.
 * - **The seqs are minted in a process-local map, not read from the database.**
 *   Ingest calls `nextWorkspaceSeq`/`nextSeq`, which are `max(...) + 1` over the
 *   ledger. So seeding into a database that ALREADY holds events for an entity
 *   collides: the map starts at 0 no matter what is stored. One fresh database
 *   per file, or pass explicit seqs.
 * - **No `checkPermission`.** Anything at all commits here, including events the
 *   shipped door refuses. A fixture is therefore never evidence that a client
 *   could have produced the world it describes.
 * - **No rule engine (`deps.evaluate`).** No refusal, no invariant, no advice.
 * - **No `bootstrapWorkspace`.** A `workspace.created` seeded here does NOT get
 *   the founding side effects a real one gets — no seeded membership, no builtin
 *   ticket types. A test needing those must seed them explicitly.
 * - **No `notifyCommitted`.** Nothing reaches the stream hub, so Tasks 14/15
 *   cannot use this path to prove a frame was published.
 *
 * The consequence to hold on to: a read model that is green against this helper
 * has been proven correct about ROWS, and proven nothing about whether those
 * rows are reachable through the shipped door. Closing that gap is the
 * integration checkpoint's job, not this helper's.
 */
export async function applyCommitted(pool: Pool, envelopes: LedgerEvent[]): Promise<void> {
  const registry = buildProjectionRegistry();
  const client = await pool.connect();
  try {
    for (const envelope of envelopes) {
      await client.query('BEGIN');
      try {
        await insertEvent(client, envelope);
        for (const projection of registry.all()) {
          await projection.apply(envelope, client);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    client.release();
  }
}
