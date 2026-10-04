import { describe, expect, it } from 'vitest';
import { domainRegistry, TICKET_LINK_KINDS } from '@gisik-nokma/domain';
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

describe('29.126 redactedPayload keeps a leads_to label', () => {
  it('29.126 a withheld leads_to keeps its label on both arms; control: no label, no key; 29.127 every kind is handled', () => {
    const HIDDEN = "a ticket you can't see";
    expect(redactedPayload('ticket.link_added', 'e1', { kind: 'leads_to', targetId: null, label: 'Yes' })).toEqual({ kind: 'leads_to', target: HIDDEN, label: 'Yes' });
    // A withheld draft-side entry (its source hidden) keeps the label too.
    expect(redactedPayload('ticket.link_added', 'e1', { kind: 'leads_to', targetId: null, from: null, label: 'Yes' })).toEqual({ kind: 'leads_to', from: HIDDEN, label: 'Yes' });
    // control: the spread is conditional, so a label-free link has no `label` key at all (`toEqual` ignores an undefined member)
    expect('label' in redactedPayload('ticket.link_added', 'e1', { kind: 'blocks', targetId: null })).toBe(false);
    expect('label' in redactedPayload('ticket.link_added', 'e1', { kind: 'blocks', targetId: null, from: null })).toBe(false);
    // a visible leads_to is served whole
    const T = '01J9GTKB000000000000000000';
    expect(redactedPayload('ticket.link_added', 'e1', { kind: 'leads_to', targetId: T, label: 'Yes' })).toEqual({ kind: 'leads_to', targetId: T, label: 'Yes' });
    for (const kind of TICKET_LINK_KINDS) {
      expect(redactedPayload('ticket.link_added', 'e1', { kind, targetId: null })).toEqual({ kind, target: HIDDEN });
    }
  });
});

describe('29.137 redactedPayload and ticket.decided', () => {
  it('29.137 keeps the outcome and from, phrases only a withheld closeStarted id; control: no closeStarted, untouched', () => {
    const T = '01J9GTKB000000000000000000';
    expect(redactedPayload('ticket.decided', 'e1', { outcome: 'Yes', from: 'No', closeStarted: [null, T] })).toEqual({
      outcome: 'Yes',
      from: 'No',
      closeStarted: ["a ticket you can't see", T],
    });
    expect(redactedPayload('ticket.decided', 'e1', { outcome: null })).toEqual({ outcome: null });
    expect(redactedPayload('ticket.decided', 'e1', { outcome: 'Yes', closeStarted: [T] })).toEqual({ outcome: 'Yes', closeStarted: [T] });
  });
});
