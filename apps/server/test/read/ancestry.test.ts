import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, ticketKey, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { boardAncestryFor, epicAncestors, keysForAncestors } from '../../src/read/ancestry.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';

/**
 * Owner request, 2026-09-23 (board-card badges) — `boardAncestryFor` and
 * `keysForAncestors`, the two new reads the board's parent-key badge and
 * epic chip draw from, plus `epicAncestors` ITSELF: moved here from
 * `routes/list.ts` verbatim (that file's own docblock records the move), so
 * this suite is also where a case proving the move changed nothing belongs.
 *
 * ## The world, and what this file mints beyond it
 *
 * `seedReadScenario` gives every case `world.epicId` ("Registrations drive")
 * and `world.taskInEpicId` ("File the GST return", its DIRECT child) for
 * free. Per that scenario's own rule ("mutating cases mint their own
 * world"), nothing here touches either id — new tickets are minted as
 * CHILDREN under them, which is enough to build a grandchild whose parent
 * and epic differ, a restricted parent (`world.hiddenTaskId`, owner-only),
 * and a soft-deleted one.
 *
 * Case ids from the task's own block, §13
 * (`test-cases/13-hig-per-screen.md`, 13.1451-13.1470).
 */

let db: TestDatabase;
let world: ReadScenario;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedReadScenario(db.pool, scenarioUsers());
});

afterAll(async () => {
  await db.drop();
});

/** A `ticket.created` in the seeded workspace, on its `task` type — the same shape `ticket-cards.test.ts`'s own helper builds. */
function created(args: { id: string; actorId: string; parentId?: string | null; title?: string }): LedgerEvent {
  return makeCommitted({
    workspaceId: world.workspaceId,
    actorId: args.actorId,
    entity: { kind: 'ticket', id: args.id },
    type: 'ticket.created',
    payload: {
      typeId: 'task',
      projectId: world.projectId,
      parentId: args.parentId ?? null,
      title: args.title ?? 'Minted ticket',
    },
  });
}

function deleted(id: string, actorId: string): LedgerEvent {
  return makeCommitted({
    workspaceId: world.workspaceId,
    actorId,
    entity: { kind: 'ticket', id },
    type: 'ticket.deleted',
    payload: {},
  });
}

describe('13.1460 epicAncestors — MOVED from routes/list.ts, behaviour unchanged', () => {
  it('finds the epic for a ticket seeded as its direct child, with the title', async () => {
    const eff = await resolveEffectiveRole(db.pool, world.owner, world.workspaceId);
    const found = await epicAncestors(db.pool, eff, world.owner, world.workspaceId, [world.taskInEpicId]);
    expect(found.get(world.taskInEpicId)).toEqual({
      epicId: world.epicId,
      epicProjectId: world.projectId,
      title: 'Registrations drive',
    });
  });

  it('answers an empty map for an empty id list — the same short-circuit `boardAncestryFor` below shares', async () => {
    const eff = await resolveEffectiveRole(db.pool, world.owner, world.workspaceId);
    expect(await epicAncestors(db.pool, eff, world.owner, world.workspaceId, [])).toEqual(new Map());
  });
});

describe('13.1460 boardAncestryFor — the parent AND the epic, from one walk', () => {
  it('a grandchild of the epic gets BOTH: an epic two hops up, and its immediate parent one hop up — and they differ', async () => {
    const grandchild = newUlid();
    await applyCommitted(db.pool, [
      created({ id: grandchild, actorId: world.owner, parentId: world.taskInEpicId, title: 'Chase the stamp duty office' }),
    ]);
    const eff = await resolveEffectiveRole(db.pool, world.owner, world.workspaceId);
    const found = await boardAncestryFor(db.pool, eff, world.owner, world.workspaceId, [grandchild]);
    const ancestry = found.get(grandchild);
    expect(ancestry?.parent).toEqual({ ticketId: world.taskInEpicId, projectId: world.projectId });
    expect(ancestry?.epic).toEqual({
      epicId: world.epicId,
      epicProjectId: world.projectId,
      title: 'Registrations drive',
    });
    // The pin that matters for the view's dedup rule (`BoardCard.parent`'s own
    // docblock): a grandchild's parent and epic are DIFFERENT tickets.
    expect(ancestry?.parent?.ticketId).not.toBe(ancestry?.epic?.epicId);
  });

  it('a DIRECT child of the epic gets the SAME ticket as both its parent and its epic — the view layer, not this walk, decides whether to repeat it', async () => {
    const eff = await resolveEffectiveRole(db.pool, world.owner, world.workspaceId);
    const found = await boardAncestryFor(db.pool, eff, world.owner, world.workspaceId, [world.taskInEpicId]);
    const ancestry = found.get(world.taskInEpicId);
    expect(ancestry?.parent).toEqual({ ticketId: world.epicId, projectId: world.projectId });
    expect(ancestry?.epic?.epicId).toBe(world.epicId);
  });

  it('a root ticket (no parent, no epic ancestor) gets null for both', async () => {
    const root = newUlid();
    await applyCommitted(db.pool, [created({ id: root, actorId: world.owner, title: 'A root errand' })]);
    const eff = await resolveEffectiveRole(db.pool, world.owner, world.workspaceId);
    const found = await boardAncestryFor(db.pool, eff, world.owner, world.workspaceId, [root]);
    expect(found.get(root)).toEqual({ parent: null, epic: null });
  });

  /**
   * 13.1461 — THE PARENT NAMES NO EXISTENCE LEAK. `world.hiddenTaskId` ("Salary
   * review — keep private") is explicit: owner ONLY. A child minted under it is
   * itself a project-mode root (no `visibility.set` of its own), so `member`
   * — on the project, but not on that explicit list — sees the CHILD (it is a
   * project-mode ticket) but not the parent. The control is the SAME walk run
   * as `world.owner`, who sees both: the absence is the VIEWER, not a broken
   * walk.
   */
  it('13.1461 an invisible parent is not named — control: the same parent IS named for a viewer who may see it', async () => {
    const child = newUlid();
    await applyCommitted(db.pool, [
      created({ id: child, actorId: world.owner, parentId: world.hiddenTaskId, title: 'Follow up on the review' }),
    ]);

    const memberEff = await resolveEffectiveRole(db.pool, world.member, world.workspaceId);
    const asMember = await boardAncestryFor(db.pool, memberEff, world.member, world.workspaceId, [child]);
    expect(asMember.get(child)?.parent).toBeNull();

    const ownerEff = await resolveEffectiveRole(db.pool, world.owner, world.workspaceId);
    const asOwner = await boardAncestryFor(db.pool, ownerEff, world.owner, world.workspaceId, [child]);
    expect(asOwner.get(child)?.parent).toEqual({ ticketId: world.hiddenTaskId, projectId: world.projectId });
  });

  /**
   * 13.1462 — A SOFT-DELETED PARENT ANSWERS THE SAME AS AN INVISIBLE ONE, even
   * for the OWNER, who could see it if it still lived. `LIVE_TICKET_WHERE` on
   * the recursive term stops the walk exactly as `visibleTicketsWhere` does
   * (`ancestryCte`'s own docblock) — this is the case that proves it rather
   * than only arguing it.
   */
  it('13.1462 a soft-deleted parent is not named, even to the owner who could otherwise see it', async () => {
    const parent = newUlid();
    const child = newUlid();
    await applyCommitted(db.pool, [
      created({ id: parent, actorId: world.owner, title: 'Renamed the till float' }),
      created({ id: child, actorId: world.owner, parentId: parent, title: 'Balance the till' }),
      deleted(parent, world.owner),
    ]);
    const eff = await resolveEffectiveRole(db.pool, world.owner, world.workspaceId);
    const found = await boardAncestryFor(db.pool, eff, world.owner, world.workspaceId, [child]);
    expect(found.get(child)?.parent).toBeNull();
  });

  it('13.1463 an epic reached only through an invisible link is not named — the same rule the list route already applies', async () => {
    // `world.hiddenTaskId` is itself a root (no epic above it in this world),
    // so a child minted under it has NO epic to find regardless of visibility
    // — this asserts the PARENT-side leak only stays closed via the epic arm
    // too, over the same invisible link.
    const child = newUlid();
    await applyCommitted(db.pool, [
      created({ id: child, actorId: world.owner, parentId: world.hiddenTaskId, title: 'Chase the review sign-off' }),
    ]);
    const memberEff = await resolveEffectiveRole(db.pool, world.member, world.workspaceId);
    const found = await boardAncestryFor(db.pool, memberEff, world.member, world.workspaceId, [child]);
    expect(found.get(child)?.epic).toBeNull();
  });
});

describe('13.1460 keysForAncestors — the board badge composes the SAME key the single-ticket crumb would', () => {
  it('composes a real key for a visible ancestor, from the derived workspace/project prefixes the world has no entered ones for', async () => {
    const numbers = await ticketNumbers(db.pool, world.workspaceId, [world.epicId]);
    const keys = await keysForAncestors(db.pool, world.workspaceId, [
      { ticketId: world.epicId, projectId: world.projectId },
    ]);
    // `derivePrefix('Convenience Corner')` = `CC`, `derivePrefix(<project
    // name>)` = `RE` — the SAME derivation `ticket-cards.test.ts`'s 13.1278
    // already pins for this world, over the world's own PROJECT.
    expect(keys.get(world.epicId)).toBe(ticketKey('CC', 'RE', numbers.get(world.epicId)!));
  });

  it('answers an empty map for an empty ancestor list', async () => {
    expect(await keysForAncestors(db.pool, world.workspaceId, [])).toEqual(new Map());
  });

  it('two cards sharing one epic get the IDENTICAL key for it — one ancestor, one key, not two independent compositions', async () => {
    const a = newUlid();
    const b = newUlid();
    await applyCommitted(db.pool, [
      created({ id: a, actorId: world.owner, parentId: world.epicId, title: 'Sibling A' }),
      created({ id: b, actorId: world.owner, parentId: world.epicId, title: 'Sibling B' }),
    ]);
    const eff = await resolveEffectiveRole(db.pool, world.owner, world.workspaceId);
    const found = await boardAncestryFor(db.pool, eff, world.owner, world.workspaceId, [a, b]);
    const epicA = found.get(a)?.epic;
    const epicB = found.get(b)?.epic;
    expect(epicA?.epicId).toBe(world.epicId);
    expect(epicA?.epicId).toBe(epicB?.epicId);

    const numbers = await ticketNumbers(db.pool, world.workspaceId, [world.epicId]);
    const keys = await keysForAncestors(db.pool, world.workspaceId, [
      { ticketId: world.epicId, projectId: world.projectId },
    ]);
    const expected = ticketKey('CC', 'RE', numbers.get(world.epicId)!);
    expect(keys.get(world.epicId)).toBe(expected);
  });
});
