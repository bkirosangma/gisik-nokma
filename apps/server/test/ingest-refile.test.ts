import { describe, expect, it } from 'vitest';
import { payloadIds } from '../src/purge/check-purged.js';

const D = '01J9GMKD000000000000000000';
const S = '01J9GMKS000000000000000000';

describe('28.116 payloadIds names the source of a from-form link', () => {
  it('names target and from for both types; a plain link names the target alone', () => {
    for (const type of ['ticket.link_added', 'ticket.link_removed']) {
      expect(payloadIds(type, { kind: 'blocks', targetId: D, from: S }), type).toEqual([['ticket', D], ['ticket', S]]);
      expect(payloadIds(type, { kind: 'blocks', targetId: D }), type).toEqual([['ticket', D]]); // CONTROL
    }
  });
});
