import { describe, expect, it } from 'vitest';
import {
  CONCEPT_EVENT_TYPES,
  CONCEPT_PAYLOADS,
  ENTITY_KINDS,
  conceptCreatedPayload,
  conceptDeletedPayload,
  conceptDescribedPayload,
  conceptItemTaggedPayload,
  conceptLinkedPayload,
  conceptMergedPayload,
  domainRegistry,
} from '../src/index.js';

/** Knowledge Graph spec D §3.1: the concept vocabulary (KG-D Task 3, cases 27.440–27.442). */
describe('27.440–27.442 the concept vocabulary', () => {
  it('27.440 concept is an entity kind, last; control: notebook still is not', () => {
    expect(ENTITY_KINDS.at(-1)).toBe('concept');
    // Ten, and `group` still directly before it: 'concept' REPLACING 'group' (or added twice) passes `.at(-1)` alone.
    expect(ENTITY_KINDS).toHaveLength(10);
    expect(ENTITY_KINDS.at(-2)).toBe('group');
    expect([...ENTITY_KINDS]).not.toContain('notebook'); // sanity only: no code in this task can add it (18.001 owns it)
  });

  it('27.441 each payload takes its shape and refuses an extra member, an unknown kind or relation; control: the valid shape parses', () => {
    expect(conceptCreatedPayload.safeParse({ name: 'Scroll position on phone sheets' }).success).toBe(true);
    expect(conceptCreatedPayload.safeParse({ name: 'X', summary: 's', fromSuggestion: '01J9ZQ8Y6N4V2K7M3H5T1R0W8C' }).success).toBe(true);
    expect(conceptCreatedPayload.safeParse({ name: '' }).success).toBe(false);
    expect(conceptCreatedPayload.safeParse({ name: 'X', extra: 1 }).success).toBe(false);
    expect(conceptItemTaggedPayload.safeParse({ itemKind: 'ticket', itemId: 'T' }).success).toBe(true);
    expect(conceptItemTaggedPayload.safeParse({ itemKind: 'comment', itemId: 'T' }).success).toBe(false);
    expect(conceptLinkedPayload.safeParse({ otherId: 'C', relation: 'broader' }).success).toBe(true);
    expect(conceptLinkedPayload.safeParse({ otherId: 'C', relation: 'narrower' }).success).toBe(false);
    expect(conceptMergedPayload.safeParse({ intoId: 'C' }).success).toBe(true);
    expect(conceptDeletedPayload.safeParse({}).success).toBe(true);
    expect(conceptDeletedPayload.safeParse({ why: 'x' }).success).toBe(false);
    expect(conceptDescribedPayload.safeParse({ summary: 'x'.repeat(2001) }).success).toBe(false);
    expect(conceptDescribedPayload.safeParse({ summary: 'x'.repeat(2000) }).success).toBe(true); // the bar itself: `max(1999)` reds here
    expect(conceptDescribedPayload.safeParse({ summary: '' }).success).toBe(true); // control: '' clears
    expect(conceptCreatedPayload.safeParse({ name: '   ' }).success).toBe(false); // displayName, not z.string().min(1)
    // An id is never empty: '' is how a READ redacts an item (Task 4), never what an event may carry.
    expect(conceptItemTaggedPayload.safeParse({ itemKind: 'ticket', itemId: '' }).success).toBe(false);
    expect(conceptLinkedPayload.safeParse({ otherId: '', relation: 'related' }).success).toBe(false);
    expect(conceptMergedPayload.safeParse({ intoId: '' }).success).toBe(false);
    expect(conceptCreatedPayload.safeParse({ name: 'X', fromSuggestion: '' }).success).toBe(false);
    // Every schema is strict: a valid sample per type parses, and the same with one extra member does not.
    const samples: Record<string, Record<string, unknown>> = {
      'concept.created': { name: 'X' },
      'concept.renamed': { name: 'Y' },
      'concept.described': { summary: 's' },
      'concept.item_tagged': { itemKind: 'note', itemId: 'N' },
      'concept.item_untagged': { itemKind: 'ticket', itemId: 'T' },
      'concept.linked': { otherId: 'C', relation: 'related' },
      'concept.unlinked': { otherId: 'C', relation: 'broader' },
      'concept.merged': { intoId: 'C' },
      'concept.deleted': {},
    };
    expect(Object.keys(samples).sort()).toEqual([...CONCEPT_EVENT_TYPES].sort());
    for (const type of CONCEPT_EVENT_TYPES) {
      expect(CONCEPT_PAYLOADS[type].safeParse(samples[type]).success, type).toBe(true);
      expect(CONCEPT_PAYLOADS[type].safeParse({ ...samples[type], extra: 1 }).success, type).toBe(false);
    }
  });

  it('27.442 the nine are registered at version 1 against concept, and nothing else is a concept.* type; control: each carries its own schema', () => {
    expect(CONCEPT_EVENT_TYPES).toHaveLength(9);
    for (const type of CONCEPT_EVENT_TYPES) {
      expect(domainRegistry.get(type, 1)?.entityKind, type).toBe('concept');
      // The control. `hasType('concept.bogus')` could not fail: nothing in this task registers a bogus type.
      // A loop that registered every type with ONE schema can: identity per type (planner ruling 2026-10-04, Q7: accepted).
      expect(domainRegistry.get(type, 1)?.payloadSchema, type).toBe(CONCEPT_PAYLOADS[type]);
    }
    // `registrations()` is the ref's listing (registry.ts:40-41).
    const conceptTypes = domainRegistry
      .registrations()
      .map((r) => r.type)
      .filter((type) => type.startsWith('concept.'));
    expect(conceptTypes.sort()).toEqual([...CONCEPT_EVENT_TYPES].sort());
  });
});
