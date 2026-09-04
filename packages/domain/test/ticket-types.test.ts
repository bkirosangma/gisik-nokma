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
import * as ticketTypesModule from '../src/ticket-types.js';
import { IST_DAY_REGEX, istDayBounds } from '../src/ist-day.js';

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

/**
 * Plan 9 consumption pin. The Calendar and Timeline read startDate and dueDate
 * through app-core's dateClaimOf, which destructures { date, note? } and
 * validates the day with IST_DAY_REGEX — the SAME regex, imported from the
 * same dependency-free module, not a second literal that could drift. This is
 * the one place the built-in's schema is held against that origin: if the
 * schema ever widens — a datetime, a range, or a second schema for startDate —
 * it fails here, loudly, instead of silently inside a bar someone trusts.
 *
 * It guards; it does not drive. It passes the moment Plan 3's startDate
 * built-in is in place. To watch it bite, loosen the schema's regex to allow a datetime
 * and re-run: the second case fails.
 */
describe('the day-claim shape Plan 9 reads', () => {
  it('asks for two day built-ins, and both are built-ins', () => {
    expect(BUILTIN_FIELD_IDS).toEqual(expect.arrayContaining(['startDate', 'dueDate']));
  });

  it('validates both of them with ONE schema — startDate has none of its own', () => {
    expect(dueDateValueSchema.parse({ date: '2026-09-01' })).toEqual({ date: '2026-09-01' });
    expect(Object.keys(ticketTypesModule).filter((name) => /^startDateValue/.test(name))).toEqual([]);
  });

  it('accepts exactly the days the reader accepts, and refuses exactly the ones it refuses', () => {
    for (const day of ['2026-09-01', '2026-12-31', '2027-01-01']) {
      expect(dueDateValueSchema.safeParse({ date: day }).success).toBe(IST_DAY_REGEX.test(day));
    }
    for (const notADay of ['2026-09-01T10:00:00Z', '01/09/2026', '2026-9-1', '']) {
      expect(dueDateValueSchema.safeParse({ date: notADay }).success).toBe(IST_DAY_REGEX.test(notADay));
    }
  });

  it('a day claim is a day, never an instant — the reader never has to guess which it got', () => {
    // istDayOf refuses a date-only string and istDayBounds refuses an instant:
    // the two shapes are not interchangeable, and Plan 1 proves it. The claim
    // side is the day side, always.
    expect(IST_DAY_REGEX.test('2026-09-01')).toBe(true);
    expect(IST_DAY_REGEX.test('2026-09-01T00:00:00.000Z')).toBe(false);
    expect(istDayBounds('2026-09-01')).toEqual({
      startUtc: '2026-08-31T18:30:00.000Z',
      endUtc: '2026-09-01T18:30:00.000Z',
    });
  });

  it('carries an optional note the reader passes through, and nothing else', () => {
    expect(dueDateValueSchema.parse({ date: '2026-09-01', note: 'after the bank account opens' })).toEqual({
      date: '2026-09-01',
      note: 'after the bank account opens',
    });
    expect(dueDateValueSchema.safeParse('2026-09-01').success).toBe(false); // a bare string is not a claim
  });
});
