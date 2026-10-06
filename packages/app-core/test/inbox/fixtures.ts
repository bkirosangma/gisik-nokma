import {
  NOTIFICATION_KINDS,
  parseNotification,
  type Notification,
  type NotificationKind,
} from '@gisik-nokma/domain';

/**
 * The inbox suites' one fixture builder.
 *
 * EVERY fixture goes through `parseNotification`, the product's own boundary
 * parser, rather than being cast into shape with `as Notification`. Task 3's
 * payload schemas are `.strict()`, so a fixture that drifts from the schema —
 * a renamed field, an extra one, a payload paired with the wrong kind — fails
 * HERE, loudly, instead of quietly letting a suite compile against a row the
 * server could never send. That is the same trap `timeline-view.test.tsx`
 * called out in the plan's own builder (`as TicketState` over a ticket missing
 * `kind` and `workflowVersion`).
 */
const CLIENT_TIME = '2026-08-19T10:00:00.000Z';
const SERVER_TIME = '2026-08-19T10:00:01.000Z';

export const NAMES: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
export const userName = (id: string): string => NAMES[id] ?? id;

/** One valid payload per kind — distinct ticket ids so a swapped arm shows. */
const PAYLOADS: Record<NotificationKind, () => Record<string, unknown>> = {
  assignment: () => ({
    ticketId: 't-assignment',
    ticketTitle: 'Renew the DLT registration',
    assignedBy: 'user_kiro',
    eventId: 'e1',
    clientTime: CLIENT_TIME,
    serverTime: SERVER_TIME,
  }),
  mention: () => ({
    ticketId: 't-mention',
    ticketTitle: 'File the GST return',
    mentionedBy: 'user_kiro',
    eventId: 'e1',
    source: 'comment',
    excerpt: 'please check the GST filing',
    clientTime: CLIENT_TIME,
    serverTime: SERVER_TIME,
  }),
  'contested-claim': () => ({
    ticketId: 't-contested',
    rule: 'require-evidence',
    reason: 'This move must carry an attachment as evidence, and none was provided.',
    claim: {
      eventId: 'e0',
      type: 'ticket.transitioned',
      actorId: 'user_anselma',
      clientTime: '2026-08-22T18:00:00.000Z',
    },
    contestEventId: 'e1',
    serverTime: '2026-08-23T05:00:00.000Z',
  }),
  'date-approaching': () => ({
    ticketId: 't-date',
    ticketTitle: 'Renew the DLT registration',
    field: 'dueDate',
    claim: {
      date: '2026-08-30',
      actorId: 'user_kiro',
      clientTime: CLIENT_TIME,
      serverTime: SERVER_TIME,
    },
  }),
  'stale-ticket': () => ({
    ticketId: 't-stale',
    ticketTitle: 'Renew the DLT registration',
    stateId: 'doing',
    stateName: 'Doing',
    enteredAt: '2026-08-01T09:00:00.000Z',
    enteredBy: 'user_kiro',
  }),
  'flow-ready': () => ({
    ticketId: 't-flow-ready',
    ticketTitle: 'Write the copy',
    becauseTicketId: 't-source',
    becauseTitle: 'Draft the brief',
    label: null,
    eventId: 'e1',
    clientTime: CLIENT_TIME,
    serverTime: SERVER_TIME,
  }),
  'flow-reopened': () => ({
    ticketId: 't-flow-reopened',
    ticketTitle: 'Review the copy',
    decisionTicketId: 't-decision',
    decisionTitle: 'Ship or redo',
    outcome: 'Redo',
    pass: 2,
    toBacklog: false,
    eventId: 'e1',
    clientTime: CLIENT_TIME,
    serverTime: SERVER_TIME,
  }),
};

let counter = 0;

export type FixtureOverrides = {
  payload?: Record<string, unknown>;
  read?: boolean;
  id?: string;
};

export function notificationOf(
  kind: NotificationKind,
  overrides: FixtureOverrides = {},
): Notification {
  counter += 1;
  return parseNotification({
    id: overrides.id ?? `01J9GN0T${String(counter).padStart(18, '0')}`,
    userId: 'user_anselma',
    workspaceId: 'ws_1',
    kind,
    dedupeKey: `${kind}:${counter}`,
    payload: { ...PAYLOADS[kind](), ...(overrides.payload ?? {}) },
    read: overrides.read ?? false,
    createdAt: '2026-08-23T05:00:00.000Z',
  });
}

/** One of every kind, in the vocabulary's own order. */
export function oneOfEveryKind(): Notification[] {
  return NOTIFICATION_KINDS.map((kind) => notificationOf(kind));
}
