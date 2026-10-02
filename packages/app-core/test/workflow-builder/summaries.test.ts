import { describe, expect, it } from 'vitest';
import { BUILTIN_FIELD_IDS, type TicketTypeDef, type WorkflowDef } from '@gisik-nokma/domain';
import { BUILTIN_FIELD_CHOICES, fieldChoicesFor } from '../../src/workflow-builder/fields.js';
import { summarizeRule, summaryContextFor } from '../../src/workflow-builder/summaries.js';

const def: WorkflowDef = {
  id: '01J9Z0000000000000000000WF',
  version: 1,
  name: 'Fixture',
  initialStateId: 'draft',
  states: [
    { id: 'draft', name: 'Draft', category: 'open' },
    { id: 'submitted', name: 'Submitted', category: 'active' },
    { id: 'approved', name: 'Approved', category: 'terminal' },
  ],
  transitions: [
    { from: 'draft', to: 'submitted', rules: [] },
    { from: 'submitted', to: 'approved', rules: [] },
  ],
};

const ctx = summaryContextFor(def, {
  memberNames: new Map([
    ['01J9ZMEMBER00000000000000A', 'Asha'],
    ['01J9ZMEMBER00000000000000B', 'Bikram'],
  ]),
  fields: [{ id: 'dueDate', name: 'Due date' }],
});

describe('summarizeRule', () => {
  it('restrict-to joins assignee, roles, and named people', () => {
    expect(
      summarizeRule(
        {
          kind: 'restrict-to',
          assignee: true,
          roles: ['admin', 'owner'],
          userIds: ['01J9ZMEMBER00000000000000A', '01J9ZMEMBER00000000000000B'],
        },
        ctx,
      ),
    ).toBe('Only the assignee, or anyone with the role admin or owner, or Asha, Bikram may make this move.');
  });

  it('an empty restrict-to says so honestly', () => {
    expect(summarizeRule({ kind: 'restrict-to' }, ctx)).toBe(
      'Restricted to nobody. Nobody may make this move.',
    );
  });

  it('require-comment and require-evidence are fixed copy', () => {
    expect(summarizeRule({ kind: 'require-comment' }, ctx)).toBe('Must carry a comment explaining it.');
    expect(summarizeRule({ kind: 'require-evidence' }, ctx)).toBe('Must carry an attachment as evidence.');
  });

  it('require-field uses the field display name', () => {
    expect(summarizeRule({ kind: 'require-field', field: 'dueDate' }, ctx)).toBe('Needs "Due date" set first.');
  });

  it('require-different-user names the watched state', () => {
    expect(
      summarizeRule({ kind: 'require-different-user', thanActorOf: { to: 'submitted' } }, ctx),
    ).toBe('Needs a second person: someone other than whoever moved this to "Submitted".');
  });

  it('unknown ids fall back to the raw id rather than crashing', () => {
    expect(summarizeRule({ kind: 'require-field', field: 'ghost' }, ctx)).toBe('Needs "ghost" set first.');
    expect(
      summarizeRule({ kind: 'require-different-user', thanActorOf: { to: 'gone' } }, ctx),
    ).toBe('Needs a second person: someone other than whoever moved this to "gone".');
  });
});

describe('fieldChoicesFor', () => {
  it('starts from the built-ins', () => {
    expect(fieldChoicesFor([])).toEqual(BUILTIN_FIELD_CHOICES.map((choice) => ({ ...choice })));
  });

  /**
   * 3.972 — the picker offers the built-ins a `require-field` rule can GATE ON,
   * and `priority` is deliberately not one of them (spec 2026-09-22).
   *
   * **Asserted as a SET DIFFERENCE against `BUILTIN_FIELD_IDS`, not as a fixed
   * list**, and the difference is the whole case. A hard-coded four would pass
   * for the wrong reason and would say nothing about the relationship; this
   * says the two lists differ by EXACTLY `priority`, so:
   *   - adding a sixth built-in without asking whether it can ever be unset
   *     reddens here, and
   *   - a well-meaning "fix" that puts `priority` into the picker reddens too,
   *     which is the outcome this case exists to force into a conversation.
   *
   * The REASON is in `fields.ts`'s own docblock and is asserted below as far as
   * this file can reach it: `priority` is a built-in that every ticket carries,
   * and a `require-field` rule refuses only on an ABSENT value — so the option
   * could only ever produce a rule that never fires. `evaluateRequireField` is
   * the engine half and is not re-implemented here; what is pinned here is that
   * the picker does not offer it, and the control proves the list is otherwise
   * exactly the built-ins.
   */
  it('3.972 the choices are BUILTIN_FIELD_IDS MINUS priority — and priority IS a built-in', () => {
    const chosen = fieldChoicesFor([]).map((choice) => choice.id);
    // The whole difference, as a set: one id, and it is `priority`.
    expect([...BUILTIN_FIELD_IDS].filter((id) => !chosen.includes(id))).toEqual(['priority']);
    // The negative said positively, so a `BUILTIN_FIELD_IDS` that had ALSO lost
    // `priority` could not satisfy the line above by making both sides empty.
    expect([...BUILTIN_FIELD_IDS]).toContain('priority');
    expect(chosen).not.toContain('priority');
    // Control: the difference is ONE id and not a shrunken list — the picker
    // still carries every other built-in.
    expect(chosen).toEqual(['title', 'description', 'dueDate', 'startDate']);
  });

  it('appends the bound types custom fields, first definition winning duplicates', () => {
    const invoice: TicketTypeDef = {
      id: '01J9ZTYPE000000000000000IN',
      name: 'Invoice',
      icon: 'receipt',
      rank: 3,
      workflowId: '01J9Z0000000000000000000WF',
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    };
    const filing: TicketTypeDef = {
      ...invoice,
      id: '01J9ZTYPE000000000000000FL',
      name: 'Filing',
      fields: [
        { id: 'amount', name: 'Late fee', type: 'number' },
        { id: 'authority', name: 'Authority', type: 'text' },
      ],
    };
    const choices = fieldChoicesFor([invoice, filing]);
    expect(choices.filter((choice) => choice.id === 'amount')).toEqual([
      { id: 'amount', name: 'Invoice amount', source: 'Invoice' },
    ]);
    expect(choices.find((choice) => choice.id === 'authority')).toEqual({
      id: 'authority',
      name: 'Authority',
      source: 'Filing',
    });
  });
});
