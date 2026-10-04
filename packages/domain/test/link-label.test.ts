import { describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  linkLabelSchema,
  linkReading,
  makeEnvelope,
  newUlid,
  normaliseLinkLabel,
  parseEvent,
  TICKET_LINK_KINDS,
  ticketLinkAddedPayload,
  ticketLinkRemovedPayload,
  type TicketState,
  withheldLinkPayload,
  type TicketStateDeps,
} from '../src/index.js';

const SOURCE = newUlid();
const TARGET = newUlid();
const DRAFT = newUlid();
const PROJECT = '01J9GPRJ000000000000000000';

// The world of `ticket-link-events.test.ts`: a link never reads it, `ticket.created` does.
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

const link = (type: 'ticket.link_added' | 'ticket.link_removed', kind: string, targetId: string, label?: string) =>
  makeEnvelope({ type, entity: { kind: 'ticket', id: SOURCE }, payload: { kind, targetId, ...(label === undefined ? {} : { label }) } });

describe('29.120 leads_to and its label', () => {
  it('29.120 label only on leads_to, 1..60 non-blank, never on link_removed; readings; normalisation', () => {
    expect(TICKET_LINK_KINDS).toEqual(['blocks', 'relates', 'duplicates', 'leads_to']);
    const ok = (p: object) => ticketLinkAddedPayload.safeParse(p).success;
    expect(ok({ kind: 'leads_to', targetId: TARGET, label: 'Yes' })).toBe(true);
    expect(ok({ kind: 'leads_to', targetId: TARGET, label: 'y'.repeat(60) })).toBe(true);
    expect(ok({ kind: 'leads_to', targetId: TARGET, label: 'y'.repeat(61) })).toBe(false);
    expect(ok({ kind: 'leads_to', targetId: TARGET, label: 'Y' })).toBe(true); // just inside .min(1); '' (below) is just outside
    expect(ok({ kind: 'leads_to', targetId: TARGET, label: '   ' })).toBe(false);
    expect(ok({ kind: 'leads_to', targetId: TARGET, label: '' })).toBe(false);
    for (const kind of ['blocks', 'relates', 'duplicates']) {
      expect(ok({ kind, targetId: TARGET, label: 'Yes' })).toBe(false);
      expect(ok({ kind, targetId: TARGET })).toBe(true); // control
    }
    expect(ok({ kind: 'leads_to', targetId: TARGET })).toBe(true);
    expect(ticketLinkRemovedPayload.safeParse({ kind: 'leads_to', targetId: TARGET }).success).toBe(true);
    expect(ticketLinkRemovedPayload.safeParse({ kind: 'leads_to', targetId: TARGET, label: 'Yes' }).success).toBe(false);
    expect(normaliseLinkLabel(' Yes ')).toBe(normaliseLinkLabel('yes'));
    expect(normaliseLinkLabel('Yes')).not.toBe(normaliseLinkLabel('No'));
    expect([linkReading('leads_to', 'out'), linkReading('leads_to', 'in')]).toEqual(['leads to', 'comes after']);
    // through the door
    const { serverTime: _s, seq: _q, ...sub } = makeEnvelope({ type: 'ticket.link_added', entity: { kind: 'ticket', id: newUlid() }, payload: { kind: 'blocks', targetId: TARGET, label: 'Yes' } });
    expect(parseEvent({ ...sub, payload: { kind: 'leads_to', targetId: TARGET, label: 'Yes' } }).ok).toBe(true); // control: the door is not refusing the envelope itself
    expect(parseEvent(sub).ok).toBe(false);
  });

  it('29.120 the refusals say what is wrong, once: the kind refine names the label, the blank refine its own sentence', () => {
    // ONE issue per failure (display-name.ts:36-37): the `value.length === 0 ||` guard stops the blank refine re-reporting ''.
    expect(linkLabelSchema.safeParse('').error?.issues).toHaveLength(1);
    expect(linkLabelSchema.safeParse('   ').error?.issues).toHaveLength(1); // control: blank, non-empty, one issue
    expect(linkLabelSchema.safeParse('   ').error?.issues[0]?.message).toBe('must not be blank: a label of only spaces names nothing');
    expect(linkLabelSchema.safeParse('Yes').success).toBe(true); // control
    const onBlocks = ticketLinkAddedPayload.safeParse({ kind: 'blocks', targetId: TARGET, label: 'Yes' });
    expect(onBlocks.error?.issues.map((i) => [i.path, i.message])).toEqual([[['label'], 'a label belongs to a leads_to link only']]);
  });

  it('29.121 the fold keeps the label on leads_to only, adds idempotently, relabels by remove+add', () => {
    const born = bornState();
    const a = applyTicketEvent(born, link('ticket.link_added', 'leads_to', TARGET, 'Yes'), deps);
    expect(a.links).toEqual([{ kind: 'leads_to', targetId: TARGET, label: 'Yes' }]);
    expect(applyTicketEvent(a, link('ticket.link_added', 'leads_to', TARGET, 'No'), deps)).toBe(a); // same ordered pair: no-op
    const unlabeled = applyTicketEvent(born, link('ticket.link_added', 'leads_to', TARGET), deps);
    expect('label' in unlabeled.links![0]!).toBe(false);
    const relabelled = applyTicketEvent(
      applyTicketEvent(a, link('ticket.link_removed', 'leads_to', TARGET), deps),
      link('ticket.link_added', 'leads_to', TARGET, 'Maybe'),
      deps,
    );
    expect(relabelled.links).toEqual([{ kind: 'leads_to', targetId: TARGET, label: 'Maybe' }]);
    expect(applyTicketEvent(born, link('ticket.link_added', 'blocks', TARGET), deps).links).toEqual([{ kind: 'blocks', targetId: TARGET }]); // control
  });

  it('29.121 a draft-side from entry keeps its label (the publish re-files it, E7); control: an unlabelled one has no label key', () => {
    const draft = applyTicketEvent(
      undefined,
      makeEnvelope({
        type: 'ticket.created',
        entity: { kind: 'ticket', id: DRAFT },
        payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Chiller', start: 'backlog', draft: true },
      }),
      deps,
    );
    const fromLink = (label?: string) =>
      makeEnvelope({
        type: 'ticket.link_added',
        entity: { kind: 'ticket', id: DRAFT },
        payload: { kind: 'leads_to', targetId: DRAFT, from: SOURCE, ...(label === undefined ? {} : { label }) },
      });
    expect(applyTicketEvent(draft, fromLink('Yes'), deps).links).toEqual([{ kind: 'leads_to', targetId: DRAFT, from: SOURCE, label: 'Yes' }]);
    const bare = applyTicketEvent(draft, fromLink(), deps).links![0]!;
    expect(Object.keys(bare).sort()).toEqual(['from', 'kind', 'targetId']); // CONTROL: no `label` key at all
  });
});

describe("29.126 the withheld copy keeps a leads_to label on 'out' and drops it on 'in' (planner rulings 2026-10-04 13:01 and 2026-10-05 00:13, spec LK-6)", () => {
  it("29.126 withheldLinkPayload keeps the label last on 'out' (a hidden target), drops it on 'in' (a hidden source), with no id; control: no label, no key (TL4b and D6 shapes byte for byte)", () => {
    // 'out': the hidden end is the target, the label is the visible source's own branch (LK-6 keeps it)
    expect(JSON.stringify(withheldLinkPayload('leads_to', 'out', 'Yes'))).toBe('{"kind":"leads_to","targetId":null,"label":"Yes"}');
    // 'in': the hidden end IS the source, whose branch the label names: D6's shape exactly, no label key
    expect(JSON.stringify(withheldLinkPayload('leads_to', 'in', 'Yes'))).toBe('{"kind":"leads_to","targetId":null,"from":null}');
    expect('label' in withheldLinkPayload('leads_to', 'in', 'Yes')).toBe(false);
    expect(JSON.stringify(withheldLinkPayload('leads_to', 'out'))).toBe('{"kind":"leads_to","targetId":null}'); // control
    expect(JSON.stringify(withheldLinkPayload('leads_to', 'in'))).toBe('{"kind":"leads_to","targetId":null,"from":null}'); // control
    // absent, never `undefined`: JSON would hide an undefined member, an in-process reader would not
    expect('label' in withheldLinkPayload('blocks', 'out')).toBe(false);
    expect('label' in withheldLinkPayload('blocks', 'in')).toBe(false);
  });
});

