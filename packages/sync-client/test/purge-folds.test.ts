import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildPendingOverlay } from '../src/precheck/local-context.js';
import { P, TYPE, claim, envelope, freshReplica, queue, ticketCreated } from './purge-world.js';

/**
 * Trash series Plan 3, Task 4 (deviation D8; Plan 2's D7). The server never
 * delivers a redacted `ticket.created` (a purged ticket is invisible), so these
 * are guards: without them `applyTicketEvent`'s NAMED throw would stall the
 * engine, or poison the pending overlay, on the first one that did arrive.
 */

describe('19.174 the replica folds no ticket from a redacted creation', () => {
  it('19.174 applies it without throwing and holds no ticket; an ordinary creation folds', async () => {
    const { replica } = await freshReplica();
    const R = newUlid();
    const redacted = envelope({ kind: 'ticket', id: R }, 'ticket.created', { projectId: P, purged: true }, { seq: 1 });
    await expect(replica.applyServerItem(redacted)).resolves.toEqual({ applied: true });
    expect(await replica.getTicket(R)).toBeNull();
    // CONTROL
    const L = newUlid();
    await replica.applyServerItem(ticketCreated(L));
    expect((await replica.getTicket(L))?.confirmed?.id).toBe(L);
  });
});

describe('19.175 the pending overlay skips a redacted creation', () => {
  it('19.175 produces no state and no unfoldable mark; an ordinary queued creation folds', async () => {
    const { storage, replica } = await freshReplica();
    const R = newUlid();
    await queue(storage, claim({ kind: 'ticket', id: R }, 'ticket.created', { projectId: P, purged: true }));
    const L = newUlid();
    await queue(
      storage,
      claim({ kind: 'ticket', id: L }, 'ticket.created', { typeId: TYPE, projectId: P, parentId: null, title: 'Queued' }),
    );

    const overlay = await buildPendingOverlay({ storage, replica });

    expect(overlay.unfoldable.has(R)).toBe(false);
    expect(overlay.states.has(R)).toBe(false);
    expect(overlay.queuedEventIds.get(R)).toHaveLength(1);
    // CONTROL
    expect(overlay.states.get(L)?.id).toBe(L);
  });
});
