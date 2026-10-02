import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardResponse, MemberListResponse } from '@gisik-nokma/domain';
import { ROSTER_BURST_MS, createOnlineDataSource } from '../../src/online/online-data-source.js';
import { clearLiveQueryCache } from '../../src/views/live-query-cache.js';

/**
 * Smoothness T3 (FD7, spec §3.2; audit SM-05): the roster join is asked once per
 * burst, not once per read. Cases 25.026 and 25.031.
 *
 * An empty board is enough: `getBoard` joins the roster off the body's own
 * `workspaceId` whatever the columns hold, and the join is what is counted.
 */
const WORKSPACE = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const ANSELMA = '01J9GUSA000000000000000000';
const BOARD: BoardResponse = { projectId: PROJECT, workspaceId: WORKSPACE, columns: [] };
const MEMBERS: MemberListResponse = {
  workspaceId: WORKSPACE,
  members: [{ userId: ANSELMA, displayName: 'Anselma Marak', role: 'owner' }],
};

function fixture(options: { membersFail?: () => boolean } = {}) {
  const urls: string[] = [];
  const fetchImpl = async (input: string) => {
    urls.push(input);
    const path = input.replace(/^https?:\/\/[^/]+/, '');
    if (path === `/v1/projects/${PROJECT}/board`) return { ok: true, status: 200, json: async () => BOARD } as Response;
    if (path === `/v1/workspaces/${WORKSPACE}/members`) {
      if (options.membersFail?.() === true) return { ok: false, status: 500, json: async () => undefined } as Response;
      return { ok: true, status: 200, json: async () => MEMBERS } as Response;
    }
    return { ok: false, status: 404, json: async () => undefined } as Response;
  };
  const source = createOnlineDataSource({ baseUrl: '', fetchImpl });
  return { source, hits: (suffix: string) => urls.filter((u) => u.endsWith(suffix)).length };
}

describe('the roster burst memo (FD7)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    clearLiveQueryCache();
  });
  afterEach(() => vi.useRealTimers());

  it('25.026 two board reads inside one second join the roster ONCE; a read a second later joins again', async () => {
    const { source, hits } = fixture();
    await Promise.all([source.query.getBoard(PROJECT), source.query.getBoard(PROJECT)]);
    expect(hits('/members')).toBe(1);
    expect(hits('/actor-names')).toBe(1);
    vi.advanceTimersByTime(ROSTER_BURST_MS + 1);
    await source.query.getBoard(PROJECT);
    expect(hits('/members')).toBe(2);
    // Control: a read just inside the burst window does not join again.
    vi.advanceTimersByTime(ROSTER_BURST_MS - 100);
    await source.query.getBoard(PROJECT);
    expect(hits('/members')).toBe(2);
  });

  it('25.026 a failed join is not memoised: the next read inside the second asks again', async () => {
    let failing = true;
    const { source, hits } = fixture({ membersFail: () => failing });
    // The 500 is not a 404: it propagates, and the read fails with it.
    await expect(source.query.getBoard(PROJECT)).rejects.toBeDefined();
    failing = false;
    await expect(source.query.getBoard(PROJECT)).resolves.toBeDefined();
    expect(hits('/members')).toBe(2);
  });

  it('25.031 the memo does not cross a sign-out: the next person\'s read inside the same second joins the roster for itself', async () => {
    const { source, hits } = fixture();
    await source.query.getBoard(PROJECT);
    clearLiveQueryCache(); // sign-out, sign-in as someone else
    await source.query.getBoard(PROJECT);
    expect(hits('/members')).toBe(2);
    // Control: with no clear between them the second read is served from the memo.
    await source.query.getBoard(PROJECT);
    expect(hits('/members')).toBe(2);
  });
});
