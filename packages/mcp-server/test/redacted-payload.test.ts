import { describe, expect, it } from 'vitest';
import { domainRegistry, TICKET_LINK_KINDS, withholdCauseTicket } from '@gisik-nokma/domain';
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

describe('29.208 redactedPayload phrases a flow cause the server withheld', () => {
  it("29.208 a nulled cause ticket reads \"a ticket you can't see\" and a nulled actor \"someone you can't see\", on all three types; control: a visible cause is untouched", () => {
    const [D, S, U, E] = ['01J9GDEC000000000000000000', '01J9GSRC000000000000000000', '01J9GACT000000000000000001', '01J9GEVT000000000000000001'];
    const notTaken = { kind: 'branch-not-taken', decisionTicketId: D, outcome: 'No', pass: 1, decidedBy: U, decisionEventId: E };
    // Both withheld on a close: each id is phrased by its own kind, every other member kept.
    expect(redactedPayload('ticket.closed', 'e1', { cause: { ...notTaken, decisionTicketId: null, decidedBy: null } })).toEqual({
      cause: { ...notTaken, decisionTicketId: "a ticket you can't see", decidedBy: "someone you can't see" },
    });
    // Control: the same close with both ids present is untouched (neither phrase).
    expect(redactedPayload('ticket.closed', 'e1', { cause: notTaken })).toEqual({ cause: notTaken });
    // One at a time, on a reopen: only the nulled member is phrased.
    const reopened = { ...notTaken, kind: 'reopened-by-flow' };
    expect(redactedPayload('ticket.reopened', 'e1', { cause: { ...reopened, decisionTicketId: null } })).toEqual({ cause: { ...reopened, decisionTicketId: "a ticket you can't see" } });
    expect(redactedPayload('ticket.reopened', 'e1', { cause: { ...reopened, decidedBy: null } })).toEqual({ cause: { ...reopened, decidedBy: "someone you can't see" } });
    // A led-to on a transition: its source and trigger, and the transition's comment is still stripped.
    const ledTo = { kind: 'led-to', sourceTicketId: S, label: 'Yes', triggeredBy: U };
    expect(redactedPayload('ticket.transitioned', 'e1', { to: 'todo', comment: { text: 'x' }, cause: { ...ledTo, sourceTicketId: null } })).toEqual({
      to: 'todo', cause: { ...ledTo, sourceTicketId: "a ticket you can't see" },
    });
    expect(redactedPayload('ticket.transitioned', 'e1', { to: 'todo', cause: { ...ledTo, triggeredBy: null } })).toEqual({ to: 'todo', cause: { ...ledTo, triggeredBy: "someone you can't see" } });
    // Controls: an uncaused event gains no cause key; a null cause stays null; a type that carries no flow cause is untouched.
    expect(redactedPayload('ticket.closed', 'e1', {})).toStrictEqual({});
    expect(redactedPayload('ticket.transitioned', 'e1', { to: 'done', cause: null })).toStrictEqual({ to: 'done', cause: null });
    expect(redactedPayload('ticket.assigned', 'e1', { assigneeId: U, cause: { decisionTicketId: null } })).toStrictEqual({ assigneeId: U, cause: { decisionTicketId: null } });
    expect(redactedPayload('ticket.transitioned', 'e1', { to: 'doing', cause: { kind: 'reopened-for-child', childTicketId: S } })).toEqual({ to: 'doing', cause: { kind: 'reopened-for-child', childTicketId: S } });
  });
});

describe('29.373 the seam: a cause the History route withheld is what MCP phrases (AMEND 2)', () => {
  it("29.373 withholdCauseTicket nulls the ids and people, and redactedPayload reads them \"a ticket you can't see\" / \"someone you can't see\", for each kind", () => {
    const T = '01J9GTKB000000000000000000';
    const U = '01J9GUSA000000000000000000';
    const E = '01J9GEVT000000000000000001';
    const [END, ACTOR] = ["a ticket you can't see", "someone you can't see"];
    const led = withholdCauseTicket({ kind: 'led-to', sourceTicketId: T, label: 'Yes', triggeredBy: U });
    expect(redactedPayload('ticket.transitioned', 'e1', { to: 'todo', cause: led })).toEqual({
      to: 'todo', cause: { kind: 'led-to', sourceTicketId: END, label: 'Yes', triggeredBy: ACTOR },
    });
    const decided = { decisionTicketId: T, outcome: 'No', pass: 2, decidedBy: U, decisionEventId: E };
    expect(redactedPayload('ticket.reopened', 'e1', { cause: withholdCauseTicket({ kind: 'reopened-by-flow', ...decided }) })).toEqual({
      cause: { kind: 'reopened-by-flow', decisionTicketId: END, outcome: 'No', pass: 2, decidedBy: ACTOR, decisionEventId: E },
    });
    expect(redactedPayload('ticket.closed', 'e1', { cause: withholdCauseTicket({ kind: 'branch-not-taken', ...decided }) })).toEqual({
      cause: { kind: 'branch-not-taken', decisionTicketId: END, outcome: 'No', pass: 2, decidedBy: ACTOR, decisionEventId: E },
    });
  });
});
