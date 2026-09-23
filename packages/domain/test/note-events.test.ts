import { describe, expect, it } from 'vitest';
import { ENTITY_KINDS } from '../src/envelope.js';
import { noteCreatedPayload, noteScopeSetPayload } from '../src/events/note-events.js';
import { domainRegistry } from '../src/vocabulary.js';

const T = '01J9GTKA000000000000000000';

describe('18.001 note is an entity kind', () => {
  it('18.001 ENTITY_KINDS contains note and not a made-up kind', () => {
    expect(ENTITY_KINDS).toContain('note');
    expect(ENTITY_KINDS).not.toContain('notebook'); // control
  });
});

describe('18.002 noteCreatedPayload', () => {
  const minimal = { title: 'Cold room', homeProjectId: '', scope: { mode: 'private' as const } };
  it('18.002 accepts the minimal payload (control) and refuses each invalid shape', () => {
    expect(noteCreatedPayload.safeParse(minimal).success).toBe(true);
    expect(noteCreatedPayload.safeParse({ ...minimal, title: '' }).success).toBe(false);
    expect(noteCreatedPayload.safeParse({ ...minimal, scope: { mode: 'inherit' } }).success).toBe(false);
    expect(
      noteCreatedPayload.safeParse({ ...minimal, scope: { mode: 'inherit' }, attachTicketId: T }).success,
    ).toBe(true);
    expect(noteCreatedPayload.safeParse({ ...minimal, scope: { mode: 'project' } }).success).toBe(false);
    expect(
      noteCreatedPayload.safeParse({ ...minimal, homeProjectId: 'P1', scope: { mode: 'project' } }).success,
    ).toBe(true);
    expect(noteCreatedPayload.safeParse({ ...minimal, scope: { mode: 'explicit', userIds: [] } }).success).toBe(false);
    expect(noteScopeSetPayload.safeParse({ mode: 'workspace', userIds: ['u'] }).success).toBe(false);
  });
});

describe('18.003 registrations', () => {
  it('18.003 every note.* type is registered at version 1', () => {
    for (const type of [
      'note.created', 'note.renamed', 'note.body_set', 'note.scope_set', 'note.moved',
      'note.attached', 'note.detached', 'note.deleted', 'note.restored',
    ]) {
      expect(domainRegistry.get(type, 1)?.entityKind).toBe('note');
    }
    expect(domainRegistry.get('comment.added', 1)?.entityKind).toEqual(['ticket', 'note']);
  });
});
