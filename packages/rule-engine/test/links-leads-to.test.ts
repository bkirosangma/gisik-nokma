import { describe, expect, it } from 'vitest';
import { DECISION_TYPE_ID, makeEnvelope, type EventEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { PROJECT, TASK, WF, WS, draftCreated, onTicket, typeDefined } from '../src/checks/test-support.js';

// The typed-links world of `links.test.ts`, plus a local Decision type (wtg2 T5 adds the seed; the rules read the id).
const A = '01J9GTKA100000000000000000';
const B = '01J9GTKB100000000000000000';
const C = '01J9GTKC100000000000000000';
const D = '01J9GTKD100000000000000000';
const D2 = '01J9GTKE100000000000000000';
const X = '01J9GTKF100000000000000000'; // the AUTHOR's draft (a Task)
const DD = '01J9GTKG100000000000000000'; // the AUTHOR's draft Decision
const DECISION = { ...TASK, id: DECISION_TYPE_ID, name: 'Decision', icon: 'diamond' };

/** A titled birth, like links.test.ts's `born`: the reasons name titles. */
const born = (id: string, title: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title } });
const bornAs = (id: string, title: string, typeId: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId, projectId: PROJECT, parentId: null, title } });
const link = (source: string, kind: string, target: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.link_added', entity: { kind: 'ticket', id: source }, workspaceId: WS, payload: { kind, targetId: target } });
const lead = (source: string, target: string, label?: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.link_added', entity: { kind: 'ticket', id: source }, workspaceId: WS,
    payload: { kind: 'leads_to', targetId: target, ...(label === undefined ? {} : { label }) } });
const unlead = (source: string, target: string): EventEnvelope =>
  makeEnvelope({ type: 'ticket.link_removed', entity: { kind: 'ticket', id: source }, workspaceId: WS, payload: { kind: 'leads_to', targetId: target } });
const world = (...after: EventEnvelope[]) =>
  buildMemoryContext([WF], [typeDefined(TASK), typeDefined(DECISION), born(A, 'Ice maker'), born(B, 'Chiller'), born(C, 'Freezer'),
    bornAs(D, 'Go ahead?', DECISION_TYPE_ID), bornAs(D2, 'Second look', DECISION_TYPE_ID), ...after]);
const ok = { refused: false };
const LABEL_REQUIRED = { refused: true, rule: 'link.label-required',
  reason: 'Name the branch: a link from a Decision needs a label, such as "Yes" or "No".' };

describe('29.122–29.123 leads_to rules', () => {
  it('29.122 loops and label-free links are accepted; self and the same ordered pair are refused; blocks reverse is still refused', async () => {
    expect(await evaluateEvent(lead(A, B), world(lead(B, A)))).toEqual(ok);                    // a two-ticket loop
    expect(await evaluateEvent(lead(A, B), world())).toEqual(ok);                              // label optional off a Decision
    expect((await evaluateEvent(lead(A, A), world()))).toMatchObject({ rule: 'link.self' });
    expect(await evaluateEvent(lead(A, B, 'x'), world(lead(A, B)))).toEqual({
      refused: true, rule: 'link.duplicate', reason: '"Ice maker" already leads to "Chiller".' });
    const block = (s: string, t: string) => link(s, 'blocks', t);                              // control
    expect(await evaluateEvent(block(A, B), world(block(B, A)))).toMatchObject({ rule: 'link.reverse' });
    expect(await evaluateEvent(block(A, B), world())).toEqual(ok); // reverse-guard control: no reverse stored, so blocks is accepted
  });

  it('29.123 a Decision source needs a unique label; relabel frees the old one; the pair is judged first', async () => {
    expect(await evaluateEvent(lead(D, B), world())).toEqual(LABEL_REQUIRED);
    expect(await evaluateEvent(lead(D, B, 'Yes'), world())).toEqual(ok);                        // control
    expect(await evaluateEvent(lead(A, B), world())).toEqual(ok);                               // control: a Task
    expect(await evaluateEvent(link(D, 'blocks', B), world())).toEqual(ok); // a Decision's NON-leads_to link needs no label
    const yes = world(lead(D, B, 'Yes'));
    expect(await evaluateEvent(lead(D, C, ' yes '), yes)).toEqual({ refused: true, rule: 'link.label-duplicate',
      reason: 'This Decision already has a branch labelled "yes".' });
    expect(await evaluateEvent(lead(D, C, 'No'), yes)).toEqual(ok);
    expect(await evaluateEvent(lead(D2, C, 'Yes'), yes)).toEqual(ok);                           // another Decision
    const tasks = world(lead(A, B, 'Yes'));
    expect(await evaluateEvent(lead(A, C, 'Yes'), tasks)).toEqual(ok);                          // a Task may repeat a label
    // A Decision holding an UNLABELLED leads_to (folded history, not judged): the clash scan must skip it, not throw.
    expect(await evaluateEvent(lead(D, C, 'Yes'), world(lead(D, B)))).toEqual(ok);
    // relabel = remove then add (LK-4): the freed label is reusable, a sibling's is not
    const two = world(lead(D, B, 'Yes'), lead(D, C, 'No'));
    const afterRemove = world(lead(D, B, 'Yes'), lead(D, C, 'No'), unlead(D, B));
    expect(await evaluateEvent(lead(D, B, 'Maybe'), afterRemove)).toEqual(ok);
    expect(await evaluateEvent(lead(D, B, 'Yes'), afterRemove)).toEqual(ok);
    expect(await evaluateEvent(lead(D, B, 'no'), afterRemove)).toMatchObject({ rule: 'link.label-duplicate' });
    expect(await evaluateEvent(lead(D, B, 'Maybe'), two)).toMatchObject({ rule: 'link.duplicate' }); // control: no removal first
    // the pair is judged BEFORE the label: 'No' is also the sibling C's label, so a label block placed first answers label-duplicate
    expect(await evaluateEvent(lead(D, B, 'No'), two)).toMatchObject({ rule: 'link.duplicate' });
  });

  it('29.123 the draft-side from form is judged on from; a draft Decision\'s incoming entry is not its branch', async () => {
    // Drafts R42: a link from published S to draft X is filed on X's stream as {kind, targetId: X, from: S}, by X's author.
    const fromForm = (draft: string, source: string, kind: string, label?: string) =>
      onTicket(draft, 'ticket.link_added', { kind, targetId: draft, from: source, ...(label === undefined ? {} : { label }) });
    const plainOn = (source: string, target: string, label: string) =>
      onTicket(source, 'ticket.link_added', { kind: 'leads_to', targetId: target, label });
    const dworld = (...after: EventEnvelope[]) =>
      buildMemoryContext([WF], [typeDefined(TASK), typeDefined(DECISION), born(A, 'Ice maker'), born(B, 'Chiller'), born(C, 'Freezer'),
        bornAs(D, 'Go ahead?', DECISION_TYPE_ID), draftCreated(X, 'task', null), draftCreated(DD, DECISION_TYPE_ID, null), ...after]);
    expect(await evaluateEvent(fromForm(X, D, 'leads_to'), dworld())).toEqual(LABEL_REQUIRED);
    expect(await evaluateEvent(fromForm(X, D, 'leads_to', 'Yes'), dworld())).toEqual(ok);      // control: labelled
    expect(await evaluateEvent(fromForm(X, A, 'leads_to'), dworld())).toEqual(ok);             // control: a Task source
    expect(await evaluateEvent(fromForm(X, D, 'blocks'), dworld())).toEqual(ok); // a Decision source, non-leads_to, from-form: no label needed
    // The clash is read from the SOURCE's links (D's plain 'Yes'), not from the draft X's.
    expect(await evaluateEvent(fromForm(X, D, 'leads_to', ' yes '), dworld(lead(D, B, 'Yes')))).toEqual({
      refused: true, rule: 'link.label-duplicate', reason: 'This Decision already has a branch labelled "yes".' });
    // The pair first, on the from path too: D's stored from-entry on X answers link.duplicate before any label rule.
    const held = dworld(fromForm(X, D, 'leads_to', 'Yes'));
    expect(await evaluateEvent(fromForm(X, D, 'leads_to', 'No'), held)).toMatchObject({ rule: 'link.duplicate' });
    // A draft Decision DD holding an INCOMING from-entry labelled 'Yes' (from the published Task A) may still name its
    // own branch 'Yes' (planner ruling 2026-10-04, Q3): the incoming entry is not DD's branch.
    const incoming = fromForm(DD, A, 'leads_to', 'Yes');
    expect(await evaluateEvent(plainOn(DD, B, 'Yes'), dworld(incoming))).toEqual(ok);
    // control: DD's own plain 'Yes' branch to C does clash
    expect(await evaluateEvent(plainOn(DD, B, 'Yes'), dworld(incoming, plainOn(DD, C, 'Yes')))).toEqual({
      refused: true, rule: 'link.label-duplicate', reason: 'This Decision already has a branch labelled "Yes".' });
  });
});
