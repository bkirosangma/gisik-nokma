import { describe, expect, it } from 'vitest';
import { newUlid, type EventEnvelope, type FieldClaim, type TicketState } from '@gisik-nokma/domain';
import {
  evaluateTransitionRules,
  type EngineContext,
  type TransitionRuleInput,
} from '@gisik-nokma/rule-engine';
import { fieldAlreadyClaimed } from '../../src/views/field-claims.js';
import { WF_ERRAND } from '../helpers/seed.js';

/**
 * 13.489 pins `fieldAlreadyClaimed` against the REAL rule engine (Ruling 26)
 * — not a self-comparison. `evaluateTransitionRules` is the same exported
 * dispatcher the server calls (`packages/rule-engine/src/rules/index.ts`),
 * run here through a minimal stub `EngineContext` `evaluateRequireField`
 * never touches (it reads only `input.ticket.fields`). Authority for the
 * expected shape of each case: `packages/rule-engine/test/engine.test.ts`,
 * describe "require-field and require-evidence refuse a blank value, not
 * only an absent one", case "refuses require-field when the field is set to
 * a whitespace-only string" — and the general `isSet` expression
 * `evaluateRequireField` computes, which this predicate mirrors.
 *
 * Each case states its own expectation independently (`expectSet`), then
 * checks BOTH the client predicate and the real engine against it — not
 * only against each other — so a bug shared by both implementations still
 * shows up as a wrong `expectSet` comparison rather than a silent match.
 */
function stubContext(): EngineContext {
  const notUsed = (name: string) => () => {
    throw new Error(`evaluateRequireField reads only ticket.fields; ${name} must not be called`);
  };
  return {
    getEntityState: notUsed('getEntityState'),
    getChildrenStates: notUsed('getChildrenStates'),
    getWorkflowDef: notUsed('getWorkflowDef'),
    getTicketTypeDef: notUsed('getTicketTypeDef'),
  } as unknown as EngineContext;
}

function inputWithField(fields: Record<string, FieldClaim>): TransitionRuleInput {
  const env: EventEnvelope = {
    id: newUlid(),
    workspaceId: 'ws_1',
    entity: { kind: 'ticket', id: 't1' },
    type: 'ticket.transitioned',
    version: 1,
    payload: { to: 'doing' },
    actorId: 'user_kiro',
    origin: 'server',
    clientTime: '2026-08-18T08:05:00.000Z',
    serverTime: '2026-08-18T08:05:01.000Z',
    seq: 1,
  };
  const ticket: TicketState = {
    kind: 'ticket',
    id: 't1',
    workspaceId: 'ws_1',
    projectId: 'prj_1',
    typeId: 'task',
    parentId: null,
    workflowId: WF_ERRAND.id,
    workflowVersion: WF_ERRAND.version,
    stateId: 'todo',
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields,
    transitions: [],
  };
  return {
    env,
    ctx: stubContext(),
    ticket,
    def: WF_ERRAND,
    toState: WF_ERRAND.states[1]!, // 'doing'; evaluateRequireField never reads it
    fromStateId: 'todo',
    payload: { to: 'doing' },
  };
}

function claim(value: unknown): FieldClaim {
  return { value, actorId: 'user_kiro', clientTime: '2026-08-18T08:05:00.000Z', serverTime: '2026-08-18T08:05:01.000Z' };
}

describe('13.489 fieldAlreadyClaimed agrees with the REAL rule engine (Ruling 26)', () => {
  const cases: Array<{ name: string; fields: Record<string, FieldClaim>; expectSet: boolean }> = [
    { name: 'no claim at all', fields: {}, expectSet: false },
    { name: 'value: null', fields: { dueDate: claim(null) }, expectSet: false },
    { name: "value: '' (empty string)", fields: { dueDate: claim('') }, expectSet: false },
    { name: "value: '   ' (whitespace-only)", fields: { dueDate: claim('   ') }, expectSet: false },
    { name: "value: '\\t\\n ' (mixed whitespace)", fields: { dueDate: claim('\t\n ') }, expectSet: false },
    { name: "value: '2026-08-30' (a real string)", fields: { dueDate: claim('2026-08-30') }, expectSet: true },
    { name: 'value: 0 (falsy but not a blank string)', fields: { dueDate: claim(0) }, expectSet: true },
    { name: 'value: false (falsy but not a blank string)', fields: { dueDate: claim(false) }, expectSet: true },
    { name: 'value: {} (a real object)', fields: { dueDate: claim({ date: '2026-08-30' }) }, expectSet: true },
  ];

  it.each(cases)('$name: predicate and engine both agree it is $expectSet', async ({ fields, expectSet }) => {
    expect(fieldAlreadyClaimed(fields, 'dueDate')).toBe(expectSet);

    const verdict = await evaluateTransitionRules(
      [{ kind: 'require-field', field: 'dueDate' }],
      inputWithField(fields),
    );
    expect(!verdict.refused).toBe(expectSet);
  });
});
