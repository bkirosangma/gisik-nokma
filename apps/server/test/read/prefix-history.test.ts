import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, ticketKey, type LedgerEvent, type Ulid } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import {
  projectPrefixHistory,
  projectPrefixesInWorkspace,
  visibleProjects,
} from '../../src/read/visible-projects.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { workspaceIdentityFromLedger } from '../../src/workspaces/workspace-name.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';
import { appendTestEvent } from '../helpers/ledger.js';
import { applyAll, seedMember, seedProject, seedTicket } from '../helpers/seed.js';

/**
 * Cases 22.020–22.027. A prefix can change and the read side follows: the
 * project's former prefixes are kept (`proj_project_prefixes`), the keys re-read
 * under the new one, a derived prefix flees a RESERVED one, and the workspace
 * prefix is the last `workspace.prefix_changed`.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d));

async function setPrefix(ws: string, actor: string, projectId: string, prefix: string): Promise<LedgerEvent> {
  const env = testEnvelope({
    workspaceId: ws,
    entity: { kind: 'project', id: projectId },
    type: 'project.updated',
    payload: { prefix },
    actorId: actor,
  });
  await applyAll(db.pool, [env]);
  return env;
}

/** A workspace named "Convenience Corner" (prefix derived CC) with an admin; the ledger carries the founding event. */
async function freshWorkspace(): Promise<{ ws: string; actor: string }> {
  const ws = newUlid();
  const actor = newUlid();
  await seedMember(db.pool, ws, actor, 'admin', []);
  await appendTestEvent(
    db.pool,
    testEnvelope({
      workspaceId: ws,
      entity: { kind: 'workspace', id: ws },
      type: 'workspace.created',
      payload: { name: 'Convenience Corner' },
      actorId: actor,
    }),
  );
  return { ws, actor };
}

async function keyOf(ws: string, actor: string, projectId: string, ticketId: string): Promise<string> {
  const eff = await resolveEffectiveRole(db.pool, actor, ws);
  const project = (await visibleProjects(db.pool, eff, ws)).find((p) => p.projectId === projectId)!;
  const identity = await workspaceIdentityFromLedger(db.pool, ws);
  const number = (await ticketNumbers(db.pool, ws, [ticketId])).get(ticketId)!;
  return ticketKey(identity.prefix!, project.prefix, number);
}

describe('22.020 a project that changes its prefix re-keys its tickets and keeps the old one as former', () => {
  it('22.020 — SO → SH: current SH, former [SO], keys read CCSH-n; control: before, CCSO-n and no former', async () => {
    const { ws, actor } = await freshWorkspace();
    const shop = newUlid();
    const ticket = newUlid();
    await seedProject(db.pool, ws, shop, 'Shop operations', undefined, 'SO');
    await seedTicket(db.pool, { workspaceId: ws, projectId: shop, ticketId: ticket });

    // CONTROL, same `it`: the key and the (empty) history before the change.
    expect(await keyOf(ws, actor, shop, ticket)).toBe('CCSO-1');
    expect((await projectPrefixHistory(db.pool, ws)).get(shop)).toEqual({ current: 'SO', former: [] });

    const env = await setPrefix(ws, actor, shop, 'SH');

    expect(await keyOf(ws, actor, shop, ticket)).toBe('CCSH-1');
    expect((await projectPrefixHistory(db.pool, ws)).get(shop)).toEqual({
      current: 'SH',
      former: [{ prefix: 'SO', until: iso(env.serverTime) }],
    });
  });
});

describe('22.021 a derived prefix that changes is recorded as former', () => {
  it('22.021 — a project founded with NO prefix (derived SO) that moves to SH has former [SO]; control: before, current SO', async () => {
    const { ws, actor } = await freshWorkspace();
    const shop = newUlid();
    await seedProject(db.pool, ws, shop, 'Shop operations');
    expect((await projectPrefixHistory(db.pool, ws)).get(shop)).toEqual({ current: 'SO', former: [] });

    const env = await setPrefix(ws, actor, shop, 'SH');

    expect((await projectPrefixHistory(db.pool, ws)).get(shop)).toEqual({
      current: 'SH',
      former: [{ prefix: 'SO', until: iso(env.serverTime) }],
    });
  });
});

describe('22.022 going back to a former prefix', () => {
  it('22.022 — SO → SH → SO: current SO, former [SH] only; control: after the first move SO was former', async () => {
    const { ws, actor } = await freshWorkspace();
    const shop = newUlid();
    await seedProject(db.pool, ws, shop, 'Shop operations', undefined, 'SO');
    await setPrefix(ws, actor, shop, 'SH');
    expect((await projectPrefixHistory(db.pool, ws)).get(shop)!.former.map((f) => f.prefix)).toEqual(['SO']); // control

    const back = await setPrefix(ws, actor, shop, 'SO');

    expect((await projectPrefixHistory(db.pool, ws)).get(shop)).toEqual({
      current: 'SO',
      former: [{ prefix: 'SH', until: iso(back.serverTime) }],
    });
  });
});

describe('22.023 the workspace prefix follows workspace.prefix_changed', () => {
  it('22.023 — CC → CD: keys read CDSO-n and the former workspace prefixes are [CC]; control: before, CC and none', async () => {
    const { ws, actor } = await freshWorkspace();
    const shop = newUlid();
    const ticket = newUlid();
    await seedProject(db.pool, ws, shop, 'Shop operations', undefined, 'SO');
    await seedTicket(db.pool, { workspaceId: ws, projectId: shop, ticketId: ticket });
    expect(await workspaceIdentityFromLedger(db.pool, ws)).toEqual({
      name: 'Convenience Corner',
      prefix: 'CC',
      formerPrefixes: [],
    });
    expect(await keyOf(ws, actor, shop, ticket)).toBe('CCSO-1');

    const change = testEnvelope({
      workspaceId: ws,
      entity: { kind: 'workspace', id: ws },
      type: 'workspace.prefix_changed',
      payload: { prefix: 'CD' },
      actorId: actor,
    });
    await appendTestEvent(db.pool, change);

    expect(await workspaceIdentityFromLedger(db.pool, ws)).toEqual({
      name: 'Convenience Corner',
      prefix: 'CD',
      formerPrefixes: [{ prefix: 'CC', until: iso(change.serverTime) }],
    });
    expect(await keyOf(ws, actor, shop, ticket)).toBe('CDSO-1');

    // And back: CC is current again and no longer listed as former; CD is.
    const back = testEnvelope({
      workspaceId: ws,
      entity: { kind: 'workspace', id: ws },
      type: 'workspace.prefix_changed',
      payload: { prefix: 'CC' },
      actorId: actor,
    });
    await appendTestEvent(db.pool, back);
    expect(await workspaceIdentityFromLedger(db.pool, ws)).toMatchObject({
      prefix: 'CC',
      formerPrefixes: [{ prefix: 'CD', until: iso(back.serverTime) }],
    });
  });
});

describe('22.027 the former prefixes are listed oldest first', () => {
  it('22.027 — AA → BB → CC: former is [AA, BB] in that order with increasing until; control: current is CC', async () => {
    const { ws, actor } = await freshWorkspace();
    const project = newUlid();
    await seedProject(db.pool, ws, project, 'Shop operations', undefined, 'AA');
    const toBb = await setPrefix(ws, actor, project, 'BB');
    const toCc = await setPrefix(ws, actor, project, 'CC');

    const held = (await projectPrefixHistory(db.pool, ws)).get(project)!;
    expect(held.current).toBe('CC'); // control
    expect(held.former).toEqual([
      { prefix: 'AA', until: toBb.serverTime },
      { prefix: 'BB', until: toCc.serverTime },
    ]);
    expect(Date.parse(held.former[0]!.until)).toBeLessThan(Date.parse(held.former[1]!.until));
  });
});

describe('22.026 a derived prefix flees a reserved one, in every reader', () => {
  it('22.026 — after A (derived SO) moves to SH, a later derived Shop-ops project reads SO2 in both readers; control: before the move the first one held SO', async () => {
    const { ws, actor } = await freshWorkspace();
    const [a, b] = [newUlid(), newUlid()].sort() as [Ulid, Ulid];
    await seedProject(db.pool, ws, a, 'Shop operations');
    expect((await projectPrefixesInWorkspace(db.pool, ws)).get(a)).toBe('SO'); // control
    await setPrefix(ws, actor, a, 'SH');
    expect((await projectPrefixesInWorkspace(db.pool, ws)).get(a)).toBe('SH'); // A really left SO
    await seedProject(db.pool, ws, b, 'Service orders');

    // SO is A's FORMER prefix, so it is reserved: B's derived SO is pushed on.
    expect((await projectPrefixesInWorkspace(db.pool, ws)).get(b)).toBe('SO2');
    const eff = await resolveEffectiveRole(db.pool, actor, ws);
    expect((await visibleProjects(db.pool, eff, ws)).find((p) => p.projectId === b)!.prefix).toBe('SO2');
  });
});

describe('22.025 verify-projections stays green after prefix changes', () => {
  it('22.025 — the shadow rebuild reproduces proj_project_prefixes after project and workspace prefix changes', async () => {
    const own = await createTestDatabase();
    try {
      const ingest = createIngestService({
        pool: own.pool,
        evaluate: evaluateEvent,
        projections: buildProjectionRegistry(),
      });
      const home = submittedWorkspaceCreated();
      const ws = home.workspaceId;
      const actor = newUlid();
      const shop = newUlid();
      const other = newUlid();
      const ev = (entity: { kind: string; id: string }, type: string, payload: object) => ({
        id: newUlid(),
        workspaceId: ws,
        entity,
        type,
        version: 1,
        payload,
        actorId: actor,
        origin: 'web' as const,
        clientTime: '2026-08-20T09:00:00.000Z',
      });
      const results = await ingest.ingestBatch([
        home,
        ev({ kind: 'project', id: shop }, 'project.created', { name: 'Shop operations', prefix: 'SO' }),
        ev({ kind: 'project', id: other }, 'project.created', { name: 'Delivery' }),
        ev({ kind: 'project', id: shop }, 'project.updated', { prefix: 'SH' }),
        ev({ kind: 'project', id: shop }, 'project.updated', { prefix: 'SO' }),
        ev({ kind: 'project', id: shop }, 'project.updated', { prefix: 'SH' }),
        ev({ kind: 'project', id: other }, 'project.updated', { prefix: 'DX' }),
        ev({ kind: 'workspace', id: ws }, 'workspace.prefix_changed', { prefix: 'CD' }),
      ] as never);
      expect(results.map((r) => r.status)).toEqual(Array(8).fill('committed'));

      // Non-emptiness first: a clean verdict over an empty table is the check that cannot fail.
      const rows = await own.pool.query<{ project_id: string; prefix: string }>(
        'SELECT project_id, prefix FROM proj_project_prefixes ORDER BY prefix',
      );
      expect(rows.rows.map((r) => r.prefix)).toEqual(['DE', 'SO']);

      // The table must be DECLARED. Verify cannot tell: a projection that writes a
      // table it does not list has no shadow copy, so the replay's search_path
      // falls through to the LIVE table, rebuilds it in place from the ledger and
      // diffs nothing (measured: omitting it from `tables` leaves the verdict clean).
      const declared = buildProjectionRegistry().all().flatMap((p) => [...p.tables]);
      expect(declared).toContain('proj_projects'); // control: the check reads the registry
      expect(declared).toContain('proj_project_prefixes');

      const report = await verifyProjections({ pool: own.pool, projections: buildProjectionRegistry() });
      expect(report).toEqual({ clean: true, diffs: [] });
    } finally {
      await own.drop();
    }
  });
});
