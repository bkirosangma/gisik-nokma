import { describe, expect, it } from 'vitest';
import { MappingError } from '../../src/wire-readers.js';
import { mapListPage } from '../../src/online/mappers.js';

/**
 * Workflow and Timeline graphs, Part 1, T12 — case 29.114. The list row's optional paper-pin counts cross the wire whole or not
 * at all: a server that predates the field leaves `pin` off the row (the replica leaves it off too), a server that sends it
 * sends both counts, and a half-built or mistyped one is a refusal that names the path. Never a silent zero.
 */
const claim = { actorId: 'user_anselma', clientTime: '2026-08-19T09:59:00.000Z', serverTime: '2026-08-19T10:01:00.000Z' };
const card = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  ticketId: '01J9GTKT000000000000000000',
  title: 'Renew the trade licence',
  key: 'RTSF-1',
  typeId: 'task',
  typeRank: 3,
  parentId: null,
  epicId: null,
  stateId: 'doing',
  stateName: 'Doing',
  stateCategory: 'active',
  stateProvenance: claim,
  assigneeId: null,
  assignedProvenance: null,
  dueDate: { state: 'never-claimed' },
  priority: { value: 'P2', ...claim },
  fields: {},
  rollup: null,
  hasRestrictedParent: false,
  closed: null,
  rank: null,
  ...extra,
});
const page = (c: Record<string, unknown>): unknown => ({
  workspaceId: '01J9GWS0000000000000000000',
  projectId: '01J9GPRJ000000000000000000',
  groupBy: 'flat',
  groups: [{ key: 'all', label: 'All tickets', cards: [c] }],
  nextCursor: null,
});

describe('29.114 the list row carries the paper pin whole, or not at all', () => {
  it('29.114 a pin on the wire reaches the row; no pin leaves the field off the row (unknown), and zeros stay zeros (known: none)', () => {
    const withPin = mapListPage(page(card({ pin: { notes: 2, attachments: 1 } }))).rows[0];
    expect(withPin?.pin).toEqual({ notes: 2, attachments: 1 });
    const none = mapListPage(page(card({ pin: { notes: 0, attachments: 0 } }))).rows[0];
    expect(none?.pin).toEqual({ notes: 0, attachments: 0 });
    const absent = mapListPage(page(card())).rows[0];
    expect(absent).toBeDefined();
    // Unknown is NOT zero: the key is not on the row at all, so a reader cannot mistake "never asked" for "has nothing".
    expect(absent !== undefined && 'pin' in absent).toBe(false);
  });

  it('29.114 a pin missing one count, or carrying a non-number, is refused naming its path', () => {
    expect(() => mapListPage(page(card({ pin: { notes: 2 } })))).toThrow(MappingError);
    expect(() => mapListPage(page(card({ pin: { notes: 2 } })))).toThrow(/cards\[0\]\.pin\.attachments/);
    expect(() => mapListPage(page(card({ pin: { notes: '2', attachments: 1 } })))).toThrow(/cards\[0\]\.pin\.notes/);
    expect(() => mapListPage(page(card({ pin: 'two notes' })))).toThrow(MappingError);
    // CONTROL: the same card with a whole pin maps, so the refusals above are about the pin and nothing else on the card.
    expect(() => mapListPage(page(card({ pin: { notes: 2, attachments: 1 } })))).not.toThrow();
  });
});
