import { describe, expect, it } from 'vitest';
import { makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { OTHER_WS, PROJECT, PROJECT_B, TASK, WF, WS, createdIn, typeDefined } from '../src/checks/test-support.js';

const A = '01J9GTKA100000000000000000';
const B = '01J9GTKB100000000000000000';
const C = '01J9GTKC100000000000000000';
const FOREIGN = '01J9GTKF100000000000000000';
const NOBODY = '01J9GTKZ000000000000000000';

/** A titled birth, like rank.test.ts's local `bornInBacklog`: the reasons name titles. */
const born = (id: string, title: string, workspaceId = WS): EventEnvelope =>
  makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId,
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title } });
const link = (source: string, kind: string, target: string, type = 'ticket.link_added'): EventEnvelope =>
  makeEnvelope({ type, entity: { kind: 'ticket', id: source }, workspaceId: WS, payload: { kind, targetId: target } });
const del = (id: string) => makeEnvelope({ type: 'ticket.deleted', entity: { kind: 'ticket', id }, workspaceId: WS, payload: {} });
const restore = (id: string) => makeEnvelope({ type: 'ticket.restored', entity: { kind: 'ticket', id }, workspaceId: WS, payload: {} });
const world = (...after: EventEnvelope[]) =>
  buildMemoryContext([WF], [typeDefined(TASK), born(A, 'Ice maker'), born(B, 'Chiller'), born(C, 'Freezer'), ...after]);
const ok = { refused: false };

describe('27.035–27.042 typed-link rules', () => {
  it('27.035 self-link refused; control: another ticket accepted', async () => {
    expect(await evaluateEvent(link(A, 'blocks', A), world())).toEqual({ refused: true, rule: 'link.self', reason: 'A ticket cannot be linked to itself.' });
    expect(await evaluateEvent(link(A, 'blocks', B), world())).toEqual(ok);
  });
  it('27.036 unknown and foreign targets share one refusal; control: same workspace accepted', async () => {
    const foreignWorld = buildMemoryContext([WF], [typeDefined(TASK), born(A, 'Ice maker'), createdIn(OTHER_WS, FOREIGN, 'task', PROJECT_B), born(B, 'Chiller')]);
    const refusal = { refused: true, rule: 'link.unknown-target', reason: 'The other ticket does not exist in this workspace.' };
    expect(await evaluateEvent(link(A, 'relates', NOBODY), world())).toEqual(refusal);
    expect(await evaluateEvent(link(A, 'relates', FOREIGN), foreignWorld)).toEqual(refusal);
    expect(await evaluateEvent(link(A, 'relates', B), foreignWorld)).toEqual(ok);
  });
  it('27.037 trashed target / source refused; control: restored accepted', async () => {
    expect(await evaluateEvent(link(A, 'blocks', B), world(del(B)))).toEqual({
      refused: true, rule: 'link.target-deleted', reason: 'The other ticket is deleted. Restore it, or pick another ticket.' });
    expect(await evaluateEvent(link(A, 'blocks', B), world(del(A)))).toEqual({
      refused: true, rule: 'deleted-ticket', reason: 'This ticket is deleted; restore it first.' }); // the live gate (`checks/deletion.ts`), not a link rule
    expect(await evaluateEvent(link(A, 'blocks', B), world(del(B), restore(B)))).toEqual(ok);
  });
  it('27.038 ordered duplicate refused; control: another kind accepted', async () => {
    expect(await evaluateEvent(link(A, 'blocks', B), world(link(A, 'blocks', B)))).toEqual({
      refused: true, rule: 'link.duplicate', reason: '"Ice maker" already blocks "Chiller".' });
    expect(await evaluateEvent(link(A, 'duplicates', B), world(link(A, 'duplicates', B)))).toEqual({
      refused: true, rule: 'link.duplicate', reason: '"Ice maker" already duplicates "Chiller".' });
    expect(await evaluateEvent(link(A, 'relates', B), world(link(A, 'blocks', B)))).toEqual(ok);
  });
  it('27.039 relates refused in either direction; control: a third ticket accepted', async () => {
    expect(await evaluateEvent(link(A, 'relates', B), world(link(B, 'relates', A)))).toEqual({
      refused: true, rule: 'link.duplicate', reason: '"Chiller" already relates to "Ice maker".' });
    expect(await evaluateEvent(link(A, 'relates', C), world(link(B, 'relates', A)))).toEqual(ok);
  });
  it('27.040 blocks reverse refused; control: a three-cycle is accepted', async () => {
    expect(await evaluateEvent(link(A, 'blocks', B), world(link(B, 'blocks', A)))).toEqual({
      refused: true, rule: 'link.reverse', reason: '"Chiller" already blocks "Ice maker".' });
    expect(await evaluateEvent(link(C, 'blocks', A), world(link(A, 'blocks', B), link(B, 'blocks', C)))).toEqual(ok);
  });
  it('27.041 duplicates reverse refused; control: nothing stored accepted', async () => {
    expect(await evaluateEvent(link(A, 'duplicates', B), world(link(B, 'duplicates', A)))).toEqual({
      refused: true, rule: 'link.reverse', reason: '"Chiller" already duplicates "Ice maker".' });
    expect(await evaluateEvent(link(A, 'duplicates', B), world())).toEqual(ok);
  });
  it('27.042 remove must name a link stored on this stream; control: the storing stream accepted', async () => {
    const stored = world(link(B, 'relates', A));
    expect(await evaluateEvent(link(A, 'relates', B, 'ticket.link_removed'), stored)).toEqual({
      refused: true, rule: 'link.absent', reason: 'This ticket holds no such link, so there is nothing to remove.' });
    expect(await evaluateEvent(link(B, 'relates', A, 'ticket.link_removed'), stored)).toEqual(ok);
    // The KIND is part of the stored link: the storing stream removing another kind is absent too.
    expect(await evaluateEvent(link(B, 'blocks', A, 'ticket.link_removed'), stored)).toMatchObject({ refused: true, rule: 'link.absent' });
  });
});

describe('27.046 the link check guards its own input', () => {
  it('27.046 a misfiled entity kind and a malformed payload are malformed-payload, an unknown source is unknown-ticket; control: the well-formed link is accepted', async () => {
    // The misfiled event names A, a ticket that EXISTS: without the kind guard it would be judged as A's link, and accepted.
    const misfiled = makeEnvelope({ type: 'ticket.link_added', entity: { kind: 'ticket-type', id: A }, workspaceId: WS, payload: { kind: 'blocks', targetId: B } });
    expect(await evaluateEvent(misfiled, world())).toEqual({
      refused: true, rule: 'malformed-payload', reason: 'This ticket.link_added event does not point at a ticket; it points at a ticket-type.' });
    const extra = makeEnvelope({ type: 'ticket.link_removed', entity: { kind: 'ticket', id: A }, workspaceId: WS, payload: { kind: 'blocks', targetId: B, note: 'x' } });
    expect(await evaluateEvent(extra, world(link(A, 'blocks', B)))).toEqual({
      refused: true, rule: 'malformed-payload', reason: "This ticket.link_removed event's payload is malformed: Unrecognized key(s) in object: 'note'" });
    expect(await evaluateEvent(link(NOBODY, 'blocks', B), world())).toEqual({
      refused: true, rule: 'unknown-ticket', reason: `This event links ticket ${NOBODY}, but no such ticket is known.` });
    expect(await evaluateEvent(link(NOBODY, 'blocks', B, 'ticket.link_removed'), world())).toMatchObject({ refused: true, rule: 'unknown-ticket' });
    // Controls: the same three calls, well formed and on a known source.
    expect(await evaluateEvent(link(A, 'blocks', B), world())).toEqual(ok);
    expect(await evaluateEvent(link(A, 'blocks', B, 'ticket.link_removed'), world(link(A, 'blocks', B)))).toEqual(ok);
  });
});

describe('27.048 a refusal names an untitled end by its id', () => {
  it('27.048 an end whose title is absent, empty or not a string reads by its id; control: the titled end reads by its title', async () => {
    // No event can mint such a ticket (a birth needs a title), so the state is planted on the memory context directly.
    const untitled = (value: unknown) => {
      const ctx = world(link(A, 'blocks', B));
      const a = ctx.tickets.get(A)!;
      const claim = a.fields['title']!;
      ctx.tickets.set(A, { ...a, fields: value === undefined ? {} : { title: { ...claim, value } } });
      return ctx;
    };
    for (const value of [undefined, '', 42]) {
      expect(await evaluateEvent(link(A, 'blocks', B), untitled(value)), String(value)).toEqual({
        refused: true, rule: 'link.duplicate', reason: `"${A}" already blocks "Chiller".` });
    }
    expect(await evaluateEvent(link(A, 'blocks', B), world(link(A, 'blocks', B)))).toEqual({
      refused: true, rule: 'link.duplicate', reason: '"Ice maker" already blocks "Chiller".' });
  });
});
