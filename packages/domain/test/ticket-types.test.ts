import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FIELD_IDS,
  BUILTIN_TICKET_TYPE_SEEDS,
  DEEPEST_RANK,
  SUB_TASK_TYPE_ID,
  builtinTicketTypeDefs,
  customFieldDefSchema,
  dueDateValueSchema,
  ticketTypeDefSchema,
} from '../src/ticket-types.js';

describe('customFieldDefSchema', () => {
  it('accepts a plain text field', () => {
    expect(customFieldDefSchema.parse({ id: 'notes', name: 'Notes', type: 'text' })).toEqual({
      id: 'notes',
      name: 'Notes',
      type: 'text',
    });
  });

  it('refuses a select field without options — a choice list needs choices', () => {
    expect(() => customFieldDefSchema.parse({ id: 'stage', name: 'Stage', type: 'select' })).toThrow();
  });

  it('refuses options on a non-select field', () => {
    expect(() =>
      customFieldDefSchema.parse({ id: 'notes', name: 'Notes', type: 'text', options: ['a'] }),
    ).toThrow();
  });
});

describe('ticketTypeDefSchema', () => {
  const base = { id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic' };

  it('accepts a custom type with typed fields', () => {
    const def = ticketTypeDefSchema.parse({
      ...base,
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    });
    expect(def.rank).toBe(3);
    expect(def.fields).toHaveLength(1);
  });

  it('refuses rank below 1 — rank 1 is the top of the ladder', () => {
    expect(() => ticketTypeDefSchema.parse({ ...base, rank: 0, fields: [] })).toThrow();
  });

  it('refuses duplicate field ids within one type', () => {
    expect(() =>
      ticketTypeDefSchema.parse({
        ...base,
        fields: [
          { id: 'amount', name: 'Amount', type: 'number' },
          { id: 'amount', name: 'Amount again', type: 'text' },
        ],
      }),
    ).toThrow();
  });

  it('refuses a custom field that shadows a built-in field id', () => {
    expect(() =>
      ticketTypeDefSchema.parse({ ...base, fields: [{ id: 'dueDate', name: 'Due', type: 'date' }] }),
    ).toThrow();
  });
});

describe('built-in seeds', () => {
  it('ships the ladder epic(1) story(2) task(3) sub-task(4)', () => {
    expect(BUILTIN_TICKET_TYPE_SEEDS.map((t) => [t.id, t.rank])).toEqual([
      ['epic', 1],
      ['story', 2],
      ['task', 3],
      ['sub-task', 4],
    ]);
    expect(SUB_TASK_TYPE_ID).toBe('sub-task');
    // DEEPEST_RANK is the rank the parent-required rule keys off (design
    // decision 9). It must equal the deepest rank in the shipped ladder — if a
    // future seed goes deeper, this assertion is the thing that says so.
    expect(DEEPEST_RANK).toBe(Math.max(...BUILTIN_TICKET_TYPE_SEEDS.map((t) => t.rank)));
    expect(DEEPEST_RANK).toBe(4);
    expect(BUILTIN_FIELD_IDS).toEqual(['title', 'description', 'dueDate', 'startDate']);
  });

  it('materialises full defs bound to a workspace default workflow', () => {
    const defs = builtinTicketTypeDefs('wf-default');
    expect(defs).toHaveLength(4);
    for (const def of defs) {
      expect(ticketTypeDefSchema.parse(def)).toEqual(def);
      expect(def.workflowId).toBe('wf-default');
      expect(def.fields).toEqual([]);
    }
  });
});

describe('dueDateValueSchema', () => {
  it('accepts a day with an optional note', () => {
    expect(dueDateValueSchema.parse({ date: '2026-08-30' })).toEqual({ date: '2026-08-30' });
    expect(dueDateValueSchema.parse({ date: '2026-08-30', note: 'GST filing' })).toEqual({
      date: '2026-08-30',
      note: 'GST filing',
    });
  });

  it('refuses a timestamp — a due date is a day, not a moment', () => {
    expect(() => dueDateValueSchema.parse({ date: '2026-08-30T10:00:00Z' })).toThrow();
  });
});
