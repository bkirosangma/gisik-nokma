import { describe, expect, it } from 'vitest';
import { buildCommentEvent, UNATTRIBUTED_ACTOR_ID } from './ticket-comment.js';

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
});
