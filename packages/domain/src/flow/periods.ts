import type { TicketState } from '../entity-state.js';
import { BACKLOG_STATE_ID, type StateCategory } from '../workflow.js';
import type { WorkPeriod } from './derive.js';

/** One move as the period fold reads it: where the ticket lands, when (`serverTime`), whether it was terminal, and its round. */
export type PeriodMove = { toStateId: string; toCategory: StateCategory; at: string; wasTerminal: boolean; round: number };

/**
 * WP-1, one move. Returns the SAME array when nothing changes.
 *
 * - A move to Backlog closes the open period (by anyone).
 * - A move into a terminal state closes the open period; with none open, it records a zero-length one, unless the ticket
 *   was already terminal (Done to Cancelled was not newly placed in terminal, so it opens nothing).
 * - A move into an active state opens a period when none is open.
 * - Any other move (between open or active states inside the workflow) changes nothing.
 */
export function foldWorkPeriods(periods: readonly WorkPeriod[], move: PeriodMove): readonly WorkPeriod[] {
  const last = periods[periods.length - 1];
  // The periods with the open one closed at `move.at`, or null when none is open.
  const closed = last !== undefined && last.end === null ? [...periods.slice(0, -1), { ...last, end: move.at }] : null;
  if (move.toStateId === BACKLOG_STATE_ID) return closed ?? periods;
  if (move.toCategory === 'terminal') {
    if (closed !== null) return closed;
    return move.wasTerminal ? periods : [...periods, { start: move.at, end: move.at, pass: move.round }];
  }
  if (move.toCategory === 'active' && closed === null) return [...periods, { start: move.at, end: null, pass: move.round }];
  return periods;
}
/** `periods` ABSENT when empty (typed-links T1's rule for `links`), so the reducer and `rowToTicketState` agree. */
export function setPeriods(state: TicketState, periods: readonly WorkPeriod[]): TicketState {
  if (periods.length > 0) return { ...state, periods: [...periods] };
  const { periods: _none, ...rest } = state;
  return rest;
}
/** ES-4: a pending event has no serverTime, so its fold keeps the confirmed periods. */
export function keepConfirmedPeriods(before: TicketState | undefined, after: TicketState): TicketState {
  return setPeriods(after, before?.periods ?? []);
}
