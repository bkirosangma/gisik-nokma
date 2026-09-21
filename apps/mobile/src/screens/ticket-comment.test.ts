import { describe, expect, it } from 'vitest';
import { isUlid } from '@gisik-nokma/domain';
import {
  buildCommentEvent,
  COMMENTING_AVAILABLE,
  COMMENTING_WITHHELD_MESSAGE,
  UNATTRIBUTED_ACTOR_ID,
} from './ticket-comment.js';

/**
 * 12.401 — E2-42: a phone comment's envelope never claims a real member's id
 * as its author, however the ticket is assigned — `actorId` is always the
 * non-resolvable placeholder, never a guess.
 */
describe('buildCommentEvent', () => {
  it('12.401 — always claims the unattributed placeholder, never a real id', () => {
    const event = buildCommentEvent({ workspaceId: 'ws1', ticketId: 't1', body: 'hello' });
    expect(event.actorId).toBe('me');
    expect(event.actorId).toBe(UNATTRIBUTED_ACTOR_ID);
  });

  it('carries the workspace, entity and payload through unchanged', () => {
    const event = buildCommentEvent({ workspaceId: 'ws1', ticketId: 't1', body: { type: 'doc', content: [] } });
    expect(event.workspaceId).toBe('ws1');
    expect(event.entity).toEqual({ kind: 'ticket', id: 't1' });
    expect(event.type).toBe('comment.added');
    expect(event.payload).toEqual({ body: { type: 'doc', content: [] } });
    expect(event.origin).toBe('mobile');
  });

  it('the placeholder is never a valid ULID, so every comment is refused rather than misattributed', () => {
    expect(isUlid(UNATTRIBUTED_ACTOR_ID)).toBe(false);
  });
});

/**
 * 12.408 — E5-44: since `UNATTRIBUTED_ACTOR_ID` (12.401) is never a valid
 * ULID, no phone comment can ever commit — there is no per-ticket condition
 * left to gate on, so the Comment control is withheld outright with a
 * sentence rather than accepted into a queue whose terminal failure the
 * screen never reads.
 */
describe('COMMENTING_AVAILABLE', () => {
  it('12.408 — is false, and the withheld message names the website as the alternative', () => {
    expect(COMMENTING_AVAILABLE).toBe(false);
    expect(COMMENTING_WITHHELD_MESSAGE.toLowerCase()).toContain('website');
  });
});
