import { describe, expect, it } from 'vitest';
import { compileFilterSpec, resolveMeInSpec } from '../../src/read/compile-filter.js';
import { SqlParams } from '../../src/read/sql-params.js';

describe('7.701–7.703 plural compile', () => {
  it('7.701/7.703 each plural key is ONE bound array parameter, ANY not ALL; hostile bytes stay data', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec({ assigneeIds: ['a', "o'brien"], stateIds: ['s1'] }, params);
    expect(clauses).toContain('t.assignee_id = ANY($1::text[])');
    expect(clauses).toContain('t.state_id = ANY($2::text[])');
    expect(params.toArray()).toEqual([['a', "o'brien"], ['s1']]);
    // 7.703: the quote is in the bound value and in no clause text
    expect(clauses.join(' ')).not.toContain("o'brien");

    // control: the singular key still compiles to a plain equality
    const single = new SqlParams();
    expect(compileFilterSpec({ assigneeId: 'a' }, single).clauses).toEqual(['t.assignee_id = $1']);
  });

  it('7.702 each of the six plural keys compiles against its own column', () => {
    const params = new SqlParams();
    const { clauses } = compileFilterSpec(
      { collaboratorIds: ['c'], typeIds: ['t'], stateCategories: ['open', 'active'], priorities: ['P1', 'P2'] },
      params,
    );
    expect(clauses).toEqual([
      't.collaborator_ids ?| $1::text[]',
      't.type_id = ANY($2::text[])',
      't.state_category = ANY($3::text[])',
      "(t.fields -> 'priority' ->> 'value') = ANY($4::text[])",
    ]);
  });
});

describe('7.704 resolveMeInSpec', () => {
  it('7.704 "me" becomes the viewer in the four person slots and nowhere else', () => {
    expect(resolveMeInSpec({ assigneeId: 'me', collaboratorIds: ['x', 'me'] }, 'V')).toEqual({
      assigneeId: 'V',
      collaboratorIds: ['x', 'V'],
    });
    expect(resolveMeInSpec({ assigneeIds: ['me', 'y'], collaboratorId: 'me' }, 'V')).toEqual({
      assigneeIds: ['V', 'y'],
      collaboratorId: 'V',
    });
    // control: not a person slot, and a real id passes through untouched
    expect(resolveMeInSpec({ typeId: 'me', assigneeId: 'real' }, 'V')).toEqual({ typeId: 'me', assigneeId: 'real' });
    expect(resolveMeInSpec({}, 'V')).toEqual({});
  });
});
