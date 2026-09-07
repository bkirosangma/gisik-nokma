import { describe, expect, it } from 'vitest';
import { parentTerminalRefusal } from '@gisik-nokma/rule-engine';

/**
 * The engine's real ADD-arm sentence, a LITERAL and pinned to the producer at the
 * bottom of this file — ruling P43's shape. It was `'Parent is Done; it must reopen
 * because it is acquiring live work.'`, a third wording of a sentence no producer
 * emits; the two other files carried a fourth. This one claimed no source, so it is
 * a fake's stimulus rather than a false claim, and the pin is what stops it drifting
 * back into one.
 */
const PARENT_TERMINAL_REASON =
  '"Registrations" is finished (Done). Adding live work reopens it — choose a state to reopen it to, then add this ticket.';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { DataSource, ServerStreamFrame } from '../src/data-source.js';
import { DEFAULT_GROUPING, DEFAULT_LIST_COLUMNS, DEFAULT_VIEW_PREFS } from '../src/view-types.js';
import { createFakeDataSource } from './helpers/fake-data-source.js';
import { submittedTicketCreated } from './helpers/seed.js';

describe('the fake DataSource (the harness every view test rides on)', () => {
  it('conforms to the DataSource interface', () => {
    const source: DataSource = createFakeDataSource();
    expect(typeof source.ingest).toBe('function');
    expect(typeof source.subscribe).toBe('function');
    expect(typeof source.query.getBoard).toBe('function');
  });

  it('records ingested batches and answers committed by default, index-aligned', async () => {
    const source = createFakeDataSource();
    const event: SubmittedEvent = submittedTicketCreated();
    const results = await source.ingest([event]);
    expect(source.ingested).toEqual([[event]]);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ status: 'committed', eventId: event.id });
  });

  it('lets a test script refusals', async () => {
    const source = createFakeDataSource({}, (events) =>
      events.map((event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'hierarchy.parent-terminal',
        // THE THIRD COPY of the parent-terminal fabrication, and a third wording
        // again: this said `'Parent is Done; it must reopen because it is acquiring
        // live work.'` where the two other files said `'Parent "Registrations" is
        // Done; …'`. Neither is a sentence the engine can build. This one carried no
        // comment claiming a source, so it is the mildest of the three — a fake's
        // stimulus rather than a false claim — but it modelled an answer no producer
        // gives, and the imported builder costs nothing. See case 7.250.
        reason: PARENT_TERMINAL_REASON,
      })),
    );
    const [result] = await source.ingest([submittedTicketCreated()]);
    expect(result?.status).toBe('refused');
  });

  it('fans stream items out to subscribers and honours unsubscribe', () => {
    const source = createFakeDataSource();
    const seen: ServerStreamFrame[] = [];
    const unsubscribe = source.subscribe('ws_1', 0, (item) => seen.push(item));
    expect(source.subscriptions).toEqual([{ workspaceId: 'ws_1', afterSeq: 0 }]);
    source.pushStreamItem({ type: 'caught-up', workspaceId: 'ws_1', seq: 7 });
    unsubscribe();
    source.pushStreamItem({ type: 'caught-up', workspaceId: 'ws_1', seq: 8 });
    expect(seen).toEqual([{ type: 'caught-up', workspaceId: 'ws_1', seq: 7 }]);
  });

  it('serves overridable queries with honest empty defaults', async () => {
    const source = createFakeDataSource({ getMyWork: async () => ({ assigned: [], inTransit: [], contested: [], shared: [] }) });
    // `getPreferences` takes a workspaceId as of ruling P25 clause 2 — the route
    // 400s without one — so a call that compiles is itself part of the pin.
    expect(await source.query.getPreferences('ws_1')).toEqual({ version: 1, projects: {}, savedFilters: [] });
    // The stock VALUES and "nothing is set" are now two different constants,
    // and pinning both is the point: `DEFAULT_VIEW_PREFS` says the user has
    // chosen neither half — its `default` arms carry no value at all — while
    // `DEFAULT_GROUPING` is the value a view renders in that case. Fusing them
    // is what let a default be read as a choice (ruling P24).
    expect(DEFAULT_GROUPING).toBe('epic');
    expect(DEFAULT_LIST_COLUMNS).toEqual(['status', 'assignee', 'dueDate', 'progress']);
    expect(DEFAULT_VIEW_PREFS).toEqual({
      columns: { origin: 'default' },
      grouping: { origin: 'default' },
    });
    expect(DEFAULT_VIEW_PREFS.grouping).not.toHaveProperty('value');
  });
});

describe('7.249 the fixture sentence is pinned to the producer it models', () => {
  it('7.249c PARENT_TERMINAL_REASON is byte-identical to the engine\'s ADD arm', () => {
    expect(PARENT_TERMINAL_REASON).toBe(parentTerminalRefusal('Registrations', 'Done', 'add'));
  });
});
