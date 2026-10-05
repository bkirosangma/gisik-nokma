import { describe, expect, it } from 'vitest';
import { makeSubmittedFactory } from '../../src/submit.js';
import { OfflineAcceptError } from '../../src/replica/replica-data-source.js';
import { discardCounts, discardDraft, publishDraft, publishEvents, subDraftsOf } from '../../src/views/draft-actions.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import type { DraftRow } from '../../src/view-types.js';

const WS = 'ws1';
const make = makeSubmittedFactory({ actorId: 'u1', origin: 'web' });
const row = (ticketId: string, parentId: string | null, attachmentCount: number | null = 0): DraftRow => ({
  ticketId, projectId: 'p1', projectName: 'Roads', typeId: 'task', title: ticketId, parentId,
  updatedAt: '2026-10-03T08:00:00.000Z', attachmentCount, pending: false,
});
const listRow = (ticketId: string, rank: string | null) => ({ ticketId, stateId: 'backlog', rank }) as never;

describe('28.159 subDraftsOf and discardCounts', () => {
  const drafts = [row('root', null, 1), row('kid', 'root', 2), row('grandkid', 'kid', 3), row('sib', null, 4), row('sibkid', 'sib', 5)];
  it('28.159 descendants only, summed attachments, null when one is unknown, a cycle terminates', () => {
    expect(subDraftsOf(drafts, 'root').map((d) => d.ticketId)).toEqual(['kid', 'grandkid']);
    expect(discardCounts(drafts, 'root')).toEqual({ subDrafts: 2, attachments: 6 });
    expect(discardCounts(drafts, 'sib')).toEqual({ subDrafts: 1, attachments: 9 });
    expect(discardCounts([row('a', null, null), row('b', 'a', 2)], 'a')).toEqual({ subDrafts: 1, attachments: null });
    // The control: a (malformed) cycle terminates instead of spinning.
    expect(subDraftsOf([row('x', 'y'), row('y', 'x')], 'x').map((d) => d.ticketId)).toEqual(['y']);
  });
});

describe('28.160 publishEvents', () => {
  it('28.160 publishes first, backfills unranked rows in drawn order, then ranks the draft last', () => {
    const events = publishEvents(make, {
      workspaceId: WS, draft: { ticketId: 'd1', projectId: 'p1' },
      backlog: [{ ticketId: 'a', rank: 'a0' }, { ticketId: 'u2', rank: null }, { ticketId: 'u1', rank: null }, { ticketId: 'd1', rank: null }],
    });
    expect(events.map((e) => e.type)).toEqual(['ticket.published', 'ticket.ranked', 'ticket.ranked', 'ticket.ranked']);
    expect(events[0]).toMatchObject({ entity: { kind: 'ticket', id: 'd1' }, payload: { projectId: 'p1' } });
    // Drawn order is `compareByRank`'s (`packages/domain/src/rank.ts:85-93`: unranked rows by id), NOT the order given:
    // `u2` is listed before `u1`, so a backfill in input order would red here (the plan's ['u2','u1'] was input order).
    expect(events.slice(1).map((e) => e.entity.id)).toEqual(['u1', 'u2', 'd1']);
    const keys = events.slice(1).map((e) => (e.payload as { rank: string }).rank);
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]! > 'a0').toBe(true);
    expect(events.every((e) => e.actorId === 'u1' && e.origin === 'web')).toBe(true);
  });
  it('28.160 an all-ranked Backlog has no backfill', () => {
    const events = publishEvents(make, {
      workspaceId: WS, draft: { ticketId: 'd1', projectId: 'p1' }, backlog: [{ ticketId: 'a', rank: 'a0' }],
    });
    expect(events.map((e) => e.entity.id)).toEqual(['d1', 'd1']);
    expect((events[1]!.payload as { rank: string }).rank > 'a0').toBe(true);
  });
});

describe('28.161 outcomes', () => {
  const input = { workspaceId: WS, ticketId: 'd1', projectId: 'p1' };
  const committed = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T09:00:00.000Z' } as const;
  // An unranked Backlog row `u` (so the read is visible in the events) and an unranked row in another state (so the
  // Backlog filter is): a publish that skipped the read, or ranked every row, sends a different list.
  const withBacklog = (ingest: (events: never[]) => unknown) =>
    createFakeDataSource(
      { getTickets: async () => ({ projectId: 'p1', rows: [listRow('a', 'a0'), listRow('u', null), { ticketId: 't9', stateId: 'todo', rank: null } as never] }) as never },
      ingest as never,
    );

  it('28.161 committed, a refused rank still committed, refused verbatim, invalid, queued, unreachable', async () => {
    const read = withBacklog((e) => e.map(() => committed));
    expect(await publishDraft(read, make, input)).toEqual({ status: 'committed' });
    expect(read.ingested[0]!.map((e) => [e.type, e.entity.id])).toEqual([
      ['ticket.published', 'd1'], ['ticket.ranked', 'u'], ['ticket.ranked', 'd1'],
    ]);
    expect(await publishDraft(withBacklog((e) => e.map((_, i) => (i === 0 ? committed : { status: 'refused', rule: 'r', reason: 'x' }))), make, input))
      .toEqual({ status: 'committed' });
    expect(await publishDraft(withBacklog(() => [{ status: 'refused', rule: 'draft.parent-unpublished', reason: 'Publish the parent first' }]), make, input))
      .toEqual({ status: 'refused', rule: 'draft.parent-unpublished', reason: 'Publish the parent first' });
    expect(await publishDraft(withBacklog(() => [{ status: 'invalid', code: 'bad', message: 'Bad event' }]), make, input))
      .toEqual({ status: 'refused', rule: 'bad', reason: 'Bad event' });
    expect(await publishDraft(withBacklog(() => { throw new OfflineAcceptError([{ status: 'pending', eventId: 'e' }]); }), make, input))
      .toEqual({ status: 'queued' });
    for (const broken of [() => { throw new Error('socket'); }, () => []]) {
      expect(await publishDraft(withBacklog(broken), make, input)).toEqual({
        status: 'unreachable', message: 'Could not publish this draft. Check your connection and try again.',
      });
    }
  });

  it('28.161 a Backlog read that fails is unreachable and publishes nothing (no rank guessed from an empty list)', async () => {
    const source = createFakeDataSource(
      { getTickets: async () => { throw new Error('socket'); } },
      ((events: never[]) => events.map(() => committed)) as never,
    );
    expect(await publishDraft(source, make, input)).toEqual({
      status: 'unreachable', message: 'Could not publish this draft. Check your connection and try again.',
    });
    expect(source.ingested).toEqual([]);
  });

  it('28.161 discardDraft sends exactly one ticket.discarded for the ticket', async () => {
    const source = createFakeDataSource({}, (events) => events.map(() => committed));
    expect(await discardDraft(source, make, input)).toEqual({ status: 'committed' });
    expect(source.ingested).toHaveLength(1);
    expect(source.ingested[0]!.map((e) => [e.type, e.entity.id, e.payload])).toEqual([['ticket.discarded', 'd1', {}]]);
  });
});
