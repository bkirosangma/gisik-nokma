import { describe, expect, it } from 'vitest';
import { parseNotification, type Notification } from '@gisik-nokma/domain';
import {
  notificationBody,
  notificationHeadline,
  notificationTarget,
  notificationTicketLabel,
} from '../../src/inbox/format.js';
import { notificationOf, userName } from './fixtures.js';

/**
 * 18.412 — a mention that sat in a NOTE renders like any mention (same
 * headline, the excerpt as the body) but is labelled with the NOTE's title and
 * opens the note — and, for a comment, the comment. The fixture goes through
 * `parseNotification`, the product's boundary parser, so the row is one the
 * server could really send.
 */
function noteMention(source: 'note' | 'note-comment'): Notification {
  return parseNotification({
    id: '01J9GN0T000000000000000099',
    userId: 'user_anselma',
    workspaceId: 'ws_1',
    kind: 'mention',
    dedupeKey: 'mention:e9:user_anselma',
    payload: {
      noteId: 'n-cold-room',
      noteTitle: 'Cold room audit',
      mentionedBy: 'user_kiro',
      eventId: 'e-comment-9',
      source,
      excerpt: 'please review the compressor log',
      clientTime: '2026-09-29T05:00:00.000Z',
      serverTime: '2026-09-29T05:00:01.000Z',
    },
    read: false,
    createdAt: '2026-09-29T05:00:02.000Z',
  });
}

describe('18.412 a note mention in the inbox', () => {
  it('reads as a mention: attributed headline, the sender’s own words as the body', () => {
    const row = noteMention('note');
    expect(notificationHeadline(row, userName)).toBe('Kiro mentioned you');
    expect(notificationBody(row)).toBe('please review the compressor log');
  });

  it('is labelled with the NOTE’s title; a ticket mention keeps its ticket title (control)', () => {
    expect(notificationTicketLabel(noteMention('note'))).toBe('Cold room audit');
    expect(notificationTicketLabel(notificationOf('mention'))).toBe('File the GST return');
  });

  it('opens the note for a body mention, and the note plus the comment for a comment mention', () => {
    expect(notificationTarget(noteMention('note'))).toEqual({ kind: 'note', noteId: 'n-cold-room', commentId: null });
    expect(notificationTarget(noteMention('note-comment'))).toEqual({
      kind: 'note',
      noteId: 'n-cold-room',
      commentId: 'e-comment-9',
    });
  });

  it('every other row still opens its ticket (control: the ticket mention too)', () => {
    expect(notificationTarget(notificationOf('mention'))).toEqual({ kind: 'ticket', ticketId: 't-mention' });
    expect(notificationTarget(notificationOf('assignment'))).toEqual({ kind: 'ticket', ticketId: 't-assignment' });
  });
});
