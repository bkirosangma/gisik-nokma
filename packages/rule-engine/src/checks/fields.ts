import type { CustomFieldDef, EventEnvelope } from '@gisik-nokma/domain';
import { IST_DAY_REGEX, dueDateValueSchema, ticketFieldSetPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState, getTicketTypeDef } from './context-helpers.js';
import { ACCEPT, fieldKindRefusal, refuse } from './refusals.js';

// A custom `date` field claims the same kind of day the built-ins do, so it is
// held to the same shape from the same origin — `IST_DAY_REGEX`, imported, not
// restated. A second copy here would be a second answer to "what is a day",
// and the two would drift the moment either moved.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Does the value fit the kind the type declared?
 *
 * The `default` branch is unreachable and exists to STAY unreachable:
 * `CustomFieldDef['type']` is `z.enum(CUSTOM_FIELD_KINDS)` and
 * `CUSTOM_FIELD_KINDS` is exactly the five below (`ticket-types.ts:4`), so the
 * switch is exhaustive today. The `never` assignment is the net for tomorrow —
 * define a sixth kind and this file stops COMPILING, instead of silently
 * falling through and accepting every value of that kind unchecked. The
 * compile error is the guard; the throw only fires for a value that was cast
 * past the type system on its way in.
 */
function customFieldVerdict(field: CustomFieldDef, value: unknown): Accept | Refusal {
  switch (field.type) {
    case 'text':
      return typeof value === 'string'
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, 'text'));
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, 'a number'));
    case 'date':
      return typeof value === 'string' && IST_DAY_REGEX.test(value)
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, 'a date in YYYY-MM-DD form'));
    case 'select':
      return typeof value === 'string' && (field.options ?? []).includes(value)
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, `one of: ${(field.options ?? []).join(', ')}`));
    case 'person':
      // Non-empty id only. Whether that user EXISTS, and whether they are a
      // member of this workspace, belongs to the membership plan — this check
      // has no roster to ask and would have to invent an answer.
      return typeof value === 'string' && value.length > 0
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, 'a person'));
    default: {
      const unhandled: never = field.type;
      throw new Error(`customFieldVerdict: unhandled custom field kind "${String(unhandled)}"`);
    }
  }
}

/**
 * Semantics for `ticket.field_set`: does the field exist on this ticket's type,
 * and does the value fit its kind? `value: null` clears — a claim like any
 * other, keeping the clearer's id and both clocks — except `title`: a ticket
 * always has one.
 *
 * Order: kind → payload → unknown ticket → the four built-ins → unknown type →
 * unknown field → clearing → kind fit. The built-ins are answered BEFORE the
 * type is resolved because they do not belong to the type: `title`,
 * `description`, `dueDate` and `startDate` ride this event on every ticket
 * whatever its type declares, and `ticketTypeDefSchema` refuses a custom field
 * that shadows one of their ids (`ticket-types.ts:43-48`). Refusing a title
 * change with "this ticket's type is not defined" would be a sentence about the
 * wrong noun — the defect class rulings P11, P12 and P13 closed three times in
 * this plan.
 *
 * NOTHING HERE HAS TO INVENT AN ABSENT VALUE. `ticketFieldSetPayload` now
 * requires `value` to be present (`events/ticket-events.ts:91-93`, this task):
 * before that, a payload omitting it parsed clean and the reducer's
 * then-`p.value ?? null` folded the absence into a null clearing claim nobody
 * made. That coalesce has since been dropped as well (`ticket-state.ts:211`).
 * The refusal for an absent value is therefore `malformed-payload` from the
 * parse below, which is the honest answer — the claim never arrived.
 */
export async function checkTicketFieldSet(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  // Two layers, exactly as the hierarchy and rebind checks (pre-flight A19):
  // the fixture suite and Plan 10's offline replica enter at `evaluateEvent`
  // and never pass ingest's door, so this check keeps its own copy of both
  // questions.
  if (env.entity.kind !== 'ticket') {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.field_set event does not point at a ticket; it points at a ${env.entity.kind}.`,
    };
  }

  // `safeParse`, not `parse`: `evaluateEvent`'s frozen signature is
  // `Promise<Accept | Refusal>` and a throw is neither. On the server the
  // registered schema has already accepted this payload, so this branch is
  // unreachable there; everywhere else it is the difference between a refusal
  // and a crash.
  const parsed = ticketFieldSetPayload.safeParse(env.payload);
  if (!parsed.success) {
    const detail = malformedPayloadDetail(parsed.error);
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.field_set event's payload is malformed: ${detail}`,
    };
  }
  const p = parsed.data;
  const value = p.value;

  const ticket = await getTicketState(ctx, env.entity.id);
  if (!ticket) return refuse('ticket.unknown');

  if (p.fieldId === 'title') {
    if (value === null) return refuse('field.title-required');
    return typeof value === 'string' && value.trim().length > 0
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal('Title', 'text'));
  }

  if (p.fieldId === 'description') {
    if (value === null) return ACCEPT;
    return isPlainObject(value)
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal('Description', 'a document'));
  }

  // The two day-claim built-ins share one shape, so they share one branch and
  // one schema — a second copy is a second thing to drift. Only the NAME in the
  // reason differs, because that is the only thing about them that does.
  if (p.fieldId === 'dueDate' || p.fieldId === 'startDate') {
    if (value === null) return ACCEPT;
    const fieldName = p.fieldId === 'dueDate' ? 'Due date' : 'Start date';
    return dueDateValueSchema.safeParse(value).success
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal(fieldName, 'a day in YYYY-MM-DD form (a note is optional)'));
  }

  // Now, and only now, is the ticket's own TYPE the subject: everything below
  // asks what this type declared.
  const type = await getTicketTypeDef(ctx, ticket.typeId);
  if (!type) return refuse('ticket.unknown-type');

  const field = type.fields.find((f) => f.id === p.fieldId);
  if (!field) return refuse('field.unknown');

  // Clearing any custom field is a legal claim, and a claim is what it stays:
  // the reducer keeps the clearer's id and both clocks, so "who emptied this,
  // and when" survives (`ticket-state.ts:197-211`).
  if (value === null) return ACCEPT;
  return customFieldVerdict(field, value);
}
