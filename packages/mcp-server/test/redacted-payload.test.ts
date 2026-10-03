import { describe, expect, it } from 'vitest';
import { domainRegistry } from '@gisik-nokma/domain';
import { redactedPayload } from '../src/tools/ticket-tools.js';

describe('27.006 redactedPayload and links', () => {
  it('27.006 keeps a visible link, phrases a withheld one; control strips a transition comment; census never throws', () => {
    const T = '01J9GTKB000000000000000000';
    expect(redactedPayload('ticket.link_added', 'e1', { kind: 'blocks', targetId: T })).toEqual({ kind: 'blocks', targetId: T });
    expect(redactedPayload('ticket.link_removed', 'e1', { kind: 'relates', targetId: null })).toEqual({ kind: 'relates', target: "a ticket you can't see" });
    expect(redactedPayload('ticket.transitioned', 'e1', { to: 'done', comment: { text: 'x' } })).toEqual({ to: 'done' });
    for (const r of domainRegistry.registrations()) expect(() => redactedPayload(r.type, 'e1', {})).not.toThrow();
  });
});
