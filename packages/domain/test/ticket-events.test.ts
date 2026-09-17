import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/parse-event.js';
import {
  ticketClosedPayload,
  ticketCreatedPayload,
  ticketFieldSetPayload,
  ticketReopenedPayload,
} from '../src/events/ticket-events.js';
import { makeEnvelope } from '../src/testing.js';
import { domainRegistry } from '../src/vocabulary.js';

const TICKET = '01J9GTKA000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const ATTACHMENT = '01J9GATT000000000000000000';
const DRIVE_ATTACHMENT = '01J9GATD000000000000000000';
const SHA256 = 'a3f1'.repeat(16); // 64 lowercase-hex characters

/**
 * Round-trip through the real door. `parseEvent` on shipped `main` answers with
 * a result union rather than throwing (Plan 1), and it validates a
 * SubmittedEvent — the two ingest-assigned fields are stripped, not echoed — so
 * a round-trip asserts the parsed PAYLOAD against what was submitted, which is
 * the thing each registration's schema is responsible for.
 */
function roundTrips(type: string, entityKind: 'ticket' | 'ticket-type', payload: unknown): void {
  const env = makeEnvelope({ type, entity: { kind: entityKind, id: TICKET }, payload });
  const result = parseEvent(env);
  expect(result.ok, `${type} should parse: ${result.ok ? '' : result.message}`).toBe(true);
  if (result.ok) {
    expect(result.event.payload).toEqual(payload);
    expect(result.event.type).toBe(type);
  }
}

/** The refusal half: a claim the door must not admit, and the code it answers with. */
function refuses(type: string, entityKind: 'ticket' | 'ticket-type' | 'workflow', payload: unknown): string {
  const result = parseEvent(makeEnvelope({ type, entity: { kind: entityKind, id: TICKET }, payload }));
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.code;
}

/**
 * The sibling of `refuses` that returns what the door SAYS rather than which
 * code it answers. A code is a branch; the message is the sentence a person
 * reads, and the two fail independently — a reworded message keeps its code.
 */
function refusalMessage(type: string, payload: unknown): string {
  const result = parseEvent(makeEnvelope({ type, entity: { kind: 'ticket', id: TICKET }, payload }));
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.message;
}

/**
 * 5.3 — Every ticket vocabulary event round-trips through parseEvent; malformed payloads, an unknown event type, and a ticket event filed against the wrong entity kind are each refused at the door.
 */
describe('ticket event vocabulary', () => {
  it('accepts every event in the vocabulary', () => {
    roundTrips('ticket-type.defined', 'ticket-type', {
      id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic',
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    });
    roundTrips('ticket.created', 'ticket', { typeId: 'task', projectId: PROJECT, parentId: PARENT, title: 'File the GST return' });
    roundTrips('ticket.created', 'ticket', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Root task' });
    // `to`, not `toStateId`, and a comment is `{ text }`: the shipped
    // ticketTransitionedPayloadSchema is Plan 2's, and the engine and all 61
    // fixtures speak it. This registration binds THAT schema rather than
    // introducing a second shape for one event type.
    roundTrips('ticket.transitioned', 'ticket', { to: 'done' });
    roundTrips('ticket.transitioned', 'ticket', { to: 'done', comment: { text: 'filed' }, evidenceAttachmentId: ATTACHMENT });
    roundTrips('ticket.transitioned', 'ticket', { to: 'todo', cause: { kind: 'reopened-for-child', childTicketId: PARENT } });
    roundTrips('ticket.assigned', 'ticket', { assigneeId: 'user-anselma' });
    roundTrips('ticket.assigned', 'ticket', { assigneeId: null });
    roundTrips('ticket.collaborator_added', 'ticket', { userId: 'user-anselma' });
    roundTrips('ticket.collaborator_removed', 'ticket', { userId: 'user-anselma' });
    roundTrips('ticket.field_set', 'ticket', { fieldId: 'dueDate', value: { date: '2026-08-30', note: 'GST' } });
    roundTrips('ticket.field_set', 'ticket', { fieldId: 'amount', value: null });
    roundTrips('ticket.reparented', 'ticket', { newParentId: PARENT });
    roundTrips('ticket.reparented', 'ticket', { newParentId: null });
    roundTrips('ticket.workflow_rebound', 'ticket', { toWorkflowId: 'wf-support', toStateId: 'triage' });
    roundTrips('comment.added', 'ticket', { body: { type: 'doc', content: [] } });
    roundTrips('attachment.added', 'ticket', {
      kind: 'upload', attachmentId: ATTACHMENT, filename: 'gst-receipt.pdf',
      mime: 'application/pdf', size: 48211, sha256: SHA256,
    });
    roundTrips('attachment.added', 'ticket', {
      kind: 'drive-reference', attachmentId: DRIVE_ATTACHMENT,
      driveFileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456',
      name: 'GST filing checklist', mimeType: 'application/vnd.google-apps.document',
      webViewLink: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456/view',
      capturedAt: '2026-08-20T10:00:00.000Z',
    });
  });

  it('refuses a ticket.created without a title', () => {
    expect(refuses('ticket.created', 'ticket', { typeId: 'task', projectId: PROJECT, parentId: null })).toBe(
      'invalid-payload',
    );
  });

  it('refuses a parent id that is not a ULID', () => {
    expect(
      refuses('ticket.created', 'ticket', { typeId: 'task', projectId: PROJECT, parentId: 'not-a-ulid', title: 'x' }),
    ).toBe('invalid-payload');
  });

  it('refuses a comment whose body is not a document object', () => {
    expect(refuses('comment.added', 'ticket', { body: 'plain string' })).toBe('invalid-payload');
  });

  it('refuses an upload with a negative size', () => {
    expect(
      refuses('attachment.added', 'ticket', {
        kind: 'upload', attachmentId: ATTACHMENT, filename: 'x.pdf', mime: 'application/pdf', size: -1, sha256: SHA256,
      }),
    ).toBe('invalid-payload');
  });

  /**
   * 9.57 — an `attachment.added` claim states which of the two kinds it is or is refused at the door; a Drive reference and an upload are two shapes, not one shape with optional fields. (Also catalogued as case 5.26.)
   */
  it('refuses an attachment claim that does not say which kind it is — an unstated kind is the ambiguity these rules exist to remove', () => {
    expect(
      refuses('attachment.added', 'ticket', {
        attachmentId: ATTACHMENT, filename: 'x.pdf', mime: 'application/pdf', size: 48211, sha256: SHA256,
      }),
    ).toBe('invalid-payload');
  });

  it('refuses an upload with no sha256 — bytes this product holds are hashed, so evidence can be verified rather than merely present', () => {
    expect(
      refuses('attachment.added', 'ticket', {
        kind: 'upload', attachmentId: ATTACHMENT, filename: 'x.pdf', mime: 'application/pdf', size: 48211,
      }),
    ).toBe('invalid-payload');
  });

  it('refuses an unknown event type — the ledger accepts only what it can replay', () => {
    expect(refuses('ticket.renamed', 'ticket', {})).toBe('unknown-event-type');
  });

  it('refuses a ticket event filed against another kind of entity — the G1 door, now covering the whole ticket vocabulary', () => {
    // Every registration below declares the entity kind its events are about
    // (coordination doc §11), so the door refuses a misfiled claim before the
    // ledger — which is append-only by trigger and could never take it back.
    expect(
      refuses('ticket.created', 'workflow', { typeId: 'task', projectId: PROJECT, parentId: null, title: 'x' }),
    ).toBe('entity-kind-mismatch');
    expect(refuses('ticket-type.defined', 'ticket', {
      id: 'invoice', name: 'Invoice', icon: 'receipt', rank: 3, workflowId: 'wf-basic', fields: [],
    })).toBe('entity-kind-mismatch');
  });
});

/**
 * The presence hole, closed. `z.unknown()` alone does NOT require the key, so
 * `{ fieldId: 'title' }` — no `value` at all — parsed clean, and the reducer's
 * then-`p.value ?? null` folded that absence into a null CLEARING claim: a
 * field wiped under the actor's name and both their clocks, into an append-only
 * table, on the strength of a claim nobody made. The coalesce has since been
 * dropped too — `src/ticket-state.ts:211` reads `claim(p.value, env)` — because
 * with the key required the `parse` throws first and `null ?? null` is
 * identity, so the fold could only have restated the defect as the design.
 *
 * FOUR assertions rather than one "the field is required", because two of the
 * four are ACCEPTANCES and they are the half a careless fix breaks. A schema
 * that also refused `null` or `{}` would look correct and would quietly start
 * refusing legitimate claims — `null` is the explicit clearing claim, and an
 * empty claim is still a claim.
 *
 * The same matrix, in the same words, as `envelope.test.ts`'s "payload is
 * required" block: two doors, one answer.
 */
describe('ticket.field_set value is required', () => {
  function issues(payload: Record<string, unknown>): Array<{ path: (string | number)[]; message: string }> {
    const result = ticketFieldSetPayload.safeParse(payload);
    if (result.success) throw new Error('expected safeParse to fail, but it succeeded');
    return result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
  }

  it('planted defect: refuses an ABSENT value — the reducer would fold it into a clearing nobody claimed', () => {
    expect(ticketFieldSetPayload.safeParse({ fieldId: 'title' }).success).toBe(false);
    expect(issues({ fieldId: 'title' })).toContainEqual({
      path: ['value'],
      message: 'is required — a field claim with no value would record a clearing nobody made',
    });
  });

  it('planted defect: refuses an explicitly undefined value — JSON erases the difference from absence', () => {
    expect(issues({ fieldId: 'title', value: undefined })).toContainEqual({
      path: ['value'],
      message: 'is required — a field claim with no value would record a clearing nobody made',
    });
  });

  it('accepts value: null — the clearing claim is a claim, made by somebody, at a time', () => {
    expect(ticketFieldSetPayload.safeParse({ fieldId: 'amount', value: null }).success).toBe(true);
  });

  it('accepts an empty-object value — an empty claim is still a claim', () => {
    expect(ticketFieldSetPayload.safeParse({ fieldId: 'description', value: {} }).success).toBe(true);
  });

  it('the door inherits it: parseEvent refuses a field_set carrying no value', () => {
    expect(refuses('ticket.field_set', 'ticket', { fieldId: 'title' })).toBe('invalid-payload');
  });
});

/**
 * Ruling P15 — the create door was admitting precisely the state the edit door
 * forbids. `checkTicketFieldSet` refuses a whitespace-only `title` change with
 * `field.type-mismatch`, so `'   '` could be CREATED but never set; "the title
 * that cannot vanish" was an edit-time rule rather than an invariant.
 *
 * FOUR assertions rather than one "titles must not be blank", for the reason
 * the field_set block above gives: two of the four are ACCEPTANCES, and they
 * are the half a careless fix breaks. A refine that trimmed instead of refusing
 * would pass a "blank is refused" test and quietly rewrite every padded title
 * in the ledger — putting words in the actor's mouth — so the padded case
 * asserts the stored string BYTE FOR BYTE, exactly as `membership.test.ts` does
 * for a workspace name. The refusal itself is the sibling's, in the sibling's
 * words with the noun it is about: one answer across the series, not two.
 */
/**
 * 5.48 — A whitespace-only ticket.created title is refused at the door, while a padded real title is accepted and stored byte-for-byte verbatim (not trimmed).
 */
describe('ticket.created title must not be blank', () => {
  function issues(payload: Record<string, unknown>): Array<{ path: (string | number)[]; message: string }> {
    const result = ticketCreatedPayload.safeParse(payload);
    if (result.success) throw new Error('expected safeParse to fail, but it succeeded');
    return result.error.issues.map((issue) => ({ path: issue.path, message: issue.message }));
  }

  function created(title: unknown): Record<string, unknown> {
    return { typeId: 'task', projectId: PROJECT, parentId: null, title };
  }

  it('refuses an empty title', () => {
    expect(issues(created(''))).toContainEqual({
      path: ['title'],
      message: 'String must contain at least 1 character(s)',
    });
  });

  it('planted defect: refuses a title of only spaces — .min(1) alone admits it', () => {
    expect(ticketCreatedPayload.safeParse(created('   ')).success).toBe(false);
    expect(issues(created('   '))).toContainEqual({
      path: ['title'],
      message: 'must not be blank — a title of only spaces names nothing',
    });
  });

  it('accepts a padded real title and stores it VERBATIM — refusing blanks must not become trimming', () => {
    expect(ticketCreatedPayload.parse(created('  Reconcile the till  '))).toEqual({
      typeId: 'task',
      projectId: PROJECT,
      parentId: null,
      title: '  Reconcile the till  ',
    });
  });

  it('accepts an ordinary title', () => {
    expect(ticketCreatedPayload.safeParse(created('Reconcile the till')).success).toBe(true);
  });

  /**
   * 5.53 — parseEvent's exact refusal message for a whitespace-only ticket.created title is pinned character-for-character (the message half of Ruling P15's residuals; the fixture end-to-end half lives in packages/rule-engine/fixtures/created-blank-title.json and its consuming engine test, not in this file).
   */
  it('the door inherits it: parseEvent refuses a ticket.created whose title is only spaces', () => {
    expect(refuses('ticket.created', 'ticket', created('   '))).toBe('invalid-payload');
    // The MESSAGE, not only the code. Until now this sentence was verified by a
    // probe and pinned by nothing, so the code alone would have stayed green
    // through any rewording — and this is the sentence Plan 6 renders to a
    // person. It names the field because `parse-event.ts` renders the zod path;
    // the same `at <path>: <message>` construction the engine's own
    // `malformedPayloadDetail` mirrors, so the door and the engine say the path
    // the same way.
    expect(refusalMessage('ticket.created', created('   '))).toBe(
      "payload for 'ticket.created' v1 is invalid at title: must not be blank — a title of only spaces names nothing",
    );
  });
});

/** 13.567 — the payload schemas (spec §1.2/§1.3). */
describe('13.567 start and the two flag payloads', () => {
  it('ticketCreatedPayload accepts start backlog|focus and its absence, refuses anything else', () => {
    const base = { typeId: 'task', projectId: PROJECT, parentId: null, title: 'x' };
    expect(ticketCreatedPayload.parse({ ...base, start: 'backlog' }).start).toBe('backlog');
    expect(ticketCreatedPayload.parse({ ...base, start: 'focus' }).start).toBe('focus');
    expect(ticketCreatedPayload.parse(base).start).toBeUndefined();
    expect(() => ticketCreatedPayload.parse({ ...base, start: 'parked' })).toThrow();
  });
  it('ticket.closed and ticket.reopened carry an empty, strict payload', () => {
    expect(ticketClosedPayload.parse({})).toEqual({});
    expect(() => ticketClosedPayload.parse({ reason: 'x' })).toThrow();
    expect(ticketReopenedPayload.parse({})).toEqual({});
  });
  it('both types are registered on the ticket entity at version 1', () => {
    expect(domainRegistry.get('ticket.closed', 1)?.entityKind).toBe('ticket');
    expect(domainRegistry.get('ticket.reopened', 1)?.version).toBe(1);
  });
});
