import { describe, expect, it } from 'vitest';
import { CONCEPT_EVENT_TYPES, type ConceptEventType } from '@gisik-nokma/domain';
import type { TicketHistoryEvent } from '../src/view-types.js';
import { describeEvent, type HistoryCopyContext } from '../src/views/history-copy.js';

/**
 * 27.456 (KG-D Task 3): every `concept.*` type has its own History sentence, asserted EXACTLY per row. "Not
 * `event.type`" alone would pass a sentence with the wrong verb, or the two link relations swapped. Imported by
 * relative path as `test/views/history-copy.test.ts:4` imports `describeEvent`.
 */
const C = '01J9ZQ8Y6N4V2K7M3H5T1R0W8C';
const T = '01J9ZQ8Y6N4V2K7M3H5T1R0W8D';
const N = '01J9ZQ8Y6N4V2K7M3H5T1R0W8E';

function event(type: string, payload: unknown): TicketHistoryEvent {
  return {
    id: '01J9ZQ8Y6N4V2K7M3H5T1R0W8F',
    type,
    version: 1,
    payload,
    actorId: 'u1',
    origin: 'web',
    clientTime: '2026-10-05T09:00:00.000Z',
    serverTime: '2026-10-05T09:00:00.100Z',
    seq: 1,
  };
}

type Row = { payload: unknown; ctx?: HistoryCopyContext; sentence: string };
const phones: HistoryCopyContext = { conceptName: () => 'Phones' };
const label: HistoryCopyContext = { itemLabel: () => 'GN-12 Scroll jumps' };

const TABLE: Record<ConceptEventType, Row[]> = {
  'concept.created': [
    { payload: { name: 'Scroll' }, sentence: 'Created the concept Scroll' },
    { payload: { name: 'Scroll', fromSuggestion: C }, sentence: 'Created the concept Scroll from a suggestion' },
  ],
  'concept.renamed': [{ payload: { name: 'Scroll jumps' }, sentence: 'Renamed the concept to Scroll jumps' }],
  'concept.described': [
    { payload: { summary: 'x' }, sentence: 'Changed the summary' },
    { payload: { summary: '' }, sentence: 'Cleared the summary' }, // `str` reads '' as absent (history-copy.ts:68-71)
  ],
  'concept.item_tagged': [
    { payload: { itemKind: 'ticket', itemId: T }, ctx: label, sentence: 'Added GN-12 Scroll jumps' },
    { payload: { itemKind: 'ticket', itemId: T }, sentence: 'Added a ticket' },
    { payload: { itemKind: 'note', itemId: N }, sentence: 'Added a note' },
    // Redacted (`itemId: ''`): the resolver is NOT asked, even when it would answer (planner ruling 2026-10-04, Q2).
    { payload: { itemKind: 'ticket', itemId: '' }, ctx: label, sentence: 'Added a ticket' },
  ],
  'concept.item_untagged': [
    { payload: { itemKind: 'ticket', itemId: T }, sentence: 'Removed a ticket from the concept' },
    { payload: { itemKind: 'note', itemId: '' }, sentence: 'Removed a note from the concept' },
  ],
  'concept.linked': [
    { payload: { otherId: C, relation: 'broader' }, ctx: phones, sentence: 'Set Phones as a broader concept' },
    { payload: { otherId: C, relation: 'related' }, ctx: phones, sentence: 'Linked the related concept Phones' },
    { payload: { otherId: C, relation: 'related' }, sentence: `Linked the related concept ${C}` },
  ],
  'concept.unlinked': [{ payload: { otherId: C, relation: 'related' }, ctx: phones, sentence: 'Removed the link to Phones' }],
  'concept.merged': [
    { payload: { intoId: C }, ctx: phones, sentence: 'Merged into Phones' },
    { payload: { intoId: C }, sentence: `Merged into ${C}` },
  ],
  'concept.deleted': [{ payload: {}, sentence: 'Deleted the concept' }],
};

describe('27.456 concept History sentences', () => {
  it('27.456 every concept.* type reads its exact sentence; controls: no name and an unknown item kind fall back to the raw type', () => {
    expect(Object.keys(TABLE).sort()).toEqual([...CONCEPT_EVENT_TYPES].sort());
    for (const type of CONCEPT_EVENT_TYPES) {
      for (const row of TABLE[type]) {
        expect(describeEvent(event(type, row.payload), row.ctx), `${type} ${JSON.stringify(row.payload)}`).toBe(row.sentence);
      }
    }
    // The fallbacks: a payload this file cannot read is headlined by its raw type.
    expect(describeEvent(event('concept.created', {}), phones)).toBe('concept.created');
    expect(describeEvent(event('concept.item_tagged', { itemKind: 'person', itemId: T }), label)).toBe('concept.item_tagged');
    expect(describeEvent(event('concept.renamed', {}), phones)).toBe('concept.renamed');
    expect(describeEvent(event('concept.linked', { relation: 'broader' }), phones)).toBe('concept.linked');
    expect(describeEvent(event('concept.linked', { otherId: C, relation: 'narrower' }), phones)).toBe('concept.linked');
    expect(describeEvent(event('concept.merged', {}), phones)).toBe('concept.merged');
  });
});
