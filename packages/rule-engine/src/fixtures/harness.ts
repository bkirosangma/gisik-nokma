import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  CONTEST_EVENT_TYPES,
  membershipId,
  stateCategorySchema,
  ticketTypeDefSchema,
  workflowDefinedPayloadSchema,
  type EntityState,
  type EventEnvelope,
  type PublishedWorkflowDef,
  type TicketState,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';

const entityKindSchema = z.enum(['workspace', 'project', 'ticket', 'workflow', 'ticket-type', 'membership']);

/**
 * Every key is optional bar `entity` and `type`, so a legitimately partial
 * fixture event is unaffected by `.strict()` — but a misspelled one refuses
 * loudly at load instead of parsing clean and arriving somewhere else. Without
 * it, `paylod` yields `payload: undefined` and surfaces later as a
 * malformed-payload refusal indistinguishable from a real planted defect.
 *
 * `payload` is REQUIRED, and `z.unknown()` alone does not make it so — probed
 * against this repo's zod, an object with no `payload` key at all parses clean,
 * and so does one carrying an explicit `undefined`. The refine is the same
 * construction, with the same message, as `envelope.ts`'s `requiredPayload`
 * (controller ruling P10 / pre-flight Addendum 7a): a harness schema may
 * diverge from its domain twin in VALUE FORMAT — fixtures use `t1` and `ws_1`
 * because they enter at `evaluateEvent` and never pass `parseEvent`'s door —
 * but it may NOT diverge in PRESENCE, because a looser prior door lets a
 * fixture stage a world the server could never have produced, and the suite
 * then proves a refusal against history that cannot exist.
 *
 * Only ABSENCE is the defect here too. `null` and `{}` stay accepted, and are
 * pinned by their own assertions rather than left to fall out of the fix.
 */
const partialEnvelopeSchema = z
  .object({
    id: z.string().optional(),
    workspaceId: z.string().optional(),
    entity: z.object({ kind: entityKindSchema, id: z.string() }).strict(),
    type: z.string(),
    version: z.number().int().optional(),
    payload: z
      .unknown()
      .refine((value) => value !== undefined, 'is required — an event with no payload is not a claim'),
    actorId: z.string().optional(),
    origin: z.enum(['web', 'mobile', 'desktop', 'server']).optional(),
    clientTime: z.string().optional(),
    serverTime: z.string().optional(),
    seq: z.number().int().optional(),
  })
  .strict();
export type PartialEnvelope = z.infer<typeof partialEnvelopeSchema>;

/**
 * Strict at every level it owns. Three of these fields carry a `.default()`,
 * which is exactly why: left lenient, a top-level typo like `memberhips` is not
 * an error but a silent fallback to `[]`, and the fixture then proves whatever
 * is left of what its author meant. The one deliberate exception is
 * `workflowDefinedPayloadSchema` — its non-strict strip is the separately-ruled
 * domain decision (adaptation map S1) and its subtree keeps those semantics.
 */
export const fixtureSchema = z
  .object({
    name: z.string().min(1),
    /**
     * Prose for the next reader, and the only comment JSON allows. Nothing
     * executes it — it exists because a fixture whose SHAPE is load-bearing
     * beyond the outcome it asserts has no other way to say so, and the
     * alternative (a note nested inside the def) would be stripped in silence
     * by `workflowDefinedPayloadSchema`'s deliberately non-strict parse and
     * never reach a reader who was looking at the parsed fixture.
     */
    notes: z.string().min(1).optional(),
    workflowDefs: z.array(workflowDefinedPayloadSchema).default([]),
    memberships: z
      .array(z.object({ userId: z.string(), role: z.enum(['owner', 'admin', 'member', 'guest']) }).strict())
      .default([]),
    priorEvents: z.array(partialEnvelopeSchema).default([]),
    candidateEvent: partialEnvelopeSchema,
    // Every branch is `.strict()`, and the rule-only branch is why. Left lenient,
    // a typo'd key (`reasonStartWith`, `resaon`) or a wrong-typed one
    // (`reason: 123`) simply falls through to the rule-only branch, which
    // silently retires the character-for-character reason check the whole suite
    // rests on. Strict makes the unknown key fail that branch too, so the typo
    // refuses at load rather than downgrading the discipline in silence.
    expected: z.union([
      z.object({ refused: z.literal(false) }).strict(),
      z.object({ refused: z.literal(true), rule: z.string(), reason: z.string() }).strict(),
      z.object({ refused: z.literal(true), rule: z.string(), reasonStartsWith: z.string() }).strict(),
      // Rule-only: the fixture asserts WHICH rule refused, and leaves the wording
      // to the plan that owns the rule. Plans 3 and 9 ship such fixtures against
      // rules defined here — without this branch their fixtures fail to load, and
      // copying a reason string into a foreign plan is how two copies of one
      // sentence start drifting.
      z.object({ refused: z.literal(true), rule: z.string() }).strict(),
    ]),
  })
  .strict();
export type Fixture = z.infer<typeof fixtureSchema>;

const FIXTURE_TIME = '2026-08-20T00:00:00.000Z';

export function completeEnvelope(partial: PartialEnvelope, seq: number): EventEnvelope {
  return {
    id: partial.id ?? `fx_evt_${seq}`,
    workspaceId: partial.workspaceId ?? 'ws_1',
    entity: partial.entity,
    type: partial.type,
    version: partial.version ?? 1,
    payload: partial.payload,
    actorId: partial.actorId ?? 'user_a',
    origin: partial.origin ?? 'server',
    clientTime: partial.clientTime ?? FIXTURE_TIME,
    serverTime: partial.serverTime ?? FIXTURE_TIME,
    seq: partial.seq ?? seq,
  };
}

export function completeCandidate(fx: Fixture): EventEnvelope {
  return completeEnvelope(fx.candidateEvent, fx.priorEvents.length + 1);
}

/**
 * Load and validate every fixture JSON. A malformed fixture throws — the
 * planted-defect discipline applies to the fixtures themselves.
 *
 * Fixtures live FLAT in `fixtures/`: the scan is non-recursive, so a fixture
 * filed into a subdirectory is silently skipped rather than refused, and
 * Task 13's count gate is the compensating control that catches it.
 */
export function loadFixtures(): Fixture[] {
  const dir = fileURLToPath(new URL('../../fixtures/', import.meta.url));
  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort();
  return files.map((file) => {
    const raw: unknown = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
    const parsed = fixtureSchema.safeParse(raw);
    if (!parsed.success) {
      const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new Error(`fixture ${file} is malformed: ${detail}`);
    }
    return parsed.data;
  });
}

// --- In-memory EngineContext -------------------------------------------------

/**
 * PRESENCE mirrors `ticketCreatedPayload` (`events/ticket-events.ts`); FORMAT
 * deliberately does not (ruling P10). `typeId`, `projectId`, `parentId` and
 * `title` are required exactly as the domain requires them — `parentId` is
 * required-and-nullable, never optional, because a create that says nothing
 * about its parent is not the same claim as one that says "none" — while their
 * string shapes stay loose so `t1`/`prj_1` keep working: a prior event never
 * passes `parseEvent`'s door, and tightening to `ulidString` would invalidate
 * every shipped fixture for no gain.
 *
 * Making them optional was the alternative and it was rejected: it would have
 * reproduced the `parentId` presence hole three more times in the act of
 * fixing it, and each one lets a fixture stage a ticket the real create door
 * would have refused.
 *
 * `workflowId`, `workflowVersion`, `assigneeId`, `stateId` and `stateCategory`
 * are HARNESS-ONLY affordances with no domain twin, so presence says nothing
 * about them. `workflowId` binds a workflow directly because this dialect has
 * no ticket-type projection standing behind it: the fold below does NOT resolve
 * the workflow through `typeId` the way `applyTicketEvent` does, and it does
 * NOT throw on a `typeId` no `ticket-type.defined` ever declared. That is the
 * one place this fold is deliberately laxer than the reducer, and it is what
 * lets a fixture about transitions carry a ticket without also having to invent
 * a type for it.
 */
const ticketCreatedFixturePayloadSchema = z.object({
  typeId: z.string(),
  projectId: z.string(),
  parentId: z.string().nullable(),
  title: z.string(),
  workflowId: z.string(),
  workflowVersion: z.number().int().optional(),
  assigneeId: z.string().nullable().optional(),
  // Harness-only overrides for planting states the ledger could not produce:
  stateId: z.string().optional(),
  stateCategory: stateCategorySchema.optional(),
});
const ticketTransitionedFixturePayloadSchema = z.object({ to: z.string() });
// Plan 3 owns ticket.workflow_rebound; the harness folds it because
// require-different-user must be provable across a migration, and this plan's
// fixtures may only contain events a real server can ingest.
const ticketWorkflowReboundFixturePayloadSchema = z.object({
  toWorkflowId: z.string(),
  toStateId: z.string(),
});
const ticketAssignedFixturePayloadSchema = z.object({ assigneeId: z.string().nullable() });
/**
 * `field`, not `fieldId`, and the split is DELIBERATE (controller ruling P8 /
 * pre-flight A16). The domain payload is `{ fieldId, value }`, so a CANDIDATE
 * field_set — which is parsed by `ticketFieldSetPayload` at the real door — must
 * spell it `fieldId`. This is the PRIOR dialect, which no domain schema ever
 * sees, and renaming it would rewrite every shipped fixture that stages a field
 * claim plus this package's harness tests for cosmetic uniformity. The two
 * spellings are how a reader tells at a glance which side of the door an event
 * is on.
 *
 * `value` is required, matching `ticketFieldSetPayload`'s own refine
 * character-for-character. Bare `z.unknown()` admitted `{ field: 'title' }`
 * with no value, and the fold below then wrote `payload.value ?? null` — the
 * same fabricated clearing claim the production reducer used to record, in the
 * very substrate that exists to catch it. A prior door looser than the real
 * door is a defect on its own terms; one that reproduces the production defect
 * exactly is a fixture suite that agrees with the bug.
 */
const ticketFieldSetFixturePayloadSchema = z.object({
  field: z.string(),
  value: z
    .unknown()
    .refine(
      (value) => value !== undefined,
      'is required — a field claim with no value would record a clearing nobody made',
    ),
});
/**
 * PRESENCE mirrors `ticketReparentedPayload` (`events/ticket-events.ts`):
 * `newParentId` is required-and-nullable. `null` is the move to project root,
 * which is a claim; absence is no claim at all.
 */
const ticketReparentedFixturePayloadSchema = z.object({ newParentId: z.string().nullable() });

export function buildInMemoryContext(fx: Fixture): EngineContext {
  const defs = new Map<string, PublishedWorkflowDef>();
  for (const def of fx.workflowDefs) defs.set(`${def.id}@${def.version}`, def);
  const latestOf = (workflowId: string): PublishedWorkflowDef | null => {
    let latest: PublishedWorkflowDef | null = null;
    for (const def of fx.workflowDefs) {
      if (def.id === workflowId && (latest === null || def.version > latest.version)) latest = def;
    }
    return latest;
  };

  /**
   * COMPLETE FIRST, FILTER SECOND — the order is load-bearing, not style.
   * `completeEnvelope` derives the default id `fx_evt_<seq>` from POSITION, and
   * `completeCandidate` independently numbers the candidate `priorEvents.length + 1`.
   * Filter the partials before completing them and the contests are REMOVED
   * before they are ever given ids, so `getContest` below can never find one —
   * and in the sibling shape, where a two-list implementation keeps the contests
   * but numbers them off a filtered enumeration, every event after a dropped one
   * is RENUMBERED instead. Removed or renumbered, the outcome is identical: a
   * fixture naming `fx_evt_1` addresses nothing, and a resolution refuses
   * `contest.unknown` where it meant `contest.already-resolved` — still refused,
   * wrong rule, and in a suite without an exact-rule assertion, green.
   */
  const completedPriorEvents = fx.priorEvents.map((partial, index) => completeEnvelope(partial, index + 1));

  /**
   * Contest events attach to the ticket entity but are NOT ticket state — the
   * server's ticket projection ignores them the same way. The filter is
   * mandatory rather than hygiene: `applyPriorEvent`'s `default:` branch throws
   * on any type it does not fold, so an unfiltered contest kills the fixture at
   * setup instead of reaching the rule it was written to prove.
   */
  const foldable = completedPriorEvents.filter(
    (event) => !(CONTEST_EVENT_TYPES as readonly string[]).includes(event.type),
  );

  const tickets = new Map<string, TicketState>();
  const ticketTypes = new Map<string, TicketTypeDef>();
  for (const event of foldable) {
    applyPriorEvent(tickets, ticketTypes, defs, latestOf, event);
  }

  const memberships = new Map<string, EntityState>();
  for (const member of fx.memberships) {
    // Memberships are keyed to `ws_1` unconditionally, while `completeEnvelope`
    // only DEFAULTS workspaceId to 'ws_1'. A fixture that overrides workspaceId
    // on its candidate makes restrict-to look up a key never inserted, get null,
    // and refuse with a reason that reads entirely legitimate — so the fixture
    // proves a refusal, just not the one it was written to prove. Keep fixture
    // candidates in ws_1, or extend the harness knowingly.
    const id = membershipId('ws_1', member.userId);
    memberships.set(id, { kind: 'membership', id, workspaceId: 'ws_1', userId: member.userId, role: member.role });
  }

  return {
    async getEntityState(kind, id) {
      if (kind === 'ticket') return tickets.get(id) ?? null;
      if (kind === 'membership') return memberships.get(id) ?? null;
      return null;
    },
    async getChildrenStates(ticketId) {
      return [...tickets.values()].filter((ticket) => ticket.parentId === ticketId);
    },
    async getWorkflowDef(workflowId, version) {
      if (version !== undefined) return defs.get(`${workflowId}@${version}`) ?? null;
      return latestOf(workflowId);
    },
    /**
     * Contests are read back off the SAME completed prior events the fold
     * skipped — the fixture's ledger is the only source, so the harness cannot
     * disagree with itself about which contests exist.
     */
    async getContest(contestedEventId) {
      const contested = completedPriorEvents.find(
        (event) => event.type === 'claim.contested' && event.id === contestedEventId,
      );
      if (contested === undefined) return null;
      const resolved = completedPriorEvents.some(
        (event) =>
          event.type === 'claim.contested_resolved' &&
          (event.payload as { contestedEventId?: string }).contestedEventId === contestedEventId,
      );
      return { ticketId: contested.entity.id, resolved };
    },
    /**
     * A real body at last. This method used to THROW, naming this task and
     * `applyPriorEvent`: the dialect could not fold `ticket-type.defined`, so a
     * fixture reaching a rank check had no definition to be judged against, and
     * answering `null` would have made the check refuse for a reason that reads
     * entirely legitimate. The throw was the placeholder telling the truth; the
     * fold below is what it was waiting for.
     *
     * `null` is now the honest answer, and it means what it says on the server:
     * this workspace has no such type. `checkTicketCreated` turns it into
     * `ticket.unknown-type`, and `checkTicketReparented` into
     * `hierarchy.parent-type-unknown` when it is the PARENT's type that is
     * missing — both of which a fixture can now stage deliberately.
     */
    async getTicketTypeDef(typeId) {
      return ticketTypes.get(typeId) ?? null;
    },
  };
}

/**
 * The prior-event fold. It is NOT the shared reducer — `buildMemoryContext`
 * (`../memory-context.js`) is the context that folds through
 * `applyTicketEvent`, and both contexts stay (pre-flight A15 / C-14). What
 * keeps the two from drifting is that everything added to one is checked
 * against the other: `ticket-type.defined` is last-definition-wins here for the
 * same reason it is there, and `ticket.reparented` moves `parentId` and nothing
 * else on both sides.
 *
 * `workflow.defined` is deliberately still NOT in this dialect. Admitting it
 * would oblige this fold to carry `foldTicketToWorkflowVersion`'s refresh-on-
 * publish loop as well (`memory-context.ts`), because a published version that
 * re-categorises a state changes what `getChildrenStates` hands the
 * parent-terminal invariant — and a harness that accepted the event without the
 * loop would split from the memory context at exactly the seam the shared
 * fixture suite exists to weld. Fixtures declare their versions in
 * `workflowDefs` instead, which the `defs` map above already serves by exact
 * version and by latest.
 */
function applyPriorEvent(
  tickets: Map<string, TicketState>,
  ticketTypes: Map<string, TicketTypeDef>,
  defs: Map<string, PublishedWorkflowDef>,
  latestOf: (workflowId: string) => PublishedWorkflowDef | null,
  env: EventEnvelope,
): void {
  switch (env.type) {
    case 'ticket-type.defined': {
      // Last definition wins — types are events, and a later definition
      // replaces the earlier one, exactly as `memory-context.ts` folds it. That
      // is what makes rank RE-definition reachable, and with it the hierarchy
      // cycle a rank change can create: under strict rank ordering alone a loop
      // looks impossible, so the cycle walk would read as dead code.
      const def = ticketTypeDefSchema.parse(env.payload);
      ticketTypes.set(def.id, def);
      return;
    }
    case 'ticket.created': {
      const payload = ticketCreatedFixturePayloadSchema.parse(env.payload);
      const version = payload.workflowVersion ?? latestOf(payload.workflowId)?.version ?? 1;
      const def = defs.get(`${payload.workflowId}@${version}`);
      const initial = def === undefined ? undefined : def.states.find((s) => s.id === def.initialStateId);
      const stateId = payload.stateId ?? initial?.id;
      const stateCategory = payload.stateCategory ?? def?.states.find((s) => s.id === stateId)?.category;
      if (stateId === undefined || stateCategory === undefined) {
        throw new Error(
          `fixture prior event creates ticket ${env.entity.id} but its state cannot be resolved; give the payload explicit stateId and stateCategory`,
        );
      }
      tickets.set(env.entity.id, {
        kind: 'ticket',
        id: env.entity.id,
        workspaceId: env.workspaceId,
        // From the payload, no longer hardcoded `prj_1`/`task`. The constants
        // were harmless while no rule read either field; Plan 3's hierarchy
        // checks read both — `projectId` for `hierarchy.cross-project`, and
        // `typeId` to look the type up for the rank comparison — so a fixture
        // that could not say which project or which type its priors were in
        // could not stage those refusals at all, and would meet a
        // cross-project refusal for a project it never chose.
        projectId: payload.projectId,
        typeId: payload.typeId,
        // `?? null` stays, and it is not the fabrication class the field claim
        // below had. A ticket created with no parent IS a root ticket and one
        // with no assignee IS unassigned: `null` is the natural absence-default
        // of those two state fields, not a deliberate act somebody has to have
        // performed. `parentId` is now required in the payload anyway, so the
        // coalesce there is reached only by the `assigneeId` affordance beside
        // it — kept spelled out because narrowing `TicketState.parentId` to
        // `string | null` from a `string | null` payload needs no help, while
        // reading as though absence were impossible would be a claim.
        parentId: payload.parentId ?? null,
        workflowId: payload.workflowId,
        workflowVersion: version,
        stateId,
        stateCategory,
        assigneeId: payload.assigneeId ?? null,
        collaboratorIds: [],
        // The title is a FIELD CLAIM, exactly as `applyTicketEvent` records it
        // (`ticket-state.ts`, `fields: { title: claim(p.title, env) }`) — a
        // ticket's title is not a column, it is the first thing anyone claimed
        // about it, carrying the claimant and both clocks like every other
        // claim. Leaving `fields` empty here was not merely incomplete: the
        // parent-terminal refusals read `parent.fields['title']` to name the
        // finished parent, so a fixture staging a titleless parent got a
        // refusal quoting a raw ticket id at the actor — a sentence the server
        // can never produce, from the suite that exists to prove the two agree.
        fields: {
          title: { value: payload.title, actorId: env.actorId, clientTime: env.clientTime, serverTime: env.serverTime },
        },
        transitions: [],
      });
      return;
    }
    case 'ticket.transitioned': {
      const payload = ticketTransitionedFixturePayloadSchema.parse(env.payload);
      const ticket = mustTicket(tickets, env);
      const def = defs.get(`${ticket.workflowId}@${ticket.workflowVersion}`);
      const state = def?.states.find((s) => s.id === payload.to);
      if (state === undefined) {
        throw new Error(`fixture prior event moves ticket ${ticket.id} to unknown state "${payload.to}"`);
      }
      ticket.stateId = state.id;
      ticket.stateCategory = state.category;
      // The entry records the workflow AND version whose vocabulary its
      // toStateId is written in — the ticket's own pair at the moment the
      // move was applied. Both are read back by require-different-user.
      ticket.transitions.push({
        toStateId: state.id,
        actorId: env.actorId,
        seq: env.seq,
        workflowId: ticket.workflowId,
        workflowVersion: ticket.workflowVersion,
      });
      return;
    }
    case 'ticket.workflow_rebound': {
      // The explicit migration between two unrelated workflows (Plan 3 owns
      // the event; the harness folds it because four-eyes must be provable
      // across one). It moves the ticket's pinned workflow, version and state
      // and appends NO log entry — a migration is not a transition, and the
      // entries already in the log keep the vocabulary they were written in.
      const payload = ticketWorkflowReboundFixturePayloadSchema.parse(env.payload);
      const ticket = mustTicket(tickets, env);
      const target = latestOf(payload.toWorkflowId);
      if (target === null) {
        throw new Error(
          `fixture prior event rebinds ticket ${ticket.id} to workflow "${payload.toWorkflowId}", which the fixture never defines`,
        );
      }
      const state = target.states.find((s) => s.id === payload.toStateId);
      if (state === undefined) {
        throw new Error(
          `fixture prior event rebinds ticket ${ticket.id} to unknown state "${payload.toStateId}" of workflow "${payload.toWorkflowId}"`,
        );
      }
      ticket.workflowId = target.id;
      ticket.workflowVersion = target.version;
      ticket.stateId = state.id;
      ticket.stateCategory = state.category;
      return;
    }
    case 'ticket.assigned': {
      const payload = ticketAssignedFixturePayloadSchema.parse(env.payload);
      mustTicket(tickets, env).assigneeId = payload.assigneeId;
      return;
    }
    case 'ticket.field_set': {
      const payload = ticketFieldSetFixturePayloadSchema.parse(env.payload);
      // `payload.value`, with no `?? null`. The coalesce this line used to carry
      // was character-for-character the production defect it was supposed to be
      // able to catch (`ticket-state.ts`, since fixed): with the schema above
      // bare `z.unknown()`, a prior omitting `value` parsed clean and this line
      // fabricated a null CLEARING claim nobody made — under the actor's id and
      // both their clocks. With the key required, `parse` throws before this
      // line and `null ?? null` was identity anyway, so keeping the coalesce
      // would state the defect as the design.
      mustTicket(tickets, env).fields[payload.field] = {
        value: payload.value,
        actorId: env.actorId,
        clientTime: env.clientTime,
        serverTime: env.serverTime,
      };
      return;
    }
    case 'ticket.reparented': {
      // Moves `parentId` and nothing else, exactly as `applyTicketEvent` folds
      // it. `getChildrenStates` filters on `parentId` alone, so this one
      // assignment is the whole of what a reparent changes about what a rule
      // can see — and it is what lets a fixture stage a chain that a later
      // rank re-definition makes loop-closing.
      const payload = ticketReparentedFixturePayloadSchema.parse(env.payload);
      mustTicket(tickets, env).parentId = payload.newParentId;
      return;
    }
    default:
      throw new Error(
        `fixture prior events may only be ticket-type.defined/ticket.created/ticket.transitioned/ticket.reparented/ticket.workflow_rebound/ticket.assigned/ticket.field_set; got ${env.type}`,
      );
  }
}

function mustTicket(tickets: Map<string, TicketState>, env: EventEnvelope): TicketState {
  const ticket = tickets.get(env.entity.id);
  if (ticket === undefined) throw new Error(`fixture prior event touches unknown ticket ${env.entity.id}`);
  return ticket;
}

// --- Outcome assertion (framework-free, so any runner can use it) -----------

export function assertFixtureOutcome(result: Accept | Refusal, fx: Fixture): void {
  if (!fx.expected.refused) {
    if (result.refused) {
      throw new Error(`fixture "${fx.name}": expected acceptance, got refusal [${result.rule}] ${result.reason}`);
    }
    return;
  }
  if (!result.refused) {
    throw new Error(`fixture "${fx.name}": expected refusal [${fx.expected.rule}], got acceptance`);
  }
  if (result.rule !== fx.expected.rule) {
    throw new Error(
      `fixture "${fx.name}": expected rule "${fx.expected.rule}", got "${result.rule}" (${result.reason})`,
    );
  }
  if ('reason' in fx.expected) {
    if (result.reason !== fx.expected.reason) {
      throw new Error(
        `fixture "${fx.name}": reason mismatch:\n  expected: ${fx.expected.reason}\n  got:      ${result.reason}`,
      );
    }
  } else if ('reasonStartsWith' in fx.expected) {
    if (!result.reason.startsWith(fx.expected.reasonStartsWith)) {
      throw new Error(
        `fixture "${fx.name}": reason does not start with: ${fx.expected.reasonStartsWith}\n  got: ${result.reason}`,
      );
    }
  }
  // Rule-only fixtures stop here: the rule id was asserted above, and the
  // wording belongs to whichever plan defines that rule.
}
