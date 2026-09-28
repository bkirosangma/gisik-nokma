import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, PURGED_OUTBOX_NOTICE, type SubmittedEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { dueAt, recordingStore } from '../purge/world.js';
import { createHarness, TASK_TYPE_ID, USER_A, USER_ADMIN, type Harness, type HarnessClient } from './rig.js';

/**
 * Trash series Plan 3, Task 6 — Review Focus 1, through the real server: a
 * device's offline edit to a ticket that is purged while it is offline.
 */

let h: Harness;
let a: HarnessClient;

beforeEach(async () => {
  h = await createHarness();
  a = await h.client(USER_A);
});

afterEach(async () => {
  await h.drop();
});

function ticketEvent(
  actorId: string,
  ticketId: string,
  type: string,
  payload: unknown,
  origin: SubmittedEvent['origin'] = 'web',
): SubmittedEvent {
  return newSubmittedEvent({ workspaceId: h.workspaceId, entity: { kind: 'ticket', id: ticketId }, type, payload, actorId, origin });
}

describe('19.187 an offline edit to a ticket purged meanwhile', () => {
  it('19.187 comes back refused, becomes a notice, and the lookup erases the ticket; the edit to the survivor commits', async () => {
    const [T, S] = [newUlid(), newUlid()];
    const created = await h.ingestInteractive(USER_ADMIN, [
      ticketEvent(USER_ADMIN, T, 'ticket.created', {
        typeId: TASK_TYPE_ID,
        projectId: h.projectId,
        parentId: null,
        title: 'Doomed while A is offline',
      }),
      ticketEvent(USER_ADMIN, S, 'ticket.created', {
        typeId: TASK_TYPE_ID,
        projectId: h.projectId,
        parentId: null,
        title: 'Survives',
      }),
    ]);
    expect(created.map((result) => result.status)).toEqual(['committed', 'committed']);
    await a.syncDown();
    expect(await a.replica.getTicket(T)).not.toBeNull();

    const edit = ticketEvent(USER_A, T, 'ticket.field_set', { fieldId: 'title', value: 'Edited offline' }, 'desktop');
    const keep = ticketEvent(USER_A, S, 'ticket.field_set', { fieldId: 'title', value: 'Also edited offline' }, 'desktop');
    await a.submit(edit);
    await a.submit(keep);

    const marked = await h.ingestInteractive(USER_ADMIN, [
      ticketEvent(USER_ADMIN, T, 'ticket.deleted', {}),
      ticketEvent(USER_ADMIN, T, 'purge.marked', {}),
    ]);
    expect(marked.map((result) => result.status)).toEqual(['committed', 'committed']);
    await purgeItem(h.pool, { kind: 'ticket', id: T }, {
      projections: buildProjectionRegistry(),
      store: recordingStore(),
      now: await dueAt(h.pool, 'ticket', T),
    });

    await a.goOnline();
    // The refusal ALONE leaves the outbox as a notice — before the lookup runs.
    // Without this the lookup's own erase would produce the same notice from a
    // failed row and the `applyResult` arm could be deleted unseen.
    expect((await a.outbox.notices(h.workspaceId)).map((notice) => notice.noticeId)).toEqual([edit.id]);
    expect(await a.outbox.failedItems(h.workspaceId)).toEqual([]);
    await a.engine.learnPurges(h.workspaceId);

    expect(await a.outbox.notices(h.workspaceId)).toEqual([
      expect.objectContaining({ noticeId: edit.id, entityKind: 'ticket', entityId: T, eventType: 'ticket.field_set' }),
    ]);
    expect(await a.outbox.failedItems(h.workspaceId)).toEqual([]);
    expect(await a.replica.getTicket(T)).toBeNull();
    expect(await a.ds.query.syncNotices(h.workspaceId)).toEqual([{ id: `purged:${edit.id}`, text: PURGED_OUTBOX_NOTICE }]);
    // CONTROL
    expect(await a.outbox.queuedCount(h.workspaceId)).toBe(0);
    expect((await h.projTicket(S))?.fields['title']?.value).toBe('Also edited offline');
  });
});
