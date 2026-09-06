import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_DUE_SOON_DAYS, DEFAULT_STALE_DAYS, newUlid } from '@gisik-nokma/domain';
import { readLedger } from '../../src/ledger/event-store.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import {
  getWorkspaceSettings,
  workspaceSettingsProjection,
} from '../../src/projections/workspace-settings.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Plan 5 Task 4. `proj_workspace_settings` answers one question — what are this
 * workspace's two attention thresholds, and who claimed them — and answers it
 * with defaults when nobody ever has.
 *
 * The ledger is NOT emptied between tests: `events` is append-only and its
 * trigger refuses a TRUNCATE. Every workspace id here is a fresh ULID, so the
 * rebuild and verify cases below replay earlier tests' events harmlessly, and
 * every assertion is SCOPED to the workspaces its own test created. That
 * scoping is load-bearing rather than tidy: `rebuildProjection` replays the
 * whole ledger into the whole table, so an unscoped comparison would be
 * comparing this test's rows against every other test's too.
 *
 * There is no registry-containment assertion here on purpose. The order
 * contract lives in the deliberately DB-free `test/projection-order.test.ts`,
 * and containment is proved more strongly below than an `indexOf` could: every
 * seeding call goes through `applyCommitted`, which applies whatever
 * `buildProjectionRegistry()` holds and nothing else, so an unregistered
 * projection leaves this table empty and the reader answers defaults — which
 * reddens the second case in this file.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('TRUNCATE proj_workspace_settings');
  resetEntitySeqs();
});

function settingsEvent(
  workspaceId: string,
  actorId: string,
  payload: Record<string, number>,
  overrides: { serverTime?: string; clientTime?: string } = {},
) {
  return makeCommitted({
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.settings_set',
    payload,
    actorId,
    ...overrides,
  });
}

async function rowsFor(workspaceIds: string[]) {
  const { rows } = await db.pool.query(
    'SELECT * FROM proj_workspace_settings WHERE workspace_id = ANY($1) ORDER BY workspace_id',
    [workspaceIds],
  );
  return rows;
}

describe('getWorkspaceSettings — what the server answers', () => {
  it('answers defaults with null provenance when nothing was ever claimed', async () => {
    // `provenance: null` is the whole point of the field: a default is not a
    // claim, so there is nobody to attribute it to. Returning
    // DEFAULT_STALE_DAYS with a fabricated actor would be the server making a
    // claim on a person's behalf.
    expect(await getWorkspaceSettings(db.pool, newUlid())).toEqual({
      staleDays: DEFAULT_STALE_DAYS,
      dueSoonDays: DEFAULT_DUE_SOON_DAYS,
      provenance: null,
    });
  });

  /**
   * 7.8 — the row’s primary clause: the LAST claim per key with that claim’s provenance, and a partial update leaving the other key alone. Its defaults-with-null-provenance clause is the neighbouring test above.
   */
  it('holds the last claim per key, with a partial update leaving the other key alone', async () => {
    // Mutation: drop the COALESCE from the upsert and `dueSoonDays` comes back
    // as the default here, because Bala's claim carries a NULL for it. That is
    // the difference between "the last claim wins per KEY" and "the last claim
    // replaces the row", and only the first is what a partial-update payload
    // means.
    const workspaceId = newUlid();
    const alice = newUlid();
    const bala = newUlid();
    const first = settingsEvent(workspaceId, alice, { staleDays: 3, dueSoonDays: 10 });
    const second = settingsEvent(workspaceId, bala, { staleDays: 5 });
    await applyCommitted(db.pool, [first, second]);

    const settings = await getWorkspaceSettings(db.pool, workspaceId);
    expect(settings.staleDays).toBe(5);
    expect(settings.dueSoonDays).toBe(10); // untouched by the partial update
    // Provenance follows the ROW, not the key: the last person to touch the
    // settings at all is who the strip attributes them to.
    expect(settings.provenance).toEqual({
      actorId: bala,
      clientTime: second.clientTime,
      serverTime: second.serverTime,
    });
  });

  it('answers defaults per KEY, so a claim that only sets one leaves the other defaulted', async () => {
    const workspaceId = newUlid();
    const actor = newUlid();
    await applyCommitted(db.pool, [settingsEvent(workspaceId, actor, { dueSoonDays: 0 })]);

    const settings = await getWorkspaceSettings(db.pool, workspaceId);
    // 0 is a legal dueSoonDays (`min(0)` in the schema) and `?? DEFAULT` must
    // carry it through — `||` would silently answer 7 here.
    expect(settings.dueSoonDays).toBe(0);
    expect(settings.staleDays).toBe(DEFAULT_STALE_DAYS);
    expect(settings.provenance?.actorId).toBe(actor);
  });

  it('is scoped by workspace: one workspace claiming thresholds does not move another', async () => {
    const claimed = newUlid();
    const untouched = newUlid();
    await applyCommitted(db.pool, [settingsEvent(claimed, newUlid(), { staleDays: 30 })]);

    expect((await getWorkspaceSettings(db.pool, claimed)).staleDays).toBe(30);
    expect(await getWorkspaceSettings(db.pool, untouched)).toEqual({
      staleDays: DEFAULT_STALE_DAYS,
      dueSoonDays: DEFAULT_DUE_SOON_DAYS,
      provenance: null,
    });
  });
});

describe('workspaceSettingsProjection — the handler', () => {
  it('an event type it does not read leaves the table empty', async () => {
    // Mutation: drop the `event.type !== 'workspace.settings_set'` guard and a
    // rename founds a settings row — with a payload the schema refuses, so the
    // rebuild of an ordinary workspace's history would throw.
    const workspaceId = newUlid();
    const client = await db.pool.connect();
    try {
      await workspaceSettingsProjection.apply(
        makeCommitted({
          workspaceId,
          entity: { kind: 'workspace', id: workspaceId },
          type: 'workspace.renamed',
          payload: { name: 'Renamed' },
          actorId: newUlid(),
        }),
        client,
      );
    } finally {
      client.release();
    }
    expect(await rowsFor([workspaceId])).toHaveLength(0);
  });

  it('reset empties the table it declares', async () => {
    const workspaceId = newUlid();
    await applyCommitted(db.pool, [settingsEvent(workspaceId, newUlid(), { staleDays: 4 })]);
    expect(await rowsFor([workspaceId])).toHaveLength(1);

    const client = await db.pool.connect();
    try {
      await workspaceSettingsProjection.reset(client);
    } finally {
      client.release();
    }
    expect(await rowsFor([workspaceId])).toHaveLength(0);
  });

  /**
   * 7.62 — replaying the same canonical sequence a second time changes nothing — stated with its limit rather than as a general idempotence claim.
   */
  it('replaying the same canonical sequence a second time changes nothing', async () => {
    // Idempotence in the sense a rebuild needs it: the same events, in the same
    // canonical order, applied again. Mutation: drop the
    // `ON CONFLICT (workspace_id) DO UPDATE` clause and the second pass dies on
    // the primary key, which is what a rebuild over a non-empty table would do.
    //
    // The limit, stated rather than implied: this is NOT a claim that any one
    // event may be re-applied at any moment. Re-applying an OLDER claim alone,
    // after a newer one, would rewrite the row — the handler is blind
    // last-writer-wins. What makes that safe is upstream: a duplicate event id
    // is refused at ingest, and replay hands events back in
    // (entity_kind, entity_id, seq) order, which for this table's single writer
    // is the claim order itself.
    const workspaceId = newUlid();
    const actor = newUlid();
    const events = [
      settingsEvent(workspaceId, actor, { dueSoonDays: 2 }),
      settingsEvent(workspaceId, actor, { staleDays: 9 }),
    ];

    const client = await db.pool.connect();
    try {
      for (const event of events) await workspaceSettingsProjection.apply(event, client);
      const once = await rowsFor([workspaceId]);
      for (const event of events) await workspaceSettingsProjection.apply(event, client);
      expect(await rowsFor([workspaceId])).toEqual(once);
      expect(once).toHaveLength(1);
    } finally {
      client.release();
    }
  });
});

/**
 * The determinism harness, and it is built to the shape the coordination doc
 * demands (2026-08-31, "a determinism test that replays the order it applied is
 * vacuous"): it asserts the CANONICAL order differs from the ARRIVAL order
 * before it compares anything, does real ledger inserts, and rebuilds through
 * `rebuildProjection` rather than re-running `apply` over its own arrival
 * sequence.
 *
 * What this table's own defect surface actually is, said plainly rather than
 * dressed up: the key is `event.workspaceId`, every writer is a
 * `workspace.settings_set` filed against that same workspace ENTITY, so each key
 * has exactly one totally-ordered writer and canonical replay cannot disagree
 * with live for correct code. This harness is therefore not catching a hazard
 * that exists today — it is the guard that reddens the day a cross-key write
 * appears, and it was proved able to do so by mutation: an unscoped
 * `UPDATE proj_workspace_settings SET stale_days = $2` beside the upsert makes
 * live's last writer A2 and the rebuild's last writer B2, and this case fails.
 * A `new Date()` in place of `event.serverTime` fails it too.
 */
describe('proj_workspace_settings is a pure function of the ledger, not of arrival order', () => {
  /**
   * 7.61 — `proj_workspace_settings` rebuilds byte-identically from a ledger whose CANONICAL order is not the order it arrived in — a pure function of the ledger, not of arrival order.
   */
  it('rebuilds byte-identically from a ledger whose canonical order is NOT the order it arrived in', async () => {
    const [workspaceA, workspaceB] = [newUlid(), newUlid()].sort();
    if (workspaceA === undefined || workspaceB === undefined) throw new Error('unreachable');
    const actor = newUlid();

    // Arrival interleaves the two workspaces and ENDS on A. Canonical replay
    // orders by (entity_kind, entity_id, seq) — workspace-id order — so it runs
    // A's stream first and ends on B. The last writer differs between the two
    // orders, which is what makes a cross-key write detectable here.
    const b1 = settingsEvent(workspaceB, actor, { staleDays: 11 });
    const a1 = settingsEvent(workspaceA, actor, { staleDays: 1 });
    const b2 = settingsEvent(workspaceB, actor, { staleDays: 12, dueSoonDays: 120 });
    const a2 = settingsEvent(workspaceA, actor, { staleDays: 2, dueSoonDays: 20 });
    const arrival = [b1, a1, b2, a2];
    await applyCommitted(db.pool, arrival);

    const arrivalIds = arrival.map((event) => event.id);
    const seeded = new Set(arrivalIds);
    const canonicalIds = (await readLedger(db.pool))
      .filter((event) => seeded.has(event.id))
      .map((event) => event.id);
    // The premise, asserted before anything is compared: these are two
    // DIFFERENT orderings over the same four events. Without this the whole
    // case could pass by comparing a thing with itself.
    expect(canonicalIds).not.toEqual(arrivalIds);
    expect([...canonicalIds].sort()).toEqual([...arrivalIds].sort());

    const live = await rowsFor([workspaceA, workspaceB]);
    expect(live).toHaveLength(2);
    // A positive control on the fixture: arrival order really did decide the
    // live rows, so agreement below is agreement about something.
    expect(live.map((row) => row.stale_days)).toEqual([2, 12]);

    const projections = buildProjectionRegistry();
    await rebuildProjection('proj_workspace_settings', { pool: db.pool, projections });
    expect(await rowsFor([workspaceA, workspaceB])).toEqual(live);
  });
});

/**
 * The projection contract's shadow-schema fence, on this table.
 *
 * "Verify is clean" would catch neither way of falling off it: with no shadow
 * copy the verifier skips the diff, and a rebuild into live agrees with itself.
 * So what is asserted is that a PLANTED live corruption is REPORTED — which
 * happens only if `tables: ['proj_workspace_settings']` is declared and a shadow
 * copy therefore exists to disagree with it. It is also the executed check that
 * this table's column types survive `EXCEPT`: `text`, `integer` and
 * `timestamptz` all have an equality operator, which the diff needs and `json`
 * would not have supplied.
 */
describe('proj_workspace_settings under verify-projections', () => {
  /**
   * 7.63 — `proj_workspace_settings` under `verify-projections`: a planted live corruption is REPORTED against the shadow rebuild, and live is left alone.
   */
  it('a corrupted live row is reported against the ledger rebuild, and live is left alone', async () => {
    const workspaceId = newUlid();
    await applyCommitted(db.pool, [settingsEvent(workspaceId, newUlid(), { staleDays: 21 })]);

    const projections = buildProjectionRegistry();
    for (const projection of projections.all()) {
      await rebuildProjection(projection.name, { pool: db.pool, projections });
    }
    expect(await verifyProjections({ pool: db.pool, projections })).toEqual({
      clean: true,
      diffs: [],
    });

    await db.pool.query(
      'UPDATE proj_workspace_settings SET stale_days = $1 WHERE workspace_id = $2',
      [999, workspaceId],
    );

    const report = await verifyProjections({ pool: db.pool, projections });
    expect(report.clean).toBe(false);
    expect(report.diffs.map((diff) => diff.table)).toEqual(['proj_workspace_settings']);
    expect(report.diffs[0]).toMatchObject({ missingFromLive: 1, extraInLive: 1 });

    // The verify wrote nothing live: the planted corruption survives, which it
    // would not if the rebuild had escaped the shadow schema into public.
    expect((await rowsFor([workspaceId]))[0]).toMatchObject({ stale_days: 999 });
  });
});
