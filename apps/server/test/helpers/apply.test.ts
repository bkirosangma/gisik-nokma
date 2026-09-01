import { beforeEach, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { makeCommitted, resetEntitySeqs } from './apply.js';

/**
 * The contract test for the shared fixture builder, and it exists because a
 * defect HERE is not one task's defect: Plan 5 Tasks 5–15 all seed their
 * ledgers through `makeCommitted`, so a counter that lies would make eleven
 * tasks' evidence wrong in the same direction at once.
 *
 * Deliberately DB-free, for the same reason projection-order.test.ts is: the
 * numbering contract is not a database fact, and it must not become skippable
 * when Postgres is not running.
 *
 * What is asserted is the honesty the plan asked for in words: the per-entity
 * `seq` RESTARTS at 1 for every entity, exactly as `nextSeq` assigns it
 * (`src/ledger/event-store.ts`: `max(seq) + 1` scoped to entity_kind/entity_id),
 * while the per-workspace `workspaceSeq` cursor beside it climbs across all of
 * them, exactly as `nextWorkspaceSeq` assigns it (`max(workspace_seq) + 1`
 * scoped to workspace_id). A process-monotonic counter in either place would
 * still produce unique numbers and would still satisfy the ledger's two unique
 * constraints — which is precisely why the lie would be invisible without this
 * file.
 */
describe('makeCommitted — the two counters, and which is which', () => {
  beforeEach(() => {
    resetEntitySeqs();
  });

  it('gives two entities in ONE workspace a seq of 1 each, while the workspace cursor climbs 1 then 2', () => {
    // The observation the task asked for, made by assertion rather than by
    // reading the code: the entity counter restarts, the workspace counter does
    // not. A single monotonic counter passes neither half of this.
    const workspaceId = newUlid();
    const first = makeCommitted({
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'workspace.settings_set',
      payload: { staleDays: 3 },
      actorId: newUlid(),
    });
    const second = makeCommitted({
      workspaceId,
      entity: { kind: 'workflow', id: newUlid() },
      type: 'workflow.defined',
      payload: {},
      actorId: newUlid(),
    });

    expect([first.seq, second.seq]).toEqual([1, 1]);
    expect([first.workspaceSeq, second.workspaceSeq]).toEqual([1, 2]);
  });

  it('climbs the per-entity seq only for the SAME entity, and restarts the workspace cursor in a new workspace', () => {
    const workspaceA = newUlid();
    const workspaceB = newUlid();
    const entity = { kind: 'workspace', id: workspaceA } as const;

    const a1 = makeCommitted({
      workspaceId: workspaceA,
      entity,
      type: 'workspace.settings_set',
      payload: { staleDays: 1 },
      actorId: newUlid(),
    });
    const a2 = makeCommitted({
      workspaceId: workspaceA,
      entity,
      type: 'workspace.settings_set',
      payload: { staleDays: 2 },
      actorId: newUlid(),
    });
    const b1 = makeCommitted({
      workspaceId: workspaceB,
      entity: { kind: 'workspace', id: workspaceB },
      type: 'workspace.settings_set',
      payload: { staleDays: 3 },
      actorId: newUlid(),
    });

    expect([a1.seq, a2.seq]).toEqual([1, 2]);
    expect([a1.workspaceSeq, a2.workspaceSeq]).toEqual([1, 2]);
    // A second workspace is a second stream: its cursor starts over, which is
    // what `nextWorkspaceSeq` does and what the ledger's
    // UNIQUE (workspace_id, workspace_seq) permits.
    expect([b1.seq, b1.workspaceSeq]).toEqual([1, 1]);
  });

  it('honours an explicit seq or workspaceSeq and never rewinds either cursor behind it', () => {
    // Out-of-order seeding is a real need for Tasks 5–15 (a replica's catch-up,
    // a deliberate gap), so an explicit number must both be used AND move the
    // cursor forward — otherwise the next implicit call re-mints a number the
    // ledger already holds and the seeding dies on a unique violation instead
    // of testing anything.
    const workspaceId = newUlid();
    const entity = { kind: 'workspace', id: workspaceId } as const;
    const jumped = makeCommitted({
      workspaceId,
      entity,
      type: 'workspace.settings_set',
      payload: { staleDays: 1 },
      actorId: newUlid(),
      seq: 7,
      workspaceSeq: 9,
    });
    const next = makeCommitted({
      workspaceId,
      entity,
      type: 'workspace.settings_set',
      payload: { staleDays: 2 },
      actorId: newUlid(),
    });

    expect([jumped.seq, jumped.workspaceSeq]).toEqual([7, 9]);
    expect([next.seq, next.workspaceSeq]).toEqual([8, 10]);
  });

  it('gives every event its own instant by default, so a test can tell WHICH event last wrote a row', () => {
    // `testEnvelope` rules on this hazard for the other fixture builder and the
    // reasoning transfers unchanged: one shared default instant makes an
    // assertion about the last writer pass whichever event actually wrote.
    // The claimed instant and the received instant also never collide across
    // events, so a clientTime/serverTime swap cannot read as correct either.
    const workspaceId = newUlid();
    const entity = { kind: 'workspace', id: workspaceId } as const;
    const events = [1, 2, 3].map((staleDays) =>
      makeCommitted({
        workspaceId,
        entity,
        type: 'workspace.settings_set',
        payload: { staleDays },
        actorId: newUlid(),
      }),
    );
    const stamps = events.flatMap((event) => [event.clientTime, event.serverTime]);
    expect(new Set(stamps).size).toBe(6);
    for (const event of events) {
      expect(Date.parse(event.clientTime)).toBeLessThan(Date.parse(event.serverTime));
    }
    // The first call still lands on the fixture epoch the rest of the suite
    // writes by hand, so a seeded history reads the same as a hand-built one.
    expect(events[0]?.clientTime).toBe('2026-08-20T09:00:00.000Z');
    expect(events[0]?.serverTime).toBe('2026-08-20T09:00:01.000Z');
  });

  it('resetEntitySeqs restarts both counters and the clock', () => {
    const workspaceId = newUlid();
    const entity = { kind: 'workspace', id: workspaceId } as const;
    const before = makeCommitted({
      workspaceId,
      entity,
      type: 'workspace.settings_set',
      payload: { staleDays: 1 },
      actorId: newUlid(),
    });
    makeCommitted({
      workspaceId,
      entity,
      type: 'workspace.settings_set',
      payload: { staleDays: 2 },
      actorId: newUlid(),
    });
    resetEntitySeqs();
    const after = makeCommitted({
      workspaceId,
      entity,
      type: 'workspace.settings_set',
      payload: { staleDays: 3 },
      actorId: newUlid(),
    });

    expect([after.seq, after.workspaceSeq]).toEqual([before.seq, before.workspaceSeq]);
    expect(after.serverTime).toBe(before.serverTime);
  });
});
