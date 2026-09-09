import { membershipId, type LedgerEvent } from '@gisik-nokma/domain';
import type { Pool } from 'pg';
import { membershipsProjection } from '../../src/projections/proj-memberships.js';
import { projInvites } from '../../src/projections/proj-invites.js';
import { projProjects } from '../../src/projections/proj-projects.js';
import { projVisibility } from '../../src/projections/proj-visibility.js';
import { workflowsProjection } from '../../src/projections/workflows.js';
import { testEnvelope } from './envelope.js';
import { appendTestEvent } from './ledger.js';

/**
 * Scenario seeds for Plan 4's visibility tests: build the membership and
 * visibility state a viewer would really have, through the REAL events and the
 * REAL projections, never by writing the tables by hand.
 *
 * That is the point of the file. `canSee` reads `proj_memberships` through
 * `resolveEffectiveRole`, whose one safety property — a revoked member resolves
 * no projects THOUGH THE PROJECT-SCOPE ROW SURVIVES — is only observable if the
 * surviving row got there the way a real revocation leaves it. A fixture that
 * INSERTed the rows it wanted could seed the post-revocation state without the
 * revocation, and a test built on it would pass with the safety property
 * deleted.
 *
 * ## Every id is a ULID, and that is forced rather than tidy
 *
 * `ticketCreatedPayload.projectId`, `membershipGrantedPayload.userId`,
 * `projectMemberAddedPayload.userId` and `visibilitySetPayload.userIds` are all
 * `ulidString` (`packages/domain/src/envelope.js`), and the projections parse
 * their payloads with those very schemas. The plan text's `wks_01` / `usr_guest`
 * fixtures throw at the parse. Callers pass `newUlid()` values.
 *
 * ## `applyAll` takes a Pool and checks out ONE client
 *
 * `Projection.apply` takes a `PoolClient`, deliberately — a projection may only
 * write inside the ingest transaction (`src/projections/registry.ts`), and the
 * plan text's `Queryable` parameter here would not typecheck. One checkout for
 * the whole batch keeps the seeding on a single connection, which is also what
 * a real ingest transaction gives a projection.
 *
 * Projections are applied in the registry's own order — projects, then
 * memberships, then visibility (coordination doc §8) — so a seed cannot pass
 * under an order the product never uses. `projProjects` joined the list at
 * Plan 4 Task 9 and goes FIRST of the three because §8 puts it there; it is
 * inert for every event but `project.created`, so no existing caller changes
 * behaviour, but a wrong order here would make this docblock a lie.
 *
 * `projInvites` joined at Plan 4 Task 14, in its §8 position (after
 * memberships, before visibility), and it joined the HARD way: this list is
 * hand-written, so a new projection is silently absent here until somebody
 * notices a seeded event producing no row. It cost this task one debugging
 * round.
 *
 * *Absence, deliberately not closed here: this should read
 * `buildProjectionRegistry().all()` so a registrant cannot be missed. Doing it
 * inside Task 14 would start applying `proj_entity_heads`, `proj_workflows` and
 * `proj_contested` to every seeded event in twenty test files — a behaviour
 * change to fixtures this task has no business making. Owner: whoever next
 * touches this helper, or a dedicated cleanup.*
 */
/**
 * **FOUR of the registry's projections, and the name does not say so.** Projects,
 * memberships, invites, visibility — and nothing else.
 *
 * A projection ignores the event types it does not handle, so four silent
 * no-ops are indistinguishable from four successful applications: hand this a
 * `workflow.defined` and it goes NOWHERE and reports nothing. That cost a gate
 * round — `seedWorkflowDef()` below was written, imported and called, had no
 * effect, and the throw it was meant to prevent fired again with the fixture
 * looking correct.
 *
 * **It is NOT widened, and the reason was measured rather than predicted.**
 * Adding the workflows projection here looked like a no-op "because nothing
 * else passes a workflow event". Untrue: `test/visibility/visible-events-for.ts`
 * case 6.91 passes a `workflow.defined` with a STUB payload — it asks which
 * events reach a guest and never wanted the definition projected — and the real
 * projection parses that payload and throws. Widening this helper broke a case
 * that had every right to pass. So the seeder below applies the ONE projection
 * it needs to its OWN event, and this list stays four.
 */
export async function applyAll(pool: Pool, envs: readonly LedgerEvent[]): Promise<void> {
  const client = await pool.connect();
  try {
    for (const env of envs) {
      await projProjects.apply(env, client);
      await membershipsProjection.apply(env, client);
      await projInvites.apply(env, client);
      await projVisibility.apply(env, client);
    }
  } finally {
    client.release();
  }
}

/**
 * Found a project, through the real `project.created` event.
 *
 * Needed since Plan 4 Task 9 Step 3b: `checkProjectExists` refuses any event
 * naming a project `proj_projects` has no row for, so a seed that grants
 * membership on a project id nobody founded now produces a `project.unknown`
 * refusal rather than the refusal the test meant to observe. That is the check
 * working — and it is exactly why every refusal test here must found its
 * project first, so the refusal under test is the one that fires.
 */
export async function seedProject(
  pool: Pool,
  workspaceId: string,
  projectId: string,
  name = `Project ${projectId}`,
): Promise<void> {
  await applyAll(pool, [
    testEnvelope({
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.created',
      payload: { name },
      actorId: SEED_ACTOR,
    }),
  ]);
}

/** The actor every seed attributes its claims to. Any ULID; the tests never assert it. */
const SEED_ACTOR = '01J0SEEDADM1N0000000000000';

export interface SeedProject {
  projectId: string;
  projectAdmin?: boolean;
}

/**
 * A workspace member, optionally on some projects.
 *
 * The grant is filed against the MEMBERSHIP entity and each project attachment
 * against the PROJECT entity — two streams, exactly as the vocabulary files
 * them, because which entity a roster event belongs to is what decides which
 * rows a revocation may delete.
 */
export async function seedMember(
  pool: Pool,
  workspaceId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member',
  projects: readonly SeedProject[] = [],
): Promise<void> {
  const envs: LedgerEvent[] = [
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.granted',
      payload: { userId, role },
      actorId: SEED_ACTOR,
    }),
    ...projects.map((p) =>
      testEnvelope({
        workspaceId,
        entity: { kind: 'project', id: p.projectId },
        type: 'project.member_added',
        payload: { userId, projectAdmin: p.projectAdmin ?? false },
        actorId: SEED_ACTOR,
      }),
    ),
  ];
  await applyAll(pool, envs);
}

/**
 * A guest belongs to the workspace and to no project — the `projectId`
 * parameter the plan text once had is GONE rather than ignored, because a
 * caller passing one would be expressing an association this vocabulary no
 * longer has. What a guest can reach comes from `visibility.set` explicit lists
 * on individual tickets.
 */
export async function seedGuest(pool: Pool, workspaceId: string, userId: string): Promise<void> {
  await applyAll(pool, [
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.granted',
      payload: { userId, role: 'guest' },
      actorId: SEED_ACTOR,
    }),
  ]);
}

/**
 * Put someone out of the workspace, exactly as the product does.
 *
 * This deletes the WORKSPACE-scope row and nothing else — the projection's own
 * behaviour, not a simplification here — which is why a test using this helper
 * can assert that the project-scope row is still standing and that it confers
 * nothing.
 */
export async function revokeMember(
  pool: Pool,
  workspaceId: string,
  userId: string,
): Promise<void> {
  await applyAll(pool, [
    testEnvelope({
      workspaceId,
      entity: { kind: 'membership', id: membershipId(workspaceId, userId) },
      type: 'membership.revoked',
      payload: { userId },
      actorId: SEED_ACTOR,
    }),
  ]);
}

export interface SeedTicketArgs {
  workspaceId: string;
  projectId: string;
  ticketId: string;
  /** `null` is the claim "this is a root". The payload key is REQUIRED, not optional. */
  parentId?: string | null;
  typeId?: string;
  title?: string;
  createdBy?: string;
  /**
   * The `proj_tickets` head row's `state_category`. Defaults to `'open'`, which
   * is what every caller got before this parameter existed, so adding it changes
   * no fixture that does not ask.
   *
   * It exists because writing the head row at all made two `RollupView`
   * dimensions CONSTANT. Before the head row, no child had a category and every
   * one landed in `uncategorized`; after it, every child is `open`, so
   * `terminal` is 0 always AND `uncategorized` is 0 always. Two numbers that
   * cannot vary are two assertions that cannot fail, and the honest repair is a
   * fixture that can produce the other categories rather than expectations
   * rewritten to match the only world the seed can build.
   *
   * **`null` writes NO head row at all**, which is what `uncategorized` actually
   * counts. It is NOT a null column: `proj_tickets.state_category` is NOT NULL,
   * and `rollupFor` derives `uncategorized` from a `LEFT JOIN proj_tickets` that
   * MISSES — "a child `proj_visibility` knows and `proj_tickets` has no row
   * for", in its own words. So the only way to seed an uncategorized child is a
   * ticket that exists in the ledger and the visibility projection and has no
   * head row — exactly the world every fixture in this file lived in before the
   * head row was written, now available one ticket at a time.
   */
  stateCategory?: 'open' | 'active' | 'terminal' | null;
  /**
   * Assign the ticket to this user, as a REAL `ticket.assigned` event appended
   * in the same per-entity sequence as the creation — not just a column.
   *
   * Both halves are needed and neither alone is honest: `assembleTicketCards`
   * throws for a head row with an `assignee_id` and no assignment in the
   * ledger ("proj_tickets and the ledger disagree"), and `readMyWork` filters
   * on the COLUMN, so a fixture with only the event answers an empty list.
   * Seeding one without the other reproduces a corrupt store, not an assignment.
   */
  assigneeId?: string;
  /**
   * The `proj_tickets` head row's workflow and state (Task 16).
   *
   * Defaults are `SEED_WORKFLOW_ID`/`SEED_WORKFLOW_VERSION`/`SEED_STATE_ID`,
   * which is what every caller got before these existed, so no fixture that does
   * not ask changes. They exist for the same reason `stateCategory` does: with
   * `state_id` hardcoded to `'todo'`, "how many tickets are BLOCKED" was a
   * number that could not vary, and a count that cannot vary is an assertion
   * that cannot fail. `blocked` is a flag on the WORKFLOW's state
   * (`workflow.ts`), never a column here, so moving a ticket into a blocked
   * state means naming a definition that flags one — see
   * `seedWorkflowDefWithBlockedState`.
   *
   * Passing a `stateId` the named definition does not carry produces a world the
   * door cannot reach; every caller here passes one that exists.
   */
  workflowId?: string;
  workflowVersion?: number;
  stateId?: string;
}

/**
 * Creates the ticket in `proj_visibility` via the real `ticket.created` event,
 * AND appends that event to the ledger.
 *
 * The ledger append arrived with Plan 4 Task 9 and is not decoration.
 * Creatorship — Task 9's check 5 — has no projection to read on this branch:
 * `proj_tickets` does not exist and `proj_visibility` has no creator column, so
 * `check-permission.ts` reads `events.actor_id` on the ticket's own
 * `ticket.created` row. A fixture that only applied the projection would leave
 * every creator lookup answering null, and the creator cases below would pass
 * or fail for a reason unrelated to creatorship. It also makes
 * `workspaceHasLedger` answer truthfully for a workspace that has tickets in
 * it, which is what a real workspace looks like.
 *
 * ## The `proj_tickets` head row is written too, and it is a DIRECT INSERT
 *
 * The paragraph here used to read "the plan text's version also INSERTed a
 * `proj_tickets` head row; that table does not exist on this branch (Plan 3 Task
 * 12 owns it)". The table landed and the sentence outlived its condition — a
 * docblock naming an absence is a claim with a shelf life — so the plan's row is
 * restored, and the reason it MUST be is a property of the product rather than a
 * convenience: `ticketsProjection` and `projVisibility` are both in the registry
 * (`src/projections/index.ts`) and both run inside ONE ingest transaction, so no
 * request can produce a `proj_visibility` row whose ticket has no
 * `proj_tickets` row. A fixture that produced one was seeding a world the door
 * cannot reach, and the single ticket read now throws on it — correctly, because
 * that state means the two projections disagree.
 *
 * It is an INSERT rather than a run of `ticketsProjection`, which is a
 * deliberate exception to this file's own rule, and the reason is stated rather
 * than hidden. The real projection resolves the ticket's TYPE and WORKFLOW
 * through `proj_ticket_types` and `proj_workflows` (`loadDeps`), which are
 * populated by the founding sequence these fixtures deliberately do not run —
 * they seed memberships and visibility directly. Running it would mean appending
 * a workspace's whole founding sequence per seeded ticket, which moves every
 * `workspace_seq` in twenty test files, several of which assert exact event
 * sequences. So the head row is written with the values the reducer would
 * produce from the very `ticket.created` above (its type, its parent, its title
 * claim carrying that event's actor and both clocks) and fixture-chosen
 * defaults for the workflow this world has no definition of.
 *
 * What this buys, beyond making the seeded world reachable: the title on it is
 * the SAME claim the ledger event carries, so a route that serves the title and
 * a check that reads the event cannot disagree about what somebody claimed.
 */
export async function seedTicket(pool: Pool, args: SeedTicketArgs): Promise<void> {
  const created = testEnvelope({
    workspaceId: args.workspaceId,
    entity: { kind: 'ticket', id: args.ticketId },
    type: 'ticket.created',
    payload: {
      typeId: args.typeId ?? 'task',
      projectId: args.projectId,
      parentId: args.parentId ?? null,
      title: args.title ?? `Ticket ${args.ticketId}`,
    },
    actorId: args.createdBy ?? SEED_ACTOR,
  });
  await appendTestEvent(pool, created);
  await applyAll(pool, [created]);
  if (args.assigneeId !== undefined) {
    const assigned = testEnvelope({
      workspaceId: args.workspaceId,
      entity: { kind: 'ticket', id: args.ticketId },
      type: 'ticket.assigned',
      payload: { assigneeId: args.assigneeId },
      actorId: args.createdBy ?? SEED_ACTOR,
    });
    await appendTestEvent(pool, assigned);
    await applyAll(pool, [assigned]);
  }
  // `stateCategory: null` means NO head row — see `SeedTicketArgs`. Every other
  // caller passes nothing and gets one, as they did before the option existed.
  if (args.stateCategory !== null) {
    await insertTicketHead(pool, args, created);
  }
}

/**
 * The fixture world's workflow. `seedTicket` writes `proj_tickets` rows naming
 * `wf-seed@1` and **does not publish a definition for it** — a shortcut that was
 * invisible while nothing read a ticket's state NAME off these rows.
 *
 * It is visible now. `readMyWork` serves `stateNames` (ruling P40's change set)
 * and throws, exactly as `assembleListCards` already did, when a ticket names a
 * definition `proj_workflows` does not hold — which is not a state the product
 * path can reach, because the door refuses a `ticket.created` whose type names
 * an unpublished workflow. So the throw is right and the FIXTURE is the
 * incoherent thing.
 *
 * `seedWorkflowDef()` below is the opt-in fix, and it is opt-in deliberately:
 * `seedTicket` is used by twenty-three test files and ten of them read
 * `proj_workflows`, so making every seeded world publish a definition would
 * change what those files count. **Owner for the general fix: whoever next
 * needs a state name over a `seedTicket` world** — at that point the choice is
 * to publish here for everyone and re-measure the ten, or keep opting in.
 * `verify-projections` diffs projections against a ledger replay, so any fix
 * must go through an EVENT and never a direct `proj_workflows` insert.
 */
const SEED_WORKFLOW_ID = 'wf-seed';
const SEED_WORKFLOW_VERSION = 1;
const SEED_STATE_ID = 'todo';

/**
 * The `proj_tickets` head row the ingest transaction would have written beside
 * the `proj_visibility` one. See `seedTicket`'s docblock for why it is an
 * INSERT.
 *
 * `ON CONFLICT DO NOTHING` because two fixtures may seed the same ticket id in
 * one file and the first write is the one the event ledger already agrees with.
 */
async function insertTicketHead(
  pool: Pool,
  args: SeedTicketArgs,
  created: LedgerEvent,
): Promise<void> {
  const title = args.title ?? `Ticket ${args.ticketId}`;
  await pool.query(
    `INSERT INTO proj_tickets
       (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, workflow_version,
        state_id, state_category, assignee_id, collaborator_ids, fields, transitions)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (ticket_id) DO NOTHING`,
    [
      args.ticketId,
      args.workspaceId,
      args.projectId,
      args.typeId ?? 'task',
      args.parentId ?? null,
      args.workflowId ?? SEED_WORKFLOW_ID,
      args.workflowVersion ?? SEED_WORKFLOW_VERSION,
      args.stateId ?? SEED_STATE_ID,
      args.stateCategory ?? 'open',
      // The COLUMN half of an assignment; the ledger half is appended above.
      args.assigneeId ?? null,
      JSON.stringify([]),
      JSON.stringify({
        title: {
          value: title,
          actorId: created.actorId,
          clientTime: created.clientTime,
          serverTime: created.serverTime,
        },
      }),
      JSON.stringify([]),
    ],
  );
}

/**
 * A `visibility.set` claim, filed against the ticket it is about.
 *
 * `payload.ticketId` restates the entity id here, which is the coherent case.
 * A claim where the two DISAGREE is Task 9's refusal to make; the projection
 * keys on the entity regardless (`proj-visibility.ts`).
 */
/**
 * `workflow.defined` for the workflow `seedTicket`'s rows already name, so a
 * fixture world can answer a ticket's state NAME.
 *
 * Version 1 with the three states `SEED_STATE_ID` sits in the first of, so a
 * ticket seeded before or after it resolves the same way. Published as an EVENT
 * rather than inserted, because `verify-projections` rebuilds every projection
 * from the ledger and diffs it against the live table: a row with no event
 * behind it fails that comparison.
 *
 * Idempotent in practice — `proj_workflows` is `ON CONFLICT (workflow_id,
 * version) DO NOTHING` — but call it once per world; a second call appends a
 * second identical event to the ledger.
 */
export async function seedWorkflowDef(
  pool: Pool,
  workspaceId: string,
  actorId: string = SEED_ACTOR,
): Promise<void> {
  const env = testEnvelope({
    workspaceId,
    entity: { kind: 'workflow', id: SEED_WORKFLOW_ID },
    type: 'workflow.defined',
    payload: {
      id: SEED_WORKFLOW_ID,
      version: SEED_WORKFLOW_VERSION,
      name: 'Seed flow',
      initialStateId: SEED_STATE_ID,
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: '*', to: 'todo', rules: [] },
        { from: '*', to: 'doing', rules: [] },
        { from: '*', to: 'done', rules: [] },
      ],
    },
    actorId,
  });
  // The event is APPENDED as well as projected, so the world stays one a replay
  // could rebuild — the principle this file's own docblock states. It applies
  // the ONE projection it needs rather than going through `applyAll` (which
  // does not carry it) or the full registry (whose ticket projection would
  // forward-fold every row in the workspace to this version, which is the
  // behaviour case 7.210 turns on).
  await appendTestEvent(pool, env);
  const client = await pool.connect();
  try {
    await workflowsProjection.apply(env, client);
  } finally {
    client.release();
  }
}

export function setVisibilityEnv(
  workspaceId: string,
  ticketId: string,
  mode: 'workspace' | 'project' | 'explicit' | 'inherit',
  userIds?: readonly string[],
  actorId: string = SEED_ACTOR,
): LedgerEvent {
  return testEnvelope({
    workspaceId,
    entity: { kind: 'ticket', id: ticketId },
    type: 'visibility.set',
    payload: { ticketId, mode, ...(userIds ? { userIds: [...userIds] } : {}) },
    actorId,
  });
}

/** The workflow id `seedWorkflowDefWithBlockedState` publishes, and the two states worth naming. */
export const BLOCKED_WORKFLOW_ID = 'wf-blocked';
export const BLOCKED_WORKFLOW_VERSION = 1;
/** Carries `blocked: true`. */
export const BLOCKED_STATE_ID = 'waiting';
/** Does not. The negative control for every blocked-count assertion. */
export const UNBLOCKED_STATE_ID = 'doing';

/**
 * A SECOND workflow, whose `waiting` state carries `blocked: true` (Task 16).
 *
 * A second definition rather than a blocked state added to `seedWorkflowDef`'s
 * `wf-seed`: that one's three states are read by fixtures across this suite —
 * `state-occupancy` counts them, and `blocked_states` is derived from the
 * DEFINITION — so adding a fourth would move numbers in tests that never asked
 * about blocking. Publishing a separate id changes nothing for anyone who does
 * not name it.
 *
 * `blocked: true` is the real flag `workflowStateSchema` declares, and
 * `BLOCKED_STATES_CTE` reads it out of `definition -> 'states'` — so a ticket
 * whose head row names `(wf-blocked, waiting)` is blocked by the same expression
 * the board, the list and the attention strip count with, not by a fixture
 * convention.
 *
 * The event is appended AND projected, for the reason `seedWorkflowDef` gives:
 * `verify-projections` rebuilds from the ledger and diffs, so a row with no
 * event behind it fails that comparison.
 */
export async function seedWorkflowDefWithBlockedState(
  pool: Pool,
  workspaceId: string,
  actorId: string = SEED_ACTOR,
): Promise<void> {
  const env = testEnvelope({
    workspaceId,
    entity: { kind: 'workflow', id: BLOCKED_WORKFLOW_ID },
    type: 'workflow.defined',
    payload: {
      id: BLOCKED_WORKFLOW_ID,
      version: BLOCKED_WORKFLOW_VERSION,
      name: 'Blocking flow',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: UNBLOCKED_STATE_ID, name: 'Doing', category: 'active' },
        { id: BLOCKED_STATE_ID, name: 'Waiting', category: 'active', blocked: true },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: '*', to: 'todo', rules: [] },
        { from: '*', to: UNBLOCKED_STATE_ID, rules: [] },
        { from: '*', to: BLOCKED_STATE_ID, rules: [] },
        { from: '*', to: 'done', rules: [] },
      ],
    },
    actorId,
  });
  await appendTestEvent(pool, env);
  const client = await pool.connect();
  try {
    await workflowsProjection.apply(env, client);
  } finally {
    client.release();
  }
}
