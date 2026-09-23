import { searchTermSchema } from '@gisik-nokma/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  buildProjectPageQueryTickets,
  prioritizeProject,
  ticketRefCandidatesOf,
  ticketRefHrefIn,
} from '../src/ticket-ref-callbacks.js';

/**
 * A `search` fake that enforces `searchTermSchema` exactly as the server's
 * `/v1/search` route does (`apps/server/src/routes/search.ts`) — case 9.313:
 * the ORIGINAL fake accepted an empty string, which is why the empty-query
 * 400 shipped without a red test. Importing the schema rather than
 * re-stating `min(1)` here is what keeps the fake and the server from
 * drifting apart the same way they already did once.
 */
function strictSearch(hits: Parameters<typeof ticketRefCandidatesOf>[0]) {
  return vi.fn(async (_workspaceId: string, text: string) => {
    searchTermSchema.parse(text);
    return hits;
  });
}

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
    const search = strictSearch(hits);
    const getTickets = vi.fn(async () => ({ rows: [] }));
    const queryTickets = buildProjectPageQueryTickets({ query: { search, getTickets } }, 'ws_1', 'here');
    const result = await queryTickets('x');
    expect(search).toHaveBeenCalledWith('ws_1', 'x');
    expect(getTickets).not.toHaveBeenCalled();
    // UNSLICED: all 10 candidates present, not just the first 8 the library's
    // own `.slice(0, 8)` (packages/editor/src/extensions/ticket-ref.ts)
    // would keep — that slice runs AFTER this function returns.
    expect(result).toHaveLength(10);
    expect(result.map((c) => c.ticketId)).toEqual(['t8', 't9', 't0', 't1', 't2', 't3', 't4', 't5', 't6', 't7']);

    const failing = buildProjectPageQueryTickets(
      {
        query: {
          search: vi.fn(async () => { throw new Error('offline'); }),
          getTickets: vi.fn(async () => ({ rows: [] })),
        },
      },
      'ws_1',
      'here',
    );
    // THE PAGE LETS IT PROPAGATE (Ruling 1): the catch lives in
    // packages/editor/src/extensions/ticket-ref.ts's `items` wrapper, not
    // here — this function must never swallow it.
    await expect(failing('x')).rejects.toThrow('offline');
  });

  /**
   * 9.313 — bug fix (2026-09-24, owner report 2026-09-23: "`:ticket` does not
   * open it"). Root cause: `:ticket` alone sends `search(workspaceId, '')`,
   * and the server's `searchTermSchema.min(1)` (shared with note search and
   * filter text) refuses an empty term with 400 every time — the popup's
   * `items` wrapper (`packages/editor/src/extensions/ticket-ref.ts`) then
   * shows "Search needs a connection" for a state that is not a connection
   * failure at all. `:note`'s own empty query never reaches a server route
   * (`ticket-sheet.tsx`'s `queryNotes` filters a client-side list), which is
   * why only `:ticket` broke. THE FAKE ENFORCES THE SAME SCHEMA THE SERVER
   * DOES (`strictSearch`, above) — the original fake accepted `''`, which is
   * exactly how this shipped without a failing test.
   */
  it('9.313 an empty (or whitespace) query never calls search; it answers from getTickets(projectId) instead; a non-empty query still calls search (control, same it)', async () => {
    const rows = [
      { ticketId: 't1', title: 'Fix the freezer', key: 'SHOP-7' },
      { ticketId: 't2', title: 'Compressor log', key: null },
    ];
    const getTickets = vi.fn(async () => ({ rows }));
    const search = strictSearch([]);
    const queryTickets = buildProjectPageQueryTickets({ query: { search, getTickets } }, 'ws_1', 'here');

    const empty = await queryTickets('');
    expect(getTickets).toHaveBeenCalledWith('here', {}, 'flat');
    expect(search).not.toHaveBeenCalled();
    expect(empty).toEqual([
      { ticketId: 't1', projectId: 'here', key: 'SHOP-7', title: 'Fix the freezer' },
      // `key: null` falls back to the id's last six characters, the same rule
      // `ticketRefCandidatesOf` already applies to a `search` hit.
      { ticketId: 't2', projectId: 'here', key: 't2', title: 'Compressor log' },
    ]);

    // A query typed after the empty state — not just any non-empty string —
    // reaches `search` and NOT `getTickets` again: the picker still narrows
    // once the caller types something, exactly as before this fix.
    getTickets.mockClear();
    await queryTickets('  ');
    expect(getTickets).toHaveBeenCalledTimes(1); // whitespace-only trims to empty too
    expect(search).not.toHaveBeenCalled();

    await queryTickets('freezer');
    expect(search).toHaveBeenCalledWith('ws_1', 'freezer');
  });
});
