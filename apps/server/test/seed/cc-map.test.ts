import { docToPlainText } from '@gisik-nokma/domain';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { errandItems, readCcBoard, type CcItem } from '../../src/seed/cc-board.js';
import { buildErrandEvents, errandDescriptionText, neededWeekEnd, type CcMapContext } from '../../src/seed/cc-map.js';
import { seedUlid } from '../../src/seed/seed-ulid.js';

const boardPath = new URL('../../../../reference/convenience-corner-tracker/board.data.js', import.meta.url).pathname;
const board = readCcBoard(boardPath);
const errands = errandItems(board);
const titleById = new Map(board.items.map((item) => [item.id, item.title]));
const byId = (id: string): CcItem => {
  const item = errands.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`snapshot is missing ${id} — has reference/ been re-snapshotted?`);
  return item;
};

const ctx: CcMapContext = {
  workspaceId: seedUlid('workspace', 'convenience-corner'),
  projectId: seedUlid('project', 'cc#shop-operations'),
  ownerUserId: seedUlid('user', 'test-owner'),
  errandTypeId: 'errand',
  epicTicketIds: {
    registrations: seedUlid('ticket', 'cc#epic#registrations'),
    questions: seedUlid('ticket', 'cc#epic#questions'),
  },
  initialStateId: 'later',
  week1: board.week1,
  titleById,
  clientTime: '2026-08-20T12:00:00.000Z',
};

const eventsFor = (id: string): SubmittedEvent[] => buildErrandEvents(byId(id), ctx);
const fieldSet = (events: SubmittedEvent[], fieldId: string): SubmittedEvent | undefined =>
  events.find((event) => event.type === 'ticket.field_set' && (event.payload as { fieldId: string }).fieldId === fieldId);

describe('neededWeekEnd — the tracker generator’s own arithmetic (build_tracker.py:390)', () => {
  it('week 1 ends 2026-08-24', () => expect(neededWeekEnd('2026-08-18', 1)).toBe('2026-08-24'));
  it('week 7 ends 2026-10-05', () => expect(neededWeekEnd('2026-08-18', 7)).toBe('2026-10-05'));
  it('week 28 ends 2027-03-01', () => expect(neededWeekEnd('2026-08-18', 28)).toBe('2027-03-01'));
  it('week 0 ends 2026-08-17 — the day before week 1, exactly as the record’s arithmetic says', () =>
    expect(neededWeekEnd('2026-08-18', 0)).toBe('2026-08-17'));
});

describe('invariant 4 — a record without a date stays undated', () => {
  it('an item with no asked/submitted date gets NO startDate claim (ops:owner-github-plan)', () => {
    expect(fieldSet(eventsFor('ops:owner-github-plan'), 'startDate')).toBeUndefined();
  });

  it('planted defect from the record itself: ops:duns carries an attention `since` but no origin `started` — NO startDate claim', () => {
    const duns = byId('ops:duns');
    expect(duns.since).toBeDefined();
    expect(duns.started).toBeUndefined();
    expect(fieldSet(eventsFor('ops:duns'), 'startDate')).toBeUndefined();
  });

  it('the one origin-dated item gets its startDate verbatim (ops:accountant-hsn-digits, asked 2026-08-18)', () => {
    const claim = fieldSet(eventsFor('ops:accountant-hsn-digits'), 'startDate');
    expect(claim).toBeDefined();
    // startDate is a BUILT-IN field whose value shape is dueDateValueSchema —
    // {date, note?}, never a bare string (packages/domain/src/ticket-types.ts).
    expect((claim?.payload as { value: { date: string } }).value.date).toBe('2026-08-18');
  });

  it('planted defect: strip needed_week from a copy and the dueDate claim disappears', () => {
    const original = byId('ops:accountant-hsn-digits');
    const stripped: CcItem = { ...original, meta: { ...original.meta, needed_week: undefined } };
    expect(fieldSet(buildErrandEvents(stripped, ctx), 'dueDate')).toBeUndefined();
  });

  it('needed_week becomes a dueDate claim carrying the derivation in its note', () => {
    const claim = fieldSet(eventsFor('ops:accountant-hsn-digits'), 'dueDate');
    const value = claim?.payload as { value: { date: string; note: string } };
    expect(value.value.date).toBe('2026-10-05'); // needed_week 7
    expect(value.value.note).toBe('from the tracker record — first needed in week 7');
  });
});

describe('statuses map without invention', () => {
  it('a `next` item transitions once, from initial, to next', () => {
    const events = eventsFor('ops:dlt-entity');
    const transitions = events.filter((event) => event.type === 'ticket.transitioned');
    expect(transitions).toHaveLength(1);
    // The payload key is `to` — ticketTransitionedPayloadSchema (workflow.ts).
    expect((transitions[0]?.payload as { to: string }).to).toBe('next');
  });

  it('a `later` item emits NO transition — it sits in the initial state', () => {
    const events = eventsFor('ops:sms-header');
    expect(events.filter((event) => event.type === 'ticket.transitioned')).toHaveLength(0);
  });

  it('a `blocked` item maps to waiting (ops:apple-developer)', () => {
    const events = eventsFor('ops:apple-developer');
    const transition = events.find((event) => event.type === 'ticket.transitioned');
    expect((transition?.payload as { to: string }).to).toBe('waiting');
  });

  it('planted defect: a done item is refused — the seed never claims completion on anyone’s behalf', () => {
    const original = byId('ops:sms-header');
    expect(() => buildErrandEvents({ ...original, state: 'done', done: true }, ctx)).toThrowError(/terminal/);
  });

  it('planted defect: done:true with a stale non-done state is still refused — the flag is checked, not just the state string', () => {
    // A re-snapshot could in principle carry done:true against a lagging state
    // string (0 of 191 items in snapshot 24e2240 disagree, but the refusal
    // must not rely on that holding forever). Without the `|| item.done` guard
    // in buildErrandEvents, this case reads item.state ('next') as live and
    // slips a completed item through as an open errand — exactly the
    // terminal claim the refusal exists to prevent.
    const original = byId('ops:sms-header');
    expect(() => buildErrandEvents({ ...original, state: 'next', done: true }, ctx)).toThrowError(/terminal/);
  });

  it('planted defect: an unknown state is refused, never guessed', () => {
    const original = byId('ops:sms-header');
    expect(() => buildErrandEvents({ ...original, state: 'someday' }, ctx)).toThrowError(/someday/);
  });
});

describe('the body carries the record verbatim', () => {
  it('body text, counterparty, ask text and attention schedule are all present and literal', () => {
    const text = errandDescriptionText(byId('ops:duns'), titleById);
    expect(text).toContain('tracker id: ops:duns');
    expect(text).toContain('origin: operations/registrations/duns.md');
    expect(text).toContain('counterparty: Dun & Bradstreet');
    expect(text).toContain('tracker attention schedule (authored in board.json, not origin truth):');
    expect(text).toContain('since 2026-08-19');
  });

  it('a question’s who and ask ride along (ops:accountant-cloud-gst)', () => {
    const text = errandDescriptionText(byId('ops:accountant-cloud-gst'), titleById);
    expect(text).toContain('who: Accountant');
    expect(text).toContain('ask (verbatim, as drafted in the record):');
    expect(text).toContain('reverse charge');
  });

  it('blocked_by resolves to the blocking item’s human title', () => {
    const text = errandDescriptionText(byId('ops:apple-developer'), titleById);
    expect(text).toContain('blocked by: Can the proprietorship enrol as an organisation');
    expect(text).toContain('(tracker id ops:owner-store-account-entity)');
  });

  it('the description event carries the text as a literal-text doc', () => {
    const claim = fieldSet(eventsFor('ops:dlt-entity'), 'description');
    const text = docToPlainText((claim?.payload as { value: unknown }).value);
    expect(text).toContain('**Gates:** every SMS the platform will ever send');
  });
});

describe('determinism — the idempotence substrate', () => {
  it('two builds of the same item are identical, id for id', () => {
    expect(eventsFor('ops:duns')).toEqual(eventsFor('ops:duns'));
  });

  it('every event id is namespaced to the item so re-snapshotting cannot collide', () => {
    const created = eventsFor('ops:duns').find((event) => event.type === 'ticket.created');
    expect(created?.id).toBe(seedUlid('event', 'cc#ops:duns#created'));
  });
});
