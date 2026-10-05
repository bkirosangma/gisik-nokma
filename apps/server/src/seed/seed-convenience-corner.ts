import { ERRAND_WITH_WAITS_TEMPLATE, membershipId } from '@gisik-nokma/domain';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { IngestService } from '../ingest/ingest-service.js';
import { errandItems, readCcBoard } from './cc-board.js';
import { buildErrandEvents, type CcMapContext } from './cc-map.js';
import { seedUlid } from './seed-ulid.js';
import { checkErrandTemplate, workflowFromTemplate } from './templates.js';

/**
 * What a seed is allowed to do with ingest: the GATED CLIENT door, and nothing
 * else. Deliberately not `IngestService`.
 *
 * The narrowing is the same guard `ClientIngest` puts in front of a route, for
 * the same reason: `ingestBatch` is the shorter, more obvious name and it is
 * the ungated one. A dogfooding seed that reached for it would be demoing a
 * product nobody can use — it would never meet the refusals a real person meets,
 * so the seeded board would prove nothing about whether the product's own rules
 * admit the record. With this type, `deps.ingest.ingestBatch(...)` in this
 * module is a COMPILE error rather than a documented mistake.
 */
export type SeedIngest = Pick<IngestService, 'ingestClientBatch'>;

/**
 * CONTRACT NOTE FOR TASK 10 — this shape DIVERGES from the plan's Produces,
 * deliberately, and Task 10 reuses this module.
 *
 * The plan specifies `{ ingest; resolveUserId; now? }`. What landed is
 * `{ ingest; resolveUserId; existingEventIds; now? }`, and the two differences
 * are both load-bearing:
 *
 * - `existingEventIds` is REQUIRED, not optional. A caller written to the
 *   plan's three-field shape will not compile. That is the intended outcome:
 *   an optional one defaulting to "nothing is present" would silently restore
 *   the plan's unreachable idempotence mechanism (see the field's own note) and
 *   a second run would try to re-submit every event and fail at the first
 *   refusal. `existingSeedEventIds` below is the ready-made implementation —
 *   exported for exactly this reason, so there is one definition of "already
 *   present" and not two.
 * - `ingest` is narrowed to `SeedIngest`, not `IngestService`. An
 *   `IngestService` still satisfies it; the reverse does NOT. A Task 10 seed
 *   that types its own dependency as `IngestService` regains the ungated
 *   `ingestBatch` and loses the compile error that keeps the seed at the door a
 *   person uses.
 *
 * `SeedReport` is exported from this same module and Task 10 is specified to
 * reuse it, so a Task 10 that imports the report inherits this file — and these
 * two constraints with it.
 */
export type CcSeedDeps = {
  ingest: SeedIngest;
  resolveUserId(email: string): Promise<string | null>;
  /**
   * Which of these seed event ids the ledger already holds.
   *
   * The plan's idempotence mechanism was "re-submit the same deterministic ids
   * and count `duplicate-event-id`". That answer is UNREACHABLE for most of this
   * seed's events, at either door, because the duplicate is only discovered by
   * the primary key at `insertEvent` — and three checks fire before it ever
   * gets there. See the note on `partitionBySeen` below for the measured list.
   *
   * So the ledger is asked the same question one step earlier. Everything this
   * seed does submit still goes through `ingestClientBatch` in full: the gate is
   * not routed around, it is simply not asked to adjudicate an event nobody is
   * making a second time.
   */
  existingEventIds(ids: readonly string[]): Promise<Set<string>>;
  now?: () => Date;
};

export type CcSeedOptions = {
  boardPath: string;
  ownerEmail: string;
  accountantEmail: string | null;
  allowMissingGuest: boolean;
};

/**
 * What a seed run did. Shared with Task 10's dev seed, which reports the same
 * four numbers about a different record.
 *
 * `skippedExisting` counts events this run BUILT and found already in the
 * ledger — the idempotence measure. `committed` counts what actually landed.
 * On a second run of an unchanged record the first is everything and the second
 * is zero.
 *
 * Task 10 imports this type from HERE. Importing it also means adopting this
 * module's `CcSeedDeps` divergence from the plan text — see the contract note
 * on `CcSeedDeps` above before writing the dev seed's own deps.
 */
export type SeedReport = {
  committed: number;
  skippedExisting: number;
  tickets: number;
  guestConfigured: boolean;
};

/**
 * The ledger's answer to "which of these ids do you already hold".
 *
 * One round trip with `= ANY($1)` rather than a query per id: the seed builds
 * ~118 events and a per-id loop would be 118 round trips to learn one boolean
 * each. `events.id` is `text PRIMARY KEY`, so this is an index probe per id.
 *
 * Exported for Task 10's dev seed, which needs exactly this seam for exactly
 * this reason — one definition of "already present", not two.
 */
export async function existingSeedEventIds(db: Queryable, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) {
    return new Set();
  }
  const { rows } = await db.query<{ id: string }>('SELECT id FROM events WHERE id = ANY($1)', [[...ids]]);
  return new Set(rows.map((row) => row.id));
}

export async function seedConvenienceCorner(deps: CcSeedDeps, options: CcSeedOptions): Promise<SeedReport> {
  const board = readCcBoard(options.boardPath);
  const errands = errandItems(board);

  const ownerUserId = await deps.resolveUserId(options.ownerEmail);
  if (!ownerUserId) {
    throw new Error(
      `no user has the email ${options.ownerEmail} — the owner must sign in once before seeding; the seed never invents people.`,
    );
  }
  const accountantUserId = options.accountantEmail ? await deps.resolveUserId(options.accountantEmail) : null;
  if (options.accountantEmail && !accountantUserId && !options.allowMissingGuest) {
    throw new Error(
      `no user has the email ${options.accountantEmail} — have the accountant sign in first, or pass --allow-missing-guest and re-run later (the seed is idempotent).`,
    );
  }

  const templateCheck = checkErrandTemplate(ERRAND_WITH_WAITS_TEMPLATE);
  if (!templateCheck.ok) {
    throw new Error(`the errand-with-waits template cannot carry the tracker board: ${templateCheck.problems.join('; ')}`);
  }

  const workspaceId = seedUlid('workspace', 'convenience-corner');
  const projectId = seedUlid('project', 'cc#shop-operations');
  const errandWorkflowId = seedUlid('workflow', 'cc#errand-with-waits');
  const errandWorkflow = workflowFromTemplate(ERRAND_WITH_WAITS_TEMPLATE, errandWorkflowId);
  const clientTime = (deps.now?.() ?? new Date()).toISOString();

  const events: SubmittedEvent[] = [];
  const push = (key: string, entity: SubmittedEvent['entity'], type: string, payload: unknown): void => {
    events.push({
      id: seedUlid('event', key),
      workspaceId,
      entity,
      type,
      version: 1,
      payload,
      actorId: ownerUserId,
      // 'web', NOT the plan text's 'server'. This seed submits through the
      // client door, and `checkRolePermission` refuses a client-submitted event
      // wearing the server's own provenance — "Only the server itself may
      // record server-origin events". It is also simply true: these are the
      // owner's claims about their own shop, made by a tool they ran.
      origin: 'web',
      clientTime,
    });
  };

  // Founding is NOT re-implemented here. Ingesting `workspace.created` runs
  // Plan 4's bootstrap in the same transaction, which appends the simple-Kanban
  // workflow, the five built-in ticket types bound to it, and the founder's
  // owner grant — in that order, through the INTERNAL door, regardless of which
  // door the founding itself arrived at. A seed that emitted its own copies
  // would be a second founding sequence, free to drift from the real one, and
  // it would be the version everybody sees demoed. So this seed adds only what
  // is genuinely particular to the shop.
  push('cc#workspace#created', { kind: 'workspace', id: workspaceId }, 'workspace.created', {
    name: 'Convenience Corner',
  });
  push('cc#project#shop-operations', { kind: 'project', id: projectId }, 'project.created', {
    name: 'Shop operations',
  });
  // THE OWNER JOINS THEIR OWN PROJECT, and this event is in no version of the
  // plan text. It is what the client door costs, and it is the door working as
  // designed: `checkVisibilityPermission`'s `ticket.created` branch requires
  // `ctx.eff.projects.has(projectId)`, `eff.projects` is built from
  // `project.member_added` and from nowhere else (`effective-role.ts`), and
  // there is deliberately NO admin shortcut — "an admin who wants to create
  // work in a project joins it first, which is an attributed event, rather than
  // reaching in unrecorded". Without it every one of the 25 `ticket.created`
  // events is refused `permission.role` — "You are not a member of this
  // project, so you cannot create tickets in it." — measured, not predicted.
  //
  // `projectAdmin: true` is the honest flag rather than the convenient one: the
  // shop's owner runs this project's roster and its tickets' visibility. It is
  // also required with no default (`projectMemberAddedPayload`) — a project-admin
  // flag is a claim, not a default.
  push('cc#project#owner-joined', { kind: 'project', id: projectId }, 'project.member_added', {
    userId: ownerUserId,
    projectAdmin: true,
  });
  push('cc#workflow#errand-with-waits', { kind: 'workflow', id: errandWorkflowId }, 'workflow.defined', errandWorkflow);
  // The ENTITY id is a ULID; the PAYLOAD id is the stable type key. The plan
  // text files this event against `{kind:'ticket-type', id:'errand'}` and the
  // door answers `malformed-envelope … entity.id: must be a ULID` — measured.
  // `entitySchema` (envelope.ts) admits a non-ULID entity id for exactly one
  // kind, `membership`, and `ticket-type` is not it. The founding sequence
  // spells it the same way: "a fresh entity ULID per ticket-type submission;
  // the payload's `id` is the stable type key" (bootstrap-workspace.ts).
  push('cc#type#errand', { kind: 'ticket-type', id: seedUlid('ticket-type', 'cc#errand') }, 'ticket-type.defined', {
    id: 'errand',
    name: 'Errand',
    icon: '📮',
    rank: 3,
    workflowId: errandWorkflowId,
    // ONLY `counterparty`. `startDate` is a BUILT-IN field
    // (`ticket-types.ts` BUILTIN_FIELD_IDS) and `ticketTypeDefSchema` refuses a
    // custom field id that shadows one; the plan text declares both and its
    // type definition would be rejected by the domain schema.
    fields: [{ id: 'counterparty', name: 'Counterparty', type: 'text' }],
  });

  const epicTicketIds = {
    registrations: seedUlid('ticket', 'cc#epic#registrations'),
    questions: seedUlid('ticket', 'cc#epic#questions'),
  } as const;
  const epicLabel = (epicId: string): string => {
    const epic = board.epics.find((candidate) => candidate.id === epicId);
    if (!epic) throw new Error(`the snapshot has no epic '${epicId}' — has reference/ been re-snapshotted?`);
    return epic.label;
  };
  push('cc#epic#registrations#created', { kind: 'ticket', id: epicTicketIds.registrations }, 'ticket.created', {
    typeId: 'epic',
    projectId,
    parentId: null,
    title: epicLabel('registrations'),
  });
  push('cc#epic#questions#created', { kind: 'ticket', id: epicTicketIds.questions }, 'ticket.created', {
    typeId: 'epic',
    projectId,
    parentId: null,
    title: epicLabel('questions'),
  });

  const mapContext: CcMapContext = {
    workspaceId,
    projectId,
    ownerUserId,
    // The literal id declared by the `ticket-type.defined` above, and the
    // initial state read off the LIVE cloned definition rather than guessed.
    errandTypeId: 'errand',
    epicTicketIds,
    initialStateId: errandWorkflow.initialStateId,
    week1: board.week1,
    titleById: new Map(board.items.map((item) => [item.id, item.title])),
    clientTime,
  };
  for (const item of errands) {
    // `origin` is overridden because `cc-map.ts` (Task 8, landed) hardcodes
    // `'server'` in its own push helper, and this seed goes through the client
    // door where that provenance is refused outright. The override is a pure
    // envelope rewrite — nothing about the claim changes — and cc-map stays
    // frozen. Task 8 should take an origin from `CcMapContext`; until it does,
    // this is the one place that knows which door the events are headed for.
    for (const event of buildErrandEvents(item, mapContext)) {
      events.push({ ...event, origin: 'web' });
    }
  }

  const guestConfigured = accountantUserId !== null;
  if (accountantUserId) {
    // Workspace-scope grant, no project (owner decision 2026-08-27: membership
    // is workspace-scoped only, and this event's parser now REFUSES a scope).
    push(
      'cc#membership#accountant',
      { kind: 'membership', id: membershipId(workspaceId, accountantUserId) },
      'membership.granted',
      { userId: accountantUserId, role: 'guest' },
    );
    // Explicit visibility on exactly the tickets whose record names the
    // accountant. The owner stays listed: the explicit list is exactly the
    // authored list (Plan 4), and losing sight of your own errand is a legal
    // claim nobody wants seeded.
    for (const item of errands.filter((candidate) => candidate.meta.who === 'Accountant')) {
      const ticketId = seedUlid('ticket', `cc#${item.id}`);
      push(`cc#${item.id}#visibility`, { kind: 'ticket', id: ticketId }, 'visibility.set', {
        ticketId,
        mode: 'explicit',
        userIds: [ownerUserId, accountantUserId],
      });
    }
  }

  // A collision here would be silent otherwise: two records hashing to one
  // seed id would answer `duplicate-event-id` and be counted as "already
  // present", so half the board would quietly not be seeded. Measured on the
  // frozen snapshot: 0 collisions across the whole batch. This is the check
  // that keeps that a fact rather than an assumption if `reference/` is ever
  // re-snapshotted with a repeated tracker id.
  const ids = events.map((event) => event.id);
  if (new Set(ids).size !== ids.length) {
    const seenIds = new Set<string>();
    const repeatedIds = new Set<string>();
    for (const id of ids) {
      if (seenIds.has(id)) repeatedIds.add(id);
      seenIds.add(id);
    }
    const repeated = [...repeatedIds];
    throw new Error(
      `the seed built ${repeated.length} duplicate event id(s) (${repeated.join(', ')}) — two records share a key, so one of them would be silently skipped as "already present".`,
    );
  }

  // IDEMPOTENCE, and NOT the way the plan text says.
  //
  // The plan's mechanism is "re-submit the same deterministic ids; the ledger
  // answers `duplicate-event-id`; count those as already present". That answer
  // is unreachable for most of this seed's events at EITHER door, because the
  // duplicate is only discovered by the primary key inside `insertEvent`, and
  // three earlier checks refuse first. All three were measured against a real
  // database on the second run of this seed:
  //
  // - `workspace.created` → `permission.role`, "This workspace has already been
  //   founded; it cannot be founded again." (client door; `check-permission.ts`)
  // - `workflow.defined` v1 → `workflow.version`, "…is at version 1; the next
  //   published version must be 2, not 1." (engine; door-independent)
  // - `ticket.created` → `ticket.already-exists` (engine, `hierarchy.ts:82`;
  //   door-independent)
  // - `ticket.transitioned` → `transition.illegal`, next→next is not a
  //   transition any workflow has (engine; door-independent)
  //
  // Whitelisting those refusals as "already present" was considered and
  // REFUSED: `transition.illegal` also fires when the state mapping is wrong,
  // so accepting it as idempotence would build a check that cannot fail for the
  // one defect this seed is most able to introduce.
  //
  // So the ledger is asked the same question one step earlier and the events it
  // already holds are not re-submitted. This is not routing around the gate:
  // every event that IS submitted goes through `ingestClientBatch` in full, and
  // an event nobody is claiming a second time is not an event the gate has an
  // opinion about. `duplicate-event-id` stays in the accepted set below for the
  // race between this read and the submit.
  const alreadyPresent = await deps.existingEventIds(ids);
  const pending = events.filter((event) => !alreadyPresent.has(event.id));
  let committed = 0;
  let skippedExisting = events.length - pending.length;

  const results = await deps.ingest.ingestClientBatch(pending, ownerUserId);
  results.forEach((result, index) => {
    if (result.status === 'committed') {
      committed += 1;
    } else if (result.status === 'invalid' && result.code === 'duplicate-event-id') {
      skippedExisting += 1;
    } else {
      const event = pending[index];
      throw new Error(
        `seed event ${event?.type} (${event?.id}) was not accepted: ${JSON.stringify(result)} — a seed that cannot land cleanly must fail loudly, not partially.`,
      );
    }
  });

  return { committed, skippedExisting, tickets: errands.length, guestConfigured };
}
