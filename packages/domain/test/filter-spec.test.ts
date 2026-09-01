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
