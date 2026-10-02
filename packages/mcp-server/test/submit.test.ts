import { describe, expect, it } from 'vitest';
import { submitBatch } from '../src/tools/submit.js';
import type { Session } from '../src/session.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

/**
 * MCP CRUD plan, Task 5. Case 14.302.
 */
const ok = (i: number) => ({ status: 'committed', eventId: `e${i}`, seq: i, serverTime: '2026-10-01T10:00:00.000Z' });
function session(results: unknown[]): Session {
  return { userId: () => 'U', get: async () => ({}), post: async () => ({}), postEvents: async () => ({ results }), ...NO_TRANSFER };
}

describe('14.302 submitBatch', () => {
  it('14.302 all committed → every result; a refusal → its own words with its index', async () => {
    // CONTROL, same `it`: an all-committed batch returns ALL n results, not only the last.
    const all = await submitBatch(session([ok(1), ok(2)]), [{} as never, {} as never]);
    expect(all).toEqual([ok(1), ok(2)]);

    await expect(
      submitBatch(
        session([ok(1), { status: 'refused', eventId: 'e2', rule: 'role', reason: 'Only an admin can do that.' }]),
        [{} as never, {} as never],
      ),
    ).rejects.toThrow('event 1 refused by role: Only an admin can do that.');
    await expect(
      submitBatch(
        session([{ status: 'invalid', eventId: null, code: 'bad_payload', message: 'name is required' }, ok(2)]),
        [{} as never, {} as never],
      ),
    ).rejects.toThrow('event 0 bad_payload: name is required');
    await expect(submitBatch(session([ok(1)]), [{} as never, {} as never])).rejects.toThrow(/different number of results/);
  });
});
