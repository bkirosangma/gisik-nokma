import { describe, expect, it } from 'vitest';
import {
  BUILTIN_FIELD_IDS,
  BUILTIN_TICKET_TYPE_SEEDS,
  DEEPEST_RANK,
  DEFAULT_PRIORITY,
  PRIORITIES,
  SUB_TASK_TYPE_ID,
  builtinTicketTypeDefs,
  claimedEstimate,
  claimedWaitForAll,
  customFieldDefSchema,
  dueDateValueSchema,
  estimateValueSchema,
  prioritySchema,
  ticketTypeDefSchema,
  waitForAllValueSchema,
} from '../src/ticket-types.js';
import * as ticketTypesModule from '../src/ticket-types.js';
import { IST_DAY_REGEX, istDayBounds } from '../src/ist-day.js';

/**
 * 5.1 — Five refusals across customFieldDefSchema and ticketTypeDefSchema prove the row's five clauses: select-without-options, options-on-non-select, duplicate field ids, built-in-field-id shadowing, and rank below 1.
 */
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

  /**
   * 5.79 — E6-20, planted defect: a ticket-type name, a custom-field name and
   * a select option of only spaces are refused with ruling P15's sentence,
   * from the one `displayName` schema the workspace and project names use.
   * Before the fix all three were `z.string().min(1)`: through
   * `POST /v1/events` a type named `" "` committed and `GET ticket-types`
   * listed it, and a `" "` option was a choice with no label. RED: `parse`
   * returned the value on all three. The padded control keeps this a refusal,
   * not a trim.
   */
  it('planted defect: a type, field or option name of only spaces names nothing', () => {
    const sentence = /a name of only spaces names nothing/;
    expect(() => customFieldDefSchema.parse({ id: 'notes', name: ' ', type: 'text' })).toThrow(sentence);
    expect(() =>
      customFieldDefSchema.parse({ id: 'stage', name: 'Stage', type: 'select', options: ['Draft', ' '] }),
    ).toThrow(sentence);
    expect(() =>
      ticketTypeDefSchema.parse({ id: 'feature', name: ' ', icon: 'flag', rank: 2, workflowId: 'wf', fields: [] }),
    ).toThrow(sentence);
    expect(customFieldDefSchema.parse({ id: 'notes', name: '  Notes  ', type: 'text' }).name).toBe('  Notes  ');
  });

  /**
   * 13.781 — `required: true` survives the parse.
   *
   * The witness for the schema member being LOAD-BEARING rather than
   * decorative. A zod object STRIPS a key it does not declare, so before this
   * member existed a `required: true` authored in the type editor would have
   * been dropped here — silently, at the projection, the offline replica and the
   * engine's memory context alike, all of which parse through this schema
   * (`apps/server/src/projections/ticket-types.ts:56`,
   * `sync-client/src/replica/replica.ts:295`,
   * `rule-engine/src/memory-context.ts:136`). The editor would still have shown
   * "Required"; the recorded definition would not have said so. This case is
   * what makes that discrepancy impossible rather than merely unlikely.
   */
  it('carries `required: true` through the parse — the member is declared, not stripped', () => {
    expect(customFieldDefSchema.parse({ id: 'amount', name: 'Amount', type: 'number', required: true })).toEqual({
      id: 'amount',
      name: 'Amount',
      type: 'number',
      required: true,
    });
  });

  /**
   * 13.782 — a field that never decided carries NO `required` key.
   *
   * The no-migration witness AND the never-said witness at once. Every
   * `ticket-type.defined` recorded before 2026-09-18 has no such key, so if this
   * member were `z.boolean().default(false)` those events would come back
   * claiming `required: false` — a claim their author never made, and the same
   * defect class as the `p.value ?? null` that folded an absent value into a
   * clearing nobody made (`rule-engine/src/checks/fields.ts:77-83`). Asserted as
   * key ABSENCE, not as a falsy value: `toEqual` would pass on `undefined` while
   * `'required' in` is the property that actually matters — and 13.781 above is
   * its positive control, proving the key does appear when it is authored.
   */
  it('leaves `required` absent when the definition never said — absent is not false', () => {
    const parsed = customFieldDefSchema.parse({ id: 'notes', name: 'Notes', type: 'text' });
    expect('required' in parsed).toBe(false);
  });

  /**
   * 13.783 — a non-boolean `required` is refused rather than coerced.
   */
  it('refuses a `required` that is not a boolean', () => {
    expect(() =>
      customFieldDefSchema.parse({ id: 'notes', name: 'Notes', type: 'text', required: 'yes' }),
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

  it('3.962 refuses a custom field with id "priority" — priority is a built-in now', () => {
    expect(() =>
      ticketTypeDefSchema.parse({ ...base, fields: [{ id: 'priority', name: 'Priority', type: 'select', options: ['P1'] }] }),
    ).toThrow(/shadows a built-in field/);
  });

  it('3.963 the priority vocabulary has ONE origin: three values, P2 in the middle is the default', () => {
    expect(PRIORITIES).toEqual(['P1', 'P2', 'P3']);
    expect(DEFAULT_PRIORITY).toBe('P2');
    for (const value of PRIORITIES) expect(prioritySchema.parse(value)).toBe(value);
    expect(() => prioritySchema.parse('P0')).toThrow();
    expect(() => prioritySchema.parse('p1')).toThrow();
    expect(() => prioritySchema.parse(null)).toThrow();
  });

  it('29.153 the three flow built-ins are reserved ids, validated by one origin', () => {
    for (const id of ['estimate', 'waitForAll', 'reworkEstimate']) {
      expect(() => ticketTypeDefSchema.parse({ ...base, fields: [{ id, name: 'X', type: 'number' }] }), id).toThrow(/shadows a built-in field/);
    }
    expect(() => ticketTypeDefSchema.parse({ ...base, fields: [{ id: 'estimates', name: 'X', type: 'number' }] })).not.toThrow(); // control
    for (const ok of [1, 3, 365]) expect(estimateValueSchema.parse(ok)).toBe(ok);
    for (const bad of [0, 366, 2.5, -1, '3', Number.NaN, null, true]) expect(estimateValueSchema.safeParse(bad).success, String(bad)).toBe(false);
    expect(waitForAllValueSchema.safeParse(true).success).toBe(true);
    for (const bad of [false, null, 'true', 1]) expect(waitForAllValueSchema.safeParse(bad).success, String(bad)).toBe(false);
    expect(claimedEstimate({ estimate: { value: 3 } }, 'estimate')).toBe(3);
    expect(claimedEstimate({ estimate: { value: 0 } }, 'estimate')).toBeNull();
    expect(claimedEstimate({}, 'reworkEstimate')).toBeNull();
    // Each id reads its OWN claim: with both present, the two readings differ.
    expect(claimedEstimate({ estimate: { value: 3 }, reworkEstimate: { value: 2 } }, 'reworkEstimate')).toBe(2);
    expect(claimedEstimate({ estimate: { value: 3 }, reworkEstimate: { value: 2 } }, 'estimate')).toBe(3);
    expect(claimedWaitForAll({ waitForAll: { value: true } })).toBe(true);
    expect(claimedWaitForAll({ waitForAll: { value: null } })).toBe(false);
  });
});

/**
 * 5.2 — Asserts the shipped ladder's ranks (epic1/story2/task3/sub-task4, and the Decision at 3 beside Task, wtg2 T5 case 29.134), that DEEPEST_RANK equals the ladder's real computed maximum (not just the literal 4), and that builtinTicketTypeDefs materialises all five types bound to the given default workflow.
 */
describe('built-in seeds', () => {
  it('ships the ladder epic(1) story(2) task(3) sub-task(4) decision(3)', () => {
    expect(BUILTIN_TICKET_TYPE_SEEDS.map((t) => [t.id, t.rank])).toEqual([
      ['epic', 1],
      ['story', 2],
      ['task', 3],
      ['sub-task', 4],
      ['decision', 3],
    ]);
    expect(SUB_TASK_TYPE_ID).toBe('sub-task');
    // DEEPEST_RANK is the rank the parent-required rule keys off (design
    // decision 9). It must equal the deepest rank in the shipped ladder — if a
    // future seed goes deeper, this assertion is the thing that says so.
    expect(DEEPEST_RANK).toBe(Math.max(...BUILTIN_TICKET_TYPE_SEEDS.map((t) => t.rank)));
    expect(DEEPEST_RANK).toBe(4);
    expect(BUILTIN_FIELD_IDS).toEqual(['title', 'description', 'dueDate', 'startDate', 'priority', 'estimate', 'waitForAll', 'reworkEstimate']);
  });

  it('materialises full defs bound to a workspace default workflow', () => {
    const defs = builtinTicketTypeDefs('wf-default');
    expect(defs).toHaveLength(5);
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

  /**
   * 5.77 — E6-19, planted defect: a due date that is the right SHAPE and no
   * day at all is refused. Before the fix `IST_DAY_REGEX` was the whole check:
   * `2026-02-30`, `2026-13-45` and `0000-00-00` committed through
   * `POST /v1/events`, the board served them, and the attention strip said
   * "Needed by 0000-00-00 — due within 7 days" (a STRING compare, so
   * `0000-00-00` is due-soon forever and `2026-13-45` never). RED: `parse`
   * returned the value. The leap-day control keeps the refinement from being a
   * "February has 28 days" rule.
   */
  it('planted defect: refuses a day no calendar has — the right shape is not a day', () => {
    for (const date of ['2026-02-30', '2026-13-45', '0000-00-00']) {
      expect(() => dueDateValueSchema.parse({ date }), date).toThrow(/a day the calendar has/);
    }
    expect(dueDateValueSchema.parse({ date: '2028-02-29' })).toEqual({ date: '2028-02-29' });
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
