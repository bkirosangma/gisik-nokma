import { z } from 'zod';

export const stateCategorySchema = z.enum(['open', 'active', 'terminal']);
export type StateCategory = z.infer<typeof stateCategorySchema>;

export const workflowStateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: stateCategorySchema,
  // Amendment 9 (coordination doc): additive flag the attention strip's
  // "blocked" bucket reads — templates set it on their Blocked states, the
  // builder exposes it as a checkbox; category stays one of the three.
  blocked: z.boolean().optional(),
});
export type WorkflowState = z.infer<typeof workflowStateSchema>;

export const ruleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('restrict-to'),
    assignee: z.boolean().optional(),
    roles: z.array(z.string()).optional(),
    userIds: z.array(z.string()).optional(),
  }),
  z.object({ kind: z.literal('require-comment') }),
  z.object({ kind: z.literal('require-evidence') }),
  z.object({ kind: z.literal('require-field'), field: z.string().min(1) }),
  z.object({
    kind: z.literal('require-different-user'),
    thanActorOf: z.object({ to: z.string().min(1) }),
  }),
]);
export type Rule = z.infer<typeof ruleSchema>;

export const transitionSchema = z.object({
  from: z.string().min(1), // a state id, or '*' for "from any state"
  to: z.string().min(1),
  rules: z.array(ruleSchema),
});
export type Transition = z.infer<typeof transitionSchema>;

export const workflowDefSchema = z.object({
  id: z.string().min(1),
  version: z.number().int().min(1),
  name: z.string().min(1),
  initialStateId: z.string().min(1),
  states: z.array(workflowStateSchema),
  transitions: z.array(transitionSchema),
});
export type WorkflowDef = z.infer<typeof workflowDefSchema>;

export const stateMappingSchema = z.record(z.string(), z.string());

/**
 * The payload of a `workflow.defined` event: the full definition, plus — when
 * this version drops states an earlier version had — a mapping from each
 * dropped state id to its replacement in this version. Publishing cannot see
 * which tickets sit in which state, so the mapping is required for every
 * dropped state whether or not anything is standing in it.
 *
 * Deliberately NOT `.strict()`, unlike the seed vocabulary's payloads. Not
 * strict means strip, not permissive: a key this schema does not declare is
 * dropped here rather than refused, so a newer client's additive field costs
 * that one field instead of the whole publish. What keeps `stateMapping` is
 * that it is DECLARED in the `.extend()` below — that, and not the absent
 * `.strict()`, is what `hasStateMapping` and the proj_workflows round-trip
 * rest on.
 */
export const workflowDefinedPayloadSchema = workflowDefSchema.extend({
  stateMapping: stateMappingSchema.optional(),
});
export type WorkflowDefinedPayload = z.infer<typeof workflowDefinedPayloadSchema>;

/** A published definition as stored and served: structurally a WorkflowDef, possibly carrying its stateMapping. */
export type PublishedWorkflowDef = WorkflowDefinedPayload;

/** Narrow a WorkflowDef to one that carries a stateMapping — no casts at call sites. */
export function hasStateMapping(
  def: WorkflowDef,
): def is WorkflowDef & { stateMapping: Record<string, string> } {
  const candidate = def as WorkflowDef & { stateMapping?: unknown };
  return typeof candidate.stateMapping === 'object' && candidate.stateMapping !== null;
}

export type FoldedState = { ok: true; stateId: string } | { ok: false; unmappedStateId: string };

/**
 * Walk ONE state id forward from the version whose vocabulary it is written in
 * to `latest`, following each intermediate version's stateMapping. Pure: it
 * asks for definitions through `intermediate` rather than fetching them, so
 * the async ctx-driven caller in the rule engine and the synchronous callers
 * that already hold every version share one implementation.
 *
 * `intermediate(version)` is consulted only for versions strictly between
 * `fromVersion` and `latest.version`; `latest` answers for its own version and
 * for the final containment check (which is what catches a ticket already at
 * the latest version whose state id the definition no longer has). A version
 * the caller cannot supply returns `null` and the walk stops there.
 *
 * On failure it reports the id at the point the chain broke, not the id it
 * started from — that is the id a refusal must name.
 *
 * THE ONE VERSION WALK. Every caller in the monorepo goes through this
 * function: the engine's resolveStateIdForward and require-different-user
 * (`@gisik-nokma/rule-engine`), the server's proj_tickets refresh-on-publish
 * (Plan 3), and the offline replica's fold on workflow.defined (Plan 10).
 * A second walk is a second set of rounding errors, and the two engines are
 * only interchangeable while they round identically.
 */
export function foldStateIdForward(
  stateId: string,
  fromVersion: number,
  latest: WorkflowDef,
  intermediate: (version: number) => WorkflowDef | null,
): FoldedState {
  let current = stateId;
  for (let version = fromVersion + 1; version <= latest.version; version += 1) {
    const def = version === latest.version ? latest : intermediate(version);
    if (def === null) return { ok: false, unmappedStateId: current };
    if (def.states.some((state) => state.id === current)) continue;
    const mapped = hasStateMapping(def) ? def.stateMapping[current] : undefined;
    if (mapped === undefined) return { ok: false, unmappedStateId: current };
    current = mapped;
  }
  if (!latest.states.some((state) => state.id === current)) {
    return { ok: false, unmappedStateId: current };
  }
  return { ok: true, stateId: current };
}

/**
 * The payload of a `ticket.transitioned` event. The current state is NOT part
 * of the payload: the engine evaluates against the authoritative current
 * state, so a stale client claim refuses as an illegal transition rather than
 * silently landing. The event type itself is registered by Plan 3; the schema
 * lives here because the engine parses it.
 */
export const ticketTransitionedPayloadSchema = z.object({
  to: z.string().min(1),
  comment: z.object({ text: z.string() }).optional(),
  evidenceAttachmentId: z.string().optional(),
  // Owner decision (2026-08-20, coordination doc): provenance for a parent
  // reopened because it acquired live work — the engine treats cause as opaque
  // (no rule reads it); boards render "reopened — live work added" from it.
  cause: z.object({ kind: z.literal('reopened-for-child'), childTicketId: z.string() }).optional(),
});
export type TicketTransitionedPayload = z.infer<typeof ticketTransitionedPayloadSchema>;
