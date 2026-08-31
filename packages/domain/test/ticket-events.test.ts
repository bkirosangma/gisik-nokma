import { describe, expect, it } from 'vitest';
import { parseEvent } from '../src/parse-event.js';
import { ticketFieldSetPayload } from '../src/events/ticket-events.js';
import { makeEnvelope } from '../src/testing.js';

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
 * `p.value ?? null` (`src/ticket-state.ts:201`) folded that absence into a null
 * CLEARING claim: a field wiped under the actor's name and both their clocks,
 * into an append-only table, on the strength of a claim nobody made.
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
