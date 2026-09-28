import { describe, expect, it } from 'vitest';
import {
  isRedactedTicketCreated,
  isSystemActor,
  newUlid,
  parseEvent,
  purgeCompletedPayload,
  PURGE_SERVER_ONLY_REASON,
  PURGED_ITEM_LABEL,
  PURGED_REASON,
  redactedTicketCreatedPayload,
  SYSTEM_ACTOR_NAMES,
  SYSTEM_ACTOR_PURGE,
  ULID_REGEX,
} from '../src/index.js';

/** Trash series Plan 2, Task 2. Cases 19.086–19.090 (`test-cases/19-trash.md` §19.10). */

const base = (type: string, kind: string, payload: unknown) => ({
  id: newUlid(),
  version: 1,
  origin: 'server',
  clientTime: '2026-09-28T10:00:00.000Z',
  actorId: SYSTEM_ACTOR_PURGE,
  workspaceId: newUlid(),
  entity: { kind, id: newUlid() },
  type,
  payload,
});

const completed = (kind: string) => ({ kind, markedBy: newUlid(), markedAt: '2026-09-13T10:00:00.000Z' });

describe('19.086 purge.completed is filed against the four purgeable kinds', () => {
  it.each(['workspace', 'project', 'ticket', 'note'])('%s accepted', (kind) => {
    expect(parseEvent(base('purge.completed', kind, completed(kind))).ok).toBe(true);
  });
  it('workflow refused; ticket accepted (control)', () => {
    const refused = parseEvent(base('purge.completed', 'workflow', completed('ticket')));
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.code).toBe('entity-kind-mismatch');
    expect(parseEvent(base('purge.completed', 'ticket', completed('ticket'))).ok).toBe(true);
  });
});

describe('19.087 the purge.completed payload is exactly { kind, markedBy, markedAt }', () => {
  it('refuses a stranger field, a missing markedAt, a non-ULID markedBy and an unknown kind', () => {
    const good = completed('ticket');
    expect(purgeCompletedPayload.safeParse(good).success).toBe(true);
    expect(purgeCompletedPayload.safeParse({ ...good, title: 'Invoice' }).success).toBe(false);
    const { markedAt: _dropped, ...noMarkedAt } = good;
    expect(purgeCompletedPayload.safeParse(noMarkedAt).success).toBe(false);
    expect(purgeCompletedPayload.safeParse({ ...good, markedBy: 'kiro' }).success).toBe(false);
    expect(purgeCompletedPayload.safeParse({ ...good, kind: 'workflow' }).success).toBe(false);
  });
});

describe('19.088 SYSTEM_ACTOR_PURGE is a reserved, named ULID', () => {
  it('matches ULID_REGEX, is named, and is a system actor; one letter outside the alphabet is not a ULID', () => {
    expect(ULID_REGEX.test(SYSTEM_ACTOR_PURGE)).toBe(true);
    expect(SYSTEM_ACTOR_NAMES.get(SYSTEM_ACTOR_PURGE)).toBe('Permanent deletion');
    expect(isSystemActor(SYSTEM_ACTOR_PURGE)).toBe(true);
    // CONTROL — the predicate can say no.
    expect(ULID_REGEX.test('00000000000000000000SYS0PI')).toBe(false);
  });
});

describe('19.089 the purge copy is exact', () => {
  it('pins the three strings', () => {
    expect(PURGED_REASON).toBe('This item was permanently deleted.');
    expect(PURGE_SERVER_ONLY_REASON).toBe('Only the permanent-deletion sweep can record a purge.');
    expect(PURGED_ITEM_LABEL).toBe('Deleted item');
    // CONTROL — an erased item is not a deleted one (Plan 1's sentence).
    expect(PURGED_REASON).not.toBe(
      'This workspace is deleted. Restore it from Deleted items on your Account page first.',
    );
  });
});

describe('19.090 isRedactedTicketCreated recognises only the redacted creation', () => {
  it('is true for the redacted shape and false for its near misses', () => {
    const projectId = newUlid();
    expect(isRedactedTicketCreated({ type: 'ticket.created', payload: { projectId, purged: true } })).toBe(true);
    expect(isRedactedTicketCreated({ type: 'ticket.created', payload: redactedTicketCreatedPayload(projectId) })).toBe(true);
    expect(
      isRedactedTicketCreated({
        type: 'ticket.created',
        payload: { typeId: 'task', projectId, parentId: null, title: 'Invoice' },
      }),
    ).toBe(false);
    expect(isRedactedTicketCreated({ type: 'ticket.created', payload: { projectId, purged: 'true' } })).toBe(false);
    expect(isRedactedTicketCreated({ type: 'ticket.field_set', payload: { purged: true } })).toBe(false);
    expect(isRedactedTicketCreated({ type: 'ticket.created', payload: null })).toBe(false);
  });
});
