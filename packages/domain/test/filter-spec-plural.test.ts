import { describe, expect, it } from 'vitest';
import { filterSpecSchema, savedFilterSchema } from '../src/index.js';

const A = '01J0A5ER0000000000000000AA';

describe('7.700 plural filter keys', () => {
  it('7.700 each plural key takes 1–20 values; empty, 21 and singular+plural of one field are refused; singles unchanged', () => {
    // control: every existing single-key spec still parses unchanged
    expect(filterSpecSchema.safeParse({ assigneeId: A, stateCategory: 'active', priority: 'P1' }).success).toBe(true);
    expect(filterSpecSchema.safeParse({ assigneeIds: [A, 'me'] }).success).toBe(true);
    expect(filterSpecSchema.safeParse({ collaboratorIds: [A] }).success).toBe(true);
    expect(filterSpecSchema.safeParse({ stateCategories: ['open', 'active'], priorities: ['P1'] }).success).toBe(true);
    expect(filterSpecSchema.safeParse({ assigneeIds: Array.from({ length: 20 }, (_, i) => `a${i}`) }).success).toBe(true);

    expect(filterSpecSchema.safeParse({ assigneeIds: [] }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ typeIds: Array.from({ length: 21 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ priorities: ['P9'] }).success).toBe(false);
    // a NUL byte is refused inside a list exactly as it is in a single value
    expect(filterSpecSchema.safeParse({ stateIds: ['a\u0000b'] }).success).toBe(false);

    // singular + plural of the SAME field, each of the six pairs
    expect(filterSpecSchema.safeParse({ assigneeId: A, assigneeIds: [A] }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ collaboratorId: A, collaboratorIds: [A] }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ typeId: 't', typeIds: ['t'] }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ stateId: 's', stateIds: ['s'] }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ stateCategory: 'open', stateCategories: ['open'] }).success).toBe(false);
    expect(filterSpecSchema.safeParse({ priority: 'P1', priorities: ['P1'] }).success).toBe(false);
    // different fields may mix a single and a list
    expect(filterSpecSchema.safeParse({ assigneeId: A, typeIds: ['t'] }).success).toBe(true);
  });
});

describe('7.706 the plural server keys do not reach a saved filter (ruling P26)', () => {
  it('7.706 a saved filter refuses every plural key and keeps its single-valued spec', () => {
    const saved = (filterSpec: unknown) => savedFilterSchema.safeParse({ id: 'f', name: 'Mine', filterSpec }).success;
    expect(saved({ assigneeId: A, stateCategory: 'active' })).toBe(true); // control
    expect(saved({ assigneeIds: [A] })).toBe(false);
    expect(saved({ collaboratorIds: [A] })).toBe(false);
    expect(saved({ typeIds: ['t'] })).toBe(false);
    expect(saved({ stateIds: ['s'] })).toBe(false);
    expect(saved({ stateCategories: ['open'] })).toBe(false);
    expect(saved({ priorities: ['P1'] })).toBe(false);
    // …while the live list/search schema accepts the same spec
    expect(filterSpecSchema.safeParse({ assigneeIds: [A] }).success).toBe(true);
  });
});
