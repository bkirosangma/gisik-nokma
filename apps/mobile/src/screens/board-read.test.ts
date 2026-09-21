import { describe, expect, it, vi } from 'vitest';
import { loadBoard } from './board-read.js';
import type { ReplicaDataSource, TicketSummary } from '@gisik-nokma/app-core';

/**
 * 12.409–12.410 — E2-41: a rejected board read resolves to `{ok: false, error}`
 * instead of an unhandled rejection, so `BoardScreen` can render the failure
 * instead of an empty board that looks like "no tickets" rather than "could
 * not ask". (Renumbered from 12.398/12.399 — both collided with independent
 * mints on other release branches; B14 renumbers into its own id, per the
 * controller's ruling: main's numbering never moves.)
 */
describe('loadBoard', () => {
  const ticket: TicketSummary = {
    ticketId: 't1',
    title: 'A ticket',
    stateId: 'open',
    pending: false,
    openContests: 0,
  } as TicketSummary;

  it('resolves the confirmed list when the query is empty', async () => {
    const ds = {
      query: {
        listTicketSummaries: vi.fn(async () => [ticket]),
        searchOfflineCopy: vi.fn(),
      },
    } as unknown as ReplicaDataSource;
    const result = await loadBoard(ds, 'ws1', '');
    expect(result).toEqual({ ok: true, tickets: [ticket], offlineCopy: false });
  });

  it('12.409 — reports the failure instead of rejecting when the confirmed read fails', async () => {
    const ds = {
      query: {
        listTicketSummaries: vi.fn(async () => {
          throw new Error('replica unavailable');
        }),
        searchOfflineCopy: vi.fn(),
      },
    } as unknown as ReplicaDataSource;
    const result = await loadBoard(ds, 'ws1', '');
    expect(result).toEqual({ ok: false, error: 'replica unavailable' });
  });

  it('12.410 — reports the failure instead of rejecting when the search read fails', async () => {
    const ds = {
      query: {
        listTicketSummaries: vi.fn(async () => [ticket]),
        searchOfflineCopy: vi.fn(async () => {
          throw new Error('index unavailable');
        }),
      },
    } as unknown as ReplicaDataSource;
    const result = await loadBoard(ds, 'ws1', 'search text');
    expect(result).toEqual({ ok: false, error: 'index unavailable' });
  });
});
