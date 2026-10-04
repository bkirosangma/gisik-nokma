import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http-client.js';
import { envelopeFor, resultError, submitBatch, submitBatchByIndex, submitOne, type EventResult } from '../src/tools/submit.js';
import { recordingSession } from './fixtures/recording-session.js';

const OK: EventResult = { status: 'committed', eventId: 'e1', seq: 1, serverTime: '2026-10-03T00:00:00.000Z' };
const REFUSED: EventResult = { status: 'refused', eventId: 'e2', rule: 'close-requires-terminal', reason: 'A ticket can only be closed from a terminal state; "Open" is not one.' };
const UNKNOWN = 'what happened is unknown';
const three = (s: ReturnType<typeof recordingSession>['session']) =>
  ['A', 'B', 'C'].map((id) => envelopeFor(s, 'W', { kind: 'ticket', id }, 'ticket.closed', {}));

describe('submitBatchByIndex', () => {
  it('14.602 returns every outcome index-aligned without throwing on a refusal; throws only on a short, long, holed or missing answer; submitBatch still throws on the same input', async () => {
    const partial = recordingSession({ events: () => ({ results: [OK, REFUSED, { ...OK, eventId: 'e3', seq: 3 }] }) });
    const results = await submitBatchByIndex(partial.session, three(partial.session), UNKNOWN);
    expect(results.map((r) => r.status)).toEqual(['committed', 'refused', 'committed']);
    expect(results[1]).toEqual(REFUSED);
    // CONTROL, same `it`: the old reader is unchanged, and spells the refusal with its index.
    await expect(submitBatch(partial.session, three(partial.session))).rejects.toThrow(`event 1 refused by close-requires-terminal: ${REFUSED.reason}`);
    // `invalid` is an outcome too.
    const invalid = recordingSession({ events: () => ({ results: [{ status: 'invalid', eventId: null, code: 'malformed', message: 'x' }, OK, OK] }) });
    expect((await submitBatchByIndex(invalid.session, three(invalid.session), UNKNOWN))[0]).toMatchObject({ status: 'invalid', code: 'malformed' });

    for (const [label, answer] of [
      ['a short answer', { results: [OK, OK] }],
      // A LONG answer is as untrustworthy as a short one (kills `!==` stepped to `<`).
      ['a long answer', { results: [OK, OK, OK, OK] }],
      ['a holed answer', { results: [OK, null, OK] }],
      // `undefined` is not an object either (kills dropping `typeof value === 'object'`: `undefined.status` would throw a TypeError, not the sentence).
      ['an undefined element', { results: [OK, undefined, OK] }],
      ['an element with no status', { results: [OK, {}, OK] }],
      ['no results at all', {}],
      ['a null body', null],
    ] as const) {
      const s = recordingSession({ events: () => answer });
      await expect(submitBatchByIndex(s.session, three(s.session), UNKNOWN), label).rejects.toThrow(UNKNOWN);
    }
    // A rejected call is the same: nothing is claimed, and the cause rides along in brackets.
    const down = recordingSession({ events: () => { throw new HttpError(500, { error: 'boom' }); } });
    await expect(submitBatchByIndex(down.session, three(down.session), UNKNOWN)).rejects.toThrow(`${UNKNOWN} (gisik-nokma answered 500)`);
    // CONTROL: a complete answer resolves.
    const whole = recordingSession();
    expect(await submitBatchByIndex(whole.session, three(whole.session), UNKNOWN)).toHaveLength(3);
  });

  it('14.602 resultError spells a refusal and an invalid result exactly as submitOne does', async () => {
    const refused = recordingSession({ events: () => ({ results: [REFUSED] }) });
    const event = envelopeFor(refused.session, 'W', { kind: 'ticket', id: 'A' }, 'ticket.closed', {});
    // LITERALS, not `resultError(REFUSED).message`: after the refactor `submitOne` calls `resultError`, so comparing the two
    // with each other passes whatever the template says.
    const SPELLED = `refused by close-requires-terminal: ${REFUSED.reason}`;
    expect(resultError(REFUSED)!.message).toBe(SPELLED);
    await expect(submitOne(refused.session, event)).rejects.toThrow(SPELLED);
    expect(resultError({ status: 'invalid', eventId: null, code: 'malformed', message: 'bad payload' })!.message).toBe('malformed: bad payload');
    expect(resultError(OK)).toBeNull(); // CONTROL
  });
});
