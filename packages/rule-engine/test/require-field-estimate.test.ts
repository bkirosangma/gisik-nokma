import { describe, expect, it } from 'vitest';
import { evaluateRequireField } from '../src/rules/require-field.js';
import type { TransitionRuleInput } from '../src/rules/types.js';

/**
 * 29.162 (wtg2 T4), the engine half: `estimate` is a require-field candidate like any other field
 * the picker offers. The rule reads only `input.ticket.fields`, so the input carries only that.
 */
const inputWith = (fields: Record<string, unknown>): TransitionRuleInput =>
  ({ ticket: { fields } }) as unknown as TransitionRuleInput;
const claim = (value: unknown) => ({ value, actorId: 'user_a', clientTime: '2026-08-20T09:00:00.000Z', serverTime: '2026-08-20T09:00:01.000Z' });

describe('29.162 a require-field rule on estimate', () => {
  it('29.162 refuses an unset or cleared estimate and passes a set one', async () => {
    const rule = { kind: 'require-field', field: 'estimate' } as const;
    const refusal = { refused: true, rule: 'require-field', reason: 'This move needs the field "estimate" to be set first, and it is not.' };
    expect(await evaluateRequireField(rule, inputWith({}))).toEqual(refusal);
    expect(await evaluateRequireField(rule, inputWith({ estimate: claim(null) }))).toEqual(refusal);
    expect(await evaluateRequireField(rule, inputWith({ estimate: claim(3) }))).toEqual({ refused: false }); // control
  });
});
