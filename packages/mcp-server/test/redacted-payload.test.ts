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

describe("29.126 redactedPayload keeps a leads_to label on 'out' and drops it on 'in'", () => {
  it("29.126 a withheld leads_to keeps its label when the target is hidden and drops it when the source is (planner ruling 2026-10-05 00:13); control: no label, no key; 29.127 every kind is handled", () => {
    const HIDDEN = "a ticket you can't see";
    // the LK-6 control: a hidden TARGET keeps the visible source's branch label
    expect(JSON.stringify(redactedPayload('ticket.link_added', 'e1', { kind: 'leads_to', targetId: null, label: 'Yes' }))).toBe(
      JSON.stringify({ kind: 'leads_to', target: HIDDEN, label: 'Yes' }),
    );
    // A withheld draft-side entry hides its SOURCE, whose branch the label names: no label key, even when a payload carries
    // one (fail closed; the domain helper decides, so this line and the server's doors cannot disagree).
    expect(JSON.stringify(redactedPayload('ticket.link_added', 'e1', { kind: 'leads_to', targetId: null, from: null, label: 'Yes' }))).toBe(
      JSON.stringify({ kind: 'leads_to', from: HIDDEN }),
    );
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
