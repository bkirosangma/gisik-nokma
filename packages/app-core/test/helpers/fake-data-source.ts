import { builtinTicketTypeDefs, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { DataSource, DataSourceQuery, ServerStreamFrame, Unsubscribe } from '../../src/data-source.js';

export type IngestScript = (events: SubmittedEvent[]) => IngestResult[] | Promise<IngestResult[]>;

export type FakeDataSource = DataSource & {
  ingested: SubmittedEvent[][];
  subscriptions: Array<{ workspaceId: string; afterSeq: number }>;
  pushStreamItem(item: ServerStreamFrame): void;
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
  const listeners = new Set<(item: ServerStreamFrame) => void>();
  let nextSeq = 1;
  const query: DataSourceQuery = {
    getMyWorkspaces: async () => [],
    getMembers: async () => [],
    getBoard: async () => ({ projectId: 'prj_unset', groups: [] }),
    getTickets: async () => ({ projectId: 'prj_unset', rows: [] }),
    getTicket: async () => null,
    getTicketHistory: async () => [],
    // `[]`, and here it IS the honest default rather than the trap the online
    // source's own docblock names: a view test that has not stubbed this read is
    // rendering a ticket with no attachments, which is a state the product
    // produces constantly. A case that cares about a REFUSAL must override this
    // — the fake cannot refuse on its own, because the failure it would be
    // imitating (a 404 from a real route) is the online source's, and this file
    // is not that source (see this file's header).
    getTicketAttachments: async () => [],
    // `[]`, on the same argument as the attachments default one line up: a view
    // test that has not stubbed this read is rendering a ticket nobody has
    // commented on, which is a state the product produces constantly. A case
    // about the FAILED read must override it — this default cannot refuse,
    // because the refusal it would imitate is a 404 from a real route and this
    // file is not that source (see this file's header).
    getTicketComments: async () => [],
    // The seven note reads (notes series, Plan 1 of 6) default to the same
    // absent-everything the two reads above do, on the same argument: a view
    // test that has not stubbed them is rendering a workspace with no notes,
    // which is a state the product produces constantly. `getNote` and
    // `getNoteVersion` are `null` for the same reason `getTicket` is — `null` is
    // this group's absence value, not `[]`.
    getNotes: async () => [],
    getDeletedNotes: async () => [],
    getNote: async () => null,
    getNotesForTicket: async () => [],
    getNoteComments: async () => [],
    getNoteHistory: async () => [],
    getNoteVersion: async () => null,
    getWorkflowDef: async () => null,
    // NOT `[]`, and this default is the one that is deliberately non-empty. Plan
    // 4's bootstrap materialises the four built-ins as real
    // `ticket-type.defined` events in every workspace at creation, so a
    // workspace with no ticket types cannot exist and a fake answering one would
    // put every view under test in a world the product cannot produce. It is
    // built by the DOMAIN's own `builtinTicketTypeDefs` rather than retyped, so
    // a change to the ladder cannot leave this fixture behind.
    getTicketTypes: async () => builtinTicketTypeDefs('wf_default'),
    search: async () => [],
    // Three of these take a `workspaceId` (ruling P25 clause 2) and none of the
    // defaults reads it: the fake answers the same empty view for every
    // workspace, which is what a default is for. Overrides that care take it.
    getMyWork: async () => ({ assigned: [], inTransit: [], contested: [], shared: [] }),
    getAttention: async () => [],
    // The server's REAL answer for a workspace nobody has configured, not an
    // invented blank (second wave, Task 6): `getWorkspaceSettings` applies the
    // domain's defaults and answers `provenance: null` when no row exists, so
    // this mirrors a state the product can actually produce. `autoCloseAfterDays:
    // null` is that default AND the "off" claim, which is why a case that cares
    // about the difference must override this rather than read it.
    getWorkspaceSettings: async () => ({
      staleDays: 7,
      dueSoonDays: 7,
      autoCloseAfterDays: null,
      provenance: null,
    }),
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
