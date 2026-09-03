import { describe, expect, it } from 'vitest';
import type { TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
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
      'Restricted to nobody — nobody may make this move.',
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
    ).toBe('Needs a second person — someone other than whoever moved this to "Submitted".');
  });

  it('unknown ids fall back to the raw id rather than crashing', () => {
    expect(summarizeRule({ kind: 'require-field', field: 'ghost' }, ctx)).toBe('Needs "ghost" set first.');
    expect(
      summarizeRule({ kind: 'require-different-user', thanActorOf: { to: 'gone' } }, ctx),
    ).toBe('Needs a second person — someone other than whoever moved this to "gone".');
  });
});

describe('fieldChoicesFor', () => {
  it('starts from the built-ins', () => {
    expect(fieldChoicesFor([])).toEqual(BUILTIN_FIELD_CHOICES.map((choice) => ({ ...choice })));
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
