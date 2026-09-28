import { describe, expect, it, vi } from 'vitest';
import { newUlid, type PurgedRef } from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';
import { createOutbox } from '../src/outbox/outbox.js';
import {
  createSyncEngine,
  WorkspaceAccessLost,
  type StreamHandlers,
  type SyncEngine,
  type SyncTransport,
} from '../src/engine/sync-engine.js';
import { createHttpTransport } from '../src/net/http-transport.js';
import {
  ME,
  OTHER,
  P,
  P_OTHER,
  TIME,
  WS,
  apply,
  bootstrap,
  commentOnTicket,
  contestOn,
  count,
  docWith,
  envelope,
  freshReplica,
  ticketCreated,
  ticketRefChip,
} from './purge-world.js';

/**
 * Trash series Plan 3, Task 5 (deviations D3–D5, D12): how a device learns of
 * a purge the stream cannot deliver. Every case runs the real engine over the
 * real replica; only the transport is scripted.
 */

type Calls = { lookups: string[][]; subscribes: number; handlers: StreamHandlers | null };

function transportFor(
  opts: {
    lookup?: (ids: string[]) => Promise<PurgedRef[]>;
    bootstrap?: () => Promise<BootstrapResponse>;
    reconcile?: SyncTransport['reconcile'];
  } = {},
): { transport: SyncTransport; calls: Calls } {
  const calls: Calls = { lookups: [], subscribes: 0, handlers: null };
  const transport: SyncTransport = {
    bootstrap: opts.bootstrap ?? (async () => bootstrap()),
    async sync() {
      return [];
    },
    openStream(_ws, _afterSeq, handlers) {
      calls.subscribes += 1;
      calls.handlers = handlers;
      return { close: () => handlers.onClose() };
    },
    reconcile: opts.reconcile ?? (async (workspaceId) => ({ workspaceId, restricted: [], restrictedNotes: [] })),
    async bootstrapTicket(_ws, ticketId) {
      throw new Error(`no pull in this fixture: ${ticketId}`);
    },
    async bootstrapNote(_ws, noteId) {
      throw new Error(`no pull in this fixture: ${noteId}`);
    },
    async purgedLookup(ids) {
      calls.lookups.push(ids);
      return (opts.lookup ?? (async () => []))(ids);
    },
    async deletedItems() {
      return { items: [] };
    },
  };
  return { transport, calls };
}

function engineOver(storage: SyncStorage, replica: Replica, transport: SyncTransport): SyncEngine {
  return createSyncEngine({ replica, outbox: createOutbox({ storage, replica }), transport, reconnectDelayMs: 5 });
}

const ticketRef = (id: string): PurgedRef => ({ kind: 'ticket', id });

describe('19.176 the reconcile pass asks', () => {
  it('19.176 erases what the lookup names at caught-up; the unnamed ticket stays', async () => {
    const { storage, replica } = await freshReplica();
    const [T1, T2] = [newUlid(), newUlid()];
    await apply(replica, [ticketCreated(T1), ticketCreated(T2)]);
    const { transport, calls } = transportFor({ lookup: async (ids) => ids.filter((id) => id === T1).map(ticketRef) });
    const engine = engineOver(storage, replica, transport);
    await engine.start(WS);

    calls.handlers!.onCaughtUp(5);

    await vi.waitFor(async () => expect(await replica.getTicket(T1)).toBeNull());
    expect(calls.lookups.flat()).toEqual(expect.arrayContaining([WS, T1, T2]));
    expect(await replica.purgedAmong([T1, T2])).toEqual([ticketRef(T1)]);
    // CONTROL
    expect(await replica.getTicket(T2)).not.toBeNull();
    engine.stop();
  });
});

describe('19.177 the candidates reach past the held rows', () => {
  it("19.177 asks about reconcile's evicted id and a chip id in a held comment, and erases both", async () => {
    const { storage, replica } = await freshReplica();
    const [T3, T2, X] = [newUlid(), newUlid(), newUlid()];
    await apply(replica, [
      ticketCreated(T3),
      contestOn(T3, ME),
      ticketCreated(T2),
      commentOnTicket(T2, docWith({ type: 'text', text: 'see ' }, ticketRefChip(X))),
    ]);
    const { transport, calls } = transportFor({
      reconcile: async (workspaceId, heldIds) => ({
        workspaceId,
        restricted: heldIds.includes(T3) ? [{ kind: 'restricted', id: T3 }] : [],
        restrictedNotes: [],
      }),
      lookup: async (ids) => ids.filter((id) => id === T3 || id === X).map(ticketRef),
    });
    const engine = engineOver(storage, replica, transport);
    await engine.start(WS);

    calls.handlers!.onCaughtUp(5);

    await vi.waitFor(async () => expect(await replica.purgedAmong([X])).toEqual([ticketRef(X)]));
    expect(calls.lookups.flat()).toEqual(expect.arrayContaining([T3, X]));
    expect(await count(storage, 'SELECT count(*) AS n FROM contests WHERE ticket_id = ?', [T3])).toBe(0);
    // CONTROL
    expect(await replica.getTicket(T2)).not.toBeNull();
    engine.stop();
  });
});

describe('19.178 chunks of 500, one failing', () => {
  it('19.178 asks in chunks of at most 500; a failed chunk is recorded and the next chunk still erases', async () => {
    const { storage, replica } = await freshReplica();
    const T = newUlid();
    const chips = Array.from({ length: 1100 }, () => newUlid());
    await apply(replica, [ticketCreated(T), commentOnTicket(T, docWith(...chips.map(ticketRefChip)))]);
    const sortedChips = [...chips].sort();
    const inLastChunk = sortedChips[sortedChips.length - 1]!;
    const inFailingChunk = sortedChips[600]!;
    let call = 0;
    const { transport, calls } = transportFor({
      lookup: async (ids) => {
        call += 1;
        if (call === 2) throw new Error('purged-lookup failed: 503');
        return ids.filter((id) => id === inLastChunk || id === inFailingChunk).map(ticketRef);
      },
    });
    const engine = engineOver(storage, replica, transport);

    await engine.learnPurges(WS);

    expect(calls.lookups.map((chunk) => chunk.length)).toEqual([500, 500, 102]);
    expect(calls.lookups[1]).toContain(inFailingChunk);
    expect(engine.lastPurgeLookupError()).toBe('purged-lookup failed: 503');
    expect(await replica.purgedAmong([inLastChunk])).toEqual([ticketRef(inLastChunk)]);
    // CONTROL
    expect(await replica.purgedAmong([inFailingChunk])).toEqual([]);
  });
});

describe('19.179 a purged workspace ends the stream', () => {
  it('19.179 erases the workspace on not-a-member when the lookup names it, and does not reconnect', async () => {
    const { storage, replica } = await freshReplica();
    const T = newUlid();
    await apply(replica, [ticketCreated(T)]);
    const { transport, calls } = transportFor({
      lookup: async (ids) => (ids.includes(WS) ? [{ kind: 'workspace', id: WS }] : []),
    });
    const engine = engineOver(storage, replica, transport);
    await engine.start(WS);
    expect(calls.subscribes).toBe(1);

    calls.handlers!.onError({ code: 'not-a-member', message: 'not a member of this workspace' });

    await vi.waitFor(async () => expect(await replica.listTickets(WS)).toEqual([]));
    expect(engine.status()).toBe('offline');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(calls.subscribes).toBe(1);
    // CONTROL
    expect(await replica.purgedAmong([WS])).toEqual([{ kind: 'workspace', id: WS }]);
    engine.stop();
  });
});

describe('19.180 a revoke is not a purge', () => {
  it('19.180 erases nothing when the lookup names nothing; a bootstrap 403 asks and rethrows', async () => {
    const held = await freshReplica();
    const T = newUlid();
    await apply(held.replica, [ticketCreated(T)]);
    const revoked = transportFor({ lookup: async () => [] });
    const engine = engineOver(held.storage, held.replica, revoked.transport);
    await engine.start(WS);
    revoked.calls.handlers!.onError({ code: 'not-a-member', message: 'not a member of this workspace' });
    await vi.waitFor(() => expect(revoked.calls.lookups).toHaveLength(1));
    expect(await held.replica.getTicket(T)).not.toBeNull();
    expect(await held.replica.purgedAmong([WS, T])).toEqual([]);
    engine.stop();

    const coldStorage = createBetterSqliteStorage();
    const coldReplica = await createReplica({ storage: coldStorage });
    const refused = transportFor({
      bootstrap: async () => {
        throw new WorkspaceAccessLost(WS, 'bootstrap failed: 403');
      },
      lookup: async () => [],
    });
    await expect(engineOver(coldStorage, coldReplica, refused.transport).start(WS)).rejects.toBeInstanceOf(
      WorkspaceAccessLost,
    );
    expect(refused.calls.lookups).toEqual([[WS]]);

    // CONTROL: the same 403 on a purged workspace resolves, recorded, without a subscribe
    const goneStorage = createBetterSqliteStorage();
    const goneReplica = await createReplica({ storage: goneStorage });
    const gone = transportFor({
      bootstrap: async () => {
        throw new WorkspaceAccessLost(WS, 'bootstrap failed: 403');
      },
      lookup: async (ids) => (ids.includes(WS) ? [{ kind: 'workspace', id: WS }] : []),
    });
    await expect(engineOver(goneStorage, goneReplica, gone.transport).start(WS)).resolves.toBeUndefined();
    expect(await goneReplica.purgedAmong([WS])).toEqual([{ kind: 'workspace', id: WS }]);
    expect(gone.calls.subscribes).toBe(0);
  });
});

describe('19.181 a tombstone that does arrive', () => {
  it("19.181 is never stored and erases the project's local subtree", async () => {
    const { storage, replica } = await freshReplica();
    const [A, A1, Q1] = [newUlid(), newUlid(), newUlid()];
    await apply(replica, [ticketCreated(A, P), ticketCreated(A1, P, A), ticketCreated(Q1, P_OTHER)]);
    const { transport, calls } = transportFor({
      lookup: async (ids) => (ids.includes(P) ? [{ kind: 'project', id: P }] : []),
    });
    const engine = engineOver(storage, replica, transport);
    await engine.start(WS);

    calls.handlers!.onItem(
      envelope({ kind: 'project', id: P }, 'purge.completed', { kind: 'project', markedBy: OTHER, markedAt: TIME }),
    );

    await vi.waitFor(async () => expect(await replica.getTicket(A)).toBeNull());
    expect(await replica.getTicket(A1)).toBeNull();
    expect(await count(storage, "SELECT count(*) AS n FROM events WHERE type = 'purge.completed'")).toBe(0);
    expect(calls.lookups.flat()).toContain(P);
    // CONTROL
    expect(await replica.getTicket(Q1)).not.toBeNull();
    engine.stop();
  });
});

describe('19.182 the HTTP transport', () => {
  function fetchAnswering(status: number, body: unknown) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    return { fetchImpl, calls };
  }
  const over = (fetchImpl: typeof fetch) => createHttpTransport({ baseUrl: 'https://api.example', token: 'tok', fetchImpl });

  it('19.182 posts the lookup, reads Deleted items, and types a bootstrap 403', async () => {
    const T = newUlid();
    const ok = fetchAnswering(200, { purged: [{ kind: 'ticket', id: T }, { kind: 'workflow', id: T }, { nope: true }] });
    expect(await over(ok.fetchImpl).purgedLookup([T])).toEqual([{ kind: 'ticket', id: T }]);
    expect(ok.calls[0]?.url).toBe('https://api.example/v1/purged-lookup');
    expect(ok.calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(ok.calls[0]?.init?.body))).toEqual({ ids: [T] });
    expect((ok.calls[0]?.init?.headers as Record<string, string>)['authorization']).toBe('Bearer tok');

    const listed = fetchAnswering(200, { items: [] });
    expect(await over(listed.fetchImpl).deletedItems()).toEqual({ items: [] });
    expect(listed.calls[0]?.url).toBe('https://api.example/v1/me/deleted-items');

    const forbidden = await over(fetchAnswering(403, { error: 'not_a_member' }).fetchImpl)
      .bootstrap(WS)
      .catch((cause: unknown) => cause);
    expect(forbidden).toBeInstanceOf(WorkspaceAccessLost);
    expect((forbidden as WorkspaceAccessLost).message).toBe('bootstrap failed: 403');
    expect((forbidden as WorkspaceAccessLost).workspaceId).toBe(WS);
    // CONTROL
    const broken = await over(fetchAnswering(500, {}).fetchImpl)
      .bootstrap(WS)
      .catch((cause: unknown) => cause);
    expect(broken).not.toBeInstanceOf(WorkspaceAccessLost);
    expect((broken as Error).message).toBe('bootstrap failed: 500');
    await expect(over(fetchAnswering(502, {}).fetchImpl).purgedLookup([T])).rejects.toThrow('purged-lookup failed: 502');
  });
});
