import type { EventEnvelope, PublishedWorkflowDef, TicketTypeDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';

/**
 * Builders shared by the check suites (`test/hierarchy.test.ts` today, Tasks 6
 * and 7's next). They live in `src/` rather than `test/` because `test/` is not
 * on this package's `rootDir` and three test files in two later tasks import
 * them; one ladder in one place is what stops Task 6's rank tests and Task 7's
 * field tests from quietly describing different hierarchies.
 *
 * The ladder here is the BUILT-IN one — epic(1)/story(2)/task(3)/sub-task(4),
 * the same ranks `BUILTIN_TICKET_TYPE_SEEDS` ships. A test that needs a custom
 * type (one an admin invents at rank 4, or below it) declares it locally beside
 * the assertion it serves, so a reader of these shared builders is never left
 * wondering which of them is the product's ladder and which is a workspace's.
 */

export const WS = '01J9GWS0000000000000000000';
/**
 * A SECOND workspace, for the parent this one is not allowed to see. Ticket
 * lookup carries no workspace predicate (controller ruling P12), so every
 * tenancy case needs an id that resolves and is still not ours.
 */
export const OTHER_WS = '01J9GWSB000000000000000000';
export const PROJECT = '01J9GPRJ000000000000000000';
export const PROJECT_B = '01J9GPRB000000000000000000';

/**
 * Typed `PublishedWorkflowDef`, not `WorkflowDef`: `buildMemoryContext` takes
 * published definitions (they are the ones that may carry a `stateMapping`),
 * and the two types are mutually assignable when no mapping is present, so a
 * consumer wanting a plain `WorkflowDef` loses nothing.
 *
 * Every transition is `from: '*'`, so a test that needs a ticket in a
 * particular state can put it there in one event without first describing a
 * path. `done` is the only terminal state — the parent-terminal refusal needs
 * exactly one.
 */
export const WF: PublishedWorkflowDef = {
  id: 'wf-basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
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
};

export const EPIC: TicketTypeDef = { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-basic', fields: [] };
export const STORY: TicketTypeDef = { id: 'story', name: 'Story', icon: 'book', rank: 2, workflowId: 'wf-basic', fields: [] };
export const TASK: TicketTypeDef = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] };
export const SUBTASK: TicketTypeDef = { id: 'sub-task', name: 'Sub-task', icon: 'list', rank: 4, workflowId: 'wf-basic', fields: [] };

export function typeDefined(def: TicketTypeDef): EventEnvelope {
  return makeEnvelope({
    type: 'ticket-type.defined',
    entity: { kind: 'ticket-type', id: def.id },
    payload: def,
    workspaceId: WS,
  });
}

/**
 * A `ticket.created` envelope in the domain's own dialect — `projectId` and
 * `parentId` are `ulidString` in `ticketCreatedPayload`, so every id a caller
 * passes must be ULID-shaped or the payload is refused before any hierarchy
 * question is asked.
 *
 * `seq` is left at `makeEnvelope`'s default: creation is a ticket's first
 * event, and the checks here read no sequence.
 */
export function created(
  id: string,
  typeId: string,
  parentId: string | null,
  projectId: string = PROJECT,
): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.created',
    entity: { kind: 'ticket', id },
    workspaceId: WS,
    payload: { typeId, projectId, parentId, title: `ticket ${id.slice(4, 8)}` },
  });
}

/**
 * The same creation filed under an EXPLICIT workspace. `created()` puts
 * everything in `WS`, which is what every hierarchy case wants and exactly what
 * the tenancy cases cannot use: the foreign parent has to be created somewhere
 * else and still resolve, because `getTicketState` looks a ticket up by id with
 * no workspace predicate.
 *
 * Hoisted here from `test/hierarchy.test.ts` when Task 6 needed the identical
 * helper for the reparent side (pre-flight Addendum 9a). Two copies of one
 * builder is how two suites start describing different tenancy.
 */
export function createdIn(
  workspaceId: string,
  id: string,
  typeId: string,
  projectId: string,
): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.created',
    entity: { kind: 'ticket', id },
    workspaceId,
    payload: { typeId, projectId, parentId: null, title: `ticket ${id.slice(4, 8)}` },
  });
}

/** The author of every draft in the draft suites, and a second person who is not (drafts T5). */
export const AUTHOR = '01J9GATHR00000000000000000';
export const OTHER = '01J9GPEER00000000000000000';

/**
 * A DRAFT's `ticket.created` (drafts spec §2.2): `draft: true`, born in the Backlog, filed by `actorId`, who
 * becomes its author in the reducer (`draft.authorId = env.actorId`).
 */
export function draftCreated(
  id: string,
  typeId: string,
  parentId: string | null,
  actorId: string = AUTHOR,
  projectId: string = PROJECT,
): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.created',
    entity: { kind: 'ticket', id },
    workspaceId: WS,
    actorId,
    payload: { typeId, projectId, parentId, title: `draft ${id.slice(4, 8)}`, start: 'backlog', draft: true },
  });
}

/** Any ticket-scoped event on `id`, filed by `actorId`. */
export function onTicket(id: string, type: string, payload: unknown, actorId: string = AUTHOR): EventEnvelope {
  return makeEnvelope({ type, entity: { kind: 'ticket', id }, workspaceId: WS, actorId, payload });
}
