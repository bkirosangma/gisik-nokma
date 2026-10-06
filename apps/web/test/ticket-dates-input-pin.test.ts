import { describe, expect, it } from 'vitest';
import type { ListRow } from '@gisik-nokma/app-core';
import { toTicketDatesInput } from '../src/ticket-dates-input.js';

/** Workflow and Timeline graphs, Part 1, T12 — case 29.114 (the shell half): the project page's adapter hands the pin to the Timeline. */
const row = (extra: Partial<ListRow> = {}): ListRow =>
  ({
    ticketId: 't1',
    title: 'Renew the licence',
    key: 'RTSF-1',
    typeId: 'task',
    parentId: null,
    stateId: 'doing',
    stateCategory: 'active',
    assignee: null,
    fields: {},
    ...extra,
  }) as ListRow;

describe('29.114 the shell adapter carries the paper pin from the list row to the Timeline input', () => {
  it('29.114 counts reach the input unchanged; a row with none (unknown) leaves the key off rather than inventing zeros', () => {
    const scope = { workspaceId: 'w', projectId: 'p' };
    expect(toTicketDatesInput(row({ pin: { notes: 2, attachments: 1 } }), scope, []).pin).toEqual({ notes: 2, attachments: 1 });
    const unknown = toTicketDatesInput(row(), scope, []);
    expect('pin' in unknown).toBe(false);
    // CONTROL: the rest of the input is still built (key and state), so the absence above is about the pin alone.
    expect(unknown.key).toBe('RTSF-1');
    expect(unknown.state.id).toBe('t1');
  });
});
