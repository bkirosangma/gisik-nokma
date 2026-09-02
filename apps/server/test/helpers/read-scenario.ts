import type { Pool } from 'pg';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from './apply.js';

/**
 * The frozen "now" every read test computes against.
 *
 * Written with an explicit `Z`, and that is load-bearing rather than tidy.
 * `new Date('2026-08-20T12:00:00')` — the same literal without the suffix — is
 * parsed in the AMBIENT zone, so on the two machines this repo is developed on
 * (both Asia/Kolkata) it would silently mean 06:30Z, and every "is this
 * overdue / stale / due today" assertion written against it would pass for a
 * reason that has nothing to do with the code. `read-scenario.test.ts` pins
 * that: the Z-spelling is one instant under three zones, the suffix-less one is
 * 5h30m adrift under Asia/Kolkata, and a probe first proves the harness can
 * move the ambient zone at all — without which the pair would be a check that
 * cannot fail. What it pins is the FIXTURE CONVENTION for Tasks 6-15; nothing
 * in Task 5 reads a clock.
 */
export const SCENARIO_NOW = new Date('2026-08-20T12:00:00.000Z');

/**
 * The one due-date claim on the epic's child, as an IST day literal.
 *
 * A LITERAL, never `istDayOf(SCENARIO_NOW)` or any other derivation: a fixture
 * day computed from a clock moves with the machine that runs it, and then a
 * test that says "due in five days" is really saying "due in five days if the
 * runner is in India". Exported so a read test can name the day it expects
 * without re-typing it and drifting from what was actually seeded.
 */
export const SCENARIO_DUE_DAY = '2026-08-25';

/** The workflow and ticket-type entity ids this world defines — see the one-seed rule below. */
const SCENARIO_WORKFLOW_ID = 'wf-errands';
const SCENARIO_TYPE_IDS = ['epic', 'task'] as const;

export type ReadScenarioUsers = { owner: string; member: string; outsider: string; guest: string };

export type ReadScenario = ReadScenarioUsers & {
  workspaceId: string;
  projectId: string;
  workflowId: string;
  epicId: string;
  taskInEpicId: string;
  sharedTaskId: string;
  hiddenTaskId: string;
  guestTaskId: string;
};

export function scenarioUsers(): ReadScenarioUsers {
  return { owner: newUlid(), member: newUlid(), outsider: newUlid(), guest: newUlid() };
}

/**
 * One seeded world — the fixture Plan 5's read tasks share.
 *
 * - owner (workspace owner, on the project, project admin)
 * - member (workspace member, on the project)
 * - outsider (workspace member, NOT on the project)
 * - guest (workspace-scope role 'guest', on no project)
 * - epic "Registrations drive" (project-mode root) with child task
 *   "File the GST return" (assigned to member, due 2026-08-25, description,
 *   a comment mentioning the owner, in 'doing' since 2026-08-01 — stale bait)
 * - "Renew the trade licence" (explicit: owner+member) sitting in the
 *   blocked-flagged 'waiting' state
 * - "Salary review — keep private" (explicit: owner ONLY — the planted
 *   invisible ticket) with a 'zebra-confidential' comment and a due date
 * - "Share the July invoices" (explicit: owner+guest)
 *
 * ## What this world does NOT contain, enumerated
 *
 * This is the shared fixture for a series of read tasks, so its ABSENCES are
 * the shape of what those tasks cannot catch. Naming them is the same
 * discipline `./apply.ts` applies to itself; "a simplified scenario" would be a
 * sentence that excuses all of it.
 *
 * - **Everything `applyCommitted` does not do.** No locks, no permission gate,
 *   no rule engine, no workspace bootstrap, no stream notify — read that
 *   file's docblock, it is the binding list. Two consequences bite here: the
 *   memberships below are seeded EXPLICITLY because a `workspace.created`
 *   applied this way gets no founding side effects (no membership row, no
 *   builtin ticket types, no default workflow), and nothing in this world is
 *   evidence that a client could have produced it through the shipped door.
 * - **No workspace-mode ticket.** Every ticket here resolves to `'project'`
 *   (the default a root with no authored mode falls back to) or to
 *   `'explicit'`. The `'workspace'` column of the visibility decision table is
 *   therefore NOT exercised by this world alone; `test/read/visible-where.test.ts`
 *   seeds one of its own beside it, and any later task that needs the
 *   workspace-mode row must do the same.
 * - **No admin, and no second project.** There is no viewer with workspace role
 *   `'admin'`, and no project the owner is off. A test that wants to tell an
 *   owner's read bypass apart from what a project member would see anyway
 *   cannot do it with this world alone — the owner is on the only project and
 *   is named in every explicit list here.
 * - **No revoked membership.** The surviving-project-row hazard
 *   (`proj-memberships.ts`) has no instance here.
 * - **No attachments, no contested claims, no invites, no workspace settings.**
 *   `proj_workspace_settings` is empty, so a reader of the attention
 *   thresholds gets whatever its own defaults are, not a claim made here.
 * - **One workspace.** Nothing here proves a query is tenant-scoped; a test
 *   about cross-workspace leakage must seed the neighbour itself.
 *
 * ## Seed this AT MOST ONCE per database
 *
 * The workflow (`wf-errands`) and the two ticket types (`epic`, `task`) are
 * FIXED entity ids, so a second seed against the same database collides on
 * `events_entity_seq_unique` — the ledger already holds `('workflow',
 * 'wf-errands', 1)`. `resetEntitySeqs()` does not help: it resets the helper's
 * process-local counter, which is what mints the colliding `1` in the first
 * place. The ids are fixed rather than minted because read tests assert against
 * them by name (`type_id = 'task'`), so the fix is one fresh database per seed
 * (`createTestDatabase`), and the guard below turns the raw unique violation
 * into that sentence.
 *
 * The guard reads `events` rather than a projection because `events` is the
 * table the collision is actually on, and because truncating the projections
 * between tests — which read tests legitimately do — would make a projection
 * check answer "no" while the ledger still held the row.
 */
export async function seedReadScenario(pool: Pool, users: ReadScenarioUsers): Promise<ReadScenario> {
  await refuseSecondSeed(pool);

  const workspaceId = newUlid();
  const projectId = newUlid();
  const workflowId = SCENARIO_WORKFLOW_ID;
  const epicId = newUlid();
  const taskInEpicId = newUlid();
  const sharedTaskId = newUlid();
  const hiddenTaskId = newUlid();
  const guestTaskId = newUlid();
  const { owner, member, outsider, guest } = users;
  const ws = { workspaceId, actorId: owner };

  const events: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.created', payload: { name: 'Convenience Corner' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Registrations' } }),
    // No `scope` on either grant. `membership.granted` DECLARES scope as
    // `z.never()` (the 2026-08-27 collapse), so the plan text's
    // `scope: 'workspace'` / `scope: { projectId }` would be refused by
    // `membershipGrantedPayload.parse` inside proj_memberships — the projection
    // is the oracle, exactly as the plan says. A guest is a WORKSPACE-scope
    // grant with role 'guest' and reaches work through explicit lists.
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, owner) }, type: 'membership.granted', payload: { userId: owner, role: 'owner' } }),
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, member) }, type: 'membership.granted', payload: { userId: member, role: 'member' } }),
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, outsider) }, type: 'membership.granted', payload: { userId: outsider, role: 'member' } }),
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, guest) }, type: 'membership.granted', payload: { userId: guest, role: 'guest' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: owner, projectAdmin: true } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: member, projectAdmin: false } }),
    makeCommitted({
      ...ws,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: {
        id: workflowId,
        version: 1,
        name: 'Errands',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
          // Amendment 9's additive flag, already on workflowStateSchema.
          { id: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [
          { from: '*', to: 'todo', rules: [] },
          { from: '*', to: 'doing', rules: [] },
          { from: '*', to: 'waiting', rules: [] },
          { from: '*', to: 'done', rules: [] },
        ],
      },
    }),
    makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'epic' }, type: 'ticket-type.defined', payload: { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId, fields: [] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: 'task' }, type: 'ticket-type.defined', payload: { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId, fields: [] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: epicId }, type: 'ticket.created', payload: { typeId: 'epic', projectId, parentId: null, title: 'Registrations drive' } }),
    makeCommitted({ ...ws, actorId: member, entity: { kind: 'ticket', id: taskInEpicId }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: epicId, title: 'File the GST return' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: sharedTaskId }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'Renew the trade licence' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: sharedTaskId }, type: 'visibility.set', payload: { ticketId: sharedTaskId, mode: 'explicit', userIds: [owner, member] } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: hiddenTaskId }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'Salary review — keep private' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: hiddenTaskId }, type: 'visibility.set', payload: { ticketId: hiddenTaskId, mode: 'explicit', userIds: [owner] } }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: hiddenTaskId },
      type: 'comment.added',
      payload: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'zebra-confidential detail' }] }] } },
    }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: hiddenTaskId }, type: 'ticket.field_set', payload: { fieldId: 'dueDate', value: { date: '2026-08-21' } } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: guestTaskId }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'Share the July invoices' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: guestTaskId }, type: 'visibility.set', payload: { ticketId: guestTaskId, mode: 'explicit', userIds: [owner, guest] } }),
    makeCommitted({ ...ws, actorId: member, entity: { kind: 'ticket', id: taskInEpicId }, type: 'ticket.assigned', payload: { assigneeId: member } }),
    makeCommitted({
      ...ws,
      actorId: member,
      clientTime: '2026-08-19T18:30:00.000Z',
      entity: { kind: 'ticket', id: taskInEpicId },
      type: 'ticket.field_set',
      payload: { fieldId: 'dueDate', value: { date: SCENARIO_DUE_DAY } },
    }),
    makeCommitted({
      ...ws,
      entity: { kind: 'ticket', id: taskInEpicId },
      type: 'ticket.field_set',
      payload: { fieldId: 'description', value: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'GSTR-3B for July, portal keeps timing out' }] }] } },
    }),
    makeCommitted({
      ...ws,
      actorId: member,
      entity: { kind: 'ticket', id: taskInEpicId },
      type: 'comment.added',
      payload: {
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Called the ' },
                { type: 'mention', attrs: { userId: owner, label: 'Kiro' } },
                { type: 'text', text: ' about the OTP hold-up' },
              ],
            },
          ],
        },
      },
    }),
    // taskInEpic entered 'doing' 19 days before SCENARIO_NOW — stale bait for
    // any threshold <= 19. The payload key is `to`, not the plan text's
    // `toStateId`: `ticketTransitionedPayloadSchema` (Plan 2, registered by
    // Plan 3) is the shape the engine and the projections speak.
    makeCommitted({
      ...ws,
      actorId: member,
      clientTime: '2026-08-01T09:00:00.000Z',
      serverTime: '2026-08-01T09:00:05.000Z',
      entity: { kind: 'ticket', id: taskInEpicId },
      type: 'ticket.transitioned',
      payload: { to: 'doing' },
    }),
    // sharedTask sits in the blocked-flagged 'waiting' state
    makeCommitted({
      ...ws,
      clientTime: '2026-08-19T09:00:00.000Z',
      serverTime: '2026-08-19T09:00:05.000Z',
      entity: { kind: 'ticket', id: sharedTaskId },
      type: 'ticket.transitioned',
      payload: { to: 'waiting' },
    }),
  ];
  await applyCommitted(pool, events);
  return { ...users, workspaceId, projectId, workflowId, epicId, taskInEpicId, sharedTaskId, hiddenTaskId, guestTaskId };
}

/**
 * Turns the second seed's raw `events_entity_seq_unique` violation into the
 * sentence that says what to do — a fresh database, not a truncation.
 */
async function refuseSecondSeed(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ entity_id: string }>(
    `SELECT entity_id FROM events
      WHERE (entity_kind = 'workflow' AND entity_id = $1)
         OR (entity_kind = 'ticket-type' AND entity_id = ANY ($2::text[]))
      LIMIT 1`,
    [SCENARIO_WORKFLOW_ID, [...SCENARIO_TYPE_IDS]],
  );
  if (rows.length > 0) {
    throw new Error(
      `seedReadScenario: this database already holds the scenario's fixed entity ids ` +
        `('${SCENARIO_WORKFLOW_ID}', ${SCENARIO_TYPE_IDS.map((id) => `'${id}'`).join(', ')}), ` +
        `so a second seed would collide on events_entity_seq_unique. Seed once per database ` +
        `(createTestDatabase) — truncating the projections does not help, the ledger keeps the rows.`,
    );
  }
}
