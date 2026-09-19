import { describe, expect, it } from 'vitest';
import { isUlid, type LedgerEvent, type WorkflowDef } from '@gisik-nokma/domain';
import { createClientStateCache } from '../src/cache.js';
import { withCacheFeed } from '../src/cache-feed.js';
import { createFakeDataSource } from './helpers/fake-data-source.js';
import { PARENT, TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from './helpers/seed.js';

/**
 * A workflow entity's `entity.id` IS its definition's `id` — `workflow.defined`
 * refuses `malformed-payload` when the two disagree, and the envelope door
 * requires a ULID for it. `WF_ERRAND.id` is the slug `wf-errand`, a seed
 * convenience, so the invalidation test below uses a definition whose id is the
 * shape a real stream frame would carry.
 */
const WF_ULID = '01J9GWFA000000000000000000';
const WF_REAL: WorkflowDef = { ...WF_ERRAND, id: WF_ULID };

/**
 * A `LedgerEvent`, not a bare `EventEnvelope`: Plan 6 Task 8 widened `ServerStreamFrame`'s
 * event member to carry the workspace stream position the resume protocol is
 * defined in terms of. `noteEvent` still takes an `EventEnvelope`, and a
 * `LedgerEvent` is one — the widening costs those call sites nothing.
 */
function ticketEnvelope(overrides: Partial<LedgerEvent> = {}): LedgerEvent {
  return {
    id: '01J9GEVT000000000000000000',
    workspaceId: WS,
    entity: { kind: 'ticket', id: TICKET },
    type: 'ticket.transitioned',
    version: 1,
    payload: { to: 'done' },
    actorId: '01J9GKRA000000000000000000',
    origin: 'web',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    seq: 4,
    // Deliberately different from `seq`: per-entity counter vs workspace position.
    workspaceSeq: 17,
    ...overrides,
  };
}

describe('ClientStateCache', () => {
  it('serves upserted tickets', () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, parentId: PARENT }));
    expect(cache.getTicket(TICKET)?.parentId).toBe(PARENT);
  });

  it('answers undefined for a ticket it has never seen — it never invents one', () => {
    expect(createClientStateCache().getTicket(TICKET)).toBeUndefined();
  });

  it('serves the latest workflow version when no version is asked for', () => {
    const cache = createClientStateCache();
    cache.upsertWorkflowDef(WF_ERRAND);
    cache.upsertWorkflowDef({ ...WF_ERRAND, version: 2 });
    expect(cache.getWorkflowDef('wf-errand')?.version).toBe(2);
  });

  it('serves an older version when that version is asked for', () => {
    const cache = createClientStateCache();
    cache.upsertWorkflowDef(WF_ERRAND);
    cache.upsertWorkflowDef({ ...WF_ERRAND, version: 2 });
    expect(cache.getWorkflowDef('wf-errand', 1)?.version).toBe(1);
  });

  it('answers undefined for a version it does not hold', () => {
    const cache = createClientStateCache();
    cache.upsertWorkflowDef({ ...WF_ERRAND, version: 3 });
    expect(cache.getWorkflowDef('wf-errand', 2)).toBeUndefined();
  });

  it('serves DIRECT children only, by the parentId the cached child itself claims', () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: PARENT, parentId: null }));
    cache.upsertTicket(ticketStateSeed({ id: TICKET, parentId: PARENT }));
    expect(new Set(cache.childrenOf(PARENT).map((child) => child.id))).toEqual(new Set([TICKET]));
  });

  it('drops a ticket snapshot the moment a stream event touches it — stale state never fuels a pre-check', () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET }));
    cache.noteEvent(ticketEnvelope());
    expect(cache.getTicket(TICKET)).toBeUndefined();
  });

  it('does not patch the snapshot optimistically from the event payload', () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'doing' }));
    cache.noteEvent(ticketEnvelope());
    expect(cache.getTicket(TICKET)?.stateId).toBeUndefined();
  });

  it('leaves untouched tickets alone — invalidation is not a flush', () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET }));
    cache.upsertTicket(ticketStateSeed({ id: PARENT }));
    cache.noteEvent(ticketEnvelope());
    expect(cache.getTicket(PARENT)).toBeDefined();
  });

  it('drops a workflow definition the moment a stream event touches it, keyed by the id the envelope carries', () => {
    const cache = createClientStateCache();
    expect(isUlid(WF_REAL.id)).toBe(true);
    cache.upsertWorkflowDef(WF_REAL);
    cache.noteEvent(ticketEnvelope({ entity: { kind: 'workflow', id: WF_ULID }, type: 'workflow.defined' }));
    expect(cache.getWorkflowDef(WF_ULID)).toBeUndefined();
  });
});

/**
 * THE COMPLETENESS SEAM. `childrenOf` can only ever answer "the children I have
 * happened to see". The parent-terminal invariant needs "all of them" — and a
 * partial view of children reads to the engine as NO open children, which is an
 * accept manufactured out of absence. A vouch is the only thing that can tell
 * the two apart, and nothing vouches by accident.
 */
describe('ClientStateCache — vouching for a complete child set', () => {
  it('does not vouch for a parent by default, however many children it has cached', () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, parentId: PARENT }));
    expect(cache.hasCompleteChildren(PARENT)).toBe(false);
  });

  it('vouches once told, and serves the vouched set', () => {
    const cache = createClientStateCache();
    cache.markChildrenComplete(PARENT, [ticketStateSeed({ id: TICKET, parentId: PARENT })]);
    expect(cache.hasCompleteChildren(PARENT)).toBe(true);
  });

  it('a vouch upserts the children it vouches for', () => {
    const cache = createClientStateCache();
    cache.markChildrenComplete(PARENT, [ticketStateSeed({ id: TICKET, parentId: PARENT })]);
    expect(new Set(cache.childrenOf(PARENT).map((child) => child.id))).toEqual(new Set([TICKET]));
  });

  it('a vouch evicts a cached child the vouch does not name — the vouched set IS the child set', () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, parentId: PARENT }));
    cache.markChildrenComplete(PARENT, []);
    expect(new Set(cache.childrenOf(PARENT).map((child) => child.id))).toEqual(new Set());
  });

  /**
   * The side door. Targeted invalidation would keep the vouch and drop the
   * child, and `childrenOf` would then serve a VOUCHED empty set for a parent
   * whose child is still open on the server. Any ticket event may have created,
   * reparented or closed a child anywhere, so every vouch is void.
   */
  it('any ticket event voids every vouch — a vouch may not outlive the child set it described', () => {
    const cache = createClientStateCache();
    cache.markChildrenComplete(PARENT, [ticketStateSeed({ id: TICKET, parentId: PARENT, stateCategory: 'active' })]);
    cache.noteEvent(ticketEnvelope({ entity: { kind: 'ticket', id: TICKET } }));
    expect(cache.hasCompleteChildren(PARENT)).toBe(false);
  });

  it('a ticket event about an unrelated ticket voids the vouch too — the client cannot tell whose child it was', () => {
    const cache = createClientStateCache();
    cache.markChildrenComplete(PARENT, []);
    cache.noteEvent(ticketEnvelope({ entity: { kind: 'ticket', id: '01J9GXYZ000000000000000000' } }));
    expect(cache.hasCompleteChildren(PARENT)).toBe(false);
  });
});

describe('withCacheFeed — the decorator that keeps the cache fed from ordinary traffic', () => {
  function fedSource() {
    const cache = createClientStateCache();
    const fake = createFakeDataSource({
      getTicket: async () => ({
        ticket: ticketStateSeed({ id: TICKET, stateId: 'doing' }),
        title: 'File the GST return',
        stateProvenance: claim(),
        // This fixture's ticket has never been assigned, so there is no claim
        // behind an assignee: `null` is the whole truth (`read/assigned-provenance.ts`).
        assignedProvenance: null,
        parent: null,
        rollup: null,
      }),
      getWorkflowDef: async () => WF_ERRAND,
    });
    return { cache, fake, fed: withCacheFeed(fake, cache) };
  }

  it('feeds the cache from a getTicket read', async () => {
    const { cache, fed } = fedSource();
    await fed.query.getTicket(WS, TICKET);
    expect(cache.getTicket(TICKET)).toBeDefined();
  });

  it('feeds the cache from a getWorkflowDef read', async () => {
    const { cache, fed } = fedSource();
    await fed.query.getWorkflowDef(WS, 'wf-errand');
    expect(cache.getWorkflowDef('wf-errand')).toBeDefined();
  });

  it('caches nothing when the source answers null — absence is not a snapshot', async () => {
    const cache = createClientStateCache();
    const fed = withCacheFeed(createFakeDataSource(), cache);
    await fed.query.getTicket(WS, TICKET);
    expect(cache.getTicket(TICKET)).toBeUndefined();
  });

  it('invalidates from a stream event', async () => {
    const { cache, fake, fed } = fedSource();
    await fed.query.getTicket(WS, TICKET);
    fed.subscribe(WS, 0, () => {});
    fake.pushStreamItem({ type: 'event', envelope: ticketEnvelope({ id: '01J9GEVT000000000000000001' }) });
    expect(cache.getTicket(TICKET)).toBeUndefined();
  });

  it('still delivers the frame to the subscriber it decorated', async () => {
    const { fake, fed } = fedSource();
    const seen: unknown[] = [];
    fed.subscribe(WS, 0, (item) => seen.push(item));
    fake.pushStreamItem({ type: 'caught-up', workspaceId: WS, seq: 5 });
    expect(seen).toEqual([{ type: 'caught-up', workspaceId: WS, seq: 5 }]);
  });

  it('passes ingest straight through', async () => {
    const { fake, fed } = fedSource();
    await fed.ingest([]);
    expect(fake.ingested).toEqual([[]]);
  });
});

/**
 * THE SEAM: the cache is pre-check FUEL, never truth. A view asking the
 * DataSource a question gets the source's answer, always — a cache hit may not
 * short-circuit a read, or the client would render a snapshot as a fact and
 * quietly disagree with the server about what is on the screen.
 */
describe('withCacheFeed — the cache is never rendered as truth', () => {
  it("serves the source's ticket even when the cache holds a different snapshot of it", async () => {
    const cache = createClientStateCache();
    cache.upsertTicket(ticketStateSeed({ id: TICKET, stateId: 'todo', stateCategory: 'open' }));
    const fed = withCacheFeed(
      createFakeDataSource({
        getTicket: async () => ({
          ticket: ticketStateSeed({ id: TICKET, stateId: 'waiting', stateCategory: 'active' }),
          title: 'File the GST return',
          stateProvenance: claim(),
          // This fixture's ticket has never been assigned, so there is no claim
          // behind an assignee: `null` is the whole truth (`read/assigned-provenance.ts`).
          assignedProvenance: null,
          parent: null,
          rollup: null,
        }),
      }),
      cache,
    );
    expect((await fed.query.getTicket(WS, TICKET))?.ticket.stateId).toBe('waiting');
  });

  it("serves the source's workflow definition even when the cache holds another version", async () => {
    const cache = createClientStateCache();
    cache.upsertWorkflowDef({ ...WF_ERRAND, version: 9 });
    const fed = withCacheFeed(createFakeDataSource({ getWorkflowDef: async () => WF_ERRAND }), cache);
    expect((await fed.query.getWorkflowDef(WS, 'wf-errand'))?.version).toBe(1);
  });

  it('exposes no extra read surface — the decorated query is exactly the DataSource query, no cache accessor leaked', () => {
    const fake = createFakeDataSource();
    const fed = withCacheFeed(fake, createClientStateCache());
    expect(new Set(Object.keys(fed.query))).toEqual(new Set(Object.keys(fake.query)));
  });
});
