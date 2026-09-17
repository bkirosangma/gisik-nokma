import {
  dateClaimProvenanceSchema,
  istDayBounds,
  istDayOf,
  newUlid,
  statesWithBacklog,
  type Notification,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getWorkflowDefFromProjection } from '../projections/workflows.js';
import { getWorkspaceSettings } from '../projections/workspace-settings.js';
import { canSee } from '../visibility/can-see.js';
import { deliverToAll, type NotificationTransport } from './transport.js';
import type { CanSeeFn } from './fanout.js';

/**
 * The two windows one sweep run uses for one workspace, already RESOLVED.
 *
 * This type is a shape, not a place where numbers live. Both values come from
 * the workspace's settings and from nowhere else; there is no default at this
 * type, and deliberately no threshold constant anywhere in this file. Spec
 * §7 calls both thresholds workspace-set, and they are: Plan 5's
 * `workspace.settings_set` claim is the single origin, projected into
 * `proj_workspace_settings` and read back by `getWorkspaceSettings`.
 */
export type SweepWindows = { approachingWindowDays: number; stalenessThresholdDays: number };

/**
 * The mapping between the sweep's vocabulary and the workspace's settings,
 * written down exactly once:
 *
 *   approaching window  <-  dueSoonDays
 *   staleness threshold <-  staleDays
 *
 * They are the same two questions the read-time attention strip asks ("is this
 * due soon?", "has this sat too long?"), so they must be the same two numbers.
 * When they were two sets of numbers, a board could flag a ticket stale while
 * the sweep stayed silent for another week, and an admin moving the setting
 * moved one of them — the exact drift this product exists to remove.
 *
 * `getWorkspaceSettings` applies `DEFAULT_STALE_DAYS`/`DEFAULT_DUE_SOON_DAYS`
 * for a workspace that never claimed either, so an unclaimed workspace and the
 * attention strip agree by construction rather than by coincidence.
 */
export async function resolveSweepWindows(db: Queryable, workspaceId: string): Promise<SweepWindows> {
  const settings = await getWorkspaceSettings(db, workspaceId);
  return {
    approachingWindowDays: settings.dueSoonDays,
    stalenessThresholdDays: settings.staleDays,
  };
}

/**
 * Note the absence of a `windows` key. There is no threshold to inject: an
 * override parameter would be a second way to set the number, and a second way
 * to set the number is a second number. Tests that need particular windows
 * claim them with a `workspace.settings_set` event, the way an admin does.
 *
 * DEVIATION FROM PLAN 9 TASK 6's declared signature, recorded deliberately and
 * identically to Task 5's: the plan writes `pool: Pool`. It is `Queryable`
 * (`Pool | PoolClient`) here, because every function it composes with —
 * `getWorkspaceSettings`, `canSee`, `insertNotification` behind the in-app
 * transport — already takes `Queryable`, and because `app.ts` holds its handle
 * as `AppDeps['pool']: Queryable`. This is a WIDENING: a `Pool` is assignable
 * to `Queryable`, so the CLI and every test the plan anticipated still compile.
 */
export type SweepDeps = {
  pool: Queryable;
  transports: NotificationTransport[];
  canSeeTicket?: CanSeeFn;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
};

export type SweepReport = { dueCandidates: number; staleCandidates: number; delivered: number };

/**
 * Calendar-day arithmetic over `YYYY-MM-DD`: `days` IST days after `isoDay`,
 * negative walking backwards.
 *
 * It goes through `istDayBounds` and `istDayOf` rather than doing its own
 * `Date.UTC` field arithmetic (which the plan text wrote) for a reason beyond
 * tidiness: `apps/server/src/routes/attention.ts` computes the READ-TIME strip
 * with exactly this round-trip in its private `addIstDays`, and Task 6 exists
 * to guarantee the strip and the sweep answer the same question the same way.
 * Two implementations of one calendar are two calendars. It also inherits
 * `istDayBounds`'s refusal of days that do not exist (`2026-02-30`, `0099-…`)
 * instead of silently rolling them into a different month.
 *
 * India has no daylight saving — the offset is fixed by law — so stepping whole
 * 24-hour spans from one IST midnight lands exactly on another IST midnight.
 * That is a property of IST, stated in `packages/domain/src/ist-day.ts`, not an
 * assumption about the machine: nothing here reads the local zone, so the
 * answer is the same in Kolkata, Kiritimati and Niue.
 */
const MS_PER_IST_DAY = 86_400_000;

export function isoDatePlusDays(isoDay: string, days: number): string {
  return istDayOf(
    new Date(Date.parse(istDayBounds(isoDay).startUtc) + days * MS_PER_IST_DAY).toISOString(),
  );
}

type DueRow = {
  ticket_id: string;
  workspace_id: string;
  assignee_id: string | null;
  title: string | null;
  due_claim: unknown;
};

type StaleRow = {
  ticket_id: string;
  workspace_id: string;
  assignee_id: string | null;
  state_id: string;
  workflow_id: string;
  title: string | null;
  entered_at: Date;
  entered_by: string;
};

export async function runNotificationSweep(deps: SweepDeps): Promise<SweepReport> {
  const canSeeTicket: CanSeeFn = deps.canSeeTicket ?? ((db, userId, ticketId) => canSee(db, userId, ticketId));
  const now = (deps.now ?? (() => new Date()))();
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error));
  const createdAt = now.toISOString();
  // The sweep's "today" is an IST day (owner decision: time is Asia/Kolkata).
  // NOT `createdAt.slice(0, 10)` — a UTC slice does not roll over until 05:30
  // IST, so between IST midnight and 05:30 every night it would compute
  // yesterday's horizon and hold back warnings that are due. NOT a local-clock
  // read either (`now.getDate()` and friends), which would make the day depend
  // on the machine the cron happens to run on. istDayOf is the one instant->day
  // conversion in this file, and it runs ONCE for the whole run, so every
  // workspace in one sweep answers the same "today".
  const todayIst = istDayOf(createdAt);
  const report: SweepReport = { dueCandidates: 0, staleCandidates: 0, delivered: 0 };

  // The sweep is server-wide — the CLI has one DATABASE_URL and no workspace
  // argument — but the thresholds are PER WORKSPACE. So the run is a loop over
  // workspaces, and each workspace's settings are read exactly ONCE, before any
  // of its rows are looked at.
  //
  // Both nearby mistakes are structurally unreachable from here. Resolving
  // inside the row loops would be a settings query per ticket for a value that
  // cannot change mid-run — a per-row round trip that grows with the board.
  // Resolving once for the server would be worse than slow: it would apply one
  // workspace's claim to every other workspace's tickets, quietly nagging one
  // team on another team's threshold. A workspace with no tickets has nothing
  // to sweep and never appears.
  const workspaces = await deps.pool.query(
    `SELECT DISTINCT workspace_id FROM proj_tickets ORDER BY workspace_id`,
  );

  for (const { workspace_id: workspaceId } of workspaces.rows as Array<{ workspace_id: string }>) {
    // ONE settings read per workspace. `resolveSweepWindows` is the only place
    // in this file that knows which setting means which window.
    const windows = await resolveSweepWindows(deps.pool, workspaceId);
    const horizon = isoDatePlusDays(todayIst, windows.approachingWindowDays);

    // --- date-approaching: every non-terminal ticket in THIS workspace whose
    // CLAIMED date is on or before this workspace's horizon. The date is read
    // from the claim; nothing is computed onto tickets that carry no claim
    // (invariant 4).
    //
    // Day against day: a dueDate claim IS a day, the horizon IS a day, both are
    // IST, and `YYYY-MM-DD` sorts lexicographically — so this is a string
    // comparison and correctly so. Parsing the claim as a timestamp to compare
    // it against an instant would invent a time of day nobody claimed. Note
    // also what this predicate does NOT contain: no `now()`, no `CURRENT_DATE`,
    // no `AT TIME ZONE`. Every day in it was computed in Node from the injected
    // clock, so the Postgres session's timezone cannot move the answer.
    const due = await deps.pool.query(
      `SELECT ticket_id, workspace_id, assignee_id,
              fields -> 'title' ->> 'value' AS title,
              fields -> 'dueDate' AS due_claim
         FROM proj_tickets
        WHERE workspace_id = $1
          AND state_category <> 'terminal'
          AND fields -> 'dueDate' -> 'value' ->> 'date' <= $2`,
      [workspaceId, horizon],
    );

    for (const row of due.rows as DueRow[]) {
      report.dueCandidates += 1;
      const claimRecord = row.due_claim as { value?: { date?: string; note?: string }; actorId?: string; clientTime?: string; serverTime?: string } | null;
      const flattened = {
        date: claimRecord?.value?.date ?? '',
        ...(claimRecord?.value?.note !== undefined ? { note: claimRecord.value.note } : {}),
        actorId: claimRecord?.actorId ?? '',
        clientTime: claimRecord?.clientTime ?? '',
        serverTime: claimRecord?.serverTime ?? '',
      };
      const claim = dateClaimProvenanceSchema.safeParse(flattened);
      if (!claim.success) {
        log(`sweep: dueDate claim on ${row.ticket_id} is not a well-formed FieldClaim — skipped, not guessed`);
        continue;
      }
      const target = row.assignee_id ?? claim.data.actorId;
      if (!(await canSeeTicket(deps.pool, target, row.ticket_id))) continue;
      const notification: Notification = {
        id: newUlid(),
        userId: target,
        workspaceId: row.workspace_id,
        kind: 'date-approaching',
        // The key is made of FACTS — the ticket and the claimed day — and of
        // nothing about this run. No `createdAt`, no ULID: either would make
        // every run a new key, and "run twice, notify once" would be a sentence
        // with no mechanism behind it.
        dedupeKey: `date-approaching:${row.ticket_id}:${claim.data.date}`,
        payload: { ticketId: row.ticket_id, ticketTitle: row.title ?? '', field: 'dueDate', claim: claim.data },
        read: false,
        createdAt,
      };
      await deliverToAll(deps.transports, notification, log);
      report.delivered += 1;
    }

    // --- stale-ticket: active tickets in THIS workspace whose latest
    // state-entering event is older than this workspace's threshold. "When did
    // it enter?" is derived from the ledger every run — never stored as a
    // second copy that could drift.
    //
    // The ORDER BY below is `seq`, and deliberately so: scoped by
    // (entity_kind, entity_id) this is ONE ticket's history, and per-entity
    // history is exactly what `seq` orders (Plan 1's readEntityEvents). It is
    // NOT a cursor. A workspace STREAM resumes by `workspace_seq` instead
    // (coordination §18) — this sweep never resumes a stream; it asks each
    // ticket, independently, "what was the last thing that happened to you?"
    //
    // Day against INSTANT: `server_time` is a timestamptz, the threshold is a
    // day count. So the cut-off day is walked back in day-space and then turned
    // into an instant by istDayBounds, whose interval is HALF-OPEN — the
    // comparison is a strict `<` against `endUtc`, meaning "entered on or
    // before the cut-off day". `now.getTime() - days * 86_400_000` is what this
    // replaced: it makes a day count mean that many twenty-four-hour spans from
    // whenever the scheduler fired, which drifts with the cron and not with the
    // calendar the assignee reads — and would answer differently from the
    // attention strip reading the very same `staleDays`.
    const stalenessCutoffDay = isoDatePlusDays(todayIst, -windows.stalenessThresholdDays);
    const staleBefore = istDayBounds(stalenessCutoffDay).endUtc;
    const stale = await deps.pool.query(
      `SELECT t.ticket_id, t.workspace_id, t.assignee_id, t.state_id, t.workflow_id,
              t.fields -> 'title' ->> 'value' AS title,
              entered.server_time AS entered_at, entered.actor_id AS entered_by
         FROM proj_tickets t
         JOIN LATERAL (
               SELECT e.server_time, e.actor_id
                 FROM events e
                WHERE e.entity_kind = 'ticket' AND e.entity_id = t.ticket_id
                  AND e.type IN ('ticket.created', 'ticket.transitioned')
                ORDER BY e.seq DESC
                LIMIT 1
             ) entered ON true
        WHERE t.workspace_id = $1
          AND t.state_category = 'active'
          AND entered.server_time < $2`,
      [workspaceId, staleBefore],
    );

    for (const row of stale.rows as StaleRow[]) {
      report.staleCandidates += 1;
      if (row.assignee_id === null) continue; // no addressee — the attention strip owns it at read time
      if (!(await canSeeTicket(deps.pool, row.assignee_id, row.ticket_id))) continue;
      // ADAPTED FROM PLAN TEXT: the shipped reader is
      // `getWorkflowDefFromProjection(db, workspaceId, workflowId, select?)`
      // (`src/projections/workflows.ts`), whose tenancy argument the plan's call
      // omits. A workflow id is scoped to its workspace, and the row carries
      // both, so the workspace comes from the row rather than from the run.
      const def = await getWorkflowDefFromProjection(deps.pool, row.workspace_id, row.workflow_id);
      // `statesWithBacklog(def)`, not `def.states` (backlog/closed spec
      // §1.4/§3.2, 2026-09-17; fix round 2), for consistency with every other
      // state-name lookup in this codebase — though this one is UNREACHABLE
      // with `row.state_id === 'backlog'` today, and more directly so than
      // `attention.ts`'s `stateNameOf`: the query above filters
      // `t.state_category = 'active'`, and the universal backlog state's
      // category is `'open'` (`stateCategoryOf`/`statesWithBacklog`), so no
      // backlog row can ever reach this loop at all.
      const stateName =
        (def === null ? undefined : statesWithBacklog(def).find((state) => state.id === row.state_id))?.name ?? null;
      // `entered_at` is a timestamptz; pg hands it back as a Date, which is an
      // absolute instant, so `toISOString()` is the same string under every
      // process and session timezone. The key is therefore stable across runs
      // on differently-configured machines.
      const enteredAt = row.entered_at.toISOString();
      const notification: Notification = {
        id: newUlid(),
        userId: row.assignee_id,
        workspaceId: row.workspace_id,
        kind: 'stale-ticket',
        dedupeKey: `stale-ticket:${row.ticket_id}:${row.state_id}:${enteredAt}`,
        payload: {
          ticketId: row.ticket_id,
          ticketTitle: row.title ?? '',
          stateId: row.state_id,
          stateName,
          enteredAt,
          enteredBy: row.entered_by,
        },
        read: false,
        createdAt,
      };
      await deliverToAll(deps.transports, notification, log);
      report.delivered += 1;
    }
  }

  return report;
}
