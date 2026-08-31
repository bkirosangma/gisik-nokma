import type { EventEnvelope } from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine';

/**
 * The rule id and reason the envelope-origin refusal reports, character for
 * character. Plan 4 Task 5's plan text pins both, and Plan 6's UI maps rule
 * names to what a person is shown, so they get one origin here rather than a
 * literal at the call site that a rename could half-land.
 */
export const SERVER_ORIGIN_RULE = 'permission.role';
export const SERVER_ORIGIN_REASON = 'Only the server itself may record server-origin events.';

/**
 * **`origin` here is the event envelope's provenance enum — `'web' | 'mobile' |
 * 'desktop' | 'server'` (`EventEnvelope.origin`). It is NOT the browser
 * `Origin` header.** This module has nothing to do with CSRF, cross-site
 * requests, or any HTTP header; a reader who conflates the two writes a header
 * check and believes this window is closed. Every name, comment and test in
 * this area says "envelope-origin" for that reason.
 *
 * ## What this checks
 *
 * One thing: a client may not wear the server's provenance. `contest.server-only`
 * (`packages/rule-engine/src/contests.ts`) refuses a `claim.contested` whose
 * envelope-origin is not `'server'` — it is the rule stopping a client forging
 * the system's own record of a refusal. Nothing validated envelope-origin, so
 * setting it to `'server'` walked straight past that rule; and because nothing
 * binds a contest's embedded original event to the outer envelope, the
 * reachable defect was not "forge the record of a refusal" but **write a
 * permanent, un-deletable ledger entry attributing a fabricated claim to any
 * actor in any workspace** — the ledger is append-only by trigger, so such a
 * row could only ever be superseded, never removed.
 *
 * ## What this does NOT check — named, not summarised
 *
 * The coordination doc's ruling asks this module to name the checks it does not
 * yet perform rather than to label itself partial, because "deliberately
 * partial" ages into background noise while a list of absences stays
 * actionable. So, explicitly, this module does not check:
 *
 * - **Actor identity.** `env.actorId` is not compared against anybody: the
 *   client door carries no session yet, so there is nothing to compare it to. A
 *   client may still submit a claim attributed to another person.
 * - **Role.** Nothing here asks whether the actor is an owner, admin, member or
 *   guest, so admin-only event types (`workflow.defined`, `ticket-type.defined`,
 *   `project.created`, `ticket.workflow_rebound`, membership changes) are
 *   ungated.
 * - **Membership.** Nothing asks whether the actor belongs to the workspace the
 *   event is filed under. A non-member's claim is accepted.
 * - **Visibility.** Nothing asks whether the actor may see the entity the event
 *   touches; `permission.visibility` does not exist yet (Task 9).
 *
 * Task 4 lands `resolveEffectiveRole`, then Task 5 fills in the role logic on
 * top of this function and Task 9 adds visibility — the additive layering the
 * plan already uses. This is the first branch of Task 5's `checkRolePermission`,
 * extracted and landed early because it reads `env.origin` alone and touches no
 * context, so it was separable on the merits.
 *
 * ## Which doors this closes
 *
 * It is applied per call, by the ingest service's client entry point
 * (`ingestClientBatch`), NOT to every append. That distinction is the whole
 * design: the value of `origin` is not what makes an event a forgery — the door
 * it arrived through is. The server's own appends are legitimately
 * server-origin (Task 5's workspace bootstrap, Task 14's invite acceptance) and
 * reach the ledger through `ingestBatch` without knocking on this gate.
 *
 * - **CLOSED:** `POST /v1/events`, which calls `ingestClientBatch`.
 * - **NOT CLOSED, by design:** direct `ingestBatch` — the internal append path.
 * - **NOT CLOSED, because it does not exist yet:** `POST /v1/sync` (Plan 10).
 *   **When it is built it must call `ingestClientBatch`**, or offline-originated
 *   events bypass this gate entirely.
 *
 * ## Do not fold this into `IngestDeps.gates`
 *
 * Decision 15's `gates` are construction-time and unconditional: they run for
 * every caller of the ingest service. A construction-time gate cannot tell one
 * door from another, which is exactly what this check needs to do, so tidying
 * it into `gates` would refuse the server's own bootstrap appends.
 */
export function checkPermission(env: EventEnvelope): Refusal | null {
  if (env.origin === 'server') {
    return { refused: true, rule: SERVER_ORIGIN_RULE, reason: SERVER_ORIGIN_REASON };
  }
  return null;
}

/**
 * The per-call gate the ingest service applies to client-submitted batches.
 * Named as a type so Task 5 can widen it to carry the session (`(env, session)`)
 * without every call site changing shape.
 */
export type SubmissionGate = (env: EventEnvelope) => Refusal | null;
