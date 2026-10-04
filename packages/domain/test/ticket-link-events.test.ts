import { describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  domainRegistry,
  foldTicketEvent,
  isTicketLinkEvent,
  isWithheldLinkEvent,
  linkReading,
  makeEnvelope,
  newUlid,
  parseEvent,
  TICKET_EVENT_TYPES,
  TICKET_LINK_KINDS,
  ticketLinkAddedPayload,
  ticketLinkRemovedPayload,
  type TicketState,
  type TicketStateDeps,
  withheldLinkPayload,
} from '../src/index.js';

const SOURCE = newUlid();
const TARGET = newUlid();
const PROJECT = '01J9GPRJ000000000000000000';

// The same one-workflow world `ticket-state.test.ts` folds in; a link never reads it, `ticket.created` does.
const deps: TicketStateDeps = {
  getTicketType: (id) =>
    id === 'task' ? { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] } : undefined,
  getWorkflow: (id) =>
    id === 'wf-basic'
      ? {
          id: 'wf-basic',
          version: 1,
          name: 'Basic',
          initialStateId: 'todo',
          states: [{ id: 'todo', name: 'To do', category: 'open' }],
          transitions: [{ from: '*', to: 'todo', rules: [] }],
        }
      : undefined,
};

function bornState(): TicketState {
  return applyTicketEvent(
    undefined,
    makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: SOURCE },
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'File the GST return' },
    }),
    deps,
  );
}

const link = (type: 'ticket.link_added' | 'ticket.link_removed', kind: string, targetId: string) =>
  makeEnvelope({ type, entity: { kind: 'ticket', id: SOURCE }, payload: { kind, targetId } });

describe('27.001 link payloads', () => {
  it('27.001 accepts each kind; refuses an unknown kind, an extra member, a non-ULID target', () => {
    for (const schema of [ticketLinkAddedPayload, ticketLinkRemovedPayload]) {
      for (const kind of TICKET_LINK_KINDS) expect(schema.safeParse({ kind, targetId: TARGET }).success).toBe(true);
      expect(schema.safeParse({ kind: 'parent', targetId: TARGET }).success).toBe(false);
      expect(schema.safeParse({ kind: 'blocks', targetId: TARGET, note: 'x' }).success).toBe(false);
      expect(schema.safeParse({ kind: 'blocks', targetId: 'GN-142' }).success).toBe(false);
    }
    // control: the whole event parses on a ticket
    const { serverTime: _s, seq: _q, ...submitted } = makeEnvelope({
      type: 'ticket.link_added',
      entity: { kind: 'ticket', id: SOURCE },
      payload: { kind: 'blocks', targetId: TARGET },
    });
    expect(parseEvent(submitted).ok).toBe(true);
    // and through the door, the strict schema still refuses an extra member
    expect(parseEvent({ ...submitted, payload: { kind: 'blocks', targetId: TARGET, note: 'x' } }).ok).toBe(false);
  });
});

describe('27.002 registration', () => {
  it('27.002 both types at v1 against ticket only; registrations() lists each once', () => {
    for (const type of ['ticket.link_added', 'ticket.link_removed']) {
      expect(domainRegistry.get(type, 1)?.entityKind).toBe('ticket');
      expect((TICKET_EVENT_TYPES as readonly string[]).includes(type)).toBe(true);
    }
    const keys = domainRegistry.registrations().map((r) => `${r.type}@${r.version}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('ticket.link_added@1');
    expect(keys).toContain('ticket.link_removed@1');
    // control: a note is refused at the door
    const { serverTime: _s, seq: _q, ...onNote } = makeEnvelope({
      type: 'ticket.link_added',
      entity: { kind: 'note', id: SOURCE },
      payload: { kind: 'blocks', targetId: TARGET },
    });
    const refused = parseEvent(onNote);
    expect(refused.ok).toBe(false);
    expect(refused.ok ? null : refused.code).toBe('entity-kind-mismatch');
  });
});

describe('27.003 the reducer folds links', () => {
  it('27.003 add appends (idempotent), remove drops the pair, the last removal leaves no key', () => {
    const born = bornState();
    expect('links' in born).toBe(false); // control
    const a = applyTicketEvent(born, link('ticket.link_added', 'blocks', TARGET), deps);
    expect(a.links).toEqual([{ kind: 'blocks', targetId: TARGET }]);
    expect(applyTicketEvent(a, link('ticket.link_added', 'blocks', TARGET), deps)).toBe(a); // idempotent
    const b = applyTicketEvent(a, link('ticket.link_added', 'relates', TARGET), deps);
    expect(b.links).toHaveLength(2); // control: another kind is another link
    const c = applyTicketEvent(b, link('ticket.link_removed', 'blocks', TARGET), deps);
    expect(c.links).toEqual([{ kind: 'relates', targetId: TARGET }]);
    const d = applyTicketEvent(c, link('ticket.link_removed', 'relates', TARGET), deps);
    expect('links' in d).toBe(false);
  });
});

describe('27.008 how a link reads, and the link-event predicate', () => {
  it('27.008 all six readings, as linkReading(kind, direction) states them, and the predicate names exactly the two link events', () => {
    // The wire names are not the readings: `blocks.in` is "is blocked by", and a mutation that returns the kind itself must fail here.
    const readings = TICKET_LINK_KINDS.map((kind) => [kind, linkReading(kind, 'out'), linkReading(kind, 'in')]);
    expect(readings).toEqual([
      ['blocks', 'blocks', 'is blocked by'],
      ['relates', 'relates to', 'relates to'],
      ['duplicates', 'duplicates', 'is duplicated by'],
    ]);
    expect(isTicketLinkEvent('ticket.link_added')).toBe(true);
    expect(isTicketLinkEvent('ticket.link_removed')).toBe(true);
    expect(isTicketLinkEvent('ticket.assigned')).toBe(false); // control: a ticket event that is not a link
  });
});

describe('27.080 a link event served with its target withheld', () => {
  it('27.080 a withheld link folds to nothing, applyTicketEvent names it; control: a real target folds', () => {
    const born = bornState();
    const add = (targetId: string | null, type: 'ticket.link_added' | 'ticket.link_removed' = 'ticket.link_added') =>
      makeEnvelope({
        type,
        entity: { kind: 'ticket', id: SOURCE },
        payload: targetId === null ? withheldLinkPayload('blocks') : { kind: 'blocks', targetId },
      });
    const thrown = (fn: () => unknown): string => {
      try {
        fn();
      } catch (err) {
        return (err as Error).message;
      }
      return 'no throw';
    };
    expect(withheldLinkPayload('blocks')).toEqual({ kind: 'blocks', targetId: null });
    expect(JSON.stringify(withheldLinkPayload('blocks'))).toBe('{"kind":"blocks","targetId":null}');
    expect(foldTicketEvent(born, add(null), deps)).toBe(born);
    expect(foldTicketEvent(born, add(null, 'ticket.link_removed'), deps)).toBe(born);
    expect(() => applyTicketEvent(born, add(null), deps)).toThrow(/withheld/);
    // P20 2d: the refusal sentence, exactly, from each arm.
    expect(thrown(() => applyTicketEvent(born, add(null), deps))).toBe(
      `applyTicketEvent: ticket.link_added on ticket ${SOURCE} carries a withheld target (a served copy, never a ledger row); fold it with foldTicketEvent`,
    );
    const linked = foldTicketEvent(born, add(TARGET), deps)!;
    expect(linked.links).toEqual([{ kind: 'blocks', targetId: TARGET }]);
    expect(foldTicketEvent(linked, add(null), deps)).toBe(linked); // a withheld one leaves a held link alone
    expect(foldTicketEvent(linked, add(null, 'ticket.link_removed'), deps)).toBe(linked); // a withheld removal too
    expect(isWithheldLinkEvent({ type: 'ticket.field_set', payload: { fieldId: 'x', targetId: null } })).toBe(false);
    expect(isWithheldLinkEvent({ type: 'ticket.link_added', payload: { kind: 'blocks', targetId: TARGET } })).toBe(false);
    // T1 (AMEND p11): a link event whose payload is null is not "withheld".
    expect(isWithheldLinkEvent({ type: 'ticket.link_added', payload: null })).toBe(false);
    // T2 (AMEND p11): an ABSENT targetId is not a withheld one. The control is the same event with targetId present-and-null.
    expect(isWithheldLinkEvent({ type: 'ticket.link_added', payload: { kind: 'blocks' } })).toBe(false);
    expect(isWithheldLinkEvent({ type: 'ticket.link_added', payload: withheldLinkPayload('blocks') })).toBe(true);
    // T3 (AMEND p11): the REMOVE arm names it too, exactly. The control is a real removal of the one held link, which leaves no key.
    expect(() => applyTicketEvent(linked, add(null, 'ticket.link_removed'), deps)).toThrow(/withheld/);
    expect(thrown(() => applyTicketEvent(linked, add(null, 'ticket.link_removed'), deps))).toBe(
      `applyTicketEvent: ticket.link_removed on ticket ${SOURCE} carries a withheld target (a served copy, never a ledger row); fold it with foldTicketEvent`,
    );
    expect('links' in applyTicketEvent(linked, add(TARGET, 'ticket.link_removed'), deps)).toBe(false);
  });
});
