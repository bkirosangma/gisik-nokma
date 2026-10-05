import { DECISION_TYPE_ID, istDayBounds, istDayOf, newUlid, SYSTEM_ACTOR_AUTO_CLOSE } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { IngestService } from '../ingest/ingest-service.js';
import { isoDatePlusDays } from '../notifications/sweep.js';
import { LIVE_TICKET_WHERE } from '../read/visible-where.js';
import { getWorkspaceSettings } from '../projections/workspace-settings.js';

/**
 * Backlog/closed spec §8.2, second wave 2026-09-18 (Task 8) — close the tickets
 * that have SAT in a terminal state for the workspace's `autoCloseAfterDays`.
 *
 * ## Three things this sweep is, and they are all refusals of a shorter version
 *
 * **1. It reads the clock from the ledger, never from a stored copy.** "When did
 * this ticket enter the state it is in?" is the last `ticket.created` /
 * `ticket.transitioned` event's `server_time`, read through a LATERAL join every
 * run — the same instant `stateProvenanceFor` reads, and the same join
 * `notifications/sweep.ts` uses for staleness. A stored `entered_at` column
 * would be a second copy of a fact the ledger already holds, and the two would
 * drift the first time a transition was written by anything that did not
 * remember to update it.
 *
 * **2. The cutoff is IST-day arithmetic, not elapsed milliseconds.** The
 * threshold is a DAY COUNT (`autoCloseAfterDays`) and the column is a
 * `timestamptz`, so the cut-off day is walked back in day-space and turned into
 * an instant by `istDayBounds`, whose interval is HALF-OPEN: the comparison is a
 * strict `<` against `endUtc`, meaning "entered on or before the cut-off day".
 * `now.getTime() - days * 86_400_000` is what this replaces — it makes a day
 * count mean that many twenty-four-hour spans from whenever the scheduler
 * fired, which drifts with the cron rather than the calendar a person reads.
 * Both clocks in this product are IST by owner decision.
 *
 * **3. It closes THROUGH THE INGEST DOOR, never by writing the projection.** One
 * `ticket.closed` per candidate, `origin: 'server'`, `actorId:
 * SYSTEM_ACTOR_AUTO_CLOSE`, handed to `ingestBatch` — so the engine's own
 * refusals still apply and the ledger records who closed what. A sweep that
 * wrote `proj_tickets` directly would be faster, would report a clean run, and
 * would produce a projection row that no ledger event explains: a ticket closed
 * with nothing in its history saying so, and a table that no longer rebuilds
 * from the ledger. The refusals are therefore COUNTED rather than assumed away —
 * see `refused` below.
 *
 * ## Why the SELECT carries `reopened_at IS NULL` — the clause that decides
 * ## whether Task 7's column earns its existence
 *
 * A ticket reopened yesterday and a ticket nobody has touched for a month are
 * identical on every column this sweep otherwise reads: both terminal, both
 * `closed_at IS NULL`, both old. Without that clause the sweep would re-close a
 * ticket an hour after a person deliberately reopened it — undoing the act, and
 * with no way for them to make it stick. `ticket.reopened` sets the instant and
 * any transition clears it (spec §8.2), so the sweep respects the reopen and
 * still closes the ticket once somebody acts on it again.
 *
 * ## Not here: a `Fence` on the cursor, a per-workspace report, an owner
 *
 * The sweep is idempotent by the ledger, not by a cursor: a ticket it closed no
 * longer satisfies `closed_at IS NULL`, so a second run in the same hour
 * selects nothing. There is nothing to resume and nothing to remember.
 */
export type AutoCloseReport = {
  /** Workspaces whose settings say auto-close is ON — not workspaces examined. */
  workspacesOn: number;
  /** Rows selected across all of them. */
  candidates: number;
  /** Candidates whose `ticket.closed` the door committed. */
  closed: number;
  /** Candidates the door did NOT commit — see the note on the field below. */
  refused: number;
};

/**
 * `now` is injected rather than read, and the sweep takes no threshold: like
 * `notifications/sweep.ts`, there is deliberately no `windows` argument. A test
 * that wants a different window claims it with a `workspace.settings_set` event
 * the way an admin would, so the test and the product cannot disagree about
 * where the number lives.
 *
 * `ingest` is `Pick<IngestService, 'ingestBatch'>` rather than the whole service
 * because this function must reach the INTERNAL door and nothing else: the
 * narrower type is what makes calling `ingestClientBatch` here a compile error
 * rather than a permission bug a reviewer has to notice.
 */
export type AutoCloseDeps = {
  pool: Queryable;
  ingest: Pick<IngestService, 'ingestBatch'>;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
};

/** Ingest's own batch unit is what the door is shaped for; 100 keeps one run's transaction count sane. */
const BATCH_SIZE = 100;

type CandidateRow = { ticket_id: string; workspace_id: string };

/**
 * The default is `console.error`, matching `notifications/sweep.ts:126` — and
 * the first cut of this file defaulted to a NO-OP instead, which is worth
 * keeping as a note because it was wrong in a way that read as harmless.
 *
 * The daemon calls `runAutoCloseSweep({ pool, ingest })` and passes no `log`, so
 * a no-op default meant a refused or invalid close left **no per-ticket trace
 * anywhere in the process**: the reason was discarded while the aggregate count
 * went into the daemon's structured log line. The numbers survived and the
 * *why* did not, which is the worse half to lose. A container's stdout/stderr is
 * where the sibling sweep's per-item problems already go, so this is parity
 * rather than a new channel.
 */
function logOf(deps: AutoCloseDeps): (message: string, error?: unknown) => void {
  return deps.log ?? ((message: string, error?: unknown) => console.error(message, error));
}

/**
 * One run. Reads the world, selects candidates, and hands their closes to the
 * door in batches of {@link BATCH_SIZE}.
 *
 * **`refused` counts every candidate the door did not commit**, not only the
 * engine's `refused` status. An `invalid` answer — a malformed envelope, which
 * could only come from this function building one wrongly — is INCLUDED in the
 * count and logged with its status and code, so it is a number in a report
 * beside the reason rather than a silent subtraction from `candidates`. The
 * house shape for this is `result.status !== 'committed'`
 * (`bootstrap-workspace.ts:137`, `invites/acceptance.ts:210`); the alternative,
 * counting only `'refused'`, would leave an invalid event uncounted and make
 * `closed + refused < candidates` a puzzle instead of a signal.
 *
 * That argument was PROSE until case 13.730's second arm existed: mutating the
 * branch to count only `'refused'` survived every other case, because no case
 * ever fed the sweep an `invalid` result. The arm now does, so the claim has a
 * witness rather than a rationale.
 */
export async function runAutoCloseSweep(deps: AutoCloseDeps): Promise<AutoCloseReport> {
  const log = logOf(deps);
  const report: AutoCloseReport = { workspacesOn: 0, candidates: 0, closed: 0, refused: 0 };

  const now = deps.now === undefined ? new Date() : deps.now();
  const clientTime = now.toISOString();
  // The sweep's "today" is an IST day (owner decision: time is Asia/Kolkata).
  // NOT `clientTime.slice(0, 10)`, for the reason `notifications/sweep.ts:128`
  // already spells out one file over: a UTC slice does not roll over until 05:30
  // IST, so between 18:30Z and midnight every night it names YESTERDAY'S IST day,
  // the cut-off walks one day further back, and every eligible ticket waits
  // until 05:30 to close.
  //
  // **The zone pin in the test file does not protect this**, which is why the
  // warning is here rather than only there: `slice(0, 10)` never consults the
  // process zone, so a file-wide non-India `TZ` gives that mutant no protection
  // at all. The discriminating case is a `now` inside 18:30Z–24:00Z — case
  // 13.727's third arm — because at midday both spellings agree and the case
  // would pass for a reason unrelated to the property it names.
  const todayIst = istDayOf(clientTime);

  // Every workspace that has ever claimed a setting, asked through the canonical
  // reader rather than by reading the column here: `getWorkspaceSettings` is
  // where "NULL means off" is decided, and a sweep that answered that question
  // for itself would be a second place for it to be answered differently. A
  // workspace with NO settings row is not in this list and needs no exclusion —
  // it has claimed nothing, so auto-close is off by the domain's own default.
  const { rows: settingsRows } = await deps.pool.query<{ workspace_id: string }>(
    'SELECT DISTINCT workspace_id FROM proj_workspace_settings',
  );

  const selected: Array<{ ticketId: string; workspaceId: string }> = [];

  for (const { workspace_id: workspaceId } of settingsRows) {
    const settings = await getWorkspaceSettings(deps.pool, workspaceId);
    const days = settings.autoCloseAfterDays;
    if (days === null) continue;
    report.workspacesOn += 1;

    const cutoff = istDayBounds(isoDatePlusDays(todayIst, -days)).endUtc;
    const { rows } = await deps.pool.query<CandidateRow>(
      // `LIMIT 1` over `ORDER BY e.seq DESC` — per-entity `seq`, which is what
      // orders ONE ticket's history (Plan 1's readEntityEvents). It is not a
      // cursor and this sweep never resumes a stream.
      `SELECT t.ticket_id, t.workspace_id
         FROM proj_tickets t
         JOIN LATERAL (
               SELECT e.server_time
                 FROM events e
                WHERE e.entity_kind = 'ticket' AND e.entity_id = t.ticket_id
                  AND e.type IN ('ticket.created', 'ticket.transitioned', 'ticket.published')
                ORDER BY e.seq DESC
                LIMIT 1
             ) entered ON true
        WHERE t.workspace_id = $1
          AND t.state_category = 'terminal'
          AND t.closed_at IS NULL
          AND t.reopened_at IS NULL
          -- A soft-deleted ticket is not swept. The sweep APPENDS a
          -- ticket.closed to the ledger and the ledger is append-only by
          -- trigger, so closing one would be an unfalsifiable mutation against
          -- a ticket that appears in no view — a write nobody can observe, for
          -- a clock ("how long has this sat terminal") that means nothing for a
          -- ticket nobody has. The undo restores a ticket in the state it was
          -- deleted in, which is the state the person left it in, not one a
          -- background job moved it to.
          AND ${LIVE_TICKET_WHERE}
          -- E6-8 (2026-09-21): a parent is not swept while any child is
          -- non-terminal. A republish that promotes a kept state to terminal
          -- puts a parent there over open children without a transition
          -- (publish legality never reads occupancy), and the engine now
          -- refuses to CLOSE it (checks/close.ts,
          -- parent-terminal-with-open-children). This clause mirrors that
          -- predicate so the parent is not a candidate at all — no envelope
          -- built, and no nightly "refused" for a world that did not move,
          -- which is the only reading the refusal log below is written for.
          -- The child's deleted_at is deliberately NOT consulted, because
          -- the engine's getChildrenStates does not consult it either
          -- (engine-context.ts): the two must answer alike, and E6-4
          -- (soft-deleted children) is the change that moves them together.
          -- A DRAFT child is not open work (drafts spec): it is private to
          -- its author and the engine's close.ts and transition.ts do not
          -- count it, so this sub-select must not either.
          AND NOT EXISTS (
                SELECT 1 FROM proj_tickets c
                 WHERE c.parent_id = t.ticket_id
                   AND c.state_category <> 'terminal'
                   AND c.draft_author_id IS NULL
              )
          -- DC-5 (wtg2 T6): a Decision with branches and no outcome is not a
          -- candidate. checks/decision.ts refuses its close, and a republish can
          -- leave one terminal with no transition (as for the child guard
          -- above); clearing a terminal Decision's outcome is allowed too. Read
          -- from t.links, the column the engine's TicketState.links comes from,
          -- so the two cannot disagree after a rebuild. A draft-side entry
          -- (with "from") never sits on a swept row: drafts are not candidates
          -- (LIVE_TICKET_WHERE) and publishing drops those entries.
          AND NOT (
                t.type_id = $3
            AND t.outcome IS NULL
            AND EXISTS (SELECT 1 FROM jsonb_array_elements(t.links) AS l WHERE l ->> 'kind' = 'leads_to')
          )
          AND entered.server_time < $2
        ORDER BY t.ticket_id`,
      [workspaceId, cutoff, DECISION_TYPE_ID],
    );
    report.candidates += rows.length;
    for (const row of rows) selected.push({ ticketId: row.ticket_id, workspaceId: row.workspace_id });
  }

  for (let start = 0; start < selected.length; start += BATCH_SIZE) {
    const batch = selected.slice(start, start + BATCH_SIZE);
    const events = batch.map(({ ticketId, workspaceId }) => ({
      id: newUlid(),
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.closed',
      version: 1,
      payload: {},
      // The reserved actor, and the reason it is a ULID: `submittedEventSchema`
      // requires it of `actorId`, so a readable sentinel would be refused at
      // this very door and every auto-close would come back `invalid`.
      actorId: SYSTEM_ACTOR_AUTO_CLOSE,
      // The SERVER is what recorded this, which is a different question from who
      // is responsible for it — that is the point of the reserved actor beside
      // it. (`invites/acceptance.ts` is the other place the two visibly diverge.)
      origin: 'server',
      clientTime,
    }));

    const results = await deps.ingest.ingestBatch(events);
    for (const [index, result] of results.entries()) {
      if (result.status === 'committed') {
        report.closed += 1;
        continue;
      }
      report.refused += 1;
      const ticketId = batch[index]?.ticketId ?? 'unknown';
      if (result.status === 'refused') {
        // An expected outcome, and not an alarm: the world moved between this
        // sweep's SELECT and its close (somebody transitioned the ticket out of
        // its terminal state), and the engine said so. The ticket stays open,
        // which is the correct answer.
        log(`auto-close refused for ticket ${ticketId}: ${result.rule} — ${result.reason}`);
      } else {
        // The OTHER direction, and it is a defect rather than a decision: this
        // function built an envelope the door could not read. Logged with the
        // error so it reaches the alerter the daemon wires up.
        log(
          `auto-close produced an INVALID envelope for ticket ${ticketId}: ${result.code} — ${result.message}`,
          result,
        );
      }
    }
  }

  return report;
}
