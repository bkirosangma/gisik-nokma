import { describe, expect, it, vi } from 'vitest';
import {
  buildProjectPageQueryTickets,
  prioritizeProject,
  ticketRefCandidatesOf,
  ticketRefHrefIn,
} from '../src/ticket-ref-callbacks.js';

/**
 * 18.272 / 18.284 — Plan 7 Task 4 (spec §14, D26–D28): the project page's own
 * half of the `:ticket` picker and the ticket-ref chip's link. Split into four
 * small pure functions rather than tested inline inside `page.tsx` — that file
 * has no exported surface of its own, and `apps/web/test/description-editable.test.tsx`
 * already records that page.tsx's OWN construction is proven by `pnpm typecheck`,
 * not by a mounted test; these are what makes the construction itself testable.
 */

const TICKET_ID = '01J9GATA000000000000000000';

describe('18.272 ticketRefCandidatesOf', () => {
  it('18.272 maps search hits to candidates, falling back to the id\'s last six characters when the server carries no key', () => {
    const hits = [
      { ticketId: 't1', projectId: 'p1', title: 'Fix the freezer', snippet: '', matchedIn: 'title' as const, key: 'SHOP-7' },
      { ticketId: TICKET_ID, projectId: 'p1', title: 'Compressor log', snippet: '', matchedIn: 'title' as const, key: null },
    ];
    expect(ticketRefCandidatesOf(hits)).toEqual([
      { ticketId: 't1', projectId: 'p1', key: 'SHOP-7', title: 'Fix the freezer' },
      { ticketId: TICKET_ID, projectId: 'p1', key: TICKET_ID.slice(-6), title: 'Compressor log' },
    ]);
  });
});

describe('18.272 ticketRefHrefIn', () => {
  it('18.272 yields the canonical sheet path for a workspace the caller already knows', () => {
    const resolve = ticketRefHrefIn('ws_1');
    expect(resolve({ ticketId: 't7', projectId: 'p_corner' })).toBe('/w/ws_1/p/p_corner?ticket=t7');
  });
});

describe('18.284 prioritizeProject', () => {
  /**
   * Ruling 2 (plan author, via the controller, 2026-09-23): spec §14.1's
   * table and D28 both say the current project's hits come first, and the
   * plan text dropped it — a plan defect, not left to defer. A STABLE
   * partition: search rank survives inside each half. Mutation: partition
   * without stability (sort by projectId) or slice before the partition —
   * either must redden. This fixture uses TWO distinct "other" project ids
   * specifically so a naive alphabetical sort (`'aaa' < 'here' < 'zzz'`)
   * produces a DIFFERENT order than a stable two-way partition does.
   */
  it('18.284 puts the current project\'s hits first, preserving search rank inside each half', () => {
    const items = [
      { projectId: 'zzz', rank: 1 },
      { projectId: 'here', rank: 2 },
      { projectId: 'aaa', rank: 3 },
      { projectId: 'here', rank: 4 },
    ];
    expect(prioritizeProject(items, 'here').map((item) => item.rank)).toEqual([2, 4, 1, 3]);
  });
});

describe('18.272 buildProjectPageQueryTickets', () => {
  it('18.272 composes search -> candidates -> the stable partition, UNSLICED, and lets a rejection propagate', async () => {
    const hits = [
      // Ranked 1st-8th, none in the current project — if this were sliced to
      // 8 before partitioning, the two "here" hits ranked 9th/10th below
      // would never be seen at all.
      ...Array.from({ length: 8 }, (_, i) => ({
        ticketId: `t${i}`,
        projectId: 'elsewhere',
        title: `Elsewhere ${i}`,
        snippet: '',
        matchedIn: 'title' as const,
        key: `E-${i}`,
      })),
      { ticketId: 't8', projectId: 'here', title: 'Here 8', snippet: '', matchedIn: 'title' as const, key: 'H-8' },
      { ticketId: 't9', projectId: 'here', title: 'Here 9', snippet: '', matchedIn: 'title' as const, key: 'H-9' },
    ];
    const search = vi.fn(async () => hits);
    const queryTickets = buildProjectPageQueryTickets({ query: { search } }, 'ws_1', 'here');
    const result = await queryTickets('x');
    expect(search).toHaveBeenCalledWith('ws_1', 'x');
    // UNSLICED: all 10 candidates present, not just the first 8 the library's
    // own `.slice(0, 8)` (packages/editor/src/extensions/ticket-ref.ts)
    // would keep — that slice runs AFTER this function returns.
    expect(result).toHaveLength(10);
    expect(result.map((c) => c.ticketId)).toEqual(['t8', 't9', 't0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']);

    const failing = buildProjectPageQueryTickets(
      { query: { search: vi.fn(async () => { throw new Error('offline'); }) } },
      'ws_1',
      'here',
    );
    // THE PAGE LETS IT PROPAGATE (Ruling 1): the catch lives in
    // packages/editor/src/extensions/ticket-ref.ts's `items` wrapper, not
    // here — this function must never swallow it.
    await expect(failing('x')).rejects.toThrow('offline');
  });
});
