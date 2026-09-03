import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_KINDS,
  assignmentNotificationPayloadSchema,
  dateApproachingNotificationPayloadSchema,
  notificationPayloadSchemaByKind,
  parseNotification,
} from '../src/notifications.js';

const approachingPayload = {
  ticketId: 't1',
  ticketTitle: 'Renew the DLT registration',
  field: 'dueDate',
  claim: {
    date: '2026-08-30',
    note: 'GST filing',
    actorId: 'user_kiro',
    clientTime: '2026-08-19T10:00:00.000Z',
    serverTime: '2026-08-19T10:00:01.000Z',
  },
} as const;

describe('notification vocabulary', () => {
  it('has exactly the five kinds', () => {
    expect(NOTIFICATION_KINDS).toEqual(['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket']);
  });

  it('every kind has a payload schema', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(notificationPayloadSchemaByKind[kind]).toBeDefined();
    }
  });

  it('a date-approaching payload is the claim with its provenance, verbatim', () => {
    expect(dateApproachingNotificationPayloadSchema.parse(approachingPayload)).toEqual(approachingPayload);
  });

  it('cannot carry system-invented urgency — unknown keys refuse (planted defect)', () => {
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingPayload, urgency: 'high' }).success).toBe(false);
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingPayload, priority: 1 }).success).toBe(false);
    expect(
      assignmentNotificationPayloadSchema.safeParse({
        ticketId: 't1',
        ticketTitle: 'X',
        assignedBy: 'user_a',
        eventId: 'e1',
        clientTime: '2026-08-19T10:00:00.000Z',
        serverTime: '2026-08-19T10:00:01.000Z',
        severity: 'critical',
      }).success,
    ).toBe(false);
  });

  it('a claim without provenance refuses — attribution is not optional', () => {
    const { actorId: _dropped, ...claimWithoutActor } = approachingPayload.claim;
    expect(dateApproachingNotificationPayloadSchema.safeParse({ ...approachingPayload, claim: claimWithoutActor }).success).toBe(false);
  });

  it('parseNotification validates the payload against its kind', () => {
    const row = {
      id: '01J9GN0T000000000000000001',
      userId: 'user_kiro',
      workspaceId: 'ws_1',
      kind: 'date-approaching',
      dedupeKey: 'date-approaching:t1:2026-08-30',
      payload: approachingPayload,
      read: false,
      createdAt: '2026-08-23T05:00:00.000Z',
    };
    expect(parseNotification(row)).toEqual(row);
    expect(() => parseNotification({ ...row, kind: 'assignment' })).toThrow();
  });
});
