import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { DataSource, DataSourceQuery, StreamItem, Unsubscribe } from '../../src/data-source.js';

export type IngestScript = (events: SubmittedEvent[]) => IngestResult[] | Promise<IngestResult[]>;

export type FakeDataSource = DataSource & {
  ingested: SubmittedEvent[][];
  subscriptions: Array<{ workspaceId: string; afterSeq: number }>;
  pushStreamItem(item: StreamItem): void;
};

/**
 * A SANCTIONED MOCKED-CONTRACT SEAM. This fake exists so view tests can drive
 * the `DataSource` interface without a server; it is NOT the contract, and it
 * must never become the only thing that proves the contract works.
 *
 * WHERE THE REAL CONTRACT LIVES:
 *   - Plan 6 Task 7 — the online HTTP `DataSource` (reads + `POST /v1/events`).
 *   - Plan 6 Task 8 — the WebSocket half of it (`/v1/stream`, `subscribe`).
 *   - Plan 10       — the offline replica `DataSource`, implementing these same
 *                     signatures against a local store + outbox.
 * Until those land, every guarantee demonstrated through this fake is a
 * guarantee about the fake. Reviewers: treat a claim proven only here as
 * unproven for the real sources.
 */
export function createFakeDataSource(
  overrides: Partial<DataSourceQuery> = {},
  ingestScript?: IngestScript,
): FakeDataSource {
  const listeners = new Set<(item: StreamItem) => void>();
  let nextSeq = 1;
  const query: DataSourceQuery = {
    getMyWorkspaces: async () => [],
    getMembers: async () => [],
    getBoard: async () => ({ projectId: 'prj_unset', groups: [] }),
    getTickets: async () => ({ projectId: 'prj_unset', rows: [] }),
    getTicket: async () => null,
    getTicketHistory: async () => [],
    getWorkflowDef: async () => null,
    search: async () => [],
    // Three of these take a `workspaceId` (ruling P25 clause 2) and none of the
    // defaults reads it: the fake answers the same empty view for every
    // workspace, which is what a default is for. Overrides that care take it.
    getMyWork: async () => ({ assigned: [], inTransit: [], contested: [] }),
    getAttention: async () => [],
    getPreferences: async () => ({ version: 1, projects: {}, savedFilters: [] }),
    putPreferences: async () => {},
    ...overrides,
  };
  const source: FakeDataSource = {
    ingested: [],
    subscriptions: [],
    async ingest(events) {
      source.ingested.push(events);
      if (ingestScript) return ingestScript(events);
      return events.map((event) => ({
        status: 'committed' as const,
        eventId: event.id,
        seq: nextSeq++,
        serverTime: '2026-08-20T09:00:00.000Z',
      }));
    },
    query,
    subscribe(workspaceId, afterSeq, cb): Unsubscribe {
      source.subscriptions.push({ workspaceId, afterSeq });
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    pushStreamItem(item) {
      for (const cb of [...listeners]) cb(item);
    },
  };
  return source;
}
