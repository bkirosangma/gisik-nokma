import { describe, expect, it } from 'vitest';
import { mapDraftRows, mapTicketRead } from '../../src/online/mappers.js';
import { createOnlineDataSource } from '../../src/online/online-data-source.js';
import { ticketBody } from './helpers/ticket-body.js';

/** Case 28.151. */
describe('28.151 draft mappers', () => {
  it('28.151 draft is mapped from ticketState.draft, and a published read has no draft member', () => {
    const draft = mapTicketRead(ticketBody({ key: null, ticketState: { draft: { authorId: 'u1', at: '2026-10-03T08:00:00.000Z' } } }));
    expect(draft.draft).toBe(true);
    expect(draft.key).toBeNull();
    const published = mapTicketRead(ticketBody({ key: 'RP-1' }));
    expect('draft' in published).toBe(false);
    // `at` is valid, so only the `authorId` check can throw, and the path must name it (a bare /draft/ also matched
    // a throw about `at`, so dropping the authorId check passed).
    expect(() => mapTicketRead(ticketBody({ ticketState: { draft: { authorId: 3, at: '2026-10-03T08:00:00.000Z' } } })))
      .toThrow(/draft\.authorId/);
  });

  it('28.197 pendingChildren is mapped from ticketState, strict when present; absent on a ticket that holds none', () => {
    const held = mapTicketRead(ticketBody({ key: null, ticketState: { draft: { authorId: 'u1', at: '2026-10-03T08:00:00.000Z' }, pendingChildren: ['c1', 'c2'] } }));
    expect(held.ticket.pendingChildren).toEqual(['c1', 'c2']);
    expect('pendingChildren' in mapTicketRead(ticketBody({ key: 'RP-1' })).ticket).toBe(false);
    expect(() => mapTicketRead(ticketBody({ ticketState: { pendingChildren: ['c1', 7] } }))).toThrow(/pendingChildren\[1\]/);
    expect(() => mapTicketRead(ticketBody({ ticketState: { pendingChildren: 'c1' } }))).toThrow(/pendingChildren/);
  });

  it('28.151 mapDraftRows keeps the named fields and drops a planted key', () => {
    const rows = mapDraftRows({
      items: [
        { ticketId: 't1', projectId: 'p1', projectName: 'Roads', typeId: 'task', title: 'Pave', parentId: null,
          updatedAt: '2026-10-03T08:00:00.000Z', attachmentCount: 2, key: 'RP-9' },
        { ticketId: 't2', projectId: 'p1', projectName: null, typeId: 'task', title: 'Kerb', parentId: 't1',
          updatedAt: '2026-10-03T07:00:00.000Z', attachmentCount: 0 },
      ],
    });
    expect(rows).toEqual([
      { ticketId: 't1', projectId: 'p1', projectName: 'Roads', typeId: 'task', title: 'Pave', parentId: null,
        updatedAt: '2026-10-03T08:00:00.000Z', attachmentCount: 2, pending: false },
      { ticketId: 't2', projectId: 'p1', projectName: null, typeId: 'task', title: 'Kerb', parentId: 't1',
        updatedAt: '2026-10-03T07:00:00.000Z', attachmentCount: 0, pending: false },
    ]);
    expect(Object.keys(rows[0]!)).not.toContain('key');
  });

  it('28.151 the online source reads the workspace route', async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: string) => {
      calls.push(input);
      return { ok: true, status: 200, json: async () => ({ items: [] }) } as Response;
    };
    const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
    expect(await source.query.getMyDrafts('ws1')).toEqual([]);
    expect(calls).toEqual(['/v1/workspaces/ws1/drafts']);
  });
});
