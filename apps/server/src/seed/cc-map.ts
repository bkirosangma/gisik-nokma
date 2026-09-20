import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { CcItem } from './cc-board.js';
import { seedDescriptionDoc, type SeedTextPart } from './doc-text.js';
import { seedUlid } from './seed-ulid.js';
import { TRACKER_STATE_TO_ERRAND_STATE } from './templates.js';

export type CcMapContext = {
  workspaceId: string;
  projectId: string;
  ownerUserId: string;
  errandTypeId: string;
  epicTicketIds: Record<'registrations' | 'questions', string>;
  initialStateId: string;
  week1: string;
  titleById: Map<string, string>;
  clientTime: string;
};

/** build_tracker.py line 390: week_end = week1 + timedelta(days=7*nw - 1).
 * The tracker's own published week arithmetic — derived, not invented. */
export function neededWeekEnd(week1: string, neededWeek: number): string {
  const date = new Date(`${week1}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7 * neededWeek - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * The machine-ish half of a description: the tracker's own fields, one
 * `key: value` line each. Everything the record says, verbatim, in reading
 * order. Only lines whose source field exists are emitted — absence stays
 * absent.
 *
 * ⚠ THIS IS THE `literal` PART, AND IT IS SEPARATE FROM THE PROSE ON PURPOSE.
 * It is `key: value` lines a reader scans, not prose, and a markdown parser run
 * over it would read a `-` or a `1.` at the head of a note as a list nobody
 * wrote. Measured: no line here starts with a block marker in the shipped
 * corpus, so nothing is broken today — the split exists so that stays true when
 * a note changes, rather than depending on it.
 */
export function errandRecordText(item: CcItem, titleById: Map<string, string>): string {
  const lines: string[] = ['— tracker record —'];
  lines.push(`tracker id: ${item.id}`);
  lines.push(`origin: ${item.origin_file}`);
  if (item.meta.counterparty) lines.push(`counterparty: ${item.meta.counterparty}`);
  if (item.meta.who) lines.push(`who: ${item.meta.who}`);
  if (item.meta.cost) lines.push(`cost: ${item.meta.cost}`);
  if (item.meta.lead_time) lines.push(`lead time: ${item.meta.lead_time}`);
  const weeks: string[] = [];
  if (item.meta.clears_week !== undefined) weeks.push(`clears week ${item.meta.clears_week}`);
  if (item.meta.needed_week !== undefined) weeks.push(`needed week ${item.meta.needed_week}`);
  if (item.meta.slack !== undefined) weeks.push(`slack ${item.meta.slack}`);
  if (weeks.length > 0) lines.push(weeks.join(' · '));
  if (item.blocked_by) {
    const blockerTitle = titleById.get(item.blocked_by) ?? item.blocked_by;
    lines.push(`blocked by: ${blockerTitle} (tracker id ${item.blocked_by})`);
  }
  if (item.note) lines.push(`tracker note: ${item.note}`);
  const attention: string[] = [];
  if (item.start) attention.push(`start ${item.start}`);
  if (item.due) attention.push(`due ${item.due}`);
  if (item.since) attention.push(`since ${item.since}`);
  if (attention.length > 0) {
    lines.push(`tracker attention schedule (authored in board.json, not origin truth): ${attention.join(' · ')}`);
  }
  return lines.join('\n');
}

/**
 * The parts of an errand description, in reading order. `markdown` for the
 * record's own prose — the item's body and its quoted ask, both of which the
 * tracker's authors wrote with `##`, `-`, `1.`, `**`, `*`, `` ` `` and
 * `[text](url)` — and `literal` for the record block above. Which part is which
 * is decided HERE, by the code that writes the lines, never by inspecting them.
 */
export function errandDescriptionParts(item: CcItem, titleById: Map<string, string>): SeedTextPart[] {
  const parts: SeedTextPart[] = [
    { kind: 'markdown', text: item.body.trimEnd() },
    { kind: 'literal', text: errandRecordText(item, titleById) },
  ];
  if (item.ask_text) {
    parts.push({
      kind: 'markdown',
      text: `ask (verbatim, as drafted in the record):\n${item.ask_text.trimEnd()}`,
    });
  }
  return parts;
}

export function buildErrandEvents(item: CcItem, ctx: CcMapContext): SubmittedEvent[] {
  const ticketId = seedUlid('ticket', `cc#${item.id}`);
  const events: SubmittedEvent[] = [];
  const push = (suffix: string, type: string, payload: unknown): void => {
    events.push({
      id: seedUlid('event', `cc#${item.id}#${suffix}`),
      workspaceId: ctx.workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type,
      version: 1,
      payload,
      actorId: ctx.ownerUserId,
      origin: 'server',
      clientTime: ctx.clientTime,
    });
  };

  const epic = item.epic as 'registrations' | 'questions';
  push('created', 'ticket.created', {
    typeId: ctx.errandTypeId,
    projectId: ctx.projectId,
    parentId: ctx.epicTicketIds[epic],
    title: item.title,
  });
  push('description', 'ticket.field_set', {
    fieldId: 'description',
    value: seedDescriptionDoc(errandDescriptionParts(item, ctx.titleById)),
  });

  const counterparty = item.meta.counterparty ?? item.meta.who;
  if (counterparty) {
    push('counterparty', 'ticket.field_set', { fieldId: 'counterparty', value: counterparty });
  }

  // Dates: ONLY what the record dates (spec §1 invariant 4).
  //
  // `startDate` is a BUILT-IN field (ticket-types.ts BUILTIN_FIELD_IDS) and its
  // value shape is `dueDateValueSchema` — `{date, note?}`, the SAME shape as
  // dueDate, never a bare string. The record's own `started` is the date; there
  // is no note because the record offers no gloss on it, and inventing one
  // would be the seed speaking where the record is silent.
  if (item.started) {
    push('startDate', 'ticket.field_set', { fieldId: 'startDate', value: { date: item.started } });
  }
  const neededWeekRaw = item.meta.needed_week;
  if (neededWeekRaw !== undefined && /^\d+$/.test(String(neededWeekRaw))) {
    const neededWeek = Number(neededWeekRaw);
    push('dueDate', 'ticket.field_set', {
      fieldId: 'dueDate',
      value: {
        date: neededWeekEnd(ctx.week1, neededWeek),
        note: `from the tracker record — first needed in week ${neededWeek}`,
      },
    });
  }

  if (item.state === 'done' || item.done) {
    throw new Error(
      `${item.id} is 'done' in the tracker — the seed never emits a terminal claim; close it in the product, with the comment the workflow demands.`,
    );
  }
  const toStateId = TRACKER_STATE_TO_ERRAND_STATE[item.state];
  if (toStateId === undefined) {
    throw new Error(`${item.id} has tracker state '${item.state}' which has no mapping — refusing to guess.`);
  }
  if (toStateId !== ctx.initialStateId) {
    // The payload key is `to` — `ticketTransitionedPayloadSchema` (workflow.ts)
    // is `{to, comment?, evidenceAttachmentId?, cause?}`. A `toStateId` key here
    // would parse as an unknown extra and leave `to` missing, and the engine
    // would refuse the seed's own event at ingest.
    push('transition', 'ticket.transitioned', { to: toStateId });
  }
  return events;
}
