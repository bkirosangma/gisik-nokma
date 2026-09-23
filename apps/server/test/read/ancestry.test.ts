import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, ticketKey, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { boardAncestryFor, epicAncestors, keysForAncestors } from '../../src/read/ancestry.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { canSee } from '../../src/visibility/can-see.js';
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

/** A `ticket.created` in the seeded workspace, on its `task` type (or `typeId`) — the same shape `ticket-cards.test.ts`'s own helper builds. */
function created(args: {
  id: string;
  actorId: string;
  parentId?: string | null;
  title?: string;
  typeId?: 'task' | 'epic';
}): LedgerEvent {
  return makeCommitted({
    workspaceId: world.workspaceId,
    actorId: args.actorId,
    entity: { kind: 'ticket', id: args.id },
    type: 'ticket.created',
    payload: {
      typeId: args.typeId ?? 'task',
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

/**
 * A `visibility.set`, the SAME shape `list.test.ts`'s own 7.80 fixture uses to
 * make a child reachable despite an invisible parent: a ticket with no
 * `visibility.set` of its own INHERITS its nearest authoring ancestor's
 * resolved audience, so a child minted under an explicit-owner-only parent
 * is invisible too until it authors its own claim.
 */
function visibilitySet(id: string, actorId: string, userIds: string[]): LedgerEvent {
  return makeCommitted({
    workspaceId: world.workspaceId,
    actorId,
    entity: { kind: 'ticket', id },
    type: 'visibility.set',
    payload: { ticketId: id, mode: 'explicit', userIds },
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
   * 13.1461 — THE PARENT NAMES NO EXISTENCE LEAK. CORRECTED (controller
   * mutation, 2026-09-23): the FIRST version of this case minted a child with
   * NO `visibility.set` of its own, on the wrong assumption that it would
   * default to project-mode. It does not — a ticket with no own claim
   * INHERITS its nearest authoring ancestor's resolved audience, so that
   * child inherited `world.hiddenTaskId`'s explicit-owner-only audience and
   * was ITSELF invisible to `member`. `boardAncestryFor`'s own CTE anchor
   * (depth 0) already requires `${visible}`, so the anchor excluded the row
   * before the recursive step — the one this case is actually about — ever
   * ran. Measured: with `AND ${visible}` deleted from the RECURSIVE term
   * only (the leak the case exists to catch), the ORIGINAL case still
   * PASSED. The fix mints the child on the SAME `visibility.set` shape
   * `list.test.ts`'s 7.80 uses — its own explicit claim naming both owner
   * and member, overriding inheritance — so the anchor finds it and the
   * recursive step is what the assertion actually exercises. The POSITIVE
   * CONTROL comes first and is independent of `boardAncestryFor` itself:
   * `canSee` (`visibility/can-see.ts`) is a different code path entirely
   * (TypeScript role resolution, not this file's SQL predicate), so it
   * cannot pass for the same reason a broken walk would.
   */
  it('13.1461 an invisible parent is not named — control: the child IS visible, and the same parent IS named for a viewer who may see it', async () => {
    const child = newUlid();
    await applyCommitted(db.pool, [
      created({ id: child, actorId: world.owner, parentId: world.hiddenTaskId, title: 'Follow up on the review' }),
      visibilitySet(child, world.owner, [world.owner, world.member]),
    ]);

    // POSITIVE CONTROL, FIRST, via the INDEPENDENT oracle: without this the
    // case could pass because the anchor never finds an invisible child —
    // exactly the shape that let the original version pass under the leak.
    expect(await canSee(db.pool, world.member, child)).toBe(true);

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

  /**
   * 13.1463 — AN EPIC REACHED ONLY THROUGH AN INVISIBLE LINK IS NOT NAMED.
   * CORRECTED (controller mutation, 2026-09-23), the SAME defect 13.1461's
   * own docblock records: the FIRST version's child inherited its invisible
   * parent's audience, so the anchor excluded it and the recursive step
   * (climbing PAST the hidden hop to find an epic) never ran — measured to
   * PASS under the same planted leak. The fix builds the real three-level
   * shape the fix round asked for: `epicAbove` (epic-typed, root) →
   * `hiddenMiddle` (explicit: owner only) → `visibleGrandchild` (its OWN
   * explicit claim naming owner and member). The member can see the
   * grandchild (independent control, same as 13.1461) but the walk from it
   * must climb THROUGH `hiddenMiddle` to reach `epicAbove`, and
   * `hiddenMiddle` is exactly the hop the member may not follow.
   */
  it('13.1463 an epic reached only through an invisible link is not named — the same rule the list route already applies', async () => {
    const epicAbove = newUlid();
    const hiddenMiddle = newUlid();
    const visibleGrandchild = newUlid();
    await applyCommitted(db.pool, [
      created({ id: epicAbove, actorId: world.owner, typeId: 'epic', title: 'Confidential programme' }),
      created({ id: hiddenMiddle, actorId: world.owner, parentId: epicAbove, title: 'Hidden middle ticket' }),
      visibilitySet(hiddenMiddle, world.owner, [world.owner]),
      created({
        id: visibleGrandchild,
        actorId: world.owner,
        parentId: hiddenMiddle,
        title: 'Chase the review sign-off',
      }),
      visibilitySet(visibleGrandchild, world.owner, [world.owner, world.member]),
    ]);

    // POSITIVE CONTROL, FIRST, via the INDEPENDENT oracle — the same shape
    // 13.1461 uses and for the same reason.
    expect(await canSee(db.pool, world.member, visibleGrandchild)).toBe(true);

    const memberEff = await resolveEffectiveRole(db.pool, world.member, world.workspaceId);
    const asMember = await boardAncestryFor(db.pool, memberEff, world.member, world.workspaceId, [
      visibleGrandchild,
    ]);
    expect(asMember.get(visibleGrandchild)?.epic).toBeNull();

    // CONTROL — the owner, who may see every hop, gets the real epic.
    const ownerEff = await resolveEffectiveRole(db.pool, world.owner, world.workspaceId);
    const asOwner = await boardAncestryFor(db.pool, ownerEff, world.owner, world.workspaceId, [visibleGrandchild]);
    expect(asOwner.get(visibleGrandchild)?.epic?.epicId).toBe(epicAbove);
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
