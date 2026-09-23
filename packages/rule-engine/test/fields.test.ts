import { describe, expect, it } from 'vitest';
import type { EventEnvelope, TicketTypeDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import type { MemoryContext } from '../src/memory-context.js';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketFieldSet } from '../src/checks/fields.js';
import { evaluateEvent } from '../src/evaluate.js';
import { WF, WS, created, typeDefined } from '../src/checks/test-support.js';

const TICKET = '01J9GTKA000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

/**
 * One type carrying one field of every custom kind, so a single context can
 * answer every kind question. Declared here rather than in `test-support.ts`
 * because only this suite needs a type with fields: the shared ladder is about
 * RANK, and a fielded type living beside it would leave a reader wondering
 * which is the product's.
 */
const INVOICE: TicketTypeDef = {
  id: 'invoice',
  name: 'Invoice',
  icon: 'receipt',
  rank: 3,
  workflowId: 'wf-basic',
  fields: [
    { id: 'amount', name: 'Invoice amount', type: 'number' },
    { id: 'stage', name: 'Stage', type: 'select', options: ['Draft', 'Sent', 'Paid'] },
    { id: 'counterparty', name: 'Counterparty', type: 'person' },
    { id: 'filed-on', name: 'Filed on', type: 'date' },
    { id: 'reference', name: 'Reference', type: 'text' },
  ],
};

const ctx = (): MemoryContext => buildMemoryContext([WF], [typeDefined(INVOICE), created(TICKET, 'invoice', null)]);

/**
 * The ticket exists and its TYPE does not — a world `buildMemoryContext` cannot
 * fold its way into, because `applyTicketEvent` throws on a `ticket.created`
 * whose type is unknown (`ticket-state.ts:97-99`). So the type is defined for
 * the fold and then removed from the context's own map, which is the only
 * staging a unit test has. The conclusion is unchanged but its reason is not:
 * Task 8 has since landed, and the fixture harness's `getTicketTypeDef` now
 * answers `ticketTypes.get(typeId) ?? null` (`fixtures/harness.ts`) rather than
 * throwing. A fixture still cannot stage this world, because the harness builds
 * that map by folding `ticket-type.defined` and there is no fixture-level way
 * to fold a `ticket.created` whose type is absent — `applyTicketEvent` throws
 * first. So the hole is still closed here and not with a fixture.
 */
function ctxWithoutTheTicketsType(): MemoryContext {
  const context = ctx();
  context.ticketTypes.delete('invoice');
  return context;
}

/**
 * Candidate payloads spell the key `fieldId`, which is what the DOMAIN schema
 * says (`events/ticket-events.ts:90`). The fixture harness's PRIOR-event parser
 * spells it `field`, and the split is deliberate — controller ruling P8,
 * pre-flight A16. Neither is adapted into the other.
 */
function fieldSet(fieldId: string, value: unknown, ticketId: string = TICKET): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.field_set',
    entity: { kind: 'ticket', id: ticketId },
    workspaceId: WS,
    payload: { fieldId, value },
  });
}

/** The same event with `value` absent entirely — the claim that was never made. */
function fieldSetWithNoValue(fieldId: string): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.field_set',
    entity: { kind: 'ticket', id: TICKET },
    workspaceId: WS,
    payload: { fieldId },
  });
}

/** Literal rule ids and literal, fully-interpolated reasons — never the builder. */
/**
 * 5.12 — field_set semantics across kinds: unknown field, text/number/date/select/person mismatches, document description, day-only dueDate/startDate, and the title that can never be cleared, each refused (or accepted) with the exact reason.
 */
describe('checkTicketFieldSet', () => {
  it('accepts fitting values for every kind, and null to clear', async () => {
    expect(await checkTicketFieldSet(fieldSet('amount', 1200), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('stage', 'Sent'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('counterparty', 'user-anselma'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('filed-on', '2026-08-30'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('reference', 'INV-7'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('amount', null), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('title', 'Renamed honestly'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('description', { type: 'doc', content: [] }), ctx())).toEqual({
      refused: false,
    });
    expect(await checkTicketFieldSet(fieldSet('description', null), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('dueDate', { date: '2026-08-30', note: 'GST' }), ctx())).toEqual({
      refused: false,
    });
    expect(await checkTicketFieldSet(fieldSet('dueDate', null), ctx())).toEqual({ refused: false });
  });

  it('planted defect: a field the type never declared', async () => {
    expect(await checkTicketFieldSet(fieldSet('invoice-number', 'INV-7'), ctx())).toEqual({
      refused: true,
      rule: 'field.unknown',
      reason: "This ticket's type has no such field. Add the field to the ticket type first.",
    });
  });

  it('planted defect: text where a number belongs', async () => {
    expect(await checkTicketFieldSet(fieldSet('amount', 'twelve'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Invoice amount" needs a number.',
    });
  });

  it('planted defect: a select value outside its list', async () => {
    expect(await checkTicketFieldSet(fieldSet('stage', 'Lost'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Stage" needs one of: Draft, Sent, Paid.',
    });
  });

  it('planted defect: a date that is not a day, a person that is not an id, a number that is not a text', async () => {
    expect(await checkTicketFieldSet(fieldSet('filed-on', '30/08/2026'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Filed on" needs a date in YYYY-MM-DD form.',
    });
    expect(await checkTicketFieldSet(fieldSet('counterparty', 42), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Counterparty" needs a person.',
    });
    expect(await checkTicketFieldSet(fieldSet('reference', 7), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Reference" needs text.',
    });
  });

  /**
   * 5.78 — E6-19, planted defect at the ENGINE's two day arms: a custom
   * `date` field and the `dueDate`/`startDate` built-ins each refuse
   * `2026-02-30` with the SAME sentence they already gave the wrong shape —
   * the door has one sentence for "not a day", not a second one for "a day
   * that does not exist". RED: `{ refused: false }` on all three.
   */
  it('planted defect: a day no calendar has is refused like a wrong shape, on the custom and the built-in arms', async () => {
    expect(await checkTicketFieldSet(fieldSet('filed-on', '2026-02-30'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Filed on" needs a date in YYYY-MM-DD form.',
    });
    expect(await checkTicketFieldSet(fieldSet('dueDate', { date: '2026-13-45' }), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Due date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
    expect(await checkTicketFieldSet(fieldSet('startDate', { date: '0000-00-00' }), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Start date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
    // The leap day is a real day: the refinement is the calendar, not February.
    expect(await checkTicketFieldSet(fieldSet('filed-on', '2028-02-29'), ctx())).toEqual({ refused: false });
  });

  it('planted defect: clearing the title', async () => {
    expect(await checkTicketFieldSet(fieldSet('title', null), ctx())).toEqual({
      refused: true,
      rule: 'field.title-required',
      reason: 'A ticket always has a title. Change the title instead of clearing it.',
    });
  });

  it('3.967 priority: the three levels are accepted on ANY ticket type, null is refused as required, anything else is a mismatch', async () => {
    for (const level of ['P1', 'P2', 'P3']) {
      expect(await checkTicketFieldSet(fieldSet('priority', level), ctx()), level).toEqual({ refused: false });
    }
    // Built-ins are answered BEFORE the type is resolved: a ticket whose type is gone still takes a priority.
    expect(await checkTicketFieldSet(fieldSet('priority', 'P1'), ctxWithoutTheTicketsType())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('priority', null), ctx())).toEqual({
      refused: true,
      rule: 'field.priority-required',
      reason: 'A ticket always has a priority. Change it instead of clearing it.',
    });
    expect(await checkTicketFieldSet(fieldSet('priority', 'P4'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Priority" needs one of P1, P2 or P3.',
    });
    expect(await checkTicketFieldSet(fieldSet('priority', 2), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Priority" needs one of P1, P2 or P3.',
    });
  });

  it('planted defect: a non-text title, a non-document description, a timestamp due date', async () => {
    expect(await checkTicketFieldSet(fieldSet('title', 42), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Title" needs text.',
    });
    expect(await checkTicketFieldSet(fieldSet('description', 'plain string'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Description" needs a document.',
    });
    expect(await checkTicketFieldSet(fieldSet('dueDate', { date: '2026-08-30T10:00:00Z' }), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Due date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
  });

  /**
   * A title of nothing but spaces, pinned because the `.trim()` that refuses it
   * is otherwise a branch no test can fail. `field.type-mismatch` rather than
   * `field.title-required`: the reason reads "needs text", and what is missing
   * IS the title's text — the person typed something, it just was not a title.
   * `field.title-required`'s sentence ("Change the title instead of clearing
   * it") is the one true of the actor who sent `null`, and telling it here
   * would be the borrowed-subject defect P11/P12/P13 closed three times.
   */
  it('planted defect: a title of nothing but whitespace', async () => {
    expect(await checkTicketFieldSet(fieldSet('title', '   '), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Title" needs text.',
    });
  });

  it('planted defect: field_set on a ticket that does not exist', async () => {
    expect(await checkTicketFieldSet(fieldSet('amount', 1200, GHOST), ctx())).toEqual({
      refused: true,
      rule: 'ticket.unknown',
      reason: 'This ticket does not exist in this workspace.',
    });
  });

  it('accepts a start-date claim, with or without a note, and null to clear it', async () => {
    expect(await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01' }), ctx())).toEqual({
      refused: false,
    });
    expect(
      await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01', note: 'after the licence renewal' }), ctx()),
    ).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('startDate', null), ctx())).toEqual({ refused: false });
  });

  it('planted defect: a timestamp start date, and a bare string where the claim belongs', async () => {
    expect(await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01T10:00:00Z' }), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Start date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
    expect(await checkTicketFieldSet(fieldSet('startDate', '2026-09-01'), ctx())).toEqual({
      refused: true,
      rule: 'field.type-mismatch',
      reason: '"Start date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
  });

  /**
   * `refuse('ticket.unknown-type')` shipped in this check's first draft with no
   * test behind it — the brief's own self-consistency finding 3, and a branch
   * that could have been deleted with the whole suite green. The built-ins are
   * answered before the type is resolved, so it takes a CUSTOM field to reach:
   * a title change on this same ticket is still accepted, which is the half
   * that pins the order rather than merely the branch.
   */
  /**
   * 5.46 — a custom-field claim on a ticket whose TYPE is no longer defined refuses `ticket.unknown-type`, while a title change on that same ticket is still accepted.
   */
  it('planted defect: a custom field on a ticket whose type is no longer defined', async () => {
    expect(await checkTicketFieldSet(fieldSet('amount', 1200), ctxWithoutTheTicketsType())).toEqual({
      refused: true,
      rule: 'ticket.unknown-type',
      reason: "This ticket's type is not defined in this workspace.",
    });
    expect(await checkTicketFieldSet(fieldSet('title', 'Still renameable'), ctxWithoutTheTicketsType())).toEqual({
      refused: false,
    });
  });

  /**
   * The presence hole at the check's own door. `ticketFieldSetPayload` used to
   * admit a payload with no `value` key at all, and the reducer's then-`p.value
   * ?? null` turned that absence into a null CLEARING claim nobody made. The
   * domain schema now refuses it (four assertions in
   * `packages/domain/test/ticket-events.test.ts`); this is the same refusal
   * seen from where the fixture suite and Plan 10's offline replica stand,
   * which is the only door those two ever pass. The coalesce is gone as well —
   * `ticket-state.ts:343` reads `claim(p.value, env)`, because once the key is
   * required the fold could only restate the closed hole as the design.
   */
  /**
   * 5.44 — a `ticket.field_set` whose payload omits `value` entirely is refused at the door, not folded into a clearing: `z.unknown()` does not require the key to be present.
   */
  it('planted defect: a field_set carrying no value at all is refused, not folded into a clearing', async () => {
    expect(await checkTicketFieldSet(fieldSetWithNoValue('amount'), ctx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason:
        "This ticket.field_set event's payload is malformed: at value: is required — a field claim with no value would record a clearing nobody made",
    });
  });

  it('planted defect: a field_set filed against something that is not a ticket', async () => {
    const env = makeEnvelope({
      type: 'ticket.field_set',
      entity: { kind: 'ticket-type', id: 'invoice' },
      workspaceId: WS,
      payload: { fieldId: 'title', value: 'x' },
    });
    expect(await checkTicketFieldSet(env, ctx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This ticket.field_set event does not point at a ticket; it points at a ticket-type.',
    });
  });
});

/**
 * The dispatch, which every test above bypasses by calling the check directly.
 * Without this, deleting `case 'ticket.field_set'` from `evaluate.ts` passes
 * the entire suite — the check would be perfect and unreachable, and the engine
 * would accept every field claim through the pass-through default, including
 * the ones that clear a title and the ones that name a field no type declared.
 */
describe('evaluateEvent dispatches ticket.field_set', () => {
  /**
   * 5.45 — `evaluateEvent` ROUTES `ticket.field_set`. Every other field test calls `checkTicketFieldSet` directly, so without this assertion deleting the dispatcher case would go unnoticed.
   */
  it('routes the event to checkTicketFieldSet rather than passing it through', async () => {
    expect(await evaluateEvent(fieldSet('title', null), ctx())).toEqual({
      refused: true,
      rule: 'field.title-required',
      reason: 'A ticket always has a title. Change the title instead of clearing it.',
    });
  });
});
