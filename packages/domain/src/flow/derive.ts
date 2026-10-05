import type { TicketState } from '../entity-state.js';
import { isFlowCause } from './causes.js';

/** One interval of real work (WP-1). `start`/`end` are event `serverTime`s; `pass` is the ticket's round when it opened. */
export type WorkPeriod = { start: string; end: string | null; pass: number };
export type NotTakenResolution = { kind: 'not-taken'; decisionTicketId: string; outcome: string; pass: number };

/** 1 plus the flow resets filed on the ticket (PS-2); absent reads as 1. */
export function ticketRound(s: Pick<TicketState, 'rounds'>): number {
  return s.rounds ?? 1;
}
/** The actual start (ES-4): the first period's start; `null` when the ticket never started. */
export function startedAtOf(s: Pick<TicketState, 'periods'>): string | null {
  return s.periods?.[0]?.start ?? null;
}
/** The actual end (ES-4): the last period's end; `null` while it is open or when there is none. */
export function endedAtOf(s: Pick<TicketState, 'periods'>): string | null {
  const last = s.periods?.[s.periods.length - 1];
  return last === undefined ? null : last.end;
}
/** Decision 19: started means the last period is open. */
export function hasStarted(s: Pick<TicketState, 'periods'>): boolean {
  const last = s.periods?.[s.periods.length - 1];
  return last !== undefined && last.end === null;
}
/** The ONE reading of a close cause as "not taken" (PS-8): a well-formed `branch-not-taken` cause, and nothing else. */
export function notTakenOf(cause: unknown): NotTakenResolution | null {
  if (!isFlowCause(cause) || cause.kind !== 'branch-not-taken') return null;
  return { kind: 'not-taken', decisionTicketId: cause.decisionTicketId, outcome: cause.outcome, pass: cause.pass };
}
/** The ticket's resolution (PS-2): not-taken while its close carries that cause; `null` otherwise, and after a reopen. */
export function resolutionOf(s: Pick<TicketState, 'closed'>): NotTakenResolution | null {
  return notTakenOf(s.closed?.cause);
}
