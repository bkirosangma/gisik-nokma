import { describe, expect, it } from 'vitest';
import { COMMENT_EVENT_TYPES, CONTEST_EVENT_TYPES, NOTE_EVENT_TYPES, TICKET_EVENT_TYPES } from '@gisik-nokma/domain';
import { NOT_A_REFERENCE_BODY, REFERENCE_BODY_EVENT_TYPES } from '../../src/projections/references.js';

/** Every event type filed on a ticket or a note stream. A type added to any of these lists must be classified below. */
const UNIVERSE = [
  ...new Set<string>([
    ...TICKET_EVENT_TYPES, ...NOTE_EVENT_TYPES, ...COMMENT_EVENT_TYPES, ...CONTEST_EVENT_TYPES,
    'visibility.set', 'purge.marked', 'purge.unmarked', 'purge.completed',
  ]),
].sort();

function unclassified(universe: readonly string[]): string[] {
  const handled = new Set<string>([...REFERENCE_BODY_EVENT_TYPES, ...Object.keys(NOT_A_REFERENCE_BODY)]);
  return universe.filter((type) => !handled.has(type));
}

describe('27.111 the projection’s own census: every ticket/note/comment type is a body or says why not', () => {
  it('27.111 nothing is unclassified, and an unknown type is reported (control)', () => {
    expect(UNIVERSE.length).toBeGreaterThan(20); // non-empty universe
    expect(unclassified(UNIVERSE)).toEqual([]);
    expect(unclassified([...UNIVERSE, 'ticket.link_added_test'])).toEqual(['ticket.link_added_test']);
    for (const type of REFERENCE_BODY_EVENT_TYPES) expect(NOT_A_REFERENCE_BODY, type).not.toHaveProperty(type);
  });
});
