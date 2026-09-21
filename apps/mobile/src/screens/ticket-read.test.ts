import { describe, expect, it, vi } from 'vitest';
import { loadTicket } from './ticket-read.js';
import type { ReplicaDataSource } from '@gisik-nokma/app-core';

/**
 * 12.400 — E2-41(b): a rejected ticket read resolves to `{ok: false, error}`
 * instead of an unhandled rejection, so `TicketScreen` can distinguish "no
 * answer yet" from "the answer failed" instead of showing "Opening…" forever
 * for both.
 */
describe('loadTicket', () => {
  it('resolves the ticket on success', async () => {
    const ticket = { ticketId: 't1' } as unknown;
    const ds = { query: { getTicketWithPending: vi.fn(async () => ticket) } } as unknown as ReplicaDataSource;
    const result = await loadTicket(ds, 't1');
    expect(result).toEqual({ ok: true, ticket });
  });

  it('12.400 — reports the failure instead of rejecting when the read fails', async () => {
    const ds = {
      query: {
        getTicketWithPending: vi.fn(async () => {
          throw new Error('replica unavailable');
        }),
      },
    } as unknown as ReplicaDataSource;
    const result = await loadTicket(ds, 't1');
    expect(result).toEqual({ ok: false, error: 'replica unavailable' });
  });
});
