import { describe, expect, it } from 'vitest';
import { filterSpecSchema, groupingSchema, GROUPINGS } from '../src/filter-spec.js';

describe('filterSpecSchema', () => {
  it('accepts a composed filter', () => {
    const spec = {
      assigneeId: 'usr_01',
      stateCategory: 'active',
      blocked: true,
      text: 'GST portal',
      due: { before: '2026-08-31', after: '2026-08-01' },
      fields: [{ fieldId: 'amount', op: 'eq', value: '4200' }],
    };
    expect(filterSpecSchema.parse(spec)).toEqual(spec);
  });

  it('accepts the empty filter', () => {
    expect(filterSpecSchema.parse({})).toEqual({});
  });

  it('refuses unknown keys — a typo must not silently match everything', () => {
    expect(() => filterSpecSchema.parse({ asigneeId: 'usr_01' })).toThrow();
  });

  it('refuses bad field ops and malformed due dates', () => {
    expect(() => filterSpecSchema.parse({ fields: [{ fieldId: 'x', op: 'regex', value: '.*' }] })).toThrow();
    expect(() => filterSpecSchema.parse({ due: { before: 'yesterday' } })).toThrow();
    expect(() => filterSpecSchema.parse({ due: { before: '2026-8-1' } })).toThrow();
    expect(() => filterSpecSchema.parse({ due: { after: '2026-08-01T00:00:00Z' } })).toThrow();
    expect(() => filterSpecSchema.parse({ due: { soon: true } })).toThrow();
    expect(() => filterSpecSchema.parse({ fields: [{ fieldId: 'x', op: 'eq', value: 'v', extra: 1 }] })).toThrow();
  });

  it('bounds list sizes and string lengths', () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => ({ fieldId: `f${i}`, op: 'eq' as const, value: 'v' }));
    expect(() => filterSpecSchema.parse({ fields: tooMany })).toThrow();
    expect(() => filterSpecSchema.parse({ text: 'x'.repeat(501) })).toThrow();
    expect(() => filterSpecSchema.parse({ fields: [{ fieldId: 'x'.repeat(201), op: 'eq', value: 'v' }] })).toThrow();
    expect(() => filterSpecSchema.parse({ fields: [{ fieldId: 'x', op: 'eq', value: 'v'.repeat(501) }] })).toThrow();
    // The boundaries themselves are accepted — a bound that rejects its own
    // limit is an off-by-one nobody notices until a real filter hits it.
    expect(filterSpecSchema.parse({ text: 'x'.repeat(500) }).text).toHaveLength(500);
    expect(filterSpecSchema.parse({ fields: Array.from({ length: 10 }, () => ({ fieldId: 'f', op: 'eq' as const, value: 'v' })) }).fields).toHaveLength(10);
  });

  it('refuses empty identifiers — an empty assignee is not "any assignee"', () => {
    expect(() => filterSpecSchema.parse({ assigneeId: '' })).toThrow();
    expect(() => filterSpecSchema.parse({ collaboratorId: '' })).toThrow();
    expect(() => filterSpecSchema.parse({ typeId: '' })).toThrow();
    expect(() => filterSpecSchema.parse({ stateId: '' })).toThrow();
    expect(() => filterSpecSchema.parse({ text: '' })).toThrow();
    expect(() => filterSpecSchema.parse({ fields: [{ fieldId: '', op: 'eq', value: 'v' }] })).toThrow();
  });

  it('refuses a non-category and a non-boolean blocked', () => {
    expect(() => filterSpecSchema.parse({ stateCategory: 'blocked' })).toThrow();
    expect(() => filterSpecSchema.parse({ blocked: 'true' })).toThrow();
  });

  /**
   * The NUL door. Seven slots take a free-form string; every one of them ends
   * up bound into a query, and Postgres text cannot carry U+0000. The other
   * four slots need no guard and this test says why, so the count is defensible
   * rather than inherited: `stateCategory` is an enum, `blocked` is a boolean,
   * and `due.before`/`due.after` are `\d`-class regexes that no NUL can satisfy
   * — asserted below rather than asserted about.
   */
  const NUL = String.fromCharCode(0);

  it('refuses U+0000 in every one of the seven free-form string slots', () => {
    const slots: Array<[string, unknown]> = [
      ['assigneeId', { assigneeId: `a${NUL}b` }],
      ['collaboratorId', { collaboratorId: `a${NUL}b` }],
      ['typeId', { typeId: `a${NUL}b` }],
      ['stateId', { stateId: `a${NUL}b` }],
      ['text', { text: `a${NUL}b` }],
      ['fields[].fieldId', { fields: [{ fieldId: `a${NUL}b`, op: 'eq', value: 'v' }] }],
      ['fields[].value', { fields: [{ fieldId: 'f', op: 'eq', value: `a${NUL}b` }] }],
    ];
    expect(slots).toHaveLength(7);
    for (const [name, spec] of slots) {
      const result = filterSpecSchema.safeParse(spec);
      expect(result.success, `${name} admitted a NUL`).toBe(false);
      // The refusal names the reason, so a 400 is readable rather than "invalid".
      expect(JSON.stringify(result.error?.issues)).toContain('U+0000');
    }
    // A NUL anywhere, not only in the middle: leading and trailing too.
    expect(filterSpecSchema.safeParse({ assigneeId: `${NUL}usr_01` }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ assigneeId: `usr_01${NUL}` }).success).toBe(false);
    // Positive control: the same specs without the NUL byte all parse, so the
    // refusals above are about the byte and not about the shapes.
    expect(filterSpecSchema.safeParse({ assigneeId: 'ab' }).success).toBe(true);
    expect(filterSpecSchema.safeParse({ text: 'ab' }).success).toBe(true);
    expect(filterSpecSchema.safeParse({ fields: [{ fieldId: 'ab', op: 'eq', value: 'ab' }] }).success).toBe(true);
  });

  it('refuses NUL in the two due slots too — via their shape, which is why they carry no separate guard', () => {
    expect(filterSpecSchema.safeParse({ due: { before: `2026-08-31${NUL}` } }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ due: { after: `${NUL}2026-08-01` } }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ due: { before: '2026-08-31' } }).success).toBe(true);
  });

  it('refuses ONLY NUL — every other control character the store can hold still parses', () => {
    // Measured against this product's Postgres: BEL, TAB, LF, ESC, DEL and a
    // lone surrogate all round-trip through `text` and `websearch_to_tsquery`.
    // A door that refused them would refuse values the store carries fine — a
    // pasted multi-line search term being the obvious one.
    for (const code of [7, 9, 10, 13, 27, 127, 0xd800]) {
      const value = `a${String.fromCharCode(code)}b`;
      expect(filterSpecSchema.safeParse({ text: value }).success, `code ${code}`).toBe(true);
      expect(filterSpecSchema.parse({ assigneeId: value }).assigneeId).toBe(value);
    }
  });

  it('the due bound constrains day SHAPE, not calendar existence — the text comparison needs the padding, not the calendar', () => {
    // Stated because the docblock now claims exactly this: `9999-99-99` is not
    // a day, and it is admitted on purpose. Fixed-width zero-padding is what
    // makes the compiled text `<=` mean a chronological `<=`; demanding a real
    // calendar day would also make this door stricter than the storage schema
    // whose values it is compared against.
    expect(filterSpecSchema.parse({ due: { before: '9999-99-99' } }).due?.before).toBe('9999-99-99');
    expect(filterSpecSchema.parse({ due: { after: '2026-02-30' } }).due?.after).toBe('2026-02-30');
    // The padding itself is still required — that is the part the comparison needs.
    expect(() => filterSpecSchema.parse({ due: { before: '2026-8-1' } })).toThrow();
  });

  it('admits an empty field VALUE and refuses an empty field ID — the two are different claims', () => {
    // Declared in the schema: `{op:'eq', value:''}` is "this field's value is
    // the empty string", a real claim; `{op:'contains', value:''}` is therefore
    // a field-presence predicate. Neither is a typo'd omission, so neither is
    // refused. `fieldId: ''` names nothing and stays refused.
    expect(filterSpecSchema.parse({ fields: [{ fieldId: 'notes', op: 'eq', value: '' }] }).fields?.[0]?.value).toBe('');
    expect(filterSpecSchema.parse({ fields: [{ fieldId: 'notes', op: 'contains', value: '' }] }).fields?.[0]?.value).toBe('');
    expect(() => filterSpecSchema.parse({ fields: [{ fieldId: '', op: 'contains', value: '' }] })).toThrow();
  });

  it('keeps hostile bytes intact rather than sanitising them — the compiler binds, it does not launder', () => {
    const hostile = `'); DROP TABLE proj_tickets; --`;
    expect(filterSpecSchema.parse({ text: hostile }).text).toBe(hostile);
    expect(filterSpecSchema.parse({ fields: [{ fieldId: hostile, op: 'contains', value: hostile }] }).fields?.[0]).toEqual({
      fieldId: hostile,
      op: 'contains',
      value: hostile,
    });
  });
});

describe('groupingSchema', () => {
  it('accepts exactly the five groupings', () => {
    for (const g of ['epic', 'status', 'assignee', 'type', 'flat']) {
      expect(groupingSchema.parse(g)).toBe(g);
    }
    expect(() => groupingSchema.parse('priority')).toThrow();
    expect(GROUPINGS).toEqual(['epic', 'status', 'assignee', 'type', 'flat']);
  });
});
