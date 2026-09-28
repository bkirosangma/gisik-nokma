import { describe, expect, it } from 'vitest';
import { newUlid, PURGE_RULE, PURGED_REASON } from '@gisik-nokma/domain';
import { createOutbox } from '../src/outbox/outbox.js';
import { WS, apply, claim, freshReplica, queue, ticketCreated } from './purge-world.js';

/**
 * Trash series Plan 3, Task 6 (deviation D6) — spec §5.7: a claim "refused at
 * the door ('This item was permanently deleted') and dropped from its outbox
 * with a visible notice — never silently".
 */

describe('19.183 a purge refusal becomes a notice', () => {
  it('19.183 removes the claim into a notice; another refusal stays a failed row with its lastError', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [T, S] = [newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), ticketCreated(S)]);
    const gone = claim({ kind: 'ticket', id: T }, 'ticket.field_set', { fieldId: 'title', value: 'offline' });
    const other = claim({ kind: 'ticket', id: S }, 'ticket.field_set', { fieldId: 'title', value: 'offline too' });
    await queue(storage, gone);
    await queue(storage, other);

    await outbox.applyResult(gone.id, { status: 'refused', eventId: gone.id, rule: PURGE_RULE, reason: PURGED_REASON });
    await outbox.applyResult(other.id, {
      status: 'refused',
      eventId: other.id,
      rule: 'restrict-to',
      reason: 'Only admins may make this move.',
    });

    expect((await outbox.notices(WS)).map((notice) => notice.noticeId)).toEqual([gone.id]);
    const failed = await outbox.failedItems(WS);
    expect(failed.map((item) => item.eventId)).toEqual([other.id]);
    // CONTROL
    expect(failed[0]?.lastError).toBe('restrict-to: Only admins may make this move.');
  });
});

describe('19.184 failed rows and notices can be read and dismissed', () => {
  it('19.184 dismissFailed deletes only a failed row; dismissNotice deletes a notice', async () => {
    const { storage, replica } = await freshReplica();
    const outbox = createOutbox({ storage, replica });
    const [T, S, Q] = [newUlid(), newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T), ticketCreated(S), ticketCreated(Q)]);
    const refused = claim({ kind: 'ticket', id: S }, 'ticket.field_set', { fieldId: 'title', value: 'x' });
    const purged = claim({ kind: 'ticket', id: T }, 'ticket.field_set', { fieldId: 'title', value: 'y' });
    const waiting = claim({ kind: 'ticket', id: Q }, 'ticket.field_set', { fieldId: 'title', value: 'z' });
    for (const event of [refused, purged, waiting]) await queue(storage, event);
    await outbox.applyResult(refused.id, { status: 'refused', eventId: refused.id, rule: 'restrict-to', reason: 'No.' });
    await outbox.applyResult(purged.id, { status: 'refused', eventId: purged.id, rule: PURGE_RULE, reason: PURGED_REASON });

    expect((await outbox.failedItems(WS))[0]?.lastError).toBe('restrict-to: No.');
    await outbox.dismissFailed(refused.id);
    await outbox.dismissNotice(purged.id);

    expect(await outbox.failedItems(WS)).toEqual([]);
    expect(await outbox.notices(WS)).toEqual([]);
    // CONTROL: a queued row is not a failed row
    await outbox.dismissFailed(waiting.id);
    expect(await outbox.queuedCount(WS)).toBe(1);
  });
});
