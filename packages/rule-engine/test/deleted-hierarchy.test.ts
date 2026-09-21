import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketCreated, checkTicketReparented } from '../src/checks/hierarchy.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, PROJECT_B, STORY, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

/**
 * E6-4 — a soft-deleted ticket is not open work and is not a parent.
 *
 * Two doors, one cause: the engine's context serves deleted rows by documented
 * design (the undo needs them), and two callers never added the predicate the
 * reader's docblock hands them. `transition.ts` counted a deleted open child as
 * a blocker for its parent's close — a refusal about a child no view can show —
 * and `checks/hierarchy.ts` resolved a deleted parent like a live one, so new
 * children could be created under, or moved to, a ticket that "stops appearing
 * in views".
 *
 * Every refusal here is paired with its live twin in the same case: the same
 * event against the same shape of world with the one difference (the delete)
 * removed, so a refusal is the flag answering and never a door refusing the
 * type.
 */

const P = '01J9GPAR000000000000000000';
const C = '01J9GCHD000000000000000000';
const C2 = '01J9GCHD200000000000000000';
const NEW = '01J9GNEW000000000000000000';
const DP = '01J9GDPR000000000000000000';
const LP = '01J9GKPR000000000000000000';
const MOVER = '01J9GMVR000000000000000000';

const on = (id: string, type: string, payload: unknown): EventEnvelope =>
  makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, payload });

const defs = () => [typeDefined(STORY), typeDefined(TASK)];

describe('17.122 E6-4 — a soft-deleted child is not open work', () => {
  it('E6-4: a parent closes over a DELETED open child, and is still refused over a LIVE one', async () => {
    // P has two open children. Delete one; the other is the control that the
    // count is still taken — it refuses with "1", which is the live child and
    // not the deleted one.
    const both = buildMemoryContext([WF], [
      ...defs(),
      created(P, 'story', null),
      created(C, 'task', P),
      created(C2, 'task', P),
      on(P, 'ticket.transitioned', { to: 'doing' }),
      on(C, 'ticket.deleted', {}),
    ]);
    expect(await evaluateEvent(on(P, 'ticket.transitioned', { to: 'done' }), both)).toEqual({
      refused: true,
      rule: 'parent-terminal-with-open-children',
      reason: 'This ticket cannot enter "Done" while 1 of its child tickets is still open.',
    });
    // Delete the live one too, and nothing open remains: the close is accepted.
    const onlyDeleted = buildMemoryContext([WF], [
      ...defs(),
      created(P, 'story', null),
      created(C, 'task', P),
      created(C2, 'task', P),
      on(P, 'ticket.transitioned', { to: 'doing' }),
      on(C, 'ticket.deleted', {}),
      on(C2, 'ticket.deleted', {}),
    ]);
    expect(await evaluateEvent(on(P, 'ticket.transitioned', { to: 'done' }), onlyDeleted)).toEqual({ refused: false });
    // And the twin with the SAME children, none deleted, is refused with "2" —
    // so the accept above is the delete being read, not the invariant gone.
    const noneDeleted = buildMemoryContext([WF], [
      ...defs(),
      created(P, 'story', null),
      created(C, 'task', P),
      created(C2, 'task', P),
      on(P, 'ticket.transitioned', { to: 'doing' }),
    ]);
    expect(await evaluateEvent(on(P, 'ticket.transitioned', { to: 'done' }), noneDeleted)).toMatchObject({
      rule: 'parent-terminal-with-open-children',
      reason: 'This ticket cannot enter "Done" while 2 of its child tickets are still open.',
    });
  });

  it('E6-4: a deleted child that was RESTORED counts again — the flag is read, not the history', async () => {
    const ctx = buildMemoryContext([WF], [
      ...defs(),
      created(P, 'story', null),
      created(C, 'task', P),
      on(P, 'ticket.transitioned', { to: 'doing' }),
      on(C, 'ticket.deleted', {}),
      on(C, 'ticket.restored', {}),
    ]);
    expect(await evaluateEvent(on(P, 'ticket.transitioned', { to: 'done' }), ctx)).toMatchObject({
      rule: 'parent-terminal-with-open-children',
    });
  });
});

describe('17.123 E6-4 — a soft-deleted ticket is not a parent', () => {
  /** A deleted story DP and a live story LP, side by side, in the same project. */
  const parents = (...after: EventEnvelope[]) =>
    buildMemoryContext([WF], [
      ...defs(),
      created(DP, 'story', null),
      created(LP, 'story', null),
      created(MOVER, 'task', null),
      on(DP, 'ticket.deleted', {}),
      ...after,
    ]);

  const REFUSAL = {
    refused: true,
    rule: 'hierarchy.parent-deleted',
    reason: 'The chosen parent ticket is deleted. Restore it, or pick another parent.',
  };

  it('E6-4: ticket.created under a deleted parent is refused, and under its live twin accepted', async () => {
    expect(await checkTicketCreated(created(NEW, 'task', DP), parents())).toEqual(REFUSAL);
    expect(await checkTicketCreated(created(NEW, 'task', LP), parents())).toEqual({ refused: false });
    // Through the dispatch too — the live-ticket gate (E6-2) exempts
    // `ticket.created`, so this is the hierarchy check answering.
    expect(await evaluateEvent(created(NEW, 'task', DP), parents())).toEqual(REFUSAL);
  });

  it('E6-4: ticket.reparented onto a deleted parent is refused, and onto its live twin accepted', async () => {
    const move = (to: string) => on(MOVER, 'ticket.reparented', { newParentId: to });
    // The mover sits at project root, so each twin below is a genuine move.
    const ctx = parents();
    expect(await checkTicketReparented(move(DP), ctx)).toEqual(REFUSAL);
    expect(await checkTicketReparented(move(LP), ctx)).toEqual({ refused: false });
    expect(await evaluateEvent(move(DP), ctx)).toEqual(REFUSAL);
  });

  it('E6-4: a restored parent takes children again', async () => {
    const ctx = parents(on(DP, 'ticket.restored', {}));
    expect(await checkTicketCreated(created(NEW, 'task', DP), ctx)).toEqual({ refused: false });
  });

  it('E6-4: which refusal names the event — a deleted parent outranks a cross-project one, and an unknown parent outranks both', async () => {
    // A deleted parent in ANOTHER project: "pick a parent from the same
    // project" would send the actor looking for a ticket no view shows. The
    // more specific answer is the one they can act on.
    const foreignDeleted = buildMemoryContext([WF], [
      ...defs(),
      created(DP, 'story', null, PROJECT_B),
      on(DP, 'ticket.deleted', {}),
    ]);
    expect(await checkTicketCreated(created(NEW, 'task', DP, PROJECT), foreignDeleted)).toEqual(REFUSAL);
    // The control that the ordering is real: the same foreign parent NOT
    // deleted answers cross-project.
    const foreignLive = buildMemoryContext([WF], [...defs(), created(DP, 'story', null, PROJECT_B)]);
    expect(await checkTicketCreated(created(NEW, 'task', DP, PROJECT), foreignLive)).toMatchObject({ rule: 'hierarchy.cross-project' });
    // And a parent that does not exist at all is still `unknown-parent` —
    // there is no flag to read on nothing.
    const GHOST = '01J9GGHT000000000000000000';
    expect(await checkTicketCreated(created(NEW, 'task', GHOST), parents())).toMatchObject({ rule: 'hierarchy.unknown-parent' });
  });
});
