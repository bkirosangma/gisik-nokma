import {
  builtinTicketTypeDefs,
  membershipId,
  newUlid,
  simpleKanbanWorkflowDef,
  type IngestResult,
  type SubmittedEvent,
} from '@gisik-nokma/domain';

/**
 * How the founding sequence reaches the ledger: the INTERNAL, ungated append
 * path (`IngestService.ingestBatch`), never the client door.
 *
 * A batch rather than the plan text's one-event `append`, because the ledger's
 * order is what this sequence is about and a batch keeps the ordering decision
 * in one place instead of in a loop a later edit could reorder.
 */
export type InternalAppend = (events: SubmittedEvent[]) => Promise<IngestResult[]>;

/** The founding event's own facts — everything the sequence is derived from. */
export type FoundingEvent = Pick<SubmittedEvent, 'workspaceId' | 'actorId' | 'clientTime'>;

/**
 * Everything a workspace needs to be usable, as events, in the order they must
 * be appended.
 *
 * Pure and separately exported so a test can read the sequence without a
 * database — the shape is the contract, and asserting it through five table
 * reads would pin the projections rather than the sequence.
 *
 * ORDER IS LOAD-BEARING, and the honest reason is narrower than the plan
 * text's. The plan says a `ticket-type.defined` naming an undefined workflow is
 * refused, so the types must follow the workflow. **That refusal is not in the
 * shipped engine**: `checkTicketTypeDefined`
 * (`packages/rule-engine/src/checks/ticket-type.ts`) takes `_ctx` unread on
 * purpose and checks entity kind, payload shape and the built-in rank lock —
 * nothing else. So today the order is load-bearing for a different reason and
 * cannot be relaxed for either:
 *
 * - The ledger is the workspace's history. A type binding read back at any
 *   workspace_seq must name a workflow that already exists at that position, or
 *   a replay of the first six events describes a workspace that could not have
 *   worked. Ordering is the only thing that makes the ledger honest here,
 *   because nothing refuses the dishonest version.
 * - The founder's grant stays LAST. Nothing before it depends on the founder
 *   being a member — these are the server's own appends through the internal
 *   door — so putting it first would buy nothing and would make the sequence
 *   look as though it did.
 *
 * Recorded rather than repeated: the plan text's justification for the order is
 * a refusal that does not exist. **Owner: Plan 3 Chain B**, which lands
 * `proj_ticket_types` and is where a workflow-existence check on
 * `ticket-type.defined` would go if the series wants one.
 */
export function foundingSequence(founding: FoundingEvent): SubmittedEvent[] {
  const workflowDef = simpleKanbanWorkflowDef(newUlid());
  const serverEvent = (
    entity: SubmittedEvent['entity'],
    type: string,
    payload: unknown,
  ): SubmittedEvent => ({
    id: newUlid(),
    workspaceId: founding.workspaceId,
    entity,
    type,
    version: 1,
    payload,
    actorId: founding.actorId,
    // envelope-origin `'server'` — the provenance enum, not the HTTP `Origin`
    // header. These records are the server's, and they are honest about it.
    // They are accepted because they arrive through the internal door, NOT
    // because of this value: the client door refuses this exact value, which is
    // the whole point of `SERVER_ORIGIN_REASON`.
    origin: 'server',
    // The founding event's own claimed instant. Not `new Date()`: the sequence
    // is one act with the founding, and serverTime — the received instant — is
    // assigned per event by ingest anyway, so the ordering a reader sees comes
    // from the ledger's own cursor rather than from a clock read here.
    clientTime: founding.clientTime,
  });

  return [
    serverEvent({ kind: 'workflow', id: workflowDef.id }, 'workflow.defined', workflowDef),
    // A fresh entity ULID per ticket-type submission; the payload's `id` is the
    // stable type key (`epic`, `story`, `task`, `sub-task`) and the projection
    // folds by it (Plan 8 design decision 6).
    ...builtinTicketTypeDefs(workflowDef.id).map((def) =>
      serverEvent({ kind: 'ticket-type', id: newUlid() }, 'ticket-type.defined', def),
    ),
    serverEvent(
      { kind: 'membership', id: membershipId(founding.workspaceId, founding.actorId) },
      'membership.granted',
      { userId: founding.actorId, role: 'owner' },
    ),
  ];
}

/**
 * Appends the founding sequence immediately after a `workspace.created` is
 * accepted (owner decision 2026-08-26, "A new workspace can hold a ticket the
 * moment it exists").
 *
 * Founding a workspace must leave its founder owning it, or nobody can ever act
 * again. It must also leave the workspace ABLE TO ACCEPT ITS FIRST TICKET, and
 * before this nothing in the series emitted a workflow or the built-in ticket
 * types at creation — so the first `ticket.created` in a product-founded
 * workspace was refused for an unknown type and the workspace was permanently
 * unusable.
 *
 * ## It THROWS on anything that is not a clean commit, and that is the design
 *
 * A workspace whose founding sequence half-landed is the exact object this
 * decision exists to prevent, and it cannot be repaired by a retry: the
 * `workspace.created` has committed, so a re-submission answers
 * `duplicate-event-id` and this function never runs again. A returned error
 * would be a value some caller has to remember to read. A throw reaches the
 * ingest service's own unexpected-error path, which rejects the whole batch
 * loudly and leaves the operator a stack trace instead of a workspace that
 * looks founded and is not.
 */
export async function bootstrapWorkspace(
  founding: FoundingEvent,
  append: InternalAppend,
): Promise<SubmittedEvent[]> {
  const sequence = foundingSequence(founding);
  const results = await append(sequence);
  // Length first: a short results array would make the per-result loop below
  // pass over the events it never saw, which is a check that cannot fail for
  // exactly the missing half.
  if (results.length !== sequence.length) {
    throw new Error(
      `bootstrapWorkspace: appended ${sequence.length} events for workspace ${founding.workspaceId} ` +
        `and got ${results.length} results back`,
    );
  }
  results.forEach((result, index) => {
    if (result.status !== 'committed') {
      throw new Error(
        `bootstrapWorkspace: founding sequence for workspace ${founding.workspaceId} failed at ` +
          `event ${index} (${sequence[index]?.type ?? 'unknown'}): ${JSON.stringify(result)}`,
      );
    }
  });
  return sequence;
}
