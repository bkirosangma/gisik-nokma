import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketDeleted, checkTicketRestored } from '../src/checks/deletion.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

/**
 * The soft-delete pair's doors, laid out as a mirror of `close.test.ts` — the
 * same six arms per handler, in the same order, so a reviewer can diff the two
 * files and see that nothing was decided differently without being noticed.
 *
 * **Each refusal is paired with its opposite in the same `it`,** which is the
 * convention this repo settled on for reversible flags: a suite that only proves
 * "a second delete is refused" cannot distinguish that from a door that refuses
 * every delete, so the accepting arm runs through the identical call.
 *
 * **What this file does NOT test, and where it lives instead:** AUTHORIZATION.
 * "Only a project admin can delete" is `checkVisibilityPermission`'s sixth check
 * (`apps/server/src/permissions/check-permission.ts`), because this engine's
 * context carries no membership at all — see `checks/deletion.ts`'s own header.
 * Its cases are in `apps/server/test/permissions/check-visibility-permission.test.ts`,
 * and a reader looking for the guest-refused case should go there rather than
 * concluding from this file that any member may delete anything.
 */

const T = '01J9GTKT000000000000000000';
const deleteEvent = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.deleted', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: {} });
const restoreEvent = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.restored', entity: { kind: 'ticket', id: T }, workspaceId: WS, payload: {} });

const ctx = (...after: EventEnvelope[]) =>
  buildMemoryContext([WF], [typeDefined(TASK), created(T, 'task', null, PROJECT), ...after]);

/** A misfiled entity kind for each event type — a legitimate `EntityKind` other than 'ticket'. */
const deleteWrongKind = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.deleted', entity: { kind: 'ticket-type', id: T }, workspaceId: WS, payload: {} });
const restoreWrongKind = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.restored', entity: { kind: 'ticket-type', id: T }, workspaceId: WS, payload: {} });

/**
 * The payload is EMPTY and STRICT, so the malformed arm needs a key the schema
 * does not name. `{ reason }` is the one a caller would actually reach for —
 * every other ticket event that carries a sentence names it `reason` — which is
 * exactly why the schema must refuse it rather than stripping it.
 */
const deleteWithPayload = (): EventEnvelope =>
  makeEnvelope({
    type: 'ticket.deleted',
    entity: { kind: 'ticket', id: T },
    workspaceId: WS,
    payload: { reason: 'duplicate of #412' },
  });

/** A ticket id that resolves to nothing — the `unknown-ticket` arm. */
const UNKNOWN = '01J9GONE000000000000000000';
const deleteUnknown = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.deleted', entity: { kind: 'ticket', id: UNKNOWN }, workspaceId: WS, payload: {} });
const restoreUnknown = (): EventEnvelope =>
  makeEnvelope({ type: 'ticket.restored', entity: { kind: 'ticket', id: UNKNOWN }, workspaceId: WS, payload: {} });

describe('checkTicketDeleted', () => {
  it('accepts a delete of a live ticket', async () => {
    expect(await checkTicketDeleted(deleteEvent(), ctx())).toEqual({ refused: false });
  });

  it('refuses a second delete, naming it, and accepts one after a restore', async () => {
    // The refusal arm and its opposite through one call each. The guard is
    // LOAD-BEARING rather than symmetric ceremony: the reducer writes
    // `deleted: { actorId, at }` from the ENVELOPE (pinned in
    // `packages/domain/test/ticket-state.test.ts`), so a second delete would
    // silently overwrite the first deleter's id and instant in an append-only
    // ledger — and the surface renders "deleted by A on Monday", which is the
    // history this feature exists to retain.
    expect(await checkTicketDeleted(deleteEvent(), ctx(deleteEvent()))).toEqual({
      refused: true,
      rule: 'already-deleted',
      reason: 'This ticket is already deleted.',
    });
    // The opposite, through the same call: restore first and the same envelope
    // is ACCEPTED. Without this arm a guard that refused every second event of
    // any kind would pass the assertion above.
    expect(await checkTicketDeleted(deleteEvent(), ctx(deleteEvent(), restoreEvent()))).toEqual({ refused: false });
  });

  it('refuses a delete of a ticket nobody ever created', async () => {
    expect(await checkTicketDeleted(deleteUnknown(), ctx())).toEqual({
      refused: true,
      rule: 'unknown-ticket',
      reason: `This event deletes ticket ${UNKNOWN}, but no such ticket is known.`,
    });
  });

  it('refuses a payload the empty-and-strict schema does not name', async () => {
    // The CAUSE is named, not merely "something was refused": a schema that
    // rejected every delete would satisfy a bare `refused: true`, and this
    // asserts the reason key is what did it.
    const result = await checkTicketDeleted(deleteWithPayload(), ctx());
    expect(result).toMatchObject({ refused: true, rule: 'malformed-payload' });
    expect(result.refused && result.reason).toContain('payload is malformed');
    expect(result.refused && result.reason).toContain('reason');
  });

  it('refuses a misfiled kind, naming it, rather than accepting it', async () => {
    expect(await checkTicketDeleted(deleteWrongKind(), ctx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This ticket.deleted event does not point at a ticket; it points at a ticket-type.',
    });
  });

  it('is reachable through evaluateEvent', async () => {
    expect(await evaluateEvent(deleteEvent(), ctx())).toEqual({ refused: false });
    expect(await evaluateEvent(deleteEvent(), ctx(deleteEvent()))).toMatchObject({ rule: 'already-deleted' });
  });

  it('ACCEPTS a ticket.restored envelope — a stranger event is not this door\'s to refuse', async () => {
    // `evaluateEvent`'s dispatch guarantees this; the `env.type` guard is what
    // makes the guarantee hold when the handler is called directly, which every
    // other check in this package relies on too (`close.ts`'s own note).
    expect(await checkTicketDeleted(restoreEvent(), ctx())).toEqual({ refused: false });
  });
});

describe('checkTicketRestored', () => {
  it('accepts the undo of a deleted ticket', async () => {
    expect(await checkTicketRestored(restoreEvent(), ctx(deleteEvent()))).toEqual({ refused: false });
  });

  it('refuses a restore of a ticket nobody deleted, and accepts one after a delete', async () => {
    // The mirror of `not-closed`, and the reason it exists: restoring a ticket
    // that was never deleted would append an event whose only effect is to fold
    // `deleted: null` onto `null` — accepted, attributed, and meaning nothing.
    // The opposite arm goes through the identical call with one event added, so
    // a door that refused every restore cannot pass this block.
    expect(await checkTicketRestored(restoreEvent(), ctx())).toEqual({
      refused: true,
      rule: 'not-deleted',
      reason: 'This ticket is not deleted.',
    });
    expect(await checkTicketRestored(restoreEvent(), ctx(deleteEvent()))).toEqual({ refused: false });
  });

  it('refuses a restore of a ticket nobody ever created', async () => {
    expect(await checkTicketRestored(restoreUnknown(), ctx())).toEqual({
      refused: true,
      rule: 'unknown-ticket',
      reason: `This event restores ticket ${UNKNOWN}, but no such ticket is known.`,
    });
  });

  it('refuses a misfiled kind, naming it, rather than accepting it', async () => {
    expect(await checkTicketRestored(restoreWrongKind(), ctx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This ticket.restored event does not point at a ticket; it points at a ticket-type.',
    });
  });

  it('is reachable through evaluateEvent, both arms', async () => {
    expect(await evaluateEvent(restoreEvent(), ctx(deleteEvent()))).toEqual({ refused: false });
    expect(await evaluateEvent(restoreEvent(), ctx())).toMatchObject({ rule: 'not-deleted' });
  });

  it('ACCEPTS a ticket.deleted envelope — a stranger event is not this door\'s to refuse', async () => {
    expect(await checkTicketRestored(deleteEvent(), ctx())).toEqual({ refused: false });
  });
});

/**
 * The pair is REVERSIBLE, which is the product's whole claim about it — the FAQ
 * says *"deleted"* rather than *"erased"* precisely because an undo exists. This
 * walks the full round trip through `evaluateEvent` rather than through the two
 * handlers, so the two dispatch arms are exercised in the order a real client
 * sends them.
 */
describe('the delete/restore round trip through the dispatch', () => {
  it('delete then restore leaves the ticket deletable and restorable again', async () => {
    const afterDelete = ctx(deleteEvent());
    const afterRestore = ctx(deleteEvent(), restoreEvent());
    expect(await evaluateEvent(restoreEvent(), afterDelete)).toEqual({ refused: false });
    // The undo does not merely clear a flag — it returns the ticket to the
    // state a never-deleted ticket is in, so BOTH doors answer as they would
    // for one. A `restored` implementation that folded a third value would
    // leave this ticket permanently un-restorable and this line would redden.
    expect(await evaluateEvent(deleteEvent(), afterRestore)).toEqual({ refused: false });
    expect(await evaluateEvent(restoreEvent(), ctx(deleteEvent(), restoreEvent(), deleteEvent()))).toEqual({
      refused: false,
    });
  });
});
