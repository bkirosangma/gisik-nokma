import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  membershipId,
  stateCategorySchema,
  workflowDefinedPayloadSchema,
  type EntityState,
  type EventEnvelope,
  type PublishedWorkflowDef,
  type TicketState,
} from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';

const entityKindSchema = z.enum(['workspace', 'project', 'ticket', 'workflow', 'ticket-type', 'membership']);

const partialEnvelopeSchema = z.object({
  id: z.string().optional(),
  workspaceId: z.string().optional(),
  entity: z.object({ kind: entityKindSchema, id: z.string() }),
  type: z.string(),
  version: z.number().int().optional(),
  payload: z.unknown(),
  actorId: z.string().optional(),
  origin: z.enum(['web', 'mobile', 'desktop', 'server']).optional(),
  clientTime: z.string().optional(),
  serverTime: z.string().optional(),
  seq: z.number().int().optional(),
});
export type PartialEnvelope = z.infer<typeof partialEnvelopeSchema>;

export const fixtureSchema = z.object({
  name: z.string().min(1),
  workflowDefs: z.array(workflowDefinedPayloadSchema).default([]),
  memberships: z
    .array(z.object({ userId: z.string(), role: z.enum(['owner', 'admin', 'member', 'guest']) }))
    .default([]),
  priorEvents: z.array(partialEnvelopeSchema).default([]),
  candidateEvent: partialEnvelopeSchema,
  expected: z.union([
    z.object({ refused: z.literal(false) }),
    z.object({ refused: z.literal(true), rule: z.string(), reason: z.string() }),
    z.object({ refused: z.literal(true), rule: z.string(), reasonStartsWith: z.string() }),
    // Rule-only: the fixture asserts WHICH rule refused, and leaves the wording
    // to the plan that owns the rule. Plans 3 and 9 ship such fixtures against
    // rules defined here — without this branch their fixtures fail to load, and
    // copying a reason string into a foreign plan is how two copies of one
    // sentence start drifting.
    z.object({ refused: z.literal(true), rule: z.string() }),
  ]),
});
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

/** Load and validate every fixture JSON. A malformed fixture throws — the planted-defect discipline applies to the fixtures themselves. */
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

const ticketCreatedFixturePayloadSchema = z.object({
  workflowId: z.string(),
  workflowVersion: z.number().int().optional(),
  parentId: z.string().nullable().optional(),
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
const ticketFieldSetFixturePayloadSchema = z.object({ field: z.string(), value: z.unknown() });

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

  const tickets = new Map<string, TicketState>();
  fx.priorEvents.forEach((partial, index) => {
    applyPriorEvent(tickets, defs, latestOf, completeEnvelope(partial, index + 1));
  });

  const memberships = new Map<string, EntityState>();
  for (const member of fx.memberships) {
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
  };
}

function applyPriorEvent(
  tickets: Map<string, TicketState>,
  defs: Map<string, PublishedWorkflowDef>,
  latestOf: (workflowId: string) => PublishedWorkflowDef | null,
  env: EventEnvelope,
): void {
  switch (env.type) {
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
        projectId: 'prj_1', // harness default — no rule in this plan reads it
        typeId: 'task', // harness default — no rule in this plan reads it
        parentId: payload.parentId ?? null,
        workflowId: payload.workflowId,
        workflowVersion: version,
        stateId,
        stateCategory,
        assigneeId: payload.assigneeId ?? null,
        collaboratorIds: [],
        fields: {},
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
      mustTicket(tickets, env).fields[payload.field] = {
        value: payload.value ?? null,
        actorId: env.actorId,
        clientTime: env.clientTime,
        serverTime: env.serverTime,
      };
      return;
    }
    default:
      throw new Error(
        `fixture prior events may only be ticket.created/ticket.transitioned/ticket.workflow_rebound/ticket.assigned/ticket.field_set; got ${env.type}`,
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
