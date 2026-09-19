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
  /**
   * typeId → count of tickets of that type ANYWHERE in the workspace (Task 8).
   *
   * Deliberately a SEPARATE field rather than something this fake derives by
   * summing `typePopulation`. Deriving it would make the two reads agree by
   * construction, and the whole point of the wide read is that they can
   * disagree — a ticket pins the workflow it was created under, so a re-point
   * leaves tickets behind. A fake that reconciled them could not express the
   * bug, and a screen test could not tell which number the screen renders.
   */
  typeCounts?: Record<string, number>;
  /** Drained in order; when empty, submissions commit. */
  submitResults?: IngestResult[];
  /** Drained in order; when empty, a migration moves the whole seeded population. */
  migrationResults?: MigrationOutcome[];
  /** Simulate the occupancy read failing — the dialog's "ticket count unavailable" path. */
  occupancyError?: boolean;
  /** Simulate the population read failing — the divergence notice's "unavailable" path. */
  typePopulationError?: boolean;
  /** Simulate the wide type-count read failing — the list's "unavailable" path (Task 8). */
  typeCountsError?: boolean;
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
 * every one of the twelve later tasks would build on that false green. It
 * checks only that the envelope itself is well-formed — exactly what Lane 3's
 * ruling names.
 *
 * It is deliberately narrower than the full `parseEvent` pipeline, and the
 * FOUR checks it therefore does not run are enumerated rather than left to be
 * discovered, because the status this fake returns cannot distinguish them:
 *
 *   1. event-type registration and version (`unknown-event-type`,
 *      `unknown-event-version`) — the SERVER's registry, not this gateway's
 *      to own;
 *   2. the type-to-kind binding (`entity-kind-mismatch`);
 *   3. the per-event payload schema (`invalid-payload`) — the registry's too;
 *   4. the membership and invite entity-id coherence checks, which the real
 *      door reports under `malformed-envelope`, THE SAME CODE this fake
 *      returns. Ruling P20 applies literally: when two refusal reasons share
 *      an identifier, asserting that identifier is not a discriminating
 *      check — so a `malformed-envelope` from here is not evidence that
 *      `parseEvent` would have refused for the same reason.
 *
 * Measured reach, so the list is not read as wider than it is: none of the
 * four is reachable through this module's own builders while their declared
 * types are honoured. `buildWorkflowDefinedEvent` and
 * `buildTicketTypeDefinedEvent` emit entity kinds `workflow` and
 * `ticket-type`, neither of which carries a coherence check, and a
 * `PublishedWorkflowDef` that satisfies its own type also satisfies the
 * registry's payload schema — probed against the real `parseEvent`, the
 * nearest divergence needed `initialStateId: undefined`, which the type
 * forbids. The exposure is a later task that hand-assembles an envelope, or
 * submits a membership or invite event through this fake.
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
    /**
     * Version-aware since Task 3 (lifted 2026-09-19): omitted answers the
     * HIGHEST seeded version for that id, which is what the real read's
     * `ORDER BY version DESC LIMIT 1` branch does, and a number answers exactly
     * that version or null. Before this the fake answered the first match in
     * seed order, so a test could not tell "the latest" from "the first one you
     * listed" — a distinction the history screen exists to make.
     */
    getWorkflow: async (_workspaceId, workflowId, version) => {
      const versions = (seed.workflows ?? []).filter((workflow) => workflow.id === workflowId);
      if (version !== undefined) {
        return versions.find((workflow) => workflow.version === version) ?? null;
      }
      return versions.reduce<PublishedWorkflowDef | null>(
        (newest, current) => (newest === null || current.version > newest.version ? current : newest),
        null,
      );
    },
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
    getTicketCountsByType: async (_workspaceId) => {
      if (seed.typeCountsError === true) throw new Error('ticket count read failed (seeded)');
      return seed.typeCounts ?? {};
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
