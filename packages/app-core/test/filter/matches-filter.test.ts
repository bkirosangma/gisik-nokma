import { describe, expect, it } from 'vitest';
import type { FieldClaim, TicketState } from '@gisik-nokma/domain';
import { matchesFilter } from '../../src/filter/matches-filter.js';

function claim(value: unknown): FieldClaim {
  return {
    value,
    actorId: 'user_kiro',
    clientTime: '2026-08-19T10:00:00.000Z',
    serverTime: '2026-08-19T10:00:01.000Z',
  };
}

function ticket(overrides: Partial<TicketState> = {}): TicketState {
  return {
    kind: 'ticket',
    id: 't1',
    workspaceId: 'ws_1',
    projectId: 'p1',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf_basic',
    workflowVersion: 1,
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: 'user_kiro',
    collaboratorIds: ['user_anselma'],
    fields: { title: claim('GST return for August') },
    transitions: [],
    ...overrides,
  };
}

/**
 * 11.7 (support). Every axis the LANDED `FilterSpec` declares is evaluated —
 * an axis this predicate ignored would widen a filtered view back to
 * unfiltered and be indistinguishable, on screen, from a filter that matched
 * everything.
 */
describe('11.7 matchesFilter honours every axis the landed FilterSpec declares', () => {
  it('an empty spec matches everything', () => {
    expect(matchesFilter(ticket(), {})).toBe(true);
  });

  it('assignee — and unassigned work never matches an assignee filter', () => {
    expect(matchesFilter(ticket(), { assigneeIds: ['user_kiro'] })).toBe(true);
    expect(matchesFilter(ticket(), { assigneeIds: ['user_anselma'] })).toBe(false);
    expect(matchesFilter(ticket({ assigneeId: null }), { assigneeIds: ['user_kiro'] })).toBe(false);
  });

  it('collaborator — any named collaborator on the ticket is enough', () => {
    expect(matchesFilter(ticket(), { collaboratorIds: ['user_anselma'] })).toBe(true);
    expect(matchesFilter(ticket(), { collaboratorIds: ['user_ghost'] })).toBe(false);
  });

  it('type, state and state category', () => {
    expect(matchesFilter(ticket(), { typeIds: ['task'] })).toBe(true);
    expect(matchesFilter(ticket(), { typeIds: ['epic'] })).toBe(false);
    expect(matchesFilter(ticket(), { stateIds: ['doing'] })).toBe(true);
    expect(matchesFilter(ticket(), { stateIds: ['done'] })).toBe(false);
    expect(matchesFilter(ticket(), { stateCategories: ['active'] })).toBe(true);
    expect(matchesFilter(ticket(), { stateCategories: ['terminal'] })).toBe(false);
  });

  it('project', () => {
    expect(matchesFilter(ticket(), { projectIds: ['p1'] })).toBe(true);
    expect(matchesFilter(ticket(), { projectIds: ['p2'] })).toBe(false);
  });

  it('text matches the TITLE, case-insensitively — the documented narrowing', () => {
    expect(matchesFilter(ticket(), { text: 'gst' })).toBe(true);
    expect(matchesFilter(ticket(), { text: '  GST  ' })).toBe(true);
    expect(matchesFilter(ticket(), { text: 'inspection' })).toBe(false);
    expect(matchesFilter(ticket(), { text: '   ' })).toBe(true); // a blank term filters nothing
  });

  /**
   * Server parity, cited: `apps/server/src/read/compile-filter.ts` compares
   * `(t.fields -> 'dueDate' -> 'value' ->> 'date') <= before` / `>= after` —
   * inclusive, and NULL (no claimed due date) matches neither.
   */
  it('due bounds are inclusive at both ends, and undated work matches neither', () => {
    const dated = ticket({ fields: { title: claim('t'), dueDate: claim({ date: '2026-08-20' }) } });
    expect(matchesFilter(dated, { dueBefore: '2026-08-20' })).toBe(true);
    expect(matchesFilter(dated, { dueBefore: '2026-08-19' })).toBe(false);
    expect(matchesFilter(dated, { dueAfter: '2026-08-20' })).toBe(true);
    expect(matchesFilter(dated, { dueAfter: '2026-08-21' })).toBe(false);
    expect(matchesFilter(dated, { dueAfter: '2026-08-01', dueBefore: '2026-08-31' })).toBe(true);
    const undated = ticket();
    expect(matchesFilter(undated, { dueBefore: '2026-12-31' })).toBe(false);
    expect(matchesFilter(undated, { dueAfter: '2000-01-01' })).toBe(false);
  });

  it('field clauses are eq on the claimed value, and every named clause must hold', () => {
    const state = ticket({
      fields: { title: claim('t'), office: claim('BLR'), floor: claim(3), urgent: claim(true) },
    });
    expect(matchesFilter(state, { fields: { office: 'BLR' } })).toBe(true);
    expect(matchesFilter(state, { fields: { office: 'TUR' } })).toBe(false);
    expect(matchesFilter(state, { fields: { office: 'BLR', floor: '3' } })).toBe(true);
    expect(matchesFilter(state, { fields: { office: 'BLR', floor: '4' } })).toBe(false);
    expect(matchesFilter(state, { fields: { urgent: 'true' } })).toBe(true);
    // A field nobody claimed matches nothing — Postgres `->>` yields NULL there.
    expect(matchesFilter(state, { fields: { missing: 'anything' } })).toBe(false);
    // An object-valued claim is not compared: reproducing jsonb's own text
    // form in JS would be a guess, and a guess that matched is worse than one
    // that did not.
    expect(matchesFilter(state, { fields: { title: 't' } })).toBe(true);
    const dayClaim = ticket({ fields: { title: claim('t'), dueDate: claim({ date: '2026-08-20' }) } });
    expect(matchesFilter(dayClaim, { fields: { dueDate: '2026-08-20' } })).toBe(false);
  });

  it('every axis is ANDed — one failing clause fails the whole spec', () => {
    expect(matchesFilter(ticket(), { assigneeIds: ['user_kiro'], typeIds: ['epic'] })).toBe(false);
  });

  it('an empty list on an axis is not a filter — it names nobody, so it excludes nobody', () => {
    expect(matchesFilter(ticket(), { assigneeIds: [], typeIds: [], stateIds: [] })).toBe(true);
  });
});

/**
 * 13.539 — the exclude half (exclude-mode spec §1-2): a ticket matching ANY
 * listed value on an axis is dropped, evaluated after the include half.
 */
describe('13.539 matchesFilter honours the exclude half on every id axis', () => {
  it('an empty exclude object, and empty exclude lists, exclude nothing', () => {
    expect(matchesFilter(ticket(), { exclude: {} })).toBe(true);
    expect(matchesFilter(ticket(), { exclude: { assigneeIds: [], typeIds: [] } })).toBe(true);
  });

  it('assignee — a listed assignee is out; unassigned work is never out', () => {
    expect(matchesFilter(ticket(), { exclude: { assigneeIds: ['user_kiro'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { assigneeIds: ['user_anselma'] } })).toBe(true);
    expect(matchesFilter(ticket({ assigneeId: null }), { exclude: { assigneeIds: ['user_kiro'] } })).toBe(true);
  });

  it('collaborator — ANY listed collaborator on the ticket puts it out', () => {
    expect(matchesFilter(ticket(), { exclude: { collaboratorIds: ['user_anselma'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { collaboratorIds: ['user_ghost'] } })).toBe(true);
  });

  it('type, state, state category and project', () => {
    expect(matchesFilter(ticket(), { exclude: { typeIds: ['task'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { typeIds: ['epic'] } })).toBe(true);
    expect(matchesFilter(ticket(), { exclude: { stateIds: ['doing'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { stateIds: ['done'] } })).toBe(true);
    expect(matchesFilter(ticket(), { exclude: { stateCategories: ['active'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { stateCategories: ['terminal'] } })).toBe(true);
    expect(matchesFilter(ticket(), { exclude: { projectIds: ['p1'] } })).toBe(false);
    expect(matchesFilter(ticket(), { exclude: { projectIds: ['p2'] } })).toBe(true);
  });

  it('include AND exclude on one axis: must match an include and none of the excludes', () => {
    // "Uma, not Raj" — the ticket is Kiro's: included by the first, so kept.
    expect(
      matchesFilter(ticket(), { assigneeIds: ['user_kiro'], exclude: { assigneeIds: ['user_anselma'] } }),
    ).toBe(true);
    // Included AND excluded (the sheet never produces this; the predicate answers anyway): out.
    expect(
      matchesFilter(ticket(), { assigneeIds: ['user_kiro'], exclude: { assigneeIds: ['user_kiro'] } }),
    ).toBe(false);
  });

  it('exclude composes with the other axes — an excluded type is out even when everything else matches', () => {
    expect(
      matchesFilter(ticket(), { assigneeIds: ['user_kiro'], text: 'gst', exclude: { typeIds: ['task'] } }),
    ).toBe(false);
  });
});
