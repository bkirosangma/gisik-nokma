import {
  submittedEventSchema,
  type PublishedWorkflowDef,
  type SubmittedEvent,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import type {
  IngestResult,
  MigrationOutcome,
  MigrationRequest,
  WorkflowAuthoringGateway,
  WorkspaceMember,
} from './gateway.js';

export type FakeGatewaySeed = {
  workflows?: PublishedWorkflowDef[];
  ticketTypes?: TicketTypeDef[];
  members?: WorkspaceMember[];
  /** workflowId → stateId → ticket count */
  occupancy?: Record<string, Record<string, number>>;
  /** typeId → workflowId → count of tickets PINNED to that workflow (decision 10) */
  typePopulation?: Record<string, Record<string, number>>;
  /** Drained in order; when empty, submissions commit. */
  submitResults?: IngestResult[];
  /** Drained in order; when empty, a migration moves the whole seeded population. */
  migrationResults?: MigrationOutcome[];
  /** Simulate the occupancy read failing — the dialog's "ticket count unavailable" path. */
  occupancyError?: boolean;
  /** Simulate the population read failing — the divergence notice's "unavailable" path. */
  typePopulationError?: boolean;
};

/**
 * In-memory WorkflowAuthoringGateway for every test through Task 12 — twelve
 * tasks build against this before Task 13 ever touches a real server, so it is
 * this series' most exposed mocked-contract seam (coordination doc, Lane 3
 * ruling 2026-08-28, "the validating fake").
 *
 * `submit` therefore runs every event through the SHIPPED
 * `submittedEventSchema` before accepting it — the same schema
 * `parseEvent`'s envelope check runs, and the one the real door enforces
 * first. A fake that skipped this would accept payloads the real server
 * refuses (wrong ULID shape, a missing field, an out-of-range origin), and
 * every one of the twelve later tasks would build on that false green. This
 * is deliberately narrower than the full `parseEvent` pipeline: it does not
 * check event-type registration or a payload schema (those are the
 * SERVER's registry and per-event payload shapes, not this gateway's to
 * own), only that the envelope itself is well-formed — exactly what Lane 3's
 * ruling names.
 */
export function createFakeGateway(
  seed: FakeGatewaySeed = {},
): WorkflowAuthoringGateway & { submitted: SubmittedEvent[]; migrations: MigrationRequest[] } {
  const pendingResults = [...(seed.submitResults ?? [])];
  const pendingMigrations = [...(seed.migrationResults ?? [])];
  const submitted: SubmittedEvent[] = [];
  const migrations: MigrationRequest[] = [];
  let committedSeq = 0;
  return {
    submitted,
    migrations,
    listWorkflows: async () => seed.workflows ?? [],
    getWorkflow: async (_workspaceId, workflowId) =>
      (seed.workflows ?? []).find((workflow) => workflow.id === workflowId) ?? null,
    listTicketTypes: async () => seed.ticketTypes ?? [],
    listMembers: async () => seed.members ?? [],
    getStateOccupancy: async (_workspaceId, workflowId) => {
      if (seed.occupancyError === true) throw new Error('occupancy read failed (seeded)');
      return seed.occupancy?.[workflowId] ?? {};
    },
    getTypeWorkflowPopulation: async (_workspaceId, typeId, workflowId) => {
      if (seed.typePopulationError === true) throw new Error('type population read failed (seeded)');
      return seed.typePopulation?.[typeId]?.[workflowId] ?? 0;
    },
    migrateTypeToWorkflow: async (input) => {
      migrations.push(input);
      const queued = pendingMigrations.shift();
      if (queued !== undefined) return queued;
      return { status: 'migrated', count: seed.typePopulation?.[input.typeId]?.[input.fromWorkflowId] ?? 0 };
    },
    submit: async (events) => {
      return events.map((event): IngestResult => {
        const claimedId =
          typeof event === 'object' && event !== null && 'id' in event && typeof (event as { id: unknown }).id === 'string'
            ? (event as { id: string }).id
            : null;
        const parsed = submittedEventSchema.safeParse(event);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          const at = issue !== undefined && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
          return {
            status: 'invalid',
            eventId: claimedId,
            code: 'malformed-envelope',
            message: `event envelope is malformed${at}: ${issue?.message ?? 'invalid'}`,
          };
        }
        submitted.push(event);
        const queued = pendingResults.shift();
        if (queued !== undefined) return queued;
        committedSeq += 1;
        return {
          status: 'committed',
          eventId: event.id,
          seq: committedSeq,
          serverTime: new Date().toISOString(),
        };
      });
    },
  };
}
