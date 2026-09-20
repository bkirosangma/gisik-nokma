import { docToPlainText } from '@gisik-nokma/domain';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { errandItems, readCcBoard, type CcItem } from '../../src/seed/cc-board.js';
import { buildErrandEvents, errandDescriptionParts, neededWeekEnd, type CcMapContext } from '../../src/seed/cc-map.js';
import { seedUlid } from '../../src/seed/seed-ulid.js';
import { plainTextDoc, seedDescriptionDoc } from '../../src/seed/doc-text.js';

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

/**
 * The description as the single string the record holds, rebuilt from the parts.
 * `errandDescriptionText` used to exist for this and was removed with the split:
 * it had no production caller left, and a test-only export is a name that lives
 * nowhere. Parts are joined with a blank line, which is the separator
 * `seedDescriptionDoc` writes between them.
 */
const recordTextOf = (id: string): string =>
  errandDescriptionParts(byId(id), titleById)
    .map((part) => part.text)
    .join('\n\n');

/**
 * 13.64 — neededWeekEnd reproduces the tracker generator's own week
 * arithmetic (build_tracker.py:390) at weeks 0, 1, 7, 28.
 */
describe('neededWeekEnd — the tracker generator’s own arithmetic (build_tracker.py:390)', () => {
  it('week 1 ends 2026-08-24', () => expect(neededWeekEnd('2026-08-18', 1)).toBe('2026-08-24'));
  it('week 7 ends 2026-10-05', () => expect(neededWeekEnd('2026-08-18', 7)).toBe('2026-10-05'));
  it('week 28 ends 2027-03-01', () => expect(neededWeekEnd('2026-08-18', 28)).toBe('2027-03-01'));
  it('week 0 ends 2026-08-17 — the day before week 1, exactly as the record’s arithmetic says', () =>
    expect(neededWeekEnd('2026-08-18', 0)).toBe('2026-08-17'));
});

describe('invariant 4 — a record without a date stays undated', () => {
  /**
   * 13.65 — invariant 4: an item with no asked/submitted date gets no
   * startDate claim.
   */
  it('an item with no asked/submitted date gets NO startDate claim (ops:owner-github-plan)', () => {
    expect(fieldSet(eventsFor('ops:owner-github-plan'), 'startDate')).toBeUndefined();
  });

  /**
   * 13.66 — invariant 4, the record's own natural planted defect: ops:duns
   * carries an attention `since` but no origin `started` — no startDate
   * claim.
   */
  it('planted defect from the record itself: ops:duns carries an attention `since` but no origin `started` — NO startDate claim', () => {
    const duns = byId('ops:duns');
    expect(duns.since).toBeDefined();
    expect(duns.started).toBeUndefined();
    expect(fieldSet(eventsFor('ops:duns'), 'startDate')).toBeUndefined();
  });

  /**
   * 13.67 — the one origin-dated item (ops:accountant-hsn-digits) gets its
   * startDate claim verbatim, shaped {date, note?}.
   */
  it('the one origin-dated item gets its startDate verbatim (ops:accountant-hsn-digits, asked 2026-08-18)', () => {
    const claim = fieldSet(eventsFor('ops:accountant-hsn-digits'), 'startDate');
    expect(claim).toBeDefined();
    // startDate is a BUILT-IN field whose value shape is dueDateValueSchema —
    // {date, note?}, never a bare string (packages/domain/src/ticket-types.ts).
    expect((claim?.payload as { value: { date: string } }).value.date).toBe('2026-08-18');
  });

  /**
   * 13.68 — planted defect: stripping needed_week removes the dueDate
   * claim.
   */
  it('planted defect: strip needed_week from a copy and the dueDate claim disappears', () => {
    const original = byId('ops:accountant-hsn-digits');
    const stripped: CcItem = { ...original, meta: { ...original.meta, needed_week: undefined } };
    expect(fieldSet(buildErrandEvents(stripped, ctx), 'dueDate')).toBeUndefined();
  });

  /**
   * 13.69 — needed_week becomes a dueDate claim carrying the derivation in
   * its note.
   */
  it('needed_week becomes a dueDate claim carrying the derivation in its note', () => {
    const claim = fieldSet(eventsFor('ops:accountant-hsn-digits'), 'dueDate');
    const value = claim?.payload as { value: { date: string; note: string } };
    expect(value.value.date).toBe('2026-10-05'); // needed_week 7
    expect(value.value.note).toBe('from the tracker record — first needed in week 7');
  });
});

describe('statuses map without invention', () => {
  /**
   * 13.70 — statuses map without invention: `next` maps correctly (this
   * test), and a `later` item emits no transition while `blocked` maps to
   * `waiting` (the two tests below) — one row, three tests.
   */
  it('a `next` item transitions once, from initial, to next', () => {
    const events = eventsFor('ops:dlt-entity');
    const transitions = events.filter((event) => event.type === 'ticket.transitioned');
    expect(transitions).toHaveLength(1);
    // The payload key is `to` — ticketTransitionedPayloadSchema (workflow.ts).
    expect((transitions[0]?.payload as { to: string }).to).toBe('next');
  });

  /**
   * 13.70 — statuses map without invention: a `later` item emits no
   * transition (part of the same row as the `next`/`blocked` tests above
   * and below).
   */
  it('a `later` item emits NO transition — it sits in the initial state', () => {
    const events = eventsFor('ops:sms-header');
    expect(events.filter((event) => event.type === 'ticket.transitioned')).toHaveLength(0);
  });

  /**
   * 13.70 — statuses map without invention: `blocked` maps to `waiting`
   * (part of the same row as the `next`/`later` tests above).
   */
  it('a `blocked` item maps to waiting (ops:apple-developer)', () => {
    const events = eventsFor('ops:apple-developer');
    const transition = events.find((event) => event.type === 'ticket.transitioned');
    expect((transition?.payload as { to: string }).to).toBe('waiting');
  });

  /**
   * 13.71 — planted defect: a done item is refused — the seed never claims
   * completion on anyone's behalf.
   */
  it('planted defect: a done item is refused — the seed never claims completion on anyone’s behalf', () => {
    const original = byId('ops:sms-header');
    expect(() => buildErrandEvents({ ...original, state: 'done', done: true }, ctx)).toThrowError(/terminal/);
  });

  /**
   * 13.72 — planted defect: done: true against a stale non-done state
   * string is still refused — the flag is checked, not just the state
   * string.
   */
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

  /**
   * 13.73 — planted defect: an unknown tracker state is refused, never
   * guessed.
   */
  it('planted defect: an unknown state is refused, never guessed', () => {
    const original = byId('ops:sms-header');
    expect(() => buildErrandEvents({ ...original, state: 'someday' }, ctx)).toThrowError(/someday/);
  });
});

describe('the body carries the record verbatim', () => {
  /**
   * 13.74 — the body carries the record verbatim: tracker id, origin,
   * attention schedule (this test); counterparty/who and ask text, and
   * blocked-by resolved to the blocking item's human title (the two tests
   * below) — one row, three tests.
   */
  it('body text, counterparty, ask text and attention schedule are all present and literal', () => {
    const text = recordTextOf('ops:duns');
    expect(text).toContain('tracker id: ops:duns');
    expect(text).toContain('origin: operations/registrations/duns.md');
    expect(text).toContain('counterparty: Dun & Bradstreet');
    expect(text).toContain('tracker attention schedule (authored in board.json, not origin truth):');
    expect(text).toContain('since 2026-08-19');
  });

  /**
   * 13.74 — the body carries the record verbatim: counterparty/who and ask
   * text (part of the same row as the tests above and below).
   */
  it('a question’s who and ask ride along (ops:accountant-cloud-gst)', () => {
    const text = recordTextOf('ops:accountant-cloud-gst');
    expect(text).toContain('who: Accountant');
    expect(text).toContain('ask (verbatim, as drafted in the record):');
    expect(text).toContain('reverse charge');
  });

  /**
   * 13.74 — the body carries the record verbatim: blocked-by resolved to
   * the blocking item's human title (part of the same row as the two
   * tests above).
   */
  it('blocked_by resolves to the blocking item’s human title', () => {
    const text = recordTextOf('ops:apple-developer');
    expect(text).toContain('blocked by: Can the proprietorship enrol as an organisation');
    expect(text).toContain('(tracker id ops:owner-store-account-entity)');
  });

  /**
   * 13.75 — REVERSED 2026-09-20, flipped rather than deleted. Until the owner's
   * ruling (*"both"*) this case asserted the doc carried `**Gates:**` with its
   * asterisks — the truth about a renderer that parsed nothing. It now asserts
   * the other side of the reversal, and asserts it in TWO directions so a
   * "parser" that simply DELETED the asterisks cannot pass: the text lost them,
   * and a bold mark took their place.
   */
  it('the description event carries a PARSED doc: the asterisks are gone and a bold mark has them', () => {
    const claim = fieldSet(eventsFor('ops:dlt-entity'), 'description');
    const value = (claim?.payload as { value: unknown }).value;
    const text = docToPlainText(value);

    expect(text).toContain('Gates: every SMS the platform will ever send');
    expect(text).not.toContain('**');

    const marks: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const candidate = node as { marks?: Array<{ type: string }>; content?: unknown[] };
      for (const mark of candidate.marks ?? []) marks.push(mark.type);
      if (Array.isArray(candidate.content)) candidate.content.forEach(walk);
    };
    walk(value);
    expect(marks).toContain('bold');
  });

  /**
   * ⚠ THE SPLIT, ASSERTED AT THE EVENT AND NOT ONLY AT THE BUILDER — because this is
   * the doc the ledger stores, and the property that matters is about THAT. The
   * record block rides through the same builder and must arrive with its
   * characters intact, while the prose around it is parsed. Both halves in one
   * case, so a change that parsed everything or parsed nothing fails here.
   */
  it('the same doc keeps the record block LITERAL while the prose around it is parsed', () => {
    const claim = fieldSet(eventsFor('ops:accountant-cloud-gst'), 'description');
    const value = (claim?.payload as { value: unknown }).value;
    const text = docToPlainText(value);

    expect(text).toContain('— tracker record —');
    expect(text).toContain('tracker id: ops:accountant-cloud-gst');
    expect(text).toContain('tracker attention schedule (authored in board.json, not origin truth): start 2026-08-19 · due 2026-08-20');
    // The ask is prose and IS parsed: its numbered questions become a list, and
    // the markdown the authors typed does not survive as characters.
    expect(text).not.toContain('**');
  });

  /**
   * 16.78 — a description is split into markdown PROSE and a LITERAL record block by
   * construction, never by inspecting the text; a record note that looks like a
   * list stays characters.
   *
   * ⛔ THE CASE THE SPLIT EXISTS FOR, and the one that makes the two above fail
   * rather than pass by luck. **No RECORD line starts with a markdown BLOCK marker**
   * — measured over all 172 of them, zero — so on real data alone a builder that
   * parsed the whole string would look identical to one that split it, and the
   * property would be untested decoration. A record note is free text the
   * tracker's authors write, so this item is a shape the record can really take.
   *
   * ⚠ **THE SCOPE WORD IS "RECORD", NOT "CORPUS", AND AN INDEPENDENT REVIEW CAUGHT THE
   * DIFFERENCE**: 64 PROSE lines in the shipped corpus DO start with a block
   * marker (headings, bullets and numbered items — the constructs this parser is
   * FOR). Narrowing the claim to the record block is what makes it true, and the
   * record block is the only place the split has to hold.
   *
   * The control is IN THE SAME `it()`: the same two lines through the markdown
   * renderer do become a list, so this case cannot pass by the renderer being
   * broken or by the note never reaching a renderer at all.
   */
  it('a record note that LOOKS like a list stays literal, because the split is by construction', () => {
    const item = { ...byId('ops:duns'), note: '- first thing\n- second thing' };
    const parts = errandDescriptionParts(item, titleById);

    expect(parts.find((part) => part.kind === 'literal')?.text).toContain('- first thing');

    const types = (seedDescriptionDoc(parts).content as Array<{ type: string }>).map((block) => block.type);
    expect(types).not.toContain('bulletList');

    const throughMarkdown = (plainTextDoc('- first thing\n- second thing').content as Array<{ type: string }>).map(
      (block) => block.type,
    );
    expect(throughMarkdown).toEqual(['bulletList']);
  });
});

/**
 * 13.76 — determinism: two builds of the same item are identical id-for-id;
 * every event id is namespaced to the item so a re-snapshot cannot collide.
 */
describe('determinism — the idempotence substrate', () => {
  it('two builds of the same item are identical, id for id', () => {
    expect(eventsFor('ops:duns')).toEqual(eventsFor('ops:duns'));
  });

  it('every event id is namespaced to the item so re-snapshotting cannot collide', () => {
    const created = eventsFor('ops:duns').find((event) => event.type === 'ticket.created');
    expect(created?.id).toBe(seedUlid('event', 'cc#ops:duns#created'));
  });
});
