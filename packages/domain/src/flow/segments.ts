import type { TimelineResolution, TimelineSegment } from '../read-models-timeline.js';

export type SegmentInput = {
  /** Work periods as IST days (WP-1, already through `istDayOf`); `end: null` is an open period. */
  periods: readonly { start: string; end: string | null; pass: number }[];
  /** Part 2's `NodePlan.intervals` (`PlannedInterval`, `pruned?: true`) or Part 3's `FlowNodeRead.planned` (`pruned: boolean`) (PL-3, PL-6). */
  planned: readonly { pass: number; start: string; end: string; basis: 'explicit' | 'chained'; pruned?: boolean }[];
  /** Part 2's `FlowNode.notTaken`, or the served resolution (Part 3's wire and the index call the same value `resolution`). */
  notTaken: TimelineResolution;
  /** The IST day of the ticket's close (`TicketState.closed.at` through `istDayOf`), or null when unknown; read only for a never-started Not-taken ticket's stub (TG-10). */
  closedDay: string | null;
  /** The IST day, injected: this module reads no clock. */
  today: string;
};

const ORDER: Record<TimelineSegment['type'], number> = { actual: 0, stub: 1, planned: 2, ghost: 3 };
const later = (a: string, b: string): string => (a > b ? a : b);

/**
 * One ticket's drawable intervals (spec PR-0, TG-3, TG-9, TG-10, PK-3).
 * - actual: each work period; an open one runs to `today` (D-W4-6) and never ends before it starts; a Not-taken ticket keeps them (D-W4-11, TG-10);
 * - planned: each pass's planned interval, unless the ticket is Not taken;
 * - ghost: a pruned branch's planned interval (PL-6), kept on Not-taken tickets so the toggle can show it;
 * - stub: ONE segment on the close day of a Not-taken ticket that never worked (no periods), when the close day is known (TG-10).
 * Sorted by start day, then actual, stub, planned, ghost, then by pass.
 */
export function segmentsFor(input: SegmentInput): TimelineSegment[] {
  const out: TimelineSegment[] = [];
  for (const p of input.periods) {
    out.push({ start: p.start, end: p.end ?? later(p.start, input.today), pass: p.pass, type: 'actual' });
  }
  for (const pl of input.planned) {
    if (pl.pruned === true) out.push({ start: pl.start, end: pl.end, pass: pl.pass, type: 'ghost' });
    else if (input.notTaken === null) out.push({ start: pl.start, end: pl.end, pass: pl.pass, type: 'planned' });
  }
  if (input.notTaken !== null && input.periods.length === 0 && input.closedDay !== null) {
    out.push({ start: input.closedDay, end: input.closedDay, pass: input.notTaken.pass, type: 'stub' });
  }
  return out.sort(
    (a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : ORDER[a.type] - ORDER[b.type] || a.pass - b.pass),
  );
}
