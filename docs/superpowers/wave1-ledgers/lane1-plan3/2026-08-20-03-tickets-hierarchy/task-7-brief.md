### Task 7: Field claim checks for ticket.field_set — unknown fields, kind mismatches, and the title that cannot vanish

**Files:**
- Create: `packages/rule-engine/src/checks/fields.ts`
- Test: `packages/rule-engine/src/checks/fields.test.ts`
- Modify: `packages/rule-engine/src/evaluate.ts` (add the `ticket.field_set` case)

**Interfaces:**
- Consumes: Task 5's refusal vocabulary and context helpers; `ticketFieldSetPayload`, `dueDateValueSchema`, `IST_DAY_REGEX`, `CustomFieldDef` (`@gisik-nokma/domain`); `buildMemoryContext` + test-support (Tasks 4–5).
- Produces: `checkTicketFieldSet(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict>`.

**Semantics:** built-in fields `title`, `description`, `dueDate`, `startDate` ride the same event as custom fields. `value: null` clears any field except `title` (`field.title-required`). A due date is `{ date: 'YYYY-MM-DD', note? }` — always a claim; the projection preserves actor and both times (Task 3 already proves that). Custom values must fit their `CustomFieldDef` kind; a `select` value must be one of its options; a `person` value is a non-empty user id string (existence checking belongs to the membership/auth plan).

- [ ] **Step 1: Write the failing tests**

```ts
// packages/rule-engine/src/checks/fields.test.ts
import { describe, expect, it } from 'vitest';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../memory-context';
import { checkTicketFieldSet } from './fields';
import { WF, WS, created, typeDefined } from './test-support';

const TICKET = '01J9GTKA000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

const INVOICE: TicketTypeDef = {
  id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic',
  fields: [
    { id: 'amount', name: 'Invoice amount', type: 'number' },
    { id: 'stage', name: 'Stage', type: 'select', options: ['Draft', 'Sent', 'Paid'] },
    { id: 'counterparty', name: 'Counterparty', type: 'person' },
    { id: 'filed-on', name: 'Filed on', type: 'date' },
  ],
};

const ctx = () => buildMemoryContext([WF], [typeDefined(INVOICE), created(TICKET, 'invoice', null)]);

function fieldSet(fieldId: string, value: unknown, ticketId: string = TICKET) {
  return makeEnvelope({ type: 'ticket.field_set', entity: { kind: 'ticket', id: ticketId }, workspaceId: WS, payload: { fieldId, value } });
}

describe('checkTicketFieldSet', () => {
  it('accepts fitting values for every kind, and null to clear', async () => {
    expect(await checkTicketFieldSet(fieldSet('amount', 1200), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('stage', 'Sent'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('counterparty', 'user-anselma'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('filed-on', '2026-08-30'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('amount', null), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('title', 'Renamed honestly'), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('description', { type: 'doc', content: [] }), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('description', null), ctx())).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('dueDate', { date: '2026-08-30', note: 'GST' }), ctx())).toEqual({ refused: false });
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

  it('planted defect: a date that is not a day, a person that is not an id', async () => {
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
  });

  it('planted defect: clearing the title', async () => {
    expect(await checkTicketFieldSet(fieldSet('title', null), ctx())).toEqual({
      refused: true,
      rule: 'field.title-required',
      reason: 'A ticket always has a title. Change the title instead of clearing it.',
    });
  });

  it('planted defect: a non-text title, a non-document description, a timestamp due date', async () => {
    expect(await checkTicketFieldSet(fieldSet('title', 42), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch', reason: '"Title" needs text.',
    });
    expect(await checkTicketFieldSet(fieldSet('description', 'plain string'), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch', reason: '"Description" needs a document.',
    });
    expect(await checkTicketFieldSet(fieldSet('dueDate', { date: '2026-08-30T10:00:00Z' }), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch',
      reason: '"Due date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
  });

  it('planted defect: field_set on a ticket that does not exist', async () => {
    expect(await checkTicketFieldSet(fieldSet('amount', 1200, GHOST), ctx())).toEqual({
      refused: true,
      rule: 'ticket.unknown',
      reason: 'This ticket does not exist in this workspace.',
    });
  });
});
```

- [ ] **Step 1a: Add the `startDate` claim cases to the same file**

`startDate` is a built-in day claim with exactly `dueDate`'s value shape — a claim like any other, made by someone, at a time. Append to the `describe('checkTicketFieldSet', …)` block in `packages/rule-engine/src/checks/fields.test.ts`:

```ts
  it('accepts a start-date claim, with or without a note, and null to clear it', async () => {
    expect(await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01' }), ctx())).toEqual({ refused: false });
    expect(
      await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01', note: 'after the licence renewal' }), ctx()),
    ).toEqual({ refused: false });
    expect(await checkTicketFieldSet(fieldSet('startDate', null), ctx())).toEqual({ refused: false });
  });

  it('planted defect: a timestamp start date, and a bare string where the claim belongs', async () => {
    expect(await checkTicketFieldSet(fieldSet('startDate', { date: '2026-09-01T10:00:00Z' }), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch',
      reason: '"Start date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
    expect(await checkTicketFieldSet(fieldSet('startDate', '2026-09-01'), ctx())).toEqual({
      refused: true, rule: 'field.type-mismatch',
      reason: '"Start date" needs a day in YYYY-MM-DD form (a note is optional).',
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/fields.test.ts`
Expected: FAIL — cannot find module `./fields`.

- [ ] **Step 3: Implement checkTicketFieldSet**

```ts
// packages/rule-engine/src/checks/fields.ts
import type { CustomFieldDef, EventEnvelope } from '@gisik-nokma/domain';
import { IST_DAY_REGEX, dueDateValueSchema, ticketFieldSetPayload } from '@gisik-nokma/domain';
import type { EngineContext } from '../engine-context';
import type { EngineVerdict } from '../evaluate';
import { getTicketState, getTicketTypeDef } from './context-helpers';
import { ACCEPT, fieldKindRefusal, refuse } from './refusals';

// A custom `date` field claims the same kind of day the built-ins do, so it is
// held to the same shape from the same origin — `IST_DAY_REGEX`, imported, not
// restated. A second copy here would be a second answer to "what is a day",
// and the two would drift the moment either moved.

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function customFieldVerdict(field: CustomFieldDef, value: unknown): EngineVerdict {
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
      return typeof value === 'string' && value.length > 0
        ? ACCEPT
        : refuse('field.type-mismatch', fieldKindRefusal(field.name, 'a person'));
  }
}

/**
 * Semantics for ticket.field_set: does the field exist on this ticket's type,
 * and does the value fit its kind? value: null clears — a claim like any
 * other — except title: a ticket always has a title.
 */
export async function checkTicketFieldSet(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict> {
  const p = ticketFieldSetPayload.parse(env.payload);
  const value = p.value ?? null;

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
  // one schema — a second copy is a second thing to drift.
  if (p.fieldId === 'dueDate' || p.fieldId === 'startDate') {
    if (value === null) return ACCEPT;
    const fieldName = p.fieldId === 'dueDate' ? 'Due date' : 'Start date';
    return dueDateValueSchema.safeParse(value).success
      ? ACCEPT
      : refuse('field.type-mismatch', fieldKindRefusal(fieldName, 'a day in YYYY-MM-DD form (a note is optional)'));
  }

  const type = await getTicketTypeDef(ctx, ticket.typeId);
  if (!type) return refuse('ticket.unknown-type');

  const field = type.fields.find((f) => f.id === p.fieldId);
  if (!field) return refuse('field.unknown');

  if (value === null) return ACCEPT; // clearing any custom field is a legal claim
  return customFieldVerdict(field, value);
}
```

- [ ] **Step 4: Wire into the dispatch**

In `packages/rule-engine/src/evaluate.ts`:

```ts
import { checkTicketFieldSet } from './checks/fields';

    case 'ticket.field_set':
      return checkTicketFieldSet(env, ctx);
```

- [ ] **Step 5: Run the tests to verify they pass, then the whole rule-engine suite**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/fields.test.ts`
Expected: PASS (10 tests) — including the two `startDate` cases.
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rule-engine/src/checks/fields.ts packages/rule-engine/src/checks/fields.test.ts packages/rule-engine/src/evaluate.ts
git commit -m "Field claims are checked against what the type declared: unknown fields refused by name, kinds enforced with the reason spelled out, the two day-claim built-ins sharing one shape rather than two that could drift, null clearing everything except the title a ticket cannot live without"
```

