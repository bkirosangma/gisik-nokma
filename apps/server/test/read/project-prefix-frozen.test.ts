import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { derivePrefix, newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { projectPrefixesInWorkspace, visibleProjects } from '../../src/read/visible-projects.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { applyAll, seedMember, seedProject } from '../helpers/seed.js';

/**
 * Cases 13.1613–13.1615. A project's KEY is frozen at founding: a rename never
 * moves it, entered or derived.
 *
 * The bug these pin (found in production the day `project.updated` shipped,
 * 2026-10-01): a project founded WITHOUT an entered prefix derives one from its
 * name, and the derivation read the CURRENT name — so renaming the project
 * silently re-keyed every ticket in it, and could shift a NEIGHBOUR's derived
 * prefix when two bases collide. Workspaces derive from the FOUNDING name
 * (`workspaces/workspace-name.ts`); projects now do too (`founding_name`).
 *
 * Every case reads BOTH doors that resolve prefixes — `visibleProjects` (what a
 * reader is served) and `projectPrefixesInWorkspace` (what ticket keys, notes
 * and the founding check read) — because a fix at one and not the other is the
 * shape of this bug.
 */

let db: TestDatabase;
const ws = newUlid();
const admin = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  await seedMember(db.pool, ws, admin, 'admin', []);
});

afterAll(async () => {
  await db.drop();
});

async function rename(workspaceId: string, actorId: string, projectId: string, name: string): Promise<void> {
  await applyAll(db.pool, [
    testEnvelope({
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.updated',
      payload: { name },
      actorId,
    }),
  ]);
}

/** `n` fresh ids in ascending order: two ULIDs minted in one millisecond are not ordered. */
function ascendingIds(n: number): string[] {
  return Array.from({ length: n }, () => newUlid() as string).sort();
}

/** A workspace of its own, an admin in it, and a reader of its resolved prefixes. */
async function freshWorkspace(): Promise<{
  wsId: string;
  actor: string;
  prefixes: () => Promise<Map<string, string>>;
}> {
  const wsId = newUlid();
  const actor = newUlid();
  await seedMember(db.pool, wsId, actor, 'admin', []);
  return {
    wsId,
    actor,
    prefixes: async () => {
      const eff = await resolveEffectiveRole(db.pool, actor, wsId);
      return new Map((await visibleProjects(db.pool, eff, wsId)).map((p) => [p.projectId, p.prefix]));
    },
  };
}

async function served(): Promise<Map<string, { name: string; prefix: string }>> {
  const eff = await resolveEffectiveRole(db.pool, admin, ws);
  const projects = await visibleProjects(db.pool, eff, ws);
  return new Map(projects.map((p) => [p.projectId, { name: p.name, prefix: p.prefix }]));
}

describe('13.1613 a project with no entered prefix keeps its key across a rename', () => {
  it('derives from the FOUNDING name, and the served name is still the new one', async () => {
    const shop = newUlid();
    await seedProject(db.pool, ws, shop, 'Shop operations');

    // CONTROL, same `it`: before the rename the key IS the founding-name
    // derivation — so the "unchanged" assertion below is about a key that was
    // really derived, not a test that passes on a table of `XX`.
    expect(derivePrefix('Shop operations')).toBe('SO');
    expect((await served()).get(shop)).toEqual({ name: 'Shop operations', prefix: 'SO' });
    expect((await projectPrefixesInWorkspace(db.pool, ws)).get(shop)).toBe('SO');

    await rename(ws, admin, shop, 'Kitchen');
    expect(derivePrefix('Kitchen')).toBe('KI'); // what the buggy read would now answer

    // The NAME moved, the KEY did not — one `it` asserts both so neither a
    // read that froze the name nor one that re-derived the key can pass.
    expect((await served()).get(shop)).toEqual({ name: 'Kitchen', prefix: 'SO' });
    expect((await projectPrefixesInWorkspace(db.pool, ws)).get(shop)).toBe('SO');
  });
});

describe('13.1614 a neighbour’s derived prefix does not move when another project is renamed', () => {
  it('Service orders stays SO2 while Shop operations is renamed away from SO and back into a collision', async () => {
    const { wsId, actor, prefixes } = await freshWorkspace();
    // Sorted: two ULIDs minted in the same millisecond are not ordered, and the
    // prefix rule's tie-break IS project-id order — so the fixture fixes it.
    const [first, second, third] = ascendingIds(3) as [string, string, string];
    // `first` claims SO and `second` flees to SO2.
    await seedProject(db.pool, wsId, first, 'Shop operations');
    await seedProject(db.pool, wsId, second, 'Service orders');
    await seedProject(db.pool, wsId, third, 'Kitchen');
    const expected = new Map([[first, 'SO'], [second, 'SO2'], [third, 'KI']]);

    // CONTROL: the collision is real before anything is renamed.
    expect(await prefixes()).toEqual(expected);

    // Rename the SO holder away. A name-derived read frees `SO` and shifts the
    // neighbour to it — re-keying every ticket in Service orders for an act
    // that named nothing about it.
    await rename(wsId, actor, first, 'Warehouse');
    expect(await prefixes()).toEqual(expected);

    // …and renaming ANOTHER project into the colliding base moves nobody either.
    await rename(wsId, actor, third, 'Shop outlets');
    expect(derivePrefix('Shop outlets')).toBe('SO');
    expect(await prefixes()).toEqual(expected);
    const door = await projectPrefixesInWorkspace(db.pool, wsId);
    expect([door.get(first), door.get(second), door.get(third)]).toEqual(['SO', 'SO2', 'KI']);
  });
});

describe('13.1615 an ENTERED prefix is unaffected by a rename', () => {
  it('keeps the entered prefix, still outranks a neighbour’s derivation, and leaves that neighbour where it was', async () => {
    const { wsId, actor, prefixes } = await freshWorkspace();
    const [entered, derived] = ascendingIds(2) as [string, string];
    // The ENTERED value (`SO`) is deliberately NOT what its own name derives
    // (`KI`) and IS what the neighbour's name derives: a fixture where entered
    // and derived coincide passes whether or not the entered value is read.
    await seedProject(db.pool, wsId, entered, 'Kitchen', undefined, 'SO');
    await seedProject(db.pool, wsId, derived, 'Shop operations');
    expect(derivePrefix('Kitchen')).toBe('KI');
    expect(derivePrefix('Shop operations')).toBe('SO');

    // CONTROL: pass 1 gives the entered `SO` to the project that entered it,
    // so the neighbour's derivation has already fled to SO2.
    const expected = new Map([[entered, 'SO'], [derived, 'SO2']]);
    expect(await prefixes()).toEqual(expected);

    await rename(wsId, actor, entered, 'Bakery');
    expect(await prefixes()).toEqual(expected);
    expect((await projectPrefixesInWorkspace(db.pool, wsId)).get(entered)).toBe('SO');
  });
});
